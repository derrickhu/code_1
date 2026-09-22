/**
 * 详情页左右滑换人。手势区域和邻人算法单独测，不跟 VillageScene 绑死。
 */
import { VILLAGERS, jobOf, type Job } from '@/balance/villagers';

export function folkBrowseIds(
  roster: readonly string[],
  job: Job | 'all',
  focus = '',
): string[] {
  const owned = new Set(roster);
  const ids = VILLAGERS
    .filter((v) => owned.has(v.id))
    .filter((v) => job === 'all' || jobOf(v.role) === job)
    .map((v) => v.id);
  if (focus && owned.has(focus) && !ids.includes(focus)) {
    return [focus, ...ids];
  }
  return ids;
}

export function folkNeighborId(
  ids: readonly string[],
  focus: string,
  delta: number,
): string | null {
  if (ids.length <= 1) return null;
  let idx = ids.indexOf(focus);
  if (idx < 0) idx = 0;
  const step = delta < 0 ? -1 : 1;
  return ids[(idx + step + ids.length) % ids.length] ?? null;
}

export function isFolkOneSwipeBlocked(opts: {
  y: number;
  headerBottom: number;
  dockTop: number;
}): boolean {
  if (opts.y < opts.headerBottom) return true;
  if (opts.y >= opts.dockTop) return true;
  return false;
}
