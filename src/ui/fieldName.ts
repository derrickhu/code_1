/**
 * 编队格子。
 *
 * 名字一律居中写在自己脚底，三列对齐、同一排的牌子在一条横线上。
 * 排距拉开到铭牌下面还有空地，再接下一排的头。
 * 挂到腰侧会把一排名字拆到左右两边，格子就散了。
 * 开打后的站位仍走战斗投影，这里只排编队这一屏。
 */
import { CELL_COUNT, FIELD_W, FIELD_X, LANE_COUNT, LANE_W } from '@/balance/combat';

export const FIELD_NAME_H = 20;
const FEET_DROP = 4;
/** 铭牌下沿到下一排头顶之间的空地 */
const ROW_AIR = 18;

export interface FormationGrid {
  /** 第 i 格的脚底，0 靠敌方，越往后越靠底线 */
  feetY: number[];
  pitch: number;
}

export function formationPitch(unitH: number, nameH = FIELD_NAME_H): number {
  return unitH + FEET_DROP + nameH + ROW_AIR;
}

/**
 * 四格脚底。
 * 前两排是最常见的一截，它们的视觉中心对准场地中线；后面的排顺着往下排。
 * top 是后排头顶不许越过的线，bottom 是最前排铭牌下沿不许越过的线。
 */
export function formationGrid(args: {
  unitH: number;
  top: number;
  bottom: number;
  cells?: number;
  nameH?: number;
}): FormationGrid {
  const cells = Math.max(1, args.cells ?? CELL_COUNT);
  const nameH = args.nameH ?? FIELD_NAME_H;
  const nameBelow = FEET_DROP + nameH;
  const minPitch = args.unitH + nameBelow;
  let pitch = formationPitch(args.unitH, nameH);
  const room = Math.max(0, args.bottom - args.top);
  const spanOf = (p: number): number => args.unitH + (cells - 1) * p + nameBelow;
  if (spanOf(pitch) > room) {
    const fit = cells <= 1 ? minPitch : (room - args.unitH - nameBelow) / (cells - 1);
    pitch = Math.max(minPitch, fit);
  }
  const mid = (args.top + args.bottom) / 2;
  const twoSpan = args.unitH + Math.min(cells - 1, 1) * pitch + nameBelow;
  let feet0 = mid - twoSpan / 2 + args.unitH;
  if (feet0 - args.unitH < args.top) feet0 = args.top + args.unitH;
  const lastName = feet0 + (cells - 1) * pitch + nameBelow;
  if (lastName > args.bottom) feet0 -= lastName - args.bottom;
  const feetY = Array.from({ length: cells }, (_, i) => feet0 + i * pitch);
  return { feetY, pitch };
}

/** 铭牌顶边。字心在牌子正中，水平对准这一路的中线 */
export function formationNameTop(feetY: number): number {
  return feetY + FEET_DROP;
}

/** 设计坐标落到编队哪一格。热区按拉开后的排算，不跟战斗投影走 */
export function hitFormationCell(
  x: number,
  y: number,
  feetY: readonly number[],
  unitH: number,
): { lane: number; cell: number } | null {
  if (feetY.length === 0) return null;
  if (x < FIELD_X || x >= FIELD_X + FIELD_W) return null;
  const lane = Math.min(LANE_COUNT - 1, Math.max(0, Math.floor((x - FIELD_X) / LANE_W)));
  const nameBelow = FEET_DROP + FIELD_NAME_H;
  for (let cell = 0; cell < feetY.length; cell += 1) {
    const feet = feetY[cell]!;
    const prev = cell === 0
      ? feet - unitH - 16
      : (feetY[cell - 1]! + feet) / 2;
    const next = cell === feetY.length - 1
      ? feet + nameBelow + 16
      : (feet + feetY[cell + 1]!) / 2;
    if (y >= prev && y < next) return { lane, cell };
  }
  return null;
}
