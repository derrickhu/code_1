import type * as PIXI from 'pixi.js';
import { uiTex, type UiName } from '@/core/TextureLoader';
import { GOLD, fitSprite, painted } from '@/ui/paint';

/** 锈金漆字。贴图没到就返回 false，调用方退回系统字。 */
export function paintGlyphs(
  parent: PIXI.Container,
  names: readonly UiName[],
  cx: number,
  cy: number,
  h: number,
  gap = 6,
): boolean {
  const texs = names.map((n) => uiTex(n));
  if (texs.some((t) => !t?.baseTexture.valid || t.width <= 1)) return false;
  const ws = texs.map((t) => (t!.width / t!.height) * h);
  const total = ws.reduce((a, b) => a + b, 0) + gap * Math.max(0, texs.length - 1);
  let x = cx - total / 2;
  texs.forEach((t, i) => {
    fitSprite(parent, t, x + ws[i]! / 2, cy, ws[i]!, h);
    x += ws[i]! + gap;
  });
  return true;
}

export function numGlyphs(n: number): UiName[] {
  return String(Math.floor(Math.max(0, n))).split('').map((d) => `paint_${d}` as UiName);
}

/** 3/5 这种比分。数字走漆字，斜杠没有贴图就手写一笔。 */
export function paintFrac(
  parent: PIXI.Container,
  a: number,
  b: number,
  cx: number,
  cy: number,
  h: number,
): boolean {
  const left = numGlyphs(a);
  const right = numGlyphs(b);
  const names = [...left, ...right];
  const texs = names.map((n) => uiTex(n));
  if (texs.some((t) => !t?.baseTexture.valid || t.width <= 1)) return false;
  const slashW = h * 0.28;
  const gap = 3;
  const ws = texs.map((t) => (t!.width / t!.height) * h);
  const leftW = ws.slice(0, left.length).reduce((s, w) => s + w, 0) + gap * Math.max(0, left.length - 1);
  const rightW = ws.slice(left.length).reduce((s, w) => s + w, 0) + gap * Math.max(0, right.length - 1);
  const total = leftW + slashW + rightW + gap * 2;
  let x = cx - total / 2;
  texs.slice(0, left.length).forEach((t, i) => {
    fitSprite(parent, t, x + ws[i]! / 2, cy, ws[i]!, h);
    x += ws[i]! + gap;
  });
  const slash = painted(Math.round(h * 0.72), GOLD, '#1a1008', 3);
  slash.anchor.set(0.5);
  slash.position.set(x + slashW / 2, cy);
  slash.text = '/';
  parent.addChild(slash);
  x += slashW + gap;
  texs.slice(left.length).forEach((t, i) => {
    const w = ws[left.length + i]!;
    fitSprite(parent, t, x + w / 2, cy, w, h);
    x += w + gap;
  });
  return true;
}
