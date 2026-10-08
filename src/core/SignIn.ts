/**
 * 村口每日礼包，就是签到。七天一轮，按领过几天算，断签不清零 ——
 * 断一天就从头来会把回来的人再赶走一次。
 * 每天白领一份；领完可以看一段视频把今天这份再领一次（AdDay.dailyGift）。
 */
import { scopedStorageKey } from '@/config/gameKeyScope';
import { Platform } from '@/core/PlatformService';
import type { Loot } from '@/core/RunMemory';

const KEY = scopedStorageKey('sign_in');

/**
 * 前三天给得最厚：留人看的是第二天、第三天回不回来。
 * 第 2 天正好够升一级手艺（CRAFT_COST[0]），第 7 天的工分够喊一次人（CALL_COST）。
 */
export const SIGN_GIFTS: readonly Required<Loot>[] = [
  { pellets: 10, scrap: 60, parts: 0, credits: 0 },
  { pellets: 0, scrap: 40, parts: 2, credits: 0 },
  { pellets: 8, scrap: 0, parts: 0, credits: 3 },
  { pellets: 0, scrap: 100, parts: 2, credits: 0 },
  { pellets: 12, scrap: 80, parts: 0, credits: 0 },
  { pellets: 0, scrap: 0, parts: 3, credits: 3 },
  { pellets: 15, scrap: 150, parts: 3, credits: 6 },
];

/** 签到格上一行写不下的那句卖点 */
export const SIGN_PITCH: Readonly<Record<number, string>> = {
  1: '够升一级手艺',
  6: '白送喊一次人',
};

interface SignBook {
  /** 一共领过几天 */
  days: number;
  /** 最后一次白领是哪天 */
  last: string;
}

export function signToday(now = new Date()): string {
  const m = `${now.getMonth() + 1}`.padStart(2, '0');
  const d = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

function load(): SignBook {
  try {
    const raw = Platform.getStorageSync(KEY);
    if (!raw) return { days: 0, last: '' };
    const p = JSON.parse(raw) as Partial<SignBook>;
    return { days: Math.max(0, Math.floor(Number(p.days) || 0)), last: String(p.last ?? '') };
  } catch {
    return { days: 0, last: '' };
  }
}

function save(book: SignBook): void {
  try {
    Platform.setStorageSync(KEY, JSON.stringify(book));
  } catch {
    /* 写失败不挡玩 */
  }
}

export interface SignState {
  /** 今天还没白领 */
  open: boolean;
  /** 今天那一格是七格里的第几格（0 起） */
  slot: number;
  /** 这一轮已经领过的格数 */
  done: number;
}

export function signState(): SignState {
  const b = load();
  const open = b.last !== signToday();
  const slot = open ? b.days % SIGN_GIFTS.length : (b.days - 1 + SIGN_GIFTS.length) % SIGN_GIFTS.length;
  const done = open ? slot : slot + 1;
  return { open, slot, done };
}

/** 白领今天那一份。今天已经领过返回 null */
export function signClaim(): { slot: number; gift: Required<Loot> } | null {
  const b = load();
  if (b.last === signToday()) return null;
  const slot = b.days % SIGN_GIFTS.length;
  save({ days: b.days + 1, last: signToday() });
  return { slot, gift: SIGN_GIFTS[slot]! };
}

export function signGiftText(g: Loot): string {
  return [
    g.pellets ? `弹子 ${g.pellets}` : '',
    g.scrap ? `废铁 ${g.scrap}` : '',
    g.parts ? `零件 ${g.parts}` : '',
    g.credits ? `工分 ${g.credits}` : '',
  ].filter(Boolean).join('  ');
}
