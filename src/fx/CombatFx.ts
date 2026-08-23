/**
 * 观战层。数字和命中音在弹着点才出。
 * 出手走贴图 + 粒子，不每帧重画几何。
 */
import * as PIXI from 'pixi.js';
import type { AttackFx, EnemyFx } from '@/balance/fx';
import { projSprite } from '@/balance/fx';
import { playSfx, buzz } from '@/core/SfxPlayer';
import { fillContain, projTex, vfxTex } from '@/core/TextureLoader';
import type { BattleEvent } from '@/game/BattleEngine';
import { VfxKit } from '@/fx/VfxKit';

const MAX_FLOATS = 18;
const MAX_SHOTS = 16;

type ShotKind = AttackFx | EnemyFx;

interface FloatBit {
  text: PIXI.Text;
  life: number;
  max: number;
  vy: number;
  pop: number;
}

interface ShotBit {
  body: PIXI.Graphics;
  spr: PIXI.Sprite | null;
  age: number;
  fly: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  kind: ShotKind;
  color: number;
  physical: boolean;
  emit: number;
  done: boolean;
  land: () => void;
}

interface FlashBit {
  text: PIXI.Text;
  life: number;
}

interface FlyBit {
  g: PIXI.Graphics;
  life: number;
  max: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  tex: PIXI.Texture | null;
}

export class CombatFx {
  readonly layer = new PIXI.Container();
  private readonly _kit = new VfxKit();
  private readonly _floats: FloatBit[] = [];
  private readonly _shots: ShotBit[] = [];
  private readonly _flashes: FlashBit[] = [];
  private readonly _flies: FlyBit[] = [];
  private _firstHit = true;
  downPulse = 0;
  landPulse = 0;
  hitStop = 0;
  private _meleeRadius = 72;
  private readonly _waits: { t: number; fn: () => void }[] = [];

  constructor() {
    this.layer.addChild(this._kit.root);
  }

  reset(): void {
    this._firstHit = true;
    this.downPulse = 0;
    this.landPulse = 0;
    this.hitStop = 0;
    this._kit.reset();
    for (const f of this._floats) f.text.destroy();
    for (const s of this._shots) {
      s.body.destroy();
      s.spr?.destroy();
    }
    for (const s of this._flashes) s.text.destroy();
    for (const f of this._flies) f.g.destroy();
    this._floats.length = 0;
    this._shots.length = 0;
    this._flashes.length = 0;
    this._flies.length = 0;
    this._waits.length = 0;
    this.layer.removeChildren();
    this.layer.addChild(this._kit.root);
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
      melee?: boolean;
      orb?: boolean;
      fx?: AttackFx;
      enemyFx?: EnemyFx;
      reachY?: number;
      meleeR?: number;
      baseY?: number;
      slowed?: boolean;
    },
  ): void {
    const color = pos.color ?? 0xffffff;
    if (pos.meleeR && pos.meleeR > 0) this._meleeRadius = pos.meleeR;
    if (ev.kind === 'hit' && pos.ex !== undefined && pos.ey !== undefined) {
      if (pos.hx !== undefined && pos.hy !== undefined) {
        this._spawnHeroAttack(ev, pos.hx, pos.hy, pos.ex, pos.ey, color, pos.fx, pos.melee, pos.orb);
      } else {
        this._impactHero(ev, pos.ex, pos.ey, color);
      }
    }
    if (ev.kind === 'enemyHit' && pos.ex !== undefined && pos.ey !== undefined
      && pos.hx !== undefined && pos.hy !== undefined) {
      this._spawnEnemyHit(ev, pos.ex, pos.ey, pos.hx, pos.hy, pos.enemyFx ?? 'claw');
    }
    if (ev.kind === 'enemyDown' && pos.ex !== undefined && pos.ey !== undefined) {
      this._death(pos.ex, pos.ey, 0xffb070);
      playSfx('kill_pop', 80);
      this.hitStop = Math.max(this.hitStop, 0.045);
    }
    if (ev.kind === 'heroDown' && pos.hx !== undefined && pos.hy !== undefined) {
      this.downPulse = 0.4;
      this._death(pos.hx, pos.hy, 0x9aa4bf);
      playSfx('hero_down', 0);
    }
    if (ev.kind === 'heroRevive' && pos.hx !== undefined && pos.hy !== undefined) {
      this._kit.plate('flash', pos.hx, pos.hy, { tint: 0xffd66b, s0: 0.5, s1: 1.2, life: 0.32 });
      this._kit.ring(pos.hx, pos.hy, 0xffd66b, 0.4);
      this._kit.spray(pos.hx, pos.hy, { n: 10, tint: 0xffe08a, kind: 'spark', speed: 160 });
      this._spawnPlainFloat('又站起来了', pos.hx, pos.hy - 46, 0xffd66b, 24, 0.7);
      playSfx('hero_land', 0);
    }
    if (ev.kind === 'install' && pos.hx !== undefined && pos.hy !== undefined) {
      this._kit.plate('flash', pos.hx, pos.hy, { tint: 0xffd66b, s0: 0.45, s1: 1.1, life: 0.28 });
      this._kit.ring(pos.hx, pos.hy, 0xffd66b, 0.36);
      this._kit.spray(pos.hx, pos.hy, { n: 8, tint: 0xffe08a, kind: 'spark', speed: 140 });
      playSfx('install_on', 0);
      buzz('medium');
    }
    if (ev.kind === 'skill' && pos.hx !== undefined && pos.hy !== undefined) {
      this._skillCallout(ev, { hx: pos.hx, hy: pos.hy, tx: pos.tx, ty: pos.ty });
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
    this.downPulse = Math.max(0, this.downPulse - dt);
    this.landPulse = Math.max(0, this.landPulse - dt);
    for (let i = this._waits.length - 1; i >= 0; i -= 1) {
      const w = this._waits[i];
      if (!w) continue;
      w.t -= dt;
      if (w.t <= 0) {
        w.fn();
        this._waits.splice(i, 1);
      }
    }
    this._kit.update(dt);

    for (let i = this._floats.length - 1; i >= 0; i -= 1) {
      const f = this._floats[i];
      if (!f) continue;
      f.life -= dt;
      f.text.y += f.vy * dt;
      const t = 1 - Math.max(0, f.life) / f.max;
      const pop = t < 0.18 ? f.pop * (1.35 - t / 0.18 * 0.35) : f.pop;
      f.text.scale.set(pop);
      f.text.alpha = t > 0.72 ? Math.max(0, (1 - t) / 0.28) : 1;
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
      const ang = Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
      this._drawShotBody(s, p, ang, u);
      if (s.spr) {
        s.spr.position.set(p.x, p.y);
        s.spr.rotation = ang;
        s.spr.alpha = u < 0.08 ? u / 0.08 : 1;
      }
      s.emit += dt;
      if (s.emit > 0.028 && u < 1 && !s.physical) {
        s.emit = 0;
        this._kit.spray(p.x, p.y, {
          n: 1,
          tint: s.color,
          kind: 'spark',
          speed: 50,
          life: 0.12,
          scale: 0.2,
          gy: 0,
          dir: ang + Math.PI,
          spread: 0.4,
        });
      }
      if (s.emit > 0.04 && u < 1 && s.physical && s.kind === 'sniper') {
        s.emit = 0;
        this._kit.spray(p.x, p.y, {
          n: 1,
          tint: 0xc4b59a,
          kind: 'glow',
          speed: 20,
          life: 0.1,
          scale: 0.12,
          gy: 40,
          dir: ang + Math.PI,
          spread: 0.3,
        });
      }
      if (u >= 1 && !s.done) {
        s.done = true;
        s.land();
      }
      if (s.age >= s.fly + 0.04) {
        s.body.destroy();
        s.spr?.destroy();
        this._shots.splice(i, 1);
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

    for (let i = this._flies.length - 1; i >= 0; i -= 1) {
      const f = this._flies[i];
      if (!f) continue;
      f.life -= dt;
      this._drawFly(f);
      if (f.life <= 0) {
        f.g.destroy();
        this._flies.splice(i, 1);
      }
    }

    // 粒子和爆点压在弹道上面
    this.layer.addChild(this._kit.root);
  }

  flyMod(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    tex: PIXI.Texture | null,
  ): void {
    const g = new PIXI.Graphics();
    this.layer.addChild(g);
    this._flies.push({ g, life: 0.38, max: 0.38, x0, y0, x1, y1, tex });
  }

  private _drawFly(f: FlyBit): void {
    const g = f.g;
    g.clear();
    const t = 1 - Math.max(0, f.life) / f.max;
    const u = 1 - (1 - t) * (1 - t);
    const x = f.x0 + (f.x1 - f.x0) * u;
    const y = f.y0 + (f.y1 - f.y0) * u - Math.sin(u * Math.PI) * 40;
    const s = 22 + (1 - u) * 10;
    g.beginFill(0xffd66b, 0.28).drawCircle(x, y, s).endFill();
    g.beginFill(0xfff4c4, 0.95).drawRoundedRect(x - 16, y - 16, 32, 32, 8).endFill();
    if (f.tex && f.tex.baseTexture.valid && f.tex.width > 1) {
      fillContain(g, f.tex, x, y + 12, 28, 28);
    }
    g.lineStyle(2, 0xc9a46a, 0.9).drawRoundedRect(x - 16, y - 16, 32, 32, 8).lineStyle(0);
  }

  private _spawnHeroAttack(
    ev: Extract<BattleEvent, { kind: 'hit' }>,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: number,
    fx?: AttackFx,
    melee?: boolean,
    orb?: boolean,
  ): void {
    const style: AttackFx = fx ?? (melee ? 'slash' : orb ? 'orb' : 'bolt');
    const tint = ev.crit ? mix(color, 0xffd66b, 0.45) : color;
    const land = (): void => this._impactHero(ev, x1, y1, color, style);
    playSfx(`atk_${style}`, 90);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const dist = Math.hypot(x1 - x0, y1 - y0);

    if (style === 'slash') {
      this._kit.plate('slash', x0, y0 - 8, { tint, rot: ang - 0.9, vr: 9, s0: 0.45, s1: 0.75, life: 0.14, a0: 0.7 });
      this._kit.spray(x0, y0, { n: 4, tint, kind: 'spark', speed: 140, dir: ang, spread: 1.0 });
      land();
      return;
    }
    if (style === 'saw') {
      this._kit.plate('saw', x0, y0 - 6, { tint: 0xffb070, vr: 16, s0: 0.4, s1: 0.7, life: 0.2, a0: 0.75 });
      this._kit.spray(x0, y0, { n: 6, tint: 0xffc078, kind: 'spark', speed: 160, dir: ang, spread: 1.2 });
      land();
      return;
    }
    if (style === 'smash') {
      const hx = x0 + (x1 - x0) * 0.72;
      const hy = y0 + (y1 - y0) * 0.72;
      this._kit.arc(x0, y0 - 18, hx, hy, 0xffe08a);
      this._waits.push({
        t: 0.22,
        fn: () => {
          this._kit.plate('smash', hx, hy, { tint: 0xffe08a, rot: ang, s0: 0.4, s1: 1.25, life: 0.22 });
          this._kit.ring(hx, hy, 0xffe08a, 0.24);
          this._kit.spray(hx, hy, { n: 8, tint: 0xffe08a, kind: 'spark', speed: 200, dir: ang, spread: 1.4 });
          land();
        },
      });
      return;
    }
    if (style === 'pierce') {
      this._kit.plate('pierce', (x0 + x1) / 2, (y0 + y1) / 2, {
        tint: 0x9be7ff,
        rot: ang,
        s0: 0.85,
        s1: 1.15,
        sy0: 0.4,
        sy1: 0.6,
        life: 0.18,
      });
      this._pushShot({ x0, y0, x1, y1, color: 0x9be7ff, kind: 'pierce', fly: 0.12, land });
      return;
    }

    const speed = style === 'sniper' ? 560 : style === 'poke' ? 480 : 420;
    const fly = Math.min(0.48, Math.max(0.2, dist / speed));
    this._pushShot({ x0, y0, x1, y1, color: tint, kind: style, fly, land });
  }

  private _spawnEnemyHit(
    ev: Extract<BattleEvent, { kind: 'enemyHit' }>,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    fx: EnemyFx,
  ): void {
    const color = fx === 'beam' ? 0xc084fc : fx === 'spark' ? 0xfb923c : fx === 'bash' ? 0xcbd5e1 : 0xff6b5a;
    playSfx(`enemy_${fx}`, 70);
    const ang = Math.atan2(y1 - y0, x1 - x0);
    if (fx === 'beam') {
      this._kit.plate('beam', (x0 + x1) / 2, (y0 + y1) / 2, {
        tint: color, rot: ang, s0: 0.55, s1: 0.9, life: 0.16,
      });
    } else if (fx === 'bash') {
      this._kit.plate('smash', x1, y1, { tint: color, s0: 0.3, s1: 0.75, life: 0.14 });
    } else if (fx === 'spark') {
      this._kit.plate('pierce', (x0 + x1) / 2, (y0 + y1) / 2, {
        tint: color, rot: ang, s0: 0.45, s1: 0.7, life: 0.12,
      });
    } else {
      this._kit.plate('claw', x1, y1, { tint: color, rot: ang, s0: 0.4, s1: 0.75, life: 0.14 });
    }
    this._pushShot({
      x0, y0, x1, y1, color, kind: fx, fly: fx === 'beam' ? 0.22 : 0.18,
      land: () => {
        const through = ev.damage - ev.absorbed;
        if (ev.absorbed > 0) {
          this._spawnPlainFloat('抵挡', x1, y1 - 6, 0x7dd3fc, 18, 0.38);
          this._kit.plate('shield', x1, y1, { tint: 0x7dd3fc, s0: 0.35, s1: 0.8, life: 0.22 });
        }
        if (through > 0) {
          this._hurtHero(through, x1, y1);
          playSfx('hit', 70);
          this._kit.spray(x1, y1, { n: 6, tint: 0xff6b5a, kind: 'spark', speed: 140 });
        }
        if (ev.reflect > 0) {
          this._kit.spray(x0, y0, { n: 5, tint: 0xff8a3a, kind: 'spark', speed: 120 });
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
    land: () => void;
  }): void {
    if (this._shots.length >= MAX_SHOTS) {
      const old = this._shots.shift();
      if (old && !old.done) old.land();
      old?.body.destroy();
      old?.spr?.destroy();
    }
    const physName = projSprite(spec.kind as AttackFx);
    const physical = !!physName;
    const tex = physical
      ? projTex(physName)
      : spec.kind === 'pierce' || spec.kind === 'beam' || spec.kind === 'spark'
        ? vfxTex('pierce')
        : spec.kind === 'claw' ? vfxTex('claw')
          : spec.kind === 'bash' ? vfxTex('smash')
            : null;
    let spr: PIXI.Sprite | null = null;
    if (tex) {
      spr = new PIXI.Sprite(tex);
      spr.anchor.set(0.5);
      if (!physical) spr.tint = spec.color;
      spr.position.set(spec.x0, spec.y0);
      const native = Math.max(tex.width, 1);
      const px = physical
        ? spec.kind === 'sniper' ? 28 : spec.kind === 'bolt' ? 42 : spec.kind === 'poke' ? 48 : 36
        : 64;
      spr.scale.set(px / native);
      this.layer.addChild(spr);
    }
    const body = new PIXI.Graphics();
    this.layer.addChild(body);
    this._shots.push({
      body,
      spr,
      age: 0,
      fly: spec.fly,
      x0: spec.x0,
      y0: spec.y0,
      x1: spec.x1,
      y1: spec.y1,
      kind: spec.kind,
      color: spec.color,
      physical,
      emit: 0,
      done: false,
      land: spec.land,
    });
  }

  private _drawShotBody(
    s: ShotBit,
    p: { x: number; y: number },
    ang: number,
    u: number,
  ): void {
    const g = s.body;
    g.clear();
    if (u >= 1) return;
    if (s.physical) return;
    const fade = u < 0.08 ? u / 0.08 : 1;
    const nx = Math.cos(ang);
    const ny = Math.sin(ang);
    if (s.kind === 'orb' || s.kind === 'wind') {
      const r = s.kind === 'wind' ? 20 : 15;
      g.beginFill(s.color, 0.28 * fade).drawCircle(p.x, p.y, r + 6).endFill();
      g.beginFill(s.color, 0.8 * fade).drawCircle(p.x, p.y, r * 0.45).endFill();
      g.beginFill(0xffffff, 0.95 * fade).drawCircle(p.x - 3, p.y - 3, 3.4).endFill();
      return;
    }
    if (s.kind === 'blast') {
      g.beginFill(0xff7a3a, 0.35 * fade).drawCircle(p.x, p.y, 16).endFill();
      g.beginFill(0xfff4c4, 0.95 * fade).drawCircle(p.x, p.y, 6).endFill();
      return;
    }
    const len = s.kind === 'sniper' ? 40 : s.kind === 'poke' || s.kind === 'pierce' || s.kind === 'beam' ? 34 : 26;
    g.lineStyle(12, s.color, 0.22 * fade);
    g.moveTo(p.x - nx * len, p.y - ny * len);
    g.lineTo(p.x + nx * 10, p.y + ny * 10);
    g.lineStyle(3.4, 0xffffff, 0.95 * fade);
    g.moveTo(p.x - nx * len * 0.75, p.y - ny * len * 0.75);
    g.lineTo(p.x + nx * 8, p.y + ny * 8);
    g.lineStyle(0);
    g.beginFill(0xffffff, fade).drawCircle(p.x, p.y, 4).endFill();
  }

  private _impactHero(
    ev: Extract<BattleEvent, { kind: 'hit' }>,
    x: number,
    y: number,
    color: number,
    fx: AttackFx = 'bolt',
  ): void {
    this._spawnHitFloat(ev, x, y);
    playSfx(ev.crit ? 'hit_counter' : `hit_${fx}`, ev.crit ? 50 : 80);
    const tint = ev.crit ? 0xffd66b : color;
    this._kit.plate('flash', x, y, { tint, s0: ev.crit ? 0.55 : 0.35, s1: ev.crit ? 1.15 : 0.8, life: 0.16 });
    if (fx === 'blast') this._kit.plate('blast', x, y, { tint: 0xff8a3a, s0: 0.45, s1: 1.1, life: 0.22 });
    if (fx === 'wind') this._kit.plate('wind', x, y, { tint: 0xc7f0ff, vr: 6, s0: 0.4, s1: 0.95, life: 0.24 });
    if (fx === 'smash') this._kit.ring(x, y, 0xffe08a, 0.2);
    this._kit.spray(x, y, {
      n: ev.crit ? 14 : 8,
      tint,
      kind: 'spark',
      speed: ev.crit ? 280 : 190,
      life: 0.26,
    });
    this.hitStop = Math.max(this.hitStop, ev.crit ? 0.08 : fx === 'smash' || fx === 'blast' ? 0.06 : 0.035);
    if (ev.crit || fx === 'smash' || fx === 'blast') buzz(ev.crit ? 'heavy' : 'medium');
  }

  private _death(x: number, y: number, tint: number): void {
    this._kit.plate('blast', x, y, { tint, s0: 0.4, s1: 1.2, life: 0.28 });
    this._kit.ring(x, y, tint, 0.3);
    this._kit.spray(x, y, { n: 16, tint, kind: 'spark', speed: 260, life: 0.34, gy: 40 });
    this._kit.spray(x, y, { n: 6, tint, kind: 'glow', speed: 90, life: 0.3, scale: 0.5, gy: 20 });
  }

  private _skillCallout(
    ev: Extract<BattleEvent, { kind: 'skill' }>,
    pos: { hx: number; hy: number; tx?: number; ty?: number },
  ): void {
    if (ev.skillKind === 'shield') {
      this._kit.plate('shield', pos.hx, pos.hy, { tint: 0x7dd3fc, s0: 0.4, s1: 1.05, life: 0.36 });
      this._kit.ring(pos.hx, pos.hy, 0x7dd3fc, 0.32);
      this._spawnPlainFloat(`+${Math.round(ev.amount ?? 0)} 护盾`, pos.hx, pos.hy - 40, 0x7dd3fc, 22, 0.55);
      return;
    }
    if (ev.skillKind === 'heal') {
      const x = pos.tx ?? pos.hx;
      const y = pos.ty ?? pos.hy;
      this._kit.plate('heal', x, y, { tint: 0x86efac, s0: 0.4, s1: 0.95, life: 0.32 });
      this._kit.spray(x, y, { n: 7, tint: 0x86efac, kind: 'glow', speed: 80, gy: -40 });
      if ((ev.amount ?? 0) > 0) this._spawnPlainFloat(`+${Math.round(ev.amount ?? 0)}`, x, y - 24, 0x86efac, 22, 0.5);
      return;
    }
    this._kit.plate('flash', pos.hx, pos.hy, { tint: 0xffd66b, s0: 0.4, s1: 0.9, life: 0.2 });
    this._spawnFlash(ev.skillName, pos.hx, pos.hy - 56);
    playSfx('skill', 160);
  }

  private _point(s: ShotBit, t: number): { x: number; y: number } {
    if (s.kind === 'orb' || s.kind === 'wind') {
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

  private _spawnHitFloat(ev: Extract<BattleEvent, { kind: 'hit' }>, x: number, y: number): void {
    const first = this._firstHit;
    this._firstHit = false;
    const size = first ? 56 : ev.crit ? 46 : 36;
    const color = ev.crit || first ? 0xffe066 : 0xff9f3c;
    this._spawnPlainFloat(String(Math.round(ev.damage)), x, y - 10, color, size, first ? 0.9 : ev.crit ? 0.72 : 0.6, ev.crit || first ? 1.15 : 1);
  }

  private _hurtHero(damage: number, x: number, y: number): void {
    this._spawnPlainFloat(`-${Math.round(damage)}`, x, y - 8, 0xff6b6b, 32, 0.55, 1);
  }

  private _spawnPlainFloat(
    msg: string,
    x: number,
    y: number,
    color: number,
    size: number,
    life = 0.45,
    pop = 1,
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
      stroke: 0x1a0c08,
      strokeThickness: Math.max(6, Math.round(size * 0.18)),
    });
    text.anchor.set(0.5);
    text.position.set(x + (Math.random() - 0.5) * 22, y - 22);
    this.layer.addChild(text);
    this._floats.push({ text, life, max: life, vy: -130, pop });
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
