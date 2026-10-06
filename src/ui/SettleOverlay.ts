import * as PIXI from 'pixi.js';
import { bindPointerTap } from '@/minigame';
import { Game } from '@/core/Game';
import type { RunMemory } from '@/core/RunMemory';
import { totalStars } from '@/core/RunMemory';
import { countedLeaks, type BattleState, type Fighter, type LoseReason } from '@/game/BattleEngine';
import {
  heroTex,
  uiTex,
  villageBgTex,
  watchArt,
  type UiName,
} from '@/core/TextureLoader';
import { SETTLE_AD_PELLETS } from '@/balance/stall';
import { GOLD, fitSprite, label } from '@/ui/paint';
import { Ease, TweenManager } from '@/core/TweenManager';
import { Platform } from '@/core/PlatformService';
import { playSfx } from '@/core/SfxPlayer';

const INK = 0x2a160c;
const CREAM = 0xfff4c4;
const GAP = 12;

/** 赢的开场。拍子错开，大约 2.7 秒；点空白仍能跳到终态 */
const WIN = {
  drop: 0.5,
  starOff: 0.58,
  starOffGap: 0.08,
  starOffDur: 0.3,
  starOn: 0.82,
  starOnGap: 0.32,
  slam: 0.32,
  flourish: 1.82,
  people: 2.0,
  peopleGap: 0.08,
  peopleMid: 2.18,
  loot: 2.2,
  rollAt: 2.24,
  rollDur: 0.7,
  foot: 2.32,
  yard: 2.4,
  replay: 2.48,
  next: 2.52,
  ad: 2.6,
  pop: 0.36,
  /** 最后一颗按钮落定之后，下一关才开始呼吸 */
  done: 3.02,
} as const;

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
    opts.loseReason === undefined && countedLeaks(state) > 0 ? `漏 ${countedLeaks(state)}` : '',
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
  /** 进账牌上的两行数。翻倍后就地滚，不整页重画 */
  private _earnTx: PIXI.Text | null = null;
  private _nameTx: PIXI.Text | null = null;
  private _haveTx: PIXI.Text | null = null;
  private _adBox: PIXI.Container | null = null;
  private _adLabel: PIXI.Text | null = null;
  /** 开场演出还没放完。点空白跳到终态，按钮呼吸等这段结束 */
  private _intro = false;
  private _nextPulse: PIXI.Container[] = [];
  private _tracked: object[] = [];
  private _poses: { node: PIXI.Container; x: number; y: number; sx: number; sy: number; a: number }[] = [];
  private _fxLayer: PIXI.Container | null = null;

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
    this._intro = false;
    this._haltIntro();
    this._poses = [];
    this._nextPulse = [];
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.visible = true;
    this.eventMode = 'static';
    this._held = { state, memory, height, opts };
    this.hitArea = new PIXI.Rectangle(0, 0, 750, height);

    const won = state.phase === 'won';
    this._coverBg(height, !won);
    this._armSkip(height);
    if (!won) {
      this._showLose(state, memory, height, opts);
      return;
    }
    this._intro = true;

    const top = Math.max(Game.safeTop, 28);
    const title = '守住了';

    const cast = castOf(state.team, true);
    const plaque = fitted('title_plaque', 700, 380);
    const plaqueY = top + plaque.h * 0.48;
    const drop = new PIXI.Container();
    drop.eventMode = 'none';
    this.addChild(drop);
    const plaqueSpr = fitSprite(drop, uiTex('title_plaque'), 375, plaqueY, 700, 380);
    const titleTx = stroke(56, GOLD, '#2a160c', 7);
    titleTx.anchor.set(0.5);
    titleTx.position.set(375, plaqueY + plaque.h * 0.05);
    titleTx.text = title;
    drop.addChild(titleTx);

    // 星是三颗牌，不是一行 ★。空位先就位，得到的再一颗颗砸进去
    const starRow = new PIXI.Container();
    starRow.position.set(375, plaqueY + plaque.h * 0.2);
    drop.addChild(starRow);
    this._mountStars(starRow, state.stars);

    if (opts.identity) {
      const idTx = stroke(20, GOLD, '#2a160c', 4);
      idTx.anchor.set(0.5);
      idTx.position.set(375, plaqueY + plaque.h * 0.32);
      idTx.text = opts.identity;
      drop.addChild(idTx);
    }
    this._drop(drop, 0, 240, plaqueSpr ?? undefined, WIN.drop);
    if (state.stars >= 3) {
      this._shake(drop, WIN.flourish);
      this._later(WIN.flourish, () => {
        if (!this._intro) return;
        this._paper(375, plaqueY + plaque.h * 0.2);
      });
    }

    const showNext = !!opts.nextStageLabel;
    const loot = { w: 710, h: 210 };
    const adBtn = fitted('ad_btn', 640, 146);
    const nextBtn = fitted('settle_btn', 400, 86);
    const footBtn = fitted('settle_btn', 300, 92);
    const namePlate = fitted('settle_name', 168, 48);
    this._adPulse = [];

    const footerY = height - Game.safeBottom - 20 - footBtn.h / 2;
    const yardBtn = this._imgBtn('settle_btn', 200, footerY, 300, 96, '回村子', 22, () => this._onYard());
    const replayBtn = this._imgBtn('settle_btn', 550, footerY, 300, 96, '再来一局', 22, () => this._onReplay());
    this._pop(yardBtn, WIN.yard, WIN.pop);
    this._pop(replayBtn, WIN.replay, WIN.pop);

    const slots: Slot[] = [];

    slots.push({
      h: loot.h,
      draw: (cy) => {
        const host = new PIXI.Container();
        host.eventMode = 'none';
        host.position.set(375, cy);
        this._lootCard(host, loot, opts, true);
        this.addChild(host);
        this._pop(host, WIN.loot, WIN.pop);
      },
    });

    slots.push({
      h: 26,
      draw: (cy) => {
        const foot = stroke(16, 0xffe08a, '#1a1008', 3);
        foot.anchor.set(0.5);
        foot.position.set(375, cy);
        foot.text = footLine(state, memory, opts);
        this.addChild(foot);
        this._fade(foot, WIN.foot, 0.28);
      },
    });

    if (opts.canDouble && !this._tookDouble) {
      slots.push({
        h: adBtn.h,
        draw: (cy) => {
          const ad = this._adBtn(375, cy, 640, 146, `看视频，再给 ${SETTLE_AD_PELLETS} 发弹子`, async () => {
            if (this._busy || this._tookDouble) return;
            this._busy = true;
            const ok = await this._onDouble();
            this._busy = false;
            if (!ok || !this._held) return;
            this._tookDouble = true;
            const from = this._held.opts.pellets;
            const to = from + SETTLE_AD_PELLETS;
            this._held.opts = { ...this._held.opts, pellets: to };
            // 宿主关广告后常自带「领取成功」，先清掉再滚数字，免得盖住变化
            Platform.hideToast();
            this._roll(this._nameTx, from, to, (n) => `废铁 · +${n} 发弹子`);
            this._lockAd();
          });
          this._pop(ad, WIN.ad, WIN.pop);
        },
      });
    }

    if (showNext) {
      slots.push({
        h: nextBtn.h,
        draw: (cy) => {
          const next = this._imgBtn(
            'settle_btn',
            375,
            cy,
            400,
            86,
            `下一关 ${opts.nextStageLabel}`,
            20,
            () => this._onNext(),
          );
          this._pop(next, WIN.next, WIN.pop);
          this._nextPulse.push(next);
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
    // 手艺那行离废铁牌顶大约 48px，人跟着废铁牌走
    const craftPast = 34 + 14 - namePlate.h / 2;
    const nameBottom = lootTop - 48 - Math.max(8, craftPast);
    const feetY = nameBottom - namePlate.h;
    const nameCy = nameBottom - namePlate.h / 2;

    const xs = lineupXs(cast.length);
    cast.forEach((f, i) => {
      const x = xs[i] ?? 375;
      const mid = cast.length === 1 || i === 1;
      const body = new PIXI.Container();
      body.eventMode = 'none';
      body.position.set(x, feetY);
      standSprite(body, heroTex(f.def.id, f.evoStage), 0, 0, mid ? 156 : 132, mid ? 184 : 156);
      this._chip('settle_name', 0, nameCy - feetY, 168, 48, f.def.name, 17, CREAM, body);
      // 名牌下面写手艺和星。形态不写字 —— 立绘本身就是那句话（星解锁的那一身）
      const tag = stroke(15, 0xffe08a, '#1a1008', 3);
      tag.anchor.set(0.5);
      tag.position.set(0, nameCy - feetY + 34);
      const craft = f.craft ?? 1;
      tag.text = `手艺 Lv.${craft}${f.stars > 0 ? ` · ★${f.stars}` : ''}`;
      body.addChild(tag);
      this.addChild(body);
      const late = cast.length === 3 && i === 1;
      this._pop(body, late ? WIN.peopleMid : WIN.people + i * WIN.peopleGap, WIN.pop);
    });
    this._later(WIN.done, () => this._openPlay());
  }

  /** 底下那一行小字。写这一关的成绩和总进度，不写伤害统计 */

  /**
   * 失败结算按 settle_ui_lose_v2：歪匾、坐马路牙子、下一手是主信息、
   * 废品缩小、再来一局为主，没有广告。
   */
  private _showLose(state: BattleState, memory: RunMemory, height: number, opts: SettleOpts): void {
    this._intro = true;
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
    const drop = new PIXI.Container();
    drop.eventMode = 'none';
    this.addChild(drop);
    const plaqueSpr = fitSprite(drop, uiTex('title_plaque'), 360, plaqueCy, plaqueW, plaqueH);
    if (plaqueSpr) plaqueSpr.rotation = tilt;
    const faceY = plaqueCy + plaqueH * 0.1;
    const titleTx = stroke(40, 0x8b2e1f, '#1a1008', 6);
    titleTx.anchor.set(0.5);
    titleTx.position.set(356, faceY);
    titleTx.rotation = tilt;
    titleTx.text = title;
    drop.addChild(titleTx);
    this._drop(drop, 0, 180, plaqueSpr ?? undefined);

    const stampX = 568;
    const stampY = faceY + 58;
    const stamp = new PIXI.Container();
    stamp.eventMode = 'none';
    stamp.position.set(stampX, stampY);
    fillSprite(stamp, uiTex('settle_stamp'), 0, 0, 196, 80);
    const waveTx = stroke(22, CREAM, '#1a1008', 4);
    waveTx.anchor.set(0.5);
    waveTx.position.set(0, 1);
    waveTx.text = opts.loseReason === 'timeout'
      ? `剩 ${state.foes.filter((e) => e.alive).length} 只`
      : `漏了 ${state.leaked} 个`;
    stamp.addChild(waveTx);
    this.addChild(stamp);
    this._slap(stamp, 0.46);
    this._later(1.05, () => this._openPlay());

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
    this._intro = false;
    this._haltIntro();
    this._poses = [];
    this._nextPulse = [];
    this.visible = false;
    this.eventMode = 'none';
    this._busy = false;
    this._tookDouble = false;
    this._adPulse = [];
    this._earnTx = null;
    this._nameTx = null;
    this._haveTx = null;
    this._adBox = null;
    this._adLabel = null;
    this._held = null;
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  /** 点空白把还在飞的东西直接放到终态。按钮在这层上面，点得到 */
  private _armSkip(height: number): void {
    const hit = new PIXI.Container();
    hit.eventMode = 'static';
    hit.hitArea = new PIXI.Rectangle(0, 0, 750, Math.max(height, 1334));
    this.addChild(hit);
    bindPointerTap(hit, () => this._endIntro(), { silent: true });
  }

  private _track(target: object): void {
    this._tracked.push(target);
  }

  private _pose(node: PIXI.Container): void {
    this._poses.push({
      node,
      x: node.x,
      y: node.y,
      sx: node.scale.x,
      sy: node.scale.y,
      a: node.alpha,
    });
  }

  private _haltIntro(): void {
    for (const t of this._tracked) TweenManager.cancelTarget(t);
    this._tracked = [];
    this._fxLayer?.destroy({ children: true });
    this._fxLayer = null;
  }

  private _fx(): PIXI.Container {
    if (this._fxLayer && !this._fxLayer.destroyed) return this._fxLayer;
    const layer = new PIXI.Container();
    layer.eventMode = 'none';
    layer.interactiveChildren = false;
    this.addChild(layer);
    this._fxLayer = layer;
    return layer;
  }

  /** 跳过，或重画前收掉。数字和透明度回到终态，位置不再停在半空 */
  private _endIntro(): void {
    if (!this._intro) return;
    this._intro = false;
    this._haltIntro();
    for (const p of this._poses) {
      if (p.node.destroyed) continue;
      p.node.position.set(p.x, p.y);
      p.node.scale.set(p.sx, p.sy);
      p.node.alpha = p.a;
    }
    const earned = this._held?.opts.earned;
    const pellets = this._held?.opts.pellets;
    if (this._earnTx && !this._earnTx.destroyed && earned !== undefined) {
      this._earnTx.text = `+${earned}`;
    }
    if (this._nameTx && !this._nameTx.destroyed && this._earnTx && !this._earnTx.destroyed) {
      this._nameTx.alpha = 1;
      if (pellets !== undefined) this._nameTx.text = `废铁 · +${pellets} 发弹子`;
      this._nameTx.x = this._earnTx.x + this._earnTx.width + 12;
    }
  }

  /** 开场演完，下一关才开始呼吸。按钮本身一直能点 */
  private _openPlay(): void {
    this._intro = false;
  }

  private _later(delay: number, fn: () => void): void {
    const proxy = { t: 0 };
    this._track(proxy);
    TweenManager.to({
      target: proxy,
      props: { t: 1 },
      delay,
      duration: 0.01,
      onComplete: fn,
    });
  }

  private _drop(node: PIXI.Container, delay: number, dy: number, punch?: PIXI.Sprite, dur = 0.42): void {
    this._pose(node);
    const rest = node.y;
    node.y = rest - dy;
    this._track(node);
    TweenManager.to({
      target: node,
      props: { y: rest },
      delay,
      duration: dur,
      ease: Ease.easeOutBack,
      onComplete: () => {
        if (punch && !punch.destroyed) this._punch(punch);
      },
    });
  }

  private _pop(node: PIXI.Container, delay: number, dur = 0.32): void {
    this._pose(node);
    const sx = node.scale.x;
    const sy = node.scale.y;
    node.scale.set(0);
    this._track(node.scale);
    TweenManager.to({
      target: node.scale,
      props: { x: sx, y: sy },
      delay,
      duration: dur,
      ease: Ease.easeOutBack,
    });
  }

  private _fade(node: PIXI.Container, delay: number, dur: number): void {
    this._pose(node);
    node.alpha = 0;
    this._track(node);
    TweenManager.to({
      target: node,
      props: { alpha: 1 },
      delay,
      duration: dur,
      ease: Ease.easeOutCubic,
    });
  }

  private _punch(node: PIXI.Container | PIXI.Sprite): void {
    if (node.destroyed) return;
    const sx = node.scale.x;
    const sy = node.scale.y;
    if (!this._poses.some((p) => p.node === node)) {
      this._poses.push({
        node: node as PIXI.Container,
        x: node.x,
        y: node.y,
        sx,
        sy,
        a: node.alpha,
      });
    }
    this._track(node.scale);
    TweenManager.to({
      target: node.scale,
      props: { x: sx * 1.08, y: sy * 0.9 },
      duration: 0.07,
      ease: Ease.easeOutQuad,
      onComplete: () => {
        if (node.destroyed || !this._intro) return;
        this._track(node.scale);
        TweenManager.to({
          target: node.scale,
          props: { x: sx, y: sy },
          duration: 0.16,
          ease: Ease.easeOutBack,
        });
      },
    });
  }

  private _shake(node: PIXI.Container, delay: number): void {
    const home = node.x;
    const proxy = { t: 0 };
    this._track(proxy);
    TweenManager.to({
      target: proxy,
      props: { t: 1 },
      delay,
      duration: 0.28,
      onUpdate: () => {
        if (node.destroyed) return;
        const k = proxy.t;
        node.x = home + Math.sin(k * 48) * (1 - k) * 12;
      },
      onComplete: () => {
        if (!node.destroyed) node.x = home;
      },
    });
  }

  private _slap(node: PIXI.Container, delay: number): void {
    this._pose(node);
    node.scale.set(1.85);
    node.alpha = 0;
    this._track(node);
    this._track(node.scale);
    TweenManager.to({
      target: node,
      props: { alpha: 1 },
      delay,
      duration: 0.08,
    });
    TweenManager.to({
      target: node.scale,
      props: { x: 1, y: 1 },
      delay,
      duration: 0.26,
      ease: Ease.easeOutBack,
      onComplete: () => {
        if (!this._intro || node.destroyed) return;
        playSfx('hit_smash', 0);
        this._punch(node);
      },
    });
  }

  private _mountStars(row: PIXI.Container, stars: number): void {
    const xs = [-86, 0, 86];
    const sizes = [50, 62, 50];
    const tilts = [0.22, 0, -0.22];
    for (let i = 0; i < 3; i += 1) {
      const y = i === 1 ? -8 : 0;
      const off = new PIXI.Container();
      off.position.set(xs[i] ?? 0, y);
      off.rotation = tilts[i] ?? 0;
      fitSprite(off, uiTex('star_off'), 0, 0, sizes[i] ?? 50, sizes[i] ?? 50);
      row.addChild(off);
      this._pop(off, WIN.starOff + i * WIN.starOffGap, WIN.starOffDur);
      if (i >= stars) continue;
      const on = new PIXI.Container();
      on.position.set(xs[i] ?? 0, y);
      on.rotation = tilts[i] ?? 0;
      fitSprite(on, uiTex('star_on'), 0, 0, sizes[i] ?? 50, sizes[i] ?? 50);
      row.addChild(on);
      this._slamStar(on, WIN.starOn + i * WIN.starOnGap);
    }
  }

  private _slamStar(node: PIXI.Container, delay: number): void {
    this._poses.push({
      node, x: node.x, y: node.y, sx: 1, sy: 1, a: 1,
    });
    node.scale.set(2.5);
    node.alpha = 0;
    this._track(node);
    this._track(node.scale);
    TweenManager.to({
      target: node,
      props: { alpha: 1 },
      delay,
      duration: 0.1,
    });
    TweenManager.to({
      target: node.scale,
      props: { x: 1, y: 1 },
      delay,
      duration: WIN.slam,
      ease: Ease.easeOutBack,
      onComplete: () => {
        if (!this._intro || node.destroyed) return;
        playSfx('hero_land', 0);
        this._punch(node);
        this._sparkAt(node);
      },
    });
  }

  private _sparkAt(node: PIXI.Container): void {
    const local = this.toLocal(node.getGlobalPosition());
    this._sparks(local.x, local.y);
  }

  private _sparks(x: number, y: number): void {
    const layer = new PIXI.Container();
    layer.eventMode = 'none';
    layer.position.set(x, y);
    this._fx().addChild(layer);
    for (let i = 0; i < 8; i += 1) {
      const g = new PIXI.Graphics();
      g.beginFill(i % 2 === 0 ? 0xffe08a : 0xfff4c4);
      g.drawCircle(0, 0, 4);
      g.endFill();
      layer.addChild(g);
      const a = (i / 8) * Math.PI * 2;
      const proxy = { t: 0 };
      this._track(proxy);
      const dist = 36 + (i % 3) * 10;
      TweenManager.to({
        target: proxy,
        props: { t: 1 },
        duration: 0.32,
        ease: Ease.easeOutQuad,
        onUpdate: () => {
          if (g.destroyed) return;
          g.x = Math.cos(a) * dist * proxy.t;
          g.y = Math.sin(a) * dist * proxy.t;
          g.alpha = 1 - proxy.t;
        },
        onComplete: () => {
          if (!g.destroyed) g.destroy();
        },
      });
    }
    this._later(0.36, () => {
      if (!layer.destroyed) layer.destroy({ children: true });
    });
  }

  /** 三星才撒。红纸和鞭炮纸，不铺彩虹 */
  private _paper(x: number, y: number): void {
    const layer = this._fx();
    const colors = [0xc43a28, 0xe8c56b, 0xf2d48a, 0x8b2e1f];
    for (let i = 0; i < 16; i += 1) {
      const g = new PIXI.Graphics();
      g.beginFill(colors[i % colors.length] ?? 0xc43a28);
      g.drawRect(-6, -11, 12, 22);
      g.endFill();
      const side = i % 2 === 0 ? -1 : 1;
      const x0 = x + side * (40 + (i % 4) * 28);
      const y0 = y + 20;
      g.position.set(x0, y0);
      layer.addChild(g);
      const proxy = { t: 0 };
      this._track(proxy);
      const vx = side * (40 + (i % 5) * 26);
      const vy = -(160 + (i % 4) * 36);
      TweenManager.to({
        target: proxy,
        props: { t: 1 },
        duration: 0.85,
        ease: Ease.linear,
        onUpdate: () => {
          if (g.destroyed) return;
          const t = proxy.t;
          g.x = x0 + vx * t;
          g.y = y0 + vy * t + 280 * t * t;
          g.rotation = side * t * 5;
          g.alpha = t < 0.72 ? 1 : 1 - (t - 0.72) / 0.28;
        },
        onComplete: () => {
          if (!g.destroyed) g.destroy();
        },
      });
    }
  }

  private _tickPulse(): void {
    if (!this.visible || this._intro) return;
    if (this._adPulse.length === 0 && this._nextPulse.length === 0) return;
    this._pulseT += Game.ticker.deltaMS / 1000;
    const s = 1 + Math.sin(this._pulseT * 3.2) * 0.035;
    for (const b of this._adPulse) if (!b.destroyed) b.scale.set(s);
    const n = 1 + Math.sin(this._pulseT * 2.6) * 0.04;
    for (const b of this._nextPulse) if (!b.destroyed) b.scale.set(n);
  }

  /** 进账牌画在 host 的本地坐标里，host 自己摆到屏幕上，方便整块弹出 */
  private _lootCard(
    host: PIXI.Container,
    size: { w: number; h: number },
    opts: SettleOpts,
    roll: boolean,
  ): void {
    fillSprite(host, uiTex('play_plate'), 0, 0, size.w, size.h);
    fitSprite(host, uiTex('scrap_pile'), -size.w * 0.34, 4, 96, 88);
    const plus = stroke(58, GOLD, '#1a1008', 7);
    plus.anchor.set(0, 0.5);
    plus.text = roll ? '+0' : `+${opts.earned}`;
    plus.position.set(-size.w * 0.18, 0);
    host.addChild(plus);
    this._earnTx = plus;
    const name = stroke(26, INK, '#fff4c4', 4);
    name.anchor.set(0, 0.5);
    name.position.set(plus.x + plus.width + 12, 4);
    name.text = `废铁 · +${opts.pellets} 发弹子`;
    host.addChild(name);
    this._nameTx = name;
    const have = stroke(15, INK, '#fff4c4', 3);
    have.anchor.set(1, 0.5);
    have.position.set(size.w * 0.38, size.h * 0.24);
    have.text = `村里废铁 ${opts.scrap}`;
    host.addChild(have);
    this._haveTx = have;
    if (!roll) return;
    this._fade(name, WIN.foot, 0.24);
    if (opts.earned > 0) {
      this._roll(plus, 0, opts.earned, (n) => `+${n}`, () => {
        if (name.destroyed || plus.destroyed) return;
        name.x = plus.x + plus.width + 12;
      }, false, WIN.rollAt, WIN.rollDur);
    }
  }

  /** 数额从旧值滚到新值。广告那一下再弹一下字，开场滚废铁不弹，免得和整块牌抢 */
  private _roll(
    tx: PIXI.Text | null,
    from: number,
    to: number,
    format: (n: number) => string,
    after?: () => void,
    punch = true,
    delay = 0,
    duration = 0.55,
  ): void {
    if (!tx || tx.destroyed || to <= from) return;
    const proxy = { v: from };
    this._track(proxy);
    TweenManager.to({
      target: proxy,
      props: { v: to },
      delay,
      duration,
      ease: Ease.easeOutCubic,
      onUpdate: () => {
        if (tx.destroyed) return;
        tx.text = format(Math.round(proxy.v));
        after?.();
      },
      onComplete: () => {
        if (tx.destroyed) return;
        tx.text = format(to);
        after?.();
      },
    });
    if (!punch) return;
    TweenManager.cancelTarget(tx.scale);
    tx.scale.set(1);
    this._track(tx.scale);
    TweenManager.to({
      target: tx.scale,
      props: { x: 1.28, y: 1.28 },
      duration: 0.2,
      ease: Ease.easeOutBack,
      onComplete: () => {
        if (tx.destroyed) return;
        TweenManager.to({
          target: tx.scale,
          props: { x: 1, y: 1 },
          duration: 0.25,
          ease: Ease.easeInOutQuad,
        });
      },
    });
  }

  /** 广告钮停掉呼吸，改成已领，不能再点 */
  private _lockAd(): void {
    this._adPulse = [];
    const box = this._adBox;
    if (!box || box.destroyed) return;
    box.eventMode = 'none';
    box.scale.set(1);
    if (this._adLabel && !this._adLabel.destroyed) {
      this._adLabel.text = `已再给 ${SETTLE_AD_PELLETS} 发`;
    }
    TweenManager.to({
      target: box.scale,
      props: { x: 1.06, y: 1.06 },
      duration: 0.16,
      ease: Ease.easeOutBack,
      onComplete: () => {
        if (box.destroyed) return;
        TweenManager.to({
          target: box.scale,
          props: { x: 1, y: 1 },
          duration: 0.2,
          ease: Ease.easeInOutQuad,
        });
      },
    });
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
    parent: PIXI.Container = this,
  ): PIXI.Text {
    const box = fitted(name, w, h);
    fitSprite(parent, uiTex(name), cx, cy, w, h);
    const t = stroke(size, fill);
    t.anchor.set(0.5);
    t.position.set(cx, cy + 1);
    t.style.wordWrap = true;
    t.style.wordWrapWidth = Math.max(80, box.w - 36);
    t.style.align = 'center';
    t.text = title;
    parent.addChild(t);
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
    this._adBox = box;
    this._adLabel = t;
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
