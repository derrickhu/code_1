/**
 * 切片统一画法。
 * 角色站在地面上，UI 用暗底金边；禁止方框套圆框、色块套立绘。
 */
import * as PIXI from 'pixi.js';

export const GOLD = 0xc9a46a;
export const INK = 0x0c0e14;
export const PLATE = 0x14161f;

/** 村民一人一色，暖色系。外星人用冷色，两边一眼分得开 */
const VILLAGER_COLOR: Readonly<Record<string, number>> = {
  tiezhu: 0xc4703a,
  dachui: 0xd9a13b,
  laoli: 0xb4553f,
  erjiu: 0xa8823f,
  sanshen: 0xd4736b,
  laoyanqiang: 0x8f7a4a,
};

export function label(size: number, color = 0xffffff, bold = false): PIXI.Text {
  return new PIXI.Text('', {
    fontFamily: 'sans-serif',
    fontSize: size,
    fontWeight: bold ? 'bold' : 'normal',
    fill: color,
  });
}

/** 锈金漆字。门楣上的关卡名、资源数走这一套，不要裸系统字。 */
export function painted(size: number, color: number, rim = '#1a1008', thick = 4): PIXI.Text {
  const t = label(size, color, true);
  t.style.stroke = rim;
  t.style.strokeThickness = thick;
  return t;
}

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

export function rivet(g: PIXI.Graphics, x: number, y: number, r = 5): void {
  oldNail(g, x, y, r);
}

function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** 铜锈钉头：褐铜底、橙锈边、偶尔一点铜绿 */
export function oldNail(g: PIXI.Graphics, x: number, y: number, r = 8, seed = 1): void {
  const rust = hash01(seed + 3);
  g.beginFill(0x0a0604, 0.42).drawCircle(x + 1.3, y + 2.3, r).endFill();
  g.beginFill(0x3a2214).drawCircle(x, y, r).endFill();
  g.beginFill(rust > 0.62 ? 0x4e8c7a : 0xc45a22, rust > 0.62 ? 0.42 : 0.55)
    .drawEllipse(x + r * 0.12, y + r * 0.18, r * 0.82, r * 0.7)
    .endFill();
  g.beginFill(0x5a3a22).drawCircle(x - r * 0.1, y - r * 0.16, r * 0.58).endFill();
  g.beginFill(0xe8c080, 0.42).drawCircle(x - r * 0.3, y - r * 0.34, r * 0.2).endFill();
}

/**
 * 顶边钉子。两头簇着钉，中间疏密不一，高低错开，不要一条尺上的点。
 */
export function nailRow(g: PIXI.Graphics, x: number, y: number, w: number, r = 8): void {
  const spots = [
    0.045, 0.078, 0.108,
    0.21, 0.34, 0.49, 0.61, 0.76,
    0.89, 0.922, 0.955,
  ];
  spots.forEach((t, i) => {
    const nx = x + w * t + (hash01(i + 4) - 0.5) * 16;
    const ny = y + (hash01(i + 17) - 0.5) * 14 + (i < 3 || i > 7 ? (hash01(i + 29) - 0.3) * 8 : 0);
    const rr = r * (0.72 + hash01(i + 41) * 0.55);
    oldNail(g, nx, ny, rr, i + 7);
  });
}

/** 角上三颗簇钉，跟着圆角落，不要排成等边三角 */
export function nailCluster(g: PIXI.Graphics, cx: number, cy: number, r = 6, seed = 0): void {
  const offs = [
    [-16, 4],
    [2, -8],
    [14, 6],
  ];
  offs.forEach(([dx, dy], i) => {
    oldNail(
      g,
      cx + dx + (hash01(seed + i) - 0.5) * 8,
      cy + dy + (hash01(seed + i + 5) - 0.5) * 7,
      r * (0.75 + hash01(seed + i + 9) * 0.45),
      seed + i,
    );
  });
}

/** 局外贴图：整件缩进框里，脚和链子都留着，不裁。 */
export function fitSprite(
  parent: PIXI.Container,
  texture: PIXI.Texture | null,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number,
): PIXI.Sprite | null {
  if (!texture?.baseTexture.valid || texture.width <= 1) return null;
  const spr = new PIXI.Sprite(texture);
  spr.anchor.set(0.5);
  spr.position.set(cx, cy);
  spr.scale.set(Math.min(maxW / texture.width, maxH / texture.height));
  spr.eventMode = 'none';
  parent.addChild(spr);
  return spr;
}

/**
 * 脚钉在同一条线上。图鉴三阶要按身体定高各自传入 scale，
 * 不能三张图共用一个像素比例。
 */
export function standSprite(
  parent: PIXI.Container,
  texture: PIXI.Texture | null,
  cx: number,
  feetY: number,
  maxW: number,
  maxH: number,
  scale?: number,
): PIXI.Sprite | null {
  if (!texture?.baseTexture.valid || texture.width <= 1) return null;
  const spr = new PIXI.Sprite(texture);
  spr.anchor.set(0.5, 1);
  spr.scale.set(scale ?? Math.min(maxW / texture.width, maxH / texture.height));
  spr.position.set(cx, feetY);
  spr.eventMode = 'none';
  parent.addChild(spr);
  return spr;
}

/** 木板铺满面板，多出来的边裁掉。 */

/** 铜锈斑。贴图被压平了也还能看见橙锈和铜绿 */
export function copperRust(
  g: PIXI.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const blobs: readonly { rx: number; ry: number; rw: number; rh: number; c: number; a: number }[] = [
    { rx: 0.06, ry: 0.08, rw: 0.22, rh: 0.1, c: 0xc45a22, a: 0.28 },
    { rx: 0.68, ry: 0.04, rw: 0.24, rh: 0.11, c: 0xb85a2a, a: 0.26 },
    { rx: 0.38, ry: 0.42, rw: 0.2, rh: 0.09, c: 0xd46a28, a: 0.16 },
    { rx: 0.12, ry: 0.62, rw: 0.18, rh: 0.14, c: 0x4e8c7a, a: 0.16 },
    { rx: 0.72, ry: 0.7, rw: 0.2, rh: 0.12, c: 0xc46a28, a: 0.2 },
    { rx: 0.48, ry: 0.12, rw: 0.12, rh: 0.07, c: 0x5aa08b, a: 0.12 },
    { rx: 0.22, ry: 0.28, rw: 0.14, rh: 0.08, c: 0x8a3a18, a: 0.18 },
  ];
  for (const b of blobs) {
    g.beginFill(b.c, b.a).drawEllipse(x + w * b.rx, y + h * b.ry, w * b.rw, h * b.rh).endFill();
  }
}

/** 锈铁板。主页顶栏和底坞用同一块料，不再混木牌和黑玻璃。 */
export function ironSlab(
  g: PIXI.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 12,
): void {
  g.beginFill(0x0a0604, 0.5).drawRoundedRect(x + 4, y + 6, w, h, radius).endFill();
  g.beginFill(0x2a1810).drawRoundedRect(x, y, w, h, radius).endFill();
  g.beginFill(0x3d2418, 0.72).drawRoundedRect(x + 7, y + 7, w - 14, h - 14, Math.max(4, radius - 6)).endFill();
  g.lineStyle(2, 0x6a4a28, 0.4).drawRoundedRect(x + 2, y + 2, w - 4, h - 4, radius).lineStyle(0);
  const inset = Math.min(18, w * 0.06, h * 0.22);
  rivet(g, x + inset, y + inset);
  rivet(g, x + w - inset, y + inset);
  rivet(g, x + inset, y + h - inset);
  rivet(g, x + w - inset, y + h - inset);
}

/**
 * 格子的地面垫。开打之后才画，布阵阶段画的是空心格（那时候格线本身就是热区）。
 * 只画在自家那 12 格上，上方空场仍然不铺 —— 空场是舞台，见 BattleScene 的头注释。
 */
export function queuePad(
  g: PIXI.Graphics,
  cx: number,
  feetY: number,
  opts: { empty: boolean; hot: boolean; front: boolean },
): void {
  const rx = opts.empty ? 18 : 16;
  const ry = opts.empty ? 7 : 6;
  g.beginFill(0x000000, opts.empty ? 0.22 : 0.18);
  g.drawEllipse(cx, feetY + 8, rx, ry);
  g.endFill();
  if (opts.hot) {
    g.lineStyle(3, 0x9be08a, 0.95).drawEllipse(cx, feetY + 8, rx + 4, ry + 3).lineStyle(0);
    g.beginFill(0x9be08a, 0.12).drawEllipse(cx, feetY + 8, rx, ry).endFill();
    return;
  }
  if (opts.empty) {
    g.lineStyle(2, GOLD, 0.55).drawEllipse(cx, feetY + 8, rx, ry).lineStyle(0);
    g.lineStyle(1.2, GOLD, 0.25).drawEllipse(cx, feetY + 8, rx * 0.62, ry * 0.62).lineStyle(0);
    return;
  }
  if (opts.front) {
    g.beginFill(GOLD, 0.18).drawEllipse(cx, feetY + 8, rx + 8, ry + 5).endFill();
    g.lineStyle(3.6, GOLD, 0.95).drawEllipse(cx, feetY + 8, rx + 7, ry + 4).lineStyle(0);
    g.lineStyle(1.4, 0xffe08a, 0.75).drawEllipse(cx, feetY + 8, rx + 1, ry + 1).lineStyle(0);
  }
}

/**
 * 点人看射程：把 `reachScreenPoly` 填上。
 * 顶点来自 `@/game/reach`，已经是能出手的点，这里不再算距离。
 */
export function reachPoly(
  g: PIXI.Graphics,
  pts: readonly { x: number; y: number }[],
  color: number,
  pulse: number,
): void {
  if (pts.length < 3) return;
  g.beginFill(color, 0.18 * pulse);
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i]!.x, pts[i]!.y);
  g.closePath();
  g.endFill();

  const farN = Math.ceil(pts.length / 2);
  g.lineStyle(2.6, color, 0.72 * pulse);
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < farN; i += 1) g.lineTo(pts[i]!.x, pts[i]!.y);
  g.lineStyle(0);
  const mid = Math.floor(farN / 2);
  const a = pts[Math.max(0, mid - 3)]!;
  const b = pts[mid]!;
  const c = pts[Math.min(farN - 1, mid + 3)]!;
  g.lineStyle(4, color, 0.92 * pulse);
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.lineTo(c.x, c.y);
  g.lineStyle(0);
  g.lineStyle(1.4, 0xfff4c4, 0.45 * pulse);
  g.moveTo(a.x, a.y + 3);
  g.lineTo(c.x, c.y + 3);
  g.lineStyle(0);
}

/**
 * 经验条。玩家唯一能看见的「还差多久捡下一件破烂」。
 *
 * 攒满了不画成空条：破烂发完之后这条还在，得让它看起来是完成态而不是坏了。
 */
export function expBar(
  g: PIXI.Graphics,
  x: number,
  y: number,
  width: number,
  ratio: number,
  done: boolean,
): void {
  const h = 12;
  const r = 6;
  g.beginFill(0x000000, 0.5).drawRoundedRect(x, y, width, h, r).endFill();
  const w = done ? width : Math.max(0, Math.min(1, ratio)) * width;
  if (w > 0) {
    g.beginFill(done ? 0x9be08a : GOLD, 0.95).drawRoundedRect(x, y, w, h, r).endFill();
  }
  g.lineStyle(1.2, GOLD, 0.45).drawRoundedRect(x, y, width, h, r).lineStyle(0);
}

/**
 * 槽里的填充。对标 Godot TextureProgressBar 的 under / progress / over：
 * 槽底是 rust_exp，这里只画 progress，最后用沿口阴影当 over。
 * 不用奶油金胶囊——那是系统滑块，不是槽里的铜浆。
 */
export function paintTroughFill(
  g: PIXI.Graphics,
  well: { x: number; y: number; w: number; h: number },
  ratio: number,
  done: boolean,
): void {
  const w = done ? well.w : Math.max(0, Math.min(1, ratio)) * well.w;
  if (w < 1) return;
  const x = well.x;
  const y = well.y;
  const h = well.h;
  const r = Math.min(2, Math.max(1, Math.round(h * 0.18)));
  const body = done ? 0x8a6a28 : 0x7a4e1e;
  g.beginFill(body, 0.92).drawRoundedRect(x, y, w, h, r).endFill();
  g.beginFill(0x3a2410, 0.38).drawRoundedRect(x, y + h * 0.55, w, Math.max(1, h * 0.45), r).endFill();
  const shineH = Math.max(1, Math.round(h * 0.28));
  g.beginFill(GOLD, 0.28).drawRoundedRect(x + 1, y + 1, Math.max(0, w - 2), shineH, Math.max(1, r - 1)).endFill();
  g.beginFill(0x000000, 0.28).drawRect(well.x, well.y, well.w, 2).endFill();
  g.beginFill(0x000000, 0.16).drawRect(well.x, well.y, 2, well.h).endFill();
}

/** 铺满一块矩形。顶栏锈牌、出村铁门要拉到设计尺寸，不能按原图比例缩成小方块。 */
export function fillSprite(
  parent: PIXI.Container,
  texture: PIXI.Texture | null,
  cx: number,
  cy: number,
  w: number,
  h: number,
): PIXI.Sprite | null {
  if (!texture?.baseTexture.valid || texture.width <= 1) return null;
  const spr = new PIXI.Sprite(texture);
  spr.anchor.set(0.5);
  spr.position.set(cx, cy);
  spr.scale.set(w / texture.width, h / texture.height);
  spr.eventMode = 'none';
  parent.addChild(spr);
  return spr;
}

/** 钉在泥地里的木牌。关卡桩、能升阶木牌的兜底，贴图没来时也能认。 */
export function woodPlank(
  g: PIXI.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 8,
): void {
  g.beginFill(0x1a1008, 0.45).drawRoundedRect(x + 3, y + 5, w, h, radius).endFill();
  g.beginFill(0x5a3a18).drawRoundedRect(x, y, w, h, radius).endFill();
  g.beginFill(0x6e4a22, 0.78).drawRoundedRect(x + 5, y + 4, w - 10, h - 8, Math.max(3, radius - 3)).endFill();
  g.lineStyle(2, 0x3a2410, 0.55).drawRoundedRect(x + 1, y + 1, w - 2, h - 2, radius).lineStyle(0);
}

export function hpBar(
  g: PIXI.Graphics,
  cx: number,
  y: number,
  width: number,
  ratio: number,
  color: number,
  barH = 6,
): void {
  const w = Math.max(0, Math.min(1, ratio)) * width;
  const r = Math.max(1, Math.round(barH / 2));
  g.beginFill(0x000000, 0.55).drawRoundedRect(cx - width / 2, y, width, barH, r).endFill();
  if (w > 0) g.beginFill(color, 0.95).drawRoundedRect(cx - width / 2, y, w, barH, r).endFill();
}

