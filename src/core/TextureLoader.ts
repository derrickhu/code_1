/**
 * 本地贴图。微信/抖音必须走 createImage + src，不能 PIXI.Texture.from(路径)。
 * 后者会按浏览器 fetch 去拉文件，小游戏里拉不到，画面就会一直掉回色块。
 * 没加载完或失败时返回 null，调用方继续用色块，不挡玩。
 */
import * as PIXI from 'pixi.js';
import { HEROES } from '@/balance/heroes';
import { Platform } from '@/core/PlatformService';

const cache = new Map<string, PIXI.Texture>();
const missing = new Set<string>();
const inflight = new Set<string>();
const readyWatchers = new Set<() => void>();

/** 贴图刚进缓存时通知，选人卡才能把色块换成立绘 */
export function watchArt(fn: () => void): void {
  readyWatchers.add(fn);
}

function notifyReady(): void {
  for (const fn of readyWatchers) fn();
}

export function tex(path: string): PIXI.Texture | null {
  const hit = cache.get(path);
  if (hit?.baseTexture.valid) return hit;
  if (!missing.has(path)) kick(path);
  return null;
}

export function heroTex(id: string): PIXI.Texture | null {
  return tex(`images/hero_${id}.png`);
}

export function enemyTex(id: string): PIXI.Texture | null {
  return tex(`images/enemy_${id}.png`);
}

export function bgTex(): PIXI.Texture | null {
  return tex('images/bg_battle.png');
}

/** 进战斗场景时把切片那 17 张踢起来，避免第一波还在色块 */
export function preloadBattleArt(): void {
  kick('images/bg_battle.png');
  for (const h of HEROES) kick(`images/hero_${h.id}.png`);
  for (const id of ['runner', 'grunt', 'brute', 'boss']) kick(`images/enemy_${id}.png`);
}

function kick(path: string): void {
  if (cache.has(path) || missing.has(path) || inflight.has(path)) return;
  inflight.add(path);

  const img = Platform.createImage();
  if (img) {
    img.onload = () => {
      try {
        cache.set(path, new PIXI.Texture(PIXI.BaseTexture.from(img)));
        notifyReady();
      } catch {
        missing.add(path);
      }
      inflight.delete(path);
    };
    img.onerror = () => {
      missing.add(path);
      inflight.delete(path);
    };
    img.src = path;
    return;
  }

  try {
    const t = PIXI.Texture.from(path);
    const ready = (): void => {
      if (t.baseTexture.valid) {
        cache.set(path, t);
        notifyReady();
      } else missing.add(path);
      inflight.delete(path);
    };
    if (t.baseTexture.valid) {
      ready();
      return;
    }
    t.baseTexture.once('loaded', ready);
    t.baseTexture.once('error', () => {
      missing.add(path);
      inflight.delete(path);
    });
  } catch {
    missing.add(path);
    inflight.delete(path);
  }
}

/** 把贴图按目标矩形缩放填充。PIXI 默认 beginTextureFill 不缩放，会只露出左上角一块。 */
export function fillScaled(
  g: PIXI.Graphics,
  texture: PIXI.Texture,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 0,
): void {
  const tw = texture.width || 1;
  const th = texture.height || 1;
  if (tw <= 1 || th <= 1) return;
  const matrix = new PIXI.Matrix();
  matrix.scale(w / tw, h / th);
  matrix.translate(x, y);
  g.beginTextureFill({ texture, matrix });
  if (radius > 0) g.drawRoundedRect(x, y, w, h, radius);
  else g.drawRect(x, y, w, h);
  g.endFill();
}

/** 完整立绘站在脚底，不裁成圆头像、不压进方框。 */
export function fillContain(
  g: PIXI.Graphics,
  texture: PIXI.Texture,
  cx: number,
  feetY: number,
  maxW: number,
  maxH: number,
): void {
  const tw = texture.width || 1;
  const th = texture.height || 1;
  if (tw <= 1 || th <= 1) return;
  const scale = Math.min(maxW / tw, maxH / th);
  const w = tw * scale;
  const h = th * scale;
  const x = cx - w / 2;
  const y = feetY - h;
  const matrix = new PIXI.Matrix();
  matrix.scale(scale, scale);
  matrix.translate(x, y);
  g.beginTextureFill({ texture, matrix });
  g.drawRect(x, y, w, h);
  g.endFill();
}

/** 卡面上半幅铺满立绘，底对齐，圆角裁切一次即可。 */
export function addCoverPortrait(
  parent: PIXI.Container,
  texture: PIXI.Texture,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 14,
): void {
  const tw = texture.width || 1;
  const th = texture.height || 1;
  if (tw <= 1 || th <= 1) return;
  const spr = new PIXI.Sprite(texture);
  const scale = Math.max(w / tw, h / th);
  spr.scale.set(scale);
  spr.x = x + (w - tw * scale) / 2;
  spr.y = y + h - th * scale;
  const mask = new PIXI.Graphics();
  mask.beginFill(0xffffff).drawRoundedRect(x, y, w, h, radius).endFill();
  spr.mask = mask;
  parent.addChild(spr, mask);
}
