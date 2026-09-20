import { describe, expect, it } from 'vitest';
import {
  BLOCK_POS, CELL_COUNT, COMBAT_POS, LANE_COUNT, cellPos, combatCellPx, laneScreenX,
  posFromVisualGap, posScreenY, visualReachGap,
} from '@/balance/combat';
import { getEnemy } from '@/balance/stages';
import { VILLAGERS, getVillager, statsOf } from '@/balance/villagers';
import {
  REACH_BACK, canReach, inReachRadius, laneReachOf, reachAhead, reachDist, reachPoly,
  reachScreenPoly, reachSep,
} from '@/game/reach';
import { foeOf, inFighterRange, type Fighter } from '@/game/BattleEngine';

function fighter(id: string, lane: number, cell: number, evo = 1): Fighter {
  const def = getVillager(id);
  const s = statsOf(def, evo, 1, 1);
  return {
    uid: id,
    def,
    lane,
    cell,
    pos: cellPos(cell),
    evoStage: evo,
    stars: 1,
    hp: s.hp,
    maxHp: s.hp,
    atk: s.atk,
    armor: s.def,
    range: s.range,
    interval: s.interval,
    cd: 0,
    alive: true,
    stoodUp: false,
    burstUsed: false,
    regenCd: 0,
  };
}

function grunt(id: number, lane: number, pos: number) {
  return { ...foeOf(getEnemy('grunt'), id, lane, pos), hp: 200, maxHp: 200 };
}

function pointInPolyXY(
  pt: { x: number; y: number },
  poly: readonly { x: number; y: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    const cross = ((a.y > pt.y) !== (b.y > pt.y))
      && (pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y || 1e-9) + a.x);
    if (cross) inside = !inside;
  }
  return inside;
}

describe('攻击范围：出手和展示只走 reachSep', () => {
  it('可站区里视觉格差就是轴距，空场同一段轴距算更多格', () => {
    expect(visualReachGap(cellPos(1), cellPos(1) - 2)).toBeCloseTo(2, 8);
    expect(visualReachGap(2, 0)).toBeGreaterThan(2);
  });

  it('reachSep 的 dpos 就是 visualReachGap，不是 pos 相减', () => {
    const atk = { lane: 1, pos: cellPos(0), range: 2 };
    const tgt = { lane: 0, pos: 0.4 };
    const sep = reachSep(atk, tgt);
    expect(sep.dlane).toBe(-1);
    expect(sep.dpos).toBeCloseTo(visualReachGap(atk.pos, tgt.pos), 8);
    expect(sep.dpos).not.toBeCloseTo(atk.pos - tgt.pos, 1);
  });

  it('王大锤站哪一排，扇形轴半径和屏幕高度都一样', () => {
    const top = 250;
    const goal = 1000;
    const cell = combatCellPx(top, goal);
    const heights: number[] = [];
    for (const i of [0, 1, 2, 3]) {
      const atk = { lane: 1, pos: cellPos(i), range: 2 };
      const axis = reachPoly(atk);
      const farGap = Math.max(...axis.map((p) => visualReachGap(atk.pos, p.pos)));
      expect(farGap).toBeCloseTo(2, 2);
      const screen = reachScreenPoly(atk, top, goal);
      const ys = screen.map((p) => p.y);
      heights.push(Math.max(...ys) - Math.min(...ys));
    }
    for (const h of heights) expect(h).toBeCloseTo(heights[0]!, 1);
    expect(heights[0]).toBeCloseTo((2 + REACH_BACK) * cell, 1);
  });

  it('射程跟定位走，不是人人 3 格', () => {
    expect(statsOf(getVillager('tiezhu')).range).toBe(1);
    expect(statsOf(getVillager('dachui')).range).toBe(2);
    expect(statsOf(getVillager('sanshen')).range).toBe(3);
    expect(statsOf(getVillager('laoyanqiang')).range).toBe(4);
    expect(laneReachOf(1)).toBe(0);
    expect(laneReachOf(2)).toBe(1);
    expect(laneReachOf(3)).toBe(1);
  });

  it('「打」站在布阵给的格子上，必须够得到邻列被挡住的怪', () => {
    const dps = VILLAGERS.filter((v) => v.role === 'dps');
    expect(dps.length).toBeGreaterThanOrEqual(5);
    for (const v of dps) {
      const f = fighter(v.id, 1, 2);
      expect(inFighterRange(f, grunt(1, 1, BLOCK_POS)), `${v.name} 本列都够不到`).toBe(true);
      expect(inFighterRange(f, grunt(2, 0, BLOCK_POS)), `${v.name} 够不到左邻列`).toBe(true);
      expect(inFighterRange(f, grunt(3, 2, BLOCK_POS)), `${v.name} 够不到右邻列`).toBe(true);
    }
  });

  it('「修」站最后一格够不到邻列挡点，它的活是回血不是输出', () => {
    const heal = VILLAGERS.find((v) => v.role === 'heal' && v.lane !== 'reach');
    expect(heal).toBeDefined();
    const f = fighter(heal!.id, 1, 3);
    expect(inFighterRange(f, grunt(1, 0, BLOCK_POS))).toBe(false);
  });

  it('扇形弧线就是判定翻面的地方，一格都不许偏', () => {
    let id = 0;
    const eps = 0.02;
    for (const v of VILLAGERS) {
      for (let lane = 0; lane < LANE_COUNT; lane += 1) {
        for (let cell = 0; cell < CELL_COUNT; cell += 1) {
          const f = fighter(v.id, lane, cell);
          for (let tl = 0; tl < LANE_COUNT; tl += 1) {
            const side = Math.abs(tl - lane);
            const ahead = reachAhead(f.range, side);
            const inside = (p: number) => inFighterRange(f, grunt((id += 1), tl, p));
            const tag = `${v.name} 站路${lane + 1}第${cell + 1}格 → 路${tl + 1}`;
            if (!Number.isFinite(ahead)) {
              expect(inside(f.pos), `${tag} 扇形罩不到，却打得到`).toBe(false);
              continue;
            }
            const farPos = posFromVisualGap(f.pos, ahead);
            if (ahead < 0.08) {
              expect(inside(f.pos), `${tag} 擦边该打得到`).toBe(true);
              expect(inside(posFromVisualGap(f.pos, 0.1)), `${tag} 擦边往前该打不到`).toBe(false);
            } else if (farPos >= COMBAT_POS) {
              expect(inside(posFromVisualGap(f.pos, ahead - eps)), `${tag} 弧内侧该打得到`).toBe(true);
              expect(inside(posFromVisualGap(f.pos, ahead + eps)), `${tag} 弧外侧该打不到`).toBe(false);
            } else {
              expect(inside(COMBAT_POS - eps), `${tag} 开火线外该打不到`).toBe(false);
            }
            if (ahead >= REACH_BACK) {
              expect(inside(posFromVisualGap(f.pos, -(REACH_BACK - eps))), `${tag} 身后内侧该打得到`).toBe(true);
              expect(inside(posFromVisualGap(f.pos, -(REACH_BACK + eps))), `${tag} 身后再往后该打不到`).toBe(false);
            }
          }
        }
      }
    }
  });

  it('邻列比本列浅，是扇形不是整段往后挪', () => {
    const own = reachAhead(3, 0);
    const side = reachAhead(3, 1);
    expect(own).toBe(3);
    expect(side).toBeLessThan(own);
    expect(side).toBeGreaterThan(2.4);
  });

  it('门洞里那截规则不让打，够得着也不算', () => {
    const far = { lane: 1, pos: cellPos(0), range: 10 };
    expect(canReach(far, { lane: 1, pos: COMBAT_POS - 0.1 })).toBe(false);
    expect(canReach(far, { lane: 1, pos: COMBAT_POS + 0.1 })).toBe(true);
  });

  it('挨射程短，扇形罩不到邻列；拦开始够着', () => {
    const tank = fighter('tiezhu', 1, 0);
    expect(inFighterRange(tank, grunt(1, 1, cellPos(0) - 0.8))).toBe(true);
    expect(inFighterRange(tank, grunt(2, 0, cellPos(0) - 0.8))).toBe(false);
    const hammer = fighter('dachui', 1, 1);
    expect(inFighterRange(hammer, grunt(3, 0, cellPos(1)))).toBe(true);
  });

  it('能打到的怪，脚底必在绘制多边形里；打不到的不在里面', () => {
    const top = 250;
    const goal = 1000;
    for (const cell of [0, 1, 2, 3]) {
      const f = fighter('dachui', 1, cell);
      const poly = reachScreenPoly(f, top, goal);
      for (const pos of [BLOCK_POS, COMBAT_POS + 0.05, cellPos(0), 0.4]) {
        const e = grunt(1, 1, pos);
        const hit = inFighterRange(f, e);
        const { dlane, dpos } = reachSep(f, e);
        if (pos < COMBAT_POS) {
          expect(hit).toBe(false);
          continue;
        }
        if (Math.abs(reachDist(dlane, dpos) - f.range) < 0.15) continue;
        const inPoly = pointInPolyXY(
          { x: laneScreenX(e.lane), y: posScreenY(e.pos, top, goal) },
          poly,
        );
        expect(inPoly, `cell=${cell} pos=${pos} hit=${hit}`).toBe(hit);
      }
    }
  });

  it('在半径里 ⇔ 怪脚底在屏幕扇形里', () => {
    const top = 250;
    const goal = 1000;
    const f = fighter('sanshen', 1, 2);
    const axis = reachPoly(f);
    expect(axis.length).toBeGreaterThan(6);
    for (const p of axis) {
      const { dlane, dpos } = reachSep(f, p);
      expect(inReachRadius(f.range, dlane, dpos), `顶点 lane=${p.lane.toFixed(2)} pos=${p.pos.toFixed(2)}`)
        .toBe(true);
    }
    const poly = reachScreenPoly(f, top, goal);
    for (let lane = 0; lane <= 2; lane += 0.25) {
      for (let pos = 0; pos <= 6; pos += 0.2) {
        const tgt = { lane, pos };
        const { dlane, dpos } = reachSep(f, tgt);
        const hit = inReachRadius(f.range, dlane, dpos);
        const onEdge = Math.abs(reachDist(dlane, dpos) - f.range) < 0.15;
        if (onEdge) continue;
        expect(
          pointInPolyXY({ x: laneScreenX(lane), y: posScreenY(pos, top, goal) }, poly),
          `lane=${lane} pos=${pos} hit=${hit}`,
        ).toBe(hit);
      }
    }
  });
});
