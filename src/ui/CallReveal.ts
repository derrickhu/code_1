/**
 * 村口喊人揭晓。锈铁牌砸下来，写名字和活，点「好」。
 * 不做金光、SSR、彩虹——§4.3 来的是二舅，不是一张卡。
 */
import * as PIXI from 'pixi.js';
import { bindPointerTap } from '@/minigame';
import { Ease, TweenManager } from '@/core/TweenManager';
import { heroEvoPath, heroStillPath, tex, uiTex, watchArt } from '@/core/TextureLoader';
import { evoOf, starOpenedEvo, starsOf, type Progress } from '@/balance/village';
import { evoNameOf, getVillager } from '@/balance/villagers';
import { portraitCardScale } from '@/fx/portraitFit';
import { GOLD, fillSprite, goldBtn, ironSlab, label, standSprite } from '@/ui/paint';
import { callBeat, type CallBeat } from '@/ui/callBeat';

const CREAM = 0xfff4c4;
const MUTED = 0x8a8a92;

/**
 * 这颗星要是正好把人焊成了下一身，报那一身的名字。
 *
 * 形态由星解锁（village.EVO_STAR_GATE），所以「他变样了」这句话只有在这块牌上
 * 才有机会说 —— 喂料那边只报手艺，报重了玩家就分不清哪条轴在动。
 */
function starFormName(p: Progress, starTo: string | undefined): string | undefined {
  if (!starTo) return undefined;
  if (!starOpenedEvo(starsOf(p, starTo))) return undefined;
  try {
    return evoNameOf(getVillager(starTo), evoOf(p, starTo));
  } catch {
    return undefined;
  }
}

const FACE_W = 280;
const FACE_H = 340;

type FaceTier = 'none' | 'still' | 'evo';

export class CallReveal extends PIXI.Container {
  private _busy = false;
  private _hold: { a: number; s: number } | null = null;
  /** 立绘常在 CDN 上，开牌时往往还没到。这个槽等图到了再填，不把整张牌重开一遍 */
  private _face: PIXI.Container | null = null;
  private _got = '';
  private _evo = 1;
  private _faceTier: FaceTier = 'none';
  /** 牌子砸稳之后才算晚到，晚到的人淡入，免得跟开场缩放抢 */
  private _shown = false;

  constructor() {
    super();
    watchArt(() => this._paintFace());
  }

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

    const beat = callBeat(
      opts.got, opts.isNew, opts.starTo, opts.rosterN, undefined,
      starFormName(opts.progress, opts.starTo),
    );
    const dim = new PIXI.Graphics();
    dim.beginFill(0x0c0a08, 0.62).drawRect(0, 0, 750, opts.height).endFill();
    dim.eventMode = 'none';
    this.addChild(dim);

    this._got = opts.got;
    this._evo = Math.max(1, Math.min(3, evoOf(opts.progress, opts.got)));
    const board = this._board(beat, opts.height);
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
      onComplete: () => { this._shown = true; },
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
    if (this._face) {
      for (const c of this._face.children) TweenManager.cancelTarget(c);
    }
    this._face = null;
    this._got = '';
    this._faceTier = 'none';
    this._shown = false;
    this._busy = false;
    this.visible = false;
    this.eventMode = 'none';
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  /** 高清立绘优先。没到就先用站姿，到了再换上，不让牌心空着 */
  private _paintFace(): void {
    const host = this._face;
    if (!this._busy || !this._got || !host || host.destroyed) return;
    const evoTex = tex(heroEvoPath(this._got, this._evo));
    const use = evoTex ?? tex(heroStillPath(this._got));
    if (!use) return;
    const tier: FaceTier = evoTex ? 'evo' : 'still';
    if (this._faceTier === 'evo' || this._faceTier === tier) return;
    for (const c of host.removeChildren()) {
      TweenManager.cancelTarget(c);
      c.destroy();
    }
    const fit = portraitCardScale(this._got, this._evo, use.width, use.height, FACE_W, FACE_H);
    const spr = standSprite(host, use, 0, fit.plantY, FACE_W, FACE_H, fit.scale);
    if (!spr) return;
    this._faceTier = tier;
    if (!this._shown) return;
    spr.alpha = 0;
    TweenManager.to({
      target: spr,
      props: { alpha: 1 },
      duration: 0.18,
    });
  }

  private _board(beat: CallBeat, height: number): PIXI.Container {
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

    const feetY = 78;
    const host = new PIXI.Container();
    host.position.set(0, feetY);
    host.eventMode = 'none';
    board.addChild(host);
    this._face = host;
    this._paintFace();

    const title = label(40, GOLD, true);
    title.anchor.set(0.5);
    title.position.set(0, -h / 2 + 58);
    title.style.stroke = '#1a1008';
    title.style.strokeThickness = 6;
    title.text = beat.title;
    board.addChild(title);

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
