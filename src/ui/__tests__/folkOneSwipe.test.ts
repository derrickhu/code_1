import { describe, expect, it } from 'vitest';

import { folkBrowseIds, folkNeighborId, isFolkOneSwipeBlocked } from '@/ui/folkOneSwipe';

describe('folkOneSwipe', () => {
  it('只收已入伙的，按花名册顺序，滤门路', () => {
    const roster = ['laoyanqiang', 'tiezhu', 'erjiu'];
    expect(folkBrowseIds(roster, 'all')).toEqual(['laoyanqiang', 'tiezhu', 'erjiu']);
    expect(folkBrowseIds(roster, 'heal')).toEqual(['erjiu']);
  });

  it('当前人不在滤里也要留下，免得滑走找不到自己', () => {
    expect(folkBrowseIds(['tiezhu', 'erjiu'], 'heal', 'tiezhu')).toEqual(['tiezhu', 'erjiu']);
  });

  it('邻人首尾循环', () => {
    const ids = ['a', 'b', 'c'];
    expect(folkNeighborId(ids, 'b', 1)).toBe('c');
    expect(folkNeighborId(ids, 'c', 1)).toBe('a');
    expect(folkNeighborId(ids, 'a', -1)).toBe('c');
    expect(folkNeighborId(['a'], 'a', 1)).toBeNull();
  });

  it('门楣和底栏不进横滑，中间可以滑', () => {
    const band = { headerBottom: 400, dockTop: 1100 };
    expect(isFolkOneSwipeBlocked({ y: 200, ...band })).toBe(true);
    expect(isFolkOneSwipeBlocked({ y: 1100, ...band })).toBe(true);
    expect(isFolkOneSwipeBlocked({ y: 700, ...band })).toBe(false);
  });
});
