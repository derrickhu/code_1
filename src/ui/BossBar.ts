/**
 * 大个子登场后挂在门楣下面的大血条：头像 + 名字 + 分段血槽。
 * 头顶那条太小，打大个子要一直看得见还差多少。
 */
import * as PIXI from 'pixi.js';
import { HpBar } from '@/fx/HpBar';
import { painted } from '@/ui/paint';

const W = 380;
const BAR_H = 16;
const HEAD_R = 30;

export class BossBar {
  readonly view = new PIXI.Container();
  private readonly _bar = new HpBar('boss');
  private readonly _name = painted(24, 0xffd6c8, '#1a0608', 5);
  private readonly _head = new PIXI.Sprite();
  private readonly _headMask = new PIXI.Graphics();
  private _foeId: number | null = null;
  private _a = 0;
  private _in = false;

  constructor() {
    this.view.eventMode = 'none';
    this.view.visible = false;
    const plate = new PIXI.Graphics();
    plate.beginFill(0x12060a, 0.8).drawRoundedRect(-W / 2 - 46, -26, W + 70, 58, 16).endFill();
    plate.lineStyle(2, 0xd9a441, 0.75).drawRoundedRect(-W / 2 - 46, -26, W + 70, 58, 16);
    this.view.addChild(plate);
    const ring = new PIXI.Graphics();
    ring.beginFill(0x2a0e10).drawCircle(-W / 2 - 26, 3, HEAD_R + 4).endFill();
    ring.lineStyle(3, 0xd9a441).drawCircle(-W / 2 - 26, 3, HEAD_R + 3);
    this.view.addChild(ring);
    this._headMask.beginFill(0xffffff).drawCircle(-W / 2 - 26, 3, HEAD_R).endFill();
    this._head.anchor.set(0.5, 0);
    this._head.mask = this._headMask;
    this.view.addChild(this._headMask, this._head);
    this._name.anchor.set(0, 1);
    this._name.position.set(-W / 2 + 18, 0);
    this.view.addChild(this._name);
    this._bar.layout(W - 36, BAR_H, 0, 10);
    this._bar.view.position.set(-W / 2 + 18, 4);
    this.view.addChild(this._bar.view);
  }

  get foeId(): number | null {
    return this._foeId;
  }

  show(foeId: number, name: string, head: PIXI.Texture | null): void {
    this._foeId = foeId;
    this._name.text = name;
    this._in = true;
    this._a = 0;
    this.view.visible = true;
    if (head) {
      this._head.texture = head;
      const s = (HEAD_R * 2.3) / Math.max(1, head.width);
      this._head.scale.set(s);
      this._head.position.set(-W / 2 - 26, 3 - HEAD_R - 4);
    }
  }

  hide(): void {
    this._in = false;
  }

  reset(): void {
    this._foeId = null;
    this._in = false;
    this._a = 0;
    this.view.visible = false;
  }

  update(ratio: number, dt: number): void {
    if (!this.view.visible) return;
    this._a = Math.max(0, Math.min(1, this._a + (this._in ? dt / 0.25 : -dt / 0.4)));
    this.view.alpha = this._a;
    this.view.scale.set(0.92 + 0.08 * this._a);
    this._bar.update(ratio, dt);
    if (!this._in && this._a <= 0) {
      this.view.visible = false;
      this._foeId = null;
    }
  }
}
