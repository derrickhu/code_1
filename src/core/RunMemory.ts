import { Platform } from '@/core/PlatformService';
import type { RewardSource } from '@/balance/rewards';
import { nextStartScrapCost, YARD_UNLOCKS } from '@/balance/yard';

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
  /** 村里废品堆。跨局花，买破烂解锁和开局零钱 */
  yardScrap: number;
  /** 买下来的锁着破烂 */
  unlockedMods: string[];
  /** 开局多带废品的档。0–3 */
  startScrapLv: number;
  /** 村子里点好的三人，进场直接用 */
  squadIds: string[];
  /** 看广告白送的那件，进场自动焊上 */
  nextGiftModId: string;
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
    squadIds: [],
    nextGiftModId: '',
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
      startScrapLv: Math.max(0, Math.min(3, Math.floor(Number(parsed.startScrapLv) || 0))),
      squadIds: Array.isArray(parsed.squadIds)
        ? parsed.squadIds.filter((id): id is string => typeof id === 'string').slice(0, 3)
        : [],
      nextGiftModId: typeof parsed.nextGiftModId === 'string' ? parsed.nextGiftModId : '',
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
    nextScrapSource: prev.nextScrapSource,
    nextPinModId: prev.nextPinModId,
    yardScrap: prev.yardScrap,
    unlockedMods: prev.unlockedMods,
    startScrapLv: prev.startScrapLv,
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
  try {
    Platform.setStorageSync(KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

/** 打完一局，把收获倒进村里废品堆 */
export function bankToYard(amount: number): RunMemory {
  const prev = loadMemory();
  const add = Math.max(0, Math.floor(amount));
  return persist({ ...prev, yardScrap: prev.yardScrap + add });
}

export function buyYardUnlock(modId: string): RunMemory | undefined {
  const def = YARD_UNLOCKS.find((u) => u.modId === modId);
  if (!def) return undefined;
  const prev = loadMemory();
  if (prev.unlockedMods.includes(modId)) return undefined;
  if (prev.yardScrap < def.cost) return undefined;
  return persist({
    ...prev,
    yardScrap: prev.yardScrap - def.cost,
    unlockedMods: [...prev.unlockedMods, modId],
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

export function buyStartScrap(): RunMemory | undefined {
  const prev = loadMemory();
  const cost = nextStartScrapCost(prev.startScrapLv);
  if (cost === undefined || prev.yardScrap < cost) return undefined;
  return persist({
    ...prev,
    yardScrap: prev.yardScrap - cost,
    startScrapLv: prev.startScrapLv + 1,
  });
}
