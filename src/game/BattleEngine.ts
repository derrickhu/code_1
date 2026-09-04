/**
 * 战斗引擎：3 路 × 4 格的分路自动塔防。
 *
 * **这是战斗规则的唯一真源。** 渲染层（BattleScene）和模拟器（formulas/simulate）
 * 都驱动同一个 `tick`，不许任何一边自己算一套 —— 否则护栏测的就不是真代码。
 *
 * 失败条件是**漏怪到底线或超时**（§4.4），不再是队灭。三件事必须让
 * 「谁放哪一格」真的有后果，否则布阵就是假决策：
 *
 * 1. **阻挡几何**：地面怪被这一路上最靠前的活人挡住，挡住才开打。
 *    所以谁站 cell 0 决定谁先挨，这是布阵最直接的一笔。
 * 2. **飞碟点后排**：飞的不被阻挡，而且专挑这一路**最后排**的人打。
 *    把脆皮塞到后面躲刀，遇到飞碟章就是送 —— 后排不是安全区。
 * 3. **空路直接漏**：一路没人就是一路通天。12 格只有 8 个人，
 *    三路都想守厚是不可能的，这就是取舍。
 *
 * 引擎是**确定性**的：同样的布阵和关卡，结果永远一样。
 * 不掺随机是因为护栏要能断言「换个排法通关率差 20 个点」这种事，
 * 随机会把信号埋进噪声里。变化量交给布阵和养成，不交给骰子。
 */
import {
  ARMOR_K, CELL_COUNT, GOAL_POS, HEAL_ATK_CUT, HEAL_MUL,
  LANE_COUNT, LEAK_ALLOW, RAGE_BONUS, SLOW_MS, SLOW_MUL, TICK_MS, WAVE_GAP_MS,
  cellPos,
} from '@/balance/combat';
import {
  getEnemy, rateStars,
  type EnemyDef, type StageDef, type Stars,
} from '@/balance/stages';
import {
  laneMul, statsOf,
  type Role, type VillagerDef,
} from '@/balance/villagers';

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
}

/** 场上的村民 */
export interface Fighter {
  /** 场上唯一 id。同一个村民不会重复上场，但留着给渲染层做 key */
  uid: string;
  def: VillagerDef;
  lane: number;
  cell: number;
  pos: number;
  /** 几阶。渲染层按它换家伙和穿戴，见 gear.handIdOf / gear.wearOf */
  evoStage: number;
  stars: number;
  hp: number;
  maxHp: number;
  atk: number;
  armor: number;
  range: number;
  interval: number;
  cd: number;
  alive: boolean;
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
  /** 减速剩余 ms，由「拦」位施加 */
  slowMs: number;
  alive: boolean;
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
  | { kind: 'foeDown'; foeId: number; lane: number }
  | { kind: 'leak'; foeId: number; lane: number }
  | { kind: 'waveStart'; wave: number };

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
}

export interface Candidate {
  villager: VillagerDef;
  evoStage: number;
  stars: number;
}

interface Spawn {
  atMs: number;
  lane: number;
  enemy: string;
  wave: number;
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
  };
}

function fighterOf(p: Placement, villageMul: number, i: number): Fighter {
  const s = statsOf(p.villager, p.evoStage, p.stars, villageMul);
  return {
    uid: `${p.villager.id}#${i}`,
    def: p.villager,
    lane: p.lane,
    cell: p.cell,
    pos: cellPos(p.cell),
    evoStage: p.evoStage,
    stars: p.stars,
    hp: s.hp,
    maxHp: s.hp,
    atk: s.atk,
    armor: s.def,
    range: s.range,
    interval: s.interval,
    cd: 0,
    alive: true,
  };
}

/** 布阵定稿，开打。开打之后 placed 不再生效 */
export function startFight(state: BattleState): void {
  if (state.phase !== 'placing') return;
  state.team = state.placed.map((p, i) => fighterOf(p, state.villageMul, i));
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
    return true;
  }
  if (state.placed.length >= state.cap) return false;
  state.placed.push({
    villager: cand.villager, lane, cell,
    evoStage: cand.evoStage, stars: cand.stars,
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

/** 地面怪被这一路最靠前的活人挡住。返回那个人 */
export function blockerFor(foe: Foe, team: readonly Fighter[]): Fighter | undefined {
  let best: Fighter | undefined;
  for (const f of team) {
    if (!f.alive || f.lane !== foe.lane) continue;
    if (f.pos < foe.pos - 0.5) continue; // 已经被越过去了
    if (!best || f.pos < best.pos) best = f;
  }
  return best;
}

/** 飞的专挑这一路最后排的人 */
export function sniperTarget(foe: Foe, team: readonly Fighter[]): Fighter | undefined {
  let best: Fighter | undefined;
  for (const f of team) {
    if (!f.alive || f.lane !== foe.lane) continue;
    if (!best || f.cell > best.cell) best = f;
  }
  return best;
}

/** 村民打自己这一路射程内最靠前（走得最远）的那只 */
export function pickFoe(f: Fighter, foes: readonly Foe[]): Foe | undefined {
  let best: Foe | undefined;
  for (const e of foes) {
    if (!e.alive || e.lane !== f.lane) continue;
    const gap = f.pos - e.pos;
    if (gap > f.range || gap < -0.5) continue;
    if (!best || e.pos > best.pos) best = e;
  }
  return best;
}

/** 「修」位挑血量比例最低的队友 */
function pickHurt(team: readonly Fighter[]): Fighter | undefined {
  let best: Fighter | undefined;
  for (const f of team) {
    if (!f.alive || f.hp >= f.maxHp) continue;
    if (!best || f.hp / f.maxHp < best.hp / best.maxHp) best = f;
  }
  return best;
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

/* ---------------- 主循环 ---------------- */

function lose(state: BattleState, reason: LoseReason): void {
  state.phase = 'lost';
  state.loseReason = reason;
  state.stars = 0;
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

  // 出怪
  while (state.spawnIdx < state.schedule.length
    && state.schedule[state.spawnIdx]!.atMs <= state.elapsedMs) {
    const s = state.schedule[state.spawnIdx]!;
    const def = getEnemy(s.enemy);
    if (s.wave > state.wave) {
      state.wave = s.wave;
      state.events.push({ kind: 'waveStart', wave: s.wave });
    }
    state.foes.push({
      id: state.nextFoeId,
      def,
      lane: s.lane,
      pos: 0,
      hp: Math.round(def.hp * stage.hpMul),
      maxHp: Math.round(def.hp * stage.hpMul),
      atk: def.atk * stage.atkMul,
      armor: def.def,
      cd: 0,
      slowMs: 0,
      alive: true,
    });
    state.nextFoeId += 1;
    state.spawnIdx += 1;
  }

  // 外星人动
  for (const e of state.foes) {
    if (!e.alive) continue;
    if (e.slowMs > 0) e.slowMs = Math.max(0, e.slowMs - TICK_MS);

    const target = e.def.flying
      ? sniperTarget(e, state.team)
      : blockerFor(e, state.team);
    const inRange = target !== undefined
      && target.pos - e.pos <= e.def.range
      && target.pos - e.pos >= -0.5;

    if (inRange && target) {
      e.cd -= TICK_MS;
      if (e.cd <= 0) {
        e.cd = e.def.interval;
        const damage = dmgOf(e.atk, target.armor, laneMul(e.def.lane, target.def.lane));
        target.hp -= damage;
        state.events.push({ kind: 'foeHit', foeId: e.id, uid: target.uid, damage });
        if (target.hp <= 0) {
          target.alive = false;
          state.events.push({ kind: 'villagerDown', uid: target.uid });
        }
      }
    } else {
      e.pos += e.def.spd * (e.slowMs > 0 ? SLOW_MUL : 1) * (TICK_MS / 1000);
      if (e.pos > GOAL_POS) {
        e.alive = false;
        state.leaked += 1;
        state.events.push({ kind: 'leak', foeId: e.id, lane: e.lane });
      }
    }
  }

  // 村民动
  for (const f of state.team) {
    if (!f.alive) continue;
    f.cd -= TICK_MS;
    if (f.cd > 0) continue;

    if (f.def.role === 'heal') {
      const hurt = pickHurt(state.team);
      if (hurt) {
        const amount = Math.min(hurt.maxHp - hurt.hp, Math.round(f.atk * HEAL_MUL));
        hurt.hp += amount;
        f.cd = f.interval;
        state.events.push({ kind: 'heal', uid: f.uid, targetUid: hurt.uid, amount });
        continue;
      }
    }

    const foe = pickFoe(f, state.foes);
    if (!foe) continue;
    f.cd = f.interval;
    const raw = effAtk(f) * (f.def.role === 'heal' ? HEAL_ATK_CUT : 1);
    const damage = dmgOf(raw, foe.armor, laneMul(f.def.lane, foe.def.lane));
    foe.hp -= damage;
    const killed = foe.hp <= 0;
    state.events.push({ kind: 'hit', uid: f.uid, foeId: foe.id, damage, killed });
    if (killed) {
      foe.alive = false;
      state.events.push({ kind: 'foeDown', foeId: foe.id, lane: foe.lane });
    } else if (f.def.role === 'block') {
      foe.slowMs = SLOW_MS;
    }
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
      state.elapsedMs,
      stage.parMs,
    );
    return;
  }

  state.elapsedMs += TICK_MS;
  if (state.elapsedMs > stage.timeLimitMs) lose(state, 'timeout');
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
): BattleResult {
  const state = createBattle(stage, [], place.length || 1, villageMul, place);
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
    let s = c.evoStage * 10 + c.stars;
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

  const quota = COMP[Math.max(3, Math.min(8, cap))] ?? COMP[8]!;
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

  // 先把各路最前格填满再往后走，怪多的路先拿人
  const slots: { lane: number; cell: number }[] = [];
  for (let cell = 0; cell < CELL_COUNT; cell += 1) {
    for (const a of active) {
      if (quota[a.lane]! > cell) slots.push({ lane: a.lane, cell });
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
    const slot = (i + offset) % (LANE_COUNT * CELL_COUNT);
    out.push({
      villager: c.villager,
      lane: slot % LANE_COUNT,
      cell: Math.floor(slot / LANE_COUNT) % CELL_COUNT,
      evoStage: c.evoStage,
      stars: c.stars,
    });
  }
  return out;
}
