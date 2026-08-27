import { Platform } from '@/core/PlatformService';
import type { RewardSource } from '@/balance/rewards';
import {
  clampGrowth,
  clampModStars,
  emptyGrowth,
  nextGrowthCost,
  nextModStarCost,
  pileGrowth,
  type GrowthId,
  type GrowthLevels,
} from '@/balance/yard';
import { getMod } from '@/balance/mods';
import { LADDER_TOP, ladderPassed } from '@/balance/ladder';
import {
  LAST_STAGE_ID,
  clampPlayerStage,
  inferStageTop,
  migrateStageTop,
} from '@/balance/stages';

const KEY = 'code1_run_memory';

export interface RunMemory {
  highestWave: number;
  seenHeroIds: string[];
  /** 已废弃的累计堆。新局只用 nextScrap 带进开场 */
  scrap: number;
  /** 下一局开场带着的本局零钱。用完清零 */
  nextScrap: number;
  /** 带进下一局的那笔废品从哪来。现在只有广告双倍 */
  nextScrapSource: RewardSource;
  /** 翻废品站翻到的那件，下一局三选一必出 */
  nextPinModId: string;
  /** 村里废品堆。跨局花，买肉鸽成长 */
  yardScrap: number;
  /** 老存档字段。破烂不再解锁，读进来也不用 */
  unlockedMods: string[];
  /** 开局多带废品的档。跟 growth.pocket 同步 */
  startScrapLv: number;
  /** 废品站买的肉鸽成长 */
  growth: GrowthLevels;
  /** 破烂升星。抽到这件时按星放大 */
  modStars: Record<string, number>;
  /** 村子里点好的三人，进场直接用 */
  squadIds: string[];
  /** 看广告白送的那件，进场自动焊上 */
  nextGiftModId: string;
  /** 下一局打第几档难度阶梯 */
  ladderLv: number;
  /** 已经解锁到第几档。0 表示还没打服照旧那一档 */
  ladderTop: number;
  /** 见过的合体，用来点亮图鉴。只记 id，不存战力 */
  seenCombos: string[];
  /** 村里那堆废品上次结算到什么时候。离线自己涨 */
  pileAtMs: number;
  /** 已经涨出来还没收的那一堆 */
  pileScrap: number;
  /** 下一局打第几关。1 是村口 */
  stageId: number;
  /** 已经解锁到第几关 */
  stageTop: number;
  /** 2 = 40 关主线。用来把上一版 4 门迁过来 */
  campaignRev: number;
}

function empty(): RunMemory {
  return {
    highestWave: 0,
    seenHeroIds: [],
    scrap: 0,
    nextScrap: 0,
    nextScrapSource: 'ad',
    nextPinModId: '',
    yardScrap: 0,
    unlockedMods: [],
    startScrapLv: 0,
    growth: emptyGrowth(),
    modStars: {},
    squadIds: [],
    nextGiftModId: '',
    ladderLv: 0,
    ladderTop: 0,
    seenCombos: [],
    pileAtMs: 0,
    pileScrap: 0,
    stageId: 1,
    stageTop: 1,
    campaignRev: 2,
  };
}

export function loadMemory(): RunMemory {
  try {
    const raw = Platform.getStorageSync(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as RunMemory;
    return {
      highestWave: Number(parsed.highestWave) || 0,
      seenHeroIds: Array.isArray(parsed.seenHeroIds) ? parsed.seenHeroIds : [],
      scrap: Math.max(0, Number(parsed.scrap) || 0),
      nextScrap: Math.max(0, Number(parsed.nextScrap) || 0),
      nextScrapSource: parsed.nextScrapSource === 'iap' || parsed.nextScrapSource === 'quest'
        || parsed.nextScrapSource === 'free' || parsed.nextScrapSource === 'ad'
        ? parsed.nextScrapSource
        : 'ad',
      nextPinModId: typeof parsed.nextPinModId === 'string' ? parsed.nextPinModId : '',
      yardScrap: Math.max(0, Number(parsed.yardScrap) || 0),
      unlockedMods: Array.isArray(parsed.unlockedMods)
        ? parsed.unlockedMods.filter((id): id is string => typeof id === 'string')
        : [],
      startScrapLv: clampGrowth(parsed.growth, Number(parsed.startScrapLv) || 0).pocket,
      growth: clampGrowth(parsed.growth, Number(parsed.startScrapLv) || 0),
      modStars: clampModStars(parsed.modStars),
      squadIds: Array.isArray(parsed.squadIds)
        ? parsed.squadIds.filter((id): id is string => typeof id === 'string').slice(0, 3)
        : [],
      nextGiftModId: typeof parsed.nextGiftModId === 'string' ? parsed.nextGiftModId : '',
      ladderTop: clampLadder(parsed.ladderTop),
      // 选中的档不许超过解锁到的档：老存档没这两个字段，一律从照旧开始
      ladderLv: Math.min(clampLadder(parsed.ladderLv), clampLadder(parsed.ladderTop)),
      seenCombos: Array.isArray(parsed.seenCombos)
        ? parsed.seenCombos.filter((id): id is string => typeof id === 'string')
        : [],
      pileAtMs: Math.max(0, Number(parsed.pileAtMs) || 0),
      pileScrap: Math.max(0, Number(parsed.pileScrap) || 0),
      stageTop: migrateStageTop(
        parsed.stageTop,
        Number(parsed.highestWave) || 0,
        Number((parsed as { campaignRev?: number }).campaignRev) || 0,
      ),
      stageId: (() => {
        const top = migrateStageTop(
          parsed.stageTop,
          Number(parsed.highestWave) || 0,
          Number((parsed as { campaignRev?: number }).campaignRev) || 0,
        );
        if (parsed.stageId == null) return 1;
        return Math.min(clampPlayerStage(parsed.stageId), top);
      })(),
      campaignRev: 2,
    };
  } catch {
    return empty();
  }
}

function clampLadder(v: unknown): number {
  return Math.max(0, Math.min(LADDER_TOP, Math.floor(Number(v) || 0)));
}

export interface RunOutcome {
  cleared: boolean;
  /** 这一局打的哪一档 */
  ladderLv: number;
  /** 这一局在谁身上凑出过什么合体 */
  combos: readonly string[];
  /** 这一局打的哪一关 */
  stageId?: number;
}

export function saveRun(
  reachedWave: number,
  heroIds: readonly string[],
  outcome?: RunOutcome,
): RunMemory {
  const prev = loadMemory();
  const seen = new Set(prev.seenHeroIds);
  for (const id of heroIds) seen.add(id);
  const combos = new Set(prev.seenCombos);
  for (const id of outcome?.combos ?? []) combos.add(id);
  // 打服了当前这一档才解锁下一档。只往上走，不会因为一局打崩掉回去
  const lv = outcome?.ladderLv ?? prev.ladderLv;
  const passed = outcome ? ladderPassed(reachedWave, outcome.cleared) : false;
  const ladderTop = passed
    ? Math.min(LADDER_TOP, Math.max(prev.ladderTop, lv + 1))
    : prev.ladderTop;
  const played = clampPlayerStage(outcome?.stageId ?? prev.stageId);
  const stageTop = outcome?.cleared
    ? Math.min(LAST_STAGE_ID, Math.max(prev.stageTop, played + 1))
    : prev.stageTop;
  const next: RunMemory = {
    highestWave: Math.max(prev.highestWave, reachedWave),
    seenHeroIds: [...seen],
    seenCombos: [...combos],
    ladderLv: Math.min(prev.ladderLv, ladderTop),
    ladderTop,
    stageId: outcome?.cleared
      ? Math.min(stageTop, Math.max(prev.stageId, played + 1))
      : Math.min(prev.stageId, stageTop),
    stageTop,
    campaignRev: 2,
    pileAtMs: prev.pileAtMs,
    pileScrap: prev.pileScrap,
    scrap: prev.scrap,
    nextScrap: prev.nextScrap,
    nextScrapSource: prev.nextScrapSource,
    nextPinModId: prev.nextPinModId,
    yardScrap: prev.yardScrap,
    unlockedMods: prev.unlockedMods,
    startScrapLv: prev.startScrapLv,
    growth: prev.growth,
    modStars: prev.modStars,
    squadIds: prev.squadIds,
    nextGiftModId: prev.nextGiftModId,
  };
  try {
    Platform.setStorageSync(KEY, JSON.stringify(next));
  } catch {
    /* 模拟器偶发写失败，不挡再来一局 */
  }
  return next;
}

export function consumeNextScrap(): { amount: number; source: RewardSource } {
  const prev = loadMemory();
  const amount = prev.nextScrap;
  const source = prev.nextScrapSource;
  if (amount <= 0) return { amount: 0, source };
  const next: RunMemory = { ...prev, nextScrap: 0 };
  try {
    Platform.setStorageSync(KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return { amount, source };
}

/** 看广告：把剩余废品带进下一局开场。source 留下给分账。 */
export function stashNextScrap(amount: number, source: RewardSource): RunMemory {
  const prev = loadMemory();
  const add = Math.max(0, Math.floor(amount));
  const next: RunMemory = { ...prev, nextScrap: add, nextScrapSource: source };
  try {
    Platform.setStorageSync(KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

export function consumeNextPin(): string {
  const prev = loadMemory();
  const id = prev.nextPinModId;
  if (!id) return '';
  const next: RunMemory = { ...prev, nextPinModId: '' };
  try {
    Platform.setStorageSync(KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return id;
}

export function stashNextPin(modId: string): RunMemory {
  const prev = loadMemory();
  const next: RunMemory = { ...prev, nextPinModId: modId };
  try {
    Platform.setStorageSync(KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

function persist(next: RunMemory): RunMemory {
  const out = { ...next, campaignRev: 2 };
  try {
    Platform.setStorageSync(KEY, JSON.stringify(out));
  } catch {
    /* */
  }
  return out;
}

/** 打完一局，把收获倒进村里废品堆 */
export function bankToYard(amount: number): RunMemory {
  const prev = loadMemory();
  const add = Math.max(0, Math.floor(amount));
  return persist({ ...prev, yardScrap: prev.yardScrap + add });
}

export function buyModStar(modId: string): RunMemory | undefined {
  try {
    getMod(modId);
  } catch {
    return undefined;
  }
  const prev = loadMemory();
  const now = prev.modStars[modId] ?? 0;
  const cost = nextModStarCost(now);
  if (cost === undefined || prev.yardScrap < cost) return undefined;
  return persist({
    ...prev,
    yardScrap: prev.yardScrap - cost,
    modStars: { ...prev.modStars, [modId]: now + 1 },
  });
}

export function buyYardGrowth(id: GrowthId): RunMemory | undefined {
  const prev = loadMemory();
  const lv = prev.growth[id];
  const cost = nextGrowthCost(id, lv);
  if (cost === undefined || prev.yardScrap < cost) return undefined;
  const growth = { ...prev.growth, [id]: lv + 1 };
  return persist({
    ...prev,
    yardScrap: prev.yardScrap - cost,
    growth,
    startScrapLv: growth.pocket,
  });
}

export function saveSquad(ids: readonly string[]): RunMemory {
  const prev = loadMemory();
  const squadIds = [...ids].filter(Boolean).slice(0, 3);
  return persist({ ...prev, squadIds });
}

export function consumeNextGift(): string {
  const prev = loadMemory();
  const id = prev.nextGiftModId;
  if (!id) return '';
  persist({ ...prev, nextGiftModId: '' });
  return id;
}

export function stashNextGift(modId: string): RunMemory {
  const prev = loadMemory();
  return persist({ ...prev, nextGiftModId: modId });
}

/** 换一档打。只能选已经解锁到的档 */
export function setLadderLv(lv: number): RunMemory {
  const prev = loadMemory();
  const want = Math.max(0, Math.min(LADDER_TOP, Math.floor(lv)));
  return persist({ ...prev, ladderLv: Math.min(want, prev.ladderTop) });
}

/** 换一关打。只能选已经解锁到的关 */
export function setStageId(id: number): RunMemory {
  const prev = loadMemory();
  const want = clampPlayerStage(id);
  return persist({ ...prev, stageId: Math.min(want, prev.stageTop) });
}

/** GM：把目标关写进进度，这一关和前面的都能选。不改废品、不改阶梯。 */
export function gmUnlockToStage(id: number): RunMemory {
  const prev = loadMemory();
  const want = clampPlayerStage(id);
  return persist({
    ...prev,
    stageTop: Math.max(prev.stageTop, want),
    stageId: want,
  });
}

/**
 * 把村里那堆废品结算到现在。
 *
 * 只做「自己涨、一键收」：不做建筑、不做布局、不做产能升级 ——
 * 那会长成第二条玩法线，撞反目标里的「系统太多」。
 * 它的作用只有一个，给次日回访一个理由，顺带撑起一个局外广告点。
 */
export function settlePile(nowMs: number = Date.now()): RunMemory {
  const prev = loadMemory();
  if (prev.pileAtMs <= 0) return persist({ ...prev, pileAtMs: nowMs });
  const grown = pileGrowth(prev.pileScrap, nowMs - prev.pileAtMs);
  if (grown === prev.pileScrap && nowMs <= prev.pileAtMs) return prev;
  return persist({ ...prev, pileScrap: grown, pileAtMs: nowMs });
}

/** 一键收。收完从零开始重新涨 */
export function collectPile(nowMs: number = Date.now()): { mem: RunMemory; got: number } {
  const settled = settlePile(nowMs);
  const got = settled.pileScrap;
  if (got <= 0) return { mem: settled, got: 0 };
  return {
    mem: persist({
      ...settled,
      yardScrap: settled.yardScrap + got,
      pileScrap: 0,
      pileAtMs: nowMs,
    }),
    got,
  };
}

export function buyStartScrap(): RunMemory | undefined {
  return buyYardGrowth('pocket');
}
