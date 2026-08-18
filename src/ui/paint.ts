/**
 * 切片统一画法。
 * 角色站在地面上，UI 用暗底金边；禁止方框套圆框、色块套立绘。
 */
import * as PIXI from 'pixi.js';

export const GOLD = 0xc9a46a;
export const INK = 0x0c0e14;
export const PLATE = 0x14161f;

export function plate(
  g: PIXI.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 14,
  alpha = 0.78,
): void {
  g.beginFill(PLATE, alpha).drawRoundedRect(x, y, w, h, radius).endFill();
  g.lineStyle(1.5, GOLD, 0.4).drawRoundedRect(x, y, w, h, radius).lineStyle(0);
}

export function goldBtn(g: PIXI.Graphics, x: number, y: number, w: number, h: number): void {
  g.beginFill(0x2a2218, 0.94).drawRoundedRect(x, y, w, h, 16).endFill();
  g.lineStyle(2, GOLD, 0.85).drawRoundedRect(x, y, w, h, 16).lineStyle(0);
}

/** 脚底阴影 + 系别光晕。这是站位，不是头像框。 */
export function stance(
  g: PIXI.Graphics,
  cx: number,
  feetY: number,
  color: number,
  occupied: boolean,
): void {
  g.beginFill(0x000000, occupied ? 0.32 : 0.2);
  g.drawEllipse(cx, feetY + 8, occupied ? 38 : 44, occupied ? 11 : 13);
  g.endFill();
  if (occupied) {
    g.beginFill(color, 0.28).drawEllipse(cx, feetY + 8, 40, 12).endFill();
  } else {
    g.lineStyle(1.5, 0xd7c7a4, 0.28).drawEllipse(cx, feetY + 8, 44, 13).lineStyle(0);
  }
}

/**
 * 选中时的攻击范围：贴地椭圆，不是竖条。
 * 近战是围着人的一小片；远程是从脚下铺到最远点的大片。
 */
export function rangeArea(
  g: PIXI.Graphics,
  cx: number,
  feetY: number,
  reachY: number,
  color: number,
  melee: boolean,
): void {
  const forward = Math.max(40, Math.abs(feetY - reachY));
  if (melee) {
    const rx = Math.max(78, forward * 1.2);
    const ry = Math.max(52, forward * 0.9);
    const cy = feetY - ry * 0.28;
    g.beginFill(color, 0.18).drawEllipse(cx, cy, rx, ry).endFill();
    g.lineStyle(2.6, color, 0.78).drawEllipse(cx, cy, rx, ry).lineStyle(0);
    g.lineStyle(1.2, 0xffffff, 0.32).drawEllipse(cx, cy, rx * 0.9, ry * 0.9).lineStyle(0);
    return;
  }
  const ry = forward * 0.52;
  const rx = Math.min(300, Math.max(120, forward * 0.4));
  const cy = (feetY + reachY) / 2;
  g.beginFill(color, 0.1).drawEllipse(cx, cy, rx, ry).endFill();
  g.lineStyle(2.2, color, 0.55).drawEllipse(cx, cy, rx, ry).lineStyle(0);
}

/** 护盾标记：小盾牌，不套人像圈。 */
export function shieldMark(g: PIXI.Graphics, cx: number, cy: number): void {
  g.beginFill(0x7dd3fc, 0.95);
  g.moveTo(cx, cy - 7);
  g.lineTo(cx + 6, cy - 3);
  g.lineTo(cx + 5, cy + 4);
  g.lineTo(cx, cy + 8);
  g.lineTo(cx - 5, cy + 4);
  g.lineTo(cx - 6, cy - 3);
  g.closePath();
  g.endFill();
}

export function hpBar(
  g: PIXI.Graphics,
  cx: number,
  y: number,
  width: number,
  ratio: number,
  color: number,
): void {
  const w = Math.max(0, Math.min(1, ratio)) * width;
  g.beginFill(0x000000, 0.55).drawRoundedRect(cx - width / 2, y, width, 6, 3).endFill();
  if (w > 0) g.beginFill(color, 0.95).drawRoundedRect(cx - width / 2, y, w, 6, 3).endFill();
}

