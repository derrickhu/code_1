import * as PIXI from 'pixi.js';
import { bindPointerTap } from '@/minigame';
import { Game } from '@/core/Game';
import { heroTex, modTex, uiTex, villageBgTex, watchArt } from '@/core/TextureLoader';
import type { HeroUnit } from '@/game/BattleEngine';
import { fitSprite, label } from '@/ui/paint';

const INK = 0x2a160c;
const CREAM = 0xfff4c4;
const RUST = 0x8b2e1f;
const MUTED = 0xc8b89a;

type Held = {
  team: HeroUnit[];
  wave: number;
  remaining: number;
  height: number;
};

function stroke(size: number, fill: number, rim = '#1a1008', thick = 4): PIXI.Text {
  const t = label(size, fill, true);
  t.style.stroke = rim;
  t.style.strokeThickness = thick;
  return t;
}

function fillSprite(
  parent: PIXI.Container,
  texture: PIXI.Texture | null,
  cx: number,
  cy: number,
  w: number,
  h: number,
): PIXI.Sprite | null {
  if (!texture?.baseTexture.valid || texture.width <= 1) return null;
  const spr = new PIXI.Sprite(texture);
  spr.anchor.set(0.5);
  spr.position.set(cx, cy);
  spr.scale.set(w / texture.width, h / texture.height);
  spr.eventMode = 'none';
  parent.addChild(spr);
  return spr;
}

function standSprite(
  parent: PIXI.Container,
  texture: PIXI.Texture | null,
  cx: number,
  feetY: number,
  maxW: number,
  maxH: number,
): PIXI.Sprite | null {
  if (!texture?.baseTexture.valid || texture.width <= 1) return null;
  const spr = new PIXI.Sprite(texture);
  spr.anchor.set(0.5, 1);
  spr.scale.set(Math.min(maxW / texture.width, maxH / texture.height));
  spr.position.set(cx, feetY);
  spr.eventMode = 'none';
  parent.addChild(spr);
  return spr;
}

function lineupXs(roster: { slot: number }[]): Map<number, number> {
  const sorted = [...roster].sort((a, b) => a.slot - b.slot);
  const n = sorted.length;
  const out = new Map<number, number>();
  if (n === 0) return out;
  if (n === 1) {
    out.set(sorted[0]!.slot, 375);
    return out;
  }
  if (n === 2) {
    out.set(sorted[0]!.slot, 248);
    out.set(sorted[1]!.slot, 502);
    return out;
  }
  for (const h of sorted) {
    out.set(h.slot, h.slot === 1 ? 188 : h.slot === 2 ? 562 : 375);
  }
  return out;
}

/**
 * 队灭当下：卖掉「这套已经改成型的组合」，不是重开。
 * 按 revive_ui_v1：单独夜巷底图、歪匾、铁条、坐在牙子上的人。
 */
export class ReviveOverlay extends PIXI.Container {
  private readonly _onRevive: () => void;
  private readonly _onGiveUp: () => void;
  private _busy = false;
  private _pulse: PIXI.Container | null = null;
  private _pulseT = 0;
  private _held: Held | null = null;

  constructor(onRevive: () => void, onGiveUp: () => void) {
    super();
    this._onRevive = onRevive;
    this._onGiveUp = onGiveUp;
    this.visible = false;
    this.eventMode = 'static';
    Game.ticker.add(() => this._tickPulse());
    watchArt(() => {
      if (!this.visible || !this._held) return;
      this.show(this._held.team, this._held.wave, this._held.remaining, this._held.height);
    });
  }

  show(team: HeroUnit[], wave: number, remaining: number, height: number): void {
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.visible = true;
    this._busy = false;
    this._pulse = null;
    this._held = { team, wave, remaining, height };
    this.hitArea = new PIXI.Rectangle(0, 0, 750, height);

    this._coverBg(height);

    const roster = [...team].sort((a, b) => a.slot - b.slot);
    const top = Math.max(Game.safeTop, 20);

    const skipH = 72;
    const skipCy = height - Game.safeBottom - 18 - skipH / 2;
    const playH = 118;
    const playCy = skipCy - skipH / 2 - 14 - playH / 2;

    const plaqueW = 680;
    const plaqueH = 280;
    const plaqueCy = top + plaqueH * 0.46;
    const tilt = -0.06;
    const plaqueSpr = fitSprite(this, uiTex('title_plaque'), 360, plaqueCy, plaqueW, plaqueH);
    if (plaqueSpr) plaqueSpr.rotation = tilt;
    const faceY = plaqueCy + plaqueH * 0.1;
    const titleTx = stroke(40, RUST, '#1a1008', 6);
    titleTx.anchor.set(0.5);
    titleTx.position.set(356, faceY);
    titleTx.rotation = tilt;
    titleTx.text = '这套要散了';
    this.addChild(titleTx);

    const stampW = 196;
    const stampH = 80;
    const stampX = 568;
    const stampY = faceY + 58;
    fillSprite(this, uiTex('settle_stamp'), stampX, stampY, stampW, stampH);
    const waveTx = stroke(22, CREAM, '#1a1008', 4);
    waveTx.anchor.set(0.5);
    waveTx.position.set(stampX, stampY + 1);
    waveTx.text = `第 ${wave} 波`;
    this.addChild(waveTx);

    const hintH = 96;
    const hintCy = plaqueCy + plaqueH * 0.5 + 8 + hintH / 2;
    this._caption(375, hintCy, 660, hintH, '看一段，全队原地站起来继续打\n这套改装还在。', 22);

    const quotaH = 52;
    const quotaCy = hintCy + hintH / 2 + 12 + quotaH / 2;
    fillSprite(this, uiTex('settle_chip'), 375, quotaCy, 320, quotaH)
      || fillSprite(this, uiTex('settle_stamp'), 375, quotaCy, 320, quotaH);
    const quotaTx = stroke(18, CREAM, '#1a1008', 4);
    quotaTx.anchor.set(0.5);
    quotaTx.position.set(375, quotaCy + 1);
    quotaTx.text = `今日还能救 ${remaining} 次`;
    this.addChild(quotaTx);

    const nameH = 46;
    const modsH = 30;
    const bandTop = quotaCy + quotaH / 2 + 20;
    const bandBottom = playCy - playH / 2 - 16;
    const labelStack = 12 + nameH + 8 + modsH;
    const sitH = Math.max(190, Math.min(260, bandBottom - labelStack - bandTop));
    const feetY = bandTop + sitH;
    this._drawCurb(48, feetY - 6, 654, 28);

    const xs = lineupXs(roster);
    for (const hero of roster) {
      const x = xs.get(hero.slot) ?? 375;
      const mid = hero.slot === 0 || roster.length === 1;
      const spr = standSprite(
        this,
        heroTex(hero.def.id),
        x,
        feetY + 4,
        mid ? 200 : 178,
        sitH,
      );
      if (spr) {
        spr.tint = 0x9a948c;
        spr.rotation = hero.slot === 1 ? -0.05 : hero.slot === 2 ? 0.05 : 0.02;
      }
      fillSprite(this, uiTex('settle_name'), x, feetY + 14 + nameH / 2, 168, nameH);
      const nameTx = stroke(18, CREAM, '#1a1008', 4);
      nameTx.anchor.set(0.5);
      nameTx.position.set(x, feetY + 14 + nameH / 2 + 1);
      nameTx.text = hero.def.name;
      this.addChild(nameTx);
      hero.mods.forEach((m, k) => {
        const n = hero.mods.length;
        fitSprite(
          this,
          modTex(m.id),
          x + (k - (n - 1) / 2) * 32,
          feetY + 14 + nameH + 8 + modsH / 2,
          28,
          28,
        );
      });
    }

    this._playBtn(375, playCy, 560, playH, () => {
      if (this._busy) return;
      this._busy = true;
      this._onRevive();
    });
    this._skipBtn(375, skipCy, 360, skipH, () => {
      if (this._busy) return;
      this._busy = true;
      this._onGiveUp();
    });
  }

  unlock(): void {
    this._busy = false;
  }

  hide(): void {
    this.visible = false;
    this._busy = false;
    this._pulse = null;
    this._held = null;
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private _coverBg(h: number): void {
    const art = villageBgTex();
    if (art?.baseTexture.valid) {
      const spr = new PIXI.Sprite(art);
      const scale = Math.max(750 / art.width, h / art.height);
      spr.anchor.set(0.5, 0);
      spr.position.set(375, 0);
      spr.scale.set(scale);
      spr.tint = 0x5a6270;
      spr.eventMode = 'none';
      this.addChild(spr);
    } else {
      const g = new PIXI.Graphics();
      g.beginFill(0x161820).drawRect(0, 0, 750, h).endFill();
      this.addChild(g);
    }
    const veil = new PIXI.Graphics();
    veil.beginFill(0x0a1220, 0.34).drawRect(0, 0, 750, h).endFill();
    veil.beginFill(0x0a1220, 0.2).drawRect(0, 0, 750, 80).endFill();
    veil.beginFill(0x0a1220, 0.22).drawRect(0, h - 140, 750, 140).endFill();
    veil.eventMode = 'none';
    this.addChild(veil);
  }

  private _tickPulse(): void {
    if (!this.visible || !this._pulse) return;
    this._pulseT += Game.ticker.deltaMS / 1000;
    this._pulse.scale.set(1 + Math.sin(this._pulseT * 3.2) * 0.03);
  }

  private _drawCurb(x: number, y: number, w: number, h: number): void {
    const g = new PIXI.Graphics();
    g.eventMode = 'none';
    g.beginFill(0x3a3832, 0.92).drawRoundedRect(x, y, w, h, 6).endFill();
    g.beginFill(0x5a564c, 0.55).drawRoundedRect(x + 6, y + 3, w - 12, 7, 3).endFill();
    this.addChild(g);
  }

  private _caption(cx: number, cy: number, w: number, h: number, title: string, size: number): void {
    fillSprite(this, uiTex('iron_bar'), cx, cy, w, h);
    const t = stroke(size, CREAM);
    t.anchor.set(0.5);
    t.position.set(cx, cy + 1);
    t.style.wordWrap = true;
    t.style.wordWrapWidth = w - 80;
    t.style.align = 'center';
    t.style.lineHeight = size + 6;
    t.text = title;
    this.addChild(t);
  }

  private _playBtn(cx: number, cy: number, w: number, h: number, onTap: () => void): void {
    const box = new PIXI.Container();
    box.eventMode = 'static';
    box.interactiveChildren = false;
    box.position.set(cx, cy);
    box.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
    fillSprite(box, uiTex('settle_btn'), 0, 0, w, h)
      || fillSprite(box, uiTex('play_plate'), 0, 0, w, h);
    const t = stroke(28, INK, '#fff4c4', 4);
    t.anchor.set(0.5);
    t.text = '看完继续打';
    t.position.set(16, 0);
    const tri = new PIXI.Graphics();
    tri.beginFill(INK, 0.88);
    tri.moveTo(-9, -11);
    tri.lineTo(12, 0);
    tri.lineTo(-9, 11);
    tri.endFill();
    tri.position.set(-t.width * 0.5 - 8, 0);
    box.addChild(tri, t);
    this.addChild(box);
    this._pulse = box;
    bindPointerTap(box, onTap);
  }

  private _skipBtn(cx: number, cy: number, w: number, h: number, onTap: () => void): void {
    const box = new PIXI.Container();
    box.eventMode = 'static';
    box.interactiveChildren = false;
    box.position.set(cx, cy);
    box.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
    fillSprite(this, uiTex('iron_bar'), cx, cy, w, h);
    const t = stroke(17, MUTED, '#1a1008', 3);
    t.anchor.set(0.5);
    t.text = '算了，看结算';
    box.addChild(t);
    this.addChild(box);
    bindPointerTap(box, onTap);
  }
}
