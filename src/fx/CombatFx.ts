/**
 * 观战导演。只吃战斗事件和坐标，不画单位、不算伤害。
 * 颜色 / 拖尾 / 落点全在 FxRecipe，粒子原语在 VfxKit。
 */
import * as PIXI from 'pixi.js';
import type { AttackFx, EnemyFx } from '@/balance/fx';
import { projSprite } from '@/balance/fx';
import { playSfx, buzz } from '@/core/SfxPlayer';
import { fillContain, modTex, projTex, tex, vfxTex } from '@/core/TextureLoader';
import { getPetProto } from '@/balance/pets';
import type { BattleEvent } from '@/game/BattleEngine';
import { VfxKit } from '@/fx/VfxKit';
import { attackLook, enemyLook, playImpact, playMuzzle, shouldFly, shotFlight, skinLook, type FxLook, type ShotBody } from '@/fx/FxRecipe';
import { contactAt, motionFor, releaseAt } from '@/fx/UnitActor';

const MAX_FLOATS = 28;
const MAX_SHOTS = 24;

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
  ribbon: boolean;
  ribbonW: number;
  loft: number;
  spin: number;
  shape: ShotBody;
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
      /** 哪件破烂 / 哪个人的皮。电线和菜刀不能共用一张光 */
      skin?: string;
      enemyFx?: EnemyFx;
      reachY?: number;
      meleeR?: number;
      baseY?: number;
      slowed?: boolean;
      /** 装配回执：只飘短名 */
      installLine?: string;
      /** 东西真正打上了再回调，闪白不能比这一下早 */
      onLand?: () => void;
      byPet?: boolean;
    },
  ): void {
    const color = pos.color ?? 0xffffff;
    if (pos.meleeR && pos.meleeR > 0) this._meleeRadius = pos.meleeR;
    if (ev.kind === 'hit' && pos.ex !== undefined && pos.ey !== undefined) {
      if (pos.hx !== undefined && pos.hy !== undefined) {
        this._spawnHeroAttack(ev, pos.hx, pos.hy, pos.ex, pos.ey, color, pos.fx, pos.melee, pos.orb, pos.onLand, pos.byPet, pos.skin);
      } else {
        this._impactHero(ev, pos.ex, pos.ey, color, pos.fx, pos.skin ? skinLook(pos.skin) : undefined);
        pos.onLand?.();
      }
    }
    if (ev.kind === 'enemyHit' && pos.ex !== undefined && pos.ey !== undefined
      && pos.hx !== undefined && pos.hy !== undefined) {
      this._spawnEnemyHit(ev, pos.ex, pos.ey, pos.hx, pos.hy, pos.enemyFx ?? 'claw', pos.onLand);
    }
    if (ev.kind === 'enemyDown' && pos.ex !== undefined && pos.ey !== undefined) {
      this._death(pos.ex, pos.ey, 0xffb070);
      playSfx('kill_pop', 80);
      this.hitStop = Math.max(this.hitStop, 0.045);
      // 废品是打死人掉的，就得掉在尸体上，玩家才知道钱从哪来
      if (ev.scrap > 0) {
        this._spawnPlainFloat(`+${ev.scrap} 废品`, pos.ex, pos.ey + 16, 0xffd66b, 22, 0.55);
      }
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
      this._kit.ring(pos.hx, pos.hy, 0xffd66b, 0.48);
      this._kit.spray(pos.hx, pos.hy, { n: 8, tint: 0xffe08a, kind: 'spark', speed: 140 });
      if (pos.installLine) {
        this._spawnInstallFloat(pos.installLine, pos.hx, pos.hy - 52);
      }
      playSfx('install_on', 0);
      buzz('medium');
    }
    if (ev.kind === 'skill' && pos.hx !== undefined && pos.hy !== undefined) {
      this._skillCallout(ev, { hx: pos.hx, hy: pos.hy, tx: pos.tx, ty: pos.ty });
    }
    if (ev.kind === 'petSummon' && pos.hx !== undefined && pos.hy !== undefined) {
      const tint = ev.protoId === 'dog' ? 0xffb070 : ev.protoId === 'chicken' ? 0xffe08a : 0x9be08a;
      this._kit.plate('flash', pos.hx, pos.hy + 18, { tint, s0: 0.4, s1: 1.05, life: 0.28 });
      this._kit.ring(pos.hx, pos.hy + 18, tint, 0.36);
      this._kit.spray(pos.hx, pos.hy + 18, { n: 8, tint, kind: 'glow', speed: 90, gy: -20 });
      this._spawnPlainFloat(`${getPetProto(ev.protoId).name}来了`, pos.hx, pos.hy - 28, tint, 20, 0.55);
      playSfx('hero_land', 40);
    }
    if (ev.kind === 'hit' && pos.slowed && pos.ex !== undefined && pos.ey !== undefined) {
      this._spawnPlainFloat('减速', pos.ex, pos.ey + 10, 0x86efac, 16, 0.4);
    }
    if (ev.kind === 'hit' && ev.heal && ev.heal > 0 && pos.hx !== undefined && pos.hy !== undefined) {
      this._spawnPlainFloat(`+${Math.round(ev.heal)}`, pos.hx, pos.hy - 28, 0x86efac, 18, 0.4);
    }
  }

  markLand(x?: number, y?: number): void {
    this.landPulse = 0.28;
    if (x !== undefined && y !== undefined) {
      this._kit.ring(x, y, 0xffd66b, 0.5);
      this._kit.plate('flash', x, y, { tint: 0xffe08a, s0: 0.4, s1: 1.3, life: 0.34 });
    }
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
      const p = this._point(s, u);
      const ang = Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
      this._drawShotBody(s, p, ang, u);
      if (s.spr) {
        s.spr.position.set(p.x, p.y);
        s.spr.rotation = s.spin > 0 ? s.spr.rotation + dt * s.spin : ang;
        s.spr.alpha = u < 0.08 ? u / 0.08 : 1;
      }
      s.emit += dt;
      if (s.emit > 0.018 && u < 1 && s.ribbon) {
        s.emit = 0;
        this._kit.ribbon(p.x, p.y, ang, s.color, s.ribbonW);
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
    onLand?: () => void,
    byPet?: boolean,
    skin?: string,
  ): void {
    const style: AttackFx = fx ?? (melee ? 'slash' : orb ? 'orb' : 'bolt');
    const look = skin ? skinLook(skin) : attackLook(style);
    const tint = ev.crit ? mix(look.tint, 0xffd66b, 0.4) : look.tint;
    const land = (): void => {
      this._impactHero(ev, x1, y1, color, style, look);
      onLand?.();
    };
    const motion = motionFor(style);
    const fly = shouldFly(look, !!melee);
    const windup = byPet
      ? 0.08
      : fly ? releaseAt(motion) : contactAt(motion);
    this._after(windup, () => {
      playSfx(`atk_${style}`, 90);
      const ang = Math.atan2(y1 - y0, x1 - x0);
      const dist = Math.hypot(x1 - x0, y1 - y0);
      playMuzzle(this._kit, look, x0, y0, ang);

      if (!fly) {
        this._kit.spray(x0, y0, { n: 5, tint, kind: 'spark', speed: 140, dir: ang, spread: 1.0 });
        land();
        return;
      }
      if (look.beam) this._kit.beam(x0, y0, x1, y1, tint, 0.18);
      this._pushShot({
        x0, y0, x1, y1, color: tint, kind: style,
        fly: shotFlight(look, dist, !!melee),
        look,
        land,
      });
    });
  }

  private _spawnEnemyHit(
    ev: Extract<BattleEvent, { kind: 'enemyHit' }>,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    fx: EnemyFx,
    onLand?: () => void,
  ): void {
    const look = enemyLook(fx);
    const color = look.tint;
    const land = (): void => {
      const through = ev.damage - ev.absorbed;
      if (ev.absorbed > 0) {
        this._spawnPlainFloat('抵挡', x1, y1 - 6, 0x7dd3fc, 18, 0.38);
        this._kit.plate('shield', x1, y1, { tint: 0x7dd3fc, s0: 0.35, s1: 0.8, life: 0.22 });
      }
      if (through > 0) {
        this._hurtHero(through, x1, y1);
        playSfx('hit', 70);
        this._enemyLand(fx, x1, y1);
      }
      if (ev.reflect > 0) {
        this._kit.spray(x0, y0, { n: 5, tint: 0xff8a3a, kind: 'spark', speed: 120 });
        this._spawnPlainFloat(`反伤 ${Math.round(ev.reflect)}`, x0, y0, 0xffb070, 20);
      }
      onLand?.();
    };
    this._after(releaseAt('lunge', 'enemy', false, true), () => {
      playSfx(`enemy_${fx}`, 70);
      const ang = Math.atan2(y1 - y0, x1 - x0);
      playMuzzle(this._kit, look, x0, y0, ang);
      if (look.beam) this._kit.beam(x0, y0, x1, y1, color, 0.16);
      this._pushShot({
        x0, y0, x1, y1, color, kind: fx,
        fly: Math.min(0.32, shotFlight(look, Math.hypot(x1 - x0, y1 - y0))),
        look,
        land,
      });
    });
  }

  private _after(t: number, fn: () => void): void {
    if (t <= 0) fn();
    else this._waits.push({ t, fn });
  }

  private _pushShot(spec: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    color: number;
    kind: ShotKind;
    fly: number;
    look?: FxLook;
    land: () => void;
  }): void {
    if (this._shots.length >= MAX_SHOTS) {
      const old = this._shots.shift();
      old?.body.destroy();
      old?.spr?.destroy();
    }
    const energy = spec.kind === 'beam' || spec.kind === 'spark'
      ? 'pierce'
      : spec.kind === 'claw' ? 'claw'
        : spec.kind === 'bash' ? 'smash'
          : spec.look?.beam ? 'pierce'
            : null;
    const physName = energy ? null : (spec.look?.proj ?? projSprite(spec.kind as AttackFx));
    const physical = !!physName;
    const shot = energy ? vfxTex(energy)
      : physName ? (projTex(physName) ?? modTex(physName) ?? tex(`images/wep_${physName}.png`))
        : null;
    let spr: PIXI.Sprite | null = null;
    if (shot) {
      spr = new PIXI.Sprite(shot);
      spr.anchor.set(0.5);
      spr.blendMode = energy ? PIXI.BLEND_MODES.ADD : PIXI.BLEND_MODES.NORMAL;
      if (energy) spr.tint = spec.color;
      spr.position.set(spec.x0, spec.y0);
      const native = Math.max(shot.width, 1);
      const px = spec.look?.projPx
        ?? (energy ? 48
          : spec.kind === 'orb' ? 56
            : spec.kind === 'slash' ? 52
              : spec.kind === 'sniper' ? 36
                : spec.kind === 'bolt' ? 40
                  : spec.kind === 'poke' ? 46 : 34);
      spr.scale.set(px / native);
      this.layer.addChild(spr);
    }
    const body = new PIXI.Graphics();
    body.blendMode = physical || spec.kind === 'orb' || spec.kind === 'wind' || spec.kind === 'blast'
      ? PIXI.BLEND_MODES.NORMAL
      : PIXI.BLEND_MODES.ADD;
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
      ribbon: !!spec.look?.ribbon,
      ribbonW: spec.look?.ribbonW ?? 0.5,
      loft: spec.look?.loft ?? 0,
      spin: spec.look?.spin ?? 0,
      shape: spec.look?.body ?? (physical ? 'none' : 'bolt'),
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
    const fade = u < 0.08 ? u / 0.08 : 1;
    if (!s.spr) {
      this._drawFallbackProj(g, s, p, fade);
      return;
    }
    if (s.shape === 'none' || s.kind === 'orb' || s.kind === 'wind' || s.kind === 'blast') return;
    const nx = Math.cos(ang);
    const ny = Math.sin(ang);
    const len = s.kind === 'sniper' ? 72 : s.kind === 'pierce' || s.kind === 'beam' || s.kind === 'poke' ? 64 : 52;
    g.lineStyle(10, s.color, 0.18 * fade);
    g.moveTo(p.x - nx * len, p.y - ny * len);
    g.lineTo(p.x, p.y);
    g.lineStyle(3.2, 0xffffff, 0.7 * fade);
    g.moveTo(p.x - nx * len * 0.55, p.y - ny * len * 0.55);
    g.lineTo(p.x, p.y);
    g.lineStyle(0);
  }

  /** 贴图没到也要看见东西在飞，不能只剩落点一团光 */
  private _drawFallbackProj(
    g: PIXI.Graphics,
    s: ShotBit,
    p: { x: number; y: number },
    fade: number,
  ): void {
    if (s.kind === 'orb') {
      g.beginFill(0xf5d0fe, 0.95 * fade).drawCircle(p.x, p.y, 13).endFill();
      g.beginFill(0xc084fc, 0.85 * fade).drawCircle(p.x, p.y, 8).endFill();
      return;
    }
    if (s.kind === 'sniper') {
      g.beginFill(0xe8d4b0, 0.95 * fade).drawCircle(p.x, p.y, 7).endFill();
      g.beginFill(0x8a7355, 0.9 * fade).drawCircle(p.x, p.y, 4).endFill();
      return;
    }
    if (s.kind === 'wind') {
      g.beginFill(0x86efac, 0.8 * fade).drawEllipse(p.x, p.y, 14, 7).endFill();
      return;
    }
    if (s.kind === 'blast') {
      g.beginFill(0xff8a3a, 0.9 * fade).drawRoundedRect(p.x - 7, p.y - 10, 14, 20, 4).endFill();
      return;
    }
    if (s.kind === 'poke') {
      g.lineStyle(5, 0x9bb8c4, 0.9 * fade);
      g.moveTo(p.x - 16, p.y);
      g.lineTo(p.x + 16, p.y);
      g.lineStyle(0);
      return;
    }
    if (s.kind === 'pierce') {
      g.lineStyle(3, 0xc9a227, 0.9 * fade);
      g.moveTo(p.x - 18, p.y);
      g.lineTo(p.x + 18, p.y);
      g.lineStyle(0);
      g.beginFill(0xe8c84a, 0.8 * fade).drawCircle(p.x + 16, p.y, 3).endFill();
      return;
    }
    if (s.kind === 'slash') {
      g.beginFill(0x6b5a4a, 0.95 * fade).drawRoundedRect(p.x - 18, p.y - 5, 28, 9, 2).endFill();
      g.beginFill(0xe8e0d4, 0.95 * fade).drawPolygon([
        p.x + 8, p.y - 7,
        p.x + 22, p.y,
        p.x + 8, p.y + 7,
      ]).endFill();
      return;
    }
    g.beginFill(s.color, 0.9 * fade).drawCircle(p.x, p.y, 8).endFill();
    g.beginFill(0xffffff, 0.55 * fade).drawCircle(p.x, p.y, 3).endFill();
  }

  private _impactHero(
    ev: Extract<BattleEvent, { kind: 'hit' }>,
    x: number,
    y: number,
    _color: number,
    fx: AttackFx = 'bolt',
    lookArg?: FxLook,
  ): void {
    this._spawnHitFloat(ev, x, y);
    playSfx(ev.crit ? 'hit_counter' : `hit_${fx}`, ev.crit ? 50 : 80);
    const look = lookArg ?? attackLook(fx);
    const stop = playImpact(this._kit, look, x, y, ev.crit);
    this.hitStop = Math.max(this.hitStop, stop);
    if (look.buzz) buzz(ev.crit ? 'heavy' : look.buzz);
    else if (ev.crit) buzz('heavy');
  }

  private _enemyLand(fx: EnemyFx, x: number, y: number): void {
    const look = enemyLook(fx);
    const stop = playImpact(this._kit, look, x, y, false);
    this.hitStop = Math.max(this.hitStop, stop);
    if (look.buzz) buzz(look.buzz);
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
    if (s.loft > 0) {
      return {
        x: s.x0 + (s.x1 - s.x0) * t,
        y: s.y0 + (s.y1 - s.y0) * t - Math.sin(t * Math.PI) * s.loft,
      };
    }
    if (s.kind === 'orb' || s.kind === 'wind' || s.shape === 'orb') {
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
    const size = first ? 64 : ev.crit ? 52 : 40;
    const color = ev.crit || first ? 0xffe066 : 0xffb24a;
    this._spawnPlainFloat(
      String(Math.round(ev.damage)),
      x,
      y - 10,
      color,
      size,
      first ? 0.95 : ev.crit ? 0.78 : 0.62,
      ev.crit || first ? 1.22 : 1.06,
    );
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

  private _spawnInstallFloat(msg: string, x: number, y: number): void {
    if (this._floats.length >= MAX_FLOATS) {
      const old = this._floats.shift();
      old?.text.destroy();
    }
    const text = new PIXI.Text(msg, {
      fontFamily: 'sans-serif',
      fontSize: 26,
      fontWeight: 'bold',
      fill: 0xffe08a,
      stroke: 0x1a0c08,
      strokeThickness: 6,
    });
    text.anchor.set(0.5);
    text.position.set(x, y);
    this.layer.addChild(text);
    this._floats.push({ text, life: 0.7, max: 0.7, vy: -90, pop: 1.12 });
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
