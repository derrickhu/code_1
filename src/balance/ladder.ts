/**
 * 难度阶梯。打通一档解锁下一档。
 *
 * 这是长线的主力，抄的是 Hades 的 Heat 与杀戮尖塔的 Ascension：
 * **每档改的是规则，不是纯数值。** 对一个把「系统太多」写进反目标的项目，
 * 这条路最合身 —— 它不新增货币、不新增养成线、不新增界面系统，
 * 只是把同一局重新出题。
 *
 * 为什么不做数值型阶梯（怪血量 ×1.2 那种）：那等于把 WAVE_CURVE 再乘一遍，
 * 玩家的应对手段一点没变，只是把同一局打得更久。改规则才会逼出新配法，
 * 而「这一局变成了什么」才是主体验（docs/00-体验目标.md §3）。
 *
 * 三条规则各打一个不同的地方，而且**每一条都是每局必然生效的**：
 *
 * - 第一档动**出怪密度** → 半程再来一小队，溅射和拖住的价值上浮
 * - 第二档动**节拍** → 下一批来得更急，留给清场的窗口变窄
 * - 第三档动**容错** → 倒下爬得慢，一次失手的代价大得多
 *
 * 三条累积：第三档同时带着前两档。
 *
 * **挑规则时废掉了四条，教训都在这儿。** 阶梯规则要同时满足三件事：
 * 每局都生效、改动能被量出来、而且**不能掐掉唯一可行的策略**。
 *
 * - 「一局少发一件破烂」：一局平均只发 5.4 件，7 件的上限根本没摸到，等于空规则
 * - 「放小东西的冷却拉长」：召唤件在 15 件池子里只占 3 件，多数局压根没抽到
 * - 「三选一改二选一」：真人会难受，但模拟里 smart 恒挑第一张，两档跑出来
 *   连随机序列都一模一样。量不出来的规则立不住护栏
 * - 「每人装配位砍到 2」：这条最险。它不是变难，是把「堆一个人」这条
 *   通关主路径直接掐了 —— 到第 12 波的比例从 14% 掉到 **0%**，
 *   分布死死压在第 9 到 10 波，玩家连「运气好能打远一点」的空间都没有
 */

export interface LadderRule {
  lv: number;
  name: string;
  /** 选档时给玩家看的一句话。说清这一档难在哪，别只说「更难」 */
  pitch: string;
  /**
   * 多来一队外星人：每个刻度在半程处按这个比例再放一批。
   * 0 是不加。改的是「来几批」，不是「每只多硬」。
   */
  extraSquadPct: number;
  /** 每个刻度缩短多少（百分比）。下一批来得更急 */
  hastePct: number;
  /** 倒地自愈时间乘多少 */
  downMult: number;
}

const PLAIN: LadderRule = {
  lv: 0,
  name: '照旧',
  pitch: '村口原来的样子',
  extraSquadPct: 0,
  hastePct: 0,
  downMult: 1,
};

export const LADDER: readonly LadderRule[] = [
  {
    lv: 1,
    name: '又来一队',
    pitch: '每一波半程再来一小队，场面更挤',
    extraSquadPct: 10,
    hastePct: 0,
    downMult: 1,
  },
  {
    lv: 2,
    name: '不给喘气',
    pitch: '下一批来得更急，清场的窗口更窄',
    extraSquadPct: 10,
    hastePct: 14,
    downMult: 1,
  },
  {
    lv: 3,
    name: '爬不起来',
    pitch: '倒下了得躺好一会儿，一次失手就够呛',
    extraSquadPct: 10,
    hastePct: 14,
    downMult: 1.4,
  },
];

export const LADDER_TOP = LADDER.length;

/**
 * 打到第几波就算把这一档打服了，解锁下一档。
 *
 * **刻意不用「通关」当门槛。** 照旧那一档的通关率是 21%，阶梯只要有感就会
 * 把它按到 3% 以下 —— 拿通关当门槛意味着解锁下一档平均要打三十局，
 * 长线会变成卡死而不是延长。改用第 12 波之后，逐档的达成率是
 * 38% → 14% → 7% → 2%，走完三档大约三十局，这才是能走动的坡。
 */
export const LADDER_GATE_WAVE = 12;

/** 这一局够不够解锁下一档 */
export function ladderPassed(reachedWave: number, cleared: boolean): boolean {
  return cleared || reachedWave >= LADDER_GATE_WAVE;
}

export function ladderRule(lv: number): LadderRule {
  return LADDER.find((r) => r.lv === lv) ?? PLAIN;
}

/** 这一档的刻度有多长 */
export function ladderStageMs(lv: number, baseMs: number): number {
  return Math.round((baseMs * (100 - ladderRule(lv).hastePct)) / 100);
}

export function ladderDownMult(lv: number): number {
  return Math.max(1, ladderRule(lv).downMult);
}

export function ladderExtraPct(lv: number): number {
  return Math.max(0, ladderRule(lv).extraSquadPct);
}

export function ladderName(lv: number): string {
  return ladderRule(lv).name;
}
