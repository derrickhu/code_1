/**
 * 外星人原型与 15 波编排（纯数据）
 *
 * 波次结构与数值曲线分开：结构（出什么、几只、什么时候出）写死在 WAVES 里，
 * 强度只由 waveHpMult / waveAtkMult 两条曲线控制。调难度时只动曲线参数，
 * 不动编排 —— 否则每次调参都会顺手改掉「第几波第一次出铁罐」这类体验节奏。
 *
 * 没有系别。三系克制已在 2026-08-18 裁掉：3 人固定队没有换人对位的空间，
 * 克制只会退化成无法应对的运气惩罚（docs/00-体验目标.md §4）。
 * 波次的压力靠**数量、护甲、速度**三样区分，玩家的应对手段是改装件。
 *
 * 编排目标（§8）：卡关点稳定落在第 9 到 12 波。
 * 太早挫败，太晚则复活广告没有需求。
 */

export interface EnemyProto {
  id: string;
  /** 外星人名。画得高级又呆，名字也别太正经 */
  name: string;
  /** 第 1 波的基础值 */
  hp: number;
  atk: number;
  def: number;
  /**
   * 推进速度（格/秒）。对标植物大战僵尸 / Kingdom Rush 首波列队，
   * 不是 Brotato 围攻冲刺。空场现在是大半个屏幕，走路按秒算。
   * 出场 6 格：小灰约 12 秒贴脸，方块兵约 20 秒，铁罐／飞碟约 25 秒。
   */
  speed: number;
  attackIntervalMs: number;
  isBoss: boolean;
  /**
   * 进村口后打谁。默认打队首。
   * `back`：飞过队首打还活着的最后排，逼玩家把脆皮换下来。
   */
  aim?: 'front' | 'back';
}

/** 飞碟飞进这个距离才打后排，路上不出手 */
export const BACK_AIM_DIST = 1.6;
/** 打后排是点名，不是秒脆皮。站位题要成立，第 7 波不能变成墙 */
export const BACK_AIM_DAMAGE = 0.5;

export const ENEMY_PROTOS: readonly EnemyProto[] = [
  { id: 'grey', name: '小灰', hp: 360, atk: 13, def: 0, speed: 0.48, attackIntervalMs: 900, isBoss: false },
  { id: 'cube', name: '方块兵', hp: 720, atk: 22, def: 8, speed: 0.30, attackIntervalMs: 1100, isBoss: false },
  { id: 'canister', name: '铁罐', hp: 1500, atk: 38, def: 32, speed: 0.22, attackIntervalMs: 1400, isBoss: false },
  { id: 'saucer', name: '飞碟', hp: 2600, atk: 42, def: 40, speed: 0.24, attackIntervalMs: 1600, isBoss: true, aim: 'back' },
];

const PROTO_BY_ID: Readonly<Record<string, EnemyProto>> = Object.fromEntries(
  ENEMY_PROTOS.map((e) => [e.id, e]),
);

export function getEnemyProto(id: string): EnemyProto {
  const p = PROTO_BY_ID[id];
  if (!p) throw new Error(`未知外星人: ${id}`);
  return p;
}

export interface WaveSpawn {
  enemyId: string;
  count: number;
  /** 同组出怪间隔 */
  intervalMs: number;
  /** 该组相对本波开始的延迟出场 */
  delayMs: number;
}

/** 这一波难在哪。装给谁之前先看见这个字 */
export type WavePressure = '硬' | '多' | '快';

export interface WaveDef {
  wave: number;
  spawns: readonly WaveSpawn[];
  pressure: WavePressure;
  /** 波次预告。说清这一波难在哪，让「该给谁装」有指向，而不是靠玩家自己猜 */
  hint: string;
}

function s(enemyId: string, count: number, intervalMs = 600, delayMs = 0): WaveSpawn {
  return { enemyId, count, intervalMs, delayMs };
}

/**
 * 波次编排。五个阶段的意图：
 * 1–3   只有小灰与方块兵，三人已齐，建立「他们自己能打」的信任；
 * 4–6   引入铁罐（护甲），第一次需要真输出而不是站着挨；
 * 7     飞碟压阵，第一个可能卡住的点；
 * 8–12  数量与护甲混合，主卡关区，也是复活广告的需求来源；
 * 13–15 高压收尾。
 */
export const WAVES: readonly WaveDef[] = [
  // 开局三人已齐，第 1 波仍只出小灰，让玩家看清「他们自己会打」
  { wave: 1, spawns: [s('grey', 7)], pressure: '多', hint: '刚焊上的先拿小灰试' },
  { wave: 2, spawns: [s('grey', 9, 500)], pressure: '多', hint: '小灰变多了，看刚才改得对不对' },
  { wave: 3, spawns: [s('cube', 6)], pressure: '硬', hint: '方块兵列队上来了，比小灰硬' },
  { wave: 4, spawns: [s('cube', 6), s('grey', 6, 400, 3000)], pressure: '多', hint: '两拨一起来' },
  { wave: 5, spawns: [s('cube', 7), s('canister', 2, 700, 4000)], pressure: '硬', hint: '压阵的是铁罐，壳很厚' },
  { wave: 6, spawns: [s('grey', 12, 320)], pressure: '多', hint: '一大群小灰冲上来，要能打一片' },
  { wave: 7, spawns: [s('saucer', 1), s('cube', 6, 600, 2500)], pressure: '硬', hint: '飞碟打后排，脆皮别躲后面' },
  { wave: 8, spawns: [s('cube', 10, 450), s('canister', 3, 800, 4500)], pressure: '硬', hint: '方块兵开路，三个铁罐跟上' },
  { wave: 9, spawns: [s('grey', 16, 280), s('canister', 3, 800, 5000)], pressure: '多', hint: '小灰淹人，铁罐收尾' },
  { wave: 10, spawns: [s('canister', 4, 800), s('cube', 10, 500, 4000)], pressure: '硬', hint: '四个铁罐，硬碰硬' },
  { wave: 11, spawns: [s('grey', 18, 260), s('cube', 10, 450, 5000)], pressure: '快', hint: '来得又快又多' },
  { wave: 12, spawns: [s('canister', 5, 750), s('grey', 16, 280, 4500)], pressure: '硬', hint: '铁罐顶着，小灰绕上来' },
  { wave: 13, spawns: [s('saucer', 1), s('canister', 2, 800, 3000)], pressure: '硬', hint: '飞碟又打后排，肉的换上去' },
  { wave: 14, spawns: [s('cube', 8, 450), s('canister', 3, 800, 5000)], pressure: '硬', hint: '人多壳还厚' },
  // 终局刻意不做成数值墙：一个飞碟加三铁罐六方块，
  // 让打到第 15 波的玩家有真实通关概率。终局要的是高潮，不是劝退
  {
    wave: 15,
    spawns: [s('saucer', 1), s('canister', 2, 800, 3000), s('cube', 5, 450, 6000)],
    pressure: '硬',
    hint: '最后一波，飞碟仍打后排',
  },
];

export function waveHeadline(wave: number): string {
  const def = getWave(wave);
  return `${def.pressure} · ${def.hint}`;
}

/**
 * 强度曲线。这两个数是整个切片最需要回归的参数。
 *
 * 上限由改装件的成长空间决定：一局只发 7 件，装满也就把 3 个人抬到 3 至 4 倍。
 * 没有等级系统，改装件是唯一成长来源，所以曲线必须压到
 * 「15 波总成长与改装成长同量级、略高一线」，否则后段必出断崖。
 *
 * knee 之后换用更缓的成长：后段压力主要来自怪的数量与护甲（见 WAVES），
 * 血量再指数下去会变成硬墙。
 */
export const WAVE_CURVE = {
  hpGrowth: 1.18,
  atkGrowth: 1.12,
  lateGrowth: 1.05,
  lateAtkGrowth: 1.02,
  knee: 7,
} as const;

function segmented(growth: number, late: number, wave: number): number {
  if (wave <= WAVE_CURVE.knee) return growth ** (wave - 1);
  return growth ** (WAVE_CURVE.knee - 1) * late ** (wave - WAVE_CURVE.knee);
}

export function waveHpMult(wave: number): number {
  return segmented(WAVE_CURVE.hpGrowth, WAVE_CURVE.lateGrowth, wave);
}

export function waveAtkMult(wave: number): number {
  return segmented(WAVE_CURVE.atkGrowth, WAVE_CURVE.lateAtkGrowth, wave);
}

export function getWave(wave: number): WaveDef {
  const w = WAVES.find((x) => x.wave === wave);
  if (!w) throw new Error(`未定义波次: ${wave}`);
  return w;
}
