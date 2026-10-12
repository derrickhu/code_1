/**
 * 局内层：电池、乡亲支招（波间三选一）、焊一下、增援、家伙事。
 *
 * 2026-10 上线数据：68% 的人首日不到 1 分钟，1-1 没打完就走的平均只看了 16 秒。
 * 开打以后一局里什么都不会变，玩家唯一能做的是看。这一层就是让「一局之中」有东西可选、有东西会变：
 *
 * - 外星人掉**电池**（只在这一局有效，不进存档，不算第五种资源）。
 * - 每波打完弹**三选一**，选完立刻在场上看得见变化。
 * - 花电池**焊一下**：本关让一个人直接变下一阶。
 * - 花电池**增援**：把板凳上的人、倒下的人送上空格。
 *
 * 硬规定：每张卡都要在场上看得见变化，文案里不写百分比；
 * 所有操作都有自动兜底，不点也能过，点了更爽、更强。
 * 护栏跑的是「全托管」这条线（见 formulas/simulate），关卡血量按它补，手动只会更好打。
 */
import type { UiName } from '@/core/TextureLoader';

/* ---------------- 电池 ---------------- */

/** 第 1 只必掉，之后每隔一只掉一节；大个子掉一把 */
export const CELL_EVERY = 2;
export const CELL_BOSS = 3;
/** 小头目掉一把，下一回三选一连拿两张 */
export const CELL_ELITE = 2;
/** 掉在地上多久没人点就自己飞进来。点了马上到手，不点也不丢 */
export const CELL_TTL_MS = 3000;
/** 一波一个没漏，额外给这么多 */
export const CELL_CLEAN = 2;

/* ---------------- 增援 / 焊一下 ---------------- */

/** 上阵价：按这个人现在几阶算。三阶贵，但一个顶一路 */
export const DEPLOY_COST: readonly [number, number, number] = [2, 3, 4];
/** 倒下的人再送上去，多花这么多。一个人一局只能再上一次 */
export const REDEPLOY_EXTRA = 1;
/**
 * 从这一关起才能把倒下的人再喊上来。1-5 是逼新人回村练手艺的墙，
 * 倒了能再上就永远倒不光，墙就没了
 */
export const REDEPLOY_FROM_STAGE = 6;
/** 开打后能比上场人数多站几个。板凳上有人才有用 */
export const EXTRA_SEATS = 1;
/**
 * 焊一下的价（按焊之前几阶）、面板倍数。焊完血补满。
 * 只在最后一波或大个子在场时能焊，一关只焊 WELD_MAX 个人：这是一关的高潮，焊谁是个选择，
 * 不是电池够了挨个焊一遍。已经三阶的人焊不出新样子，只吃倍数。
 */
export const WELD_COST: readonly [number, number, number] = [5, 6, 7];
export const WELD_MUL = 1.35;
export const WELD_MAX = 1;
/** 换一批卡的价，每次三选一只能换一回 */
export const REROLL_COST = 2;

/**
 * 托管兜底的等待（战斗时间）。真机里自动开着时也走这一套：
 * 玩家没动手，过一会儿替他做；动了手就是他自己的。
 */
export const AUTO_DEPLOY_MS = 5000;
export const AUTO_WELD_MS = 2500;
export const AUTO_GADGET_MS = 4000;
/** 三选一没点，过这么久按推荐那张选（真实时间，场景层算） */
export const OFFER_AUTO_S = 12;
/** 家伙事最多攒几件 */
export const GADGET_MAX = 3;

/* ---------------- 家伙事 ---------------- */

/** 鞭炮串：人最多那一路每只吃这么多「小灰血」 */
export const CRACKER_GRUNTS = 1.6;
/** 大喇叭：全场愣住多久 */
export const HORN_STUN_MS = 2500;
/** 广场舞音响：全村人出手间隔乘这个，持续多久 */
export const DANCE_HASTE = 0.6;
export const DANCE_MS = 8000;
/** 拖拉机：人最多那一路往回撞多远、每只吃多少「小灰血」 */
export const TRACTOR_PUSH = 1.4;
export const TRACTOR_GRUNTS = 0.8;

/* ---------------- 焊上去 ---------------- */

/** 鼓风机：打穿一只，后面那只吃这么多 */
export const BLOWER_PIERCE = 0.6;
/** 二踢脚：旁边再炸两只，各吃这么多 */
export const KICKER_SPLASH = 0.35;
export const KICKER_N = 2;
/** 二踢脚炸多远（轴格），只炸同一路 */
export const KICKER_R = 1.2;
/** 电瓶：出手间隔乘这个 */
export const BATTERY_INTERVAL = 0.75;
/** 铁锅盖：血、护甲乘这个 */
export const WOK_HP = 1.5;
export const WOK_DEF = 1.3;
/** 秤砣：攻击乘这个 */
export const WEIGHT_ATK = 1.4;
/**
 * 一关里每这么多人才能焊一件。焊件是按人给的：三个人拿四件就人人满配，
 * 十二个人拿四件才三分之一，不封顶前期被焊件碾过去、后期又没感觉
 */
export const MOD_PER = 3;

/* ---------------- 加把劲 ---------------- */

/* 赶集换几节、大锅饭扶起来剩几成血按档次走，见 MARKET_TIER / FEAST_TIER */

/* ---------------- 乡亲路过 ---------------- */

/** 路过的人按几阶来。二阶立绘现成，一亮相就比开局那几个人好看 */
export const GUEST_EVO = 2;
/** 一关最多路过几位。多了就是白送一支队 */
export const GUEST_MAX = 1;

/* ---------------- 档次 ---------------- */

/**
 * 卡分三档：普通、好货、压箱底。同一张卡档次越高劲儿越大，卡面颜色一眼分得开。
 *
 * 杀戮尖塔、Hades、土豆兄弟都是这一套：三选一要是三张差不多，选哪张都一样，
 * 玩家就不看了。上线前实测过 —— 不分档时强拿任何一张，通关率全挤在 89%~94%，
 * 「推荐」那张还不如闭眼拿第一张。分了档，选好货、选压箱底就是看得见的差别。
 */
export type Tier = 0 | 1 | 2;
export const TIER_NAME: readonly [string, string, string] = ['普通', '好货', '压箱底'];
/** 焊件、赶集、大锅饭按这个放大 */
export const TIER_POW: readonly [number, number, number] = [1, 1.5, 2.2];
/** 家伙事：好货、压箱底劲儿一样大，压箱底多攒一件 */
export const GADGET_TIER: readonly { n: number; pow: number }[] = [
  { n: 1, pow: 1 },
  { n: 1, pow: 1.6 },
  { n: 2, pow: 1.6 },
];
/** 一张卡抽成好货、压箱底的底概率 */
export const TIER_RARE = 0.2;
export const TIER_GOLD = 0.04;
/**
 * 保底：一回三选一没见着压箱底，下一回每张卡出压箱底的概率再涨这么多，见着了清零。
 * 杀戮尖塔稀有卡的「越久没出越容易出」，不然一关出不了一张，档次等于没有
 */
export const GOLD_PITY_STEP = 0.03;
/** 大礼包（打倒大个子、小头目）里压箱底概率翻倍，且至少一张好货 */
export const BIG_GOLD_MUL = 2;
/** 赶集各档换几节电池 */
export const MARKET_TIER: readonly [number, number, number] = [5, 8, 12];
/** 大锅饭：倒下的扶起来剩几成血。压箱底满血，劲头也满 */
export const FEAST_TIER: readonly [number, number, number] = [0.5, 0.8, 1];
/** 路过的人：几阶、比队里平均手艺高几档 */
export const GUEST_TIER: readonly { evo: number; craft: number }[] = [
  { evo: 2, craft: 0 },
  { evo: 2, craft: 3 },
  { evo: 3, craft: 3 },
];

/**
 * 压箱底从第 2 章才出。1-5 是逼新人回村练手艺的墙，
 * 第 1 章抽到一台压箱底拖拉机就能绕过去，那堵墙就成了看运气
 */
export const GOLD_FROM_STAGE = 6;
/**
 * 看一段拿压箱底：三张卡底下多挂一张压箱底，看完白拿，照样还能挑一张。
 * 一局一次、一天几次。和压箱底同一关起卖：第 1 章不卖，刚进门就看视频太像逼，
 * 也不许拿视频买穿 1-5 那堵墙
 */
export const AD_GOLD_FROM_STAGE = GOLD_FROM_STAGE;

export type BoostKind = 'gadget' | 'mod' | 'guest' | 'rule';

export type GadgetId = 'g_cracker' | 'g_horn' | 'g_dance' | 'g_tractor';
export type ModId = 'm_blower' | 'm_kicker' | 'm_battery' | 'm_wok' | 'm_weight';
export type BoostId = GadgetId | ModId | 'v_guest' | 'r_market' | 'r_feast';

export interface BoostDef {
  id: BoostId;
  kind: BoostKind;
  /** 卡上的名字 */
  name: string;
  /**
   * 卡上那一句，按档次各一句。`{who}` 换成这张卡给谁（焊件给的人、路过的人）。
   * 说的是场上会发生什么，不写百分比。
   */
  lines: readonly [string, string, string];
  /** 卡面图标 */
  icon: UiName;
  /** 抽卡权重。条件不满足的卡不进池 */
  weight: number;
  /**
   * 推荐分的底子，普通档。是拿模拟器强拿每张卡量出来的排序，不是拍的：
   * 鞭炮串最顶用，赶集、大锅饭只在缺电池、倒了人时才值
   */
  value: number;
  /** 焊件挑谁：前排扛的还是出手的 */
  wants?: 'front' | 'hitter';
}

export const BOOSTS: readonly BoostDef[] = [
  {
    id: 'g_cracker', kind: 'gadget', name: '鞭炮串', icon: 'boost_cracker', weight: 3, value: 5,
    lines: [
      '攒一挂。点一下，人最多那一路噼里啪啦炸一串',
      '攒一挂加长的。点一下，人最多那一路炸得更狠',
      '攒两挂加长的。点两回，人最多那一路炸个透',
    ],
  },
  {
    id: 'g_horn', kind: 'gadget', name: '大喇叭', icon: 'boost_horn', weight: 2, value: 4.3,
    lines: [
      '攒一个。点一下吼一嗓子，全场外星人吓得愣住',
      '攒一个大号的。吼一嗓子，全场愣得更久',
      '攒两个大号的。吼两回，全场愣了又愣',
    ],
  },
  {
    id: 'g_dance', kind: 'gadget', name: '广场舞音响', icon: 'boost_dance', weight: 2, value: 4.7,
    lines: [
      '攒一台。点一下放起来，全村人跟着节奏出手飞快',
      '攒一台大功率的。放得更久，全村人出手飞快',
      '攒两台大功率的。放两回，一回比一回带劲',
    ],
  },
  {
    id: 'g_tractor', kind: 'gadget', name: '拖拉机', icon: 'boost_tractor', weight: 2, value: 4.7,
    lines: [
      '攒一台。点一下突突突开过去，一路外星人全撞回去',
      '攒一台加满油的。撞得更远、更狠',
      '攒两台加满油的。开两趟，一路外星人撞个稀烂',
    ],
  },
  {
    id: 'm_blower', kind: 'mod', name: '鼓风机', icon: 'boost_blower', weight: 3, value: 4.2, wants: 'hitter',
    lines: [
      '给{who}焊上：一下打穿，后面那只也挨',
      '给{who}焊上大号的：打穿过去，后面那只挨得差不多一样重',
      '给{who}焊上最大号的：一下穿两只，后头两只都挨满',
    ],
  },
  {
    id: 'm_kicker', kind: 'mod', name: '二踢脚', icon: 'boost_kicker', weight: 3, value: 4, wants: 'hitter',
    lines: [
      '给{who}焊上：每下都带个响，旁边两只一起炸',
      '给{who}焊上加料的：旁边两只炸得更狠',
      '给{who}焊上整盘的：旁边两只差不多挨满一下',
    ],
  },
  {
    id: 'm_battery', kind: 'mod', name: '电瓶', icon: 'boost_battery', weight: 2, value: 4.6, wants: 'hitter',
    lines: [
      '给{who}接上：手脚利索，出手快一大截',
      '给{who}接上两块：出手快一半',
      '给{who}接上一整排：出手快大七成',
    ],
  },
  {
    id: 'm_wok', kind: 'mod', name: '铁锅盖', icon: 'boost_wok', weight: 2, value: 4.2, wants: 'front',
    lines: [
      '给{who}顶上：血厚一半，挨揍不怕',
      '给{who}顶上双层的：血厚大半，挨揍更不怕',
      '给{who}顶上铸铁的：血厚一倍多，硬得像堵墙',
    ],
  },
  {
    id: 'm_weight', kind: 'mod', name: '秤砣', icon: 'boost_weight', weight: 2, value: 4.5, wants: 'hitter',
    lines: [
      '给{who}绑上：家伙一沉，一下顶一下半',
      '给{who}绑上大的：一下顶一下半还多',
      '给{who}绑上最大的：一下顶快两下',
    ],
  },
  {
    id: 'v_guest', kind: 'guest', name: '乡亲路过', icon: 'boost_guest', weight: 2, value: 4.5,
    lines: [
      '{who}路过，上来帮这一关',
      '{who}路过，手艺练得不错，上来帮这一关',
      '{who}换了最后一身路过，手艺也好，上来帮这一关',
    ],
  },
  {
    id: 'r_market', kind: 'rule', name: '赶集', icon: 'boost_market', weight: 2, value: 3.4,
    lines: [
      `集上换来 ${MARKET_TIER[0]} 节电池，焊一下、喊人上阵都用得上`,
      `赶上大集，换来 ${MARKET_TIER[1]} 节电池`,
      `赶上庙会，换来 ${MARKET_TIER[2]} 节电池，够焊一下再喊个人`,
    ],
  },
  {
    id: 'r_feast', kind: 'rule', name: '大锅饭', icon: 'growth_breath', weight: 1, value: 3,
    lines: [
      '全村吃一顿：血全补满，倒下的也扶起来',
      '全村吃顿好的：血全补满，倒下的扶起来还剩大半血',
      '全村摆席：血全补满，倒下的满血站起来，劲头全满',
    ],
  },
];

export const BOOST_BY_ID: Readonly<Record<BoostId, BoostDef>> = Object.fromEntries(
  BOOSTS.map((b) => [b.id, b]),
) as Record<BoostId, BoostDef>;

export function boostDef(id: BoostId): BoostDef {
  return BOOST_BY_ID[id];
}

export function isGadget(id: BoostId): id is GadgetId {
  return BOOST_BY_ID[id].kind === 'gadget';
}

export function isMod(id: BoostId): id is ModId {
  return BOOST_BY_ID[id].kind === 'mod';
}

/** 卡上那一句（还没换 {who}） */
export function boostLine(id: BoostId, tier: Tier = 0): string {
  return BOOST_BY_ID[id].lines[tier];
}

/** 推荐分里档次值多少。比劲儿倍数收一点：压箱底不该盖过「这路没人，快喊人」 */
export const TIER_SCORE: readonly [number, number, number] = [1, 1.35, 1.9];

/** 路过的人按几阶来。立绘、卡面都跟着它 */
export function guestEvo(tier: Tier = 0): number {
  return GUEST_TIER[tier]!.evo;
}

/**
 * 1-1 第一次三选一写死成三张最炸的：一挂鞭炮、给弹弓叔焊鼓风机、三婶路过。
 * 新人第一次选什么都能马上看见结果，不会抽到一张「赶集」。
 * 鼓风机给成好货，第一回就让人看见卡是分档的。
 */
export const OPENING_OFFER: readonly BoostId[] = ['g_cracker', 'm_blower', 'v_guest'];
export const OPENING_TIERS: readonly Tier[] = [0, 1, 0];
/** 1-1 路过的那位。她 1-2 打完就真来了，这一下算先认个脸 */
export const OPENING_GUEST = 'sanshen';
/** 1-1 鼓风机焊给谁 */
export const OPENING_MOD_TARGET = 'laoyanqiang';

function evoIdx(evoStage: number): number {
  return Math.max(0, Math.min(2, Math.floor(evoStage) - 1));
}

/** 增援价 */
export function deployCost(evoStage: number, again: boolean): number {
  return DEPLOY_COST[evoIdx(evoStage)]! + (again ? REDEPLOY_EXTRA : 0);
}

/** 这么多人一关最多焊几件 */
export function modCap(people: number): number {
  return Math.max(1, Math.ceil(people / MOD_PER));
}

/** 焊一下的价 */
export function weldCostOf(evoStage: number): number {
  return WELD_COST[evoIdx(evoStage)]!;
}
