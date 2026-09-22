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

/**
 * 村口要预热的人：路上那几个闲人，加上阵上实际要打的。
 * 三婶若只在编队里、不在村口闲逛，进战斗才开始下图，就会半天才露脸。
 */
export function homePreloadPeople(mem: RunMemory, limit = 8): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string): void => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };
  for (const id of yardPeople(mem, '')) add(id);
  for (const slot of mem.layout) add(slot.id);
  return ids.slice(0, Math.max(1, limit));
}
