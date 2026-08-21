/**
 * 2D 动作常用特效层：黑底发光贴图 + ADD 叠加 + 粒子池。
 * 不每帧重画几何，贴图没就绪时用 glow 核顶上，不挡玩。
 */
import * as PIXI from 'pixi.js';
import { vfxTex } from '@/core/TextureLoader';

const MAX_P = 72;
const MAX_PLATE = 20;

interface Particle {
  spr: PIXI.Sprite;
  life: number;
  max: number;
  vx: number;
  vy: number;
  vr: number;
  drag: number;
  gy: number;
  s0: number;
  s1: number;
  a0: number;
  a1: number;
}

interface Plate {
  spr: PIXI.Sprite;
  life: number;
  max: number;
  vr: number;
  s0: number;
  s1: number;
  sy0: number;
  sy1: number;
  a0: number;
  a1: number;
}

export class VfxKit {
  readonly root = new PIXI.Container();
  private readonly _pool: PIXI.Sprite[] = [];
  private readonly _ps: Particle[] = [];
  private readonly _plates: Plate[] = [];

  reset(): void {
    for (const p of this._ps) this._recycle(p.spr);
    for (const p of this._plates) this._recycle(p.spr);
    this._ps.length = 0;
    this._plates.length = 0;
  }

  update(dt: number): void {
    for (let i = this._ps.length - 1; i >= 0; i -= 1) {
      const p = this._ps[i];
      if (!p) continue;
      p.life -= dt;
      const t = 1 - Math.max(0, p.life) / p.max;
      p.spr.x += p.vx * dt;
      p.spr.y += p.vy * dt;
      p.vy += p.gy * dt;
      p.vx *= 1 - p.drag * dt;
      p.vy *= 1 - p.drag * dt;
      p.spr.rotation += p.vr * dt;
      const s = p.s0 + (p.s1 - p.s0) * t;
      p.spr.scale.set(s);
      p.spr.alpha = p.a0 + (p.a1 - p.a0) * t;
      if (p.life <= 0) {
        this._recycle(p.spr);
        this._ps.splice(i, 1);
      }
    }
    for (let i = this._plates.length - 1; i >= 0; i -= 1) {
      const p = this._plates[i];
      if (!p) continue;
      p.life -= dt;
      const t = 1 - Math.max(0, p.life) / p.max;
      const e = 1 - (1 - t) * (1 - t);
      p.spr.rotation += p.vr * dt;
      p.spr.scale.set(p.s0 + (p.s1 - p.s0) * e, p.sy0 + (p.sy1 - p.sy0) * e);
      p.spr.alpha = p.a0 + (p.a1 - p.a0) * t;
      if (p.life <= 0) {
        this._recycle(p.spr);
        this._plates.splice(i, 1);
      }
    }
  }

  plate(
    name: string,
    x: number,
    y: number,
    opts: {
      tint?: number;
      rot?: number;
      vr?: number;
      life?: number;
      s0?: number;
      s1?: number;
      sy0?: number;
      sy1?: number;
      a0?: number;
      a1?: number;
    } = {},
  ): void {
    const tex = vfxTex(name) ?? vfxTex('glow');
    if (!tex) return;
    if (this._plates.length >= MAX_PLATE) {
      const old = this._plates.shift();
      if (old) this._recycle(old.spr);
    }
    const spr = this._take(tex);
    spr.position.set(x, y);
    spr.rotation = opts.rot ?? 0;
    spr.tint = opts.tint ?? 0xffffff;
    const s0 = opts.s0 ?? 0.55;
    const s1 = opts.s1 ?? 1.05;
    spr.scale.set(s0);
    spr.alpha = opts.a0 ?? 1;
    this._plates.push({
      spr,
      life: opts.life ?? 0.22,
      max: opts.life ?? 0.22,
      vr: opts.vr ?? 0,
      s0,
      s1,
      sy0: opts.sy0 ?? s0,
      sy1: opts.sy1 ?? s1,
      a0: opts.a0 ?? 1,
      a1: opts.a1 ?? 0,
    });
  }

  spray(
    x: number,
    y: number,
    opts: {
      n?: number;
      tint?: number;
      kind?: 'glow' | 'spark' | 'streak';
      speed?: number;
      life?: number;
      gy?: number;
      scale?: number;
      dir?: number;
      spread?: number;
    } = {},
  ): void {
    const tex = vfxTex(opts.kind ?? 'spark') ?? vfxTex('glow');
    if (!tex) return;
    const n = opts.n ?? 10;
    const speed = opts.speed ?? 220;
    const life = opts.life ?? 0.28;
    const spread = opts.spread ?? Math.PI * 2;
    const base = opts.dir ?? 0;
    for (let i = 0; i < n; i += 1) {
      if (this._ps.length >= MAX_P) {
        const old = this._ps.shift();
        if (old) this._recycle(old.spr);
      }
      const a = base + (Math.random() - 0.5) * spread;
      const v = speed * (0.45 + Math.random() * 0.7);
      const spr = this._take(tex);
      spr.position.set(x, y);
      spr.rotation = a;
      spr.tint = opts.tint ?? 0xfff1c2;
      const s = (opts.scale ?? 0.35) * (0.6 + Math.random() * 0.7);
      spr.scale.set(s);
      this._ps.push({
        spr,
        life: life * (0.7 + Math.random() * 0.5),
        max: life,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vr: (Math.random() - 0.5) * 8,
        drag: 2.4,
        gy: opts.gy ?? 80,
        s0: s,
        s1: s * 0.2,
        a0: 0.95,
        a1: 0,
      });
    }
  }

  puff(x: number, y: number, tint: number, scale = 0.7): void {
    this.plate('glow', x, y, { tint, s0: scale * 0.4, s1: scale * 1.6, life: 0.16, a0: 0.9, a1: 0 });
  }

  ring(x: number, y: number, tint: number, life = 0.28): void {
    this.plate('ring', x, y, { tint, s0: 0.25, s1: 1.8, life, a0: 0.95, a1: 0 });
  }

  /** 挥击弧：沿贝塞尔铺一串拖尾，锤子才读得出「抡」 */
  arc(x0: number, y0: number, x1: number, y1: number, tint: number): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const bulge = Math.min(72, len * 0.38);
    const cx = (x0 + x1) / 2 - (dy / len) * bulge;
    const cy = (y0 + y1) / 2 + (dx / len) * bulge;
    for (let i = 0; i < 7; i += 1) {
      const t = i / 6;
      const u = 1 - t;
      const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
      const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
      const tx = 2 * u * (cx - x0) + 2 * t * (x1 - cx);
      const ty = 2 * u * (cy - y0) + 2 * t * (y1 - cy);
      this.plate('streak', x, y, {
        tint,
        rot: Math.atan2(ty, tx),
        life: 0.14 + i * 0.018,
        s0: 0.22 + t * 0.18,
        s1: 0.5 + t * 0.25,
        sy0: 0.12,
        sy1: 0.2,
        a0: 0.75 - t * 0.15,
      });
    }
  }

  private _take(tex: PIXI.Texture): PIXI.Sprite {
    const spr = this._pool.pop() ?? new PIXI.Sprite(tex);
    spr.texture = tex;
    spr.visible = true;
    spr.alpha = 1;
    spr.scale.set(1);
    spr.rotation = 0;
    spr.anchor.set(0.5);
    spr.blendMode = PIXI.BLEND_MODES.NORMAL;
    spr.tint = 0xffffff;
    this.root.addChild(spr);
    return spr;
  }

  private _recycle(spr: PIXI.Sprite): void {
    spr.visible = false;
    spr.parent?.removeChild(spr);
    if (this._pool.length < 80) this._pool.push(spr);
    else spr.destroy();
  }
}
