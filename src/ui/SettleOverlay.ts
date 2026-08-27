import * as PIXI from 'pixi.js';
import { bindPointerTap } from '@/minigame';
import { Game } from '@/core/Game';
import type { RunMemory } from '@/core/RunMemory';
import type { LoseReason, RunState } from '@/game/BattleEngine';
import {
  heroTex,
  modTex,
  uiTex,
  villageBgTex,
  watchArt,
  type UiName,
} from '@/core/TextureLoader';
import { GOLD, fitSprite, label } from '@/ui/paint';

const INK = 0x2a160c;
const CREAM = 0xfff4c4;
const GAP = 12;

type SettleOpts = {
  scrap: number;
  earned: number;
  spent: number;
  canDouble: boolean;
  canJunkyard: boolean;
  loseReason?: LoseReason;
  nextMove?: string;
  yardScrap?: number;
  yardIn?: number;
  yardGoal?: string;
  nextStageLabel?: string;
};

type Slot = {
  h: number;
  draw: (cy: number) => void;
};

/** 看广告后带进下一局开场的废品，和 stashNextScrap 同一条式子 */
function carryScrap(scrap: number): number {
  return Math.max(16, scrap * 2);
}

function stroke(size: number, fill: number, rim = '#1a1008', thick = 4): PIXI.Text {
  const t = label(size, fill, true);
  t.style.stroke = rim;
  t.style.strokeThickness = thick;
  return t;
}

function fitted(name: UiName, maxW: number, maxH: number): { w: number; h: number } {
  const tex = uiTex(name);
  if (!tex?.baseTexture.valid || tex.width <= 1) return { w: maxW, h: maxH };
  const s = Math.min(maxW / tex.width, maxH / tex.height);
  return { w: tex.width * s, h: tex.height * s };
}

/** 铺满一块矩形。进账牌要拉满屏宽，不能再按原图比例缩成一块小方牌。 */
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
  parent.addChild(spr);
  return spr;
}

export class SettleOverlay extends PIXI.Container {
  private readonly _onReplay: () => void;
  private readonly _onDouble: () => Promise<boolean>;
  private readonly _onJunkyard: () => Promise<boolean>;
  private readonly _onYard: () => void;
  private readonly _onNext: () => void;
  private _busy = false;
  private _tookDouble = false;
  private _tookJunk = false;
  private _adPulse: PIXI.Container[] = [];
  private _pulseT = 0;
  private _held: {
    state: RunState;
    memory: RunMemory;
    height: number;
    opts: SettleOpts;
  } | null = null;

  constructor(
    onReplay: () => void,
    onDouble: () => Promise<boolean>,
    onJunkyard: () => Promise<boolean>,
    onYard: () => void,
    onNext: () => void,
  ) {
    super();
    this._onReplay = onReplay;
    this._onDouble = onDouble;
    this._onJunkyard = onJunkyard;
    this._onYard = onYard;
    this._onNext = onNext;
    this.visible = false;
    this.eventMode = 'static';
    Game.ticker.add(() => this._tickPulse());
    watchArt(() => {
      if (!this.visible || !this._held) return;
      this.show(this._held.state, this._held.memory, this._held.height, this._held.opts);
    });
  }

  show(state: RunState, memory: RunMemory, height: number, opts: SettleOpts): void {
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.visible = true;
    this._held = { state, memory, height, opts };
    this.hitArea = new PIXI.Rectangle(0, 0, 750, height);

    this._coverBg(height);

    const won = state.phase === 'won';
    const top = Math.max(Game.safeTop, 28);
    const title = won
      ? '整挺好'
      : opts.loseReason === 'timeout'
        ? '这波推不动'
        : '这套配崩了';

    const roster = [...state.team].sort((a, b) => a.slot - b.slot);
    const plaque = fitted('title_plaque', 700, 380);
    const plaqueY = top + plaque.h * 0.48;
    fitSprite(this, uiTex('title_plaque'), 375, plaqueY, 700, 380);
    const titleTx = stroke(won ? 56 : 34, won ? GOLD : CREAM, '#2a160c', 7);
    titleTx.anchor.set(0.5);
    titleTx.position.set(375, plaqueY + plaque.h * 0.15);
    titleTx.text = title;
    this.addChild(titleTx);

    let infoBottom = plaqueY + plaque.h * 0.52;
    if (!won && opts.nextMove) {
      const bar = fitted('iron_bar', 560, 54);
      this._caption(375, infoBottom + bar.h / 2, 560, 54, opts.nextMove, 16, CREAM);
      infoBottom += bar.h + 8;
    }

    const showNext = !!opts.nextStageLabel;
    const loot = { w: 710, h: 210 };
    const adBtn = fitted('ad_btn', 640, 146);
    const nextBtn = fitted('settle_btn', 400, 86);
    const footBtn = fitted('settle_btn', 300, 92);
    const namePlate = fitted('settle_name', 168, 48);
    const carry = carryScrap(opts.scrap);
    this._adPulse = [];

    const footerY = height - Game.safeBottom - 20 - footBtn.h / 2;
    this._imgBtn('settle_btn', 200, footerY, 300, 96, '回村子', 22, () => this._onYard());
    this._imgBtn('settle_btn', 550, footerY, 300, 96, '再来一局', 22, () => this._onReplay());

    const slots: Slot[] = [];

    slots.push({
      h: loot.h,
      draw: (cy) => this._lootCard(cy, loot, opts),
    });

    slots.push({
      h: 26,
      draw: (cy) => {
        const foot = stroke(16, 0xffe08a, '#1a1008', 3);
        foot.anchor.set(0.5);
        foot.position.set(375, cy);
        foot.text = [
          roster.length > 0 ? `改了 ${state.stats.installs} 件` : '一个人都没叫',
          memory.highestWave > 0 ? `最高第 ${memory.highestWave} 波` : '',
        ].filter(Boolean).join(' · ');
        this.addChild(foot);
      },
    });

    if (!this._tookDouble) {
      slots.push({
        h: adBtn.h,
        draw: (cy) => {
          this._adBtn(375, cy, 640, 146, `看视频  下局开场带 ${carry}`, async () => {
            if (this._busy) return;
            this._busy = true;
            const ok = await this._onDouble();
            this._busy = false;
            if (!ok) return;
            this._tookDouble = true;
            if (this._held) {
              this.show(this._held.state, this._held.memory, this._held.height, this._held.opts);
            }
          });
        },
      });
    }

    if (!this._tookJunk) {
      slots.push({
        h: adBtn.h * 0.92,
        draw: (cy) => {
          this._adBtn(375, cy, 620, 136, '看视频  翻一件池外破烂', async () => {
            if (this._busy) return;
            this._busy = true;
            const ok = await this._onJunkyard();
            this._busy = false;
            if (!ok) return;
            this._tookJunk = true;
            if (this._held) {
              this.show(this._held.state, this._held.memory, this._held.height, this._held.opts);
            }
          });
        },
      });
    }

    if (showNext) {
      slots.push({
        h: nextBtn.h,
        draw: (cy) => {
          this._imgBtn(
            'settle_btn',
            375,
            cy,
            400,
            86,
            `下一关 ${opts.nextStageLabel}`,
            20,
            () => this._onNext(),
          );
        },
      });
    }

    let cursor = footerY - footBtn.h / 2 - 16;
    for (let i = slots.length - 1; i >= 0; i -= 1) {
      const slot = slots[i]!;
      cursor -= slot.h / 2;
      slot.draw(cursor);
      cursor -= slot.h / 2 + GAP;
    }

    const lootTop = cursor + GAP;
    const nameBottom = Math.min(lootTop - 8, Math.max(infoBottom + 196, Math.round(height * 0.46)));
    const feetY = nameBottom - namePlate.h;
    const nameCy = nameBottom - namePlate.h / 2;

    for (const slot of [1, 2, 0]) {
      const hero = roster.find((h) => h.slot === slot);
      if (!hero) continue;
      const x = slot === 1 ? 198 : slot === 2 ? 552 : 375;
      standSprite(this, heroTex(hero.def.id), x, feetY, slot === 0 ? 156 : 132, slot === 0 ? 184 : 156);
      this._chip('settle_name', x, nameCy, 168, 48, hero.def.name, 17, CREAM);
      hero.mods.forEach((m, k) => {
        const n = hero.mods.length;
        fitSprite(this, modTex(m.id), x + (k - (n - 1) / 2) * 36, feetY - 8, 32, 32);
      });
    }
  }

  hide(): void {
    this.visible = false;
    this._busy = false;
    this._tookDouble = false;
    this._tookJunk = false;
    this._adPulse = [];
    this._held = null;
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  private _tickPulse(): void {
    if (!this.visible || this._adPulse.length === 0) return;
    this._pulseT += Game.ticker.deltaMS / 1000;
    const s = 1 + Math.sin(this._pulseT * 3.2) * 0.04;
    for (const b of this._adPulse) b.scale.set(s);
  }

  private _lootCard(cy: number, size: { w: number; h: number }, opts: SettleOpts): void {
    fillSprite(this, uiTex('play_plate'), 375, cy, size.w, size.h);
    const got = opts.yardIn ?? opts.earned;
    fitSprite(this, uiTex('scrap_pile'), 375 - size.w * 0.34, cy + 4, 96, 88);
    const plus = stroke(58, GOLD, '#1a1008', 7);
    plus.anchor.set(0, 0.5);
    plus.text = `+${got}`;
    plus.position.set(375 - size.w * 0.18, cy);
    this.addChild(plus);
    const name = stroke(26, INK, '#fff4c4', 4);
    name.anchor.set(0, 0.5);
    name.position.set(plus.x + plus.width + 12, cy + 4);
    name.text = '进废品堆';
    this.addChild(name);
    const have = stroke(15, INK, '#fff4c4', 3);
    have.anchor.set(1, 0.5);
    have.position.set(375 + size.w * 0.38, cy + size.h * 0.24);
    have.text = opts.yardIn
      ? `村里现有 ${opts.yardScrap ?? 0}`
      : `花了 ${opts.spent} · 剩 ${opts.scrap}`;
    this.addChild(have);
  }

  private _coverBg(h: number): void {
    const art = villageBgTex();
    if (art?.baseTexture.valid) {
      const spr = new PIXI.Sprite(art);
      const scale = Math.max(750 / art.width, h / art.height);
      spr.anchor.set(0.5, 0);
      spr.position.set(375, 0);
      spr.scale.set(scale);
      this.addChild(spr);
      return;
    }
    const g = new PIXI.Graphics();
    g.beginFill(0x3a2a1c).drawRect(0, 0, 750, h).endFill();
    this.addChild(g);
  }

  private _caption(
    cx: number,
    cy: number,
    maxW: number,
    maxH: number,
    title: string,
    size: number,
    fill: number,
  ): { w: number; h: number } {
    const sizeNow = fitted('iron_bar', maxW, maxH);
    fitSprite(this, uiTex('iron_bar'), cx, cy, maxW, maxH);
    if (title) {
      const t = stroke(size, fill);
      t.anchor.set(0.5);
      t.position.set(cx, cy + 1);
      t.style.wordWrap = true;
      t.style.wordWrapWidth = Math.max(160, sizeNow.w - 88);
      t.style.align = 'center';
      t.text = title;
      this.addChild(t);
    }
    return sizeNow;
  }

  private _chip(
    name: UiName,
    cx: number,
    cy: number,
    w: number,
    h: number,
    title: string,
    size: number,
    fill: number,
  ): PIXI.Text {
    const box = fitted(name, w, h);
    fitSprite(this, uiTex(name), cx, cy, w, h);
    const t = stroke(size, fill);
    t.anchor.set(0.5);
    t.position.set(cx, cy + 1);
    t.style.wordWrap = true;
    t.style.wordWrapWidth = Math.max(80, box.w - 36);
    t.style.align = 'center';
    t.text = title;
    this.addChild(t);
    return t;
  }

  private _adBtn(
    cx: number,
    cy: number,
    w: number,
    h: number,
    title: string,
    onTap: () => void,
  ): PIXI.Container {
    const size = fitted('ad_btn', w, h);
    const box = new PIXI.Container();
    box.eventMode = 'static';
    box.interactiveChildren = false;
    box.position.set(cx, cy);
    box.hitArea = new PIXI.Rectangle(-size.w / 2, -size.h / 2, size.w, size.h);
    if (!fitSprite(box, uiTex('ad_btn'), 0, 0, w, h)) {
      fitSprite(box, uiTex('play_plate'), 0, 0, w, h);
    }
    const t = stroke(20, INK, '#fff4c4', 4);
    t.anchor.set(0.5);
    t.position.set(size.w * 0.08, 0);
    t.style.wordWrap = true;
    t.style.wordWrapWidth = Math.max(120, size.w * 0.58);
    t.style.align = 'center';
    t.text = title;
    box.addChild(t);
    this.addChild(box);
    this._adPulse.push(box);
    bindPointerTap(box, onTap);
    return box;
  }

  private _imgBtn(
    name: UiName,
    cx: number,
    cy: number,
    w: number,
    h: number,
    title: string,
    font: number,
    onTap: () => void,
  ): PIXI.Container {
    const size = fitted(name, w, h);
    const box = new PIXI.Container();
    box.eventMode = 'static';
    box.interactiveChildren = false;
    box.position.set(cx, cy);
    box.hitArea = new PIXI.Rectangle(-size.w / 2, -size.h / 2, size.w, size.h);
    fitSprite(box, uiTex(name), 0, 0, w, h);
    const t = stroke(font, INK, '#fff4c4', 4);
    t.anchor.set(0.5);
    t.style.wordWrap = true;
    t.style.wordWrapWidth = Math.max(80, size.w * 0.72);
    t.style.align = 'center';
    t.text = title;
    box.addChild(t);
    this.addChild(box);
    bindPointerTap(box, onTap);
    return box;
  }
}
