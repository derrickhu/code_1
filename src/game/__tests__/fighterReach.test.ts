import { describe, expect, it } from 'vitest';
import {
  BLOCK_POS, CELL_COUNT, COMBAT_POS, GOAL_POS, LANE_COUNT, cellPos, combatCellPx, laneScreenX,
  posFromVisualGap, posScreenY, visualReachGap,
} from '@/balance/combat';
import { getEnemy } from '@/balance/stages';
import { VILLAGERS, getVillager, statsOf } from '@/balance/villagers';
import {
  REACH_BACK, ROLE_RANGE, canReach, coverRange, inReachRadius, laneReachOf, reachAhead,
  reachDist, reachPoly, reachScreenPoly, reachSep, reachXY,
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

  it('reachSep 的 dpos 就是视觉 y 差，不是 pos 相减', () => {
    const atk = { lane: 1, pos: cellPos(0), range: 2 };
    const tgt = { lane: 0, pos: 0.4 };
    const sep = reachSep(atk, tgt);
    const a = reachXY(atk);
    const b = reachXY(tgt);
    expect(sep.dlane).toBe(-1);
    expect(sep.dpos).toBeCloseTo(a.y - b.y, 8);
    expect(sep.dpos).toBeCloseTo(visualReachGap(atk.pos, tgt.pos), 8);
    expect(sep.dpos).not.toBeCloseTo(atk.pos - tgt.pos, 1);
    expect(reachDist(sep.dlane, sep.dpos)).toBeCloseTo(Math.hypot(b.x - a.x, a.y - b.y), 8);
  });

  it('王大锤换格子，扇形轴半径和屏幕高度都一样', () => {
    const top = 250;
    const goal = 1000;
    const px = combatCellPx(top, goal);
    const full = (3 + REACH_BACK) * px;
    const heights: number[] = [];
    for (const i of [0, 1, 2, 3]) {
      const atk = { lane: 1, pos: cellPos(i), range: 3 };
      const farGap = Math.max(...reachPoly(atk).map((p) => visualReachGap(atk.pos, p.pos)));
      expect(farGap, `cell ${i} 的轴半径变了`).toBeCloseTo(3, 2);
      const ys = reachScreenPoly(atk, top, goal).map((p) => p.y);
      heights.push(Math.max(...ys) - Math.min(...ys));
    }
    for (const h of heights) expect(h).toBeCloseTo(heights[0]!, 1);
    expect(heights[0]).toBeCloseTo(full, 1);
  });

  /**
   * 半径按「要罩几路 × 推荐格到开火线」在平面上算出来。
   * 挨 / 拦罩邻列，打罩对巷，修手写短半径。
   */
  it('射程按 coverRange 配，打必须罩得住三路', () => {
    expect(ROLE_RANGE.tank).toBe(coverRange(1, cellPos(0), 0.5));
    expect(ROLE_RANGE.block).toBe(coverRange(1, cellPos(1), 0.5));
    expect(ROLE_RANGE.dps).toBe(coverRange(2, cellPos(2), 1));
    expect(statsOf(getVillager('tiezhu')).range).toBe(ROLE_RANGE.tank);
    expect(statsOf(getVillager('dachui')).range).toBe(ROLE_RANGE.block);
    expect(statsOf(getVillager('sanshen')).range).toBe(ROLE_RANGE.dps);
    expect(statsOf(getVillager('laoyanqiang')).range).toBe(ROLE_RANGE.dps + 1);
    expect(laneReachOf(ROLE_RANGE.tank)).toBe(1);
    expect(laneReachOf(ROLE_RANGE.block)).toBe(1);
    expect(laneReachOf(ROLE_RANGE.dps)).toBe(2);
  });

  /** 站推荐格时余量被开火线吃掉，往后挪一格才用得上 —— 那正是它的用处 */
  it('多出来的那格是站位容错，不是打得更远', () => {
    for (const [id, cell] of [['tiezhu', 0], ['dachui', 1], ['sanshen', 2]] as const) {
      const onSpot = fighter(id, 1, cell);
      const oneBack = fighter(id, 1, cell + 1);
      expect(inFighterRange(onSpot, grunt(1, 1, BLOCK_POS)), `${id} 站推荐格打不到挡点`).toBe(true);
      expect(inFighterRange(oneBack, grunt(2, 1, BLOCK_POS)), `${id} 往后一格就成哑炮`).toBe(true);
    }
  });

  it('「打」站右边推荐格，对巷挡点也必须打得到', () => {
    const dps = VILLAGERS.filter((v) => v.role === 'dps');
    expect(dps.length).toBeGreaterThanOrEqual(5);
    for (const v of dps) {
      const f = fighter(v.id, 2, 2);
      expect(inFighterRange(f, grunt(1, 2, BLOCK_POS)), `${v.name} 本列都够不到`).toBe(true);
      expect(inFighterRange(f, grunt(2, 1, BLOCK_POS)), `${v.name} 够不到邻列`).toBe(true);
      expect(inFighterRange(f, grunt(3, 0, BLOCK_POS)), `${v.name} 够不到对巷`).toBe(true);
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
            } else if (farPos >= 0) {
              expect(inside(posFromVisualGap(f.pos, ahead - eps)), `${tag} 弧内侧该打得到`).toBe(true);
              expect(inside(posFromVisualGap(f.pos, ahead + eps)), `${tag} 弧外侧该打不到`).toBe(false);
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

  it('邻列、对巷都比本列浅，是扇形不是整段往后挪', () => {
    const r = ROLE_RANGE.dps;
    const own = reachAhead(r, 0);
    const side = reachAhead(r, 1);
    const far = reachAhead(r, 2);
    expect(own).toBe(r);
    expect(side).toBeLessThan(own);
    expect(far).toBeLessThan(side);
    expect(Number.isFinite(far)).toBe(true);
  });

  it('只认半径：空场里够得着就打，不够才不打', () => {
    const far = { lane: 1, pos: cellPos(0), range: 10 };
    expect(canReach(far, { lane: 1, pos: 0.05 })).toBe(true);
    expect(canReach(far, { lane: 1, pos: -0.1 })).toBe(false);
    const short = { lane: 1, pos: cellPos(3), range: 2 };
    expect(canReach(short, { lane: 1, pos: 0.05 })).toBe(false);
  });

  it('挨是短扇形：邻列贴脸够，对巷不够；打才罩三路', () => {
    const tank = fighter('tiezhu', 0, 0);
    expect(inFighterRange(tank, grunt(1, 0, cellPos(0) - 0.8))).toBe(true);
    expect(inFighterRange(tank, grunt(2, 1, cellPos(0) - 0.8))).toBe(true);
    expect(inFighterRange(tank, grunt(3, 2, cellPos(0) - 0.8))).toBe(false);
    const aunt = fighter('sanshen', 2, 2);
    expect(inFighterRange(aunt, grunt(4, 0, BLOCK_POS))).toBe(true);
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
        if (Math.abs(reachDist(dlane, dpos) - f.range) < 0.15) continue;
        const inPoly = pointInPolyXY(
          { x: laneScreenX(e.lane), y: posScreenY(e.pos, top, goal) },
          poly,
        );
        expect(inPoly, `cell=${cell} pos=${pos} hit=${hit}`).toBe(hit);
      }
    }
  });

  /**
   * 拿真 bug 换来的两条。
   *
   * 上一版扇形只画半径、不裁开火线，而出手还要过开火线 ——
   * 弹弓叔射程 5 有两格长在村口外，圈里明明有怪却不出手。
   * 当时的等价测试扫的是 inReachRadius，正好把开火线这一半漏过去了，
   * 所以这两条一律扫 canReach（真出手用的那个）。
   */
  it('轮廓上的每一点都必须真打得到', () => {
    for (const v of VILLAGERS) {
      for (let cell = 0; cell < CELL_COUNT; cell += 1) {
        const f = fighter(v.id, 1, cell);
        const axis = reachPoly(f);
        expect(axis.length).toBeGreaterThan(6);
        for (const p of axis) {
          expect(
            canReach(f, p),
            `${v.name} 站 cell ${cell}，轮廓点 lane=${p.lane.toFixed(2)} pos=${p.pos.toFixed(2)} 打不到`,
          ).toBe(true);
        }
      }
    }
  });

  it('全员全格扫一遍：打得到 ⇔ 脚底在扇形里', () => {
    const top = 250;
    const goal = 1000;
    for (const v of VILLAGERS) {
      for (let cell = 0; cell < CELL_COUNT; cell += 1) {
        const f = fighter(v.id, 1, cell);
        const poly = reachScreenPoly(f, top, goal);
        for (let lane = 0; lane < LANE_COUNT; lane += 0.5) {
          for (let pos = 0; pos <= GOAL_POS; pos += 0.2) {
            const tgt = { lane, pos };
            const { dlane, dpos } = reachSep(f, tgt);
            // 三条边界上的点归里归外由浮点说了算，只扫边界以外的
            const onEdge = Math.abs(reachDist(dlane, dpos) - f.range) < 0.12
              || Math.abs(dpos + REACH_BACK) < 0.12;
            if (onEdge) continue;
            const hit = canReach(f, tgt);
            expect(
              pointInPolyXY({ x: laneScreenX(lane), y: posScreenY(pos, top, goal) }, poly),
              `${v.name} cell=${cell} lane=${lane} pos=${pos.toFixed(1)} 该是 ${hit}`,
            ).toBe(hit);
          }
        }
      }
    }
  });

  it('扇形往前就是半径那么长，开火线不裁矮', () => {
    for (const [id, cell] of [['tiezhu', 0], ['dachui', 1], ['sanshen', 2]] as const) {
      const f = fighter(id, 1, cell);
      const front = Math.min(...reachPoly(f).map((p) => p.pos));
      const want = Math.max(0, posFromVisualGap(f.pos, f.range));
      expect(front, `${id} 的扇形前沿不是半径`).toBeCloseTo(want, 2);
      expect(visualReachGap(f.pos, front)).toBeCloseTo(visualReachGap(f.pos, want), 2);
      expect(canReach(f, { lane: 1, pos: front + 0.02 })).toBe(true);
    }
  });
});
