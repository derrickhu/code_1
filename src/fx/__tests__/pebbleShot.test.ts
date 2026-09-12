import { describe, expect, it } from 'vitest';

import { pebbleAt, pebbleLoft, pebbleShadow, planPebble } from '@/fx/PebbleShot';

describe('摊位弹子弹道', () => {
  it('落地准，中段比直线高，远的飞得更久', () => {
    const near = planPebble(375, 1100, 375, 900);
    const far = planPebble(375, 1100, 155, 520);
    const end = pebbleAt(far, far.T);
    expect(end.x).toBeCloseTo(far.x1, 5);
    expect(end.y).toBeCloseTo(far.y1, 5);
    expect(pebbleLoft(far)).toBeGreaterThan(40);
    expect(far.T).toBeGreaterThan(near.T);
    expect(far.T).toBeGreaterThanOrEqual(0.4);
    expect(far.T).toBeLessThanOrEqual(0.58);
  });

  it('影子钉在轨迹下方，飞得越高越小', () => {
    const f = planPebble(375, 1100, 155, 520);
    const mid = pebbleShadow(f, f.T * 0.5);
    const land = pebbleShadow(f, f.T);
    const p = pebbleAt(f, f.T * 0.5);
    expect(mid.y).toBeGreaterThan(p.y);
    expect(mid.sx).toBeLessThan(land.sx);
    expect(mid.alpha).toBeLessThan(land.alpha);
    expect(land.y).toBeGreaterThan(f.y1);
  });

  it('连击那一下是短跳，不另起一道光', () => {
    const hop = planPebble(375, 600, 415, 550, true);
    const shot = planPebble(375, 1100, 375, 520);
    expect(hop.T).toBeLessThan(shot.T);
    expect(hop.T).toBeLessThanOrEqual(0.32);
    const end = pebbleAt(hop, hop.T);
    expect(end.x).toBeCloseTo(415, 5);
    expect(end.y).toBeCloseTo(550, 5);
  });
});
