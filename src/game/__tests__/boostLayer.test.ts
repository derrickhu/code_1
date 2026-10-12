import { describe, expect, it } from 'vitest';

import {
  autoPlace, canWeld, createBattle, deploy, deployables, freeCellFor, grabCell, pickBoost,
  rerollOffer, runBattle, startFight, tick, useGadget, weld, weldOpen,
  type BattleState,
} from '@/game/BattleEngine';
import {
  CELL_TTL_MS, DEPLOY_COST, OPENING_OFFER, REDEPLOY_EXTRA, REDEPLOY_FROM_STAGE, REROLL_COST,
  WELD_MAX, WELD_MUL, boostDef, modCap,
} from '@/balance/boosts';
import { TICK_MS } from '@/balance/combat';
import { getStage } from '@/balance/stages';
import { DEFAULT_SQUAD, OPENING_SQUAD, getVillager } from '@/balance/villagers';

const cand = (id: string) => ({ villager: getVillager(id), evoStage: 1 as const, stars: 0, craft: 1 });

function battle(stageId: number, ids: readonly string[], cap = ids.length): BattleState {
  const stage = getStage(stageId);
  const bench = ids.map(cand);
  const s = createBattle(stage, bench, cap, 1, autoPlace(bench, stage, cap));
  startFight(s);
  return s;
}

/** 一直走到弹出三选一（或打完） */
function untilOffer(s: BattleState, max = 3000): void {
  for (let i = 0; i < max && s.phase === 'fighting' && !s.boost!.offer; i += 1) {
    s.events.length = 0;
    tick(s);
  }
}

describe('三选一', () => {
  it('弹出来就整局停住：钟不走、怪不动，选完才接着打', () => {
    const s = battle(3, DEFAULT_SQUAD);
    untilOffer(s);
    const o = s.boost!.offer!;
    expect(o).toBeTruthy();
    expect(o.cards.length).toBeGreaterThan(0);
    const clock = s.elapsedMs;
    const pos = s.foes.map((e) => e.pos);
    for (let i = 0; i < 20; i += 1) tick(s);
    expect(s.elapsedMs).toBe(clock);
    expect(s.foes.map((e) => e.pos)).toEqual(pos);

    expect(pickBoost(s, o.best)).toBe(true);
    expect(s.boost!.offer).toBeNull();
    expect(s.boost!.picks).toHaveLength(1);
    tick(s);
    expect(s.elapsedMs).toBeGreaterThan(clock);
  });

  it('1-1 第一回是写死的三张，鼓风机焊给弹弓叔', () => {
    const s = battle(1, OPENING_SQUAD);
    untilOffer(s);
    const o = s.boost!.offer!;
    expect(o.cards.map((c) => c.id)).toEqual([...OPENING_OFFER]);
    const mod = o.cards.find((c) => c.id === 'm_blower')!;
    expect(s.team.find((f) => f.uid === mod.uid)?.def.id).toBe('laoyanqiang');
  });

  it('换一批要花电池，一回只能换一次', () => {
    const s = battle(3, DEFAULT_SQUAD);
    untilOffer(s);
    const b = s.boost!;
    b.cells = 0;
    expect(rerollOffer(s)).toBe(false);
    b.cells = REROLL_COST * 2;
    const before = b.offer!.cards.map((c) => c.id);
    expect(rerollOffer(s)).toBe(true);
    expect(b.cells).toBe(REROLL_COST);
    for (const c of b.offer!.cards) expect(before).not.toContain(c.id);
    expect(rerollOffer(s)).toBe(false);
  });

  it('焊件按人数封顶：三个人一关只焊一件', () => {
    expect(modCap(3)).toBe(1);
    expect(modCap(12)).toBe(4);
    for (let id = 2; id <= 5; id += 1) {
      const s = battle(id, DEFAULT_SQUAD);
      s.team[0]!.mods = ['m_wok'];
      for (let n = 0; n < 6 && s.phase === 'fighting'; n += 1) {
        untilOffer(s);
        const o = s.boost!.offer;
        if (!o) break;
        for (const c of o.cards) expect(boostDef(c.id).kind, `${id} ${c.id}`).not.toBe('mod');
        pickBoost(s, o.best);
      }
    }
  });
});

describe('电池', () => {
  it('打倒第一只就掉，点了马上到手', () => {
    const s = battle(3, DEFAULT_SQUAD);
    for (let i = 0; i < 2000 && s.boost!.drops.length === 0; i += 1) tick(s);
    const d = s.boost!.drops[0]!;
    expect(d).toBeTruthy();
    const had = s.boost!.cells;
    expect(grabCell(s, d.id)).toBe(true);
    expect(s.boost!.cells).toBe(had + d.n);
    expect(s.boost!.cellsTapped).toBe(d.n);
    expect(grabCell(s, d.id)).toBe(false);
  });

  it('没点也不会丢：过一会儿自己飞进来', () => {
    const s = battle(3, DEFAULT_SQUAD);
    s.boost!.hold = { weld: true, deploy: true, gadget: true };
    for (let i = 0; i < 2000 && s.boost!.drops.length === 0; i += 1) tick(s);
    const d = s.boost!.drops[0]!;
    const had = s.boost!.cellsGot;
    for (let t = 0; t <= CELL_TTL_MS && !s.boost!.offer; t += TICK_MS) tick(s);
    if (!s.boost!.offer) {
      expect(s.boost!.drops.some((x) => x.id === d.id)).toBe(false);
      expect(s.boost!.cellsGot).toBeGreaterThanOrEqual(had + d.n);
      expect(s.boost!.cellsTapped).toBe(0);
    }
  });
});

describe('增援', () => {
  it('板凳上的人花电池送上空格；钱不够、格子占了都送不上', () => {
    const s = battle(4, [...DEFAULT_SQUAD, 'sanshen'], 3);
    const b = s.boost!;
    expect(b.reserve).toHaveLength(1);
    const who = b.reserve[0]!.villager;
    const at = freeCellFor(s, who.role)!;
    b.cells = DEPLOY_COST[0] - 1;
    expect(deploy(s, who.id, at.lane, at.cell)).toBe(false);
    b.cells = DEPLOY_COST[0];
    const taken = s.team[0]!;
    expect(deploy(s, who.id, taken.lane, taken.cell)).toBe(false);
    expect(deploy(s, who.id, at.lane, at.cell)).toBe(true);
    expect(b.cells).toBe(0);
    expect(s.team.some((f) => f.def.id === who.id && f.alive)).toBe(true);
    expect(deployables(s).some((p) => p.id === who.id)).toBe(false);
  });

  it(`倒下的人第 ${REDEPLOY_FROM_STAGE} 关起才能再喊上来，一局一次`, () => {
    const early = battle(REDEPLOY_FROM_STAGE - 1, DEFAULT_SQUAD);
    early.team[0]!.alive = false;
    expect(deployables(early)).toHaveLength(0);

    const s = battle(REDEPLOY_FROM_STAGE, DEFAULT_SQUAD);
    const f = s.team[0]!;
    f.alive = false;
    f.hp = 0;
    const pick = deployables(s).find((p) => p.id === f.def.id)!;
    expect(pick.again).toBe(true);
    expect(pick.cost).toBe(DEPLOY_COST[0] + REDEPLOY_EXTRA);
    s.boost!.cells = 20;
    expect(deploy(s, f.def.id, f.lane, f.cell)).toBe(true);
    expect(f.alive).toBe(true);
    expect(f.hp).toBe(f.maxHp);
    f.alive = false;
    expect(deployables(s).some((p) => p.id === f.def.id)).toBe(false);
  });
});

describe('焊一下', () => {
  it('前几波焊不了；最后一波焊上去进一阶、面板翻上去，一关只焊一个', () => {
    const s = battle(3, DEFAULT_SQUAD);
    const b = s.boost!;
    b.cells = 50;
    expect(weldOpen(s)).toBe(false);
    expect(weld(s, s.team[0]!.uid)).toBe(false);

    s.wave = s.stage.waves.length;
    expect(weldOpen(s)).toBe(true);
    const f = s.team[0]!;
    const atk = f.atk;
    const hp = f.maxHp;
    expect(weld(s, f.uid)).toBe(true);
    expect(f.evoStage).toBe(2);
    expect(f.atk).toBeCloseTo(atk * WELD_MUL);
    expect(f.maxHp).toBe(Math.round(hp * WELD_MUL));
    expect(f.hp).toBe(f.maxHp);
    expect(b.welds).toBe(WELD_MAX);
    expect(canWeld(s, s.team[1]!)).toBe(false);
  });
});

describe('家伙事', () => {
  it('鞭炮串炸人最多那一路，用了就没了', () => {
    const s = battle(3, DEFAULT_SQUAD);
    s.boost!.hold = { weld: true, deploy: true, gadget: true };
    for (let i = 0; i < 3000 && s.foes.filter((e) => e.alive).length < 3; i += 1) {
      if (s.boost!.offer) pickBoost(s, s.boost!.offer.best);
      else tick(s);
    }
    expect(s.foes.filter((e) => e.alive).length).toBeGreaterThanOrEqual(3);
    s.boost!.gadgets = ['g_cracker'];
    const hp = s.foes.filter((e) => e.alive).reduce((a, e) => a + e.hp, 0);
    expect(useGadget(s, 0)).toBe(true);
    expect(s.foes.reduce((a, e) => a + (e.alive ? e.hp : 0), 0)).toBeLessThan(hp);
    expect(s.boost!.gadgets).toHaveLength(0);
    expect(useGadget(s, 0)).toBe(false);
  });
});

describe('整局', () => {
  it('同样的布阵跑两遍，局内层结果也完全一样', () => {
    const stage = getStage(8);
    const place = autoPlace(DEFAULT_SQUAD.map(cand), stage, 3);
    const a = runBattle(stage, place, 1, true);
    const b = runBattle(stage, place, 1, true);
    expect(a).toEqual(b);
    expect(a.picks.length).toBeGreaterThan(0);
  });

  it('关掉局内层就是原来那套：不掉电池、不弹三选一', () => {
    const stage = getStage(8);
    const place = autoPlace(DEFAULT_SQUAD.map(cand), stage, 3);
    const r = runBattle(stage, place, 1, true, { boosts: false });
    expect(r.picks).toHaveLength(0);
    expect(r.cellsGot).toBe(0);
  });
});
