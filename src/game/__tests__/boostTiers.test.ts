import { describe, expect, it } from 'vitest';

import {
  autoPlace, createBattle, pickBoost, rerollOffer, startFight, takeBonus, tick,
  type BattleState,
} from '@/game/BattleEngine';
import { GADGET_TIER, GOLD_FROM_STAGE, REROLL_COST, boostLine } from '@/balance/boosts';
import { getStage } from '@/balance/stages';
import { DEFAULT_SQUAD, getVillager } from '@/balance/villagers';

const cand = (id: string) => ({ villager: getVillager(id), evoStage: 1 as const, stars: 0, craft: 1 });

function battle(stageId: number): BattleState {
  const stage = getStage(stageId);
  const bench = DEFAULT_SQUAD.map(cand);
  const s = createBattle(stage, bench, bench.length, 1, autoPlace(bench, stage, bench.length));
  startFight(s);
  return s;
}

function untilOffer(s: BattleState, max = 3000): void {
  for (let i = 0; i < max && s.phase === 'fighting' && !s.boost!.offer; i += 1) {
    s.events.length = 0;
    tick(s);
  }
}

describe('卡分档', () => {
  it('第 1 章不出压箱底，也不挂白拿那张：1-5 那堵墙不能靠运气、靠视频绕过去', () => {
    for (let id = 1; id < GOLD_FROM_STAGE; id += 1) {
      const s = battle(id);
      for (let k = 0; k < 8 && s.phase === 'fighting'; k += 1) {
        untilOffer(s);
        const o = s.boost!.offer;
        if (!o) break;
        expect(o.bonus, `${id}`).toBeUndefined();
        for (const c of o.cards) expect(c.tier, `${id} ${c.id}`).toBeLessThan(2);
        pickBoost(s, o.best);
      }
    }
  });

  it('推荐那张带一句理由，卡面那句跟着档次换', () => {
    const s = battle(GOLD_FROM_STAGE);
    untilOffer(s);
    const o = s.boost!.offer!;
    expect(o.why.length).toBeGreaterThan(0);
    expect(boostLine('g_tractor', 0)).not.toBe(boostLine('g_tractor', 2));
  });

  it('压箱底的家伙事一张给两件，件件都记着档次', () => {
    const s = battle(GOLD_FROM_STAGE);
    untilOffer(s);
    const b = s.boost!;
    b.gadgets = [];
    b.gadgetPow = [];
    b.gadgetTier = [];
    b.offer!.cards = [{ id: 'g_cracker', tier: 2 }];
    expect(pickBoost(s, 0)).toBe(true);
    expect(b.gadgets).toHaveLength(GADGET_TIER[2]!.n);
    expect(b.gadgetTier.every((t) => t === 2)).toBe(true);
    expect(b.gadgetPow[0]).toBe(GADGET_TIER[2]!.pow);
  });

  it('保底：好久没见压箱底，换一批时就翻得出来', () => {
    const s = battle(GOLD_FROM_STAGE);
    untilOffer(s);
    const b = s.boost!;
    b.goldDry = 100;
    b.cells = REROLL_COST;
    expect(rerollOffer(s)).toBe(true);
    expect(b.offer!.cards.some((c) => c.tier === 2)).toBe(true);
  });
});

describe('看一段白拿压箱底', () => {
  it('第 2 章起底下挂一张压箱底，拿了三选一照样挂着；一局只给一回', () => {
    const s = battle(GOLD_FROM_STAGE);
    untilOffer(s);
    const b = s.boost!;
    const o = b.offer!;
    expect(o.bonus?.tier).toBe(2);
    const n = o.cards.length;
    const id = o.bonus!.id;
    expect(takeBonus(s)).toBe(true);
    expect(b.picks).toEqual([id]);
    expect(b.pickTiers).toEqual([2]);
    expect(b.offer).toBe(o);
    expect(o.bonus).toBeUndefined();
    expect(o.cards.length).toBeLessThanOrEqual(n);
    expect(takeBonus(s)).toBe(false);
    pickBoost(s, o.best);

    untilOffer(s);
    if (b.offer) expect(b.offer.bonus).toBeUndefined();
  });
});
