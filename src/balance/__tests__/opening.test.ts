import { describe, expect, it } from 'vitest';
import {
  OPENING_CALL_ID, OPENING_VILLAGE_LV, chapter1CraftStep, needOpeningCall, openingCredits, openingParts,
  villageGateOpen, winFooter,
} from '@/balance/opening';
import { expectedPerPellet, pelletsForStage } from '@/balance/stall';
import { CALL_COST, villageCumExp } from '@/balance/village';
import { getStage, stageEnemyCount, unitWeight } from '@/balance/stages';
import { DEFAULT_SQUAD, getVillager } from '@/balance/villagers';
import { autoPlace, runBattle } from '@/game/BattleEngine';
import { runEndDurationMs, runEndForward } from '@/analytics/runEnd';

describe('第 1 章这条路', () => {
  it('赢下 1-2 之后村口就开放，弹弓摊提前到这儿', () => {
    expect(villageGateOpen(1)).toBe(false);
    expect(villageGateOpen(2)).toBe(false);
    expect(villageGateOpen(3)).toBe(true);
    expect(villageGateOpen(6)).toBe(true);
  });

  it('1-5 没过、手艺还是 1，先攒零件再点人', () => {
    expect(chapter1CraftStep(2, false, 1, 0, 1)).toBe('done');
    expect(chapter1CraftStep(3, false, 1, 0, 1)).toBe('stall');
    expect(chapter1CraftStep(5, false, 1, 0, 1)).toBe('stall');
    expect(chapter1CraftStep(5, false, 1, 2, 1)).toBe('craft');
    expect(chapter1CraftStep(6, true, 1, 0, 1)).toBe('done');
  });

  it('手艺升过、村子还是 1 级，去摊上打到 2 级', () => {
    expect(chapter1CraftStep(4, false, 2, 0, 1)).toBe('grow');
    expect(chapter1CraftStep(5, false, 2, 0, OPENING_VILLAGE_LV)).toBe('done');
    expect(chapter1CraftStep(6, true, 2, 0, 1)).toBe('done');
  });

  it('1-3 打完手上的弹子够把村子打到 2 级', () => {
    const pellets = 6 + pelletsForStage(1, true) + pelletsForStage(2, true) + pelletsForStage(3, true);
    const need = villageCumExp(OPENING_VILLAGE_LV) / expectedPerPellet(1).exp;
    expect(need).toBeLessThan(pellets * 0.7);
  });

  it('1-5 首通送一嗓子的工分', () => {
    expect(openingCredits(5, true)).toBe(CALL_COST);
    expect(openingCredits(5, false)).toBe(0);
    expect(openingCredits(4, true)).toBe(0);
  });

  it('赢了的大按钮：往下推、回村、下一关', () => {
    expect(winFooter(1, 1)).toBe('push');
    expect(winFooter(1, 4)).toBe('push');
    expect(winFooter(1, 5)).toBe('home');
    expect(winFooter(2, 1)).toBe('next');
  });

  it('1-2 没喊过人是喊人，1-3 零件够了是回村升手艺', () => {
    expect(winFooter(1, 2, { needCall: true })).toBe('call');
    expect(winFooter(1, 2, { needCall: false })).toBe('push');
    expect(winFooter(1, 3, { craftReady: true })).toBe('craft');
    expect(winFooter(1, 3, { craftReady: false })).toBe('push');
    expect(winFooter(2, 2, { needCall: true })).toBe('next');
  });

  it('开局那一嗓子只在 1-2 过了、还没喊过时补', () => {
    expect(needOpeningCall(2, 0, ['tiezhu'])).toBe(false);
    expect(needOpeningCall(3, 0, ['tiezhu'])).toBe(true);
    expect(needOpeningCall(3, 1, ['tiezhu'])).toBe(false);
    expect(needOpeningCall(5, 0, [OPENING_CALL_ID])).toBe(false);
    expect(openingParts(3, true)).toBe(2);
    expect(openingParts(3, false)).toBe(0);
    expect(openingParts(2, true)).toBe(0);
  });
});

describe('开局三人带新来的乡亲', () => {
  const cand = (id: string, craft = 1) => ({ villager: getVillager(id), evoStage: 1, stars: 0, craft });

  it('1-1 头几秒就有人倒：先来的是一窝小灰，只数多、每只薄', () => {
    const s = getStage(1);
    const first = s.waves[0]!.groups[0]!;
    expect(first.enemy).toBe('grunt');
    expect(first.kind).toBe('swarm');
    expect(first.atMs).toBe(0);
    expect(stageEnemyCount(s)).toBeGreaterThanOrEqual(24);
    const weight = s.waves.reduce((a, w) => a + w.groups.reduce((b, g) => b + (g.boss ? 0 : g.count * unitWeight(g)), 0), 0);
    expect(weight).toBeLessThanOrEqual(14);
  });

  it('三婶顶掉谁上去，1-3 都守得住', () => {
    const stage = getStage(3);
    const base = autoPlace(DEFAULT_SQUAD.map((id) => cand(id)), stage, 3);
    for (const out of DEFAULT_SQUAD) {
      const lay = base.map((p) => (p.villager.id === out ? { ...p, villager: getVillager(OPENING_CALL_ID) } : p));
      const r = runBattle(stage, lay, 1, true);
      expect(r.won, `顶掉 ${out}`).toBe(true);
    }
  });

  it('1-3 送的零件升谁一级，1-5 都过得去', () => {
    const stage = getStage(5);
    for (const up of DEFAULT_SQUAD) {
      const lay = autoPlace(DEFAULT_SQUAD.map((id) => cand(id, id === up ? 2 : 1)), stage, 3);
      expect(runBattle(stage, lay, 1, true).won, `升 ${up}`).toBe(true);
    }
  });
});

describe('结算上报认赢', () => {
  it('won 为真就是通关，败因留在失败里', () => {
    expect(runEndForward({ won: true, stars: 3 })).toEqual({ won: true, reason: 'clear' });
    expect(runEndForward({ won: false, lose_reason: 'leak' })).toEqual({ won: false, reason: 'leak' });
    expect(runEndForward({ cleared: true })).toEqual({ won: true, reason: 'clear' });
    expect(runEndForward({})).toEqual({ won: false, reason: 'defeat' });
  });

  it('没填 duration_ms 时用 play_ms', () => {
    expect(runEndDurationMs({ play_ms: 30100 })).toBe(30100);
    expect(runEndDurationMs({ duration_ms: 10, play_ms: 99 })).toBe(10);
  });
});
