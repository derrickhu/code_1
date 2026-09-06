/**
 * 弹弓摊的靶场。经济仍由 stall.shoot 算，这里只负责「拉一下、靶倒下」。
 *
 * 打中哪个是掷出来的，玩家瞄不准指定靶 —— 和塔塔弹珠台一样，
 * 玩具感在手上那一下，不在选靶。选靶会把摊子做成第二个玩法（§4 强辅：它是资源出口）。
 */
import * as PIXI from 'pixi.js';
import { Platform } from '@/core/PlatformService';
import { playSfx } from '@/core/SfxPlayer';
import { TweenManager, Ease } from '@/core/TweenManager';
import { uiTex, type UiName } from '@/core/TextureLoader';
import { TARGETS, type ShotResult, type TargetDef } from '@/balance/stall';
import { fitSprite, label } from '@/ui/paint';
import { clientEventToDesign } from '@/utils/clientEventToDesign';
import { getTouchCanvas } from '@/utils/touchCanvas';

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

const TARGET_ART: Readonly<Record<string, UiName>> = {
  cans: 'stall_cans',
  bottles: 'stall_bottles',
  tv: 'stall_tv',
  crate: 'stall_crate',
  basin: 'stall_basin',
  horn: 'stall_horn',
};

/** 摊位底图墙面裁切。两根木梁的 UV 跟 jpg 对过，画背景和摆货用同一套。 */
export const STALL_BG_LAY = {
  imgW: 720,
  imgH: 1280,
  uvY: 0.22,
  uvH: 0.46,
  alignY: 0.5,
  shelves: [0.366, 0.447] as const,
} as const;

export interface StallYardLay {
  cellW: number;
  originX: number;
  shelves: readonly [number, number];
  slingY: number;
}

/** 原图某一行落到摊间里的 Y。跟 fillCoverUv 同一条式子。 */
export function stallImgY(imgFrac: number, roomTop: number, roomH: number, destW = 750): number {
  const { imgW, imgH, uvY, uvH, alignY } = STALL_BG_LAY;
  const srcW = imgW;
  const srcH = imgH * uvH;
  const scale = Math.max(destW / srcW, roomH / Math.max(1, srcH));
  const oy = roomTop + (roomH - srcH * scale) * alignY - imgH * uvY * scale;
  return oy + imgFrac * imgH * scale;
}

/** 货架钉在底图木梁上，列往里收，别压到两侧帘子。 */
export function stallYardLay(roomTop: number, roomBottom: number, floor: number): StallYardLay {
  const roomH = Math.max(80, roomBottom - roomTop);
  const shelves: [number, number] = [
    stallImgY(STALL_BG_LAY.shelves[0], roomTop, roomH),
    stallImgY(STALL_BG_LAY.shelves[1], roomTop, roomH),
  ];
  const cols = 3;
  const cellW = 176;
  return {
    cellW,
    originX: 375 - (cols * cellW) / 2 + cellW / 2,
    shelves,
    slingY: floor - 36,
  };
}

const PULL_FIRE = 18;
const PULL_MAX = 88;

interface Peg {
  def: TargetDef;
  box: PIXI.Container;
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
  private _canPull = true;
  private _hint: PIXI.Text;
  private _restY = 0;
  private _pull: { y0: number; dy: number } | null = null;
  private _detachPull: (() => void) | null = null;

  constructor(onPull: () => void) {
    super();
    this._onPull = onPull;
    this.addChild(this._wall);
    this.addChild(this._sling);
    this.addChild(this._fx);
    this._hint = label(18, CREAM, true);
    this._hint.anchor.set(0.5);
    this.addChild(this._hint);
    this._sling.eventMode = 'none';
    this._sling.interactiveChildren = false;
    this._paintSling();
  }

  /** 挂墙。locked = 村庄等级还没够，靶在但打不中（shoot 那边也挂不上） */
  mount(openIds: ReadonlySet<string>, roomTop: number, roomBottom: number, floor: number): void {
    this._wall.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._pegs.length = 0;

    const lay = stallYardLay(roomTop, roomBottom, floor);
    TARGETS.forEach((def, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = lay.originX + col * lay.cellW;
      const cy = lay.shelves[row] ?? lay.shelves[0];
      const locked = !openIds.has(def.id);
      const peg = this._peg(def, cx, cy, locked);
      this._wall.addChild(peg.box);
      this._pegs.push(peg);
    });

    this._paintSling();
    this._restY = lay.slingY;
    this._sling.position.set(375, this._restY);
    this._hint.position.set(375, floor + 18);
    this._hint.text = this._canPull ? '往下拉，松手打出去' : '没弹子了';
    this.wake();
  }

  wake(): void {
    this._bindPull();
  }

  sleep(): void {
    this._detachPull?.();
    this._detachPull = null;
    this._pull = null;
    if (this._restY > 0) this._sling.y = this._restY;
  }

  setCanPull(on: boolean): void {
    this._canPull = on;
    this._sling.alpha = on && !this._busy ? 1 : 0.45;
    this._hint.text = on ? '往下拉，松手打出去' : '没弹子了';
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
    this._fly(375, this._sling.y - 48, peg.cx, peg.cy - 40, () => {
      this._knock(peg);
      this._loot(peg.cx, peg.cy - 48, lines);
      playSfx(result.rebounds > 0 ? 'kill_pop' : 'hit_smash', 0);
      if (result.rebounds <= 0) {
        this._busy = false;
        this._sling.alpha = this._canPull ? 1 : 0.45;
        done();
        return;
      }
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
    const hang = def.id === 'basin' || def.id === 'horn';
    const artH = 78;
    const artY = hang ? 18 : -artH / 2 - 4;
    const g = new PIXI.Graphics();
    g.beginFill(0x1a1008, locked ? 0.16 : 0.28).drawEllipse(0, hang ? 58 : 6, 40, 8).endFill();
    box.addChild(g);
    const artName = TARGET_ART[def.id];
    const spr = artName ? fitSprite(box, uiTex(artName), 0, artY, 112, artH) : null;
    if (spr) {
      spr.alpha = locked ? 0.4 : 1;
    } else {
      this._drawBody(g, def.id, locked);
    }
    const name = label(17, locked ? MUTED : CREAM, true);
    name.anchor.set(0.5);
    name.position.set(0, hang ? artY + artH / 2 + 16 : 20);
    name.text = def.name;
    box.addChild(name);
    return { def, box, cx, cy, locked };
  }

  private _drawBody(g: PIXI.Graphics, id: string, locked: boolean): void {
    const tint = locked ? 0x4a4a52 : (TINT[id] ?? 0xc9a46a);
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
      return;
    }
    if (id === 'tv') {
      g.beginFill(tint).drawRoundedRect(-36, -28, 72, 50, 6).endFill();
      g.beginFill(0x0c0e14, 0.8).drawRoundedRect(-28, -20, 56, 34, 3).endFill();
      return;
    }
    if (id === 'crate') {
      g.beginFill(tint).drawRoundedRect(-34, -24, 68, 48, 4).endFill();
      return;
    }
    if (id === 'basin') {
      g.beginFill(tint).drawEllipse(0, 4, 36, 16).endFill();
      return;
    }
    g.beginFill(tint).drawCircle(0, -4, 22).endFill();
  }

  private _slingHit(x: number, y: number): boolean {
    const r = { x: 375 - 120, y: this._restY - 100, w: 240, h: 176 };
    return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  }

  private _bindPull(): void {
    this._detachPull?.();
    const canvas = getTouchCanvas();
    const onDown = (e: Event): void => {
      if (this._busy || !this._canPull || !this.parent) return;
      const p = clientEventToDesign(e);
      if (!this._slingHit(p.x, p.y)) return;
      this._pull = { y0: p.y, dy: 0 };
    };
    const onMove = (e: Event): void => {
      if (!this._pull) return;
      (e as { preventDefault?: () => void }).preventDefault?.();
      const p = clientEventToDesign(e);
      this._pull.dy = Math.max(0, Math.min(PULL_MAX, p.y - this._pull.y0));
      this._sling.y = this._restY + this._pull.dy;
    };
    const onUp = (): void => {
      if (!this._pull) return;
      const dy = this._pull.dy;
      this._pull = null;
      const fire = dy >= PULL_FIRE || dy <= 10;
      TweenManager.to({
        target: this._sling,
        props: { y: this._restY },
        duration: 0.1,
        ease: Ease.easeOutQuad,
        onComplete: () => {
          if (fire && this._canPull && !this._busy) this._onPull();
        },
      });
    };
    const onCancel = (): void => {
      this._pull = null;
      this._sling.y = this._restY;
    };
    if (Platform.isMinigame) {
      canvas.addEventListener('touchstart', onDown, { passive: true });
      canvas.addEventListener('touchmove', onMove, { passive: false });
      canvas.addEventListener('touchend', onUp);
      canvas.addEventListener('touchcancel', onCancel);
      this._detachPull = () => {
        canvas.removeEventListener('touchstart', onDown);
        canvas.removeEventListener('touchmove', onMove);
        canvas.removeEventListener('touchend', onUp);
        canvas.removeEventListener('touchcancel', onCancel);
      };
    } else {
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onCancel);
      this._detachPull = () => {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onCancel);
      };
    }
  }

  private _paintSling(): void {
    this._sling.removeChildren().forEach((c) => c.destroy());
    const spr = fitSprite(this._sling, uiTex('stall_sling'), 0, -8, 150, 128);
    if (!spr) {
      const g = new PIXI.Graphics();
      g.beginFill(0x5a3a22).drawRoundedRect(-10, -8, 20, 56, 6).endFill();
      g.beginFill(0xc4b59a).drawEllipse(0, -16, 28, 12).endFill();
      g.lineStyle(4, 0x8a5a32, 1).moveTo(-28, -16).lineTo(0, 8).lineTo(28, -16).lineStyle(0);
      this._sling.addChild(g);
    }
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
