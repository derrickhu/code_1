import * as PIXI from 'pixi.js';
import { bindPointerTap } from '@/minigame';
import { uiTex, watchArt } from '@/core/TextureLoader';
import { GOLD, fillSprite, goldBtn, ironSlab, label } from '@/ui/paint';

const INK = 0x2a160c;
const CREAM = 0xfff4c4;

export type LeaveAskCopy = {
  title: string;
  body: string;
  stay: string;
  leave: string;
};

/** 布阵走轻问；开打后再走要把「这局不算」说死，免得当成通关。 */
export function leaveAskCopy(fighting: boolean): LeaveAskCopy {
  if (fighting) {
    return {
      title: '先撤？',
      body: '开打了再走，这局不算。',
      stay: '接着打',
      leave: '回路上',
    };
  }
  return {
    title: '回路上？',
    body: '排法先记着，人还在村里。',
    stay: '接着摆',
    leave: '回路上',
  };
}

function stroke(size: number, fill: number, rim = '#1a1008', thick = 4): PIXI.Text {
  const t = label(size, fill, true);
  t.style.stroke = rim;
  t.style.strokeThickness = thick;
  return t;
}

/**
 * 局内离开的二次确认。点暗幕或「接着打/摆」都留下，只有「回路上」才走。
 */
export class LeaveAskOverlay extends PIXI.Container {
  private readonly _onStay: () => void;
  private readonly _onLeave: () => void;
  private _fighting = false;
  private _screenH = 1334;
  private _busy = false;

  constructor(onStay: () => void, onLeave: () => void) {
    super();
    this._onStay = onStay;
    this._onLeave = onLeave;
    this.visible = false;
    this.eventMode = 'none';
    watchArt(() => {
      if (!this.visible) return;
      this.show(this._screenH, this._fighting);
    });
  }

  show(height: number, fighting: boolean): void {
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._screenH = height;
    this._fighting = fighting;
    this._busy = false;
    this.visible = true;
    this.eventMode = 'static';
    this.hitArea = new PIXI.Rectangle(0, 0, 750, height);

    const dim = new PIXI.Container();
    dim.eventMode = 'static';
    dim.hitArea = new PIXI.Rectangle(0, 0, 750, height);
    const veil = new PIXI.Graphics();
    veil.beginFill(0x0a0806, 0.58).drawRect(0, 0, 750, height).endFill();
    veil.eventMode = 'none';
    dim.addChild(veil);
    this.addChild(dim);
    bindPointerTap(dim, () => this._stay());

    const copy = leaveAskCopy(fighting);
    const board = new PIXI.Container();
    board.position.set(375, Math.round(height * 0.46));
    board.eventMode = 'static';
    board.interactiveChildren = true;
    const bw = 560;
    const bh = 360;
    board.hitArea = new PIXI.Rectangle(-bw / 2, -bh / 2, bw, bh);
    if (!fillSprite(board, uiTex('rust_tile'), 0, 0, bw, bh)) {
      const g = new PIXI.Graphics();
      ironSlab(g, -bw / 2, -bh / 2, bw, bh, 16);
      board.addChild(g);
    }

    const title = stroke(36, GOLD, '#1a1008', 6);
    title.anchor.set(0.5);
    title.position.set(0, -bh / 2 + 64);
    title.text = copy.title;
    board.addChild(title);

    const body = stroke(22, CREAM, '#1a1008', 4);
    body.anchor.set(0.5);
    body.position.set(0, -18);
    body.style.wordWrap = true;
    body.style.wordWrapWidth = bw - 80;
    body.style.align = 'center';
    body.text = copy.body;
    board.addChild(body);

    this._btn(board, 0, 58, 360, 78, copy.stay, 'stay', () => this._stay());
    this._btn(board, 0, 136, 280, 64, copy.leave, 'leave', () => this._leave());

    this.addChild(board);
  }

  hide(): void {
    this.visible = false;
    this.eventMode = 'none';
    this._busy = false;
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private _stay(): void {
    if (!this.visible || this._busy) return;
    this._busy = true;
    this._onStay();
  }

  private _leave(): void {
    if (!this.visible || this._busy) return;
    this._busy = true;
    this._onLeave();
  }

  private _btn(
    parent: PIXI.Container,
    cx: number,
    cy: number,
    w: number,
    h: number,
    text: string,
    kind: 'stay' | 'leave',
    onTap: () => void,
  ): void {
    const box = new PIXI.Container();
    box.eventMode = 'static';
    box.interactiveChildren = false;
    box.position.set(cx, cy);
    box.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
    const art = kind === 'stay' ? 'settle_btn' : 'rust_btn';
    if (!fillSprite(box, uiTex(art), 0, 0, w, h)) {
      const g = new PIXI.Graphics();
      if (kind === 'stay') goldBtn(g, -w / 2, -h / 2, w, h);
      else ironSlab(g, -w / 2, -h / 2, w, h, 12);
      box.addChild(g);
    }
    const t = stroke(kind === 'stay' ? 28 : 22, kind === 'stay' ? INK : CREAM, kind === 'stay' ? '#fff4c4' : '#1a1008', 4);
    t.anchor.set(0.5);
    t.text = text;
    box.addChild(t);
    parent.addChild(box);
    bindPointerTap(box, onTap);
  }
}
