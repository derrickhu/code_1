import { describe, expect, it } from 'vitest';
import { BLOCK_POS, CELL_COUNT, COMBAT_POS, LANE_COUNT, cellPos, laneScreenX, posScreenY } from '@/balance/combat';
import { getEnemy } from '@/balance/stages';
import { VILLAGERS, getVillager, statsOf } from '@/balance/villagers';
import {
  REACH_BACK, canReach, inReachRadius, laneReachOf, reachAhead, reachDist, reachPoly,
  reachScreenPoly,
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

describe('攻击范围：出手和展示只走 @/game/reach', () => {
  it('半径不随摆放格子变；开火线只裁门洞，不改射程', () => {
    const range = 3;
    expect(inReachRadius(range, 0, 2.5)).toBe(true);
    expect(inReachRadius(range, 1, 2.5)).toBe(true);
    expect(inReachRadius(range, 1, 2.93)).toBe(false);
    expect(reachAhead(range, 0)).toBe(3);
    const samples: [number, number][] = [[0, 1], [0, 2.5], [1, 2.5], [1, 0], [2, 1]];
    for (const [dlane, dpos] of samples) {
      const hit = inReachRadius(range, dlane, dpos);
      for (const cell of [0, 1, 2, 3]) {
        const atk = { lane: 1, pos: cellPos(cell), range };
        const tgt = { lane: atk.lane + dlane, pos: atk.pos - dpos };
        expect(inReachRadius(range, tgt.lane - atk.lane, atk.pos - tgt.pos)).toBe(hit);
        if (tgt.pos >= COMBAT_POS) expect(canReach(atk, tgt)).toBe(hit);
        else expect(canReach(atk, tgt)).toBe(false);
      }
    }
    const back = reachPoly({ lane: 1, pos: cellPos(3), range });
    const front = reachPoly({ lane: 1, pos: cellPos(0), range });
    expect(Math.min(...back.map((p) => p.pos))).toBeCloseTo(cellPos(3) - 3, 2);
    expect(Math.min(...front.map((p) => p.pos))).toBeCloseTo(COMBAT_POS, 2);
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

  /**
   * 这条塌过一次：邻列按整格扣的时候，「打」站在自动布阵给的 cell 2 上
   * 够不到被挡住的怪，「打能照顾左右」在标准阵型下等于没有。
   */
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

  /**
   * 画面和判定必须是同一套。扇形前沿 = reachAhead，往里一点打得到、往外一点打不到。
   */
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
            const farPos = f.pos - ahead;
            if (ahead < 0.08) {
              // 扇形刚好擦到这条路，只有脚底这一横点在圆上
              expect(inside(f.pos), `${tag} 擦边该打得到`).toBe(true);
              expect(inside(f.pos - 0.1), `${tag} 擦边往前该打不到`).toBe(false);
            } else if (farPos >= COMBAT_POS) {
              expect(inside(farPos + eps), `${tag} 弧内侧该打得到`).toBe(true);
              expect(inside(farPos - eps), `${tag} 弧外侧该打不到`).toBe(false);
            } else {
              expect(inside(COMBAT_POS - eps), `${tag} 开火线外该打不到`).toBe(false);
            }
            if (ahead >= REACH_BACK) {
              expect(inside(f.pos + REACH_BACK - eps), `${tag} 身后内侧该打得到`).toBe(true);
              expect(inside(f.pos + REACH_BACK + eps), `${tag} 身后再往后该打不到`).toBe(false);
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
    const far = fighter('laoyanqiang', 1, 0);
    expect(inFighterRange(far, grunt(1, 1, COMBAT_POS - 0.1))).toBe(false);
    expect(inFighterRange(far, grunt(2, 1, COMBAT_POS + 0.1))).toBe(true);
  });

  it('挨射程短，扇形罩不到邻列；拦开始够着', () => {
    const tank = fighter('tiezhu', 1, 0);
    expect(inFighterRange(tank, grunt(1, 1, cellPos(0) - 0.8))).toBe(true);
    expect(inFighterRange(tank, grunt(2, 0, cellPos(0) - 0.8))).toBe(false);
    const hammer = fighter('dachui', 1, 1);
    expect(inFighterRange(hammer, grunt(3, 0, cellPos(1)))).toBe(true);
  });

  /**
   * 回归：按格高另画一圈会比真出手短，前排三婶能打到开火线附近的怪，
   * 怪的脚底却落在那圈外面。屏幕多边形必须用和怪同一套 posScreenY。
   */
  it('能打到的怪，脚底必在绘制多边形里', () => {
    const top = 250;
    const goal = 1000;
    const f = fighter('sanshen', 1, 0);
    const e = grunt(1, 1, COMBAT_POS + 0.05);
    expect(inFighterRange(f, e)).toBe(true);
    const poly = reachScreenPoly(f, top, goal);
    expect(pointInPolyXY(
      { x: laneScreenX(e.lane), y: posScreenY(e.pos, top, goal) },
      poly,
    )).toBe(true);
  });

  /**
   * 画圈用的顶点和出手是同一个 canReach。
   */
  it('能出手 ⇔ 在绘制多边形里', () => {
    const f = fighter('sanshen', 1, 2);
    const poly = reachPoly(f);
    expect(poly.length).toBeGreaterThan(6);
    for (const p of poly) {
      expect(canReach(f, p), `顶点 lane=${p.lane.toFixed(2)} pos=${p.pos.toFixed(2)}`).toBe(true);
    }
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      for (let pos = COMBAT_POS; pos <= 6; pos += 0.25) {
        expect(inFighterRange(f, grunt(8000 + lane * 100 + Math.round(pos * 10), lane, pos)))
          .toBe(canReach(f, { lane, pos }));
      }
    }
    for (let lane = 0; lane <= 2; lane += 0.25) {
      for (let pos = 0; pos <= 6; pos += 0.2) {
        const tgt = { lane, pos };
        const hit = canReach(f, tgt);
        const d = reachDist(lane - f.lane, f.pos - pos);
        const onEdge = Math.abs(d - f.range) < 0.15 || Math.abs(pos - COMBAT_POS) < 0.1;
        if (onEdge) continue;
        expect(pointInPoly(tgt, poly), `lane=${lane} pos=${pos} hit=${hit}`).toBe(hit);
      }
    }
  });
});

function pointInPoly(
  pt: { lane: number; pos: number },
  poly: readonly { lane: number; pos: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    const cross = ((a.pos > pt.pos) !== (b.pos > pt.pos))
      && (pt.lane < ((b.lane - a.lane) * (pt.pos - a.pos)) / (b.pos - a.pos || 1e-9) + a.lane);
    if (cross) inside = !inside;
  }
  return inside;
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
