/**
 * 村口喊人揭晓。锈铁牌砸下来，写名字和活，点「好」。
 * 不做金光、SSR、彩虹——§4.3 来的是二舅，不是一张卡。
 */
import * as PIXI from 'pixi.js';
import { bindPointerTap } from '@/minigame';
import { Ease, TweenManager } from '@/core/TweenManager';
import { heroTex, uiTex } from '@/core/TextureLoader';
import { evoOf, type Progress } from '@/balance/village';
import { portraitCardScale } from '@/fx/portraitFit';
import { GOLD, fillSprite, goldBtn, ironSlab, label, standSprite } from '@/ui/paint';
import { callBeat, type CallBeat } from '@/ui/callBeat';

const CREAM = 0xfff4c4;
const MUTED = 0x8a8a92;

export class CallReveal extends PIXI.Container {
  private _busy = false;
  private _hold: { a: number; s: number } | null = null;

  get busy(): boolean {
    return this._busy;
  }

  open(opts: {
    got: string;
    isNew: boolean;
    starTo?: string;
    rosterN: number;
    progress: Progress;
    height: number;
    onDone: () => void;
  }): void {
    this.close();
    this._busy = true;
    this.visible = true;
    this.eventMode = 'static';
    this.interactiveChildren = true;
    this.hitArea = new PIXI.Rectangle(0, 0, 750, opts.height);

    const beat = callBeat(opts.got, opts.isNew, opts.starTo, opts.rosterN);
    const dim = new PIXI.Graphics();
    dim.beginFill(0x0c0a08, 0.62).drawRect(0, 0, 750, opts.height).endFill();
    dim.eventMode = 'none';
    this.addChild(dim);

    const board = this._board(beat, opts.got, opts.progress, opts.height);
    this.addChild(board);

    const hold = { a: 0, s: 0.84 };
    this._hold = hold;
    dim.alpha = 0;
    board.scale.set(hold.s);
    board.alpha = 0;
    TweenManager.to({
      target: hold,
      props: { a: 1, s: 1 },
      duration: 0.28,
      ease: Ease.easeOutBack,
      onUpdate: () => {
        dim.alpha = hold.a * 0.62;
        board.alpha = hold.a;
        board.scale.set(hold.s);
      },
    });

    let opened = false;
    const finish = () => {
      if (!opened) return;
      if (!this._busy) return;
      this.close();
      opts.onDone();
    };
    TweenManager.to({
      target: { t: 0 },
      props: { t: 1 },
      duration: 0.01,
      delay: 0.32,
      onComplete: () => { opened = true; },
    });
    bindPointerTap(this, finish);
  }

  close(): void {
    if (this._hold) TweenManager.cancelTarget(this._hold);
    this._hold = null;
    this._busy = false;
    this.visible = false;
    this.eventMode = 'none';
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private _board(beat: CallBeat, got: string, progress: Progress, height: number): PIXI.Container {
    const board = new PIXI.Container();
    board.position.set(375, Math.round(height * 0.46));
    board.eventMode = 'none';

    const w = 620;
    const h = 680;
    if (!fillSprite(board, uiTex('rust_tile'), 0, 0, w, h)) {
      const g = new PIXI.Graphics();
      ironSlab(g, -w / 2, -h / 2, w, h, 16);
      board.addChild(g);
    }

    const title = label(40, GOLD, true);
    title.anchor.set(0.5);
    title.position.set(0, -h / 2 + 58);
    title.style.stroke = '#1a1008';
    title.style.strokeThickness = 6;
    title.text = beat.title;
    board.addChild(title);

    const evo = Math.max(1, evoOf(progress, got));
    const tex = heroTex(got, evo);
    const faceW = 280;
    const faceH = 340;
    const feetY = 78;
    if (tex) {
      const fit = portraitCardScale(got, evo, tex.width, tex.height, faceW, faceH);
      standSprite(board, tex, 0, feetY + fit.plantY, faceW, faceH, fit.scale);
    }

    const job = label(22, CREAM, true);
    job.anchor.set(0.5);
    job.position.set(0, 132);
    job.style.stroke = '#1a1008';
    job.style.strokeThickness = 4;
    job.text = beat.job;
    board.addChild(job);

    const sub = label(18, MUTED, true);
    sub.anchor.set(0.5);
    sub.position.set(0, 168);
    sub.style.stroke = '#1a1008';
    sub.style.strokeThickness = 3;
    sub.text = beat.sub;
    board.addChild(sub);

    const ok = new PIXI.Container();
    ok.position.set(0, h / 2 - 58);
    ok.eventMode = 'none';
    if (!fillSprite(ok, uiTex('rust_plank'), 0, 0, 280, 78)) {
      const g = new PIXI.Graphics();
      goldBtn(g, -140, -39, 280, 78);
      ok.addChild(g);
    }
    const okTx = label(30, CREAM, true);
    okTx.anchor.set(0.5);
    okTx.style.stroke = '#1a1008';
    okTx.style.strokeThickness = 5;
    okTx.text = beat.ok;
    ok.addChild(okTx);
    board.addChild(ok);

    return board;
  }
}
