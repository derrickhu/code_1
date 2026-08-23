/**
 * 核心流程两个广告位的日限。插屏不做。
 * 日限见 docs/01-核心玩法循环.md §9。
 */
import { Platform } from '@/core/PlatformService';

const KEY = 'code1_ad_day';

export type AdPlacement = 'revive' | 'settleDouble';

const LIMIT: Readonly<Record<AdPlacement, number>> = {
  revive: 2,
  settleDouble: 5,
};

interface DayBook {
  date: string;
  revive: number;
  settleDouble: number;
}

function today(): string {
  const d = new Date();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function empty(date = today()): DayBook {
  return { date, revive: 0, settleDouble: 0 };
}

function load(): DayBook {
  try {
    const raw = Platform.getStorageSync(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as DayBook;
    if (parsed.date !== today()) return empty();
    return {
      date: parsed.date,
      revive: Math.max(0, Number(parsed.revive) || 0),
      settleDouble: Math.max(0, Number(parsed.settleDouble) || 0),
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
