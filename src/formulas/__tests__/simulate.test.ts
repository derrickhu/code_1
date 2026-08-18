/**
 * 数值回归测试。
 *
 * 这些断言不是在测代码正确性，是在**把设计约束钉住**：
 * 卡关区间、决策价值、单局时长一旦被后续调参破坏，测试就会红。
 */

import { describe, expect, it } from 'vitest';
import { MELEE_REACH, RANK, SPAWN_DIST, TOTAL_SLOTS, TOTAL_WAVES } from '../../balance/combat';
import { ELEMENTS, getCounterMult, getCounteredBy } from '../../balance/counters';
import { HEROES, MAX_LEVEL, getHero } from '../../balance/heroes';
import { WAVES } from '../../balance/enemies';
import { ROLE_ROW } from '../../balance/picker';
import {
  applyPick,
  assignSlot,
  benchHero,
  benchOf,
  createRun,
  enemyVictim,
  heroAt,
  tick,
  type DeployOptions,
  type HeroUnit,
  type RunState,
} from '../../game/BattleEngine';
import { armorReduction, computeDamage } from '../damage';
import { simulateBatch, simulateRun } from '../simulate';

describe('站位语义', () => {
  it('前排必须比中排、后排更靠敌阵', () => {
    expect(RANK.front).toBeGreaterThan(RANK.mid);
    expect(RANK.mid).toBeGreaterThan(RANK.back);
  });

  it('坦克站前排，否则承伤设计不成立', () => {
    expect(ROLE_ROW.guard).toBe('front');
  });

  it('敌人从最远排走来，先撞上前排近战', () => {
    expect(RANK.front + MELEE_REACH).toBeGreaterThan(RANK.back + MELEE_REACH);
    expect(SPAWN_DIST).toBeGreaterThan(RANK.front + MELEE_REACH);
  });

  it('敌队要走过至少一格才撞上近战，棋盘才有空间', () => {
    const guard = HEROES.find((h) => h.role === 'guard');
    if (!guard) throw new Error('guard');
    const walk = SPAWN_DIST - (RANK.front + guard.range);
    expect(walk).toBeGreaterThanOrEqual(1);
    expect(walk / 0.9).toBeLessThanOrEqual(4);
  });

  it('默认站位时远程必须明显长于近战', () => {
    const reach = (
      role: 'guard' | 'striker' | 'splash' | 'support',
      row: 'front' | 'mid' | 'back',
    ): number => {
      const h = HEROES.find((x) => x.role === role);
      if (!h) throw new Error(role);
      return RANK[row] + h.range;
    };
    const melee = reach('guard', 'front');
    const support = reach('support', 'back');
    const splash = reach('splash', 'mid');
    const striker = reach('striker', 'mid');
    expect(melee).toBe(RANK.front + MELEE_REACH);
    expect(support).toBeGreaterThanOrEqual(melee);
    expect(splash).toBeGreaterThan(melee);
    expect(striker).toBeGreaterThan(splash);
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

describe('玩家接管阵容', () => {
  // 主体验就落在这里：玩家得能说出「把他挪到前排就顶住了」。
  // 只要引擎在下一波把人换回去，这句话就不成立，所以这几条比数值更不能破。
  const OPTS: DeployOptions = { preferCounter: true, shuffle: false };

  function runToWave(s: RunState, wave: number): void {
    let guard = 0;
    while (s.wave < wave && s.phase !== 'lost' && s.phase !== 'won') {
      if (guard++ > 200_000) throw new Error('未收敛');
      const first = s.pendingOptions[0];
      if (s.phase === 'picking' && first) applyPick(s, first, OPTS);
      else tick(s, OPTS);
      s.events.length = 0;
    }
  }

  it('默认由引擎托管，玩家没碰过就自动按克制上场', () => {
    const s = createRun(7);
    runToWave(s, 4);
    expect(s.autoDeploy).toBe(true);
    expect(s.deployed.length).toBeGreaterThan(0);
  });

  it('开局三张卡必须是三个不同系，否则第一眼看不出差别', () => {
    const s = createRun(7);
    expect(s.pendingOptions).toHaveLength(3);
    const els = s.pendingOptions.map((o) => {
      if (o.kind !== 'recruit') throw new Error('开局必须是英雄卡');
      return getHero(o.heroId).element;
    });
    expect(new Set(els).size).toBe(3);
  });

  it('整局会累计克制与漏怪，结算才能归因', () => {
    const s = createRun(7);
    const first = s.pendingOptions[0];
    applyPick(s, first!, OPTS);
    let guard = 0;
    while (s.phase !== 'lost' && s.phase !== 'won' && guard++ < 80_000) {
      tick(s, OPTS);
      s.events.length = 0;
    }
    expect(s.stats.hits).toBeGreaterThan(0);
    expect(s.stats.counterHits).toBeGreaterThanOrEqual(0);
    expect(s.stats.leaks + (s.phase === 'won' ? 1 : 0)).toBeGreaterThanOrEqual(0);
  });

  it('开局只有一个人时站中间格，不贴左边', () => {
    const s = createRun(7);
    const first = s.pendingOptions[0];
    expect(first).toBeDefined();
    applyPick(s, first!, OPTS);
    expect(s.deployed).toHaveLength(1);
    expect(s.deployed[0]?.slot).toBe(1);
  });

  it('手动指派后，后续波次不会被引擎换掉', () => {
    const s = createRun(7);
    runToWave(s, 6);
    const bench = benchOf(s);
    const target = bench[0] ?? s.roster[s.roster.length - 1];
    expect(target).toBeDefined();

    assignSlot(s, target!.def.id, 'front', 0);
    expect(s.autoDeploy).toBe(false);
    expect(heroAt(s, 'front', 0)?.def.id).toBe(target!.def.id);

    runToWave(s, 8);
    if (s.phase !== 'lost') {
      expect(heroAt(s, 'front', 0)?.def.id).toBe(target!.def.id);
    }
  });

  it('撤下一人后，下一波由引擎补空格而不是推翻重排', () => {
    const s = createRun(11);
    runToWave(s, 6);
    const keep = heroAt(s, 'back', 0);
    const drop = heroAt(s, 'front', 0);
    if (!keep || !drop) return;

    benchHero(s, drop.def.id);
    expect(heroAt(s, 'front', 0)).toBeUndefined();

    runToWave(s, 7);
    if (s.phase !== 'lost') {
      expect(heroAt(s, 'back', 0)?.def.id).toBe(keep.def.id);
      expect(s.deployed.length).toBeLessThanOrEqual(TOTAL_SLOTS);
    }
  });

  it('英雄优先打本列敌人，换列才有差别', () => {
    const s = createRun(7);
    const first = s.pendingOptions[0];
    applyPick(s, first!, OPTS);
    const def = getHero('flame_striker');
    const hero = {
      def,
      level: 1,
      row: 'mid' as const,
      slot: 0,
      hp: def.hp,
      maxHp: def.hp,
      shield: 0,
      cdMs: 0,
      skillCdMs: 9999,
      alive: true,
    };
    s.roster.push(hero);
    s.deployed = [hero];
    const proto = { id: 'grunt', name: '兵卒', hp: 800, atk: 1, def: 0, speed: 0, attackIntervalMs: 9999, isBoss: false };
    s.enemies = [
      { id: 1, proto, element: 'flame', hp: 800, maxHp: 800, atk: 1, dist: 2.2, lane: 2, cdMs: 9999, slowMs: 0, slowPct: 0 },
      { id: 2, proto, element: 'vine', hp: 800, maxHp: 800, atk: 1, dist: 4.2, lane: 0, cdMs: 9999, slowMs: 0, slowPct: 0 },
    ];
    s.phase = 'fighting';
    hero!.cdMs = 0;
    for (let i = 0; i < 8; i += 1) tick(s, OPTS);
    const firstHit = s.events.find((e) => e.kind === 'hit');
    expect(firstHit?.kind === 'hit' && firstHit.enemyId).toBe(2);
  });

  it('敌人近身挥击会留下敌方命中事件', () => {
    const s = createRun(7);
    const first = s.pendingOptions[0];
    applyPick(s, first!, OPTS);
    const hero = s.deployed[0];
    expect(hero).toBeDefined();
    hero!.row = 'front';
    hero!.slot = 1;
    hero!.hp = 4000;
    hero!.maxHp = 4000;
    hero!.cdMs = 9999;
    hero!.skillCdMs = 9999;
    const proto = {
      id: 'grunt',
      name: '兵卒',
      hp: 8000,
      atk: 40,
      def: 0,
      speed: 0,
      attackIntervalMs: 400,
      isBoss: false,
    };
    s.enemies = [{
      id: 9,
      proto,
      element: 'flame',
      hp: 8000,
      maxHp: 8000,
      atk: 40,
      dist: RANK.front + 0.4,
      lane: 1,
      cdMs: 0,
      slowMs: 0,
      slowPct: 0,
    }];
    s.phase = 'fighting';
    tick(s, OPTS);
    const ev = s.events.find((e) => e.kind === 'enemyHit');
    expect(ev?.kind).toBe('enemyHit');
    if (ev?.kind === 'enemyHit') {
      expect(ev.heroId).toBe(hero!.def.id);
      expect(ev.damage).toBeGreaterThan(0);
    }
  });

  it('漩涡拉回会带上被拉的敌人，渲染才知道不是怪自己后退', () => {
    const s = createRun(7);
    const first = s.pendingOptions[0];
    applyPick(s, first!, OPTS);
    const def = getHero('tide_splash');
    const caster = {
      def,
      level: 1,
      row: 'back' as const,
      slot: 1,
      hp: def.hp,
      maxHp: def.hp,
      shield: 0,
      cdMs: 9999,
      skillCdMs: 0,
      alive: true,
    };
    s.roster.push(caster);
    s.deployed = [caster];
    const proto = {
      id: 'grunt',
      name: '兵卒',
      hp: 8000,
      atk: 1,
      def: 0,
      speed: 0,
      attackIntervalMs: 9999,
      isBoss: false,
    };
    s.enemies = [{
      id: 3,
      proto,
      element: 'flame',
      hp: 8000,
      maxHp: 8000,
      atk: 1,
      dist: 2.2,
      lane: 1,
      cdMs: 9999,
      slowMs: 0,
      slowPct: 0,
    }];
    s.phase = 'fighting';
    tick(s, OPTS);
    const ev = s.events.find((e) => e.kind === 'skill' && e.skillKind === 'vortex');
    expect(ev?.kind).toBe('skill');
    if (ev?.kind === 'skill') {
      expect(ev.pulledIds).toContain(3);
    }
    expect(s.enemies[0]?.dist).toBeGreaterThan(2.2);
  });

  it('有前排时敌人只打前排，不切后排', () => {
    const tank = getHero('flame_guard');
    const dps = getHero('flame_striker');
    const front: HeroUnit = {
      def: tank, level: 1, row: 'front', slot: 1,
      hp: 4000, maxHp: 4000, shield: 0, cdMs: 9999, skillCdMs: 9999, alive: true,
    };
    const rear: HeroUnit = {
      def: dps, level: 1, row: 'back', slot: 1,
      hp: 4000, maxHp: 4000, shield: 0, cdMs: 9999, skillCdMs: 9999, alive: true,
    };
    const proto = {
      id: 'grunt', name: '兵卒', hp: 8000, atk: 40, def: 0, speed: 0,
      attackIntervalMs: 400, isBoss: false,
    };
    const enemy = {
      id: 4, proto, element: 'flame' as const, hp: 8000, maxHp: 8000, atk: 40,
      dist: RANK.front + 0.4, lane: 1 as const, cdMs: 0, slowMs: 0, slowPct: 0,
    };
    expect(enemyVictim(enemy, [front, rear])?.def.id).toBe(tank.id);
    front.alive = false;
    expect(enemyVictim(enemy, [front, rear])).toBeUndefined();
    enemy.dist = RANK.back + 0.4;
    expect(enemyVictim(enemy, [front, rear])?.def.id).toBe(dps.id);
  });

  it('荆棘卫命中后敌人下一次出手变慢', () => {
    const s = createRun(7);
    const first = s.pendingOptions[0];
    applyPick(s, first!, OPTS);
    const def = getHero('vine_guard');
    const hero: HeroUnit = {
      def, level: 1, row: 'front', slot: 1,
      hp: def.hp, maxHp: def.hp, shield: 0, cdMs: 0, skillCdMs: 9999, alive: true,
    };
    s.deployed = [hero];
    s.roster.push(hero);
    const proto = {
      id: 'grunt', name: '兵卒', hp: 8000, atk: 1, def: 0, speed: 0,
      attackIntervalMs: 1000, isBoss: false,
    };
    s.enemies = [{
      id: 8, proto, element: 'flame', hp: 8000, maxHp: 8000, atk: 1,
      dist: RANK.front + 0.4, lane: 1, cdMs: 9999, slowMs: 0, slowPct: 0,
    }];
    s.phase = 'fighting';
    tick(s, OPTS);
    expect(s.enemies[0]?.slowPct).toBe(30);
    s.enemies[0]!.cdMs = 0;
    tick(s, OPTS);
    expect(s.enemies[0]?.cdMs).toBeGreaterThan(1000);
  });

  it('上场人数永远不超过格子数', () => {
    const s = createRun(3);
    runToWave(s, 12);
    expect(s.deployed.length).toBeLessThanOrEqual(TOTAL_SLOTS);
    const seen = new Set(s.deployed.map((h) => `${h.row}:${h.slot}`));
    expect(seen.size).toBe(s.deployed.length);
  });
});
