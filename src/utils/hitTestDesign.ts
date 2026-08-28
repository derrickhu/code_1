/**
 * 设计坐标 hitTest（750 布局），供 canvasTapRouter / ScrollList / 编队列表共用。
 *
 * 注意：小游戏 tap 不走 Pixi 原生 hitTest，必须在此自行尊重祖先 mask。
 * 否则滚动列表视觉上被裁切后，仍会抢走顶栏「返回」等按钮的点击。
 */
import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';

/** 设计坐标 → 容器本地（含父级 scale/pivot，地图 cover 缩放后点击才准） */
export function designPointToContainerLocal(target: PIXI.Container, dx: number, dy: number): PIXI.Point {
  return target.toLocal(new PIXI.Point(dx, dy), Game.stage);
}

function localContains(
  local: PIXI.Point,
  ha: PIXI.IHitArea | null | undefined,
  fallback: PIXI.Container,
): boolean {
  if (ha instanceof PIXI.Rectangle) {
    return local.x >= ha.x && local.x <= ha.x + ha.width
      && local.y >= ha.y && local.y <= ha.y + ha.height;
  }
  if (ha instanceof PIXI.Circle) {
    const dxl = local.x - ha.x;
    const dyl = local.y - ha.y;
    return dxl * dxl + dyl * dyl <= ha.radius * ha.radius;
  }
  if (ha instanceof PIXI.RoundedRectangle) {
    return ha.contains(local.x, local.y);
  }
  if (ha && typeof (ha as { contains?: unknown }).contains === 'function') {
    return (ha as { contains: (x: number, y: number) => boolean }).contains(local.x, local.y);
  }
  const b = fallback.getLocalBounds();
  return local.x >= b.x && local.x <= b.x + b.width
    && local.y >= b.y && local.y <= b.y + b.height;
}

/**
 * 祖先链上若有 mask，设计点必须落在 mask 形状内（对齐 Pixi 视觉裁切）。
 * 滚动列表用 Graphics.drawRect 做视口 mask 时，滚出视口的卡片不再可点。
 */
/** mask 可能是容器本身，也可能是包了一层的 MaskData */
function resolveMaskObject(mask: PIXI.Container | PIXI.MaskData | null): PIXI.Container | null {
  if (!mask) return null;
  const obj = mask instanceof PIXI.MaskData ? mask.maskObject : mask;
  return (obj as PIXI.Container | null) ?? null;
}

function insideAncestorMasks(target: PIXI.Container, dx: number, dy: number): boolean {
  let cur: PIXI.Container | null = target;
  while (cur) {
    const maskObj = resolveMaskObject(cur.mask);
    if (maskObj) {
      const local = designPointToContainerLocal(maskObj, dx, dy);
      if (!localContains(local, maskObj.hitArea, maskObj)) return false;
    }
    cur = cur.parent;
  }
  return true;
}

/**
 * 节点是否还挂在当前舞台上。
 *
 * 切场景只做 stage.removeChild(旧场景.container)，旧场景内部的节点 parent 仍在、
 * visible 仍是 true，Pixi 的 worldVisible 也照样返回 true——它只看 visible 标志，
 * 不管这棵树有没有连到舞台。于是上一局战斗的选卡热区会继续在村口抢点击，
 * 把村口点人的整块热区压住（点人无反应、只有没被盖住的那个能选）。
 */
export function isOnStage(target: PIXI.Container): boolean {
  const stage = Game.stage;
  if (!stage) return true;
  let cur: PIXI.Container = target;
  while (cur.parent) cur = cur.parent as PIXI.Container;
  return cur === stage;
}

export function containsDesignPoint(target: PIXI.Container, dx: number, dy: number): boolean {
  if (!target.parent || !target.visible || target.worldVisible === false) return false;
  if (target.eventMode === 'none') return false;
  if (!isOnStage(target)) return false;
  if (!insideAncestorMasks(target, dx, dy)) return false;

  const local = designPointToContainerLocal(target, dx, dy);
  return localContains(local, target.hitArea, target);
}

/** 从候选容器里取最上层命中项（对齐 Pixi 绘制顺序：后绘制的在上） */
export function pickTopmostHit(
  candidates: PIXI.Container[],
  dx: number,
  dy: number,
): PIXI.Container | null {
  let best: PIXI.Container | null = null;
  let bestPath: number[] | null = null;
  for (const target of candidates) {
    if (!containsDesignPoint(target, dx, dy)) continue;
    const path = worldPath(target);
    if (!bestPath || comparePath(path, bestPath) >= 0) {
      best = target;
      bestPath = path;
    }
  }
  return best;
}

/**
 * 从根到叶的子节点索引链。
 *
 * 必须保留成数组逐层比，不能压成一个数。曾经压成 `order * 1000 + index` 从叶往根
 * 累加，等于把叶节点的索引放到了最高位：Overlay 层的 GM 按钮算出 3002，战斗场景里
 * 埋得更深的点怪热区算出 15001，热区反而赢了——点 GM 按钮弹出的是怪物说明。
 * 只要下层子树够深，它的叶节点就能压过顶层容器，「Overlay 永远在最上层」这个前提
 * 就被算法本身破坏了。
 */
function worldPath(target: PIXI.Container): number[] {
  const path: number[] = [];
  let cur: PIXI.Container | null = target;
  while (cur?.parent) {
    path.push(cur.parent.getChildIndex(cur));
    cur = cur.parent;
  }
  return path.reverse();
}

/** 顶层先分胜负，同层再往下比；祖先相同时更深的那个在上 */
function comparePath(a: readonly number[], b: readonly number[]): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? -1;
    const bv = b[i] ?? -1;
    if (av !== bv) return av - bv;
  }
  return 0;
}
