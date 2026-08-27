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

export function villagerColor(id: string): number {
  return VILLAGER_COLOR[id] ?? GOLD;
}

export function label(size: number, color = 0xffffff, bold = false): PIXI.Text {
  return new PIXI.Text('', {
    fontFamily: 'sans-serif',
    fontSize: size,
    fontWeight: bold ? 'bold' : 'normal',
    fill: color,
  });
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

/** 木板铺满面板，多出来的边裁掉。 */
export function coverSprite(
  parent: PIXI.Container,
  texture: PIXI.Texture | null,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 18,
): PIXI.Sprite | null {
  if (!texture?.baseTexture.valid || texture.width <= 1) return null;
  const spr = new PIXI.Sprite(texture);
  const scale = Math.max(w / texture.width, h / texture.height);
  spr.anchor.set(0.5);
  spr.position.set(x + w / 2, y + h / 2);
  spr.scale.set(scale);
  spr.eventMode = 'none';
  const mask = new PIXI.Graphics();
  mask.eventMode = 'none';
  mask.beginFill(0xffffff).drawRoundedRect(x, y, w, h, radius).endFill();
  spr.mask = mask;
  parent.addChild(spr, mask);
  return spr;
}

/** 铺满且钉住上沿。竖图居中裁会切掉顶边那排钉子。 */
export function coverSpriteTop(
  parent: PIXI.Container,
  texture: PIXI.Texture | null,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 18,
): PIXI.Sprite | null {
  if (!texture?.baseTexture.valid || texture.width <= 1) return null;
  const spr = new PIXI.Sprite(texture);
  const scale = Math.max(w / texture.width, h / texture.height);
  spr.anchor.set(0.5, 0);
  spr.position.set(x + w / 2, y);
  spr.scale.set(scale);
  spr.eventMode = 'none';
  const mask = new PIXI.Graphics();
  mask.eventMode = 'none';
  mask.beginFill(0xffffff).drawRoundedRect(x, y, w, h, radius).endFill();
  spr.mask = mask;
  parent.addChild(spr, mask);
  return spr;
}

/**
 * 自家阵地：三角站位和底栏连成一块台子，避免人悬在路中间。
 * 只铺在脚下这一小片，上方空场仍然不画格子。
 */
export function homeTerrace(
  g: PIXI.Graphics,
  cx: number,
  frontY: number,
  backY: number,
): void {
  const midY = (frontY + backY) / 2 + 12;
  const ry = Math.max(48, (backY - frontY) * 0.72 + 28);
  g.beginFill(0x1a1008, 0.38);
  g.drawEllipse(cx, midY, 208, ry);
  g.endFill();
  g.beginFill(0x000000, 0.2);
  g.drawEllipse(cx, backY + 8, 228, 20);
  g.endFill();
}

/**
 * 队列三格的地面垫。空位也要画出来，否则玩家会以为只能跟旁边的人换。
 * 只画在村民站的那三格，上方空场仍然不铺格子。
 */
export function queuePad(
  g: PIXI.Graphics,
  cx: number,
  feetY: number,
  opts: { empty: boolean; hot: boolean; front: boolean },
): void {
  const rx = opts.empty ? 46 : 42;
  const ry = opts.empty ? 16 : 13;
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

/**
 * 没贴图时也要能认出是哪件破烂：几何剪影，不画金方块。
 */
export function drawModSilhouette(g: PIXI.Graphics, id: string, cx: number, cy: number, size = 28): void {
  const s = size;
  if (id === 'pipe') {
    g.beginFill(0x8a9aa8).drawRoundedRect(cx - s * 0.12, cy - s * 0.48, s * 0.24, s * 0.96, 3).endFill();
    return;
  }
  if (id === 'steelplate') {
    g.beginFill(0x9aa4b2).drawRoundedRect(cx - s * 0.4, cy - s * 0.32, s * 0.8, s * 0.64, 4).endFill();
    return;
  }
  if (id === 'pressurecooker') {
    g.beginFill(0xc9c4b8).drawRoundedRect(cx - s * 0.32, cy - s * 0.18, s * 0.64, s * 0.5, 8).endFill();
    g.beginFill(0xd7c7a4).drawCircle(cx, cy - s * 0.28, s * 0.14).endFill();
    return;
  }
  if (id === 'weight') {
    g.beginFill(0x4a4a52).drawEllipse(cx, cy + 2, s * 0.34, s * 0.28).endFill();
    return;
  }
  if (id === 'blower') {
    g.beginFill(0x4a8fd4).drawCircle(cx, cy, s * 0.32).endFill();
    g.beginFill(0xfff4c4).drawCircle(cx, cy, s * 0.12).endFill();
    return;
  }
  if (id === 'wire') {
    g.lineStyle(3, 0x2a2a2a, 0.95).drawCircle(cx, cy, s * 0.28).lineStyle(0);
    return;
  }
  if (id === 'helmet') {
    g.beginFill(0xc45a32).drawEllipse(cx, cy, s * 0.36, s * 0.3).endFill();
    return;
  }
  if (id === 'chainsaw') {
    g.beginFill(0xd9a13b).drawRoundedRect(cx - s * 0.42, cy - s * 0.14, s * 0.84, s * 0.28, 4).endFill();
    return;
  }
  if (id === 'firecracker') {
    g.beginFill(0xc43a32).drawRoundedRect(cx - s * 0.16, cy - s * 0.36, s * 0.32, s * 0.72, 3).endFill();
    return;
  }
  if (id === 'pot') {
    g.beginFill(0xb8b0a4).drawEllipse(cx, cy, s * 0.36, s * 0.28).endFill();
    return;
  }
  if (id === 'quilt') {
    g.beginFill(0xd4736b).drawRoundedRect(cx - s * 0.36, cy - s * 0.22, s * 0.72, s * 0.44, 8).endFill();
    return;
  }
  if (id === 'speaker') {
    g.beginFill(0x3a3a42).drawRoundedRect(cx - s * 0.3, cy - s * 0.3, s * 0.6, s * 0.6, 6).endFill();
    g.beginFill(0xffd66b).drawCircle(cx, cy, s * 0.14).endFill();
    return;
  }
  g.beginFill(GOLD, 0.9).drawRoundedRect(cx - s * 0.32, cy - s * 0.32, s * 0.64, s * 0.64, 6).endFill();
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

