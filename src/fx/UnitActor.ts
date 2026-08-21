/**
 * 待机几乎不动，出手才切帧。
 * AI 闲置图集各帧道具对不齐（锤子会闪没），所以村民待机只用过稿立绘 + 很轻的呼吸。
 *
 * 大小只跟身体走，不跟当前帧包围盒走。出手只位移、转身，不缩放。
 */
import * as PIXI from 'pixi.js';
import type { AttackFx } from '@/balance/fx';
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

/** 接触帧卡在突刺顶点。重锤：慢蓄 → 一帧抡出去 → 砸住 */
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
  private readonly _hammer = new PIXI.Sprite();
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
  private _breath = Math.random() * Math.PI * 2;
  private _swing = false;
  walkBob = false;

  constructor() {
    this._anim = new PIXI.AnimatedSprite([PIXI.Texture.WHITE]);
    this._anim.anchor.set(0.5, 1);
    this._anim.animationSpeed = 0.1;
    this.view.addChild(this._anim);
    this._hammer.anchor.set(0.28, 0.7);
    this._hammer.visible = false;
    this.view.addChild(this._hammer);
  }

  bindHero(id: string): void {
    this._id = id;
    this._kind = 'hero';
    this.walkBob = false;
    this._reload();
  }

  bindEnemy(id: string): void {
    this._id = id;
    this._kind = 'enemy';
    this._reload();
  }

  place(x: number, feetY: number, h: number): void {
    this._feetX = x;
    this._feetY = feetY;
    this._h = h;
  }

  /** 待机看向威胁；出手中不转，避免半招翻面 */
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
    this._atkLife = motion === 'crush' ? 0.48
      : this._atk.length > 1 ? 0.38
        : motion === 'sling' ? 0.34 : 0.26;
    this._atkT = 0;
    if (motion === 'crush' && this._startHammerSwing()) return;
    this._play('atk', false);
    this._anim.stop();
    this._anim.gotoAndStop(0);
  }

  flash(ms = 120): void {
    this._flash = ms / 1000;
  }

  setDead(dead: boolean): void {
    this._dead = dead;
    if (dead) {
      this._stopHammer();
      this._anim.stop();
      this._anim.tint = 0x6b7394;
    }
  }

  update(dt: number): void {
    if (this._flash > 0) this._flash = Math.max(0, this._flash - dt);
    this._breath += dt * 2.1;
    let ox = 0;
    let oy = 0;
    let rot = 0;

    if (this._dead) {
      rot = 0.32;
      this._anim.alpha = 0.45;
    } else if (this._atkT >= 0) {
      this._atkT += dt;
      const u = Math.min(1, this._atkT / this._atkLife);
      const pose = this._pose(u);
      ox = pose.ox;
      oy = pose.oy;
      rot = this._tilt * pose.lean;
      if (this._swing) this._tickHammer(u);
      else if (this._atk.length > 1) this._anim.gotoAndStop(atkFrame(u, this._atk.length, this._motion === 'crush'));
      if (u >= 1) {
        this._atkT = -1;
        this._stopHammer();
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
    const sx = this._dead ? 1.12 : 1 - breath * 0.01;
    const sy = this._dead ? 0.55 : 1 + breath * 0.018;
    const bodyClip = this._swing ? 'idle' : (this._clip || 'idle');
    const fit = this._h / clipBody(this._id, bodyClip, this._anim.texture.height || this._h);
    this._anim.scale.set(fit * sx * this._face, fit * sy);
    this._anim.rotation = rot;
    this.view.position.set(this._feetX + ox, this._feetY + oy);
    if (this._dead) return;
    this._anim.alpha = this._flash > 0 ? 0.72 + Math.sin(this._flash * 40) * 0.22 : 1;
    this._anim.tint = 0xffffff;
  }

  destroy(): void {
    this._stopHammer();
    this._anim.stop();
    this._anim.onComplete = undefined;
    this.view.destroy({ children: true });
  }

  private _startHammerSwing(): boolean {
    const ham = tex('images/fx_hammer.png');
    const grip = tex('images/hero_dachui_grip.png');
    if (this._id !== 'dachui' || !ham || !grip) return false;
    this._hammer.texture = ham;
    this._swing = true;
    this._hammer.visible = true;
    if (grip) {
      this._anim.textures = [grip];
      this._clip = 'atk';
      this._anim.gotoAndStop(0);
    } else {
      this._clip = 'atk';
    }
    this._tickHammer(0);
    return true;
  }

  private _stopHammer(): void {
    this._swing = false;
    this._hammer.visible = false;
  }

  private _tickHammer(u: number): void {
    const texH = Math.max(1, this._hammer.texture.height);
    const fit = (this._h * 0.9) / texH;
    this._hammer.scale.set(fit, fit);
    // 握在胸口双手上，不从脚底长出来
    this._hammer.position.set(this._face * this._h * 0.06, -this._h * 0.64);

    // 贴图锤头在右上。世界角：0 朝右，-π/2 朝上。全程走肩→身侧平举→天上，不扫地面。
    const headLocal = -Math.PI / 4;
    const shoulder = -0.55;
    const windup = 0.1;
    const impact = -1.42;
    const follow = -1.12;
    let head = shoulder;
    if (u < 0.36) {
      head = shoulder + (windup - shoulder) * (u / 0.36);
    } else if (u < 0.54) {
      const p = (u - 0.36) / 0.18;
      head = windup + (impact - windup) * (p * p);
    } else {
      const p = Math.min(1, (u - 0.54) / 0.46);
      head = impact + (follow - impact) * p;
    }
    if (this._face < 0) head = Math.PI - head;
    this._hammer.rotation = head - headLocal;
    this._hammer.alpha = u < 0.9 ? 1 : 1 - (u - 0.9) / 0.1;
  }

  private _pose(u: number): { ox: number; oy: number; lean: number } {
    if (this._motion === 'sling') {
      const pull = u < 0.42 ? u / 0.42 : u < 0.56 ? 1 : Math.max(0, 1 - (u - 0.56) / 0.44);
      return { ox: -this._nx * 11 * pull, oy: -this._ny * 9 * pull, lean: -0.55 * pull };
    }
    if (this._motion === 'recoil') {
      const d = Math.sin(u * Math.PI);
      return { ox: -this._nx * 8 * d, oy: -this._ny * 6 * d, lean: -0.4 * d };
    }
    if (this._motion === 'crush') {
      if (u < 0.36) {
        const p = u / 0.36;
        return { ox: -this._nx * 2 * p, oy: 0, lean: -0.22 * p };
      }
      const t = (u - 0.36) / 0.64;
      const d = Math.sin(Math.min(1, t) * Math.PI);
      return { ox: this._nx * 4 * d, oy: this._ny * 5 * d, lean: 0.35 * d };
    }
    if (u < 0.3) {
      const p = u / 0.3;
      return { ox: -this._nx * 7 * p, oy: -this._ny * 8 * p, lean: -0.7 * p };
    }
    const t = (u - 0.3) / 0.7;
    const d = Math.sin(Math.min(1, t) * Math.PI);
    return { ox: this._nx * 10 * d, oy: this._ny * 16 * d, lean: 0.85 * d };
  }

  private _holdRest(): void {
    if (this._clip === 'idle' && this._idle.length <= 1) return;
    this._play('idle', false);
  }

  private _reload(): void {
    const portrait = this._kind === 'hero' ? heroTex(this._id) : enemyTex(this._id);
    this._idle = portrait ? [portrait] : frames(this._id, 'idle', 1);
    this._walk = frames(this._id, 'walk', 4);
    this._atk = frames(this._id, 'atk', 4);
    if (this._walk.length === 0) this._walk = this._idle;
    const keepAtk = this._clip === 'atk' && this._atkT >= 0;
    this._clip = '';
    if (keepAtk) this._play('atk', false);
    else this._holdRest();
  }

  private _play(name: 'idle' | 'walk' | 'atk', loop: boolean): boolean {
    const list = name === 'atk' ? this._atk : name === 'walk' ? this._walk : this._idle;
    if (list.length === 0) return false;
    if (name === this._clip && (loop || list.length === 1)) return true;
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
