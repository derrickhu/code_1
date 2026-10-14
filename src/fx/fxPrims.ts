/**
 * 特效底件：开局用 2D canvas 画一次的白色发光件，染色叠加。
 * 光圈、拖尾、火星、星爆核都走这里，不再拿画好的贴纸（镯子、土团）去冒充光。
 * 不下载、不占包，整局只画一次。
 */
import * as PIXI from 'pixi.js';
import { settings } from '@pixi/settings';

export type PrimName =
  | 'glow' | 'core' | 'ring' | 'shock' | 'streak' | 'spark' | 'dust' | 'bubble'
  | 'star' | 'barFrame' | 'barFrameGold' | 'barFill' | 'barGloss';

/**
 * 旧贴纸差不多多大，调用方的缩放是按那套写的。
 * 底件按这个宽度换算，场上大小不跟着变。
 */
export const PRIM_NOMINAL: Readonly<Partial<Record<PrimName, number>>> = {
  glow: 300,
  core: 360,
  ring: 330,
  shock: 360,
  streak: 360,
  spark: 420,
  dust: 300,
  bubble: 300,
};

type Ctx = CanvasRenderingContext2D;

const cache = new Map<PrimName, PIXI.Texture | null>();

function canvas(w: number, h: number): { c: HTMLCanvasElement; g: Ctx } | null {
  try {
    const c = settings.ADAPTER.createCanvas(w, h) as HTMLCanvasElement;
    c.width = w;
    c.height = h;
    const g = c.getContext('2d') as Ctx | null;
    return g ? { c, g } : null;
  } catch {
    return null;
  }
}

function radial(g: Ctx, cx: number, cy: number, r: number, stops: readonly [number, string][]): void {
  const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const [o, col] of stops) grd.addColorStop(o, col);
  g.fillStyle = grd;
  g.beginPath();
  g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fill();
}

/** 两头尖、中间亮的梭子。拖尾和火星都靠它 */
function needle(g: Ctx, w: number, h: number, head: number, layers: readonly [number, number][]): void {
  const cy = h / 2;
  for (const [thick, alpha] of layers) {
    const half = (h / 2) * thick;
    const grd = g.createLinearGradient(0, 0, w, 0);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(head * 0.6, `rgba(255,255,255,${alpha * 0.55})`);
    grd.addColorStop(head, `rgba(255,255,255,${alpha})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, cy);
    g.quadraticCurveTo(w * head, cy - half, w, cy);
    g.quadraticCurveTo(w * head, cy + half, 0, cy);
    g.fill();
  }
}

function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r);
  g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h);
  g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r);
  g.arcTo(x, y, x + r, y, r);
  g.closePath();
}

function star(g: Ctx, cx: number, cy: number, ro: number, ri: number, n: number, rot = -Math.PI / 2): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i += 1) {
    const r = i % 2 === 0 ? ro : ri;
    const a = rot + (i * Math.PI) / n;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
}

const PAINT: Record<PrimName, () => HTMLCanvasElement | null> = {
  glow: () => {
    const k = canvas(96, 96);
    if (!k) return null;
    radial(k.g, 48, 48, 48, [
      [0, 'rgba(255,255,255,1)'],
      [0.18, 'rgba(255,255,255,0.75)'],
      [0.45, 'rgba(255,255,255,0.25)'],
      [0.75, 'rgba(255,255,255,0.06)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    return k.c;
  },
  core: () => {
    const k = canvas(160, 160);
    if (!k) return null;
    const { g } = k;
    radial(g, 80, 80, 80, [
      [0, 'rgba(255,255,255,0.95)'],
      [0.12, 'rgba(255,255,255,0.7)'],
      [0.35, 'rgba(255,255,255,0.16)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    // 十字长芒 + 斜短芒
    g.save();
    g.translate(80, 80);
    for (let i = 0; i < 8; i += 1) {
      const long = i % 2 === 0;
      g.save();
      g.rotate((i * Math.PI) / 4 + 0.2);
      g.translate(-80, -8);
      const w = long ? 160 : 112;
      g.translate((160 - w) / 2, 0);
      needle(g, w, 16, 0.5, long ? [[1, 0.55], [0.45, 1]] : [[0.8, 0.45]]);
      g.restore();
    }
    g.restore();
    radial(g, 80, 80, 18, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
    return k.c;
  },
  ring: () => {
    const k = canvas(128, 128);
    if (!k) return null;
    radial(k.g, 64, 64, 64, [
      [0, 'rgba(255,255,255,0)'],
      [0.72, 'rgba(255,255,255,0)'],
      [0.84, 'rgba(255,255,255,0.55)'],
      [0.9, 'rgba(255,255,255,1)'],
      [0.95, 'rgba(255,255,255,0.45)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    return k.c;
  },
  shock: () => {
    const k = canvas(128, 128);
    if (!k) return null;
    radial(k.g, 64, 64, 64, [
      [0, 'rgba(255,255,255,0)'],
      [0.35, 'rgba(255,255,255,0.05)'],
      [0.7, 'rgba(255,255,255,0.35)'],
      [0.88, 'rgba(255,255,255,0.95)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    return k.c;
  },
  streak: () => {
    const k = canvas(192, 40);
    if (!k) return null;
    needle(k.g, 192, 40, 0.78, [[1, 0.35], [0.55, 0.7], [0.22, 1]]);
    return k.c;
  },
  spark: () => {
    const k = canvas(96, 20);
    if (!k) return null;
    needle(k.g, 96, 20, 0.62, [[1, 0.45], [0.4, 1]]);
    return k.c;
  },
  dust: () => {
    const k = canvas(96, 96);
    if (!k) return null;
    const blobs: [number, number, number, number][] = [
      [48, 54, 30, 0.55], [32, 46, 20, 0.45], [64, 44, 22, 0.45], [46, 34, 18, 0.4], [58, 62, 18, 0.35],
    ];
    for (const [x, y, r, a] of blobs) {
      radial(k.g, x, y, r, [
        [0, `rgba(255,255,255,${a})`],
        [0.6, `rgba(255,255,255,${a * 0.7})`],
        [1, 'rgba(255,255,255,0)'],
      ]);
    }
    return k.c;
  },
  bubble: () => {
    const k = canvas(128, 128);
    if (!k) return null;
    const { g } = k;
    radial(g, 64, 64, 62, [
      [0, 'rgba(255,255,255,0.04)'],
      [0.7, 'rgba(255,255,255,0.12)'],
      [0.9, 'rgba(255,255,255,0.75)'],
      [0.96, 'rgba(255,255,255,0.35)'],
      [1, 'rgba(255,255,255,0)'],
    ]);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(64, 64, 46, Math.PI * 1.08, Math.PI * 1.42);
    g.stroke();
    return k.c;
  },
  star: () => {
    const k = canvas(56, 56);
    if (!k) return null;
    const { g } = k;
    radial(g, 28, 28, 28, [[0, 'rgba(255,240,170,0.55)'], [1, 'rgba(255,200,80,0)']]);
    star(g, 28, 29, 20, 9, 5);
    g.lineJoin = 'round';
    g.lineWidth = 4;
    g.strokeStyle = '#5a2a08';
    g.stroke();
    const fill = g.createLinearGradient(0, 10, 0, 48);
    fill.addColorStop(0, '#fff6b8');
    fill.addColorStop(0.45, '#ffd640');
    fill.addColorStop(1, '#f08a14');
    g.fillStyle = fill;
    g.fill();
    star(g, 26, 25, 7, 3.2, 5);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fill();
    return k.c;
  },
  barFrame: () => frameCanvas(false),
  barFrameGold: () => frameCanvas(true),
  barFill: () => {
    const k = canvas(4, 32);
    if (!k) return null;
    const grd = k.g.createLinearGradient(0, 0, 0, 32);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.3, '#f2f2f2');
    grd.addColorStop(0.55, '#d0d0d0');
    grd.addColorStop(1, '#8c8c8c');
    k.g.fillStyle = grd;
    k.g.fillRect(0, 0, 4, 32);
    return k.c;
  },
  barGloss: () => {
    const k = canvas(4, 32);
    if (!k) return null;
    const grd = k.g.createLinearGradient(0, 0, 0, 32);
    grd.addColorStop(0, 'rgba(255,255,255,0.7)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.18)');
    grd.addColorStop(0.5, 'rgba(255,255,255,0)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    k.g.fillStyle = grd;
    k.g.fillRect(0, 0, 4, 32);
    return k.c;
  },
};

/** 血条外框：深色槽 + 一圈描边，金框给大个子。九宫切 BAR_SLICE */
export const BAR_SLICE = 8;

function frameCanvas(gold: boolean): HTMLCanvasElement | null {
  const k = canvas(32, 24);
  if (!k) return null;
  const { g } = k;
  roundRect(g, 0.5, 0.5, 31, 23, 7);
  g.fillStyle = gold ? '#3a1d08' : '#140b08';
  g.fill();
  if (gold) {
    const rim = g.createLinearGradient(0, 0, 0, 24);
    rim.addColorStop(0, '#ffe7a0');
    rim.addColorStop(0.5, '#d9a441');
    rim.addColorStop(1, '#7a4a14');
    g.strokeStyle = rim;
    g.lineWidth = 2.5;
  } else {
    g.strokeStyle = 'rgba(10,5,3,0.95)';
    g.lineWidth = 1.5;
  }
  roundRect(g, 1.25, 1.25, 29.5, 21.5, 6.5);
  g.stroke();
  // 槽底一点内阴影，条才像嵌进去
  const inner = g.createLinearGradient(0, 3, 0, 21);
  inner.addColorStop(0, 'rgba(0,0,0,0.55)');
  inner.addColorStop(0.4, 'rgba(0,0,0,0)');
  inner.addColorStop(1, 'rgba(255,255,255,0.08)');
  roundRect(g, 3, 3, 26, 18, 4);
  g.fillStyle = inner;
  g.fill();
  return k.c;
}

export function primTex(name: string): PIXI.Texture | null {
  const key = name as PrimName;
  if (!(key in PAINT)) return null;
  if (cache.has(key)) return cache.get(key) ?? null;
  let t: PIXI.Texture | null = null;
  const c = PAINT[key]();
  if (c) {
    try {
      t = PIXI.Texture.from(c);
    } catch {
      t = null;
    }
  }
  cache.set(key, t);
  return t;
}

/** 底件按旧贴纸宽度换算的倍数。不是底件返回 1 */
export function primScale(name: string, t: PIXI.Texture): number {
  const nominal = PRIM_NOMINAL[name as PrimName];
  return nominal ? nominal / Math.max(1, t.width) : 1;
}
