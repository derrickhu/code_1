/**
 * 本地贴图。微信/抖音必须走 createImage + src，不能 PIXI.Texture.from(路径)。
 * 后者会按浏览器 fetch 去拉文件，小游戏里拉不到，画面就会一直掉回色块。
 * 没加载完或失败时返回 null，调用方继续用色块，不挡玩。
 */
import * as PIXI from 'pixi.js';
import { ENEMIES } from '@/balance/stages';
import { HAND_GEAR, STARTER_WEP_IDS } from '@/balance/gear';
import { LEGACY_IDS, VILLAGERS } from '@/balance/villagers';
import { Platform } from '@/core/PlatformService';
import { SPARK_FLIP, VFX_FLIP, flipFiles, type FlipSpec } from '@/fx/Flipbook';

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

export function heroTex(id: string, stage = 1): PIXI.Texture | null {
  const s = Math.max(1, Math.min(3, Math.floor(stage)));
  const evo = tex(`images/hero_${id}_evo${s}.png`);
  if (evo) return evo;
  return tex(`images/hero_${id}.png`);
}

/**
 * 逻辑 id → 贴图文件名。小灰在表里叫 grunt，文件一直是 grey；
 * 对不上就会一直停在 Pixi 的白方块上。
 */
const ENEMY_ART_ID: Readonly<Record<string, string>> = {
  grunt: 'grey',
  rusher: 'grey',
  armor: 'canister',
};

export function enemyArtId(id: string): string {
  return ENEMY_ART_ID[id] ?? id;
}

export function enemyTex(id: string): PIXI.Texture | null {
  return tex(`images/enemy_${enemyArtId(id)}.png`);
}

/** 家伙的贴图。手上拿什么由村民 + 进化阶决定，见 gear.handIdOf */
export function gearTex(id: string): PIXI.Texture | null {
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
  const sheet = tex(`images/vfx_${spec.file}.png`);
  if (!sheet?.baseTexture.valid) return null;
  return sliceGrid(sheet, spec);
}

/** 火星随机一档，没有表就退回旧 spark */
export function vfxSparkFrame(): PIXI.Texture | null {
  const sheet = tex(`images/vfx_${SPARK_FLIP.file}.png`);
  if (!sheet?.baseTexture.valid) return vfxTex('spark');
  const frames = sliceGrid(sheet, SPARK_FLIP);
  if (frames.length === 0) return vfxTex('spark');
  return frames[Math.floor(Math.random() * frames.length)] ?? vfxTex('spark');
}

/** 背景没有透明区，走 jpg：同画质下比 png 小一个数量级，首包容量卡得很死 */
const BG_PATH = 'images/bg_battle.jpg';
const VILLAGE_BG = 'images/bg_village.jpg';
const VILLAGE_HOME_BG = 'images/bg_village_home.jpg';
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
  'growth_hands',
  'growth_reroll',
  'growth_luck',
  'growth_starter',
  'growth_pocket',
  'growth_breath',
  'growth_carry',
  'growth_scav',
  'settle_stamp',
  'settle_name',
  'settle_btn',
  'settle_chip',
  'ad_btn',
  'home_gate',
  'home_stall',
  'home_atlas',
  'home_stake',
  'home_post',
  'icon_scrap',
  'icon_parts',
  'icon_credits',
  'icon_pellets',
  'rust_plank',
  'rust_stamp',
  'rust_tile',
  'rust_btn',
  'dirt_pad',
  'fight_btn',
  'sandbag',
  'rust_exp',
  'rust_atlas',
  'rust_gate',
  'wood_sign',
  'gate_chu',
  'stall_chalk',
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
] as const;

export function bgTex(): PIXI.Texture | null {
  return tex(BG_PATH);
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
  const paths = [VILLAGE_BG, VILLAGE_HOME_BG, YARD_BG];
  for (const n of UI_FILES) paths.push(`images/ui_${n}.png`);
  for (const v of VILLAGERS) {
    paths.push(`images/hero_${v.id}.png`);
    for (const s of [1, 2, 3] as const) paths.push(`images/hero_${v.id}_evo${s}.png`);
  }
  for (const v of VILLAGERS) {
    for (let i = 0; i < 4; i += 1) {
      paths.push(`images/anim_${v.id}_idle_${i}.png`);
    }
  }
  for (const id of LEGACY_IDS) {
    paths.push(`images/hero_${id}_grip.png`);
  }
  for (const id of STARTER_WEP_IDS) paths.push(`images/wep_${id}.png`);
  for (const g of Object.values(HAND_GEAR)) paths.push(g.path);
  return paths;
}

export function preloadVillageArt(): void {
  for (const p of villageArtPaths()) kick(p);
}

/** 进战斗场景时把切片要用的图全踢起来，避免第一波还在色块 */
export function preloadBattleArt(): void {
  kick(BG_PATH);
  kick(VILLAGE_BG);
  for (const n of [
    'title_plaque', 'play_plate', 'iron_bar', 'iron_dock', 'scrap_pile',
    'settle_stamp', 'settle_name', 'settle_btn', 'settle_chip', 'ad_btn',
    'rust_btn', 'rust_plank', 'rust_tile', 'dirt_pad', 'fight_btn', 'sandbag',
    'battle_lintel',
  ] as const) {
    kick(`images/ui_${n}.png`);
  }
  for (const v of VILLAGERS) {
    kick(`images/hero_${v.id}.png`);
    for (const s of [1, 2, 3] as const) kick(`images/hero_${v.id}_evo${s}.png`);
  }
  // 从原型表读而不是写死 id：上次改名就是漏在这行，敌人图整批加载不到
  for (const e of ENEMIES) kick(`images/enemy_${enemyArtId(e.id)}.png`);
  for (const n of VFX_FILES) kick(`images/vfx_${n}.png`);
  for (const p of flipFiles()) kick(p);
  for (const n of PROJ_FILES) kick(`images/proj_${n}.png`);
  kick('images/hero_dachui_grip.png');
  kick('images/fx_hammer.png');
  for (const id of STARTER_WEP_IDS) kick(`images/wep_${id}.png`);
  for (const g of Object.values(HAND_GEAR)) kick(g.path);
  for (const id of LEGACY_IDS) {
    kick(`images/hero_${id}_grip.png`);
    kick(`images/hero_${id}_atk.png`);
  }
  for (const v of VILLAGERS) {
    for (let i = 0; i < 4; i += 1) {
      kick(`images/anim_${v.id}_idle_${i}.png`);
      kick(`images/anim_${v.id}_atk_${i}.png`);
    }
  }
  for (const e of ENEMIES) {
    const art = enemyArtId(e.id);
    for (let i = 0; i < 4; i += 1) {
      kick(`images/anim_${art}_walk_${i}.png`);
      kick(`images/anim_${art}_atk_${i}.png`);
    }
    kick(`images/anim_${art}_idle_0.png`);
    kick(`images/anim_${art}_idle_1.png`);
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
