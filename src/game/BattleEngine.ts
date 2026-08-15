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
  ROW_POS,
  SLOTS_PER_ROW,
  SPAWN_DIST,
  TICK_MS,
  TOTAL_WAVES,
  WAVE_GAP_MS,
  WAVE_TIMEOUT_MS,
} from '../balance/combat';
import { getCounterMult, type Element } from '../balance/counters';
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

export type Row = 'front' | 'back';

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
  /** 距底线的格数，0 即突破 */
  dist: number;
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
  | { kind: 'hit'; enemyId: number; damage: number; counter: 'up' | 'flat' | 'down'; crit: boolean }
  | { kind: 'enemyDown'; enemyId: number }
  | { kind: 'leak'; enemyId: number }
  | { kind: 'heroDown'; heroId: string }
  | { kind: 'skill'; heroId: string; skillName: string };

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
  /** 本帧事件，渲染层读完应自行清空 */
  events: BattleEvent[];
  rng: () => number;
  nextEnemyId: number;
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

/** 英雄能打到的最远距离：站位 + 射程 */
export function heroReach(h: HeroUnit): number {
  return ROW_POS[h.row] + h.def.range;
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

  const front = pickRow('front');
  const back = pickRow('back');
  front.forEach((h, i) => { h.slot = i; });
  back.forEach((h, i) => { h.slot = i; });
  state.deployed = [...front, ...back];
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
}

function scheduleWave(wave: number): ScheduledSpawn[] {
  const def = getWave(wave);
  const hpMult = waveHpMult(wave);
  const atkMult = waveAtkMult(wave);
  const out: ScheduledSpawn[] = [];
  for (const group of def.spawns) {
    const proto = getEnemyProto(group.enemyId);
    for (let i = 0; i < group.count; i += 1) {
      out.push({
        atMs: group.delayMs + i * group.intervalMs,
        proto: { ...proto, hp: proto.hp * hpMult, atk: proto.atk * atkMult },
        element: group.element,
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
    events: [],
    rng,
    nextEnemyId: 1,
  };
  // 开局：三张英雄卡挑一张，落地即开打（十秒可懂的硬约束，不允许前置编队页）
  state.pendingOptions = [...HEROES]
    .sort(() => rng() - 0.5)
    .slice(0, OPENING_CHOICES)
    .map((h) => ({ kind: 'recruit', heroId: h.id }));
  return state;
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
  deploy(state, deployOpts);
  // 每波开始全员复活满血：一次灭队不该直接结束观战，
  // 失败判定统一交给底线血量，这样「快要守不住」才有可感的过程
  for (const h of state.deployed) {
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
      state.events.push({ kind: 'skill', heroId: h.def.id, skillName: h.def.skillName });
    }
    if (sk.kind === 'heal' && h.skillCdMs <= 0) {
      const lowest = living
        .filter((x) => x.hp < x.maxHp)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (lowest) lowest.hp = Math.min(lowest.maxHp, lowest.hp + sk.amount);
      h.skillCdMs = sk.everyMs;
      state.events.push({ kind: 'skill', heroId: h.def.id, skillName: h.def.skillName });
    }
    if (sk.kind === 'vortex' && h.skillCdMs <= 0) {
      const reach = heroReach(h);
      for (const e of state.enemies) {
        if (e.dist <= reach) {
          e.dist = Math.min(SPAWN_DIST, e.dist + sk.pullDist);
          e.hp -= sk.damage;
        }
      }
      h.skillCdMs = sk.everyMs;
      state.events.push({ kind: 'skill', heroId: h.def.id, skillName: h.def.skillName });
    }

    if (h.cdMs > 0) continue;

    const reach = heroReach(h);
    const inRange = state.enemies.filter((e) => e.hp > 0 && e.dist <= reach);
    if (inRange.length === 0) continue;
    inRange.sort((a, b) => a.dist - b.dist);

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
      state.events.push({
        kind: 'hit',
        enemyId: target.id,
        damage: dmg,
        counter: counterMult > 1 ? 'up' : counterMult < 1 ? 'down' : 'flat',
        crit: isCrit,
      });
      if (sk.kind === 'lifesteal') {
        h.hp = Math.min(h.maxHp, h.hp + dmg * (sk.healPct / 100));
      }
      if (sk.kind === 'slowOnHit') {
        target.slowMs = sk.durationMs;
        target.slowPct = sk.slowPct;
      }
      if (target.hp <= 0) state.events.push({ kind: 'enemyDown', enemyId: target.id });
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
          .filter((e) => e.hp > 0 && e.dist <= reach)
          .sort((a, b) => a.dist - b.dist)[0];
        if (!next) break;
        hit(next, 1);
        chain += 1;
        if (next.hp > 0) break;
      }
    }
  }

  // 4. 敌人推进与攻击
  const front = state.deployed.filter((h) => h.alive && h.row === 'front');
  const back = state.deployed.filter((h) => h.alive && h.row === 'back');
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    e.cdMs -= TICK_MS;
    if (e.slowMs > 0) e.slowMs -= TICK_MS;

    const targetRow =
      e.dist <= ROW_POS.front + MELEE_REACH && front.length > 0
        ? front
        : e.dist <= ROW_POS.back + MELEE_REACH && back.length > 0
          ? back
          : undefined;

    if (targetRow) {
      if (e.cdMs <= 0) {
        e.cdMs = e.proto.attackIntervalMs;
        const victim = pickRandom(targetRow, state.rng);
        if (victim) {
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
          if (vs.kind === 'thorns') e.hp -= dmg * (vs.reflectPct / 100);
          if (victim.hp <= 0) {
            victim.alive = false;
            state.events.push({ kind: 'heroDown', heroId: victim.def.id });
          }
        }
      }
      continue;
    }

    const slow = Math.min(60, Math.max(e.slowMs > 0 ? e.slowPct : 0, auraSlow));
    e.dist -= e.proto.speed * (1 - slow / 100) * (TICK_MS / 1000);
    if (e.dist <= 0) {
      e.hp = 0;
      state.baseHp -= 1;
      state.events.push({ kind: 'leak', enemyId: e.id });
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
