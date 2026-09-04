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
import { LANE_COUNT, PAR_GRACE_MS, WAVE_GAP_MS } from './combat';
import type { Lane } from './villagers';

export interface EnemyDef {
  id: string;
  name: string;
  /** 敌人也有门路，克制对双方都生效 */
  lane: Lane;
  hp: number;
  atk: number;
  def: number;
  /** 走路速度，格/秒 */
  spd: number;
  /** 出手间隔 ms */
  interval: number;
  /** 射程（格）。> 1 的会站在村民射程外点人，比如飞碟 */
  range: number;
  /** 飞行单位，贴脸的拦不住（不被阻挡） */
  flying?: boolean;
}

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
    id: 'saucer', name: '飞碟',
    lane: 'reach', hp: 340, atk: 38, def: 10, spd: 0.36, interval: 1400, range: 3,
    flying: true,
  },
  {
    id: 'armor', name: '装甲',
    lane: 'heavy', hp: 1050, atk: 58, def: 34, spd: 0.24, interval: 1800, range: 1,
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

const CHAPTERS: readonly ChapterSeed[] = [
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
    mix: ['grunt', 'rusher', 'saucer', 'cube'],
    pitches: ['什么都有', '小灰扑脸', '快的先到', '又快又硬', '这章最挤'],
    suggestLv: [11, 13],
  },
  {
    name: '夜路',
    mix: ['armor', 'canister', 'saucer'],
    pitches: ['装甲第一次来', '装甲带飞碟', '壳更厚', '两路装甲', '夜路走完'],
    suggestLv: [14, 16],
  },
  {
    name: '硬仗',
    mix: ['armor', 'rusher', 'saucer', 'canister'],
    pitches: ['不留空档', '快的和硬的一起', '三路齐推', '装甲铺路', '硬仗收尾'],
    suggestLv: [17, 18],
  },
  {
    name: '死守',
    mix: ['armor', 'saucer', 'rusher', 'grunt'],
    pitches: ['还没完', '更密一档', '四波连打', '五波连打', '整条后路压过来'],
    suggestLv: [19, 20],
  },
];

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
const CH_HP_STEP = Math.pow(2.25, 1 / 7);
/**
 * 攻击的章间成长。对的是**玩家每人的血量**：村庄 1.57 × 进化 2.4 = 3.77，
 * 星级现实里能吃到 ×1.15 左右，所以 3.8 已经贴着上限，别再往上。
 */
const CH_ATK_STEP = Math.pow(3.8, 1 / 7);

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
const CH_LANES = [1, 2, 2, 2, 3, 3, 3, 3] as const;

/** 用几条路时用哪几条。一路走中间，两路走左中 */
const LANE_SET: Readonly<Record<number, readonly number[]>> = {
  1: [1],
  2: [0, 1],
  3: [0, 1, 2],
};

/** 一关总共放多少只：第 1 章 12 只 → 第 8 章 34 只，章内再 ×1.28 */
const COUNT_CH1 = 12;
const COUNT_STEP = Math.pow(2.19, 1 / 7);
const COUNT_IDX = [1, 1.05, 1.12, 1.2, 1.28] as const;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 这一关的敌方主门路 = 出现最多的那种敌人的门路 */
function pickMainLane(mix: readonly string[]): Lane {
  return getEnemy(mix[0]!).lane;
}

/** 这一关一共放多少只 */
function stageCount(chapter: number, index: number): number {
  const ch = COUNT_CH1 * Math.pow(COUNT_STEP, chapter - 1);
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

    // 头一波先少开一路当预告，之后铺满这一章的路数预算
    const budget = CH_LANES[chapter - 1] ?? LANE_COUNT;
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
  const out: StageDef[] = [];
  let id = 1;
  for (let c = 0; c < CHAPTERS.length; c += 1) {
    const seed = CHAPTERS[c]!;
    const chHp = CH1_HP * Math.pow(CH_HP_STEP, c);
    const chAtk = CH1_ATK * Math.pow(CH_ATK_STEP, c);
    const [lvFrom, lvTo] = seed.suggestLv;
    for (let i = 1; i <= 5; i += 1) {
      const ramp = IDX_RAMP[i - 1] ?? 1;
      const waves = buildWaves(seed, c + 1, i);
      const suggestLv = Math.round(lvFrom + ((lvTo - lvFrom) * (i - 1)) / 4);
      out.push({
        id,
        chapter: c + 1,
        index: i,
        label: `${c + 1}-${i}`,
        name: seed.name,
        pitch: seed.pitches[i - 1] ?? '',
        hpMul: round2(chHp * ramp),
        atkMul: round2(chAtk * atkRamp(ramp)),
        waves,
        // 3 波 86s、5 波 120s，都在 §5 的 1~2 分钟里。
        // 超时只兜「打不动的死局」，正常打不过应该是**漏怪**判负 —— 那个看得懂
        timeLimitMs: 35_000 + waves.length * 17_000,
        parMs: lastSpawnMs(waves) + PAR_GRACE_MS,
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

/** 这一关一共要放多少只 */
export function stageEnemyCount(s: StageDef): number {
  return s.waves.reduce(
    (sum, w) => sum + w.groups.reduce((a, g) => a + g.count, 0),
    0,
  );
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
