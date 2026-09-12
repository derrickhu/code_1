/**
 * 摊位弹子。对标 Angry Birds / 弹珠台：头是石头，轨迹跟重力，影子钉在地上。
 * 不沿速度拉成一条，不转整颗（那是导弹）。石头自己翻滚，拖尾只是土屑。
 */
import * as PIXI from 'pixi.js';
import { TweenManager, Ease } from '@/core/TweenManager';
import { projTex } from '@/core/TextureLoader';
import { VfxKit } from '@/fx/VfxKit';
import { safeDestroy } from '@/utils/safeDestroy';

const G = 2400;
const G_HOP = 1600;
const GRIT = 0x8a6a48;
const STONE = 48;

export interface PebbleFlight {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  T: number;
  vx: number;
  vy: number;
  g: number;
}

export function planPebble(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  hop = false,
): PebbleFlight {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const T = hop
    ? Math.min(0.32, Math.max(0.18, dist / 900))
    : Math.min(0.58, Math.max(0.40, dist / 680));
  const g = hop ? G_HOP : G;
  return {
    x0, y0, x1, y1, T, g,
    vx: (x1 - x0) / T,
    vy: (y1 - y0) / T - 0.5 * g * T,
  };
}

export function pebbleAt(f: PebbleFlight, t: number): {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ang: number;
  speed: number;
} {
  const u = Math.max(0, Math.min(f.T, t));
  const vx = f.vx;
  const vy = f.vy + f.g * u;
  return {
    x: f.x0 + f.vx * u,
    y: f.y0 + f.vy * u + 0.5 * f.g * u * u,
    vx,
    vy,
    ang: Math.atan2(vy, vx),
    speed: Math.hypot(vx, vy),
  };
}

/** 弦中点上方的抬升。重力抛物线一定比直线高，才像甩出去。 */
export function pebbleLoft(f: PebbleFlight): number {
  const mid = pebbleAt(f, f.T * 0.5);
  const ly = f.y0 + (f.y1 - f.y0) * 0.5;
  return ly - mid.y;
}

/** 影子钉在抛物线正下方的货架/地面，飞得越高越小越淡。 */
export function pebbleShadow(f: PebbleFlight, t: number): {
  x: number;
  y: number;
  sx: number;
  sy: number;
  alpha: number;
} {
  const p = pebbleAt(f, t);
  const u = f.T <= 0 ? 1 : Math.max(0, Math.min(1, t / f.T));
  const railY = f.y0 + (f.y1 - f.y0) * u;
  const air = Math.max(0, railY - p.y);
  const k = Math.max(0, Math.min(1, 1 - air / 220));
  return {
    x: p.x + 8,
    y: railY + 18,
    sx: 0.52 + 0.58 * k,
    sy: 0.42 + 0.38 * k,
    alpha: 0.14 + 0.26 * k,
  };
}

export function playPebbleShot(opts: {
  parent: PIXI.Container;
  kit: VfxKit;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  hop?: boolean;
  onLand: () => void;
}): PebbleFlight {
  const flight = planPebble(opts.x0, opts.y0, opts.x1, opts.y1, !!opts.hop);
  const shadow = makeShadow();
  const root = new PIXI.Container();
  root.eventMode = 'none';
  const body = makeStone();
  root.addChild(body);
  opts.parent.addChild(shadow, root);

  const leave = pebbleAt(flight, 0);
  placeShadow(shadow, pebbleShadow(flight, 0));
  opts.kit.spray(opts.x0, opts.y0, {
    n: 5,
    tint: GRIT,
    kind: 'spark',
    speed: 70,
    life: 0.22,
    gy: 460,
    scale: 0.14,
    add: false,
    dir: leave.ang,
    spread: 1.0,
  });

  const omega = 8.5 * (leave.vx >= 0 ? 1 : -1);
  let ghostAt = 0;
  let lastU = 0;
  const hold = { t: 0 };
  TweenManager.to({
    target: hold,
    props: { t: 1 },
    duration: flight.T,
    ease: Ease.linear,
    onUpdate: () => {
      if (root.destroyed) return;
      const dt = Math.max(0, (hold.t - lastU) * flight.T);
      lastU = hold.t;
      const now = hold.t * flight.T;
      const p = pebbleAt(flight, now);
      root.position.set(p.x, p.y);
      if (!shadow.destroyed) placeShadow(shadow, pebbleShadow(flight, now));
      body.rotation += dt * omega;
      if (hold.t - ghostAt > 0.07) {
        ghostAt = hold.t;
        stampDust(opts.parent, p.x, p.y + 6);
      }
    },
    onComplete: () => {
      const p = pebbleAt(flight, flight.T);
      if (!root.destroyed) {
        root.position.set(p.x, p.y);
        const smash = { x: 1.06, y: 0.92 };
        body.scale.set(smash.x, smash.y);
        TweenManager.to({
          target: smash,
          props: { x: 1, y: 1 },
          duration: 0.1,
          ease: Ease.easeOutQuad,
          onUpdate: () => {
            if (!body.destroyed) body.scale.set(smash.x, smash.y);
          },
        });
      }
      if (!shadow.destroyed) placeShadow(shadow, pebbleShadow(flight, flight.T));
      opts.kit.spray(p.x, p.y, {
        n: 8,
        tint: GRIT,
        kind: 'spark',
        speed: 130,
        life: 0.32,
        gy: 400,
        scale: 0.16,
        add: false,
      });
      opts.onLand();
      const landShadow = pebbleShadow(flight, flight.T);
      const fade = { a: 1 };
      TweenManager.to({
        target: fade,
        props: { a: 0 },
        duration: 0.34,
        ease: Ease.easeInQuad,
        onUpdate: () => {
          if (!root.destroyed) root.alpha = fade.a;
          if (!shadow.destroyed) shadow.alpha = landShadow.alpha * fade.a;
        },
        onComplete: () => {
          safeDestroy(root, { children: true });
          safeDestroy(shadow);
        },
      });
    },
  });
  return flight;
}

function makeShadow(): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.eventMode = 'none';
  g.beginFill(0x1a0c08, 0.22).drawEllipse(0, 0, 20, 8).endFill();
  g.beginFill(0x1a0c08, 0.36).drawEllipse(0, -1, 12, 5).endFill();
  return g;
}

function placeShadow(
  shadow: PIXI.Graphics,
  s: { x: number; y: number; sx: number; sy: number; alpha: number },
): void {
  shadow.position.set(s.x, s.y);
  shadow.scale.set(s.sx, s.sy);
  shadow.alpha = s.alpha;
}

function makeStone(): PIXI.Container {
  const box = new PIXI.Container();
  const tex = projTex('pebble');
  if (tex?.baseTexture.valid && tex.width > 1) {
    const spr = new PIXI.Sprite(tex);
    spr.anchor.set(0.5);
    spr.blendMode = PIXI.BLEND_MODES.NORMAL;
    spr.scale.set(STONE / Math.max(tex.width, tex.height));
    box.addChild(spr);
    return box;
  }
  const g = new PIXI.Graphics();
  paintRiverStone(g, STONE * 0.48);
  box.addChild(g);
  return box;
}

/** 河卵石：不规则、粗描边、两档色、麻点。圆球看起来像弹珠不是石头。 */
export function paintRiverStone(g: PIXI.Graphics, r: number): void {
  const hull = [
    -r * 0.98, -r * 0.22,
    -r * 0.52, -r * 0.92,
    r * 0.08, -r * 0.86,
    r * 0.94, -r * 0.18,
    r * 0.82, r * 0.48,
    r * 0.12, r * 0.96,
    -r * 0.58, r * 0.78,
    -r * 1.02, r * 0.16,
  ];
  const rim = hull.map((v) => v * 1.08);
  g.beginFill(0x1a120c).drawPolygon(rim).endFill();
  g.beginFill(0x8a7a54).drawPolygon(hull).endFill();
  g.beginFill(0x5a4c34).drawPolygon([
    -r * 0.72, r * 0.08,
    r * 0.62, r * 0.18,
    r * 0.12, r * 0.92,
    -r * 0.5, r * 0.7,
  ]).endFill();
  g.beginFill(0xd8c8a0).drawEllipse(-r * 0.12, -r * 0.32, r * 0.32, r * 0.2).endFill();
  g.beginFill(0xc4b48a, 0.7).drawEllipse(r * 0.28, -r * 0.08, r * 0.16, r * 0.1).endFill();
  g.beginFill(0x3a2e1c).drawCircle(-r * 0.22, r * 0.12, 1.5).endFill();
  g.beginFill(0x3a2e1c).drawCircle(r * 0.3, r * 0.06, 1.2).endFill();
  g.beginFill(0x3a2e1c).drawCircle(r * 0.02, r * 0.4, 1.3).endFill();
}

function stampDust(parent: PIXI.Container, x: number, y: number): void {
  const dust = new PIXI.Graphics();
  dust.beginFill(0x6a4e32, 0.5).drawEllipse(0, 0, 4.2, 2.2).endFill();
  dust.beginFill(0x3a2a18, 0.4).drawCircle(3, 1, 1.5).endFill();
  dust.position.set(x, y);
  dust.eventMode = 'none';
  parent.addChild(dust);
  const hold = { a: 0.55, s: 1 };
  TweenManager.to({
    target: hold,
    props: { a: 0, s: 1.35 },
    duration: 0.2,
    ease: Ease.easeOutQuad,
    onUpdate: () => {
      if (dust.destroyed) return;
      dust.alpha = hold.a;
      dust.scale.set(hold.s, hold.s * 0.7);
    },
    onComplete: () => safeDestroy(dust),
  });
}
