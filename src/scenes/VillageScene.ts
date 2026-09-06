/**
 * 村子：出村开打、弹弓摊、村民（进化 / 星级 / 图鉴）。
 *
 * 只有四个页面，刻意做窄。上一版的村子有七页（编队 / 图鉴 / 废品站 / 门路 /
 * 随身 / 组合），改装件下线之后其中五页失去了对象；更要紧的是**它们互相不产生关系**，
 * 玩家在里面点半天不知道自己在决定什么。§4.3 的口径是「局外只解决一件事：
 * 让手上的人变多、变强」，所以这一版只留：
 *
 * - `home`  出村铁门 + 弹弓摊 + 图鉴墙 + 能升阶木牌。**它必须一眼能出村**。
 * - `stall` 弹弓摊。弹子的唯一去处，也是村庄经验/零件/工分的唯一来源。
 * - `folks` 图鉴。已入伙的能升阶，没见过的暗着 —— 图鉴和养成是同一页，
 *           因为「我还差谁」和「我该升谁」是同一个决策。
 * - `one`   单个村民的三阶详情。升阶前要看得见「升完他会变成什么样」（§4.1）。
 *
 * 资源条常驻在村子、图鉴、详情顶上。弹弓摊改用战斗那种矮锈铁板，
 * 只叠弹子数，把门楣腾给货架。
 */
import * as PIXI from 'pixi.js';
import { EventBus } from '@/core/EventBus';
import { Game } from '@/core/Game';
import { BgmPlayer } from '@/core/BgmPlayer';
import type { Scene } from '@/core/SceneManager';
import { SceneManager } from '@/core/SceneManager';
import { TweenManager, Ease } from '@/core/TweenManager';
import { bindPointerTap } from '@/minigame';
import { UnitActor } from '@/fx/UnitActor';
import { LANE_TINT } from '@/ui/BenchDock';
import { StallYard, STALL_BG_LAY } from '@/ui/StallYard';
import {
  CALL_COST, CRAFT_MAX, craftCap, craftOf, evoOf, nextCapLv, nextFeed,
  nextVillageCost, starsOf, villageCumExp,
} from '@/balance/village';
import {
  JOB_NAME, JOBS, LANE_NAME, STAR_MAX, VILLAGERS, getVillager, jobOf,
  type Job, type VillagerDef,
} from '@/balance/villagers';
import {
  PELLET_AD, TARGETS, TARGET_UNLOCK_LV, pelletCap, pelletRegenMin,
} from '@/balance/stall';
import { getStage } from '@/balance/stages';
import { Platform } from '@/core/PlatformService';
import { track } from '@/core/Analytics';
import {
  buyEvo, callVillager, claimAdPellets, loadMemory, nextGap, nextGoal, progressOf,
  settlePellets, setStageId, shootStall, stallAdLeft, stallPityLeft,
  type Goal, type RunMemory,
} from '@/core/RunMemory';
import { playSfx } from '@/core/SfxPlayer';
import {
  addFitPortrait, fillCover, fillCoverUv, heroTex, preloadVillageArt, stallBgTex, uiTex,
  villageBgTex, villageHomeBgTex, watchArt,
  type UiName,
} from '@/core/TextureLoader';
import { lintelLay, stallHudLay, type StallHudLay } from '@/ui/lintel';
import { numGlyphs, paintGlyphs } from '@/ui/glyphs';
import {
  GOLD, copperRust, expBar, fillSprite, fitSprite, goldBtn, ironSlab, label,
  plate, standSprite, woodPlank,
} from '@/ui/paint';

const CREAM = 0xfff4c4;
const MUTED = 0x8a8a92;
const RUST_RED = 0xc43a28;

type Page = 'home' | 'stall' | 'folks' | 'one';
const PAGES: readonly Page[] = ['home', 'stall', 'folks', 'one'];

/** 村口格子。按原型：人站路中间，摊和木桩插在泥地里，铁门坐在画面底。 */
interface HomeLay {
  barBottom: number;
  title: { cx: number; cy: number; w: number; h: number };
  titleH: number;
  titleGlyphH: number;
  exp: { x: number; y: number; w: number };
  hintY: number;
  stamp: { y: number; w: number; h: number; cxs: readonly number[] };
  peopleY: number;
  peopleMid: number;
  peopleH: number;
  stall: { cx: number; cy: number; w: number; h: number };
  atlas: { x: number; y: number; w: number; h: number };
  stake: { cx: number; cy: number; w: number; h: number };
  post: { cx: number; cy: number; w: number; h: number };
  gate: { x: number; y: number; w: number; h: number };
}

function homeLay(
  safeTop: number,
  height: number,
  safeBottom: number,
  _capsuleLeft = 750,
): HomeLay {
  const {
    titleH, title, titleGlyphH: glyphH, exp, hintY, stamp, barBottom,
  } = lintelLay(safeTop, height);
  const gateH = 200;
  const gateY = height - safeBottom - gateH;
  const lift = 8;
  const atlasH = 228;
  const atlasW = 208;
  const atlas = { x: 530, y: gateY - lift - atlasH, w: atlasW, h: atlasH };
  const stallH = 236;
  const stallW = 236;
  const stall = { cx: 128, cy: gateY - lift - stallH / 2 + 14, w: stallW, h: stallH };
  const postH = 188;
  const post = { cx: 352, cy: gateY - lift - 78, w: 176, h: postH };
  const peopleH = 168;
  const propTop = Math.min(stall.cy - stallH / 2, post.cy - postH / 2, atlas.y);
  let peopleY = propTop - 88;
  if (peopleY - peopleH < barBottom + 20) peopleY = barBottom + 20 + peopleH;
  return {
    barBottom,
    title,
    titleH,
    titleGlyphH: glyphH,
    exp,
    hintY,
    stamp,
    peopleY,
    peopleMid: 375,
    peopleH,
    stall,
    atlas,
    stake: { cx: atlas.x + atlas.w / 2, cy: atlas.y + atlas.h - 6, w: 148, h: 90 },
    post,
    gate: { x: 16, y: gateY, w: 718, h: gateH },
  };
}

function stars(n: number): string {
  return n > 0 ? `★${n}` : '';
}

/**
 * 资源数字。400 关的跑道后期废铁能到几十万，六位数会把铁牌撑爆，
 * 所以过万就折成「12.3万」。数字牌上的漆字只有 0~9，带汉字的退回系统字。
 */
function compactNum(n: number): string {
  const v = Math.floor(Math.max(0, n));
  if (v < 10_000) return `${v}`;
  if (v < 100_000_000) {
    const w = v / 10_000;
    return `${w < 100 ? Math.round(w * 10) / 10 : Math.round(w)}万`;
  }
  return `${Math.round((v / 100_000_000) * 10) / 10}亿`;
}

function evoName(v: VillagerDef, stage: number): string {
  return v.evo[Math.max(0, Math.min(2, stage - 1))]!.name;
}

function painted(size: number, color: number, rim = '#1a1008', thick = 4): PIXI.Text {
  const t = label(size, color, true);
  t.style.stroke = rim;
  t.style.strokeThickness = thick;
  return t;
}

/** 粉笔字：没有描边，略歪，叠在黑板上才像写上去的。 */
function chalked(size: number, color = 0xf0e6c0, tilt = -0.03): PIXI.Text {
  const t = label(size, color, true);
  t.style.strokeThickness = 0;
  t.rotation = tilt;
  return t;
}

/** 贴图里一块写字 / 放人的区域。xywh 都是 0–1，相对整张贴图左上。 */
interface UvBox { x: number; y: number; w: number; h: number }

/** stall_chalk：发数跟贴图里「弹弓摊」同一水平中心，落在标题底下空着的那半块。 */
const STALL_SHOTS: UvBox = { x: 0.18, y: 0.40, w: 0.36, h: 0.16 };
/** stage_post：两行收在整块横牌正中，不要各贴上下沿。 */
const POST_TOP: UvBox = { x: 0.20, y: 0.185, w: 0.56, h: 0.11 };
const POST_BOT: UvBox = { x: 0.20, y: 0.295, w: 0.56, h: 0.11 };
/** rust_atlas：顶栏 + 量过的 2×2 暗格。 */
const ATLAS_HEADER: UvBox = { x: 0.16, y: 0.08, w: 0.68, h: 0.15 };
const ATLAS_SLOTS: readonly UvBox[] = [
  { x: 0.128, y: 0.275, w: 0.338, h: 0.248 },
  { x: 0.536, y: 0.283, w: 0.327, h: 0.240 },
  { x: 0.134, y: 0.581, w: 0.332, h: 0.252 },
  { x: 0.536, y: 0.569, w: 0.333, h: 0.264 },
];
/** home_stake：横木牌面（避开箭头尖和土堆）。 */
const STAKE_FACE: UvBox = { x: 0.16, y: 0.26, w: 0.56, h: 0.20 };

function faceOf(
  spr: PIXI.Sprite | null,
  boxW: number,
  boxH: number,
  u: UvBox,
): { x: number; y: number; w: number; h: number } {
  const bw = spr?.width ?? boxW;
  const bh = spr?.height ?? boxH;
  const ox = spr?.x ?? 0;
  const oy = spr?.y ?? 0;
  return {
    x: ox - bw / 2 + u.x * bw,
    y: oy - bh / 2 + u.y * bh,
    w: u.w * bw,
    h: u.h * bh,
  };
}

function putCentered(
  parent: PIXI.Container,
  t: PIXI.Text,
  r: { x: number; y: number; w: number; h: number },
): void {
  t.anchor.set(0.5);
  t.position.set(r.x + r.w / 2, r.y + r.h / 2);
  parent.addChild(t);
}

function lvGlyphs(lv: number): UiName[] {
  return ['paint_cunzi', ...numGlyphs(lv), 'paint_ji'];
}

export class VillageScene implements Scene {
  readonly name = 'village';
  readonly container = new PIXI.Container();

  private readonly _layers = {} as Record<Page, PIXI.Container>;
  private _page: Page = 'home';
  private _mem: RunMemory = loadMemory();
  /** `one` 页看的是谁 */
  private _focus = '';
  /** 图鉴按对外三种力滤 */
  private _jobFilter: Job | 'all' = 'all';
  private _adBusy = false;
  private _actors: UnitActor[] = [];
  /** 刚喊来的新人。回村口时从村道右边走进来 */
  private _arrive = '';
  private readonly _yard = new StallYard(() => this._shoot());
  private _artTimer: ReturnType<typeof setTimeout> | 0 = 0;

  constructor() {
    for (const p of PAGES) {
      const layer = new PIXI.Container();
      layer.visible = false;
      this.container.addChild(layer);
      this._layers[p] = layer;
    }
    EventBus.on('home:refresh', () => {
      if (SceneManager.current?.name !== 'village') return;
      this._mem = loadMemory();
      this._render();
    });
    watchArt(() => {
      if (this._artTimer) clearTimeout(this._artTimer);
      this._artTimer = setTimeout(() => {
        this._artTimer = 0;
        if (SceneManager.current?.name === 'village') this._render();
      }, 220);
    });
  }

  onEnter(): void {
    preloadVillageArt();
    // 进村先把离线攒的弹子结算掉，玩家一眼看见「有多少发可以打」
    this._mem = settlePellets();
    this._page = 'home';
    this._adBusy = false;
    this._arrive = '';
    BgmPlayer.play('home');
    this._render();
  }

  onExit(): void {
    if (this._artTimer) clearTimeout(this._artTimer);
    this._artTimer = 0;
    this._clearActors();
    this._yard.sleep();
    if (this._yard.parent) this._yard.parent.removeChild(this._yard);
    BgmPlayer.stop();
  }

  update(dt: number): void {
    for (const a of this._actors) a.update(dt);
  }

  private _height(): number {
    // 跟战斗场景同一条：真机可用高是 logicHeight，designHeight 是写死的 1334
    return Game.logicHeight;
  }

  private _clearActors(): void {
    for (const a of this._actors) a.destroy();
    this._actors = [];
  }

  private _open(page: Page): void {
    this._page = page;
    playSfx('ui_tap', 0);
    this._render();
  }

  /* ---------------- 渲染总入口 ---------------- */

  private _render(): void {
    this._clearActors();
    if (this._page !== 'stall') {
      this._yard.sleep();
      if (this._yard.parent) this._yard.parent.removeChild(this._yard);
    }
    for (const p of PAGES) {
      const layer = this._layers[p];
      layer.visible = p === this._page;
      if (p !== this._page) continue;
      layer.removeChildren().forEach((c) => {
        if (c === this._yard) return;
        c.destroy({ children: true });
      });
    }
    const layer = this._layers[this._page];
    if (this._page === 'home') this._renderHome(layer);
    if (this._page === 'stall') this._renderStall(layer);
    if (this._page === 'folks') this._renderFolks(layer);
    if (this._page === 'one') this._renderOne(layer);
  }

  /* ---------------- 公共零件 ---------------- */

  private _paintStallRoom(layer: PIXI.Container, y0: number, y1: number): void {
    const g = new PIXI.Graphics();
    const h = Math.max(80, y1 - y0);
    const art = stallBgTex();
    if (art && art.baseTexture.valid && art.width > 1) {
      fillCoverUv(
        g, art, 0, y0, 750, h,
        { y: STALL_BG_LAY.uvY, h: STALL_BG_LAY.uvH },
        STALL_BG_LAY.alignY,
      );
    } else {
      g.beginFill(0x3a2414).drawRect(0, y0, 750, h).endFill();
      g.beginFill(0x2a4a6a, 0.35).drawRect(0, y0 + h * 0.62, 750, h * 0.38).endFill();
    }
    layer.addChild(g);
  }

  private _backdrop(layer: PIXI.Container, art = villageBgTex(), dim = 0.22): void {
    const g = new PIXI.Graphics();
    const h = this._height();
    if (art && art.baseTexture.valid && art.width > 1) {
      fillCover(g, art, 0, 0, 750, h);
      g.beginFill(0x0c0a08, dim).drawRect(0, 0, 750, h).endFill();
    } else {
      g.beginFill(0x2a2018).drawRect(0, 0, 750, h).endFill();
    }
    layer.addChild(g);
  }

  /**
   * 顶上的村子牌 + 四种资源章。
   *
   * 四种货币一个都不许省。§5 定死只有这四种，代价就是它们**全都要常驻可见**。
   * 废铁 / 零件 / 工分是账本，不是门；升阶走「能升阶」，喊人走图鉴。
   * 弹子除外：点它进弹弓摊，那是它唯一的去处。
   */
  private _bar(layer: PIXI.Container): number {
    const lay = homeLay(Game.safeTop, this._height(), Game.safeBottom, Game.safeCapsuleLeft);
    const lv = this._mem.villageLv;
    const need = nextVillageCost(lv);
    const into = this._mem.villageExp - villageCumExp(lv);

    const lintelH = lay.titleH;
    const lintelOn = !!fillSprite(layer, uiTex('top_lintel'), 375, lintelH / 2, 750, lintelH);
    if (!lintelOn) {
      const g = new PIXI.Graphics();
      ironSlab(g, 0, 0, 750, lintelH, 0);
      layer.addChild(g);
    }

    if (!paintGlyphs(layer, lvGlyphs(lv), 375, lay.title.cy, lay.titleGlyphH, 8)) {
      const lvTx = painted(42, GOLD, '#1a1008', 6);
      lvTx.anchor.set(0.5);
      lvTx.position.set(375, lay.title.cy);
      lvTx.text = `村子 ${lv} 级`;
      layer.addChild(lvTx);
    }

    const bar = new PIXI.Graphics();
    const ratio = need === undefined ? 1 : into / need;
    if (lintelOn) {
      const fill = need === undefined ? lay.exp.w : Math.max(0, Math.min(1, ratio)) * lay.exp.w;
      if (fill > 0) {
        bar.beginFill(need === undefined ? 0x9be08a : GOLD, 0.95)
          .drawRoundedRect(lay.exp.x, lay.exp.y, fill, 10, 5)
          .endFill();
      }
    } else {
      this._skin(layer, 'rust_exp', lay.exp.x + lay.exp.w / 2, lay.exp.y + 6, lay.exp.w + 24, 22, () => { /* 轨道没来就只画金条 */ });
      expBar(bar, lay.exp.x, lay.exp.y, lay.exp.w, ratio, need === undefined);
    }
    layer.addChild(bar);

    const hint = label(16, CREAM, true);
    hint.anchor.set(0.5, 0);
    hint.position.set(375, lay.hintY);
    hint.text = villageNeedText(this._mem);
    layer.addChild(hint);

    const cells: readonly [UiName, number, 'icon_scrap' | 'icon_parts' | 'icon_credits' | 'icon_pellets', string, (() => void) | null][] = [
      ['paint_scrap', this._mem.scrap, 'icon_scrap', '废铁', null],
      ['paint_parts', this._mem.parts, 'icon_parts', '零件', null],
      ['paint_credits', this._mem.credits, 'icon_credits', '工分', null],
      ['paint_pellets', this._mem.pellets, 'icon_pellets', '弹子', () => this._open('stall')],
    ];
    const sw = lay.stamp.w;
    const sh = lay.stamp.h;
    const iconS = Math.round(Math.min(32, sh * 0.36));
    const nameH = Math.round(Math.min(16, sh * 0.20));
    const numH = Math.round(Math.min(22, sh * 0.26));
    cells.forEach(([nameArt, val, icon, name, onTap], i) => {
      const cx = lay.stamp.cxs[i] ?? 375;
      const box = onTap
        ? this._hit(layer, cx, lay.stamp.y, sw, sh, onTap)
        : (() => {
          const c = new PIXI.Container();
          c.position.set(cx, lay.stamp.y);
          c.eventMode = 'none';
          layer.addChild(c);
          return c;
        })();
      if (!lintelOn) {
        this._skin(box, 'rust_stamp', 0, 0, sw, sh, (g) => {
          ironSlab(g, -sw / 2, -sh / 2, sw, sh, 9);
        });
      }
      const iconY = -sh * 0.22;
      if (!fitSprite(box, uiTex(icon), 0, iconY, iconS, iconS) && icon === 'icon_scrap') {
        fitSprite(box, uiTex('scrap_pile'), 0, iconY, iconS, iconS);
      }
      const nameY = sh * 0.08;
      if (!paintGlyphs(box, [nameArt], 0, nameY, nameH, 2)) {
        const nm = label(14, MUTED, true);
        nm.anchor.set(0.5);
        nm.position.set(0, nameY);
        nm.text = name;
        box.addChild(nm);
      }
      const numY = sh * 0.32;
      const shown = compactNum(val);
      const plain = /^\d+$/.test(shown);
      if (!plain || !paintGlyphs(box, numGlyphs(val), 0, numY, numH, 1)) {
        const v = label(plain ? 22 : 20, CREAM, true);
        v.anchor.set(0.5);
        v.position.set(0, numY);
        v.text = shown;
        box.addChild(v);
      }
    });

    return lay.barBottom;
  }

  private _hit(
    layer: PIXI.Container,
    cx: number,
    cy: number,
    w: number,
    h: number,
    onTap: () => void,
  ): PIXI.Container {
    const box = new PIXI.Container();
    box.eventMode = 'static';
    box.interactiveChildren = false;
    box.position.set(cx, cy);
    box.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
    bindPointerTap(box, onTap);
    layer.addChild(box);
    return box;
  }

  /** 先铺锈铁贴图，贴图没来才退回色块。村口不许再用扁色块当主皮。 */
  private _skin(
    parent: PIXI.Container,
    name: UiName,
    cx: number,
    cy: number,
    w: number,
    h: number,
    fallback: (g: PIXI.Graphics) => void,
    contain = false,
  ): void {
    if (contain) {
      if (fitSprite(parent, uiTex(name), cx, cy, w, h)) return;
    } else if (fillSprite(parent, uiTex(name), cx, cy, w, h)) {
      return;
    }
    const g = new PIXI.Graphics();
    fallback(g);
    parent.addChild(g);
  }

  private _openReadyOrFolks(): void {
    const ready = readyEvo(this._mem);
    if (ready.length === 1) {
      this._focus = ready[0]!;
      this._open('one');
      return;
    }
    this._open('folks');
  }

  private _btn(
    layer: PIXI.Container,
    cx: number,
    cy: number,
    w: number,
    h: number,
    text: string,
    onTap: () => void,
    opts: { sub?: string; enabled?: boolean; art?: UiName } = {},
  ): PIXI.Container {
    const on = opts.enabled !== false;
    const box = new PIXI.Container();
    box.eventMode = on ? 'static' : 'none';
    box.interactiveChildren = false;
    box.position.set(cx, cy);
    box.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);

    const art = opts.art ?? 'rust_btn';
    if (!fillSprite(box, uiTex(art), 0, 0, w, h) && !fitSprite(box, uiTex(art), 0, 0, w, h)) {
      const g = new PIXI.Graphics();
      goldBtn(g, -w / 2, -h / 2, w, h);
      box.addChild(g);
    }
    const t = label(opts.sub ? 26 : 28, on ? CREAM : MUTED, true);
    t.anchor.set(0.5);
    t.position.set(0, opts.sub ? -12 : 0);
    t.text = text;
    box.addChild(t);
    if (opts.sub) {
      const s = label(16, on ? GOLD : MUTED, true);
      s.anchor.set(0.5);
      s.position.set(0, 16);
      s.text = opts.sub;
      box.addChild(s);
    }
    box.alpha = on ? 1 : 0.55;
    if (on) bindPointerTap(box, onTap);
    layer.addChild(box);
    return box;
  }

  private _back(layer: PIXI.Container, to: Page = 'home'): void {
    const y = this._height() - Game.safeBottom - 52;
    this._btn(layer, 375, y, 260, 76, '回村口', () => this._open(to));
  }

  /* ---------------- 主页 ---------------- */

  private _renderHome(layer: PIXI.Container): void {
    this._backdrop(layer, villageHomeBgTex() ?? villageBgTex(), 0.06);
    this._bar(layer);
    const lay = homeLay(Game.safeTop, this._height(), Game.safeBottom, Game.safeCapsuleLeft);
    this._homePeople(layer, lay);
    this._homePost(layer, lay);
    this._homeStall(layer, lay);
    this._homeAtlas(layer, lay);
    this._homeStake(layer, lay);
    this._homeGate(layer, lay);
  }

  private _homePeople(layer: PIXI.Container, lay: HomeLay): void {
    const mem = this._mem;
    const p = progressOf(mem);
    const arrive = this._arrive;
    this._arrive = '';
    const front = yardPeople(mem, arrive);
    const slots = yardSlots(front.length, lay.peopleMid, lay.peopleY);
    front.forEach((id, i) => {
      const v = getVillager(id);
      const slot = slots[i] ?? { x: lay.peopleMid, y: lay.peopleY };
      const a = new UnitActor();
      a.bindHero(v.id, v.lane, evoOf(p, id), false);
      if (id === arrive) {
        a.place(820, slot.y, lay.peopleH);
        a.faceToward(slot.x);
        a.walkBob = true;
        const hold = { x: 820 };
        TweenManager.to({
          target: hold,
          props: { x: slot.x },
          duration: 0.9,
          ease: Ease.easeOutCubic,
          onUpdate: () => a.place(hold.x, slot.y, lay.peopleH),
          onComplete: () => { a.walkBob = false; },
        });
      } else {
        a.place(slot.x, slot.y, lay.peopleH);
      }
      a.view.eventMode = 'static';
      a.view.interactiveChildren = false;
      a.view.hitArea = new PIXI.Rectangle(-48, -lay.peopleH - 4, 96, lay.peopleH + 10);
      bindPointerTap(a.view, () => {
        this._focus = id;
        this._open('one');
      });
      layer.addChild(a.view);
      this._actors.push(a);
    });
  }

  private _homeStall(layer: PIXI.Container, lay: HomeLay): void {
    const { cx, cy, w, h } = lay.stall;
    const box = this._hit(layer, cx, cy, w, h, () => this._open('stall'));
    const spr = fitSprite(box, uiTex('stall_chalk'), 0, 0, w, h)
      || fitSprite(box, uiTex('home_stall'), 0, 8, w, h);
    if (!spr) {
      const g = new PIXI.Graphics();
      woodPlank(g, -78, -64, 156, 110, 8);
      box.addChild(g);
      const t = chalked(22);
      t.text = '弹弓摊';
      putCentered(box, t, { x: -70, y: -58, w: 140, h: 48 });
    }
    const s = chalked(20);
    s.text = `${this._mem.pellets}发`;
    putCentered(box, s, faceOf(spr, w, h, STALL_SHOTS));
  }

  private _homeAtlas(layer: PIXI.Container, lay: HomeLay): void {
    const { x, y, w, h } = lay.atlas;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const box = this._hit(layer, cx, cy, w, h, () => this._open('folks'));
    const spr = fitSprite(box, uiTex('rust_atlas'), 0, 0, w, h);
    if (!spr) {
      this._skin(box, 'rust_atlas', 0, 0, w, h, (g) => {
        ironSlab(g, -w / 2, -h / 2, w, h, 12);
        copperRust(g, -w / 2 + 10, -h / 2 + 10, w - 20, h - 20);
      });
    }
    const head = faceOf(spr, w, h, ATLAS_HEADER);
    const title = painted(22, GOLD, '#1a1008', 4);
    title.anchor.set(0, 0.5);
    title.position.set(head.x + head.w * 0.06, head.y + head.h / 2);
    title.text = '图鉴';
    box.addChild(title);
    const count = label(16, CREAM, true);
    count.anchor.set(1, 0.5);
    count.position.set(head.x + head.w * 0.94, head.y + head.h / 2);
    count.text = `${this._mem.roster.length}/${VILLAGERS.length}`;
    box.addChild(count);

    const faces = atlasFaces(this._mem);
    faces.forEach((id, i) => {
      const u = ATLAS_SLOTS[i];
      if (!u) return;
      const r = faceOf(spr, w, h, u);
      if (id) {
        const tex = heroTex(id, evoOf(progressOf(this._mem), id));
        if (tex) addFitPortrait(box, tex, r.x, r.y, r.w, r.h, 5, 'center');
      } else {
        const q = label(18, MUTED, true);
        q.anchor.set(0.5);
        q.position.set(r.x + r.w / 2, r.y + r.h / 2);
        q.text = '???';
        box.addChild(q);
      }
    });
  }

  /** 木桩就是「下一步」这个按钮：写着该干什么，点了就带你去干 */
  private _homeStake(layer: PIXI.Container, lay: HomeLay): void {
    const goal = nextGoal(this._mem);
    const { cx, cy, w, h } = lay.stake;
    const box = this._hit(layer, cx, cy, w, h, () => this._goGoal(goal));
    const spr = fitSprite(box, uiTex('home_stake'), 0, 0, w, h);
    if (!spr) {
      this._skin(box, 'wood_sign', 0, 0, w, h, (g) => {
        woodPlank(g, -w / 2, -h / 2, w, h, 7);
      });
    }
    const t = painted(16, goal.kind === 'done' ? MUTED : GOLD, '#1a1008', 4);
    t.text = goal.short;
    putCentered(box, t, faceOf(spr, w, h, STAKE_FACE));
  }

  private _goGoal(goal: Goal): void {
    // 回头刷星：直接把路牌拨到下一关没打利索的，省得一格一格挪过去
    if (goal.kind === 'stars') {
      const to = nextGap(this._mem, this._mem.stageId);
      if (to !== undefined) {
        this._mem = setStageId(to);
        Platform.showToast(`${getStage(to).label} 还没打利索`);
        this._render();
      }
      return;
    }
    this._openReadyOrFolks();
  }

  private _homePost(layer: PIXI.Container, lay: HomeLay): void {
    const mem = this._mem;
    const stage = getStage(mem.stageId);
    const { cx, cy, w, h } = lay.post;
    const box = new PIXI.Container();
    box.position.set(cx, cy);
    box.eventMode = 'static';
    box.interactiveChildren = false;
    box.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
    const spr = fitSprite(box, uiTex('stage_post'), 0, 0, w, h)
      || fitSprite(box, uiTex('home_post'), 0, 0, w, h);
    if (!spr) {
      this._skin(box, 'wood_sign', 0, 8, w, 56, (g) => {
        woodPlank(g, -w / 2, -28, w, 56, 7);
      });
    }
    // 星评画在路牌上。数据一直存着（stageStars），以前没有任何界面读它，
    // 于是「回去把这关打利索」这条长线对玩家不存在
    const best = mem.stageStars[mem.stageId] ?? 0;
    const id = painted(best > 0 ? 15 : 17, CREAM, '#2a1608', 4);
    id.text = best > 0
      ? `${stage.label} ${'★'.repeat(best)}${'☆'.repeat(3 - best)}`
      : stage.label;
    putCentered(box, id, faceOf(spr, w, h, POST_TOP));
    const nm = painted(16, CREAM, '#2a1608', 3);
    nm.text = stage.name;
    putCentered(box, nm, faceOf(spr, w, h, POST_BOT));
    if (mem.stageTop > 1) {
      bindPointerTap(box, (dx) => {
        if (dx < cx && mem.stageId > 1) {
          this._mem = setStageId(mem.stageId - 1);
          this._render();
        } else if (dx >= cx && mem.stageId < mem.stageTop) {
          this._mem = setStageId(Math.min(mem.stageTop, mem.stageId + 1));
          this._render();
        }
      });
    }
    layer.addChild(box);
  }

  private _homeGate(layer: PIXI.Container, lay: HomeLay): void {
    const { x, y, w, h } = lay.gate;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const box = this._hit(layer, cx, cy, w, h, () => {
      SceneManager.switchTo('battle', { stageId: this._mem.stageId });
    });
    const paintedOn = fillSprite(box, uiTex('gate_chu'), 0, 0, w, h)
      || fitSprite(box, uiTex('gate_chu'), 0, 0, w, h);
    if (!paintedOn) {
      this._skin(box, 'rust_gate', 0, 0, w, h, (g) => {
        const gap = 6;
        const dw = (w - gap) / 2;
        ironSlab(g, -w / 2, -h / 2, dw, h, 10);
        ironSlab(g, -w / 2 + dw + gap, -h / 2, dw, h, 10);
        copperRust(g, -w / 2 + 10, -h / 2 + 12, dw - 20, h - 24);
      }, true);
      const t = painted(68, RUST_RED, '#1a1008', 8);
      t.anchor.set(0.5);
      t.text = '出村';
      box.addChild(t);
    }
  }

  /* ---------------- 弹弓摊 ---------------- */

  private _renderStall(layer: PIXI.Container): void {
    const h = this._height();
    const chrome = stallHudLay(Game.safeTop, h);
    const roomTop = Math.round(chrome.barBottom - 16);
    const roomBottom = h - Game.safeBottom - 148;
    const behind = new PIXI.Graphics();
    behind.beginFill(0x140e0a).drawRect(0, 0, 750, chrome.titleH).endFill();
    layer.addChild(behind);
    this._paintStallRoom(layer, roomTop, roomBottom);
    this._paintStallHud(layer, chrome);
    const mem = this._mem;

    const open = new Set(
      TARGETS.filter((t) => mem.villageLv >= (TARGET_UNLOCK_LV[t.id] ?? 1)).map((t) => t.id),
    );
    const floor = h - Game.safeBottom - 168;
    if (!this._yard.busy) this._yard.mount(open, roomTop, roomBottom, floor);
    this._yard.visible = true;
    this._yard.setCanPull(mem.pellets > 0 && !this._yard.busy);
    layer.addChild(this._yard);

    const btnY = h - Game.safeBottom - 72;
    const adLeft = stallAdLeft();
    this._btn(layer, 220, btnY, 240, 76, '看一段', () => { void this._adPellets(); }, {
      sub: adLeft > 0 ? `+${PELLET_AD} 发 · 剩 ${adLeft} 次` : '今天看完了',
      enabled: adLeft > 0 && !this._adBusy && !this._yard.busy,
    });
    this._btn(layer, 530, btnY, 240, 76, '回村口', () => this._open('home'), {
      enabled: !this._yard.busy,
    });
  }

  /** 跟战斗一样：空锈铁板铺满顶，弹子数和提示另叠上去。 */
  private _paintStallHud(layer: PIXI.Container, chrome: StallHudLay): void {
    if (!fillSprite(layer, uiTex('battle_lintel'), 375, chrome.titleH / 2, 750, chrome.titleH)) {
      const g = new PIXI.Graphics();
      ironSlab(g, 0, 0, 750, chrome.titleH, 0);
      layer.addChild(g);
    }
    const n = this._mem.pellets;
    const cap = pelletCap(this._mem.villageLv);
    if (!this._drawStallTitle(layer, chrome, n, cap)) {
      const title = painted(28, GOLD, '#1a1008', 6);
      title.anchor.set(0.5);
      title.position.set(chrome.title.cx, chrome.title.cy);
      title.text = `手上 ${n}/${cap} 发`;
      layer.addChild(title);
    }
    const pity = painted(16, 0xd9a13b, '#1a1008', 4);
    pity.anchor.set(0.5);
    pity.position.set(375, chrome.hintY);
    pity.text = this._mem.pellets >= cap
      ? `满了 · 再 ${stallPityLeft(this._mem)} 发必出 1 工分`
      : `${pelletRegenMin(this._mem.villageLv)} 分钟回一发 · 再 ${stallPityLeft(this._mem)} 发必出工分`;
    layer.addChild(pity);
  }

  private _drawStallTitle(
    layer: PIXI.Container,
    chrome: StallHudLay,
    n: number,
    cap: number,
  ): boolean {
    const pellets = uiTex('paint_pellets');
    const left = numGlyphs(n);
    const right = numGlyphs(cap);
    const names = [...left, ...right];
    const texs = names.map((id) => uiTex(id));
    if (!pellets?.baseTexture.valid || pellets.width <= 1) return false;
    if (texs.some((t) => !t?.baseTexture.valid || t.width <= 1)) return false;
    const h = chrome.titleGlyphH;
    const cy = chrome.title.cy;
    const gap = 6;
    const slashW = h * 0.28;
    const pW = (pellets.width / pellets.height) * h;
    const ws = texs.map((t) => (t!.width / t!.height) * h);
    const leftW = ws.slice(0, left.length).reduce((s, w) => s + w, 0)
      + gap * Math.max(0, left.length - 1);
    const rightW = ws.slice(left.length).reduce((s, w) => s + w, 0)
      + gap * Math.max(0, right.length - 1);
    const total = pW + gap + leftW + slashW + rightW + gap * 2;
    let x = chrome.title.cx - total / 2;
    fitSprite(layer, pellets, x + pW / 2, cy, pW, h);
    x += pW + gap;
    texs.slice(0, left.length).forEach((t, i) => {
      fitSprite(layer, t, x + ws[i]! / 2, cy, ws[i]!, h);
      x += ws[i]! + gap;
    });
    const slash = painted(Math.round(h * 0.72), GOLD, '#1a1008', 3);
    slash.anchor.set(0.5);
    slash.position.set(x + slashW / 2, cy);
    slash.text = '/';
    layer.addChild(slash);
    x += slashW + gap;
    texs.slice(left.length).forEach((t, i) => {
      const w = ws[left.length + i]!;
      fitSprite(layer, t, x + w / 2, cy, w, h);
      x += w + gap;
    });
    return true;
  }

  private _shoot(): void {
    if (this._yard.busy) return;
    const res = shootStall();
    if (!res) {
      Platform.showToast('没弹子了，等等或者看一段');
      this._yard.setCanPull(false);
      return;
    }
    this._mem = res.mem;
    const { hit, gain, rebounds } = res.result;
    const parts: string[] = [];
    if (gain.exp > 0) parts.push(`经验 +${Math.round(gain.exp)}`);
    if (gain.scrap > 0) parts.push(`废铁 +${Math.round(gain.scrap)}`);
    if (gain.parts > 0) parts.push(`零件 +${Math.round(gain.parts)}`);
    if (gain.credits > 0) parts.push(`工分 +${Math.round(gain.credits)}`);
    track('stall_shot', {
      target: hit.id, rebounds, village_lv: this._mem.villageLv, left: this._mem.pellets,
    });
    this._yard.setCanPull(this._mem.pellets > 0);
    this._yard.play(res.result, parts, () => this._render());
  }

  private async _adPellets(): Promise<void> {
    if (this._adBusy) return;
    this._adBusy = true;
    try {
      track('ad_show', { placement: 'stallPellets' });
      const ok = await Platform.showRewardedVideo();
      track('ad_close', { placement: 'stallPellets', completed: ok });
      if (!ok) {
        Platform.showToast('没看完，没给弹子');
        return;
      }
      const mem = claimAdPellets();
      if (!mem) {
        Platform.showToast('今天的次数用完了');
        return;
      }
      this._mem = mem;
      Platform.showToast(`弹子 +${PELLET_AD}`, 'success');
    } finally {
      this._adBusy = false;
      this._render();
    }
  }

  /* ---------------- 村民 ---------------- */

  private _renderFolks(layer: PIXI.Container): void {
    this._backdrop(layer, villageBgTex(), 0.12);
    const top = this._bar(layer);
    const mem = this._mem;
    const p = progressOf(mem);
    const owned = new Set(mem.roster);
    const seen = new Set(mem.seenIds);
    const backY = this._height() - Game.safeBottom - 52;

    // 奶油铜牌按原图比例钉，不再拉扁。图鉴 8/20 那行不占位置
    const enough = mem.credits >= CALL_COST;
    const shoutW = 400;
    const shoutH = Math.round(shoutW * 212 / 315);
    const shoutCy = top + 16 + shoutH / 2;
    const shout = new PIXI.Container();
    shout.position.set(375, shoutCy);
    shout.eventMode = enough ? 'static' : 'none';
    shout.interactiveChildren = false;
    shout.hitArea = new PIXI.Rectangle(-shoutW / 2, -shoutH / 2, shoutW, shoutH);
    shout.alpha = enough ? 1 : 0.62;
    const pad = new PIXI.Graphics();
    pad.beginFill(0xe8d09a).drawRoundedRect(-shoutW / 2 + 28, -shoutH / 2 + 32, shoutW - 56, shoutH - 64, 16).endFill();
    shout.addChild(pad);
    this._skin(shout, 'play_plate', 0, 0, shoutW, shoutH, (g) => {
      goldBtn(g, -shoutW / 2, -shoutH / 2, shoutW, shoutH);
    });
    const shoutTitle = painted(36, 0x2a160c, '#fff4c4', 5);
    shoutTitle.anchor.set(0.5);
    shoutTitle.position.set(0, -18);
    shoutTitle.text = '喊一嗓子';
    shout.addChild(shoutTitle);
    const shoutSub = painted(22, 0x6a3a14, '#fff4c4', 4);
    shoutSub.anchor.set(0.5);
    shoutSub.position.set(0, 20);
    shoutSub.text = `${CALL_COST} 工分 · 手上 ${mem.credits}`;
    shout.addChild(shoutSub);
    if (enough) bindPointerTap(shout, () => this._call());
    layer.addChild(shout);

    const shoutHint = painted(16, GOLD, '#1a1008', 4);
    shoutHint.anchor.set(0.5, 0);
    shoutHint.position.set(375, shoutCy + shoutH / 2 + 4);
    shoutHint.text = '喊到熟人加星，新人从村道走过来';
    layer.addChild(shoutHint);

    const chipY = shoutCy + shoutH / 2 + 36;
    const chips: readonly { id: Job | 'all'; name: string }[] = [
      { id: 'all', name: '全部' },
      ...JOBS.map((j) => ({ id: j, name: JOB_NAME[j] })),
    ];
    chips.forEach((c, i) => {
      const cx = 94 + i * 188;
      const on = this._jobFilter === c.id;
      const box = new PIXI.Container();
      box.position.set(cx, chipY);
      box.eventMode = 'static';
      box.interactiveChildren = false;
      box.hitArea = new PIXI.Rectangle(-84, -18, 168, 36);
      const g = new PIXI.Graphics();
      g.beginFill(on ? 0xc4703a : 0x3a2a1c, on ? 0.95 : 0.72)
        .drawRoundedRect(-84, -18, 168, 36, 10).endFill();
      box.addChild(g);
      const t = painted(18, on ? CREAM : MUTED, '#1a1008', 3);
      t.anchor.set(0.5);
      t.text = c.name;
      box.addChild(t);
      bindPointerTap(box, () => {
        this._jobFilter = c.id;
        this._render();
      });
      layer.addChild(box);
    });

    // 4 列。滤完人少就收行，卡是锈铁砖，人站全身静帧
    const shown = VILLAGERS.filter((v) => this._jobFilter === 'all' || jobOf(v.role) === this._jobFilter);
    const cols = 4;
    const rows = Math.max(1, Math.ceil(shown.length / cols));
    const side = 18;
    const gap = 8;
    const gridTop = chipY + 28;
    const gridBot = backY - 54;
    const cardW = (750 - side * 2 - gap * (cols - 1)) / cols;
    const cardH = Math.max(118, (gridBot - gridTop - gap * (rows - 1)) / rows);
    const pick = owned.has(this._focus)
      ? this._focus
      : (shown.find((x) => owned.has(x.id))?.id ?? '');

    shown.forEach((v, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = side + col * (cardW + gap);
      const y = gridTop + row * (cardH + gap);
      const has = owned.has(v.id);
      const known = has || seen.has(v.id);
      const job = JOB_NAME[jobOf(v.role)];

      const box = new PIXI.Container();
      box.eventMode = has ? 'static' : 'none';
      box.interactiveChildren = false;
      box.position.set(x, y);
      box.hitArea = new PIXI.Rectangle(0, 0, cardW, cardH);

      this._skin(box, 'rust_tile', cardW / 2, cardH / 2, cardW, cardH, (g) => {
        ironSlab(g, 0, 0, cardW, cardH, 10);
      });
      const shade = new PIXI.Graphics();
      shade.beginFill(0x0a0604, 0.42).drawRoundedRect(4, cardH - 46, cardW - 8, 42, 8).endFill();
      box.addChild(shade);
      const lane = new PIXI.Graphics();
      lane.beginFill(LANE_TINT[v.lane], has ? 0.55 : 0.16)
        .drawRoundedRect(8, 7, cardW - 16, 5, 2).endFill();
      box.addChild(lane);

      const faceH = cardH - 58;
      const face = fitSprite(
        box, heroTex(v.id, has ? evoOf(p, v.id) : 1),
        cardW / 2, 12 + faceH / 2, cardW - 18, faceH,
      );
      if (face && !has) {
        face.tint = 0x16120e;
        face.alpha = 0.88;
      }

      const nm = label(17, has ? CREAM : MUTED, true);
      nm.anchor.set(0.5, 0);
      nm.position.set(cardW / 2, cardH - 42);
      nm.text = known ? v.name : '???';
      box.addChild(nm);

      const tag = label(13, has ? GOLD : MUTED, true);
      tag.anchor.set(0.5, 0);
      tag.position.set(cardW / 2, cardH - 22);
      tag.text = has
        ? `${job} · 手艺 ${craftOf(p, v.id)}/${CRAFT_MAX} ${stars(starsOf(p, v.id))}`.trim()
        : known ? `${LANE_NAME[v.lane]}·${job}` : '还没见过';
      box.addChild(tag);

      if (has && v.id === pick) {
        const rim = new PIXI.Graphics();
        rim.lineStyle(4, 0xe08a28, 0.95).drawRoundedRect(2, 2, cardW - 4, cardH - 4, 10);
        box.addChild(rim);
      }

      if (has) {
        bindPointerTap(box, () => {
          this._focus = v.id;
          this._open('one');
        });
      }
      layer.addChild(box);
    });

    this._btn(layer, 375, backY, 710, 80, '回村口', () => this._open('home'), { art: 'rust_plank' });
  }

  private _call(): void {
    const res = callVillager();
    if (!res) {
      Platform.showToast(`还差 ${CALL_COST - this._mem.credits} 工分`);
      return;
    }
    this._mem = res.mem;
    const v = getVillager(res.got);
    track('call_villager', {
      got: res.got, is_new: res.isNew, roster: this._mem.roster.length,
    });
    if (res.isNew) {
      playSfx('win', 0);
      Platform.showToast(`${v.name} 入伙了 · ${v.job}`, 'success');
      this._arrive = res.got;
      this._page = 'home';
      this._render();
      return;
    }
    const to = res.starTo ? getVillager(res.starTo).name : '';
    playSfx('install_on', 0);
    Platform.showToast(to ? `又来一个${v.name}，${to} 多一颗星` : `又来一个${v.name}，折了废铁`);
    this._render();
  }

  /* ---------------- 单个村民 ---------------- */

  private _renderOne(layer: PIXI.Container): void {
    this._backdrop(layer);
    const top = this._bar(layer);
    const mem = this._mem;
    const p = progressOf(mem);
    let v: VillagerDef;
    try {
      v = getVillager(this._focus);
    } catch {
      this._open('folks');
      return;
    }
    const stage = evoOf(p, v.id);
    const craft = craftOf(p, v.id);
    const star = starsOf(p, v.id);
    const cap = craftCap(star);
    const jobName = JOB_NAME[jobOf(v.role)];

    this._skin(layer, 'rust_plank', 375, top + 94, 670, 148, (g) => {
      ironSlab(g, 40, top + 20, 670, 148, 16);
    });

    const nm = label(34, GOLD, true);
    nm.anchor.set(0.5, 0);
    nm.position.set(375, top + 34);
    nm.text = `${v.name} · ${evoName(v, stage)}`;
    layer.addChild(nm);

    const tag = label(20, LANE_TINT[v.lane], true);
    tag.anchor.set(0.5, 0);
    tag.position.set(375, top + 78);
    tag.text = `${LANE_NAME[v.lane]} · ${jobName} · 手艺 ${craft}/${CRAFT_MAX} ${stars(star)}`.trim();
    layer.addChild(tag);

    // 「别人替不了的活」。§6 要求每个人都能回答这一句，进化页是它最该出现的地方
    const jobLine = label(18, CREAM, true);
    jobLine.anchor.set(0.5, 0);
    jobLine.position.set(375, top + 110);
    jobLine.text = v.job;
    layer.addChild(jobLine);

    const star2 = label(16, star >= STAR_MAX ? 0x9be08a : MUTED, true);
    star2.anchor.set(0.5, 0);
    star2.position.set(375, top + 138);
    star2.text = star >= STAR_MAX
      ? '星满了，再喊到他只折废铁'
      : `喊到重的会给他加星（每星 +8%，最多 ★${STAR_MAX}）`;
    layer.addChild(star2);

    /*
     * 三阶并排静帧。图鉴必须一体重绘，战场才继续人武分离。
     * 叠货架图标看不出剪影变化，所以这里不再用 UnitActor 叠件。
     * 缩放按卡内人洞算：二阶画布更高，不能按 200 高去 fit 再塞进 162 的遮罩。
     */
    const cardTop = top + 190;
    const cardH = 268;
    const titleY = cardTop + 10;
    const holeX = 100;
    const holeTop = cardTop + 36;
    const holeH = cardH - 48;
    const stillW = 188;
    const stillH = holeH;
    const feetY = holeTop + holeH;
    const stills = [1, 2, 3].map((s) => heroTex(v.id, s));
    let share = Number.POSITIVE_INFINITY;
    for (const tex of stills) {
      if (!tex?.baseTexture.valid || tex.width <= 1) continue;
      share = Math.min(share, stillW / tex.width, stillH / tex.height);
    }
    if (!Number.isFinite(share)) share = 1;

    for (let s = 1; s <= 3; s += 1) {
      const cx = 150 + (s - 1) * 225;
      const on = s <= stage;

      const card = new PIXI.Container();
      this._skin(card, 'rust_tile', cx, cardTop + cardH / 2, 208, cardH, (g) => {
        plate(g, cx - 104, cardTop, 208, cardH, 12);
      });
      if (s === stage) {
        const rim = new PIXI.Graphics();
        rim.lineStyle(3, GOLD, 0.9).drawRoundedRect(cx - 104, cardTop, 208, cardH, 12);
        card.addChild(rim);
      }
      layer.addChild(card);

      const still = standSprite(layer, stills[s - 1] ?? null, cx, feetY, stillW, stillH, share);
      if (still) {
        still.alpha = on ? 1 : 0.42;
        const mask = new PIXI.Graphics();
        mask.beginFill(0xffffff)
          .drawRoundedRect(cx - holeX, holeTop, holeX * 2, holeH, 10)
          .endFill();
        still.mask = mask;
        layer.addChild(mask);
      }

      const sn = label(19, on ? CREAM : MUTED, true);
      sn.anchor.set(0.5, 0);
      sn.position.set(cx, titleY);
      sn.text = `${'一二三'[s - 1]}阶 ${evoName(v, s)}`;
      layer.addChild(sn);
    }

    const cost = nextFeed(p, v.id);
    const btnY = this._height() - Game.safeBottom - 150;
    if (!cost) {
      const done = label(22, craft >= CRAFT_MAX ? 0x9be08a : MUTED, true);
      done.anchor.set(0.5);
      done.position.set(375, btnY);
      done.text = craft >= CRAFT_MAX
        ? '手艺焊满了'
        : `再喊到他加星才能继续喂（★${star} 上限 ${cap}）`;
      layer.addChild(done);
    } else {
      const can = mem.scrap >= cost.scrap && mem.parts >= cost.parts;
      const next = craft + 1;
      const title = next === 3 ? '升到二阶' : next === 6 ? '升到三阶' : `喂一手艺 → ${next}`;
      this._btn(layer, 375, btnY, 420, 92, title, () => this._evolve(v.id), {
        sub: `${compactNum(cost.scrap)} 废铁 + ${compactNum(cost.parts)} 零件${can ? '' : '（不够）'}`,
        enabled: can,
        art: 'rust_btn',
      });
      if (!can) {
        const lack = label(17, MUTED, true);
        lack.anchor.set(0.5, 0);
        lack.position.set(375, btnY + 56);
        lack.text = mem.parts < cost.parts
          ? '零件只有摊子的破电视出，去打几发'
          : '废铁主要靠通关结算，去推一关';
        layer.addChild(lack);
      }
    }

    this._back(layer, 'folks');
  }

  private _evolve(id: string): void {
    const mem = buyEvo(id);
    if (!mem) {
      Platform.showToast('材料不够');
      return;
    }
    this._mem = mem;
    const v = getVillager(id);
    const p = progressOf(mem);
    const now = evoOf(p, id);
    const craft = craftOf(p, id);
    track('evolve', { id, to: now, craft, village_lv: mem.villageLv });
    playSfx('win', 0);
    Platform.showToast(
      craft === 3 || craft === 6
        ? `${v.name} → ${evoName(v, now)}`
        : `${v.name} 手艺 ${craft}`,
      'success',
    );
    this._render();
  }
}

/** 村口站谁：人少全站出来，人多站阶数高的，新人入伙一定在场 */
function yardPeople(mem: RunMemory, arrive: string): string[] {
  const p = progressOf(mem);
  const ranked = [...mem.roster].sort((a, b) => {
    const e = evoOf(p, b) - evoOf(p, a);
    if (e !== 0) return e;
    return starsOf(p, b) - starsOf(p, a);
  });
  const n = Math.min(5, ranked.length);
  const take = ranked.slice(0, n);
  if (arrive && mem.roster.includes(arrive) && !take.includes(arrive) && take.length > 0) {
    take[take.length - 1] = arrive;
  }
  return take;
}

function yardSlots(n: number, midX: number, midY: number): { x: number; y: number }[] {
  if (n <= 0) return [];
  const gap = n <= 1 ? 0 : Math.min(148, 400 / (n - 1));
  return Array.from({ length: n }, (_, i) => ({
    x: midX + (i - (n - 1) / 2) * gap,
    y: midY,
  }));
}

function villageNeedText(mem: RunMemory): string {
  const need = nextVillageCost(mem.villageLv);
  if (need === undefined) return '村子满级了';
  const into = mem.villageExp - villageCumExp(mem.villageLv);
  const left = Math.max(0, Math.ceil(need - into));
  const capLv = nextCapLv(mem.villageLv);
  if (capLv === mem.villageLv + 1) return `再 ${left} 点 · 多上一人`;
  return `再 ${left} 点 · 升到 ${mem.villageLv + 1} 级`;
}

function readyEvo(mem: RunMemory): string[] {
  const p = progressOf(mem);
  return mem.roster.filter((id) => {
    const cost = nextFeed(p, id);
    return !!cost && mem.scrap >= cost.scrap && mem.parts >= cost.parts;
  });
}

/** 图鉴墙上头四个格子：路上站着的先露脸，空着写 ??? */
function atlasFaces(mem: RunMemory): Array<string | ''> {
  const ids = yardPeople(mem, '').slice(0, 4);
  return [ids[0] ?? '', ids[1] ?? '', ids[2] ?? '', ids[3] ?? ''];
}
