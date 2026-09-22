/**
 * 局内只画立绘 / 切片，不再往身上叠盔、叠家伙。
 */
import * as PIXI from 'pixi.js';
import type { AttackFx } from '@/balance/fx';
import { animPath, enemyArtId, enemyTex, heroTex, tex } from '@/core/TextureLoader';
import { barePlantY, portraitFit } from '@/fx/portraitFit';
import { battleBodyH, heroBattleLook } from '@/fx/spriteBody';

export type AtkMotion = 'lunge' | 'sling' | 'recoil' | 'crush';

export function motionFor(fx: AttackFx): AtkMotion {
  if (fx === 'smash') return 'crush';
  if (fx === 'sniper') return 'sling';
  if (fx === 'bolt' || fx === 'orb' || fx === 'poke' || fx === 'wind' || fx === 'blast' || fx === 'pierce') {
    return 'recoil';
  }
  return 'lunge';
}

/** 手上还是弹弓就走拉弹，哪怕这一发家族已经是 pierce。动画和出手帧必须同一套。 */
export function motionForSkin(skin: string | undefined, fx: AttackFx): AtkMotion {
  if (skin === 'sling') return 'sling';
  return motionFor(fx);
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

/** 朝右：0 敌人，-π/2 天。抡起来不超过头太多，命中不进地。 */
export function swingKeyframes(motion: AtkMotion): { rest: number; up: number; hit: number } {
  if (motion === 'sling') return { rest: -Math.PI / 2, up: -0.25, hit: -2.05 };
  if (motion === 'recoil') return { rest: -0.4, up: -1.05, hit: 0.12 };
  if (motion === 'crush') return { rest: -0.7, up: -1.65, hit: 0.26 };
  return { rest: -0.75, up: -1.45, hit: 0.16 };
}

function frames(id: string, clip: string, n: number): PIXI.Texture[] {
  const out: PIXI.Texture[] = [];
  for (let i = 0; i < n; i += 1) {
    const t = tex(animPath(id, clip, i));
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

/** 宽高还没到就别拿格子高去 fit，整张立绘会按 1:1 铺，场上只剩腰间那块家伙。 */
export function readyTexH(texH: number): number | null {
  return texH > 8 ? texH : null;
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

export class UnitActor {
  readonly view = new PIXI.Container();
  private readonly _anim: PIXI.AnimatedSprite;
  private _id = '';
  private _evo = 1;
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
  /** 村口不播攻击切片，立绘按整张落脚 */
  private _bare = false;
  /** 有 idle/atk 切片时走帧动画 */
  private _spriteSheet = false;
  /** 站姿 / 走路正在画三阶立绘，定高走 PORTRAIT_BODY */
  private _idlePortrait = false;
  /** 出手也在画立绘（没有攻击切片） */
  private _atkPortrait = false;
  walkBob = false;
  /** 村里点中「要换掉」的人，呼吸放大，让玩家一眼看见换的是谁 */
  holdPulse = false;

  constructor() {
    this._anim = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
    this._anim.anchor.set(0.5, 1);
    this._anim.animationSpeed = 0.1;
    this._anim.visible = false;
    this.view.addChild(this._anim);
  }

  bindHero(id: string, _lane: string, evoStage = 1, inBattle = true): void {
    this._id = id;
    this._evo = Math.max(1, Math.min(3, Math.floor(evoStage)));
    this._kind = 'hero';
    this.walkBob = false;
    this._bare = !inBattle;
    this._reload();
  }

  bindEnemy(id: string): void {
    this._id = id;
    this._kind = 'enemy';
    this._bare = false;
    this._reload();
  }

  /** 换阶时重载立绘。不再叠穿戴图标。 */
  equip(evoStage = 1): void {
    if (this._kind !== 'hero') return;
    const next = Math.max(1, Math.min(3, Math.floor(evoStage)));
    if (next === this._evo) return;
    this._evo = next;
    this._reload();
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
    this._atkLife = attackLife(motion, this._kind, this._kind === 'hero', this._atk.length > 1);
    this._atkT = 0;
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
      rot = this._tilt * pose.lean + (this._kind === 'hero' ? pose.twist : 0);
      if (this._atk.length > 1) this._anim.gotoAndStop(atkFrame(u, this._atk.length, this._motion === 'crush'));
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
    if (this._id && (this._idle.length === 0 || readyTexH(this._anim.texture.height) === null)) {
      this._reload();
    }
    const bodyClip = this._clip || 'idle';
    const texH = readyTexH(this._anim.texture.height);
    const bob = this.holdPulse ? -6 - breath * 5 : 0;
    this.view.position.set(this._feetX + ox, this._feetY + oy + bob);
    if (texH === null) {
      this._anim.visible = false;
      return;
    }
    this._anim.visible = !this._dead;
    const clipId = this._kind === 'enemy' ? enemyArtId(this._id) : this._id;
    const portrait = this._kind === 'hero' && (
      this._bare || (bodyClip === 'atk' ? this._atkPortrait : this._idlePortrait)
    );
    const bodyH = battleBodyH({
      id: clipId,
      evo: this._evo,
      clip: bodyClip === 'walk' ? 'walk' : bodyClip === 'atk' ? 'atk' : 'idle',
      texH,
      portrait,
      sheet: this._spriteSheet,
    });
    if (portrait) {
      const box = portraitFit(this._id, this._evo, texH);
      this._anim.y = barePlantY(box.padB, this._h, bodyH);
    } else {
      this._anim.y = 0;
    }
    const fit = this._h / Math.max(1, bodyH);
    this._anim.scale.set(fit * sx * this._face, fit * sy);
    this._anim.rotation = rot;
    if (this._dead) return;
    this._anim.alpha = this._flash > 0 ? 0.72 + Math.sin(this._flash * 40) * 0.22 : 1;
    this._anim.tint = this.holdPulse ? 0xffe6a8 : 0xffffff;
  }

  destroy(): void {
    this._anim.stop();
    this._anim.onComplete = undefined;
    this.view.destroy({ children: true });
  }

  private _pose(u: number): { ox: number; oy: number; lean: number; twist: number } {
    if (this._kind === 'hero' && (this._motion === 'lunge' || this._motion === 'crush')) {
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
    if (this._clip === 'idle') return;
    this._play('idle', this._idle.length > 1);
  }

  private _reload(): void {
    if (this._kind === 'hero' && this._bare) {
      this._spriteSheet = false;
      this._idlePortrait = true;
      this._atkPortrait = true;
      const portrait = heroTex(this._id, this._evo);
      this._idle = portrait ? [portrait] : frames(this._id, 'idle', 1);
      this._walk = this._idle;
      this._atk = this._idle;
      const keepAtk = this._clip === 'atk' && this._atkT >= 0;
      this._clip = '';
      if (keepAtk) this._play('atk', false);
      else this._holdRest();
      return;
    }
    if (this._kind === 'hero') {
      const idle = frames(this._id, 'idle', 4);
      const atk = frames(this._id, 'atk', 4);
      const portrait = heroTex(this._id, this._evo);
      const look = heroBattleLook(Boolean(portrait), idle.length, atk.length);
      this._spriteSheet = look.atkSheet || look.idle === 'sheet';
      this._idlePortrait = look.idle !== 'sheet' && Boolean(portrait);
      this._atkPortrait = !look.atkSheet && Boolean(portrait);
      if (look.idle === 'portrait' && portrait) {
        this._idle = [portrait];
        this._walk = [portrait];
        this._atk = look.atkSheet ? atk : [portrait];
      } else if (look.idle === 'sheet') {
        this._idle = idle;
        this._walk = idle;
        this._atk = look.atkSheet ? atk : idle;
      } else {
        this._idle = portrait ? [portrait] : frames(this._id, 'idle', 1);
        this._walk = this._idle;
        this._atk = this._idle;
      }
    } else {
      this._spriteSheet = false;
      this._idlePortrait = false;
      this._atkPortrait = false;
      const art = enemyArtId(this._id);
      const portrait = enemyTex(this._id);
      this._idle = portrait ? [portrait] : frames(art, 'idle', 1);
      this._walk = frames(art, 'walk', 4);
      this._atk = frames(art, 'atk', 4);
      if (this._walk.length === 0) this._walk = this._idle;
    }
    const keepAtk = this._clip === 'atk' && this._atkT >= 0;
    this._clip = '';
    if (keepAtk) this._play('atk', false);
    else this._holdRest();
  }

  private _play(name: 'idle' | 'walk' | 'atk', loop: boolean): boolean {
    const list = name === 'atk' ? this._atk : name === 'walk' ? this._walk : this._idle;
    if (list.length === 0) {
      this._anim.visible = false;
      return false;
    }
    this._anim.visible = !this._dead;
    if (name === this._clip && (loop || list.length <= 1)) return true;
    this._clip = name;
    this._anim.textures = list;
    this._anim.loop = loop && list.length > 1;
    this._anim.animationSpeed = (name === 'walk' ? 5 : 2) / 60;
    this._anim.onComplete = undefined;
    if (name === 'atk' || list.length === 1 || (!loop && name === 'idle')) this._anim.gotoAndStop(0);
    else this._anim.gotoAndPlay(0);
    return true;
  }
}
