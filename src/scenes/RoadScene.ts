/**
 * 出村之后的章节路径。底图自己带 S 形土路，圆墩叠在坑上。
 * 点墩选关，底下开打进布阵；过关后再进来，人沿土路走到下一坑。
 */
import * as PIXI from 'pixi.js';
import { roadPreloadImages } from '@/config/assetPreload';
import { getStage, stagesOfChapter, type StageDef } from '@/balance/stages';
import {
  clampRoadChapter, parseRoadEnter, roadChapterLine, roadMaxChapter, roadNodeAt,
  roadNodeKind, roadStandStage, roadUvToScreen, roadWalkPlan, roadWalkUv,
} from '@/balance/roadMap';
import { evoOf } from '@/balance/village';
import { getVillager } from '@/balance/villagers';
import { yardPeople } from '@/core/yardRoster';
import { ensureAssets } from '@/core/ensureAssets';
import { BgmPlayer } from '@/core/BgmPlayer';
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';
import { SceneManager, type Scene } from '@/core/SceneManager';
import {
  loadMemory, openStarChests, progressOf, setStageId, type RunMemory,
} from '@/core/RunMemory';
import { CHEST_STARS, chapterStars, chestsReached, nextChestNeed } from '@/balance/starChest';
import {
  fillCover, roadBgTex, roadNodeTex, uiTex, villageHomeBgTex, watchArt,
} from '@/core/TextureLoader';
import { track } from '@/core/Analytics';
import { EventBus } from '@/core/EventBus';
import { GMManager } from '@/core/GMManager';
import { RoadLayoutStore } from '@/core/roadLayoutStore';
import { TweenManager, Ease } from '@/core/TweenManager';
import { UnitActor } from '@/fx/UnitActor';
import { bindPointerTap } from '@/minigame';
import { attachRoadMapEditor } from '@/scenes/roadMapEditor';
import { GOLD, fillSprite, fitSprite, goldBtn, ironSlab, label, painted } from '@/ui/paint';
import {
  CHEST_FULL, ChestBar, chestSprite, mountChestOpen, starCount, type ChestLook,
} from '@/ui/starChestUi';

const CREAM = 0xfff4c4;
const MUTED = 0x8a8a92;

export class RoadScene implements Scene {
  readonly name = 'road';
  readonly container = new PIXI.Container();

  private readonly _layer = new PIXI.Container();
  private _actors: UnitActor[] = [];
  private _mem: RunMemory = loadMemory();
  private _chapter = 1;
  private _busy = false;
  private _walk: { t: number } | null = null;
  private _pendingEnter = 0;
  private _pick = 1;
  private _nodes: PIXI.Container[] = [];
  /** 够数没开的宝箱，跳着等人点 */
  private _chestBob: PIXI.Container[] = [];
  private _bobT = 0;
  private _editorTeardown: (() => void) | null = null;
  private readonly _onRoadEdit = (): void => {
    if (SceneManager.current?.name !== 'road' || this._busy) return;
    this._paint();
  };

  constructor() {
    this.container.addChild(this._layer);
    watchArt(() => {
      if (SceneManager.current?.name !== 'road' || this._busy) return;
      if (GMManager.roadEditMode) return;
      this._paint();
    });
  }

  onEnter(data?: unknown): void {
    EventBus.on('gm:roadEditToggle', this._onRoadEdit);
    this._stopWalk();
    this._busy = false;
    this._pendingEnter = 0;
    this._mem = loadMemory();
    const enter = parseRoadEnter(data);
    const plan = enter.walkFrom != null && enter.walkTo != null
      ? roadWalkPlan(enter.walkFrom, enter.walkTo)
      : undefined;
    this._chapter = clampRoadChapter(
      plan?.chapter ?? enter.chapter ?? getStage(this._mem.stageId).chapter,
      this._mem.stageTop,
    );
    BgmPlayer.play('home');
    if (plan) {
      this._mem = setStageId(plan.enterId);
      this._busy = true;
      this._pendingEnter = plan.enterId;
    }
    this._pick = roadStandStage(this._chapter, this._mem).id;
    this._kickArt();
    this._paint();
    if (plan) this._startWalk(plan.fromIndex, plan.toIndex);
  }

  onExit(): void {
    EventBus.off('gm:roadEditToggle', this._onRoadEdit);
    this._teardownEditor();
    if (GMManager.roadEditMode) GMManager.setRoadEdit(false);
    this._stopWalk();
    this._busy = false;
    this._pendingEnter = 0;
    this._clearActors();
    this._layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    BgmPlayer.stop();
  }

  update(dt: number): void {
    for (const a of this._actors) a.update(dt);
    if (this._chestBob.length === 0) return;
    this._bobT += dt;
    const s = 1 + Math.max(0, Math.sin(this._bobT * 5)) * 0.14;
    const r = Math.sin(this._bobT * 16) * 0.08 * Math.max(0, Math.sin(this._bobT * 2.5));
    for (const c of this._chestBob) {
      if (c.destroyed) continue;
      c.scale.set(s);
      c.rotation = r;
    }
  }

  private _height(): number {
    return Game.logicHeight;
  }

  private _kickArt(): void {
    const p = progressOf(this._mem);
    const people = yardPeople(this._mem, '', 1).map((id) => ({
      id, evo: evoOf(p, id),
    }));
    void ensureAssets(roadPreloadImages(people)).then(() => {
      if (SceneManager.current?.name !== 'road' || this._busy) return;
      if (GMManager.roadEditMode) return;
      this._paint();
    }).catch((e) => {
      console.warn('[Road] 预热失败', e);
    });
  }

  private _paint(): void {
    this._teardownEditor();
    this._clearActors();
    this._nodes = [];
    this._layer.removeChildren().forEach((c) => c.destroy({ children: true }));

    const h = this._height();
    const mem = this._mem;
    const stages = stagesOfChapter(this._chapter);
    const stand = roadStandStage(this._chapter, mem);
    const editing = GMManager.roadEditMode;

    this._backdrop(h);
    stages.forEach((stage, i) => this._node(stage, i, h, editing));
    const focus = stages.find((s) => s.id === this._pick) ?? stand;
    const feet = this._nodeAt(focus.index - 1, h);
    if (!editing) this._people(feet.x, feet.y, h);
    this._chrome(h, editing);
    if (editing) this._mountEditor(h);
  }

  private _backdrop(h: number): void {
    const g = new PIXI.Graphics();
    const art = roadBgTex() ?? villageHomeBgTex();
    if (art && art.baseTexture.valid && art.width > 1) {
      fillCover(g, art, 0, 0, 750, h);
    } else {
      g.beginFill(0x2a2018).drawRect(0, 0, 750, h).endFill();
      g.beginFill(0x3a2a18, 0.55).drawRect(80, h * 0.22, 590, h * 0.68).endFill();
    }
    this._layer.addChild(g);
  }

  private _nodeArt(stage: StageDef): 'cleared' | 'active' | 'locked' {
    const kind = roadNodeKind(stage.id, this._mem);
    if (kind === 'locked') return 'locked';
    if (stage.id === this._pick) return 'active';
    return kind === 'cleared' ? 'cleared' : 'active';
  }

  /** 跟 fillCover 同一张底图像素，节点才压在坑上 */
  private _bgSize(): { w: number; h: number } {
    const art = roadBgTex();
    const w = art?.width ?? 0;
    const h = art?.height ?? 0;
    return w > 1 && h > 1 ? { w, h } : { w: 720, h: 1280 };
  }

  private _livePath() {
    return RoadLayoutStore.live();
  }

  private _nodeAt(index: number, viewH: number): { x: number; y: number } {
    const bg = this._bgSize();
    return roadNodeAt(index, 750, viewH, bg.w, bg.h, this._livePath());
  }

  private _uvAt(uv: { x: number; y: number }, viewH: number): { x: number; y: number } {
    const bg = this._bgSize();
    return roadUvToScreen(uv, 750, viewH, bg.w, bg.h);
  }

  private _teardownEditor(): void {
    this._editorTeardown?.();
    this._editorTeardown = null;
    this.container.children
      .filter((c) => c !== this._layer)
      .forEach((c) => {
        this.container.removeChild(c);
        c.destroy({ children: true });
      });
  }

  private _mountEditor(h: number): void {
    const bg = this._bgSize();
    const editor = attachRoadMapEditor({
      layer: this._layer,
      nodes: this._nodes,
      viewH: h,
      imgW: bg.w,
      imgH: bg.h,
      onEditingChange: (on) => GMManager.setRoadEdit(on),
      onRefresh: () => {
        if (SceneManager.current?.name !== 'road') return;
        this._paint();
      },
    });
    this._editorTeardown = editor.teardown;
    this.container.addChild(editor.toolbar);
  }

  private _node(stage: StageDef, index: number, h: number, editing = false): void {
    const p = this._nodeAt(index, h);
    const art = this._nodeArt(stage);
    const near = 0.78 + 0.22 * (p.y / h);
    const size = Math.round((index === 4 ? 108 : 96) * near);
    const sit = Math.round(size * 0.04);
    const box = new PIXI.Container();
    box.position.set(p.x, p.y);
    box.eventMode = this._busy ? 'none' : 'static';
    box.interactiveChildren = false;
    box.hitArea = new PIXI.Circle(0, sit, size * 0.58);
    box.alpha = art === 'locked' ? 0.72 : 1;

    if (!fitSprite(box, roadNodeTex(art), 0, sit, size, size * 0.72)) {
      const g = new PIXI.Graphics();
      const fill = art === 'locked' ? 0x3a3a40 : art === 'active' ? 0xc9a46a : 0x8a4a28;
      g.beginFill(0x1a1008, 0.4).drawEllipse(2, 14, size * 0.4, size * 0.16).endFill();
      g.beginFill(fill, 0.95).drawEllipse(0, 6, size * 0.38, size * 0.28).endFill();
      g.lineStyle(3, art === 'active' ? GOLD : 0x5a3a22, 0.9)
        .drawEllipse(0, 6, size * 0.38, size * 0.28).lineStyle(0);
      box.addChild(g);
    }

    const title = painted(art === 'active' ? 22 : 18, art === 'locked' ? MUTED : CREAM, '#1a1008', 4);
    title.anchor.set(0.5, 1);
    title.position.set(0, -size * 0.28);
    title.text = stage.label;
    box.addChild(title);

    const stars = this._mem.stageStars[stage.id] ?? 0;
    if (stars > 0) {
      const sub = label(15, GOLD, true);
      sub.anchor.set(0.5, 0);
      sub.position.set(0, size * 0.38);
      sub.text = `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
      box.addChild(sub);
      if (stars < 3) {
        const more = painted(15, 0xffa04a, '#1a1008', 4);
        more.anchor.set(0.5, 0);
        more.position.set(0, size * 0.38 + 20);
        more.text = `再战 +${3 - stars}★`;
        box.addChild(more);
      }
    }

    if (!this._busy && !editing) {
      bindPointerTap(box, () => this._tapStage(stage));
    }
    this._layer.addChild(box);
    this._nodes.push(box);
  }

  private _people(feetX: number, feetY: number, h: number): void {
    const mem = this._mem;
    const p = progressOf(mem);
    const ids = yardPeople(mem, '', 1);
    const near = 0.62 + 0.38 * Math.max(0.2, Math.min(1, feetY / h));
    const peopleH = Math.round(148 * near);
    ids.forEach((id) => {
      const a = new UnitActor();
      a.bindHero(id, getVillager(id).lane, evoOf(p, id), false);
      a.place(feetX, feetY + 4, peopleH);
      a.view.eventMode = 'none';
      this._layer.addChild(a.view);
      this._actors.push(a);
    });
    for (const a of this._actors) a.update(0);
  }

  private _placePeople(feetX: number, feetY: number): void {
    const h = this._height();
    const near = 0.62 + 0.38 * Math.max(0.2, Math.min(1, feetY / h));
    const peopleH = Math.round(148 * near);
    this._actors.forEach((a) => {
      a.place(feetX, feetY + 4, peopleH);
      a.update(0);
    });
  }

  private _chrome(h: number, editing = false): void {
    const top = Game.safeTop + 46;
    const maxCh = roadMaxChapter(this._mem.stageTop);
    this._btn(96, top, 88, 64, '〈', () => this._turn(-1), this._chapter > 1 && !this._busy && !editing);
    this._btn(654, top, 88, 64, '〉', () => this._turn(1), this._chapter < maxCh && !this._busy && !editing);

    const plate = new PIXI.Container();
    plate.position.set(375, top);
    if (!fillSprite(plate, uiTex('rust_plank'), 0, 0, 420, 72)
      && !fitSprite(plate, uiTex('rust_plank'), 0, 0, 420, 72)) {
      const g = new PIXI.Graphics();
      ironSlab(g, -210, -36, 420, 72, 12);
      plate.addChild(g);
    }
    const t = painted(28, CREAM, '#1a1008', 4);
    t.anchor.set(0.5);
    t.text = roadChapterLine(this._pick);
    plate.addChild(t);
    this._layer.addChild(plate);
    this._chestRail(top + 48, editing);

    const by = h - Game.safeBottom - 62;
    this._btn(168, by, 200, 72, '回村口', () => SceneManager.switchTo('village'), !this._busy && !editing);
    this._btn(500, by, 360, 84, '开打', () => this._startFight(), !this._busy && !editing, 'fight_btn');
  }

  /**
   * 这一章的星星宝箱条。三口箱子钉在 5 / 10 / 15 星上：
   * 开过的敞着、够数没开的跳着等点、还差的灰着。底下一句写还差几颗。
   */
  private _chestRail(top: number, editing: boolean): void {
    const mem = this._mem;
    const ch = this._chapter;
    const stars = chapterStars(mem.stageStars, ch);
    const opened = mem.starChests[ch] ?? 0;
    const reach = chestsReached(stars);
    const w = 680;
    const h = 160;
    const box = new PIXI.Container();
    box.position.set(375, top + h / 2);
    if (!fillSprite(box, uiTex('rust_panel'), 0, 0, w, h)) {
      const g = new PIXI.Graphics();
      g.beginFill(0x2a1c12, 0.94).drawRoundedRect(-w / 2, -h / 2, w, h, 14).endFill();
      box.addChild(g);
    }

    const title = painted(28, GOLD, '#1a1008', 5);
    title.anchor.set(0, 0.5);
    title.position.set(-w / 2 + 30, -h / 2 + 30);
    title.text = '星星宝箱';
    box.addChild(title);
    const count = starCount(box, stars, 40);
    count.position.set(w / 2 - 150, -h / 2 + 30);

    const barW = w - 120;
    const barY = 40;
    const bar = new ChestBar(barW, 44);
    bar.position.set(-barW / 2 - 10, barY);
    bar.set(stars / CHEST_FULL);
    box.addChild(bar);

    this._chestBob = [];
    CHEST_STARS.forEach((at, i) => {
      const mx = bar.x + bar.xAt(at);
      const look: ChestLook = i < opened ? 'open' : i < reach ? 'ready' : 'locked';
      const c = chestSprite(box, look, 92, 82);
      c.position.set(mx, barY - 24);
      const tag = painted(20, look === 'ready' ? 0x9be08a : look === 'open' ? MUTED : CREAM, '#1a1008', 4);
      tag.anchor.set(0.5, 0);
      tag.position.set(mx, barY + 16);
      tag.text = look === 'ready' ? '点开！' : look === 'open' ? '已开' : `${at}★`;
      box.addChild(tag);
      if (look === 'ready') {
        this._chestBob.push(c);
        if (!this._busy && !editing) {
          c.eventMode = 'static';
          c.hitArea = new PIXI.Circle(0, 0, 56);
          bindPointerTap(c, () => this._openChests());
        }
      }
    });

    const need = nextChestNeed(stars);
    const hint = painted(21, reach > opened ? 0x9be08a : 0xffe08a, '#1a1008', 4);
    hint.anchor.set(0.5, 0.5);
    hint.position.set(0, h / 2 + 22);
    hint.text = reach > opened
      ? '宝箱能开了！点一下'
      : need === undefined
        ? '这一章宝箱全开了'
        : `再拿 ${need} 颗★开宝箱 · 没打满三星的关回去补`;
    box.addChild(hint);
    this._layer.addChild(box);
  }

  private _openChests(): void {
    if (this._busy) return;
    const res = openStarChests();
    if (res.chests.length === 0) return;
    this._mem = res.mem;
    track('star_chest', {
      chapter: this._chapter, n: res.chests.length, tiers: res.chests.map((c) => `${c.chapter}-${c.tier + 1}`).join(','),
    });
    this._paint();
    mountChestOpen(this.container, this._height(), res.chests);
  }

  private _btn(
    cx: number,
    cy: number,
    w: number,
    h: number,
    text: string,
    onTap: () => void,
    on = true,
    art: 'rust_btn' | 'fight_btn' = 'rust_btn',
  ): void {
    const box = new PIXI.Container();
    box.position.set(cx, cy);
    box.eventMode = on ? 'static' : 'none';
    box.interactiveChildren = false;
    box.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
    box.alpha = on ? 1 : 0.42;
    if (!fillSprite(box, uiTex(art), 0, 0, w, h)
      && !fitSprite(box, uiTex(art), 0, 0, w, h)) {
      const g = new PIXI.Graphics();
      goldBtn(g, -w / 2, -h / 2, w, h);
      box.addChild(g);
    }
    const t = label(26, on ? CREAM : MUTED, true);
    t.anchor.set(0.5);
    t.text = text;
    box.addChild(t);
    if (on) bindPointerTap(box, onTap);
    this._layer.addChild(box);
  }

  private _turn(dir: number): void {
    if (this._busy) return;
    const next = clampRoadChapter(this._chapter + dir, this._mem.stageTop);
    if (next === this._chapter) return;
    this._chapter = next;
    this._pick = roadStandStage(next, this._mem).id;
    this._paint();
  }

  private _tapStage(stage: StageDef): void {
    if (this._busy) return;
    if (stage.id > this._mem.stageTop) {
      Platform.showToast('还没打到这儿');
      return;
    }
    this._mem = setStageId(stage.id);
    this._pick = stage.id;
    this._paint();
  }

  private _startFight(): void {
    if (this._busy) return;
    const stage = getStage(this._pick);
    if (stage.id > this._mem.stageTop) {
      Platform.showToast('还没打到这儿');
      return;
    }
    this._mem = setStageId(stage.id);
    SceneManager.switchTo('battle', { stageId: stage.id });
  }

  private _startWalk(fromIndex: number | null, toIndex: number): void {
    const h = this._height();
    const start = this._uvAt(roadWalkUv(fromIndex, toIndex, 0, this._livePath()), h);
    const hold = { t: 0 };
    this._walk = hold;
    this._placePeople(start.x, start.y);
    const dest = this._uvAt(roadWalkUv(fromIndex, toIndex, 1, this._livePath()), h);
    for (const a of this._actors) a.faceToward(dest.x);
    TweenManager.to({
      target: hold,
      props: { t: 1 },
      duration: 0.92,
      ease: Ease.easeInOutQuad,
      onUpdate: () => {
        if (!this._walk) return;
        const uv = roadWalkUv(fromIndex, toIndex, hold.t, this._livePath());
        const p = this._uvAt(uv, this._height());
        this._placePeople(p.x, p.y);
      },
      onComplete: () => {
        if (!this._walk || this._pendingEnter <= 0) return;
        const enter = this._pendingEnter;
        this._walk = null;
        this._busy = false;
        SceneManager.switchTo('battle', { stageId: enter });
      },
    });
  }

  private _stopWalk(): void {
    if (this._walk) TweenManager.cancelTarget(this._walk);
    this._walk = null;
  }

  private _clearActors(): void {
    for (const a of this._actors) a.destroy();
    this._actors = [];
  }
}
