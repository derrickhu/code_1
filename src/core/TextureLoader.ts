/**
 * 本地贴图。微信/抖音必须走 createImage + src，不能 PIXI.Texture.from(路径)。
 * 后者会按浏览器 fetch 去拉文件，小游戏里拉不到，画面就会一直掉回色块。
 * 没加载完或失败时返回 null，调用方继续用色块，不挡玩。
 * 到货后 watchArt 通知；持久节点（弹弓摊货架）必须 refresh，不能只 mount 一次。
 * tex() 失败会记 missing，不再每帧重试；ensureAssets / loadOne 会再给一次机会。
 */
import * as PIXI from 'pixi.js';
import { homePackPath, isHomeUiName } from '@/config/HomePack';
import { CdnAssetService } from '@/core/CdnAssetService';
import { Platform } from '@/core/PlatformService';
import { SPARK_FLIP, VFX_FLIP, type FlipSpec } from '@/fx/Flipbook';

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

/** 微信 createImage 有时 onload 先响、宽高还是 0。这种图不能当立绘用。 */
export function texReady(t: PIXI.Texture | null | undefined): boolean {
  return !!t?.baseTexture.valid && t.width > 8 && t.height > 8;
}

export function tex(path: string): PIXI.Texture | null {
  const hit = cache.get(path);
  if (texReady(hit) && hit) return hit;
  if (hit) cache.delete(path);
  if (!missing.has(path)) kick(path);
  return null;
}

export function heroStillPath(id: string): string {
  return `images/hero/${id}.png`;
}
export function heroEvoPath(id: string, stage: number): string {
  return `images/hero/${id}_evo${stage}.png`;
}
export function heroAtkPath(id: string): string {
  return `images/hero/${id}_atk.png`;
}
export function animPath(id: string, clip: string, i: number): string {
  return `images/anim/${id}_${clip}_${i}.png`;
}
export function uiPath(name: string): string {
  const logical = `images/ui/${name}.png`;
  return isHomeUiName(name) ? homePackPath(logical) : logical;
}
export function vfxPath(name: string): string {
  return `images/vfx/${name}.png`;
}
export function projPath(name: string): string {
  return `images/proj/${name}.png`;
}

export function heroTex(id: string, stage = 1): PIXI.Texture | null {
  const s = Math.max(1, Math.min(3, Math.floor(stage)));
  const evo = tex(heroEvoPath(id, s));
  if (evo) return evo;
  return tex(heroStillPath(id));
}

/**
 * 逻辑 id → 贴图文件名。小灰在表里叫 grunt，文件一直是 grey；
 * 对不上就会一直停在 Pixi 的白方块上。其余怪文件名跟逻辑 id 一致。
 */
const ENEMY_ART_ID: Readonly<Record<string, string>> = {
  grunt: 'grey',
};

export function enemyArtId(id: string): string {
  return ENEMY_ART_ID[id] ?? id;
}

export function enemyArtPath(id: string): string {
  return `images/enemy/${enemyArtId(id)}.png`;
}

export function enemyTex(id: string): PIXI.Texture | null {
  return tex(enemyArtPath(id));
}

export const VFX_FILES = [
  'glow', 'streak', 'spark', 'ring', 'bolt', 'orb', 'fire',
  'slash', 'saw', 'smash', 'poke', 'blast', 'wind', 'pierce', 'flash',
  'claw', 'beam', 'shield', 'heal',
] as const;

export const PROJ_FILES = ['pebble', 'needle', 'disc', 'pipe', 'cracker', 'leaf', 'cleaver'] as const;

export function projTex(name: string): PIXI.Texture | null {
  return tex(projPath(name));
}

export function vfxTex(name: string): PIXI.Texture | null {
  return tex(vfxPath(name));
}

const flipCache = new Map<string, PIXI.Texture[]>();

function sliceGrid(sheet: PIXI.Texture, spec: FlipSpec): PIXI.Texture[] {
  const key = `${spec.file}:${sheet.baseTexture.uid}:${spec.cols}x${spec.rows}`;
  const hit = flipCache.get(key);
  if (hit) return hit;
  const bw = sheet.baseTexture.width;
  const bh = sheet.baseTexture.height;
  const cw = Math.floor(bw / spec.cols);
  const ch = Math.floor(bh / spec.rows);
  const frames: PIXI.Texture[] = [];
  for (let r = 0; r < spec.rows; r += 1) {
    for (let c = 0; c < spec.cols; c += 1) {
      frames.push(new PIXI.Texture(sheet.baseTexture, new PIXI.Rectangle(c * cw, r * ch, cw, ch)));
    }
  }
  flipCache.set(key, frames);
  return frames;
}

/** 落点序列。表还没进缓存时返回 null，调用方继续用单帧，不挡玩 */
export function vfxFlipFrames(name: string): PIXI.Texture[] | null {
  const spec = VFX_FLIP[name];
  if (!spec) return null;
  const sheet = tex(vfxPath(spec.file));
  if (!sheet?.baseTexture.valid) return null;
  return sliceGrid(sheet, spec);
}

/** 火星随机一档，没有表就退回旧 spark */
export function vfxSparkFrame(): PIXI.Texture | null {
  const sheet = tex(vfxPath(SPARK_FLIP.file));
  if (!sheet?.baseTexture.valid) return vfxTex('spark');
  const frames = sliceGrid(sheet, SPARK_FLIP);
  if (frames.length === 0) return vfxTex('spark');
  return frames[Math.floor(Math.random() * frames.length)] ?? vfxTex('spark');
}

/** 背景没有透明区，走 jpg：同画质下比 png 小一个数量级，首包容量卡得很死 */
export const BATTLE_BG = 'images/bg/battle.jpg';
/** 村口底图进分包，字面量须完整，used-assets 靠它扫盘 */
export const VILLAGE_BG = 'subpackages/pkg-home/images/bg/village.jpg';
export const VILLAGE_HOME_BG = 'subpackages/pkg-home/images/bg/village_home.jpg';
export const YARD_BG = 'images/bg/yard.jpg';
export const STALL_BG = 'images/bg/stall.jpg';
/** 出村后的章节路径底图。主包 jpg，跟院子同一档 */
export const ROAD_BG = 'images/bg/road.jpg';

export const UI_FILES = [
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
  'growth_hands',
  'growth_reroll',
  'growth_luck',
  'growth_starter',
  'growth_pocket',
  'growth_breath',
  'settle_stamp',
  'settle_name',
  'settle_btn',
  'settle_chip',
  'ad_btn',
  'home_gate',
  'home_stall',
  'home_atlas',
  'home_post',
  'home_horn',
  'icon_scrap',
  'icon_parts',
  'icon_credits',
  'icon_pellets',
  'rust_plank',
  'rust_stamp',
  'rust_sheet',
  'rust_panel',
  'rust_badge',
  'star_on',
  'star_off',
  'star_rail',
  'craft_rail',
  'bar_track',
  'bar_fill',
  'rust_tile',
  'rust_btn',
  'dirt_pad',
  'road_nodes',
  'fight_btn',
  'sandbag',
  'rust_exp',
  'rust_atlas',
  'rust_gate',
  'wood_sign',
  'gate_chu',
  'stall_chalk',
  'stall_cans',
  'stall_bottles',
  'stall_tv',
  'stall_crate',
  'stall_basin',
  'stall_horn',
  'stall_sling',
  'stage_post',
  'top_lintel',
  'battle_lintel',
  'paint_cunzi',
  'paint_ji',
  'paint_0',
  'paint_1',
  'paint_2',
  'paint_3',
  'paint_4',
  'paint_5',
  'paint_6',
  'paint_7',
  'paint_8',
  'paint_9',
  'paint_scrap',
  'paint_parts',
  'paint_credits',
  'paint_pellets',
  'paint_shangchang',
  'paint_lai',
  'paint_zhi',
  'paint_bo',
  'paint_di',
  'paint_lou',
  'paint_changshang',
  'paint_menlu',
] as const;

export function bgTex(): PIXI.Texture | null {
  return tex(BATTLE_BG);
}

export function villageBgTex(): PIXI.Texture | null {
  return tex(VILLAGE_BG) ?? bgTex();
}

export function villageHomeBgTex(): PIXI.Texture | null {
  return tex(VILLAGE_HOME_BG) ?? villageBgTex();
}

export function yardBgTex(): PIXI.Texture | null {
  return tex(YARD_BG) ?? villageBgTex();
}

export function stallBgTex(): PIXI.Texture | null {
  return tex(STALL_BG) ?? yardBgTex();
}

export function roadBgTex(): PIXI.Texture | null {
  return tex(ROAD_BG) ?? villageHomeBgTex();
}

export type UiName = (typeof UI_FILES)[number];

export function uiTex(name: UiName): PIXI.Texture | null {
  return tex(uiPath(name));
}

const ROAD_NODE_FRAMES = new Map<string, PIXI.Texture>();

/** 三帧透明边不等，按不透明区域裁，墩心才在贴图正中 */
const ROAD_NODE_INSET = {
  cleared: { l: 5 / 207, t: 5 / 156, r: 21 / 207, b: 6 / 156 },
  active: { l: 17 / 207, t: 6 / 156, r: 13 / 207, b: 6 / 156 },
  locked: { l: 21 / 207, t: 6 / 156, r: 6 / 207, b: 5 / 156 },
} as const;

/** 路径图圆墩：铜锈已通 / 金边当前 / 灰铁未开 */
export function roadNodeTex(kind: 'cleared' | 'active' | 'locked'): PIXI.Texture | null {
  const cached = ROAD_NODE_FRAMES.get(kind);
  if (cached) return cached;
  const sheet = uiTex('road_nodes');
  if (!sheet?.baseTexture.valid || sheet.width <= 3) return null;
  const fw = Math.floor(sheet.width / 3);
  const col = kind === 'cleared' ? 0 : kind === 'active' ? 1 : 2;
  const inset = ROAD_NODE_INSET[kind];
  const frame = new PIXI.Texture(
    sheet.baseTexture,
    new PIXI.Rectangle(
      col * fw + Math.round(inset.l * fw),
      Math.round(inset.t * sheet.height),
      Math.max(1, Math.round((1 - inset.l - inset.r) * fw)),
      Math.max(1, Math.round((1 - inset.t - inset.b) * sheet.height)),
    ),
  );
  ROAD_NODE_FRAMES.set(kind, frame);
  return frame;
}

/** Loading 首屏插画，须在主包，勿走 CDN */
export const LOADING_SPLASH = 'images/boot/loading_splash.jpg';
/** Loading / 村子主页标题字标，须在主包 */
export const LOADING_TITLE = 'images/boot/title_logo.png';

function finish(path: string, next: PIXI.Texture | null, err?: unknown): void {
  inflight.delete(path);
  if (next && !texReady(next)) {
    err = err ?? `texture ${next.width}x${next.height}`;
    next = null;
  }
  if (next) {
    cache.set(path, next);
    missing.delete(path);
    notifyReady();
  } else {
    missing.add(path);
    console.warn(`[tex] 加载失败 ${path}`, err ?? '');
  }
  resolveWaiters(path, next);
}

function bindSrc(path: string, src: string): void {
  const img = Platform.createImage();
  if (img) {
    let done = false;
    const accept = (): boolean => {
      if (done) return true;
      const w = Number(img.width || img.naturalWidth || 0);
      const h = Number(img.height || img.naturalHeight || 0);
      if (w <= 8 || h <= 8) return false;
      try {
        done = true;
        finish(path, new PIXI.Texture(PIXI.BaseTexture.from(img)));
      } catch (e) {
        done = true;
        finish(path, null, e);
      }
      return true;
    };
    img.onload = () => {
      if (accept()) return;
      setTimeout(() => {
        if (accept()) return;
        if (done) return;
        done = true;
        finish(path, null, `empty image ${img.width}x${img.height} src=${src}`);
      }, 80);
    };
    img.onerror = () => {
      if (done) return;
      done = true;
      finish(path, null, `onerror src=${src}`);
    };
    img.src = src;
    return;
  }

  try {
    const t = PIXI.Texture.from(src);
    const ready = (): void => {
      finish(path, t.baseTexture.valid ? t : null);
    };
    if (t.baseTexture.valid) {
      ready();
      return;
    }
    t.baseTexture.once('loaded', ready);
    t.baseTexture.once('error', () => finish(path, null, `pixi error src=${src}`));
  } catch (e) {
    finish(path, null, e);
  }
}

function kick(path: string): void {
  if (texReady(cache.get(path))) return;
  if (cache.has(path)) cache.delete(path);
  if (missing.has(path) || inflight.has(path)) return;
  inflight.add(path);

  const ready = CdnAssetService.resolveAsset(path);
  if (ready) {
    bindSrc(path, ready);
    return;
  }
  void CdnAssetService.resolveOrDownload(path)
    .then((src) => bindSrc(path, src))
    .catch((e) => finish(path, null, e));
}

/** 等一张图进缓存或确认缺失。Loading 进度条靠这个数。 */
export function loadOne(path: string): Promise<PIXI.Texture | null> {
  const hit = cache.get(path);
  if (texReady(hit) && hit) return Promise.resolve(hit);
  if (hit) cache.delete(path);
  // tex() 失败会进 missing，不再每帧重试；ensureAssets / preload 再给一次机会
  if (missing.has(path) && !inflight.has(path)) missing.delete(path);
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
  alignY = 0.5,
): void {
  const tw = texture.width || 1;
  const th = texture.height || 1;
  if (tw <= 1 || th <= 1) return;
  const scale = Math.max(w / tw, h / th);
  const matrix = new PIXI.Matrix();
  matrix.scale(scale, scale);
  matrix.translate(x + (w - tw * scale) / 2, y + (h - th * scale) * alignY);
  g.beginTextureFill({ texture, matrix });
  g.drawRect(x, y, w, h);
  g.endFill();
}

/**
 * 只铺原图的一块 UV，再按 cover 裁进目标框。
 * 弹弓摊用它把墙面木梁对准货架，顺便切掉两侧帘子。
 */
export function fillCoverUv(
  g: PIXI.Graphics,
  texture: PIXI.Texture,
  x: number,
  y: number,
  w: number,
  h: number,
  uv: { x?: number; y: number; w?: number; h: number },
  alignY = 0.5,
): void {
  const texW = texture.width || 1;
  const texH = texture.height || 1;
  const uvX = uv.x ?? 0;
  const uvW = uv.w ?? 1;
  const srcW = texW * uvW;
  const srcH = texH * uv.h;
  if (srcW <= 1 || srcH <= 1) return;
  const scale = Math.max(w / srcW, h / srcH);
  const matrix = new PIXI.Matrix();
  matrix.scale(scale, scale);
  matrix.translate(
    x + (w - srcW * scale) / 2 - texW * uvX * scale,
    y + (h - srcH * scale) * alignY - texH * uv.y * scale,
  );
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
 * 立绘缩进框内。选人卡脚贴下沿；图鉴墙格子走 center，人落在格子正中。
 */
export function addFitPortrait(
  parent: PIXI.Container,
  texture: PIXI.Texture,
  x: number,
  y: number,
  w: number,
  h: number,
  radius = 14,
  align: 'feet' | 'center' = 'feet',
): void {
  const tw = texture.width || 1;
  const th = texture.height || 1;
  if (tw <= 1 || th <= 1) return;
  const pad = Math.max(3, Math.round(Math.min(w, h) * 0.08));
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const scale = Math.min(innerW / tw, innerH / th);
  const spr = new PIXI.Sprite(texture);
  spr.scale.set(scale);
  spr.x = x + (w - tw * scale) / 2;
  spr.y = align === 'center'
    ? y + (h - th * scale) / 2
    : y + h - pad - th * scale;
  const mask = new PIXI.Graphics();
  mask.beginFill(0xffffff).drawRoundedRect(x, y, w, h, radius).endFill();
  spr.mask = mask;
  parent.addChild(spr, mask);
}
