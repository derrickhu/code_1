/**
 * 可滚动花名册。场上只站三人，换谁从这份名单里点。
 * 人再多也只是往下划，不往主页上铺格子。
 *
 * 点击不走 bindPointerTap：名单自己的滚动和全局 tap 路由会抢同一根手指，
 * 底下一排（三婶）最容易被吃掉，看起来像点了没反应。
 */
import * as PIXI from 'pixi.js';
import { HEROES, getHero, heroReachLine } from '@/balance/heroes';
import { abilityTag } from '@/balance/mods';
import { Platform } from '@/core/PlatformService';
import { addFitPortrait, heroTex } from '@/core/TextureLoader';
import { designEventToLocal } from '@/minigame';
import { getTouchCanvas } from '@/utils/touchCanvas';

const GOLD = 0xc9a46a;
const CREAM = 0xfff4c4;
const COLS = 2;
const CARD_W = 338;
const CARD_H = 118;
const GAP = 10;
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
  const rows = Math.ceil(count / COLS);
  return rows * CARD_H + Math.max(0, rows - 1) * GAP;
}

/** 视口本地坐标点中了哪张卡。scroll 为内容上移量（0 或负数）。 */
export function rosterCardAt(
  localX: number,
  localY: number,
  scroll: number,
  cells: readonly RosterCell[],
  cardW = CARD_W,
  cardH = CARD_H,
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
  private _onPick: ((id: string) => void) | null = null;
  private _detach: (() => void) | null = null;
  private _wheelBound = false;

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
    this.view.eventMode = 'none';
    this._port.position.set(0, 0);
    this._port.eventMode = 'none';
    this._mask.eventMode = 'none';
    this._mask.clear();
    this._mask.beginFill(0xffffff).drawRect(0, 0, w, h).endFill();
    this._inner.eventMode = 'none';
    this._inner.mask = this._mask;
    if (!this._port.parent) this.view.addChild(this._port);
    if (!this._inner.parent) this._port.addChild(this._inner);
    if (!this._mask.parent) this._port.addChild(this._mask);

    this._inner.removeChildren().forEach((c) => c.destroy({ children: true }));
    const total = COLS * CARD_W + (COLS - 1) * GAP;
    const x0 = (w - total) / 2;
    this._cells = [];
    HEROES.forEach((hero, i) => {
      const slot = squad.indexOf(hero.id);
      const card = this._card(hero.id, slot, slot >= 0 && slot === holdSlot);
      const cx = x0 + (i % COLS) * (CARD_W + GAP);
      const cy = Math.floor(i / COLS) * (CARD_H + GAP);
      card.position.set(cx, cy);
      this._inner.addChild(card);
      this._cells.push({ id: hero.id, x: cx, y: cy });
    });

    const content = rosterSheetHeight();
    this._minScroll = Math.min(0, h - content);
    this._scroll = Math.max(this._minScroll, Math.min(0, this._scroll));
    this._inner.position.y = this._scroll;
    this._bindGesture();
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
    const onUp = (e: Event) => {
      if (!this._dragging) return;
      this._dragging = false;
      if (this._moved > SLOP && this._minScroll < 0) return;
      const p = designEventToLocal(this._port, e);
      if (!this._inside(p.x, p.y)) return;
      const id = rosterCardAt(p.x, p.y, this._scroll, this._cells);
      if (id) this._onPick?.(id);
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

    if (!this._wheelBound) {
      this._wheelBound = true;
      this._port.eventMode = 'static';
      this._port.hitArea = new PIXI.Rectangle(0, 0, this._w, this._h);
      this._port.on('wheel', (e: PIXI.FederatedWheelEvent) => {
        this._nudge(-e.deltaY * 0.45);
      });
    } else {
      this._port.hitArea = new PIXI.Rectangle(0, 0, this._w, this._h);
    }
  }

  private _inside(lx: number, ly: number): boolean {
    return lx >= 0 && lx <= this._w && ly >= 0 && ly <= this._h;
  }

  private _nudge(dy: number): void {
    this._scroll = Math.max(this._minScroll, Math.min(0, this._scroll + dy));
    this._inner.position.y = this._scroll;
  }

  private _card(id: string, slot: number, hot: boolean): PIXI.Container {
    const hero = getHero(id);
    const box = new PIXI.Container();
    box.eventMode = 'none';
    box.interactiveChildren = false;
    const bg = new PIXI.Graphics();
    bg.beginFill(0x1c1610, slot >= 0 ? 0.92 : 0.78).drawRoundedRect(0, 0, CARD_W, CARD_H, 14).endFill();
    bg.lineStyle(hot ? 5 : slot >= 0 ? 3 : 2, hot ? GOLD : slot >= 0 ? 0xc9a46a : 0x5a5244, 1)
      .drawRoundedRect(2, 2, CARD_W - 4, CARD_H - 4, 12)
      .lineStyle(0);
    box.addChild(bg);
    const tex = heroTex(id);
    if (tex?.baseTexture.valid && tex.width > 1) {
      addFitPortrait(box, tex, 8, 8, 72, 100, 10);
    } else {
      const sw = new PIXI.Graphics();
      sw.beginFill(TINT[id] ?? GOLD, 0.9).drawRoundedRect(16, 18, 56, 80, 12).endFill();
      box.addChild(sw);
    }
    const name = new PIXI.Text(hero.name, {
      fontFamily: 'sans-serif',
      fontSize: 22,
      fontWeight: 'bold',
      fill: hot ? GOLD : CREAM,
      stroke: '#1a1008',
      strokeThickness: 4,
    });
    name.position.set(90, 14);
    box.addChild(name);
    const job = new PIXI.Text(
      `${hero.job} · ${heroReachLine(hero.range)} · ${abilityTag(hero.skill)}`,
      {
        fontFamily: 'sans-serif',
        fontSize: 15,
        fontWeight: 'bold',
        fill: 0xffe08a,
      },
    );
    job.position.set(90, 46);
    box.addChild(job);
    const mark = new PIXI.Text(
      slot >= 0 ? '已上阵' : '点他上阵',
      {
        fontFamily: 'sans-serif',
        fontSize: 16,
        fontWeight: 'bold',
        fill: hot ? GOLD : slot >= 0 ? 0xffe08a : 0x9be08a,
        stroke: '#1a1008',
        strokeThickness: 3,
      },
    );
    mark.position.set(90, 78);
    box.addChild(mark);
    return box;
  }
}
