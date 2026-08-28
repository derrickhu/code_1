/**
 * 村子主界面。对标向僵尸开炮 / 城主别慌张：
 * 主页只负责出村，废品站买肉鸽成长，图鉴是破烂柜，技能局里自己出。
 */
import * as PIXI from 'pixi.js';
import { EventBus } from '@/core/EventBus';
import { Game } from '@/core/Game';
import { BgmPlayer } from '@/core/BgmPlayer';
import { GMManager } from '@/core/GMManager';
import type { Scene } from '@/core/SceneManager';
import { SceneManager } from '@/core/SceneManager';
import { bindPointerTap } from '@/minigame';
import { deferAfterPointerEvent } from '@/utils/deferAfterPointer';
import { RosterSheet, rosterSheetHeight } from '@/ui/RosterSheet';
import {
  SQUAD_X,
  TEAM_SIZE,
  heroSpriteH,
} from '@/balance/combat';
import { DEFAULT_SQUAD, getHero, heroReachLine, placeHero } from '@/balance/heroes';
import { UnitActor } from '@/fx/UnitActor';
import { MODS, MOD_STAR_MAX, abilityTag, getMod, masteredMod, shortModName, starMarks } from '@/balance/mods';
import {
  GROWTH_BY_ID,
  PILE_CAP,
  YARD_GROWTH,
  goalLine,
  nextModStarCost,
  nextYardGoal,
  type GrowthId,
} from '@/balance/yard';
import { ladderRule } from '@/balance/ladder';
import { LAST_STAGE_ID, STAGE_COUNT, getStage } from '@/balance/stages';
import { COMBOS } from '@/balance/combos';
import {
  buyModStar,
  buyYardGrowth,
  collectPile,
  loadMemory,
  saveSquad,
  setLadderLv,
  setStageId,
  settlePile,
  type RunMemory,
} from '@/core/RunMemory';
import {
  addFitPortrait,
  fillContain,
  fillCover,
  heroTex,
  modTex,
  preloadVillageArt,
  uiTex,
  villageBgTex,
  watchArt,
  yardBgTex,
  type UiName,
} from '@/core/TextureLoader';
import { GOLD, copperRust, coverSprite, coverSpriteTop, fitSprite, goldBtn, ironSlab, label, nailCluster, nailRow, oldNail, plate, villagerColor } from '@/ui/paint';

const INK = 0x2a160c;
const CREAM = 0xfff4c4;

const CARD_W = 220;
const CARD_H = 228;
const GAP_X = 12;
const GAP_Y = 10;
/** 编队预览比局里大一圈，阵形才是焦点 */
const STAGE_SCALE = 1.62;
const STAGE_DX = 128;
const STAGE_DY = 86;

type HubPage = 'home' | 'squad' | 'book' | 'yard' | 'stars' | 'combo';
const HUB_PAGES: readonly HubPage[] = ['home', 'squad', 'book', 'yard', 'stars', 'combo'];

export class VillageScene implements Scene {
  readonly name = 'village';
  readonly container = new PIXI.Container();

  private readonly _root = new PIXI.Container();
  private readonly _layers = {} as Record<HubPage, PIXI.Container>;
  private readonly _dirty = new Set<HubPage>(HUB_PAGES);
  private _paint: PIXI.Container;
  private _page: HubPage = 'home';
  private _squad: string[] = [];
  private _focusSlot = 0;
  private _holdSlot: number | null = null;
  private _holdHero: string | null = null;
  private _pulse = 0;
  private _playBtn: PIXI.Container | null = null;
  private _hotBuy: PIXI.Container | null = null;
  private _starPage = 0;
  private _bookPage = 0;
  private _artTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private _stageActors: UnitActor[] = [];
  private _sheet: RosterSheet | null = null;
  private readonly _actors: Partial<Record<HubPage, UnitActor[]>> = {};
  private readonly _playBtns: Partial<Record<HubPage, PIXI.Container | null>> = {};
  private readonly _hotBuys: Partial<Record<HubPage, PIXI.Container | null>> = {};
  private readonly _sheets: Partial<Record<HubPage, RosterSheet | null>> = {};
  private readonly _frontYByPage: Partial<Record<HubPage, number>> = {};
  private readonly _clipByPage: Partial<Record<HubPage, number>> = {};

  constructor() {
    this.container.addChild(this._root);
    for (const p of HUB_PAGES) {
      const layer = new PIXI.Container();
      layer.visible = false;
      this._root.addChild(layer);
      this._layers[p] = layer;
    }
    this._paint = this._layers.home;
    EventBus.on('home:refresh', () => {
      if (SceneManager.current?.name !== 'village') return;
      this._staleAll();
      this._rebuild(this._page);
    });
    watchArt(() => {
      if (this._artTimer) clearTimeout(this._artTimer);
      this._artTimer = setTimeout(() => {
        this._artTimer = 0;
        // 已经铺好的主页不要为换皮拆树：按下和抬起会落在两棵按钮上，出村开打就点不着
        if (SceneManager.current?.name === 'village' && this._paint.children.length === 0) {
          this._rebuild(this._page);
        }
      }, 220);
    });
  }

  onEnter(): void {
    preloadVillageArt();
    const mem = loadMemory();
    this._squad = mem.squadIds.length === TEAM_SIZE ? [...mem.squadIds] : [...DEFAULT_SQUAD];
    saveSquad(this._squad);
    this._holdSlot = null;
    this._holdHero = null;
    this._staleAll();
    this._rebuild('home');
    BgmPlayer.play('village');
  }

  onExit(): void {
    saveSquad(this._squad);
    this._flushPages();
    BgmPlayer.stop();
  }

  update(dt: number): void {
    this._pulse += dt;
    for (const a of this._stageActors) a.update(dt);
    if (this._page === 'home' && this._playBtn) {
      this._playBtn.scale.set(1 + Math.sin(this._pulse * 2.4) * 0.025);
    }
    if (this._hotBuy) {
      this._hotBuy.scale.set(1 + Math.sin(this._pulse * 3.1) * 0.03);
    }
  }

  private _stale(...pages: HubPage[]): void {
    for (const p of pages) this._dirty.add(p);
  }

  private _staleAll(): void {
    for (const p of HUB_PAGES) this._dirty.add(p);
  }

  private _clearSheet(): void {
    this._sheet?.destroy();
    this._sheet = null;
    this._sheets[this._page] = null;
  }

  private _clearActors(): void {
    for (const a of this._stageActors) {
      if (!a.view.destroyed) a.destroy();
    }
    this._stageActors = [];
    this._actors[this._page] = [];
  }

  private _flushPages(): void {
    for (const s of Object.values(this._sheets)) s?.destroy();
    for (const list of Object.values(this._actors)) {
      for (const a of list ?? []) {
        if (!a.view.destroyed) a.destroy();
      }
    }
    for (const p of HUB_PAGES) {
      this._actors[p] = [];
      this._playBtns[p] = null;
      this._hotBuys[p] = null;
      this._sheets[p] = null;
      const layer = this._layers[p];
      layer.removeChildren().forEach((c) => {
        if (!c.destroyed) c.destroy({ children: true });
      });
      this._dirty.add(p);
    }
    this._stageActors = [];
    this._playBtn = null;
    this._hotBuy = null;
    this._sheet = null;
  }

  private _showLayer(page: HubPage): void {
    this._page = page;
    this._paint = this._layers[page];
    for (const p of HUB_PAGES) this._layers[p].visible = p === page;
    this._stageActors = this._actors[page] ?? [];
    this._playBtn = this._playBtns[page] ?? null;
    this._hotBuy = this._hotBuys[page] ?? null;
    this._sheet = this._sheets[page] ?? null;
  }

  /** 铺进隐藏层，不切显示。点按钮时只翻层，铺页放到空闲帧。 */
  private _fillLayer(page: HubPage): void {
    const keepPage = this._page;
    const keepPaint = this._paint;
    const keepActors = this._stageActors;
    const keepPlay = this._playBtn;
    const keepHot = this._hotBuy;
    const keepSheet = this._sheet;
    this._page = page;
    this._paint = this._layers[page];
    this._playBtn = null;
    this._hotBuy = null;
    this._sheet = this._sheets[page] ?? null;
    this._stageActors = this._actors[page] ?? [];
    this._clearSheet();
    this._clearActors();
    this._paint.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });
    if (page === 'squad') this._renderSquad();
    else if (page === 'book') this._renderBook();
    else if (page === 'combo') this._renderCombo();
    else if (page === 'yard') this._renderYard();
    else if (page === 'stars') this._renderStars();
    else this._renderHome();
    this._actors[page] = this._stageActors;
    this._playBtns[page] = this._playBtn;
    this._hotBuys[page] = this._hotBuy;
    this._sheets[page] = this._sheet;
    this._dirty.delete(page);
    this._layers[page].visible = false;
    this._page = keepPage;
    this._paint = keepPaint;
    this._stageActors = keepActors;
    this._playBtn = keepPlay;
    this._hotBuy = keepHot;
    this._sheet = keepSheet;
  }

  private _rebuild(page: HubPage): void {
    this._fillLayer(page);
    this._showLayer(page);
  }

  private _slotOf(actor: UnitActor): number {
    const n = actor.view.name ?? '';
    return n.startsWith('slot-') ? Number(n.slice(5)) : -1;
  }

  /** 只改呼吸、透明度、名牌和花名册，不拆树。拆树会让当下这下点落在已销毁的热区上。 */
  private _syncHold(): boolean {
    if (!this._stageActors.length) return false;
    const hold = this._holdSlot;
    const frontY = this._frontYByPage[this._page];
    if (frontY == null) return false;
    for (const actor of this._stageActors) {
      const slot = this._slotOf(actor);
      const id = slot >= 0 ? this._squad[slot] : undefined;
      if (slot < 0 || !id) continue;
      const hot = hold === slot;
      const hero = getHero(id);
      actor.holdPulse = hot;
      actor.view.alpha = hold !== null && !hot ? 0.55 : 1;
      actor.place(
        this._stageX(slot),
        this._stageY(slot, frontY),
        heroSpriteH(hero.hp) * (hot ? STAGE_SCALE + 0.18 : STAGE_SCALE),
      );
    }
    const call = this._paint.getChildByName('hold-call') as PIXI.Text | null;
    if (call) {
      if (hold !== null && this._squad[hold]) {
        call.visible = true;
        call.text = getHero(this._squad[hold]!).name;
        call.position.set(this._stageX(hold), this._stageY(hold, frontY) + 14);
      } else {
        call.visible = false;
      }
    }
    const title = this._paint.getChildByName('hold-title') as PIXI.Text | null;
    if (title) {
      const who = hold !== null && this._squad[hold] ? getHero(this._squad[hold]!).name : '';
      title.text = who ? `换掉 ${who}` : this._page === 'squad' ? '确认这仨' : '换掉 空位';
    }
    this._sheet?.refresh(this._squad, hold);
    return true;
  }

  private _replaceChangedSlots(prev: readonly string[]): boolean {
    const frontY = this._frontYByPage[this._page];
    const clip = this._clipByPage[this._page];
    if (frontY == null) return false;
    let ok = true;
    for (let slot = 0; slot < TEAM_SIZE; slot += 1) {
      if (prev[slot] === this._squad[slot]) continue;
      const old = this._stageActors.find((a) => this._slotOf(a) === slot);
      if (old) {
        this._stageActors = this._stageActors.filter((a) => a !== old);
        if (!old.view.destroyed) old.destroy();
      }
      if (!this._spawnSlot(slot, frontY, clip)) ok = false;
    }
    return ok;
  }

  private _height(): number {
    return Math.max(1334, Game.logicHeight || 1334);
  }

  /** 换页只翻层。没脏的页直接显示；要重铺的推到指针事件之后，避免点下去卡死。 */
  private _open(page: HubPage): void {
    if (this._page === 'home' && this._holdSlot !== null && page !== 'home') {
      this._dirty.add('home');
    }
    this._holdHero = null;
    if (page !== 'squad') this._holdSlot = null;
    if (page === this._page) {
      if (this._dirty.has(page)) deferAfterPointerEvent(() => this._rebuild(page));
      return;
    }
    if (this._dirty.has(page) || this._layers[page].children.length === 0) {
      deferAfterPointerEvent(() => this._rebuild(page));
      return;
    }
    this._showLayer(page);
  }

  /** 场上整块台子按距离选人，避免选中后放大的人把别人热区盖住。 */
  private _tapStageAt(dx: number, dy: number): void {
    const frontY = this._frontYByPage[this._page];
    if (frontY == null) return;
    let best = 0;
    let bestD = Infinity;
    for (let slot = 0; slot < TEAM_SIZE; slot += 1) {
      const cx = this._stageX(slot);
      const cy = this._stageY(slot, frontY) - 90;
      const d = (dx - cx) * (dx - cx) + (dy - cy) * (dy - cy);
      if (d < bestD) {
        bestD = d;
        best = slot;
      }
    }
    this._tapSlot(best);
  }

  /** 场上只点「要换掉谁」。谁上阵只从名单里点。 */
  private _tapSlot(slot: number): void {
    const next = Math.max(0, Math.min(TEAM_SIZE - 1, slot));
    if (this._holdSlot === next && this._page !== 'home') return;
    this._holdHero = null;
    const firstHome = this._page === 'home' && this._holdSlot === null;
    this._holdSlot = next;
    this._focusSlot = next;
    if (firstHome) {
      this._stale('home', 'squad');
      this._render();
      return;
    }
    if (this._syncHold()) {
      this._stale('home');
      return;
    }
    if (this._stageActors.length) {
      this._stale('home');
      return;
    }
    this._stale('home', 'squad');
    this._render();
  }

  private _tapHero(id: string): void {
    const i = this._squad.indexOf(id);
    if (i >= 0) {
      this._tapSlot(i);
      return;
    }
    this._seat(id, this._holdSlot ?? this._focusSlot);
  }

  private _seat(id: string, slot: number): void {
    const prev = [...this._squad];
    const next = placeHero(this._squad, id, slot, TEAM_SIZE);
    this._squad = next.squad;
    this._focusSlot = next.focus;
    this._holdSlot = next.focus;
    this._holdHero = null;
    saveSquad(this._squad);
    if (this._stageActors.length && this._replaceChangedSlots(prev) && this._syncHold()) {
      this._stale('home');
      return;
    }
    this._stale('home', 'squad');
    this._render();
  }

  private _launch(): void {
    if (this._squad.length < TEAM_SIZE) {
      this._open('squad');
      return;
    }
    saveSquad(this._squad);
    const mem = loadMemory();
    SceneManager.switchTo('battle', { heroIds: [...this._squad], stageId: mem.stageId });
  }

  private _backdrop(h: number, dim = 0.2, art = villageBgTex(), fadeBottom = true): void {
    const bg = new PIXI.Graphics();
    const dirt = art;
    if (dirt?.baseTexture.valid) fillCover(bg, dirt, 0, 0, 750, h);
    else bg.beginFill(0x3a2a1c).drawRect(0, 0, 750, h).endFill();
    if (dim > 0) bg.beginFill(0x120a06, dim).drawRect(0, 0, 750, h).endFill();
    bg.beginFill(0x120a06, 0.22).drawRect(0, 0, 750, 120).endFill();
    if (fadeBottom) bg.beginFill(0x120a06, 0.34).drawRect(0, h - 240, 750, 240).endFill();
    bg.eventMode = 'none';
    this._paint.addChild(bg);
  }

  private _stroke(size: number, fill: number, stroke = '#2a160c', thick = 5): PIXI.Text {
    const t = label(size, fill, true);
    t.style.stroke = stroke;
    t.style.strokeThickness = thick;
    return t;
  }

  private _woodChip(cx: number, cy: number, w: number, h: number, text: string, size = 20, name?: string): void {
    if (!fitSprite(this._paint, uiTex('wood_bar'), cx, cy, w, h)) {
      plate(this._paint.addChild(new PIXI.Graphics()), cx - w / 2, cy - h / 2, w, h, 12, 0.82);
    }
    const t = this._stroke(size, CREAM, '#1a1008', 4);
    t.anchor.set(0.5);
    t.position.set(cx, cy + 1);
    t.text = text;
    if (name) t.name = name;
    this._paint.addChild(t);
  }

  private _topBar(): number {
    const mem = loadMemory();
    const pile = settlePile();
    const top = Math.max(Game.safeTop, 24);
    const barH = 68;
    const cy = top + barH / 2;
    if (!coverSprite(this._paint, uiTex('iron_bar'), 0, top, 750, barH, 0)) {
      const g = new PIXI.Graphics();
      ironSlab(g, 0, top, 750, barH, 0);
      this._paint.addChild(g);
    }
    const barRust = new PIXI.Graphics();
    copperRust(barRust, 0, top, 750, barH);
    this._paint.addChild(barRust);
    const barNails = new PIXI.Graphics();
    nailCluster(barNails, 42, cy, 6, 3);
    nailCluster(barNails, 708, cy, 6, 11);
    this._paint.addChild(barNails);
    fitSprite(this._paint, uiTex('scrap_pile'), 46, cy, 50, 46);
    const scrap = this._stroke(20, CREAM, '#1a1008', 4);
    scrap.anchor.set(0, 0.5);
    scrap.position.set(78, cy);
    scrap.text = `废品堆 ${mem.yardScrap}`;
    this._paint.addChild(scrap);
    if (pile.pileScrap > 0) {
      const badge = new PIXI.Graphics();
      badge.beginFill(0xc44a24).drawCircle(66, top + 14, 14).endFill();
      badge.lineStyle(2, 0xfff4c4, 0.85).drawCircle(66, top + 14, 14).lineStyle(0);
      const n = this._stroke(12, CREAM, '#1a1008', 3);
      n.anchor.set(0.5);
      n.position.set(66, top + 14);
      n.text = pile.pileScrap >= PILE_CAP ? '满' : `+${pile.pileScrap}`;
      this._paint.addChild(badge, n);
      const hit = new PIXI.Container();
      hit.eventMode = 'static';
      hit.cursor = 'pointer';
      hit.hitArea = new PIXI.Rectangle(0, top, 340, barH);
      this._paint.addChild(hit);
      bindPointerTap(hit, () => {
        if (collectPile().got > 0) {
          this._staleAll();
          this._render();
        }
      });
    }
    const prog = this._stroke(20, CREAM, '#1a1008', 4);
    prog.anchor.set(1, 0.5);
    prog.position.set(726, cy);
    prog.text = `${Math.max(1, mem.stageTop)}/${STAGE_COUNT}`;
    this._paint.addChild(prog);
    return top + barH + 8;
  }

  private _titlePlaque(cx: number, cy: number, title: string, tag: string): void {
    if (!fitSprite(this._paint, uiTex('title_plaque'), cx, cy, 360, 120)) {
      plate(this._paint.addChild(new PIXI.Graphics()), cx - 180, cy - 44, 360, 88, 16, 0.88);
    }
    const t = this._stroke(28, CREAM, '#2a160c', 5);
    t.anchor.set(0.5);
    t.position.set(cx, cy + 2);
    t.text = title;
    this._paint.addChild(t);
    const s = this._stroke(15, 0xffe08a, '#2a160c', 3);
    s.anchor.set(0.5);
    s.position.set(cx, cy + 32);
    s.text = tag;
    this._paint.addChild(s);
    if (GMManager.isRuntimeAllowed) {
      const hit = new PIXI.Container();
      hit.eventMode = 'static';
      hit.hitArea = new PIXI.Rectangle(-180, -50, 360, 100);
      hit.position.set(cx, cy);
      this._paint.addChild(hit);
      bindPointerTap(hit, () => GMManager.onTitleTap());
    }
  }

  private _playPlate(
    cx: number,
    cy: number,
    title: string,
    onTap: () => void,
    maxW = 500,
    maxH = 220,
    font = 34,
    instant = false,
  ): PIXI.Container {
    const play = new PIXI.Container();
    play.eventMode = 'static';
    play.interactiveChildren = false;
    // 热区跟铁板一样大。以前只留中间一条，贴图进来后点铁板四周像没反应
    play.hitArea = new PIXI.Rectangle(-maxW * 0.48, -maxH * 0.36, maxW * 0.96, maxH * 0.72);
    if (!fitSprite(play, uiTex('play_plate'), 0, 0, maxW, maxH)) {
      const g = new PIXI.Graphics();
      goldBtn(g, -maxW * 0.38, -maxH * 0.22, maxW * 0.76, maxH * 0.44);
      play.addChild(g);
    }
    const pl = this._stroke(font, INK, '#fff4c4', 4);
    pl.anchor.set(0.5);
    pl.text = title;
    play.addChild(pl);
    play.position.set(cx, cy);
    this._paint.addChild(play);
    bindPointerTap(play, onTap, instant ? { sync: true } : undefined);
    return play;
  }

  private _shopDoor(
    icon: UiName,
    title: string,
    sub: string,
    x: number,
    y: number,
    onTap: () => void,
  ): void {
    const box = new PIXI.Container();
    box.eventMode = 'static';
    box.hitArea = new PIXI.Rectangle(-100, -88, 200, 210);
    if (!fitSprite(box, uiTex(icon), 0, -36, 200, 168)) {
      const g = new PIXI.Graphics();
      goldBtn(g, -104, -70, 208, 140);
      box.addChild(g);
    }
    if (!fitSprite(box, uiTex('wood_bar'), 0, 82, 208, 48)) {
      plate(box.addChild(new PIXI.Graphics()), -96, 62, 192, 40, 10, 0.86);
    }
    const t = this._stroke(22, CREAM, '#1a1008', 4);
    t.anchor.set(0.5);
    t.position.set(0, 76);
    t.text = title;
    const s = this._stroke(13, 0xffe08a, '#1a1008', 3);
    s.anchor.set(0.5);
    s.position.set(0, 108);
    s.text = sub;
    box.addChild(t, s);
    box.position.set(x, y);
    this._paint.addChild(box);
    bindPointerTap(box, onTap);
  }

  private _render(): void {
    this._rebuild(this._page);
  }

  private _renderHome(): void {
    if (this._holdSlot !== null) {
      this._renderHomeEdit();
      return;
    }
    const h = this._height();
    const mem = loadMemory();
    this._backdrop(h, 0.04, villageBgTex(), false);
    const y0 = this._topBar();
    const hasLadder = mem.stageId >= LAST_STAGE_ID && mem.ladderTop > 0;
    const dockH = hasLadder ? 600 : 548;
    const dockTop = h - Math.max(Game.safeBottom, 8) - dockH;
    this._drawDock(dockTop, h - dockTop);

    const lowest = dockTop - 44;
    const frontY = lowest - STAGE_DY;
    this._drawSquadStage(Math.max(y0 + 200, frontY), lowest + 8);
    const hint = this._stroke(16, CREAM, '#1a1008', 4);
    hint.anchor.set(0.5);
    hint.position.set(375, lowest);
    hint.text = '点人换阵';
    this._paint.addChild(hint);

    // 钉子在 dockTop+26，关卡条再往下，别和「点人换阵」叠在坞沿上
    let y = dockTop + 88;
    this._stageBar(y, mem);
    y += 72;
    if (hasLadder) {
      this._ladderBar(y, mem);
      y += 62;
    }
    this._playBtn = this._playPlate(375, y + 52, '出村开打', () => this._open('squad'), 640, 160, 36, true);
    const goal = nextYardGoal(mem.yardScrap, mem.growth, mem.modStars);
    const yardSub = goal.kind !== 'done' && goal.afford ? '能买' : '';
    const navY = h - Math.max(Game.safeBottom, 10) - 108;
    this._navTile('nav_squad', '叫人', '', 140, navY, () => this._open('squad'));
    this._navTile('nav_yard', '废品站', yardSub, 375, navY, () => this._open('yard'));
    this._navTile('nav_book', '图鉴', `${MODS.length}件`, 610, navY, () => this._open('book'));
  }

  private _drawDock(top: number, h: number): void {
    const tall = h + 28;
    if (!coverSpriteTop(this._paint, uiTex('iron_dock'), 0, top, 750, tall, 22)) {
      const g = new PIXI.Graphics();
      ironSlab(g, 0, top, 750, tall, 20);
      this._paint.addChild(g);
    }
    const rust = new PIXI.Graphics();
    copperRust(rust, 12, top + 8, 726, tall - 24);
    this._paint.addChild(rust);
    const nails = new PIXI.Graphics();
    nailRow(nails, 0, top + 26, 750, 9);
    oldNail(nails, 40 + (Math.sin(2.1) * 8), top + tall - 40, 7.5, 21);
    oldNail(nails, 708 + (Math.cos(1.4) * 10), top + tall - 34, 8.5, 22);
    this._paint.addChild(nails);
  }

  private _navTile(
    icon: UiName,
    title: string,
    sub: string,
    x: number,
    y: number,
    onTap: () => void,
  ): void {
    const box = new PIXI.Container();
    box.eventMode = 'static';
    box.hitArea = new PIXI.Rectangle(-96, -86, 192, 196);
    if (!fitSprite(box, uiTex(icon), 0, -16, 168, 168)) {
      const g = new PIXI.Graphics();
      ironSlab(g, -80, -80, 160, 160, 18);
      box.addChild(g);
    }
    const t = this._stroke(20, CREAM, '#1a1008', 4);
    t.anchor.set(0.5);
    t.position.set(0, 78);
    t.text = title;
    box.addChild(t);
    if (sub) {
      const s = this._stroke(13, 0xffe08a, '#1a1008', 3);
      s.anchor.set(0.5);
      s.position.set(0, 100);
      s.text = sub.startsWith('能买') ? `● ${sub}` : sub;
      box.addChild(s);
    }
    box.position.set(x, y);
    this._paint.addChild(box);
    bindPointerTap(box, onTap, { sync: true });
  }

  private _renderHomeEdit(): void {
    const h = this._height();
    this._backdrop(h, 0.22);
    const y0 = this._topBar();
    const slot = this._holdSlot ?? 0;
    const who = this._squad[slot] ? getHero(this._squad[slot]!).name : '空位';
    this._woodChip(375, y0 + 20, 520, 40, `换掉 ${who}`, 26, 'hold-title');

    const barY = h - Game.safeBottom - 72;
    const frontY = y0 + 268;
    const sheetY = frontY + STAGE_DY + 36;
    this._drawSquadStage(frontY, sheetY - 4);
    const room = Math.max(120, barY - 88 - sheetY);
    this._mountSheet(16, sheetY, 718, Math.min(rosterSheetHeight(), room));

    this._playPlate(200, barY, '换完了', () => {
      this._holdSlot = null;
      this._holdHero = null;
      this._stale('home', 'squad');
      this._render();
    }, 300, 110, 22);
    this._playBtn = this._playPlate(550, barY, '出村开打', () => this._launch(), 300, 110, 22);
  }

  private _stageX(slot: number): number {
    if (slot === 1) return SQUAD_X - STAGE_DX;
    if (slot === 2) return SQUAD_X + STAGE_DX;
    return SQUAD_X;
  }

  private _stageY(slot: number, frontY: number): number {
    return slot <= 0 ? frontY : frontY + STAGE_DY;
  }

  private _drawSquadStage(frontY: number, clipBottom?: number): void {
    this._frontYByPage[this._page] = frontY;
    if (clipBottom != null) this._clipByPage[this._page] = clipBottom;
    for (const slot of [0, 1, 2]) this._spawnSlot(slot, frontY, clipBottom);
    const call = this._stroke(26, GOLD, '#1a1008', 6);
    call.name = 'hold-call';
    call.eventMode = 'none';
    call.anchor.set(0.5, 0);
    this._paint.addChild(call);
    // 按三人实际脚位算，别用 frontY 硬减：home 页 frontY 被 Math.max 抬过，
    // clipBottom 不跟着走，硬算会把整块热区压成保底高度、罩在头顶上方。
    let top = Infinity;
    let feetLow = -Infinity;
    for (let slot = 0; slot < TEAM_SIZE; slot += 1) {
      const feet = this._stageY(slot, frontY);
      top = Math.min(top, feet - 250);
      feetLow = Math.max(feetLow, feet);
    }
    const bottom = Math.max(clipBottom ?? feetLow + 28, top + 200);
    const pad = new PIXI.Container();
    pad.name = 'stage-pad';
    pad.eventMode = 'static';
    pad.cursor = 'pointer';
    pad.hitArea = new PIXI.Rectangle(24, top, 702, bottom - top);
    this._paint.addChild(pad);
    bindPointerTap(pad, (dx, dy) => this._tapStageAt(dx, dy), { sync: true, silent: true });
    this._syncHold();
  }

  private _spawnSlot(slot: number, frontY: number, _clipBottom?: number): boolean {
    const id = this._squad[slot];
    const x = this._stageX(slot);
    const feet = this._stageY(slot, frontY);
    if (!id) {
      const empty = this._stroke(16, 0x8a90a8, '#1a1008', 3);
      empty.eventMode = 'none';
      empty.anchor.set(0.5);
      empty.position.set(x, feet - 36);
      empty.text = '空';
      this._paint.addChild(empty);
      return true;
    }
    const hero = getHero(id);
    const hot = this._holdSlot === slot;
    const actor = new UnitActor();
    actor.bindHero(id);
    actor.place(x, feet, heroSpriteH(hero.hp) * (hot ? STAGE_SCALE + 0.18 : STAGE_SCALE));
    actor.faceToward(SQUAD_X);
    actor.holdPulse = hot;
    actor.view.alpha = this._holdSlot !== null && !hot ? 0.55 : 1;
    actor.view.name = `slot-${slot}`;
    actor.view.eventMode = 'none';
    actor.view.interactiveChildren = false;
    this._paint.addChild(actor.view);
    this._stageActors.push(actor);
    actor.update(0);
    return true;
  }

  private _mountSheet(x: number, y: number, w: number, h: number): void {
    this._sheet = new RosterSheet();
    this._sheet.place(x, y, w, h, this._squad, this._holdSlot, (id) => this._tapHero(id));
    this._paint.addChild(this._sheet.view);
  }

  private _renderYard(): void {
    const h = this._height();
    const mem = loadMemory();
    this._backdrop(h, 0.18, yardBgTex());
    const y0 = this._topBar();
    this._woodChip(375, y0 + 28, 520, 56, '村里废品站', 28);
    const sub = this._stroke(16, 0xffd66b, '#2a160c', 4);
    sub.anchor.set(0.5);
    sub.position.set(375, y0 + 64);
    sub.text = '破烂局里自己出。成长改规则，升星改抽到的强度';
    this._paint.addChild(sub);

    const goal = nextYardGoal(mem.yardScrap, mem.growth, mem.modStars);
    this._woodChip(375, y0 + 104, 560, 40, goalLine(goal), 18);

    const cardW = 338;
    const cardH = 196;
    const gap = 10;
    const startX = (750 - cardW * 2 - gap) / 2;
    const startY = y0 + 136;
    YARD_GROWTH.forEach((def, i) => {
      const lv = mem.growth[def.id];
      const cost = def.costs[lv];
      const maxed = cost === undefined;
      const afford = !maxed && mem.yardScrap >= cost;
      const card = this._growthCard(def.id, lv, cost, mem.yardScrap, afford, maxed);
      card.position.set(startX + (i % 2) * (cardW + gap), startY + Math.floor(i / 2) * (cardH + gap));
      this._paint.addChild(card);
      if (!maxed) {
        bindPointerTap(card, () => {
          if (!buyYardGrowth(def.id)) return;
          this._stale('home', 'squad', 'book', 'stars', 'combo');
          this._render();
        });
      }
      if (afford && !this._hotBuy) this._hotBuy = card;
    });

    this._playPlate(220, h - Game.safeBottom - 56, '回村子', () => this._open('home'), 300, 110, 22, true);
    this._playPlate(530, h - Game.safeBottom - 56, '破烂升星', () => this._open('stars'), 300, 110, 22, true);
  }

  private _growthCard(
    id: GrowthId,
    lv: number,
    cost: number | undefined,
    have: number,
    afford: boolean,
    maxed: boolean,
  ): PIXI.Container {
    const def = GROWTH_BY_ID[id];
    const w = 338;
    const h = 196;
    const card = new PIXI.Container();
    card.eventMode = maxed ? 'none' : 'static';
    card.hitArea = new PIXI.Rectangle(0, 0, w, h);
    const rim = maxed ? 0x6fbf73 : afford ? GOLD : 0x5a5244;
    if (!coverSprite(card, uiTex('wood_panel'), 0, 0, w, h, 16)) {
      const bg = new PIXI.Graphics();
      bg.beginFill(0x1c1610, 0.92).drawRoundedRect(0, 0, w, h, 16).endFill();
      card.addChild(bg);
    }
    const frame = new PIXI.Graphics();
    frame.lineStyle(maxed || afford ? 5 : 3, rim, maxed || afford ? 0.95 : 0.55)
      .drawRoundedRect(3, 3, w - 6, h - 6, 14)
      .lineStyle(0);
    card.addChild(frame);

    const name = this._stroke(22, maxed ? 0x9be08a : CREAM, '#1a1008', 4);
    name.anchor.set(0.5, 0);
    name.position.set(w / 2, 16);
    name.text = `${def.name}  ${lv}/${def.costs.length}`;
    card.addChild(name);

    const now = label(15, maxed ? 0xc8f0c4 : 0xffe08a, true);
    now.anchor.set(0.5, 0);
    now.position.set(w / 2, 52);
    now.style.wordWrap = true;
    now.style.wordWrapWidth = w - 28;
    now.style.align = 'center';
    now.text = def.now(lv);
    card.addChild(now);

    const pitch = label(14, CREAM, true);
    pitch.anchor.set(0.5, 0);
    pitch.position.set(w / 2, 92);
    pitch.style.wordWrap = true;
    pitch.style.wordWrapWidth = w - 28;
    pitch.style.align = 'center';
    pitch.text = def.pitch;
    card.addChild(pitch);

    const tag = this._stroke(18, maxed ? 0x9be08a : afford ? GOLD : 0x8a90a8, '#1a1008', 4);
    tag.anchor.set(0.5);
    tag.position.set(w / 2, h - 28);
    tag.text = maxed
      ? '满了'
      : afford
        ? `点一下 · ${def.next(lv)} · ${cost}`
        : `还差 ${(cost ?? 0) - have}`;
    card.addChild(tag);
    return card;
  }

  private _renderStars(): void {
    const h = this._height();
    this._backdrop(h, 0.42);
    const y0 = this._topBar();
    const mem = loadMemory();
    const have = mem.yardScrap;
    const per = 6;
    const pages = Math.max(1, Math.ceil(MODS.length / per));
    this._starPage = Math.max(0, Math.min(pages - 1, this._starPage));
    const slice = MODS.slice(this._starPage * per, this._starPage * per + per);

    this._woodChip(375, y0 + 10, 620, 36, `破烂升星  ${this._starPage + 1}/${pages}`, 22);
    const tip = label(14, CREAM);
    tip.anchor.set(0.5);
    tip.position.set(375, y0 + 48);
    tip.text = '升星不改定位。下次抽到同一件，数字更猛';
    this._paint.addChild(tip);

    const cardW = 220;
    const cardH = 210;
    const gapX = 16;
    const gapY = 14;
    const startX = 375 - (cardW * 3 + gapX * 2) / 2;
    const startY = y0 + 70;
    slice.forEach((mod, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const stars = mem.modStars[mod.id] ?? 0;
      const card = this._starCard(mod.id, stars, have);
      card.position.set(startX + col * (cardW + gapX), startY + row * (cardH + gapY));
      this._paint.addChild(card);
      const cost = nextModStarCost(stars);
      if (cost !== undefined && have >= cost) {
        bindPointerTap(card, () => {
          if (!buyModStar(mod.id)) return;
          this._stale('home', 'yard', 'book');
          this._render();
        });
      }
    });

    const btnY = h - Game.safeBottom - 56;
    if (pages > 1) {
      this._playPlate(140, btnY, '上一页', () => {
        this._starPage = Math.max(0, this._starPage - 1);
        this._render();
      }, 200, 96, 22);
      this._playPlate(610, btnY, '下一页', () => {
        this._starPage = Math.min(pages - 1, this._starPage + 1);
        this._render();
      }, 200, 96, 22);
    }
    this._playPlate(375, btnY, '回废品站', () => this._open('yard'), 220, 96, 22, true);
  }

  private _starCard(id: string, stars: number, have: number): PIXI.Container {
    const w = 220;
    const h = 210;
    const cost = nextModStarCost(stars);
    const maxed = stars >= MOD_STAR_MAX;
    const afford = cost !== undefined && have >= cost;
    const shown = masteredMod(getMod(id), stars);
    const card = new PIXI.Container();
    card.eventMode = 'static';
    card.hitArea = new PIXI.Rectangle(0, 0, w, h);

    const frame = new PIXI.Graphics();
    frame.beginFill(maxed ? 0x2a3a22 : afford ? 0x3a2a18 : 0x2a241c);
    frame.drawRoundedRect(0, 0, w, h, 16);
    frame.endFill();
    frame.lineStyle(4, maxed ? 0x6a9a4a : afford ? GOLD : 0x5a5040);
    frame.drawRoundedRect(2, 2, w - 4, h - 4, 14);
    card.addChild(frame);

    const name = this._stroke(20, CREAM, '#1a1008', 4);
    name.anchor.set(0.5, 0);
    name.position.set(w / 2, 12);
    name.text = `${shortModName(shown.name)}${starMarks(stars)}`;
    card.addChild(name);

    const body = label(13, 0xffe08a, true);
    body.anchor.set(0.5, 0);
    body.position.set(w / 2, 48);
    body.style.wordWrap = true;
    body.style.wordWrapWidth = w - 20;
    body.style.align = 'center';
    body.text = shown.desc;
    card.addChild(body);

    const tag = this._stroke(16, maxed ? 0x9be08a : afford ? GOLD : 0x8a90a8, '#1a1008', 4);
    tag.anchor.set(0.5);
    tag.position.set(w / 2, h - 24);
    tag.text = maxed ? '满星' : afford ? `升一星 · ${cost}` : `还差 ${(cost ?? 0) - have}`;
    card.addChild(tag);
    return card;
  }

  private _renderSquad(): void {
    const h = this._height();
    this._backdrop(h, 0.38);
    const y0 = this._topBar();
    const who = this._holdSlot !== null && this._squad[this._holdSlot]
      ? getHero(this._squad[this._holdSlot]!).name
      : '';
    const mem = loadMemory();
    const lv = mem.ladderLv;
    const head = who ? `换掉 ${who}` : lv > 0 ? `确认这仨 · 第${lv}档 ${ladderRule(lv).name}` : '确认这仨';
    this._woodChip(375, y0 + 18, 480, 40, head, 26, 'hold-title');

    const doneY = h - Game.safeBottom - 72;
    const frontY = y0 + 268;
    const sheetY = frontY + STAGE_DY + 36;
    this._drawSquadStage(frontY, sheetY - 4);
    const room = Math.max(120, doneY - 88 - sheetY);
    this._mountSheet(16, sheetY, 718, Math.min(rosterSheetHeight(), room));
    this._playPlate(200, doneY, '回村子', () => this._open('home'), 300, 110, 22, true);
    this._playBtn = this._playPlate(550, doneY, '出村开打', () => this._launch(), 300, 110, 22);
  }

  /** 主线关卡。城主别慌张写法：1-3，左右换已解锁的关 */
  private _stageBar(y: number, mem: RunMemory): void {
    const stage = getStage(mem.stageId);
    const box = new PIXI.Container();
    const t = this._stroke(28, CREAM, '#1a1008', 6);
    t.anchor.set(0.5);
    t.position.set(0, -12);
    t.text = `${stage.label}  ${stage.name}`;
    box.addChild(t);
    const sub = this._stroke(15, 0xffd66b, '#1a1008', 4);
    sub.anchor.set(0.5);
    sub.position.set(0, 18);
    sub.text = stage.pitch;
    box.addChild(sub);
    box.position.set(375, y);
    this._paint.addChild(box);
    const prev = new PIXI.Container();
    prev.eventMode = mem.stageTop > 1 ? 'static' : 'none';
    prev.alpha = mem.stageTop > 1 ? 1 : 0.35;
    prev.hitArea = new PIXI.Rectangle(-48, -36, 96, 72);
    prev.position.set(64, y);
    const pl = this._stroke(36, CREAM, '#1a1008', 6);
    pl.anchor.set(0.5);
    pl.text = '‹';
    prev.addChild(pl);
    bindPointerTap(prev, () => {
      setStageId(mem.stageId <= 1 ? mem.stageTop : mem.stageId - 1);
      this._stale('squad');
      this._render();
    });
    const next = new PIXI.Container();
    next.eventMode = mem.stageTop > 1 ? 'static' : 'none';
    next.alpha = mem.stageTop > 1 ? 1 : 0.35;
    next.hitArea = new PIXI.Rectangle(-48, -36, 96, 72);
    next.position.set(686, y);
    const nr = this._stroke(36, CREAM, '#1a1008', 6);
    nr.anchor.set(0.5);
    nr.text = '›';
    next.addChild(nr);
    bindPointerTap(next, () => {
      setStageId(mem.stageId >= mem.stageTop ? 1 : mem.stageId + 1);
      this._stale('squad');
      this._render();
    });
    this._paint.addChild(prev, next);
  }

  /**
   * 选打哪一档。**打服照旧那一档之前根本不露出** ——
   * 局外功能一上来全开会把因难度流失的节点提前，这条是分批解锁的一部分。
   */
  private _ladderBar(y: number, mem: RunMemory): void {
    if (mem.ladderTop <= 0) return;
    const r = ladderRule(mem.ladderLv);
    const head = mem.ladderLv === 0 ? '难度：照旧' : `难度：第${mem.ladderLv}档 ${r.name}`;
    const box = new PIXI.Container();
    const t = this._stroke(20, CREAM, '#1a1008', 5);
    t.anchor.set(0, 0.5);
    t.position.set(-248, -10);
    t.text = head;
    box.addChild(t);
    const sub = this._stroke(14, 0xffd66b, '#2a160c', 4);
    sub.anchor.set(0, 0.5);
    sub.position.set(-248, 13);
    sub.text = r.pitch;
    box.addChild(sub);
    const tip = this._stroke(15, CREAM, '#2a160c', 4);
    tip.anchor.set(1, 0.5);
    tip.position.set(250, 0);
    tip.text = mem.ladderTop >= 1 ? '点一下换档 ▸' : '';
    box.addChild(tip);
    box.position.set(375, y);
    box.hitArea = new PIXI.Rectangle(-268, -30, 536, 60);
    if (mem.ladderTop >= 1) {
      box.eventMode = 'static';
      box.cursor = 'pointer';
      bindPointerTap(box, () => {
        const next = mem.ladderLv >= mem.ladderTop ? 0 : mem.ladderLv + 1;
        setLadderLv(next);
        this._stale('squad');
        this._render();
      });
    } else {
      box.eventMode = 'none';
    }
    this._paint.addChild(box);
  }

  /**
   * 村里那堆废品。攒着的时候才露出，收完就消失 ——
   * 空着挂个「0」在首页只是噪音。
   */
  private _pileChip(mem: RunMemory, y: number): void {
    const now = settlePile();
    if (now.pileScrap <= 0) return;
    const full = now.pileScrap >= PILE_CAP;
    const box = new PIXI.Container();
    const g = new PIXI.Graphics();
    g.beginFill(0x000000, 0.4).drawRoundedRect(-150, -26, 300, 52, 13).endFill();
    box.addChild(g);
    const t = this._stroke(19, full ? 0xffd66b : CREAM, '#2a160c', 5);
    t.anchor.set(0.5);
    t.position.set(0, -7);
    t.text = `废品堆攒了 ${now.pileScrap}${full ? '（满了）' : ''}`;
    box.addChild(t);
    const sub = this._stroke(14, CREAM, '#2a160c', 4);
    sub.anchor.set(0.5);
    sub.position.set(0, 14);
    sub.text = '点一下搬回来';
    box.addChild(sub);
    box.position.set(375, y + 132);
    box.eventMode = 'static';
    box.cursor = 'pointer';
    bindPointerTap(box, () => {
      const got = collectPile().got;
      if (got > 0) {
        this._staleAll();
        this._render();
      }
    });
    this._paint.addChild(box);
  }

  /**
   * 合体图鉴。纯收集，不加战力。
   *
   * **没见过的那几个不给配方**，只留一个问号 —— combos.ts 定的调子是
   * 「玩家看见的是这两件叠一起出事了」，把配方摊在柜子上就变成背表了。
   */
  private _renderCombo(): void {
    const h = this._height();
    const mem = loadMemory();
    this._backdrop(h, 0.4);
    const y0 = this._topBar();
    const seen = new Set(mem.seenCombos);
    this._woodChip(375, y0 + 28, 520, 56, `凑出来过  ${seen.size}/${COMBOS.length}`, 26);
    const sub = this._stroke(16, 0xffd66b, '#2a160c', 4);
    sub.anchor.set(0.5);
    sub.position.set(375, y0 + 64);
    sub.text = '两件破烂焊在同一个人身上，有时候会出事';
    this._paint.addChild(sub);

    const y = y0 + 96;
    const gap = 12;
    const w = Math.floor((750 - 72 - gap) / 2);
    const tall = 132;
    const x0 = (750 - (w * 2 + gap)) / 2;
    COMBOS.forEach((c, i) => {
      const own = seen.has(c.id);
      const box = new PIXI.Container();
      const g = new PIXI.Graphics();
      g.beginFill(own ? 0x3c2a18 : 0x241609, own ? 0.94 : 0.72)
        .drawRoundedRect(0, 0, w, tall, 14)
        .endFill();
      g.lineStyle(3, own ? GOLD : 0x000000, own ? 0.7 : 0.28)
        .drawRoundedRect(0, 0, w, tall, 14);
      box.addChild(g);
      const name = this._stroke(22, own ? CREAM : 0x8a7255, '#2a160c', 5);
      name.anchor.set(0.5);
      name.position.set(w / 2, 34);
      name.text = own ? c.name : '？？？';
      box.addChild(name);
      const line = this._stroke(15, own ? 0xffd66b : 0x6f5a41, '#2a160c', 4);
      line.anchor.set(0.5);
      line.position.set(w / 2, 66);
      line.text = own ? c.becomes : '还没凑出来';
      box.addChild(line);
      if (own) {
        const parts = this._stroke(14, CREAM, '#2a160c', 4);
        parts.anchor.set(0.5);
        parts.position.set(w / 2, 98);
        parts.text = c.parts.map((p) => shortModName(getMod(p).name)).join(' ＋ ');
        box.addChild(parts);
      }
      box.position.set(x0 + (i % 2) * (w + gap), y + Math.floor(i / 2) * (tall + 10));
      this._paint.addChild(box);
    });

    this._playPlate(220, h - Game.safeBottom - 56, '回破烂柜', () => this._open('book'), 300, 110, 22, true);
    this._backDoor(h, '回村子', 530);
  }

  private _renderBook(): void {
    const h = this._height();
    const mem = loadMemory();
    this._backdrop(h, 0.4);
    const y0 = this._topBar();
    this._woodChip(375, y0 + 28, 520, 56, `村里破烂柜  ${MODS.length} 件都能抽`, 26);
    const sub = this._stroke(16, 0xffd66b, '#2a160c', 4);
    sub.anchor.set(0.5);
    sub.position.set(375, y0 + 64);
    sub.text = '开打就在池子里。废品站给抽到的件升星';
    this._paint.addChild(sub);

    const per = 16;
    const pages = Math.max(1, Math.ceil(MODS.length / per));
    this._bookPage = Math.max(0, Math.min(pages - 1, this._bookPage));
    const slice = MODS.slice(this._bookPage * per, this._bookPage * per + per);
    let y = y0 + 88;
    const gutter = 36;
    const innerW = 750 - gutter * 2;
    const tGap = 10;
    const tiny = Math.floor((innerW - tGap * 3) / 4);
    const tinyH = 118;
    const tRow = tinyH + 10;
    const tStart = (750 - (tiny * 4 + tGap * 3)) / 2;
    slice.forEach((m, i) => {
      const stars = mem.modStars[m.id] ?? 0;
      const title = `${shortModName(m.name)}${starMarks(stars)}`;
      const box = this._bookTile(m.id, true, m.becomes, title, tiny, tinyH);
      box.position.set(tStart + (i % 4) * (tiny + tGap), y + Math.floor(i / 4) * tRow);
      this._paint.addChild(box);
    });
    if (pages > 1) {
      const btnY = h - Game.safeBottom - 56;
      this._playPlate(80, btnY, '‹', () => {
        this._bookPage = Math.max(0, this._bookPage - 1);
        this._render();
      }, 88, 88, 28);
      this._playPlate(670, btnY, '›', () => {
        this._bookPage = Math.min(pages - 1, this._bookPage + 1);
        this._render();
      }, 88, 88, 28);
    }

    if (mem.seenCombos.length > 0) {
      this._playPlate(220, h - Game.safeBottom - 56, '看合体', () => this._open('combo'), 300, 110, 22, true);
    } else {
      this._playPlate(220, h - Game.safeBottom - 56, '去废品站', () => this._open('yard'), 300, 110, 22, true);
    }
    this._backDoor(h, '回村子', 530);
  }

  private _bookTile(
    id: string,
    own: boolean,
    line: string,
    title: string,
    w: number,
    h: number,
  ): PIXI.Container {
    const box = new PIXI.Container();
    const radius = 14;
    const bg = new PIXI.Graphics();
    bg.beginFill(own ? 0x1c1610 : 0x12100c, 0.92).drawRoundedRect(0, 0, w, h, radius).endFill();
    bg.lineStyle(2, own ? 0x6fbf73 : 0x5a5244, own ? 0.85 : 0.5).drawRoundedRect(0, 0, w, h, radius).lineStyle(0);
    box.addChild(bg);

    const wide = w > 200;
    const pad = 10;
    const nameReserve = wide ? 0 : 36;
    const tex = modTex(id);
    if (tex?.baseTexture.valid && tex.width > 1) {
      const g = new PIXI.Graphics();
      if (wide) {
        const colW = 78;
        const max = Math.min(own ? 56 : 48, colW - 8, h - pad * 2);
        fillContain(g, tex, pad + colW / 2, (h + max) / 2, max, max);
      } else {
        const max = Math.min(own ? 56 : 48, w - pad * 2, h - nameReserve - pad);
        fillContain(g, tex, w / 2, pad + max, max, max);
      }
      // 图标走 fillContain，本来就缩在框内，不需要每格再挂一块 mask。
      // 一页 16 格 = 16 次 mask 进出模板缓冲，批渲染被打断，整页都跟着迟滞。
      g.alpha = own ? 1 : 0.32;
      box.addChild(g);
    }

    const name = this._stroke(wide ? 18 : 14, own ? CREAM : 0x8a90a8, '#1a1008', 3);
    name.anchor.set(wide ? 0 : 0.5, 0);
    name.position.set(wide ? 96 : w / 2, wide ? 12 : h - nameReserve);
    name.text = title;
    box.addChild(name);
    if (wide) {
      const tip = label(14, own ? 0xffe08a : 0x8a90a8, true);
      tip.position.set(96, 44);
      tip.style.wordWrap = true;
      tip.style.wordWrapWidth = w - 112;
      tip.text = line;
      box.addChild(tip);
    }
    return box;
  }

  private _backDoor(h: number, text: string, x = 375): void {
    this._playPlate(x, h - Game.safeBottom - 56, text, () => this._open('home'), 300, 110, 22, true);
  }

  private _card(id: string, picked?: number, focused = false): PIXI.Container {
    const def = getHero(id);
    const card = new PIXI.Container();
    card.eventMode = 'static';
    card.hitArea = new PIXI.Rectangle(0, 0, CARD_W, CARD_H);
    const color = villagerColor(id);
    const faceH = 128;
    const bg = new PIXI.Graphics();
    bg.beginFill(0xfff6df).drawRoundedRect(0, 0, CARD_W, CARD_H, 18).endFill();
    bg.beginFill(color, 0.18).drawRoundedRect(8, 8, CARD_W - 16, faceH - 10, 14).endFill();
    bg.lineStyle(focused ? 7 : picked !== undefined ? 5 : 4, focused ? GOLD : picked !== undefined ? 0xc9a46a : color, 1)
      .drawRoundedRect(3, 3, CARD_W - 6, CARD_H - 6, 16)
      .lineStyle(0);
    card.addChild(bg);

    const portrait = heroTex(id);
    if (portrait?.baseTexture.valid && portrait.width > 1) {
      addFitPortrait(card, portrait, 10, 8, CARD_W - 20, faceH - 12, 14);
    } else {
      const sw = new PIXI.Graphics();
      sw.beginFill(color, 0.9).drawRoundedRect(CARD_W / 2 - 36, 32, 72, 72, 16).endFill();
      card.addChild(sw);
    }

    const name = label(20, 0x2a160c, true);
    name.anchor.set(0.5, 0);
    name.position.set(CARD_W / 2, faceH + 2);
    name.text = def.name;
    card.addChild(name);

    const job = label(14, 0x8a5a2b, true);
    job.anchor.set(0.5, 0);
    job.position.set(CARD_W / 2, faceH + 26);
    job.text = `${def.job} · ${heroReachLine(def.range)} · ${abilityTag(def.skill)}`;
    card.addChild(job);

    const eats = label(13, 0x3d2a1c);
    eats.anchor.set(0.5, 0);
    eats.position.set(CARD_W / 2, faceH + 46);
    eats.style.wordWrap = true;
    eats.style.wordWrapWidth = CARD_W - 20;
    eats.style.align = 'center';
    eats.text = def.eats;
    card.addChild(eats);

    if (picked !== undefined) {
      const badge = new PIXI.Graphics();
      badge.beginFill(focused ? GOLD : 0xc9a46a).drawCircle(CARD_W - 22, 22, 16).endFill();
      const n = label(16, 0x2a160c, true);
      n.anchor.set(0.5);
      n.position.set(CARD_W - 22, 22);
      n.text = String(picked + 1);
      card.addChild(badge, n);
    }
    return card;
  }
}
