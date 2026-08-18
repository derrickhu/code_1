/**
 * 观战层：近战挥砍、远程弹道、敌人爪击。不改战斗结果，只消费 BattleEvent。
 * 数字和命中音在弹着点才出，避免「线还没到、伤害已经跳了」。
 */
import * as PIXI from 'pixi.js';
import { playSfx } from '@/core/SfxPlayer';
import { isMeleeRole, type HeroRole } from '@/balance/heroes';
import type { BattleEvent } from '@/game/BattleEngine';

const MAX_FLOATS = 12;
const MAX_SHOTS = 16;

type ShotKind = 'bolt' | 'orb' | 'claw';

interface SweepBit {
  g: PIXI.Graphics;
  age: number;
  life: number;
  x: number;
  y: number;
  radius: number;
  color: number;
  done: boolean;
  land: () => void;
}

interface FloatBit {
  text: PIXI.Text;
  life: number;
  max: number;
  vy: number;
}

interface ShotBit {
  g: PIXI.Graphics;
  age: number;
  fly: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: number;
  kind: ShotKind;
  counter: boolean;
  crit: boolean;
  trail: { x: number; y: number }[];
  done: boolean;
  land: () => void;
}

type BurstStyle = 'hit' | 'shield' | 'heal' | 'vortex' | 'death' | 'leak';

interface BurstBit {
  g: PIXI.Graphics;
  life: number;
  max: number;
  x: number;
  y: number;
  color: number;
  counter: boolean;
  style: BurstStyle;
}

interface FlashBit {
  text: PIXI.Text;
  life: number;
}

interface PullBit {
  g: PIXI.Graphics;
  life: number;
  max: number;
  hx: number;
  hy: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class CombatFx {
  readonly layer = new PIXI.Container();
  private readonly _floats: FloatBit[] = [];
  private readonly _shots: ShotBit[] = [];
  private readonly _sweeps: SweepBit[] = [];
  private readonly _bursts: BurstBit[] = [];
  private readonly _flashes: FlashBit[] = [];
  private readonly _pulls: PullBit[] = [];
  private _firstHit = true;
  leakPulse = 0;
  landPulse = 0;
  private _meleeRadius = 72;

  reset(): void {
    this._firstHit = true;
    this.leakPulse = 0;
    this.landPulse = 0;
    for (const f of this._floats) f.text.destroy();
    for (const s of this._shots) s.g.destroy();
    for (const s of this._sweeps) s.g.destroy();
    for (const b of this._bursts) b.g.destroy();
    for (const s of this._flashes) s.text.destroy();
    for (const p of this._pulls) p.g.destroy();
    this._floats.length = 0;
    this._shots.length = 0;
    this._sweeps.length = 0;
    this._bursts.length = 0;
    this._flashes.length = 0;
    this._pulls.length = 0;
    this.layer.removeChildren();
  }

  consume(
    ev: BattleEvent,
    pos: {
      hx?: number;
      hy?: number;
      ex?: number;
      ey?: number;
      tx?: number;
      ty?: number;
      color?: number;
      role?: HeroRole;
      reachY?: number;
      meleeR?: number;
      baseY?: number;
      pulled?: { x0: number; y0: number; x1: number; y1: number }[];
      slowed?: boolean;
    },
  ): void {
    const color = pos.color ?? 0xffffff;
    if (pos.meleeR && pos.meleeR > 0) this._meleeRadius = pos.meleeR;
    if (ev.kind === 'hit' && pos.ex !== undefined && pos.ey !== undefined) {
      if (pos.hx !== undefined && pos.hy !== undefined) {
        this._spawnHeroAttack(ev, pos.hx, pos.hy, pos.ex, pos.ey, color, pos.role);
      } else {
        this._impactHero(ev, pos.ex, pos.ey, color);
      }
    }
    if (ev.kind === 'enemyHit' && pos.ex !== undefined && pos.ey !== undefined
      && pos.hx !== undefined && pos.hy !== undefined) {
      this._spawnClaw(ev, pos.ex, pos.ey, pos.hx, pos.hy);
    }
    if (ev.kind === 'enemyDown') playSfx('enemy_down', 100);
    if (ev.kind === 'leak') {
      this.leakPulse = 0.4;
      playSfx('leak', 80);
      if (pos.ex !== undefined && pos.ey !== undefined) {
        this._burst(pos.ex, pos.baseY ?? pos.ey + 40, 0xff5a5a, 0.28, 'leak');
      }
    }
    if (ev.kind === 'heroDown' && pos.hx !== undefined && pos.hy !== undefined) {
      this._burst(pos.hx, pos.hy, 0x9aa4bf, 0.32, 'death');
    }
    if (ev.kind === 'skill' && pos.hx !== undefined && pos.hy !== undefined) {
      this._skillCallout(ev, { hx: pos.hx, hy: pos.hy, tx: pos.tx, ty: pos.ty, pulled: pos.pulled });
    }
    if (ev.kind === 'hit' && pos.slowed && pos.ex !== undefined && pos.ey !== undefined) {
      this._spawnPlainFloat('减速', pos.ex, pos.ey + 10, 0x86efac, 16, 0.4);
    }
    if (ev.kind === 'hit' && ev.heal && ev.heal > 0 && pos.hx !== undefined && pos.hy !== undefined) {
      this._spawnPlainFloat(`+${Math.round(ev.heal)}`, pos.hx, pos.hy - 28, 0x86efac, 18, 0.4);
    }
  }

  markLand(): void {
    this.landPulse = 0.28;
    playSfx('hero_land', 0);
  }

  update(dt: number): void {
    this.leakPulse = Math.max(0, this.leakPulse - dt);
    this.landPulse = Math.max(0, this.landPulse - dt);

    for (let i = this._floats.length - 1; i >= 0; i -= 1) {
      const f = this._floats[i];
      if (!f) continue;
      f.life -= dt;
      f.text.y += f.vy * dt;
      f.text.alpha = Math.max(0, f.life / f.max);
      if (f.life <= 0) {
        f.text.destroy();
        this._floats.splice(i, 1);
      }
    }

    for (let i = this._shots.length - 1; i >= 0; i -= 1) {
      const s = this._shots[i];
      if (!s) continue;
      s.age += dt;
      const u = Math.min(1, s.age / s.fly);
      const p = this._point(s, easeOut(u));
      if (s.kind === 'bolt' || s.kind === 'orb') {
        s.trail.push(p);
        if (s.trail.length > 6) s.trail.shift();
      }
      this._drawShot(s, p, u);
      if (u >= 1 && !s.done) {
        s.done = true;
        s.land();
      }
      if (s.age >= s.fly + 0.04) {
        s.g.destroy();
        this._shots.splice(i, 1);
      }
    }

    for (let i = this._sweeps.length - 1; i >= 0; i -= 1) {
      const s = this._sweeps[i];
      if (!s) continue;
      s.age += dt;
      const u = Math.min(1, s.age / s.life);
      this._drawSweep(s, easeOut(u));
      if (u >= 1 && !s.done) {
        s.done = true;
        s.land();
      }
      if (s.age >= s.life + 0.04) {
        s.g.destroy();
        this._sweeps.splice(i, 1);
      }
    }

    for (let i = this._bursts.length - 1; i >= 0; i -= 1) {
      const b = this._bursts[i];
      if (!b) continue;
      b.life -= dt;
      this._drawBurst(b);
      if (b.life <= 0) {
        b.g.destroy();
        this._bursts.splice(i, 1);
      }
    }

    for (let i = this._flashes.length - 1; i >= 0; i -= 1) {
      const s = this._flashes[i];
      if (!s) continue;
      s.life -= dt;
      s.text.y -= 18 * dt;
      s.text.alpha = Math.max(0, s.life / 0.4);
      if (s.life <= 0) {
        s.text.destroy();
        this._flashes.splice(i, 1);
      }
    }

    for (let i = this._pulls.length - 1; i >= 0; i -= 1) {
      const p = this._pulls[i];
      if (!p) continue;
      p.life -= dt;
      this._drawPull(p);
      if (p.life <= 0) {
        p.g.destroy();
        this._pulls.splice(i, 1);
      }
    }
  }

  private _spawnPull(hx: number, hy: number, x0: number, y0: number, x1: number, y1: number): void {
    const g = new PIXI.Graphics();
    this.layer.addChild(g);
    this._pulls.push({ g, life: 0.4, max: 0.4, hx, hy, x0, y0, x1, y1 });
  }

  private _drawPull(p: PullBit): void {
    const g = p.g;
    g.clear();
    const t = 1 - Math.max(0, p.life) / p.max;
    const u = 1 - (1 - t) * (1 - t);
    const x = p.x0 + (p.x1 - p.x0) * u;
    const y = p.y0 + (p.y1 - p.y0) * u;
    const alpha = 1 - t * 0.35;
    g.lineStyle(6, 0x5ec8ff, 0.22 * alpha);
    g.moveTo(p.hx, p.hy);
    g.lineTo(x, y);
    g.lineStyle(2.4, 0xa5e8ff, 0.85 * alpha);
    g.moveTo(p.hx, p.hy);
    g.lineTo(x, y);
    g.lineStyle(0);
    g.beginFill(0x7dd3fc, 0.35 * alpha).drawCircle(x, y, 16 + t * 6).endFill();
    g.beginFill(0xffffff, 0.7 * alpha).drawCircle(x, y, 4).endFill();
  }

  private _spawnHeroAttack(
    ev: Extract<BattleEvent, { kind: 'hit' }>,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: number,
    role?: HeroRole,
  ): void {
    const melee = role ? isMeleeRole(role) : false;
    const tint = ev.counter === 'up' ? mix(color, 0x7dff9a, 0.45) : color;
    if (melee) {
      this._spawnSweep(x0, y0, tint, () => this._impactHero(ev, x1, y1, color));
      playSfx('atk', 90);
      return;
    }
    const kind: ShotKind = role === 'splash' ? 'orb' : 'bolt';
    this._pushShot({
      x0,
      y0,
      x1,
      y1,
      color: tint,
      kind,
      fly: kind === 'orb' ? 0.26 : 0.2,
      counter: ev.counter === 'up',
      crit: ev.crit,
      land: () => this._impactHero(ev, x1, y1, color),
    });
    this._burst(x0, y0, color, 0.08, 'hit');
    playSfx('atk', 90);
  }

  private _spawnSweep(x: number, y: number, color: number, land: () => void): void {
    if (this._sweeps.length >= 8) {
      const old = this._sweeps.shift();
      if (old && !old.done) old.land();
      old?.g.destroy();
    }
    const g = new PIXI.Graphics();
    this.layer.addChild(g);
    this._sweeps.push({
      g,
      age: 0,
      life: 0.12,
      x,
      y,
      radius: this._meleeRadius,
      color,
      done: false,
      land,
    });
  }

  private _spawnClaw(
    ev: Extract<BattleEvent, { kind: 'enemyHit' }>,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): void {
    this._pushShot({
      x0,
      y0,
      x1,
      y1,
      color: 0xff6b5a,
      kind: 'claw',
      fly: 0.09,
      counter: false,
      crit: false,
      land: () => {
        const through = ev.damage - ev.absorbed;
        if (ev.absorbed > 0) {
          this._spawnPlainFloat('抵挡', x1, y1 - 6, 0x7dd3fc, 18, 0.38);
          this._burst(x1, y1, 0x7dd3fc, 0.16, 'shield');
        }
        if (through > 0) {
          this._hurtHero(through, x1, y1);
          playSfx('hit', 70);
          this._burst(x1, y1, 0xff6b5a, 0.16, 'hit');
        }
        if (ev.reflect > 0) {
          this._burst(x0, y0, 0xff8a3a, 0.18, 'hit');
          this._spawnPlainFloat(`反伤 ${Math.round(ev.reflect)}`, x0, y0, 0xffb070, 20);
        }
      },
    });
  }

  private _pushShot(spec: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    color: number;
    kind: ShotKind;
    fly: number;
    counter: boolean;
    crit: boolean;
    land: () => void;
  }): void {
    if (this._shots.length >= MAX_SHOTS) {
      const old = this._shots.shift();
      if (old && !old.done) old.land();
      old?.g.destroy();
    }
    const g = new PIXI.Graphics();
    this.layer.addChild(g);
    this._shots.push({
      g,
      age: 0,
      fly: spec.fly,
      x0: spec.x0,
      y0: spec.y0,
      x1: spec.x1,
      y1: spec.y1,
      color: spec.color,
      kind: spec.kind,
      counter: spec.counter,
      crit: spec.crit,
      trail: [{ x: spec.x0, y: spec.y0 }],
      done: false,
      land: spec.land,
    });
  }

  private _impactHero(ev: Extract<BattleEvent, { kind: 'hit' }>, x: number, y: number, color: number): void {
    this._spawnHitFloat(ev, x, y);
    playSfx(ev.counter === 'up' ? 'hit_counter' : 'hit', ev.counter === 'up' ? 50 : 80);
    this._burst(x, y, ev.counter === 'up' ? 0x7dff9a : color, ev.counter === 'up' ? 0.22 : 0.16, 'hit');
  }

  private _burst(x: number, y: number, color: number, life: number, style: BurstStyle): void {
    const g = new PIXI.Graphics();
    this.layer.addChild(g);
    this._bursts.push({
      g,
      life,
      max: life,
      x,
      y,
      color,
      counter: style === 'hit' && color === 0x7dff9a,
      style,
    });
  }

  private _skillCallout(
    ev: Extract<BattleEvent, { kind: 'skill' }>,
    pos: { hx: number; hy: number; tx?: number; ty?: number; pulled?: { x0: number; y0: number; x1: number; y1: number }[] },
  ): void {
    this._skillShape(ev.skillKind, pos);
    if (ev.skillKind === 'shield') {
      this._spawnPlainFloat(`+${Math.round(ev.amount ?? 0)} 护盾`, pos.hx, pos.hy - 40, 0x7dd3fc, 22, 0.55);
      return;
    }
    if (ev.skillKind === 'heal') {
      const x = pos.tx ?? pos.hx;
      const y = pos.ty ?? pos.hy;
      if ((ev.amount ?? 0) > 0) this._spawnPlainFloat(`+${Math.round(ev.amount ?? 0)}`, x, y - 24, 0x86efac, 22, 0.5);
      return;
    }
    if (ev.skillKind === 'vortex') {
      playSfx('skill', 160);
      if (pos.pulled) {
        for (const p of pos.pulled) {
          this._spawnPull(pos.hx, pos.hy, p.x0, p.y0, p.x1, p.y1);
          this._spawnPlainFloat('拉回', p.x0, p.y0 - 10, 0x7dd3fc, 20, 0.5);
        }
      }
      return;
    }
    this._spawnFlash(ev.skillName, pos.hx, pos.hy - 56);
    playSfx('skill', 160);
  }

  private _skillShape(
    kind: string,
    pos: { hx?: number; hy?: number; tx?: number; ty?: number; reachY?: number },
  ): void {
    const hx = pos.hx ?? 0;
    const hy = pos.hy ?? 0;
    if (kind === 'shield') this._burst(hx, hy, 0x7dd3fc, 0.36, 'shield');
    else if (kind === 'heal') this._burst(pos.tx ?? hx, pos.ty ?? hy, 0x86efac, 0.32, 'heal');
    else if (kind === 'vortex') this._burst(hx, hy, 0x5ec8ff, 0.42, 'vortex');
    else this._burst(hx, hy, 0xffd66b, 0.2, 'hit');
  }

  private _point(s: ShotBit, t: number): { x: number; y: number } {
    if (s.kind === 'orb') {
      const mx = (s.x0 + s.x1) / 2 + (s.y1 - s.y0) * 0.18;
      const my = (s.y0 + s.y1) / 2 - (s.x1 - s.x0) * 0.18;
      const u = 1 - t;
      return {
        x: u * u * s.x0 + 2 * u * t * mx + t * t * s.x1,
        y: u * u * s.y0 + 2 * u * t * my + t * t * s.y1,
      };
    }
    return {
      x: s.x0 + (s.x1 - s.x0) * t,
      y: s.y0 + (s.y1 - s.y0) * t,
    };
  }

  private _drawShot(s: ShotBit, p: { x: number; y: number }, u: number): void {
    const g = s.g;
    g.clear();
    if (u >= 1) return;
    const fade = u < 0.1 ? u / 0.1 : 1;
    if (s.kind === 'claw') {
      this._drawClaw(s, u, fade);
      return;
    }
    for (let i = 0; i < s.trail.length; i += 1) {
      const q = s.trail[i];
      if (!q) continue;
      const a = ((i + 1) / s.trail.length) * 0.35 * fade;
      const r = s.kind === 'orb' ? 5 + i : 2.2 + i * 0.7;
      g.beginFill(s.color, a).drawCircle(q.x, q.y, r).endFill();
    }
    if (s.kind === 'orb') this._drawOrb(s, p, fade);
    else this._drawBolt(s, p, fade);
  }

  private _drawBolt(s: ShotBit, p: { x: number; y: number }, fade: number): void {
    const ang = Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
    const nx = Math.cos(ang);
    const ny = Math.sin(ang);
    const px = -ny;
    const py = nx;
    const g = s.g;
    g.beginFill(s.color, 0.22 * fade).drawCircle(p.x, p.y, s.counter ? 16 : 12).endFill();
    g.beginFill(s.color, 0.95 * fade);
    g.moveTo(p.x + nx * 10, p.y + ny * 10);
    g.lineTo(p.x + px * 4.5, p.y + py * 4.5);
    g.lineTo(p.x - nx * 18, p.y - ny * 18);
    g.lineTo(p.x - px * 4.5, p.y - py * 4.5);
    g.closePath();
    g.endFill();
    g.beginFill(0xffffff, 0.92 * fade).drawCircle(p.x + nx * 2, p.y + ny * 2, s.crit ? 4.5 : 3.2).endFill();
  }

  private _drawOrb(s: ShotBit, p: { x: number; y: number }, fade: number): void {
    const g = s.g;
    g.beginFill(s.color, 0.18 * fade).drawCircle(p.x, p.y, 18).endFill();
    g.beginFill(s.color, 0.7 * fade).drawCircle(p.x, p.y, 8).endFill();
    g.beginFill(0xffffff, 0.9 * fade).drawCircle(p.x - 2, p.y - 2, 3.4).endFill();
  }

  /** 身前扇形挥砍：刀扫过一片区，不沿直线飞向目标。 */
  private _drawSweep(s: SweepBit, u: number): void {
    const g = s.g;
    g.clear();
    if (u >= 1) return;
    const fade = u < 0.12 ? u / 0.12 : u > 0.75 ? (1 - u) / 0.25 : 1;
    const start = -Math.PI * 0.92;
    const end = -Math.PI * 0.08;
    const cur = start + (end - start) * u;
    const r = s.radius;
    g.beginFill(s.color, 0.22 * fade);
    g.moveTo(s.x, s.y);
    g.arc(s.x, s.y, r, start, cur);
    g.lineTo(s.x, s.y);
    g.endFill();
    const edge = (width: number, color: number, alpha: number, a0: number, rad: number): void => {
      g.lineStyle(width, color, alpha);
      g.moveTo(s.x + Math.cos(a0) * rad, s.y + Math.sin(a0) * rad);
      g.arc(s.x, s.y, rad, a0, cur);
      g.lineStyle(0);
    };
    edge(10, s.color, 0.32 * fade, start, r);
    edge(5, s.color, 0.85 * fade, Math.max(start, cur - 0.5), r);
    edge(2.4, 0xffffff, 0.92 * fade, Math.max(start, cur - 0.26), r * 0.88);
    g.beginFill(0xffffff, 0.85 * fade)
      .drawCircle(s.x + Math.cos(cur) * r, s.y + Math.sin(cur) * r, 4)
      .endFill();
  }

  /** 敌人近身爪击：从怪身短扫到英雄，不飞远程弹。 */
  private _drawClaw(s: ShotBit, u: number, fade: number): void {
    const tip = this._point(s, u);
    const ang = Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
    const px = -Math.sin(ang);
    const py = Math.cos(ang);
    const g = s.g;
    for (const off of [-10, 0, 10]) {
      const sx = s.x0 + px * off * 0.35;
      const sy = s.y0 + py * off * 0.35;
      const ex = tip.x + px * off;
      const ey = tip.y + py * off;
      g.lineStyle(off === 0 ? 5 : 3.2, s.color, (off === 0 ? 0.85 : 0.45) * fade);
      g.moveTo(sx, sy);
      g.lineTo(ex, ey);
    }
    g.lineStyle(0);
    g.beginFill(0xffffff, 0.7 * fade).drawCircle(tip.x, tip.y, 2.8).endFill();
  }

  private _drawBurst(b: BurstBit): void {
    const g = b.g;
    g.clear();
    const t = 1 - Math.max(0, b.life) / b.max;
    const alpha = 1 - t;
    if (b.style === 'shield') {
      g.lineStyle(5, b.color, alpha * 0.9);
      g.drawCircle(b.x, b.y, 18 + t * 28);
      g.lineStyle(2, 0xffffff, alpha * 0.55);
      g.drawCircle(b.x, b.y, 12 + t * 18);
      g.lineStyle(0);
      return;
    }
    if (b.style === 'heal') {
      g.beginFill(b.color, alpha * 0.35).drawCircle(b.x, b.y, 10 + t * 16).endFill();
      g.lineStyle(4, b.color, alpha);
      g.moveTo(b.x, b.y - 12 - t * 6);
      g.lineTo(b.x, b.y + 12 + t * 6);
      g.moveTo(b.x - 10 - t * 4, b.y);
      g.lineTo(b.x + 10 + t * 4, b.y);
      g.lineStyle(0);
      return;
    }
    if (b.style === 'vortex') {
      g.lineStyle(4, b.color, alpha * 0.8);
      g.drawCircle(b.x, b.y, 16 + t * 54);
      g.lineStyle(2, 0xffffff, alpha * 0.45);
      g.drawCircle(b.x, b.y, 8 + t * 32);
      g.lineStyle(0);
      return;
    }
    if (b.style === 'death') {
      g.beginFill(0x0b0f18, alpha * 0.45).drawEllipse(b.x, b.y + 18, 28 + t * 8, 10).endFill();
      g.lineStyle(3, b.color, alpha);
      g.drawCircle(b.x, b.y, 10 + t * 20);
      g.lineStyle(0);
      return;
    }
    if (b.style === 'leak') {
      g.beginFill(b.color, alpha * 0.55).drawRect(b.x - 40, b.y - 4, 80, 8).endFill();
      g.beginFill(0xff9a9a, alpha * 0.35).drawEllipse(b.x, b.y, 50 + t * 30, 10).endFill();
      return;
    }
    const ring = 6 + t * (b.counter ? 36 : 24);
    g.lineStyle(b.counter ? 4 : 2.5, b.color, alpha * 0.9);
    g.drawCircle(b.x, b.y, ring);
    g.lineStyle(0);
    g.beginFill(0xffffff, alpha * (b.counter ? 0.55 : 0.35)).drawCircle(b.x, b.y, 3 + t * 8).endFill();
    const n = b.counter ? 8 : 5;
    for (let i = 0; i < n; i += 1) {
      const a = (Math.PI * 2 * i) / n + t * 0.4;
      const r0 = 4 + t * 6;
      const r1 = 10 + t * (b.counter ? 22 : 16);
      g.lineStyle(2, b.color, alpha);
      g.moveTo(b.x + Math.cos(a) * r0, b.y + Math.sin(a) * r0);
      g.lineTo(b.x + Math.cos(a) * r1, b.y + Math.sin(a) * r1);
    }
    g.lineStyle(0);
  }

  private _spawnHitFloat(ev: Extract<BattleEvent, { kind: 'hit' }>, x: number, y: number): void {
    const counter = ev.counter === 'up';
    const down = ev.counter === 'down';
    const first = this._firstHit;
    this._firstHit = false;
    const size = first ? 42 : counter ? 34 : down ? 18 : 24;
    const color = counter ? 0x5ecf7b : down ? 0x7a8194 : ev.crit ? 0xffd66b : 0xffffff;
    this._spawnPlainFloat(
      counter ? `克 ${Math.round(ev.damage)}` : String(Math.round(ev.damage)),
      x,
      y,
      color,
      size,
      first ? 0.7 : 0.45,
    );
  }

  private _hurtHero(damage: number, x: number, y: number): void {
    this._spawnPlainFloat(`-${Math.round(damage)}`, x, y - 8, 0xff7a7a, 22, 0.42);
  }

  private _spawnPlainFloat(
    msg: string,
    x: number,
    y: number,
    color: number,
    size: number,
    life = 0.45,
  ): void {
    if (this._floats.length >= MAX_FLOATS) {
      const old = this._floats.shift();
      old?.text.destroy();
    }
    const text = new PIXI.Text(msg, {
      fontFamily: 'sans-serif',
      fontSize: size,
      fontWeight: 'bold',
      fill: color,
      stroke: 0x0b0f18,
      strokeThickness: 4,
    });
    text.anchor.set(0.5);
    text.position.set(x + (Math.random() - 0.5) * 16, y - 18);
    this.layer.addChild(text);
    this._floats.push({ text, life, max: life, vy: -70 });
  }

  private _spawnFlash(name: string, x: number, y: number): void {
    const text = new PIXI.Text(name, {
      fontFamily: 'sans-serif',
      fontSize: 22,
      fontWeight: 'bold',
      fill: 0xffd66b,
      stroke: 0x0b0f18,
      strokeThickness: 4,
    });
    text.anchor.set(0.5);
    text.position.set(x, y);
    this.layer.addChild(text);
    this._flashes.push({ text, life: 0.4 });
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
