import { describe, expect, it } from 'vitest';

import { getStage } from '@/balance/stages';
import { getVillager } from '@/balance/villagers';
import { createBattle, startFight } from '@/game/BattleEngine';
import { waveBarView } from '@/ui/waveBar';

function fight(stageId: number) {
  const v = getVillager('tiezhu');
  const state = createBattle(getStage(stageId), [], 1, 1, [{ villager: v, lane: 1, cell: 0, evoStage: 1, stars: 0 }]);
  startFight(state);
  return state;
}

describe('出怪进度条', () => {
  it('一大波各插一面旗，开打时都没走到', () => {
    const s = fight(5);
    const surges = s.stage.waves.filter((w) => w.surge).length;
    const v = waveBarView(s);
    expect(v.flags).toHaveLength(surges);
    expect(v.flags.every((f) => !f.reached)).toBe(true);
    expect(v.flags.every((f) => f.at > 0 && f.at < 1)).toBe(true);
  });

  it('出过旗子那一只就亮，出完是满的', () => {
    const s = fight(5);
    const first = waveBarView(s).flags[0]!;
    s.spawnIdx = Math.ceil(first.at * s.schedule.length) + 1;
    expect(waveBarView(s).flags[0]!.reached).toBe(true);
    s.spawnIdx = s.schedule.length;
    expect(waveBarView(s).frac).toBe(1);
  });
});
