/**
 * 村子主界面。对标 Brotato 解锁店 / 幸存者图鉴柜：
 * 主页只负责出村，废品站是能逛的货架房，图鉴是柜墙，不养人物等级。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import type { Scene } from '@/core/SceneManager';
import { SceneManager } from '@/core/SceneManager';
import { bindPointerTap } from '@/minigame';
import {
  BACK_DY,
  SLOT_NAME,
  SQUAD_X,
  TEAM_SIZE,
  heroSpriteH,
  slotScreenX,
  slotScreenY,
  slotTagPos,
} from '@/balance/combat';
import { DEFAULT_SQUAD, HEROES, getHero, placeHero } from '@/balance/heroes';
import { UnitActor } from '@/fx/UnitActor';
import { MODS, abilityTag, getMod, shortModName } from '@/balance/mods';
import {
  YARD_UNLOCKS,
  availableMods,
  goalLine,
  isModUnlocked,
  nextStartScrapCost,
  nextYardGoal,
  rollVillageGift,
  startScrapBonus,
} from '@/balance/yard';
import {
  buyStartScrap,
  buyYardUnlock,
  loadMemory,
  saveSquad,
  stashNextGift,
  stashNextPin,
} from '@/core/RunMemory';
import {
  adCanShow,
  adIsFirstRunToday,
  adRecord,
} from '@/core/AdDay';
import { track } from '@/core/Analytics';
import { Platform } from '@/core/PlatformService';
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
import { GOLD, coverSprite, fitSprite, goldBtn, homeTerrace, plate } from '@/ui/paint';

const INK = 0x2a160c;
const CREAM = 0xfff4c4;

const CARD_W = 220;
const CARD_H = 228;
const GAP_X = 12;
const GAP_Y = 10;

const TINT: Readonly<Record<string, number>> = {
  tiezhu: 0xc4703a,
  dachui: 0xd9a13b,
  laoli: 0xb4553f,
  erjiu: 0xa8823f,
  sanshen: 0xd4736b,
  laoyanqiang: 0x8f7a4a,
};

type HubPage = 'home' | 'squad' | 'book' | 'yard' | 'ready';

function label(size: number, color = 0xffffff, bold = false): PIXI.Text {
  return new PIXI.Text('', {
    fontFamily: 'sans-serif',
    fontSize: size,
    fontWeight: bold ? 'bold' : 'normal',
    fill: color,
  });
}

export class VillageScene implements Scene {
  readonly name = 'village';
  readonly container = new PIXI.Container();

  private readonly _root = new PIXI.Container();
  private _page: HubPage = 'home';
  private _squad: string[] = [];
  private _focusSlot = 0;
  private _busy = false;
  private _pulse = 0;
  private _playBtn: PIXI.Container | null = null;
  private _hotBuy: PIXI.Container | null = null;
  private _artTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private _stageActors: UnitActor[] = [];

  constructor() {
    this.container.addChild(this._root);
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
    const mem = loadMemory();
    this._squad = mem.squadIds.length === TEAM_SIZE ? [...mem.squadIds] : [...DEFAULT_SQUAD];
    saveSquad(this._squad);
    this._page = 'home';
    this._busy = false;
    this._render();
  }

  onExit(): void {
    saveSquad(this._squad);
    this._clearActors();
  }

  update(dt: number): void {
    this._pulse += dt;
    for (const a of this._stageActors) a.update(dt);
    if ((this._page === 'home' || this._page === 'ready') && this._playBtn) {
      this._playBtn.scale.set(1 + Math.sin(this._pulse * 2.4) * 0.025);
    }
    if (this._hotBuy) {
      this._hotBuy.scale.set(1 + Math.sin(this._pulse * 3.1) * 0.03);
    }
  }

  private _clearActors(): void {
    for (const a of this._stageActors) {
      if (!a.view.destroyed) a.destroy();
    }
    this._stageActors = [];
  }

  private _height(): number {
    return Math.max(1334, Game.logicHeight || 1334);
  }

  private _open(page: HubPage): void {
    this._page = page;
    this._render();
  }

  private _place(id: string): void {
    const next = placeHero(this._squad, id, this._focusSlot, TEAM_SIZE);
    this._squad = next.squad;
    this._focusSlot = next.focus;
    saveSquad(this._squad);
    this._render();
  }

  private _focus(slot: number): void {
    this._focusSlot = Math.max(0, Math.min(TEAM_SIZE - 1, slot));
    if (this._page !== 'squad') this._open('squad');
    else this._render();
  }

  private _goFight(): void {
    if (this._squad.length < TEAM_SIZE) {
      this._open('squad');
      return;
    }
    if (this._page !== 'ready') {
      this._open('ready');
      return;
    }
    this._launch();
  }

  private _launch(): void {
    if (this._squad.length < TEAM_SIZE) {
      this._open('squad');
      return;
    }
    saveSquad(this._squad);
    SceneManager.switchTo('battle', { heroIds: [...this._squad] });
  }

  private async _watch(placement: 'dailyGift' | 'junkyard'): Promise<boolean> {
    track('ad_show', { placement, wave: 0 });
    const ok = await Platform.showRewardedVideo();
    track('ad_close', { placement, wave: 0, completed: ok });
    return ok;
  }

  private async _claimGift(): Promise<void> {
    if (this._busy || !adCanShow('dailyGift') || !adIsFirstRunToday()) return;
    this._busy = true;
    const ok = await this._watch('dailyGift');
    if (ok) {
      adRecord('dailyGift');
      const mem = loadMemory();
      const gift = rollVillageGift(mem.unlockedMods, [mem.nextPinModId, mem.nextGiftModId]);
      if (gift) stashNextGift(gift.id);
    }
    this._busy = false;
    this._render();
  }

  private async _claimPin(): Promise<void> {
    if (this._busy || !adCanShow('junkyard')) return;
    this._busy = true;
    const ok = await this._watch('junkyard');
    if (ok) {
      adRecord('junkyard');
      const mem = loadMemory();
      const found = rollVillageGift(mem.unlockedMods, [mem.nextPinModId, mem.nextGiftModId]);
      if (found) stashNextPin(found.id);
    }
    this._busy = false;
    this._render();
  }

  private _backdrop(h: number, dim = 0.2, art = villageBgTex()): void {
    const bg = new PIXI.Graphics();
    const dirt = art;
    if (dirt?.baseTexture.valid) fillCover(bg, dirt, 0, 0, 750, h);
    else bg.beginFill(0x3a2a1c).drawRect(0, 0, 750, h).endFill();
    if (dim > 0) bg.beginFill(0x120a06, dim).drawRect(0, 0, 750, h).endFill();
    bg.beginFill(0x120a06, 0.28).drawRect(0, 0, 750, 150).endFill();
    bg.beginFill(0x120a06, 0.34).drawRect(0, h - 240, 750, 240).endFill();
    this._root.addChild(bg);
  }

  private _stroke(size: number, fill: number, stroke = '#2a160c', thick = 5): PIXI.Text {
    const t = label(size, fill, true);
    t.style.stroke = stroke;
    t.style.strokeThickness = thick;
    return t;
  }

  private _woodChip(cx: number, cy: number, w: number, h: number, text: string, size = 20): void {
    if (!fitSprite(this._root, uiTex('wood_bar'), cx, cy, w, h)) {
      plate(this._root.addChild(new PIXI.Graphics()), cx - w / 2, cy - h / 2, w, h, 12, 0.82);
    }
    const t = this._stroke(size, CREAM, '#1a1008', 4);
    t.anchor.set(0.5);
    t.position.set(cx, cy + 1);
    t.text = text;
    this._root.addChild(t);
  }

  private _topBar(): number {
    const mem = loadMemory();
    const top = Math.max(Game.safeTop, 80);
    const cy = top + 24;
    fitSprite(this._root, uiTex('scrap_pile'), 52, cy, 56, 52);
    this._woodChip(220, cy, 250, 52, `废品堆 ${mem.yardScrap}`, 20);
    this._woodChip(
      560,
      cy,
      280,
      52,
      mem.highestWave > 0 ? `最高第 ${mem.highestWave} 波` : '还没出过村',
      20,
    );
    return top + 68;
  }

  private _titlePlaque(cx: number, cy: number, title: string, tag: string): void {
    if (!fitSprite(this._root, uiTex('title_plaque'), cx, cy, 420, 300)) {
      plate(this._root.addChild(new PIXI.Graphics()), cx - 210, cy - 70, 420, 140, 16, 0.88);
    }
    const t = this._stroke(36, CREAM, '#2a160c', 6);
    t.anchor.set(0.5);
    t.position.set(cx, cy + 10);
    t.text = title;
    this._root.addChild(t);
    const s = this._stroke(18, 0xffd66b, '#2a160c', 4);
    s.anchor.set(0.5);
    s.position.set(cx, cy + 52);
    s.text = tag;
    this._root.addChild(s);
  }

  private _playPlate(
    cx: number,
    cy: number,
    title: string,
    onTap: () => void,
    maxW = 500,
    maxH = 220,
    font = 34,
  ): PIXI.Container {
    const play = new PIXI.Container();
    play.eventMode = 'static';
    const hitW = Math.min(380, maxW * 0.76);
    const hitH = Math.min(92, maxH * 0.46);
    play.hitArea = new PIXI.Rectangle(-hitW / 2, -hitH / 2, hitW, hitH);
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
    this._root.addChild(play);
    bindPointerTap(play, onTap);
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
    box.hitArea = new PIXI.Rectangle(-108, -150, 216, 230);
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
    this._root.addChild(box);
    bindPointerTap(box, onTap);
  }

  private _render(): void {
    this._playBtn = null;
    this._hotBuy = null;
    this._clearActors();
    this._root.removeChildren().forEach((c) => {
      if (!c.destroyed) c.destroy({ children: true });
    });
    if (this._page === 'squad') this._renderSquad();
    else if (this._page === 'book') this._renderBook();
    else if (this._page === 'yard') this._renderYard();
    else if (this._page === 'ready') this._renderReady();
    else this._renderHome();
  }

  private _renderHome(): void {
    const h = this._height();
    const mem = loadMemory();
    this._backdrop(h, 0.12);
    const y0 = this._topBar();
    this._titlePlaque(375, y0 + 118, '村口大战外星人', '焊点村里破烂，把闲人改成猛货');

    const doorY = h - Game.safeBottom - 128;
    const playY = Math.min(doorY - 214, Math.max(y0 + 430, Math.round(h * 0.62)));
    const frontY = playY - 168;

    this._drawSquadStage(frontY, true);
    const goal = nextYardGoal(mem.yardScrap, mem.unlockedMods, mem.startScrapLv);

    this._playBtn = this._playPlate(375, playY, '出村开打', () => this._goFight());

    let noteY = playY + 78;
    if (mem.nextGiftModId) {
      this._woodChip(375, noteY, 420, 36, `开局焊上：${getMod(mem.nextGiftModId).name}`, 16);
      noteY += 38;
    } else if (adCanShow('dailyGift') && adIsFirstRunToday()) {
      this._root.addChild(this._chip('看一段，开局自动焊一件', 375, noteY, () => {
        void this._claimGift();
      }));
      noteY += 42;
    }
    if (mem.nextPinModId) {
      this._woodChip(375, noteY, 420, 36, `下一手必出：${getMod(mem.nextPinModId).name}`, 16);
    } else if (adCanShow('junkyard')) {
      this._root.addChild(this._chip('翻一件，下一手三选一必出', 375, noteY, () => {
        void this._claimPin();
      }));
    }

    const pool = availableMods(mem.unlockedMods).length;
    this._shopDoor('door_squad', '叫人', '换前排／左后／右后', 135, doorY, () => this._open('squad'));
    this._shopDoor('door_yard', '废品站', goalLine(goal), 375, doorY, () => this._open('yard'));
    this._shopDoor('door_book', '图鉴', `池子 ${pool}/${MODS.length}`, 615, doorY, () => this._open('book'));
  }

  private _drawSquadStage(frontY: number, pick = false): void {
    const dirt = new PIXI.Graphics();
    homeTerrace(dirt, SQUAD_X, frontY, frontY + BACK_DY);
    this._root.addChild(dirt);

    const drawOrder = [1, 2, 0];
    for (const slot of drawOrder) {
      const id = this._squad[slot];
      const x = slotScreenX(slot);
      const feet = slotScreenY(slot, frontY);
      if (id) {
        const hero = getHero(id);
        const actor = new UnitActor();
        actor.bindHero(id);
        actor.place(x, feet, heroSpriteH(hero.hp));
        actor.faceToward(SQUAD_X);
        actor.view.zIndex = 20 - slot;
        this._root.addChild(actor.view);
        this._stageActors.push(actor);
        actor.update(0);
      } else {
        const empty = this._stroke(16, 0x8a90a8, '#1a1008', 3);
        empty.anchor.set(0.5);
        empty.position.set(x, feet - 36);
        empty.text = '空';
        this._root.addChild(empty);
      }
      const hot = pick && slot === this._focusSlot;
      if (hot) {
        const mark = new PIXI.Graphics();
        mark.lineStyle(4, GOLD, 0.95).moveTo(x - 30, feet + 10).lineTo(x + 30, feet + 10).lineStyle(0);
        this._root.addChild(mark);
      }
      const tag = this._stroke(14, hot ? GOLD : 0xffe08a, '#2a160c', 3);
      tag.anchor.set(0.5, 0);
      const at = slotTagPos(slot, x, feet);
      tag.position.set(at.x, at.y);
      tag.text = id ? `${SLOT_NAME[slot]}  ${getHero(id).name}` : SLOT_NAME[slot] ?? '空';
      this._root.addChild(tag);

      if (pick) {
        const hit = new PIXI.Container();
        hit.eventMode = 'static';
        hit.position.set(x, feet);
        hit.hitArea = new PIXI.Rectangle(-48, -118, 96, 148);
        this._root.addChild(hit);
        bindPointerTap(hit, () => this._focus(slot));
      }
    }
  }

  private _renderReady(): void {
    const h = this._height();
    this._backdrop(h, 0.28);
    const y0 = this._topBar();
    this._woodChip(375, y0 + 28, 560, 52, '就这仨出村？', 28);
    const sub = this._stroke(16, 0xffd66b, '#2a160c', 4);
    sub.anchor.set(0.5);
    sub.position.set(375, y0 + 64);
    sub.text = '前排先挨打。不对就换人，对了再出村';
    this._root.addChild(sub);

    const frontY = Math.round(h * 0.42);
    this._drawSquadStage(frontY, false);

    this._playPlate(200, frontY + BACK_DY + 118, '再换人', () => this._open('squad'), 300, 130, 24);
    this._playBtn = this._playPlate(550, frontY + BACK_DY + 118, '出村开打', () => this._launch(), 300, 130, 24);
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
    sub.text = '点货架上的破烂，买进下一局的池子';
    this._root.addChild(sub);

    const goal = nextYardGoal(mem.yardScrap, mem.unlockedMods, mem.startScrapLv);
    this._woodChip(375, y0 + 104, 560, 40, goalLine(goal), 18);

    const cardW = 338;
    const cardH = 248;
    const gap = 12;
    const startX = (750 - cardW * 2 - gap) / 2;
    const startY = y0 + 136;
    YARD_UNLOCKS.forEach((u, i) => {
      const owned = mem.unlockedMods.includes(u.modId);
      const afford = !owned && mem.yardScrap >= u.cost;
      const card = this._shelfCard(u.modId, owned, afford, u.cost, mem.yardScrap);
      card.position.set(startX + (i % 2) * (cardW + gap), startY + Math.floor(i / 2) * (cardH + gap));
      this._root.addChild(card);
      if (!owned) {
        bindPointerTap(card, () => {
          if (!buyYardUnlock(u.modId)) return;
          this._render();
        });
      }
      if (afford && !this._hotBuy) this._hotBuy = card;
    });

    const pocketY = startY + 2 * (cardH + gap) + 8;
    const nextCost = nextStartScrapCost(mem.startScrapLv);
    const pocket = this._pocketCard(mem.startScrapLv, nextCost, mem.yardScrap);
    pocket.position.set(36, pocketY);
    this._root.addChild(pocket);
    if (nextCost !== undefined) {
      bindPointerTap(pocket, () => {
        if (!buyStartScrap()) return;
        this._render();
      });
      if (mem.yardScrap >= nextCost && !this._hotBuy) this._hotBuy = pocket;
    }

    this._backDoor(h, '回村子');
  }

  private _shelfCard(
    id: string,
    owned: boolean,
    afford: boolean,
    cost: number,
    have: number,
  ): PIXI.Container {
    const def = getMod(id);
    const w = 338;
    const h = 248;
    const card = new PIXI.Container();
    card.eventMode = 'static';
    card.hitArea = new PIXI.Rectangle(0, 0, w, h);
    const rim = owned ? 0x6fbf73 : afford ? GOLD : 0x5a5244;
    if (!coverSprite(card, uiTex('wood_panel'), 0, 0, w, h, 16)) {
      const bg = new PIXI.Graphics();
      bg.beginFill(0x1c1610, 0.92).drawRoundedRect(0, 0, w, h, 16).endFill();
      card.addChild(bg);
    }
    const frame = new PIXI.Graphics();
    frame.lineStyle(owned ? 5 : 3, rim, owned || afford ? 0.95 : 0.55)
      .drawRoundedRect(3, 3, w - 6, h - 6, 14)
      .lineStyle(0);
    card.addChild(frame);

    const tex = modTex(id);
    if (tex?.baseTexture.valid && tex.width > 1) {
      const g = new PIXI.Graphics();
      fillContain(g, tex, w / 2, 108, owned || afford ? 96 : 82, owned || afford ? 96 : 82);
      if (!owned) g.alpha = afford ? 0.95 : 0.38;
      card.addChild(g);
    }

    const name = this._stroke(20, owned ? 0x9be08a : CREAM, '#1a1008', 4);
    name.anchor.set(0.5, 0);
    name.position.set(w / 2, 116);
    name.text = shortModName(def.name);
    card.addChild(name);

    const become = label(15, owned ? 0xc8f0c4 : 0xffe08a, true);
    become.anchor.set(0.5, 0);
    become.position.set(w / 2, 144);
    become.style.wordWrap = true;
    become.style.wordWrapWidth = w - 28;
    become.style.align = 'center';
    become.text = def.becomes;
    card.addChild(become);

    const tag = this._stroke(18, owned ? 0x9be08a : afford ? GOLD : 0x8a90a8, '#1a1008', 4);
    tag.anchor.set(0.5);
    tag.position.set(w / 2, h - 28);
    tag.text = owned
      ? '进池子了'
      : afford
        ? `点一下买进池子 · ${cost}`
        : `还差 ${cost - have}`;
    card.addChild(tag);
    return card;
  }

  private _pocketCard(level: number, cost: number | undefined, have: number): PIXI.Container {
    const w = 678;
    const h = 92;
    const card = new PIXI.Container();
    card.eventMode = cost === undefined ? 'none' : 'static';
    card.hitArea = new PIXI.Rectangle(0, 0, w, h);
    const afford = cost !== undefined && have >= cost;
    if (!coverSprite(card, uiTex('wood_panel'), 0, 0, w, h, 14)) {
      plate(card.addChild(new PIXI.Graphics()), 0, 0, w, h, 14, 0.9);
    }
    fitSprite(card, uiTex('scrap_pile'), 48, 46, 64, 58);
    const name = this._stroke(20, CREAM, '#1a1008', 4);
    name.position.set(88, 16);
    name.text = cost === undefined
      ? `开局口袋 +${startScrapBonus(level)} · 满了`
      : `开局口袋 +${startScrapBonus(level)} → +${startScrapBonus(level + 1)}`;
    card.addChild(name);
    const pitch = label(15, 0xffe08a, true);
    pitch.position.set(88, 50);
    pitch.text = cost === undefined ? '下一局零钱已经够花' : '买的是开场口袋里先有的零钱';
    card.addChild(pitch);
    const tag = this._stroke(18, cost === undefined ? 0x9be08a : afford ? GOLD : 0x8a90a8, '#1a1008', 4);
    tag.anchor.set(1, 0.5);
    tag.position.set(w - 22, h / 2);
    tag.text = cost === undefined ? '满了' : afford ? `点一下 · ${cost}` : `还差 ${cost - have}`;
    card.addChild(tag);
    return card;
  }

  private _renderSquad(): void {
    const h = this._height();
    this._backdrop(h, 0.38);
    const y0 = this._topBar();
    this._woodChip(375, y0 + 26, 560, 52, '换谁出村', 28);
    const sub = this._stroke(16, 0xffd66b, '#2a160c', 4);
    sub.anchor.set(0.5);
    sub.position.set(375, y0 + 62);
    sub.text = '点上面位子，再点下面的人换上去';
    this._root.addChild(sub);

    const frontY = y0 + 196;
    this._drawSquadStage(frontY, true);

    const cols = 3;
    const totalW = cols * CARD_W + (cols - 1) * GAP_X;
    const startX = (750 - totalW) / 2;
    const startY = frontY + BACK_DY + 56;
    HEROES.forEach((hero, i) => {
      const picked = this._squad.indexOf(hero.id);
      const card = this._card(hero.id, picked >= 0 ? picked : undefined, picked === this._focusSlot);
      card.position.set(startX + (i % cols) * (CARD_W + GAP_X), startY + Math.floor(i / cols) * (CARD_H + GAP_Y));
      this._root.addChild(card);
      bindPointerTap(card, () => this._place(hero.id));
    });

    const doneY = Math.min(startY + 2 * (CARD_H + GAP_Y) + 36, h - Game.safeBottom - 160);
    this._playPlate(375, doneY, '就这仨', () => this._open('home'), 380, 140, 28);
  }

  private _renderBook(): void {
    const h = this._height();
    const mem = loadMemory();
    this._backdrop(h, 0.4);
    const y0 = this._topBar();
    const ownN = availableMods(mem.unlockedMods).length;
    this._woodChip(375, y0 + 28, 520, 56, `村里破烂柜  ${ownN}/${MODS.length}`, 26);
    const sub = this._stroke(16, 0xffd66b, '#2a160c', 4);
    sub.anchor.set(0.5);
    sub.position.set(375, y0 + 64);
    sub.text = '绿的在池子里。灰的点一下去废品站搬';
    this._root.addChild(sub);

    let y = y0 + 88;
    const starters = MODS.filter((m) => !YARD_UNLOCKS.some((u) => u.modId === m.id));
    const shop = YARD_UNLOCKS.map((u) => getMod(u.modId));

    this._woodChip(375, y + 6, 360, 28, '村里本来就有', 15);
    y += 28;
    const tiny = 160;
    const tGap = 10;
    const tStart = (750 - tiny * 4 - tGap * 3) / 2;
    starters.forEach((m, i) => {
      const box = this._bookTile(m.id, true, m.becomes, shortModName(m.name), tiny, 118);
      box.position.set(tStart + (i % 4) * (tiny + tGap), y + Math.floor(i / 4) * 128);
      this._root.addChild(box);
    });
    y += Math.ceil(starters.length / 4) * 128 + 8;

    this._woodChip(375, y + 6, 360, 28, '废品站搬来的', 15);
    y += 28;
    const wide = 338;
    const tall = 156;
    const wStart = (750 - wide * 2 - 12) / 2;
    shop.forEach((m, i) => {
      const own = isModUnlocked(m.id, mem.unlockedMods);
      const lock = YARD_UNLOCKS.find((u) => u.modId === m.id);
      const box = this._bookTile(
        m.id,
        own,
        own ? m.becomes : `废品站 ${lock?.cost ?? 0} · ${m.becomes}`,
        own ? shortModName(m.name) : '？',
        wide,
        tall,
      );
      box.position.set(wStart + (i % 2) * (wide + 12), y + Math.floor(i / 2) * (tall + 10));
      if (!own) {
        box.eventMode = 'static';
        bindPointerTap(box, () => this._open('yard'));
      }
      this._root.addChild(box);
    });

    this._playPlate(220, h - Game.safeBottom - 56, '去废品站', () => this._open('yard'), 300, 110, 22);
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
    const bg = new PIXI.Graphics();
    bg.beginFill(own ? 0x1c1610 : 0x12100c, 0.92).drawRoundedRect(0, 0, w, h, 14).endFill();
    bg.lineStyle(2, own ? 0x6fbf73 : 0x5a5244, own ? 0.85 : 0.5).drawRoundedRect(0, 0, w, h, 14).lineStyle(0);
    box.addChild(bg);
    const tex = modTex(id);
    const iconX = w > 200 ? 52 : w / 2;
    const iconY = w > 200 ? 88 : 58;
    if (tex?.baseTexture.valid && tex.width > 1) {
      const g = new PIXI.Graphics();
      fillContain(g, tex, iconX, iconY, own ? 72 : 60, own ? 72 : 60);
      g.alpha = own ? 1 : 0.32;
      box.addChild(g);
    }
    const name = this._stroke(w > 200 ? 18 : 14, own ? CREAM : 0x8a90a8, '#1a1008', 3);
    name.anchor.set(w > 200 ? 0 : 0.5, 0);
    name.position.set(w > 200 ? 96 : w / 2, w > 200 ? 12 : h - 36);
    name.text = title;
    box.addChild(name);
    if (w > 200) {
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
    this._playPlate(x, h - Game.safeBottom - 56, text, () => this._open('home'), 300, 110, 22);
  }

  private _chip(title: string, x: number, y: number, onTap: () => void): PIXI.Container {
    const chip = new PIXI.Container();
    chip.eventMode = 'static';
    chip.hitArea = new PIXI.Rectangle(-190, -24, 380, 48);
    if (!fitSprite(chip, uiTex('play_plate'), 0, 0, 400, 56)) {
      const bg = new PIXI.Graphics();
      goldBtn(bg, -180, -20, 360, 40);
      chip.addChild(bg);
    }
    const t = this._stroke(16, INK, '#fff4c4', 3);
    t.anchor.set(0.5);
    t.text = title;
    chip.addChild(t);
    chip.position.set(x, y);
    bindPointerTap(chip, onTap);
    return chip;
  }

  private _card(id: string, picked?: number, focused = false): PIXI.Container {
    const def = getHero(id);
    const card = new PIXI.Container();
    card.eventMode = 'static';
    card.hitArea = new PIXI.Rectangle(0, 0, CARD_W, CARD_H);
    const color = TINT[id] ?? GOLD;
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
    job.text = `${def.job} · ${def.range <= 1 ? '贴脸' : `后排 ${def.range}`} · ${abilityTag(def.skill)}`;
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
