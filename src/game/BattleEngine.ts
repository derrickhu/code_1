/**
 * 单局战斗引擎（无渲染、可逐帧驱动）
 *
 * 这是战斗逻辑的**唯一真源**：
 * - `tools/sim.ts` 批量快进它，用来回归卡关曲线；
 * - `scenes/BattleScene` 按帧驱动它，用来实际游玩。
 *
 * 两边共用同一份 tick，才能保证「模拟里验过的数值」在真机上成立。
 * 任何战斗规则改动只应发生在本文件，绝不允许渲染层另写一套。
 */

import {
  BASE_HP,
  MELEE_REACH,
  PLAYER_ROWS,
  RANK,
  SLOTS_PER_ROW,
  SPAWN_DIST,
  TICK_MS,
  TOTAL_SLOTS,
  TOTAL_WAVES,
  WAVE_GAP_MS,
  WAVE_TIMEOUT_MS,
  type Row,
} from '../balance/combat';

export type { Row };
import { ELEMENT_LANE, getCounterMult, type Element } from '../balance/counters';
import {
  getEnemyProto,
  getWave,
  waveAtkMult,
  waveHpMult,
  type EnemyProto,
} from '../balance/enemies';
import { HEROES, MAX_LEVEL, getHero, levelMult, type HeroDef } from '../balance/heroes';
import {
  MAX_TEAM_SIZE,
  OPENING_CHOICES,
  PICK_WAVES,
  ROLE_ROW,
  TEAM_BUFFS,
  getTeamBuff,
  type PickKind,
  type PickOption,
} from '../balance/picker';
import { computeDamage } from '../formulas/damage';

// ── 随机源 ──────────────────────────────────────────────

/** mulberry32：同一 seed 必得同一局，回归结果可复现 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandom<T>(arr: readonly T[], rng: () => number): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[Math.floor(rng() * arr.length)];
}

// ── 状态 ────────────────────────────────────────────────

export interface HeroUnit {
  def: HeroDef;
  level: number;
  row: Row;
  /** 本排内的列序，渲染用 */
  slot: number;
  hp: number;
  maxHp: number;
  shield: number;
  cdMs: number;
  skillCdMs: number;
  alive: boolean;
}

export interface EnemyUnit {
  id: number;
  proto: EnemyProto;
  element: Element;
  hp: number;
  maxHp: number;
  atk: number;
  /** 所在排（0 底线 / 5 敌后排），0 以下即突破 */
  dist: number;
  /** 0 左 / 1 中 / 2 右，与英雄 slot 对位 */
  lane: 0 | 1 | 2;
  cdMs: number;
  slowMs: number;
  slowPct: number;
}

export interface TeamBuffs {
  atkPct: number;
  hpPct: number;
  hastePct: number;
  frontDefPct: number;
  backAtkPct: number;
  baseHpBonus: number;
  counterBonusPct: number;
}

/** 供渲染层消费的一帧内发生的事。引擎只记录，不关心怎么表现 */
export type BattleEvent =
  | { kind: 'hit'; heroId: string; enemyId: number; damage: number; counter: 'up' | 'flat' | 'down'; crit: boolean; heal?: number }
  | { kind: 'enemyHit'; enemyId: number; heroId: string; damage: number; reflect: number; absorbed: number }
  | { kind: 'enemyDown'; enemyId: number }
  | { kind: 'leak'; enemyId: number }
  | { kind: 'heroDown'; heroId: string }
  | { kind: 'skill'; heroId: string; skillName: string; skillKind: string; targetId?: string; pulledIds?: number[]; amount?: number };

export interface RunStats {
  hits: number;
  counterHits: number;
  leaks: number;
  skills: number;
}

export type RunPhase = 'picking' | 'fighting' | 'gap' | 'won' | 'lost';

export interface RunState {
  phase: RunPhase;
  /** 当前波次，picking 时表示「即将开打的那一波」 */
  wave: number;
  baseHp: number;
  maxBaseHp: number;
  roster: HeroUnit[];
  deployed: HeroUnit[];
  enemies: EnemyUnit[];
  buffs: TeamBuffs;
  picks: PickKind[];
  /** phase 为 picking 时待选的三张牌 */
  pendingOptions: PickOption[];
  waveElapsedMs: number;
  gapElapsedMs: number;
  totalMs: number;
  /**
   * 阵容是否仍由引擎托管。玩家一旦手动调过就转为 false，
   * 此后每波只补空格，不再自动换人。批量回归始终保持 true。
   */
  autoDeploy: boolean;
  /** 本帧事件，渲染层读完应自行清空 */
  events: BattleEvent[];
  /** 整局累计，结算归因用，模拟层可忽略 */
  stats: RunStats;
  rng: () => number;
  nextEnemyId: number;
}

function emptyStats(): RunStats {
  return { hits: 0, counterHits: 0, leaks: 0, skills: 0 };
}

function emit(state: RunState, ev: BattleEvent): void {
  state.events.push(ev);
  if (ev.kind === 'hit') {
    state.stats.hits += 1;
    if (ev.counter === 'up') state.stats.counterHits += 1;
  } else if (ev.kind === 'leak') {
    state.stats.leaks += 1;
  } else if (ev.kind === 'skill') {
    state.stats.skills += 1;
  }
}

function emptyBuffs(): TeamBuffs {
  return {
    atkPct: 0,
    hpPct: 0,
    hastePct: 0,
    frontDefPct: 0,
    backAtkPct: 0,
    baseHpBonus: 0,
    counterBonusPct: 0,
  };
}

// ── 属性计算 ────────────────────────────────────────────

export function heroMaxHp(h: HeroUnit, b: TeamBuffs): number {
  return h.def.hp * levelMult(h.level) * (1 + b.hpPct / 100);
}

export function heroAtk(h: HeroUnit, b: TeamBuffs): number {
  const rowBonus = h.row === 'back' ? 1 + b.backAtkPct / 100 : 1;
  return h.def.atk * levelMult(h.level) * (1 + b.atkPct / 100) * rowBonus;
}

function heroInterval(h: HeroUnit, b: TeamBuffs, auraHastePct: number): number {
  return h.def.attackIntervalMs / (1 + (b.hastePct + auraHastePct) / 100);
}

export function heroRank(h: HeroUnit): number {
  return RANK[h.row];
}

/** 英雄能打到的最远排：自己的排 + 射程 */
export function heroReach(h: HeroUnit): number {
  return RANK[h.row] + h.def.range;
}

/**
 * 敌人该打谁：近战够得着的人里，先打更靠前的，再打本列。
 * 够不着就返回 undefined，继续往下一排走。
 */
export function enemyVictim(
  e: EnemyUnit,
  living: readonly HeroUnit[],
): HeroUnit | undefined {
  const inMelee = living.filter((h) => {
    if (!h.alive) return false;
    const d = e.dist - RANK[h.row];
    return d > 0 && d <= MELEE_REACH;
  });
  if (inMelee.length === 0) return undefined;
  return [...inMelee].sort((a, b) => {
    const rd = RANK[b.row] - RANK[a.row];
    if (rd !== 0) return rd;
    return Math.abs(a.slot - e.lane) - Math.abs(b.slot - e.lane);
  })[0];
}

function enemySlowPct(e: EnemyUnit, auraSlow: number): number {
  return Math.min(60, Math.max(e.slowMs > 0 ? e.slowPct : 0, auraSlow));
}

// ── 三选一 ──────────────────────────────────────────────

/**
 * 按阶段给牌：
 *
 * **组队阶段（拥有不足 6 人）** 三张都是英雄且尽量三个不同系。这是「选对系别」的前提 ——
 * 早期版本每次只给一张英雄卡，玩家没得挑系，回归数据显示按系别招人反而比无脑招人差 3 波。
 *
 * **取舍阶段** 一张新英雄加一张升级加一张增益，分别对应覆盖面、单点强度、通用收益。
 */
export function buildOptions(roster: readonly HeroUnit[], rng: () => number): PickOption[] {
  const ownedIds = new Set(roster.map((h) => h.def.id));
  const pool = [...HEROES.filter((h) => !ownedIds.has(h.id))].sort(() => rng() - 0.5);

  if (roster.length < MAX_TEAM_SIZE) {
    const picked: HeroDef[] = [];
    const usedElements = new Set<Element>();
    for (const h of pool) {
      if (picked.length >= 3) break;
      if (usedElements.has(h.element)) continue;
      picked.push(h);
      usedElements.add(h.element);
    }
    for (const h of pool) {
      if (picked.length >= 3) break;
      if (!picked.includes(h)) picked.push(h);
    }
    if (picked.length > 0) return picked.map((h) => ({ kind: 'recruit', heroId: h.id }));
  }

  const options: PickOption[] = [];
  const recruit = pool[0];
  if (recruit) options.push({ kind: 'recruit', heroId: recruit.id });

  // 升级目标随机指定，不让玩家挑 —— 否则永远升最强那个，升级卡成为无脑最优解
  const upgradable = [...roster.filter((h) => h.level < MAX_LEVEL)].sort(() => rng() - 0.5);
  const up = upgradable[0];
  if (up) options.push({ kind: 'levelUp', heroId: up.def.id });

  const buff = pickRandom(TEAM_BUFFS, rng);
  if (buff) options.push({ kind: 'buff', buffId: buff.id });

  return options;
}

/** 返回对当前底线血量的即时增量（只有「加固」会产生） */
function applyOption(option: PickOption, state: RunState): number {
  switch (option.kind) {
    case 'recruit': {
      const def = getHero(option.heroId);
      const row = ROLE_ROW[def.role];
      state.roster.push({
        def,
        level: 1,
        row,
        slot: state.roster.filter((h) => h.row === row).length % SLOTS_PER_ROW,
        hp: 0,
        maxHp: 0,
        shield: 0,
        cdMs: 0,
        skillCdMs: 0,
        alive: true,
      });
      return 0;
    }
    case 'levelUp': {
      const target = state.roster.find((h) => h.def.id === option.heroId);
      if (target && target.level < MAX_LEVEL) target.level += 1;
      return 0;
    }
    case 'buff': {
      const effect = getTeamBuff(option.buffId).effect;
      const b = state.buffs;
      switch (effect.kind) {
        case 'atkPct': b.atkPct += effect.value; return 0;
        case 'hpPct': b.hpPct += effect.value; return 0;
        case 'hastePct': b.hastePct += effect.value; return 0;
        case 'frontDefPct': b.frontDefPct += effect.value; return 0;
        case 'backAtkPct': b.backAtkPct += effect.value; return 0;
        case 'baseHp': b.baseHpBonus += effect.value; return effect.value;
        case 'counterBonus': b.counterBonusPct += effect.value; return 0;
      }
    }
  }
}

// ── 上场 ────────────────────────────────────────────────

export interface DeployOptions {
  /** 优先上能克制来袭系别的英雄，代表「懂了的玩家」 */
  preferCounter: boolean;
  /** 随机上场，代表首次接触的玩家 */
  shuffle: boolean;
}

/**
 * 决定本波上场阵容。
 *
 * 「拥有」与「上场」必须分开 —— 这是让克制产生决策价值的关键。阵容若招进来就永久固定，
 * 针对某一波挑的系别在后面十波里毫无意义，回归里克制的价值实测为 0。
 */
export function deploy(state: RunState, opts: DeployOptions): void {
  const upcoming = upcomingWaveElement(state.wave);
  const pickRow = (row: Row): HeroUnit[] => {
    const candidates = state.roster.filter((h) => h.row === row);
    if (opts.preferCounter && upcoming) {
      return [...candidates]
        .sort((a, b) => {
          const sa = getCounterMult(a.def.element, upcoming);
          const sb = getCounterMult(b.def.element, upcoming);
          if (sa !== sb) return sb - sa;
          return b.level - a.level;
        })
        .slice(0, SLOTS_PER_ROW);
    }
    if (opts.shuffle) {
      return [...candidates].sort(() => state.rng() - 0.5).slice(0, SLOTS_PER_ROW);
    }
    return [...candidates].sort((a, b) => b.level - a.level).slice(0, SLOTS_PER_ROW);
  };

  const upcomingEl = opts.preferCounter ? upcoming : undefined;
  const picked: HeroUnit[] = [];
  for (const row of PLAYER_ROWS) {
    const room = TOTAL_SLOTS - picked.length;
    if (room <= 0) break;
    const chunk = pickRow(row).slice(0, Math.min(SLOTS_PER_ROW, room));
    placeCentered(chunk, upcomingEl);
    picked.push(...chunk);
  }
  state.deployed = picked;
}

/**
 * 一排不满 3 人时往中间收，避免开局唯一的英雄贴在最左边。
 * 1 人站中格，2 人站两翼，3 人铺满。
 */
function placeCentered(heroes: HeroUnit[], upcoming?: Element): void {
  if (heroes.length === 0) return;
  if (heroes.length === 1) {
    heroes[0]!.slot = 1;
    return;
  }
  if (heroes.length === 2) {
    const prefer = upcoming !== undefined && ELEMENT_LANE[upcoming] !== 1
      ? ELEMENT_LANE[upcoming]
      : 0;
    heroes[0]!.slot = prefer;
    heroes[1]!.slot = prefer === 0 ? 2 : 0;
    return;
  }
  const prefer = upcoming !== undefined ? ELEMENT_LANE[upcoming] : 1;
  const rest = [0, 1, 2].filter((s) => s !== prefer);
  [prefer, ...rest].forEach((slot, i) => {
    const h = heroes[i];
    if (h) h.slot = slot;
  });
}

// ── 玩家接管阵容 ────────────────────────────────────────
//
// 「拥有」与「上场」分开的意义，只有在玩家自己能决定谁上场时才兑现。
// 引擎自动按克制选人只是缺省行为：一旦玩家动过一次，后续就完全按他的安排来，
// 引擎只负责把空格补上，绝不再擅自换掉他放好的人。

export function heroAt(state: RunState, row: Row, slot: number): HeroUnit | undefined {
  return state.deployed.find((h) => h.row === row && h.slot === slot);
}

export function benchOf(state: RunState): HeroUnit[] {
  const onField = new Set(state.deployed.map((h) => h.def.id));
  return state.roster.filter((h) => !onField.has(h.def.id));
}

/** 新上场的英雄要有血条可打；本波已受伤的沿用当前血量，不靠换人回血 */
function ensureVitals(h: HeroUnit, b: TeamBuffs): void {
  const maxHp = heroMaxHp(h, b);
  h.maxHp = maxHp;
  if (h.hp <= 0) {
    h.hp = maxHp;
    h.alive = true;
  }
}

/**
 * 把某个英雄放到指定格位。目标格有人则两者交换，来自替补席则顶替下场。
 * 调用后阵容转为玩家托管。
 */
export function assignSlot(state: RunState, heroId: string, row: Row, slot: number): void {
  const hero = state.roster.find((h) => h.def.id === heroId);
  if (!hero) return;
  state.autoDeploy = false;

  const occupant = heroAt(state, row, slot);
  if (occupant && occupant.def.id === heroId) return;

  const wasOnField = state.deployed.includes(hero);
  const fromRow = hero.row;
  const fromSlot = hero.slot;
  if (!wasOnField && !occupant && state.deployed.length >= TOTAL_SLOTS) return;

  hero.row = row;
  hero.slot = slot;
  ensureVitals(hero, state.buffs);
  if (!wasOnField) state.deployed.push(hero);

  if (occupant) {
    if (wasOnField) {
      occupant.row = fromRow;
      occupant.slot = fromSlot;
    } else {
      state.deployed = state.deployed.filter((h) => h !== occupant);
    }
  }
}

/** 把英雄撤下场，留出空格 */
export function benchHero(state: RunState, heroId: string): void {
  state.autoDeploy = false;
  state.deployed = state.deployed.filter((h) => h.def.id !== heroId);
}

/**
 * 补满空格但不动玩家已安排的人。
 *
 * 招到新英雄后如果玩家不管，空着的格子会白白浪费 —— 那不是决策，是漏操作。
 */
export function fillEmptySlots(state: RunState): void {
  const bench = benchOf(state);
  if (bench.length === 0) return;

  for (const row of PLAYER_ROWS) {
    for (let slot = 0; slot < SLOTS_PER_ROW; slot += 1) {
      if (state.deployed.length >= TOTAL_SLOTS) return;
      if (heroAt(state, row, slot)) continue;
      // 先用本来就属于这一排的角色补，实在没有再拿其他人顶上
      const idx = bench.findIndex((h) => ROLE_ROW[h.def.role] === row);
      const pick = idx >= 0 ? bench.splice(idx, 1)[0] : bench.shift();
      if (!pick) return;
      pick.row = row;
      pick.slot = slot;
      ensureVitals(pick, state.buffs);
      state.deployed.push(pick);
    }
  }
}

/** 即将开打这一波的主要系别，供三选一与上场决策参考 */
export function upcomingWaveElement(wave: number): Element | undefined {
  if (wave < 1 || wave > TOTAL_WAVES) return undefined;
  return getWave(wave).spawns[0]?.element;
}

// ── 出怪 ────────────────────────────────────────────────

interface ScheduledSpawn {
  atMs: number;
  proto: EnemyProto;
  element: Element;
  lane: 0 | 1 | 2;
}

function scheduleWave(wave: number): ScheduledSpawn[] {
  const def = getWave(wave);
  const hpMult = waveHpMult(wave);
  const atkMult = waveAtkMult(wave);
  const mixed = new Set(def.spawns.map((g) => g.element)).size > 1;
  const out: ScheduledSpawn[] = [];
  let spread = 0;
  for (const group of def.spawns) {
    const proto = getEnemyProto(group.enemyId);
    for (let i = 0; i < group.count; i += 1) {
      const home = ELEMENT_LANE[group.element];
      const lane: 0 | 1 | 2 = mixed
        ? (spread % 3 === 2 ? 1 : home)
        : ((spread % 3) as 0 | 1 | 2);
      spread += 1;
      out.push({
        atMs: group.delayMs + i * group.intervalMs,
        proto: { ...proto, hp: proto.hp * hpMult, atk: proto.atk * atkMult },
        element: group.element,
        lane,
      });
    }
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** 每波的出怪表在进入战斗时生成，随状态走，便于逐帧驱动 */
const scheduleCache = new WeakMap<RunState, { wave: number; list: ScheduledSpawn[]; idx: number }>();

// ── 生命周期 ────────────────────────────────────────────

export function createRun(seed: number): RunState {
  const rng = makeRng(seed);
  const state: RunState = {
    phase: 'picking',
    wave: 1,
    baseHp: BASE_HP,
    maxBaseHp: BASE_HP,
    roster: [],
    deployed: [],
    enemies: [],
    buffs: emptyBuffs(),
    picks: [],
    pendingOptions: [],
    waveElapsedMs: 0,
    gapElapsedMs: 0,
    totalMs: 0,
    autoDeploy: true,
    events: [],
    stats: emptyStats(),
    rng,
    nextEnemyId: 1,
  };
  // 开局：三张不同系的英雄卡挑一张，落地即开打。
  // 不允许前置编队页（十秒可懂）；三系都给到，是为了第一眼就看见差别，而不是随机抽到三个炎系。
  state.pendingOptions = openingChoices(rng);
  return state;
}

function openingChoices(rng: () => number): PickOption[] {
  const shuffled = [...HEROES].sort(() => rng() - 0.5);
  const picked: HeroDef[] = [];
  const used = new Set<Element>();
  for (const h of shuffled) {
    if (picked.length >= OPENING_CHOICES) break;
    if (used.has(h.element)) continue;
    picked.push(h);
    used.add(h.element);
  }
  return picked.map((h) => ({ kind: 'recruit', heroId: h.id }));
}

/** 玩家（或模拟策略）选定一张牌，随后进入战斗 */
export function applyPick(state: RunState, option: PickOption, deployOpts: DeployOptions): void {
  if (state.phase !== 'picking') return;
  state.baseHp += applyOption(option, state);
  state.maxBaseHp = BASE_HP + state.buffs.baseHpBonus;
  state.picks.push(option.kind);
  state.pendingOptions = [];
  beginWave(state, deployOpts);
}

function beginWave(state: RunState, deployOpts: DeployOptions): void {
  if (state.autoDeploy) deploy(state, deployOpts);
  else fillEmptySlots(state);

  // 每波开始全员复活满血：一次灭队不该直接结束观战，
  // 失败判定统一交给底线血量，这样「快要守不住」才有可感的过程。
  // 重置整个 roster 而不只是上场的，替补才能作为生力军被换上。
  for (const h of state.roster) {
    h.maxHp = heroMaxHp(h, state.buffs);
    h.hp = h.maxHp;
    h.alive = true;
    h.shield = 0;
    h.cdMs = 0;
    h.skillCdMs = 0;
  }
  state.enemies = [];
  state.waveElapsedMs = 0;
  scheduleCache.set(state, { wave: state.wave, list: scheduleWave(state.wave), idx: 0 });
  state.phase = 'fighting';
}

function finishWave(state: RunState, deployOpts: DeployOptions): void {
  if (state.wave >= TOTAL_WAVES) {
    state.phase = 'won';
    return;
  }
  state.wave += 1;
  state.gapElapsedMs = 0;
  if (PICK_WAVES.includes(state.wave)) {
    state.pendingOptions = buildOptions(state.roster, state.rng);
    if (state.pendingOptions.length > 0) {
      state.phase = 'picking';
      return;
    }
  }
  state.phase = 'gap';
  void deployOpts;
}

/**
 * 推进一个 TICK_MS。
 *
 * 渲染层按帧累积时间后调用，模拟层直接连续调用 —— 两者走的是同一段逻辑。
 */
export function tick(state: RunState, deployOpts: DeployOptions): void {
  if (state.phase === 'won' || state.phase === 'lost' || state.phase === 'picking') return;

  if (state.phase === 'gap') {
    state.gapElapsedMs += TICK_MS;
    state.totalMs += TICK_MS;
    if (state.gapElapsedMs >= WAVE_GAP_MS) beginWave(state, deployOpts);
    return;
  }

  state.totalMs += TICK_MS;
  state.waveElapsedMs += TICK_MS;

  const sched = scheduleCache.get(state);
  if (!sched) {
    state.phase = 'lost';
    return;
  }

  // 1. 出怪
  while (sched.idx < sched.list.length) {
    const next = sched.list[sched.idx];
    if (!next || next.atMs > state.waveElapsedMs) break;
    state.enemies.push({
      id: state.nextEnemyId++,
      proto: next.proto,
      element: next.element,
      hp: next.proto.hp,
      maxHp: next.proto.hp,
      atk: next.proto.atk,
      dist: SPAWN_DIST,
      lane: next.lane,
      cdMs: next.proto.attackIntervalMs,
      slowMs: 0,
      slowPct: 0,
    });
    sched.idx += 1;
  }

  if (sched.idx >= sched.list.length && state.enemies.length === 0) {
    finishWave(state, deployOpts);
    return;
  }

  const living = state.deployed.filter((h) => h.alive);

  // 2. 光环（每 tick 重算，避免维护叠加状态）
  let auraHaste = 0;
  let critChance = 0;
  let critMult = 1;
  let auraSlow = 0;
  for (const h of living) {
    const sk = h.def.skill;
    if (sk.kind === 'hasteAura') auraHaste += sk.hastePct;
    if (sk.kind === 'critAura') {
      critChance += sk.chancePct;
      critMult = Math.max(critMult, sk.critMult);
    }
    if (sk.kind === 'slowAura') auraSlow = Math.max(auraSlow, sk.slowPct);
  }

  // 3. 英雄攻击与周期技能
  for (const h of living) {
    h.cdMs -= TICK_MS;
    h.skillCdMs -= TICK_MS;

    const sk = h.def.skill;
    if (sk.kind === 'shield' && h.skillCdMs <= 0) {
      h.shield += sk.amount;
      h.skillCdMs = sk.everyMs;
      emit(state, { kind: 'skill', heroId: h.def.id, skillName: h.def.skillName, skillKind: sk.kind, amount: sk.amount });
    }
    if (sk.kind === 'heal' && h.skillCdMs <= 0) {
      const lowest = living
        .filter((x) => x.hp < x.maxHp)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (lowest) lowest.hp = Math.min(lowest.maxHp, lowest.hp + sk.amount);
      h.skillCdMs = sk.everyMs;
      emit(state, {
        kind: 'skill',
        heroId: h.def.id,
        skillName: h.def.skillName,
        skillKind: sk.kind,
        targetId: lowest?.def.id,
        amount: lowest ? sk.amount : 0,
      });
    }
    if (sk.kind === 'vortex' && h.skillCdMs <= 0) {
      const reach = heroReach(h);
      const pulledIds: number[] = [];
      for (const e of state.enemies) {
        if (e.hp <= 0 || e.dist <= RANK[h.row] || e.dist > reach) continue;
        e.dist = Math.min(SPAWN_DIST, e.dist + sk.pullDist);
        e.hp -= sk.damage;
        pulledIds.push(e.id);
        if (e.hp <= 0) emit(state, { kind: 'enemyDown', enemyId: e.id });
      }
      h.skillCdMs = sk.everyMs;
      emit(state, {
        kind: 'skill',
        heroId: h.def.id,
        skillName: h.def.skillName,
        skillKind: sk.kind,
        pulledIds,
      });
    }

    if (h.cdMs > 0) continue;

    const reach = heroReach(h);
    const from = RANK[h.row];
    const inRange = state.enemies.filter((e) => e.hp > 0 && e.dist > from && e.dist <= reach);
    if (inRange.length === 0) continue;
    // 先打本列，再打邻列。否则六个格子只剩「坦克前排」一个解，换列没有意义。
    inRange.sort((a, b) => {
      const sa = a.dist + Math.abs(a.lane - h.slot) * 10;
      const sb = b.dist + Math.abs(b.lane - h.slot) * 10;
      return sa - sb;
    });

    h.cdMs = heroInterval(h, state.buffs, auraHaste);

    const atk = heroAtk(h, state.buffs);
    const isCrit = critChance > 0 && state.rng() * 100 < critChance;
    const crit = isCrit ? critMult : 1;

    const hit = (target: EnemyUnit, mult: number): void => {
      const counterMult = getCounterMult(h.def.element, target.element);
      const dmg =
        computeDamage({
          atk,
          targetDef: target.proto.def,
          counterMult,
          counterBonusPct: state.buffs.counterBonusPct,
          critMult: crit,
          targetDamageReductionPct: 0,
        }) * mult;
      target.hp -= dmg;
      const healed = sk.kind === 'lifesteal' ? dmg * (sk.healPct / 100) : 0;
      if (healed > 0) h.hp = Math.min(h.maxHp, h.hp + healed);
      emit(state, {
        kind: 'hit',
        heroId: h.def.id,
        enemyId: target.id,
        damage: dmg,
        counter: counterMult > 1 ? 'up' : counterMult < 1 ? 'down' : 'flat',
        crit: isCrit,
        heal: healed > 0 ? healed : undefined,
      });
      if (sk.kind === 'slowOnHit') {
        target.slowMs = sk.durationMs;
        target.slowPct = sk.slowPct;
      }
      if (target.hp <= 0) emit(state, { kind: 'enemyDown', enemyId: target.id });
    };

    const primary = inRange[0];
    if (!primary) continue;
    hit(primary, 1);

    if (sk.kind === 'splash') {
      for (const e of inRange) {
        if (e !== primary && Math.abs(e.dist - primary.dist) <= sk.radius) {
          hit(e, sk.damagePct / 100);
        }
      }
    }
    if (sk.kind === 'pierce') {
      let extra = 0;
      for (const e of inRange) {
        if (e === primary) continue;
        if (extra >= sk.extraTargets) break;
        hit(e, 1);
        extra += 1;
      }
    }
    if (sk.kind === 'execute') {
      let chain = 0;
      while (chain < sk.maxChain && primary.hp <= 0) {
        const next = state.enemies
          .filter((e) => e.hp > 0 && e.dist > RANK[h.row] && e.dist <= reach)
          .sort((a, b) => a.dist - b.dist)[0];
        if (!next) break;
        hit(next, 1);
        chain += 1;
        if (next.hp > 0) break;
      }
    }
  }

  // 4. 敌人推进与攻击。近战够得着就砍（先打前排），够不着就往下一排走。
  const livingHeroes = state.deployed.filter((h) => h.alive);
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    e.cdMs -= TICK_MS;
    if (e.slowMs > 0) e.slowMs -= TICK_MS;
    const slow = enemySlowPct(e, auraSlow);

    const victim = enemyVictim(e, livingHeroes);
    if (victim) {
      if (e.cdMs <= 0) {
        e.cdMs = e.proto.attackIntervalMs * (1 + slow / 100);
        const reduction = victim.row === 'front' ? state.buffs.frontDefPct : 0;
        const dmg = computeDamage({
          atk: e.atk,
          targetDef: victim.def.def,
          counterMult: getCounterMult(e.element, victim.def.element),
          counterBonusPct: 0,
          critMult: 1,
          targetDamageReductionPct: reduction,
        });
        const absorbed = Math.min(victim.shield, dmg);
        victim.shield -= absorbed;
        victim.hp -= dmg - absorbed;

        const vs = victim.def.skill;
        const reflect = vs.kind === 'thorns' ? dmg * (vs.reflectPct / 100) : 0;
        if (reflect > 0) e.hp -= reflect;
        emit(state, {
          kind: 'enemyHit',
          enemyId: e.id,
          heroId: victim.def.id,
          damage: dmg,
          reflect,
          absorbed,
        });
        if (victim.hp <= 0) {
          victim.alive = false;
          emit(state, { kind: 'heroDown', heroId: victim.def.id });
        }
      }
      continue;
    }

    e.dist -= e.proto.speed * (1 - slow / 100) * (TICK_MS / 1000);
    if (e.dist <= 0) {
      e.hp = 0;
      state.baseHp -= 1;
      emit(state, { kind: 'leak', enemyId: e.id });
      if (state.baseHp <= 0) {
        state.baseHp = 0;
        state.phase = 'lost';
        return;
      }
    }
  }

  // 5. 清理
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const e = state.enemies[i];
    if (e && e.hp <= 0) state.enemies.splice(i, 1);
  }

  // 单波超时视为推不动（DPS 不足），避免双方都杀不死对方时卡死
  if (state.waveElapsedMs >= WAVE_TIMEOUT_MS) state.phase = 'lost';
}
