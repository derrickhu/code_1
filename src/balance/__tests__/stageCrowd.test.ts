import { describe, expect, it } from 'vitest';

import { STAGES, unitWeight } from '@/balance/stages';

/** 杂兵按份量数：一窝里的一只按摊薄的算，小头目按几只算，大个子另算 */
function smallCount(chapter: number, index: number): number {
  const s = STAGES.find((x) => x.chapter === chapter && x.index === index)!;
  const n = s.waves.reduce(
    (sum, w) => sum + w.groups.reduce((a, g) => a + (g.boss ? 0 : g.count * unitWeight(g)), 0),
    0,
  );
  return Math.round(n * 100) / 100;
}

describe('杂兵只数', () => {
  it('1-3 的小怪不少于 1-1、1-2，而且每一波至少两只', () => {
    expect(smallCount(1, 3)).toBeGreaterThanOrEqual(smallCount(1, 1));
    expect(smallCount(1, 3)).toBeGreaterThanOrEqual(smallCount(1, 2));
    const s = STAGES.find((x) => x.chapter === 1 && x.index === 3)!;
    for (const w of s.waves) {
      const n = w.groups.reduce((a, g) => a + (g.boss ? 0 : g.count), 0);
      expect(n).toBeGreaterThanOrEqual(2);
    }
  });

  it('1-5 的小怪停在预算上，不再按波次补成一堵墙', () => {
    expect(smallCount(1, 5)).toBeLessThanOrEqual(20);
    expect(smallCount(1, 3)).toBeLessThanOrEqual(16);
  });

  it('前 8 章里，后一关的小怪不少于前一关', () => {
    for (let c = 1; c <= 8; c += 1) {
      for (let i = 2; i <= 5; i += 1) {
        expect(smallCount(c, i), `${c}-${i} 比 ${c}-${i - 1} 少`).toBeGreaterThanOrEqual(smallCount(c, i - 1));
      }
    }
  });

  it('第 1 关就是两路来，后面每关都不止一路', () => {
    for (const s of STAGES.filter((x) => x.chapter <= 8)) {
      const lanes = new Set(s.waves.flatMap((w) => w.groups.map((g) => g.lane)));
      expect(lanes.size, s.label).toBeGreaterThanOrEqual(s.chapter === 1 ? 2 : 3);
    }
  });
});
