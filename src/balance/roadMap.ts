/**
 * 出村后的章节路径。一章 5 关共用一条折线，只换章名和高亮。
 * 节点坐标按 road.jpg 上的五个土坑标定，cover 铺屏后仍对齐。
 */
import {
  LAST_STAGE_ID, getStage, stagesOfChapter,
  type StageDef,
} from './stages';

/** 跟 road.jpg 像素一致，cover 和节点共用，避免 9:16 概念尺寸和实图像素对不齐 */
export const ROAD_BG_ASPECT = { w: 720, h: 1280 } as const;

/**
 * 近处第 1 关 → 远处第 5 关。数值是底图 UV，不是屏幕像素。
 * 对齐 road.jpg 浅色土路上五个圆坑的几何中心。
 */
export const ROAD_PATH = [
  { x: 0.5515, y: 0.8557 },
  { x: 0.3799, y: 0.7056 },
  { x: 0.6552, y: 0.5926 },
  { x: 0.4111, y: 0.4613 },
  { x: 0.6637, y: 0.3529 },
] as const;

export type MapPoint = { x: number; y: number };
export type RoadNodeKind = 'cleared' | 'active' | 'locked';

export interface RoadMem {
  stageId: number;
  stageTop: number;
  stageStars: Readonly<Record<number, number>>;
}

export interface RoadEnter {
  chapter?: number;
  walkFrom?: number;
  walkTo?: number;
}

export interface RoadWalkPlan {
  chapter: number;
  fromIndex: number | null;
  toIndex: number;
  enterId: number;
}

export function parseRoadEnter(data: unknown): RoadEnter {
  if (!data || typeof data !== 'object') return {};
  const o = data as Record<string, unknown>;
  const num = (k: string): number | undefined => {
    const n = Number(o[k]);
    return Number.isFinite(n) ? Math.floor(n) : undefined;
  };
  return {
    chapter: num('chapter'),
    walkFrom: num('walkFrom'),
    walkTo: num('walkTo'),
  };
}

/** 底图 cover 进视口后，UV 点落到哪。img 尺寸须与 fillCover 用的贴图一致。 */
export function roadCoverFit(
  viewW: number,
  viewH: number,
  imgW: number = ROAD_BG_ASPECT.w,
  imgH: number = ROAD_BG_ASPECT.h,
): {
  scale: number;
  x: number;
  y: number;
  imgW: number;
  imgH: number;
} {
  const iw = imgW > 1 ? imgW : ROAD_BG_ASPECT.w;
  const ih = imgH > 1 ? imgH : ROAD_BG_ASPECT.h;
  const scale = Math.max(viewW / iw, viewH / ih);
  return {
    scale,
    x: (viewW - iw * scale) / 2,
    y: (viewH - ih * scale) / 2,
    imgW: iw,
    imgH: ih,
  };
}

export function roadUvToScreen(
  uv: MapPoint,
  viewW: number,
  viewH: number,
  imgW: number = ROAD_BG_ASPECT.w,
  imgH: number = ROAD_BG_ASPECT.h,
): MapPoint {
  const fit = roadCoverFit(viewW, viewH, imgW, imgH);
  return {
    x: fit.x + uv.x * fit.imgW * fit.scale,
    y: fit.y + uv.y * fit.imgH * fit.scale,
  };
}

/** 屏上设计坐标反推底图 UV，给 GM 拖墩用 */
export function roadScreenToUv(
  screen: MapPoint,
  viewW: number,
  viewH: number,
  imgW: number = ROAD_BG_ASPECT.w,
  imgH: number = ROAD_BG_ASPECT.h,
): MapPoint {
  const fit = roadCoverFit(viewW, viewH, imgW, imgH);
  const dw = fit.imgW * fit.scale;
  const dh = fit.imgH * fit.scale;
  return {
    x: dw !== 0 ? (screen.x - fit.x) / dw : 0,
    y: dh !== 0 ? (screen.y - fit.y) / dh : 0,
  };
}

export function roadPathOf(points?: readonly MapPoint[] | null): readonly MapPoint[] {
  if (points && points.length === ROAD_PATH.length) return points;
  return ROAD_PATH;
}

export function roadNodeAt(
  index: number,
  viewW: number,
  viewH: number,
  imgW: number = ROAD_BG_ASPECT.w,
  imgH: number = ROAD_BG_ASPECT.h,
  path?: readonly MapPoint[] | null,
): MapPoint {
  const pts = roadPathOf(path);
  const i = Math.max(0, Math.min(pts.length - 1, Math.floor(index)));
  return roadUvToScreen(pts[i]!, viewW, viewH, imgW, imgH);
}

export function formatRoadPathSnippet(points: readonly MapPoint[]): string {
  const lines = points.map((p) => (
    `  { x: ${roundRoadUv(p.x)}, y: ${roundRoadUv(p.y)} },`
  ));
  return ['export const ROAD_PATH = [', ...lines, '] as const;'].join('\n');
}

export function roundRoadUv(n: number): string {
  return (Math.round(n * 10000) / 10000).toFixed(4);
}

export function roadNodeKind(stageId: number, mem: RoadMem): RoadNodeKind {
  if (stageId > mem.stageTop) return 'locked';
  if (stageId < mem.stageTop) return 'cleared';
  return 'active';
}

export function roadMaxChapter(stageTop: number): number {
  return getStage(stageTop).chapter;
}

export function clampRoadChapter(chapter: number, stageTop: number): number {
  const max = roadMaxChapter(stageTop);
  return Math.max(1, Math.min(max, Math.floor(chapter) || 1));
}

/** 这一章路上人站哪一关 */
export function roadStandStage(chapter: number, mem: RoadMem): StageDef {
  const list = stagesOfChapter(chapter);
  const cur = getStage(mem.stageId);
  if (cur.chapter === chapter) return cur;
  if (cur.chapter > chapter) return list[list.length - 1] ?? getStage(1);
  return list[0] ?? getStage(1);
}

export function lastClearedStage(mem: RoadMem): StageDef | undefined {
  let best = 0;
  for (const [raw, stars] of Object.entries(mem.stageStars)) {
    const id = Number(raw);
    if (stars > 0 && id > best) best = id;
  }
  return best > 0 ? getStage(best) : undefined;
}

/** 主界面木牌：只报最近一关通了没，不在这儿切关 */
export function homeRoadBrief(mem: RoadMem): { title: string; sub: string } {
  const last = lastClearedStage(mem);
  if (!last) {
    return { title: getStage(1).label, sub: '还没出过村' };
  }
  const stars = Math.max(0, Math.min(3, mem.stageStars[last.id] ?? 0));
  const mark = `${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
  const next = last.id < LAST_STAGE_ID ? getStage(last.id + 1) : undefined;
  return {
    title: `${last.label} ${mark}`,
    sub: next ? `下一关 ${next.label}` : '都打完了',
  };
}

export function roadWalkPlan(fromId: number, toId: number): RoadWalkPlan | undefined {
  if (toId <= fromId || toId > LAST_STAGE_ID) return undefined;
  const to = getStage(toId);
  const from = getStage(fromId);
  if (from.chapter === to.chapter) {
    return {
      chapter: to.chapter,
      fromIndex: from.index - 1,
      toIndex: to.index - 1,
      enterId: to.id,
    };
  }
  return {
    chapter: to.chapter,
    fromIndex: null,
    toIndex: to.index - 1,
    enterId: to.id,
  };
}

export function roadWalkUv(
  fromIndex: number | null,
  toIndex: number,
  t: number,
  path?: readonly MapPoint[] | null,
): MapPoint {
  const pts = roadPathOf(path);
  const dest = pts[Math.max(0, Math.min(pts.length - 1, toIndex))]!;
  const start: MapPoint = fromIndex == null
    ? { x: pts[0]!.x, y: 1.06 }
    : pts[Math.max(0, Math.min(pts.length - 1, fromIndex))]!;
  const k = Math.max(0, Math.min(1, t));
  return {
    x: start.x + (dest.x - start.x) * k,
    y: start.y + (dest.y - start.y) * k,
  };
}

/** 路上关卡木牌：显示当前选中关，如 2-3 */
export function roadChapterLine(stageId: number): string {
  return getStage(stageId).label;
}
