import { describe, expect, it } from 'vitest';
import { ImpactGate, enemyImpactKey } from '@/fx/ImpactGate';
import { shouldFly, skinLook, attackLook } from '@/fx/FxRecipe';

describe('落点门闩', () => {
  it('死亡等最后一发落地才放', () => {
    const gate = new ImpactGate();
    const order: string[] = [];
    const key = enemyImpactKey(7);
    gate.begin(key);
    expect(gate.holding(key)).toBe(true);
    expect(gate.defer(key, () => order.push('die'))).toBe(true);
    expect(order).toEqual([]);
    const extra = gate.settle(key);
    expect(extra).toHaveLength(1);
    extra[0]!();
    expect(order).toEqual(['die']);
    expect(gate.holding(key)).toBe(false);
  });

  it('两发打同一个，第一发落地还不炸尸体', () => {
    const gate = new ImpactGate();
    const key = enemyImpactKey(3);
    gate.begin(key);
    gate.begin(key);
    gate.defer(key, () => undefined);
    expect(gate.settle(key)).toEqual([]);
    expect(gate.holding(key)).toBe(true);
    expect(gate.settle(key)).toHaveLength(1);
  });

  it('路上没有弹时死亡立刻放', () => {
    const gate = new ImpactGate();
    expect(gate.defer(enemyImpactKey(1), () => undefined)).toBe(false);
  });

  it('见底就放，后面几发不再钉尸体', () => {
    const gate = new ImpactGate();
    const key = enemyImpactKey(4);
    const order: string[] = [];
    gate.begin(key);
    gate.begin(key);
    gate.defer(key, () => order.push('die'));
    expect(gate.release(key)).toHaveLength(1);
    order.push('released');
    expect(gate.holding(key)).toBe(false);
    gate.markLinger(key);
    expect(gate.holding(key)).toBe(true);
    gate.clearLinger(key);
    expect(gate.holding(key)).toBe(false);
    expect(gate.settle(key)).toEqual([]);
    expect(gate.holding(key)).toBe(false);
  });
});

describe('谁必须先飞再炸', () => {
  it('锅 / 秤砣 / 碟有实物弹，近战也不能当场隔空炸', () => {
    expect(shouldFly(skinLook('pot'), true)).toBe(true);
    expect(shouldFly(skinLook('weight'), true)).toBe(true);
    expect(shouldFly(skinLook('sanshen'), true)).toBe(true);
    expect(shouldFly(skinLook('slingshot'), true)).toBe(true);
  });

  it('铁柱贴脸挥空拳才当场打完', () => {
    expect(shouldFly(skinLook('tiezhu'), true)).toBe(false);
    expect(shouldFly(attackLook('slash'), true)).toBe(false);
    expect(shouldFly(attackLook('slash'), false)).toBe(true);
  });
});
