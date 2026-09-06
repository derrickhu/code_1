import { describe, expect, it } from 'vitest';

import {
  BLOCK_POS, CELL_COUNT, FIELD_W, FIELD_X, FIGHT_BAG_H, GATE_GAP, GOAL_POS,
  LANE_COUNT, LANE_W, VIS_APPROACH_ROWS, VIS_ENGAGE_POS, VIS_ROWS,
  approachWalkSec, battleFieldLay, cellHitBox, cellRectTop, cellScreenH,
  cellScreenY, hitDeployCell, moveSpd, posScreenY, villagerSpriteH,
} from '@/balance/combat';

describe('局内棋盘几何（3 路 × 4 格，人站满）', () => {
  it('逻辑是 3 路 × 4 格，视觉 12 行里只有下 4 行能站', () => {
    expect(LANE_COUNT).toBe(3);
    expect(CELL_COUNT).toBe(4);
    expect(VIS_ROWS).toBe(12);
    expect(VIS_APPROACH_ROWS + CELL_COUNT).toBe(VIS_ROWS);
  });

  it('土路约占七成宽，单路正好一方格', () => {
    expect(FIELD_W).toBe(540);
    expect(FIELD_W / 750).toBeCloseTo(0.72, 2);
    expect(LANE_W).toBe(180);
  });

  it('立绘只占格宽两成左右，不再顶格', () => {
    expect(villagerSpriteH(800)).toBe(32);
    expect(villagerSpriteH(2000)).toBe(36);
    expect(villagerSpriteH(4000)).toBe(40);
    expect(villagerSpriteH(800) / LANE_W).toBeLessThan(0.22);
  });

  it('空场映射到上 8 行，近战停点贴着可站区上沿', () => {
    const top = 100;
    const goal = 1300;
    const span = goal - top;
    const door = top + (VIS_APPROACH_ROWS / VIS_ROWS) * span;
    expect(VIS_ENGAGE_POS).toBe(1);
    expect(posScreenY(0, top, goal)).toBe(top);
    expect(posScreenY(GOAL_POS, top, goal)).toBe(goal);
    expect(posScreenY(VIS_ENGAGE_POS, top, goal)).toBeCloseTo(door, 5);
    expect(posScreenY(BLOCK_POS, top, goal)).toBeGreaterThan(door);
    expect(posScreenY(1, top, goal)).toBeCloseTo(cellRectTop(0, top, goal), 5);
  });

  it('人站在格正中：脚底 = 格心 + 半个身高', () => {
    const top = 100;
    const goal = 1300;
    const h = 40;
    const cellH = cellScreenH(top, goal);
    const y0 = cellRectTop(0, top, goal);
    expect(cellScreenY(0, top, goal, h)).toBeCloseTo(y0 + cellH / 2 + h / 2, 5);
    expect(cellScreenY(0, top, goal, h)).toBeGreaterThan(y0);
    expect(cellScreenY(0, top, goal, h)).toBeLessThan(y0 + cellH);
    expect(cellScreenH(top, goal)).toBeCloseTo(100, 5);
  });

  it('热区铺满整格，点的是格子不是立绘', () => {
    const box = cellHitBox(LANE_W, 100);
    expect(box.w).toBeGreaterThanOrEqual(LANE_W - 4);
    expect(box.h).toBeGreaterThanOrEqual(96);
    expect(box.y).toBe(-box.h);
  });

  it('设计坐标能点到可站格，空场和路外点不中', () => {
    const top = 130;
    const goal = 1232;
    const y0 = cellRectTop(0, top, goal);
    const ch = cellScreenH(top, goal);
    expect(hitDeployCell(375, y0 + 20, top, goal)).toEqual({ lane: 1, cell: 0 });
    expect(hitDeployCell(FIELD_X + 10, y0 + ch + 10, top, goal)).toEqual({ lane: 0, cell: 1 });
    expect(hitDeployCell(80, y0 + 20, top, goal)).toBeNull();
    expect(hitDeployCell(375, top + 10, top, goal)).toBeNull();
  });

  it('空场按皇室入场走，突破后恢复表里的速度', () => {
    expect(approachWalkSec(0.72)).toBeGreaterThanOrEqual(4);
    expect(approachWalkSec(0.72)).toBeLessThan(5.5);
    expect(approachWalkSec(1.05)).toBeLessThan(approachWalkSec(0.42));
    expect(moveSpd(0.72, 0)).toBeLessThan(0.72);
    expect(moveSpd(0.72, VIS_ENGAGE_POS)).toBe(0.72);
  });

  it('路从顶板下沿开始，开打后人落到近底', () => {
    const chromeBottom = 240;
    const height = 1334;
    const benchH = 330;
    const place = battleFieldLay({
      chromeBottom, height, placing: true, safeBottom: 0, benchH,
    });
    const fight = battleFieldLay({
      chromeBottom, height, placing: false, safeBottom: 0, benchH,
    });
    expect(place.spawnY).toBe(chromeBottom + GATE_GAP);
    expect(fight.spawnY).toBe(place.spawnY);
    expect(place.goalY).toBe(height - benchH);
    expect(fight.goalY).toBe(height - FIGHT_BAG_H);
    expect(fight.goalY - fight.spawnY).toBeGreaterThan(place.goalY - place.spawnY);
  });
});
