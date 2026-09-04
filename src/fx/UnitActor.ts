/**
 * 不拆骨骼：柄在拳里，头朝外。家伙始终看得见，免得锅拿反还藏身后。
 */
import * as PIXI from 'pixi.js';
import type { AttackFx } from '@/balance/fx';
import { HAND, HAND_GEAR, resolveHandGear, wornModIds, type HandGear } from '@/balance/gear';
import { enemyTex, heroTex, tex } from '@/core/TextureLoader';
import { clipBody } from '@/fx/spriteBody';

export type AtkMotion = 'lunge' | 'sling' | 'recoil' | 'crush';

export function motionFor(fx: AttackFx): AtkMotion {
  if (fx === 'smash') return 'crush';
  if (fx === 'sniper') return 'sling';
  if (fx === 'bolt' || fx === 'orb' || fx === 'poke' || fx === 'wind' || fx === 'blast' || fx === 'pierce') {
    return 'recoil';
  }
  return 'lunge';
}

/** 这一下真正出手的时刻，跟挥击关键帧对齐，特效不能比它早 */
export function attackLife(motion: AtkMotion, kind: 'hero' | 'enemy', armed: boolean, framed: boolean): number {
  if (kind === 'hero' && armed) {
    return motion === 'crush' ? 0.52 : motion === 'sling' ? 0.55 : 0.46;
  }
  if (motion === 'crush') return 0.48;
  if (framed) return 0.38;
  return motion === 'sling' ? 0.34 : 0.26;
}

export function releaseAt(motion: AtkMotion, kind: 'hero' | 'enemy' = 'hero', armed = true, framed = false): number {
  const life = attackLife(motion, kind, armed, framed);
  if (motion === 'sling') return life * 0.4;
  if (motion === 'recoil') return life * 0.3;
  if (motion === 'crush') return life * 0.52;
  return life * 0.34;
}

/** 近战刀口碰到人的时刻。比松手晚，落点不能早于这一下 */
export function contactAt(motion: AtkMotion, kind: 'hero' | 'enemy' = 'hero', armed = true, framed = false): number {
  const life = attackLife(motion, kind, armed, framed);
  if (motion === 'sling' || motion === 'recoil') return releaseAt(motion, kind, armed, framed);
  return life * 0.52;
}

/** 朝右：0 敌人，-π/2 天。绕拳头转，举起不超过头太多，命中不进地。 */
export function swingKeyframes(motion: AtkMotion): { rest: number; up: number; hit: number } {
  if (motion === 'sling') return { rest: -Math.PI / 2, up: -0.25, hit: -2.05 };
  if (motion === 'recoil') return { rest: -0.4, up: -1.05, hit: 0.12 };
  if (motion === 'crush') return { rest: -0.7, up: -1.65, hit: 0.26 };
  return { rest: -0.75, up: -1.45, hit: 0.16 };
}

function frames(id: string, clip: string, n: number): PIXI.Texture[] {
  const out: PIXI.Texture[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = tex(`images/anim_${id}_${clip}_${i}.png`);
    if (t) out.push(t);
  }
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function atkFrame(u: number, n: number, crush: boolean): number {
  if (n <= 1) return 0;
  if (crush) {
    if (u < 0.4) return 0;
    if (u < 0.52) return Math.min(1, n - 1);
    if (u < 0.82) return Math.min(2, n - 1);
    return Math.min(3, n - 1);
  }
  if (u < 0.28) return 0;
  if (u < 0.46) return Math.min(1, n - 1);
  if (u < 0.78) return Math.min(2, n - 1);
  return Math.min(3, n - 1);
}

function gripTex(id: string): PIXI.Texture | null {
  return tex(`images/hero_${id}_grip.png`);
}

export class UnitActor {
  readonly view = new PIXI.Container();
  private readonly _anim: PIXI.AnimatedSprite;
  private readonly _arm = new PIXI.Container();
  private readonly _smear = new PIXI.Sprite();
  private readonly _weapon = new PIXI.Sprite();
  private readonly _wear: PIXI.Sprite[] = [];
  private _id = '';
  private _kind: 'hero' | 'enemy' = 'hero';
  private _idle: PIXI.Texture[] = [];
  private _walk: PIXI.Texture[] = [];
  private _atk: PIXI.Texture[] = [];
  private _clip: 'idle' | 'walk' | 'atk' | '' = '';
  private _feetX = 0;
  private _feetY = 0;
  private _h = 88;
  private _atkT = -1;
  private _atkLife = 0.28;
  private _motion: AtkMotion = 'lunge';
  private _nx = 0;
  private _ny = -1;
  private _face = 1;
  private _tilt = 0;
  private _flash = 0;
  private _dead = false;
  private _off = false;
  private _killFade = 0;
  private _breath = Math.random() * Math.PI * 2;
  private _armed = false;
  private _gear: HandGear | null = null;
  private _modKey = '';
  walkBob = false;
  /** 村里点中「要换掉」的人，呼吸放大，让玩家一眼看见换的是谁 */
  holdPulse = false;

  constructor() {
    this._anim = new PIXI.AnimatedSprite([PIXI.Texture.WHITE]);
    this._anim.anchor.set(0.5, 1);
    this._anim.animationSpeed = 0.1;
    this._smear.anchor.set(0.15, 0.5);
    this._smear.visible = false;
    this._weapon.anchor.set(0.28, 0.7);
    this._arm.addChild(this._smear, this._weapon);
    this._arm.visible = false;
    this.view.addChild(this._arm, this._anim);
    for (let i = 0; i < 3; i += 1) {
      const s = new PIXI.Sprite();
      s.anchor.set(0.5, 0.5);
      s.visible = false;
      this._wear.push(s);
      this.view.addChild(s);
    }
  }

  bindHero(id: string, modIds: readonly string[] = []): void {
    this._id = id;
    this._kind = 'hero';
    this.walkBob = false;
    this._modKey = '';
    this._reload();
    this.equip(modIds);
  }

  bindEnemy(id: string): void {
    this._id = id;
    this._kind = 'enemy';
    this._armed = false;
    this._gear = null;
    this._arm.visible = false;
    for (const s of this._wear) s.visible = false;
    this._reload();
  }

  /** 换手上的家伙、穿上的破烂。handId 给预览台强行指定，局内不用传 */
  equip(modIds: readonly string[], handId?: string): void {
    if (this._kind !== 'hero') return;
    const key = `${modIds.join(',')}|${handId ?? ''}`;
    const forced = handId ? HAND_GEAR[handId] : undefined;
    const gear = forced ?? resolveHandGear(this._id, modIds);
    if (!this._armed || key !== this._modKey || gear.id !== this._gear?.id) {
      this._modKey = key;
      this._gear = gear;
      const t = tex(gear.path);
      if (t) {
        this._weapon.texture = t;
        this._weapon.anchor.set(gear.gripX, gear.gripY);
        this._armed = true;
        this._arm.visible = !this._dead;
      } else {
        this._armed = false;
        this._arm.visible = false;
      }
    }
    this._bindWear(modIds);
    if (this._atkT < 0) this._holdRest();
  }

  place(x: number, feetY: number, h: number): void {
    this._feetX = x;
    this._feetY = feetY;
    this._h = h;
  }

  faceToward(tx: number): void {
    if (this._dead || this._atkT >= 0) return;
    if (Math.abs(tx - this._feetX) > 10) this._face = tx >= this._feetX ? 1 : -1;
  }

  playAttack(tx: number, ty: number, motion: AtkMotion): void {
    if (this._dead) return;
    const dx = tx - this._feetX;
    const dy = ty - this._feetY;
    const len = Math.hypot(dx, dy) || 1;
    if (Math.abs(dx) > 6) this._face = dx >= 0 ? 1 : -1;

    const side = clamp(dx / len, -0.28, 0.28);
    if (this._kind === 'hero') {
      this._nx = side;
      this._ny = -1;
      this._tilt = side * 0.16;
    } else {
      this._nx = side;
      this._ny = 1;
      this._tilt = -side * 0.12;
    }

    this._motion = motion;
    this._atkLife = attackLife(motion, this._kind, this._armed, this._atk.length > 1);
    this._atkT = 0;
    if (this._kind === 'hero' && this._armed) {
      this._play('idle', false);
      this._anim.stop();
      this._tickWeapon(0, 0);
      return;
    }
    this._play('atk', false);
    this._anim.stop();
    this._anim.gotoAndStop(0);
  }

  flash(ms = 120): void {
    this._flash = ms / 1000;
  }

  get dead(): boolean {
    return this._dead;
  }

  setDead(dead: boolean): void {
    this._dead = dead;
    this._off = false;
    this._killFade = 0;
    if (dead) {
      this._anim.stop();
      this._anim.tint = 0x6b7394;
      this._arm.visible = false;
      for (const s of this._wear) s.visible = false;
    } else if (this._armed) {
      this._arm.visible = true;
    }
  }

  /** 外星人被打穿：倒下并淡出，不要停在最后一帧 */
  killOff(): void {
    if (this._off) return;
    this._dead = true;
    this._off = true;
    this._killFade = 0.22;
    this._atkT = -1;
    this._anim.stop();
    this._arm.visible = false;
    for (const s of this._wear) s.visible = false;
  }

  update(dt: number): void {
    if (this._flash > 0) this._flash = Math.max(0, this._flash - dt);
    this._breath += dt * (this.holdPulse ? 3.6 : 2.1);
    let ox = 0;
    let oy = 0;
    let rot = 0;

    if (this._dead && this._off) {
      this._killFade = Math.max(0, this._killFade - dt);
      const u = this._killFade / 0.22;
      rot = 1.05 * (1 - u);
      this._anim.alpha = u;
      this._anim.tint = 0x6b7394;
    } else if (this._dead) {
      rot = 0.32;
      this._anim.alpha = 0.45;
    } else if (this._atkT >= 0) {
      this._atkT += dt;
      const u = Math.min(1, this._atkT / this._atkLife);
      const pose = this._pose(u);
      ox = pose.ox;
      oy = pose.oy;
      rot = this._tilt * pose.lean + (this._armed && this._kind === 'hero' ? pose.twist : 0);
      if (this._kind === 'hero' && this._armed) this._tickWeapon(u, rot);
      else if (this._atk.length > 1) this._anim.gotoAndStop(atkFrame(u, this._atk.length, this._motion === 'crush'));
      if (u >= 1) {
        this._atkT = -1;
        this._holdRest();
      }
    } else if (this.walkBob && this._walk.length > 1) {
      if (this._clip !== 'walk') this._play('walk', true);
    } else {
      this._holdRest();
      rot = this._kind === 'hero' ? this._tilt * 0.35 : 0;
    }

    const breath = !this._dead && this._atkT < 0 && this._clip === 'idle'
      ? Math.sin(this._breath)
      : 0;
    const amp = this.holdPulse ? 0.07 : 0.018;
    const killU = this._off ? this._killFade / 0.22 : 0;
    const sx = this._off
      ? 1 + (1 - killU) * 0.08
      : this._dead ? 1.12 : 1 - breath * (this.holdPulse ? 0.035 : 0.01);
    const sy = this._off
      ? 1 - (1 - killU) * 0.28
      : this._dead ? 0.55 : 1 + breath * amp;
    const bodyClip = this._kind === 'hero' && this._armed ? 'idle' : (this._clip || 'idle');
    const fit = this._h / clipBody(this._id, bodyClip, this._anim.texture.height || this._h);
    this._anim.scale.set(fit * sx * this._face, fit * sy);
    this._anim.rotation = rot;
    const bob = this.holdPulse ? -6 - breath * 5 : 0;
    this.view.position.set(this._feetX + ox, this._feetY + oy + bob);
    if (this._kind === 'hero' && this._armed && this._atkT < 0 && !this._dead) this._tickWeapon(-1, rot);
    this._placeWear(fit);
    if (this._dead) return;
    this._anim.alpha = this._flash > 0 ? 0.72 + Math.sin(this._flash * 40) * 0.22 : 1;
    this._anim.tint = this.holdPulse ? 0xffe6a8 : 0xffffff;
  }

  destroy(): void {
    this._anim.stop();
    this._anim.onComplete = undefined;
    this.view.destroy({ children: true });
  }

  private _bindWear(modIds: readonly string[]): void {
    const worn = [
      ...wornModIds(modIds, 'head').map((id) => ({ id, slot: 'head' as const })),
      ...wornModIds(modIds, 'back').map((id) => ({ id, slot: 'back' as const })),
      ...wornModIds(modIds, 'body').map((id) => ({ id, slot: 'body' as const })),
    ];
    for (let i = 0; i < this._wear.length; i += 1) {
      const item = worn[i];
      const spr = this._wear[i]!;
      if (!item) {
        spr.visible = false;
        continue;
      }
      const t = tex(`images/mod_${item.id}.png`);
      if (!t) {
        spr.visible = false;
        continue;
      }
      spr.texture = t;
      spr.visible = !this._dead;
      spr.name = item.slot;
    }
  }

  private _placeWear(fit: number): void {
    for (const spr of this._wear) {
      if (!spr.visible) continue;
      const th = Math.max(1, spr.texture.height);
      const slot = spr.name;
      const scale = slot === 'head' ? 0.28 : slot === 'back' ? 0.34 : 0.32;
      spr.scale.set(scale * this._h / th * this._face, scale * this._h / th);
      if (slot === 'head') spr.position.set(this._face * this._h * 0.02, -this._h * 0.92);
      else if (slot === 'back') spr.position.set(-this._face * this._h * 0.22, -this._h * 0.58);
      else spr.position.set(-this._face * this._h * 0.18, -this._h * 0.42);
      void fit;
    }
  }

  /**
   * 柄钉在拳头上，头朝外。家伙叠在身前，方向一眼能看清。
   */
  private _tickWeapon(u: number, bodyRot: number): void {
    const gear = this._gear;
    if (!gear || !this._armed) {
      this._arm.visible = false;
      this._smear.visible = false;
      return;
    }
    this._arm.visible = !this._dead;

    const sock = HAND[this._id] ?? { x: 0.2, y: -0.45 };
    const sx = this._face * this._h * sock.x;
    const sy = this._h * sock.y;
    this._arm.position.set(
      sx * Math.cos(bodyRot) - sy * Math.sin(bodyRot),
      sx * Math.sin(bodyRot) + sy * Math.cos(bodyRot),
    );
    this._arm.scale.set(this._face, 1);
    this._arm.rotation = this._face * this._armAngle(u);
    this._layerWeapon(true);

    const wepH = Math.max(1, this._weapon.texture.height);
    this._weapon.texture = tex(gear.path) ?? this._weapon.texture;
    this._weapon.anchor.set(gear.gripX, gear.gripY);
    this._weapon.position.set(-this._h * 0.03, 0);
    this._weapon.rotation = -gear.headLocal + (gear.twist ?? 0);
    const kick = this._motion === 'sling' && u >= 0.4 && u < 0.56
      ? Math.sin(((u - 0.4) / 0.16) * Math.PI)
      : 0;
    this._weapon.scale.set((this._h * gear.scale * (1 + kick * 0.18)) / wepH);
    this._weapon.visible = true;
    this._weapon.alpha = 1;
    if (kick > 0) this._arm.position.y -= this._h * 0.18 * kick;

    const snap = u >= 0.32 && u <= 0.6 && (this._motion === 'lunge' || this._motion === 'crush');

    const smearTex = tex('images/vfx_slash.png');
    if (smearTex && snap) {
      this._smear.texture = smearTex;
      this._smear.visible = true;
      this._smear.alpha = u < 0.5 ? 0.88 : 0.32;
      this._smear.position.set(this._h * 0.12, 0);
      this._smear.rotation = 0.15;
      this._smear.scale.set((this._h * 0.72) / Math.max(1, smearTex.width), (this._h * 0.34) / Math.max(1, smearTex.height));
    } else {
      this._smear.visible = false;
    }
  }

  private _layerWeapon(inFront: boolean): void {
    const top = this.view.children.length - 1;
    const now = this.view.getChildIndex(this._arm);
    if (inFront && now !== top) this.view.setChildIndex(this._arm, top);
    if (!inFront && now !== 0) this.view.setChildIndex(this._arm, 0);
  }

  private _armAngle(u: number): number {
    const keys = swingKeyframes(this._motion);
    const rest = this._gear?.rest ?? keys.rest;
    const { up, hit } = keys;
    if (u < 0) return rest;
    if (this._motion === 'sling') {
      if (u < 0.4) return lerp(rest, up, u / 0.4);
      if (u < 0.54) return lerp(up, hit, ((u - 0.4) / 0.14) ** 0.45);
      return lerp(hit, rest, Math.min(1, (u - 0.54) / 0.46));
    }
    if (this._motion === 'recoil') {
      if (u < 0.3) return lerp(rest, up, u / 0.3);
      if (u < 0.52) return lerp(up, hit, ((u - 0.3) / 0.22) ** 2);
      return lerp(hit, rest, Math.min(1, (u - 0.52) / 0.48));
    }
    if (u < 0.34) return lerp(rest, up, u / 0.34);
    if (u < 0.52) {
      const p = (u - 0.34) / 0.18;
      return lerp(up, hit, p * p);
    }
    return lerp(hit, rest, Math.min(1, (u - 0.52) / 0.48));
  }

  private _pose(u: number): { ox: number; oy: number; lean: number; twist: number } {
    if (this._kind === 'hero' && this._armed && (this._motion === 'lunge' || this._motion === 'crush')) {
      if (u < 0.34) {
        const p = u / 0.34;
        return { ox: -this._face * 4 * p, oy: -6 * p, lean: -0.12 * p, twist: -0.12 * p };
      }
      if (u < 0.52) {
        const p = ((u - 0.34) / 0.18) ** 2;
        return {
          ox: lerp(-this._face * 4, this._face * 8, p),
          oy: lerp(-6, 2, p),
          lean: lerp(-0.12, 0.16, p),
          twist: lerp(-0.12, 0.1, p),
        };
      }
      const p = Math.min(1, (u - 0.52) / 0.48);
      return {
        ox: lerp(this._face * 8, 0, p),
        oy: lerp(2, 0, p),
        lean: lerp(0.22, 0, p),
        twist: lerp(0.16, 0, p),
      };
    }
    if (this._motion === 'sling') {
      if (u < 0.4) {
        const p = u / 0.4;
        return { ox: -this._face * 6 * p, oy: 8 * p, lean: -0.22 * p, twist: 0 };
      }
      if (u < 0.54) {
        const p = ((u - 0.4) / 0.14) ** 2;
        return {
          ox: lerp(-this._face * 6, this._face * 3, p),
          oy: lerp(8, -16, p),
          lean: lerp(-0.22, 0.14, p),
          twist: 0,
        };
      }
      const p = Math.min(1, (u - 0.54) / 0.46);
      return {
        ox: lerp(this._face * 3, 0, p),
        oy: lerp(-16, 0, p),
        lean: lerp(0.14, 0, p),
        twist: 0,
      };
    }
    if (this._motion === 'recoil') {
      const d = Math.sin(u * Math.PI);
      return { ox: -this._nx * 8 * d, oy: -this._ny * 6 * d, lean: -0.4 * d, twist: 0 };
    }
    if (this._motion === 'crush') {
      if (u < 0.36) {
        const p = u / 0.36;
        return { ox: -this._nx * 2 * p, oy: 0, lean: -0.22 * p, twist: 0 };
      }
      const t = (u - 0.36) / 0.64;
      const d = Math.sin(Math.min(1, t) * Math.PI);
      return { ox: this._nx * 4 * d, oy: this._ny * 5 * d, lean: 0.35 * d, twist: 0 };
    }
    if (u < 0.3) {
      const p = u / 0.3;
      return { ox: -this._nx * 7 * p, oy: -this._ny * 8 * p, lean: -0.7 * p, twist: 0 };
    }
    const t = (u - 0.3) / 0.7;
    const d = Math.sin(Math.min(1, t) * Math.PI);
    return { ox: this._nx * 10 * d, oy: this._ny * 16 * d, lean: 0.85 * d, twist: 0 };
  }

  private _holdRest(): void {
    if (this._clip === 'idle' && this._idle.length <= 1) return;
    this._play('idle', false);
  }

  private _reload(): void {
    if (this._kind === 'hero') {
      const grip = gripTex(this._id);
      const portrait = heroTex(this._id);
      this._idle = grip ? [grip] : portrait ? [portrait] : frames(this._id, 'idle', 1);
      this._walk = this._idle;
      this._atk = this._idle;
    } else {
      const portrait = enemyTex(this._id);
      this._idle = portrait ? [portrait] : frames(this._id, 'idle', 1);
      this._walk = frames(this._id, 'walk', 4);
      this._atk = frames(this._id, 'atk', 4);
      if (this._walk.length === 0) this._walk = this._idle;
    }
    const keepAtk = this._clip === 'atk' && this._atkT >= 0;
    this._clip = '';
    if (keepAtk) this._play('atk', false);
    else this._holdRest();
  }

  private _play(name: 'idle' | 'walk' | 'atk', loop: boolean): boolean {
    const list = name === 'atk' ? this._atk : name === 'walk' ? this._walk : this._idle;
    if (list.length === 0) return false;
    if (name === this._clip && (loop || list.length <= 1)) return true;
    this._clip = name;
    this._anim.textures = list;
    this._anim.loop = loop && list.length > 1;
    this._anim.animationSpeed = (name === 'walk' ? 7 : 2) / 60;
    this._anim.onComplete = undefined;
    if (name === 'atk' || list.length === 1 || (!loop && name === 'idle')) this._anim.gotoAndStop(0);
    else this._anim.gotoAndPlay(0);
    return true;
  }
}
