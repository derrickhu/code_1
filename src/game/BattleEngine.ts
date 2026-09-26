/**
 * 战斗引擎：3 路 × 4 格的分路自动塔防。
 *
 * **这是战斗规则的唯一真源。** 渲染层（BattleScene）和模拟器（formulas/simulate）
 * 都驱动同一个 `tick`，不许任何一边自己算一套 —— 否则护栏测的就不是真代码。
 * 村民「打不打得到」只走 `@/game/reach`。
 * 怪物怎么走只走 `@/game/march`，停哪 / 挥不挥刀只走 `@/game/foeEngage`。
 *
 * 失败条件是**漏怪到底线或超时**（§4.4），不再是队灭。三件事必须让
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
  ARMOR_K, BOSS_ATK_MUL, BOSS_HP_MUL, BOSS_LEAK, BOSS_SPD_MUL, CELL_COUNT,
  EARLY_CALL_MS, FOE_ATK_MUL, FOE_SPD_MUL, GOAL_POS, HARD_FOE_CC, HEAL_ATK_CUT, HEAL_MUL,
  LANE_COUNT, LEAK_ALLOW, RAGE_BONUS, SKILL_NEAR, SKILL_NEAR_SIDE, SLOW_MS, SLOW_MUL, TICK_MS,
  WAVE_GAP_MS,
  cellPos,
} from '@/balance/combat';
import {
  ENERGY_ACT_PER_S, ENERGY_HIT, ENERGY_MAX, ENERGY_PER_S, ENERGY_START, SKILL_EXECUTE, SKILL_WAIT_MS,
  chargeMul, skillAt, skillPow, skillPower, type SkillDef,
} from '@/balance/skills';
import {
  getEnemy, rateStars,
  type EnemyDef, type StageDef, type Stars,
} from '@/balance/stages';
import {
  evoKindOf, evoPowOf, laneMul, statsOf,
  type EvoKind, type Role, type VillagerDef,
} from '@/balance/villagers';
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

/** 一个村民在战场上的位置与形态。布阵阶段由玩家摆，开打后锁死 */
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
  | { kind: 'skillHit'; uid: string; foeId: number; damage: number; killed: boolean }
  | { kind: 'bossIn'; foeId: number; lane: number };

export type BattlePhase = 'placing' | 'fighting' | 'won' | 'lost';
export type LoseReason = 'leak' | 'timeout';

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
  leaked: number;
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
        });
      }
    }
  });
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** 每条路总共要来多少只。场上的出怪口玩家看得见，这不是偷看 */
export function laneLoad(stage: StageDef): number[] {
  const load = new Array<number>(LANE_COUNT).fill(0);
  for (const w of stage.waves) {
    for (const g of w.groups) load[g.lane % LANE_COUNT]! += g.count;
  }
  return load;
}

/**
 * 开一局，落在布阵阶段。
 *
 * 布阵不给默认空阵：第一关必须预置一套能过的阵型，
 * 否则新手第一眼看到的是十二个空格子和一句「请布阵」，撞「十秒可懂」。
 */
export function createBattle(
  stage: StageDef,
  bench: readonly Candidate[],
  cap: number,
  villageMul = 1,
  preset?: readonly Placement[],
): BattleState {
  return {
    stage,
    phase: 'placing',
    villageMul,
    bench: [...bench],
    cap: Math.max(1, Math.min(LANE_COUNT * CELL_COUNT, Math.floor(cap))),
    placed: preset ? [...preset] : autoPlace(bench, stage, cap),
    team: [],
    foes: [],
    schedule: buildSchedule(stage),
    spawnIdx: 0,
    wave: 0,
    leaked: 0,
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
  if (kind === 'pierce') {
    const a = list[0]!;
    const b = list[1];
    return b ? [{ foe: a, mul: 1 }, { foe: b, mul: PIERCE_MUL * pow }] : [{ foe: a, mul: 1 }];
  }
  if (kind === 'cleave') {
    return list.slice(0, CLEAVE_MAX).map((foe, i) => ({
      foe, mul: i === 0 ? 1 : CLEAVE_MUL * pow,
    }));
  }
  return [{ foe: list[0]!, mul: 1 }];
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
    foe.alive = false;
    state.events.push({ kind: 'foeDown', foeId: foe.id, lane: foe.lane });
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
    if (killed) {
      e.alive = false;
      state.events.push({ kind: 'foeDown', foeId: e.id, lane: e.lane });
    }
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
    if (e.hp <= 0) {
      e.alive = false;
      state.events.push({ kind: 'foeDown', foeId: e.id, lane: e.lane });
    }
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
    swung: false,
  };
}

/**
 * 造一只进场的外星人。出怪时间轴和孵化器下的蛋走同一条，
 * 否则「蛋没吃到关卡倍率」这种 bug 要到第 30 章才看得出来。
 */
function newFoe(state: BattleState, enemyId: string, lane: number, pos = 0, boss = false): Foe {
  const def = getEnemy(enemyId);
  const foe = foeOf(def, state.nextFoeId, lane, pos);
  const hpMul = boss ? BOSS_HP_MUL : 1;
  foe.hp = Math.round(def.hp * state.stage.hpMul * hpMul);
  foe.maxHp = foe.hp;
  foe.atk = def.atk * state.stage.atkMul * FOE_ATK_MUL * (boss ? BOSS_ATK_MUL : 1);
  foe.spd = def.spd * FOE_SPD_MUL * (boss ? BOSS_SPD_MUL : 1);
  foe.boss = boss;
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
  // 定身、击退留到怪贴上来再用。半路上定住只会拖时间
  if ((sk.stunMs || sk.push) && foes.some((e) => foeClose(state, e))) return true;
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
    if (sk.dmg) {
      const raw = effAtk(f) * sk.dmg * power;
      const damage = foeTake(e, dmgOf(raw, e.armor, laneMul(f.def.lane, e.def.lane)));
      e.hp -= damage;
      state.skillDmg += damage;
      if (!e.boss && e.hp > 0 && e.hp < e.maxHp * SKILL_EXECUTE) e.hp = 0;
      const killed = e.hp <= 0;
      state.events.push({ kind: 'skillHit', uid: f.uid, foeId: e.id, damage, killed });
      if (killed) {
        e.alive = false;
        state.skillKills += 1;
        state.events.push({ kind: 'foeDown', foeId: e.id, lane: e.lane });
        continue;
      }
    }
    if (sk.slowMs && !e.def.steady) e.slowMs = Math.max(e.slowMs, sk.slowMs * pow);
    // 自动放的定身、击退只落在已经到人跟前的怪身上。整路一起定，半路上的全被钉死，走不到人跟前
    if (!manual && !foeClose(state, e)) continue;
    const cc = e.boss || e.def.steady ? HARD_FOE_CC : 1;
    if (sk.stunMs) e.stunMs = Math.max(e.stunMs, sk.stunMs * pow * cc);
    if (sk.push) e.pos = Math.max(0, e.pos - sk.push * pow * cc);
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

/** 这一刻算下来的时间轴位置。星评、超时、时间条都按它 */
export function battleClockMs(state: Pick<BattleState, 'elapsedMs' | 'skippedMs'>): number {
  return state.elapsedMs + state.skippedMs;
}

function tickBuffs(f: Fighter): void {
  if (f.guardMs > 0) f.guardMs = Math.max(0, f.guardMs - TICK_MS);
  if (f.hasteMs > 0) f.hasteMs = Math.max(0, f.hasteMs - TICK_MS);
}

/** 场上清空了，下一波别让人干等满 10 秒 */
function callEarly(state: BattleState): void {
  const next = state.schedule[state.spawnIdx];
  if (!next || state.wave === 0 || next.wave <= state.wave) return;
  if (state.foes.some((e) => e.alive)) return;
  const wait = next.atMs - state.elapsedMs;
  if (wait <= EARLY_CALL_MS) return;
  const cut = wait - EARLY_CALL_MS;
  for (let i = state.spawnIdx; i < state.schedule.length; i += 1) state.schedule[i]!.atMs -= cut;
  state.skippedMs += cut;
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

  const { stage } = state;

  callEarly(state);

  // 出怪
  while (state.spawnIdx < state.schedule.length
    && state.schedule[state.spawnIdx]!.atMs <= state.elapsedMs) {
    const s = state.schedule[state.spawnIdx]!;
    if (s.wave > state.wave) {
      state.wave = s.wave;
      state.events.push({ kind: 'waveStart', wave: s.wave });
    }
    const foe = newFoe(state, s.enemy, s.lane, 0, s.boss);
    state.foes.push(foe);
    if (s.boss) state.events.push({ kind: 'bossIn', foeId: foe.id, lane: foe.lane });
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
        e.alive = false;
        state.leaked += e.boss ? BOSS_LEAK : 1;
        state.events.push({ kind: 'leak', foeId: e.id, lane: e.lane });
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
    f.cd -= f.hasteMs > 0 ? TICK_MS / f.hasteMul : TICK_MS;
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
  }

  for (const f of state.team) {
    state.lowHpFrac = Math.min(state.lowHpFrac, f.alive ? f.hp / f.maxHp : 0);
  }

  const alive = state.foes.filter((e) => e.alive).length;

  if (state.leaked >= LEAK_ALLOW) {
    lose(state, 'leak');
    return;
  }

  if (state.spawnIdx >= state.schedule.length && alive === 0) {
    state.phase = 'won';
    state.stars = rateStars(
      state.leaked,
      state.team.filter((f) => !f.alive).length,
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

/** 倒了几个人 */
export function fallenCount(state: BattleState): number {
  return state.team.filter((f) => !f.alive).length;
}

/** 把死掉的清出数组。渲染层放完死亡动画后调，省得数组无限长 */
export function reapFoes(state: BattleState): void {
  state.foes = state.foes.filter((e) => e.alive);
}

/**
 * 看广告续一条命：把漏怪数清回 0，场上外星人清掉一半。
 *
 * 只清一半而不是全清：全清等于把这一波白送，玩家下次会故意漏到 2 个再看广告。
 */
export function reviveAfterLeak(state: BattleState): void {
  if (state.phase !== 'lost') return;
  state.leaked = 0;
  state.loseReason = undefined;
  const half = Math.ceil(foesAlive(state) / 2);
  let cut = 0;
  for (const e of state.foes) {
    if (!e.alive || cut >= half) continue;
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
}

/** GM：直接判赢，用来跳关 */
export function gmWin(state: BattleState): void {
  state.phase = 'won';
  state.stars = 3;
}

/* ---------------- 一次跑完（模拟器 / 护栏用） ---------------- */

export interface BattleResult {
  won: boolean;
  /** 'clear' 打完了 | 'leak' 漏够了 | 'timeout' 超时 */
  reason: 'clear' | 'leak' | 'timeout';
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
  /** 上场的村民 id */
  squad: string[];
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
): BattleResult {
  const state = createBattle(stage, [], place.length || 1, villageMul, place);
  state.autoSkill = autoSkill;
  startFight(state);

  const guard = Math.ceil(stage.timeLimitMs / TICK_MS) + 64;
  for (let i = 0; i < guard && state.phase === 'fighting'; i += 1) {
    state.events.length = 0;
    tick(state);
  }

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
