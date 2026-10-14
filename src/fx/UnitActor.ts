/**
 * 局内只画立绘 / 切片，不再往身上叠盔、叠家伙。
 */
import * as PIXI from 'pixi.js';
import type { AttackFx } from '@/balance/fx';
import { animPath, enemyArtId, enemyTex, foeAtkPath, hasFoeAtk, heroTex, tex } from '@/core/TextureLoader';
import { primTex } from '@/fx/fxPrims';
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

function foeFrames(artId: string): PIXI.Texture[] {
  const out: PIXI.Texture[] = [];
  if (!hasFoeAtk(artId)) return out;
  for (let i = 0; i < 4; i += 1) {
    const t = tex(foeAtkPath(artId, i));
    if (t) out.push(t);
  }
  return out;
}

function sameFrames(a: readonly PIXI.Texture[], b: readonly PIXI.Texture[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
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

/** 飘着走的，不蹦，影子留在地上 */
const HOVER = new Set(['saucer', 'boss_saucer']);
/** 怪物统一压一点夕阳暖色，跟背景同一束光 */
const FOE_LIGHT = 0xfff1e4;
const KILL_LIFE = 0.32;
const STUN_TINT = 0xffd84a;
const SLOW_TINT = 0x7cf0b0;
const ELITE_TINT = 0xffa040;
/** 状态环贴图宽，按这个换算身宽 */
const RING_PX = 128;
const STAR_PX = 56;

export class UnitActor {
  readonly view = new PIXI.Container();
  private readonly _anim: PIXI.AnimatedSprite;
  private readonly _shadow = new PIXI.Graphics();
  /** 同一张图叠一层 ADD：亮的地方冲白，黑描边不动，就是受击白闪 */
  private readonly _glow = new PIXI.Sprite();
  private _flashMax = 0.12;
  private _knock = 0;
  private _stepT = Math.random() * Math.PI * 2;
  private _dropT = 0;
  private _dropLife = 0;
  private _landed = false;
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
  /** 被钉住 / 打晕：原地左右晃，头顶转星星，脚下一圈金光往里收 */
  dazed = false;
  /** 钉住还剩几秒。快到了星星先淡，玩家看得出要醒了 */
  dazedLeft = 0;
  /** 减速：脚下绿圈一圈圈往外荡 */
  slowed = false;
  /** 小头目：脚下常亮一圈橙光 */
  elite = false;
  private _ring: PIXI.Sprite | null = null;
  private _ring2: PIXI.Sprite | null = null;
  private _stars: PIXI.Sprite[] = [];
  private _halo: PIXI.Sprite | null = null;
  private _starA = 0;
  private _statusT = Math.random() * 4;
  /** 村里点中「要换掉」的人，呼吸放大，让玩家一眼看见换的是谁 */
  holdPulse = false;

  constructor() {
    this._anim = new PIXI.AnimatedSprite([PIXI.Texture.EMPTY]);
    this._anim.anchor.set(0.5, 1);
    this._anim.animationSpeed = 0.1;
    this._anim.visible = false;
    this._shadow.beginFill(0x1a0f08, 0.3).drawEllipse(0, 0, 1, 1).endFill();
    this._shadow.beginFill(0x1a0f08, 0.22).drawEllipse(0, 0, 0.62, 0.62).endFill();
    this._glow.anchor.set(0.5, 1);
    this._glow.blendMode = PIXI.BLEND_MODES.ADD;
    this._glow.visible = false;
    this.view.addChild(this._shadow, this._anim, this._glow);
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

  /** 怪物：挨打白闪 + 往后一挫；村民：放技能 / 吃加成的暖光 */
  flash(ms = 120): void {
    this._flash = ms / 1000;
    this._flashMax = this._flash;
    if (this._kind === 'enemy' && !this._dead) this._knock = 1;
  }

  /** 从天上砸下来，越落越快；着地那下压扁一挫 */
  dropIn(sec: number): void {
    this._dropT = sec;
    this._dropLife = sec;
    this._landed = false;
  }

  /** 刚着地的那一帧返回 true，只报一次 */
  takeLanding(): boolean {
    const l = this._landed;
    this._landed = false;
    return l;
  }

  get dead(): boolean {
    return this._dead;
  }

  /** 被打穿的那几帧还在播，别急着回收 */
  get dying(): boolean {
    return this._off && this._killFade > 0;
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
    this._killFade = KILL_LIFE;
    this._flash = 0.1;
    this._flashMax = 0.1;
    this._atkT = -1;
    this._anim.stop();
  }

  update(dt: number): void {
    if (this._flash > 0) this._flash = Math.max(0, this._flash - dt);
    if (this._knock > 0) this._knock = Math.max(0, this._knock - dt / 0.14);
    this._breath += dt * (this.holdPulse ? 3.6 : 2.1);
    let ox = 0;
    let oy = 0;
    let rot = 0;
    let stepX = 1;
    let stepY = 1;
    /** 离地多高（蹦起来 / 飘着），影子跟着缩 */
    let lift = 0;
    const hover = this._kind === 'enemy' && HOVER.has(enemyArtId(this._id));

    if (this._dead && this._off) {
      this._killFade = Math.max(0, this._killFade - dt);
      const u = this._killFade / KILL_LIFE;
      this._anim.alpha = Math.min(1, u * 2.2);
      this._anim.tint = 0x8a7a8e;
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
    } else if (this.walkBob && this._kind === 'enemy') {
      // 只有一张立绘的怪：左右脚轮流落地的颠步，落地一压、腾空一拉
      this._holdRest();
      // 大个子步子慢、晃得小、落地压得狠，看着有分量
      const heavy = this._id.startsWith('boss_');
      this._stepT += dt * (hover ? 3.2 : heavy ? 5.5 : 9.5);
      if (hover) {
        lift = this._h * (0.05 + Math.sin(this._stepT) * 0.025);
        rot = Math.sin(this._stepT * 0.5) * 0.06;
      } else {
        const s = Math.abs(Math.sin(this._stepT));
        lift = this._h * (heavy ? 0.025 : 0.045) * s;
        rot = Math.cos(this._stepT) * (heavy ? 0.04 : 0.075);
        const land = (1 - s) ** (heavy ? 3 : 1);
        stepX = 1 + land * (heavy ? 0.08 : 0.06);
        stepY = 1 - land * (heavy ? 0.09 : 0.07) + s * 0.03;
      }
    } else {
      this._holdRest();
      rot = this._kind === 'hero' ? this._tilt * 0.35 : 0;
      if (this.dazed) {
        rot = Math.sin(this._breath * 5) * 0.1;
        ox = Math.sin(this._breath * 5) * 3;
      }
      if (hover) lift = this._h * (0.05 + Math.sin(this._breath * 1.6) * 0.02);
    }
    if (this._dropT > 0) {
      this._dropT = Math.max(0, this._dropT - dt);
      const u = this._dropT / this._dropLife;
      const fall = this._h * 2.6 * u * u;
      lift += fall;
      if (this._dropT === 0) {
        this._landed = true;
        this._knock = 1;
      }
    }
    oy -= lift;

    const breath = !this._dead && this._atkT < 0 && this._clip === 'idle' && !this.walkBob
      ? Math.sin(this._breath)
      : 0;
    const amp = this.holdPulse ? 0.07 : this._kind === 'enemy' ? 0.035 : 0.018;
    // 被打穿：先拍扁，再往上一弹散掉
    const killP = this._off ? 1 - this._killFade / KILL_LIFE : 0;
    const flatP = Math.min(1, killP / 0.35);
    const popP = Math.max(0, (killP - 0.35) / 0.65);
    if (this._off) {
      lift += popP * this._h * 0.12;
      oy -= popP * this._h * 0.12;
    }
    const knock = this._knock * this._knock;
    if (knock > 0) oy -= knock * this._h * 0.06;
    let sx = this._off
      ? 1 + flatP * 0.3 - popP * 0.45
      : this._dead ? 1.12 : (1 - breath * (this.holdPulse ? 0.035 : 0.012)) * stepX;
    let sy = this._off
      ? 1 - flatP * 0.42 + popP * 0.1
      : this._dead ? 0.55 : (1 + breath * amp) * stepY;
    if (knock > 0) {
      sx *= 1 + knock * 0.14;
      sy *= 1 - knock * 0.12;
    }
    if (this._id && (this._idle.length === 0 || readyTexH(this._anim.texture.height) === null)) {
      this._reload();
    }
    const bodyClip = this._clip || 'idle';
    const texH = readyTexH(this._anim.texture.height);
    const bob = this.holdPulse ? -6 - breath * 5 : 0;
    this.view.position.set(this._feetX + ox, this._feetY + oy + bob);
    if (texH === null) {
      this._anim.visible = false;
      this._shadow.visible = false;
      this._glow.visible = false;
      return;
    }
    this._anim.visible = !this._dead || this._off;
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
    // 怪的攻击切片画的是朝左出手
    const dir = this._kind === 'enemy' && bodyClip === 'atk' && this._atk.length > 1 ? -this._face : this._face;
    this._anim.scale.set(fit * sx * dir, fit * sy);
    this._anim.rotation = rot;
    this._placeShadow(fit, lift - bob);
    this._placeGlow();
    this._placeStatus(dt, lift - bob);
    if (this._dead) return;
    this._anim.alpha = 1;
    this._anim.tint = this.holdPulse ? 0xffe6a8 : this._kind === 'enemy' ? FOE_LIGHT : 0xffffff;
  }

  /** 脚下接触影：宽度跟身形走，离地越高越小越淡；死了跟着散 */
  private _placeShadow(fit: number, lift: number): void {
    const s = this._shadow;
    const texW = this._anim.texture.width;
    if ((this._dead && !this._off) || texW <= 8) {
      s.visible = false;
      return;
    }
    s.visible = true;
    const w = Math.min(texW * fit * 0.36, this._h * 0.5);
    const up = clamp(lift / Math.max(1, this._h * 0.12), 0, 1);
    const shrink = 1 - up * 0.3;
    s.position.set(0, lift + this._h * 0.01);
    s.scale.set(w * shrink, w * 0.26 * shrink);
    const killA = this._off ? this._killFade / KILL_LIFE : 1;
    s.alpha = (1 - up * 0.35) * killA;
  }

  /** 脚下状态环 + 头顶星星。用到才建，平时一个精灵都不多 */
  private _placeStatus(dt: number, lift: number): void {
    this._statusT += dt;
    const alive = !this._dead;
    const stun = alive && this.dazed;
    const slow = alive && !stun && this.slowed;
    const elite = alive && this.elite;
    const want = stun || slow || elite;
    if (want && !this._ring) {
      const t = primTex('shock');
      if (t) {
        this._ring = new PIXI.Sprite(t);
        this._ring2 = new PIXI.Sprite(t);
        for (const r of [this._ring, this._ring2]) {
          r.anchor.set(0.5);
          r.blendMode = PIXI.BLEND_MODES.ADD;
          r.visible = false;
        }
        this.view.addChildAt(this._ring2, 1);
        this.view.addChildAt(this._ring, 1);
      }
    }
    const r1 = this._ring;
    const r2 = this._ring2;
    if (r1 && r2) {
      r1.visible = want;
      r2.visible = stun || slow;
      if (want) {
        const w = this._h * (this._id.startsWith('boss_') ? 0.8 : 0.95);
        const base = w / RING_PX;
        const y = lift + this._h * 0.01;
        r1.position.set(0, y);
        r2.position.set(0, y);
        const t = this._statusT;
        if (stun) {
          // 金圈往脚底收，像被钉在这儿
          const u = (t * 1.6) % 1;
          r1.tint = STUN_TINT;
          r1.alpha = 0.55 + Math.sin(t * 8) * 0.15;
          r1.scale.set(base, base * 0.34);
          r2.tint = 0xfff2b0;
          r2.alpha = 0.9 * u;
          r2.scale.set(base * (1.5 - 0.7 * u), base * 0.34 * (1.5 - 0.7 * u));
        } else if (slow) {
          const u = (t * 0.9) % 1;
          r1.tint = SLOW_TINT;
          r1.alpha = 0.45;
          r1.scale.set(base * 0.9, base * 0.3);
          r2.tint = SLOW_TINT;
          r2.alpha = 0.7 * (1 - u);
          r2.scale.set(base * (0.7 + 0.7 * u), base * 0.3 * (0.7 + 0.7 * u));
        } else {
          r1.tint = ELITE_TINT;
          r1.alpha = 0.5 + Math.sin(t * 3) * 0.12;
          r1.scale.set(base, base * 0.32);
        }
      }
    }

    const fadeOut = this.dazedLeft > 0 && this.dazedLeft < 0.3 ? this.dazedLeft / 0.3 : 1;
    this._starA = stun
      ? Math.min(fadeOut, this._starA + dt / 0.12)
      : Math.max(0, this._starA - dt / 0.15);
    if (this._starA > 0 && this._stars.length === 0) {
      const t = primTex('star');
      const ht = primTex('ring');
      if (ht) {
        this._halo = new PIXI.Sprite(ht);
        this._halo.anchor.set(0.5);
        this._halo.blendMode = PIXI.BLEND_MODES.ADD;
        this._halo.tint = STUN_TINT;
        this.view.addChild(this._halo);
      }
      if (t) {
        for (let i = 0; i < 3; i += 1) {
          const s = new PIXI.Sprite(t);
          s.anchor.set(0.5);
          this.view.addChild(s);
          this._stars.push(s);
        }
      }
    }
    if (this._stars.length === 0) return;
    const show = this._starA > 0;
    const size = Math.max(24, Math.min(40, this._h * 0.3)) / STAR_PX;
    const rx = this._h * 0.36;
    const ry = this._h * 0.11;
    const cy = lift - this._h * 0.96;
    if (this._halo) {
      this._halo.visible = show;
      this._halo.position.set(0, cy);
      this._halo.scale.set((rx * 2.3) / RING_PX, (ry * 2.6) / RING_PX);
      this._halo.alpha = this._starA * (0.5 + Math.sin(this._statusT * 6) * 0.12);
    }
    for (let i = 0; i < this._stars.length; i += 1) {
      const s = this._stars[i]!;
      s.visible = show;
      if (!show) continue;
      const a = this._statusT * 4.2 + (i * Math.PI * 2) / this._stars.length;
      const front = Math.sin(a);
      s.position.set(Math.cos(a) * rx, cy + front * ry);
      const k = size * (0.82 + front * 0.22) * (0.6 + 0.4 * this._starA);
      s.scale.set(k);
      s.rotation = this._statusT * 3 + i;
      s.alpha = this._starA * (0.62 + front * 0.38);
    }
  }

  private _placeGlow(): void {
    const g = this._glow;
    const k = this._flashMax > 0 ? this._flash / this._flashMax : 0;
    if (k <= 0.01 || (this._dead && !this._off)) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.texture = this._anim.texture;
    g.position.copyFrom(this._anim.position);
    g.scale.copyFrom(this._anim.scale);
    g.rotation = this._anim.rotation;
    if (this._kind === 'enemy') {
      g.tint = 0xffffff;
      g.alpha = Math.min(1, k * 1.25) * this._anim.alpha;
    } else {
      g.tint = 0xffd27a;
      g.alpha = Math.sin(Math.min(1, k) * Math.PI) * 0.55;
    }
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
    const was = this._clip ? this._listOf(this._clip) : null;
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
      this._idle = portrait ? [portrait] : [];
      this._walk = this._idle;
      this._atk = foeFrames(art);
    }
    // 别的图到了也会叫一遍重载。正在放的这段没变就接着放，不然走路帧天天被拉回第 0 帧
    if (was && this._clip && sameFrames(was, this._listOf(this._clip))) return;
    const keepAtk = this._clip === 'atk' && this._atkT >= 0;
    this._clip = '';
    if (keepAtk) this._play('atk', false);
    else this._holdRest();
  }

  private _listOf(name: 'idle' | 'walk' | 'atk'): PIXI.Texture[] {
    return name === 'atk' ? this._atk : name === 'walk' ? this._walk : this._idle;
  }

  private _play(name: 'idle' | 'walk' | 'atk', loop: boolean): boolean {
    const list = this._listOf(name);
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
