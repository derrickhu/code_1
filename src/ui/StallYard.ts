/**
 * 弹弓摊的靶场。经济仍由 stall.shoot 算，这里只负责「拉一下、靶倒下」。
 *
 * 打中哪个是掷出来的，玩家瞄不准指定靶 —— 和塔塔弹珠台一样，
 * 玩具感在手上那一下，不在选靶。选靶会把摊子做成第二个玩法（§4 强辅：它是资源出口）。
 */
import * as PIXI from 'pixi.js';
import { Platform } from '@/core/PlatformService';
import { buzz, playSfx } from '@/core/SfxPlayer';
import { TweenManager, Ease } from '@/core/TweenManager';
import { uiTex, type UiName } from '@/core/TextureLoader';
import {
  PRIZE_BEAT, TARGETS, prizeAccent, prizeChips, prizeTier, TARGET_UNLOCK_LV,
  type PrizeChip, type PrizeTier, type ShotResult, type TargetDef,
} from '@/balance/stall';
import { BgmPlayer } from '@/core/BgmPlayer';
import { playPebbleShot } from '@/fx/PebbleShot';
import { VfxKit } from '@/fx/VfxKit';
import {
  chipTint, drawBand, ghostDot, makeVeil, needsCard, paintMedal, playPrizeCard,
} from '@/ui/StallPrizeFx';
import { fitSprite, label, painted } from '@/ui/paint';
import { clientEventToDesign } from '@/utils/clientEventToDesign';
import { safeDestroy } from '@/utils/safeDestroy';
import { getTouchCanvas } from '@/utils/touchCanvas';

const CREAM = 0xfff4c4;

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

/**
 * 摊位底图（stall_v2.jpg）裁切。墙面是空的暗板，货架在代码里画，
 * 这样物品永远压在暗底上最亮。counter = 柜台台面在原图的高度比例，跟 jpg 对过。
 */
export const STALL_BG_LAY = {
  imgW: 720,
  imgH: 1280,
  uvY: 0.10,
  uvH: 0.90,
  alignY: 0,
  counter: 0.605,
} as const;

/**
 * 货架一格：物品站在板上，金名牌挂在板下，再下一行写打中给什么。
 * 物品高度按屏高在 itemMin..itemMax 之间伸缩，宽固定。
 */
export const STALL_SLOT = {
  w: 184,
  itemMin: 96,
  itemMax: 170,
  shelf: 20,
  plateW: 176,
  plateH: 64,
  payH: 30,
} as const;

/** 物品下沿到这一格最底的高度（板 + 名牌 + 产出行） */
const SLOT_FOOT = STALL_SLOT.shelf + 6 + STALL_SLOT.plateH + 4 + STALL_SLOT.payH;

const SLOT_NAME: Readonly<Partial<Record<string, string>>> = {
  cans: '铁皮罐',
  bottles: '绿酒瓶',
  basin: '铁盆',
  horn: '旧喇叭',
};

interface PayBit {
  icon?: UiName;
  text: string;
  color: number;
}

const EXP_TINT = 0x9be08a;
const GOLD_TINT = 0xffe08a;

/** 打中给什么，只写种类不写数（实际数要乘连带和村庄加成） */
const TARGET_PAY: Readonly<Record<string, readonly PayBit[]>> = {
  cans: [{ text: '经验', color: EXP_TINT }],
  bottles: [{ icon: 'icon_scrap', text: '废铁', color: CREAM }],
  tv: [{ icon: 'icon_parts', text: '零件', color: CREAM }],
  crate: [{ text: '经验', color: EXP_TINT }, { icon: 'icon_parts', text: '零件', color: CREAM }],
  basin: [{ text: '经验', color: EXP_TINT }, { text: '再来一发', color: GOLD_TINT }],
  horn: [{ icon: 'icon_credits', text: '工分', color: GOLD_TINT }],
};

/** 背光按好不好打分三档：常见暖白、少见冷蓝、稀有金 */
function spotTint(weight: number): number {
  if (weight >= 240) return 0xffe8b0;
  if (weight >= 120) return 0x9ad0ff;
  return 0xffc84a;
}

export interface StallYardLay {
  cellW: number;
  originX: number;
  /** 两排货架板的上沿 = 物品脚底 */
  shelves: readonly [number, number];
  itemH: number;
  counterY: number;
  slingY: number;
}

/** 筹码飞向的落点。摊顶三枚小口袋 + 经验就地消。 */
export interface PrizeDock {
  scrap: { x: number; y: number };
  parts: { x: number; y: number };
  credits: { x: number; y: number };
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

/**
 * 墙面从门楣下沿到柜台台面，两排货架平分。底图铺到屏底（roomBottom = 屏底），
 * 柜台跟着底图走，弹弓站在柜台前面的地上。
 */
export function stallYardLay(roomTop: number, roomBottom: number, floor: number): StallYardLay {
  const roomH = Math.max(80, roomBottom - roomTop);
  const counterY = stallImgY(STALL_BG_LAY.counter, roomTop, roomH);
  const wallTop = roomTop + 30;
  const rowH = Math.max(80, (counterY - 10 - wallTop) / 2);
  const itemH = Math.round(Math.max(
    STALL_SLOT.itemMin,
    Math.min(STALL_SLOT.itemMax, rowH - SLOT_FOOT - 16),
  ));
  const topPad = Math.max(6, (rowH - itemH - SLOT_FOOT) / 2);
  const shelves: [number, number] = [
    Math.round(wallTop + topPad + itemH),
    Math.round(wallTop + rowH + topPad + itemH),
  ];
  const cols = 3;
  const cellW = 204;
  return {
    cellW,
    originX: 375 - (cols * cellW) / 2 + cellW / 2,
    shelves,
    itemH,
    counterY,
    slingY: Math.round(Math.min(floor - 36, counterY + 190)),
  };
}

const PULL_FIRE = 18;
const PULL_MAX = 88;

/**
 * 拉够了才打得出去。
 *
 * 上一版写的是 `dy >= PULL_FIRE || dy <= 10`，后半截等于「点一下也发射」——
 * 而 dy 被 `Math.max(0, …)` 夹过，往上拖也是 0，于是连往上拨都能出弹。
 * 摊子的玩具感全在手上拉那一下（见文件头），点一下就打等于把它退化成一个按钮，
 * 也和提示「往下拉，松手打出去」自相矛盾。
 */
export function slingFires(dy: number): boolean {
  return dy >= PULL_FIRE;
}

interface Peg {
  def: TargetDef;
  box: PIXI.Container;
  art: PIXI.Container;
  cx: number;
  cy: number;
  locked: boolean;
  /** 新的一发开始时加一，把还在播的「摆回去」掐掉 */
  pose: number;
}

interface FlyingChip {
  root: PIXI.Container;
  kind: PrizeChip['kind'];
}

export class StallYard extends PIXI.Container {
  private readonly _onPull: () => void;
  private readonly _wall = new PIXI.Container();
  private readonly _sling = new PIXI.Container();
  private readonly _band = new PIXI.Graphics();
  private readonly _vfx = new VfxKit();
  private readonly _fx = new PIXI.Container();
  private readonly _pegs: Peg[] = [];
  private readonly _chips: FlyingChip[] = [];
  private readonly _spot = new PIXI.Graphics();
  private _veil: PIXI.Graphics | null = null;
  private _itemH: number = STALL_SLOT.itemMax;
  private _viewH = 1334;
  private _hung = false;
  private _openSize = 0;
  private _busy = false;
  private _wrecked = new Set<string>();
  private _canPull = true;
  private _hint: PIXI.Text;
  private _restY = 0;
  private _nudgeAt = 0;
  private _pull: { y0: number; dy: number } | null = null;
  private _detachPull: (() => void) | null = null;

  constructor(onPull: () => void) {
    super();
    this._onPull = onPull;
    this._spot.eventMode = 'none';
    this.addChild(this._spot);
    this.addChild(this._wall);
    this.addChild(this._sling);
    this.addChild(this._vfx.root);
    this.addChild(this._fx);
    this._hint = painted(20, CREAM, '#1a1008', 4);
    this._hint.anchor.set(0.5);
    this.addChild(this._hint);
    this._sling.eventMode = 'none';
    this._sling.interactiveChildren = false;
    this._band.eventMode = 'none';
    this._paintSling();
  }

  update(dt: number): void {
    this._vfx.update(dt);
  }

  /** 挂墙。locked = 村庄等级还没够，靶在但打不中（shoot 那边也挂不上） */
  mount(openIds: ReadonlySet<string>, roomTop: number, roomBottom: number, floor: number): void {
    this._wall.removeChildren().forEach((c) => safeDestroy(c, { children: true }));
    this._fx.removeChildren().forEach((c) => safeDestroy(c, { children: true }));
    this._vfx.reset();
    this._chips.length = 0;
    this._pegs.length = 0;
    this._wrecked.clear();
    this._clearVeil();
    this._viewH = Math.max(roomBottom, floor) + 80;

    const lay = stallYardLay(roomTop, roomBottom, floor);
    this._itemH = lay.itemH;
    for (const y of lay.shelves) this._paintShelf(y);
    TARGETS.forEach((def, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = lay.originX + col * lay.cellW;
      const cy = lay.shelves[row] ?? lay.shelves[0];
      const locked = !openIds.has(def.id);
      const peg = this._peg(def, cx, cy, locked);
      this._pegs.push(peg);
    });

    this._paintSling();
    this._restY = lay.slingY;
    this._sling.position.set(375, this._restY);
    this._paintSlingSpot(lay.slingY);
    this._hint.position.set(375, lay.slingY + 70);
    this._hint.text = this._restHint();
    this._hung = true;
    this._openSize = openIds.size;
    this.wake();
  }

  /**
   * 货架只 mount 一次（射击过程不能拆）。CDN 图后到时只换靶面，不重置倒下状态。
   */
  refreshArt(): void {
    for (const peg of this._pegs) this._fillPegArt(peg);
    this._paintSling();
  }

  get hung(): boolean {
    return this._hung && this._pegs.length > 0;
  }

  get openSize(): number {
    return this._openSize;
  }

  wake(): void {
    this._bindPull();
  }

  sleep(): void {
    this._detachPull?.();
    this._detachPull = null;
    this._pull = null;
    this._stretch(0);
    this._sling.scale.set(1);
    this._clearVeil();
    this._hung = false;
    BgmPlayer.duck(false);
    if (this._restY > 0) this._sling.y = this._restY;
  }

  setCanPull(on: boolean): void {
    this._canPull = on;
    this._sling.alpha = on && !this._busy ? 1 : 0.45;
    this._nudgeAt += 1;
    this._hint.text = this._restHint();
  }

  private _restHint(): string {
    return this._canPull ? '往下拉，松手打出去' : '没弹子了';
  }

  /** 拉不够就松手：什么都不发生会以为是卡了，得当场说一句 */
  private _nudge(): void {
    const token = ++this._nudgeAt;
    this._hint.text = '再往下拉一点';
    const hold = { t: 0 };
    TweenManager.to({
      target: hold,
      props: { t: 1 },
      duration: 0.8,
      onComplete: () => {
        if (this._nudgeAt !== token) return;
        this._hint.text = this._restHint();
      },
    });
  }

  get busy(): boolean {
    return this._busy;
  }

  /**
   * 播这一发。账已经入档，这里只负责让人看见「砸中 → 亮出来 → 飞进口袋」。
   * 飞完再 done，调用方这时候才能整页刷新，否则动画会被掐掉。
   */
  play(result: ShotResult, dock: PrizeDock, done: () => void): void {
    const peg = this._pegs.find((p) => p.def.id === result.hit.id);
    if (!peg) {
      done();
      return;
    }
    this._busy = true;
    this._sling.alpha = 0.45;
    this._resetPeg(peg);
    const aimY = this._aimY(peg);
    const finish = (): void => this._reveal(result, peg, dock, done);
    this._fly(375, this._sling.y - 48, peg.cx, aimY, false, () => {
      this._afterHit(peg, result, false, () => {
        if (result.rebounds <= 0) {
          finish();
          return;
        }
        this._fly(peg.cx, aimY, peg.cx + 40, aimY - 50, true, () => {
          this._afterHit(peg, result, true, finish);
        });
      });
    });
  }

  /** 物品中心。弹道、碎片、奖励都从这里出 */
  private _aimY(peg: Peg): number {
    return peg.cy - this._itemH / 2;
  }

  /** 一整条横板：顶面亮、正面暗、底下一道投影，两头钉托架 */
  private _paintShelf(y: number): void {
    const x0 = 70;
    const x1 = 680;
    const { shelf } = STALL_SLOT;
    const g = new PIXI.Graphics();
    g.beginFill(0x000000, 0.35).drawRect(x0 + 6, y + shelf, x1 - x0 - 12, 10).endFill();
    for (const bx of [x0 + 40, 375, x1 - 40]) {
      g.beginFill(0x2a1a0e).drawPolygon([bx - 8, y + shelf, bx + 8, y + shelf, bx + 3, y + shelf + 26, bx - 3, y + shelf + 26]).endFill();
    }
    g.beginFill(0x6b4426).drawRoundedRect(x0, y, x1 - x0, shelf, 3).endFill();
    g.beginFill(0xa8743f).drawRect(x0 + 2, y, x1 - x0 - 4, 5).endFill();
    g.beginFill(0x3e2614, 0.7).drawRect(x0 + 2, y + shelf - 4, x1 - x0 - 4, 3).endFill();
    g.beginFill(0x1a1008, 0.5);
    for (let x = x0 + 120; x < x1 - 60; x += 150) g.drawRect(x, y + 7, 26, 1.5);
    g.endFill();
    g.beginFill(0xc9a46a);
    for (const nx of [x0 + 10, x1 - 10]) g.drawCircle(nx, y + shelf / 2 + 1, 3);
    g.endFill();
    g.eventMode = 'none';
    this._wall.addChild(g);
  }

  /** 弹弓站在柜台前的暗地上，脚下给一圈暖光才看得见 */
  private _paintSlingSpot(y: number): void {
    const g = this._spot;
    g.clear();
    for (let i = 0; i < 8; i += 1) {
      const k = 1 - i * 0.11;
      g.beginFill(0xffd890, 0.032).drawEllipse(375, y + 52, 190 * k, 44 * k).endFill();
    }
  }

  private _peg(def: TargetDef, cx: number, cy: number, locked: boolean): Peg {
    const ih = this._itemH;
    const halo = new PIXI.Graphics();
    halo.position.set(cx, cy - ih * 0.5);
    const tint = locked ? 0x8a8a90 : spotTint(def.weight);
    for (let i = 0; i < 9; i += 1) {
      const k = 1 - i * 0.1;
      halo.beginFill(tint, locked ? 0.018 : 0.036)
        .drawEllipse(0, 0, STALL_SLOT.w * 0.62 * k, ih * 0.68 * k)
        .endFill();
    }
    halo.beginFill(0x000000, 0.4).drawEllipse(0, ih * 0.5 - 2, STALL_SLOT.w * 0.36, 7).endFill();
    halo.eventMode = 'none';
    this._wall.addChild(halo);

    const box = new PIXI.Container();
    box.position.set(cx, cy);
    const art = new PIXI.Container();
    box.addChild(art);
    this._wall.addChild(box);

    const info = new PIXI.Container();
    info.position.set(cx, cy + STALL_SLOT.shelf + 6);
    info.eventMode = 'none';
    this._paintPlate(info, SLOT_NAME[def.id] ?? def.name, locked);
    this._paintPay(info, def.id, STALL_SLOT.plateH + 4 + STALL_SLOT.payH / 2, locked);
    this._wall.addChild(info);

    if (locked) this._lockBadge(cx, cy - ih * 0.5, def.id);
    const peg: Peg = { def, box, art, cx, cy, locked, pose: 0 };
    this._fillPegArt(peg);
    return peg;
  }

  /** 金名牌挂在板下，深色字。图没到就退成深底描边牌 */
  private _paintPlate(info: PIXI.Container, name: string, locked: boolean): void {
    const { plateW, plateH } = STALL_SLOT;
    const plate = fitSprite(info, uiTex('settle_name'), 0, plateH / 2, plateW, plateH);
    if (plate) {
      plate.tint = locked ? 0x8a8478 : 0xffffff;
    } else {
      const g = new PIXI.Graphics();
      g.beginFill(locked ? 0x3a3630 : 0x6b4426).drawRoundedRect(-plateW / 2 + 10, 8, plateW - 20, plateH - 16, 8).endFill();
      g.lineStyle(2, 0xc9a46a, 0.8).drawRoundedRect(-plateW / 2 + 10, 8, plateW - 20, plateH - 16, 8);
      info.addChild(g);
    }
    const t = label(name.length >= 4 ? 21 : 23, plate ? 0x3a1e0a : CREAM, true);
    t.anchor.set(0.5);
    t.position.set(0, plateH / 2 + 1);
    t.text = name;
    if (locked) t.alpha = 0.75;
    info.addChild(t);
  }

  /** 名牌底下一行：图标 + 种类，一眼知道打它图什么 */
  private _paintPay(info: PIXI.Container, id: string, y: number, locked: boolean): void {
    const bits = TARGET_PAY[id] ?? [];
    const iconS = 26;
    const gap = 4;
    const sep = 14;
    const row = new PIXI.Container();
    let x = 0;
    bits.forEach((bit, i) => {
      if (i > 0) {
        const plus = painted(18, CREAM, '#1a1008', 3);
        plus.anchor.set(0, 0.5);
        plus.position.set(x + sep / 2 - 6, 0);
        plus.text = '+';
        row.addChild(plus);
        x += sep + 8;
      }
      if (bit.icon && fitSprite(row, uiTex(bit.icon), x + iconS / 2, 0, iconS, iconS)) {
        x += iconS + gap;
      }
      const t = painted(19, bit.color, '#1a1008', 4);
      t.anchor.set(0, 0.5);
      t.position.set(x, 0);
      t.text = bit.text;
      row.addChild(t);
      x += t.width;
    });
    row.position.set(-x / 2, y);
    if (locked) row.alpha = 0.6;
    info.addChild(row);
  }

  /** 锁着的：剪影上压一块深牌，锁 + 「村 N 级开」 */
  private _lockBadge(cx: number, cy: number, id: string): void {
    const lv = TARGET_UNLOCK_LV[id] ?? 1;
    const root = new PIXI.Container();
    root.position.set(cx, cy);
    root.eventMode = 'none';
    const w = 132;
    const h = 44;
    const g = new PIXI.Graphics();
    g.beginFill(0x140e0a, 0.82).drawRoundedRect(-w / 2, -h / 2, w, h, 22).endFill();
    g.lineStyle(2, 0xc9a46a, 0.85).drawRoundedRect(-w / 2, -h / 2, w, h, 22).lineStyle(0);
    root.addChild(g);
    this._lockMark(root, -w / 2 + 24, -8);
    const t = label(19, CREAM, true);
    t.anchor.set(0, 0.5);
    t.position.set(-w / 2 + 40, 0);
    t.text = `村${lv}级开`;
    root.addChild(t);
    this._wall.addChild(root);
  }

  private _fillPegArt(peg: Peg): void {
    const w = STALL_SLOT.w;
    const h = this._itemH;
    const artName = TARGET_ART[peg.def.id];
    const tex = artName ? uiTex(artName) : null;
    const ready = !!(tex?.baseTexture.valid && tex.width > 1);
    const spr = peg.art.children.find((c): c is PIXI.Sprite => c instanceof PIXI.Sprite);
    if (ready && tex && spr && spr.texture === tex) return;
    peg.art.removeChildren().forEach((c) => safeDestroy(c, { children: true }));
    if (ready && tex) {
      const next = new PIXI.Sprite(tex);
      next.anchor.set(0.5, 1);
      next.position.set(0, 2);
      next.scale.set(Math.min(w / tex.width, h / tex.height));
      next.eventMode = 'none';
      this._skinTarget(next, peg.locked);
      peg.art.addChild(next);
      return;
    }
    const g = new PIXI.Graphics();
    this._drawBody(g, peg.def.id, peg.locked);
    g.position.set(0, -h / 2);
    g.scale.set(h / 80);
    peg.art.addChild(g);
  }

  /** 锁着的压成暗剪影，靠锁牌说明，不靠半透明 */
  private _skinTarget(spr: PIXI.Sprite, locked: boolean): void {
    spr.alpha = locked ? 0.85 : 1;
    spr.tint = locked ? 0x4a4650 : 0xffffff;
  }

  private _lockMark(box: PIXI.Container, x: number, y: number): void {
    const g = new PIXI.Graphics();
    g.position.set(x, y);
    g.lineStyle(2.5, 0xf0e6c0, 0.95);
    g.drawRoundedRect(-9, 0, 18, 14, 3);
    g.arc(0, 0, 6, Math.PI, 0);
    g.lineStyle(0);
    g.beginFill(0x2a160c, 0.55).drawCircle(0, 7, 2).endFill();
    box.addChild(g);
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
      this._stretch(this._pull.dy);
    };
    const onUp = (): void => {
      if (!this._pull) return;
      const dy = this._pull.dy;
      this._pull = null;
      const fire = slingFires(dy);
      if (!fire) this._nudge();
      this._stretch(0);
      const snap = { s: 1.14 };
      this._sling.scale.set(1.14);
      TweenManager.to({
        target: snap,
        props: { s: 1 },
        duration: 0.16,
        ease: Ease.easeOutBack,
        onUpdate: () => this._sling.scale.set(snap.s),
      });
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
      this._stretch(0);
      this._sling.scale.set(1);
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
    this._sling.removeChildren().forEach((c) => {
      if (c !== this._band) safeDestroy(c);
    });
    if (!this._band.parent) this._sling.addChildAt(this._band, 0);
    const spr = fitSprite(this._sling, uiTex('stall_sling'), 0, -8, 150, 128);
    if (!spr) {
      const g = new PIXI.Graphics();
      g.beginFill(0x5a3a22).drawRoundedRect(-10, -8, 20, 56, 6).endFill();
      g.beginFill(0xc4b59a).drawEllipse(0, -16, 28, 12).endFill();
      g.lineStyle(4, 0x8a5a32, 1).moveTo(-28, -16).lineTo(0, 8).lineTo(28, -16).lineStyle(0);
      this._sling.addChild(g);
    }
  }

  private _stretch(dy: number): void {
    drawBand(this._band, dy, PULL_MAX);
    const t = Math.max(0, Math.min(1, dy / PULL_MAX));
    this._sling.scale.set(1 + t * 0.05, 1 + t * 0.1);
  }

  private _fly(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    hop: boolean,
    land: () => void,
  ): void {
    playPebbleShot({
      parent: this._fx,
      kit: this._vfx,
      x0, y0, x1, y1, hop,
      onLand: land,
    });
    playSfx('atk_sniper', 40);
  }

  private _afterHit(peg: Peg, result: ShotResult, combo: boolean, next: () => void): void {
    const beat = PRIZE_BEAT[prizeTier(result.gain)];
    const stop = combo ? 0 : beat.hitStop;
    const go = (): void => {
      this._impact(peg, result, combo);
      next();
    };
    if (stop <= 0) {
      go();
      return;
    }
    if (!combo && prizeTier(result.gain) === 'jackpot') this._whiteFlash();
    const hold = { t: 0 };
    TweenManager.to({
      target: hold,
      props: { t: 1 },
      duration: stop,
      onComplete: go,
    });
  }

  private _impact(peg: Peg, result: ShotResult, combo: boolean): void {
    const tier = prizeTier(result.gain);
    this._knock(peg, tier, peg.def.id === 'cans' ? 0.78 : 0.42);
    this._squash(peg);
    if (peg.def.id !== 'cans') this._flash(peg);
    this._smash(peg, combo ? 'common' : tier);
    if (peg.def.id === 'cans' && !combo) this._wreckCans(peg);
    this._punch(PRIZE_BEAT[combo ? 'common' : tier].punch);
    playSfx(combo ? 'kill_pop' : impactSfx(result.hit.id), 0);
    buzz(tier === 'jackpot' && !combo ? 'heavy' : tier === 'rare' && !combo ? 'medium' : 'light');
    if (combo) this._float(peg.cx + 16, peg.cy - 36, '连击', 0xffe08a);
  }

  private _reveal(result: ShotResult, peg: Peg, dock: PrizeDock, done: () => void): void {
    const tier = prizeTier(result.gain);
    const beat = PRIZE_BEAT[tier];
    const x = peg.cx;
    const y = this._aimY(peg);
    if (needsCard(tier)) {
      this._dim(peg);
      if (tier === 'jackpot') BgmPlayer.duck(true);
      playPrizeCard(this._fx, result, Math.min(y + 80, this._viewH * 0.48));
      this._vfx.burst(375, Math.min(y + 80, this._viewH * 0.48), prizeAccent(tier), tier === 'jackpot' ? 2.2 : 1.5);
      playSfx(tier === 'jackpot' ? 'win' : 'install_on', 0);
    }
    const chips = prizeChips(result.gain);
    chips.forEach((chip, i) => {
      if (chip.kind === 'exp') {
        this._float(x, y - 28, `经验 +${chip.amount}`, chipTint('exp'));
        return;
      }
      this._spawnChip(chip, x, y, i, chips.length);
    });

    const hold = { t: 0 };
    TweenManager.to({
      target: hold,
      props: { t: 1 },
      duration: beat.hold,
      onComplete: () => {
        this._collect(dock, beat.fly, () => {
          this._undim();
          BgmPlayer.duck(false);
          this._busy = false;
          this._sling.alpha = this._canPull ? 1 : 0.45;
          done();
        });
      },
    });
  }

  private _resetPeg(peg: Peg): void {
    peg.pose += 1;
    this._wrecked.delete(peg.def.id);
    peg.box.rotation = 0;
    peg.box.y = peg.cy;
    peg.box.scale.set(1);
    peg.box.alpha = 1;
  }

  private _knock(peg: Peg, tier: PrizeTier, dur = 0.42): void {
    const box = peg.box;
    const cans = peg.def.id === 'cans';
    const pose = peg.pose;
    const amp = tier === 'jackpot' ? 0.55 : cans ? 0.52 : 0.38;
    const drop = cans ? 22 : tier === 'jackpot' ? 18 : 12;
    const restR = cans ? 0.28 : 0;
    const restDrop = cans ? 10 : 0;
    const rot = { r: 0 };
    TweenManager.to({
      target: rot,
      props: { r: 1 },
      duration: dur,
      ease: Ease.easeOutBounce,
      onUpdate: () => {
        if (peg.pose !== pose) return;
        const swing = Math.sin(rot.r * Math.PI);
        box.rotation = swing * amp + rot.r * restR;
        box.y = peg.cy + swing * drop + rot.r * restDrop;
      },
      onComplete: () => {
        if (peg.pose !== pose) return;
        if (cans) {
          this._standCans(peg, pose);
          return;
        }
        box.rotation = restR;
        box.y = peg.cy + restDrop;
      },
    });
  }

  /** 铁皮罐倒在板上只是这一下的反馈，倒完就摆回原样。以前要等下次打中才立起来。 */
  private _standCans(peg: Peg, pose: number): void {
    const box = peg.box;
    const hold = { t: 0 };
    TweenManager.to({
      target: hold,
      props: { t: 1 },
      duration: 0.32,
      delay: 0.12,
      ease: Ease.easeOutBack,
      onUpdate: () => {
        if (peg.pose !== pose) return;
        const k = Math.max(0, Math.min(1, hold.t));
        box.rotation = 0.28 * (1 - k);
        box.y = peg.cy + 10 * (1 - k);
        box.scale.set(1 + 0.16 * (1 - k), 0.4 + 0.6 * Math.max(0, hold.t));
        box.alpha = 1;
      },
      onComplete: () => {
        if (peg.pose !== pose) return;
        box.rotation = 0;
        box.y = peg.cy;
        box.scale.set(1);
        box.alpha = 1;
      },
    });
  }

  private _flash(peg: Peg): void {
    const flash = new PIXI.Graphics();
    flash.beginFill(0xffffff, 0.7).drawRoundedRect(-STALL_SLOT.w * 0.32, -this._itemH * 0.9, STALL_SLOT.w * 0.64, this._itemH * 0.86, 10).endFill();
    peg.box.addChild(flash);
    const hold = { a: 0.7 };
    TweenManager.to({
      target: hold,
      props: { a: 0 },
      duration: 0.14,
      onUpdate: () => { flash.alpha = hold.a; },
      onComplete: () => safeDestroy(flash),
    });
  }

  private _squash(peg: Peg): void {
    const box = peg.box;
    const cans = peg.def.id === 'cans';
    const pose = peg.pose;
    const hold = { x: 1.25, y: 0.55 };
    box.scale.set(hold.x, hold.y);
    TweenManager.to({
      target: hold,
      props: cans ? { x: 1.16, y: 0.4 } : { x: 1, y: 1 },
      duration: cans ? 0.22 : 0.3,
      ease: Ease.easeOutBack,
      onUpdate: () => {
        if (peg.pose !== pose) return;
        box.scale.set(hold.x, hold.y);
      },
    });
  }

  private _whiteFlash(): void {
    const g = new PIXI.Graphics();
    g.beginFill(0xfff4c4, 0.4).drawRect(0, 0, 750, this._viewH).endFill();
    g.blendMode = PIXI.BLEND_MODES.ADD;
    g.eventMode = 'none';
    this.addChild(g);
    TweenManager.to({
      target: g,
      props: { alpha: 0 },
      duration: 0.14,
      onComplete: () => safeDestroy(g),
    });
  }

  private _dim(hit: Peg): void {
    this._clearVeil();
    const veil = makeVeil(this._viewH);
    this._veil = veil;
    this.addChildAt(veil, this.getChildIndex(this._fx));
    TweenManager.to({ target: veil, props: { alpha: 1 }, duration: 0.14 });
    for (const p of this._pegs) {
      TweenManager.to({
        target: p.box,
        props: { alpha: p === hit ? (this._wrecked.has(p.def.id) ? 0 : 1) : 0.28 },
        duration: 0.14,
      });
    }
  }

  private _undim(): void {
    const veil = this._veil;
    if (veil) {
      TweenManager.to({
        target: veil,
        props: { alpha: 0 },
        duration: 0.16,
        onComplete: () => {
          if (this._veil === veil) this._clearVeil();
        },
      });
    }
    for (const p of this._pegs) {
      if (this._wrecked.has(p.def.id)) continue;
      TweenManager.to({ target: p.box, props: { alpha: 1 }, duration: 0.16 });
    }
  }

  private _clearVeil(): void {
    if (!this._veil) return;
    safeDestroy(this._veil);
    this._veil = null;
  }

  private _smash(peg: Peg, tier: PrizeTier): void {
    const x = peg.cx;
    const y = this._aimY(peg);
    const tint = TINT[peg.def.id] ?? 0xc9a46a;
    const scale = tier === 'jackpot' ? 1.8 : tier === 'rare' ? 1.35 : 1;
    const id = peg.def.id;
    if (id === 'tv') this._vfx.plate('blast', x, y, { tint: 0x7ec8ff, s0: 0.7, s1: 1.15, add: false });
    else if (id === 'horn') this._vfx.plate('flash', x, y, { tint: 0xffe08a, s0: 0.5, s1: 1.2, life: 0.16, add: false });
    else this._vfx.plate('smash', x, y, { tint, s0: 0.55, s1: 1.0, add: false, life: id === 'cans' ? 0.34 : 0.22 });
    this._vfx.spray(x, y, {
      n: tier === 'jackpot' ? 14 : tier === 'rare' ? 10 : 7,
      tint,
      kind: 'spark',
      speed: 170 * scale,
      life: 0.28,
      gy: 320,
      scale: 0.2,
      add: false,
    });
    const n = tier === 'jackpot' ? 10 : tier === 'rare' ? 7 : 5;
    const life = peg.def.id === 'cans' ? 0.88 : 0.4;
    for (let i = 0; i < n; i += 1) {
      const shard = new PIXI.Graphics();
      const w = 5 + (i % 3) * 3;
      shard.beginFill(tint).drawPolygon([0, 0, w, 2, w * 0.4, w]).endFill();
      shard.position.set(x, y);
      this._fx.addChild(shard);
      const ang = (i / n) * Math.PI * 2;
      const dist = 36 + (i % 4) * 12;
      const hold = { t: 0 };
      TweenManager.to({
        target: hold,
        props: { t: 1 },
        duration: life,
        ease: Ease.easeOutQuad,
        onUpdate: () => {
          shard.x = x + Math.cos(ang) * dist * hold.t;
          shard.y = y + Math.sin(ang) * dist * hold.t + hold.t * hold.t * 56;
          shard.rotation = hold.t * 5;
          shard.alpha = 1 - hold.t;
        },
        onComplete: () => safeDestroy(shard),
      });
    }
  }

  /** 三只铁皮罐拆开：飞出去、砸在货架上停一会，再淡掉。 */
  private _wreckCans(peg: Peg): void {
    const x = peg.cx;
    const y = this._aimY(peg);
    const specs = [
      { dx: -1.05, lift: 46, spin: 6.4, w: 16, h: 28 },
      { dx: 0.12, lift: 58, spin: -7.2, w: 18, h: 30 },
      { dx: 1.08, lift: 40, spin: 5.1, w: 14, h: 24 },
    ];
    for (const spec of specs) {
      const lid = new PIXI.Graphics();
      lid.beginFill(0x1a1008).drawRoundedRect(-spec.w / 2 - 2, -spec.h / 2 - 2, spec.w + 4, spec.h + 4, 4).endFill();
      lid.beginFill(0xc45a22).drawRoundedRect(-spec.w / 2, -spec.h / 2, spec.w, spec.h, 3).endFill();
      lid.beginFill(0xfff4c4, 0.28).drawRoundedRect(-spec.w / 2 + 3, -spec.h / 2 + 3, spec.w * 0.28, spec.h * 0.28, 2).endFill();
      lid.beginFill(0x8a3a18, 0.55).drawRoundedRect(-spec.w / 2 + 2, 2, spec.w - 4, spec.h * 0.38, 2).endFill();
      lid.position.set(x, y);
      this._fx.addChild(lid);
      const hold = { t: 0 };
      TweenManager.to({
        target: hold,
        props: { t: 1 },
        duration: 0.72,
        ease: Ease.linear,
        onUpdate: () => {
          const fly = Math.min(1, hold.t / 0.48);
          lid.x = x + spec.dx * 82 * fly;
          lid.y = y - spec.lift * Math.sin(fly * Math.PI) + 18 * fly;
          lid.rotation = fly * spec.spin;
          lid.alpha = hold.t > 0.78 ? 1 - (hold.t - 0.78) / 0.22 : 1;
        },
        onComplete: () => safeDestroy(lid),
      });
    }
  }

  private _punch(px: number): void {
    const wall = this._wall;
    const ox = 0;
    const hold = { t: 0 };
    TweenManager.to({
      target: hold,
      props: { t: 1 },
      duration: 0.18,
      ease: Ease.easeOutQuad,
      onUpdate: () => {
        const k = 1 - hold.t;
        wall.x = ox + Math.sin(hold.t * Math.PI * 7) * px * k;
        wall.y = Math.cos(hold.t * Math.PI * 5) * px * 0.35 * k;
      },
      onComplete: () => {
        wall.x = ox;
        wall.y = 0;
      },
    });
  }

  private _float(x: number, y: number, text: string, color: number): void {
    const t = painted(24, color, '#1a1008', 4);
    t.anchor.set(0.5);
    t.position.set(x, y);
    t.text = text;
    this._fx.addChild(t);
    const hold = { y: t.y, a: 1 };
    TweenManager.to({
      target: hold,
      props: { y: t.y - 52, a: 0 },
      duration: 1.15,
      ease: Ease.easeOutCubic,
      onUpdate: () => {
        t.y = hold.y;
        t.alpha = hold.a;
      },
      onComplete: () => safeDestroy(t),
    });
  }

  private _spawnChip(chip: PrizeChip, x: number, y: number, i: number, n: number): void {
    const root = new PIXI.Container();
    root.position.set(x + (i - (n - 1) / 2) * 36, y);
    paintMedal(root, chip, chipTint(chip.kind));
    this._fx.addChild(root);
    this._chips.push({ root, kind: chip.kind });
    root.scale.set(0.16);
    const hold = { s: 0.16, y: root.y };
    TweenManager.to({
      target: hold,
      props: { s: 1, y: root.y - 48 - i * 12 },
      duration: 0.34,
      delay: i * 0.05,
      ease: Ease.easeOutBack,
      onUpdate: () => {
        root.scale.set(hold.s);
        root.y = hold.y;
      },
    });
  }

  private _collect(dock: PrizeDock, dur: number, done: () => void): void {
    if (this._chips.length === 0) {
      done();
      return;
    }
    let left = this._chips.length;
    this._chips.forEach((chip, i) => {
      const dest = chip.kind === 'scrap'
        ? dock.scrap
        : chip.kind === 'parts'
          ? dock.parts
          : dock.credits;
      const x0 = chip.root.x;
      const y0 = chip.root.y;
      const midX = (x0 + dest.x) / 2 + (dest.x > x0 ? -56 : 56);
      const midY = Math.min(y0, dest.y) - 72;
      const hold = { t: 0 };
      let ghostAt = 0;
      TweenManager.to({
        target: hold,
        props: { t: 1 },
        duration: dur,
        delay: i * 0.06,
        ease: Ease.easeInCubic,
        onUpdate: () => {
          const t = hold.t;
          const u = 1 - t;
          const x = u * u * x0 + 2 * u * t * midX + t * t * dest.x;
          const y = u * u * y0 + 2 * u * t * midY + t * t * dest.y;
          chip.root.position.set(x, y);
          chip.root.scale.set(1 - 0.5 * t);
          chip.root.alpha = 1 - 0.15 * t;
          if (t - ghostAt > 0.08) {
            ghostAt = t;
            ghostDot(this._fx, x, y, chipTint(chip.kind));
          }
        },
        onComplete: () => {
          safeDestroy(chip.root, { children: true });
          const tint = chipTint(chip.kind);
          this._vfx.burst(dest.x, dest.y, tint, 0.85);
          this._vfx.ring(dest.x, dest.y, tint, 0.2);
          playSfx('kill_pop', 24);
          left -= 1;
          if (left <= 0) {
            this._chips.length = 0;
            const wait = { t: 0 };
            TweenManager.to({
              target: wait,
              props: { t: 1 },
              duration: 0.12,
              onComplete: done,
            });
          }
        },
      });
    });
  }
}

function impactSfx(id: string): string {
  if (id === 'bottles') return 'hit_smash';
  if (id === 'tv') return 'hit_blast';
  if (id === 'crate') return 'hit';
  if (id === 'horn') return 'hit_smash';
  if (id === 'basin') return 'kill_pop';
  return 'hit_smash';
}
