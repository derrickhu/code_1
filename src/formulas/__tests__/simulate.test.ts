/**
 * 数值回归测试。
 *
 * 这些断言不是在测代码正确性，是在**把设计约束钉住**：
 * 卡关区间、决策价值、单局时长一旦被后续调参破坏，测试就会红。
 */

import { describe, expect, it } from 'vitest';
import { MELEE_REACH, ROW_POS, SPAWN_DIST, TOTAL_WAVES } from '../../balance/combat';
import { ELEMENTS, getCounterMult, getCounteredBy } from '../../balance/counters';
import { HEROES, MAX_LEVEL } from '../../balance/heroes';
import { WAVES } from '../../balance/enemies';
import { ROLE_ROW } from '../../balance/picker';
import { armorReduction, computeDamage } from '../damage';
import { simulateBatch, simulateRun } from '../simulate';

describe('站位语义', () => {
  // 这几条钉的是一个真实踩过的坑：front/back 曾被写成 14/26，
  // 而敌人 dist 是递减的，结果后排先接敌、坦克躲在后面挨不到打。
  // 数值全都「看着正常」，但前排承伤这一层设计其实完全没生效。
  it('前排必须比后排更靠敌人出生点', () => {
    expect(ROW_POS.front).toBeGreaterThan(ROW_POS.back);
  });

  it('坦克站前排，否则承伤设计不成立', () => {
    expect(ROLE_ROW.guard).toBe('front');
  });

  it('敌人推进时先进入前排近战范围', () => {
    // dist 递减，先满足的必须是前排的判定阈值
    expect(ROW_POS.front + MELEE_REACH).toBeGreaterThan(ROW_POS.back + MELEE_REACH);
    expect(SPAWN_DIST).toBeGreaterThan(ROW_POS.front + MELEE_REACH);
  });
});

describe('克制表', () => {
  it('三系构成单向循环，不存在互克或自克', () => {
    for (const a of ELEMENTS) {
      expect(getCounterMult(a, a)).toBe(1);
      const prey = ELEMENTS.filter((b) => getCounterMult(a, b) > 1);
      const predators = ELEMENTS.filter((b) => getCounterMult(b, a) > 1);
      expect(prey).toHaveLength(1);
      expect(predators).toHaveLength(1);
      expect(prey[0]).not.toBe(predators[0]);
    }
  });

  it('getCounteredBy 与克制表一致', () => {
    for (const el of ELEMENTS) {
      expect(getCounterMult(getCounteredBy(el), el)).toBeGreaterThan(1);
    }
  });
});

describe('伤害公式', () => {
  it('护甲减伤递减且永不免伤', () => {
    expect(armorReduction(0)).toBe(0);
    expect(armorReduction(100)).toBeCloseTo(0.5);
    expect(armorReduction(1e6)).toBeLessThan(1);
  });

  it('克制独占一个乘区，不被护甲吃掉', () => {
    const base = { atk: 100, targetDef: 50, counterBonusPct: 0, critMult: 1, targetDamageReductionPct: 0 };
    const neutral = computeDamage({ ...base, counterMult: 1 });
    const advantage = computeDamage({ ...base, counterMult: 1.5 });
    expect(advantage / neutral).toBeCloseTo(1.5);
  });

  it('相克增益只在克制成立时生效', () => {
    const base = { atk: 100, targetDef: 50, critMult: 1, targetDamageReductionPct: 0 };
    const neutralWithBonus = computeDamage({ ...base, counterMult: 1, counterBonusPct: 15 });
    const neutralNoBonus = computeDamage({ ...base, counterMult: 1, counterBonusPct: 0 });
    expect(neutralWithBonus).toBe(neutralNoBonus);

    const advWithBonus = computeDamage({ ...base, counterMult: 1.5, counterBonusPct: 15 });
    const advNoBonus = computeDamage({ ...base, counterMult: 1.5, counterBonusPct: 0 });
    expect(advWithBonus).toBeGreaterThan(advNoBonus);
  });
});

describe('英雄池', () => {
  it('12 个英雄覆盖 3 系 × 4 定位，无重复组合', () => {
    expect(HEROES).toHaveLength(12);
    const combos = new Set(HEROES.map((h) => `${h.element}/${h.role}`));
    expect(combos.size).toBe(12);
  });

  it('同定位基础数值完全相同，保证换人的差别只来自系别与技能', () => {
    for (const role of ['guard', 'striker', 'splash', 'support'] as const) {
      const group = HEROES.filter((h) => h.role === role);
      expect(group).toHaveLength(3);
      const [first] = group;
      expect(first).toBeDefined();
      for (const h of group) {
        expect(h.hp).toBe(first?.hp);
        expect(h.atk).toBe(first?.atk);
        expect(h.def).toBe(first?.def);
        expect(h.range).toBe(first?.range);
        expect(h.attackIntervalMs).toBe(first?.attackIntervalMs);
      }
    }
  });

  it('每个英雄都有可量化技能与面向玩家的一句话', () => {
    for (const h of HEROES) {
      expect(h.skill.kind).toBeTruthy();
      expect(h.skillName.length).toBeGreaterThan(0);
      expect(h.skillDesc.length).toBeGreaterThan(0);
    }
  });
});

describe('波次编排', () => {
  it('15 波连续且都有敌人与预告', () => {
    expect(WAVES).toHaveLength(TOTAL_WAVES);
    WAVES.forEach((w, i) => {
      expect(w.wave).toBe(i + 1);
      expect(w.spawns.length).toBeGreaterThan(0);
      expect(w.hint.length).toBeGreaterThan(0);
    });
  });

  it('前 3 波只出一个系，作为建立信任的教学段', () => {
    for (const w of WAVES.slice(0, 3)) {
      const els = new Set(w.spawns.map((s) => s.element));
      expect(els.size).toBe(1);
    }
  });

  it('第 9 波起进入混系，对应主卡关区', () => {
    const mixed = WAVES.slice(8).filter((w) => new Set(w.spawns.map((s) => s.element)).size > 1);
    expect(mixed.length).toBeGreaterThanOrEqual(6);
  });
});

describe('单局模拟', () => {
  it('同一 seed 可复现', () => {
    const a = simulateRun({ strategy: 'smart', seed: 42 });
    const b = simulateRun({ strategy: 'smart', seed: 42 });
    expect(a).toEqual(b);
  });

  it('结果落在合法区间，收集数不超过英雄池且不破 5 级上限', () => {
    const r = simulateRun({ strategy: 'smart', seed: 7 });
    expect(r.reachedWave).toBeGreaterThanOrEqual(1);
    expect(r.reachedWave).toBeLessThanOrEqual(TOTAL_WAVES);
    expect(r.roster.length).toBeLessThanOrEqual(HEROES.length);
    for (const m of r.roster) expect(m.level).toBeLessThanOrEqual(MAX_LEVEL);
  });
});

describe('设计约束回归', () => {
  const RUNS = 300;
  const smart = simulateBatch('smart', RUNS);
  const random = simulateBatch('random', RUNS);
  const coverage = simulateBatch('coverage', RUNS);

  it('卡关中位数落在第 9 到 12 波', () => {
    for (const s of [smart, random, coverage]) {
      expect(s.medianWave).toBeGreaterThanOrEqual(9);
      expect(s.medianWave).toBeLessThanOrEqual(12);
    }
  });

  it('会玩的玩家要明显打得更深，否则等于「选谁都一样」', () => {
    expect(smart.meanWave - random.meanWave).toBeGreaterThanOrEqual(1);
    expect(smart.clearRate).toBeGreaterThan(random.clearRate);
  });

  it('克制本身必须有决策价值：看系别要强于不看系别', () => {
    // 这是本项目头号风险的守门线。smart 与 coverage 都会优先填满阵容，
    // 唯一差别是招人与上场时看不看系别，所以这个差值就是克制的价值。
    expect(smart.meanWave - coverage.meanWave).toBeGreaterThanOrEqual(0.8);
  });

  it('通关是稀有但真实可达的，终局不是纯数值墙', () => {
    expect(smart.clearRate).toBeGreaterThan(0);
    expect(smart.clearRate).toBeLessThan(0.2);
  });

  it('单局时长落在碎片时间可打完的区间', () => {
    expect(smart.avgDurationSec).toBeGreaterThan(180);
    expect(smart.avgDurationSec).toBeLessThan(900);
  });

  it('难度衰减平滑，不出现某一波是硬墙的断崖', () => {
    // 区分「卡关坡度」和「硬墙」：主卡关区本来就该有明显下降，那是卡关的定义；
    // 硬墙是指某一波把绝大多数人一次性挡死（早期版本第 8 波曾从 62% 掉到 13%，
    // 比率 0.21，原因是 Boss 速度撞上了单波超时保护）。这里守的是后者。
    for (let w = 1; w < 12; w += 1) {
      const cur = smart.reachRate[w - 1] ?? 0;
      const next = smart.reachRate[w] ?? 0;
      if (cur > 0.2) expect(next / cur).toBeGreaterThan(0.35);
    }
  });
});
