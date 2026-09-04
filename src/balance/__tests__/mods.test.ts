import { describe, expect, it } from 'vitest';
import { ECHO_MODS, MODS, RUN_MODS, formatEffect, masteredMod, scaleAbility } from '@/balance/mods';

describe('破烂升星', () => {
  it('水管两星射程多一格，定位不变', () => {
    const pipe = MODS.find((m) => m.id === 'pipe')!;
    expect(pipe.effect).toEqual({ kind: 'rangeUp', value: 3 });
    expect(scaleAbility(pipe.effect, 2)).toEqual({ kind: 'rangeUp', value: 4 });
    const grown = masteredMod(pipe, 2);
    expect(grown.kind).toBe(pipe.kind);
    expect(grown.becomes).toBe(pipe.becomes);
    expect(grown.desc).toBe(formatEffect({ kind: 'rangeUp', value: 4 }));
  });

  it('零星原样，满星也不改 kind', () => {
    const foam = MODS.find((m) => m.id === 'foam')!;
    expect(masteredMod(foam, 0)).toBe(foam);
    const maxed = scaleAbility(foam.effect, 4);
    expect(maxed.kind).toBe('slowOnHit');
    if (maxed.kind !== 'slowOnHit' || foam.effect.kind !== 'slowOnHit') return;
    expect(maxed.slowPct).toBeGreaterThan(foam.effect.slowPct);
  });
});

describe('本局池', () => {
  it('回声件还在表里，但不进本局抽', () => {
    expect(ECHO_MODS.has('slingshot')).toBe(true);
    expect(MODS.some((m) => m.id === 'slingshot')).toBe(true);
    expect(RUN_MODS.some((m) => m.id === 'slingshot')).toBe(false);
    expect(RUN_MODS.length).toBe(MODS.length - ECHO_MODS.size);
  });
});
