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
  loadMemory, progressOf, setStageId, type RunMemory,
} from '@/core/RunMemory';
import {
  fillCover, roadBgTex, roadNodeTex, uiTex, villageHomeBgTex, watchArt,
} from '@/core/TextureLoader';
import { EventBus } from '@/core/EventBus';
import { GMManager } from '@/core/GMManager';
import { RoadLayoutStore } from '@/core/roadLayoutStore';
import { TweenManager, Ease } from '@/core/TweenManager';
import { UnitActor } from '@/fx/UnitActor';
import { bindPointerTap } from '@/minigame';
import { attachRoadMapEditor } from '@/scenes/roadMapEditor';
import { GOLD, fillSprite, fitSprite, goldBtn, ironSlab, label, painted } from '@/ui/paint';

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

    const by = h - Game.safeBottom - 62;
    this._btn(168, by, 200, 72, '回村口', () => SceneManager.switchTo('village'), !this._busy && !editing);
    this._btn(500, by, 360, 84, '开打', () => this._startFight(), !this._busy && !editing, 'fight_btn');
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
