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
  STAGE_MS,
  EMPTY_PULL_MS,
  WAVE_HANDOFF_MS,
  CLEANUP_MS,
  DOWN_RECOVER_MS,
  DOWN_RECOVER_HP_PCT,
  STAGE_HEAL_PCT,
  JAM_COUNT,
  JAM_MS,
  REVIVE_GRACE_MS,
  WALK_HASTE,
  WALK_HASTE_FROM_WAVE,
  WALK_HASTE_UNTIL_WAVE,
  slotPos,
} from '../balance/combat';
import { comboOf } from '../balance/combos';
import { LADDER_TOP, ladderDownMult, ladderExtraPct, ladderStageMs } from '../balance/ladder';
import {
  REROLL_COST,
  SCRAP_PER_INSTALL,
  STRIP_COST,
  type RewardSource,
  type ScrapGrant,
} from '../balance/rewards';
import {
  BACK_AIM_DAMAGE,
  BACK_AIM_DIST,
  getEnemyProto,
  getWave,
  waveAtkMult,
  waveHpMult,
  type EnemyProto,
} from '../balance/enemies';
import { HEROES, getHero, type HeroDef } from '../balance/heroes';
import {
  MODS,
  MOD_STAR_MAX,
  getMod,
  isFamiliarMod,
  masteredMod,
  modDrawWeight,
  type Ability,
  type ModDef,
  type ModKind,
  type SummonSpec,
} from '../balance/mods';
import {
  clampLanes,
  drawMulFromLanes,
  starsFromLanes,
  type LaneLevels,
} from '../balance/lanes';
import { PET_CAP, PET_MAX_DIST, getPetProto, type PetProto } from '../balance/pets';
import { CALIBRATE_STAGE_ID, getStage, stageBeatStart } from '../balance/stages';
import {
  DEFAULT_RUN_GROWTH,
  availableMods,
  clampModStars,
  pickNeed,
  type RunGrowth,
} from '../balance/yard';
import {
  CHOICES_PER_PICK,
  KIND_PRIORITY,
  MAX_TEAM_SIZE,
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

/** 前三手只抽村里的老件。新件后半局才进场，池子变大也不摊掉水管电锯 */
const NEW_MOD_FROM_LEVEL = 4;

/**
 * 一件破烂这一手的份量 = 老件加倍 × 门路研发倍数。
 *
 * 门路那一乘是局外养成唯一伸进发牌的手 —— 研发满一条路，
 * 这一局的牌就明显偏向那条路，玩家能说出「我这号走的是打得开」。
 * 倍数上限压在 2.75（见 lanes.ts），别让一条路把三选一刷成同款。
 */
function pickWeight(mod: ModDef, state: RunState): number {
  const base = modDrawWeight(mod);
  if (!isFamiliarMod(mod.id) && state.level < NEW_MOD_FROM_LEVEL) return 0;
  return base * (state.laneDraw[mod.id] ?? 1);
}

function pickWeighted(cands: readonly ModDef[], state: RunState): ModDef | undefined {
  if (cands.length === 0) return undefined;
  const rng = state.rng;
  const weights = cands.map((m) => pickWeight(m, state));
  let total = 0;
  for (const w of weights) total += w;
  if (total <= 0) return cands[Math.floor(rng() * cands.length)];
  let tick = rng() * total;
  for (let i = 0; i < cands.length; i += 1) {
    tick -= weights[i]!;
    if (tick <= 0) return cands[i];
  }
  return cands[cands.length - 1];
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
  /**
   * 他身上栓着的小东西。
   *
   * 是数组而不是单个：装了两件放小东西的破烂就该两件都生效，
   * 只留一件会让玩家的第二次选择白扔。画面上的节制交给 PET_CAP 那道全队闸，
   * 不靠在这里悄悄丢掉一件。
   */
  summons: SummonSpec[];
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
    summons: [],
  };

  let atkPct = 0;
  let intervalPct = 0;
  let forceMelee = false;
  const combo = comboOf(mods.map((m) => m.id));
  const extra = combo?.extras ?? [];

  for (const a of [def.skill, ...mods.map((m) => m.effect), ...extra]) {
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
      case 'sawGrip':
        atkPct += a.atkPct;
        forceMelee = true;
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
      case 'summon':
        st.summons.push(a);
        break;
    }
  }

  st.atk = def.atk * (1 + atkPct / 100);
  st.intervalMs = def.attackIntervalMs * (1 + intervalPct / 100);
  // 电锯把远程焊成近战；水管加电锯的「加长电锯」另有射程，不要夹死
  const gainedRange = [def.skill, ...mods.map((m) => m.effect), ...extra]
    .some((a) => a.kind === 'rangeUp');
  if (forceMelee && !gainedRange) st.range = Math.min(st.range, 1);
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
  /** 本刻度累积的「越挨越猛」层数。过一个刻度清零 */
  rageStacks: number;
  /** 本刻度是否已经用掉了站起来的机会。过一个刻度重开一轮 */
  usedRevive: boolean;
  /** 各件放小东西的破烂各自的倒计时，按 petId 记，免得跟 stats.summons 的下标绑死 */
  summonCd: Record<string, number>;
  /** 躺着还剩多久爬起来。0 表示站着。战场不再清场，所以倒下必须能自己缓过来 */
  downMs: number;
}

/**
 * 场上的小东西。狗、鸡、乡亲共用这一种。
 *
 * 和外星人共用 `dist` 这套坐标，只是往反方向走。它没有护盾、没有反弹、
 * 不会站起来 —— 那些都是村民的戏份，小东西只有血和一张嘴。
 */
export interface PetUnit {
  id: number;
  proto: PetProto;
  /** 谁放出来的。它的强弱和出生点全从这个人身上算 */
  ownerId: string;
  hp: number;
  maxHp: number;
  atk: number;
  dist: number;
  cdMs: number;
  /**
   * 跟主人学来的那一手。
   *
   * 这是「栓给谁」的**质变**来源，也是这一件能算改装件而不是数值件的理由。
   * 光继承攻击和血量只是量变，压不过装备位的机会成本 —— 实测那样配的话
   * 「栓给最能打的」永远不如「栓给身上还空着的」，等于装谁都一样。
   *
   * 栓给王大锤的狗咬一口也让人晕，栓给三婶的狗咬人带响，栓给屠户老李的狗
   * 咬着还能回血。而且这三样正好对上外星人的三种行为：减速对付扑上来的小灰、
   * 带响对付裂开的碎块。
   */
  learned: {
    slowOnHit?: { slowPct: number; durationMs: number };
    splash?: { damagePct: number; radius: number };
    lifestealPct: number;
  };
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
  /** 剩余壳值。0 表示没壳或已砸开。壳在时每次受击先削掉 proto.shell.flat 点 */
  shell: number;
  /** 自己就是碎块，不再往下裂。否则一只方块兵能裂出满屏 */
  isShard: boolean;
}

/** 供渲染层消费的一帧内发生的事。引擎只记录，不关心怎么表现 */
export type BattleEvent =
  /**
   * 打中了。`byPet` 有值时这一下是主人放的小东西咬的 ——
   * 事件仍挂在主人名下（功劳算他的，归因才落在「装给谁」上），
   * 但渲染层得知道起手位置在狗身上，不该让主人凭空挥一刀。
   */
  | { kind: 'hit'; heroId: string; enemyId: number; damage: number; crit: boolean; heal?: number; byPet?: number; aoe?: boolean }
  | { kind: 'petSummon'; petId: number; heroId: string; protoId: string }
  | { kind: 'petHurt'; petId: number; enemyId: number; damage: number }
  | { kind: 'petDown'; petId: number }
  | { kind: 'enemyHit'; enemyId: number; heroId: string; damage: number; reflect: number; absorbed: number }
  /** scrap 是这一具尸体真掉出来的整数废品，可能为 0（掉落带小数，攒够 1 才发） */
  | { kind: 'enemyDown'; enemyId: number; scrap: number }
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
  /** 调过几次队列。结算用来判断要不要提示换位 */
  queueMoves: number;
}

export type RunPhase =
  | 'picking'
  /** 已经选好一件改装件，等玩家点人 —— 主体验的那一步 */
  | 'installing'
  | 'fighting'
  | 'won'
  | 'lost';

/** 判负原因。队灭才能卖复活；推不动直接结算。 */
export type LoseReason = 'wipe' | 'timeout';

export interface RunState {
  /** 这一局打的是第几档难度阶梯。0 是照旧 */
  ladderLv: number;
  /** 主线第几关。1 是村口见习，最后一关才是完整 15 段 */
  stageId: number;
  lastWave: number;
  waveFrom: number;
  packExtra: number;
  stageHpMul: number;
  stageAtkMul: number;
  stageSpdMul: number;
  stripSplit: boolean;
  seed: number;
  phase: RunPhase;
  /** 当前波次，picking / installing 时表示「即将开打的那一波」 */
  wave: number;
  /** 上场的三个人，索引无意义，站位看 slot */
  team: HeroUnit[];
  enemies: EnemyUnit[];
  /** 场上的狗、鸡、乡亲。跟着波次清，不跨波留着 */
  pets: PetUnit[];
  picks: PickKind[];
  /** phase 为 picking 时待选的牌。开局是全员村民，波间是三张改装件 */
  pendingOptions: PickOption[];
  /** phase 为 installing 时已选中、待装配的那件破烂 */
  pendingMod?: ModDef;
  /** 本局还没发出去的改装件。每件一局只出一次 */
  modPool: ModDef[];
  /**
   * 点满三人后先焊上再开打的那几件。
   *
   * 两个来源：村里买了携带位点好的「带一件出村」、局内广告白送。
   * 做成数组是因为这两条会同时成立，只留一个就得砍掉一个广告位。
   */
  openingGifts: ModDef[];
  /** 翻废品站翻到的，下一手三选一必出 */
  pinnedMods: ModDef[];
  /** 本局零钱，打完作废 */
  scrap: number;
  scrapEarned: number;
  scrapSpent: number;
  /** 每笔发放带 source，接口形状留给日后分账 */
  scrapLog: ScrapGrant[];
  /** 掉落废品的小数余量。攒够 1 才发，不走概率，同 seed 必得同一局 */
  scrapFrac: number;
  /** 本局累计击杀经验。跨过门槛就当场发一次三选一 */
  exp: number;
  /** 已升到第几级，等于本局已发出的改装件张数 */
  level: number;
  /** 局外买来的肉鸽成长。技能仍是局里抽的 */
  growth: RunGrowth;
  freeRerollsLeft: number;
  luckLeft: number;
  freeRevivesLeft: number;
  /** 本局破烂按门路研发升星放大。键是破烂 id，星从门路摊下来 */
  modStars: Readonly<Record<string, number>>;
  /** 本局各件在三选一里的份量倍数，也从门路研发摊下来 */
  laneDraw: Readonly<Record<string, number>>;
  /** 当前刻度已经过了多久。只用于进度显示，出怪看的是 totalMs */
  waveElapsedMs: number;
  /** 最后一只计划出场的时刻。短关进度条跟这条走，不跟空的节拍走 */
  streamEndMs: number;
  /**
   * 场上堆积了多久。爬到 JAM_MS 就算推不动。
   *
   * 负值是队灭复活后的豁免期（见 REVIVE_GRACE_MS）—— 得先爬回 0 才开始算账，
   * 否则看完广告站起来，下一帧就又被场上那堆怪判输。
   */
  jamMs: number;
  totalMs: number;
  /** 本帧事件，渲染层读完应自行清空 */
  events: BattleEvent[];
  /** 整局累计，结算归因用，模拟层可忽略 */
  stats: RunStats;
  /** phase 为 lost 时有值 */
  loseReason?: LoseReason;
  rng: () => number;
  nextEnemyId: number;
  nextPetId: number;
}

function emptyStats(): RunStats {
  return { hits: 0, crits: 0, skills: 0, installs: 0, queueMoves: 0 };
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

/**
 * 贴身交战圈：面前一格，或已经挤到身上 / 刚挤过去一格。
 *
 * 只认「在面前」的话，队首一倒它们就走进三角，站起来也打不到脚边的铁罐。
 */
export function inMelee(enemyDist: number, standPos: number): boolean {
  const gap = enemyDist - standPos;
  return gap >= -MELEE_REACH && gap <= MELEE_REACH;
}

/** 村民能打到这只：射程以内，脚边和身后一格也算还在打 */
export function heroCanReach(h: HeroUnit, enemyDist: number): boolean {
  const from = slotPos(h.slot);
  return enemyDist <= heroReach(h) && enemyDist >= from - MELEE_REACH;
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
  if (e.proto.aim === 'back') {
    if (e.dist > BACK_AIM_DIST) return undefined;
    let rear: HeroUnit | undefined;
    for (const h of team) {
      if (!h.alive) continue;
      if (!rear || h.slot > rear.slot) rear = h;
    }
    return rear;
  }
  let best: HeroUnit | undefined;
  for (const h of team) {
    if (!h.alive) continue;
    if (!inMelee(e.dist, slotPos(h.slot))) continue;
    if (!best || h.slot < best.slot) best = h;
  }
  return best;
}

function enemySlowPct(e: EnemyUnit): number {
  return e.slowMs > 0 ? Math.min(60, e.slowPct) : 0;
}

/**
 * 外星人面前挡着的那只小东西。挡着的定义和「够得着队首」一样：
 * 在它正前方一个近战距离之内。挑最靠前的那只。
 */
export function petBlocking(e: EnemyUnit, pets: readonly PetUnit[]): PetUnit | undefined {
  let best: PetUnit | undefined;
  for (const p of pets) {
    if (p.hp <= 0) continue;
    const gap = e.dist - p.dist;
    if (gap < 0 || gap > MELEE_REACH) continue;
    if (!best || p.dist > best.dist) best = p;
  }
  return best;
}

/**
 * 放一只出来。
 *
 * 攻击和那一手都按主人的当前面板算 —— 注意是**当前**，所以后装的破烂
 * 会让之后放出来的狗更猛，这一点是有意的：改造的收益要能传导到狗身上。
 * 血量反而一视同仁（见 pets.ts）。
 * 出生点就是主人站的那一格，`index` 只用来把同时出来的几只稍微错开。
 */
function summonPet(state: RunState, owner: HeroUnit, sm: SummonSpec, index: number): void {
  const proto = getPetProto(sm.petId);
  const pet: PetUnit = {
    id: state.nextPetId++,
    proto,
    ownerId: owner.def.id,
    hp: proto.hp,
    maxHp: proto.hp,
    atk: Math.max(1, owner.stats.atk * (sm.atkInherit / 100)),
    dist: slotPos(owner.slot) + index * 0.18,
    cdMs: proto.attackIntervalMs,
    // 读的是 stats 而不是 def.skill，所以主人靠破烂得来的那一手也一样传下去
    learned: {
      slowOnHit: owner.stats.slowOnHit,
      splash: owner.stats.splash,
      lifestealPct: owner.stats.lifestealPct,
    },
  };
  state.pets.push(pet);
  emit(state, { kind: 'petSummon', petId: pet.id, heroId: owner.def.id, protoId: proto.id });
}

// ── 发牌 ────────────────────────────────────────────────

/** 开局一次铺开全部村民。真玩在村子里点人，这里留给模拟 */
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
  const cap = CHOICES_PER_PICK;
  const pool = state.modPool;
  const picked: ModDef[] = [];
  const usedKinds = new Set<ModKind>();
  const take = (cands: readonly ModDef[]): ModDef | undefined => {
    const left = cands.filter((x) => !picked.includes(x));
    return pickWeighted(left, state);
  };

  const pivot = take(pool.filter((m) => m.kind === 'pivot'));
  if (pivot) {
    picked.push(pivot);
    usedKinds.add('pivot');
  }
  for (const kind of KIND_PRIORITY) {
    if (picked.length >= cap) break;
    if (usedKinds.has(kind)) continue;
    const m = take(pool.filter((x) => x.kind === kind));
    if (m) {
      picked.push(m);
      usedKinds.add(kind);
    }
  }
  // kind 不够凑数时，允许同 kind 补齐，总比只给两张好
  while (picked.length < cap) {
    const m = take(pool);
    if (!m) break;
    picked.push(m);
  }
  return picked.map((m) => ({ kind: 'mod', modId: m.id }));
}

export function buildOptions(state: RunState): PickOption[] {
  if (state.luckLeft > 0 && state.pinnedMods.length === 0) {
    const pivot = pickWeighted(state.modPool.filter((m) => m.kind === 'pivot'), state);
    if (pivot) {
      state.modPool = state.modPool.filter((m) => m.id !== pivot.id);
      state.pinnedMods.push(pivot);
      state.luckLeft -= 1;
    }
  }
  const rest = modOptions(state);
  const forced = state.pinnedMods.shift();
  if (!forced) return rest;
  const head: PickOption = { kind: 'mod', modId: forced.id };
  return [head, ...rest.filter((o) => o.kind !== 'mod' || o.modId !== forced.id)]
    .slice(0, CHOICES_PER_PICK);
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
    summonCd: {},
    downMs: 0,
  };
}

function addHero(state: RunState, heroId: string): void {
  if (state.team.length >= MAX_TEAM_SIZE) return;
  if (state.team.some((h) => h.def.id === heroId)) return;
  state.team.push(makeUnit(getHero(heroId), state.team.length));
}

/** 局里点人没指定槽位时，近战/肉靠前、远程靠后。村子排好的三人不要动 */
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
  state.stats.queueMoves += 1;
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
  addScrap(state, SCRAP_PER_INSTALL, 'free');
  state.pendingMod = undefined;
  emit(state, { kind: 'install', heroId, modId: mod.id });
  resumeFight(state);
  return true;
}

function addScrap(state: RunState, n: number, source: RewardSource): void {
  const add = Math.max(0, Math.floor(n));
  if (add <= 0) return;
  state.scrap += add;
  state.scrapEarned += add;
  state.scrapLog.push({ amount: add, source });
}

function spendScrap(state: RunState, n: number): boolean {
  const cost = Math.max(0, Math.floor(n));
  if (state.scrap < cost) return false;
  state.scrap -= cost;
  state.scrapSpent += cost;
  return true;
}

/** 三选一重抽。当前三张仍在池里，尽量避开刚才那三张。 */
export function rerollMods(state: RunState): boolean {
  if (state.phase !== 'picking' || isRosterPicking(state)) return false;
  if (state.modPool.length <= 1) return false;
  if (state.freeRerollsLeft > 0) state.freeRerollsLeft -= 1;
  else if (!spendScrap(state, REROLL_COST)) return false;
  const avoid = new Set(
    state.pendingOptions.filter((o) => o.kind === 'mod').map((o) => o.modId),
  );
  const next = modOptionsAvoiding(state, avoid);
  state.pendingOptions = next.length > 0 ? next : modOptions(state);
  return true;
}

function modOptionsAvoiding(state: RunState, avoid: ReadonlySet<string>): PickOption[] {
  const saved = state.modPool;
  const filtered = saved.filter((m) => !avoid.has(m.id));
  if (filtered.length < 2) return modOptions(state);
  state.modPool = filtered;
  const out = modOptions(state);
  state.modPool = saved;
  return out;
}

/** 拆掉某人一件，退回本局池，腾出槽。 */
export function stripMod(state: RunState, heroId: string, modIndex: number): boolean {
  // 从前拆件是波间那 1.5 秒的活儿。连续战场没有波间了，所以放到打着的时候
  // 也能拆 —— 跟调队列一个口径，都是场上不断但玩家随时能动的手
  if (state.phase !== 'installing' && state.phase !== 'fighting') return false;
  const hero = state.team.find((h) => h.def.id === heroId);
  if (!hero) return false;
  const mod = hero.mods[modIndex];
  if (!mod) return false;
  if (!spendScrap(state, STRIP_COST)) return false;
  hero.mods.splice(modIndex, 1);
  if (!state.modPool.some((m) => m.id === mod.id)) state.modPool.push(mod);
  refreshStats(hero);
  return true;
}

/** 谁还装得下。全队都满了时装配这一步要跳过，否则会卡死 */
export function installTargets(state: RunState): HeroUnit[] {
  return state.team.filter(canInstallOn);
}

function takeFromPool(state: RunState, except: ReadonlySet<string>): ModDef | undefined {
  const pool = shuffled(state.modPool.filter((m) => !except.has(m.id)), state.rng);
  return pool.find((m) => m.kind === 'pivot') ?? pool[0];
}

/** 首局广告：白送一件，点满三人后先装再开打 */
export function claimOpeningGift(state: RunState): ModDef | undefined {
  if (!isRosterPicking(state)) return undefined;
  const except = new Set([
    ...state.pinnedMods.map((m) => m.id),
    ...state.openingGifts.map((m) => m.id),
  ]);
  const pick = takeFromPool(state, except);
  if (!pick) return undefined;
  state.openingGifts.push(pick);
  return pick;
}

/** 翻废品站：从本局还没发出去的里面翻一件，下一手三选一必出 */
export function claimJunkyard(state: RunState): ModDef | undefined {
  const except = new Set([
    ...state.pinnedMods.map((m) => m.id),
    ...state.openingGifts.map((m) => m.id),
  ]);
  const pick = takeFromPool(state, except);
  if (!pick) return undefined;
  state.modPool = state.modPool.filter((m) => m.id !== pick.id);
  state.pinnedMods.push(pick);
  return pick;
}

// ── 出怪 ────────────────────────────────────────────────

interface ScheduledSpawn {
  atMs: number;
  proto: EnemyProto;
  wave: number;
}

/**
 * 把原型按本波曲线放大。
 *
 * 壳血跟血量曲线走，**但 flat 减免跟攻击曲线走**。
 *
 * flat 要对抗的是玩家靠改装件堆起来的单次伤害，而那最多也就 2 到 3 倍
 * （每人 3 件上限）。血量曲线到第 15 波是 4 倍，用它缩放这个减免会让壳
 * 越到后面越离谱：实测终局 flat 涨到 56 点，而三婶的溅射分摊只有 44 点，
 * 整条溅射流被壳吃干，通关率从 18.6% 崩到 2.6%。攻击曲线到终局约 2.3 倍，
 * 和玩家的成长同量级，壳才是「难打」而不是「打不动」。
 */
function scaledProto(
  proto: EnemyProto,
  hpMult: number,
  atkMult: number,
  spdMult: number,
  stripSplit: boolean,
): EnemyProto {
  const next: EnemyProto = {
    ...proto,
    hp: proto.hp * hpMult,
    atk: proto.atk * atkMult,
    speed: proto.speed * spdMult,
  };
  if (proto.shell) {
    next.shell = { hp: proto.shell.hp * hpMult, flat: proto.shell.flat * atkMult };
  }
  if (stripSplit) delete next.split;
  return next;
}

/**
 * 整局的出怪表，一次排完。
 *
 * 这是连续战场的核心改动：从前是每波单独排一张表、打完清场再排下一张，
 * 现在整局就是一条时间轴，每个刻度的怪按 `stageStartMs` 落在上面。
 * 所以上一批没清完，下一批照样按时进场 —— 压力会叠起来，
 * 而「打光了停一下再重开」那个断点消失了。
 *
 * 强度仍按各自所属的刻度缩放，编排一个字没动。
 */
function scheduleRun(state: RunState): ScheduledSpawn[] {
  const extraPct = ladderExtraPct(state.ladderLv);
  const stageMs = ladderStageMs(state.ladderLv, STAGE_MS);
  const camp = getStage(state.stageId);
  const out: ScheduledSpawn[] = [];
  let cursor = 0;
  for (let wave = state.waveFrom; wave <= state.lastWave; wave += 1) {
    const local = wave - state.waveFrom + 1;
    const beat = camp.beatMs > 0 ? camp.beatMs : stageMs;
    const base = camp.fullRun ? stageBeatStart(camp, local, stageMs) : cursor;
    const list = scheduleWave(
      wave,
      state.stageHpMul,
      state.stageAtkMul,
      state.stageSpdMul,
      state.stripSplit,
      state.packExtra,
    );
    let last = 0;
    for (const sp of list) {
      out.push({ atMs: base + sp.atMs, proto: sp.proto, wave });
      if (sp.atMs > last) last = sp.atMs;
    }
    if (extraPct > 0) {
      // 难度阶梯第一档「又来一队」：半程处再来一小队同样的怪。
      // 动的是编排而不是每只怪的血量 —— 玩家要换的是打法，不是数值
      const n = Math.round((list.length * extraPct) / 100);
      for (let i = 0; i < n; i += 1) {
        const sp = list[i];
        if (sp) out.push({ atMs: base + beat * 0.5 + sp.atMs, proto: sp.proto, wave });
      }
    }
    if (!camp.fullRun) {
      // 短关仍连续出兵，但不让三波在路上合成一坨。
      // 空场还是 EMPTY_PULL，打得快不会对着空气发呆。
      const gap = Math.max(WAVE_HANDOFF_MS, Math.round(beat * 0.5));
      cursor = base + last + gap;
    }
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

function scheduleWave(
  wave: number,
  hpMul: number,
  atkMul: number,
  spdMul: number,
  stripSplit: boolean,
  packExtra: number,
): ScheduledSpawn[] {
  const def = getWave(wave);
  const hpMult = waveHpMult(wave) * hpMul;
  const atkMult = waveAtkMult(wave) * atkMul;
  const out: ScheduledSpawn[] = [];
  for (const group of def.spawns) {
    const proto = getEnemyProto(group.enemyId);
    const count = Math.max(1, Math.round(group.count * (1 + packExtra)));
    for (let i = 0; i < count; i += 1) {
      out.push({
        atMs: group.delayMs + i * group.intervalMs,
        proto: scaledProto(proto, hpMult, atkMult, spdMul, stripSplit),
        wave,
      });
    }
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** 每波的出怪表在进入战斗时生成，随状态走，便于逐帧驱动 */
const scheduleCache = new WeakMap<RunState, { list: ScheduledSpawn[]; idx: number }>();

// ── 生命周期 ────────────────────────────────────────────

/** 局外那几条养成线伸进这一局的全部东西。位置参数已经排满了，新的都走这里 */
export interface RunMeta {
  /** 门路研发等级。摊成每件的星级和抽取份量 */
  laneLv?: LaneLevels;
  /** 村里点好带出村的那件。进场直接焊，不占三选一 */
  carryModId?: string;
}

export function createRun(
  seed: number,
  startingScrap = 0,
  carrySource: RewardSource = 'ad',
  pinModId = '',
  unlockedMods?: readonly string[],
  heroIds?: readonly string[],
  giftModId = '',
  ladderLv = 0,
  stageId = CALIBRATE_STAGE_ID,
  growth: RunGrowth = DEFAULT_RUN_GROWTH,
  meta: RunMeta = {},
): RunState {
  const rng = makeRng(seed);
  const start = Math.max(0, Math.floor(startingScrap));
  const camp = getStage(stageId);
  const lanes = clampLanes(meta.laneLv);
  const stars = clampModStars(starsFromLanes(lanes));
  const pool = availableMods(unlockedMods).map((m) => masteredMod(m, stars[m.id] ?? 0));
  if (pinModId && !pool.some((m) => m.id === pinModId)) {
    const extra = MODS.find((m) => m.id === pinModId);
    if (extra) pool.push(masteredMod(extra, stars[extra.id] ?? 0));
  }
  const state: RunState = {
    seed,
    ladderLv: Math.max(0, Math.min(LADDER_TOP, Math.floor(ladderLv))),
    stageId: camp.id,
    lastWave: camp.waveTo,
    waveFrom: camp.waveFrom,
    packExtra: camp.packExtra,
    stageHpMul: camp.hpMul,
    stageAtkMul: camp.atkMul,
    stageSpdMul: camp.spdMul,
    stripSplit: camp.stripSplit,
    phase: 'picking',
    wave: camp.waveFrom,
    team: [],
    enemies: [],
    pets: [],
    picks: [],
    pendingOptions: [],
    openingGifts: [],
    pinnedMods: [],
    modPool: shuffled(pool, rng),
    scrap: start,
    scrapEarned: start,
    scrapSpent: 0,
    scrapLog: start > 0 ? [{ amount: start, source: carrySource }] : [],
    scrapFrac: 0,
    exp: 0,
    level: 0,
    growth,
    freeRerollsLeft: growth.freeRerolls,
    luckLeft: growth.luckPicks,
    freeRevivesLeft: growth.freeRevives,
    modStars: stars,
    laneDraw: drawMulFromLanes(lanes),
    waveElapsedMs: 0,
    streamEndMs: 0,
    jamMs: 0,
    totalMs: 0,
    events: [],
    stats: emptyStats(),
    rng,
    nextEnemyId: 1,
    nextPetId: 1,
  };
  if (pinModId) {
    const pinned = state.modPool.find((m) => m.id === pinModId);
    if (pinned) {
      state.modPool = state.modPool.filter((m) => m.id !== pinModId);
      state.pinnedMods.push(pinned);
    }
  }
  // 携带位买了才生效。带出去的那件按 carryStars 再白升几星，这是携带位第二级买的东西
  const carryId = meta.carryModId ?? '';
  if (carryId) {
    const carried = state.modPool.find((m) => m.id === carryId);
    const lift = Math.min(MOD_STAR_MAX, (stars[carryId] ?? 0) + growth.carryStars);
    if (carried) {
      state.modPool = state.modPool.filter((m) => m.id !== carryId);
      state.openingGifts.push(growth.carryStars > 0 ? masteredMod(getMod(carryId), lift) : carried);
    }
  }
  if (giftModId && giftModId !== carryId) {
    const gift = state.modPool.find((m) => m.id === giftModId)
      ?? masteredMod(getMod(giftModId), stars[giftModId] ?? 0);
    state.modPool = state.modPool.filter((m) => m.id !== gift.id);
    state.openingGifts.push(gift);
  }
  const squad = (heroIds ?? [])
    .filter((id, i, all) => HEROES.some((h) => h.id === id) && all.indexOf(id) === i)
    .slice(0, MAX_TEAM_SIZE);
  if (squad.length >= MAX_TEAM_SIZE) {
    for (const id of squad) addHero(state, id);
    launchSquad(state, true);
    return state;
  }
  // 测试 / 模拟仍可走点人；真玩在村子里点齐再进场
  state.pendingOptions = rosterOptions();
  return state;
}

/**
 * 玩家（或模拟策略）选定一张牌。
 *
 * 开局点村民是勾选：再点一下取消，点满 3 个先焊第一件再打。
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
      state.pendingOptions = [];
      launchSquad(state);
    }
    return;
  }

  state.picks.push(option.kind);
  state.pendingOptions = [];

  // 一定要从池子里取那一份：池里的是带星的，getMod 拿回来的是白板。
  // 拿错了，村里研发出来的星就在焊上的那一刻悄悄丢掉
  const mod = state.modPool.find((m) => m.id === option.modId)
    ?? masteredMod(getMod(option.modId), state.modStars[option.modId] ?? 0);
  state.modPool = state.modPool.filter((m) => m.id !== mod.id);
  if (installTargets(state).length === 0) {
    // 全员改装位已满，这件只能作废，接着打而不是卡在装配阶段
    resumeFight(state);
    return;
  }
  state.pendingMod = mod;
  state.phase = 'installing';
}

function bestGiftTarget(state: RunState, mod: ModDef): HeroUnit | undefined {
  const targets = installTargets(state);
  if (targets.length === 0) return undefined;
  const front = [...targets].sort((a, b) => a.slot - b.slot)[0];
  const melee = [...targets].sort((a, b) => a.stats.range - b.stats.range)[0];
  const ranged = [...targets].sort((a, b) => b.stats.range - a.stats.range)[0];
  switch (mod.effect.kind) {
    case 'rangeUp':
      return melee;
    case 'splash':
    case 'pierce':
      return ranged;
    default:
      return front;
  }
}

/** 开场那几件直接焊上最能吃的人，进场不再多点一次 */
function applyOpeningGifts(state: RunState): number {
  const gifts = state.openingGifts;
  state.openingGifts = [];
  let done = 0;
  for (const gift of gifts) {
    state.modPool = state.modPool.filter((m) => m.id !== gift.id);
    const target = bestGiftTarget(state, gift);
    if (!target) continue;
    target.mods.push(gift);
    refreshStats(target);
    emit(state, { kind: 'install', heroId: target.def.id, modId: gift.id });
    done += 1;
  }
  return done;
}

/** 人齐了就开打。破烂等杀出经验再发，进场不要连选三轮 */
function launchSquad(state: RunState, keepOrder = false): void {
  if (!keepOrder) arrangeOpeningTeam(state);
  applyOpeningGifts(state);
  applyStartWelds(state);
  beginRun(state);
}

/** 养成买的「进场先焊」：随机焊，不指定哪件 */
function applyStartWelds(state: RunState): void {
  for (let i = 0; i < state.growth.startWelds; i += 1) {
    const targets = installTargets(state);
    if (targets.length === 0 || state.modPool.length === 0) return;
    const pick = state.modPool[Math.floor(state.rng() * state.modPool.length)];
    if (!pick) return;
    const target = bestGiftTarget(state, pick);
    if (!target) return;
    state.modPool = state.modPool.filter((m) => m.id !== pick.id);
    target.mods.push(pick);
    refreshStats(target);
    emit(state, { kind: 'install', heroId: target.def.id, modId: pick.id });
  }
}

/**
 * 开打。整局只走一次 —— 这是它和从前 `beginWave` 最大的区别。
 *
 * 从前每一波都会走一遍这里：清空战场、全员满血复活。那让 15 波变成
 * 15 场互不相干的小仗，每一波开头都像重开一局，也是玩家说「波次间重新开始
 * 很奇怪」的根源。现在整局只铺一次场，之后战场再也不断。
 */
function beginRun(state: RunState): void {
  for (const h of state.team) {
    refreshStats(h);
    h.hp = h.maxHp;
    h.alive = true;
    h.shield = 0;
    h.cdMs = 0;
    h.skillCdMs = 0;
    h.rageStacks = 0;
    h.usedRevive = false;
    h.summonCd = {};
    h.downMs = 0;
  }
  state.enemies = [];
  state.pets = [];
  state.waveElapsedMs = 0;
  state.jamMs = 0;
  const list = scheduleRun(state);
  scheduleCache.set(state, { list, idx: 0 });
  state.streamEndMs = list.length > 0 ? list[list.length - 1]!.atMs : 0;
  state.phase = 'fighting';
}

/**
 * 跨过一个推进刻度。
 *
 * **不清场、不满血、不动场上的怪。**刻度现在只做三件事：
 * 换一档强度曲线、给一点回血当作撑过来的回报、把那些「本波一次」的
 * 语义重新开一轮。玩家看到的是怪一直在来，只是越来越难。
 */
function advanceStage(state: RunState): void {
  state.wave += 1;
  state.waveElapsedMs = 0;
  for (const h of state.team) {
    // 撑过来的回报只有一小口血。回满就等于把「一波一场」搬回来了
    if (h.alive) h.hp = Math.min(h.maxHp, h.hp + h.maxHp * (STAGE_HEAL_PCT / 100));
    // 摩托头盔的「一次」和越挨越猛的「叠加」原本挂在波次边界上。
    // 边界不再清场了，但这两样仍按刻度重新开一轮 —— 语义没变，
    // 变的只是它依附的东西从「一场仗」变成「一段路」
    h.usedRevive = false;
    h.rageStacks = 0;
  }
}

/**
 * 选完牌接着打，战场原样接上。
 *
 * 这个函数什么都不做 —— 而这正是重点：发牌由经验触发，随时可能落在
 * 打到一半的时候，选牌那几秒战场是冻住的，选完就该从冻住的地方接着走。
 * 它当初是为连续战场铺的地基，现在整局都是这个规矩了。
 */
function resumeFight(state: RunState): void {
  state.phase = 'fighting';
  // 选牌那几秒战场冻着。若刚好清完场，不把下一批抽过来，
  // 解冻后还要对着空场等到下一个 30 秒刻度
  tightenIfEmpty(state);
}

/**
 * 空场时把后面的出怪表往前抽，下一批很快就到。
 * 只动还没出的那些，已经在路上的时间点不动。
 */
function fieldQuiet(state: RunState): boolean {
  if (state.enemies.length === 0) return true;
  // 短关：剩一两只还在路上也把下一批抽来，空场发呆就是「一波一波」
  if (getStage(state.stageId).fullRun) return false;
  if (state.enemies.length > 2) return false;
  return state.enemies.every((e) => e.dist > 2.4);
}

function tightenIfEmpty(state: RunState): void {
  if (!fieldQuiet(state)) return;
  const sched = scheduleCache.get(state);
  if (!sched || sched.idx >= sched.list.length) return;
  const next = sched.list[sched.idx];
  if (!next) return;
  const wait = next.atMs - state.totalMs;
  if (wait <= EMPTY_PULL_MS) return;
  const shift = wait - EMPTY_PULL_MS;
  // 只抽下一批，后面的刻度仍按原表走。整表一起抽会把后面的休息全吃掉，难度崩
  for (let i = sched.idx; i < sched.list.length; i += 1) {
    const sp = sched.list[i];
    if (!sp || sp.wave !== next.wave) break;
    sp.atMs -= shift;
  }
  // 这批按第 N 波的曲线算，角标也该跟上；顺带给一口过刻度的血
  while (state.wave < next.wave && state.wave < state.lastWave) {
    advanceStage(state);
  }
}

/**
 * 给外星人结算一次伤害，返回**真正生效**的量（吸血和飘字都按这个数算）。
 *
 * 壳在时先削掉固定的 flat 点，剩下的先啃壳，啃穿了才溢出到血上。
 * 保底 1 点，所以再小的伤害也总能推进一点 —— 不做成完全免疫。
 */
export function damageEnemy(e: EnemyUnit, amount: number): number {
  const shell = e.proto.shell;
  if (!shell || e.shell <= 0) {
    e.hp -= amount;
    return amount;
  }
  const landed = Math.max(1, amount - shell.flat);
  const toShell = Math.min(e.shell, landed);
  e.shell -= toShell;
  e.hp -= landed - toShell;
  return landed;
}

/**
 * 母体碎了，补上几个小块。
 *
 * 位置按索引确定性地摊开，**不碰 state.rng** —— 动一下随机序列，
 * 所有既有 seed 的结果都会漂，回归基线就断了。
 */
function spawnShards(state: RunState, dead: EnemyUnit): void {
  const split = dead.proto.split;
  if (!split || dead.isShard) return;
  const hpPct = split.hpPct / 100;
  for (let i = 0; i < split.count; i += 1) {
    const proto: EnemyProto = {
      ...dead.proto,
      hp: dead.proto.hp * hpPct,
      atk: dead.proto.atk * (split.atkPct / 100),
      def: dead.proto.def * hpPct,
      // 碎块不重复结算：母体那份经验和废品已经给过了
      exp: 0,
      scrap: 0,
      split: undefined,
    };
    const spread = (i - (split.count - 1) / 2) * 0.32;
    state.enemies.push({
      id: state.nextEnemyId++,
      proto,
      hp: proto.hp,
      maxHp: proto.hp,
      atk: proto.atk,
      dist: Math.min(SPAWN_DIST, Math.max(REAR_POS - MELEE_REACH, dead.dist + spread)),
      cdMs: proto.attackIntervalMs,
      slowMs: dead.slowMs,
      slowPct: dead.slowPct,
      shell: 0,
      isShard: true,
    });
  }
}

/** 打死一个外星人的结算：经验进条，废品掉地上。返回真掉出来的整数废品 */
function grantKill(state: RunState, proto: EnemyProto): number {
  state.exp += proto.exp;
  state.scrapFrac += proto.scrap;
  if (state.scrapFrac < 1) return 0;
  const whole = Math.floor(state.scrapFrac);
  state.scrapFrac -= whole;
  addScrap(state, whole, 'free');
  return whole;
}

/**
 * 攒够经验就当场发牌。一次 tick 可能跨多档，所以只升一级，
 * 余下的经验留着，下一帧再升 —— 玩家会连着选两次，而不是白吃一档。
 */
function tryLevelUp(state: RunState): void {
  const need = pickNeed(state.level, state.growth.expPct);
  if (need === undefined || state.exp < need) return;
  state.level += 1;
  // 全队改装位已满或池子空了：级照升，但没有牌可发，不能卡在 picking
  if (installTargets(state).length === 0) return;
  const options = buildOptions(state);
  if (options.length === 0) return;
  state.pendingOptions = options;
  state.phase = 'picking';
}

/** 时间轴放完、场上也清空了才算赢。没有「打完这一波」这个中间事件了 */
function finishRun(state: RunState): void {
  state.wave = state.lastWave;
  state.phase = 'won';
}

/**
 * GM：跳过当前刻度。
 * 还有下一波 → 清掉场上这波、时间跳到下一波门口；已是末波 → 通关。
 */
export function gmSkipWave(state: RunState): string {
  if (state.phase === 'won' || state.phase === 'lost') return '战斗已结束';
  if (state.team.length === 0) return '先点齐三人';

  if (state.phase === 'picking' || state.phase === 'installing') {
    state.pendingOptions = [];
    state.pendingMod = undefined;
    if (!scheduleCache.get(state)) launchSquad(state, true);
    else state.phase = 'fighting';
  }

  const from = state.wave;
  const sched = scheduleCache.get(state);
  state.enemies = [];
  state.jamMs = 0;

  if (from >= state.lastWave) {
    finishRun(state);
    return `已通关 · 第 ${from} 波`;
  }

  if (sched) {
    while (sched.idx < sched.list.length && (sched.list[sched.idx]?.wave ?? 0) <= from) {
      sched.idx += 1;
    }
    const next = sched.list[sched.idx];
    if (next) state.totalMs = Math.max(state.totalMs, next.atMs);
  }

  if (!sched || sched.idx >= sched.list.length) {
    finishRun(state);
    return `已通关 · 第 ${from} 波`;
  }

  while (state.wave < from + 1 && state.wave < state.lastWave) {
    advanceStage(state);
  }
  return `已跳过第 ${from} 波 → 第 ${state.wave}/${state.lastWave} 波`;
}

function lose(state: RunState, reason: LoseReason): void {
  state.phase = 'lost';
  state.loseReason = reason;
}

/**
 * 队灭后看广告就地站起：半血、继续当前波、怪还在。
 * 只接受 wipe，推不动不能靠广告硬过 DPS 墙。
 */
export function reviveAfterWipe(state: RunState): boolean {
  if (state.phase !== 'lost' || state.loseReason !== 'wipe') return false;
  if (state.team.length === 0) return false;
  for (const h of state.team) {
    refreshStats(h);
    h.hp = Math.max(1, h.maxHp * 0.5);
    h.alive = true;
    h.shield = 0;
    h.cdMs = 0;
    emit(state, { kind: 'heroRevive', heroId: h.def.id });
  }
  state.loseReason = undefined;
  // 站起来时场上那堆怪还在。不给豁免就会下一帧又判「推不动」，广告白看
  state.jamMs = -REVIVE_GRACE_MS;
  state.phase = 'fighting';
  return true;
}

// ── 每帧 ────────────────────────────────────────────────

/**
 * 推进一个 TICK_MS。
 *
 * 渲染层按帧累积时间后调用，模拟层直接连续调用 —— 两者走的是同一段逻辑。
 */
export function tick(state: RunState): void {
  if (state.phase !== 'fighting') return;

  state.totalMs += TICK_MS;
  state.waveElapsedMs += TICK_MS;

  const sched = scheduleCache.get(state);
  if (!sched) {
    lose(state, 'wipe');
    return;
  }

  tightenIfEmpty(state);

  // 0. 刻度推进。时间到就走，**不看场上清没清完** —— 这就是连续战场
  const camp = getStage(state.stageId);
  if (camp.fullRun) {
    const stageMs = ladderStageMs(state.ladderLv, STAGE_MS);
    while (
      state.wave < state.lastWave
      && state.totalMs >= stageBeatStart(camp, state.wave - state.waveFrom + 2, stageMs)
    ) {
      advanceStage(state);
    }
  } else {
    // 短关：波次跟着出兵表走。下波第一只进场，计数 +1，场上上一波还在
    while (state.wave < state.lastWave) {
      const first = sched.list.find((sp) => sp.wave === state.wave + 1);
      if (!first || first.atMs > state.totalMs) break;
      advanceStage(state);
    }
  }

  // 1. 出怪。看的是整局时间轴，不是本波计时
  while (sched.idx < sched.list.length) {
    const next = sched.list[sched.idx];
    if (!next || next.atMs > state.totalMs) break;
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
      shell: next.proto.shell?.hp ?? 0,
      isShard: false,
    });
    sched.idx += 1;
  }

  if (sched.idx >= sched.list.length) {
    // 最后一批出完，场上也清干净了：赢
    if (state.enemies.length === 0) {
      finishRun(state);
      return;
    }
    // 最后一批出完之后还站着，也算守住了。
    // 从前这里判「推不动」，于是「15 波全过来了，场上剩三个铁罐磨不动」
    // 会被判负 —— 实测这占了失败局的一半，玩家会觉得莫名其妙。
    // 村口的输赢标准是人有没有倒，不是场地扫没扫干净。
    const lastAt = sched.list[sched.list.length - 1]?.atMs ?? 0;
    if (state.totalMs > lastAt + CLEANUP_MS) {
      finishRun(state);
      return;
    }
  }

  // 1.5 躺着的人自己爬起来。没有「下一波全员满血」那个时机了，
  // 不给自愈就是倒一个少一个，一路只减不加
  for (const h of state.team) {
    if (h.alive) continue;
    h.downMs -= TICK_MS;
    if (h.downMs > 0) continue;
    h.alive = true;
    h.hp = Math.max(1, h.maxHp * (DOWN_RECOVER_HP_PCT / 100));
    h.shield = 0;
    h.cdMs = 0;
    h.downMs = 0;
    emit(state, { kind: 'heroRevive', heroId: h.def.id });
  }

  const living = state.team.filter((h) => h.alive);
  if (living.length === 0) {
    lose(state, 'wipe');
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

    const inRange = state.enemies.filter((e) => e.hp > 0 && heroCanReach(h, e.dist));
    if (inRange.length === 0) continue;
    inRange.sort((a, b) => a.dist - b.dist);

    h.cdMs = st.intervalMs / (1 + teamHaste / 100);

    const isCrit = st.critChance > 0 && state.rng() * 100 < st.critChance;
    let mult = st.heavyMult;
    if (h.slot === 0) mult *= st.frontMult;
    if (isCrit) mult *= st.critMult;
    if (st.ragePerHit > 0) mult *= 1 + (h.rageStacks * st.ragePerHit) / 100;

    const hit = (target: EnemyUnit, share: number, aoe?: boolean): void => {
      const raw = computeDamage({
        atk: st.atk,
        targetDef: target.proto.def,
        modMult: mult,
        targetDamageReductionPct: 0,
      }) * share;
      // 打出去的和打进去的是两回事：壳会削掉一截。飘字显示打进去的那个数，
      // 玩家才看得出「这一下没砸动」
      const dmg = damageEnemy(target, raw);
      const healed = st.lifestealPct > 0 ? dmg * (st.lifestealPct / 100) : 0;
      if (healed > 0) h.hp = Math.min(h.maxHp, h.hp + healed);
      emit(state, {
        kind: 'hit',
        heroId: h.def.id,
        enemyId: target.id,
        damage: dmg,
        crit: isCrit,
        heal: healed > 0 ? healed : undefined,
        aoe: aoe || undefined,
      });
      if (st.slowOnHit) {
        target.slowMs = st.slowOnHit.durationMs;
        target.slowPct = st.slowOnHit.slowPct;
      }
      if (target.hp <= 0) {
        emit(state, { kind: 'enemyDown', enemyId: target.id, scrap: grantKill(state, target.proto) });
      }
    };

    const primary = inRange[0];
    if (!primary) continue;
    hit(primary, 1);

    if (st.splash) {
      const sp = st.splash;
      for (const e of inRange) {
        if (e !== primary && e.hp > 0 && Math.abs(e.dist - primary.dist) <= sp.radius) {
          hit(e, sp.damagePct / 100, true);
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
          .filter((e) => e.hp > 0 && heroCanReach(h, e.dist))
          .sort((a, b) => a.dist - b.dist)[0];
        if (!next) break;
        hit(next, 1);
        chain += 1;
        if (next.hp > 0) break;
      }
    }
  }

  // 4. 小东西：该放的放出来，能咬的咬，够不着的往前冲
  for (const h of living) {
    for (const sm of h.stats.summons) {
      const left = (h.summonCd[sm.petId] ?? 0) - TICK_MS;
      if (left > 0) {
        h.summonCd[sm.petId] = left;
        continue;
      }
      // 冷却照走，满了就跳过这一轮。不然死一只立刻补一只，等于没有代价
      h.summonCd[sm.petId] = sm.everyMs;
      const mine = state.pets.filter((p) => p.ownerId === h.def.id && p.proto.id === sm.petId);
      const room = Math.min(sm.maxAlive - mine.length, PET_CAP - state.pets.length);
      for (let i = 0; i < room; i += 1) summonPet(state, h, sm, i);
    }
  }

  for (const p of state.pets) {
    if (p.hp <= 0) continue;
    p.cdMs -= TICK_MS;
    // 够得着的最近一个。和村民的判定一样，只是它站在 p.dist 而不是队列格上
    let prey: EnemyUnit | undefined;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      if (e.dist < p.dist || e.dist > p.dist + p.proto.range) continue;
      if (!prey || e.dist < prey.dist) prey = e;
    }
    if (prey) {
      if (p.cdMs <= 0) {
        p.cdMs = p.proto.attackIntervalMs;
        const bite = (target: EnemyUnit, share: number): void => {
          const dmg = damageEnemy(target, computeDamage({
            atk: p.atk,
            targetDef: target.proto.def,
            modMult: 1,
            targetDamageReductionPct: 0,
          }) * share);
          if (p.learned.lifestealPct > 0) {
            p.hp = Math.min(p.maxHp, p.hp + dmg * (p.learned.lifestealPct / 100));
          }
          if (p.learned.slowOnHit) {
            target.slowMs = p.learned.slowOnHit.durationMs;
            target.slowPct = p.learned.slowOnHit.slowPct;
          }
          // 功劳记在主人名下：归因必须落在「装给谁」，狗只是他的一部分
          emit(state, {
            kind: 'hit',
            heroId: p.ownerId,
            enemyId: target.id,
            damage: dmg,
            crit: false,
            byPet: p.id,
          });
          if (target.hp <= 0) {
            emit(state, { kind: 'enemyDown', enemyId: target.id, scrap: grantKill(state, target.proto) });
          }
        };
        bite(prey, 1);
        const sp = p.learned.splash;
        if (sp) {
          for (const e of state.enemies) {
            if (e === prey || e.hp <= 0) continue;
            if (Math.abs(e.dist - prey.dist) > sp.radius) continue;
            bite(e, sp.damagePct / 100);
          }
        }
      }
      continue;
    }
    p.dist = Math.min(PET_MAX_DIST, p.dist + p.proto.speed * (TICK_MS / 1000));
  }

  // 5. 外星人推进与攻击。够得着就打队首，够不着就往前走。
  const targets = state.team.filter((h) => h.alive);
  for (const e of state.enemies) {
    if (e.hp <= 0) continue;
    e.cdMs -= TICK_MS;
    if (e.slowMs > 0) e.slowMs -= TICK_MS;
    const slow = enemySlowPct(e);

    // 挡在前面的小东西先挨。这就是「撒了把鸡食」的全部价值 ——
    // 鸡自己几乎不输出，它值钱是因为那几下没落在村民身上。
    const shieldPet = petBlocking(e, state.pets);
    if (shieldPet) {
      if (e.cdMs <= 0) {
        e.cdMs = e.proto.attackIntervalMs * (1 + slow / 100);
        const dmg = computeDamage({
          atk: e.atk,
          targetDef: 0,
          modMult: 1,
          targetDamageReductionPct: 0,
        });
        shieldPet.hp -= dmg;
        emit(state, { kind: 'petHurt', petId: shieldPet.id, enemyId: e.id, damage: dmg });
        if (shieldPet.hp <= 0) emit(state, { kind: 'petDown', petId: shieldPet.id });
      }
      continue;
    }

    const victim = enemyVictim(e, targets);
    if (victim) {
      if (e.cdMs <= 0) {
        e.cdMs = e.proto.attackIntervalMs * (1 + slow / 100);
        const vst = victim.stats;
        const dmg = computeDamage({
          atk: e.proto.aim === 'back' ? e.atk * BACK_AIM_DAMAGE : e.atk,
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
          damageEnemy(e, reflect);
          if (e.hp <= 0) {
            emit(state, { kind: 'enemyDown', enemyId: e.id, scrap: grantKill(state, e.proto) });
          }
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
            victim.hp = 0;
            // 难度阶梯第三档「爬不起来」把这段躺着的时间拉长
            victim.downMs = DOWN_RECOVER_MS * ladderDownMult(state.ladderLv);
            emit(state, { kind: 'heroDown', heroId: victim.def.id });
          }
        }
      }
      continue;
    }

    const walk = state.wave >= WALK_HASTE_FROM_WAVE && state.wave <= WALK_HASTE_UNTIL_WAVE
      ? WALK_HASTE
      : 1;
    // 近了就扑上来。减速同时压住基础速度和这一段冲刺，所以「能拖住的」才有价值
    const rush = e.proto.rush && e.dist <= e.proto.rush.withinDist ? e.proto.rush.mult : 1;
    e.dist -= e.proto.speed * (1 - slow / 100) * (TICK_MS / 1000) * walk * rush;
    // 队尾后面还有一格缓冲，纯粹为了让「被打穿」在画面上看得见；
    // 真正的判负是全队倒下，不是位置。
    if (e.dist < REAR_POS - MELEE_REACH) e.dist = REAR_POS - MELEE_REACH;
  }

  // 6. 清理死的，该裂的补上碎块
  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const e = state.enemies[i];
    if (!e || e.hp > 0) continue;
    state.enemies.splice(i, 1);
    spawnShards(state, e);
  }
  for (let i = state.pets.length - 1; i >= 0; i -= 1) {
    if ((state.pets[i]?.hp ?? 0) <= 0) state.pets.splice(i, 1);
  }

  // 7. 判负：全队同时躺下，或者场上堆到推不动
  if (state.team.length > 0 && state.team.every((h) => !h.alive)) {
    lose(state, 'wipe');
    return;
  }
  // 堆积判定替代了原来的单波超时 —— 连续制下已经没有「单波」可超时了。
  // 判的是场上堆积，不是漏怪：外星人走到队尾就停住，既没有防线血条也不扣血
  if (state.enemies.length >= JAM_COUNT) {
    state.jamMs += TICK_MS;
    if (state.jamMs >= JAM_MS) {
      lose(state, 'timeout');
      return;
    }
  } else if (state.jamMs > 0) {
    // 清下去一点就往回退，但退得比涨得慢：清出一口气不该直接抹掉整段窘境
    state.jamMs = Math.max(0, state.jamMs - TICK_MS * 2);
  } else if (state.jamMs < 0) {
    state.jamMs = Math.min(0, state.jamMs + TICK_MS);
  }

  // 8. 这一帧杀出来的经验够不够升级。放在判负之后：死了就不发牌了
  tryLevelUp(state);
}

export { TEAM_SIZE, MOD_SLOTS_PER_HERO };
