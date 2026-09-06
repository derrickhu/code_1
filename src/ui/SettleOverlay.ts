import * as PIXI from 'pixi.js';
import { bindPointerTap } from '@/minigame';
import { Game } from '@/core/Game';
import type { RunMemory } from '@/core/RunMemory';
import { totalStars } from '@/core/RunMemory';
import type { BattleState, Fighter, LoseReason } from '@/game/BattleEngine';
import {
  heroTex,
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
  /** 这一关结算给的废铁 */
  earned: number;
  /** 村里现有废铁 */
  scrap: number;
  /** 这一关给了几发弹子 */
  pellets: number;
  loseReason?: LoseReason;
  /** 一句话说清这一关是怎么过 / 怎么崩的。结算认这句，不认总伤害 */
  identity?: string;
  nextMove?: string;
  nextStageLabel?: string;
  canDouble: boolean;
};

type Slot = {
  h: number;
  draw: (cy: number) => void;
};

/** 看广告翻倍之后这一关一共给多少废铁 */
function doubled(earned: number): number {
  return Math.max(16, earned * 2);
}

/** ★★☆ 这种写法。结算页的主信息之一，不许只写「通关」 */
function starMarks(stars: number): string {
  return '★'.repeat(Math.max(0, stars)) + '☆'.repeat(Math.max(0, 3 - stars));
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

/**
 * 结算页最多站几个人。
 *
 * 满级能上 8 个，全画上去就成了一排小人 —— 反目标第二条要的是「脸认得出」，
 * 8 张 90px 的立绘做不到。所以结算只挑 3 个讲故事的：
 * 输了挑倒下的（他们就是故事），赢了挑阶数最高的（那是玩家的成果）。
 */
const SETTLE_CAST = 3;

function castOf(team: readonly Fighter[], won: boolean): Fighter[] {
  const pool = [...team];
  if (!won) {
    const fallen = pool.filter((f) => !f.alive);
    if (fallen.length > 0) {
      return fallen
        .sort((a, b) => a.lane - b.lane || a.cell - b.cell)
        .slice(0, SETTLE_CAST);
    }
  }
  return pool
    .sort((a, b) => b.evoStage - a.evoStage || b.stars - a.stars || a.lane - b.lane)
    .slice(0, SETTLE_CAST);
}

/** 一排人横向铺开的 x。人少就往中间收，别贴着边站 */
function lineupXs(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [375];
  if (n === 2) return [258, 492];
  return [198, 375, 552];
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

/** 底下那一行小字：这一关的成绩 + 全局进度 */
function footLine(state: BattleState, memory: RunMemory, opts: SettleOpts): string {
  const fallen = state.team.filter((f) => !f.alive).length;
  return [
    `上场 ${state.team.length} 人`,
    fallen > 0 ? `倒了 ${fallen} 个` : '一个没倒',
    opts.loseReason === undefined && state.leaked > 0 ? `漏 ${state.leaked}` : '',
    `累计 ${totalStars(memory)} 星`,
  ].filter(Boolean).join(' · ');
}

export class SettleOverlay extends PIXI.Container {
  private readonly _onReplay: () => void;
  private readonly _onDouble: () => Promise<boolean>;
  private readonly _onYard: () => void;
  private readonly _onNext: () => void;
  private _busy = false;
  private _tookDouble = false;
  private _adPulse: PIXI.Container[] = [];
  private _pulseT = 0;
  private _held: {
    state: BattleState;
    memory: RunMemory;
    height: number;
    opts: SettleOpts;
  } | null = null;

  constructor(
    onReplay: () => void,
    onDouble: () => Promise<boolean>,
    onYard: () => void,
    onNext: () => void,
  ) {
    super();
    this._onReplay = onReplay;
    this._onDouble = onDouble;
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

  show(state: BattleState, memory: RunMemory, height: number, opts: SettleOpts): void {
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.visible = true;
    this.eventMode = 'static';
    this._held = { state, memory, height, opts };
    this.hitArea = new PIXI.Rectangle(0, 0, 750, height);

    const won = state.phase === 'won';
    this._coverBg(height, !won);
    if (!won) {
      this._showLose(state, memory, height, opts);
      return;
    }

    const top = Math.max(Game.safeTop, 28);
    const title = '守住了';

    const cast = castOf(state.team, true);
    const plaque = fitted('title_plaque', 700, 380);
    const plaqueY = top + plaque.h * 0.48;
    fitSprite(this, uiTex('title_plaque'), 375, plaqueY, 700, 380);
    const titleTx = stroke(56, GOLD, '#2a160c', 7);
    titleTx.anchor.set(0.5);
    titleTx.position.set(375, plaqueY + plaque.h * 0.15);
    titleTx.text = title;
    this.addChild(titleTx);

    // 星评是主信息之一：三档要分得开，玩家才有理由回头重打
    const starTx = stroke(38, GOLD, '#2a160c', 6);
    starTx.anchor.set(0.5);
    starTx.position.set(375, plaqueY + plaque.h * 0.3);
    starTx.text = starMarks(state.stars);
    this.addChild(starTx);

    if (opts.identity) {
      const idTx = stroke(20, GOLD, '#2a160c', 4);
      idTx.anchor.set(0.5);
      idTx.position.set(375, plaqueY + plaque.h * 0.42);
      idTx.text = opts.identity;
      this.addChild(idTx);
    }

    const infoBottom = plaqueY + plaque.h * 0.52;

    const showNext = !!opts.nextStageLabel;
    const loot = { w: 710, h: 210 };
    const adBtn = fitted('ad_btn', 640, 146);
    const nextBtn = fitted('settle_btn', 400, 86);
    const footBtn = fitted('settle_btn', 300, 92);
    const namePlate = fitted('settle_name', 168, 48);
    const carry = doubled(opts.earned);
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
        foot.text = footLine(state, memory, opts);
        this.addChild(foot);
      },
    });

    if (!this._tookDouble) {
      slots.push({
        h: adBtn.h,
        draw: (cy) => {
          this._adBtn(375, cy, 640, 146, `看视频  废铁翻倍拿 ${carry}`, async () => {
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

    const xs = lineupXs(cast.length);
    cast.forEach((f, i) => {
      const x = xs[i] ?? 375;
      const mid = cast.length === 1 || i === 1;
      standSprite(this, heroTex(f.def.id, f.evoStage), x, feetY, mid ? 156 : 132, mid ? 184 : 156);
      this._chip('settle_name', x, nameCy, 168, 48, f.def.name, 17, CREAM);
      // 名牌下面写阶数和星，不写数值：玩家认的是「他进到几阶了」
      const tag = stroke(15, 0xffe08a, '#1a1008', 3);
      tag.anchor.set(0.5);
      tag.position.set(x, nameCy + 34);
      const craft = f.craft ?? (f.evoStage >= 3 ? 6 : f.evoStage >= 2 ? 3 : 1);
      tag.text = `${'一二三'[f.evoStage - 1] ?? '一'}阶 · 手艺${craft}${f.stars > 0 ? ` ★${f.stars}` : ''}`;
      this.addChild(tag);
    });
  }

  /** 底下那一行小字。写这一关的成绩和总进度，不写伤害统计 */

  /**
   * 失败结算按 settle_ui_lose_v2：歪匾、坐马路牙子、下一手是主信息、
   * 废品缩小、再来一局为主，没有广告。
   */
  private _showLose(state: BattleState, memory: RunMemory, height: number, opts: SettleOpts): void {
    const cast = castOf(state.team, false);
    const top = Math.max(Game.safeTop, 20);
    // 两种败因要说得不一样：漏怪是「哪一路没挡住」，超时是「清不完」
    const title = opts.loseReason === 'timeout' ? '清不完' : '让它们过去了';
    const hint = opts.nextMove || '下次换个排法试试';

    const vignette = new PIXI.Graphics();
    vignette.beginFill(0x0a1220, 0.22).drawRect(0, 0, 750, 90).endFill();
    vignette.beginFill(0x0a1220, 0.18).drawRect(0, height - 120, 750, 120).endFill();
    vignette.eventMode = 'none';
    this.addChild(vignette);

    const plaqueW = 680;
    const plaqueH = 280;
    const plaqueCy = top + plaqueH * 0.46;
    const tilt = -0.06;
    const plaqueSpr = fitSprite(this, uiTex('title_plaque'), 360, plaqueCy, plaqueW, plaqueH);
    if (plaqueSpr) plaqueSpr.rotation = tilt;
    const faceY = plaqueCy + plaqueH * 0.1;
    const titleTx = stroke(40, 0x8b2e1f, '#1a1008', 6);
    titleTx.anchor.set(0.5);
    titleTx.position.set(356, faceY);
    titleTx.rotation = tilt;
    titleTx.text = title;
    this.addChild(titleTx);

    const stampX = 568;
    const stampY = faceY + 58;
    fillSprite(this, uiTex('settle_stamp'), stampX, stampY, 196, 80);
    const waveTx = stroke(22, CREAM, '#1a1008', 4);
    waveTx.anchor.set(0.5);
    waveTx.position.set(stampX, stampY + 1);
    waveTx.text = opts.loseReason === 'timeout'
      ? `剩 ${state.foes.filter((e) => e.alive).length} 只`
      : `漏了 ${state.leaked} 个`;
    this.addChild(waveTx);

    const hintH = 96;
    const hintCy = plaqueCy + plaqueH * 0.5 + 8 + hintH / 2;
    this._caption(375, hintCy, 660, hintH, hint, 22, CREAM);

    const yardH = 72;
    const replayH = 118;
    const yardCy = height - Game.safeBottom - 18 - yardH / 2;
    const replayCy = yardCy - yardH / 2 - 14 - replayH / 2;
    const capCy = replayCy - replayH / 2 - 24;
    const lootH = 88;
    const lootCy = capCy - 18 - lootH / 2;

    const nameH = 46;
    const tagH = 30;
    const bandTop = hintCy + hintH / 2 + 18;
    const bandBottom = lootCy - lootH / 2 - 14;
    const labelStack = 12 + nameH + 8 + tagH;
    const sitH = Math.max(190, Math.min(260, bandBottom - labelStack - bandTop));
    const feetY = bandTop + sitH;
    this._drawCurb(48, feetY - 6, 654, 28);

    const xs = lineupXs(cast.length);
    cast.forEach((f, i) => {
      const x = xs[i] ?? 375;
      const mid = cast.length === 1 || i === 1;
      const spr = standSprite(this, heroTex(f.def.id, f.evoStage), x, feetY + 4, mid ? 200 : 178, sitH);
      if (spr) spr.tint = 0xa8a29a;
      fillSprite(this, uiTex('settle_name'), x, feetY + 14 + nameH / 2, 168, nameH);
      const nameTx = stroke(18, CREAM, '#1a1008', 4);
      nameTx.anchor.set(0.5);
      nameTx.position.set(x, feetY + 14 + nameH / 2 + 1);
      nameTx.text = f.def.name;
      this.addChild(nameTx);
      // 站哪一路要写出来。失败页的作用就是回答「我哪一路崩了」
      const tag = stroke(16, 0xffb8b0, '#1a1008', 3);
      tag.anchor.set(0.5);
      tag.position.set(x, feetY + 14 + nameH + 8 + tagH / 2);
      tag.text = `${'左中右'[f.lane] ?? '中'}路 第${f.cell + 1}格`;
      this.addChild(tag);
    });

    this._loseLoot(lootCy, { w: 660, h: lootH }, opts);

    const cap = stroke(18, CREAM, '#1a1008', 3);
    cap.anchor.set(0.5);
    cap.position.set(375, capCy);
    cap.text = footLine(state, memory, opts);
    this.addChild(cap);

    this._fillBtn(375, replayCy, 560, replayH, '再来一局', 28, () => this._onReplay());
    this._fillBtn(375, yardCy, 360, yardH, '回村子', 20, () => this._onYard());
  }

  private _drawCurb(x: number, y: number, w: number, h: number): void {
    const g = new PIXI.Graphics();
    g.eventMode = 'none';
    g.beginFill(0x3a3832, 0.92).drawRoundedRect(x, y, w, h, 6).endFill();
    g.beginFill(0x5a564c, 0.55).drawRoundedRect(x + 6, y + 3, w - 12, 7, 3).endFill();
    this.addChild(g);
  }

  private _loseLoot(cy: number, size: { w: number; h: number }, opts: SettleOpts): void {
    fillSprite(this, uiTex('iron_bar'), 375, cy, size.w, size.h);
    fitSprite(this, uiTex('scrap_pile'), 375 - size.w * 0.36, cy, 56, 52);
    const plus = stroke(26, CREAM, '#1a1008', 4);
    plus.anchor.set(0, 0.5);
    // 输了也给弹子。空手回村的人不会再打第二次，而漏怪本身已经罚过一次了
    plus.text = `+${opts.pellets} 发弹子`;
    plus.position.set(375 - size.w * 0.24, cy);
    this.addChild(plus);
    const have = stroke(16, CREAM, '#1a1008', 3);
    have.anchor.set(1, 0.5);
    have.position.set(375 + size.w * 0.4, cy);
    have.text = `村里废铁 ${opts.scrap}`;
    this.addChild(have);
  }

  hide(): void {
    this.visible = false;
    this.eventMode = 'none';
    this._busy = false;
    this._tookDouble = false;
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
    fitSprite(this, uiTex('scrap_pile'), 375 - size.w * 0.34, cy + 4, 96, 88);
    const plus = stroke(58, GOLD, '#1a1008', 7);
    plus.anchor.set(0, 0.5);
    plus.text = `+${opts.earned}`;
    plus.position.set(375 - size.w * 0.18, cy);
    this.addChild(plus);
    const name = stroke(26, INK, '#fff4c4', 4);
    name.anchor.set(0, 0.5);
    name.position.set(plus.x + plus.width + 12, cy + 4);
    name.text = `废铁 · +${opts.pellets} 发弹子`;
    this.addChild(name);
    const have = stroke(15, INK, '#fff4c4', 3);
    have.anchor.set(1, 0.5);
    have.position.set(375 + size.w * 0.38, cy + size.h * 0.24);
    have.text = `村里废铁 ${opts.scrap}`;
    this.addChild(have);
  }

  private _coverBg(h: number, lose = false): void {
    const art = villageBgTex();
    if (art?.baseTexture.valid) {
      const spr = new PIXI.Sprite(art);
      const scale = Math.max(750 / art.width, h / art.height);
      spr.anchor.set(0.5, 0);
      spr.position.set(375, 0);
      spr.scale.set(scale);
      if (lose) spr.tint = 0x6e7480;
      this.addChild(spr);
      if (lose) {
        const veil = new PIXI.Graphics();
        veil.beginFill(0x0a1220, 0.32).drawRect(0, 0, 750, h).endFill();
        this.addChild(veil);
      }
      return;
    }
    const g = new PIXI.Graphics();
    g.beginFill(lose ? 0x1c1e24 : 0x3a2a1c).drawRect(0, 0, 750, h).endFill();
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
    fillSprite(this, uiTex('iron_bar'), cx, cy, maxW, maxH);
    if (title) {
      const t = stroke(size, fill);
      t.anchor.set(0.5);
      t.position.set(cx, cy + 1);
      t.style.wordWrap = true;
      t.style.wordWrapWidth = Math.max(200, maxW - 80);
      t.style.align = 'center';
      t.style.lineHeight = size + 6;
      t.text = title;
      this.addChild(t);
    }
    return { w: maxW, h: maxH };
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

  private _fillBtn(
    cx: number,
    cy: number,
    w: number,
    h: number,
    title: string,
    font: number,
    onTap: () => void,
  ): PIXI.Container {
    const box = new PIXI.Container();
    box.eventMode = 'static';
    box.interactiveChildren = false;
    box.position.set(cx, cy);
    box.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
    fillSprite(box, uiTex('settle_btn'), 0, 0, w, h);
    const t = stroke(font, INK, '#fff4c4', 4);
    t.anchor.set(0.5);
    t.style.wordWrap = true;
    t.style.wordWrapWidth = Math.max(80, w * 0.72);
    t.style.align = 'center';
    t.text = title;
    box.addChild(t);
    this.addChild(box);
    bindPointerTap(box, onTap);
    return box;
  }
}
