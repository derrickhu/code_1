import { describe, expect, it } from 'vitest';

import { getEnemy, getStage } from '@/balance/stages';
import { getVillager } from '@/balance/villagers';
import { createBattle, playerShot, startFight, tick, type BattleState } from '@/game/BattleEngine';

function fight(stageId: number): BattleState {
  const v = getVillager('tiezhu');
  const state = createBattle(
    getStage(stageId),
    [{ villager: v, evoStage: 1, stars: 0 }],
    1,
    1,
    [{ villager: v, lane: 1, cell: 3, evoStage: 1, stars: 0 }],
  );
  startFight(state);
  for (const f of state.team) f.atk = 0;
  tick(state);
  return state;
}

describe('亲手弹外星人', () => {
  it('一窝里的小灰薄，点两下就倒', () => {
    const state = fight(1);
    const e = state.foes.find((x) => x.def.id === 'grunt' && x.alive)!;
    expect(playerShot(state, e.id)).toBe(true);
    expect(e.alive).toBe(true);
    expect(playerShot(state, e.id)).toBe(true);
    expect(e.alive).toBe(false);
  });

  it('1-1 整只的小灰点三下就倒，倒了再点不算', () => {
    const state = fight(1);
    const e = state.foes.find((x) => x.def.id === 'grunt' && x.alive)!;
    e.hp = e.maxHp = Math.round(getEnemy('grunt').hp * state.stage.hpMul);
    expect(playerShot(state, e.id)).toBe(true);
    expect(playerShot(state, e.id)).toBe(true);
    expect(e.alive).toBe(true);
    expect(playerShot(state, e.id)).toBe(true);
    expect(e.alive).toBe(false);
    expect(state.events.some((ev) => ev.kind === 'foeDown' && ev.foeId === e.id)).toBe(true);
    expect(playerShot(state, e.id)).toBe(false);
  });

  it('小怪挨一下往回退，大个子不退', () => {
    const state = fight(1);
    const e = state.foes.find((x) => x.alive)!;
    e.pos = 2;
    playerShot(state, e.id);
    expect(e.pos).toBeLessThan(2);
    e.boss = true;
    e.hp = e.maxHp = 99_999;
    const at = e.pos;
    playerShot(state, e.id);
    expect(e.pos).toBe(at);
  });

  it('每第五发是重的一下', () => {
    const state = fight(1);
    const e = state.foes.find((x) => x.alive)!;
    e.hp = e.maxHp = 99_999;
    for (let i = 0; i < 5; i += 1) playerShot(state, e.id);
    const taps = state.events.filter((ev) => ev.kind === 'tap');
    expect(taps.map((t) => t.kind === 'tap' && t.crit)).toEqual([false, false, false, false, true]);
  });

  it('不在打的时候点不出去', () => {
    const v = getVillager('tiezhu');
    const state = createBattle(getStage(1), [{ villager: v, evoStage: 1, stars: 0 }], 1);
    expect(playerShot(state, 1)).toBe(false);
  });
});
