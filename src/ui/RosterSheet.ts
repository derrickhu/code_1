/**
 * 替补条。阵形是主角，名单只是一排小卡，人多往下划。
 */
import * as PIXI from 'pixi.js';
import { HEROES, getHero } from '@/balance/heroes';
import { Platform } from '@/core/PlatformService';
import { addFitPortrait, heroTex } from '@/core/TextureLoader';
import { bindPointerTap, designEventToLocal } from '@/minigame';
import { getTouchCanvas } from '@/utils/touchCanvas';

const GOLD = 0xc9a46a;
const CREAM = 0xfff4c4;
export const ROSTER_COLS = 3;
export const ROSTER_CARD_W = 228;
export const ROSTER_CARD_H = 96;
export const ROSTER_GAP = 8;
const SLOP = 14;

const TINT: Readonly<Record<string, number>> = {
  tiezhu: 0xc4703a,
  dachui: 0xd9a13b,
  laoli: 0xb4553f,
  erjiu: 0xa8823f,
  sanshen: 0xd4736b,
  laoyanqiang: 0x8f7a4a,
};

export interface RosterCell {
  id: string;
  x: number;
  y: number;
}

export function rosterSheetHeight(count = HEROES.length): number {
  const rows = Math.ceil(count / ROSTER_COLS);
  return rows * ROSTER_CARD_H + Math.max(0, rows - 1) * ROSTER_GAP;
}

/** 视口本地坐标点中了哪张卡。scroll 为内容上移量（0 或负数）。 */
export function rosterCardAt(
  localX: number,
  localY: number,
  scroll: number,
  cells: readonly RosterCell[],
  cardW = ROSTER_CARD_W,
  cardH = ROSTER_CARD_H,
): string | null {
  const y = localY - scroll;
  for (const cell of cells) {
    if (localX >= cell.x && localX < cell.x + cardW && y >= cell.y && y < cell.y + cardH) {
      return cell.id;
    }
  }
  return null;
}

export class RosterSheet {
  readonly view = new PIXI.Container();

  private readonly _port = new PIXI.Container();
  private readonly _inner = new PIXI.Container();
  private readonly _mask = new PIXI.Graphics();
  private _scroll = 0;
  private _minScroll = 0;
  private _dragging = false;
  private _moved = 0;
  private _lastY = 0;
  private _w = 0;
  private _h = 0;
  private _cells: RosterCell[] = [];
  private _cards: Array<{
    id: string;
    bg: PIXI.Graphics;
    name: PIXI.Text;
    mark: PIXI.Text;
  }> = [];
  private _onPick: ((id: string) => void) | null = null;
  private _detach: (() => void) | null = null;

  place(
    x: number,
    y: number,
    w: number,
    h: number,
    squad: readonly string[],
    holdSlot: number | null,
    onPick: (id: string) => void,
  ): void {
    this._w = w;
    this._h = h;
    this._onPick = onPick;
    this.view.position.set(x, y);
    // passive：自己不抢点，孩子（卡）才能走 bindPointerTap。none 会把整棵子树掐死。
    this.view.eventMode = 'passive';
    this._port.position.set(0, 0);
    this._port.eventMode = 'passive';
    this._mask.eventMode = 'none';
    this._mask.hitArea = new PIXI.Rectangle(0, 0, w, h);
    this._mask.clear();
    this._mask.beginFill(0xffffff).drawRect(0, 0, w, h).endFill();
    // 只当蒙版用，自己不能画出来。人刚好装下时 mask 会摘掉，这块白矩形就会盖住名单。
    this._mask.renderable = false;
    this._inner.eventMode = 'passive';
    this._inner.mask = null;
    if (!this._port.parent) this.view.addChild(this._port);
    if (!this._inner.parent) this._port.addChild(this._inner);
    if (!this._mask.parent) this._port.addChild(this._mask);

    this._inner.removeChildren().forEach((c) => c.destroy({ children: true }));
    const total = ROSTER_COLS * ROSTER_CARD_W + (ROSTER_COLS - 1) * ROSTER_GAP;
    const x0 = (w - total) / 2;
    this._cells = [];
    this._cards = [];
    HEROES.forEach((hero, i) => {
      const slot = squad.indexOf(hero.id);
      const made = this._card(hero.id, slot, slot >= 0 && slot === holdSlot);
      const cx = x0 + (i % ROSTER_COLS) * (ROSTER_CARD_W + ROSTER_GAP);
      const cy = Math.floor(i / ROSTER_COLS) * (ROSTER_CARD_H + ROSTER_GAP);
      made.box.position.set(cx, cy);
      this._inner.addChild(made.box);
      this._cells.push({ id: hero.id, x: cx, y: cy });
      this._cards.push({ id: hero.id, bg: made.bg, name: made.name, mark: made.mark });
    });

    const content = rosterSheetHeight();
    this._minScroll = Math.min(0, h - content);
    this._scroll = Math.max(this._minScroll, Math.min(0, this._scroll));
    this._inner.position.y = this._scroll;
    // 6 人两行刚好装下时不要 mask：祖先 mask 会让小游戏 hitTest 把整卡判成点不中
    this._inner.mask = this._minScroll < 0 ? this._mask : null;
    this._bindGesture();
  }

  refresh(squad: readonly string[], holdSlot: number | null): void {
    for (const card of this._cards) {
      const slot = squad.indexOf(card.id);
      const hot = slot >= 0 && slot === holdSlot;
      this._paintCard(card.bg, slot, hot);
      card.name.style.fill = hot ? GOLD : CREAM;
      card.mark.text = hot ? '要换掉' : slot >= 0 ? '已上阵' : '上阵';
      card.mark.style.fill = hot ? GOLD : slot >= 0 ? 0xc9b48a : 0x9be08a;
    }
  }

  destroy(): void {
    this._detach?.();
    this._detach = null;
    this._onPick = null;
    if (!this.view.destroyed) this.view.destroy({ children: true });
  }

  private _bindGesture(): void {
    this._detach?.();
    const canvas = getTouchCanvas();
    const onDown = (e: Event) => {
      const p = designEventToLocal(this._port, e);
      if (!this._inside(p.x, p.y)) return;
      this._dragging = true;
      this._moved = 0;
      this._lastY = p.y;
    };
    const onMove = (e: Event) => {
      if (!this._dragging) return;
      const p = designEventToLocal(this._port, e);
      const dy = p.y - this._lastY;
      this._moved += Math.abs(dy);
      if (this._minScroll === 0 || this._moved <= SLOP) return;
      this._lastY = p.y;
      this._nudge(dy);
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

    const onWheel = (e: Event): void => {
      if (this._minScroll >= 0) return;
      const p = designEventToLocal(this._port, e);
      if (!this._inside(p.x, p.y)) return;
      this._nudge(-(e as WheelEvent).deltaY * 0.45);
    };
    if (!Platform.isMinigame) {
      canvas.addEventListener('wheel', onWheel, { passive: true });
    }
    const prev = this._detach;
    this._detach = () => {
      prev?.();
      if (!Platform.isMinigame) canvas.removeEventListener('wheel', onWheel);
    };
    // 自己不抢点。static + 整块 hitArea 会把点脚边、点人名的短按吃掉。
    this.view.eventMode = 'passive';
    this.view.hitArea = null;
  }

  private _inside(lx: number, ly: number): boolean {
    return lx >= 0 && lx <= this._w && ly >= 0 && ly <= this._h;
  }

  private _nudge(dy: number): void {
    this._scroll = Math.max(this._minScroll, Math.min(0, this._scroll + dy));
    this._inner.position.y = this._scroll;
  }

  private _paintCard(bg: PIXI.Graphics, slot: number, hot: boolean): void {
    bg.clear();
    bg.beginFill(0x1c1610, hot ? 0.94 : slot >= 0 ? 0.72 : 0.58)
      .drawRoundedRect(0, 0, ROSTER_CARD_W, ROSTER_CARD_H, 12)
      .endFill();
    bg.lineStyle(hot ? 4 : 2, hot ? GOLD : slot >= 0 ? 0x8a7a5a : 0x4a4438, 1)
      .drawRoundedRect(1, 1, ROSTER_CARD_W - 2, ROSTER_CARD_H - 2, 11)
      .lineStyle(0);
  }

  private _card(id: string, slot: number, hot: boolean): {
    box: PIXI.Container;
    bg: PIXI.Graphics;
    name: PIXI.Text;
    mark: PIXI.Text;
  } {
    const hero = getHero(id);
    const box = new PIXI.Container();
    box.eventMode = 'static';
    box.cursor = 'pointer';
    box.interactiveChildren = false;
    box.hitArea = new PIXI.Rectangle(0, 0, ROSTER_CARD_W, ROSTER_CARD_H);
    bindPointerTap(box, () => this._onPick?.(id), {
      // 两行刚好装下时不会滚，手指微抖不该吞掉短按
      blockTap: () => this._minScroll < 0 && this._moved > SLOP,
      sync: true,
      silent: true,
    });
    const bg = new PIXI.Graphics();
    this._paintCard(bg, slot, hot);
    box.addChild(bg);
    const tex = heroTex(id);
    if (tex?.baseTexture.valid && tex.width > 1) {
      addFitPortrait(box, tex, 8, 8, 56, 80, 8);
    } else {
      const sw = new PIXI.Graphics();
      sw.beginFill(TINT[id] ?? GOLD, 0.9).drawRoundedRect(14, 16, 44, 64, 10).endFill();
      box.addChild(sw);
    }
    const name = new PIXI.Text(hero.name, {
      fontFamily: 'sans-serif',
      fontSize: 20,
      fontWeight: 'bold',
      fill: hot ? GOLD : CREAM,
      stroke: '#1a1008',
      strokeThickness: 4,
    });
    name.position.set(72, 16);
    box.addChild(name);
    const mark = new PIXI.Text(hot ? '要换掉' : slot >= 0 ? '已上阵' : '上阵', {
      fontFamily: 'sans-serif',
      fontSize: 16,
      fontWeight: 'bold',
      fill: hot ? GOLD : slot >= 0 ? 0xc9b48a : 0x9be08a,
      stroke: '#1a1008',
      strokeThickness: 3,
    });
    mark.position.set(72, 52);
    box.addChild(mark);
    return { box, bg, name, mark };
  }
}
