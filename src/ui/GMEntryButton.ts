/**
 * 开发者工具里右上角的 GM 入口。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { EventBus } from '@/core/EventBus';
import { GMManager } from '@/core/GMManager';
import { bindPointerTap } from '@/minigame';

export class GMEntryButton extends PIXI.Container {
  constructor() {
    super();
    this.zIndex = 8500;
    this._build();
    this._syncVisible();
    EventBus.on('gm:activated', () => this._syncVisible());
  }

  private _build(): void {
    const w = 56;
    const h = 32;
    const g = new PIXI.Graphics();
    g.beginFill(0xc81e3c, 0.88);
    g.lineStyle(1.5, 0xff6688, 1);
    g.drawRoundedRect(0, 0, w, h, 8);
    g.endFill();
    this.addChild(g);

    const title = new PIXI.Text('GM', {
      fontFamily: 'sans-serif',
      fontSize: 16,
      fill: 0xffffff,
      fontWeight: 'bold',
    });
    title.anchor.set(0.5);
    title.position.set(w / 2, h / 2);
    this.addChild(title);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.hitArea = new PIXI.Rectangle(0, 0, w, h);
    this.interactiveChildren = false;
    bindPointerTap(this, () => GMManager.openPanel());
    this._layout();
  }

  private _layout(): void {
    const w = 56;
    this.position.set(Game.logicWidth - w - 6, Game.safeCapsuleBottom + 4);
  }

  private _syncVisible(): void {
    this.visible = GMManager.isEnabled;
    this._layout();
  }
}
