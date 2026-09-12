import { evoOf, starsOf } from '@/balance/village';
import { progressOf, type RunMemory } from '@/core/RunMemory';

/**
 * 路上站谁。
 * 首页只是闲人，不是全村花名册，所以默认 3 个。
 * 大喇叭院子可以站更多，新人入伙走那里。
 */
export function yardPeople(
  mem: RunMemory,
  arrive = '',
  limit = 3,
): string[] {
  const p = progressOf(mem);
  const ranked = [...mem.roster].sort((a, b) => {
    const e = evoOf(p, b) - evoOf(p, a);
    if (e !== 0) return e;
    return starsOf(p, b) - starsOf(p, a);
  });
  const n = Math.min(Math.max(1, limit), ranked.length);
  const take = ranked.slice(0, n);
  if (arrive && mem.roster.includes(arrive) && !take.includes(arrive) && take.length > 0) {
    take[take.length - 1] = arrive;
  }
  return take;
}
