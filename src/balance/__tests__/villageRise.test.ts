import { describe, expect, it } from 'vitest';

import { targetLockUse } from '@/balance/stall';
import { villageRise, villageRiseLines } from '@/balance/villageRise';
import { yardCrowd } from '@/core/yardRoster';

describe('村子升级报什么', () => {
  it('没升就不报', () => {
    expect(villageRise(4, 4)).toBeUndefined();
    expect(villageRise(6, 5)).toBeUndefined();
  });

  it('2 级同时多一个人、挂上给零件的蓝筐', () => {
    const rise = villageRise(1, 2)!;
    expect(rise.statPct).toBe(3);
    expect(rise.cap).toEqual({ from: 3, to: 4 });
    expect(rise.targets.map((t) => t.id)).toEqual(['crate']);
    expect(rise.targets[0]!.use).toBe('零件 +1');
    expect(villageRiseLines(rise)).toEqual([
      '下手、抗造 +3%',
      '出村能带 4 人',
      '摊上挂上蓝筐，零件 +1',
    ]);
  });

  it('5 级只多弹子存量，人不加、靶不加', () => {
    const rise = villageRise(4, 5)!;
    expect(rise.cap).toBeUndefined();
    expect(rise.targets).toEqual([]);
    expect(rise.notes).toEqual(['弹子能存 26 发']);
  });

  it('6 级挂铁盆，8 级挂喇叭', () => {
    expect(villageRise(5, 6)!.targets.map((t) => t.use)).toEqual(['再来一发']);
    expect(villageRise(7, 8)!.targets.map((t) => t.use)).toEqual(['工分 +1']);
    expect(villageRise(7, 8)!.notes).toEqual([]);
  });

  it('跨过 10 级才说工分更勤，跨过 20 级才说料变多', () => {
    expect(villageRise(9, 10)!.notes).toContain('工分来得更勤');
    expect(villageRise(10, 11)!.notes).toEqual([]);
    expect(villageRise(20, 21)!.notes).toEqual(['摊子和过关带回来的料变多了']);
    expect(villageRise(19, 20)!.notes).toEqual([]);
  });

  it('锁着的靶写出用途，开着的不写', () => {
    expect(targetLockUse('crate')).toBe('零件 +1');
    expect(targetLockUse('basin')).toBe('再来一发');
    expect(targetLockUse('horn')).toBe('工分 +1');
    expect(targetLockUse('cans')).toBeUndefined();
  });
});

describe('村口站几个人', () => {
  it('跟着上场人数变多，路上一共停在 6 个', () => {
    expect(yardCrowd(1)).toBe(3);
    expect(yardCrowd(2)).toBe(4);
    expect(yardCrowd(7)).toBe(5);
    expect(yardCrowd(15)).toBe(6);
    expect(yardCrowd(18)).toBe(6);
  });
});
