/**
 * 局内层的几块界面：三选一卡、左栏电池和板凳、右栏焊一下和家伙事。
 * 只画不算：能不能选、够不够电池全问 BattleEngine。点击走场景的设计坐标，不靠 Pixi hitTest。
 *
 * 两条竖栏占的是土路两边那 105 宽的空地，不压路面；板凳最多 4 个头像（风险里那条「看得清」）。
 */
import * as PIXI from 'pixi.js';
import {
  OFFER_AUTO_S, REROLL_COST, TIER_NAME, boostDef, boostLine, guestEvo, type GadgetId, type Tier,
} from '@/balance/boosts';
import { getVillager, type VillagerDef } from '@/balance/villagers';
import { heroTex, uiTex, type UiName } from '@/core/TextureLoader';
import type { BattleState, BoostOffer, OfferCard } from '@/game/BattleEngine';
import { GOLD, fitSprite, fillSprite, ironSlab, painted } from '@/ui/paint';

const CREAM = 0xfff4c4;
const INK = 0x3a2414;
const DIM = 0x8a7a66;

export const CARD_W = 220;
export const CARD_H = Math.round((CARD_W * 467) / 340);
const CARD_GAP = 14;

/** 档次的光：普通不发光，好货蓝、压箱底金。和 Hades、土豆兄弟一样靠颜色一眼分档 */
export const TIER_GLOW: readonly [number, number, number] = [GOLD, 0x5ab8ff, 0xffc93a];
const TIER_INK: readonly [number, number, number] = [CREAM, 0xb4e2ff, 0xffd95a];
const TIER_PILL: readonly [number, number, number] = [0x3a2a1c, 0x1d4f86, 0x9a5a00];

const BONUS_W = 640;
const BONUS_H = 112;

/** 卡上那句：`{who}` 换成给谁、谁路过 */
export function cardLine(state: BattleState, c: OfferCard): string {
  let who = '';
  if (c.uid) who = state.team.find((f) => f.uid === c.uid)?.def.name ?? '';
  if (c.guest) who = getVillager(c.guest).name;
  return boostLine(c.id, c.tier).replace('{who}', who || '村里人');
}

/** 卡外一圈光。几层由粗到细叠出来，不用滤镜，真机上不掉帧 */
function tierGlow(tier: Tier, w: number, h: number, r: number): PIXI.Graphics | null {
  if (tier === 0) return null;
  const color = TIER_GLOW[tier];
  const g = new PIXI.Graphics();
  const layers: readonly [number, number][] = tier === 2
    ? [[22, 0.14], [14, 0.24], [8, 0.42], [4, 1]]
    : [[16, 0.14], [9, 0.28], [4, 0.9]];
  for (const [width, alpha] of layers) {
    g.lineStyle(width, color, alpha).drawRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, r);
  }
  return g;
}

function raysOf(size: number): PIXI.Sprite | null {
  const tex = uiTex('chest_rays');
  if (!tex?.baseTexture.valid || tex.width <= 1) return null;
  const s = new PIXI.Sprite(tex);
  s.anchor.set(0.5);
  s.scale.set(size / Math.max(tex.width, tex.height));
  s.eventMode = 'none';
  return s;
}

function tierPill(tier: Tier): PIXI.Container {
  const pill = new PIXI.Container();
  const t = painted(17, TIER_INK[tier], '#120a04', 3);
  t.anchor.set(0.5);
  t.text = TIER_NAME[tier];
  const w = Math.max(64, t.width + 22);
  const g = new PIXI.Graphics();
  g.beginFill(TIER_PILL[tier], 0.95).drawRoundedRect(-w / 2, -13, w, 26, 13).endFill();
  g.lineStyle(2, TIER_GLOW[tier], 1).drawRoundedRect(-w / 2, -13, w, 26, 13);
  pill.addChild(g, t);
  return pill;
}

/**
 * 路过的人用立绘上半身。全身缩进纸面里脸只有一点，认不出是谁。
 * 图没到就先用卡面小图，到了再重画。
 */
function cardArt(parent: PIXI.Container, c: OfferCard, cx: number, cy: number, w: number, h: number): void {
  if (c.guest && guestBust(parent, c.guest, guestEvo(c.tier), cx, cy, w, h)) return;
  if (!fitSprite(parent, uiTex(boostDef(c.id).icon), cx, cy, w * 0.72, h)) {
    const g = new PIXI.Graphics();
    g.beginFill(0x8b5a2b, 0.5).drawCircle(cx, cy, Math.min(w, h) * 0.4).endFill();
    parent.addChild(g);
  }
}

interface CardView {
  box: PIXI.Container;
  glow: PIXI.Graphics | null;
  rays: PIXI.Sprite | null;
}

function card(state: BattleState, c: OfferCard, best: boolean): CardView {
  const box = new PIXI.Container();
  box.eventMode = 'none';
  const rays = c.tier === 2 ? raysOf(CARD_W * 2) : null;
  if (rays) {
    rays.alpha = 0.8;
    box.addChild(rays);
  }
  const glow = tierGlow(c.tier, CARD_W, CARD_H, 18);
  if (glow) box.addChild(glow);
  const body = new PIXI.Container();
  body.position.set(-CARD_W / 2, -CARD_H / 2);
  box.addChild(body);
  if (!fillSprite(body, uiTex('boost_card'), CARD_W / 2, CARD_H / 2, CARD_W, CARD_H)) {
    const g = new PIXI.Graphics();
    ironSlab(g, 0, 0, CARD_W, CARD_H, 14);
    g.beginFill(0xe9d6a8).drawRoundedRect(28, 28, CARD_W - 56, CARD_H * 0.55, 8).endFill();
    body.addChild(g);
  }
  // 纸面大约在 y 39~179，木牌从 210 起。字底对齐纸面下沿，行数多了往上长，不压到木牌上
  cardArt(body, c, CARD_W / 2, 72, CARD_W - 88, 68);
  const line = painted(16, INK, '#f3e3bc', 2);
  line.style.wordWrap = true;
  line.style.breakWords = true;
  line.style.wordWrapWidth = CARD_W - 84;
  line.style.align = 'center';
  line.style.lineHeight = 22;
  line.anchor.set(0.5, 1);
  line.text = cardLine(state, c);
  line.position.set(CARD_W / 2, 176);
  body.addChild(line);
  // 木牌大约在 y 207~275：分了档的名字上移，底下挂档次
  const name = painted(28, TIER_INK[c.tier], '#1a1008', 5);
  name.anchor.set(0.5);
  name.text = boostDef(c.id).name;
  name.position.set(CARD_W / 2, c.tier > 0 ? 234 : 246);
  body.addChild(name);
  if (c.tier > 0) {
    const pill = tierPill(c.tier);
    pill.position.set(CARD_W / 2, 264);
    body.addChild(pill);
  }
  if (best) {
    const tag = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.beginFill(0xb3261e).drawRoundedRect(-40, -17, 80, 34, 8).endFill();
    g.lineStyle(2.5, 0xffe08a, 1).drawRoundedRect(-40, -17, 80, 34, 8);
    tag.addChild(g);
    const t = painted(20, 0xffe08a, '#3a0c08', 4);
    t.anchor.set(0.5);
    t.text = '推荐';
    tag.addChild(t);
    tag.position.set(0, -CARD_H / 2 + 4);
    box.addChild(tag);
  }
  return { box, glow, rays };
}

/**
 * 三张卡底下那条：看一段，白拿一张压箱底，三张照样挑。
 * 整条都能点，按钮只是告诉他「点这儿要看视频」
 */
function bonusSlab(state: BattleState, c: OfferCard): { box: PIXI.Container; rays: PIXI.Sprite | null; btn: PIXI.Container } {
  const box = new PIXI.Container();
  box.eventMode = 'none';
  const glow = tierGlow(2, BONUS_W, BONUS_H, 20);
  if (glow) box.addChild(glow);
  const g = new PIXI.Graphics();
  g.beginFill(0x2a1608, 0.97).drawRoundedRect(-BONUS_W / 2, -BONUS_H / 2, BONUS_W, BONUS_H, 18).endFill();
  g.lineStyle(2, 0x7a4a10, 1).drawRoundedRect(-BONUS_W / 2 + 7, -BONUS_H / 2 + 7, BONUS_W - 14, BONUS_H - 14, 13);
  box.addChild(g);

  const artX = -BONUS_W / 2 + 64;
  const rays = raysOf(BONUS_H * 1.5);
  if (rays) {
    rays.position.set(artX, 0);
    box.addChild(rays);
  }
  const art = new PIXI.Container();
  cardArt(art, c, artX, 0, 96, 84);
  box.addChild(art);

  const textX = artX + 62;
  const title = painted(25, TIER_INK[2], '#1a0c04', 5);
  title.anchor.set(0, 0.5);
  title.text = `压箱底 · ${boostDef(c.id).name}`;
  title.position.set(textX, -24);
  box.addChild(title);
  const line = painted(16, CREAM, '#1a0c04', 3);
  line.style.wordWrap = true;
  line.style.breakWords = true;
  line.style.wordWrapWidth = 270;
  line.style.lineHeight = 20;
  line.anchor.set(0, 0);
  line.text = cardLine(state, c);
  line.position.set(textX, -4);
  box.addChild(line);

  const ribbon = new PIXI.Container();
  const rt = painted(15, 0xffe08a, '#3a0c08', 3);
  rt.anchor.set(0.5);
  rt.text = '白送一张 · 三张照样挑';
  const rw = rt.width + 24;
  const rg = new PIXI.Graphics();
  rg.beginFill(0xb3261e).drawRoundedRect(-rw / 2, -12, rw, 24, 8).endFill();
  rg.lineStyle(2, 0xffe08a, 1).drawRoundedRect(-rw / 2, -12, rw, 24, 8);
  ribbon.addChild(rg, rt);
  ribbon.position.set(textX + rw / 2 - 4, -BONUS_H / 2);
  box.addChild(ribbon);

  const btn = new PIXI.Container();
  btn.position.set(BONUS_W / 2 - 108, 0);
  if (!fitSprite(btn, uiTex('ad_btn'), 0, 0, 196, 80)) {
    const bg = new PIXI.Graphics();
    bg.beginFill(0xf2b632).drawRoundedRect(-98, -38, 196, 76, 16).endFill();
    bg.lineStyle(3, 0x6a3a10, 1).drawRoundedRect(-98, -38, 196, 76, 16);
    btn.addChild(bg);
  }
  // ad_btn 左边是播放钮，字落在右边那块黄底上
  const small = painted(16, INK, '#ffe9a8', 3);
  small.anchor.set(0.5);
  small.text = '看一段';
  small.position.set(28, -14);
  const big = painted(28, 0xb3261e, '#fff0c0', 5);
  big.anchor.set(0.5);
  big.text = '白拿';
  big.position.set(28, 12);
  btn.addChild(small, big);
  box.addChild(btn);
  return { box, rays, btn };
}

export type OfferHit = { kind: 'card'; i: number } | { kind: 'reroll' } | { kind: 'bonus' };

/**
 * 三选一：整局停住，三张卡摆中间。大礼包连挑两张，选完一张剩下的接着挂着。
 * 不点也会替他拿推荐的那张，倒计时按真实时间走。
 */
export class BoostOfferPanel extends PIXI.Container {
  private readonly _dim = new PIXI.Graphics();
  private readonly _body = new PIXI.Container();
  private _cards: CardView[] = [];
  private _bonus: ReturnType<typeof bonusSlab> | null = null;
  private _best = 0;
  private _t = 0;
  private _left = 0;
  private _cy = 0;
  private _rerollY = 0;
  private _canReroll = false;
  /** 看广告那会儿倒计时停住，不然看完回来已经替他拿了 */
  private _paused = false;
  private _count = painted(20, CREAM, '#1a1008', 3);

  constructor() {
    super();
    this.eventMode = 'none';
    this.visible = false;
    this.addChild(this._dim, this._body);
  }

  /**
   * 倒计时是一直留着的那一行。清卡面时先摘下来，不能跟着子节点一起销毁：
   * Pixi 销毁后 anchor 会被置空，下一回 show 再 set 就崩，整帧更新停住，卡也点不了。
   */
  private _wipeBody(): void {
    if (this._count.destroyed) this._count = painted(20, CREAM, '#1a1008', 3);
    if (this._count.parent) this._count.parent.removeChild(this._count);
    this._body.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  /**
   * 每次 offer 变了（换一批、大礼包选了第一张、立绘到了）都重画一遍，倒计时不重置。
   * `bonus` 为真才挂底下那条压箱底：广告位没开、今天看满了，场景传 false
   */
  show(state: BattleState, o: BoostOffer, viewH: number, fresh: boolean, bonus = false): void {
    this._wipeBody();
    this._dim.clear().beginFill(0x0a0604, 0.66).drawRect(0, 0, 750, viewH).endFill();
    const slab = bonus && o.bonus ? o.bonus : undefined;
    this._cy = Math.round(viewH * (slab ? 0.42 : 0.46));
    this._best = o.best;
    if (fresh) {
      this._left = OFFER_AUTO_S;
      this._t = 0;
      this._paused = false;
    }

    const title = painted(40, 0xffe08a, '#1a1008', 6);
    title.anchor.set(0.5);
    title.text = o.left > 1 ? `大礼包！连挑 ${o.left} 样` : '挑一样带上';
    title.position.set(375, this._cy - CARD_H / 2 - 92);
    this._body.addChild(title);
    const sub = painted(22, CREAM, '#1a1008', 4);
    sub.anchor.set(0.5);
    sub.text = o.big ? '大个子倒了，乡亲们凑了一大包' : `第 ${o.wave} 波要来了，乡亲们送来几样`;
    sub.position.set(375, this._cy - CARD_H / 2 - 46);
    this._body.addChild(sub);

    const n = o.cards.length;
    const total = n * CARD_W + (n - 1) * CARD_GAP;
    this._cards = o.cards.map((c, i) => {
      const v = card(state, c, i === o.best);
      v.box.position.set(375 - total / 2 + CARD_W / 2 + i * (CARD_W + CARD_GAP), this._cy);
      this._body.addChild(v.box);
      return v;
    });
    const bestBox = this._cards[o.best]?.box;
    if (bestBox && o.why) {
      const why = painted(19, 0xffe08a, '#1a1008', 4);
      why.anchor.set(0.5);
      why.text = `「${o.why}」`;
      why.position.set(bestBox.x, this._cy + CARD_H / 2 + 22);
      this._body.addChild(why);
    }

    let y = this._cy + CARD_H / 2 + 46;
    this._bonus = null;
    if (slab) {
      this._bonus = bonusSlab(state, slab);
      this._bonus.box.position.set(375, y + BONUS_H / 2);
      this._body.addChild(this._bonus.box);
      y += BONUS_H + 20;
    }

    const b = state.boost!;
    this._canReroll = !o.rerolled && b.cells >= REROLL_COST;
    this._rerollY = y + 32;
    const btn = new PIXI.Container();
    btn.position.set(375, this._rerollY);
    const g = new PIXI.Graphics();
    g.beginFill(0x2a1a10, 0.95).drawRoundedRect(-150, -32, 300, 64, 16).endFill();
    g.lineStyle(3, this._canReroll ? GOLD : 0x5a4030, 1).drawRoundedRect(-150, -32, 300, 64, 16);
    btn.addChild(g);
    fitSprite(btn, uiTex('growth_reroll'), -112, 0, 56, 50);
    const t = painted(22, this._canReroll ? 0xffe08a : DIM, '#1a1008', 4);
    t.anchor.set(0.5);
    t.text = o.rerolled ? '这回换过了' : `换一批 · ${REROLL_COST} 节电池`;
    t.position.set(18, 0);
    btn.addChild(t);
    btn.alpha = this._canReroll ? 1 : 0.7;
    this._body.addChild(btn);

    this._count.anchor.set(0.5);
    this._count.position.set(375, this._rerollY + 58);
    this._body.addChild(this._count);
    this._paintCount();
    this.visible = true;
    this._pose();
  }

  hide(): void {
    this.visible = false;
    this._paused = false;
    this._wipeBody();
    this._cards = [];
    this._bonus = null;
  }

  setPaused(on: boolean): void {
    this._paused = on;
    this._paintCount();
  }

  /** 走倒计时。到点返回 true，场景替他选推荐那张 */
  update(dt: number): boolean {
    if (!this.visible) return false;
    this._t += dt;
    if (!this._paused) {
      const was = Math.ceil(this._left);
      this._left = Math.max(0, this._left - dt);
      if (Math.ceil(this._left) !== was) this._paintCount();
    }
    this._pose();
    return !this._paused && this._left <= 0;
  }

  hit(x: number, y: number): OfferHit | null {
    if (!this.visible || this._paused) return null;
    for (let i = 0; i < this._cards.length; i += 1) {
      const c = this._cards[i]!.box;
      if (Math.abs(x - c.x) <= CARD_W / 2 && Math.abs(y - c.y) <= CARD_H / 2) return { kind: 'card', i };
    }
    const s = this._bonus?.box;
    if (s && Math.abs(x - s.x) <= BONUS_W / 2 && Math.abs(y - s.y) <= BONUS_H / 2 + 8) return { kind: 'bonus' };
    if (this._canReroll && Math.abs(x - 375) <= 160 && Math.abs(y - this._rerollY) <= 40) return { kind: 'reroll' };
    return null;
  }

  private _paintCount(): void {
    if (this._count.destroyed) return;
    this._count.text = this._paused ? '看完回来接着挑' : `${Math.ceil(this._left)} 秒后替你拿推荐的`;
  }

  private _pose(): void {
    const t = this._t;
    this._cards.forEach((c, i) => {
      const k = Math.min(1, Math.max(0, (t - i * 0.07) / 0.22));
      const pop = 0.6 + 0.4 * k + Math.sin(k * Math.PI) * 0.08;
      const bob = i === this._best ? 1 + Math.sin(t * 5) * 0.025 : 1;
      c.box.scale.set(pop * bob);
      c.box.alpha = k;
      if (c.glow) c.glow.alpha = 0.7 + 0.3 * Math.sin(t * 4 + i);
      if (c.rays) c.rays.rotation = t * 0.5;
    });
    const s = this._bonus;
    if (s) {
      const k = Math.min(1, Math.max(0, (t - 0.3) / 0.25));
      s.box.alpha = k;
      s.box.scale.set(0.85 + 0.15 * k);
      if (s.rays) s.rays.rotation = -t * 0.6;
      s.btn.scale.set(1 + Math.sin(t * 6) * 0.04);
    }
  }
}

/* ---------------- 两条竖栏 ---------------- */

export interface RailHead {
  id: string;
  def: VillagerDef;
  evo: number;
  cost: number;
  again: boolean;
  ok: boolean;
}

export interface RailView {
  cells: number;
  heads: readonly RailHead[];
  pickId: string | null;
  weld: { show: boolean; ok: boolean; cost: number; armed: boolean };
  gadgets: readonly GadgetId[];
  /** 和 gadgets 一一对应，圈的颜色跟着档次 */
  gadgetTiers: readonly Tier[];
}

export type RailHit = { kind: 'head'; id: string } | { kind: 'weld' } | { kind: 'gadget'; i: number };

const LEFT_X = 52;
const RIGHT_X = 698;
const HEAD_R = 34;
const HEAD_GAP = 100;
const GADGET_R = 36;
const GADGET_GAP = 96;
export const RAIL_HEADS_MAX = 4;

/** 全身立绘只留上半身，脸落在纸面中间 */
function guestBust(
  parent: PIXI.Container, id: string, evo: number, cx: number, cy: number, w: number, h: number,
): boolean {
  const tex = heroTex(id, evo);
  if (!tex?.baseTexture.valid || tex.width <= 1) return false;
  const spr = new PIXI.Sprite(tex);
  spr.anchor.set(0.5, 0.06);
  spr.scale.set(Math.min((w * 0.9) / tex.width, (h * 1.85) / tex.height));
  spr.position.set(cx, cy - h * 0.46);
  spr.eventMode = 'none';
  const mask = new PIXI.Graphics();
  mask.beginFill(0xffffff).drawRoundedRect(cx - w / 2, cy - h / 2, w, h, 8).endFill();
  spr.mask = mask;
  parent.addChild(spr, mask);
  return true;
}

function portrait(parent: PIXI.Container, def: VillagerDef, evo: number, r: number, dim: boolean): void {
  const bg = new PIXI.Graphics();
  bg.beginFill(dim ? 0x241a12 : 0x4a3220).drawCircle(0, 0, r).endFill();
  parent.addChild(bg);
  const tex = heroTex(def.id, evo);
  if (!tex?.baseTexture.valid || tex.width <= 1) {
    const t = painted(22, CREAM, '#1a1008', 3);
    t.anchor.set(0.5);
    t.text = def.name.slice(0, 1);
    parent.addChild(t);
    return;
  }
  const spr = new PIXI.Sprite(tex);
  spr.anchor.set(0.5, 0.16);
  spr.scale.set((r * 3.1) / tex.height);
  spr.position.set(0, -r * 0.92);
  if (dim) spr.tint = 0x777066;
  const mask = new PIXI.Graphics();
  mask.beginFill(0xffffff).drawCircle(0, 0, r - 2).endFill();
  spr.mask = mask;
  parent.addChild(spr, mask);
}

function cellIcon(parent: PIXI.Container, cx: number, cy: number, h: number): void {
  if (fitSprite(parent, uiTex('boost_cell'), cx, cy, h * 0.6, h)) return;
  const g = new PIXI.Graphics();
  g.beginFill(0x2a1a0c).drawRoundedRect(cx - h * 0.28, cy - h * 0.5, h * 0.56, h, 5).endFill();
  g.beginFill(0x7ad957).drawRoundedRect(cx - h * 0.22, cy - h * 0.44, h * 0.44, h * 0.88, 4).endFill();
  parent.addChild(g);
}

export class BoostRail extends PIXI.Container {
  private _top = 0;
  private _sig = '';
  private _view: RailView | null = null;
  private readonly _left = new PIXI.Container();
  private readonly _right = new PIXI.Container();
  private _heads: { id: string; box: PIXI.Container }[] = [];
  private _weldBox: PIXI.Container | null = null;
  private _gadgets: PIXI.Container[] = [];
  private _counter: PIXI.Container | null = null;
  private _bump = 0;
  private _t = 0;

  constructor() {
    super();
    this.eventMode = 'none';
    this.addChild(this._left, this._right);
  }

  place(top: number): void {
    this._top = top;
    this._sig = '';
  }

  /** 电池栏在哪。地上的电池收了往这儿飞 */
  cellAnchor(): { x: number; y: number } {
    return { x: LEFT_X - 14, y: this._top + 44 };
  }

  /** 收到电池时数字跳一下 */
  bump(): void {
    this._bump = 1;
  }

  sync(v: RailView): void {
    this._view = v;
    const sig = JSON.stringify([
      v.cells, v.pickId, v.weld, v.gadgets, v.gadgetTiers,
      v.heads.map((h) => `${h.id}:${h.evo}:${h.cost}:${h.ok ? 1 : 0}:${h.again ? 1 : 0}`),
    ]);
    if (sig === this._sig) return;
    this._sig = sig;
    this._left.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._right.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._heads = [];
    this._gadgets = [];
    this._weldBox = null;

    const counter = new PIXI.Container();
    counter.position.set(LEFT_X, this._top + 44);
    const plate = new PIXI.Graphics();
    plate.beginFill(0x1a1008, 0.82).drawRoundedRect(-46, -34, 92, 68, 14).endFill();
    plate.lineStyle(2, GOLD, 0.7).drawRoundedRect(-46, -34, 92, 68, 14);
    counter.addChild(plate);
    cellIcon(counter, -18, 0, 52);
    const n = painted(32, 0xb8f08a, '#1a1008', 5);
    n.anchor.set(0.5);
    n.text = String(v.cells);
    n.position.set(20, 0);
    counter.addChild(n);
    this._left.addChild(counter);
    this._counter = counter;

    v.heads.slice(0, RAIL_HEADS_MAX).forEach((h, i) => {
      const box = new PIXI.Container();
      box.position.set(LEFT_X, this._top + 140 + i * HEAD_GAP);
      portrait(box, h.def, h.evo, HEAD_R, !h.ok);
      const ring = new PIXI.Graphics();
      const picked = v.pickId === h.id;
      ring.lineStyle(picked ? 6 : 4, picked ? 0xffe08a : h.ok ? GOLD : 0x3a2a1c, 1).drawCircle(0, 0, HEAD_R + 2);
      box.addChild(ring);
      const tag = new PIXI.Container();
      tag.position.set(0, HEAD_R + 12);
      const tg = new PIXI.Graphics();
      tg.beginFill(0x1a1008, 0.9).drawRoundedRect(-30, -12, 60, 24, 8).endFill();
      tag.addChild(tg);
      cellIcon(tag, -14, 0, 20);
      const c = painted(18, h.ok ? 0xb8f08a : DIM, '#1a1008', 3);
      c.anchor.set(0.5);
      c.text = String(h.cost);
      c.position.set(10, 0);
      tag.addChild(c);
      box.addChild(tag);
      if (h.again) {
        const a = painted(15, 0xffb09a, '#1a1008', 3);
        a.anchor.set(0.5);
        a.text = '再上';
        a.position.set(0, -HEAD_R - 10);
        box.addChild(a);
      }
      this._left.addChild(box);
      this._heads.push({ id: h.id, box });
    });

    let y = this._top + 66;
    if (v.weld.show) {
      const box = new PIXI.Container();
      box.position.set(RIGHT_X, y);
      const g = new PIXI.Graphics();
      g.beginFill(0x1a1008, 0.86).drawRoundedRect(-48, -56, 96, 122, 16).endFill();
      g.lineStyle(3, v.weld.armed ? 0xffe08a : v.weld.ok ? GOLD : 0x5a4030, 1).drawRoundedRect(-48, -56, 96, 122, 16);
      box.addChild(g);
      if (!fitSprite(box, uiTex('growth_starter'), 0, -14, 82, 70)) {
        const s = painted(30, 0xffe08a, '#1a1008', 4);
        s.anchor.set(0.5);
        s.text = '焊';
        s.position.set(0, -14);
        box.addChild(s);
      }
      const t = painted(20, v.weld.ok ? 0xffe08a : DIM, '#1a1008', 4);
      t.anchor.set(0.5);
      t.text = v.weld.armed ? '点个人' : '焊一下';
      t.position.set(0, 32);
      box.addChild(t);
      const cost = new PIXI.Container();
      cost.position.set(0, 54);
      cellIcon(cost, -12, 0, 20);
      const ct = painted(16, v.weld.ok ? 0xb8f08a : DIM, '#1a1008', 3);
      ct.anchor.set(0.5);
      ct.text = String(v.weld.cost);
      ct.position.set(10, 0);
      cost.addChild(ct);
      box.addChild(cost);
      box.alpha = v.weld.ok ? 1 : 0.6;
      this._right.addChild(box);
      this._weldBox = box;
      y += 150;
    }
    v.gadgets.forEach((id, i) => {
      const box = new PIXI.Container();
      box.position.set(RIGHT_X, y + 30 + i * GADGET_GAP);
      const tier = v.gadgetTiers[i] ?? 0;
      const g = new PIXI.Graphics();
      if (tier > 0) g.lineStyle(10, TIER_GLOW[tier], 0.3).drawCircle(0, 0, GADGET_R + 5);
      g.lineStyle(0).beginFill(0x2a1a10, 0.94).drawCircle(0, 0, GADGET_R).endFill();
      g.lineStyle(tier > 0 ? 4 : 3, TIER_GLOW[tier], 1).drawCircle(0, 0, GADGET_R);
      box.addChild(g);
      const def = boostDef(id);
      fitSprite(box, uiTex(def.icon as UiName), 0, -2, GADGET_R * 1.7, GADGET_R * 1.6);
      const t = painted(14, CREAM, '#1a1008', 3);
      t.anchor.set(0.5);
      t.text = def.name;
      t.position.set(0, GADGET_R + 10);
      box.addChild(t);
      this._right.addChild(box);
      this._gadgets.push(box);
    });
  }

  update(dt: number): void {
    this._t += dt;
    this._bump = Math.max(0, this._bump - dt * 4);
    if (this._counter) this._counter.scale.set(1 + this._bump * 0.25);
    const v = this._view;
    for (const h of this._heads) {
      const head = v?.heads.find((x) => x.id === h.id);
      const live = head?.ok && (v?.pickId === h.id || !v?.pickId);
      h.box.scale.set(live ? 1 + Math.sin(this._t * 6) * 0.05 : 1);
    }
    if (this._weldBox && v?.weld.ok) this._weldBox.scale.set(1 + Math.sin(this._t * 7) * 0.07);
    this._gadgets.forEach((g, i) => g.scale.set(1 + Math.sin(this._t * 5 + i) * 0.04));
  }

  hit(x: number, y: number): RailHit | null {
    for (const h of this._heads) {
      if ((x - h.box.x) ** 2 + (y - h.box.y) ** 2 <= (HEAD_R + 20) ** 2) return { kind: 'head', id: h.id };
    }
    if (this._weldBox && Math.abs(x - this._weldBox.x) <= 52 && y >= this._weldBox.y - 60 && y <= this._weldBox.y + 70) {
      return { kind: 'weld' };
    }
    for (let i = 0; i < this._gadgets.length; i += 1) {
      const g = this._gadgets[i]!;
      if ((x - g.x) ** 2 + (y - g.y) ** 2 <= (GADGET_R + 18) ** 2) return { kind: 'gadget', i };
    }
    return null;
  }
}
