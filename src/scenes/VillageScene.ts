/**
 * 村子：出村看路、弹弓摊、村民（进化 / 星级 / 图鉴）。
 *
 * 只有四个页面，刻意做窄。上一版的村子有七页（编队 / 图鉴 / 废品站 / 门路 /
 * 随身 / 组合），改装件下线之后其中五页失去了对象；更要紧的是**它们互相不产生关系**，
 * 玩家在里面点半天不知道自己在决定什么。§4.3 的口径是「局外只解决一件事：
 * 让手上的人变多、变强」，所以这一版只留：
 *
 * - `home`  出村铁门 + 弹弓摊 + 图鉴墙 + 大喇叭杆。**它必须一眼能出村**。
 *           铁门进章节路径，木牌只报最近一关通了没，不在这儿切关。
 *           路上只站几个闲人，不是花名册。
 * - `horn`  村委会大喇叭。喊人、揭晓、新人走路，都在这一页。
 * - `stall` 弹弓摊。弹子的唯一去处，也是村庄经验/零件/工分的唯一来源。
 * - `folks` 乡亲。已来的能再练。没来的在格子上是黑影，名字先藏着；点开才看人，再决定等不等。喊人仍去喇叭。
 * - `one`   单个村民。只画当前这一阶，升阶换形象；星和手艺是这页的主信息。
 *
 * 资源条常驻在村子、图鉴、详情顶上。弹弓摊改用战斗那种矮锈铁板，
 * 弹子数 + 三枚小口袋（废铁/零件/工分），不抬门楣。
 */
import * as PIXI from 'pixi.js';
import { EventBus } from '@/core/EventBus';
import { Game } from '@/core/Game';
import { BgmPlayer } from '@/core/BgmPlayer';
import type { Scene } from '@/core/SceneManager';
import { SceneManager } from '@/core/SceneManager';
import { TweenManager, Ease } from '@/core/TweenManager';
import { bindPointerTap, clientEventToDesign } from '@/minigame';
import { getTouchCanvas } from '@/utils/touchCanvas';
import { UnitActor } from '@/fx/UnitActor';
import { YARD_MAX_SPAN, packPortraitRow, portraitWidth } from '@/fx/portraitFit';
import { homePreloadPeople, yardCrowd, yardPeople } from '@/core/yardRoster';
import { LANE_TINT } from '@/ui/BenchDock';
import { folkLivePeak, folkSheet, folkSignName, type FolkPeak } from '@/balance/folkSheet';
import { oneFolkLay, paintCraftBill, paintGrowCard, type OneFolkLay } from '@/ui/FolkSheetView';
import { folkBrowseIds, folkNeighborId, isFolkOneSwipeBlocked } from '@/ui/folkOneSwipe';
import { StallYard, STALL_BG_LAY } from '@/ui/StallYard';
import { mountVillageRise } from '@/ui/villageRiseCard';
import { villageRise, type VillageRise } from '@/balance/villageRise';
import {
  CALL_COST, CRAFT_MAX, STAR_GRANT_COST, craftCap, craftOf, evoOf,
  nextCapStars, nextEvoStars, nextFeed, starOpenedEvo, starWeekKey, starsOf,
  villageBar, villageMul, villageNeedHint,
} from '@/balance/village';
import {
  JOB_NAME, JOBS, LANE_NAME, VILLAGERS, evoNameOf, getVillager, jobOf, statsOf,
  type Job, type VillagerDef,
} from '@/balance/villagers';
import {
  CRAFT_AD_PARTS, PELLET_AD, TARGETS, TARGET_UNLOCK_LV, pelletCap, pelletRegenMin, prizeTier,
} from '@/balance/stall';
import { chapter1CraftStep, villageGateOpen, type CraftStep } from '@/balance/opening';
import { homeRoadBrief } from '@/balance/roadMap';
import { Platform } from '@/core/PlatformService';
import { rewardedAdUnitId, type RewardedSlot } from '@/config/rewardedAds';
import { track } from '@/core/Analytics';
import { adCanShow, adRecord, adRemaining } from '@/core/AdDay';
import {
  SIGN_GIFTS, SIGN_PITCH, signClaim, signGiftText, signState, signToday,
} from '@/core/SignIn';
import {
  buyEvo, callVillager, claimAdPellets, grantLoot, grantStar, loadMemory, nextGoal, progressOf,
  setWait,
  settlePellets, shootStall, stallAdLeft, stallPityLeft,
  type Loot, type RunMemory,
} from '@/core/RunMemory';
import { buzz, playSfx, warmSfx } from '@/core/SfxPlayer';
import {
  folksPreloadImages,
  heroStillArt,
  hornPreloadImages,
  stallPreloadImages,
  villageHomeImages,
  villagerDetailImages,
  type HeroArtNeed,
} from '@/config/assetPreload';
import { ensureAssets } from '@/core/ensureAssets';
import {
  addFitPortrait, fillCover, fillCoverUv, heroTex, stallBgTex, uiPath, uiTex,
  villageBgTex, villageHomeBgTex, watchArt,
  type UiName,
} from '@/core/TextureLoader';
import { lintelLay, rustExpFillRect, stallHudLay, type StallHudLay } from '@/ui/lintel';
import { glyphRowWidth, numGlyphs, paintGlyphs } from '@/ui/glyphs';
import { CallReveal } from '@/ui/CallReveal';
import { waitAskLabel } from '@/ui/waitAsk';
import {
  GOLD, copperRust, fillSprite, fitSprite, goldBtn, ironSlab, label, paintTroughFill,
  standSprite, woodPlank,
} from '@/ui/paint';

const CREAM = 0xfff4c4;
const MUTED = 0x8a8a92;
const RUST_RED = 0xc43a28;
/** 「够升级了」只用这一种绿，乡亲格和详情页对得上 */
const READY_GREEN = 0x9be08a;

/** ad_btn 原图 1491×604，左边 490 是播放钮，右边留铆钉 */
const AD_SLICE = { l: 490, t: 150, r: 150, b: 150 } as const;
/** 签到牌和看视频钮用的图，不在村口包里，进村口另拉 */
const SIGN_ART = ['ad_btn', 'rust_badge', 'fight_btn', 'settle_stamp', 'title_plaque', 'icon_credits'] as const;
/** 签到牌的竖排。吊牌 380 见方，木板在图的下半截，标题和副标题写在木板上 */
const SIGN_LAY = (() => {
  const plaque = 380;
  const plaqueCy = plaque / 2;
  const tileW = 200;
  const tileH = 172;
  const gap = 14;
  const bigH = 164;
  const gridTop = plaqueCy + 141 + 14;
  const total = gridTop + (tileH + gap) * 2 + bigH + 18 + 30 + 14 + 108 + 10 + 44;
  return {
    plaque, plaqueCy, titleY: plaqueCy + 18, subY: plaqueCy + 66,
    tileW, tileH, gap, bigH, gridW: tileW * 3 + gap * 2, gridTop, total,
  };
})();
/** 锈铁牌和金框牌九宫格的边，原图像素，铆钉都在边里 */
const RUST_SLICE = { l: 62, t: 62, r: 62, b: 62 } as const;
const GOLD_SLICE = { l: 100, t: 100, r: 100, b: 100 } as const;
const FIGHT_SLICE = { l: 100, t: 90, r: 100, b: 90 } as const;

type LootIcon = 'icon_pellets' | 'icon_scrap' | 'icon_parts' | 'icon_credits';

function lootItems(g: Loot): [LootIcon, number][] {
  return ([
    ['icon_pellets', g.pellets ?? 0], ['icon_scrap', g.scrap ?? 0],
    ['icon_parts', g.parts ?? 0], ['icon_credits', g.credits ?? 0],
  ] as [LootIcon, number][]).filter(([, n]) => n > 0);
}

/** 签到入口上画哪一样：最稀罕的那样 */
function signIcon(g: Loot): LootIcon {
  if (g.credits) return 'icon_credits';
  if (g.parts) return 'icon_parts';
  if (g.pellets) return 'icon_pellets';
  return 'icon_scrap';
}
/** 哪天已经自动弹过签到。一天只弹一次，关掉了就不再追着弹 */
let signPoppedOn = '';

const sliceCache = new Map<string, PIXI.Texture>();

function sliceTex(tex: PIXI.Texture, x: number, y: number, w: number, h: number): PIXI.Texture {
  const key = `${tex.baseTexture.uid}:${tex.frame.x + x},${tex.frame.y + y},${w},${h}`;
  let t = sliceCache.get(key);
  if (!t) {
    t = new PIXI.Texture(tex.baseTexture, new PIXI.Rectangle(tex.frame.x + x, tex.frame.y + y, w, h));
    sliceCache.set(key, t);
  }
  return t;
}

/**
 * 九宫格，只用普通 Sprite 拼，不走 Mesh（小游戏里 Mesh 没验过）。
 * l/t/r/b 是原图像素，s 是边在屏幕上的缩放。
 */
function slicePlate(
  parent: PIXI.Container,
  tex: PIXI.Texture,
  x: number,
  y: number,
  w: number,
  h: number,
  edge: { l: number; t: number; r: number; b: number },
  s: number,
): void {
  const tw = tex.frame.width;
  const th = tex.frame.height;
  const cols = [[0, edge.l], [edge.l, tw - edge.r], [tw - edge.r, tw]] as const;
  const rows = [[0, edge.t], [edge.t, th - edge.b], [th - edge.b, th]] as const;
  const dl = edge.l * s;
  const dr = edge.r * s;
  const dt = edge.t * s;
  const db = edge.b * s;
  const xs = [[x, dl], [x + dl, Math.max(0, w - dl - dr)], [x + w - dr, dr]] as const;
  const ys = [[y, dt], [y + dt, Math.max(0, h - dt - db)], [y + h - db, db]] as const;
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      const [sx0, sx1] = cols[c]!;
      const [sy0, sy1] = rows[r]!;
      const [dx, dw] = xs[c]!;
      const [dy, dh] = ys[r]!;
      if (sx1 <= sx0 || sy1 <= sy0 || dw <= 0 || dh <= 0) continue;
      const spr = new PIXI.Sprite(sliceTex(tex, sx0, sy0, sx1 - sx0, sy1 - sy0));
      spr.position.set(dx, dy);
      spr.width = dw;
      spr.height = dh;
      spr.eventMode = 'none';
      parent.addChild(spr);
    }
  }
}

type Page = 'home' | 'horn' | 'stall' | 'folks' | 'one';
const PAGES: readonly Page[] = ['home', 'horn', 'stall', 'folks', 'one'];

/** 村口格子。按原型：人站路中间，摊和木桩插在泥地里，铁门坐在画面底。 */
interface HomeLay {
  barBottom: number;
  title: { cx: number; cy: number; w: number; h: number };
  titleH: number;
  titleGlyphH: number;
  exp: { x: number; y: number; w: number; h: number };
  hintY: number;
  stamp: { y: number; w: number; h: number; cxs: readonly number[] };
  peopleY: number;
  peopleMid: number;
  peopleH: number;
  horn: { cx: number; cy: number; w: number; h: number };
  stall: { cx: number; cy: number; w: number; h: number };
  atlas: { x: number; y: number; w: number; h: number };
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
  let peopleY = propTop - 72;
  if (peopleY - peopleH < barBottom + 20) peopleY = barBottom + 20 + peopleH;
  const horn = {
    cx: 92,
    cy: peopleY - 18,
    w: 128,
    h: 188,
  };
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
    horn,
    stall,
    atlas,
    post,
    gate: { x: 16, y: gateY, w: 718, h: gateH },
  };
}

/**
 * 喇叭页底栏。跟战斗条同一套：窄返回 + 宽主操作，同一排。
 * 返回是离开，喊才是这页的事，两块铁牌上下叠会抢主操作。
 */
function hornDockLay(height: number, safeBottom: number): {
  cy: number;
  top: number;
  back: { cx: number; cy: number; w: number; h: number };
  shout: { cx: number; cy: number; w: number; h: number };
} {
  const side = 16;
  const gap = 12;
  const h = 82;
  const backW = 156;
  const shoutW = 750 - side * 2 - gap - backW;
  const cy = height - safeBottom - 48;
  return {
    cy,
    top: cy - h / 2,
    back: { cx: side + backW / 2, cy, w: backW, h },
    shout: { cx: side + backW + gap + shoutW / 2, cy, w: shoutW, h },
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
const STALL_SHOTS: UvBox = { x: 0.18, y: 0.34, w: 0.36, h: 0.16 };
/** stage_post：两行收在整块横牌正中，不要各贴上下沿。 */
const POST_TOP: UvBox = { x: 0.20, y: 0.185, w: 0.56, h: 0.11 };
const POST_BOT: UvBox = { x: 0.20, y: 0.295, w: 0.56, h: 0.11 };
/** rust_atlas：顶栏 + 量过的 2×2 暗格。 */
const ATLAS_HEADER: UvBox = { x: 0.16, y: 0.08, w: 0.68, h: 0.15 };
/** home_horn：杆上那块空铁牌，给 7/20 用。 */
const HORN_PLAQUE: UvBox = { x: 0.30, y: 0.29, w: 0.40, h: 0.11 };
const ATLAS_SLOTS: readonly UvBox[] = [
  { x: 0.128, y: 0.275, w: 0.338, h: 0.248 },
  { x: 0.536, y: 0.283, w: 0.327, h: 0.240 },
  { x: 0.134, y: 0.581, w: 0.332, h: 0.252 },
  { x: 0.536, y: 0.569, w: 0.333, h: 0.264 },
];
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
  /** 乡亲里正打开的还没来的人。点卡片只看人，等不等在半屏按钮上 */
  private _waitSheet = '';
  private _adBusy = false;
  private _adGlow: PIXI.Container[] = [];
  private _adOffered = new Set<string>();
  private _glowT = 0;
  private _signOpen = false;
  private _signGot = '';
  private _signBadge: PIXI.Container | null = null;
  private _actors: UnitActor[] = [];
  /** 刚喊来的新人。揭晓关掉后从村道右边走进来 */
  private _arrive = '';
  /** 揭晓还没关：路上先不站这个人 */
  private _pendingArrive = '';
  private readonly _reveal = new CallReveal();
  /** 喊声把 BGM 压下去的那一下，播完抬回来 */
  private _shoutHold: { t: number } | null = null;
  private readonly _yard = new StallYard(() => this._shoot());
  private _artTimer: ReturnType<typeof setTimeout> | 0 = 0;
  /** 刚收进口袋的那一格，刷新后面要弹一下 */
  private _prizePop: 'scrap' | 'parts' | 'credits' | null = null;
  /** 这一发把村子升了级。摊上先出牌，回村口再让多出来的人走进来 */
  private _rise: VillageRise | undefined;
  /** 回村口时，下标从这里起的人是新站上来的 */
  private _popFrom = -1;
  /** 这一跳新挂上的院子物件，回村口时才弹出来 */
  private _popMarks = new Set<string>();
  private _oneTrack: PIXI.Container | null = null;
  private _oneIncoming: PIXI.Container | null = null;
  private _oneIncomingId = '';
  private _oneIncomingDelta = 0;
  private _oneLay: OneFolkLay | null = null;
  private _oneHeaderBottom = 0;
  private _oneDockTop = 0;
  private _oneLock = false;
  private _oneDragging = false;
  private _oneMoved = false;
  private _oneAxis: 'none' | 'h' | 'v' = 'none';
  private _oneDelta = 0;
  private _oneStartX = 0;
  private _oneStartY = 0;
  private _oneLastX = 0;
  private _oneSwipeOff: (() => void) | null = null;

  constructor() {
    for (const p of PAGES) {
      const layer = new PIXI.Container();
      layer.visible = false;
      this.container.addChild(layer);
      this._layers[p] = layer;
    }
    this._reveal.visible = false;
    this.container.addChild(this._reveal);
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
    // 进村先把离线攒的弹子结算掉，玩家一眼看见「有多少发可以打」
    this._mem = settlePellets();
    this._page = 'home';
    this._waitSheet = '';
    this._adBusy = false;
    this._adOffered.clear();
    this._signOpen = this._signAutoPop();
    this._arrive = '';
    this._pendingArrive = '';
    this._reveal.close();
    this._kickPageArt('home');
    BgmPlayer.play('home');
    this._render();
  }

  onExit(): void {
    if (this._artTimer) clearTimeout(this._artTimer);
    this._artTimer = 0;
    this._detachOneSwipe();
    this._oneLock = false;
    this._clearActors();
    this._reveal.close();
    if (this._shoutHold) TweenManager.cancelTarget(this._shoutHold);
    this._shoutHold = null;
    this._yard.sleep();
    if (this._yard.parent) this._yard.parent.removeChild(this._yard);
    BgmPlayer.stop();
  }

  update(dt: number): void {
    for (const a of this._actors) a.update(dt);
    if (this._page === 'stall') this._yard.update(dt);
    this._glowT += dt;
    const s = 1 + Math.sin(this._glowT * 3.6) * 0.05;
    for (const b of this._adGlow) if (!b.destroyed) b.scale.set(s);
    const badge = this._signBadge;
    if (badge && !badge.destroyed) {
      // 晃一阵停一阵，一直晃会被当成背景
      const k = this._glowT % 2.4;
      badge.rotation = k < 0.6 ? Math.sin(k * Math.PI * 6) * 0.12 * (1 - k / 0.6) : 0;
    }
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
    if (page !== 'home' && !villageGateOpen(this._mem.stageTop)) {
      playSfx('ui_tap', 0);
      Platform.showToast('先把村口守住');
      return;
    }
    if (page !== 'folks') this._waitSheet = '';
    this._page = page;
    if (page === 'stall' && stallAdLeft() > 0) {
      Platform.preloadRewardedVideo(rewardedAdUnitId('stallPellets', Platform.name));
      track('ad_offer', { placement: 'stallPellets', pellets: this._mem.pellets });
    }
    playSfx('ui_tap', 0);
    this._kickPageArt(page);
    this._render();
  }

  /** 只拉当前页要用的图，对齐 xiaochu2 的 ensureAssets(场景清单) */
  private _kickPageArt(page: Page): void {
    const paths = this._pageArt(page);
    void ensureAssets(paths).then(() => {
      if (SceneManager.current?.name !== 'village') return;
      if (this._page !== page) return;
      this._render();
    }).catch((e) => {
      console.warn('[Village] 按需预热失败', e);
    });
  }

  private _pageArt(page: Page): string[] {
    const mem = this._mem;
    const p = progressOf(mem);
    if (page === 'stall') return stallPreloadImages();
    if (page === 'folks') {
      return folksPreloadImages({
        job: this._jobFilter,
        owned: new Set(mem.roster),
        evo: Object.fromEntries(mem.roster.map((id) => [id, evoOf(p, id)])),
      });
    }
    if (page === 'one') return [...villagerDetailImages(this._focus, evoOf(p, this._focus)), uiPath('ad_btn')];
    if (page === 'horn') return hornPreloadImages(this._hornArtPeople());
    return [...villageHomeImages(this._homeArtPeople()), ...SIGN_ART.map(uiPath)];
  }

  private _hornArtPeople(): HeroArtNeed[] {
    const rows = yardPeople(this._mem, this._arrive || this._pendingArrive, 6).map((id) => {
      try {
        return { id, evo: evoOf(progressOf(this._mem), id), lane: getVillager(id).lane };
      } catch {
        return { id, evo: 1 };
      }
    });
    const wait = this._waitId();
    if (wait && !rows.some((r) => r.id === wait)) rows.push({ id: wait, evo: 1 });
    return rows;
  }

  private _homeArtPeople(): HeroArtNeed[] {
    return homePreloadPeople(this._mem).map((id) => {
      try {
        return { id, evo: evoOf(progressOf(this._mem), id), lane: getVillager(id).lane };
      } catch {
        return { id, evo: 1 };
      }
    });
  }

  /* ---------------- 渲染总入口 ---------------- */

  private _render(): void {
    if (this._page !== 'one') {
      this._detachOneSwipe();
      if (this._oneTrack && !this._oneTrack.destroyed) TweenManager.cancelTarget(this._oneTrack);
      this._oneTrack = null;
      this._oneIncoming = null;
      this._oneIncomingId = '';
      this._oneLock = false;
    }
    if (this._oneLock) return;
    if (this._page === 'stall' && this._yard.busy) return;
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
    this._adGlow = [];
    this._signBadge = null;
    const layer = this._layers[this._page];
    if (this._page === 'home') this._renderHome(layer);
    if (this._page === 'horn') this._renderHorn(layer);
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
   * 废铁 / 零件是账本。工分点开去大喇叭喊人，弹子点开进弹弓摊。
   * 升阶走「能升阶」，喊人走村口，不进图鉴。
   */
  private _bar(layer: PIXI.Container): number {
    const lay = homeLay(Game.safeTop, this._height(), Game.safeBottom, Game.safeCapsuleLeft);
    const lv = this._mem.villageLv;
    const barProg = villageBar(lv, this._mem.villageExp);

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

    const slot = lay.exp;
    this._skin(layer, 'rust_exp', slot.x + slot.w / 2, slot.y + slot.h / 2, slot.w, slot.h, (g) => {
      g.beginFill(0x1a120c, 0.9).drawRoundedRect(slot.x, slot.y, slot.w, slot.h, 6).endFill();
    });
    const well = rustExpFillRect(slot);
    const bar = new PIXI.Graphics();
    paintTroughFill(bar, well, barProg.ratio, barProg.maxed);
    layer.addChild(bar);

    const hint = label(14, MUTED, false);
    hint.anchor.set(0.5, 0);
    hint.position.set(375, lay.hintY);
    hint.text = this._homeHint(lv);
    layer.addChild(hint);

    const cells: readonly [UiName, number, 'icon_scrap' | 'icon_parts' | 'icon_credits' | 'icon_pellets', string, (() => void) | null][] = [
      ['paint_scrap', this._mem.scrap, 'icon_scrap', '废铁', null],
      ['paint_parts', this._mem.parts, 'icon_parts', '零件', null],
      ['paint_credits', this._mem.credits, 'icon_credits', '工分', () => this._open('horn')],
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

  private _btn(
    layer: PIXI.Container,
    cx: number,
    cy: number,
    w: number,
    h: number,
    text: string,
    onTap: () => void,
    opts: { sub?: string; note?: string; enabled?: boolean; art?: UiName; silent?: boolean } = {},
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
    const ink = art === 'fight_btn' ? 0x2a160c : (on ? CREAM : MUTED);
    const subInk = art === 'fight_btn' ? 0x5a3a14 : (on ? GOLD : MUTED);
    const stacked = !!(opts.sub && opts.note);
    const t = label(stacked ? 28 : (opts.sub ? 26 : 28), ink, true);
    t.anchor.set(0.5);
    t.position.set(0, stacked ? -26 : (opts.sub ? -12 : 0));
    t.text = text;
    box.addChild(t);
    if (opts.sub) {
      const s = label(stacked ? 20 : 16, subInk, true);
      s.anchor.set(0.5);
      s.position.set(0, stacked ? 2 : 16);
      s.text = opts.sub;
      box.addChild(s);
    }
    if (opts.note) {
      const n = label(16, subInk, true);
      n.anchor.set(0.5);
      n.position.set(0, stacked ? 26 : 16);
      n.text = opts.note;
      box.addChild(n);
    }
    box.alpha = on ? 1 : 0.55;
    if (on) bindPointerTap(box, onTap, opts.silent ? { silent: true } : undefined);
    layer.addChild(box);
    return box;
  }

  /**
   * 看视频的按钮。跟结算、复活是同一块 ad_btn，左边的播放钮按九宫格保住不被拉扁。
   * glow 的会跟着 update 呼吸，留给「现在正缺这个」的那一刻。
   */
  private _adPlate(
    layer: PIXI.Container,
    cx: number,
    cy: number,
    w: number,
    h: number,
    text: string,
    onTap: () => void,
    opts: { sub?: string; enabled?: boolean; glow?: boolean } = {},
  ): PIXI.Container {
    const on = opts.enabled !== false;
    const box = new PIXI.Container();
    box.eventMode = on ? 'static' : 'none';
    box.interactiveChildren = false;
    box.position.set(cx, cy);
    box.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
    const tex = uiTex('ad_btn');
    let left = 0;
    let right = 0;
    if (tex && tex.baseTexture.valid && tex.width > 1) {
      const s = h / tex.height;
      slicePlate(box, tex, -w / 2, -h / 2, w, h, AD_SLICE, s);
      left = AD_SLICE.l * s;
      right = AD_SLICE.r * s * 0.5;
    } else {
      const g = new PIXI.Graphics();
      goldBtn(g, -w / 2, -h / 2, w, h);
      box.addChild(g);
    }
    const mid = (-w / 2 + left + w / 2 - right) / 2;
    const t = painted(opts.sub ? 26 : 28, 0x2a160c, '#fff4c4', 4);
    t.anchor.set(0.5);
    t.position.set(mid, opts.sub ? -h * 0.15 : 0);
    t.text = text;
    box.addChild(t);
    if (opts.sub) {
      const s = painted(17, 0x5a2a0c, '#fff4c4', 3);
      s.anchor.set(0.5);
      s.position.set(mid, h * 0.2);
      s.text = opts.sub;
      box.addChild(s);
    }
    box.alpha = on ? 1 : 0.55;
    if (on) {
      bindPointerTap(box, onTap);
      if (opts.glow) this._adGlow.push(box);
    }
    layer.addChild(box);
    return box;
  }

  /** 同一个广告位一次进村只报一次曝光，重画不重复记 */
  private _offerAd(placement: string, extra: Record<string, unknown> = {}): void {
    if (this._adOffered.has(placement)) return;
    this._adOffered.add(placement);
    Platform.preloadRewardedVideo(rewardedAdUnitId(placement as RewardedSlot, Platform.name));
    track('ad_offer', { placement, ...extra });
  }

  /** 看一段。看完返回 true，没看完已经提示过 */
  private async _watchVillageAd(placement: RewardedSlot): Promise<boolean> {
    track('ad_show', { placement });
    const ok = await Platform.showRewardedVideo(rewardedAdUnitId(placement, Platform.name));
    track('ad_close', { placement, completed: ok, result: Platform.lastAdResult });
    if (!ok) Platform.showToast(Platform.lastAdResult === 'error' ? '广告没拉到，稍后再试' : '看完才能领');
    return ok;
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
    this._homeMarks(layer, lay);
    this._homePeople(layer, lay);
    this._homeHorn(layer, lay);
    this._homePost(layer, lay);
    this._homeStall(layer, lay);
    this._homeAtlas(layer, lay);
    this._homeGate(layer, lay);
    this._homeGoal(layer, lay);
    this._homeSign(layer, lay);
    if (this._signOpen && villageGateOpen(this._mem.stageTop)) this._paintSignSheet(layer);
  }

  /**
   * 把 `nextGoal()` 挂到它指的那个入口上。
   *
   * 这个函数早就写好了，但一直只有测试在读 —— 于是「随时有下一个目标」那条验收
   * 在代码里立着、在屏幕上不存在。牌子只贴一块：同时能练又能喊的时候，
   * 按 nextGoal 的排序先说练，因为练是立刻看得见的那件。
   */
  private _homeGoal(layer: PIXI.Container, lay: HomeLay): void {
    const goal = nextGoal(this._mem);
    const at = goal.kind === 'craft'
      ? { x: lay.atlas.x + lay.atlas.w / 2, y: lay.atlas.y - 16 }
      : goal.kind === 'call'
        ? { x: lay.horn.cx, y: lay.horn.cy - lay.horn.h / 2 - 12 }
        : goal.kind === 'stage' || goal.kind === 'stars'
          ? { x: lay.gate.x + lay.gate.w / 2, y: lay.gate.y - 16 }
          : undefined;
    if (!at) return;

    const t = painted(16, CREAM, '#1a1008', 3);
    t.anchor.set(0.5);
    t.text = goal.text;
    const w = t.width + 28;
    const box = new PIXI.Container();
    box.position.set(at.x, at.y);
    const g = new PIXI.Graphics();
    g.beginFill(0x3a2a1c, 0.88).drawRoundedRect(-w / 2, -15, w, 30, 8).endFill();
    g.lineStyle(2, 0xe08a28, 0.9).drawRoundedRect(-w / 2, -15, w, 30, 8);
    box.addChild(g);
    box.addChild(t);
    layer.addChild(box);
  }

  private _homePeople(layer: PIXI.Container, lay: HomeLay): void {
    const mem = this._mem;
    const p = progressOf(mem);
    const crowd = yardCrowd(mem.villageLv);
    const front = yardPeople(mem, '', crowd);
    const peopleH = crowd >= 6 ? 112 : crowd >= 5 ? 124 : crowd >= 4 ? 142 : lay.peopleH;
    const midX = crowd >= 4 ? 408 : lay.peopleMid;
    const feetY = lay.peopleY - 48;
    const popFrom = this._popFrom;
    this._popFrom = -1;
    const slots = yardSlots(
      front,
      front.map((id) => evoOf(p, id)),
      midX,
      feetY,
      peopleH,
      crowd >= 4 ? 520 : YARD_MAX_SPAN,
    );
    front.forEach((id, i) => {
      const v = getVillager(id);
      const slot = slots[i] ?? { x: midX, y: feetY };
      const a = new UnitActor();
      a.bindHero(v.id, v.lane, evoOf(p, id), false);
      a.place(slot.x, slot.y, peopleH);
      if (popFrom >= 0 && i >= popFrom) {
        a.view.scale.set(0.15);
        TweenManager.to({
          target: a.view.scale,
          props: { x: 1, y: 1 },
          duration: 0.42,
          delay: (i - popFrom) * 0.08,
          ease: Ease.easeOutBack,
        });
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

  /** 村口大喇叭杆。点进去才是喊人的院子，不在路上直接喊。 */
  private _homeHorn(layer: PIXI.Container, lay: HomeLay): void {
    const { cx, cy, w, h } = lay.horn;
    const box = this._hit(layer, cx, cy, w, h, () => this._open('horn'));
    const spr = fitSprite(box, uiTex('home_horn'), 0, 0, w, h);
    if (!spr) {
      this._skin(box, 'rust_plank', 0, 0, w, h, (g) => {
        ironSlab(g, -w / 2, -h / 2, w, h, 12);
      });
    }
    const plaque = faceOf(spr, w, h, HORN_PLAQUE);
    const title = painted(18, GOLD, '#1a1008', 4);
    title.anchor.set(0.5);
    title.position.set(plaque.x + plaque.w / 2, plaque.y + plaque.h / 2 + 10);
    title.text = '大喇叭';
    box.addChild(title);
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
    title.text = '乡亲';
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

  /** 村口刚开、1-5 还没过，横楣按零件够不够往下指。再往后交给经验条 */
  private _homeHint(lv: number): string {
    if (this._page !== 'home') return villageNeedHint(lv, this._mem.villageExp);
    if (!villageGateOpen(this._mem.stageTop)) return '出村接着打';
    const step = this._craftStep();
    if (step === 'stall') return '先去弹弓摊，打中破电视拿零件';
    if (step === 'craft') return '零件够了，点开一个人升手艺';
    if (this._mem.stageTop <= 6) return '出村接着打';
    return villageNeedHint(lv, this._mem.villageExp);
  }

  private _craftStep(): CraftStep {
    const maxCraft = this._mem.roster.reduce((m, id) => Math.max(m, this._mem.craft[id] ?? 1), 1);
    return chapter1CraftStep(
      this._mem.stageTop,
      (this._mem.stageStars[5] ?? 0) > 0,
      maxCraft,
      this._mem.parts,
    );
  }

  private _homePost(layer: PIXI.Container, lay: HomeLay): void {
    const mem = this._mem;
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
    // 只报最近一关通了没。切关去路径图，木牌不再当左右拨片
    const brief = homeRoadBrief(mem);
    const id = painted(15, CREAM, '#2a1608', 4);
    id.text = brief.title;
    putCentered(box, id, faceOf(spr, w, h, POST_TOP));
    const nm = painted(16, CREAM, '#2a1608', 3);
    nm.text = brief.sub;
    putCentered(box, nm, faceOf(spr, w, h, POST_BOT));
    layer.addChild(box);
  }

  private _homeGate(layer: PIXI.Container, lay: HomeLay): void {
    const { x, y, w, h } = lay.gate;
    const cx = x + w / 2;
    const cy = y + h / 2;
    const box = this._hit(layer, cx, cy, w, h, () => {
      if (!villageGateOpen(this._mem.stageTop)) {
        SceneManager.switchTo('battle', { stageId: this._mem.stageId });
        return;
      }
      SceneManager.switchTo('road');
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
    const roomBottom = h;
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
    if (!this._yard.busy && (!this._yard.hung || this._yard.openSize !== open.size)) {
      this._yard.mount(open, roomTop, roomBottom, floor);
    } else if (this._yard.hung) {
      this._yard.refreshArt();
    }
    this._yard.visible = true;
    this._yard.setCanPull(mem.pellets > 0 && !this._yard.busy);
    layer.addChild(this._yard);

    const btnY = h - Game.safeBottom - 72;
    const adLeft = stallAdLeft();
    this._adPlate(layer, 216, btnY, 300, 88, '看一段', () => { void this._adPellets(); }, {
      sub: adLeft > 0 ? `+${PELLET_AD} 发 · 剩 ${adLeft} 次` : '今天看完了',
      enabled: adLeft > 0 && !this._adBusy && !this._yard.busy,
      // 弹子打光的那一刻最想要，这时候让它动起来
      glow: mem.pellets <= 0,
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
    const left = stallPityLeft(this._mem);
    const near = left <= 2;
    const pity = painted(15, near ? 0xffe08a : 0xd9a13b, '#1a1008', 3);
    pity.anchor.set(0.5);
    pity.position.set(375, chrome.hintY);
    const wait = left <= 1 ? '下一发必出工分' : `再 ${left} 发必出工分`;
    const step = this._craftStep();
    pity.text = step === 'stall'
      ? '打中破电视，就出零件'
      : step === 'craft'
        ? '零件够了，回村点人升手艺'
        : this._mem.pellets >= cap
          ? `满了 · ${wait}`
          : `${pelletRegenMin(this._mem.villageLv)} 分钟回一发 · ${wait}`;
    layer.addChild(pity);
    this._paintStallPocket(layer, chrome, left);
  }

  /** 打中的废铁/零件/工分往这儿飞。经验就地飘，不占口袋。 */
  private _paintStallPocket(layer: PIXI.Container, chrome: StallHudLay, pityLeft: number): void {
    const cells: readonly ['icon_scrap' | 'icon_parts' | 'icon_credits', number, 'scrap' | 'parts' | 'credits'][] = [
      ['icon_scrap', this._mem.scrap, 'scrap'],
      ['icon_parts', this._mem.parts, 'parts'],
      ['icon_credits', this._mem.credits, 'credits'],
    ];
    const { h, w } = chrome.pocket;
    cells.forEach(([icon, val, kind], i) => {
      const cx = chrome.pocket.cxs[i] ?? 375;
      const box = new PIXI.Container();
      box.position.set(cx, chrome.pocket.y);
      box.eventMode = 'none';
      layer.addChild(box);
      const hot = kind === 'credits' && pityLeft <= 2;
      const pop = this._prizePop === kind;
      const g = new PIXI.Graphics();
      g.beginFill(0x1a1008, hot || pop ? 0.62 : 0.42)
        .drawRoundedRect(-w / 2, -h / 2, w, h, 10)
        .endFill();
      g.lineStyle(1.6, hot || pop ? 0xffe08a : 0xc9a46a, hot || pop ? 0.95 : 0.35)
        .drawRoundedRect(-w / 2, -h / 2, w, h, 10)
        .lineStyle(0);
      box.addChild(g);
      if (hot) this._pulsePocket(g);
      this._paintStallChip(box, icon, val, h, hot);
      if (pop) {
        const hold = { s: 1.16 };
        box.scale.set(hold.s);
        TweenManager.to({
          target: hold,
          props: { s: 1 },
          duration: 0.32,
          ease: Ease.easeOutBack,
          onUpdate: () => box.scale.set(hold.s),
        });
      }
    });
    this._prizePop = null;
  }

  /** 图标和数字当成一组，在牌子正中。不要各贴各的边。 */
  private _paintStallChip(
    box: PIXI.Container,
    icon: 'icon_scrap' | 'icon_parts' | 'icon_credits',
    val: number,
    plateH: number,
    hot: boolean,
  ): void {
    const iconS = Math.round(Math.min(28, plateH - 16));
    const numH = Math.round(Math.min(22, plateH - 18));
    const shown = compactNum(val);
    const plain = /^\d+$/.test(shown);
    const names = plain ? numGlyphs(val) : [];
    const numW = (plain ? glyphRowWidth(names, numH, 1) : null)
      ?? shown.length * numH * 0.62;
    const gap = 8;
    const total = iconS + gap + numW;
    const x0 = -total / 2;
    const iconX = x0 + iconS / 2;
    const numX = x0 + iconS + gap + numW / 2;
    if (!fitSprite(box, uiTex(icon), iconX, 0, iconS, iconS) && icon === 'icon_scrap') {
      fitSprite(box, uiTex('scrap_pile'), iconX, 0, iconS, iconS);
    }
    if (!plain || !paintGlyphs(box, names, numX, 0, numH, 1)) {
      const num = painted(numH, hot ? 0xffe08a : CREAM, '#1a1008', 3);
      num.anchor.set(0.5);
      num.position.set(numX, 0);
      num.text = shown;
      box.addChild(num);
    }
  }

  private _pulsePocket(g: PIXI.Graphics): void {
    const hold = { a: 0.95 };
    const loop = (): void => {
      if (g.destroyed) return;
      TweenManager.to({
        target: hold,
        props: { a: hold.a > 0.5 ? 0.28 : 0.95 },
        duration: 0.55,
        onUpdate: () => { if (!g.destroyed) g.alpha = hold.a; },
        onComplete: loop,
      });
    };
    loop();
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

  /**
   * 等级在院子里的样子：蓝筐、铁盆挂在路上，跟摊上解锁的是同一件东西。
   * 喇叭杆本来就是进大喇叭的入口，不再叠第二只。
   */
  private _homeMarks(layer: PIXI.Container, lay: HomeLay): void {
    const lv = this._mem.villageLv;
    const pop = this._popMarks;
    this._popMarks = new Set();
    if (lv >= 2) {
      this._mark(layer, 'stall_crate', 196, lay.peopleY - 28, 76, 62, pop.has('crate'));
    }
    if (lv >= 6) {
      this._mark(layer, 'stall_basin', 608, lay.peopleY - lay.peopleH * 0.62, 68, 54, pop.has('basin'));
    }
  }

  private _mark(
    layer: PIXI.Container,
    art: UiName,
    x: number,
    y: number,
    w: number,
    h: number,
    pop: boolean,
  ): void {
    const box = new PIXI.Container();
    box.position.set(x, y);
    box.eventMode = 'none';
    layer.addChild(box);
    if (!fitSprite(box, uiTex(art), 0, 0, w, h)) return;
    if (!pop) return;
    box.scale.set(0.2);
    TweenManager.to({
      target: box.scale,
      props: { x: 1, y: 1 },
      duration: 0.4,
      ease: Ease.easeOutBack,
    });
  }

  private _shoot(): void {
    if (this._yard.busy) return;
    const beforeLv = this._mem.villageLv;
    const res = shootStall();
    if (!res) {
      Platform.showToast('没弹子了，等等或者看一段');
      this._yard.setCanPull(false);
      return;
    }
    this._mem = res.mem;
    const rise = villageRise(beforeLv, res.mem.villageLv);
    if (rise) {
      this._rise = rise;
      const was = yardCrowd(beforeLv);
      if (yardCrowd(res.mem.villageLv) > was) this._popFrom = was;
      for (const t of rise.targets) this._popMarks.add(t.id);
    }
    const { hit, rebounds, gain } = res.result;
    const tier = prizeTier(gain);
    this._prizePop = tier === 'jackpot' ? 'credits' : tier === 'rare' ? 'parts' : tier === 'uncommon' ? 'scrap' : null;
    track('stall_shot', {
      target: hit.id, rebounds, village_lv: this._mem.villageLv, left: this._mem.pellets,
    });
    this._yard.setCanPull(this._mem.pellets > 0);
    const chrome = stallHudLay(Game.safeTop, this._height());
    this._yard.play(res.result, {
      scrap: { x: chrome.pocket.cxs[0]!, y: chrome.pocket.y },
      parts: { x: chrome.pocket.cxs[1]!, y: chrome.pocket.y },
      credits: { x: chrome.pocket.cxs[2]!, y: chrome.pocket.y },
    }, () => {
      this._render();
      this._showRise();
    });
  }

  private _showRise(): void {
    const rise = this._rise;
    if (!rise || this._page !== 'stall') return;
    this._rise = undefined;
    playSfx('win', 28);
    mountVillageRise(this._layers.stall, rise, this._height(), () => {});
  }

  private async _adPellets(): Promise<void> {
    if (this._adBusy) return;
    this._adBusy = true;
    try {
      track('ad_show', { placement: 'stallPellets' });
      const ok = await Platform.showRewardedVideo(rewardedAdUnitId('stallPellets', Platform.name));
      track('ad_close', { placement: 'stallPellets', completed: ok, result: Platform.lastAdResult });
      if (!ok) {
        Platform.showToast(Platform.lastAdResult === 'error' ? '广告没拉到，稍后再试' : '没看完，没给弹子');
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

  private async _adCraftParts(): Promise<void> {
    if (this._adBusy || !adCanShow('craftParts')) return;
    this._adBusy = true;
    try {
      if (!(await this._watchVillageAd('craftParts'))) return;
      adRecord('craftParts');
      this._mem = grantLoot({ parts: CRAFT_AD_PARTS });
      Platform.hideToast();
      Platform.showToast(`零件 +${CRAFT_AD_PARTS}`, 'success');
      playSfx('ui_tap', 0);
    } finally {
      this._adBusy = false;
      this._render();
    }
  }

  /* ---------------- 村口每日礼包（签到） ---------------- */

  /** 签到只在村口开了之后出现；第一章教打摊、升手艺那段不自动弹，免得把引导打断 */
  private _signAutoPop(): boolean {
    if (!villageGateOpen(this._mem.stageTop) || this._mem.stageTop <= 6) return false;
    if (!signState().open || signPoppedOn === signToday()) return false;
    signPoppedOn = signToday();
    return true;
  }

  private _homeSign(layer: PIXI.Container, lay: HomeLay): void {
    if (!villageGateOpen(this._mem.stageTop)) return;
    const st = signState();
    const adLeft = adCanShow('dailyGift');
    const lively = st.open || adLeft;
    const w = 140;
    const h = 150;
    const cx = 750 - 16 - w / 2;
    const cy = lay.barBottom + 20 + h / 2;
    const box = this._hit(layer, cx, cy, w, h, () => {
      playSfx('ui_tap', 0);
      this._signOpen = true;
      this._render();
    });
    // 还有得领就是金框牌，跟村口的锈铁一眼分开；领完退回锈铁
    if (!fillSprite(box, uiTex(lively ? 'settle_stamp' : 'rust_badge'), 0, 0, w, h)) {
      this._skin(box, 'rust_tile', 0, 0, w, h, (g) => ironSlab(g, -w / 2, -h / 2, w, h, 12));
    }
    const icon = signIcon(SIGN_GIFTS[st.slot]!);
    fitSprite(box, uiTex(icon), 0, -14, 58, 58);
    const t = lively ? painted(19, 0x8b2e1f, '#fff4c4', 4) : painted(19, MUTED, '#1a1008', 4);
    t.anchor.set(0.5);
    t.position.set(0, 30);
    t.text = st.open ? '每日礼包' : (adLeft ? '再领一份' : '明天再来');
    box.addChild(t);
    if (st.open) {
      const dot = new PIXI.Graphics();
      dot.beginFill(RUST_RED).lineStyle(3, CREAM, 1).drawCircle(0, 0, 14).endFill();
      dot.position.set(w / 2 - 10, -h / 2 + 10);
      box.addChild(dot);
    }
    if (lively) this._signBadge = box;
  }

  /**
   * 签到牌。不再垫一整块大锈铁板 —— 板子四角的大铆钉总会压到格子和字。
   * 黑底上直接挂：吊牌写标题，三行格子，第 7 天单独一整条金框，底下一颗主按钮。
   */
  private _paintSignSheet(layer: PIXI.Container): void {
    const H = this._height();
    const st = signState();
    const close = (): void => {
      this._signOpen = false;
      this._signGot = '';
      this._render();
    };
    const veil = new PIXI.Graphics();
    veil.beginFill(0x0a0806, 0.84).drawRect(0, 0, 750, H).endFill();
    veil.eventMode = 'static';
    veil.hitArea = new PIXI.Rectangle(0, 0, 750, H);
    bindPointerTap(veil, close, { silent: true });
    layer.addChild(veil);

    const total = SIGN_LAY.total;
    const avail = H - Game.safeTop - Game.safeBottom - 16;
    const k = Math.min(1, avail / total);
    const sheet = new PIXI.Container();
    sheet.scale.set(k);
    sheet.position.set(375, Game.safeTop + 8 + Math.max(0, (avail - total * k) / 2));
    sheet.eventMode = 'static';
    sheet.hitArea = new PIXI.Rectangle(-345, 0, 690, total);
    layer.addChild(sheet);

    const L = SIGN_LAY;
    const plaque = fitSprite(sheet, uiTex('title_plaque'), 0, L.plaqueCy, L.plaque, L.plaque);
    const title = plaque ? painted(42, 0x5a1a0c, '#fff0c0', 6) : painted(42, GOLD, '#1a1008', 6);
    title.anchor.set(0.5);
    title.position.set(0, L.titleY);
    title.text = '村口每日礼包';
    sheet.addChild(title);
    const sub = plaque ? painted(19, 0x3a1a08, '#fff0c0', 4) : painted(19, CREAM, '#1a1008', 4);
    sub.anchor.set(0.5);
    sub.position.set(0, L.subY);
    sub.text = '天天来领，第 7 天白送喊一次人';
    sheet.addChild(sub);

    let y = L.gridTop;
    for (const row of [[0, 1, 2], [3, 4, 5]] as const) {
      row.forEach((slot, i) => {
        this._paintSignTile(sheet, (i - 1) * (L.tileW + L.gap), y + L.tileH / 2, L.tileW, L.tileH, slot, st);
      });
      y += L.tileH + L.gap;
    }
    this._paintSignTile(sheet, 0, y + L.bigH / 2, L.gridW, L.bigH, SIGN_GIFTS.length - 1, st);
    y += L.bigH + 18;

    const today = SIGN_GIFTS[st.slot]!;
    const nextSlot = (st.slot + 1) % SIGN_GIFTS.length;
    const info = painted(22, GOLD, '#1a1008', 4);
    info.anchor.set(0.5);
    info.position.set(0, y + 15);
    const pitch = (slot: number): string => (SIGN_PITCH[slot] ? ` · ${SIGN_PITCH[slot]}` : '');
    info.text = st.open
      ? `今天领：${signGiftText(today)}${pitch(st.slot)}`
      : `明天来领：${signGiftText(SIGN_GIFTS[nextSlot]!)}${pitch(nextSlot)}`;
    sheet.addChild(info);
    y += 30 + 14;

    const btnY = y + 54;
    if (st.open) {
      this._adGlow.push(this._claimBtn(sheet, 0, btnY, 460, 108, '免费领取', () => this._claimSign()));
    } else if (adCanShow('dailyGift')) {
      this._offerAd('dailyGift', { slot: st.slot });
      this._adPlate(sheet, 0, btnY, 580, 108, '看视频 今天再领一份', () => { void this._adSign(); }, {
        sub: `再拿 ${signGiftText(today)}`,
        enabled: !this._adBusy,
        glow: true,
      });
    } else {
      const done = painted(26, CREAM, '#1a1008', 4);
      done.anchor.set(0.5);
      done.position.set(0, btnY);
      done.text = '今天领满了，明天再来';
      sheet.addChild(done);
    }
    y += 108 + 10;

    const x = painted(22, 0xc8b89a, '#1a1008', 3);
    x.anchor.set(0.5);
    x.position.set(0, y + 22);
    x.text = '关闭';
    x.eventMode = 'static';
    x.hitArea = new PIXI.Rectangle(-90, -26, 180, 52);
    bindPointerTap(x, close);
    sheet.addChild(x);

    if (this._signGot) this._popSignGot(sheet, btnY - 150, this._signGot);
    this._signGot = '';
  }

  /** 金色主按钮。fight_btn 原图 520×238，拉成长条要按九宫格，否则四角铆钉被拉扁 */
  private _claimBtn(
    parent: PIXI.Container,
    cx: number,
    cy: number,
    w: number,
    h: number,
    text: string,
    onTap: () => void,
  ): PIXI.Container {
    const box = new PIXI.Container();
    box.eventMode = 'static';
    box.interactiveChildren = false;
    box.position.set(cx, cy);
    box.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
    const tex = uiTex('fight_btn');
    if (tex && tex.baseTexture.valid && tex.width > 1) {
      slicePlate(box, tex, -w / 2, -h / 2, w, h, FIGHT_SLICE, h / tex.height);
    } else {
      const g = new PIXI.Graphics();
      goldBtn(g, -w / 2, -h / 2, w, h);
      box.addChild(g);
    }
    const t = painted(34, 0x2a160c, '#fff4c4', 5);
    t.anchor.set(0.5);
    t.text = text;
    box.addChild(t);
    bindPointerTap(box, onTap);
    parent.addChild(box);
    return box;
  }

  /** 领到的那一下：大字弹出来停一拍再淡掉 */
  private _popSignGot(parent: PIXI.Container, y: number, text: string): void {
    const t = painted(40, GOLD, '#1a1008', 7);
    t.anchor.set(0.5);
    t.position.set(0, y);
    t.text = text;
    t.eventMode = 'none';
    t.scale.set(0.3);
    parent.addChild(t);
    TweenManager.to({
      target: t.scale,
      props: { x: 1, y: 1 },
      duration: 0.34,
      ease: Ease.easeOutBack,
    });
    TweenManager.to({
      target: t,
      props: { y: y - 60, alpha: 0 },
      delay: 1.3,
      duration: 0.5,
      ease: Ease.easeInOutQuad,
    });
  }

  private _paintSignTile(
    parent: PIXI.Container,
    x: number,
    y: number,
    w: number,
    h: number,
    slot: number,
    st: ReturnType<typeof signState>,
  ): void {
    const got = slot < st.done;
    const now = slot === st.slot && st.open;
    const big = slot === SIGN_GIFTS.length - 1;
    const gold = (now || big) && !got;
    const tile = new PIXI.Container();
    tile.position.set(x, y);
    parent.addChild(tile);
    if (gold) {
      const halo = new PIXI.Graphics();
      for (let i = 4; i >= 1; i -= 1) {
        halo.beginFill(0xffc23a, 0.07).drawRoundedRect(-w / 2 - i * 7, -h / 2 - i * 7, w + i * 14, h + i * 14, 18 + i * 6).endFill();
      }
      tile.addChild(halo);
    }
    const tex = uiTex(gold ? 'settle_stamp' : 'rust_badge');
    if (tex && tex.baseTexture.valid && tex.width > 1) {
      slicePlate(tile, tex, -w / 2, -h / 2, w, h, gold ? GOLD_SLICE : RUST_SLICE, gold ? 0.36 : 0.6);
    } else {
      const g = new PIXI.Graphics();
      ironSlab(g, -w / 2, -h / 2, w, h, 10);
      tile.addChild(g);
    }
    const ink = (size: number): PIXI.Text => (gold
      ? painted(size, 0x5a1a0c, '#fff0c0', 4)
      : painted(size, CREAM, '#1a1008', 4));
    const items = lootItems(SIGN_GIFTS[slot]!);

    if (big) {
      const day = ink(24);
      day.anchor.set(0.5);
      day.position.set(-w / 2 + 92, -20);
      day.text = now ? '今天 第7天' : '第7天';
      tile.addChild(day);
      const tag = gold ? painted(42, 0xc43a28, '#fff0c0', 6) : painted(42, CREAM, '#1a1008', 6);
      tag.anchor.set(0.5);
      tag.position.set(-w / 2 + 92, 22);
      tag.text = '大礼';
      tile.addChild(tag);
      const x0 = -w / 2 + 210;
      const x1 = w / 2 - 90;
      const step = (x1 - x0) / Math.max(1, items.length - 1);
      items.forEach(([icon, n], i) => {
        const ix = x0 + i * step;
        fitSprite(tile, uiTex(icon), ix, -12, 56, 56);
        const num = ink(24);
        num.anchor.set(0.5);
        num.position.set(ix, 32);
        num.text = `×${n}`;
        tile.addChild(num);
      });
      const pitch = SIGN_PITCH[slot];
      if (pitch) {
        const p = painted(18, 0xc43a28, '#fff0c0', 4);
        p.anchor.set(0.5);
        p.position.set((x0 + x1) / 2, -h / 2 + 14);
        p.text = pitch;
        tile.addChild(p);
      }
    } else {
      const day = ink(20);
      day.anchor.set(0.5);
      day.position.set(0, -h / 2 + (gold ? 36 : 30));
      day.text = now ? `今天 第${slot + 1}天` : `第${slot + 1}天`;
      tile.addChild(day);
      const icon = items.length > 1 ? 50 : 62;
      items.forEach(([name, n], i) => {
        const ix = (i - (items.length - 1) / 2) * 84;
        fitSprite(tile, uiTex(name), ix, -8, icon, icon);
        const num = ink(22);
        num.anchor.set(0.5);
        num.position.set(ix, 32);
        num.text = `×${n}`;
        tile.addChild(num);
      });
      const pitch = SIGN_PITCH[slot];
      if (pitch) {
        const p = gold ? painted(15, 0xc43a28, '#fff0c0', 3) : painted(15, GOLD, '#1a1008', 3);
        p.anchor.set(0.5);
        p.position.set(0, h / 2 - 20);
        p.text = pitch;
        tile.addChild(p);
      }
    }

    if (got) {
      tile.alpha = 0.5;
      const mark = painted(36, 0x9be08a, '#1a1008', 6);
      mark.anchor.set(0.5);
      mark.rotation = -0.2;
      mark.text = '已领';
      tile.addChild(mark);
    }
    if (now) this._adGlow.push(tile);
  }

  private _claimSign(): void {
    const res = signClaim();
    if (!res) {
      this._render();
      return;
    }
    this._mem = grantLoot(res.gift);
    track('sign_in', { slot: res.slot });
    playSfx('win', 0);
    this._signGot = `领到啦  ${signGiftText(res.gift)}`;
    this._render();
  }

  private async _adSign(): Promise<void> {
    if (this._adBusy || !adCanShow('dailyGift')) return;
    this._adBusy = true;
    try {
      if (!(await this._watchVillageAd('dailyGift'))) return;
      adRecord('dailyGift');
      const gift = SIGN_GIFTS[signState().slot]!;
      this._mem = grantLoot(gift);
      Platform.hideToast();
      this._signGot = `又领到  ${signGiftText(gift)}`;
      playSfx('win', 0);
    } finally {
      this._adBusy = false;
      this._render();
    }
  }

  /* ---------------- 大喇叭院子 ---------------- */

  private _renderHorn(layer: PIXI.Container): void {
    this._backdrop(layer, villageHomeBgTex() ?? villageBgTex(), 0.08);
    const top = this._bar(layer);
    const height = this._height();
    warmSfx(['shout']);
    const dock = hornDockLay(height, Game.safeBottom);
    const enough = this._mem.credits >= CALL_COST;
    const waitId = this._waitId();
    const plateH = waitId ? 150 : 0;
    const plateGap = waitId ? 12 : 0;
    const contentBottom = dock.top - plateGap - plateH;
    const room = Math.max(160, contentBottom - top - 12);
    const hornH = Math.min(waitId ? 220 : 280, Math.max(140, room * (waitId ? 0.38 : 0.32)));
    const hornW = Math.round(hornH * 0.75);
    const hornCy = top + 16 + hornH / 2;

    const pole = new PIXI.Container();
    pole.position.set(375, hornCy);
    pole.eventMode = 'none';
    const spr = fitSprite(pole, uiTex('home_horn'), 0, 0, hornW, hornH);
    if (!spr) {
      this._skin(pole, 'rust_plank', 0, 0, 150, hornH, (g) => {
        ironSlab(g, -75, -hornH / 2, 150, hornH, 14);
      });
    }
    const plaque = faceOf(spr, hornW, hornH, HORN_PLAQUE);
    const count = painted(24, GOLD, '#1a1008', 4);
    count.anchor.set(0.5);
    count.position.set(plaque.x + plaque.w / 2, plaque.y + plaque.h / 2);
    count.text = `${this._mem.roster.length}/${VILLAGERS.length}`;
    pole.addChild(count);
    layer.addChild(pole);

    const hornBottom = hornCy + hornH / 2;
    const peopleRoom = contentBottom - hornBottom - 10;
    if (peopleRoom >= 100) {
      const peopleH = Math.min(150, peopleRoom);
      this._hornPeople(layer, 375, hornBottom + 10 + peopleH, peopleH);
    }
    if (waitId) this._paintWaitBoard(layer, 28, contentBottom + plateGap, 694, plateH, waitId, 'horn');
    this._btn(layer, dock.back.cx, dock.back.cy, dock.back.w, dock.back.h, '回村口', () => this._open('home'));
    this._btn(layer, dock.shout.cx, dock.shout.cy, dock.shout.w, dock.shout.h, '喊一嗓子', () => this._shout(), {
      art: 'fight_btn',
      silent: true,
      sub: enough
        ? `${CALL_COST} 工分 · 手上 ${this._mem.credits}`
        : `还差 ${CALL_COST - this._mem.credits} 工分`,
    });
  }

  /** 乡亲里标着、而且人还没来的那个 */
  private _waitId(): string {
    const id = this._mem.waitId;
    if (!id || this._mem.roster.includes(id)) return '';
    try {
      getVillager(id);
      return id;
    } catch {
      return '';
    }
  }

  /**
   * 等谁，用脸说。喇叭上写「优先叫他」，乡亲底下写「在等他」并给「去喊他」。
   * 不在这块牌子上解释新人、一半、若是。
   */
  private _paintWaitBoard(
    layer: PIXI.Container,
    x: number,
    y: number,
    w: number,
    h: number,
    id: string,
    kind: 'horn' | 'bar',
  ): void {
    const v = getVillager(id);
    const board = new PIXI.Container();
    board.position.set(x, y);
    board.eventMode = 'none';
    this._skin(board, 'rust_sheet', w / 2, h / 2, w, h, (g) => {
      ironSlab(g, 0, 0, w, h, 14);
    });
    const faceH = Math.max(72, h - 36);
    fitSprite(board, heroTex(id, 1), 86, h / 2, 118, faceH);
    const name = label(kind === 'horn' ? 32 : 26, CREAM, true);
    name.anchor.set(0, 0.5);
    name.position.set(164, h / 2 - (kind === 'horn' ? 22 : 16));
    name.text = v.name;
    board.addChild(name);
    const line = label(kind === 'horn' ? 26 : 20, GOLD, true);
    line.anchor.set(0, 0.5);
    line.position.set(164, h / 2 + (kind === 'horn' ? 20 : 16));
    line.text = kind === 'horn' ? '优先叫他' : '在等他';
    board.addChild(line);
    layer.addChild(board);
    if (kind === 'bar') {
      this._btn(layer, x + w - 112, y + h / 2, 176, 68, '去喊他', () => this._open('horn'), {
        art: 'fight_btn',
      });
    }
  }

  private _hornPeople(layer: PIXI.Container, midX: number, peopleY: number, peopleH: number): void {
    const mem = this._mem;
    const p = progressOf(mem);
    const arrive = this._arrive;
    this._arrive = '';
    const hide = !arrive ? this._pendingArrive : '';
    const front = yardPeople(mem, arrive, 6).filter((id) => id !== hide);
    const slots = yardSlots(
      front,
      front.map((id) => evoOf(p, id)),
      midX,
      peopleY,
      peopleH,
    );
    front.forEach((id, i) => {
      const v = getVillager(id);
      const slot = slots[i] ?? { x: midX, y: peopleY };
      const a = new UnitActor();
      a.bindHero(v.id, v.lane, evoOf(p, id), false);
      if (id === arrive) {
        a.place(820, slot.y, peopleH);
        a.faceToward(slot.x);
        a.walkBob = true;
        const hold = { x: 820 };
        TweenManager.to({
          target: hold,
          props: { x: slot.x },
          duration: 0.9,
          ease: Ease.easeOutCubic,
          onUpdate: () => a.place(hold.x, slot.y, peopleH),
          onComplete: () => { a.walkBob = false; },
        });
      } else {
        a.place(slot.x, slot.y, peopleH);
      }
      a.view.eventMode = 'static';
      a.view.interactiveChildren = false;
      a.view.hitArea = new PIXI.Rectangle(-48, -peopleH - 4, 96, peopleH + 10);
      bindPointerTap(a.view, () => {
        this._focus = id;
        this._open('one');
      });
      layer.addChild(a.view);
      this._actors.push(a);
    });
  }

  /* ---------------- 村民 ---------------- */

  /**
   * 条拿全村现役当 1。名单里每个人按自己当下的手艺星级算，
   * 所以你把谁喂上去，他的条就会顶到头 —— 这是条会动的前提。
   */
  private _livePeak(): FolkPeak {
    const mem = this._mem;
    const p = progressOf(mem);
    const vm = villageMul(mem.villageLv);
    const rows: { def: VillagerDef; craft: number; stars: number; villageMul: number }[] = [];
    for (const id of mem.roster) {
      let def: VillagerDef;
      try {
        def = getVillager(id);
      } catch {
        continue;
      }
      rows.push({ def, craft: craftOf(p, id), stars: starsOf(p, id), villageMul: vm });
    }
    return folkLivePeak(rows);
  }

  private _renderFolks(layer: PIXI.Container): void {
    this._backdrop(layer, villageBgTex(), 0.12);
    const top = this._bar(layer);
    const mem = this._mem;
    const p = progressOf(mem);
    const vm = villageMul(mem.villageLv);
    const owned = new Set(mem.roster);
    const seen = new Set(mem.seenIds);
    const backH = 80;
    const backY = this._height() - Game.safeBottom - 52;
    const waitId = this._waitId();
    if (this._waitSheet && owned.has(this._waitSheet)) this._waitSheet = '';
    const barH = 116;
    const barGap = 12;
    const dockTop = backY - backH / 2;
    const chipY = top + 28;
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
        this._kickPageArt('folks');
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
    const gridBot = waitId ? dockTop - barGap - barH - 8 : dockTop - 12;
    const cardW = (750 - side * 2 - gap * (cols - 1)) / cols;
    const slotH = (gridBot - gridTop - gap * (rows - 1)) / rows;
    const cardH = slotH > 72 ? slotH : 72;
    // 资源够再练一级的人。只标这些：挂一块静止的小绿牌，不闪不晃，满屏都在动就等于没标
    const ready = new Set(mem.roster.filter((id) => {
      const f = nextFeed(p, id);
      return !!f && mem.scrap >= f.scrap && mem.parts >= f.parts;
    }));
    const pick = owned.has(this._focus)
      ? this._focus
      : (shown.find((x) => ready.has(x.id))?.id ?? shown.find((x) => owned.has(x.id))?.id ?? '');

    shown.forEach((v, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = side + col * (cardW + gap);
      const y = gridTop + row * (cardH + gap);
      const has = owned.has(v.id);
      const known = has || seen.has(v.id);
      const pin = !has && mem.waitId === v.id;

      const box = new PIXI.Container();
      box.eventMode = 'static';
      box.interactiveChildren = false;
      box.position.set(x, y);
      box.hitArea = new PIXI.Rectangle(0, 0, cardW, cardH);

      this._skin(box, 'rust_tile', cardW / 2, cardH / 2, cardW, cardH, (g) => {
        ironSlab(g, 0, 0, cardW, cardH, 10);
      });
      // 卡够高才塞第三行面板数；矮了宁可不写，也别把立绘压成一条缝
      const wide = has && cardH - 76 >= 60;
      const footH = wide ? 60 : 42;
      const shade = new PIXI.Graphics();
      shade.beginFill(0x0a0604, 0.42)
        .drawRoundedRect(4, cardH - footH - 4, cardW - 8, footH, 8).endFill();
      box.addChild(shade);
      const lane = new PIXI.Graphics();
      lane.beginFill(LANE_TINT[v.lane], has ? 0.55 : 0.16)
        .drawRoundedRect(8, 7, cardW - 16, 5, 2).endFill();
      box.addChild(lane);

      const faceH = cardH - footH - 12;
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
      nm.position.set(cardW / 2, cardH - footH);
      nm.text = known ? v.name : '???';
      box.addChild(nm);

      const up = ready.has(v.id);
      const tag = label(13, up ? READY_GREEN : has ? GOLD : MUTED, true);
      tag.anchor.set(0.5, 0);
      tag.position.set(cardW / 2, cardH - footH + 20);
      const lv = craftOf(p, v.id);
      tag.text = has
        ? `${folkSignName(v.id)} Lv.${up ? `${lv}→${lv + 1}` : lv} ${stars(starsOf(p, v.id))}`.trim()
        : known ? `${LANE_NAME[v.lane]}·${JOB_NAME[jobOf(v.role)]}` : '还没见过';
      box.addChild(tag);

      if (up) {
        const bw = 64;
        const bh = 24;
        const badge = new PIXI.Container();
        badge.position.set(cardW - 10 - bw / 2, 26);
        const mark = new PIXI.Graphics();
        mark.beginFill(0x1e4a1a, 0.95).lineStyle(2, READY_GREEN, 1)
          .drawRoundedRect(-bw / 2, -bh / 2, bw, bh, 8).endFill();
        badge.addChild(mark);
        const bt = label(14, READY_GREEN, true);
        bt.anchor.set(0.5);
        bt.text = '可升级';
        badge.addChild(bt);
        box.addChild(badge);
      }

      if (wide) {
        // 20 个人里谁是主力，不该点进去才知道
        const s = statsOf(v, evoOf(p, v.id), starsOf(p, v.id), vm, craftOf(p, v.id));
        const num = label(13, 0xc4b59a, true);
        num.anchor.set(0.5, 0);
        num.position.set(cardW / 2, cardH - footH + 39);
        num.text = `${jobOf(v.role) === 'heal' ? '修' : '打'}${compactNum(s.atk)} · 抗${compactNum(s.hp)}`;
        box.addChild(num);
      }

      if ((has && v.id === pick) || pin) {
        const rim = new PIXI.Graphics();
        rim.lineStyle(4, 0xe08a28, 0.95).drawRoundedRect(2, 2, cardW - 4, cardH - 4, 10);
        box.addChild(rim);
      }
      if (pin) {
        const bw = 68;
        const bh = 26;
        const badge = new PIXI.Container();
        badge.position.set(cardW / 2, 20);
        const mark = new PIXI.Graphics();
        mark.beginFill(0xe2a84a).drawRoundedRect(-bw / 2, -bh / 2, bw, bh, 8).endFill();
        badge.addChild(mark);
        const bt = label(15, 0x2a180c, true);
        bt.anchor.set(0.5);
        bt.text = '在等';
        badge.addChild(bt);
        box.addChild(badge);
      }

      if (has) {
        bindPointerTap(box, () => {
          this._focus = v.id;
          this._open('one');
        });
      } else {
        bindPointerTap(box, () => {
          this._waitSheet = v.id;
          this._render();
        });
      }
      layer.addChild(box);
    });

    if (waitId) this._paintWaitBoard(layer, 24, dockTop - barGap - barH, 702, barH, waitId, 'bar');
    this._btn(layer, 375, backY, 710, backH, '回村口', () => this._open('home'), { art: 'rust_plank' });
    this._renderWaitSheet(layer);
  }

  /** 点没来的人：先看是谁，再按「就等他」。点牌子外面关掉。 */
  private _renderWaitSheet(layer: PIXI.Container): void {
    const id = this._waitSheet;
    if (!id || this._mem.roster.includes(id)) return;
    let v: VillagerDef;
    try {
      v = getVillager(id);
    } catch {
      this._waitSheet = '';
      return;
    }

    const height = this._height();
    const dim = new PIXI.Container();
    dim.eventMode = 'static';
    dim.hitArea = new PIXI.Rectangle(0, 0, 750, height);
    const veil = new PIXI.Graphics();
    veil.beginFill(0x100c08, 0.62).drawRect(0, 0, 750, height).endFill();
    dim.addChild(veil);
    bindPointerTap(dim, () => {
      this._waitSheet = '';
      this._render();
    }, { silent: true });
    layer.addChild(dim);

    const sheetW = 702;
    const sheetH = Math.min(560, height - Game.safeTop - Game.safeBottom - 24);
    const sheet = new PIXI.Container();
    sheet.position.set(24, height - Game.safeBottom - 12 - sheetH);
    sheet.eventMode = 'static';
    sheet.hitArea = new PIXI.Rectangle(0, 0, sheetW, sheetH);
    this._skin(sheet, 'rust_sheet', sheetW / 2, sheetH / 2, sheetW, sheetH, (g) => {
      ironSlab(g, 0, 0, sheetW, sheetH, 16);
    });
    bindPointerTap(sheet, () => {}, { silent: true });

    const btnH = 84;
    const btnCy = sheetH - 28 - btnH / 2;
    const faceBottom = btnCy - btnH / 2 - 20;
    const faceTop = 48;
    const faceH = Math.max(140, faceBottom - faceTop);
    fitSprite(sheet, heroTex(id, 1), 146, faceTop + faceH / 2, 230, faceH);

    const textX = 292;
    const textW = sheetW - textX - 40;
    const name = label(40, CREAM, true);
    name.position.set(textX, 78);
    name.text = v.name;
    sheet.addChild(name);
    const state = label(24, GOLD, true);
    state.position.set(textX, 132);
    state.text = '还没来';
    sheet.addChild(state);
    const job = label(22, CREAM, false);
    job.style.wordWrap = true;
    job.style.wordWrapWidth = textW;
    job.style.breakWords = true;
    job.style.lineHeight = 30;
    job.position.set(textX, 176);
    job.text = v.job;
    sheet.addChild(job);
    const promise = label(26, GOLD, true);
    promise.position.set(textX, Math.min(268, btnCy - btnH / 2 - 40));
    promise.text = '喊人时优先叫他';
    sheet.addChild(promise);

    this._btn(sheet, sheetW / 2, btnCy, sheetW - 96, btnH, waitAskLabel(this._waitId(), id), () => {
      this._mem = setWait(id);
      this._waitSheet = '';
      this._render();
    }, { art: 'fight_btn' });
    layer.addChild(sheet);
  }

  private _shout(): void {
    if (this._reveal.busy) return;
    if (this._mem.credits < CALL_COST) {
      playSfx('ui_tap', 0);
      Platform.showToast(`还差 ${CALL_COST - this._mem.credits} 工分`);
      return;
    }
    const res = callVillager();
    if (!res) {
      playSfx('ui_tap', 0);
      Platform.showToast(`还差 ${CALL_COST - this._mem.credits} 工分`);
      return;
    }
    this._mem = res.mem;
    track('call_villager', {
      got: res.got, is_new: res.isNew, roster: this._mem.roster.length,
    });
    this._playShout();
    this._page = 'horn';
    this._arrive = '';
    this._pendingArrive = res.isNew ? res.got : '';
    // 立绘排在院子那一串走帧前面，牌子打开时人已经在路上
    void ensureAssets(heroStillArt({
      id: res.got,
      evo: evoOf(progressOf(this._mem), res.got),
    }));
    this._kickPageArt('horn');
    this._render();
    this._reveal.open({
      got: res.got,
      isNew: res.isNew,
      starTo: res.starTo,
      rosterN: this._mem.roster.length,
      progress: progressOf(this._mem),
      height: this._height(),
      onDone: () => {
        this._arrive = this._pendingArrive;
        this._pendingArrive = '';
        this._render();
      },
    });
  }

  /** 大喇叭喊出去。压一下曲子，让这一嗓子盖过村口的背景。 */
  private _playShout(): void {
    if (this._shoutHold) TweenManager.cancelTarget(this._shoutHold);
    const hold = { t: 0 };
    this._shoutHold = hold;
    BgmPlayer.duck(true);
    playSfx('shout', 0);
    buzz('medium');
    TweenManager.to({
      target: hold,
      props: { t: 1 },
      duration: 1.15,
      onComplete: () => {
        if (this._shoutHold !== hold) return;
        this._shoutHold = null;
        BgmPlayer.duck(false);
      },
    });
  }

  /* ---------------- 单个村民 ---------------- */

  private _renderOne(layer: PIXI.Container): void {
    this._detachOneSwipe();
    this._oneIncoming = null;
    this._oneIncomingId = '';
    this._oneIncomingDelta = 0;
    this._backdrop(layer);
    const top = this._bar(layer);
    try {
      getVillager(this._focus);
    } catch {
      this._open('folks');
      return;
    }
    const feed = nextFeed(progressOf(this._mem), this._focus);
    const lay = oneFolkLay(top, this._height(), Game.safeBottom, feed ? 188 : 0);
    this._oneLay = lay;
    this._oneHeaderBottom = top;
    this._oneDockTop = lay.btnY - lay.btnH / 2;

    const track = new PIXI.Container();
    this._oneTrack = track;
    layer.addChild(track);
    const slide = new PIXI.Container();
    track.addChild(slide);
    this._paintOneSheet(slide, this._focus, lay);
    this._paintOneDock(layer, lay, this._focus);
    this._preloadOneNeighbors();
    this._attachOneSwipe();
  }

  private _browseOneIds(): string[] {
    return folkBrowseIds(this._mem.roster, this._jobFilter, this._focus);
  }

  private _paintOneSheet(parent: PIXI.Container, id: string, lay: OneFolkLay): void {
    const mem = this._mem;
    const p = progressOf(mem);
    const v = getVillager(id);
    const stage = evoOf(p, v.id);
    const craft = craftOf(p, v.id);
    const star = starsOf(p, v.id);
    const cap = craftCap(star);
    const jobName = JOB_NAME[jobOf(v.role)];
    const feed = nextFeed(p, v.id);
    const sheet = folkSheet(v, {
      craft,
      stars: star,
      stage,
      villageMul: villageMul(mem.villageLv),
      peak: this._livePeak(),
      // 喂料只动面板，形态不跟着变，所以 next 的 stage 就是现在这一身
      next: feed ? { craft: craft + 1, stage } : undefined,
    });

    fillSprite(parent, uiTex('rust_sheet'), lay.heroCx, lay.heroTop + lay.heroH / 2, lay.heroW, lay.heroH);

    const nm = label(26, GOLD, true);
    nm.anchor.set(0.5, 0);
    nm.position.set(lay.heroCx, lay.heroTop + 12);
    nm.text = `${v.name} · ${evoNameOf(v, stage)}`;
    parent.addChild(nm);

    const tag = label(16, MUTED, true);
    tag.anchor.set(0.5, 0);
    tag.position.set(lay.heroCx, lay.heroTop + 42);
    tag.text = `${LANE_NAME[v.lane]} · ${jobName}`;
    parent.addChild(tag);

    const holeTop = lay.heroTop + 68;
    const holeBot = lay.heroTop + lay.heroH - 26;
    const holeH = Math.max(80, holeBot - holeTop);
    const holeW = lay.heroW - 80;
    const tex = heroTex(v.id, stage);
    if (tex?.baseTexture.valid && tex.width > 1) {
      const scale = Math.min(holeW / tex.width, holeH / tex.height);
      standSprite(parent, tex, lay.heroCx, holeBot, holeW, holeH, scale);
    }

    paintGrowCard(parent, {
      stars: star, craft, cap, max: CRAFT_MAX, sheet,
    }, lay.plateCx, lay.growTop, lay.plateW, lay.growH);
  }

  private _paintOneDock(layer: PIXI.Container, lay: OneFolkLay, id: string): void {
    const mem = this._mem;
    const p = progressOf(mem);
    const v = getVillager(id);
    const craft = craftOf(p, v.id);
    const star = starsOf(p, v.id);
    const cap = craftCap(star);
    const feed = nextFeed(p, v.id);
    const gate = nextCapStars(star);

    this._btn(layer, lay.backCx, lay.btnY, lay.backW, lay.btnH, '回乡亲', () => this._open('folks'));

    if (!feed) {
      if (craft >= CRAFT_MAX) {
        fillSprite(layer, uiTex('fight_btn'), lay.btnCx, lay.btnY, lay.btnW, lay.btnH);
        const done = label(28, 0x2a160c, true);
        done.anchor.set(0.5);
        done.position.set(lay.btnCx, lay.btnY);
        done.text = '手艺满了';
        layer.addChild(done);
      } else {
        const form = nextEvoStars(star);
        const turn = form?.need === 1 ? evoNameOf(v, form.stage) : undefined;
        const weekUsed = mem.starWeek === starWeekKey(Date.now());
        const enough = mem.credits >= STAR_GRANT_COST;
        this._btn(layer, lay.btnCx, lay.btnY, lay.btnW, lay.btnH, '加一颗星', () => this._grantStar(v.id), {
          sub: enough
            ? `${STAR_GRANT_COST} 工分 · 手上 ${mem.credits}`
            : `还差 ${STAR_GRANT_COST - mem.credits} 工分`,
          note: weekUsed
            ? '这周加过了'
            : (turn ? `换成「${turn}」` : (gate ? '这周还能加 1 次' : `手艺上限 ${cap}`)),
          enabled: enough && !weekUsed,
          art: 'fight_btn',
        });
      }
      return;
    }
    const can = mem.scrap >= feed.scrap && mem.parts >= feed.parts;
    const next = craft + 1;
    this._paintCraftBill(layer, lay, feed.scrap, feed.parts);
    // 只差零件时把主按钮换成看视频：看完这一下就能练。废铁也差的话补零件没用，不摆。
    // 开局教打摊拿零件那一步不摆，先让人认得破电视
    const partsShort = feed.parts - mem.parts;
    if (
      !can && mem.scrap >= feed.scrap && partsShort > 0
      && this._craftStep() !== 'stall' && adCanShow('craftParts')
    ) {
      const left = adRemaining('craftParts');
      this._offerAd('craftParts', { short: partsShort });
      this._adPlate(layer, lay.btnCx, lay.btnY, lay.btnW, lay.btnH, '看视频拿零件', () => {
        void this._adCraftParts();
      }, {
        sub: `差 ${partsShort} 个 · +${CRAFT_AD_PARTS} 零件 · 今天剩 ${left} 次`,
        enabled: !this._adBusy,
        glow: true,
      });
      return;
    }
    this._btn(layer, lay.btnCx, lay.btnY, lay.btnW, lay.btnH, '再练一级', () => this._evolve(v.id), {
      sub: `Lv.${craft}→Lv.${next}`,
      enabled: can,
      art: 'fight_btn',
    });
  }

  /** 两块方铁牌：够了写手上，不够盖章写还差 */
  private _paintCraftBill(layer: PIXI.Container, lay: OneFolkLay, scrap: number, parts: number): void {
    if (lay.costH <= 0) return;
    const line = (
      name: string,
      icon: 'icon_scrap' | 'icon_parts',
      need: number,
      have: number,
    ) => {
      const gap = need - have;
      return {
        name,
        icon,
        need: compactNum(need),
        have: compactNum(have),
        short: gap > 0 ? compactNum(gap) : '',
      };
    };
    paintCraftBill(layer, [
      line('废铁', 'icon_scrap', scrap, this._mem.scrap),
      line('零件', 'icon_parts', parts, this._mem.parts),
    ], lay.costX, lay.costTop, lay.costW, lay.costH);
  }

  private _preloadOneNeighbors(): void {
    const p = progressOf(this._mem);
    for (const d of [-1, 1] as const) {
      const id = folkNeighborId(this._browseOneIds(), this._focus, d);
      if (!id) continue;
      void ensureAssets(villagerDetailImages(id, evoOf(p, id)));
    }
  }

  private _clearOneIncoming(): void {
    if (this._oneIncoming && !this._oneIncoming.destroyed) {
      this._oneIncoming.destroy({ children: true });
    }
    this._oneIncoming = null;
    this._oneIncomingId = '';
    this._oneIncomingDelta = 0;
  }

  private _ensureOneIncoming(delta: number): boolean {
    const next = folkNeighborId(this._browseOneIds(), this._focus, delta);
    const lay = this._oneLay;
    const track = this._oneTrack;
    if (!next || !lay || !track || track.destroyed) return false;
    if (this._oneIncomingId === next && this._oneIncoming && !this._oneIncoming.destroyed) {
      return true;
    }
    this._clearOneIncoming();
    const slide = new PIXI.Container();
    slide.x = delta * Game.logicWidth;
    this._paintOneSheet(slide, next, lay);
    track.addChild(slide);
    this._oneIncoming = slide;
    this._oneIncomingId = next;
    this._oneIncomingDelta = delta;
    const p = progressOf(this._mem);
    void ensureAssets(villagerDetailImages(next, evoOf(p, next)));
    return true;
  }

  private _snapOneHome(clearIncoming: boolean): void {
    const track = this._oneTrack;
    if (!track || track.destroyed) {
      if (clearIncoming) this._clearOneIncoming();
      this._oneLock = false;
      return;
    }
    TweenManager.cancelTarget(track);
    this._oneLock = true;
    TweenManager.to({
      target: track,
      props: { x: 0 },
      duration: 0.18,
      ease: Ease.easeOutCubic,
      onComplete: () => {
        if (clearIncoming) this._clearOneIncoming();
        this._oneLock = false;
      },
    });
  }

  private _commitOneIncoming(delta: number): void {
    if (!this._ensureOneIncoming(delta)) {
      this._snapOneHome(true);
      return;
    }
    const track = this._oneTrack;
    const nextId = this._oneIncomingId;
    if (!track || track.destroyed || !nextId) {
      this._snapOneHome(true);
      return;
    }
    this._oneLock = true;
    TweenManager.cancelTarget(track);
    TweenManager.to({
      target: track,
      props: { x: -delta * Game.logicWidth },
      duration: 0.24,
      ease: Ease.easeOutCubic,
      onComplete: () => {
        this._focus = nextId;
        this._oneLock = false;
        this._kickPageArt('one');
        this._render();
      },
    });
  }

  private _detachOneSwipe(): void {
    this._oneSwipeOff?.();
    this._oneSwipeOff = null;
    this._oneDragging = false;
    this._oneMoved = false;
    this._oneAxis = 'none';
  }

  private _attachOneSwipe(): void {
    this._oneSwipeOff?.();
    this._oneSwipeOff = null;
    if (this._browseOneIds().length <= 1) return;
    const threshold = 48;
    const lock = 12;
    const w = Game.logicWidth;

    const onDown = (e: Event): void => {
      if (this._oneLock || this._page !== 'one') return;
      const p = clientEventToDesign(e);
      if (isFolkOneSwipeBlocked({
        y: p.y,
        headerBottom: this._oneHeaderBottom,
        dockTop: this._oneDockTop,
      })) {
        return;
      }
      this._oneDragging = true;
      this._oneMoved = false;
      this._oneAxis = 'none';
      this._oneDelta = 0;
      this._oneStartX = p.x;
      this._oneStartY = p.y;
      this._oneLastX = p.x;
    };
    const onMove = (e: Event): void => {
      if (!this._oneDragging || this._oneLock || this._page !== 'one') return;
      const p = clientEventToDesign(e);
      const dx = p.x - this._oneStartX;
      const dy = p.y - this._oneStartY;
      if (this._oneAxis === 'none') {
        if (Math.abs(dx) < lock && Math.abs(dy) < lock) return;
        this._oneAxis = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
        if (this._oneAxis === 'v') {
          this._oneDragging = false;
          this._snapOneHome(true);
          return;
        }
      }
      if (this._oneAxis !== 'h') return;
      (e as { preventDefault?: () => void }).preventDefault?.();
      this._oneMoved = true;
      this._oneLastX = p.x;
      const delta = dx < 0 ? 1 : -1;
      if (delta !== this._oneDelta) {
        this._oneDelta = delta;
        this._ensureOneIncoming(delta);
      }
      const track = this._oneTrack;
      if (track && !track.destroyed) {
        TweenManager.cancelTarget(track);
        track.x = Math.max(-w * 0.95, Math.min(w * 0.95, dx));
      }
    };
    const onUp = (): void => {
      if (!this._oneDragging) return;
      this._oneDragging = false;
      const dx = this._oneLastX - this._oneStartX;
      const moved = this._oneMoved && this._oneAxis === 'h';
      const delta = dx < 0 ? 1 : -1;
      if (!moved || Math.abs(dx) < threshold) {
        if (moved) this._snapOneHome(true);
        return;
      }
      this._commitOneIncoming(delta);
    };

    const canvas = getTouchCanvas();
    if (Platform.isMinigame) {
      canvas.addEventListener('touchstart', onDown, { passive: true });
      canvas.addEventListener('touchmove', onMove, { passive: false });
      canvas.addEventListener('touchend', onUp);
      canvas.addEventListener('touchcancel', onUp);
      this._oneSwipeOff = () => {
        canvas.removeEventListener('touchstart', onDown);
        canvas.removeEventListener('touchmove', onMove);
        canvas.removeEventListener('touchend', onUp);
        canvas.removeEventListener('touchcancel', onUp);
      };
    } else {
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      this._oneSwipeOff = () => {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onUp);
      };
    }
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
    const craft = craftOf(p, id);
    track('evolve', { id, to: evoOf(p, id), craft, village_lv: mem.villageLv });
    playSfx('craft_up', 0);
    /*
     * 喂料只报手艺。换形态归星管（见 village.EVO_STAR_GATE），
     * 那一下在大喇叭揭晓的牌面上报，不在这里 —— 一个入口报一件事。
     */
    Platform.showToast(`${v.name} 手艺 Lv.${craft}`, 'success');
    this._render();
  }

  private _grantStar(id: string): void {
    const mem = grantStar(id);
    if (!mem) {
      const weekUsed = this._mem.starWeek === starWeekKey(Date.now());
      Platform.showToast(weekUsed ? '这周加过了' : `还差 ${Math.max(0, STAR_GRANT_COST - this._mem.credits)} 工分`);
      return;
    }
    this._mem = mem;
    const name = getVillager(id).name;
    const stars = starsOf(progressOf(mem), id);
    let toast = `${name}添了一颗星`;
    if (starOpenedEvo(stars)) {
      toast = `${name}换成了「${evoNameOf(getVillager(id), evoOf(progressOf(mem), id))}」`;
    }
    playSfx('install_on', 0);
    Platform.showToast(toast, 'success');
    this._render();
  }
}

function yardSlots(
  ids: readonly string[],
  evos: readonly number[],
  midX: number,
  midY: number,
  peopleH: number,
  maxSpan = YARD_MAX_SPAN,
): { x: number; y: number }[] {
  const widths = ids.map((id, i) => portraitWidth(id, evos[i] ?? 1, peopleH));
  return packPortraitRow(widths, midX, maxSpan).map((x) => ({ x, y: midY }));
}

/** 图鉴墙上头四个格子：路上站着的先露脸，空着写 ??? */
function atlasFaces(mem: RunMemory): Array<string | ''> {
  const ids = yardPeople(mem, '', 4);
  return [ids[0] ?? '', ids[1] ?? '', ids[2] ?? '', ids[3] ?? ''];
}
