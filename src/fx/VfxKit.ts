/**
 * 2D 动作常用特效层：黑底发光贴图 + ADD 叠加 + 粒子池。
 * 不每帧重画几何，贴图没就绪时用 glow 核顶上，不挡玩。
 */
import * as PIXI from 'pixi.js';
import { vfxFlipFrames, vfxSparkFrame, vfxTex } from '@/core/TextureLoader';
import { VFX_FLIP, flipLife, flipFrameIndex } from '@/fx/Flipbook';

const MAX_P = 96;
const MAX_PLATE = 36;

interface Particle {
  spr: PIXI.Sprite;
  life: number;
  max: number;
  vx: number;
  vy: number;
  vr: number;
  drag: number;
  gy: number;
  sx0: number;
  sx1: number;
  sy0: number;
  sy1: number;
  a0: number;
  a1: number;
  faceVel: boolean;
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
  frames: PIXI.Texture[] | null;
  fps: number;
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
      if (p.faceVel) p.spr.rotation = Math.atan2(p.vy, p.vx);
      else p.spr.rotation += p.vr * dt;
      p.spr.scale.set(
        p.sx0 + (p.sx1 - p.sx0) * t,
        p.sy0 + (p.sy1 - p.sy0) * t,
      );
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
      if (p.frames && p.frames.length > 1) {
        const elapsed = p.max - p.life;
        const idx = flipFrameIndex(elapsed, p.fps, p.frames.length);
        const frame = p.frames[idx];
        if (frame && p.spr.texture !== frame) p.spr.texture = frame;
        const hold = t < 0.78 ? 1 : 1 - (t - 0.78) / 0.22;
        p.spr.alpha = p.a0 * Math.max(0, hold);
        p.spr.scale.set(p.s0 + (p.s1 - p.s0) * e, p.sy0 + (p.sy1 - p.sy0) * e);
      } else {
        p.spr.scale.set(p.s0 + (p.s1 - p.s0) * e, p.sy0 + (p.sy1 - p.sy0) * e);
        p.spr.alpha = p.a0 + (p.a1 - p.a0) * t;
      }
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
      add?: boolean;
    } = {},
  ): void {
    const frames = vfxFlipFrames(name);
    const spec = VFX_FLIP[name];
    const tex = frames?.[0] ?? vfxTex(name) ?? vfxTex('glow');
    if (!tex) return;
    if (this._plates.length >= MAX_PLATE) {
      const old = this._plates.shift();
      if (old) this._recycle(old.spr);
    }
    const spr = this._take(tex, opts.add !== false);
    spr.position.set(x, y);
    spr.rotation = opts.rot ?? 0;
    spr.tint = opts.tint ?? 0xffffff;
    let s0 = opts.s0 ?? 0.55;
    let s1 = opts.s1 ?? 1.05;
    let sy0 = opts.sy0 ?? s0;
    let sy1 = opts.sy1 ?? s1;
    let life = opts.life ?? 0.22;
    if (frames && frames.length > 1 && spec) {
      life = Math.max(life, flipLife(frames.length, spec.fps));
      const mid = (s0 + s1) / 2;
      // 格子留了黑边，略放大；几乎不缩放，靠帧在动
      s0 = mid * 1.55;
      s1 = mid * 1.68;
      sy0 = (opts.sy0 ?? mid) * 1.55;
      sy1 = (opts.sy1 ?? mid) * 1.68;
    }
    spr.scale.set(s0, sy0);
    spr.alpha = opts.a0 ?? 1;
    this._plates.push({
      spr,
      life,
      max: life,
      vr: frames && frames.length > 1 ? (opts.vr ?? 0) * 0.15 : opts.vr ?? 0,
      s0,
      s1,
      sy0,
      sy1,
      a0: opts.a0 ?? 1,
      a1: opts.a1 ?? 0,
      frames: frames && frames.length > 1 ? frames : null,
      fps: spec?.fps ?? 20,
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
      add?: boolean;
    } = {},
  ): void {
    const kind = opts.kind ?? 'spark';
    const n = opts.n ?? 10;
    const speed = opts.speed ?? 220;
    const life = opts.life ?? 0.28;
    const spread = opts.spread ?? Math.PI * 2;
    const base = opts.dir ?? 0;
    const stretch = kind !== 'glow';
    for (let i = 0; i < n; i += 1) {
      if (this._ps.length >= MAX_P) {
        const old = this._ps.shift();
        if (old) this._recycle(old.spr);
      }
      const tex = (kind === 'spark' ? vfxSparkFrame() : vfxTex(kind)) ?? vfxTex('glow');
      if (!tex) continue;
      const a = base + (Math.random() - 0.5) * spread;
      const v = speed * (0.45 + Math.random() * 0.7);
      const spr = this._take(tex, opts.add !== false);
      spr.position.set(x, y);
      spr.rotation = a;
      spr.tint = opts.tint ?? 0xfff1c2;
      const s = (opts.scale ?? 0.35) * (0.6 + Math.random() * 0.7);
      const along = stretch ? s * (1.25 + Math.min(1.5, v / 240)) : s;
      const across = stretch ? s * 0.32 : s;
      spr.scale.set(along, across);
      this._ps.push({
        spr,
        life: life * (0.7 + Math.random() * 0.5),
        max: life,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vr: stretch ? 0 : (Math.random() - 0.5) * 8,
        drag: 2.4,
        gy: opts.gy ?? 80,
        sx0: along,
        sx1: along * 0.35,
        sy0: across,
        sy1: across * 0.2,
        a0: 0.95,
        a1: 0,
        faceVel: stretch,
      });
    }
  }

  puff(x: number, y: number, tint: number, scale = 0.7): void {
    this.plate('glow', x, y, { tint, s0: scale * 0.22, s1: scale * 0.7, life: 0.12, a0: 0.75, a1: 0 });
  }

  ring(x: number, y: number, tint: number, life = 0.2): void {
    this.plate('ring', x, y, { tint, s0: 0.1, s1: 0.36, life, a0: 0.8, a1: 0 });
  }

  /** 出手拖尾：头亮尾淡，飞出去的那条带子 */
  ribbon(x: number, y: number, ang: number, tint: number, wide = 0.55): void {
    this.plate('streak', x, y, {
      tint,
      rot: ang,
      life: 0.18,
      s0: wide,
      s1: wide * 1.55,
      sy0: 0.22,
      sy1: 0.1,
      a0: 0.92,
    });
    this.plate('glow', x, y, {
      tint,
      life: 0.12,
      s0: wide * 0.35,
      s1: wide * 0.7,
      a0: 0.7,
    });
  }

  /** 贯穿光柱：从出手点铺到落点，电线 / 飞碟用 */
  beam(x0: number, y0: number, x1: number, y1: number, tint: number, life = 0.2): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ang = Math.atan2(dy, dx);
    this.plate('pierce', (x0 + x1) / 2, (y0 + y1) / 2, {
      tint,
      rot: ang,
      life,
      s0: Math.min(2.4, len / 90),
      s1: Math.min(2.8, len / 80),
      sy0: 0.42,
      sy1: 0.22,
      a0: 0.95,
    });
    this.plate('streak', (x0 + x1) / 2, (y0 + y1) / 2, {
      tint: 0xffffff,
      rot: ang,
      life: life * 0.7,
      s0: Math.min(2.1, len / 100),
      s1: Math.min(2.4, len / 90),
      sy0: 0.16,
      sy1: 0.08,
      a0: 0.85,
    });
  }

  /** 落点：星爆核 + 火星。不用软光圈当底，那种圆太假 */
  burst(x: number, y: number, tint: number, scale = 1): void {
    this.plate('flash', x, y, { tint, s0: 0.16 * scale, s1: 0.36 * scale, life: 0.1, a0: 0.85 });
    this.plate('glow', x, y, { tint, s0: 0.1 * scale, s1: 0.26 * scale, life: 0.08, a0: 0.55 });
    this.spray(x, y, { n: Math.max(3, Math.round(6 * scale)), tint, kind: 'spark', speed: 140 * scale, life: 0.16, scale: 0.18 });
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

  private _take(tex: PIXI.Texture, add = true): PIXI.Sprite {
    const spr = this._pool.pop() ?? new PIXI.Sprite(tex);
    spr.texture = tex;
    spr.visible = true;
    spr.alpha = 1;
    spr.scale.set(1);
    spr.rotation = 0;
    spr.anchor.set(0.5);
    spr.blendMode = add ? PIXI.BLEND_MODES.ADD : PIXI.BLEND_MODES.NORMAL;
    spr.tint = 0xffffff;
    this.root.addChild(spr);
    return spr;
  }

  private _recycle(spr: PIXI.Sprite): void {
    spr.visible = false;
    spr.parent?.removeChild(spr);
    if (this._pool.length < 110) this._pool.push(spr);
    else spr.destroy();
  }
}
