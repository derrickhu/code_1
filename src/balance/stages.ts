/**
 * 主线关卡。城主别慌张的骨架是「章 × 关」推图，不是 4 个大门。
 *
 * 他们主线二三十章，每章里好几关，每关一场短打（10 / 20 波不等）。
 * 养成有用，是因为后面的关更密、更硬，废品站买的破烂能多推几关。
 *
 * 我们不抄经营、抽卡、铁匠铺。只抄这一条：40 场短打，8 章 × 5 关。
 * 完整 15 段曲线留给校准局（模拟 / 回归），玩家从 1-1 打起。
 */
import { TOTAL_WAVES } from './combat';

export interface CampaignStage {
  id: number;
  chapter: number;
  index: number;
  name: string;
  /** 1-3 这种，跟城主别慌张的 3-1 一个写法 */
  label: string;
  pitch: string;
  waveFrom: number;
  waveTo: number;
  hpMul: number;
  atkMul: number;
  /** 走路倍率。前关放慢，才看得清对砍，不是一窝扑脸 */
  spdMul: number;
  stripSplit: boolean;
  beatMs: number;
  /** 每组多出多少（0.2 = 多 20%）。后章靠密度加压，不靠把一关拉成 15 段 */
  packExtra: number;
  fullRun?: boolean;
}

export const CALIBRATE_STAGE_ID = 0;

export const FULL_RUN: CampaignStage = {
  id: 0,
  chapter: 0,
  index: 0,
  name: '校准',
  label: '',
  pitch: '',
  waveFrom: 1,
  waveTo: TOTAL_WAVES,
  hpMul: 1,
  atkMul: 1,
  spdMul: 1,
  stripSplit: false,
  beatMs: 0,
  packExtra: 0,
  fullRun: true,
};

interface ChapterSeed {
  name: string;
  beatMs: number;
  spdMul?: number;
  stripSplit?: boolean;
  rows: readonly {
    from: number;
    to: number;
    hp: number;
    atk: number;
    extra?: number;
    pitch: string;
  }[];
}

const CHAPTERS: readonly ChapterSeed[] = [
  {
    name: '村口',
    beatMs: 10_000,
    spdMul: 0.72,
    stripSplit: true,
    rows: [
      { from: 1, to: 3, hp: 0.52, atk: 0.24, pitch: '自己能打，焊上第一件才爽' },
      { from: 2, to: 4, hp: 0.56, atk: 0.28, pitch: '路上开始挤' },
      { from: 3, to: 5, hp: 0.6, atk: 0.32, pitch: '铁罐露头' },
      { from: 3, to: 6, hp: 0.64, atk: 0.36, pitch: '小灰成群' },
      { from: 4, to: 6, hp: 0.68, atk: 0.4, extra: 0.08, pitch: '守住村口' },
    ],
  },
  {
    name: '上路',
    beatMs: 12_000,
    spdMul: 0.84,
    rows: [
      { from: 4, to: 7, hp: 0.72, atk: 0.44, pitch: '方块开始裂' },
      { from: 5, to: 7, hp: 0.76, atk: 0.48, pitch: '铁罐露头' },
      { from: 5, to: 8, hp: 0.8, atk: 0.52, pitch: '小灰成群' },
      { from: 6, to: 8, hp: 0.84, atk: 0.56, pitch: '又硬又多' },
      { from: 6, to: 8, hp: 0.88, atk: 0.6, extra: 0.1, pitch: '飞碟第一次来' },
    ],
  },
  {
    name: '铁皮',
    beatMs: 14_000,
    spdMul: 0.92,
    rows: [
      { from: 6, to: 8, hp: 0.9, atk: 0.64, pitch: '壳要砸开' },
      { from: 6, to: 9, hp: 0.92, atk: 0.68, pitch: '飞碟压着打' },
      { from: 7, to: 9, hp: 0.94, atk: 0.72, pitch: '铁罐成堆' },
      { from: 7, to: 10, hp: 0.96, atk: 0.76, pitch: '清得慢就叠上' },
      { from: 7, to: 10, hp: 0.98, atk: 0.8, extra: 0.12, pitch: '这章加一小队' },
    ],
  },
  {
    name: '飞碟',
    beatMs: 16_000,
    rows: [
      { from: 7, to: 9, hp: 0.98, atk: 0.88, pitch: '后排会被点' },
      { from: 7, to: 10, hp: 0.99, atk: 0.9, pitch: '飞碟带小灰' },
      { from: 8, to: 10, hp: 1, atk: 0.92, pitch: '装甲潮' },
      { from: 8, to: 11, hp: 1.02, atk: 0.94, pitch: '又硬又挤' },
      { from: 8, to: 11, hp: 1.04, atk: 0.96, extra: 0.12, pitch: '突击来了' },
    ],
  },
  {
    name: '混战',
    beatMs: 18_000,
    rows: [
      { from: 9, to: 11, hp: 1.05, atk: 0.97, pitch: '什么都有' },
      { from: 9, to: 12, hp: 1.06, atk: 0.98, pitch: '小灰扑脸' },
      { from: 10, to: 12, hp: 1.08, atk: 1, pitch: '卡关该在这儿' },
      { from: 10, to: 13, hp: 1.1, atk: 1.02, pitch: '铁罐铺路' },
      { from: 10, to: 13, hp: 1.12, atk: 1.04, extra: 0.16, pitch: '这章最挤' },
    ],
  },
  {
    name: '夜路',
    beatMs: 20_000,
    rows: [
      { from: 10, to: 12, hp: 1.14, atk: 1.06, pitch: '密度上去了' },
      { from: 11, to: 13, hp: 1.16, atk: 1.08, pitch: '飞碟又来' },
      { from: 11, to: 13, hp: 1.18, atk: 1.1, pitch: '壳更厚' },
      { from: 12, to: 14, hp: 1.2, atk: 1.12, pitch: '后段曲线' },
      { from: 12, to: 14, hp: 1.22, atk: 1.14, extra: 0.2, pitch: '夜路走完' },
    ],
  },
  {
    name: '硬仗',
    beatMs: 22_000,
    rows: [
      { from: 12, to: 14, hp: 1.24, atk: 1.16, pitch: '不留空档' },
      { from: 13, to: 15, hp: 1.26, atk: 1.18, pitch: '终局那段' },
      { from: 13, to: 15, hp: 1.28, atk: 1.2, pitch: '飞碟加铁罐' },
      { from: 13, to: 15, hp: 1.3, atk: 1.22, pitch: '打得动才算养成' },
      { from: 13, to: 15, hp: 1.32, atk: 1.24, extra: 0.2, pitch: '硬仗收尾' },
    ],
  },
  {
    name: '死守',
    beatMs: 24_000,
    rows: [
      { from: 13, to: 15, hp: 1.34, atk: 1.26, extra: 0.15, pitch: '还没完' },
      { from: 13, to: 15, hp: 1.36, atk: 1.28, extra: 0.2, pitch: '更密一档' },
      { from: 12, to: 15, hp: 1.38, atk: 1.3, extra: 0.2, pitch: '四段连打' },
      { from: 11, to: 15, hp: 1.4, atk: 1.32, extra: 0.25, pitch: '五段连打' },
      { from: 10, to: 15, hp: 1.44, atk: 1.36, extra: 0.3, pitch: '整条后路压过来' },
    ],
  },
];

function buildStages(): CampaignStage[] {
  const out: CampaignStage[] = [];
  let id = 1;
  for (let c = 0; c < CHAPTERS.length; c += 1) {
    const ch = CHAPTERS[c]!;
    for (let i = 0; i < ch.rows.length; i += 1) {
      const row = ch.rows[i]!;
      out.push({
        id,
        chapter: c + 1,
        index: i + 1,
        name: ch.name,
        label: `${c + 1}-${i + 1}`,
        pitch: row.pitch,
        waveFrom: row.from,
        waveTo: row.to,
        hpMul: row.hp,
        atkMul: row.atk,
        spdMul: ch.spdMul ?? 1,
        stripSplit: !!ch.stripSplit,
        beatMs: ch.beatMs,
        packExtra: row.extra ?? 0,
      });
      id += 1;
    }
  }
  return out;
}

export const STAGES: readonly CampaignStage[] = buildStages();
export const STAGE_COUNT = STAGES.length;
export const LAST_STAGE_ID = STAGES[STAGES.length - 1]!.id;
export const CHAPTER_COUNT = CHAPTERS.length;
export const STAGES_PER_CHAPTER = 5;

export function findStage(chapter: number, index: number): CampaignStage | undefined {
  return STAGES.find((s) => s.chapter === chapter && s.index === index);
}

const BY_ID: Readonly<Record<number, CampaignStage>> = Object.fromEntries(
  STAGES.map((s) => [s.id, s]),
);

export function getStage(id: number): CampaignStage {
  if (id === CALIBRATE_STAGE_ID) return FULL_RUN;
  return BY_ID[clampPlayerStage(id)] ?? STAGES[0]!;
}

export function clampPlayerStage(id: unknown): number {
  const n = Math.floor(Number(id) || 1);
  return Math.max(1, Math.min(STAGE_COUNT, n));
}

/** 玩家选关用。0 是校准局，不出现在村子里 */
export function clampStage(id: unknown): number {
  const n = Math.floor(Number(id) || 0);
  if (n <= 0) return CALIBRATE_STAGE_ID;
  return clampPlayerStage(n);
}

/** 老存档没关卡字段时，用打到过的波次把进度补回来 */
export function inferStageTop(highestWave: number): number {
  if (highestWave >= TOTAL_WAVES) return 25;
  if (highestWave >= 12) return 16;
  if (highestWave >= 8) return 6;
  if (highestWave >= 4) return 3;
  return 1;
}

/** 上一版只有 4 个大门。按当时打到第几门，落到新图的对应关 */
const OLD_GATE: readonly number[] = [1, 1, 6, 16, 31];

export function migrateStageTop(rawTop: unknown, highestWave: number, campaignRev?: number): number {
  if (campaignRev !== undefined && campaignRev >= 2) return clampPlayerStage(rawTop ?? 1);
  if (rawTop == null) return inferStageTop(highestWave);
  const old = Math.floor(Number(rawTop) || 1);
  if (old > 4) return clampPlayerStage(old);
  return OLD_GATE[old] ?? 1;
}

export function stageBeatStart(stage: CampaignStage, localWave: number, ladderStageMs: number): number {
  const beat = stage.beatMs > 0 ? stage.beatMs : ladderStageMs;
  return Math.max(0, localWave - 1) * beat;
}

export function stageBeatMs(stage: CampaignStage, ladderStageMs: number): number {
  return stage.beatMs > 0 ? stage.beatMs : ladderStageMs;
}

export function stageLocalWave(stage: CampaignStage, wave: number): number {
  return Math.max(1, wave - stage.waveFrom + 1);
}

export function stageBeats(stage: CampaignStage): number {
  return Math.max(1, stage.waveTo - stage.waveFrom + 1);
}
