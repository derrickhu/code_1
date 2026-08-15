/**
 * 微信 touch / pointer → 设计坐标（750 宽）。
 * 统一规则见 @/minigame/index.ts；对齐 game2D_huahua BoardView._rawToLocal。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { designPointToContainerLocal } from './hitTestDesign';

export function clientEventToDesign(e: unknown): { x: number; y: number } {
  const ev = e as {
    clientX?: number;
    clientY?: number;
    x?: number;
    y?: number;
    touches?: Array<{ clientX?: number; clientY?: number }>;
    changedTouches?: Array<{ clientX?: number; clientY?: number }>;
  };
  const t0 = ev.changedTouches?.[0] ?? ev.touches?.[0];
  const cx = ev.clientX ?? t0?.clientX ?? ev.x ?? 0;
  const cy = ev.clientY ?? t0?.clientY ?? ev.y ?? 0;
  // 对齐 game2D_huahua：clientX(逻辑像素) → 设计坐标，单一比例 designWidth/screenWidth。
  // 不经 EventSystem patch / toLocal，避免依赖 worldTransform 是否最新。
  const ratio = Game.designWidth / Game.screenWidth;
  return { x: cx * ratio, y: cy * ratio };
}

export function designPointToLocal(target: PIXI.Container, dx: number, dy: number): PIXI.Point {
  return designPointToContainerLocal(target, dx, dy);
}

/** touch/pointer 事件 → 某容器本地设计坐标（棋盘拖拽 / hitTest 共用） */
export function designEventToLocal(target: PIXI.Container, e: unknown): { x: number; y: number } {
  const design = clientEventToDesign(e);
  const local = designPointToLocal(target, design.x, design.y);
  return { x: local.x, y: local.y };
}
