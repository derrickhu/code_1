/**
 * 本地贴图。微信/抖音必须走 createImage + src，不能 PIXI.Texture.from(路径)。
 * 后者会按浏览器 fetch 去拉文件，小游戏里拉不到，画面就会一直掉回色块。
 * 没加载完或失败时返回 null，调用方继续用色块，不挡玩。
 */
import * as PIXI from 'pixi.js';
import { ENEMY_PROTOS } from '@/balance/enemies';
import { HAND_GEAR, STARTER_WEP_IDS } from '@/balance/gear';
import { HEROES } from '@/balance/heroes';
import { MODS } from '@/balance/mods';
import { Platform } from '@/core/PlatformService';

const cache = new Map<string, PIXI.Texture>();
const missing = new Set<string>();
const inflight = new Set<string>();
const readyWatchers = new Set<() => void>();
const waiters = new Map<string, Array<(tex: PIXI.Texture | null) => void>>();

function resolveWaiters(path: string, tex: PIXI.Texture | null): void {
  const list = waiters.get(path);
  if (!list) return;
  waiters.delete(path);
  for (const fn of list) fn(tex);
}

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

export function modTex(id: string): PIXI.Texture | null {
  return tex(`images/mod_${id}.png`);
}

export const VFX_FILES = [
  'glow', 'streak', 'spark', 'ring', 'bolt', 'orb', 'fire',
  'slash', 'saw', 'smash', 'poke', 'blast', 'wind', 'pierce', 'flash',
  'claw', 'beam', 'shield', 'heal',
] as const;

export const PROJ_FILES = ['pebble', 'needle', 'disc', 'pipe', 'cracker', 'leaf', 'cleaver'] as const;

export function projTex(name: string): PIXI.Texture | null {
  return tex(`images/proj_${name}.png`);
}

export function vfxTex(name: string): PIXI.Texture | null {
  return tex(`images/vfx_${name}.png`);
}

/** 背景没有透明区，走 jpg：同画质下比 png 小一个数量级，首包容量卡得很死 */
const BG_PATH = 'images/bg_battle.jpg';
const VILLAGE_BG = 'images/bg_village.jpg';
const YARD_BG = 'images/bg_yard.jpg';

export const UI_FILES = [
  'title_logo',
  'title_plaque',
  'play_plate',
  'door_squad',
  'door_yard',
  'door_book',
  'nav_squad',
  'nav_yard',
  'nav_book',
  'iron_dock',
  'iron_bar',
  'iron_nails',
  'scrap_pile',
  'wood_bar',
  'wood_panel',
  'settle_stamp',
  'settle_name',
  'settle_btn',
  'settle_chip',
  'ad_btn',
] as const;

export function bgTex(): PIXI.Texture | null {
  return tex(BG_PATH);
}

export function villageBgTex(): PIXI.Texture | null {
  return tex(VILLAGE_BG) ?? bgTex();
}

export function yardBgTex(): PIXI.Texture | null {
  return tex(YARD_BG) ?? villageBgTex();
}

export type UiName = (typeof UI_FILES)[number];

export function uiTex(name: UiName): PIXI.Texture | null {
  return tex(`images/ui_${name}.png`);
}

/** Loading 首屏插画，须在主包，勿走 CDN */
export const LOADING_SPLASH = 'images/loading_splash.jpg';
/** Loading / 村子主页标题字标，须在主包 */
export const LOADING_TITLE = 'images/ui_title_logo.png';

/** 村子主页：局外件 + 立绘 + 局里那套闲置精灵（主页站位跟战场共用） */
export function villageArtPaths(): string[] {
  const paths = [VILLAGE_BG, YARD_BG];
  for (const n of UI_FILES) paths.push(`images/ui_${n}.png`);
  for (const h of HEROES) {
    paths.push(`images/hero_${h.id}.png`);
    paths.push(`images/hero_${h.id}_grip.png`);
    paths.push(`images/anim_${h.id}_idle_0.png`);
  }
  for (const id of STARTER_WEP_IDS) paths.push(`images/wep_${id}.png`);
  for (const g of Object.values(HAND_GEAR)) paths.push(g.path);
  for (const m of MODS) paths.push(`images/mod_${m.id}.png`);
  return paths;
}

export function preloadVillageArt(): void {
  for (const p of villageArtPaths()) kick(p);
}

/** 进战斗场景时把切片要用的图全踢起来，避免第一波还在色块 */
export function preloadBattleArt(): void {
  kick(BG_PATH);
  kick(VILLAGE_BG);
  for (const n of ['title_plaque', 'play_plate', 'iron_bar', 'scrap_pile', 'settle_stamp', 'settle_name', 'settle_btn', 'settle_chip', 'ad_btn'] as const) {
    kick(`images/ui_${n}.png`);
  }
  for (const h of HEROES) kick(`images/hero_${h.id}.png`);
  // 从原型表读而不是写死 id：上次改名就是漏在这行，敌人图整批加载不到
  for (const e of ENEMY_PROTOS) kick(`images/enemy_${e.id}.png`);
  for (const m of MODS) kick(`images/mod_${m.id}.png`);
  for (const n of VFX_FILES) kick(`images/vfx_${n}.png`);
  for (const n of PROJ_FILES) kick(`images/proj_${n}.png`);
  kick('images/hero_dachui_grip.png');
  kick('images/fx_hammer.png');
  for (const h of HEROES) kick(`images/hero_${h.id}_grip.png`);
  for (const id of STARTER_WEP_IDS) kick(`images/wep_${id}.png`);
  for (const g of Object.values(HAND_GEAR)) kick(g.path);
  for (const h of HEROES) {
    kick(`images/hero_${h.id}_atk.png`);
    for (let i = 0; i < 4; i += 1) {
      kick(`images/anim_${h.id}_idle_${i}.png`);
      kick(`images/anim_${h.id}_atk_${i}.png`);
    }
  }
  for (const e of ENEMY_PROTOS) {
    for (let i = 0; i < 4; i += 1) {
      kick(`images/anim_${e.id}_walk_${i}.png`);
      kick(`images/anim_${e.id}_atk_${i}.png`);
    }
    kick(`images/anim_${e.id}_idle_0.png`);
    kick(`images/anim_${e.id}_idle_1.png`);
  }
}

function finish(path: string, tex: PIXI.Texture | null): void {
  inflight.delete(path);
  if (tex) {
    cache.set(path, tex);
    notifyReady();
  } else {
    missing.add(path);
  }
  resolveWaiters(path, tex);
}

function kick(path: string): void {
  if (cache.has(path) || missing.has(path) || inflight.has(path)) return;
  inflight.add(path);

  const img = Platform.createImage();
  if (img) {
    img.onload = () => {
      try {
        finish(path, new PIXI.Texture(PIXI.BaseTexture.from(img)));
      } catch {
        finish(path, null);
      }
    };
    img.onerror = () => finish(path, null);
    img.src = path;
    return;
  }

  try {
    const t = PIXI.Texture.from(path);
    const ready = (): void => {
      finish(path, t.baseTexture.valid ? t : null);
    };
    if (t.baseTexture.valid) {
      ready();
      return;
    }
    t.baseTexture.once('loaded', ready);
    t.baseTexture.once('error', () => finish(path, null));
  } catch {
    finish(path, null);
  }
}

/** 等一张图进缓存或确认缺失。Loading 进度条靠这个数。 */
export function loadOne(path: string): Promise<PIXI.Texture | null> {
  const hit = cache.get(path);
  if (hit?.baseTexture.valid) return Promise.resolve(hit);
  if (missing.has(path) && !inflight.has(path)) return Promise.resolve(null);
  return new Promise((resolve) => {
    const list = waiters.get(path) ?? [];
    list.push(resolve);
    waiters.set(path, list);
    kick(path);
  });
}

export async function preloadPaths(
  paths: readonly string[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  const list = [...new Set(paths)];
  if (list.length === 0) {
    onProgress?.(1, 1);
    return;
  }
  let loaded = 0;
  await Promise.all(list.map(async (path) => {
    await loadOne(path);
    loaded += 1;
    onProgress?.(loaded, list.length);
  }));
}

/**
 * 铺满且不变形：按较大比例缩放后居中裁切。
 * 背景图与机型屏幕比例不会正好一致，直接拉伸会把地面透视拉歪，
 * 宁可切掉两侧的废品堆和卷帘门，那些本来就是装饰。
 */
export function fillCover(
  g: PIXI.Graphics,
  texture: PIXI.Texture,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const tw = texture.width || 1;
  const th = texture.height || 1;
  if (tw <= 1 || th <= 1) return;
  const scale = Math.max(w / tw, h / th);
  const matrix = new PIXI.Matrix();
  matrix.scale(scale, scale);
  matrix.translate(x + (w - tw * scale) / 2, y + (h - th * scale) / 2);
  g.beginTextureFill({ texture, matrix });
  g.drawRect(x, y, w, h);
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

/**
 * 选人卡立绘：整个人都要看得见。
 * 铺满裁切会切掉瘦高的人（二舅、老烟枪）的头顶，所以按 contain 缩进框内，脚落在下沿。
 */
export function addFitPortrait(
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
  const pad = 6;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const scale = Math.min(innerW / tw, innerH / th);
  const spr = new PIXI.Sprite(texture);
  spr.scale.set(scale);
  spr.x = x + (w - tw * scale) / 2;
  spr.y = y + h - pad - th * scale;
  const mask = new PIXI.Graphics();
  mask.beginFill(0xffffff).drawRoundedRect(x, y, w, h, radius).endFill();
  spr.mask = mask;
  parent.addChild(spr, mask);
}
