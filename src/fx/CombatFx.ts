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
  /** 飞的这一路一直盯着这只怪，落点跟着它走 */
  track?: { id: number; dx: number; dy: number };
  land: (x: number, y: number) => void;
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

/** 绝活出手：锤子、碾子、网、钩，各画各的，不共用一团火花 */
type StampKind =
  | 'hammer' | 'roller' | 'net' | 'hook' | 'saw' | 'arc' | 'slash' | 'pot'
  | 'lid' | 'horn' | 'cart' | 'steam' | 'dog' | 'chick' | 'boom' | 'bass'
  | 'scrap' | 'shell' | 'bloom' | 'ring';

interface StampBit {
  g: PIXI.Graphics;
  kind: StampKind;
  life: number;
  max: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  color: number;
  wide: number;
  done: boolean;
  follow?: { mark: SkillMark; dy: number };
  land: () => void;
}

/** 绝活打在一只怪身上的结果。数字和标记都画在这只怪上 */
export interface SkillMark {
  /** 有 id 就跟着这只怪走；x / y 是出招那一刻的位置 */
  foeId?: number;
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
  private readonly _stamps: StampBit[] = [];
  private _firstHit = true;
  downPulse = 0;
  landPulse = 0;
  hitStop = 0;
  /** 当前震屏幅度，像素。场景拿去抖战场，这里只负责衰减 */
  shakePx = 0;
  private _meleeRadius = 72;
  private readonly _waits: { t: number; fn: () => void }[] = [];
  private readonly _gate = new ImpactGate();
  private _locate: ((id: number) => { x: number; y: number } | undefined) | null = null;

  constructor() {
    this.layer.addChild(this._kit.root);
  }

  /** 怪此刻的身子中心。弹在路上它还在走，落点得每帧问一次 */
  setFoeLocator(fn: (id: number) => { x: number; y: number } | undefined): void {
    this._locate = fn;
  }

  /** 绝活打到这只怪：倒下要等这一下落上去 */
  holdFoe(id: number): void {
    this._gate.begin(enemyImpactKey(id));
  }

  landFoe(id: number): void {
    this._finishLand(enemyImpactKey(id));
  }

  private _foeAt(id: number | undefined): { x: number; y: number } | undefined {
    return id === undefined ? undefined : this._locate?.(id);
  }

  /** 把绝活标记挪到这只怪现在站的地方 */
  private _sync(h: SkillMark): SkillMark {
    const p = this._foeAt(h.foeId);
    if (p) {
      h.x = p.x;
      h.y = p.y;
    }
    return h;
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
    for (const s of this._stamps) {
      if (!s.done) s.land();
      s.g.destroy();
    }
    this._floats.length = 0;
    this._shots.length = 0;
    this._flashes.length = 0;
    this._flies.length = 0;
    this._stamps.length = 0;
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
      || this._stamps.some((s) => !s.done)
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
        const at = this._foeAt(pos.enemyId) ?? { x: pos.ex!, y: pos.ey! };
        this._impactHero(ev, at.x, at.y, color, pos.fx, pos.skin ? skinLook(pos.skin) : undefined);
        if (pos.slowed) this._spawnPlainFloat('减速', at.x, at.y + 10, 0x86efac, 16, 0.4);
        pos.onLand?.();
        this._finishLand(key);
      };
      if (pos.hx !== undefined && pos.hy !== undefined) {
        this._spawnHeroAttack(
          ev, pos.hx, pos.hy, pos.ex, pos.ey, color, pos.fx, pos.melee, pos.orb, landHit, pos.byPet, pos.skin, pos.enemyId,
        );
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
        const at = this._foeAt(pos.enemyId) ?? { x: pos.ex!, y: pos.ey! };
        this._death(at.x, at.y, 0xffb070);
        // 倒下只留这一声。再叠一声爆开，漏怪就盖不过去
        playSfx('enemy_down', 80);
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
      playSfx('get_up', 80);
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
    aids: readonly { x: number; y: number; guard: boolean; haste: boolean; heal: boolean }[],
  ): void {
    const cast = skillCast(id);
    playSfx(cast.sfx, 60);
    this._kit.plate('flash', fromX, fromY, { tint: cast.color, s0: 0.55, s1: 1.15, life: 0.26, add: false });
    const ordered = [...hits].sort((a, b) => b.y - a.y);
    this._travel(cast, fromX, fromY, ordered);
    this._aidShow(cast, fromX, fromY, aids, ordered.length === 0);
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

  /** 按这招干什么画出出手。数字和状态字在落地时才出来 */
  private _travel(cast: SkillCast, x0: number, y0: number, hits: readonly SkillMark[]): void {
    if (hits.length === 0) return;
    if (cast.shake > 0) this.shake(cast.shake);
    const feet = (h: SkillMark): number => h.y + 34;
    if (cast.travel === 'volley') {
      this._volley(x0, y0, hits);
      return;
    }
    if (cast.travel === 'roller') {
      let delay = 0.06;
      let px = x0;
      let py = y0 + 28;
      for (const h of hits) {
        const fromX = px;
        const fromY = py;
        const mark = h;
        this._stamp('roller', fromX, fromY, mark.x, feet(mark), cast.color, 46, 0.36, delay, () => {
          this._impact(mark, 'smash');
        }, mark);
        delay += 0.24;
        px = mark.x;
        py = feet(mark);
      }
      return;
    }
    if (cast.travel === 'net') {
      const midX = hits.reduce((m, h) => m + h.x, 0) / hits.length;
      const y = hits.reduce((m, h) => m + feet(h), 0) / hits.length;
      const half = Math.max(86, hits.reduce((m, h) => Math.max(m, Math.abs(h.x - midX)), 0) + 40);
      this._stamp('net', midX - half, y, midX + half, y, cast.color, 40, 0.5, 0.05, () => {
        for (const h of hits) this._impact(h, 'net');
      });
      return;
    }
    if (cast.travel === 'arc' || cast.travel === 'scrap' || cast.travel === 'bass') {
      const kind: StampKind = cast.travel === 'arc' ? 'arc' : cast.travel === 'scrap' ? 'scrap' : 'bass';
      const wide = cast.travel === 'bass' ? 210 : cast.travel === 'scrap' ? 140 : 118;
      this._stamp(kind, x0, y0, x0, y0, cast.color, wide, 0.5, 0.02, () => {
        for (const h of hits) this._impact(h, cast.travel === 'bass' ? 'blast' : 'smash');
      });
      return;
    }
    const per = foeStamp(cast.travel);
    const look = cast.travel === 'hammer' || cast.travel === 'hook' || cast.travel === 'dog' ? 'smash' as const
      : cast.travel === 'boom' || cast.travel === 'pot' ? 'blast' as const
        : cast.travel === 'chick' ? 'net' as const
          : 'bolt' as const;
    hits.forEach((h, i) => {
      const fromX = cast.travel === 'boom' ? h.x : x0;
      const fromY = cast.travel === 'hammer' ? y0 - 100 : cast.travel === 'boom' ? h.y + 8 : y0;
      const toY = cast.travel === 'hammer' || cast.travel === 'hook' || cast.travel === 'dog' ? feet(h)
        : cast.travel === 'boom' ? h.y - 92
          : h.y;
      const fly = cast.travel === 'hammer' ? 0.42
        : cast.travel === 'dog' || cast.travel === 'chick' ? 0.38
          : cast.travel === 'saw' || cast.travel === 'slash' ? 0.3
            : 0.28;
      const wide = cast.travel === 'pot' ? 28 : cast.travel === 'dog' ? 20 : cast.travel === 'chick' ? 14 : 16;
      this._stamp(per, fromX, fromY, h.x, toY, cast.color, wide, fly, 0.05 + i * 0.08, () => {
        this._impact(h, look);
      }, cast.travel === 'boom' ? undefined : h);
    });
  }

  /** 帮队友的那一下。锅盖、喇叭、推车、热水各走各的，回血也要看见罩上来 */
  private _aidShow(
    cast: SkillCast,
    x0: number,
    y0: number,
    aids: readonly { x: number; y: number; guard: boolean; haste: boolean; heal: boolean }[],
    onlyAid: boolean,
  ): void {
    if (aids.length === 0) return;
    if (cast.travel === 'horn') {
      this._stamp('horn', x0, y0, x0, y0, cast.color, 168, 0.52, 0, () => {
        for (const a of aids) this._aidLand(a);
      });
      return;
    }
    if (cast.travel === 'lid') {
      const midX = aids.reduce((m, a) => m + a.x, 0) / aids.length;
      const midY = aids.reduce((m, a) => m + a.y, 0) / aids.length;
      const half = Math.max(70, aids.reduce((m, a) => Math.max(m, Math.abs(a.x - midX)), 0) + 48);
      this._stamp('lid', midX, y0 - 50, midX, midY - 24, cast.color, half * 2, 0.46, 0.04, () => {
        for (const a of aids) this._aidLand(a);
      });
      return;
    }
    if (cast.travel === 'cart') {
      let delay = 0.04;
      let px = x0;
      let py = y0;
      for (const a of aids) {
        const fromX = px;
        const fromY = py;
        this._stamp('cart', fromX, fromY, a.x, a.y, cast.color, 26, 0.3, delay, () => this._aidLand(a));
        delay += 0.14;
        px = a.x;
        py = a.y;
      }
      return;
    }
    const kind = aidStamp(cast.travel);
    const gap = onlyAid ? 0.08 : 0.05;
    aids.forEach((a, i) => {
      const wide = cast.travel === 'pot' || cast.travel === 'shell' ? 18 : 16;
      this._stamp(kind, x0, y0, a.x, a.y, cast.color, wide, 0.34, i * gap, () => this._aidLand(a));
    });
  }

  private _aidLand(a: { x: number; y: number; guard: boolean; haste: boolean; heal: boolean }): void {
    if (a.guard) {
      this._kit.plate('shield', a.x, a.y - 40, { tint: 0x9ecbff, s0: 0.95, s1: 1.4, life: 0.7, add: false });
      this._spawnPlainFloat('护住', a.x, a.y - 68, 0x9ecbff, 28, 0.9, 1.15);
    }
    if (a.haste) {
      this._kit.spray(a.x, a.y - 16, { n: 10, tint: 0xffe08a, kind: 'spark', speed: 180, gy: -50 });
      this._spawnPlainFloat('手快', a.x + (a.guard ? 42 : 0), a.y - 30, 0xffe08a, 28, 0.9, 1.15);
    }
    if (a.heal) {
      this._kit.plate('heal', a.x, a.y, { tint: 0x86efac, s0: 0.5, s1: 1.05, life: 0.48, add: false });
    }
  }

  /**
   * 滑轮连射：跟他平时那颗钢珠一样，只是一颗接一颗。
   * 一颗一颗数得清：每颗隔 0.2 秒上下，一串压在一秒半里。
   * 挨打的每只都至少分到一颗，第一颗才报伤害、才放它倒下。
   */
  private _volley(x0: number, y0: number, hits: readonly SkillMark[]): void {
    const lane = [...hits].sort((a, b) => b.y - a.y);
    const n = Math.max(lane.length, Math.min(8, Math.max(5, lane.length * 2)));
    const gap = Math.min(0.2, 1.5 / n);
    const look: FxLook = { ...skinLook('sling'), projPx: 30, loft: 40, spin: 10 };
    const handY = y0 - 18;
    const shown = new Set<SkillMark>();
    for (let i = 0; i < n; i += 1) {
      const h = lane[i % lane.length]!;
      const show = !shown.has(h);
      shown.add(h);
      const spread = ((i % 3) - 1) * 10;
      this._after(0.1 + i * gap, () => {
        playSfx('atk_sniper', 0);
        this._sync(h);
        const x1 = h.x + spread;
        const y1 = h.y;
        const ang = Math.atan2(y1 - handY, x1 - x0);
        playMuzzle(this._kit, look, x0, handY, ang);
        const dist = Math.hypot(x1 - x0, y1 - handY);
        this._pushShot({
          x0,
          y0: handY,
          x1,
          y1,
          color: look.tint,
          kind: 'sniper',
          fly: Math.max(0.36, Math.min(0.56, dist / 820)),
          look,
          track: h.foeId === undefined ? undefined : { id: h.foeId, dx: spread, dy: 0 },
          land: (x, y) => this._pebbleHit(h, x, y, show),
        });
      });
    }
  }

  /** 钢珠落地。第一颗才报伤害，后面的只砸一下，连射才数得清 */
  private _pebbleHit(h: SkillMark, x: number, y: number, show: boolean): void {
    this._kit.plate('flash', x, y, { tint: 0xe8d4b0, s0: 0.22, s1: 0.42, life: 0.1, add: false });
    this._kit.spray(x, y, { n: show ? 6 : 3, tint: 0xc4b59a, kind: 'glow', speed: 80, gy: 90 });
    if (!show) return;
    this._sync(h);
    h.land?.();
    playSfx('hit_sniper', 40);
    if (h.damage > 0) {
      this._spawnPlainFloat(`-${Math.round(h.damage)}`, x, y - 18, 0xffe066, h.killed ? 34 : 30, 0.85, 1.3);
    }
    if (h.slow) this._spawnPlainFloat('减速', x - 34, y - 8, 0x86efac, 26, 0.8, 1.1);
    if (h.killed) playSfx('hit_counter', 40);
  }

  /** 落在怪身上：伤害数字，再加上这一下干了什么 */
  private _impact(h: SkillMark, look: 'bolt' | 'smash' | 'blast' | 'net'): void {
    this._sync(h);
    h.land?.();
    const feet = h.y + 34;
    if (look === 'smash') {
      this._kit.ring(h.x, feet, 0xffe08a, 0.42);
      this._kit.plate('sk_shock', h.x, feet, { s0: 0.7, s1: 1.2, life: 0.4, add: false });
    } else if (look === 'blast') {
      this._kit.ring(h.x, h.y, 0xff8a3a, 0.36);
      this._kit.plate('sk_burst', h.x, h.y, { s0: 0.55, s1: 1.05, life: 0.38, add: false });
    } else if (look === 'net') {
      this._kit.plate('sk_stun', h.x, feet - 10, { s0: 0.85, s1: 1.15, life: 0.45, add: false });
    } else {
      this._kit.plate('blast', h.x, h.y, { tint: 0xffe08a, s0: 0.45, s1: h.killed ? 0.9 : 0.65, life: 0.3 });
    }
    this._kit.spray(h.x, h.y, { n: h.killed ? 12 : 8, tint: 0xffb040, kind: 'spark', speed: h.killed ? 240 : 160 });
    if (h.damage > 0) {
      this._spawnPlainFloat(`-${Math.round(h.damage)}`, h.x, h.y - 18, 0xffe066, h.killed ? 34 : 30, 0.85, 1.3);
    }
    if (h.stun) this._spawnPlainFloat('钉住', h.x, h.y - 52, 0xffe08a, 28, 0.9, 1.2);
    if (h.push) {
      this._kit.beam(h.x, feet, h.x, feet - 56, 0xffd66b, 0.22);
      this._spawnPlainFloat('击退', h.x + 34, h.y - 16, 0xffd66b, 26, 0.8, 1.1);
    }
    if (h.slow) this._spawnPlainFloat('减速', h.x - 34, h.y - 8, 0x86efac, 26, 0.8, 1.1);
    if (h.killed) playSfx('hit_counter', 45);
    else if (h.stun && look === 'smash') playSfx('sk_stun', 80);
  }

  private _stamp(
    kind: StampKind,
    x0: number, y0: number, x1: number, y1: number,
    color: number, wide: number, fly: number, delay: number, land: () => void,
    follow?: SkillMark,
  ): void {
    const dy = follow ? y1 - follow.y : 0;
    this._after(delay, () => {
      if (this._stamps.length >= 40) {
        const old = this._stamps.shift();
        if (old && !old.done) old.land();
        old?.g.destroy();
      }
      const g = new PIXI.Graphics();
      this.layer.addChild(g);
      this._stamps.push({
        g, kind, life: fly, max: fly, x0, y0, x1, y1, color, wide, done: false, land,
        follow: follow ? { mark: follow, dy } : undefined,
      });
    });
  }

  private _drawStamp(s: StampBit): void {
    const g = s.g;
    g.clear();
    const u = Math.min(1, 1 - Math.max(0, s.life) / s.max);
    const fade = s.life < 0 ? Math.max(0, 1 + s.life / 0.1) : 1;
    if (fade <= 0) return;
    const e = u * u;
    const drop = s.kind === 'hammer' || s.kind === 'lid';
    const x = s.x0 + (s.x1 - s.x0) * (drop ? e : u);
    const y = s.y0 + (s.y1 - s.y0) * (drop ? e : u);
    if (s.kind === 'hammer') this._drawHammer(g, x, y, s.x1, s.y1, u, fade);
    else if (s.kind === 'roller') this._drawRoller(g, x, y, s.wide, u, fade, s.color);
    else if (s.kind === 'net') this._drawNet(g, s, u, fade);
    else if (s.kind === 'hook') this._drawHook(g, s, x, y, fade);
    else if (s.kind === 'saw') this._drawSaw(g, x, y, u, fade);
    else if (s.kind === 'slash') this._drawSlash(g, x, y, fade);
    else if (s.kind === 'arc') this._drawArc(g, s, u, fade);
    else if (s.kind === 'pot') this._drawPot(g, x, y, u, fade, s.color, s.wide);
    else if (s.kind === 'lid') this._drawLid(g, x, y, s.wide, fade);
    else if (s.kind === 'horn') this._drawHorn(g, s.x0, s.y0, u, fade, s.color);
    else if (s.kind === 'cart') this._drawCart(g, x, y, fade, s.color);
    else if (s.kind === 'steam') this._drawSteam(g, s, u, fade);
    else if (s.kind === 'dog') this._drawDog(g, s, u, fade);
    else if (s.kind === 'chick') this._drawChick(g, s, u, fade);
    else if (s.kind === 'boom') this._drawBoom(g, x, y, u, fade);
    else if (s.kind === 'bass') this._drawBass(g, s, u, fade);
    else if (s.kind === 'scrap') this._drawScrap(g, s, u, fade);
    else if (s.kind === 'shell') this._drawShell(g, x, y, fade);
    else if (s.kind === 'bloom') this._drawBloom(g, x, y, u, fade, s.color);
    else this._drawRing(g, s, x, y, u, fade);
  }

  private _drawHammer(g: PIXI.Graphics, x: number, y: number, fx: number, fy: number, u: number, fade: number): void {
    g.beginFill(0x1a0c08, 0.35 * u * fade).drawEllipse(fx, fy + 4, 28 + 18 * u, 10).endFill();
    g.lineStyle(8, 0x6b3a1f, fade);
    g.moveTo(x, y - 64);
    g.lineTo(x, y - 16);
    g.lineStyle(0);
    g.beginFill(0x4a5158, fade).drawRoundedRect(x - 32, y - 26, 64, 20, 4).endFill();
    g.beginFill(0xe8e0d4, fade).drawRoundedRect(x - 32, y - 26, 64, 6, 2).endFill();
    if (u > 0.72) {
      g.lineStyle(6, 0xffe08a, ((u - 0.72) / 0.28) * fade);
      g.drawEllipse(fx, fy + 4, 46, 14);
      g.lineStyle(3, 0xfff6d0, 0.8 * fade);
      g.moveTo(fx - 30, fy + 4);
      g.lineTo(fx - 48, fy + 16);
      g.moveTo(fx + 30, fy + 4);
      g.lineTo(fx + 48, fy + 16);
      g.lineStyle(0);
    }
  }

  private _drawRoller(g: PIXI.Graphics, x: number, y: number, r: number, u: number, fade: number, color: number): void {
    g.beginFill(0x1a0c08, 0.35 * fade).drawEllipse(x, y + 10, r, 8).endFill();
    g.beginFill(color, fade).drawCircle(x, y - 6, r).endFill();
    g.beginFill(0x6b5a48, fade).drawCircle(x, y - 6, r * 0.62).endFill();
    g.beginFill(0x1a0c08, fade).drawCircle(x, y - 6, r * 0.16).endFill();
    g.lineStyle(4, 0xfff4c4, 0.85 * fade);
    const ang = u * 8;
    g.moveTo(x + Math.cos(ang) * r * 0.28, y - 6 + Math.sin(ang) * r * 0.28);
    g.lineTo(x + Math.cos(ang) * r * 0.9, y - 6 + Math.sin(ang) * r * 0.9);
    g.lineStyle(0);
  }

  private _drawNet(g: PIXI.Graphics, s: StampBit, u: number, fade: number): void {
    const x1 = s.x0 + (s.x1 - s.x0) * u;
    const half = s.wide;
    g.lineStyle(8, s.color, 0.95 * fade);
    g.moveTo(s.x0, s.y0);
    g.lineTo(x1, s.y0);
    const span = Math.max(12, x1 - s.x0);
    const n = Math.max(3, Math.round(span / 28));
    for (let i = 0; i <= n; i += 1) {
      const x = s.x0 + (span * i) / n;
      g.moveTo(x, s.y0 - half);
      g.lineTo(x, s.y0 + half);
    }
    g.moveTo(s.x0, s.y0 - half);
    g.lineTo(x1, s.y0 - half);
    g.moveTo(s.x0, s.y0 + half);
    g.lineTo(x1, s.y0 + half);
    g.lineStyle(0);
  }

  private _drawHook(g: PIXI.Graphics, s: StampBit, x: number, y: number, fade: number): void {
    for (let i = 0; i < 3; i += 1) {
      const ox = (i - 1) * 18;
      const oy = (i - 1) * 8;
      g.lineStyle(4, s.color, 0.9 * fade);
      g.moveTo(s.x0, s.y0);
      g.lineTo(x + ox, y + oy);
      g.lineStyle(6, 0xfff4c4, fade);
      g.moveTo(x + ox, y + oy);
      g.lineTo(x + ox + 16, y + oy - 22);
      g.lineTo(x + ox + 4, y + oy - 8);
      g.lineStyle(0);
      g.beginFill(0xe8e0d4, fade).drawPolygon([
        x + ox + 10, y + oy - 6,
        x + ox + 26, y + oy + 2,
        x + ox + 8, y + oy + 8,
      ]).endFill();
    }
  }

  private _drawSaw(g: PIXI.Graphics, x: number, y: number, u: number, fade: number): void {
    g.beginFill(0x9aa0a8, 0.95 * fade).drawCircle(x, y, 28).endFill();
    g.beginFill(0x5c636c, fade).drawCircle(x, y, 10).endFill();
    g.lineStyle(4, 0xfff6d0, fade);
    const spin = u * 18;
    for (let i = 0; i < 8; i += 1) {
      const a = spin + (i * Math.PI) / 4;
      g.moveTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12);
      g.lineTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30);
    }
    g.lineStyle(0);
    g.beginFill(0xffe08a, fade).drawCircle(x, y, 5).endFill();
  }

  private _drawSlash(g: PIXI.Graphics, x: number, y: number, fade: number): void {
    g.beginFill(0x6b3a1f, fade).drawRoundedRect(x - 8, y - 36, 10, 28, 2).endFill();
    g.beginFill(0xe8e0d4, fade).drawPolygon([
      x - 28, y - 8,
      x + 30, y + 18,
      x + 18, y + 30,
      x - 36, y + 2,
    ]).endFill();
    g.beginFill(0xfff6d0, 0.9 * fade).drawPolygon([
      x - 22, y - 4,
      x + 22, y + 16,
      x + 16, y + 22,
      x - 26, y + 2,
    ]).endFill();
  }

  private _drawArc(g: PIXI.Graphics, s: StampBit, u: number, fade: number): void {
    const a = -2.6 + u * 3.6;
    const x = s.x0 + Math.cos(a) * s.wide;
    const y = s.y0 + Math.sin(a) * s.wide * 0.72;
    g.lineStyle(10, 0x6b3a1f, fade);
    g.moveTo(s.x0, s.y0);
    g.lineTo(x, y);
    g.lineStyle(0);
    g.beginFill(0x3a3a3a, fade).drawCircle(x, y, 18).endFill();
    g.beginFill(0x8a8f98, fade).drawCircle(x, y, 12).endFill();
  }

  private _drawPot(g: PIXI.Graphics, x: number, y: number, u: number, fade: number, color: number, wide: number): void {
    const n = wide >= 24 ? 3 : 1;
    for (let i = 0; i < n; i += 1) {
      const ox = (i - (n - 1) / 2) * 28;
      const px = x + ox;
      g.beginFill(0x1a0c08, 0.3 * fade).drawEllipse(px, y + 18, 14, 5).endFill();
      g.beginFill(color, fade).drawRoundedRect(px - 14, y - 10, 28, 24, 5).endFill();
      g.beginFill(0x3a2a22, fade).drawEllipse(px, y - 10, 11, 4).endFill();
      g.beginFill(0xfff6d0, 0.75 * fade).drawCircle(px, y - 22 - u * 14, 4 + u * 5).endFill();
    }
  }

  private _drawLid(g: PIXI.Graphics, x: number, y: number, wide: number, fade: number): void {
    const rx = Math.max(56, wide / 2);
    g.beginFill(0x8a3030, 0.95 * fade).drawEllipse(x, y + 6, rx, 26).endFill();
    g.beginFill(0xd4554a, fade).drawEllipse(x, y, rx - 8, 16).endFill();
    g.beginFill(0xfff6d0, fade).drawCircle(x, y - 14, 8).endFill();
    g.beginFill(0x6b3a1f, fade).drawCircle(x, y - 14, 4).endFill();
  }

  private _drawHorn(g: PIXI.Graphics, x: number, y: number, u: number, fade: number, color: number): void {
    g.beginFill(color, fade).drawPolygon([
      x - 10, y + 16, x + 10, y + 16, x + 28, y - 36, x - 28, y - 36,
    ]).endFill();
    g.beginFill(0xfff6d0, fade).drawCircle(x, y + 8, 6).endFill();
    for (let i = 1; i <= 3; i += 1) {
      g.lineStyle(7, color, fade * (1 - i * 0.18));
      g.arc(x, y - 10, 24 + i * 36 * Math.max(0.15, u), -2.7, -0.45);
    }
    g.lineStyle(0);
  }

  private _drawCart(g: PIXI.Graphics, x: number, y: number, fade: number, color: number): void {
    g.beginFill(0x1a0c08, 0.3 * fade).drawEllipse(x, y + 16, 26, 6).endFill();
    g.beginFill(0x5c3a24, fade).drawRoundedRect(x - 26, y - 8, 52, 22, 3).endFill();
    g.beginFill(color, fade).drawRoundedRect(x - 16, y - 28, 22, 20, 3).endFill();
    g.beginFill(0xc45a3a, fade).drawRoundedRect(x + 8, y - 22, 12, 14, 2).endFill();
    g.beginFill(0x1a1a1a, fade).drawCircle(x - 14, y + 16, 7).endFill();
    g.beginFill(0x1a1a1a, fade).drawCircle(x + 14, y + 16, 7).endFill();
    g.beginFill(0xd0d4dc, fade).drawCircle(x - 14, y + 16, 3).endFill();
    g.beginFill(0xd0d4dc, fade).drawCircle(x + 14, y + 16, 3).endFill();
  }

  private _drawSteam(g: PIXI.Graphics, s: StampBit, u: number, fade: number): void {
    for (let i = 0; i < 5; i += 1) {
      const ox = (i - 2) * 14;
      const drop = ((u + i * 0.16) % 1);
      const x = s.x0 + (s.x1 - s.x0) * drop + ox * 0.4;
      const y = s.y0 + (s.y1 - s.y0) * drop;
      g.beginFill(0x7dd3fc, 0.95 * fade).drawEllipse(x, y, 5, 8).endFill();
      g.beginFill(0xfff6d0, 0.55 * fade).drawCircle(x, y - 16, 6 + drop * 4).endFill();
    }
  }

  private _drawDog(g: PIXI.Graphics, s: StampBit, u: number, fade: number): void {
    for (let i = 0; i < 4; i += 1) {
      const ox = (i - 1.5) * 26;
      const oy = Math.sin(u * 14 + i) * 4;
      const x = s.x0 + (s.x1 - s.x0) * u + ox;
      const y = s.y0 + (s.y1 - s.y0) * u + oy;
      g.beginFill(s.color, fade).drawEllipse(x, y, 18, 9).endFill();
      g.beginFill(s.color, fade).drawCircle(x + 16, y - 7, 8).endFill();
      g.beginFill(0x6b3a1f, fade).drawEllipse(x + 14, y - 14, 3, 6).endFill();
      g.beginFill(0x1a0c08, fade).drawCircle(x + 19, y - 8, 1.6).endFill();
      g.lineStyle(3, s.color, fade);
      g.moveTo(x - 16, y - 2);
      g.lineTo(x - 24, y - 12);
      g.lineStyle(0);
    }
  }

  private _drawChick(g: PIXI.Graphics, s: StampBit, u: number, fade: number): void {
    for (let i = 0; i < 6; i += 1) {
      const ox = (i - 2.5) * 18;
      const oy = Math.sin(u * 18 + i) * 12 - 6;
      const x = s.x0 + (s.x1 - s.x0) * u + ox;
      const y = s.y0 + (s.y1 - s.y0) * u + oy;
      g.beginFill(0xfff4c4, fade).drawCircle(x, y, 7).endFill();
      g.beginFill(0xfff4c4, fade).drawCircle(x + 5, y - 5, 4).endFill();
      g.beginFill(0xc43a28, fade).drawCircle(x + 4, y - 9, 2).endFill();
      g.beginFill(0xe8a317, fade).drawPolygon([
        x + 8, y - 5, x + 14, y - 3, x + 8, y - 1,
      ]).endFill();
    }
  }

  private _drawBoom(g: PIXI.Graphics, x: number, y: number, u: number, fade: number): void {
    g.beginFill(0xff5a6a, fade).drawRoundedRect(x - 5, y - 6, 10, 18, 3).endFill();
    g.beginFill(0xffe08a, fade).drawPolygon([x, y + 16, x - 6, y + 6, x + 6, y + 6]).endFill();
    if (u > 0.45) {
      const r = 10 + (u - 0.45) * 70;
      g.lineStyle(5, 0xffe08a, fade);
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        g.moveTo(x + Math.cos(a) * r * 0.35, y + Math.sin(a) * r * 0.35);
        g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.lineStyle(0);
      g.beginFill(0xff5a6a, 0.9 * fade).drawCircle(x, y, 8).endFill();
    }
  }

  private _drawBass(g: PIXI.Graphics, s: StampBit, u: number, fade: number): void {
    const x = s.x0;
    const y = s.y0;
    g.beginFill(0x2a241c, fade).drawRoundedRect(x - 34, y - 26, 68, 52, 6).endFill();
    g.beginFill(0x111111, fade).drawCircle(x, y, 16).endFill();
    g.beginFill(s.color, fade).drawCircle(x, y, 7).endFill();
    for (let i = 1; i <= 3; i += 1) {
      g.lineStyle(9, s.color, fade * (1 - i * 0.2));
      g.drawCircle(x, y, 22 + i * s.wide * Math.max(0.2, u) / 3);
    }
    g.lineStyle(0);
  }

  private _drawScrap(g: PIXI.Graphics, s: StampBit, u: number, fade: number): void {
    const colors = [0xc47a4a, 0x8a8f98, 0x6b3a1f, 0xe8d4b0, 0xc45a3a, 0x5c636c];
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + u;
      const r = 16 + s.wide * u;
      const x = s.x0 + Math.cos(a) * r;
      const y = s.y0 + Math.sin(a) * r * 0.72;
      g.beginFill(colors[i] ?? 0xc47a4a, fade).drawRoundedRect(x - 10, y - 6, 20, 12, 2).endFill();
    }
  }

  private _drawShell(g: PIXI.Graphics, x: number, y: number, fade: number): void {
    g.lineStyle(10, 0xd0d4dc, 0.95 * fade);
    g.drawRoundedRect(x - 30, y - 42, 60, 76, 12);
    g.lineStyle(4, 0xfff6d0, 0.85 * fade);
    g.drawRoundedRect(x - 18, y - 28, 36, 50, 8);
    g.lineStyle(0);
    g.beginFill(0x8a8f98, fade).drawRect(x - 22, y - 6, 44, 6).endFill();
  }

  private _drawBloom(g: PIXI.Graphics, x: number, y: number, u: number, fade: number, color: number): void {
    const r = 16 + 28 * u;
    g.beginFill(color, 0.35 * fade).drawCircle(x, y, r).endFill();
    g.lineStyle(5, color, 0.9 * fade);
    g.drawCircle(x, y, r);
    g.lineStyle(0);
  }

  private _drawRing(g: PIXI.Graphics, s: StampBit, x: number, y: number, u: number, fade: number): void {
    const local = Math.hypot(s.x1 - s.x0, s.y1 - s.y0) < 6;
    const r = local ? 16 + s.wide * u : 18 + 16 * u;
    g.lineStyle(local ? 8 : 5, s.color, fade * (local ? 0.95 - u * 0.25 : 0.9));
    g.drawCircle(x, y, r);
    if (local) g.drawCircle(x, y, r * 0.55);
    g.lineStyle(0);
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

    for (let i = this._stamps.length - 1; i >= 0; i -= 1) {
      const s = this._stamps[i];
      if (!s) continue;
      s.life -= dt;
      if (s.follow && !s.done) {
        const h = this._sync(s.follow.mark);
        s.x1 = h.x;
        s.y1 = h.y + s.follow.dy;
      }
      this._drawStamp(s);
      if (s.life <= 0 && !s.done) {
        s.done = true;
        s.land();
      }
      if (s.life <= -0.1) {
        s.g.destroy();
        this._stamps.splice(i, 1);
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
      if (s.track && !s.done) {
        const q = this._foeAt(s.track.id);
        if (q) {
          s.x1 = q.x + s.track.dx;
          s.y1 = q.y + s.track.dy;
        }
      }
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
        s.land(s.x1, s.y1);
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
    foeId?: number,
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
      const now = this._foeAt(foeId) ?? { x: x1, y: y1 };
      const ang = Math.atan2(now.y - y0, now.x - x0);
      const dist = Math.hypot(now.x - x0, now.y - y0);
      playMuzzle(this._kit, look, x0, y0, ang);

      if (!fly) {
        this._kit.spray(x0, y0, { n: 5, tint, kind: 'spark', speed: 140, dir: ang, spread: 1.0 });
        land();
        return;
      }
      this._pushShot({
        x0, y0, x1: now.x, y1: now.y, color: tint, kind: style,
        fly: shotFlight(look, dist, !!melee),
        look,
        track: foeId === undefined ? undefined : { id: foeId, dx: 0, dy: 0 },
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
    track?: { id: number; dx: number; dy: number };
    land: (x: number, y: number) => void;
  }): void {
    if (this._shots.length >= MAX_SHOTS) {
      const old = this._shots.shift();
      if (old && !old.done) old.land(old.x1, old.y1);
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
      track: spec.track,
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

type SkillTravel =
  | 'hammer' | 'arc' | 'scrap' | 'roller' | 'net' | 'chick' | 'dog'
  | 'volley' | 'hook' | 'saw' | 'slash' | 'pot' | 'boom' | 'bass'
  | 'lid' | 'shell' | 'horn' | 'cart' | 'steam';

interface SkillCast {
  travel: SkillTravel;
  color: number;
  sfx: string;
  shake: number;
}

/** 每招一张画面。锤子砸地、碾子滚过去、网横上、钩子甩出去，不共用一团火花 */
function skillCast(id: string): SkillCast {
  switch (id) {
    case 'dachui': return { travel: 'hammer', color: 0xc4a574, sfx: 'sk_shock', shake: 16 };
    case 'chengtuo': return { travel: 'arc', color: 0x8a8f98, sfx: 'sk_shock', shake: 10 };
    case 'miankuzhang': return { travel: 'scrap', color: 0xc47a4a, sfx: 'sk_shock', shake: 8 };
    case 'shimo': return { travel: 'roller', color: 0xb8a48a, sfx: 'sk_shock', shake: 8 };
    case 'yuwang': return { travel: 'net', color: 0xfde68a, sfx: 'sk_stun', shake: 5 };
    case 'jishi': return { travel: 'chick', color: 0xfff4c4, sfx: 'sk_stun', shake: 4 };
    case 'laoyanqiang': return { travel: 'volley', color: 0xc4b59a, sfx: 'atk_sniper', shake: 2 };
    case 'laoli': return { travel: 'hook', color: 0xe8e0d4, sfx: 'atk_pierce', shake: 5 };
    case 'qiangou': return { travel: 'dog', color: 0xd4a574, sfx: 'sk_shock', shake: 6 };
    case 'dianju': return { travel: 'saw', color: 0xd0d4dc, sfx: 'atk_saw', shake: 4 };
    case 'shazhu': return { travel: 'slash', color: 0xf2d2c4, sfx: 'atk_slash', shake: 4 };
    case 'gaoyaguo': return { travel: 'pot', color: 0xff8a3a, sfx: 'sk_burst', shake: 12 };
    case 'bianpao': return { travel: 'boom', color: 0xff5a6a, sfx: 'sk_burst', shake: 8 };
    case 'sanshen': return { travel: 'bass', color: 0xc4b5fd, sfx: 'sk_burst', shake: 14 };
    case 'guogai': return { travel: 'lid', color: 0xd4554a, sfx: 'sk_heal', shake: 3 };
    case 'tiezhu': return { travel: 'pot', color: 0xff8a3a, sfx: 'sk_heal', shake: 4 };
    case 'gangban': return { travel: 'shell', color: 0xd0d4dc, sfx: 'sk_heal', shake: 3 };
    case 'labaye': return { travel: 'horn', color: 0xffd66b, sfx: 'sk_heal', shake: 3 };
    case 'erjiu': return { travel: 'cart', color: 0xc4a574, sfx: 'sk_heal', shake: 2 };
    case 'baowenhu': return { travel: 'steam', color: 0x7dd3fc, sfx: 'sk_heal', shake: 2 };
    default: return { travel: 'steam', color: 0x86efac, sfx: 'sk_cast', shake: 2 };
  }
}

function foeStamp(travel: SkillTravel): StampKind {
  switch (travel) {
    case 'hammer': return 'hammer';
    case 'hook': return 'hook';
    case 'saw': return 'saw';
    case 'slash': return 'slash';
    case 'pot': return 'pot';
    case 'boom': return 'boom';
    case 'dog': return 'dog';
    case 'chick': return 'chick';
    case 'lid': return 'lid';
    case 'shell': return 'shell';
    case 'steam': return 'steam';
    default: return 'bloom';
  }
}

function aidStamp(travel: SkillTravel): StampKind {
  switch (travel) {
    case 'pot': return 'pot';
    case 'shell': return 'shell';
    case 'steam': return 'steam';
    case 'boom': return 'bloom';
    default: return 'bloom';
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
