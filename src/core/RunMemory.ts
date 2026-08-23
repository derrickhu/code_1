import { Platform } from '@/core/PlatformService';
import type { RewardSource } from '@/balance/rewards';

const KEY = 'code1_run_memory';

export interface RunMemory {
  highestWave: number;
  seenHeroIds: string[];
  /** 已废弃的累计堆。新局只用 nextScrap 带进开场 */
  scrap: number;
  /** 下一局开场带着的本局零钱。用完清零 */
  nextScrap: number;
}

function empty(): RunMemory {
  return { highestWave: 0, seenHeroIds: [], scrap: 0, nextScrap: 0 };
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
    };
  } catch {
    return empty();
  }
}

export function saveRun(reachedWave: number, heroIds: readonly string[]): RunMemory {
  const prev = loadMemory();
  const seen = new Set(prev.seenHeroIds);
  for (const id of heroIds) seen.add(id);
  const next: RunMemory = {
    highestWave: Math.max(prev.highestWave, reachedWave),
    seenHeroIds: [...seen],
    scrap: prev.scrap,
    nextScrap: prev.nextScrap,
  };
  try {
    Platform.setStorageSync(KEY, JSON.stringify(next));
  } catch {
    /* 模拟器偶发写失败，不挡再来一局 */
  }
  return next;
}

export function consumeNextScrap(): number {
  const prev = loadMemory();
  const n = prev.nextScrap;
  if (n <= 0) return 0;
  const next: RunMemory = { ...prev, nextScrap: 0 };
  try {
    Platform.setStorageSync(KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return n;
}

/** 看广告：把剩余废品带进下一局开场。source 留下给分账。 */
export function stashNextScrap(amount: number, _source: RewardSource): RunMemory {
  const prev = loadMemory();
  const add = Math.max(0, Math.floor(amount));
  const next: RunMemory = { ...prev, nextScrap: add };
  try {
    Platform.setStorageSync(KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}
