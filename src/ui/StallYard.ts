/**
 * 弹弓摊的靶场。经济仍由 stall.shoot 算，这里只负责「拉一下、靶倒下」。
 *
 * 打中哪个是掷出来的，玩家瞄不准指定靶 —— 和塔塔弹珠台一样，
 * 玩具感在手上那一下，不在选靶。选靶会把摊子做成第二个玩法（§4 强辅：它是资源出口）。
 */
import * as PIXI from 'pixi.js';
import { bindPointerTap } from '@/minigame';
import { playSfx } from '@/core/SfxPlayer';
import { TweenManager, Ease } from '@/core/TweenManager';
import { TARGETS, type ShotResult, type TargetDef } from '@/balance/stall';
import { GOLD, label } from '@/ui/paint';

const CREAM = 0xfff4c4;
const MUTED = 0x8a8a92;

const TINT: Readonly<Record<string, number>> = {
  cans: 0xc45a22,
  bottles: 0x4e8c7a,
  tv: 0x6a7a8a,
  crate: 0x3a6aaa,
  basin: 0xb87333,
  horn: 0xd9a13b,
};

interface Peg {
  def: TargetDef;
  box: PIXI.Container;
  body: PIXI.Graphics;
  name: PIXI.Text;
  cx: number;
  cy: number;
  locked: boolean;
}

export class StallYard extends PIXI.Container {
  private readonly _onPull: () => void;
  private readonly _wall = new PIXI.Container();
  private readonly _sling = new PIXI.Container();
  private readonly _fx = new PIXI.Container();
  private readonly _pegs: Peg[] = [];
  private _busy = false;
  private _cocked = false;
  private _canPull = true;
  private _hint: PIXI.Text;

  constructor(onPull: () => void) {
    super();
    this._onPull = onPull;
    this.addChild(this._wall);
    this.addChild(this._sling);
    this.addChild(this._fx);
    this._hint = label(18, CREAM, true);
    this._hint.anchor.set(0.5);
    this.addChild(this._hint);
    this._buildSling();
  }

  /** 挂墙。locked = 村庄等级还没够，靶在但打不中（shoot 那边也挂不上） */
  mount(openIds: ReadonlySet<string>, top: number, floor: number): void {
    this._wall.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._pegs.length = 0;

    const cols = 3;
    const rows = 2;
    const cellW = 220;
    const cellH = Math.min(160, (floor - top - 180) / rows);
    const originX = 375 - (cols * cellW) / 2 + cellW / 2;
    const originY = top + cellH * 0.55;

    TARGETS.forEach((def, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = originX + col * cellW;
      const cy = originY + row * cellH;
      const locked = !openIds.has(def.id);
      const peg = this._peg(def, cx, cy, locked);
      this._wall.addChild(peg.box);
      this._pegs.push(peg);
    });

    this._sling.position.set(375, floor - 36);
    this._hint.position.set(375, floor + 18);
    this._hint.text = '往下拉，松手打出去';
  }

  setCanPull(on: boolean): void {
    this._canPull = on;
    this._sling.alpha = on && !this._busy ? 1 : 0.45;
    if (!on) this._hint.text = '没弹子了';
  }

  get busy(): boolean {
    return this._busy;
  }

  /**
   * 播这一发。先飞向 hit，铁盆连击就再晃一下。
   * 账已经在调用方入档了，这里只负责让玩家看见打中了什么。
   */
  play(result: ShotResult, lines: readonly string[], done: () => void): void {
    const peg = this._pegs.find((p) => p.def.id === result.hit.id);
    if (!peg) {
      done();
      return;
    }
    this._busy = true;
    this._sling.alpha = 0.45;
    this._fly(375, this._sling.y - 40, peg.cx, peg.cy, () => {
      this._knock(peg);
      this._loot(peg.cx, peg.cy - 36, lines);
      playSfx(result.rebounds > 0 ? 'kill_pop' : 'hit_smash', 0);
      if (result.rebounds <= 0) {
        this._busy = false;
        this._sling.alpha = this._canPull ? 1 : 0.45;
        done();
        return;
      }
      // 连击：石子弹回再砸一次。增益已经算进 lines 里，这里只加一句「又来一发」
      this._fly(peg.cx, peg.cy, peg.cx + 40, peg.cy - 50, () => {
        this._knock(peg);
        this._loot(peg.cx + 20, peg.cy - 70, ['连击']);
        playSfx('kill_pop', 0);
        this._busy = false;
        this._sling.alpha = this._canPull ? 1 : 0.45;
        done();
      });
    });
  }

  private _peg(def: TargetDef, cx: number, cy: number, locked: boolean): Peg {
    const box = new PIXI.Container();
    box.position.set(cx, cy);
    const body = new PIXI.Graphics();
    this._drawBody(body, def.id, locked);
    box.addChild(body);
    const name = label(16, locked ? MUTED : CREAM, true);
    name.anchor.set(0.5);
    name.position.set(0, 52);
    name.text = locked ? '还没挂上' : def.name;
    box.addChild(name);
    const gain = label(13, locked ? MUTED : GOLD, true);
    gain.anchor.set(0.5);
    gain.position.set(0, 72);
    gain.text = locked ? '' : def.pitch;
    box.addChild(gain);
    return { def, box, body, name, cx, cy, locked };
  }

  private _drawBody(g: PIXI.Graphics, id: string, locked: boolean): void {
    g.clear();
    const tint = locked ? 0x4a4a52 : (TINT[id] ?? 0xc9a46a);
    g.beginFill(0x1a1008, 0.35).drawEllipse(0, 44, 48, 10).endFill();
    if (id === 'cans') {
      for (let i = -1; i <= 1; i += 1) {
        g.beginFill(tint).drawRoundedRect(i * 22 - 12, -28, 24, 44, 4).endFill();
        g.beginFill(0xfff4c4, 0.25).drawRoundedRect(i * 22 - 8, -24, 8, 12, 2).endFill();
      }
      return;
    }
    if (id === 'bottles') {
      g.beginFill(tint).drawRoundedRect(-28, -20, 20, 40, 6).endFill();
      g.beginFill(tint).drawRoundedRect(8, -20, 20, 40, 6).endFill();
      g.beginFill(0x86efac, 0.4).drawCircle(-18, -28, 6).endFill();
      g.beginFill(0x86efac, 0.4).drawCircle(18, -28, 6).endFill();
      return;
    }
    if (id === 'tv') {
      g.beginFill(tint).drawRoundedRect(-36, -28, 72, 50, 6).endFill();
      g.beginFill(0x0c0e14, 0.8).drawRoundedRect(-28, -20, 56, 34, 3).endFill();
      return;
    }
    if (id === 'crate') {
      g.beginFill(tint).drawRoundedRect(-34, -24, 68, 48, 4).endFill();
      g.lineStyle(3, 0x1a1008, 0.35).moveTo(-34, 0).lineTo(34, 0).lineStyle(0);
      return;
    }
    if (id === 'basin') {
      g.beginFill(tint).drawEllipse(0, 4, 36, 16).endFill();
      g.lineStyle(3, tint, 0.9).moveTo(-8, -28).lineTo(0, -6).lineTo(8, -28).lineStyle(0);
      return;
    }
    g.beginFill(tint).drawCircle(0, -4, 22).endFill();
    g.beginFill(0x2a160c, 0.5).drawCircle(0, -4, 10).endFill();
    g.beginFill(tint).drawRoundedRect(-6, 16, 12, 18, 3).endFill();
  }

  private _buildSling(): void {
    const g = new PIXI.Graphics();
    g.beginFill(0x5a3a22).drawRoundedRect(-10, -8, 20, 56, 6).endFill();
    g.beginFill(0xc4b59a).drawEllipse(0, -16, 28, 12).endFill();
    g.lineStyle(4, 0x8a5a32, 1).moveTo(-28, -16).lineTo(0, 8).lineTo(28, -16).lineStyle(0);
    this._sling.addChild(g);
    const t = label(22, 0x2a160c, true);
    t.anchor.set(0.5);
    t.position.set(0, 64);
    t.text = '拉一下';
    this._sling.addChild(t);
    this._sling.eventMode = 'static';
    this._sling.interactiveChildren = false;
    this._sling.hitArea = new PIXI.Rectangle(-90, -50, 180, 140);
    bindPointerTap(this._sling, () => {
      if (this._busy || this._cocked || !this._canPull) return;
      this._cocked = true;
      const y0 = this._sling.y;
      TweenManager.to({
        target: this._sling,
        props: { y: y0 + 22 },
        duration: 0.08,
        ease: Ease.easeOutQuad,
        onComplete: () => {
          TweenManager.to({
            target: this._sling,
            props: { y: y0 },
            duration: 0.1,
            onComplete: () => {
              this._cocked = false;
              this._onPull();
            },
          });
        },
      });
    });
  }

  private _fly(x0: number, y0: number, x1: number, y1: number, land: () => void): void {
    const pebble = new PIXI.Graphics();
    pebble.beginFill(0xc4b59a).drawCircle(0, 0, 10).endFill();
    pebble.beginFill(0x6a5340, 0.5).drawCircle(-3, -3, 4).endFill();
    pebble.position.set(x0, y0);
    this._fx.addChild(pebble);
    const mid = { x: (x0 + x1) / 2, y: Math.min(y0, y1) - 80 };
    const holder = { t: 0 };
    TweenManager.to({
      target: holder,
      props: { t: 1 },
      duration: 0.32,
      ease: Ease.easeOutQuad,
      onUpdate: () => {
        const t = holder.t;
        const u = 1 - t;
        pebble.x = u * u * x0 + 2 * u * t * mid.x + t * t * x1;
        pebble.y = u * u * y0 + 2 * u * t * mid.y + t * t * y1;
      },
      onComplete: () => {
        pebble.destroy();
        land();
      },
    });
    playSfx('atk_sniper', 40);
  }

  private _knock(peg: Peg): void {
    const box = peg.box;
    const rot = { r: 0 };
    TweenManager.to({
      target: rot,
      props: { r: 1 },
      duration: 0.28,
      ease: Ease.easeOutBounce,
      onUpdate: () => {
        box.rotation = Math.sin(rot.r * Math.PI) * 0.35;
        box.y = peg.cy + Math.sin(rot.r * Math.PI) * 10;
      },
      onComplete: () => {
        box.rotation = 0;
        box.y = peg.cy;
      },
    });
  }

  private _loot(x: number, y: number, lines: readonly string[]): void {
    lines.forEach((line, i) => {
      const t = label(18, 0x9be08a, true);
      t.anchor.set(0.5);
      t.position.set(x, y - i * 22);
      t.text = line;
      this._fx.addChild(t);
      const hold = { y: t.y, a: 1 };
      TweenManager.to({
        target: hold,
        props: { y: t.y - 36, a: 0 },
        duration: 0.9,
        delay: i * 0.06,
        ease: Ease.easeOutCubic,
        onUpdate: () => {
          t.y = hold.y;
          t.alpha = hold.a;
        },
        onComplete: () => t.destroy(),
      });
    });
  }
}
