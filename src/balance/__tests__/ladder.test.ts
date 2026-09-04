import { describe, expect, it } from 'vitest';
import {
  LADDER,
  LADDER_GATE_WAVE,
  LADDER_TOP,
  ladderDownMult,
  ladderExtraPct,
  ladderName,
  ladderPassed,
  ladderRule,
  ladderStageMs,
} from '@/balance/ladder';
import { LANE_LV_COSTS, laneTotalCost } from '@/balance/lanes';
import {
  PILE_CAP,
  PILE_PER_HOUR,
  YARD_GROWTH,
  growthTotalCost,
  pileGrowth,
  yardDeposit,
} from '@/balance/yard';
import { STAGE_MS, TOTAL_WAVES } from '@/balance/combat';

describe('难度阶梯', () => {
  it('照旧那一档一条规则都不加', () => {
    expect(ladderExtraPct(0)).toBe(0);
    expect(ladderStageMs(0, STAGE_MS)).toBe(STAGE_MS);
    expect(ladderDownMult(0)).toBe(1);
    expect(ladderName(0)).toBe('照旧');
  });

  it('越往上走规则越紧，不许有哪一档白给', () => {
    // 每一档至少要在一条规则上比前一档更紧，否则那一档等于没做
    for (let lv = 1; lv <= LADDER_TOP; lv += 1) {
      const prev = ladderRule(lv - 1);
      const cur = ladderRule(lv);
      const tighter =
        cur.extraSquadPct > prev.extraSquadPct
        || cur.hastePct > prev.hastePct
        || cur.downMult > prev.downMult;
      expect(tighter).toBe(true);
    }
  });

  it('前面那几档的规则一路带着走，不是换着来', () => {
    for (let lv = 1; lv <= LADDER_TOP; lv += 1) {
      const prev = ladderRule(lv - 1);
      const cur = ladderRule(lv);
      expect(cur.extraSquadPct).toBeGreaterThanOrEqual(prev.extraSquadPct);
      expect(cur.hastePct).toBeGreaterThanOrEqual(prev.hastePct);
      expect(cur.downMult).toBeGreaterThanOrEqual(prev.downMult);
    }
  });

  it('越野的档刻度越短，怪来得越急', () => {
    expect(ladderStageMs(LADDER_TOP, STAGE_MS)).toBeLessThan(STAGE_MS);
    for (let lv = 1; lv <= LADDER_TOP; lv += 1) {
      expect(ladderStageMs(lv, STAGE_MS)).toBeLessThanOrEqual(ladderStageMs(lv - 1, STAGE_MS));
    }
  });

  it('每一档都写了一句人话，选档时得知道难在哪', () => {
    for (const r of LADDER) {
      expect(r.name.length).toBeGreaterThan(1);
      expect(r.pitch.length).toBeGreaterThan(6);
    }
  });

  it('超出范围的档一律当照旧，不许崩', () => {
    expect(ladderRule(-3).lv).toBe(0);
    expect(ladderRule(99).lv).toBe(0);
    expect(ladderStageMs(99, STAGE_MS)).toBe(STAGE_MS);
  });
});

describe('打服一档才解锁下一档', () => {
  it('通关当然算', () => {
    expect(ladderPassed(3, true)).toBe(true);
  });

  it('没通关但推到门槛也算', () => {
    expect(ladderPassed(LADDER_GATE_WAVE, false)).toBe(true);
    expect(ladderPassed(LADDER_GATE_WAVE - 1, false)).toBe(false);
  });

  it('门槛得留出余量，不能等于通关', () => {
    // 拿通关当门槛的话，阶梯档的通关率不到 3%，解锁下一档平均要三十局
    expect(LADDER_GATE_WAVE).toBeLessThan(TOTAL_WAVES);
    expect(LADDER_GATE_WAVE).toBeGreaterThan(TOTAL_WAVES / 2);
  });
});

describe('废品站的坡', () => {
  it('第一档便宜到打完第一局就能买', () => {
    const oneRun = yardDeposit(9, 0);
    const first = Math.min(
      ...YARD_GROWTH.map((g) => g.costs[0] ?? 999),
      LANE_LV_COSTS[0] ?? 999,
    );
    expect(first).toBeLessThanOrEqual(oneRun);
  });

  it('每条成长自己的价格一路往上', () => {
    for (const def of YARD_GROWTH) {
      for (let i = 1; i < def.costs.length; i += 1) {
        expect(def.costs[i]!).toBeGreaterThanOrEqual(def.costs[i - 1]!);
      }
    }
  });

  it('后档比头档贵，长线才拉得开', () => {
    const head = YARD_GROWTH.reduce((a, g) => a + (g.costs[0] ?? 0), 0);
    const tail = YARD_GROWTH.reduce((a, g) => a + (g.costs[g.costs.length - 1] ?? 0), 0);
    expect(tail).toBeGreaterThan(head);
  });

  it('别再五六局就买空', () => {
    const perRun = yardDeposit(11, 0);
    expect((growthTotalCost() + laneTotalCost()) / perRun).toBeGreaterThan(9);
  });
});

describe('村里那堆废品自己涨', () => {
  it('挂着就涨', () => {
    expect(pileGrowth(0, 3_600_000)).toBe(PILE_PER_HOUR);
    expect(pileGrowth(0, 5 * 3_600_000)).toBe(PILE_PER_HOUR * 5);
  });

  it('涨到顶就停，挂一个礼拜也不多给', () => {
    expect(pileGrowth(0, 24 * 3_600_000)).toBe(PILE_CAP);
    expect(pileGrowth(0, 7 * 24 * 3_600_000)).toBe(PILE_CAP);
  });

  it('顶也就一局的收成，不能拿它替代打一局', () => {
    expect(PILE_CAP).toBeLessThanOrEqual(yardDeposit(11, 0) * 1.2);
  });

  it('时间倒着走不许倒扣', () => {
    expect(pileGrowth(12, -99_999)).toBe(12);
  });
});
