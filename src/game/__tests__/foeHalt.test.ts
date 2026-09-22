import { describe, expect, it } from 'vitest';

import { GOAL_POS, cellPos, posFromVisualGap } from '@/balance/combat';
import { getEnemy, getStage } from '@/balance/stages';
import { getVillager } from '@/balance/villagers';
import {
  createBattle, foeCanSwing, foeHaltPos, foeOf, foeTarget, startFight, tick,
  type BattleState, type Foe,
} from '@/game/BattleEngine';
import { canReach } from '@/game/reach';

function freezeTeam(state: BattleState): void {
  for (const f of state.team) {
    f.atk = 0;
    f.cd = 99;
    f.hp = 99_999;
    f.maxHp = 99_999;
  }
}

function spawnFoe(state: BattleState, id: string, lane = 1): Foe {
  const def = getEnemy(id);
  const e: Foe = {
    ...foeOf(def, 1, lane),
    hp: 99_999, maxHp: 99_999, atk: 0, armor: 0, cd: 99,
  };
  state.schedule = [];
  state.foes = [e];
  return e;
}

function settle(state: BattleState, e: Foe): void {
  for (let i = 0; i < 240; i += 1) {
    const before = e.pos;
    tick(state);
    if (!e.alive) return;
    if (e.pos === before && i > 8) return;
  }
}

function laneWith(cell: number): BattleState {
  const v = getVillager('tiezhu');
  const state = createBattle(
    getStage(1),
    [{ villager: v, evoStage: 1, stars: 1 }],
    1,
    1,
    [{ villager: v, lane: 1, cell, evoStage: 1, stars: 1 }],
  );
  startFight(state);
  freezeTeam(state);
  return state;
}

function haltOf(e: Foe, team: BattleState['team']): number {
  const t = foeTarget(e, team);
  if (!t) throw new Error('no target');
  return Math.max(0, posFromVisualGap(t.pos, e.def.range));
}

describe('地面怪走到自己射程才停，空格不挡', () => {
  it('前排有人，停在自己射程边缘，不是半路换挡线', () => {
    const state = laneWith(0);
    const e = spawnFoe(state, 'grunt');
    expect(foeHaltPos(e, state.team)).toBeCloseTo(haltOf(e, state.team));
    settle(state, e);
    expect(e.alive).toBe(true);
    expect(e.pos).toBeCloseTo(haltOf(e, state.team), 2);
    expect(e.pos).toBeCloseTo(cellPos(0) - e.def.range, 2);
  });

  it('前排空着、人在第二格，穿过空格停在那人射程里', () => {
    const state = laneWith(1);
    const e = spawnFoe(state, 'grunt');
    expect(foeHaltPos(e, state.team)).toBeCloseTo(haltOf(e, state.team));
    settle(state, e);
    expect(e.alive).toBe(true);
    expect(e.pos).toBeGreaterThanOrEqual(cellPos(0));
    expect(e.pos).toBeCloseTo(haltOf(e, state.team), 2);
  });

  it('人在更后面，照样走到他射程里，不在半路空格趴下', () => {
    const state = laneWith(2);
    const e = spawnFoe(state, 'grunt');
    settle(state, e);
    expect(e.pos).toBeGreaterThanOrEqual(cellPos(1));
    expect(e.pos).toBeCloseTo(haltOf(e, state.team), 2);
  });

  it('这一路没人，走到头就漏', () => {
    const v = getVillager('tiezhu');
    const state = createBattle(
      getStage(1),
      [{ villager: v, evoStage: 1, stars: 1 }],
      1,
      1,
      [{ villager: v, lane: 0, cell: 0, evoStage: 1, stars: 1 }],
    );
    startFight(state);
    freezeTeam(state);
    const e = spawnFoe(state, 'grunt', 1);
    expect(foeHaltPos(e, state.team)).toBeUndefined();
    settle(state, e);
    expect(e.alive).toBe(false);
    expect(e.pos).toBeGreaterThan(GOAL_POS);
    expect(state.leaked).toBe(1);
  });

  it('飞碟按视觉射程悬停，不被空格挡住', () => {
    const state = laneWith(3);
    const e = spawnFoe(state, 'saucer');
    const halt = foeHaltPos(e, state.team);
    expect(halt).toBeCloseTo(haltOf(e, state.team));
    settle(state, e);
    expect(e.alive).toBe(true);
    expect(e.pos).toBeCloseTo(halt!, 2);
  });

  it('飞碟不能在村口隔空打，必须飞进场，前排够得到', () => {
    const state = laneWith(0);
    const e = spawnFoe(state, 'saucer');
    const tank = state.team[0]!;
    const halt = foeHaltPos(e, state.team)!;
    expect(halt).toBeGreaterThan(0.4);
    expect(foeCanSwing(e, tank)).toBe(false);
    expect(canReach(tank, { lane: e.lane, pos: 0 })).toBe(false);
    settle(state, e);
    expect(e.alive).toBe(true);
    expect(e.pos).toBeCloseTo(halt, 2);
    expect(e.pos).toBeGreaterThan(0.4);
    expect(foeCanSwing(e, tank)).toBe(true);
    expect(canReach(tank, { lane: e.lane, pos: e.pos })).toBe(true);
  });

  it('人在第二格，飞碟照样要飞下来，不许钉在出场口', () => {
    const state = laneWith(1);
    const e = spawnFoe(state, 'saucer');
    const halt = foeHaltPos(e, state.team)!;
    expect(halt).toBeGreaterThan(0.4);
    expect(cellPos(1) - e.def.range).toBeLessThanOrEqual(0);
    settle(state, e);
    expect(e.pos).toBeCloseTo(halt, 2);
    expect(e.pos).toBeGreaterThan(0.4);
  });

  it('人只站最后一格，前面三格空着，必须一格一格穿过去', () => {
    const state = laneWith(3);
    const e = spawnFoe(state, 'grunt');
    const halt = haltOf(e, state.team);
    expect(foeHaltPos(e, state.team)).toBeCloseTo(halt);
    const passed = new Set<number>();
    for (let i = 0; i < 400; i += 1) {
      tick(state);
      for (const cell of [0, 1, 2]) {
        if (e.pos >= cellPos(cell)) passed.add(cell);
      }
      if (e.pos >= halt - 0.02) break;
    }
    expect([...passed].sort()).toEqual([0, 1, 2]);
    expect(e.alive).toBe(true);
    expect(e.pos).toBeCloseTo(halt, 2);
  });

  it('前排倒了就不挡，接着走到后面那个人射程里', () => {
    const front = getVillager('tiezhu');
    const back = getVillager('erjiu');
    const state = createBattle(
      getStage(1),
      [
        { villager: front, evoStage: 1, stars: 1 },
        { villager: back, evoStage: 1, stars: 1 },
      ],
      2,
      1,
      [
        { villager: front, lane: 1, cell: 0, evoStage: 1, stars: 1 },
        { villager: back, lane: 1, cell: 2, evoStage: 1, stars: 1 },
      ],
    );
    startFight(state);
    freezeTeam(state);
    const tank = state.team.find((f) => f.def.id === 'tiezhu')!;
    tank.alive = false;
    tank.hp = 0;
    const e = spawnFoe(state, 'grunt');
    expect(foeHaltPos(e, state.team)).toBeCloseTo(haltOf(e, state.team));
    settle(state, e);
    expect(e.pos).toBeGreaterThan(cellPos(0));
    expect(e.pos).toBeCloseTo(haltOf(e, state.team), 2);
  });

  it('射程够不着就不挥刀，进了自己射程才动手', () => {
    const state = laneWith(2);
    const e = spawnFoe(state, 'grunt');
    e.atk = 40;
    e.cd = 0;
    const halt = haltOf(e, state.team);
    const hitsBeforeTouch: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      state.events.length = 0;
      tick(state);
      const swings = state.events.filter((ev) => ev.kind === 'foeHit').length;
      if (e.pos < halt - 0.05 && swings > 0) hitsBeforeTouch.push(e.pos);
      if (e.pos >= halt - 0.02) break;
    }
    expect(hitsBeforeTouch).toEqual([]);
  });
});
