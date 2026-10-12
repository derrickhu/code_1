/**
 * 战斗引擎：3 路 × 4 格的分路自动塔防。
 *
 * **这是战斗规则的唯一真源。** 渲染层（BattleScene）和模拟器（formulas/simulate）
 * 都驱动同一个 `tick`，不许任何一边自己算一套 —— 否则护栏测的就不是真代码。
 * 村民「打不打得到」只走 `@/game/reach`。
 * 怪物怎么走只走 `@/game/march`，停哪 / 挥不挥刀只走 `@/game/foeEngage`。
 *
 * 失败是漏怪到底线、超时，或人倒光了还算清完。怪清完必须还有人站着，
 * 倒光了不算守住。人先倒、怪还在路上的，仍走到漏怪再判。三件事必须让
 * 「谁放哪一格」真的有后果，否则布阵就是假决策：
 *
 * 1. **阻挡几何**：地面怪被这一路上最靠前的活人挡住，走到自己射程里才停、才开打。
 *    空格不挡。所以谁站最前决定谁先挨，这是布阵最直接的一笔。
 * 2. **飞碟点后排**：飞的不被阻挡，而且专挑这一路**最后排**的人打。
 *    把脆皮塞到后面躲刀，遇到飞碟章就是送 —— 后排不是安全区。
 * 3. **空路直接漏**：一列没人挡就是一列通天。打/修能支援邻列，
 *    但挡不住 —— 邻列没挨，怪照样走到底线。
 *
 * 引擎是**确定性**的：同样的布阵和关卡，结果永远一样。
 * 不掺随机是因为护栏要能断言「换个排法通关率差 20 个点」这种事，
 * 随机会把信号埋进噪声里。变化量交给布阵和养成，不交给骰子。
 */
import {
  ARMOR_K, BOSS_ATK_MUL, BOSS_LEAK, BOSS_SPD_MUL, CELL_COUNT,
  EARLY_CALL_MS, EARLY_WEAK, ELITE_ATK_MUL, ELITE_SPD_MUL, FOE_ATK_MUL, FOE_CAP, FOE_SPD_MUL,
  GATE_WARN_MS, GOAL_POS, HARD_FOE_CC, HEAL_ATK_CUT, HEAL_MUL,
  LANE_COUNT, LAST_LINE_BOSS_CUT, LAST_LINE_PUSH, LEAK_ALLOW, RAGE_BONUS, SKILL_NEAR, SKILL_NEAR_SIDE,
  SLOW_MS, SLOW_MUL, SURGE_WARN_MS, SWARM_K, TICK_MS, VIS_ENGAGE_POS, WAVE_GAP_MS,
  cellPos, posFromVisualGap,
} from '@/balance/combat';
import {
  DEPLOY_ENERGY, ENERGY_ACT_PER_S, ENERGY_HIT, ENERGY_MAX, ENERGY_PER_S, ENERGY_START, SKILL_EXECUTE, SKILL_WAIT_MS,
  chargeMul, skillAt, skillPow, skillPower, type SkillDef,
} from '@/balance/skills';
import {
  getEnemy, rateStars, unitWeight,
  type EnemyDef, type SpawnGroup, type StageDef, type Stars,
} from '@/balance/stages';
import {
  EVO_MAX, VILLAGERS, evoKindOf, evoPowOf, laneMul, statsOf,
  type EvoKind, type Role, type VillagerDef,
} from '@/balance/villagers';
import {
  AD_GOLD_FROM_STAGE, AUTO_DEPLOY_MS, AUTO_GADGET_MS, AUTO_WELD_MS, BATTERY_INTERVAL, BIG_GOLD_MUL,
  BLOWER_PIERCE, BOOSTS,
  CELL_BOSS, CELL_CLEAN, CELL_ELITE, CELL_EVERY, CELL_TTL_MS, CRACKER_GRUNTS, DANCE_HASTE, DANCE_MS,
  EXTRA_SEATS, FEAST_TIER, GADGET_MAX, GADGET_TIER, GOLD_FROM_STAGE, GOLD_PITY_STEP, GUEST_MAX, GUEST_TIER, HORN_STUN_MS,
  KICKER_N, KICKER_R, KICKER_SPLASH, MARKET_TIER, OPENING_GUEST, OPENING_MOD_TARGET, OPENING_OFFER, OPENING_TIERS,
  REDEPLOY_FROM_STAGE, REROLL_COST, TIER_GOLD, TIER_POW, TIER_RARE, TIER_SCORE,
  TRACTOR_GRUNTS, TRACTOR_PUSH, WELD_MAX, WELD_MUL, WEIGHT_ATK, WOK_DEF, WOK_HP,
  boostDef, deployCost, modCap, weldCostOf,
  type BoostId, type GadgetId, type ModId, type Tier,
} from '@/balance/boosts';
import { foeCanSwing, foeHaltPos, foeTarget } from '@/game/foeEngage';
import { marchStep } from '@/game/march';
import { canReach } from '@/game/reach';

export { blockerFor, foeCanSwing, foeHaltPos, foeInRange, foeTarget, sniperTarget } from '@/game/foeEngage';

/** 进化打法的数字。护栏红了先砍这里，不改几何、不加新系统 */
const PIERCE_MUL = 0.28;
const CLEAVE_MUL = 0.22;
const CLEAVE_MAX = 3;
const REGEN_MS = 2000;
const REGEN_PCT = 0.012;
const STAND_HP = 0.3;
const REFLECT_MUL = 0.1;
const LIFESTEAL_MUL = 0.12;
const BURST_HP = 0.45;
const BURST_ATK = 0.85;
const BURST_RANGE = 1.4;
const SLOW_HARD_MUL = 1.2;
const HASTE_MUL = 0.96;
const ALL_HEAL_CUT = 0.35;

/**
 * 外星人机制的数字。和上面那批一样：护栏红了先砍这里，不改几何。
 *
 * 三个上限（CAP）不是保险丝，是设计红线。光环能叠满就会出现
 * 「这一波怎么打都打不动」的场面，而玩家在开战前根本看不出来 ——
 * 那正是 §6 第 4 条禁止的「被克了就没办法」。
 */
const AURA_SHIELD_CAP = 0.5;
const AURA_ATK_CAP = 0.6;
const AURA_DIM_CAP = 0.5;
/** 破壳线：血掉到一半，护甲清零、速度翻倍 */
const CRACK_HP = 0.5;
const CRACK_SPD = 2;
/** 下的蛋落在自己身后一点，不和自己叠在一个点上 */
const HATCH_BACK = 0.3;

/* ---------------- 状态 ---------------- */

/** 一个村民在战场上的位置与形态。布阵阶段由玩家摆；开打后站着的人不挪，只能往空格增援 */
export interface Placement {
  villager: VillagerDef;
  /** 第几路 0..2 */
  lane: number;
  /** 第几格 0..3，0 最靠敌方 */
  cell: number;
  evoStage: number;
  stars: number;
  /** 手艺 1–10。有就按它算面板，没有就按视觉阶反推 */
  craft?: number;
}

/** 场上的村民 */
export interface Fighter {
  /** 场上唯一 id。同一个村民不会重复上场，但留着给渲染层做 key */
  uid: string;
  def: VillagerDef;
  lane: number;
  cell: number;
  pos: number;
  /** 几阶。渲染层按它换立绘，出手皮见 gear.handIdOf */
  evoStage: number;
  stars: number;
  craft?: number;
  hp: number;
  maxHp: number;
  atk: number;
  armor: number;
  range: number;
  interval: number;
  cd: number;
  alive: boolean;
  /** 三阶「倒下再爬」只用一次 */
  stoodUp: boolean;
  /** 血过线炸一圈只用一次 */
  burstUsed: boolean;
  regenCd: number;
  /** 打法效果倍率，见 evoPowOf。缺省 1 */
  evoPow?: number;
  /** 劲头 0..ENERGY_MAX，满了能放绝活 */
  energy: number;
  /** 满了之后憋了多久。憋过 SKILL_WAIT_MS 自动放就不挑了 */
  readyMs: number;
  /** 绝活给的「少挨几成」和剩余时间 */
  guardPct: number;
  guardMs: number;
  /** 绝活给的出手间隔倍率和剩余时间 */
  hasteMul: number;
  hasteMs: number;
  /** 这一局焊上去的家伙。只在本局有效 */
  mods?: ModId[];
  /** 焊件的劲儿，按卡的档次（boosts.TIER_POW）。没记就是普通 */
  modPow?: Partial<Record<ModId, number>>;
  /** 「乡亲路过」来帮这一关的，不算自己村里的人：倒了不扣星 */
  guest?: boolean;
  /** 倒下后又被送上去过一次 */
  again?: boolean;
  /** 这一局焊过一下了 */
  welded?: boolean;
}

/** 场上的外星人 */
export interface Foe {
  id: number;
  def: EnemyDef;
  lane: number;
  pos: number;
  hp: number;
  maxHp: number;
  atk: number;
  armor: number;
  cd: number;
  /** 减速剩余 ms，由「拦」位施加。`steady` 的怪身上永远是 0 */
  slowMs: number;
  alive: boolean;
  /** 走路速度。破壳之后会翻倍，所以不能直接读 def.spd */
  spd: number;
  /** 破壳过了没。只破一次 */
  cracked: boolean;
  /** 跳过挡路那一下用掉没 */
  leapt: boolean;
  /** 跳过去的是谁，之后不再被他挡 */
  skipUid?: string;
  /** 还能下几个蛋 */
  spawnLeft: number;
  spawnCd: number;
  /** 这一刻同路友军给的减伤 / 加攻。每 tick 重算，不累计 */
  shieldPct: number;
  atkPct: number;
  /** 被绝活定住的剩余 ms：不走也不打 */
  stunMs: number;
  /** 首领「大个子」 */
  boss: boolean;
  /** 小头目 */
  elite: boolean;
  /** 一窝里的一只，血和攻击都摊薄了 */
  swarm: boolean;
  /** 占几份预算（按血量）。数「这一路压了多少」、掉电池都按它，不按只数 */
  w: number;
  /** 砍中过村民没有。手感统计用 */
  swung: boolean;
}

/**
 * 战斗事件。渲染层消费它放特效和音效，引擎自己不看。
 *
 * 用数组而不是回调：模拟器一秒跑几千 tick，回调会把它拖慢，
 * 而且回调里的副作用会让「同样输入同样输出」这条不成立。
 */
export type BattleEvent =
  | { kind: 'hit'; uid: string; foeId: number; damage: number; killed: boolean }
  | { kind: 'foeHit'; foeId: number; uid: string; damage: number }
  | { kind: 'heal'; uid: string; targetUid: string; amount: number }
  | { kind: 'villagerDown'; uid: string }
  | { kind: 'villagerUp'; uid: string }
  | { kind: 'burst'; uid: string }
  | { kind: 'foeDown'; foeId: number; lane: number }
  | { kind: 'leak'; foeId: number; lane: number }
  | { kind: 'waveStart'; wave: number }
  | { kind: 'skill'; uid: string; manual: boolean }
  | { kind: 'skillHit'; uid: string; foeId: number; damage: number; killed: boolean; stun: boolean; push: boolean; slow: boolean }
  | { kind: 'bossIn'; foeId: number; lane: number }
  | { kind: 'eliteIn'; foeId: number; lane: number }
  /** 一大波 SURGE_WARN_MS 后到 */
  | { kind: 'surge'; wave: number }
  /** 这一路底线的拖拉机发动了。trigger 是冲到底线的那一只 */
  | { kind: 'lastLine'; lane: number; trigger: number }
  /** 再漏一只就输：全村急眼，劲头一下充满 */
  | { kind: 'rally' }
  | { kind: 'tap'; foeId: number; damage: number; killed: boolean; crit: boolean }
  | { kind: 'cellDrop'; dropId: number; lane: number; pos: number; n: number }
  | { kind: 'cellGet'; dropId: number; n: number; tapped: boolean }
  | { kind: 'clean'; n: number }
  | { kind: 'offer'; wave: number; big: boolean }
  | { kind: 'boost'; id: BoostId; uid?: string; tier: Tier; bonus: boolean }
  /** auto：托管替玩家做的 */
  | { kind: 'deploy'; uid: string; again: boolean; guest: boolean; auto: boolean }
  | { kind: 'weld'; uid: string; evo: number; auto: boolean }
  | { kind: 'gadget'; id: GadgetId; lane: number; auto: boolean; tier: Tier }
  | { kind: 'blast'; id: GadgetId; foeId: number; damage: number; killed: boolean };

/* ---------------- 局内层 ---------------- */

/** 地上的一节（一把）电池。没人点也会自己飞进来，只是慢一点 */
export interface CellDrop {
  id: number;
  lane: number;
  pos: number;
  n: number;
  ttlMs: number;
}

/** 三选一里的一张。焊件写着给谁，路过写着是谁 */
export interface OfferCard {
  id: BoostId;
  /** 普通 / 好货 / 压箱底 */
  tier: Tier;
  uid?: string;
  guest?: string;
}

export interface BoostOffer {
  cards: OfferCard[];
  /** 推荐第几张。托管、超时都按它选 */
  best: number;
  /** 推荐它的那句理由，挂在「推荐」底下 */
  why: string;
  /** 看一段白拿的那张压箱底。拿了或者这关不卖就是 undefined */
  bonus?: OfferCard;
  /** 还能拿几张。大礼包是 2 */
  left: number;
  big: boolean;
  rerolled: boolean;
  wave: number;
}

/**
 * 一局里的局内层：电池、三选一、增援、焊一下、家伙事。
 * 只活在这一局，不进存档。
 */
export interface RunBoost {
  /** 托管：没人动手时过一会儿替玩家做。动了手就是他自己的 */
  assist: boolean;
  /**
   * 托管怎么补人、怎么挑卡。真机永远是 smart。
   * dumb 只给护栏的负样本用：乱排的人开打后也不看路，按固定顺序往空格塞、闭眼拿第一张卡。
   * 不这么配，负样本就成了「开局乱排、开打后补得比谁都准」，量不出布阵值多少。
   */
  policy: 'smart' | 'dumb';
  /** 新手引导等玩家亲手做那一下时，先别替他做 */
  hold: { weld: boolean; deploy: boolean; gadget: boolean };
  cells: number;
  cellsGot: number;
  cellsTapped: number;
  drops: CellDrop[];
  nextDropId: number;
  kills: number;
  /** 按预算份数累计的击杀。一窝里的一只不到半份，掉电池按它数，拆窝不白送电池 */
  killW: number;
  /** 板凳上没上场的人 */
  reserve: Candidate[];
  /** 开打后最多站几个自己人（路过的不算） */
  seats: number;
  offer: BoostOffer | null;
  offerWave: number;
  offers: number;
  /** 大个子倒了，下一回三选一连拿两张 */
  bigNext: boolean;
  /** 上一波开始时漏了几个，用来认「这一波一个没漏」 */
  leakMark: number;
  picks: BoostId[];
  /** 拿到的每张卡什么档，和 picks 一一对应 */
  pickTiers: Tier[];
  gadgets: GadgetId[];
  /** 每件家伙事的劲儿，和 gadgets 一一对应 */
  gadgetPow: number[];
  /** 家伙事的档次，和 gadgets 一一对应。竖栏按它描边 */
  gadgetTier: Tier[];
  /** 连着几回三选一没见着压箱底，保底按它涨 */
  goldDry: number;
  /** 看一段白拿过几张 */
  bonusTaken: number;
  danceMs: number;
  deploys: number;
  welds: number;
  gadgetUses: number;
  rerolls: number;
  guests: number;
  /** 家伙事打的血，不算进平砍和绝活 */
  dmg: number;
  rng: number;
  waitWeld: number;
  waitDeploy: number;
  waitGadget: number;
  /** 托管正在替玩家动手。只在 assistTick 里为真，事件靠它分清是谁做的 */
  byAssist: boolean;
}

export type BattlePhase = 'placing' | 'fighting' | 'won' | 'lost';
export type LoseReason = 'leak' | 'timeout' | 'wipe';

export interface BattleState {
  stage: StageDef;
  phase: BattlePhase;
  /** 全村民面板的公共乘数，来自村庄等级 */
  villageMul: number;
  /** 布阵阶段的候选池（手上所有人），开打后不再用 */
  bench: Candidate[];
  /** 这一局最多上几个人 */
  cap: number;
  /** 已摆好的位置。布阵阶段可改，开打后锁 */
  placed: Placement[];
  team: Fighter[];
  foes: Foe[];
  /** 出怪时间轴，按 atMs 排好 */
  schedule: Spawn[];
  /** 时间轴走到第几条 */
  spawnIdx: number;
  /** 已经放出来的最高波号，从 1 开始 */
  wave: number;
  /** 这一局还没被判负的漏怪。满 3 个就停 */
  leaked: number;
  /**
   * 看广告续命时从 leaked 里拿下来的。
   * 当场计数归零才能接着打，这些仍算进星级，不能当成一个没漏。
   */
  keptLeaks: number;
  elapsedMs: number;
  stars: Stars;
  loseReason?: LoseReason;
  events: BattleEvent[];
  /** 场上外星人 id 自增 */
  nextFoeId: number;
  /** 劲头满了自己放。关掉就只等玩家点 */
  autoSkill: boolean;
  /** 场上清空提前叫下一波省下的时间。星评和超时按 elapsedMs + skippedMs 算 */
  skippedMs: number;
  /** 手感统计：放出来几只、其中几只砍中过人、最惨的那个人掉到过几成、放了几次绝活 */
  spawned: number;
  touched: number;
  lowHpFrac: number;
  skillsCast: number;
  /** 绝活统计：普攻和绝活各打了多少血、绝活带走几只、每个村民放了几次（按村民 id） */
  plainDmg: number;
  skillDmg: number;
  skillKills: number;
  castsBy: Record<string, number>;
  /** 玩家亲手点了几发、打了多少血。模拟器不点，护栏测的是不点也能过 */
  taps: number;
  tapDmg: number;
  /** 局内层。关掉（单测纯机制时）就是 undefined */
  boost?: RunBoost;
  /** 每路底线那台拖拉机还在不在。一路一台、一关一次；关掉底线时全是 false */
  lastLine: boolean[];
  lastLineUsed: number;
  /** 「乡亲们急眼了」用过没。一关一次 */
  rallied: boolean;
  /** 每一波放出来的总血量，认「这一波打残了」 */
  waveHp: number[];
  /** 一大波喊到第几波了 */
  surgeTold: number;
  /** 压迫感统计：每 tick 场上几只的累计、空场 tick 数、最多同时几只、出过怪的路 */
  aliveSum: number;
  aliveTicks: number;
  emptyTicks: number;
  peakAlive: number;
  lanesHit: number;
}

export interface Candidate {
  villager: VillagerDef;
  evoStage: number;
  stars: number;
  craft?: number;
}

interface Spawn {
  atMs: number;
  lane: number;
  enemy: string;
  wave: number;
  boss: boolean;
  kind?: SpawnGroup['kind'];
}

/* ---------------- 建局 ---------------- */

function buildSchedule(stage: StageDef): Spawn[] {
  const out: Spawn[] = [];
  stage.waves.forEach((wave, w) => {
    const base = w * WAVE_GAP_MS;
    for (const g of wave.groups) {
      for (let k = 0; k < g.count; k += 1) {
        out.push({
          atMs: base + g.atMs + k * g.gapMs,
          lane: g.lane % LANE_COUNT,
          enemy: g.enemy,
          wave: w + 1,
          boss: g.boss === true,
          kind: g.kind,
        });
      }
    }
  });
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** 一只进场时多少血。出怪、认「这一波打残了」都按这一条算 */
function spawnHp(stage: StageDef, enemyId: string, s: Pick<Spawn, 'boss' | 'kind'>): number {
  return Math.round(getEnemy(enemyId).hp * stage.hpMul * unitWeight(s));
}

function waveHpOf(stage: StageDef, schedule: readonly Spawn[]): number[] {
  const out = new Array<number>(stage.waves.length).fill(0);
  for (const s of schedule) out[s.wave - 1]! += spawnHp(stage, s.enemy, s);
  return out;
}

/** 一窝里的一只按份数算，小头目、大个子顶三只封顶 —— 别让一个首领把全队都吸过去 */
function loadOf(boss: boolean, kind: SpawnGroup['kind']): number {
  if (boss) return 3;
  if (kind === 'elite') return 2;
  return kind === 'swarm' ? SWARM_K : 1;
}

/** 每条路总共要挡多少（按份数，不按只数）。场上的出怪口玩家看得见，这不是偷看 */
export function laneLoad(stage: StageDef): number[] {
  const load = new Array<number>(LANE_COUNT).fill(0);
  for (const w of stage.waves) {
    for (const g of w.groups) load[g.lane % LANE_COUNT]! += g.count * (g.kind === 'swarm' ? SWARM_K : 1);
  }
  return load;
}

/**
 * 开一局，落在布阵阶段。
 *
 * 布阵不给默认空阵：第一关必须预置一套能过的阵型，
 * 否则新手第一眼看到的是十二个空格子和一句「请布阵」，撞「十秒可懂」。
 */
export interface BattleOpts {
  /** 关掉局内层。只给单测纯机制用，真机和护栏都开着 */
  boosts?: boolean;
  /** 托管的补人挑卡策略，见 RunBoost.policy */
  policy?: 'smart' | 'dumb';
  /** 关掉底线拖拉机。只给单测纯机制（漏怪、续命）用 */
  lastLine?: boolean;
}

function newRunBoost(stage: StageDef, policy: 'smart' | 'dumb'): RunBoost {
  return {
    assist: true,
    policy,
    hold: { weld: false, deploy: false, gadget: false },
    cells: 0,
    cellsGot: 0,
    cellsTapped: 0,
    drops: [],
    nextDropId: 1,
    kills: 0,
    killW: 0,
    reserve: [],
    seats: 0,
    offer: null,
    offerWave: 1,
    offers: 0,
    bigNext: false,
    leakMark: 0,
    picks: [],
    pickTiers: [],
    gadgets: [],
    gadgetPow: [],
    gadgetTier: [],
    goldDry: 0,
    bonusTaken: 0,
    danceMs: 0,
    deploys: 0,
    welds: 0,
    gadgetUses: 0,
    rerolls: 0,
    guests: 0,
    dmg: 0,
    rng: (stage.id * 7919 + 17) | 0,
    waitWeld: 0,
    waitDeploy: 0,
    waitGadget: 0,
    byAssist: false,
  };
}

export function createBattle(
  stage: StageDef,
  bench: readonly Candidate[],
  cap: number,
  villageMul = 1,
  preset?: readonly Placement[],
  opts: BattleOpts = {},
): BattleState {
  const schedule = buildSchedule(stage);
  return {
    boost: opts.boosts === false ? undefined : newRunBoost(stage, opts.policy ?? 'smart'),
    lastLine: new Array<boolean>(LANE_COUNT).fill(opts.lastLine !== false),
    lastLineUsed: 0,
    rallied: false,
    waveHp: waveHpOf(stage, schedule),
    surgeTold: 0,
    aliveSum: 0,
    aliveTicks: 0,
    emptyTicks: 0,
    peakAlive: 0,
    lanesHit: 0,
    stage,
    phase: 'placing',
    villageMul,
    bench: [...bench],
    cap: Math.max(1, Math.min(LANE_COUNT * CELL_COUNT, Math.floor(cap))),
    placed: preset ? [...preset] : autoPlace(bench, stage, cap),
    team: [],
    foes: [],
    schedule,
    spawnIdx: 0,
    wave: 0,
    leaked: 0,
    keptLeaks: 0,
    elapsedMs: 0,
    stars: 0,
    events: [],
    nextFoeId: 1,
    autoSkill: true,
    skippedMs: 0,
    spawned: 0,
    touched: 0,
    lowHpFrac: 1,
    skillsCast: 0,
    plainDmg: 0,
    skillDmg: 0,
    skillKills: 0,
    castsBy: {},
    taps: 0,
    tapDmg: 0,
  };
}

export interface FieldHeroBind {
  uid: string;
  id: string;
  lane: string;
  evo: number;
}

/**
 * 贴图后到时该重绑谁。
 * 布阵阶段 team 还是空的，场上的人挂在 `pre:id`；只扫 team 会让晚到的立绘永远不贴。
 */
export function fieldHeroBinds(state: Pick<BattleState, 'phase' | 'team' | 'placed'>): FieldHeroBind[] {
  if (state.phase === 'placing') {
    return state.placed.map((p) => ({
      uid: `pre:${p.villager.id}`,
      id: p.villager.id,
      lane: p.villager.lane,
      evo: p.evoStage,
    }));
  }
  return state.team.map((f) => ({
    uid: f.uid,
    id: f.def.id,
    lane: f.def.lane,
    evo: f.evoStage,
  }));
}

function fighterOf(p: Placement, villageMul: number, i: number): Fighter {
  const s = statsOf(p.villager, p.evoStage, p.stars, villageMul, p.craft);
  return {
    uid: `${p.villager.id}#${i}`,
    def: p.villager,
    lane: p.lane,
    cell: p.cell,
    pos: cellPos(p.cell),
    evoStage: p.evoStage,
    stars: p.stars,
    craft: p.craft,
    hp: s.hp,
    maxHp: s.hp,
    atk: s.atk,
    armor: s.def,
    range: s.range,
    interval: s.interval,
    cd: 0,
    alive: true,
    stoodUp: false,
    burstUsed: false,
    regenCd: REGEN_MS,
    evoPow: evoPowOf(p.villager, p.evoStage),
    energy: ENERGY_START,
    readyMs: 0,
    guardPct: 0,
    guardMs: 0,
    hasteMul: 1,
    hasteMs: 0,
  };
}

/** 布阵定稿，开打。开打之后 placed 不再生效 */
export function startFight(state: BattleState): void {
  if (state.phase !== 'placing') return;
  state.team = state.placed.map((p, i) => fighterOf(p, state.villageMul, i));
  // 保温壶这类光环：只加速同一路。全场加速会把推图节奏抬得太快。
  const hastePow = new Map<number, number>();
  for (const f of state.team) {
    if (evoKindOf(f.def, f.evoStage) !== 'hasteAura') continue;
    hastePow.set(f.lane, Math.max(hastePow.get(f.lane) ?? 0, f.evoPow ?? 1));
  }
  for (const f of state.team) {
    const pow = hastePow.get(f.lane);
    if (pow) f.interval = Math.round(f.interval * (1 - (1 - HASTE_MUL) * pow));
  }
  const b = state.boost;
  if (b) {
    const on = new Set(state.placed.map((p) => p.villager.id));
    b.reserve = state.bench.filter((c) => !on.has(c.villager.id));
    b.seats = state.cap + EXTRA_SEATS;
  }
  state.phase = 'fighting';
}

/* ---------------- 布阵操作（渲染层调） ---------------- */

/** 这个人在场上吗 */
export function placedOf(state: BattleState, villagerId: string): Placement | undefined {
  return state.placed.find((p) => p.villager.id === villagerId);
}

export function cellTaken(state: BattleState, lane: number, cell: number): Placement | undefined {
  return state.placed.find((p) => p.lane === lane && p.cell === cell);
}

/**
 * 把候选池里的人放到某一格。
 *
 * 三条规则：格子占了就换人、这个人已经在场上就是挪位置、超过上场人数就放不下。
 * 返回 false 表示没动，渲染层据此播「放不下」的提示。
 */
export function placeAt(
  state: BattleState,
  villagerId: string,
  lane: number,
  cell: number,
): boolean {
  if (state.phase !== 'placing') return false;
  if (lane < 0 || lane >= LANE_COUNT || cell < 0 || cell >= CELL_COUNT) return false;
  const cand = state.bench.find((c) => c.villager.id === villagerId);
  if (!cand) return false;

  const mine = placedOf(state, villagerId);
  const sitting = cellTaken(state, lane, cell);
  if (sitting && sitting.villager.id === villagerId) return false;

  if (mine && sitting) {
    // 两个都在场上：换位
    const a = mine.lane; const b = mine.cell;
    mine.lane = lane; mine.cell = cell;
    sitting.lane = a; sitting.cell = b;
    return true;
  }
  if (mine) {
    mine.lane = lane; mine.cell = cell;
    return true;
  }
  if (sitting) {
    // 空位不够就顶掉原来那个
    sitting.villager = cand.villager;
    sitting.evoStage = cand.evoStage;
    sitting.stars = cand.stars;
    sitting.craft = cand.craft;
    return true;
  }
  if (state.placed.length >= state.cap) return false;
  state.placed.push({
    villager: cand.villager, lane, cell,
    evoStage: cand.evoStage, stars: cand.stars, craft: cand.craft,
  });
  return true;
}

/** 满员时往空格拖人，换下谁：同一路离得最近的；这一路没人就挑整盘最近的 */
export function bumpFor(state: BattleState, lane: number, cell: number): Placement | undefined {
  let best: Placement | undefined;
  let bestKey = Infinity;
  for (const p of state.placed) {
    const key = (p.lane === lane ? 0 : 100 + Math.abs(p.lane - lane) * 10) + Math.abs(p.cell - cell);
    if (key < bestKey) { bestKey = key; best = p; }
  }
  return best;
}

/** 把人撤下来 */
export function removeAt(state: BattleState, lane: number, cell: number): boolean {
  if (state.phase !== 'placing') return false;
  const i = state.placed.findIndex((p) => p.lane === lane && p.cell === cell);
  if (i < 0) return false;
  state.placed.splice(i, 1);
  return true;
}

/* ---------------- 目标选择 ---------------- */

/** 探照灯照的是这一路最前面那个。把人往后挪一格就照不到了 */
function frontOf(team: readonly Fighter[], lane: number): Fighter | undefined {
  let best: Fighter | undefined;
  for (const f of team) {
    if (!f.alive || f.lane !== lane) continue;
    if (!best || f.pos < best.pos) best = f;
  }
  return best;
}

/** 会不会出手。规则在 `@/game/reach`，这里不另写距离。 */
export function inFighterRange(f: Fighter, e: Foe): boolean {
  return canReach(f, e);
}

function reachGap(f: Fighter, e: Foe): number | undefined {
  if (!canReach(f, e)) return undefined;
  return Math.abs(e.lane - f.lane);
}

/** 村民打射程内最靠前的那只。本列优先于邻列 */
export function pickFoe(f: Fighter, foes: readonly Foe[]): Foe | undefined {
  let best: Foe | undefined;
  let bestSide = 99;
  for (const e of foes) {
    if (!e.alive) continue;
    const side = reachGap(f, e);
    if (side === undefined) continue;
    if (!best || side < bestSide || (side === bestSide && e.pos > best.pos)) {
      best = e;
      bestSide = side;
    }
  }
  return best;
}

/** 「修」位挑血量比例最低的队友 */
function pickHurt(team: readonly Fighter[], lane?: number): Fighter | undefined {
  let best: Fighter | undefined;
  for (const f of team) {
    if (!f.alive || f.hp >= f.maxHp) continue;
    if (lane !== undefined && f.lane !== lane) continue;
    if (!best || f.hp / f.maxHp < best.hp / best.maxHp) best = f;
  }
  return best;
}

function foesInRange(f: Fighter, foes: readonly Foe[]): Foe[] {
  const out: Foe[] = [];
  for (const e of foes) {
    if (!e.alive) continue;
    if (reachGap(f, e) === undefined) continue;
    out.push(e);
  }
  out.sort((a, b) => {
    const sa = Math.abs(a.lane - f.lane);
    const sb = Math.abs(b.lane - f.lane);
    if (sa !== sb) return sa - sb;
    return b.pos - a.pos;
  });
  return out;
}

function pickFoes(f: Fighter, foes: readonly Foe[], kind: EvoKind): { foe: Foe; mul: number }[] {
  const list = foesInRange(f, foes);
  if (list.length === 0) return [];
  const pow = f.evoPow ?? 1;
  let out: { foe: Foe; mul: number }[];
  if (kind === 'pierce') {
    const a = list[0]!;
    const b = list[1];
    out = b ? [{ foe: a, mul: 1 }, { foe: b, mul: PIERCE_MUL * pow }] : [{ foe: a, mul: 1 }];
  } else if (kind === 'cleave') {
    out = list.slice(0, CLEAVE_MAX).map((foe, i) => ({
      foe, mul: i === 0 ? 1 : CLEAVE_MUL * pow,
    }));
  } else {
    out = [{ foe: list[0]!, mul: 1 }];
  }
  // 鼓风机：一下打穿，后面那只也挨。本来就穿的取大的那一份，不叠两次。压箱底穿两只
  if (f.mods?.includes('m_blower') && list.length > 1) {
    const pow = f.modPow?.m_blower ?? 1;
    const mul = Math.min(1, BLOWER_PIERCE * pow);
    const deep = pow >= TIER_POW[2] ? 2 : 1;
    for (let k = 1; k <= deep && k < list.length; k += 1) {
      const at = out.findIndex((m) => m.foe === list[k]);
      if (at < 0) out.push({ foe: list[k]!, mul });
      else out[at]!.mul = Math.max(out[at]!.mul, mul);
    }
  }
  return out;
}

/** 二踢脚：打中的那只旁边再炸两只，只炸同一路 */
function kickerSplash(state: BattleState, f: Fighter, marks: readonly { foe: Foe }[], kind: EvoKind): void {
  const main = marks[0]?.foe;
  if (!main || !f.mods?.includes('m_kicker')) return;
  const hit = new Set(marks.map((m) => m.foe.id));
  const near = state.foes
    .filter((e) => e.alive && !hit.has(e.id) && e.lane === main.lane && Math.abs(e.pos - main.pos) <= KICKER_R)
    .sort((a, b) => Math.abs(a.pos - main.pos) - Math.abs(b.pos - main.pos))
    .slice(0, KICKER_N);
  const mul = Math.min(1, KICKER_SPLASH * (f.modPow?.m_kicker ?? 1));
  for (const e of near) strike(state, f, e, mul, kind);
}

function tickRegen(state: BattleState, f: Fighter, kind: EvoKind): void {
  if (kind !== 'regen' || f.hp >= f.maxHp) return;
  f.regenCd -= TICK_MS;
  if (f.regenCd > 0) return;
  f.regenCd = REGEN_MS;
  const amount = Math.max(1, Math.round(f.maxHp * REGEN_PCT * (f.evoPow ?? 1)));
  f.hp = Math.min(f.maxHp, f.hp + amount);
  state.events.push({ kind: 'heal', uid: f.uid, targetUid: f.uid, amount });
}

function tryHeal(state: BattleState, f: Fighter, kind: EvoKind, cdMul: number): boolean {
  if (kind === 'allHeal') {
    const hurts = state.team.filter((t) => t.alive && t.hp < t.maxHp);
    if (hurts.length === 0) return false;
    f.cd = f.interval * cdMul;
    for (const hurt of hurts) {
      const amount = Math.min(hurt.maxHp - hurt.hp, Math.round(f.atk * HEAL_MUL * ALL_HEAL_CUT));
      if (amount <= 0) continue;
      hurt.hp += amount;
      state.events.push({ kind: 'heal', uid: f.uid, targetUid: hurt.uid, amount });
    }
    return true;
  }
  const hurt = pickHurt(state.team, kind === 'laneHeal' ? f.lane : undefined);
  if (!hurt) return false;
  const amount = Math.min(hurt.maxHp - hurt.hp, Math.round(f.atk * HEAL_MUL));
  hurt.hp += amount;
  f.cd = f.interval * cdMul;
  state.events.push({ kind: 'heal', uid: f.uid, targetUid: hurt.uid, amount });
  return true;
}

function strike(state: BattleState, f: Fighter, foe: Foe, mul: number, kind: EvoKind): void {
  const raw = effAtk(f) * (f.def.role === 'heal' ? HEAL_ATK_CUT : 1) * mul;
  const damage = foeTake(foe, dmgOf(raw, foe.armor, laneMul(f.def.lane, foe.def.lane)));
  foe.hp -= damage;
  state.plainDmg += damage;
  const killed = foe.hp <= 0;
  state.events.push({ kind: 'hit', uid: f.uid, foeId: foe.id, damage, killed });
  if (killed) {
    downFoe(state, foe);
  } else if (kind === 'slowHard' && !foe.def.steady) {
    // 只有「钉死」这一阶才减速。拦位普攻再叠 hitstun，看起来像挨一下停一下
    foe.slowMs = Math.max(foe.slowMs, SLOW_MS * SLOW_HARD_MUL * (f.evoPow ?? 1));
  }
  if (kind !== 'lifesteal') return;
  const sink = f.def.role === 'heal' ? (pickHurt(state.team) ?? f) : f;
  const amount = Math.min(sink.maxHp - sink.hp, Math.round(damage * LIFESTEAL_MUL * (f.evoPow ?? 1)));
  if (amount <= 0) return;
  sink.hp += amount;
  state.events.push({ kind: 'heal', uid: f.uid, targetUid: sink.uid, amount });
}

function fireBurst(state: BattleState, f: Fighter): void {
  state.events.push({ kind: 'burst', uid: f.uid });
  for (const e of state.foes) {
    if (!e.alive || reachGap(f, e) === undefined) continue;
    if (Math.abs(f.pos - e.pos) > BURST_RANGE) continue;
    const damage = foeTake(e, dmgOf(f.atk * BURST_ATK * (f.evoPow ?? 1), e.armor, laneMul(f.def.lane, e.def.lane)));
    e.hp -= damage;
    const killed = e.hp <= 0;
    state.events.push({ kind: 'hit', uid: f.uid, foeId: e.id, damage, killed });
    if (killed) downFoe(state, e);
  }
}

function gainEnergy(f: Fighter, amount: number): void {
  f.energy = Math.min(ENERGY_MAX, f.energy + amount * chargeMul(f.stars));
}

/** 出手一次攒多少：按出手间隔折算，出手快的不会因此刷招 */
function actEnergy(f: Fighter): number {
  return (ENERGY_ACT_PER_S * f.interval) / 1000;
}

function hurtVillager(state: BattleState, target: Fighter, e: Foe, raw: number): void {
  const damage = target.guardMs > 0 ? Math.max(1, Math.round(raw * (1 - target.guardPct))) : raw;
  target.hp -= damage;
  gainEnergy(target, ENERGY_HIT);
  state.events.push({ kind: 'foeHit', foeId: e.id, uid: target.uid, damage });
  const kind = evoKindOf(target.def, target.evoStage);
  if (kind === 'reflect' && e.alive) {
    const back = foeTake(e, damage * REFLECT_MUL * (target.evoPow ?? 1));
    e.hp -= back;
    if (e.hp <= 0) downFoe(state, e);
  }
  if (kind === 'burst' && !target.burstUsed && target.hp / target.maxHp <= BURST_HP) {
    target.burstUsed = true;
    fireBurst(state, target);
  }
  if (target.hp > 0) return;
  if (kind === 'standUp' && !target.stoodUp) {
    target.stoodUp = true;
    target.hp = Math.max(1, Math.round(target.maxHp * STAND_HP));
    state.events.push({ kind: 'villagerUp', uid: target.uid });
    return;
  }
  target.alive = false;
  state.events.push({ kind: 'villagerDown', uid: target.uid });
}

/* ---------------- 数值 ---------------- */

export function dmgOf(atk: number, armor: number, mul: number): number {
  const soak = 1 - armor / (armor + ARMOR_K);
  return Math.max(1, Math.round(atk * mul * soak));
}

/** 「越挨越猛」：血越少打得越凶 */
export function effAtk(f: Fighter): number {
  if (f.def.lane !== 'rage') return f.atk;
  return f.atk * (1 + RAGE_BONUS * (1 - f.hp / f.maxHp));
}

/** 打在外星人身上的一下，先过一遍同路支援给的罩子 */
function foeTake(foe: Foe, raw: number): number {
  return Math.max(1, Math.round(raw * (1 - foe.shieldPct)));
}

/**
 * 把这一刻的光环算到每只怪身上，顺便返回每条路的「照住」强度。
 *
 * **先按路求和再减掉自己那一份**，不是两两相加：场上同时有三四十只怪，
 * O(n²) 会被模拟器跑护栏时放大成几百万次运算。
 */
function applyAuras(state: BattleState): number[] {
  const shield = new Array<number>(LANE_COUNT).fill(0);
  const atkUp = new Array<number>(LANE_COUNT).fill(0);
  const dim = new Array<number>(LANE_COUNT).fill(0);

  for (const e of state.foes) {
    const a = e.def.aura;
    if (!e.alive || !a) continue;
    if (a.kind === 'shield') shield[e.lane]! += a.pct;
    else if (a.kind === 'atk') atkUp[e.lane]! += a.pct;
    else dim[e.lane]! += a.pct;
  }

  for (const e of state.foes) {
    if (!e.alive) continue;
    const own = e.def.aura;
    // 光环不加给自己，支援怪必须能被单独点掉
    const s = shield[e.lane]! - (own?.kind === 'shield' ? own.pct : 0);
    const k = atkUp[e.lane]! - (own?.kind === 'atk' ? own.pct : 0);
    e.shieldPct = Math.min(AURA_SHIELD_CAP, Math.max(0, s));
    e.atkPct = Math.min(AURA_ATK_CAP, Math.max(0, k));
  }

  return dim.map((d) => Math.min(AURA_DIM_CAP, d));
}

/* ---------------- 主循环 ---------------- */

function lose(state: BattleState, reason: LoseReason): void {
  state.phase = 'lost';
  state.loseReason = reason;
  state.stars = 0;
}

/** 一只外星人的初始状态，还没吃关卡倍率。出怪、下蛋、测试都从这儿起 */
export function foeOf(def: EnemyDef, id: number, lane: number, pos = 0): Foe {
  return {
    id,
    def,
    lane,
    pos,
    hp: def.hp,
    maxHp: def.hp,
    atk: def.atk,
    armor: def.def,
    cd: 0,
    slowMs: 0,
    alive: true,
    spd: def.spd,
    cracked: false,
    leapt: false,
    spawnLeft: def.spawn?.times ?? 0,
    spawnCd: def.spawn?.everyMs ?? 0,
    shieldPct: 0,
    atkPct: 0,
    stunMs: 0,
    boss: false,
    elite: false,
    swarm: false,
    w: 1,
    swung: false,
  };
}

/**
 * 造一只进场的外星人。出怪时间轴和孵化器下的蛋走同一条，
 * 否则「蛋没吃到关卡倍率」这种 bug 要到第 30 章才看得出来。
 */
function newFoe(
  state: BattleState, enemyId: string, lane: number, pos = 0, boss = false, kind?: SpawnGroup['kind'],
): Foe {
  const def = getEnemy(enemyId);
  const foe = foeOf(def, state.nextFoeId, lane, pos);
  const elite = !boss && kind === 'elite';
  const swarm = !boss && kind === 'swarm';
  foe.hp = spawnHp(state.stage, enemyId, { boss, kind });
  foe.maxHp = foe.hp;
  const atkK = boss ? BOSS_ATK_MUL : elite ? ELITE_ATK_MUL : swarm ? SWARM_K : 1;
  foe.atk = def.atk * state.stage.atkMul * FOE_ATK_MUL * atkK;
  foe.spd = def.spd * FOE_SPD_MUL * (boss ? BOSS_SPD_MUL : elite ? ELITE_SPD_MUL : 1);
  foe.boss = boss;
  foe.elite = elite;
  foe.swarm = swarm;
  foe.w = unitWeight({ boss, kind });
  state.nextFoeId += 1;
  state.spawned += 1;
  return foe;
}

/* ---------------- 绝活 ---------------- */

/** 走到这儿就算贴到前排了 */
const CONTACT_POS = cellPos(0) - 0.8;

/**
 * 这只怪已经到人跟前了：走过贴脸线，或者已经停在挡路的人面前。
 * 近战怪停在前排脚前约 1 格，比贴脸线还靠外 —— 只看贴脸线的话，
 * 它们开打了定身招还在等，一整场都放不出来。
 */
function foeClose(state: BattleState, e: Foe): boolean {
  if (e.pos >= CONTACT_POS) return true;
  const halt = foeHaltPos(e, state.team);
  return halt !== undefined && e.pos + 0.05 >= halt;
}

/**
 * 往回顶几格，按视觉格算，和行军同一把尺。
 * 门口那段空场一格轴距画出来是六格，按轴顶的话停在前排脚前的大个子一招就被顶回门外，
 * 只剩射程最远的够得着，再爬十几秒才回来 —— 一关的最后一只能拖到超时。
 */
function pushBack(e: Foe, cells: number): void {
  e.pos = Math.max(0, posFromVisualGap(e.pos, cells));
}

function hasFoeEffect(sk: SkillDef): boolean {
  return Boolean(sk.dmg || sk.stunMs || sk.push || sk.slowMs);
}

function skillFoes(state: BattleState, f: Fighter, sk: SkillDef): Foe[] {
  if (!hasFoeEffect(sk)) return [];
  return state.foes.filter((e) => {
    if (!e.alive) return false;
    if (sk.scope === 'all') return true;
    if (sk.scope === 'lane') return e.lane === f.lane;
    if (sk.scope === 'reach') return canReach(f, e);
    if (e.lane === f.lane) {
      // 站后排也砸得到本路前排脚前的怪：从这一路最前面那个人往外量
      const front = frontOf(state.team, f.lane)?.pos ?? f.pos;
      return e.pos >= Math.min(f.pos, front) - SKILL_NEAR && e.pos <= f.pos + 0.6;
    }
    return Math.abs(e.lane - f.lane) === 1 && Math.abs(e.pos - f.pos) <= SKILL_NEAR_SIDE;
  });
}

export function skillAllies(state: BattleState, f: Fighter, sk: SkillDef): Fighter[] {
  if (!sk.ally) return [];
  return state.team.filter((t) => {
    if (!t.alive) return false;
    if (sk.ally === 'self') return t === f;
    if (sk.ally === 'lane') return t.lane === f.lane;
    return true;
  });
}

/**
 * 自动放的规矩：**稳，但不精**。用得上就放，不会攒着等首领、不会等一路挤满。
 * 一招有好几样效果的，哪一样用得上都算。
 * 满了憋过 SKILL_WAIT_MS 还没等到好时机，打得着什么就放什么 —— 憋一整场比放歪了更糟。
 * 手动的好处全在这儿 —— 挑时机，而不是数值加成。
 */
function skillWanted(state: BattleState, f: Fighter, sk: SkillDef): boolean {
  const foes = skillFoes(state, f, sk);
  // 定身、击退留到怪贴上来再用。半路上定住只会拖时间。
  // 整路的网和鸡例外：一窝挤在路上就是撒网的时候，等它们一只只贴上来早被前排打散了
  if ((sk.stunMs || sk.push) && foes.some((e) => foeClose(state, e))) return true;
  if ((sk.stunMs || sk.push) && sk.scope === 'lane' && foes.length >= 3) return true;
  // 伤害招等怪贴上来、或者够得着的攒成一堆再砸：一招砸一片才看得出是绝活
  if ((sk.dmg || sk.slowMs) && !(sk.stunMs || sk.push)
    && (foes.some((e) => foeClose(state, e)) || foes.length >= 3)) return true;
  const allies = skillAllies(state, f, sk);
  if (sk.heal && allies.some((t) => t.hp / t.maxHp < 0.7)) return true;
  if (sk.guard && allies.some((t) => t.hp / t.maxHp < 0.85)) return true;
  if (sk.haste && foesAlive(state) >= 3) return true;
  if (f.readyMs >= SKILL_WAIT_MS) return foes.length > 0 || (!hasFoeEffect(sk) && foesAlive(state) > 0);
  return false;
}

function fireSkill(state: BattleState, f: Fighter, manual: boolean): void {
  const sk = skillAt(f.def, f.evoStage);
  const pow = skillPow(f.evoStage);
  const power = skillPower(f.evoStage, f.stars);
  f.energy = 0;
  f.readyMs = 0;
  state.skillsCast += 1;
  state.castsBy[f.def.id] = (state.castsBy[f.def.id] ?? 0) + 1;
  state.events.push({ kind: 'skill', uid: f.uid, manual });

  for (const e of skillFoes(state, f, sk)) {
    let damage = 0;
    let killed = false;
    let hit = false;
    if (sk.dmg) {
      const raw = effAtk(f) * sk.dmg * power;
      damage = foeTake(e, dmgOf(raw, e.armor, laneMul(f.def.lane, e.def.lane)));
      e.hp -= damage;
      state.skillDmg += damage;
      hit = true;
      if (!e.boss && e.hp > 0 && e.hp < e.maxHp * SKILL_EXECUTE) e.hp = 0;
      killed = e.hp <= 0;
      if (killed) {
        state.skillKills += 1;
        state.events.push({
          kind: 'skillHit', uid: f.uid, foeId: e.id, damage, killed, stun: false, push: false, slow: false,
        });
        downFoe(state, e);
        continue;
      }
    }
    let slow = false;
    if (sk.slowMs && !e.def.steady) {
      e.slowMs = Math.max(e.slowMs, sk.slowMs * pow);
      slow = true;
    }
    // 自动放的定身、击退只落在已经到人跟前的怪身上。整路一起定，半路上的全被钉死，走不到人跟前
    let stun = false;
    let push = false;
    if (manual || foeClose(state, e) || !(sk.stunMs || sk.push)) {
      const cc = e.boss || e.def.steady ? HARD_FOE_CC : 1;
      if (sk.stunMs) {
        e.stunMs = Math.max(e.stunMs, sk.stunMs * pow * cc);
        stun = true;
      }
      if (sk.push) {
        pushBack(e, sk.push * pow * cc);
        push = true;
      }
    }
    if (hit || stun || push || slow) {
      state.events.push({
        kind: 'skillHit', uid: f.uid, foeId: e.id, damage, killed, stun, push, slow,
      });
    }
  }

  for (const t of skillAllies(state, f, sk)) {
    if (sk.heal) {
      const amount = Math.min(t.maxHp - t.hp, Math.round(f.atk * sk.heal * power));
      if (amount > 0) {
        t.hp += amount;
        state.events.push({ kind: 'heal', uid: f.uid, targetUid: t.uid, amount });
      }
    }
    if (sk.guard) {
      t.guardPct = Math.max(t.guardMs > 0 ? t.guardPct : 0, sk.guard);
      t.guardMs = Math.max(t.guardMs, (sk.buffMs ?? 0) * pow);
    }
    if (sk.haste) {
      t.hasteMul = Math.min(t.hasteMs > 0 ? t.hasteMul : 1, sk.haste);
      t.hasteMs = Math.max(t.hasteMs, (sk.buffMs ?? 0) * pow);
    }
  }
}

/** 这一刻放这个人的绝活能打着几只怪 */
export function skillTargets(state: BattleState, uid: string): number {
  const f = state.team.find((t) => t.uid === uid);
  if (!f || !f.alive) return 0;
  return skillFoes(state, f, skillAt(f.def, f.evoStage)).length;
}

/** 劲头满了吗 */
export function skillReady(f: Fighter): boolean {
  return f.alive && f.energy >= ENERGY_MAX;
}

/** 玩家点头像放绝活。劲头没满、人倒了、不在打都不放 */
export function castSkill(state: BattleState, uid: string): boolean {
  if (state.phase !== 'fighting') return false;
  const f = state.team.find((t) => t.uid === uid);
  if (!f || !skillReady(f)) return false;
  fireSkill(state, f, true);
  return true;
}

/**
 * 亲手弹一发：按这关一只小灰的血折算，第 1 章三下打死一只小灰。
 * 往后几章折得更低，点只是帮手，不能顶掉布阵和养成。
 */
const TAP_FRAC: readonly number[] = [0.36, 0.26, 0.2];
const TAP_FRAC_MIN = 0.15;
/** 每第几发是重的一下 */
const TAP_CRIT_EVERY = 5;
const TAP_CRIT_MUL = 2.5;
/** 小怪挨一下往回退一点，大个子和稳的不退 */
const TAP_PUSH = 0.04;

export function tapRaw(stage: StageDef): number {
  const frac = TAP_FRAC[stage.chapter - 1] ?? TAP_FRAC_MIN;
  return getEnemy('grunt').hp * stage.hpMul * frac;
}

/** 玩家点外星人。不在打、怪已经倒了都不算 */
export function playerShot(state: BattleState, foeId: number): boolean {
  if (state.phase !== 'fighting') return false;
  const e = state.foes.find((x) => x.id === foeId);
  if (!e || !e.alive) return false;
  state.taps += 1;
  const crit = state.taps % TAP_CRIT_EVERY === 0;
  const raw = tapRaw(state.stage) * (crit ? TAP_CRIT_MUL : 1);
  const damage = foeTake(e, dmgOf(raw, e.armor, 1));
  e.hp -= damage;
  state.tapDmg += damage;
  const killed = e.hp <= 0;
  if (!killed && !e.boss && !e.def.steady) e.pos = Math.max(0, e.pos - TAP_PUSH);
  state.events.push({ kind: 'tap', foeId: e.id, damage, killed, crit });
  if (killed) downFoe(state, e);
  return true;
}

/** 这一刻算下来的时间轴位置。星评、超时、时间条都按它 */
export function battleClockMs(state: Pick<BattleState, 'elapsedMs' | 'skippedMs'>): number {
  return state.elapsedMs + state.skippedMs;
}

/* ---------------- 局内层：电池 ---------------- */

/** 外星人倒下都走这一条，电池才不会漏掉哪一种死法 */
function downFoe(state: BattleState, e: Foe): void {
  e.alive = false;
  state.events.push({ kind: 'foeDown', foeId: e.id, lane: e.lane });
  const b = state.boost;
  if (!b) return;
  b.kills += 1;
  if (e.boss || e.elite) {
    b.bigNext = true;
    dropCell(state, e, e.boss ? CELL_BOSS : CELL_ELITE);
    return;
  }
  const before = Math.floor(b.killW / CELL_EVERY);
  b.killW += Math.min(1, e.w);
  if (b.kills === 1 || Math.floor(b.killW / CELL_EVERY) > before) dropCell(state, e, 1);
}

function dropCell(state: BattleState, e: Foe, n: number): void {
  const b = state.boost!;
  const d: CellDrop = { id: b.nextDropId, lane: e.lane, pos: e.pos, n, ttlMs: CELL_TTL_MS };
  b.nextDropId += 1;
  b.drops.push(d);
  state.events.push({ kind: 'cellDrop', dropId: d.id, lane: d.lane, pos: d.pos, n });
}

function takeCell(state: BattleState, i: number, tapped: boolean): void {
  const b = state.boost!;
  const d = b.drops[i]!;
  b.drops.splice(i, 1);
  b.cells += d.n;
  b.cellsGot += d.n;
  if (tapped) b.cellsTapped += d.n;
  state.events.push({ kind: 'cellGet', dropId: d.id, n: d.n, tapped });
}

function tickDrops(state: BattleState): void {
  const b = state.boost!;
  for (let i = b.drops.length - 1; i >= 0; i -= 1) {
    const d = b.drops[i]!;
    d.ttlMs -= TICK_MS;
    if (d.ttlMs <= 0) takeCell(state, i, false);
  }
}

/** 玩家点到地上的电池：马上到手 */
export function grabCell(state: BattleState, dropId: number): boolean {
  const b = state.boost;
  if (!b || state.phase !== 'fighting') return false;
  const i = b.drops.findIndex((d) => d.id === dropId);
  if (i < 0) return false;
  takeCell(state, i, true);
  return true;
}

/* ---------------- 局内层：三选一 ---------------- */

function boostRand(b: RunBoost): number {
  b.rng = (b.rng + 0x6d2b79f5) | 0;
  let t = b.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 每路还要挡多少：场上的加上时间轴里还没出来的 */
function lanePressure(state: BattleState): number[] {
  const out = new Array<number>(LANE_COUNT).fill(0);
  for (const e of state.foes) if (e.alive) out[e.lane]! += foeLoad(e);
  for (let i = state.spawnIdx; i < state.schedule.length; i += 1) {
    const s = state.schedule[i]!;
    out[s.lane]! += loadOf(s.boss, s.kind);
  }
  return out;
}

function foeLoad(e: Foe): number {
  return loadOf(e.boss, e.elite ? 'elite' : e.swarm ? 'swarm' : undefined);
}

export function cellFree(state: BattleState, lane: number, cell: number): boolean {
  return !state.team.some((f) => f.alive && f.lane === lane && f.cell === cell);
}

/** 这个定位该往哪一格补：哪一路人均要挡的最多去哪一路，路里挑最贴定位的空格 */
export function freeCellFor(state: BattleState, role: Role): { lane: number; cell: number } | undefined {
  const load = lanePressure(state);
  const men = new Array<number>(LANE_COUNT).fill(0);
  for (const f of state.team) if (f.alive) men[f.lane]! += 1;
  const lanes = [0, 1, 2]
    .sort((a, b) => (load[b]! / (men[b]! + 1)) - (load[a]! / (men[a]! + 1)) || load[b]! - load[a]!);
  const want = ROLE_CELL_PREF[role];
  const cells = [0, 1, 2, 3].sort((a, b) => Math.abs(a - want) - Math.abs(b - want) || a - b);
  for (const lane of lanes) {
    if (load[lane]! <= 0 && lanes.some((l) => load[l]! > 0)) continue;
    for (const cell of cells) if (cellFree(state, lane, cell)) return { lane, cell };
  }
  for (const lane of lanes) {
    for (const cell of cells) if (cellFree(state, lane, cell)) return { lane, cell };
  }
  return undefined;
}

const HIT_ORDER: Readonly<Record<Role, number>> = { dps: 0, block: 1, tank: 2, heal: 3 };
const FRONT_ORDER: Readonly<Record<Role, number>> = { tank: 0, block: 1, dps: 2, heal: 3 };

function modTarget(state: BattleState, id: ModId): Fighter | undefined {
  const def = boostDef(id);
  const free = state.team.filter((f) => f.alive && !(f.mods ?? []).includes(id));
  if (free.length === 0) return undefined;
  if (def.wants === 'front') {
    return [...free].sort((a, b) => FRONT_ORDER[a.def.role] - FRONT_ORDER[b.def.role]
      || a.cell - b.cell || b.maxHp - a.maxHp)[0];
  }
  return [...free].sort((a, b) => HIT_ORDER[a.def.role] - HIT_ORDER[b.def.role] || b.atk - a.atk)[0];
}

/** 谁路过：队里缺挨的就来个挨的，不缺就来个打的。名单上没有的人才会路过 */
function guestPick(state: BattleState): string | undefined {
  const b = state.boost!;
  const busy = new Set([...state.team.map((f) => f.def.id), ...b.reserve.map((c) => c.villager.id)]);
  const pool = VILLAGERS.filter((v) => !busy.has(v.id));
  if (pool.length === 0) return undefined;
  const tanks = state.team.filter((f) => f.alive && f.def.role === 'tank').length;
  const role: Role = tanks === 0 ? 'tank' : 'dps';
  const fit = pool.filter((v) => v.role === role);
  const list = fit.length > 0 ? fit : pool;
  return list[Math.floor(boostRand(b) * list.length)]!.id;
}

function cardFor(state: BattleState, id: BoostId, tier: Tier = 0): OfferCard | undefined {
  const b = state.boost!;
  const def = boostDef(id);
  if (def.kind === 'gadget') return b.gadgets.length < GADGET_MAX ? { id, tier } : undefined;
  if (def.kind === 'mod') {
    const own = state.team.filter((x) => !x.guest);
    const fitted = own.reduce((a, x) => a + (x.mods?.length ?? 0), 0);
    if (fitted >= modCap(own.length)) return undefined;
    const f = modTarget(state, id as ModId);
    return f ? { id, tier, uid: f.uid } : undefined;
  }
  if (def.kind === 'guest') {
    if (b.guests >= GUEST_MAX || !freeCellFor(state, 'dps')) return undefined;
    const who = guestPick(state);
    return who ? { id, tier, guest: who } : undefined;
  }
  if (id === 'r_feast') {
    return state.team.some((f) => !f.alive || f.hp < f.maxHp * 0.6) ? { id, tier } : undefined;
  }
  return { id, tier };
}

/** 这一回每张卡出压箱底的概率：底子 + 保底，大礼包翻倍。第 1 章不出 */
function goldChance(state: BattleState, big: boolean): number {
  if (state.stage.id < GOLD_FROM_STAGE) return 0;
  const b = state.boost!;
  return Math.min(0.6, (TIER_GOLD + b.goldDry * GOLD_PITY_STEP) * (big ? BIG_GOLD_MUL : 1));
}

function rollTier(state: BattleState, big: boolean): Tier {
  const r = boostRand(state.boost!);
  const gold = goldChance(state, big);
  if (r < gold) return 2;
  if (r < gold + TIER_RARE) return 1;
  return 0;
}

function rollCards(state: BattleState, n: number, skip: readonly BoostId[], big = false): OfferCard[] {
  const b = state.boost!;
  const pool: { card: OfferCard; w: number }[] = [];
  for (const def of BOOSTS) {
    if (skip.includes(def.id)) continue;
    const card = cardFor(state, def.id);
    if (card) pool.push({ card, w: def.weight });
  }
  const out: OfferCard[] = [];
  while (out.length < n && pool.length > 0) {
    const sum = pool.reduce((a, p) => a + p.w, 0);
    let r = boostRand(b) * sum;
    let i = 0;
    while (i < pool.length - 1 && r >= pool[i]!.w) {
      r -= pool[i]!.w;
      i += 1;
    }
    out.push({ ...pool[i]!.card, tier: rollTier(state, big) });
    pool.splice(i, 1);
  }
  // 大礼包至少一张好货，不然「连挑两样」挑的全是普通货
  if (big && out.length > 0 && out.every((c) => c.tier === 0)) {
    out[Math.floor(boostRand(b) * out.length)]!.tier = 1;
  }
  return out;
}

/** 1-1 第一回写死。人不在场（还没增援上来）就换给场上合适的人 */
function openingCards(state: BattleState): OfferCard[] {
  const b = state.boost!;
  const out: OfferCard[] = [];
  OPENING_OFFER.forEach((id, k) => {
    const tier = OPENING_TIERS[k] ?? 0;
    if (id === 'v_guest') {
      const busy = state.team.some((f) => f.def.id === OPENING_GUEST)
        || b.reserve.some((c) => c.villager.id === OPENING_GUEST);
      const card = cardFor(state, id, tier);
      if (card) out.push(busy ? card : { id, tier, guest: OPENING_GUEST });
      return;
    }
    if (boostDef(id).kind === 'mod') {
      const f = state.team.find((x) => x.alive && x.def.id === OPENING_MOD_TARGET);
      const card = f ? { id, tier, uid: f.uid } : cardFor(state, id, tier);
      if (card) out.push(card);
      return;
    }
    const card = cardFor(state, id, tier);
    if (card) out.push(card);
  });
  if (out.length < 3) out.push(...rollCards(state, 3 - out.length, out.map((c) => c.id)));
  return out;
}

/**
 * 推荐哪张、为什么。卡本身值多少（boosts.value，拿模拟器强拿每张量出来的）× 档次，
 * 再看场上缺什么：有路没人守先来人，倒了人先吃饭。
 *
 * 上一版按种类排（来人 > 吃饭 > 焊件 > 家伙事 > 电池），实测推荐那张还不如闭眼拿第一张 ——
 * 焊件被排在家伙事前面，可强拿下来鞭炮串、拖拉机都比焊件顶用。
 */
const GADGET_HELD_CUT = 0.35;

function cardPick(state: BattleState, c: OfferCard): { score: number; why: string } {
  const def = boostDef(c.id);
  let base = def.value;
  let why = '';
  if (def.kind === 'guest') {
    const load = lanePressure(state);
    const empty = [0, 1, 2].some((l) => load[l]! > 0 && !state.team.some((f) => f.alive && f.lane === l));
    if (empty) {
      base = 8;
      why = '有一路没人守';
    }
  } else if (c.id === 'r_feast' && state.team.some((f) => !f.alive)) {
    base = 7;
    why = '有人倒了';
  } else if (c.id === 'm_wok') {
    const f = state.team.find((x) => x.uid === c.uid);
    if (f && f.hp < f.maxHp * 0.6) {
      base = 5.6;
      why = `${f.def.name}快顶不住了`;
    }
  } else if (def.kind === 'gadget') {
    // 手里攒着没扔的家伙越多，再来一件越不急，该给人添劲了
    const held = state.boost!.gadgets.length;
    base -= GADGET_HELD_CUT * held;
  }
  if (!why) why = c.tier === 2 ? '压箱底，最顶用' : c.tier === 1 ? '好货，劲儿大' : '眼下最顶用';
  return { score: base * TIER_SCORE[c.tier], why };
}

function bestCard(state: BattleState, cards: readonly OfferCard[]): number {
  let best = 0;
  for (let i = 1; i < cards.length; i += 1) {
    if (cardPick(state, cards[i]!).score > cardPick(state, cards[best]!).score) best = i;
  }
  return best;
}

function setBest(state: BattleState, o: BoostOffer): void {
  o.best = bestCard(state, o.cards);
  const c = o.cards[o.best];
  o.why = c ? cardPick(state, c).why : '';
}

/** 看一段白拿的那张：三张以外再抽一张，直接给压箱底 */
function bonusCard(state: BattleState, cards: readonly OfferCard[]): OfferCard | undefined {
  const b = state.boost!;
  if (state.stage.id < AD_GOLD_FROM_STAGE || b.bonusTaken > 0) return undefined;
  const c = rollCards(state, 1, cards.map((x) => x.id))[0];
  return c ? { ...c, tier: 2 } : undefined;
}

function openOffer(state: BattleState, wave: number): void {
  const b = state.boost!;
  b.offerWave = wave;
  if (state.leaked <= b.leakMark) {
    b.cells += CELL_CLEAN;
    b.cellsGot += CELL_CLEAN;
    state.events.push({ kind: 'clean', n: CELL_CLEAN });
  }
  b.leakMark = state.leaked;
  const big = b.bigNext;
  b.bigNext = false;
  const cards = state.stage.id === 1 && b.offers === 0 ? openingCards(state) : rollCards(state, 3, [], big);
  b.offers += 1;
  if (cards.length === 0) return;
  if (state.stage.id >= GOLD_FROM_STAGE) b.goldDry = cards.some((c) => c.tier === 2) ? 0 : b.goldDry + 1;
  const o: BoostOffer = {
    cards, best: 0, why: '', left: big ? Math.min(2, cards.length) : 1, big, rerolled: false, wave,
    bonus: bonusCard(state, cards),
  };
  setBest(state, o);
  b.offer = o;
  state.events.push({ kind: 'offer', wave, big });
}

function applyMod(f: Fighter, id: ModId, tier: Tier): void {
  const pow = TIER_POW[tier];
  f.mods = [...(f.mods ?? []), id];
  f.modPow = { ...f.modPow, [id]: pow };
  // 档位叠在出手速度上：压箱底按间隔乘会快到两倍多，攒气跟着翻倍，绝活一下就喧宾夺主了
  if (id === 'm_battery') f.interval = Math.round(f.interval / (1 + (1 / BATTERY_INTERVAL - 1) * pow));
  else if (id === 'm_weight') f.atk *= 1 + (WEIGHT_ATK - 1) * pow;
  else if (id === 'm_wok') {
    const add = Math.round(f.maxHp * (WOK_HP - 1) * pow);
    f.maxHp += add;
    f.hp += add;
    f.armor *= 1 + (WOK_DEF - 1) * pow;
  }
}

function teamCraft(state: BattleState): number {
  const xs = state.team.map((f) => f.craft ?? 1);
  return Math.max(1, Math.round(xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length)));
}

function spawnGuest(state: BattleState, id: string, tier: Tier = 0): Fighter | undefined {
  const def = VILLAGERS.find((v) => v.id === id);
  if (!def) return undefined;
  const at = freeCellFor(state, def.role);
  if (!at) return undefined;
  const g = GUEST_TIER[tier]!;
  const f = fighterOf({
    villager: def, lane: at.lane, cell: at.cell, evoStage: g.evo, stars: 0, craft: teamCraft(state) + g.craft,
  }, state.villageMul, state.team.length);
  f.guest = true;
  state.team.push(f);
  state.boost!.guests += 1;
  state.events.push({ kind: 'deploy', uid: f.uid, again: false, guest: true, auto: false });
  return f;
}

function applyCard(state: BattleState, c: OfferCard, bonus = false): void {
  const b = state.boost!;
  const def = boostDef(c.id);
  let uid = c.uid;
  if (def.kind === 'gadget') {
    const g = GADGET_TIER[c.tier]!;
    for (let k = 0; k < g.n && b.gadgets.length < GADGET_MAX; k += 1) {
      b.gadgets.push(c.id as GadgetId);
      b.gadgetPow.push(g.pow);
      b.gadgetTier.push(c.tier);
    }
  } else if (def.kind === 'mod') {
    let f = state.team.find((x) => x.uid === c.uid && x.alive);
    if (!f || (f.mods ?? []).includes(c.id as ModId)) f = modTarget(state, c.id as ModId);
    if (f) applyMod(f, c.id as ModId, c.tier);
    uid = f?.uid;
  } else if (def.kind === 'guest') {
    uid = spawnGuest(state, c.guest ?? guestPick(state) ?? '', c.tier)?.uid;
  } else if (c.id === 'r_market') {
    b.cells += MARKET_TIER[c.tier];
    b.cellsGot += MARKET_TIER[c.tier];
  } else if (c.id === 'r_feast') {
    for (const f of state.team) {
      if (f.alive) {
        const amount = f.maxHp - f.hp;
        f.hp = f.maxHp;
        if (amount > 0) state.events.push({ kind: 'heal', uid: f.uid, targetUid: f.uid, amount });
      } else {
        f.alive = true;
        f.hp = Math.max(1, Math.round(f.maxHp * FEAST_TIER[c.tier]));
        state.events.push({ kind: 'villagerUp', uid: f.uid });
      }
      if (c.tier === 2 && f.alive) f.energy = ENERGY_MAX;
    }
  }
  b.picks.push(c.id);
  b.pickTiers.push(c.tier);
  state.events.push({ kind: 'boost', id: c.id, uid, tier: c.tier, bonus });
}

/** 换人、换格之后重新认一遍这张卡给谁，档次不变 */
function refreshCard(state: BattleState, c: OfferCard): OfferCard | undefined {
  const fresh = cardFor(state, c.id, c.tier);
  if (!fresh) return undefined;
  const kind = boostDef(c.id).kind;
  return kind === 'mod' || kind === 'guest' ? fresh : c;
}

/** 选第几张。大礼包选完第一张还挂着，剩下的接着选 */
export function pickBoost(state: BattleState, i: number): boolean {
  const b = state.boost;
  const o = b?.offer;
  if (!b || !o || state.phase !== 'fighting') return false;
  const card = o.cards[i];
  if (!card) return false;
  applyCard(state, card);
  o.left -= 1;
  o.cards.splice(i, 1);
  const rest = o.cards.map((c) => refreshCard(state, c)).filter((c): c is OfferCard => !!c);
  if (o.left <= 0 || rest.length === 0) {
    b.offer = null;
    return true;
  }
  o.cards = rest;
  if (o.bonus) o.bonus = refreshCard(state, o.bonus);
  setBest(state, o);
  return true;
}

/**
 * 看完一段，白拿底下那张压箱底。三选一照样挂着，还能再挑一张。
 * 广告看没看完是场景的事，引擎只管给。一局只有一张
 */
export function takeBonus(state: BattleState): boolean {
  const b = state.boost;
  const o = b?.offer;
  if (!b || !o?.bonus || state.phase !== 'fighting') return false;
  const card = refreshCard(state, o.bonus);
  o.bonus = undefined;
  if (!card) return false;
  applyCard(state, card, true);
  b.bonusTaken += 1;
  const rest = o.cards.map((c) => refreshCard(state, c)).filter((c): c is OfferCard => !!c);
  if (rest.length === 0) {
    b.offer = null;
    return true;
  }
  o.cards = rest;
  setBest(state, o);
  return true;
}

/** 花电池换一批。一回三选一只能换一次。换出来的档次重新抽，保底照算 */
export function rerollOffer(state: BattleState): boolean {
  const b = state.boost;
  const o = b?.offer;
  if (!b || !o || o.rerolled || b.cells < REROLL_COST) return false;
  const fresh = rollCards(state, o.cards.length, o.cards.map((c) => c.id), o.big);
  if (fresh.length === 0) return false;
  b.cells -= REROLL_COST;
  b.rerolls += 1;
  o.cards = fresh;
  o.rerolled = true;
  if (o.bonus && fresh.some((c) => c.id === o.bonus!.id)) o.bonus = bonusCard(state, fresh);
  setBest(state, o);
  return true;
}

/* ---------------- 局内层：增援 ---------------- */

export interface DeployPick {
  id: string;
  def: VillagerDef;
  evo: number;
  cost: number;
  /** 倒下的人再上 */
  again: boolean;
}

/** 能送上去的人：板凳上的、倒下还没再上过的（第 1 章不行）。路过的倒了就走了 */
export function deployables(state: BattleState): DeployPick[] {
  const b = state.boost;
  if (!b) return [];
  const on = new Set(state.team.map((f) => f.def.id));
  const out: DeployPick[] = b.reserve
    .filter((c) => !on.has(c.villager.id))
    .map((c) => ({
      id: c.villager.id, def: c.villager, evo: c.evoStage, cost: deployCost(c.evoStage, false), again: false,
    }));
  if (state.stage.id < REDEPLOY_FROM_STAGE) return out;
  for (const f of state.team) {
    if (f.alive || f.guest || f.again) continue;
    out.push({ id: f.def.id, def: f.def, evo: f.evoStage, cost: deployCost(f.evoStage, true), again: true });
  }
  return out;
}

export function seatsFree(state: BattleState): number {
  const b = state.boost;
  if (!b) return 0;
  return b.seats - state.team.filter((f) => f.alive && !f.guest).length;
}

/** 把一个人送上空格。只能往空格送，已经站着的人不挪 */
export function deploy(state: BattleState, villagerId: string, lane: number, cell: number): boolean {
  const b = state.boost;
  if (!b || b.offer || state.phase !== 'fighting') return false;
  if (lane < 0 || lane >= LANE_COUNT || cell < 0 || cell >= CELL_COUNT) return false;
  if (!cellFree(state, lane, cell) || seatsFree(state) <= 0) return false;
  const pick = deployables(state).find((p) => p.id === villagerId);
  if (!pick || b.cells < pick.cost) return false;
  b.cells -= pick.cost;
  b.deploys += 1;
  b.waitDeploy = 0;
  if (pick.again) {
    const f = state.team.find((x) => !x.alive && x.def.id === villagerId && !x.guest)!;
    f.alive = true;
    f.again = true;
    f.hp = f.maxHp;
    f.lane = lane;
    f.cell = cell;
    f.pos = cellPos(cell);
    f.cd = 0;
    f.energy = Math.max(f.energy, ENERGY_START);
    state.events.push({ kind: 'deploy', uid: f.uid, again: true, guest: false, auto: b.byAssist });
    return true;
  }
  const c = b.reserve.find((x) => x.villager.id === villagerId)!;
  const f = fighterOf({
    villager: c.villager, lane, cell, evoStage: c.evoStage, stars: c.stars, craft: c.craft,
  }, state.villageMul, state.team.length);
  f.energy = DEPLOY_ENERGY;
  state.team.push(f);
  state.events.push({ kind: 'deploy', uid: f.uid, again: false, guest: false, auto: b.byAssist });
  return true;
}

/* ---------------- 局内层：焊一下 ---------------- */

/** 最后一波、或者大个子在场，才能焊 */
export function weldOpen(state: BattleState): boolean {
  if (!state.boost || state.phase !== 'fighting') return false;
  return state.wave >= state.stage.waves.length || state.foes.some((e) => e.alive && e.boss);
}

export function canWeld(state: BattleState, f: Fighter): boolean {
  const b = state.boost;
  return !!b && f.alive && !f.welded && b.welds < WELD_MAX && b.cells >= weldCostOf(f.evoStage);
}

/** 焊谁最值：大个子那一路的先，打的先于挨的 */
export function weldPick(state: BattleState): Fighter | undefined {
  if (!weldOpen(state)) return undefined;
  const bossLanes = new Set(state.foes.filter((e) => e.alive && e.boss).map((e) => e.lane));
  const list = state.team.filter((f) => canWeld(state, f));
  return list.sort((a, b) => (bossLanes.has(b.lane) ? 1 : 0) - (bossLanes.has(a.lane) ? 1 : 0)
    || HIT_ORDER[a.def.role] - HIT_ORDER[b.def.role]
    || b.atk - a.atk)[0];
}

/** 本关让这个人直接变下一阶：换立绘、换打法、血补满 */
export function weld(state: BattleState, uid: string): boolean {
  const b = state.boost;
  if (!b || b.offer || !weldOpen(state)) return false;
  const f = state.team.find((x) => x.uid === uid);
  if (!f || !canWeld(state, f)) return false;
  b.cells -= weldCostOf(f.evoStage);
  b.welds += 1;
  b.waitWeld = 0;
  f.welded = true;
  if (f.evoStage < EVO_MAX) {
    f.evoStage += 1;
    f.evoPow = evoPowOf(f.def, f.evoStage);
  }
  f.atk *= WELD_MUL;
  f.maxHp = Math.round(f.maxHp * WELD_MUL);
  f.hp = f.maxHp;
  state.events.push({ kind: 'weld', uid: f.uid, evo: f.evoStage, auto: b.byAssist });
  return true;
}

/* ---------------- 局内层：家伙事 ---------------- */

/** 怪最多的那一路。一样多就挑走得最近的 */
function busiestLane(state: BattleState): number {
  const n = new Array<number>(LANE_COUNT).fill(0);
  const near = new Array<number>(LANE_COUNT).fill(-1);
  for (const e of state.foes) {
    if (!e.alive) continue;
    n[e.lane]! += foeLoad(e);
    near[e.lane] = Math.max(near[e.lane]!, e.pos);
  }
  let best = 0;
  for (let l = 1; l < LANE_COUNT; l += 1) {
    if (n[l]! > n[best]! || (n[l] === n[best] && near[l]! > near[best]!)) best = l;
  }
  return best;
}

function gruntRaw(state: BattleState): number {
  return getEnemy('grunt').hp * state.stage.hpMul;
}

function blastFoe(state: BattleState, e: Foe, raw: number, id: GadgetId): void {
  const damage = foeTake(e, dmgOf(raw, e.armor, 1));
  e.hp -= damage;
  state.boost!.dmg += damage;
  const killed = e.hp <= 0;
  state.events.push({ kind: 'blast', id, foeId: e.id, damage, killed });
  if (killed) downFoe(state, e);
}

export function useGadget(state: BattleState, i: number): boolean {
  const b = state.boost;
  if (!b || b.offer || state.phase !== 'fighting') return false;
  const id = b.gadgets[i];
  if (!id) return false;
  const pow = b.gadgetPow[i] ?? 1;
  const tier = b.gadgetTier[i] ?? 0;
  b.gadgets.splice(i, 1);
  b.gadgetPow.splice(i, 1);
  b.gadgetTier.splice(i, 1);
  b.gadgetUses += 1;
  b.waitGadget = 0;
  const lane = id === 'g_cracker' || id === 'g_tractor' ? busiestLane(state) : -1;
  state.events.push({ kind: 'gadget', id, lane, auto: b.byAssist, tier });
  const raw = gruntRaw(state);
  const foes = state.foes.filter((e) => e.alive && (lane < 0 || e.lane === lane));
  if (id === 'g_cracker') {
    for (const e of foes) blastFoe(state, e, raw * CRACKER_GRUNTS * pow, id);
  } else if (id === 'g_horn') {
    for (const e of foes) {
      const cc = e.boss || e.def.steady ? HARD_FOE_CC : 1;
      e.stunMs = Math.max(e.stunMs, HORN_STUN_MS * cc * pow);
    }
  } else if (id === 'g_dance') {
    b.danceMs = Math.max(b.danceMs, DANCE_MS * pow);
  } else {
    for (const e of foes) {
      const cc = e.boss || e.def.steady ? HARD_FOE_CC : 1;
      pushBack(e, TRACTOR_PUSH * cc * Math.sqrt(pow));
      blastFoe(state, e, raw * TRACTOR_GRUNTS * pow, id);
    }
  }
  return true;
}

/* ---------------- 局内层：托管 ---------------- */

function gadgetMoment(state: BattleState, id: GadgetId): boolean {
  const alive = state.foes.filter((e) => e.alive);
  if (alive.length === 0) return false;
  if (alive.some((e) => e.boss && foeClose(state, e))) return true;
  if (state.spawnIdx >= state.schedule.length) return true;
  const load = (xs: readonly Foe[]): number => xs.reduce((a, e) => a + foeLoad(e), 0);
  if (id === 'g_horn') return load(alive.filter((e) => foeClose(state, e))) >= 3;
  if (id === 'g_dance') return load(alive) >= 4;
  const lane = busiestLane(state);
  return load(alive.filter((e) => e.lane === lane)) >= 3;
}

/** 负样本补人：和 dumbPlace 同一套格序，只往左两列塞 */
function dumbFreeCell(state: BattleState): { lane: number; cell: number } | undefined {
  for (let i = 0; i < LANE_COUNT * CELL_COUNT; i += 1) {
    const lane = i % 2;
    const cell = Math.floor(i / 2) % CELL_COUNT;
    if (cellFree(state, lane, cell)) return { lane, cell };
  }
  return undefined;
}

/** 托管送谁上、送哪：先补没人守的路，再按阶和手艺挑 */
function deployPlan(state: BattleState): { id: string; lane: number; cell: number; urgent: boolean } | undefined {
  const b = state.boost!;
  if (seatsFree(state) <= 0) return undefined;
  const list = deployables(state).filter((p) => p.cost <= b.cells);
  if (list.length === 0) return undefined;
  const score = (p: DeployPick): number => {
    const c = b.reserve.find((x) => x.villager.id === p.id);
    return p.evo * 10 + (c?.craft ?? 1) + (c?.stars ?? 0) - (p.again ? 0.5 : 0);
  };
  const pick = [...list].sort((a, c) => score(c) - score(a))[0]!;
  const at = b.policy === 'dumb' ? dumbFreeCell(state) : freeCellFor(state, pick.def.role);
  if (!at) return undefined;
  const load = lanePressure(state);
  const urgent = [0, 1, 2].some((l) => load[l]! > 0
    && state.foes.some((e) => e.alive && e.lane === l)
    && !state.team.some((f) => f.alive && f.lane === l));
  return { id: pick.id, lane: at.lane, cell: at.cell, urgent };
}

function assistTick(state: BattleState): void {
  const b = state.boost;
  if (!b || !b.assist || b.offer) return;
  b.byAssist = true;
  try {
    assistActs(state, b);
  } finally {
    b.byAssist = false;
  }
}

function assistActs(state: BattleState, b: RunBoost): void {
  if (b.gadgets.length > 0 && !b.hold.gadget) {
    b.waitGadget += TICK_MS;
    if (b.waitGadget >= AUTO_GADGET_MS && gadgetMoment(state, b.gadgets[0]!)) useGadget(state, 0);
  } else {
    b.waitGadget = 0;
  }
  const w = b.hold.weld ? undefined : weldPick(state);
  if (w) {
    b.waitWeld += TICK_MS;
    if (b.waitWeld >= AUTO_WELD_MS) weld(state, w.uid);
  } else {
    b.waitWeld = 0;
  }
  const d = b.hold.deploy ? undefined : deployPlan(state);
  if (d) {
    b.waitDeploy += TICK_MS;
    if (b.waitDeploy >= AUTO_DEPLOY_MS || d.urgent) deploy(state, d.id, d.lane, d.cell);
  } else {
    b.waitDeploy = 0;
  }
}

function tickBuffs(f: Fighter): void {
  if (f.guardMs > 0) f.guardMs = Math.max(0, f.guardMs - TICK_MS);
  if (f.hasteMs > 0) f.hasteMs = Math.max(0, f.hasteMs - TICK_MS);
}

/**
 * 这一波打残了（场上剩的血不到这一波的三成），下一波别让人干等满 10 秒。
 * 植物大战僵尸的做法：打得快，下一波就提前压上来，场上不会有空档。
 * 原来要等场上一只不剩才提前，前两关有两成的时间是空场。
 */
function callEarly(state: BattleState): void {
  const next = state.schedule[state.spawnIdx];
  if (!next || state.wave === 0 || next.wave <= state.wave) return;
  const wait = next.atMs - state.elapsedMs;
  if (wait <= EARLY_CALL_MS) return;
  const left = state.foes.reduce((a, e) => a + (e.alive ? e.hp : 0), 0);
  if (left > (state.waveHp[state.wave - 1] ?? 0) * EARLY_WEAK) return;
  const cut = wait - EARLY_CALL_MS;
  for (let i = state.spawnIdx; i < state.schedule.length; i += 1) state.schedule[i]!.atMs -= cut;
  state.skippedMs += cut;
}

/** 一大波快到了就喊一声。三选一会在那一波开头弹出来，所以要抢在它前头 */
function warnSurge(state: BattleState): void {
  const next = state.schedule[state.spawnIdx];
  if (!next || next.wave <= state.surgeTold || !state.stage.waves[next.wave - 1]?.surge) return;
  if (next.atMs - state.elapsedMs > SURGE_WARN_MS) return;
  state.surgeTold = next.wave;
  state.events.push({ kind: 'surge', wave: next.wave });
}

/**
 * 底线拖拉机：第一只冲到底线的怪把它发动，从底线一直撞到门口。这一只不算漏。
 * 一路一台、一关一次 —— 救得了一次危机，救不了一直排错的阵。
 * 大个子撞不死，只掉一截血、被顶回去一段。
 * 门外还在走的不撞：整条路连门外一起清，排错的阵靠拖拉机也能混过去，排法就不值钱了。
 */
function fireLastLine(state: BattleState, lane: number, trigger: Foe): void {
  state.lastLine[lane] = false;
  state.lastLineUsed += 1;
  state.events.push({ kind: 'lastLine', lane, trigger: trigger.id });
  for (const e of state.foes) {
    if (!e.alive || e.lane !== lane || e.pos < VIS_ENGAGE_POS) continue;
    if (e.boss) {
      e.hp -= Math.round(e.maxHp * LAST_LINE_BOSS_CUT);
      e.pos = Math.min(e.pos, GOAL_POS);
      pushBack(e, LAST_LINE_PUSH);
      if (e.hp <= 0) downFoe(state, e);
      continue;
    }
    e.hp = 0;
    downFoe(state, e);
  }
}

/** 再漏一只就输了：全村急眼，劲头一下充满。一关一次，托管也会接着放 */
function checkRally(state: BattleState): void {
  if (state.rallied || state.leaked !== LEAK_ALLOW - 1) return;
  state.rallied = true;
  for (const f of state.team) if (f.alive) f.energy = ENERGY_MAX;
  state.events.push({ kind: 'rally' });
}

/** 门口要来的：这一路接下来 GATE_WARN_MS 里出几只、是什么。玩家开打前看得见出怪口，这不是偷看 */
export interface GateWarn {
  lane: number;
  enemy: string;
  n: number;
  inMs: number;
  boss: boolean;
  elite: boolean;
}

/**
 * 只报「这一路现在没怪、马上要来」的，和带头目的。
 * 一窝接一窝压着的路不用再喊，喊了等于整局门口常亮，反倒看不出哪一路是新来的。
 */
export function gateWarnings(state: BattleState, aheadMs = GATE_WARN_MS): GateWarn[] {
  const out = new Map<number, GateWarn>();
  for (let i = state.spawnIdx; i < state.schedule.length; i += 1) {
    const s = state.schedule[i]!;
    const inMs = s.atMs - state.elapsedMs;
    if (inMs > aheadMs) break;
    const w = out.get(s.lane);
    if (w) {
      w.n += 1;
      w.boss ||= s.boss;
      w.elite ||= s.kind === 'elite';
      continue;
    }
    out.set(s.lane, {
      lane: s.lane, enemy: s.enemy, n: 1, inMs: Math.max(0, inMs), boss: s.boss, elite: s.kind === 'elite',
    });
  }
  return [...out.values()].filter((w) => w.boss || w.elite
    || !state.foes.some((e) => e.alive && e.lane === w.lane));
}

/**
 * 走一步（TICK_MS）。只在 fighting 阶段生效。
 *
 * 顺序刻意是「出怪 → 敌人动 → 村民动 → 收尾判定」：
 * 敌人先走再让村民打，意味着刚走进射程的那一只当帧就能被打到，
 * 反过来会让射程边缘凭空少一次出手。
 */
export function tick(state: BattleState): void {
  if (state.phase !== 'fighting') return;
  const b = state.boost;
  // 三选一挂着就整局停住：怪不走、钟不走，选完才接着打
  if (b?.offer) return;

  const { stage } = state;

  callEarly(state);
  warnSurge(state);

  if (b) {
    const next = state.schedule[state.spawnIdx];
    if (next && next.atMs <= state.elapsedMs && next.wave > state.wave && state.wave >= 1
      && b.offerWave < next.wave) {
      openOffer(state, next.wave);
      if (b.offer) return;
    }
    tickDrops(state);
    if (b.danceMs > 0) b.danceMs = Math.max(0, b.danceMs - TICK_MS);
  }

  // 出怪。同屏满了的排在门外，腾出位置再进
  let onField = state.foes.reduce((a, e) => a + (e.alive ? 1 : 0), 0);
  while (state.spawnIdx < state.schedule.length
    && state.schedule[state.spawnIdx]!.atMs <= state.elapsedMs && onField < FOE_CAP) {
    const s = state.schedule[state.spawnIdx]!;
    if (s.wave > state.wave) {
      state.wave = s.wave;
      state.events.push({ kind: 'waveStart', wave: s.wave });
    }
    const foe = newFoe(state, s.enemy, s.lane, 0, s.boss, s.kind);
    state.foes.push(foe);
    state.lanesHit |= 1 << foe.lane;
    onField += 1;
    if (s.boss) state.events.push({ kind: 'bossIn', foeId: foe.id, lane: foe.lane });
    else if (foe.elite) state.events.push({ kind: 'eliteIn', foeId: foe.id, lane: foe.lane });
    state.spawnIdx += 1;
  }

  const dim = applyAuras(state);

  // 外星人动。下的蛋先攒着，循环完再进场 —— 边遍历边 push 会让它当帧就走一步
  const hatched: Foe[] = [];
  for (const e of state.foes) {
    if (!e.alive) continue;
    if (e.slowMs > 0) e.slowMs = Math.max(0, e.slowMs - TICK_MS);
    if (e.stunMs > 0) {
      e.stunMs = Math.max(0, e.stunMs - TICK_MS);
      continue;
    }

    // 破壳：血掉到一半，壳没了但跑得更快。只破一次
    if (e.def.crack && !e.cracked && e.hp <= e.maxHp * CRACK_HP) {
      e.cracked = true;
      e.armor = 0;
      e.spd = e.def.spd * CRACK_SPD;
    }

    // 下蛋。次数是有限的，不然点不掉它就只能等超时 —— 那个玩家看不懂
    if (e.def.spawn && e.spawnLeft > 0) {
      e.spawnCd -= TICK_MS;
      if (e.spawnCd <= 0) {
        e.spawnCd = e.def.spawn.everyMs;
        e.spawnLeft -= 1;
        hatched.push(newFoe(state, e.def.spawn.enemy, e.lane, Math.max(0, e.pos - HATCH_BACK)));
      }
    }

    let target = foeTarget(e, state.team);
    let haltAt = foeHaltPos(e, state.team);
    let reached = haltAt !== undefined && e.pos >= haltAt;

    // 弹簧腿：第一次被挡下来的那一刻直接越过去，一整局只跳一次。
    // 跳完必须重算挡点，否则会被钉在刚跳过的那个人脚前
    if (reached && e.def.leap && !e.leapt && target) {
      e.leapt = true;
      e.skipUid = target.uid;
      target = foeTarget(e, state.team);
      haltAt = foeHaltPos(e, state.team);
      reached = haltAt !== undefined && e.pos >= haltAt;
    }

    // 空格不是墙。村民还没进自己射程就接着走，进了才停、才挥刀。
    if (!reached) {
      e.pos = marchStep(e.pos, e.spd, TICK_MS / 1000, e.slowMs > 0 ? SLOW_MUL : 1);
      if (haltAt !== undefined && e.pos > haltAt) e.pos = haltAt;
      if (e.pos > GOAL_POS) {
        if (state.lastLine[e.lane]) {
          fireLastLine(state, e.lane, e);
          continue;
        }
        e.alive = false;
        state.leaked += e.boss ? BOSS_LEAK : 1;
        state.events.push({ kind: 'leak', foeId: e.id, lane: e.lane });
        checkRally(state);
        continue;
      }
    }

    if (reached && target && foeCanSwing(e, target)) {
      e.cd -= TICK_MS;
      if (e.cd <= 0) {
        e.cd = e.def.interval;
        const atk = e.atk * (1 + e.atkPct);
        const damage = dmgOf(atk, target.armor, laneMul(e.def.lane, target.def.lane));
        if (!e.swung) {
          e.swung = true;
          state.touched += 1;
        }
        hurtVillager(state, target, e, damage);
      }
    }
  }
  if (hatched.length > 0) state.foes.push(...hatched);

  // 探照灯照住的是每一路最前面那个。照到谁每 tick 重算，人倒了就换下一个
  const dimmed = new Set<string>();
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    if (dim[lane]! <= 0) continue;
    const front = frontOf(state.team, lane);
    if (front) dimmed.add(front.uid);
  }

  // 村民动
  const anyFoe = state.foes.some((e) => e.alive);
  for (const f of state.team) {
    if (!f.alive) continue;
    const kind = evoKindOf(f.def, f.evoStage);
    tickRegen(state, f, kind);
    tickBuffs(f);
    if (anyFoe) gainEnergy(f, (ENERGY_PER_S * TICK_MS) / 1000);
    if (skillReady(f)) f.readyMs += TICK_MS;
    if (state.autoSkill && skillReady(f) && skillWanted(state, f, skillAt(f.def, f.evoStage))) {
      fireSkill(state, f, false);
    }
    const rate = (f.hasteMs > 0 ? 1 / f.hasteMul : 1) * (b && b.danceMs > 0 ? 1 / DANCE_HASTE : 1);
    f.cd -= TICK_MS * rate;
    if (f.cd > 0) continue;

    const cdMul = dimmed.has(f.uid) ? 1 + dim[f.lane]! : 1;

    // 吸血奶（杀猪匠）靠砍人回血，不走独占治疗，否则局里永远看不见他动手
    if (f.def.role === 'heal' && kind !== 'lifesteal') {
      if (tryHeal(state, f, kind, cdMul)) {
        gainEnergy(f, actEnergy(f));
        continue;
      }
    }

    const marks = pickFoes(f, state.foes, kind);
    if (marks.length === 0) continue;
    f.cd = f.interval * cdMul;
    gainEnergy(f, actEnergy(f));
    for (const m of marks) strike(state, f, m.foe, m.mul, kind);
    kickerSplash(state, f, marks, kind);
  }

  assistTick(state);

  for (const f of state.team) {
    state.lowHpFrac = Math.min(state.lowHpFrac, f.alive ? f.hp / f.maxHp : 0);
  }

  const alive = state.foes.filter((e) => e.alive).length;
  state.aliveSum += alive;
  state.aliveTicks += 1;
  if (alive === 0) state.emptyTicks += 1;
  state.peakAlive = Math.max(state.peakAlive, alive);

  if (state.leaked >= LEAK_ALLOW) {
    lose(state, 'leak');
    return;
  }

  if (state.spawnIdx >= state.schedule.length && alive === 0) {
    // 怪清完了人却倒光，不算守住。续命广告只卖漏怪，这种不卖成过关
    if (state.team.length > 0 && state.team.every((f) => !f.alive)) {
      lose(state, 'wipe');
      return;
    }
    state.phase = 'won';
    state.stars = rateStars(
      countedLeaks(state),
      fallenCount(state),
      true,
      battleClockMs(state),
      stage.parMs,
    );
    return;
  }

  state.elapsedMs += TICK_MS;
  if (battleClockMs(state) > stage.timeLimitMs) lose(state, 'timeout');
}

/** 场上还剩几只没清掉 */
export function foesAlive(state: BattleState): number {
  return state.foes.filter((e) => e.alive).length;
}

/** 倒了几个自己人。路过帮忙的倒了不算 */
export function fallenCount(state: BattleState): number {
  return state.team.filter((f) => !f.alive && !f.guest).length;
}

/** 把死掉的清出数组。渲染层放完死亡动画后调，省得数组无限长 */
export function reapFoes(state: BattleState): void {
  state.foes = state.foes.filter((e) => e.alive);
}

/** 算星、结算文案用的漏怪数。续命清掉的当场计数仍算在里面 */
export function countedLeaks(state: Pick<BattleState, 'leaked' | 'keptLeaks'>): number {
  return state.leaked + state.keptLeaks;
}

/**
 * 漏怪判负之后，这场广告还救得回来吗。
 *
 * 漏走的已经出画面了，路上没走到底的还在。清掉一半之后一个人不剩，
 * 后面也不再出怪，续命的下一帧就会被算成打光 —— 这种不给广告。
 */
export function reviveCanContinue(state: BattleState): boolean {
  if (state.phase !== 'lost' || state.loseReason !== 'leak') return false;
  const alive = foesAlive(state);
  const remain = alive - Math.floor(alive / 2);
  return remain > 0 || state.spawnIdx < state.schedule.length;
}

/**
 * 看广告续一条命：漏怪计数清回 0（之前漏的记进 keptLeaks），场上外星人清掉一半。
 *
 * 只清一半而不是全清：全清等于把这一波白送，玩家下次会故意漏到 2 个再看广告。
 * 向下取整，只剩 1 只就留着，不能被广告清掉。
 * 救不回来时原样不动，调用方直接进失败结算。
 */
export function reviveAfterLeak(state: BattleState): boolean {
  if (!reviveCanContinue(state)) return false;
  state.keptLeaks += state.leaked;
  state.leaked = 0;
  if (state.boost) state.boost.leakMark = 0;
  state.loseReason = undefined;
  const cutN = Math.floor(foesAlive(state) / 2);
  let cut = 0;
  for (const e of state.foes) {
    if (!e.alive || cut >= cutN) continue;
    e.alive = false;
    cut += 1;
  }
  for (const f of state.team) {
    if (!f.alive) {
      f.alive = true;
      f.hp = Math.round(f.maxHp * 0.45);
    }
  }
  state.phase = 'fighting';
  return true;
}

/** GM：直接判赢，用来跳关 */
export function gmWin(state: BattleState): void {
  state.phase = 'won';
  state.stars = 3;
}

/* ---------------- 一次跑完（模拟器 / 护栏用） ---------------- */

export interface BattleResult {
  won: boolean;
  /** 'clear' 打完了 | 'leak' 漏够了 | 'timeout' 超时 | 'wipe' 人倒光了 */
  reason: 'clear' | 'leak' | 'timeout' | 'wipe';
  leaked: number;
  fallen: number;
  stars: Stars;
  elapsedMs: number;
  /** 还剩几只没清掉 */
  leftAlive: number;
  /** 放出来的外星人里砍中过人的比例 0..1 */
  touchPct: number;
  /** 最惨的那个人血掉到过几成 0..1，倒了算 0 */
  lowHpFrac: number;
  skillsCast: number;
  bosses: number;
  /** 大个子里冲到前排砍过人的有几只 */
  bossSwung: number;
  plainDmg: number;
  skillDmg: number;
  skillKills: number;
  /** 每个村民放了几次，按村民 id */
  castsBy: Record<string, number>;
  /** 上过场的村民 id，含增援和路过的 */
  squad: string[];
  /** 局内层：家伙事打的血、选了哪些卡、增援 / 焊 / 家伙事各几次、一共收了几节电池 */
  boostDmg: number;
  picks: BoostId[];
  deploys: number;
  welds: number;
  gadgetUses: number;
  cellsGot: number;
  /** 压迫感：场上平均几只、最多几只、空场占几成（0..1）、出过怪的路有几条 */
  avgAlive: number;
  peakAlive: number;
  emptyFrac: number;
  lanes: number;
  /** 底线拖拉机发动了几台、急眼用过没 */
  lastLines: number;
  rallied: boolean;
}

export interface RunOpts extends BattleOpts {
  /** 板凳上的人。开打后能用电池送上去 */
  reserve?: readonly Candidate[];
}

/**
 * 从布阵直接跑到结束。模拟器和护栏走这条，和真机跑的是同一个 `tick`。
 *
 * 上限保护：理论上超时判定必然收敛，但引擎改坏时死循环会把测试挂死，
 * 加一道硬上限比 CI 卡二十分钟好排查。
 */
export function runBattle(
  stage: StageDef,
  place: readonly Placement[],
  villageMul = 1,
  autoSkill = true,
  opts: RunOpts = {},
): BattleResult {
  const state = createBattle(stage, opts.reserve ?? [], place.length || 1, villageMul, place, opts);
  state.autoSkill = autoSkill;
  startFight(state);

  // 三选一停住时不走钟，硬上限只数真正走了的 tick
  const guard = Math.ceil(stage.timeLimitMs / TICK_MS) + 64;
  let ticks = 0;
  for (let i = 0; i < guard * 2 && ticks < guard && state.phase === 'fighting'; i += 1) {
    state.events.length = 0;
    const o = state.boost?.offer;
    if (o) {
      pickBoost(state, state.boost!.policy === 'dumb' ? 0 : o.best);
      continue;
    }
    tick(state);
    ticks += 1;
  }
  const b = state.boost;

  return {
    won: state.phase === 'won',
    reason: state.phase === 'won' ? 'clear' : state.loseReason ?? 'timeout',
    leaked: state.leaked,
    fallen: fallenCount(state),
    stars: state.stars,
    elapsedMs: state.elapsedMs,
    leftAlive: foesAlive(state),
    touchPct: state.spawned > 0 ? state.touched / state.spawned : 0,
    lowHpFrac: state.lowHpFrac,
    bosses: state.foes.filter((e) => e.boss).length,
    bossSwung: state.foes.filter((e) => e.boss && e.swung).length,
    skillsCast: state.skillsCast,
    plainDmg: state.plainDmg,
    skillDmg: state.skillDmg,
    skillKills: state.skillKills,
    castsBy: state.castsBy,
    squad: state.team.map((f) => f.def.id),
    boostDmg: b?.dmg ?? 0,
    picks: b?.picks ?? [],
    deploys: b?.deploys ?? 0,
    welds: b?.welds ?? 0,
    gadgetUses: b?.gadgetUses ?? 0,
    cellsGot: b?.cellsGot ?? 0,
    avgAlive: state.aliveTicks > 0 ? state.aliveSum / state.aliveTicks : 0,
    peakAlive: state.peakAlive,
    emptyFrac: state.aliveTicks > 0 ? state.emptyTicks / state.aliveTicks : 0,
    lanes: [0, 1, 2].filter((l) => (state.lanesHit >> l) & 1).length,
    lastLines: state.lastLineUsed,
    rallied: state.rallied,
  };
}

/* ---------------- 布阵策略 ---------------- */

/** 「修」和「打」往后站，「挨」和「拦」往前站 */
const ROLE_CELL_PREF: Readonly<Record<Role, number>> = {
  tank: 0, block: 1, dps: 2, heal: 3,
};

/**
 * 上场人数对应的定位配比。
 *
 * 三路各一个「挨」的是骨架，所以坦克优先补到 3 个；「打」跟着补，
 * 因为漏怪判负的另一半是**清不完**，光挡不打一样会超时。
 */
const COMP: Readonly<Record<number, Partial<Record<Role, number>>>> = {
  3: { tank: 1, block: 1, dps: 1 },
  4: { tank: 1, block: 1, dps: 2 },
  5: { tank: 2, block: 1, dps: 2 },
  6: { tank: 2, block: 1, dps: 2, heal: 1 },
  7: { tank: 3, block: 1, dps: 2, heal: 1 },
  8: { tank: 3, block: 1, dps: 3, heal: 1 },
  9: { tank: 3, block: 2, dps: 3, heal: 1 },
  10: { tank: 4, block: 2, dps: 3, heal: 1 },
  11: { tank: 4, block: 2, dps: 4, heal: 1 },
  12: { tank: 4, block: 2, dps: 4, heal: 2 },
  13: { tank: 5, block: 2, dps: 4, heal: 2 },
  14: { tank: 5, block: 2, dps: 5, heal: 2 },
  15: { tank: 5, block: 3, dps: 5, heal: 2 },
};

/**
 * 自动布阵：先按定位配够骨架，再在每个定位里挑门路占优的人，最后按各路怪量铺开。
 *
 * 三个用途：① 第一关的预置阵型（新手不该先看见十二个空格）；
 * ② 「一键布阵」按钮；③ 护栏里「像样的排法」那个正样本。
 *
 * 它刻意只用玩家开战前**看得到的信息**（敌方主门路、出怪口、自己人的门路定位），
 * 不偷看关卡数值 —— 否则护栏测出来的差值是「作弊比乱来强」，证明不了布阵值钱。
 *
 * 上一版是「先按克制排序、再强行塞 3 个坦克」，在 8-5 上翻车了：
 * 敌方主门路是「下手重」，克它的是「挨得住」，于是堆了一队攻击只有 0.85 倍的人 ——
 * 34 只怪清不完，漏 4 个判负，而随便换个排法反而 ★3 通关。教训有两条，都留着：
 *
 * 1. **克制倍率 1.3 撑不起「为克制牺牲输出」**，这是好事，
 *    说明克制不是解一次就完的谜题（§6 第 4 条）。策略必须先配平定位，
 *    克制只在同定位的候选之间做选择。
 * 2. 所以它**不是上限**。护栏里的差值是「像样的排法 vs 乱来」，
 *    不是「最优 vs 乱来」，别拿它当难度天花板。
 */
export function autoPlace(
  pool: readonly Candidate[],
  stage: StageDef,
  cap: number,
): Placement[] {
  const counter = counterOf(stage.mainLane);

  // 门路只在同定位的候选之间做选择，不跨定位抢位置
  const score = (c: Candidate): number => {
    let s = c.evoStage * 10 + c.stars + (c.craft ?? 0);
    if (counter && c.villager.lane === counter) s += 12;
    if (counteredBy(stage.mainLane) === c.villager.lane) s -= 8;
    return s;
  };

  const byRole = new Map<Role, Candidate[]>();
  for (const c of pool) {
    const list = byRole.get(c.villager.role) ?? [];
    list.push(c);
    byRole.set(c.villager.role, list);
  }
  for (const list of byRole.values()) list.sort((a, b) => score(b) - score(a));

  const quota = COMP[Math.max(3, Math.min(12, cap))] ?? COMP[12]!;
  const picked: Candidate[] = [];
  const taken = new Set<Candidate>();

  for (const [role, want] of Object.entries(quota) as [Role, number][]) {
    for (const c of byRole.get(role) ?? []) {
      if (picked.filter((p) => p.villager.role === role).length >= want) break;
      picked.push(c);
      taken.add(c);
    }
  }
  // 配比凑不满（手上缺这个定位）就按分数补
  if (picked.length < cap) {
    for (const c of [...pool].sort((a, b) => score(b) - score(a))) {
      if (picked.length >= cap) break;
      if (!taken.has(c)) { picked.push(c); taken.add(c); }
    }
  }

  return spread(picked.slice(0, cap), stage);
}

/** 谁克这条门路 */
function counterOf(lane: VillagerDef['lane']): VillagerDef['lane'] | undefined {
  return (['reach', 'stand', 'heavy', 'rage', 'band'] as const)
    .find((l) => COUNTER_MAP[l] === lane);
}
/** 这条门路克谁 */
function counteredBy(lane: VillagerDef['lane']): VillagerDef['lane'] {
  return COUNTER_MAP[lane];
}

const COUNTER_MAP: Readonly<Record<VillagerDef['lane'], VillagerDef['lane']>> = {
  reach: 'band', band: 'stand', stand: 'heavy', heavy: 'rage', rage: 'reach',
};

/**
 * 按各路的怪量分人，每条有怪的路先保一个，再把余下的人补到「人均要挡的怪」最多的路。
 *
 * 两条踩过的坑都留着：
 *
 * 1. **一路没人就是一路通天**，所以铺开优先于纵深。有一版按
 *    「同定位第 n 个去第 n 路」分，3 人时每个定位只有一个，
 *    三个人全挤在第 0 路 —— 模拟器实测 1-1 全种子失败，而 1-1 是新手第一关。
 * 2. **也不能无脑三路平摊**。第 1、2 章敌人只走一到两路，
 *    把 3 个人摊到 3 路就是拿一个人去守空路，实测 2-2 / 2-3 / 2-5 全成了墙。
 */
function spread(picked: readonly Candidate[], stage: StageDef): Placement[] {
  const load = laneLoad(stage);
  const active = load
    .map((n, lane) => ({ lane, load: n }))
    .filter((x) => x.load > 0)
    .sort((a, b) => b.load - a.load);
  if (active.length === 0) return [];

  const n = Math.min(picked.length, LANE_COUNT * CELL_COUNT);
  const quota = new Array<number>(LANE_COUNT).fill(0);
  let left = n;

  for (const a of active) {
    if (left <= 0) break;
    quota[a.lane] = 1;
    left -= 1;
  }
  while (left > 0) {
    let best = -1;
    let bestRatio = -1;
    for (const a of active) {
      if (quota[a.lane]! >= CELL_COUNT) continue;
      const ratio = a.load / (quota[a.lane]! + 1);
      if (ratio > bestRatio) { bestRatio = ratio; best = a.lane; }
    }
    if (best < 0) break;
    quota[best]! += 1;
    left -= 1;
  }
  // 有怪的列站满了还有人：放到邻列支援（打/修能跨列打回去）
  while (left > 0) {
    let best = -1;
    let bestLoad = -1;
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      if (quota[lane]! >= CELL_COUNT) continue;
      const neighbor = active
        .filter((a) => Math.abs(a.lane - lane) === 1)
        .reduce((s, a) => s + a.load, 0);
      if (neighbor > bestLoad) { bestLoad = neighbor; best = lane; }
    }
    if (best < 0) break;
    quota[best]! += 1;
    left -= 1;
  }

  // 先把各路最前格填满再往后走，怪多的路先拿人
  const slots: { lane: number; cell: number }[] = [];
  const order = [...active.map((a) => a.lane)];
  for (let lane = 0; lane < LANE_COUNT; lane += 1) {
    if (!order.includes(lane) && quota[lane]! > 0) order.push(lane);
  }
  for (let cell = 0; cell < CELL_COUNT; cell += 1) {
    for (const lane of order) {
      if (quota[lane]! > cell) slots.push({ lane, cell });
    }
  }

  const byPref = [...picked].sort(
    (a, b) => ROLE_CELL_PREF[a.villager.role] - ROLE_CELL_PREF[b.villager.role],
  );
  const out: Placement[] = [];
  byPref.forEach((c, i) => {
    const slot = slots[i];
    if (!slot) return;
    out.push({
      villager: c.villager,
      lane: slot.lane,
      cell: slot.cell,
      evoStage: c.evoStage,
      stars: c.stars,
      craft: c.craft,
    });
  });
  return out;
}

/**
 * 乱来布阵：按固定顺序取人、按固定顺序填格，不看敌方门路也不看出怪口。
 *
 * 它是护栏的负样本。**不用随机**，否则同一个种子跑出来的差值会飘。
 */
export function dumbPlace(
  pool: readonly Candidate[],
  cap: number,
  offset = 0,
): Placement[] {
  const out: Placement[] = [];
  const n = Math.min(cap, pool.length);
  for (let i = 0; i < n; i += 1) {
    const c = pool[(i + offset) % pool.length]!;
    // 只往最左边两列堆。人一多，光栅填满等于均匀铺开，乱排就不再笨。
    const lane = (i + offset) % 2;
    const cell = Math.floor((i + offset) / 2) % CELL_COUNT;
    out.push({
      villager: c.villager,
      lane,
      cell,
      evoStage: c.evoStage,
      stars: c.stars,
      craft: c.craft,
    });
  }
  return out;
}
