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

/*
 * 皮的 key 这一版换成了**家伙 id**（gear.handIdOf），不再是村民 id 或改装件 id ——
 * 手上拿什么由「村民 + 进化阶」决定，所以皮也跟着家伙走。
 */
describe('谁必须先飞再炸', () => {
  it('锅 / 秤砣 / 音响 / 弹弓有实物弹，近战也不能当场隔空炸', () => {
    expect(shouldFly(skinLook('pot'), true)).toBe(true);
    expect(shouldFly(skinLook('weight'), true)).toBe(true);
    expect(shouldFly(skinLook('speaker'), true)).toBe(true);
    expect(shouldFly(skinLook('sling'), true)).toBe(true);
  });

  it('扳手贴脸挥就当场打完，隔着距离才要飞一下', () => {
    expect(shouldFly(skinLook('wrench'), true)).toBe(false);
    expect(shouldFly(attackLook('slash'), true)).toBe(false);
    expect(shouldFly(attackLook('slash'), false)).toBe(true);
  });
});
