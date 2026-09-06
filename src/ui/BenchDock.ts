/**
 * 底部布阵坞：手上还没上场的村民，两排卡嵌在坞板里，人多了再横滑。
 *
 * 它替掉的是上一版的改装槽底栏。差别在于**这里拖的是「谁上场」，不是「装什么」**。
 *
 * 卡面上必须写三样，缺一样布阵就没法做决策：
 *
 * 1. **门路**（带颜色）—— 克制看它。开战前敌方门路是可见的，
 *    玩家要能在坞里一眼扫出「哪几个克这一关」。
 * 2. **定位** —— 决定他该站前排还是后排。
 * 3. **几阶** —— 「我这几天喂大的是哪个」得在上场那一刻看得见，
 *    否则养成的成果只存在于村里的面板上（§4.1）。
 *
 * 刻意**不做**「推荐」标记或按门路排序。§4.4 写明不给答案，只给信息 ——
 * 一旦把克制这一关的人自动排到最前面，布阵就退化成「点亮着的那几个」。
 */
import * as PIXI from 'pixi.js';
import { heroTex, uiTex } from '@/core/TextureLoader';
import { JOB_NAME, LANE_NAME, getVillager, jobOf, type Lane } from '@/balance/villagers';
import { GOLD, fillSprite, fitSprite, ironSlab, label } from '@/ui/paint';

const CARD_ROWS = 2;
/** 一屏至少铺满这么多列，人少也占住坞板，别缩成左下角三颗钉 */
const VIS_COLS = 5;
const CARD_GAP = 10;
const TRAY_PAD = 16;
const DOCK_X = 16;
const DOCK_W = 718;
const PORT_W = DOCK_W - TRAY_PAD * 2;
const CARD_W = Math.floor((PORT_W - (VIS_COLS - 1) * CARD_GAP) / VIS_COLS);
const CARD_H = 112;
const FACE = 58;

const PORT_H = CARD_H * CARD_ROWS + CARD_GAP;
/** 锈铁坞只包住卡槽。开打 / 回村口在坞板下面 */
export const BENCH_TRAY_H = TRAY_PAD + PORT_H + TRAY_PAD;
export const BENCH_FOOTER_H = 64;
export const BENCH_H = BENCH_TRAY_H + BENCH_FOOTER_H;
export const BENCH_GAP = 8;

export function benchFooterTop(benchY: number): number {
  return benchY + BENCH_TRAY_H;
}

/** 门路配色。和图鉴、村子面板共用同一套，换色要一起换 */
export const LANE_TINT: Readonly<Record<Lane, number>> = {
  reach: 0x8f7a4a,
  stand: 0xc4703a,
  heavy: 0xd9a13b,
  rage: 0xb4553f,
  band: 0xd4736b,
};

export interface BenchItem {
  id: string;
  evoStage: number;
  stars: number;
  craft?: number;
  /** 已经站到格子上了。灰掉但不移出，位置别跳 */
  placed: boolean;
}

interface Card {
  id: string;
  box: PIXI.Container;
  ring: PIXI.Graphics;
}

export class BenchDock extends PIXI.Container {
  private readonly _port = new PIXI.Container();
  private readonly _inner = new PIXI.Container();
  /** 名字不能叫 _mask：PIXI.DisplayObject 自己有个同名内部字段，撞了会让整类不再是 DisplayObject */
  private readonly _maskG = new PIXI.Graphics();
  private readonly _chromeSpr = new PIXI.Container();
  private readonly _chrome = new PIXI.Graphics();
  private readonly _cards: Card[] = [];
  private _scroll = 0;
  private _minScroll = 0;
  private _selected: string | null = null;
  private _sig = '';

  constructor() {
    super();
    this.eventMode = 'none';
    this._port.position.set(DOCK_X + TRAY_PAD, TRAY_PAD);
    this._maskG.renderable = false;
    this.addChild(this._chromeSpr);
    this.addChild(this._chrome);
    this.addChild(this._port);
    this._port.addChild(this._inner);
    this._port.addChild(this._maskG);
    this.paintChrome();
  }

  place(y: number): void {
    this.position.set(0, y);
  }

  get selected(): string | null {
    return this._selected;
  }

  select(id: string | null): void {
    this._selected = id;
    for (const c of this._cards) this._paintRing(c);
  }

  /** 贴图刚到时清签名，下一帧才能把色块换成脸 */
  invalidate(): void {
    this._sig = '';
  }

  paintChrome(): void {
    this._chromeSpr.removeChildren().forEach((c) => c.destroy());
    this._chrome.clear();
    if (!fillSprite(
      this._chromeSpr,
      uiTex('iron_dock'),
      DOCK_X + DOCK_W / 2,
      BENCH_TRAY_H / 2,
      DOCK_W,
      BENCH_TRAY_H,
    )) {
      ironSlab(this._chrome, DOCK_X, 0, DOCK_W, BENCH_TRAY_H, 14);
    }
    // 坞板中间挖一槽，卡坐在槽里，不再漂在锈皮上
    this._chrome.beginFill(0x0c0e14, 0.62)
      .drawRoundedRect(DOCK_X + 10, 10, DOCK_W - 20, PORT_H + 12, 12)
      .endFill();
  }

  /**
   * 重建卡片。签名一致就只刷高亮 ——
   * 每帧重建会把正在滑的手势打断，滑到一半会弹回去。
   */
  renderList(items: readonly BenchItem[]): void {
    const sig = items.map((i) => `${i.id}:${i.evoStage}:${i.stars}:${i.craft ?? 0}:${i.placed ? 1 : 0}`).join(',');
    if (sig === this._sig) {
      for (const c of this._cards) this._paintRing(c);
      return;
    }
    this._sig = sig;

    this._inner.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._cards.length = 0;

    const cols = Math.max(VIS_COLS, Math.ceil(items.length / CARD_ROWS));
    const slots = cols * CARD_ROWS;

    for (let i = 0; i < slots; i += 1) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const item = items[i];
      if (item) {
        const card = this._card(item);
        card.box.position.set(col * (CARD_W + CARD_GAP), row * (CARD_H + CARD_GAP));
        this._inner.addChild(card.box);
        this._cards.push(card);
      } else {
        const empty = this._empty();
        empty.position.set(col * (CARD_W + CARD_GAP), row * (CARD_H + CARD_GAP));
        this._inner.addChild(empty);
      }
    }

    this._maskG.clear();
    this._maskG.beginFill(0xffffff).drawRect(0, 0, PORT_W, PORT_H).endFill();

    const content = cols * CARD_W + Math.max(0, cols - 1) * CARD_GAP;
    this._minScroll = Math.min(0, PORT_W - content);
    this._scroll = Math.max(this._minScroll, Math.min(0, this._scroll));
    this._inner.position.x = this._scroll;
    // 刚好装得下就不要 mask：小游戏里祖先 mask 会让 hitTest 把整卡判成点不中
    this._inner.mask = this._minScroll < 0 ? this._maskG : null;
  }

  /** 设计坐标落在哪张卡上。拖人 / 横滑由战场场景收，坞自己不再听触摸 */
  cardAt(gx: number, gy: number): string | null {
    const lx = gx - (DOCK_X + TRAY_PAD);
    const ly = gy - this.position.y - TRAY_PAD;
    if (lx < 0 || lx > PORT_W || ly < 0 || ly > PORT_H) return null;
    const innerX = lx - this._scroll;
    for (const c of this._cards) {
      if (
        innerX >= c.box.x && innerX <= c.box.x + CARD_W
        && ly >= c.box.y && ly <= c.box.y + CARD_H
      ) return c.id;
    }
    return null;
  }

  inTray(gx: number, gy: number): boolean {
    return gx >= DOCK_X && gx <= DOCK_X + DOCK_W
      && gy >= this.position.y && gy <= this.position.y + BENCH_TRAY_H;
  }

  scrollBy(dx: number): void {
    this._scroll = Math.max(this._minScroll, Math.min(0, this._scroll + dx));
    this._inner.position.x = this._scroll;
  }

  private _well(g: PIXI.Graphics, empty: boolean): void {
    g.beginFill(empty ? 0x14161f : 0x12141c, empty ? 0.55 : 0.94)
      .drawRoundedRect(0, 0, CARD_W, CARD_H, 12).endFill();
    g.lineStyle(1.8, GOLD, empty ? 0.22 : 0.5)
      .drawRoundedRect(1, 1, CARD_W - 2, CARD_H - 2, 11).lineStyle(0);
  }

  private _empty(): PIXI.Container {
    const box = new PIXI.Container();
    box.eventMode = 'none';
    const g = new PIXI.Graphics();
    this._well(g, true);
    box.addChild(g);
    return box;
  }

  private _card(item: BenchItem): Card {
    const v = getVillager(item.id);
    const box = new PIXI.Container();
    box.eventMode = 'none';
    box.interactiveChildren = false;

    const bg = new PIXI.Graphics();
    this._well(bg, false);
    bg.beginFill(LANE_TINT[v.lane], item.placed ? 0.22 : 0.72)
      .drawRoundedRect(5, 4, CARD_W - 10, 6, 3).endFill();
    box.addChild(bg);

    const face = fitSprite(box, heroTex(v.id, item.evoStage), CARD_W / 2, 14 + FACE / 2, FACE, FACE);
    if (face) {
      if (item.placed) face.tint = 0x6a6a72;
    } else {
      const blk = new PIXI.Graphics();
      blk.beginFill(LANE_TINT[v.lane], item.placed ? 0.3 : 0.75)
        .drawRoundedRect(CARD_W / 2 - 22, 16, 44, FACE - 8, 8).endFill();
      box.addChild(blk);
    }

    // 门路 · 定位。克制和站位全靠这一行，别为了好看省掉
    const tag = label(13, item.placed ? 0x8a8a92 : LANE_TINT[v.lane], true);
    tag.anchor.set(0.5);
    tag.position.set(CARD_W / 2, 80);
    tag.text = `${LANE_NAME[v.lane]}·${JOB_NAME[jobOf(v.role)]}`;
    box.addChild(tag);

    const evo = label(13, item.placed ? 0x8a8a92 : 0xffd66b, true);
    evo.anchor.set(0.5);
    evo.position.set(CARD_W / 2, 98);
    const craft = item.craft ?? (item.evoStage >= 3 ? 6 : item.evoStage >= 2 ? 3 : 1);
    evo.text = `手艺${craft}${item.stars > 0 ? ` ★${item.stars}` : ''}`;
    box.addChild(evo);

    if (item.placed) {
      const mark = new PIXI.Graphics();
      mark.beginFill(0x1a120c, 0.4).drawRoundedRect(0, 0, CARD_W, CARD_H, 12).endFill();
      mark.lineStyle(3.4, 0xfff4c4, 0.95);
      mark.moveTo(CARD_W - 28, 22);
      mark.lineTo(CARD_W - 18, 34);
      mark.lineTo(CARD_W - 8, 16);
      mark.lineStyle(0);
      box.addChild(mark);
    }

    const ring = new PIXI.Graphics();
    box.addChild(ring);

    const card: Card = { id: item.id, box, ring };
    this._paintRing(card);
    return card;
  }

  private _paintRing(card: Card): void {
    card.ring.clear();
    if (card.id !== this._selected) return;
    card.ring.lineStyle(3.4, GOLD, 1).drawRoundedRect(1.5, 1.5, CARD_W - 3, CARD_H - 3, 11);
  }

  destroyDock(): void {
    /* 触摸改由战场场景收 */
  }
}
