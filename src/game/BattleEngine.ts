/**
 * 单局战斗引擎（无渲染、可逐帧驱动）
 *
 * 这是战斗逻辑的**唯一真源**：
 * - `formulas/simulate.ts` 批量快进它，用来回归卡关曲线；
 * - `scenes/BattleScene` 按帧驱动它，用来实际游玩。
 *
 * 两边共用同一份 tick，才能保证「模拟里验过的数值」在真机上成立。
 * 任何战斗规则改动只应发生在本文件，绝不允许渲染层另写一套。
 *
 * 布局与失败条件（docs/00-体验目标.md §4）：
 * 三个村民逻辑上是队列（队首 0，往后 -1、-2），画面上是前 1 后 2。
 * 外星人从 SPAWN_DIST 走向队首。
 * **失败是全队倒下或一波推不动，没有底线血量、没有漏怪。**
 *
 * 能力系统：村民的起手特性和身上装的改装件用同一套 Ability 类型，
 * 在 `computeStats` 里合并成一份 HeroStats。引擎因此只有一套 switch。
 */

import {
  MELEE_REACH,
  MOD_SLOTS_PER_HERO,
  REAR_POS,
  SPAWN_DIST,
  TEAM_SIZE,
  TICK_MS,
  TOTAL_WAVES,
  WAVE_GAP_MS,
  WAVE_TIMEOUT_MS,
  slotPos,
} from '../balance/combat';
import {
  getEnemyProto,
  getWave,
  waveAtkMult,
  waveHpMult,
  type EnemyProto,
} from '../balance/enemies';
import { HEROES, getHero, type HeroDef } from '../balance/heroes';
import { MODS, getMod, type Ability, type ModDef, type ModKind } from '../balance/mods';
import {
  CHOICES_PER_PICK,
  KIND_PRIORITY,
  MAX_TEAM_SIZE,
  PICK_WAVES,
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

function shuffled<T>(arr: readonly T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

// ── 能力合并 ────────────────────────────────────────────

/**
 * 一个村民当前实际生效的全部能力，由起手特性 + 已装改装件合并而来。
 * 静态部分在这里算完并缓存，避免每 tick 重新遍历改装件列表。
 */
export interface HeroStats {
  atk: number;
  maxHp: number;
  def: number;
  /** 已含改装件的射程加成 */
  range: number;
  /** 已含重击的出手变慢，不含全队攻速光环（那是动态的） */
  intervalMs: number;
  /** 重击的伤害倍率，累乘 */
  heavyMult: number;
  /** 站队首时额外的伤害倍率 */
  frontMult: number;
  critChance: number;
  critMult: number;
  armorPct: number;
  thornsPct: number;
  lifestealPct: number;
  ragePerHit: number;
  rageMaxStacks: number;
  splash?: { damagePct: number; radius: number };
  pierce: number;
  execute: number;
  slowOnHit?: { slowPct: number; durationMs: number };
  shield?: { amount: number; everyMs: number };
  heal?: { amount: number; everyMs: number };
  /** 倒下时原地站起来的血量百分比，0 表示没有 */
  revivePct: number;
  /** 提供给全队的攻速光环 */
  teamHaste: number;
}

export function abilitiesOf(h: HeroUnit): Ability[] {
  return [h.def.skill, ...h.mods.map((m) => m.effect)];
}

export function computeStats(def: HeroDef, mods: readonly ModDef[]): HeroStats {
  const st: HeroStats = {
    atk: def.atk,
    maxHp: def.hp,
    def: def.def,
    range: def.range,
    intervalMs: def.attackIntervalMs,
    heavyMult: 1,
    frontMult: 1,
    critChance: 0,
    critMult: 1,
    armorPct: 0,
    thornsPct: 0,
    lifestealPct: 0,
    ragePerHit: 0,
    rageMaxStacks: 0,
    pierce: 0,
    execute: 0,
    revivePct: 0,
    teamHaste: 0,
  };

  let atkPct = 0;
  let intervalPct = 0;

  for (const a of [def.skill, ...mods.map((m) => m.effect)]) {
    switch (a.kind) {
      case 'shield':
        st.shield = st.shield
          ? { amount: st.shield.amount + a.amount, everyMs: Math.min(st.shield.everyMs, a.everyMs) }
          : { amount: a.amount, everyMs: a.everyMs };
        break;
      case 'heal':
        st.heal = st.heal
          ? { amount: st.heal.amount + a.amount, everyMs: Math.min(st.heal.everyMs, a.everyMs) }
          : { amount: a.amount, everyMs: a.everyMs };
        break;
      case 'splash':
        // 取更强的那一份，不叠加：叠加会让「鼓风机装给三婶」直接失控
        if (!st.splash || a.damagePct > st.splash.damagePct) {
          st.splash = { damagePct: a.damagePct, radius: a.radius };
        }
        break;
      case 'execute':
        st.execute += a.maxChain;
        break;
      case 'slowOnHit':
        if (!st.slowOnHit || a.slowPct > st.slowOnHit.slowPct) {
          st.slowOnHit = { slowPct: a.slowPct, durationMs: a.durationMs };
        }
        break;
      case 'lifesteal':
        st.lifestealPct += a.healPct;
        break;
      case 'rangeUp':
        st.range += a.value;
        break;
      case 'frontMult':
        st.frontMult *= a.mult;
        break;
      case 'rageOnHurt':
        st.ragePerHit += a.pctPerHit;
        st.rageMaxStacks = Math.max(st.rageMaxStacks, a.maxStacks);
        break;
      case 'heavySwing':
        intervalPct += a.intervalPct;
        st.heavyMult *= a.damageMult;
        break;
      case 'pierce':
        st.pierce += a.extraTargets;
        break;
      case 'atkPct':
        atkPct += a.value;
        break;
      case 'crit':
        st.critChance += a.chancePct;
        st.critMult = Math.max(st.critMult, a.mult);
        break;
      case 'armorPct':
        st.armorPct += a.value;
        break;
      case 'revive':
        st.revivePct = Math.max(st.revivePct, a.hpPct);
        break;
      case 'thorns':
        st.thornsPct += a.reflectPct;
        break;
      case 'teamHaste':
        st.teamHaste += a.value;
        break;
    }
  }

  st.atk = def.atk * (1 + atkPct / 100);
  st.intervalMs = def.attackIntervalMs * (1 + intervalPct / 100);
  return st;
}

// ── 状态 ────────────────────────────────────────────────

export interface HeroUnit {
  def: HeroDef;
  /** 队列序号，0 是队首。位置换算见 combat.slotPos */
  slot: number;
  hp: number;
  maxHp: number;
  shield: number;
  cdMs: number;
  skillCdMs: number;
  alive: boolean;
  mods: ModDef[];
  stats: HeroStats;
  /** 本波累积的「越挨越猛」层数 */
  rageStacks: number;
  /** 本波是否已经用掉了站起来的机会 */
  usedRevive: boolean;
}

export interface EnemyUnit {
  id: number;
  proto: EnemyProto;
  hp: number;
  maxHp: number;
  atk: number;
  /** 战场坐标。从 SPAWN_DIST 递减，越小越深入我方队列 */
  dist: number;
  cdMs: number;
  slowMs: number;
  slowPct: number;
}

/** 供渲染层消费的一帧内发生的事。引擎只记录，不关心怎么表现 */
export type BattleEvent =
  | { kind: 'hit'; heroId: string; enemyId: number; damage: number; crit: boolean; heal?: number }
  | { kind: 'enemyHit'; enemyId: number; heroId: string; damage: number; reflect: number; absorbed: number }
  | { kind: 'enemyDown'; enemyId: number }
  | { kind: 'heroDown'; heroId: string }
  /** 摩托头盔生效，原地站起来 */
  | { kind: 'heroRevive'; heroId: string }
  | { kind: 'skill'; heroId: string; skillName: string; skillKind: string; targetId?: string; amount?: number }
  /** 改装件装上了。渲染层用它播一次装配演出 */
  | { kind: 'install'; heroId: string; modId: string };

export interface RunStats {
  hits: number;
  crits: number;
  skills: number;
  /** 整局装了几件破烂 */
  installs: number;
}

export type RunPhase =
  | 'picking'
  /** 已经选好一件改装件，等玩家点人 —— 主体验的那一步 */
  | 'installing'
  | 'fighting'
  | 'gap'
  | 'won'
  | 'lost';

export interface RunState {
  phase: RunPhase;
  /** 当前波次，picking / installing 时表示「即将开打的那一波」 */
  wave: number;
  /** 上场的三个人，索引无意义，站位看 slot */
  team: HeroUnit[];
  enemies: EnemyUnit[];
  picks: PickKind[];
  /** phase 为 picking 时待选的牌。开局是全员村民，波间是三张改装件 */
  pendingOptions: PickOption[];
  /** phase 为 installing 时已选中、待装配的那件破烂 */
  pendingMod?: ModDef;
  /** 本局还没发出去的改装件。每件一局只出一次 */
  modPool: ModDef[];
  waveElapsedMs: number;
  gapElapsedMs: number;
  totalMs: number;
  /** 本帧事件，渲染层读完应自行清空 */
  events: BattleEvent[];
  /** 整局累计，结算归因用，模拟层可忽略 */
  stats: RunStats;
  rng: () => number;
  nextEnemyId: number;
}

function emptyStats(): RunStats {
  return { hits: 0, crits: 0, skills: 0, installs: 0 };
}

function emit(state: RunState, ev: BattleEvent): void {
  state.events.push(ev);
  if (ev.kind === 'hit') {
    state.stats.hits += 1;
    if (ev.crit) state.stats.crits += 1;
  } else if (ev.kind === 'skill') {
    state.stats.skills += 1;
  } else if (ev.kind === 'install') {
    state.stats.installs += 1;
  }
}

// ── 查询 ────────────────────────────────────────────────

export function heroAt(state: RunState, slot: number): HeroUnit | undefined {
  return state.team.find((h) => h.slot === slot);
}

/** 队列从前到后 */
export function teamInOrder(state: RunState): HeroUnit[] {
  return [...state.team].sort((a, b) => a.slot - b.slot);
}

export function heroPos(h: HeroUnit): number {
  return slotPos(h.slot);
}

/** 能打到的最远坐标 */
export function heroReach(h: HeroUnit): number {
  return slotPos(h.slot) + h.stats.range;
}

export function canInstallOn(h: HeroUnit): boolean {
  return h.mods.length < MOD_SLOTS_PER_HERO;
}

/**
 * 外星人该打谁：近战够得着的人里打最靠前的那个。
 * 够不着就返回 undefined，继续往前走。
 *
 * 「打最靠前的」是队列有意义的全部来源 —— 队首替后面的人挨刀。
 */
export function enemyVictim(e: EnemyUnit, team: readonly HeroUnit[]): HeroUnit | undefined {
  let best: HeroUnit | undefined;
  for (const h of team) {
    if (!h.alive) continue;
    const gap = e.dist - slotPos(h.slot);
    if (gap <= 0 || gap > MELEE_REACH) continue;
    if (!best || h.slot < best.slot) best = h;
  }
  return best;
}

function enemySlowPct(e: EnemyUnit): number {
  return e.slowMs > 0 ? Math.min(60, e.slowPct) : 0;
}

// ── 发牌 ────────────────────────────────────────────────

/** 开局一次铺开全部村民，点满 3 个就开打。顺序固定，方便认脸 */
function rosterOptions(): PickOption[] {
  return HEROES.map((h) => ({ kind: 'recruit' as const, heroId: h.id }));
}

/** 还在开局点人：牌全是村民，人还没点齐 */
export function isRosterPicking(state: RunState): boolean {
  return (
    state.phase === 'picking'
    && state.team.length < MAX_TEAM_SIZE
    && state.pendingOptions.length > 0
    && state.pendingOptions.every((o) => o.kind === 'recruit')
  );
}

/**
 * 发改装件：三张 kind 尽量互不相同，且**保证至少一张 pivot**。
 * 三张都是纯强度等于这一轮没有改定位的机会，主体验就断了一次。
 */
function modOptions(state: RunState): PickOption[] {
  if (state.modPool.length === 0) return [];
  const pool = shuffled(state.modPool, state.rng);
  const picked: ModDef[] = [];
  const usedKinds = new Set<ModKind>();

  const pivot = pool.find((m) => m.kind === 'pivot');
  if (pivot) {
    picked.push(pivot);
    usedKinds.add('pivot');
  }
  for (const kind of KIND_PRIORITY) {
    if (picked.length >= CHOICES_PER_PICK) break;
    if (usedKinds.has(kind)) continue;
    const m = pool.find((x) => x.kind === kind && !picked.includes(x));
    if (m) {
      picked.push(m);
      usedKinds.add(kind);
    }
  }
  // kind 不够凑数时，允许同 kind 补齐，总比只给两张好
  for (const m of pool) {
    if (picked.length >= CHOICES_PER_PICK) break;
    if (!picked.includes(m)) picked.push(m);
  }
  return picked.map((m) => ({ kind: 'mod', modId: m.id }));
}

export function buildOptions(state: RunState): PickOption[] {
  return modOptions(state);
}

// ── 阵容 ────────────────────────────────────────────────

function makeUnit(def: HeroDef, slot: number): HeroUnit {
  const stats = computeStats(def, []);
  return {
    def,
    slot,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    shield: 0,
    cdMs: 0,
    skillCdMs: 0,
    alive: true,
    mods: [],
    stats,
    rageStacks: 0,
    usedRevive: false,
  };
}

function addHero(state: RunState, heroId: string): void {
  if (state.team.length >= MAX_TEAM_SIZE) return;
  if (state.team.some((h) => h.def.id === heroId)) return;
  state.team.push(makeUnit(getHero(heroId), state.team.length));
}

/** 开打前把近战/肉的放到前面，远程靠后。玩家随后还能换 */
function arrangeOpeningTeam(state: RunState): void {
  const ordered = [...state.team].sort((a, b) => {
    const aMelee = a.def.range <= 1;
    const bMelee = b.def.range <= 1;
    if (aMelee !== bMelee) return aMelee ? -1 : 1;
    if (b.maxHp !== a.maxHp) return b.maxHp - a.maxHp;
    return a.def.range - b.def.range;
  });
  ordered.forEach((h, i) => {
    h.slot = i;
  });
}

function refreshStats(h: HeroUnit): void {
  h.stats = computeStats(h.def, h.mods);
  h.maxHp = h.stats.maxHp;
  if (h.hp > h.maxHp) h.hp = h.maxHp;
}

/**
 * 交换队列里两个位置的人。
 *
 * 这是玩家唯一的站位操作，也是改装件产生连带决策的地方：
 * 装了钢板的远程想站队首，装了高压锅的肉盾也想挨打，两者会打架。
 */
export function swapSlots(state: RunState, a: number, b: number): void {
  if (a === b) return;
  const ha = heroAt(state, a);
  const hb = heroAt(state, b);
  if (ha) ha.slot = b;
  if (hb) hb.slot = a;
}

/** 把人放到指定格：空位直接站上去，有人就互换。 */
export function placeInSlot(state: RunState, heroId: string, slot: number): boolean {
  if (slot < 0 || slot >= TEAM_SIZE) return false;
  const hero = state.team.find((h) => h.def.id === heroId);
  if (!hero || hero.slot === slot) return false;
  const other = heroAt(state, slot);
  if (other) swapSlots(state, hero.slot, slot);
  else hero.slot = slot;
  return true;
}

/** 把待装配的改装件装到某人身上，随后开打 */
export function installMod(state: RunState, heroId: string): boolean {
  if (state.phase !== 'installing') return false;
  const mod = state.pendingMod;
  if (!mod) return false;
  const target = state.team.find((h) => h.def.id === heroId);
  if (!target || !canInstallOn(target)) return false;

  target.mods.push(mod);
  refreshStats(target);
  state.pendingMod = undefined;
  emit(state, { kind: 'install', heroId, modId: mod.id });
  beginWave(state);
  return true;
}

/** 谁还装得下。全队都满了时装配这一步要跳过，否则会卡死 */
export function installTargets(state: RunState): HeroUnit[] {
  return state.team.filter(canInstallOn);
}

// ── 出怪 ────────────────────────────────────────────────

interface ScheduledSpawn {
  atMs: number;
  proto: EnemyProto;
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
      });
    }
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** 每波的出怪表在进入战斗时生成，随状态走，便于逐帧驱动 */
const scheduleCache = new WeakMap<RunState, { list: ScheduledSpawn[]; idx: number }>();

// ── 生命周期 ────────────────────────────────────────────

export function createRun(seed: number): RunState {
  const rng = makeRng(seed);
  const state: RunState = {
    phase: 'picking',
    wave: 1,
    team: [],
    enemies: [],
    picks: [],
    pendingOptions: [],
    modPool: shuffled(MODS, rng),
    waveElapsedMs: 0,
    gapElapsedMs: 0,
    totalMs: 0,
    events: [],
    stats: emptyStats(),
    rng,
    nextEnemyId: 1,
  };
  // 开局：战场上一次点齐 3 人，点满就开打。不是前置编队页
  state.pendingOptions = rosterOptions();
  return state;
}

/**
 * 玩家（或模拟策略）选定一张牌。
 *
 * 开局点村民是勾选：再点一下取消，点满 3 个才开打。
 * 选到改装件则转入 installing，等「装给谁」那一步。
 * 后两步刻意不合并 —— 合并了主体验就没了。
 */
export function applyPick(state: RunState, option: PickOption): void {
  if (state.phase !== 'picking') return;

  if (option.kind === 'recruit') {
    if (!state.pendingOptions.some((o) => o.kind === 'recruit' && o.heroId === option.heroId)) return;
    const existing = state.team.find((h) => h.def.id === option.heroId);
    if (existing) {
      state.team = state.team.filter((h) => h.def.id !== option.heroId);
      state.team.forEach((h, i) => {
        h.slot = i;
      });
      return;
    }
    if (state.team.length >= MAX_TEAM_SIZE) return;
    state.picks.push('recruit');
    addHero(state, option.heroId);
    if (state.team.length >= MAX_TEAM_SIZE) {
      arrangeOpeningTeam(state);
      state.pendingOptions = [];
      beginWave(state);
    }
    return;
  }

  state.picks.push(option.kind);
  state.pendingOptions = [];

  const mod = getMod(option.modId);
  state.modPool = state.modPool.filter((m) => m.id !== mod.id);
  if (installTargets(state).length === 0) {
    // 全员改装位已满，这件只能作废，直接开打而不是卡在装配阶段
    beginWave(state);
    return;
  }
  state.pendingMod = mod;
  state.phase = 'installing';
}

function beginWave(state: RunState): void {
  // 每波开始全员复活满血：一次倒下不该直接结束整局，
  // 判负交给「本波全队倒下」，这样每一波都是一次完整的戏。
  for (const h of state.team) {
    refreshStats(h);
    h.hp = h.maxHp;
    h.alive = true;
    h.shield = 0;
    h.cdMs = 0;
    h.skillCdMs = 0;
    h.rageStacks = 0;
    h.usedRevive = false;
  }
  state.enemies = [];
  state.waveElapsedMs = 0;
  scheduleCache.set(state, { list: scheduleWave(state.wave), idx: 0 });
  state.phase = 'fighting';
}

function finishWave(state: RunState): void {
  if (state.wave >= TOTAL_WAVES) {
    state.phase = 'won';
    return;
  }
  state.wave += 1;
  state.gapElapsedMs = 0;
  if (PICK_WAVES.includes(state.wave)) {
    state.pendingOptions = buildOptions(state);
    if (state.pendingOptions.length > 0) {
      state.phase = 'picking';
      return;
    }
  }
  state.phase = 'gap';
}

// ── 每帧 ────────────────────────────────────────────────

/**
 * 推进一个 TICK_MS。
 *
 * 渲染层按帧累积时间后调用，模拟层直接连续调用 —— 两者走的是同一段逻辑。
 */
export function tick(state: RunState): void {
  if (state.phase !== 'fighting' && state.phase !== 'gap') return;

  if (state.phase === 'gap') {
    state.gapElapsedMs += TICK_MS;
    state.totalMs += TICK_MS;
    if (state.gapElapsedMs >= WAVE_GAP_MS) beginWave(state);
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
    finishWave(state);
    return;
  }

  const living = state.team.filter((h) => h.alive);
  if (living.length === 0) {
    state.phase = 'lost';
    return;
  }

  // 2. 全队攻速光环（每 tick 重算，避免维护叠加状态）
  let teamHaste = 0;
  for (const h of living) teamHaste += h.stats.teamHaste;

  // 3. 村民的周期特性与攻击
  for (const h of living) {
    h.cdMs -= TICK_MS;
    h.skillCdMs -= TICK_MS;
    const st = h.stats;

    if (st.shield && h.skillCdMs <= 0) {
      h.shield += st.shield.amount;
      h.skillCdMs = st.shield.everyMs;
      emit(state, {
        kind: 'skill',
        heroId: h.def.id,
        skillName: h.def.skillName,
        skillKind: 'shield',
        amount: st.shield.amount,
      });
    }
    if (st.heal && h.skillCdMs <= 0) {
      const lowest = living
        .filter((x) => x.hp < x.maxHp)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      if (lowest) lowest.hp = Math.min(lowest.maxHp, lowest.hp + st.heal.amount);
      h.skillCdMs = st.heal.everyMs;
      emit(state, {
        kind: 'skill',
        heroId: h.def.id,
        skillName: h.def.skillName,
        skillKind: 'heal',
        targetId: lowest?.def.id,
        amount: lowest ? st.heal.amount : 0,
      });
    }

    if (h.cdMs > 0) continue;

    const from = slotPos(h.slot);
    const reach = heroReach(h);
    const inRange = state.enemies.filter((e) => e.hp > 0 && e.dist > from && e.dist <= reach);
    if (inRange.length === 0) continue;
    inRange.sort((a, b) => a.dist - b.dist);

    h.cdMs = st.intervalMs / (1 + teamHaste / 100);

    const isCrit = st.critChance > 0 && state.rng() * 100 < st.critChance;
    let mult = st.heavyMult;
    if (h.slot === 0) mult *= st.frontMult;
    if (isCrit) mult *= st.critMult;
    if (st.ragePerHit > 0) mult *= 1 + (h.rageStacks * st.ragePerHit) / 100;

    const hit = (target: EnemyUnit, share: number): void => {
      const dmg = computeDamage({
        atk: st.atk,
        targetDef: target.proto.def,
        modMult: mult,
        targetDamageReductionPct: 0,
      }) * share;
      target.hp -= dmg;
      const healed = st.lifestealPct > 0 ? dmg * (st.lifestealPct / 100) : 0;
      if (healed > 0) h.hp = Math.min(h.maxHp, h.hp + healed);
      emit(state, {
        kind: 'hit',
        heroId: h.def.id,
        enemyId: target.id,
        damage: dmg,
        crit: isCrit,
        heal: healed > 0 ? healed : undefined,
      });
      if (st.slowOnHit) {
        target.slowMs = st.slowOnHit.durationMs;
        target.slowPct = st.slowOnHit.slowPct;
      }
      if (target.hp <= 0) emit(state, { kind: 'enemyDown', enemyId: target.id });
    };

    const primary = inRange[0];
    if (!primary) continue;
    hit(primary, 1);

    if (st.splash) {
      const sp = st.splash;
      for (const e of inRange) {
        if (e !== primary && e.hp > 0 && Math.abs(e.dist - primary.dist) <= sp.radius) {
          hit(e, sp.damagePct / 100);
        }
      }
    }
    if (st.pierce > 0) {
      let extra = 0;
      for (const e of inRange) {
        if (e === primary || e.hp <= 0) continue;
        if (extra >= st.pierce) break;
        hit(e, 1);
        extra += 1;
      }
    }
    if (st.execute > 0) {
      let chain = 0;
      while (chain < st.execute && primary.hp <= 0) {
        const next = state.enemies
          .filter((e) => e.hp > 0 && e.dist > from && e.dist <= reach)
          .sort((a, b) => a.dist - b.dist)[0];
        if (!next) break;
        hit(next, 1);
        chain += 1;
        if (next.hp > 0) break;
      }
    }
  }

  // 4. 外星人推进与攻击。够得着就打队首，够不着就往前走。
  const targets = state.team.filter((h) => h.alive);
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    e.cdMs -= TICK_MS;
    if (e.slowMs > 0) e.slowMs -= TICK_MS;
    const slow = enemySlowPct(e);

    const victim = enemyVictim(e, targets);
    if (victim) {
      if (e.cdMs <= 0) {
        e.cdMs = e.proto.attackIntervalMs * (1 + slow / 100);
        const vst = victim.stats;
        const dmg = computeDamage({
          atk: e.atk,
          targetDef: vst.def,
          modMult: 1,
          targetDamageReductionPct: vst.armorPct,
        });
        const absorbed = Math.min(victim.shield, dmg);
        victim.shield -= absorbed;
        victim.hp -= dmg - absorbed;

        if (vst.rageMaxStacks > 0) {
          victim.rageStacks = Math.min(vst.rageMaxStacks, victim.rageStacks + 1);
        }
        const reflect = vst.thornsPct > 0 ? dmg * (vst.thornsPct / 100) : 0;
        if (reflect > 0) {
          e.hp -= reflect;
          if (e.hp <= 0) emit(state, { kind: 'enemyDown', enemyId: e.id });
        }
        emit(state, {
          kind: 'enemyHit',
          enemyId: e.id,
          heroId: victim.def.id,
          damage: dmg,
          reflect,
          absorbed,
        });

        if (victim.hp <= 0) {
          if (vst.revivePct > 0 && !victim.usedRevive) {
            victim.usedRevive = true;
            victim.hp = victim.maxHp * (vst.revivePct / 100);
            emit(state, { kind: 'heroRevive', heroId: victim.def.id });
          } else {
            victim.alive = false;
            emit(state, { kind: 'heroDown', heroId: victim.def.id });
          }
        }
      }
      continue;
    }

    e.dist -= e.proto.speed * (1 - slow / 100) * (TICK_MS / 1000);
    // 队尾后面还有一格缓冲，纯粹为了让「被打穿」在画面上看得见；
    // 真正的判负是全队倒下，不是位置。
    if (e.dist < REAR_POS - MELEE_REACH) e.dist = REAR_POS - MELEE_REACH;
  }

  // 5. 清理
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const e = state.enemies[i];
    if (e && e.hp <= 0) state.enemies.splice(i, 1);
  }

  // 6. 判负：全队倒下，或这一波推不动
  if (state.team.length > 0 && state.team.every((h) => !h.alive)) {
    state.phase = 'lost';
    return;
  }
  if (state.waveElapsedMs >= WAVE_TIMEOUT_MS) state.phase = 'lost';
}

export { TEAM_SIZE, MOD_SLOTS_PER_HERO };
