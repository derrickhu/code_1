import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 小程序存储在 node 下是空操作，塞一个内存版进去才测得到存档逻辑 */
const store = vi.hoisted(() => new Map<string, string>());
vi.mock('@/core/PlatformService', () => ({
  Platform: {
    getStorageSync: (k: string) => store.get(k) ?? null,
    setStorageSync: (k: string, v: string) => {
      store.set(k, v);
    },
    removeStorageSync: (k: string) => {
      store.delete(k);
    },
  },
}));

const KEY = 'cunkou_run_memory';

import { LADDER_GATE_WAVE, LADDER_TOP } from '@/balance/ladder';
import { LAST_STAGE_ID } from '@/balance/stages';
import { MOD_STAR_COSTS, PILE_CAP, PILE_PER_HOUR, emptyGrowth } from '@/balance/yard';
import { emptyLanes } from '@/balance/lanes';
import {
  buyLaneLv,
  buyYardGrowth,
  clearStarRefund,
  collectPile,
  fillPile,
  gmUnlockToStage,
  loadMemory,
  saveRun,
  setCarryMod,
  setLadderLv,
  setStageId,
  settlePile,
} from '@/core/RunMemory';

function write(patch: Record<string, unknown>): void {
  store.set(KEY, JSON.stringify({ ...loadMemory(), ...patch }));
}

describe('难度阶梯存档', () => {
  beforeEach(() => store.clear());

  it('一开始只有照旧那一档', () => {
    const m = loadMemory();
    expect(m.ladderLv).toBe(0);
    expect(m.ladderTop).toBe(0);
  });

  it('打服照旧那一档才解锁第一档', () => {
    const bad = saveRun(LADDER_GATE_WAVE - 1, ['tiezhu'], {
      cleared: false,
      ladderLv: 0,
      combos: [],
    });
    expect(bad.ladderTop).toBe(0);
    const good = saveRun(LADDER_GATE_WAVE, ['tiezhu'], {
      cleared: false,
      ladderLv: 0,
      combos: [],
    });
    expect(good.ladderTop).toBe(1);
  });

  it('打崩一局不会把解锁掉回去', () => {
    saveRun(LADDER_GATE_WAVE, ['tiezhu'], { cleared: false, ladderLv: 0, combos: [] });
    const after = saveRun(2, ['tiezhu'], { cleared: false, ladderLv: 1, combos: [] });
    expect(after.ladderTop).toBe(1);
  });

  it('解锁不会跳档：在第一档打服只到第二档', () => {
    write({ ladderTop: 1, ladderLv: 1 });
    const m = saveRun(LADDER_GATE_WAVE + 3, ['tiezhu'], {
      cleared: false,
      ladderLv: 1,
      combos: [],
    });
    expect(m.ladderTop).toBe(2);
  });

  it('顶到最后一档就不再往上', () => {
    write({ ladderTop: LADDER_TOP, ladderLv: LADDER_TOP });
    const m = saveRun(15, ['tiezhu'], { cleared: true, ladderLv: LADDER_TOP, combos: [] });
    expect(m.ladderTop).toBe(LADDER_TOP);
  });

  it('没解锁的档选不上', () => {
    write({ ladderTop: 1, ladderLv: 0 });
    expect(setLadderLv(3).ladderLv).toBe(1);
    expect(setLadderLv(1).ladderLv).toBe(1);
  });

  it('老存档没有这两个字段也能读，一律从照旧开始', () => {
    store.set(KEY, JSON.stringify({ highestWave: 9, yardScrap: 120 }));
    const m = loadMemory();
    expect(m.ladderLv).toBe(0);
    expect(m.ladderTop).toBe(0);
    expect(m.yardScrap).toBe(120);
    expect(m.laneLv).toEqual({ reach: 0, heavy: 0, stand: 0, rage: 0, band: 0 });
    expect(m.seenCombos).toEqual([]);
    expect(m.stageTop).toBe(6);
    expect(m.stageId).toBe(1);
  });

  it('打通一关才解锁下一关，选不上没开的', () => {
    const first = saveRun(4, ['tiezhu'], { cleared: true, ladderLv: 0, combos: [], stageId: 1 });
    expect(first.stageTop).toBe(2);
    expect(first.stageId).toBe(2);
    expect(setStageId(4).stageId).toBe(2);
    expect(setStageId(1).stageId).toBe(1);
  });

  it('GM 跳关把目标关写进进度，不改废品', () => {
    write({ yardScrap: 40, stageTop: 1, stageId: 1 });
    const m = gmUnlockToStage(16);
    expect(m.stageTop).toBe(16);
    expect(m.stageId).toBe(16);
    expect(m.yardScrap).toBe(40);
    expect(setStageId(10).stageId).toBe(10);
    expect(gmUnlockToStage(99).stageTop).toBe(LAST_STAGE_ID);
  });

  it('存档被人改花了也不许越界', () => {
    store.set(KEY, JSON.stringify({ ladderLv: 99, ladderTop: 99 }));
    expect(loadMemory().ladderLv).toBe(LADDER_TOP);
    store.set(KEY, JSON.stringify({ ladderLv: 5, ladderTop: 0 }));
    expect(loadMemory().ladderLv).toBe(0);
  });
});

describe('合体图鉴', () => {
  beforeEach(() => store.clear());

  it('这一局凑出来的记进柜子', () => {
    const m = saveRun(6, ['tiezhu'], {
      cleared: false,
      ladderLv: 0,
      combos: ['longsaw', 'doorcannon'],
    });
    expect(m.seenCombos).toEqual(['longsaw', 'doorcannon']);
  });

  it('再凑一次不会记成两条', () => {
    saveRun(6, ['tiezhu'], { cleared: false, ladderLv: 0, combos: ['longsaw'] });
    const m = saveRun(6, ['tiezhu'], { cleared: false, ladderLv: 0, combos: ['longsaw'] });
    expect(m.seenCombos).toEqual(['longsaw']);
  });

  it('发现过的不会因为后面几局没凑出来就丢掉', () => {
    saveRun(6, ['tiezhu'], { cleared: false, ladderLv: 0, combos: ['ragepot'] });
    const m = saveRun(6, ['tiezhu'], { cleared: false, ladderLv: 0, combos: [] });
    expect(m.seenCombos).toEqual(['ragepot']);
  });
});

describe('废品站养成', () => {
  beforeEach(() => store.clear());

  it('买的是下手更快，不是某件破烂', () => {
    write({ yardScrap: 80 });
    const m = buyYardGrowth('hands');
    expect(m?.growth.hands).toBe(1);
    expect(m?.yardScrap).toBe(55);
  });

  it('门路研发写进存档，钱不够买不了', () => {
    write({ yardScrap: 50, stageTop: 2 });
    const m = buyLaneLv('reach');
    expect(m?.laneLv.reach).toBe(1);
    expect(m?.yardScrap).toBe(15);
    write({ yardScrap: 10, laneLv: emptyLanes() });
    expect(buyLaneLv('reach')).toBeUndefined();
  });

  it('还没打到那一关的门路，钱够也买不动', () => {
    write({ yardScrap: 9999, stageTop: 1, laneLv: emptyLanes() });
    expect(buyLaneLv('reach')).toBeUndefined();
    write({ yardScrap: 9999, stageTop: 2, laneLv: emptyLanes() });
    expect(buyLaneLv('reach')?.laneLv.reach).toBe(1);
    expect(buyLaneLv('band')).toBeUndefined();
  });

  it('单件升星撤了，老存档买过的星原价折回废品，只折一次', () => {
    store.set(KEY, JSON.stringify({ yardScrap: 30, modStars: { pipe: 2, quilt: 1 } }));
    const refund = MOD_STAR_COSTS[0]! * 2 + MOD_STAR_COSTS[1]!;
    const first = loadMemory();
    expect(first.starRefund).toBe(refund);
    expect(first.yardScrap).toBe(30 + refund);
    // 再读一次不许再退一笔
    const second = loadMemory();
    expect(second.yardScrap).toBe(30 + refund);
    expect(clearStarRefund().starRefund).toBe(0);
    expect(loadMemory().yardScrap).toBe(30 + refund);
  });

  it('带哪件出村：先买携带位才点得动，再点一次是取消', () => {
    write({ growth: { ...emptyGrowth(), carry: 0 } });
    expect(setCarryMod('quilt')).toBeUndefined();
    write({ growth: { ...emptyGrowth(), carry: 1 } });
    expect(setCarryMod('quilt')?.carryModId).toBe('quilt');
    expect(setCarryMod('quilt')?.carryModId).toBe('');
    expect(setCarryMod('不存在的破烂')).toBeUndefined();
  });

  it('看广告催满那堆废品，也不许越过上限', () => {
    write({ pileScrap: 5, pileAtMs: 1000 });
    expect(fillPile(2000).pileScrap).toBe(PILE_CAP);
    expect(fillPile(3000).pileScrap).toBe(PILE_CAP);
    expect(collectPile(4000).got).toBe(PILE_CAP);
  });
});

describe('村里那堆废品', () => {
  beforeEach(() => store.clear());

  it('第一次进村只记时间，不白送', () => {
    const m = settlePile(1_000_000);
    expect(m.pileScrap).toBe(0);
    expect(m.pileAtMs).toBe(1_000_000);
  });

  it('挂一个钟头回来就有了', () => {
    settlePile(0 + 1);
    const m = settlePile(1 + 3_600_000);
    expect(m.pileScrap).toBe(PILE_PER_HOUR);
  });

  it('挂太久也就到顶', () => {
    settlePile(1);
    const m = settlePile(1 + 30 * 24 * 3_600_000);
    expect(m.pileScrap).toBe(PILE_CAP);
  });

  it('一键收：进村里废品堆，收完从零重新涨', () => {
    settlePile(1);
    const before = loadMemory().yardScrap;
    const { mem, got } = collectPile(1 + 2 * 3_600_000);
    expect(got).toBe(PILE_PER_HOUR * 2);
    expect(mem.yardScrap).toBe(before + got);
    expect(mem.pileScrap).toBe(0);
  });

  it('空着的时候收不出东西', () => {
    settlePile(1);
    expect(collectPile(1).got).toBe(0);
  });
});
