/**
 * 广告位日限。核心流程只有复活和结算双倍；
 * 首局多带一件、翻废品站是局外，不挡十秒开场。
 * 插屏不做。日限见 docs/01-核心玩法循环.md §9。
 */
import { scopedStorageKey } from '@/config/gameKeyScope';
import { Platform } from '@/core/PlatformService';

const KEY = scopedStorageKey('ad_day');
const LEGACY_KEY = 'code1_ad_day';

export type AdPlacement =
  | 'revive' | 'settleDouble' | 'dailyGift' | 'junkyard' | 'pileFill';

const LIMIT: Readonly<Record<AdPlacement, number>> = {
  revive: 2,
  settleDouble: 5,
  dailyGift: 1,
  junkyard: 1,
  // 村里那堆废品一键涨满。纯局外，不挡开场，一天一次 ——
  // 它买的是次日回访那一下的即时满足，多给就变成挂机替代打一局了
  pileFill: 1,
};

interface DayBook {
  date: string;
  revive: number;
  settleDouble: number;
  dailyGift: number;
  junkyard: number;
  pileFill: number;
  runsStarted: number;
}

function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function empty(date = today()): DayBook {
  return {
    date, revive: 0, settleDouble: 0, dailyGift: 0, junkyard: 0, pileFill: 0, runsStarted: 0,
  };
}

function load(): DayBook {
  try {
    const raw = Platform.getStorageSync(KEY) || Platform.getStorageSync(LEGACY_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as DayBook;
    if (parsed.date !== today()) return empty();
    return {
      date: parsed.date,
      revive: Math.max(0, Number(parsed.revive) || 0),
      settleDouble: Math.max(0, Number(parsed.settleDouble) || 0),
      dailyGift: Math.max(0, Number(parsed.dailyGift) || 0),
      junkyard: Math.max(0, Number(parsed.junkyard) || 0),
      pileFill: Math.max(0, Number(parsed.pileFill) || 0),
      runsStarted: Math.max(0, Number(parsed.runsStarted) || 0),
    };
  } catch {
    return empty();
  }
}

function save(book: DayBook): void {
  try {
    Platform.setStorageSync(KEY, JSON.stringify(book));
  } catch {
    /* 写失败不挡玩 */
  }
}

export function adRemaining(placement: AdPlacement): number {
  return Math.max(0, LIMIT[placement] - load()[placement]);
}

export function adCanShow(placement: AdPlacement): boolean {
  return adRemaining(placement) > 0;
}

export function adRecord(placement: AdPlacement): void {
  const book = load();
  book[placement] += 1;
  save(book);
}

/** 今天还没开过局，才能卖「首局多带一件」 */
export function adIsFirstRunToday(): boolean {
  return load().runsStarted === 0;
}

export function adMarkRunStart(): void {
  const book = load();
  book.runsStarted += 1;
  save(book);
}
