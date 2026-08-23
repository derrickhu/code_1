import * as PIXI from 'pixi.js';
import { bindPointerTap } from '@/minigame';
import { GOLD, goldBtn, plate } from '@/ui/paint';

function text(size: number, color = 0xffffff, bold = false): PIXI.Text {
  return new PIXI.Text('', {
    fontFamily: 'sans-serif',
    fontSize: size,
    fontWeight: bold ? 'bold' : 'normal',
    fill: color,
  });
}

/**
 * 队灭当下：卖掉「这套已经改成型的组合」，不是重开。
 */
export class ReviveOverlay extends PIXI.Container {
  private readonly _onRevive: () => void;
  private readonly _onGiveUp: () => void;
  private _busy = false;

  constructor(onRevive: () => void, onGiveUp: () => void) {
    super();
    this._onRevive = onRevive;
    this._onGiveUp = onGiveUp;
    this.visible = false;
    this.eventMode = 'static';
  }

  show(wave: number, remaining: number, height: number): void {
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.visible = true;
    this._busy = false;

    const dim = new PIXI.Graphics();
    dim.beginFill(0x05060c, 0.82).drawRect(0, 0, 750, height).endFill();
    const panelW = 620;
    const panelH = 420;
    const px = (750 - panelW) / 2;
    const py = height * 0.22;
    plate(dim, px, py, panelW, panelH, 22, 0.92);
    this.addChild(dim);

    const title = text(36, 0xff8a8a, true);
    title.anchor.set(0.5);
    title.position.set(375, py + 64);
    title.text = `这套要散了 · 第 ${wave} 波`;
    this.addChild(title);

    const body = text(22, 0xd7dcee);
    body.anchor.set(0.5, 0);
    body.position.set(375, py + 118);
    body.style.wordWrap = true;
    body.style.wordWrapWidth = 540;
    body.style.align = 'center';
    body.style.lineHeight = 32;
    body.text = '看一段，全队原地站起来继续打。\n这套改装还在。';
    this.addChild(body);

    const sub = text(18, GOLD);
    sub.anchor.set(0.5);
    sub.position.set(375, py + 210);
    sub.text = `今日还能救 ${remaining} 次`;
    this.addChild(sub);

    const revive = new PIXI.Container();
    revive.eventMode = 'static';
    const rbg = new PIXI.Graphics();
    goldBtn(rbg, -170, -44, 340, 88);
    const rl = text(28, GOLD, true);
    rl.anchor.set(0.5);
    rl.text = '看完继续打';
    revive.addChild(rbg, rl);
    revive.position.set(375, py + 292);
    this.addChild(revive);
    bindPointerTap(revive, () => {
      if (this._busy) return;
      this._busy = true;
      this._onRevive();
    });

    const skip = new PIXI.Container();
    skip.eventMode = 'static';
    const sl = text(20, 0x8a90a8, true);
    sl.anchor.set(0.5);
    sl.text = '算了，看结算';
    skip.addChild(sl);
    skip.position.set(375, py + 364);
    this.addChild(skip);
    bindPointerTap(skip, () => {
      if (this._busy) return;
      this._onGiveUp();
    });
  }

  hide(): void {
    this.visible = false;
    this._busy = false;
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
  }
}
