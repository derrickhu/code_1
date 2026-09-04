/**
 * 底部布阵坞：手上还没上场的村民，一排横着放，左右滑。
 *
 * 它替掉的是上一版的改装槽底栏。差别在于**这里点的是「谁上场」，不是「装什么」**。
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
import { Platform } from '@/core/PlatformService';
import { heroTex } from '@/core/TextureLoader';
import { bindPointerTap, designEventToLocal } from '@/minigame';
import { getTouchCanvas } from '@/utils/touchCanvas';
import { LANE_NAME, ROLE_NAME, getVillager, type Lane } from '@/balance/villagers';
import { GOLD, fitSprite, label } from '@/ui/paint';

/** 坞高。战场下沿按它钉 */
export const BENCH_H = 150;
/** 战场脚底到坞顶留的缝 */
export const BENCH_GAP = 8;

const DOCK_X = 16;
const DOCK_W = 718;
const CARD_W = 118;
const CARD_H = 128;
const CARD_GAP = 8;
const PAD = 10;
const FACE = 66;
/** 滑动多少像素之后才算滑，不算点 */
const SLOP = 12;

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
  /** 已经站到格子上了。灰掉但不移出，位置别跳 */
  placed: boolean;
}

interface Card {
  id: string;
  box: PIXI.Container;
  ring: PIXI.Graphics;
}

export class BenchDock extends PIXI.Container {
  private readonly _onTap: (id: string) => void;
  private readonly _port = new PIXI.Container();
  private readonly _inner = new PIXI.Container();
  /** 名字不能叫 _mask：PIXI.DisplayObject 自己有个同名内部字段，撞了会让整类不再是 DisplayObject */
  private readonly _maskG = new PIXI.Graphics();
  private readonly _cards: Card[] = [];
  private _scroll = 0;
  private _minScroll = 0;
  private _dragging = false;
  private _moved = 0;
  private _lastX = 0;
  private _selected: string | null = null;
  private _detach: (() => void) | null = null;
  private _sig = '';

  constructor(onTap: (id: string) => void) {
    super();
    this._onTap = onTap;
    this.eventMode = 'static';
    this._port.position.set(DOCK_X, PAD);
    this._maskG.renderable = false;
    this.addChild(this._port);
    this._port.addChild(this._inner);
    this._port.addChild(this._maskG);
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

  /**
   * 重建卡片。签名一致就只刷高亮 ——
   * 每帧重建会把正在滑的手势打断，滑到一半会弹回去。
   */
  renderList(items: readonly BenchItem[]): void {
    const sig = items.map((i) => `${i.id}:${i.evoStage}:${i.stars}:${i.placed ? 1 : 0}`).join(',');
    if (sig === this._sig) {
      for (const c of this._cards) this._paintRing(c);
      return;
    }
    this._sig = sig;

    this._inner.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._cards.length = 0;

    items.forEach((item, i) => {
      const card = this._card(item);
      card.box.position.set(i * (CARD_W + CARD_GAP), 0);
      this._inner.addChild(card.box);
      this._cards.push(card);
    });

    this._maskG.clear();
    this._maskG.beginFill(0xffffff).drawRect(0, 0, DOCK_W, CARD_H).endFill();

    const content = items.length * CARD_W + Math.max(0, items.length - 1) * CARD_GAP;
    this._minScroll = Math.min(0, DOCK_W - content);
    this._scroll = Math.max(this._minScroll, Math.min(0, this._scroll));
    this._inner.position.x = this._scroll;
    // 刚好装得下就不要 mask：小游戏里祖先 mask 会让 hitTest 把整卡判成点不中
    this._inner.mask = this._minScroll < 0 ? this._maskG : null;
    this._bindGesture();
  }

  private _card(item: BenchItem): Card {
    const v = getVillager(item.id);
    const box = new PIXI.Container();
    box.eventMode = 'static';
    box.interactiveChildren = false;
    box.hitArea = new PIXI.Rectangle(0, 0, CARD_W, CARD_H);

    const bg = new PIXI.Graphics();
    bg.beginFill(0x1a1c24, 0.94).drawRoundedRect(0, 0, CARD_W, CARD_H, 10).endFill();
    bg.beginFill(LANE_TINT[v.lane], item.placed ? 0.18 : 0.4)
      .drawRoundedRect(0, 0, CARD_W, 6, 3).endFill();
    box.addChild(bg);

    const face = fitSprite(box, heroTex(v.id), CARD_W / 2, 14 + FACE / 2, FACE, FACE);
    if (face) {
      if (item.placed) face.tint = 0x6a6a72;
    } else {
      // 贴图还没到就画个门路色的块，不挡布阵
      const blk = new PIXI.Graphics();
      blk.beginFill(LANE_TINT[v.lane], item.placed ? 0.3 : 0.7)
        .drawRoundedRect(CARD_W / 2 - 24, 16, 48, FACE - 8, 8).endFill();
      box.addChild(blk);
    }

    const name = label(17, item.placed ? 0x8a8a92 : 0xfff4c4, true);
    name.anchor.set(0.5);
    name.position.set(CARD_W / 2, 12 + FACE + 12);
    name.text = v.name;
    box.addChild(name);

    // 门路 · 定位。克制和站位全靠这一行，别为了好看省掉
    const tag = label(13, item.placed ? 0x70707a : LANE_TINT[v.lane], true);
    tag.anchor.set(0.5);
    tag.position.set(CARD_W / 2, 12 + FACE + 32);
    tag.text = `${LANE_NAME[v.lane]}·${ROLE_NAME[v.role]}`;
    box.addChild(tag);

    const evo = label(13, item.placed ? 0x70707a : 0xffd66b, true);
    evo.anchor.set(0.5);
    evo.position.set(CARD_W / 2, 12 + FACE + 50);
    evo.text = `${'一二三'[item.evoStage - 1] ?? '一'}阶${item.stars > 0 ? ` ★${item.stars}` : ''}`;
    box.addChild(evo);

    const ring = new PIXI.Graphics();
    box.addChild(ring);

    bindPointerTap(box, () => {
      // 滑到一半松手不该算点，否则横滑翻找的时候会误选
      if (this._moved > SLOP) return;
      this._onTap(item.id);
    });

    const card: Card = { id: item.id, box, ring };
    this._paintRing(card);
    return card;
  }

  private _paintRing(card: Card): void {
    card.ring.clear();
    if (card.id !== this._selected) return;
    card.ring.lineStyle(3, GOLD, 1).drawRoundedRect(1.5, 1.5, CARD_W - 3, CARD_H - 3, 10);
  }

  private _nudge(dx: number): void {
    this._scroll = Math.max(this._minScroll, Math.min(0, this._scroll + dx));
    this._inner.position.x = this._scroll;
  }

  private _inside(x: number, y: number): boolean {
    return x >= 0 && x <= DOCK_W && y >= 0 && y <= CARD_H;
  }

  private _bindGesture(): void {
    this._detach?.();
    const canvas = getTouchCanvas();

    const onDown = (e: Event): void => {
      const p = designEventToLocal(this._port, e);
      if (!this._inside(p.x, p.y)) return;
      this._dragging = true;
      this._moved = 0;
      this._lastX = p.x;
    };
    const onMove = (e: Event): void => {
      if (!this._dragging) return;
      const p = designEventToLocal(this._port, e);
      const dx = p.x - this._lastX;
      this._moved += Math.abs(dx);
      if (this._minScroll === 0 || this._moved <= SLOP) return;
      this._lastX = p.x;
      this._nudge(dx);
    };
    const onUp = (): void => {
      this._dragging = false;
    };

    if (Platform.isMinigame) {
      canvas.addEventListener('touchstart', onDown, { passive: true });
      canvas.addEventListener('touchmove', onMove, { passive: true });
      canvas.addEventListener('touchend', onUp);
      canvas.addEventListener('touchcancel', onUp);
      this._detach = () => {
        canvas.removeEventListener('touchstart', onDown);
        canvas.removeEventListener('touchmove', onMove);
        canvas.removeEventListener('touchend', onUp);
        canvas.removeEventListener('touchcancel', onUp);
      };
    } else {
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      this._detach = () => {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
      };
    }
  }

  destroyDock(): void {
    this._detach?.();
    this._detach = null;
  }
}
