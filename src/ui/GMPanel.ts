/**
 * GM 面板：跳关 + 局内跳过本波。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { EventBus } from '@/core/EventBus';
import { GMManager } from '@/core/GMManager';
import { CHAPTER_COUNT, STAGES_PER_CHAPTER, findStage } from '@/balance/stages';
import { bindPointerTap } from '@/minigame';

const PAD = 16;
const JUMP_PRESETS = [1, 3, 5, 8] as const;

const C = {
  panelBg: 0x1a1d33,
  panelStroke: 0x3d4d73,
  title: 0xe8ecf4,
  muted: 0x7a8699,
  btnFill: 0x2a314f,
  btnText: 0xedf1f7,
  accent: 0x5eb8d4,
  accentFill: 0x2a4a5c,
  ok: 0x6bc9a6,
  okFill: 0x24483c,
  warn: 0xffb347,
};

export class GMPanel extends PIXI.Container {
  private readonly _bg = new PIXI.Graphics();
  private readonly _root = new PIXI.Container();
  private _result: PIXI.Text | null = null;
  private _jumpLabel: PIXI.Text | null = null;
  private _jumpChapter = 1;
  private _jumpIndex = 1;
  _isOpen = false;

  constructor() {
    super();
    this.visible = false;
    this.zIndex = 9000;
    this.eventMode = 'static';
    this.addChild(this._bg, this._root);
    EventBus.on('gm:open', () => this.open());
    EventBus.on('gm:close', () => this.close());
  }

  open(): void {
    if (!GMManager.isRuntimeAllowed || !GMManager.isEnabled) return;
    this._isOpen = true;
    this.visible = true;
    this.alpha = 1;
    this._refresh();
  }

  close(): void {
    this._isOpen = false;
    this.visible = false;
  }

  private _refresh(): void {
    this._root.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._result = null;
    this._jumpLabel = null;

    const w = Game.logicWidth;
    const h = Game.logicHeight;
    this._bg.clear();
    this._bg.beginFill(0x000000, 0.55).drawRect(0, 0, w, h).endFill();
    this._bg.eventMode = 'static';
    this._bg.hitArea = new PIXI.Rectangle(0, 0, w, h);
    bindPointerTap(this._bg, () => this.close());

    const panelW = Math.min(700, w - 24);
    const panelH = 660;
    const panelX = (w - panelW) / 2;
    const panelY = Math.max(Game.safeTop + 8, (h - panelH) / 2);

    const panel = new PIXI.Graphics();
    panel.beginFill(C.panelBg, 0.98).drawRoundedRect(panelX, panelY, panelW, panelH, 18).endFill();
    panel.lineStyle(2, C.panelStroke, 0.92).drawRoundedRect(panelX, panelY, panelW, panelH, 18);
    panel.eventMode = 'static';
    panel.hitArea = new PIXI.Rectangle(panelX, panelY, panelW, panelH);
    this._root.addChild(panel);

    const title = new PIXI.Text('GM 调试', {
      fontFamily: 'sans-serif',
      fontSize: 26,
      fill: C.title,
      fontWeight: 'bold',
    });
    title.position.set(panelX + PAD, panelY + 14);
    this._root.addChild(title);

    const closeW = 72;
    const closeH = 40;
    const closeRight = Math.min(panelX + panelW - PAD, Game.contentRightX(10));
    const closeBtn = this._chip('关闭', closeW, closeH, () => this.close(), C.accentFill, C.accent);
    closeBtn.position.set(closeRight - closeW, panelY + 10);
    this._root.addChild(closeBtn);

    const cardX = panelX + PAD;
    const cardY = panelY + 64;
    const cardW = panelW - PAD * 2;
    const jumpH = this._buildJumpCard(cardX, cardY, cardW);
    this._buildSkipCard(cardX, cardY + jumpH + 12, cardW);

    const result = new PIXI.Text('选一关，或进战斗后跳过本波', {
      fontFamily: 'sans-serif',
      fontSize: 16,
      fill: C.muted,
      wordWrap: true,
      wordWrapWidth: cardW,
    });
    result.position.set(cardX, panelY + panelH - 48);
    this._root.addChild(result);
    this._result = result;
  }

  private _buildJumpCard(x: number, y: number, w: number): number {
    const card = new PIXI.Container();
    card.position.set(x, y);

    const head = new PIXI.Text('跳关测试', {
      fontFamily: 'sans-serif',
      fontSize: 18,
      fill: C.btnText,
      fontWeight: 'bold',
    });
    head.position.set(12, 10);
    card.addChild(head);

    this._jumpLabel = new PIXI.Text(this._jumpText(), {
      fontFamily: 'sans-serif',
      fontSize: 15,
      fill: C.accent,
      wordWrap: true,
      wordWrapWidth: w - 24,
    });
    this._jumpLabel.position.set(12, 38);
    card.addChild(this._jumpLabel);

    let rowY = 78;
    const stepW = (w - 32) / 2;
    this._stepper(card, 12, rowY, stepW, '章', CHAPTER_COUNT, (n) => {
      this._jumpChapter = n;
    });
    this._stepper(card, 20 + stepW, rowY, stepW, '关', STAGES_PER_CHAPTER, (n) => {
      this._jumpIndex = n;
    });
    rowY += 52;

    const gap = 6;
    const chipW = (w - 24 - gap * (JUMP_PRESETS.length - 1)) / JUMP_PRESETS.length;
    JUMP_PRESETS.forEach((ch, i) => {
      const chip = this._chip(`第${ch}章`, chipW, 36, () => {
        this._jumpChapter = ch;
        this._jumpIndex = 1;
        this._syncJump();
        this._show(GMManager.unlockToStage(ch, 1));
      });
      chip.position.set(12 + i * (chipW + gap), rowY);
      card.addChild(chip);
    });
    rowY += 48;

    const actionW = (w - 32) / 2;
    const unlock = this._chip('解锁到此关', actionW, 48, () => {
      this._show(GMManager.unlockToStage(this._jumpChapter, this._jumpIndex));
    }, C.accentFill, C.accent);
    unlock.position.set(12, rowY);
    const enter = this._chip('进入此关开战', actionW, 48, () => {
      this._show(GMManager.enterStage(this._jumpChapter, this._jumpIndex));
    }, C.okFill, C.ok);
    enter.position.set(20 + actionW, rowY);
    card.addChild(unlock, enter);
    rowY += 60;

    const hint = new PIXI.Text('解锁：目标关写进进度，前面的关都能选。开战：带当前三人直接进这一关。不改废品。', {
      fontFamily: 'sans-serif',
      fontSize: 13,
      fill: C.muted,
      wordWrap: true,
      wordWrapWidth: w - 24,
    });
    hint.position.set(12, rowY);
    card.addChild(hint);
    rowY += hint.height + 16;

    const bg = new PIXI.Graphics();
    bg.beginFill(C.btnFill, 1).lineStyle(1.5, C.accent, 0.55).drawRoundedRect(0, 0, w, rowY, 12).endFill();
    card.addChildAt(bg, 0);
    this._root.addChild(card);
    return rowY;
  }

  private _buildSkipCard(x: number, y: number, w: number): void {
    const card = new PIXI.Container();
    card.position.set(x, y);

    const head = new PIXI.Text('局内跳过', {
      fontFamily: 'sans-serif',
      fontSize: 18,
      fill: C.btnText,
      fontWeight: 'bold',
    });
    head.position.set(12, 10);
    card.addChild(head);

    const desc = new PIXI.Text('清掉当前刻度的怪和时间轴；已是末波则直接通关。', {
      fontFamily: 'sans-serif',
      fontSize: 15,
      fill: C.accent,
      wordWrap: true,
      wordWrapWidth: w - 24,
    });
    desc.position.set(12, 38);
    card.addChild(desc);

    const btn = this._chip('跳过本波', w - 24, 48, () => {
      this._show(GMManager.skipWave());
    }, 0x4a1c28, 0xff6688);
    btn.position.set(12, 78);
    card.addChild(btn);

    const hint = new PIXI.Text('开发者工具里战斗右上角也有同款按钮。真机没有。', {
      fontFamily: 'sans-serif',
      fontSize: 13,
      fill: C.muted,
      wordWrap: true,
      wordWrapWidth: w - 24,
    });
    hint.position.set(12, 136);
    card.addChild(hint);

    const h = hint.y + hint.height + 16;
    const bg = new PIXI.Graphics();
    bg.beginFill(C.btnFill, 1).lineStyle(1.5, 0xff6688, 0.45).drawRoundedRect(0, 0, w, h, 12).endFill();
    card.addChildAt(bg, 0);
    this._root.addChild(card);
  }

  private _stepper(
    parent: PIXI.Container,
    x: number,
    y: number,
    w: number,
    kind: '章' | '关',
    max: number,
    set: (n: number) => void,
  ): void {
    const box = new PIXI.Container();
    box.position.set(x, y);
    const minus = this._chip('−', 44, 40, () => {
      if (kind === '章') this._jumpChapter = this._jumpChapter <= 1 ? max : this._jumpChapter - 1;
      else this._jumpIndex = this._jumpIndex <= 1 ? max : this._jumpIndex - 1;
      set(kind === '章' ? this._jumpChapter : this._jumpIndex);
      this._syncJump();
    });
    const plus = this._chip('＋', 44, 40, () => {
      if (kind === '章') this._jumpChapter = this._jumpChapter >= max ? 1 : this._jumpChapter + 1;
      else this._jumpIndex = this._jumpIndex >= max ? 1 : this._jumpIndex + 1;
      set(kind === '章' ? this._jumpChapter : this._jumpIndex);
      this._syncJump();
    });
    plus.position.set(w - 44, 0);
    const mid = new PIXI.Text(kind, {
      fontFamily: 'sans-serif',
      fontSize: 16,
      fill: C.btnText,
      fontWeight: 'bold',
    });
    mid.anchor.set(0.5);
    mid.position.set(w / 2, 20);
    box.addChild(minus, plus, mid);
    parent.addChild(box);
  }

  private _chip(
    text: string,
    w: number,
    h: number,
    onTap: () => void,
    fill = 0x343c5c,
    stroke = 0x5eb8d4,
  ): PIXI.Container {
    const box = new PIXI.Container();
    box.eventMode = 'static';
    box.hitArea = new PIXI.Rectangle(0, 0, w, h);
    const g = new PIXI.Graphics();
    g.beginFill(fill, 1).drawRoundedRect(0, 0, w, h, 10).endFill();
    g.lineStyle(1.5, stroke, 0.85).drawRoundedRect(0, 0, w, h, 10);
    const t = new PIXI.Text(text, {
      fontFamily: 'sans-serif',
      fontSize: 16,
      fill: C.btnText,
      fontWeight: 'bold',
    });
    t.anchor.set(0.5);
    t.position.set(w / 2, h / 2);
    box.addChild(g, t);
    bindPointerTap(box, onTap);
    return box;
  }

  private _jumpText(): string {
    const s = findStage(this._jumpChapter, this._jumpIndex);
    return s ? `${s.label}  ${s.name} · ${s.pitch}` : `${this._jumpChapter}-${this._jumpIndex}`;
  }

  private _syncJump(): void {
    if (this._jumpLabel) this._jumpLabel.text = this._jumpText();
  }

  private _show(result: string): void {
    if (!this._result) return;
    this._result.text = result;
    this._result.style.fill = /失败|无效|未激活|禁用/.test(result) ? C.warn : C.ok;
    this._syncJump();
  }
}
