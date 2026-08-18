import { Platform } from '@/core/PlatformService';

const KEY = 'code1_run_memory';

export interface RunMemory {
  highestWave: number;
  seenHeroIds: string[];
}

function empty(): RunMemory {
  return { highestWave: 0, seenHeroIds: [] };
}

export function loadMemory(): RunMemory {
  try {
    const raw = Platform.getStorageSync(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as RunMemory;
    return {
      highestWave: Number(parsed.highestWave) || 0,
      seenHeroIds: Array.isArray(parsed.seenHeroIds) ? parsed.seenHeroIds : [],
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
  };
  try {
    Platform.setStorageSync(KEY, JSON.stringify(next));
  } catch {
    /* 模拟器偶发写失败，不挡再来一局 */
  }
  return next;
}
