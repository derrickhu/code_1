/**
 * 底线拖拉机、急眼、同屏上限、门口预告、打残了提前来。
 * 数值随便调，这几条红了说明机制坏了：拖拉机救了还算漏、一路发动两回、门外的也撞死、
 * 大个子一撞就没、急眼放两回、同屏塞爆、门口天天亮着。
 */
import { describe, expect, it } from 'vitest';

import {
  EARLY_CALL_MS, FOE_CAP, GOAL_POS, LAST_LINE_BOSS_CUT, LEAK_ALLOW, VIS_ENGAGE_POS,
} from '@/balance/combat';
import { ENERGY_MAX } from '@/balance/skills';
import { getEnemy, getStage } from '@/balance/stages';
import { getVillager } from '@/balance/villagers';
import {
  createBattle, foeOf, gateWarnings, startFight, tick,
  type BattleState, type Foe,
} from '@/game/BattleEngine';

const HUGE = 9_999_999;

function field(): BattleState {
  const place = [{ villager: getVillager('tiezhu'), lane: 1, cell: 3, evoStage: 1, stars: 0 }];
  const state = createBattle(getStage(1), [], 1, 1, place);
  startFight(state);
  state.schedule = [];
  for (const f of state.team) {
    f.cd = HUGE;
    f.hp = HUGE;
    f.maxHp = HUGE;
    f.energy = 0;
  }
  return state;
}

function put(state: BattleState, lane: number, pos: number, extra: Partial<Foe> = {}): Foe {
  const e: Foe = {
    ...foeOf(getEnemy('grunt'), state.nextFoeId, lane, pos), hp: HUGE, maxHp: HUGE, atk: 0, ...extra,
  };
  state.nextFoeId += 1;
  state.foes.push(e);
  return e;
}

describe('底线拖拉机', () => {
  it('第一只冲到底线的不算漏，这一路进了门的全撞倒，门外的不撞', () => {
    const state = field();
    const runner = put(state, 0, GOAL_POS - 0.01, { spd: 5 });
    const inside = put(state, 0, VIS_ENGAGE_POS + 0.5);
    const outside = put(state, 0, VIS_ENGAGE_POS - 0.6);
    const other = put(state, 2, VIS_ENGAGE_POS + 0.5);
    tick(state);
    expect(state.leaked).toBe(0);
    expect(state.lastLineUsed).toBe(1);
    expect(state.events.some((e) => e.kind === 'lastLine' && e.lane === 0)).toBe(true);
    expect(runner.alive).toBe(false);
    expect(inside.alive).toBe(false);
    expect(outside.alive).toBe(true);
    expect(other.alive).toBe(true);
  });

  it('一路只发动一回，第二只就是漏；别的路的还在', () => {
    const state = field();
    put(state, 2, 0, { spd: 0 });
    put(state, 0, GOAL_POS - 0.01, { spd: 5 });
    tick(state);
    put(state, 0, GOAL_POS - 0.01, { spd: 5 });
    tick(state);
    expect(state.leaked).toBe(1);
    expect(state.lastLine).toEqual([false, true, true]);
  });

  it('大个子撞不死：掉三成血，往回顶一段', () => {
    const state = field();
    put(state, 0, GOAL_POS - 0.01, { spd: 5 });
    const boss = put(state, 0, GOAL_POS - 0.5, { boss: true, hp: 1000, maxHp: 1000 });
    tick(state);
    expect(boss.alive).toBe(true);
    expect(boss.hp).toBe(1000 - Math.round(1000 * LAST_LINE_BOSS_CUT));
    expect(boss.pos).toBeLessThan(GOAL_POS - 1);
  });
});

describe('乡亲们急眼了', () => {
  it('再漏一只就输的那一下，站着的人劲头全满，一关只一回', () => {
    const state = field();
    state.lastLine.fill(false);
    state.leaked = LEAK_ALLOW - 2;
    put(state, 0, GOAL_POS - 0.01, { spd: 5 });
    tick(state);
    expect(state.leaked).toBe(LEAK_ALLOW - 1);
    expect(state.rallied).toBe(true);
    expect(state.team.every((f) => f.energy === ENERGY_MAX)).toBe(true);
    expect(state.events.filter((e) => e.kind === 'rally')).toHaveLength(1);

    for (const f of state.team) f.energy = 0;
    state.leaked = LEAK_ALLOW - 2;
    put(state, 2, GOAL_POS - 0.01, { spd: 5 });
    state.events.length = 0;
    tick(state);
    expect(state.events.some((e) => e.kind === 'rally')).toBe(false);
    expect(state.team.every((f) => f.energy < ENERGY_MAX)).toBe(true);
  });
});

describe('出怪的节奏', () => {
  it('同屏到上限就排在门外，腾出位置再进', () => {
    const state = field();
    state.wave = 1;
    state.schedule = Array.from({ length: FOE_CAP + 6 }, () => ({
      atMs: 0, lane: 1, enemy: 'grunt', wave: 1, boss: false,
    }));
    state.spawnIdx = 0;
    tick(state);
    expect(state.foes.filter((e) => e.alive)).toHaveLength(FOE_CAP);
    expect(state.spawnIdx).toBe(FOE_CAP);
  });

  it('门口预告只报空着的路和带头目的', () => {
    const state = field();
    state.schedule = [
      { atMs: state.elapsedMs + 1000, lane: 0, enemy: 'grunt', wave: 2, boss: false, kind: 'swarm' },
      { atMs: state.elapsedMs + 1200, lane: 0, enemy: 'grunt', wave: 2, boss: false, kind: 'swarm' },
      { atMs: state.elapsedMs + 1000, lane: 1, enemy: 'grunt', wave: 2, boss: false },
      { atMs: state.elapsedMs + 1500, lane: 2, enemy: 'cube', wave: 2, boss: false, kind: 'elite' },
    ];
    state.spawnIdx = 0;
    put(state, 1, VIS_ENGAGE_POS + 0.5);
    put(state, 2, VIS_ENGAGE_POS + 0.5);
    const warns = gateWarnings(state);
    expect(warns.map((w) => w.lane).sort()).toEqual([0, 2]);
    expect(warns.find((w) => w.lane === 0)!.n).toBe(2);
    expect(warns.find((w) => w.lane === 2)!.elite).toBe(true);
  });

  it('这一波打残了，下一波不等满 10 秒', () => {
    const state = field();
    state.wave = 1;
    state.waveHp = [1000, 1000];
    put(state, 1, VIS_ENGAGE_POS + 0.5, { hp: 100, maxHp: 1000 });
    state.schedule = [{ atMs: state.elapsedMs + 9000, lane: 1, enemy: 'grunt', wave: 2, boss: false }];
    state.spawnIdx = 0;
    tick(state);
    expect(state.schedule[0]!.atMs - state.elapsedMs).toBeLessThanOrEqual(EARLY_CALL_MS);
    expect(state.skippedMs).toBeGreaterThan(0);
  });

  it('这一波还很满，下一波照常等', () => {
    const state = field();
    state.wave = 1;
    state.waveHp = [1000, 1000];
    put(state, 1, VIS_ENGAGE_POS + 0.5, { hp: 900, maxHp: 1000 });
    const at = state.elapsedMs + 9000;
    state.schedule = [{ atMs: at, lane: 1, enemy: 'grunt', wave: 2, boss: false }];
    state.spawnIdx = 0;
    tick(state);
    expect(state.schedule[0]!.atMs).toBe(at);
  });
});
