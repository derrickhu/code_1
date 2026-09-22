import { describe, expect, it } from 'vitest';
import { homePreloadPeople, yardPeople } from '@/core/yardRoster';
import type { RunMemory } from '@/core/RunMemory';

function mem(roster: string[]): RunMemory {
  return {
    roster,
    seenIds: roster,
    villageLv: 1,
    villageExp: 0,
    evo: {},
    craft: {},
    stars: {},
    scrap: 0,
    parts: 0,
    credits: 0,
    pellets: 0,
    callCount: 0,
    stageId: 1,
    stageTop: 1,
    stageStars: {},
  } as RunMemory;
}

describe('yardPeople', () => {
  it('首页默认只站 3 个闲人，不是花名册', () => {
    const ids = yardPeople(mem(['a', 'b', 'c', 'd', 'e', 'f', 'g']));
    expect(ids).toHaveLength(3);
  });

  it('大喇叭院子能多站几个', () => {
    const ids = yardPeople(mem(['a', 'b', 'c', 'd', 'e', 'f', 'g']), '', 6);
    expect(ids).toHaveLength(6);
  });

  it('新人若不在前排，挤掉最后一个好让他走进来', () => {
    const ids = yardPeople(mem(['a', 'b', 'c', 'd']), 'd', 3);
    expect(ids).toContain('d');
    expect(ids).toHaveLength(3);
  });

  it('村口预热要把阵上的人也算上，别等进战斗才下三婶', () => {
    const base = mem(['tiezhu', 'dachui', 'laoyanqiang', 'sanshen']);
    const ids = homePreloadPeople({
      ...base,
      layout: [{ id: 'sanshen', lane: 1, cell: 1 }],
    } as RunMemory);
    expect(ids).toContain('sanshen');
    expect(ids).toContain('dachui');
  });
});
