import { describe, expect, it } from 'vitest';

import { getEnemy, getStage } from '@/balance/stages';
import { getVillager } from '@/balance/villagers';
import {
  countedLeaks, createBattle, foeOf, foesAlive, reviveAfterLeak, reviveCanContinue,
  startFight, tick, type BattleState,
} from '@/game/BattleEngine';

function lostBoard(alive: number, moreSpawns: boolean): BattleState {
  const v = getVillager('tiezhu');
  const state = createBattle(
    getStage(1),
    [{ villager: v, evoStage: 1, stars: 1 }],
    1,
    1,
    [{ villager: v, lane: 1, cell: 0, evoStage: 1, stars: 1 }],
  );
  startFight(state);
  state.phase = 'lost';
  state.loseReason = 'leak';
  state.leaked = 3;
  if (!moreSpawns) state.spawnIdx = state.schedule.length;
  const def = getEnemy('saucer');
  state.foes = Array.from({ length: alive }, (_, i) => foeOf(def, i + 1, 1, 2));
  return state;
}

describe('漏怪后续命', () => {
  it('路上已经空了、后面也不再出，不给广告，也不改成过关', () => {
    const state = lostBoard(0, false);
    expect(reviveCanContinue(state)).toBe(false);
    expect(reviveAfterLeak(state)).toBe(false);
    expect(state.phase).toBe('lost');
    expect(state.leaked).toBe(3);
    tick(state);
    expect(state.phase).toBe('lost');
  });

  it('后面还有怪要出，路上空着也能续', () => {
    const state = lostBoard(0, true);
    expect(reviveCanContinue(state)).toBe(true);
    expect(reviveAfterLeak(state)).toBe(true);
    expect(state.phase).toBe('fighting');
    expect(state.leaked).toBe(0);
    expect(state.keptLeaks).toBe(3);
  });

  it('只剩一只时广告不能把它清掉', () => {
    const state = lostBoard(1, false);
    expect(reviveAfterLeak(state)).toBe(true);
    expect(foesAlive(state)).toBe(1);
    expect(state.phase).toBe('fighting');
  });

  it('两只清掉一只，留下的还得自己打', () => {
    const state = lostBoard(2, false);
    expect(reviveAfterLeak(state)).toBe(true);
    expect(foesAlive(state)).toBe(1);
  });

  it('续命之后打赢，仍按漏过的算星，不会变成一个没漏', () => {
    const state = lostBoard(0, true);
    expect(reviveAfterLeak(state)).toBe(true);
    for (const e of state.foes) e.alive = false;
    state.spawnIdx = state.schedule.length;
    tick(state);
    expect(state.phase).toBe('won');
    expect(state.stars).toBe(1);
    expect(countedLeaks(state)).toBe(3);
  });
});
