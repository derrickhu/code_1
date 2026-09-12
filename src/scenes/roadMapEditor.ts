/**
 * GM：路上墩子拖拽编辑。拖链对齐 xiaochu2 章节地图。
 * down 走 Pixi pointerdown；move/up 挂 canvas，不用 Pixi pointermove。
 */
import * as PIXI from 'pixi.js';
import {
  formatRoadPathSnippet, roadScreenToUv, type MapPoint,
} from '@/balance/roadMap';
import { Game } from '@/core/Game';
import { Platform } from '@/core/PlatformService';
import { RoadLayoutStore } from '@/core/roadLayoutStore';
import { bindPointerTap } from '@/minigame';
import { label } from '@/ui/paint';

const HIT_R = 52;

export interface RoadMapEditorOpts {
  layer: PIXI.Container;
  nodes: PIXI.Container[];
  viewH: number;
  imgW: number;
  imgH: number;
  onEditingChange: (editing: boolean) => void;
  onRefresh: () => void;
}

export interface RoadMapEditorHandle {
  toolbar: PIXI.Container;
  teardown: () => void;
}

function collectUv(opts: RoadMapEditorOpts): MapPoint[] {
  return opts.nodes.map((n) => roadScreenToUv(
    { x: n.x, y: n.y },
    750,
    opts.viewH,
    opts.imgW,
    opts.imgH,
  ));
}

function layerLocalFromClient(e: unknown, layer: PIXI.Container): MapPoint {
  const stageLocal = Game.pointerEventToStageLocal(e);
  const local = layer.toLocal(stageLocal, Game.stage);
  return { x: local.x, y: local.y };
}

function hitNode(node: PIXI.Container, lx: number, ly: number): boolean {
  const ha = node.hitArea;
  if (ha instanceof PIXI.Circle) {
    const dx = lx - node.x - ha.x;
    const dy = ly - node.y - ha.y;
    return dx * dx + dy * dy <= ha.radius * ha.radius;
  }
  const dx = lx - node.x;
  const dy = ly - node.y;
  return dx * dx + dy * dy <= HIT_R * HIT_R;
}

function pickNode(nodes: readonly PIXI.Container[], lx: number, ly: number): PIXI.Container | null {
  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    if (hitNode(nodes[i]!, lx, ly)) return nodes[i]!;
  }
  return null;
}

function attachNodeDrag(
  layer: PIXI.Container,
  nodes: PIXI.Container[],
  viewH: number,
): () => void {
  let dragging: PIXI.Container | null = null;

  const apply = (lx: number, ly: number): void => {
    if (!dragging) return;
    dragging.position.set(lx, ly);
    Game.syncFrameToScreen();
  };

  const onPixiDown = (e: PIXI.FederatedPointerEvent): void => {
    if (dragging) return;
    const local = layer.toLocal(e.global);
    const node = pickNode(nodes, local.x, local.y);
    if (!node) return;
    dragging = node;
    apply(local.x, local.y);
    e.stopPropagation();
  };

  layer.eventMode = 'static';
  layer.interactiveChildren = false;
  layer.hitArea = new PIXI.Rectangle(0, 0, 750, viewH);
  layer.on('pointerdown', onPixiDown);

  const canvas = Game.app.view as unknown as {
    addEventListener: (type: string, fn: EventListener) => void;
    removeEventListener: (type: string, fn: EventListener) => void;
  };

  const onMove = (e: Event): void => {
    if (!dragging) return;
    (e as { preventDefault?: () => void }).preventDefault?.();
    const local = layerLocalFromClient(e, layer);
    apply(local.x, local.y);
  };

  const onUp = (): void => {
    dragging = null;
  };

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  return () => {
    if (!layer.destroyed) {
      layer.off('pointerdown', onPixiDown);
      layer.interactiveChildren = true;
      layer.hitArea = null;
    }
    canvas.removeEventListener?.('pointermove', onMove);
    canvas.removeEventListener?.('pointerup', onUp);
    canvas.removeEventListener?.('pointercancel', onUp);
  };
}

function chip(text: string, w: number, onTap: () => void): PIXI.Container {
  const box = new PIXI.Container();
  box.eventMode = 'static';
  box.hitArea = new PIXI.Rectangle(0, 0, w, 40);
  const g = new PIXI.Graphics();
  g.beginFill(0x2a314f, 0.94).drawRoundedRect(0, 0, w, 40, 8).endFill();
  g.lineStyle(1.5, 0x5eb8d4, 0.9).drawRoundedRect(0, 0, w, 40, 8);
  const t = label(16, 0xedf1f7, true);
  t.anchor.set(0.5);
  t.position.set(w / 2, 20);
  t.text = text;
  box.addChild(g, t);
  bindPointerTap(box, onTap);
  return box;
}

export function attachRoadMapEditor(opts: RoadMapEditorOpts): RoadMapEditorHandle {
  const toolbar = new PIXI.Container();
  toolbar.zIndex = 500;
  toolbar.position.set(0, Game.safeTop + 118);

  const hint = label(16, 0xffe566, true);
  hint.anchor.set(0, 0);
  hint.position.set(16, 0);
  hint.text = '编辑墩子 · 拖到土坑上，对齐后点打印坐标';
  toolbar.addChild(hint);

  for (const node of opts.nodes) {
    node.eventMode = 'static';
    node.hitArea = new PIXI.Circle(0, 0, HIT_R);
    const ring = new PIXI.Graphics();
    ring.lineStyle(2, 0xffe566, 0.9).drawCircle(0, 0, 46);
    node.addChildAt(ring, 0);
  }

  const dragTeardown = attachNodeDrag(opts.layer, opts.nodes, opts.viewH);

  const print = (): void => {
    const pts = collectUv(opts);
    const result = RoadLayoutStore.save(pts);
    console.warn('[GM] 路上墩子坐标\n', formatRoadPathSnippet(pts));
    Platform.showToast(result.message, result.ok ? 'success' : 'error');
  };

  let x = 16;
  const add = (text: string, w: number, fn: () => void): void => {
    const btn = chip(text, w, fn);
    btn.position.set(x, 28);
    toolbar.addChild(btn);
    x += w + 10;
  };
  add('打印坐标', 150, print);
  add('恢复默认', 150, () => {
    RoadLayoutStore.clear();
    Platform.showToast('已恢复代码里的默认坑位', 'success');
    opts.onEditingChange(false);
    opts.onRefresh();
  });
  add('退出编辑', 150, () => {
    opts.onEditingChange(false);
    opts.onRefresh();
  });

  return {
    toolbar,
    teardown: () => {
      dragTeardown();
    },
  };
}
