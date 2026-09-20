import { describe, expect, it } from 'vitest';

import { BLOCK_GAP, COMBAT_POS, GOAL_POS, cellPos, inCombatZone } from '@/balance/combat';
import { getEnemy, getStage } from '@/balance/stages';
import { getVillager } from '@/balance/villagers';
import {
  createBattle, foeHaltPos, foeOf, startFight, tick,
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

  /**
   * 4-1 / 5-1 全种子卡死在这儿：我方零阵亡，场上剩 3~5 只飞碟满血钉在出场点。
   * 射程 3 的飞碟狙最后排，这一路只有前两格有人时悬停点算出来是 0，
   * 比开火线还靠外 —— 那儿谁都不许开火，飞碟打不到人，人也打不到飞碟。
   * 时限从 86 秒放到 117 秒，场上剩的只数一只不差，光给时间根本不是解。
   */
  it('飞碟不许悬到开火线外，否则双方都打不着，一局干僵到超时', () => {
    const state = laneWith(1);
    const e = spawnFoe(state, 'saucer');
    expect(cellPos(1) - e.def.range).toBeLessThan(COMBAT_POS);
    expect(foeHaltPos(e, state.team)).toBe(COMBAT_POS);
    settle(state, e);
    expect(e.alive).toBe(true);
    expect(inCombatZone(e.pos)).toBe(true);
  });

  it('人只站最后一格，前面三格空着，必须一格一格穿过去', () => {
    const state = laneWith(3);
    const e = spawnFoe(state, 'grunt');
    expect(foeHaltPos(e, state.team)).toBeCloseTo(cellPos(3) - BLOCK_GAP);
    const passed = new Set<number>();
    for (let i = 0; i < 400; i += 1) {
      tick(state);
      for (const cell of [0, 1, 2]) {
        if (e.pos > cellPos(cell)) passed.add(cell);
      }
      if (e.pos >= cellPos(3) - BLOCK_GAP - 0.02) break;
    }
    expect([...passed].sort()).toEqual([0, 1, 2]);
    expect(e.alive).toBe(true);
    expect(e.pos).toBeCloseTo(cellPos(3) - BLOCK_GAP, 2);
  });

  it('前排倒了就不挡，接着走到后面那个人脚前', () => {
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
    expect(foeHaltPos(e, state.team)).toBeCloseTo(cellPos(2) - BLOCK_GAP);
    settle(state, e);
    expect(e.pos).toBeGreaterThan(cellPos(0));
    expect(e.pos).toBeCloseTo(cellPos(2) - BLOCK_GAP, 2);
  });

  it('穿过空格时不许挥刀，贴到人才动手', () => {
    const state = laneWith(2);
    const e = spawnFoe(state, 'grunt');
    e.atk = 40;
    e.cd = 0;
    const hitsBeforeTouch: number[] = [];
    for (let i = 0; i < 400; i += 1) {
      state.events.length = 0;
      tick(state);
      const halt = cellPos(2) - BLOCK_GAP;
      const swings = state.events.filter((ev) => ev.kind === 'foeHit').length;
      if (e.pos < halt - 0.05 && swings > 0) hitsBeforeTouch.push(e.pos);
      if (e.pos >= halt - 0.02) break;
    }
    expect(hitsBeforeTouch).toEqual([]);
  });
});
