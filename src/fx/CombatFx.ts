/**
 * 观战导演。只吃战斗事件和坐标，不画单位、不算伤害。
 * 颜色 / 拖尾 / 落点全在 FxRecipe，粒子原语在 VfxKit。
 */
import * as PIXI from 'pixi.js';
import type { AttackFx, EnemyFx } from '@/balance/fx';
import { projSprite } from '@/balance/fx';
import { playSfx, buzz } from '@/core/SfxPlayer';
import { fillContain, projTex, vfxTex } from '@/core/TextureLoader';
import type { BattleEvent } from '@/game/BattleEngine';
import { VfxKit } from '@/fx/VfxKit';
import { attackLook, enemyLook, playImpact, playMuzzle, shouldFly, shotFlight, skinLook, type FxLook, type ShotBody } from '@/fx/FxRecipe';
import { ImpactGate, enemyImpactKey, heroImpactKey, type ImpactKey } from '@/fx/ImpactGate';
import { contactAt, motionForSkin, releaseAt } from '@/fx/UnitActor';

const MAX_FLOATS = 28;
const MAX_SHOTS = 40;

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
  beam: boolean;
  emit: number;
  done: boolean;
  land: () => void;
}

interface FlashBit {
  text: PIXI.Text;
  life: number;
  max: number;
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

/** 一发飞向某只怪的弹。连射、钩子、碾子都走这个，落地才出伤害 */
interface PelletBit {
  g: PIXI.Graphics;
  life: number;
  max: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: number;
  r: number;
  done: boolean;
  land: () => void;
}

/** 绝活打在一只怪身上的结果。数字和标记都画在这只怪上 */
export interface SkillMark {
  x: number;
  y: number;
  damage: number;
  killed: boolean;
  stun: boolean;
  push: boolean;
  slow: boolean;
  land?: () => void;
}

export class CombatFx {
  readonly layer = new PIXI.Container();
  private readonly _kit = new VfxKit();
  private readonly _floats: FloatBit[] = [];
  private readonly _shots: ShotBit[] = [];
  private readonly _flashes: FlashBit[] = [];
  private readonly _flies: FlyBit[] = [];
  private readonly _pellets: PelletBit[] = [];
  private _firstHit = true;
  downPulse = 0;
  landPulse = 0;
  hitStop = 0;
  /** 当前震屏幅度，像素。场景拿去抖战场，这里只负责衰减 */
  shakePx = 0;
  private _meleeRadius = 72;
  private readonly _waits: { t: number; fn: () => void }[] = [];
  private readonly _gate = new ImpactGate();

  constructor() {
    this.layer.addChild(this._kit.root);
  }

  reset(): void {
    this._firstHit = true;
    this.downPulse = 0;
    this.landPulse = 0;
    this.hitStop = 0;
    this.shakePx = 0;
    this._kit.reset();
    for (const f of this._floats) f.text.destroy();
    for (const s of this._shots) {
      s.body.destroy();
      s.spr?.destroy();
    }
    for (const s of this._flashes) s.text.destroy();
    for (const f of this._flies) f.g.destroy();
    for (const p of this._pellets) {
      if (!p.done) p.land();
      p.g.destroy();
    }
    this._floats.length = 0;
    this._shots.length = 0;
    this._flashes.length = 0;
    this._flies.length = 0;
    this._pellets.length = 0;
    this._waits.length = 0;
    this._gate.reset();
    this.layer.removeChildren();
    this.layer.addChild(this._kit.root);
  }

  holdingEnemy(id: number): boolean {
    return this._gate.holding(enemyImpactKey(id));
  }

  /** 还有弹没落地 / 出手没松手。结算板得等这一下完，不能盖住最后一发 */
  busy(): boolean {
    return this._shots.some((s) => !s.done)
      || this._pellets.some((p) => !p.done)
      || this._waits.length > 0
      || this._gate.busy();
  }

  /** 画面血见底：倒下淡出，后面几发打在空位上，不再钉着模型 */
  releaseEnemy(id: number): void {
    const key = enemyImpactKey(id);
    for (const fn of this._gate.release(key)) fn();
    this._gate.markLinger(key);
    this._after(0.22, () => this._gate.clearLinger(key));
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
      enemyId?: number;
      heroId?: string;
    },
  ): void {
    const color = pos.color ?? 0xffffff;
    if (pos.meleeR && pos.meleeR > 0) this._meleeRadius = pos.meleeR;

    if (ev.kind === 'hit' && pos.ex !== undefined && pos.ey !== undefined) {
      const key = pos.enemyId !== undefined ? enemyImpactKey(pos.enemyId) : undefined;
      if (key) this._gate.begin(key);
      const landHit = (): void => {
        this._impactHero(ev, pos.ex!, pos.ey!, color, pos.fx, pos.skin ? skinLook(pos.skin) : undefined);
        if (pos.slowed) this._spawnPlainFloat('减速', pos.ex!, pos.ey! + 10, 0x86efac, 16, 0.4);
        pos.onLand?.();
        this._finishLand(key);
      };
      if (pos.hx !== undefined && pos.hy !== undefined) {
        this._spawnHeroAttack(ev, pos.hx, pos.hy, pos.ex, pos.ey, color, pos.fx, pos.melee, pos.orb, landHit, pos.byPet, pos.skin);
      } else {
        landHit();
      }
    }

    if (ev.kind === 'foeHit' && pos.ex !== undefined && pos.ey !== undefined
      && pos.hx !== undefined && pos.hy !== undefined) {
      const key = pos.heroId ? heroImpactKey(pos.heroId) : undefined;
      if (key) this._gate.begin(key);
      this._spawnEnemyHit(ev, pos.ex, pos.ey, pos.hx, pos.hy, pos.enemyFx ?? 'claw', () => {
        pos.onLand?.();
        this._finishLand(key);
      });
    }

    if (ev.kind === 'foeDown' && pos.ex !== undefined && pos.ey !== undefined) {
      const key = pos.enemyId !== undefined ? enemyImpactKey(pos.enemyId) : undefined;
      const play = (): void => {
        this._death(pos.ex!, pos.ey!, 0xffb070);
        playSfx('enemy_down', 80);
        playSfx('kill_pop', 80);
        this.hitStop = Math.max(this.hitStop, 0.045);
        pos.onLand?.();
      };
      if (!key || !this._gate.defer(key, play)) play();
    }

    if (ev.kind === 'villagerDown' && pos.hx !== undefined && pos.hy !== undefined) {
      const key = pos.heroId ? heroImpactKey(pos.heroId) : undefined;
      const play = (): void => {
        this.downPulse = 0.4;
        this._death(pos.hx!, pos.hy!, 0x9aa4bf);
        playSfx('hero_down', 0);
      };
      if (!key || !this._gate.defer(key, play)) play();
    }

    if (ev.kind === 'heal' && pos.tx !== undefined && pos.ty !== undefined) {
      this._kit.plate('heal', pos.tx, pos.ty, { tint: 0x86efac, s0: 0.28, s1: 0.55, life: 0.32, add: false });
      this._kit.spray(pos.tx, pos.ty, { n: 7, tint: 0x86efac, kind: 'glow', speed: 80, gy: -40 });
      if (ev.amount > 0) {
        this._spawnPlainFloat(`+${Math.round(ev.amount)}`, pos.tx, pos.ty - 24, 0x86efac, 24, 0.5);
      }
      playSfx('skill', 160);
    }

    if (ev.kind === 'villagerUp' && pos.hx !== undefined && pos.hy !== undefined) {
      this._kit.plate('heal', pos.hx, pos.hy, { tint: 0xfde68a, s0: 0.32, s1: 0.62, life: 0.4, add: false });
      this._kit.spray(pos.hx, pos.hy, { n: 10, tint: 0xfde68a, kind: 'glow', speed: 90, gy: -30 });
      this._spawnPlainFloat('爬起来', pos.hx, pos.hy - 20, 0xfde68a, 22, 0.55);
      playSfx('win', 80);
    }

    if (ev.kind === 'burst' && pos.hx !== undefined && pos.hy !== undefined) {
      this._kit.plate('blast', pos.hx, pos.hy, { tint: 0xffffff, s0: 0.32, s1: 0.48, life: 0.36 });
      this._kit.spray(pos.hx, pos.hy, { n: 12, tint: 0xff8a4a, kind: 'spark', speed: 120, gy: 10 });
      playSfx('hit_smash', 40);
    }

    /*
     * 漏怪要做得**比击杀更响**。它是这一版唯一的判负条件，
     * 玩家必须能立刻回答「我刚才是哪一路崩的」——
     * 上一版的失败是队灭，屏幕上人躺下就够明显了，漏怪没有这种天然可见性，
     * 所以这里要靠一次红闪 + 一行字把它砸出来。少了它失败就变成莫名其妙。
     */
    if (ev.kind === 'leak' && pos.hx !== undefined && pos.hy !== undefined) {
      this._kit.plate('flash', pos.hx, pos.hy, { tint: 0xff5a5a, s0: 0.36, s1: 0.7, life: 0.4, add: false });
      this._kit.ring(pos.hx, pos.hy, 0xff5a5a, 0.6);
      this._kit.spray(pos.hx, pos.hy, { n: 14, tint: 0xff7a7a, kind: 'spark', speed: 200, life: 0.4 });
      this._spawnFlash('漏了一个', pos.hx, pos.hy - 40);
      this.downPulse = 0.5;
      this.hitStop = Math.max(this.hitStop, 0.07);
      playSfx('leak', 0);
      buzz('heavy');
    }
  }

  /**
   * 放一招。起手只在人身上闪一下，结果画在挨到的那几只身上。
   * 连射是一串弹挨个打过去；锤、网、钩、碾子各走各的落点。
   */
  playSkill(
    id: string,
    fromX: number,
    fromY: number,
    hits: readonly SkillMark[],
    aids: readonly { x: number; y: number; guard: boolean; haste: boolean }[],
  ): void {
    this._kit.plate('flash', fromX, fromY, { tint: 0xffffff, s0: 0.45, s1: 0.9, life: 0.22, add: false });
    playSfx('sk_cast', 80);
    const ordered = [...hits].sort((a, b) => b.y - a.y);
    const kind = skillVerb(id);
    if (ordered.length > 0) {
      if (kind === 'volley') this._volley(fromX, fromY, ordered);
      else if (kind === 'roll') this._along(fromX, fromY, ordered, 0xffd28a, 16, 0.16, 'sk_shock');
      else if (kind === 'net') this._shotsAt(fromX, fromY, ordered, 0xfde68a, 7, 0.07, 'sk_stun');
      else if (kind === 'hook') this._shotsAt(fromX, fromY, ordered, 0xe8e0d4, 5, 0.05, 'atk_pierce');
      else if (kind === 'blast') this._pops(id, ordered);
      else if (kind === 'reach') this._shotsAt(fromX, fromY, ordered, 0xffb020, 6, 0.045, id === 'dianju' ? 'atk_saw' : 'atk_slash');
      else if (ordered.every((h) => h.damage <= 0 && h.stun)) {
        this._shotsAt(fromX, fromY, ordered, 0xfde68a, 7, 0.06, 'sk_stun');
      } else if (ordered.every((h) => h.damage <= 0 && h.push)) {
        this._shotsAt(fromX, fromY, ordered, 0xffd66b, 6, 0.05, 'sk_shock');
      } else this._pops('smash', ordered);
    }
    for (const a of aids) {
      if (a.guard) {
        this._kit.plate('shield', a.x, a.y - 36, { tint: 0xffd66b, s0: 0.35, s1: 0.5, life: 0.9, add: false });
        this._spawnPlainFloat('护住', a.x, a.y - 52, 0xffd66b, 22, 0.8, 1.1);
      }
      if (a.haste) {
        this._kit.spray(a.x, a.y, { n: 8, tint: 0x7dd3fc, kind: 'spark', speed: 140, gy: -20 });
        this._spawnPlainFloat('手快', a.x, a.y - 28, 0x7dd3fc, 22, 0.8, 1.1);
      }
    }
    if (aids.length > 0 && ordered.length === 0) playSfx('sk_heal', 80);
    const kills = ordered.filter((h) => h.killed).length;
    if (kills >= 3) {
      const last = ordered[ordered.length - 1]!;
      this._after(0.35 + ordered.length * 0.06, () => {
        this._spawnFlash(`一招带走 ${kills} 只！`, last.x, last.y - 36, 34, 0.9);
        playSfx('sk_multi', 200);
      });
    }
  }

  /** 震一下屏。叠加取大，不累加，免得连招把画面震散 */
  shake(px: number): void {
    this.shakePx = Math.max(this.shakePx, px);
  }

  /** 滑轮连射：每只怪连吃三发，数字跟第一发一起出来 */
  private _volley(x0: number, y0: number, hits: readonly SkillMark[]): void {
    playSfx('sk_lane', 60);
    let delay = 0.04;
    for (const h of hits) {
      for (let s = 0; s < 3; s += 1) {
        const show = s === 0 ? h : undefined;
        this._after(delay, () => this._pellet(x0, y0, h.x, h.y, 0xffe08a, 5, 0.12, () => {
          if (show) this._impact(show, 'bolt');
          else this._kit.spray(h.x, h.y, { n: 4, tint: 0xffe08a, kind: 'spark', speed: 120 });
        }));
        delay += 0.05;
      }
    }
  }

  /** 一发接一发沿路滚过去，碾子用。每到一只怪才炸 */
  private _along(
    x0: number, y0: number, hits: readonly SkillMark[],
    color: number, r: number, step: number, sfx: string,
  ): void {
    playSfx(sfx, 60);
    let delay = 0.05;
    let px = x0;
    let py = y0;
    for (const h of hits) {
      const fromX = px;
      const fromY = py;
      const mark = h;
      this._after(delay, () => this._pellet(fromX, fromY, mark.x, mark.y, color, r, step * 0.85, () => {
        this._impact(mark, 'smash');
      }));
      delay += step;
      px = h.x;
      py = h.y;
    }
  }

  /** 每人一发，几乎同时出手，落地各算各的。网、钩、电锯走这里 */
  private _shotsAt(
    x0: number, y0: number, hits: readonly SkillMark[],
    color: number, r: number, step: number, sfx: string,
  ): void {
    playSfx(sfx, 60);
    hits.forEach((h, i) => {
      this._after(0.04 + i * step, () => this._pellet(x0, y0, h.x, h.y, color, r, 0.16, () => {
        this._impact(h, sfx === 'sk_stun' ? 'net' : 'bolt');
      }));
    });
  }

  /** 炸在每只怪身上。全场一起响；烟花、高压锅顺着路一颗颗炸 */
  private _pops(id: string, hits: readonly SkillMark[]): void {
    const together = id === 'sanshen';
    playSfx(id === 'smash' ? 'sk_shock' : 'sk_burst', 60);
    if (id === 'smash') this.shake(8);
    hits.forEach((h, i) => {
      const wait = together ? 0.08 : 0.05 + i * 0.07;
      this._after(wait, () => this._impact(h, id === 'smash' ? 'smash' : 'blast'));
    });
  }

  private _pellet(
    x0: number, y0: number, x1: number, y1: number,
    color: number, r: number, fly: number, land: () => void,
  ): void {
    if (this._pellets.length >= 36) {
      const old = this._pellets.shift();
      if (old && !old.done) old.land();
      old?.g.destroy();
    }
    const g = new PIXI.Graphics();
    this.layer.addChild(g);
    this._pellets.push({
      g, life: fly, max: fly, x0, y0, x1, y1, color, r, done: false, land,
    });
  }

  private _drawPellet(p: PelletBit): void {
    const g = p.g;
    g.clear();
    const u = Math.min(1, 1 - Math.max(0, p.life) / p.max);
    const x = p.x0 + (p.x1 - p.x0) * u;
    const y = p.y0 + (p.y1 - p.y0) * u;
    g.beginFill(p.color, 0.95).drawCircle(x, y, p.r).endFill();
    g.beginFill(0xfff6d0, 0.9).drawCircle(x, y, Math.max(2, p.r * 0.45)).endFill();
  }

  /** 落在怪身上：伤害数字、定身的网、击退和减速的字 */
  private _impact(h: SkillMark, look: 'bolt' | 'smash' | 'blast' | 'net'): void {
    h.land?.();
    if (look === 'smash') {
      this._kit.plate('sk_shock', h.x, h.y, { s0: 0.35, s1: 0.62, life: 0.35, add: false });
    } else if (look === 'blast') {
      this._kit.plate('sk_burst', h.x, h.y, { s0: 0.28, s1: 0.5, life: 0.32, add: false });
    } else if (look === 'net') {
      this._kit.plate('sk_stun', h.x, h.y - 8, { s0: 0.42, s1: 0.55, life: 1.1, add: false });
    } else {
      this._kit.plate('blast', h.x, h.y, { tint: 0xffe08a, s0: 0.28, s1: h.killed ? 0.6 : 0.42, life: 0.28 });
    }
    if (h.stun && look !== 'net') {
      this._kit.plate('sk_stun', h.x, h.y - 16, { s0: 0.4, s1: 0.55, life: 1.1, add: false });
    }
    this._kit.spray(h.x, h.y, { n: h.killed ? 12 : 7, tint: 0xffb040, kind: 'spark', speed: h.killed ? 220 : 150 });
    if (h.damage > 0) {
      this._spawnPlainFloat(`-${Math.round(h.damage)}`, h.x, h.y - 18, 0xffe066, h.killed ? 34 : 30, 0.85, 1.3);
    }
    if (h.push) this._spawnPlainFloat('击退', h.x + 28, h.y - 8, 0xffd66b, 20, 0.7, 1);
    if (h.slow) this._spawnPlainFloat('减速', h.x - 26, h.y + 8, 0x86efac, 20, 0.7, 1);
    if (h.stun) playSfx('sk_stun', 90);
    else if (h.damage > 0) playSfx(h.killed ? 'hit_counter' : 'hit_blast', 45);
  }

  /** 飘一行字，定住、护住、快漏了这种 */
  floatText(msg: string, x: number, y: number, color: number, size = 18): void {
    this._spawnPlainFloat(msg, x, y, color, size, 0.5);
  }

  markLand(x?: number, y?: number): void {
    this.landPulse = 0.28;
    if (x !== undefined && y !== undefined) {
      this._kit.ring(x, y, 0xffd66b, 0.5);
      this._kit.plate('flash', x, y, { tint: 0xffe08a, s0: 0.28, s1: 0.58, life: 0.34, add: false });
    }
    playSfx('hero_land', 0);
  }

  update(dt: number): void {
    this.downPulse = Math.max(0, this.downPulse - dt);
    this.landPulse = Math.max(0, this.landPulse - dt);
    this.shakePx = this.shakePx < 0.5 ? 0 : this.shakePx * Math.exp(-dt * 14);
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

    for (let i = this._pellets.length - 1; i >= 0; i -= 1) {
      const p = this._pellets[i];
      if (!p) continue;
      p.life -= dt;
      this._drawPellet(p);
      if (p.life <= 0 && !p.done) {
        p.done = true;
        p.land();
      }
      if (p.life <= -0.02) {
        p.g.destroy();
        this._pellets.splice(i, 1);
      }
    }

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
      s.text.alpha = Math.min(1, Math.max(0, s.life / Math.min(0.4, s.max)));
      const t = 1 - s.life / s.max;
      s.text.scale.set(t < 0.12 ? 1.5 - (t / 0.12) * 0.5 : 1);
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
    const tint = ev.killed ? mix(look.tint, 0xffd66b, 0.4) : look.tint;
    const land = (): void => {
      onLand?.();
    };
    const motion = motionForSkin(skin, style);
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
      this._pushShot({
        x0, y0, x1, y1, color: tint, kind: style,
        fly: shotFlight(look, dist, !!melee),
        look,
        land,
      });
    });
  }

  private _spawnEnemyHit(
    ev: Extract<BattleEvent, { kind: 'foeHit' }>,
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
      if (ev.damage > 0) {
        this._hurtHero(ev.damage, x1, y1);
        playSfx('hit', 70);
        this._enemyLand(fx, x1, y1);
      }
      onLand?.();
    };
    this._after(releaseAt('lunge', 'enemy', false, true), () => {
      playSfx(`enemy_${fx}`, look.quiet ? 40 : 70);
      const ang = Math.atan2(y1 - y0, x1 - x0);
      if (!look.quiet) playMuzzle(this._kit, look, x0, y0, ang);
      if (!shouldFly(look, !!look.instant)) {
        land();
        return;
      }
      this._pushShot({
        x0, y0, x1, y1, color, kind: fx,
        fly: Math.min(0.4, shotFlight(look, Math.hypot(x1 - x0, y1 - y0))),
        look,
        land,
      });
    });
  }

  private _after(t: number, fn: () => void): void {
    if (t <= 0) fn();
    else this._waits.push({ t, fn });
  }

  private _finishLand(key: ImpactKey | undefined): void {
    if (!key) return;
    const extra = this._gate.settle(key);
    for (const fn of extra) fn();
    if (extra.length === 0) return;
    this._gate.markLinger(key);
    this._after(0.22, () => this._gate.clearLinger(key));
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
      if (old && !old.done) old.land();
      old?.body.destroy();
      old?.spr?.destroy();
    }
    const energy = spec.kind === 'beam' || spec.look?.beam
      ? 'pierce'
      : spec.kind === 'claw' ? 'claw'
        : spec.kind === 'bash' ? 'smash'
          : null;
    const physName = energy ? null : (spec.look?.proj ?? projSprite(spec.kind as AttackFx));
    const physical = !!physName;
    const shot = energy ? vfxTex(energy)
      : physName ? projTex(physName)
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
        ?? (energy ? 24
          : spec.kind === 'orb' ? 26
            : spec.kind === 'slash' ? 24
              : spec.kind === 'sniper' ? 18
                : spec.kind === 'bolt' ? 20
                  : spec.kind === 'poke' ? 22 : 16);
      spr.scale.set(px / native);
      this.layer.addChild(spr);
    }
    const body = new PIXI.Graphics();
    body.blendMode = physical || spec.look?.dry || spec.kind === 'orb' || spec.kind === 'wind' || spec.kind === 'blast'
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
      beam: !!spec.look?.beam,
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
    if (s.beam) {
      const nx = Math.cos(ang);
      const ny = Math.sin(ang);
      g.lineStyle(4, s.color, 0.55 * fade);
      g.moveTo(s.x0, s.y0);
      g.lineTo(p.x, p.y);
      g.lineStyle(3, 0xffffff, 0.75 * fade);
      g.moveTo(s.x0 + nx * 8, s.y0 + ny * 8);
      g.lineTo(p.x, p.y);
      g.lineStyle(0);
    }
    if (s.physical && s.spr) {
      g.beginFill(0x1a0c08, 0.38 * fade).drawCircle(p.x + 1, p.y + 3, 4).endFill();
    }
    if (!s.spr) {
      this._drawFallbackProj(g, s, p, fade);
      return;
    }
    if (s.shape === 'none' || s.kind === 'orb' || s.kind === 'wind' || s.kind === 'blast') return;
    const nx = Math.cos(ang);
    const ny = Math.sin(ang);
    const len = s.kind === 'sniper' ? 36 : s.kind === 'pierce' || s.kind === 'beam' || s.kind === 'poke' ? 32 : 26;
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
      g.beginFill(0xf5d0fe, 0.95 * fade).drawCircle(p.x, p.y, 7).endFill();
      g.beginFill(0xc084fc, 0.85 * fade).drawCircle(p.x, p.y, 4).endFill();
      return;
    }
    if (s.kind === 'sniper') {
      g.beginFill(0x1a0c08, 0.4 * fade).drawCircle(p.x + 1, p.y + 2, 5).endFill();
      g.beginFill(0xe8d4b0, 0.98 * fade).drawCircle(p.x, p.y, 5).endFill();
      g.beginFill(0x8a7355, 0.95 * fade).drawCircle(p.x - 1, p.y - 1, 3).endFill();
      return;
    }
    if (s.kind === 'wind') {
      g.beginFill(0x86efac, 0.8 * fade).drawEllipse(p.x, p.y, 8, 4).endFill();
      return;
    }
    if (s.kind === 'blast') {
      g.beginFill(0xff8a3a, 0.9 * fade).drawRoundedRect(p.x - 4, p.y - 6, 8, 12, 3).endFill();
      return;
    }
    if (s.kind === 'poke') {
      g.lineStyle(3, 0x9bb8c4, 0.9 * fade);
      g.moveTo(p.x - 8, p.y);
      g.lineTo(p.x + 8, p.y);
      g.lineStyle(0);
      return;
    }
    if (s.kind === 'pierce') {
      g.lineStyle(2, 0xc9a227, 0.9 * fade);
      g.moveTo(p.x - 9, p.y);
      g.lineTo(p.x + 9, p.y);
      g.lineStyle(0);
      g.beginFill(0xe8c84a, 0.8 * fade).drawCircle(p.x + 8, p.y, 2).endFill();
      return;
    }
    if (s.kind === 'slash') {
      g.beginFill(0x6b5a4a, 0.95 * fade).drawRoundedRect(p.x - 9, p.y - 3, 14, 5, 2).endFill();
      g.beginFill(0xe8e0d4, 0.95 * fade).drawPolygon([
        p.x + 4, p.y - 4,
        p.x + 11, p.y,
        p.x + 4, p.y + 4,
      ]).endFill();
      return;
    }
    g.beginFill(s.color, 0.9 * fade).drawCircle(p.x, p.y, 4).endFill();
    g.beginFill(0xffffff, 0.55 * fade).drawCircle(p.x, p.y, 2).endFill();
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
    // 会心下线了，强调改挂在「这一下打死了」上：收人头那一下最该被看见
    playSfx(ev.killed ? 'hit_counter' : `hit_${fx}`, ev.killed ? 50 : 80);
    const look = lookArg ?? attackLook(fx);
    const stop = playImpact(this._kit, look, x, y, ev.killed);
    this.hitStop = Math.max(this.hitStop, stop);
    if (look.buzz) buzz(ev.killed ? 'heavy' : look.buzz);
    else if (ev.killed) buzz('heavy');
  }

  private _enemyLand(fx: EnemyFx, x: number, y: number): void {
    const look = enemyLook(fx);
    const stop = playImpact(this._kit, look, x, y, false);
    this.hitStop = Math.max(this.hitStop, stop);
    if (look.buzz) buzz(look.buzz);
  }

  private _death(x: number, y: number, tint: number): void {
    this._kit.plate('blast', x, y, { tint: 0xffffff, s0: 0.28, s1: 0.44, life: 0.28 });
    this._kit.ring(x, y, tint, 0.3);
    this._kit.spray(x, y, { n: 16, tint, kind: 'spark', speed: 260, life: 0.34, gy: 40 });
    this._kit.spray(x, y, { n: 6, tint, kind: 'glow', speed: 90, life: 0.3, scale: 0.16, gy: 20 });
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
    const size = first ? 28 : ev.killed ? 22 : 16;
    const color = ev.killed || first ? 0xffe066 : 0xffb24a;
    this._spawnPlainFloat(
      String(Math.round(ev.damage)),
      x,
      y - 10,
      color,
      size,
      first ? 0.95 : ev.killed ? 0.78 : 0.62,
      ev.killed || first ? 1.22 : 1.06,
    );
  }

  private _hurtHero(damage: number, x: number, y: number): void {
    this._spawnPlainFloat(`-${Math.round(damage)}`, x, y - 8, 0xff6b6b, 14, 0.55, 1);
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
      strokeThickness: Math.max(3, Math.round(size * 0.18)),
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

  private _spawnFlash(name: string, x: number, y: number, size = 22, life = 0.4): void {
    const text = new PIXI.Text(name, {
      fontFamily: 'sans-serif',
      fontSize: size,
      fontWeight: 'bold',
      fill: 0xffd66b,
      stroke: 0x0b0f18,
      strokeThickness: Math.max(4, Math.round(size * 0.2)),
    });
    text.anchor.set(0.5);
    text.position.set(x, y);
    this.layer.addChild(text);
    this._flashes.push({ text, life, max: life });
  }
}

/** 这招画面走哪一种。按招本身干什么分，不按攻击范围分 */
function skillVerb(id: string): 'volley' | 'roll' | 'net' | 'hook' | 'blast' | 'smash' | 'reach' | 'aid' {
  switch (id) {
    case 'laoyanqiang': return 'volley';
    case 'shimo': return 'roll';
    case 'yuwang':
    case 'jishi': return 'net';
    case 'laoli':
    case 'qiangou': return 'hook';
    case 'bianpao':
    case 'gaoyaguo':
    case 'sanshen':
    case 'baowenhu': return 'blast';
    case 'dianju':
    case 'shazhu': return 'reach';
    case 'dachui':
    case 'miankuzhang':
    case 'chengtuo': return 'smash';
    default: return 'aid';
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
