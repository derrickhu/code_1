/**
 * 外星人与 40 关主线（8 章 × 5 关）。
 *
 * 曲线的锚点是「玩家从第 1 章到第 8 章总共能变强多少」，反推出来的：
 *
 *   进化 1 → 三阶      ×2.40
 *   星级 ★0 → ★5      ×1.40
 *   村庄等级 Lv.1 → 20 ×1.57
 *   上场人数 3 → 8     ×2.67
 *   ----------------------------
 *   合计               ×14.1
 *
 * 所以敌人的总缩放也定在 ×14（不是拍脑袋的 ×26 —— 那会让后两章直接碾平，
 * 撞 §6 第 13 条「花钱不许更难」的反面：怎么养都追不上）。
 * 每章之间 14^(1/7) ≈ 1.46 倍，章内五关再从 1.00 爬到 1.35。
 *
 * 章内把墙放在第 4、5 关，对应 §8「卡关点稳定落在每章的第 4–5 关」。
 */
import { ARMOR_K, PAR_GRACE_MS, WAVE_GAP_MS } from './combat';
import type { Lane } from './villagers';

/**
 * 外星人的光环。**只影响同一路，而且不加给自己。**
 *
 * 不加给自己是硬的：光环怪必须能被单独点掉，否则「先点掉支援」这个解法
 * 就变成了「先打穿它自己给自己的罩子」，那是把答案藏起来。
 */
export type EnemyAura =
  /** 给同路的其他怪一层罩子，按比例减伤 */
  | { kind: 'shield'; pct: number }
  /** 给同路的其他怪加攻 */
  | { kind: 'atk'; pct: number }
  /** 照住这一路**最前面**的村民，他出手变慢。往后挪一格就废了，是站位题 */
  | { kind: 'dim'; pct: number };

export interface EnemyDef {
  id: string;
  name: string;
  /** 敌人也有门路，克制对双方都生效 */
  lane: Lane;
  hp: number;
  atk: number;
  def: number;
  /** 走路速度，视觉格/秒 */
  spd: number;
  /** 出手间隔 ms */
  interval: number;
  /**
   * 射程，视觉格，和村民同一把尺。
   * 空场被拉开，轴上 3 格能从村口打到第二排 —— 那是全屏，不算。
   */
  range: number;
  /** 飞行单位，贴脸的拦不住（不被阻挡），而且专挑最后排 */
  flying?: boolean;
  /** 钻地：同样不被阻挡、同样奔最后排，但要贴上去才打得着 */
  burrow?: boolean;
  /** 免疫减速。「拦」位打它不掉速，只能靠挡和打 */
  steady?: boolean;
  /** 跳过挡在最前面的那个人，一整局只跳一次 */
  leap?: boolean;
  /** 血过半破壳：护甲清零，速度翻倍 */
  crack?: boolean;
  aura?: EnemyAura;
  /** 下蛋：每 everyMs 放一只，一共放 times 只 */
  spawn?: { enemy: string; everyMs: number; times: number };
}

/**
 * 外星人池。**结构是 5 门路 × 4 位**，和村民那个 20 人方阵对着排，
 * 四个位分别是：冲（快而脆）、扛（硬而慢）、术（带一条规则）、援（加强别人）。
 *
 *          冲          扛          术          援
 *   reach  saucer      —           lamp        mast
 *   stand  cube        canister    pier        —
 *   heavy  —           armor       drill       wire
 *   rage   rusher      keg         spring      —
 *   band   grunt       —           —           hatch
 *
 * 空着的四格是二期，不是漏了。
 *
 * **每只怪是一道题，答案必须已经在村民池里。** 加新怪之前先回答「这道题用谁解」，
 * 答不上来就别加 —— 那就是只会更厚的血条，正好是反目标第二条。
 *
 * 两条红线：
 *
 * 1. **`steady` 不许和 `flying` / `burrow` 同时给。** 既拦不住又挡不住等于无解，
 *    玩家只能硬吃，撞 §6 第 4 条「被克的阵容仍要有打过去的办法」。
 * 2. **`aura` 不加给自己**（见 EnemyAura）。支援怪要能被单独点掉。
 */
export const ENEMIES: readonly EnemyDef[] = [
  {
    id: 'cube', name: '方块',
    lane: 'stand', hp: 260, atk: 26, def: 6, spd: 0.42, interval: 1200, range: 1,
  },
  {
    id: 'grunt', name: '小灰',
    lane: 'band', hp: 130, atk: 20, def: 2, spd: 0.72, interval: 900, range: 1,
  },
  {
    id: 'canister', name: '铁罐',
    lane: 'stand', hp: 620, atk: 34, def: 22, spd: 0.30, interval: 1500, range: 1,
  },
  {
    id: 'rusher', name: '突击',
    lane: 'rage', hp: 190, atk: 44, def: 4, spd: 1.05, interval: 800, range: 1,
  },
  {
    // 3 视觉格：悬在目标面前，必须飞进场。前排够得到它，它也够得到后排。
    id: 'saucer', name: '飞碟',
    lane: 'reach', hp: 340, atk: 38, def: 10, spd: 0.36, interval: 1400, range: 3,
    flying: true,
  },
  {
    id: 'armor', name: '装甲',
    lane: 'heavy', hp: 1050, atk: 58, def: 34, spd: 0.24, interval: 1800, range: 1,
  },

  /* ---- 二期补的八只。题面写在每一条的注释里 ---- */

  {
    // 题：这一路最前面那个出手变慢。解：把主输出往后挪一格，或者先点掉它
    id: 'lamp', name: '探照灯',
    lane: 'reach', hp: 380, atk: 18, def: 10, spd: 0.34, interval: 1400, range: 1,
    aura: { kind: 'dim', pct: 0.35 },
  },
  {
    // 题：同路的怪都罩了一层。解：穿透和横扫越过前排先点它
    id: 'mast', name: '天线杆',
    lane: 'reach', hp: 300, atk: 14, def: 8, spd: 0.30, interval: 1600, range: 1,
    aura: { kind: 'shield', pct: 0.25 },
  },
  {
    // 题：减速对它没用。解：靠挡和纯输出，别指望渔网婶石磨姨
    id: 'pier', name: '水泥墩',
    lane: 'stand', hp: 700, atk: 30, def: 26, spd: 0.26, interval: 1600, range: 1,
    steady: true,
  },
  {
    // 题：绕过前排直接咬最后排。解：后排别只放脆皮，或者整路都要够得着
    id: 'drill', name: '电钻',
    lane: 'heavy', hp: 420, atk: 52, def: 12, spd: 0.40, interval: 1000, range: 1,
    burrow: true,
  },
  {
    // 题：同路的怪打得更疼。解：先点掉它，或者前排换成反伤的钢板哥
    id: 'wire', name: '高压线',
    lane: 'heavy', hp: 360, atk: 20, def: 12, spd: 0.32, interval: 1500, range: 1,
    aura: { kind: 'atk', pct: 0.3 },
  },
  {
    // 题：血过半破壳，护甲没了但速度翻倍。解：留第二段输出，别把火力全压开场
    id: 'keg', name: '闷罐',
    lane: 'rage', hp: 780, atk: 40, def: 30, spd: 0.26, interval: 1500, range: 1,
    crack: true,
  },
  {
    // 题：一整局跳一次，越过最前面那个。解：第二格必须有人，不然它落在治疗脸上
    id: 'spring', name: '弹簧腿',
    lane: 'rage', hp: 240, atk: 46, def: 4, spd: 0.85, interval: 850, range: 1,
    leap: true,
  },
  {
    // 题：一路走一路下蛋。解：清线能力（穿透、横扫），或者拦位把小灰堆在网前
    id: 'hatch', name: '孵化器',
    lane: 'band', hp: 560, atk: 16, def: 16, spd: 0.22, interval: 1800, range: 1,
    spawn: { enemy: 'grunt', everyMs: 3500, times: 4 },
  },
];

export const ENEMY_BY_ID: Readonly<Record<string, EnemyDef>> = Object.fromEntries(
  ENEMIES.map((e) => [e.id, e]),
);

export function getEnemy(id: string): EnemyDef {
  const e = ENEMY_BY_ID[id];
  if (!e) throw new Error(`未知外星人: ${id}`);
  return e;
}

/* ---------------- 关卡 ---------------- */

export interface SpawnGroup {
  /** 第几路（0..2） */
  lane: number;
  enemy: string;
  count: number;
  /** 组内每只之间隔多久 ms */
  gapMs: number;
  /** 这一波开始后多久放出来 ms */
  atMs: number;
}

export interface Wave {
  groups: readonly SpawnGroup[];
}

export interface StageDef {
  id: number;
  chapter: number;
  index: number;
  /** 1-3 这种写法 */
  label: string;
  name: string;
  pitch: string;
  hpMul: number;
  atkMul: number;
  waves: readonly Wave[];
  timeLimitMs: number;
  /** 「清得利索」的参考时间。★3 要求在这个之内打完，见 rateStars */
  parMs: number;
  /** 敌方主门路。**开战前必须显示给玩家**，见 §6 第 4 条 */
  mainLane: Lane;
  /** 建议村庄等级。曲线是按这个等级校的，验收也按它算 */
  suggestLv: number;
}

interface ChapterSeed {
  name: string;
  /** 这一章的敌人池，按出现频率从高到低 */
  mix: readonly string[];
  pitches: readonly string[];
  suggestLv: readonly [number, number];
}

/**
 * 章节总数。8 章 40 关 → 80 章 400 关。
 *
 * 前 8 章的配方（地名、敌人组合、台词）是手写的；第 9 章往后是跑道，
 * 地名从 CH_NAME_POOL 取、敌人组合走 TAIL_MIX_POOL。
 *
 * 章间斜率、章内爬坡、只数、路数预算都不看敌人 id；
 * hpMul 额外乘一道配方折算（见 compRef），抹掉「谁领头」带来的血量落差。
 *
 * 第 5~8 章换了配方：原来那四章是同一批怪往上堆血，现在各换进两三只带规则的
 * （弹簧腿、探照灯、水泥墩、电钻、高压线、闷罐、孵化器、天线杆）。
 * **每章的领头那只没换**，所以 mainLane 和克制关系是原样的。
 *
 * **14 种铺 80 章，平均每种撑 6 章 —— 比原来的 13 章好一倍，但还不够。**
 * 二期要上的是词缀（给任意一只挂罩子 / 发条 / 膏药），
 * 那个是用修饰词做量，不用新模型做量，美术成本低一个数量级。
 */
const CHAPTER_TOTAL = 80;

/** 第 9 章往后的地名池。还是村口那点地方，别往奇幻走（§1） */
const CH_NAME_POOL: readonly string[] = [
  '后山', '河沿', '老窑', '菜地', '晒场', '麦场', '水塘', '桥头',
  '砖厂', '瓦房', '槐树', '土坡', '石碾', '牛棚', '鸡窝', '猪圈',
  '粮仓', '井台', '磨坊', '渠边', '河堤', '庙前', '戏台', '供销社',
  '卫生所', '小卖部', '加油站', '修车铺', '废品站', '砖窑', '采石场', '变电所',
  '水塔', '烟囱', '铁轨', '道口', '涵洞', '山梁', '垭口', '林场',
  '果园', '大棚', '鱼塘', '闸口', '泵房', '机井', '晾房', '场院',
  '碾道', '草垛', '柴房', '地窖', '后院', '前街', '后巷', '十字口',
  '大喇叭', '村委会', '小学校', '操场', '旗杆', '围墙', '铁门', '岗楼',
  '瞭望塔', '界碑', '山口', '河谷', '断桥', '风口', '荒地', '尽头',
];

/** 第 9 章往后每关的台词。按关序取 —— 章太多，写不出 400 句不重样的 */
const CH_PITCH_POOL: readonly string[] = [
  '喘口气', '又压上来了', '中路顶不住', '两边一起来', '这关是墙',
];

/** 手写的头 8 章。40 关主线整条曲线是贴着这 8 章校出来的，一个字都别动 */
const TUNED_CHAPTERS: readonly ChapterSeed[] = [
  {
    name: '村口',
    mix: ['cube', 'grunt'],
    pitches: ['三个人也够看', '路上开始挤', '小灰成群', '方块顶在前面', '守住村口'],
    suggestLv: [1, 2],
  },
  {
    name: '上路',
    mix: ['grunt', 'cube', 'canister'],
    pitches: ['铁罐第一次露头', '小灰绕边路', '中路压得紧', '两边一起来', '铁罐堵路'],
    suggestLv: [3, 4],
  },
  {
    name: '铁皮',
    mix: ['canister', 'cube', 'rusher'],
    pitches: ['壳要砸开', '突击插进来', '铁罐成堆', '清得慢就叠上', '这章加一小队'],
    suggestLv: [5, 7],
  },
  {
    name: '飞碟',
    mix: ['saucer', 'grunt', 'canister'],
    pitches: ['后排会被点', '飞碟带小灰', '拦不住的从天上来', '三路都有飞碟', '飞碟压着打'],
    suggestLv: [8, 10],
  },
  {
    name: '混战',
    mix: ['grunt', 'rusher', 'saucer', 'spring'],
    pitches: ['什么都有', '小灰扑脸', '快的先到', '有蹦的，第二格别空着', '这章最挤'],
    suggestLv: [11, 13],
  },
  {
    name: '夜路',
    mix: ['armor', 'pier', 'lamp'],
    pitches: ['装甲第一次来', '夜里有灯照人', '水泥墩拦不住', '被照住的手就慢了', '夜路走完'],
    suggestLv: [14, 16],
  },
  {
    name: '硬仗',
    mix: ['armor', 'rusher', 'drill', 'wire'],
    pitches: ['不留空档', '快的和硬的一起', '有从底下钻过来的', '高压线一挂全变猛', '硬仗收尾'],
    suggestLv: [17, 18],
  },
  {
    name: '死守',
    mix: ['armor', 'saucer', 'keg', 'hatch', 'mast'],
    pitches: ['还没完', '更密一档', '闷罐砸开了反而更快', '一路走一路下蛋', '整条后路压过来'],
    suggestLv: [19, 20],
  },
];

/**
 * 第 9 章往后的敌人配方池。
 *
 * 上一版直接循环手写那 8 章的 mix，于是第 50 关往后**真的**就是同一批怪血更厚 ——
 * 反目标第二条的字面定义。现在换成一张独立的池子：每组都是
 * 「一个肉 + 一个快的 + 一个带规则的 + 一个支援」，四个位各出一道题，
 * 拆解法的顺序（先点支援还是先清快的）就是这一关的花样。
 *
 * 领头那只决定这一关的敌方主门路（见 pickMainLane），所以 12 组的**头一只
 * 刻意铺满五条门路**，不然后半程会一直在克同一条，克制就退化成固定答案。
 */
const TAIL_MIX_POOL: readonly (readonly string[])[] = [
  ['canister', 'grunt', 'spring', 'mast'],
  ['armor', 'rusher', 'drill', 'wire'],
  ['hatch', 'saucer', 'lamp', 'cube'],
  ['keg', 'cube', 'hatch', 'mast'],
  ['saucer', 'spring', 'lamp', 'canister'],
  ['pier', 'rusher', 'drill', 'mast'],
  ['armor', 'grunt', 'keg', 'wire'],
  ['grunt', 'cube', 'spring', 'hatch'],
  ['lamp', 'armor', 'pier', 'saucer'],
  ['keg', 'rusher', 'drill', 'wire'],
  ['canister', 'spring', 'hatch', 'lamp'],
  ['drill', 'grunt', 'mast', 'pier'],
];

/** 村庄等级的分界。和 village.ts 的 VILLAGE_LV_TUNED / VILLAGE_LV_MAX 对齐 */
const LV_TUNED = 20;
const LV_MAX = 120;

/**
 * 第 9 章往后的章节种子。
 *
 * 地名从池子里按序取，敌人组合走 TAIL_MIX_POOL，
 * 建议等级从 Lv.20 线性铺到 Lv.120。
 */
function buildChapters(): ChapterSeed[] {
  const out: ChapterSeed[] = [...TUNED_CHAPTERS];
  const tuned = TUNED_CHAPTERS.length;
  const tail = CHAPTER_TOTAL - tuned;
  for (let k = 0; k < tail; k += 1) {
    const t0 = k / tail;
    const t1 = (k + 1) / tail;
    out.push({
      name: CH_NAME_POOL[k % CH_NAME_POOL.length]!,
      mix: TAIL_MIX_POOL[k % TAIL_MIX_POOL.length]!,
      pitches: CH_PITCH_POOL,
      suggestLv: [
        Math.round(LV_TUNED + t0 * (LV_MAX - LV_TUNED)),
        Math.round(LV_TUNED + t1 * (LV_MAX - LV_TUNED)),
      ],
    });
  }
  return out;
}

const CHAPTERS: readonly ChapterSeed[] = buildChapters();

/**
 * 缩放曲线。**只数和面板分开算，算完不许再相乘。**
 *
 * 第一版就是在这儿爆的：只数 ×8、面板 ×14，两个一乘第 8 章的总血量涨了 ×115，
 * 而玩家从 Lv.1/一阶/3 人到 Lv.20/三阶/8 人一共只涨 ×12 —— 于是第 6 章往后
 * 满级存档都推不动（模拟器实测 6-1 到 8-5 全灭）。
 *
 * 现在按三条独立预算来定，乘起来正好对上玩家的成长：
 *
 *   每只血量  ×3.7   ← 主要的压力来源
 *   只数      ×2.8   ← 刻意压住。屏幕上人太多就看不出哪一路要崩（反目标）
 *   ------------------
 *   合计      ×10.4 的击杀需求
 *
 * ×10.4 这个数不是拍的，是**从模拟器量出来的玩家成长**反推的：
 * 上场人数 × 进化阶 × 村庄倍率 实测从 D1 的 3.2 涨到 D25 的 33，正好 ×10.3。
 * 第二版取过 ×17.6（血量 6.3 × 只数 2.8），结果第 7 章往后满级也推不动 ——
 * 模拟器实测从 D40 到 D60 一直卡在 7-4，第 8 章压根到不了。
 *
 * 敌人攻击单独按**玩家每人的血量**成长走（×4.5 = 村庄 1.57 × 进化 2.4 × 星 1.2），
 * 不跟只数挂钩 —— 上场人数变多不会让每个人更耐打。
 */
/**
 * 难度曲线分两段：**前 8 章一个数都不动，第 9 章往后压平。**
 *
 * 头一版把 ×2788 均摊到 80 章，结果前 8 章的斜率从 ×2.25 掉到 ×1.63 ——
 * 那等于把上面那整段校准史（3-2 是墙、章间下探形成锯齿、卡关落在每章后半段）
 * 全部推翻，新手前 100 关一路平推。40 关主线的手感是花了很大代价校出来的，
 * 不能为了接跑道就冲掉。
 *
 * 所以 400 关的做法是**接**不是**摊**：前 8 章原样，剩下 72 章分摊剩余的预算。
 */
const CH_TUNED = 8;
const CH_TAIL = CHAPTER_TOTAL - CH_TUNED;

const CH_HP_STEP = Math.pow(2.25, 1 / 7);
/**
 * 第 9 章往后血量再涨 ×75。压得比前段平，因为要摊的章数多九倍。
 *
 * ×159 那一版是按「天花板 ×2788 ÷ 曲线 ×2765」纸面算的，看着刚好，
 * 实测三个种子全部停在 343~348 关 —— 因为**打赢需要余量，不是打平**：
 * 面板刚够等于每关都贴着漏怪线过，模拟器里就是推不动。
 * 放平到 ×75 之后末关留出约一倍余量，400 关才真的走得到。
 */
const TAIL_HP_STEP = Math.pow(75, 1 / CH_TAIL);
/**
 * 攻击的章间成长。对的是**玩家每人的血量**：村庄 1.57 × 进化 2.4 = 3.77，
 * 星级现实里能吃到 ×1.15 左右，所以 3.8 已经贴着上限，别再往上。
 */
const CH_ATK_STEP = Math.pow(3.8, 1 / 7);
/** 攻击对的仍是玩家每人的血量：Lv120 ×2.9 × 手艺 ×44 × 星 ×1.3，尾段还要 ×275 */
const TAIL_ATK_STEP = Math.pow(274.7, 1 / CH_TAIL);

/**
 * 章节倍率：前 8 章走 tuned 斜率，第 9 章往后接 tail 斜率。
 * c 是 1-based 章号。
 */
function chMul(c: number, tuned: number, tail: number): number {
  if (c <= CH_TUNED) return Math.pow(tuned, c - 1);
  return Math.pow(tuned, CH_TUNED - 1) * Math.pow(tail, c - CH_TUNED);
}

/**
 * 章内爬坡对攻击只吃平方根。
 *
 * 血量和只数吃满 ×1.85 是「这一关要杀的更多」，玩家可以靠输出和布阵解决；
 * 攻击也吃满 ×1.85 就变成「每章第 5 关必定把前排秒掉」，
 * 而前排一倒就漏怪判负，怎么排都没用。实测那一版第 8 章全种子卡死在 8-5，
 * 而且**削血量完全没用** —— 瓶颈压根不在血量上。
 *
 * 开根之后 8-5 的攻击倍率从 5.0 降到 3.67，卡在玩家血量成长的下方。
 */
function atkRamp(ramp: number): number {
  return Math.sqrt(ramp);
}
const CH1_HP = 1;
/**
 * 第 1 章的攻击倍率。
 *
 * 别再往下调。第一版设成 0.25，配上当时的扁平减法护甲，
 * 方块打铁柱恰好是 max(1, 6.5 - 60) = 1 点 —— 前排全程无敌，
 * 结果 40 关一个人都没倒过，星评 100% 全是 ★3，
 * 「三星要求一个人都没倒」这条直接失去意义。
 */
const CH1_ATK = 0.85;

/**
 * 章内五关的爬坡。**必须比章间台阶陡**，这是锯齿的来源。
 *
 * 第二版是 1.00→1.35，而章间台阶是 ×1.20 —— 两者差不多，
 * 于是 40 关的难度基本是条直线，墙落在哪儿全看玩家的成长曲线
 * 正好在哪儿追不上，实测散在 3-1 / 6-1 / 6-2 / 8-3，毫无规律。
 * §8 要的「稳定落在每章第 4–5 关」根本测不出来。
 *
 * 现在章内 ×1.85、章间只 ×1.10：下一章的第 1 关比上一章的第 5 关**还轻 40%**，
 * 每章都是「喘一口 → 越来越紧 → 第 4、5 关是墙」。
 */
const IDX_RAMP = [1, 1.15, 1.35, 1.6, 1.85] as const;

/** 第几关几波。前松后紧 */
const IDX_WAVES = [3, 3, 4, 4, 5] as const;

/**
 * 每章最多用几条路。**这是新手曲线的主要闸门，比数值重要。**
 *
 * 第一版没有这张表，出怪路线写成 `(wave + i) % 3` 随波次轮转 ——
 * 于是哪怕每波只开一到两路，三波下来还是把三条路都用过了，
 * 玩家在只能上 3 个人的时候就被迫覆盖全场。实测 **2-1 / 2-2 全种子失败**。
 *
 * 现在按章给预算，路数跟着上场人数一起放开：
 * 1 章 1 路（上场 3 人，够站出纵深）、2~4 章 2 路（上场 4~5 人）、
 * 5 章起 3 路（上场 6 人以上，每路两个）。
 *
 * 第三路开在第 5 章而不是第 4 章：第 4 章上场才 5 个人，
 * 摊到三路就是一路一到两个，又回到「没纵深」那个死结（实测通关掉到 D47~D60）。
 */
function chapterLaneBudget(chapter: number): number {
  if (chapter <= 1) return 1;
  if (chapter <= 4) return 2;
  return 3;
}

/** 用几条路时用哪几条。一路走中间，两路走左中 */
const LANE_SET: Readonly<Record<number, readonly number[]>> = {
  1: [1],
  2: [0, 1],
  3: [0, 1, 2],
};

/**
 * 一关总共放多少只：第 1 章 12 只 → 第 80 章 48 只，章内再 ×1.28。
 *
 * **只数的预算只给 ×4，剩下的全让血量吃。** 80 章要是按 8 章那个斜率涨只数，
 * 末章会有上千只 —— 屏幕糊成一片，「哪一路要崩」就再也看不出来了（反目标第四条）。
 * 压力交给血量，人数交给眼睛。
 */
const COUNT_CH1 = 12;
const COUNT_STEP = Math.pow(2.19, 1 / 7);
/** 第 9 章往后只数只再涨一半：12 → 40 只封顶，屏幕还看得清 */
const TAIL_COUNT_STEP = Math.pow(1.5, 1 / CH_TAIL);
const COUNT_IDX = [1, 1.05, 1.12, 1.2, 1.28] as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * 上场从 8 人涨到 12 人之后，后半段关卡要跟着加肉。
 * 前 4 章人还没堆起来，乘子保持 1，免得 1-1 又变成墙。
 */
function bodyMul(chapter: number): number {
  if (chapter <= 4) return 1;
  if (chapter <= 6) return 1.28;
  if (chapter <= 8) return 1.55;
  return 1.65;
}

/** 一只怪的有效血量（护甲折进去，下蛋的把蛋也算上） */
function unitEhp(id: string): number {
  const e = getEnemy(id);
  const own = (e.hp * (e.def + ARMOR_K)) / ARMOR_K;
  return e.spawn ? own + e.spawn.times * unitEhp(e.spawn.enemy) : own;
}

/** 这一关实际出场那批怪的平均有效血量，按只数加权 */
function wavesEhp(waves: readonly Wave[]): number {
  let n = 0;
  let sum = 0;
  for (const w of waves) {
    for (const g of w.groups) {
      n += g.count;
      sum += g.count * unitEhp(g.enemy);
    }
  }
  return n > 0 ? sum / n : 1;
}

/**
 * 配方折算：hpMul 乘上「基准 ÷ 这关实际平均有效血量」，
 * 让同一章同一关序不管来的是小灰还是装甲，要啃的总量都落在同一条线上。
 *
 * 不折算的时候 hpMul 同样乘在 131 血的小灰和 1229 有效血的装甲身上，
 * 难度全看这一章 mix 里谁多：第 5 章小灰领头是低谷（×0.96），
 * 第 6 章装甲领头一跳 ×4.72，尾段章与章之间在 ×0.53~×1.88 之间乱跳，
 * 装甲领头的那几章永远是墙、小灰领头的永远三星 —— 墙落在哪儿看配方运气。
 *
 * 基准：第 1 章原样（首局手感不动），第 9 章往后取尾段几何平均，
 * 中间几何插值接上。
 */
function compRef(chapter: number, first: number, tail: number): number {
  if (chapter >= CH_TUNED + 1) return tail;
  return first * Math.pow(tail / first, (chapter - 1) / CH_TUNED);
}

/** 这一关的敌方主门路 = 出现最多的那种敌人的门路 */
function pickMainLane(mix: readonly string[]): Lane {
  return getEnemy(mix[0]!).lane;
}

/** 这一关一共放多少只 */
function stageCount(chapter: number, index: number): number {
  const ch = COUNT_CH1 * chMul(chapter, COUNT_STEP, TAIL_COUNT_STEP);
  return Math.max(3, Math.round(ch * (COUNT_IDX[index - 1] ?? 1)));
}

function buildWaves(seed: ChapterSeed, chapter: number, index: number): Wave[] {
  const waveCount = IDX_WAVES[index - 1] ?? 3;
  const total = stageCount(chapter, index);

  // 后面的波比前面的密一点，压力是递增的而不是平的
  const weights = Array.from({ length: waveCount }, (_, w) => 1 + w * 0.15);
  const wSum = weights.reduce((a, b) => a + b, 0);

  const waves: Wave[] = [];
  let left = total;
  for (let w = 0; w < waveCount; w += 1) {
    const last = w === waveCount - 1;
    const want = last
      ? Math.max(1, left)
      : Math.max(1, Math.round((total * weights[w]!) / wSum));
    left -= want;

    /*
     * 头一波先少开一路当预告，之后铺满这一章的路数预算。
     *
     * 试过让第一波也铺满：早期上场才 4~5 人，第一波就要同时挡两路，
     * 前排没纵深，漏怪从 2.7% 涨到 5.6%、第 8 章整章变墙。
     * 「第一波窄」确实会让玩家以为这关只有一路，但解法在别处
     * （让跨列支援真能够着，见 `@/game/reach`），不是把预告砍掉。
     */
    const budget = chapterLaneBudget(chapter);
    const set = LANE_SET[budget] ?? LANE_SET[3]!;
    const laneCount = w === 0 ? Math.max(1, budget - 1) : budget;
    const per = Math.floor(want / laneCount);
    const extra = want % laneCount;

    const groups: SpawnGroup[] = [];
    for (let l = 0; l < laneCount; l += 1) {
      const count = per + (l < extra ? 1 : 0);
      if (count <= 0) continue;
      groups.push({
        // 只在这一章的路数预算里轮转，不许把没预算的第三路也用上
        lane: set[(w + l) % set.length]!,
        enemy: seed.mix[(w + l) % seed.mix.length]!,
        count,
        gapMs: 700 + l * 120,
        atMs: l * 900,
      });
    }
    waves.push({ groups });
  }
  return waves;
}

function buildStages(): StageDef[] {
  const allWaves = CHAPTERS.map((seed, c) =>
    [1, 2, 3, 4, 5].map((i) => buildWaves(seed, c + 1, i)));
  const geo = (xs: readonly number[]) =>
    Math.exp(xs.reduce((a, x) => a + Math.log(x), 0) / xs.length);
  // 按整章折算而不是逐关：章内五关的倍率得保持单调，爬坡才是 IDX_RAMP 说了算
  const chEhp = allWaves.map((ch) => geo(ch.map(wavesEhp)));
  const refFirst = chEhp[0]!;
  const refTail = geo(chEhp.slice(CH_TUNED));

  const out: StageDef[] = [];
  let id = 1;
  for (let c = 0; c < CHAPTERS.length; c += 1) {
    const seed = CHAPTERS[c]!;
    const chHp = CH1_HP * chMul(c + 1, CH_HP_STEP, TAIL_HP_STEP);
    const chAtk = CH1_ATK * chMul(c + 1, CH_ATK_STEP, TAIL_ATK_STEP);
    const comp = compRef(c + 1, refFirst, refTail) / chEhp[c]!;
    const [lvFrom, lvTo] = seed.suggestLv;
    for (let i = 1; i <= 5; i += 1) {
      const ramp = IDX_RAMP[i - 1] ?? 1;
      const waves = allWaves[c]![i - 1]!;
      const suggestLv = Math.round(lvFrom + ((lvTo - lvFrom) * (i - 1)) / 4);
      out.push({
        id,
        chapter: c + 1,
        index: i,
        label: `${c + 1}-${i}`,
        name: seed.name,
        pitch: seed.pitches[i - 1] ?? '',
        hpMul: round2(chHp * ramp * bodyMul(c + 1) * comp),
        atkMul: round2(chAtk * atkRamp(ramp)),
        waves,
        // 3 波 86s、5 波 120s，都在 §5 的 1~2 分钟里。
        // 超时只兜「打不动的死局」，正常打不过应该是**漏怪**判负 —— 那个看得懂
        timeLimitMs: 35_000 + waves.length * 17_000,
        parMs: lastSpawnMs(waves) + spawnTailMs(waves) + PAR_GRACE_MS,
        mainLane: pickMainLane(seed.mix),
        suggestLv,
      });
      id += 1;
    }
  }
  return out;
}

export const STAGES: readonly StageDef[] = buildStages();
export const STAGE_COUNT = STAGES.length;
export const CHAPTER_COUNT = CHAPTERS.length;
/** 最后一关的 id。关卡 id 从 1 连续排，所以它等于总关数 */
export const LAST_STAGE_ID = STAGE_COUNT;

const BY_ID: Readonly<Record<number, StageDef>> = Object.fromEntries(
  STAGES.map((s) => [s.id, s]),
);

export function clampStage(raw: unknown): number {
  const n = Math.floor(Number(raw) || 1);
  return Math.max(1, Math.min(STAGE_COUNT, n));
}

export function getStage(id: number): StageDef {
  return BY_ID[clampStage(id)] ?? STAGES[0]!;
}

export function findStage(chapter: number, index: number): StageDef | undefined {
  return STAGES.find((s) => s.chapter === chapter && s.index === index);
}

export function stagesOfChapter(chapter: number): readonly StageDef[] {
  const ch = Math.max(1, Math.min(CHAPTER_COUNT, Math.floor(chapter)));
  return STAGES.filter((s) => s.chapter === ch);
}

export function chapterTitle(chapter: number): string {
  return findStage(chapter, 1)?.name ?? `第${chapter}章`;
}

/** 这一关一共要放多少只 */
export function stageEnemyCount(s: StageDef): number {
  return s.waves.reduce(
    (sum, w) => sum + w.groups.reduce((a, g) => a + g.count, 0),
    0,
  );
}

/**
 * 下蛋的那些，最后一个蛋比它自己晚出场这么久。
 *
 * **par 时间必须算上这一段。** 不算的话带孵化器的关卡**注定**拿不到 ★3：
 * 最后一个蛋才刚落地，「最后一只出场 + 14 秒」早就过去了，
 * 「清得利索」于是成了物理上做不到的事，重打多少遍都一样 ——
 * 那就把星评当成惩罚发给了玩家，而不是「我排得更好了」的反馈（§4.4）。
 */
export function spawnTailMs(waves: readonly Wave[]): number {
  let tail = 0;
  for (const w of waves) {
    for (const g of w.groups) {
      const s = getEnemy(g.enemy).spawn;
      if (s) tail = Math.max(tail, s.everyMs * s.times);
    }
  }
  return tail;
}

/** 最后一只什么时候出场 */
export function lastSpawnMs(waves: readonly Wave[]): number {
  let last = 0;
  waves.forEach((wave, w) => {
    for (const g of wave.groups) {
      last = Math.max(last, w * WAVE_GAP_MS + g.atMs + (g.count - 1) * g.gapMs);
    }
  });
  return last;
}

/* ---------------- 星评 ---------------- */

export type Stars = 0 | 1 | 2 | 3;

/**
 * 星评：漏了几个、倒了几个人、清得利索不利索。
 *
 * **时间那一项是补上去的，别删。** 第一版只看「没漏 + 没倒」，
 * 模拟器实测 92%~97% 的通关都是 ★3 —— 因为正常打赢本来就很干净，
 * 于是星评没有区分度，重打一关没有任何理由，
 * 「我排得更好了」这句话也就没有量化出口（§4.4 胜利条件）。
 *
 * 加了 par 时间之后 ★3 变成「一个没漏、一个没倒、而且清得快」，
 * 三档才真的分得开：清干净是 ★2 的门槛，清得利索才是 ★3。
 */
export function rateStars(
  leaked: number,
  fallen: number,
  won: boolean,
  elapsedMs = 0,
  parMs = Number.POSITIVE_INFINITY,
): Stars {
  if (!won) return 0;
  if (leaked > 0) return 1;
  if (fallen > 0) return 2;
  return elapsedMs <= parMs ? 3 : 2;
}
