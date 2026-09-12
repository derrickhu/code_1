import { describe, expect, it } from 'vitest';

import { BLOCK_GAP, GOAL_POS, cellPos } from '@/balance/combat';
import { getEnemy, getStage } from '@/balance/stages';
import { getVillager } from '@/balance/villagers';
import {
  createBattle, foeHaltPos, startFight, tick,
  type BattleState, type Foe,
} from '@/game/BattleEngine';

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
    id: 1, def, lane, pos: 0,
    hp: 99_999, maxHp: 99_999, atk: 0, armor: 0, cd: 99, slowMs: 0, alive: true,
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

describe('地面怪停在人面前，空格不挡', () => {
  it('前排有人，停在他脚前，不是空场门口', () => {
    const state = laneWith(0);
    const e = spawnFoe(state, 'grunt');
    expect(foeHaltPos(e, state.team)).toBeCloseTo(cellPos(0) - BLOCK_GAP);
    settle(state, e);
    expect(e.alive).toBe(true);
    expect(e.pos).toBeCloseTo(cellPos(0) - BLOCK_GAP, 2);
    expect(e.pos).toBeGreaterThan(1.2);
  });

  it('前排空着、人在第二格，穿过空格停在那人脚前', () => {
    const state = laneWith(1);
    const e = spawnFoe(state, 'grunt');
    expect(foeHaltPos(e, state.team)).toBeCloseTo(cellPos(1) - BLOCK_GAP);
    settle(state, e);
    expect(e.alive).toBe(true);
    expect(e.pos).toBeGreaterThan(cellPos(0));
    expect(e.pos).toBeCloseTo(cellPos(1) - BLOCK_GAP, 2);
  });

  it('人在更后面，照样走到他面前，不在半路空格趴下', () => {
    const state = laneWith(2);
    const e = spawnFoe(state, 'grunt');
    settle(state, e);
    expect(e.pos).toBeGreaterThan(cellPos(1));
    expect(e.pos).toBeCloseTo(cellPos(2) - BLOCK_GAP, 2);
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

  it('飞碟仍按射程悬停，不被空格挡住', () => {
    const state = laneWith(3);
    const e = spawnFoe(state, 'saucer');
    const halt = foeHaltPos(e, state.team);
    expect(halt).toBeCloseTo(cellPos(3) - e.def.range);
    settle(state, e);
    expect(e.alive).toBe(true);
    expect(e.pos).toBeCloseTo(halt!, 2);
  });
});
