import { describe, expect, it } from 'vitest';
import { RUN_MODS, MOD_STAR_MAX } from '@/balance/mods';
import {
  LANES,
  LANE_LV_COSTS,
  LANE_LV_MAX,
  assertLanesCoverMods,
  clampLanes,
  drawMulFromLanes,
  emptyLanes,
  laneDrawMul,
  laneOf,
  laneStars,
  laneTotalCost,
  nextLaneCost,
  starsFromLanes,
} from '@/balance/lanes';
import { MOD_STAR_COSTS, refundModStars } from '@/balance/yard';

describe('门路划分', () => {
  it('本局能抽的破烂一件不漏，也没有一件挂两条路', () => {
    assertLanesCoverMods();
    const all = LANES.flatMap((l) => l.mods);
    expect(new Set(all).size).toBe(all.length);
    expect(new Set(all).size).toBe(RUN_MODS.length);
  });

  it('每条路至少 3 件。同类砍完之后下手重 / 越挨越猛只留代表', () => {
    for (const l of LANES) expect(l.mods.length).toBeGreaterThanOrEqual(3);
  });

  it('门路标签查得回来', () => {
    expect(laneOf('pipe')).toBe('reach');
    expect(laneOf('quilt')).toBe('stand');
    expect(laneOf('不存在的破烂')).toBeUndefined();
  });
});

describe('研发一级换到什么', () => {
  it('出得更勤，但一条路不许把三选一刷成同款', () => {
    expect(laneDrawMul(0)).toBe(1);
    for (let lv = 1; lv <= LANE_LV_MAX; lv += 1) {
      expect(laneDrawMul(lv)).toBeGreaterThan(laneDrawMul(lv - 1));
    }
    expect(laneDrawMul(LANE_LV_MAX)).toBeLessThanOrEqual(2.75);
  });

  it('星级只升不降，顶不过单件星上限', () => {
    for (let lv = 1; lv <= LANE_LV_MAX; lv += 1) {
      expect(laneStars(lv)).toBeGreaterThanOrEqual(laneStars(lv - 1));
    }
    expect(laneStars(0)).toBe(0);
    expect(laneStars(LANE_LV_MAX)).toBeGreaterThan(0);
    expect(laneStars(LANE_LV_MAX)).toBeLessThanOrEqual(MOD_STAR_MAX);
  });

  it('价钱一路往上，满级就没有下一档', () => {
    for (let i = 1; i < LANE_LV_COSTS.length; i += 1) {
      expect(LANE_LV_COSTS[i]!).toBeGreaterThan(LANE_LV_COSTS[i - 1]!);
    }
    expect(nextLaneCost(LANE_LV_MAX)).toBeUndefined();
    expect(laneTotalCost()).toBe(
      LANES.length * LANE_LV_COSTS.reduce((a, c) => a + c, 0),
    );
  });

  it('乱写的等级压回范围内', () => {
    const c = clampLanes({ reach: 99, heavy: -3 } as never);
    expect(c.reach).toBe(LANE_LV_MAX);
    expect(c.heavy).toBe(0);
    expect(clampLanes(undefined)).toEqual(emptyLanes());
  });
});

describe('门路摊到每一件', () => {
  it('研发一条路，这条路上每件都吃到星', () => {
    const stars = starsFromLanes({ ...emptyLanes(), reach: LANE_LV_MAX });
    const reach = LANES.find((l) => l.id === 'reach')!;
    for (const id of reach.mods) expect(stars[id]).toBe(laneStars(LANE_LV_MAX));
    expect(stars.quilt).toBeUndefined();
  });

  it('什么都没研发时一个字都不写，白板局不受影响', () => {
    expect(starsFromLanes(emptyLanes())).toEqual({});
    expect(drawMulFromLanes(emptyLanes())).toEqual({});
  });
});

describe('老存档折算', () => {
  it('买过的单件星按原价全额退，不打折', () => {
    const one = MOD_STAR_COSTS[0]!;
    expect(refundModStars({ pipe: 1 })).toBe(one);
    expect(refundModStars({ pipe: 2 })).toBe(one + MOD_STAR_COSTS[1]!);
    expect(refundModStars({ pipe: 1, quilt: 1 })).toBe(one * 2);
  });

  it('没买过就不退，脏数据也不许退出钱来', () => {
    expect(refundModStars(undefined)).toBe(0);
    expect(refundModStars({})).toBe(0);
    expect(refundModStars({ 不存在的破烂: 4 })).toBe(0);
  });
});
