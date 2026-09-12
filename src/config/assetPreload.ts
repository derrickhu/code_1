/**
 * 场景按需预加载（避免开局把全村立绘 / 全战斗图写进微信本地缓存）。
 *
 * 对齐 xiaochu2：
 * - 启动只等 MAIN_PRELOAD_IMAGES（主包 Loading 插画，不含分包路径）
 * - Loading 出图后再等 VILLAGE_HOME_SHELL（分包村口壳，不含全英雄）
 * - 立绘 / 战斗 / 摊子走 CDN，各页 ensureAssets(本屏清单) 后台预热
 */
import { HAND_GEAR, resolveHandGear, wearOf } from '@/balance/gear';
import { ENEMIES, getStage, type StageDef } from '@/balance/stages';
import {
  DEFAULT_SQUAD, VILLAGERS, getVillager, jobOf, type Job,
} from '@/balance/villagers';
import {
  BATTLE_BG,
  LOADING_SPLASH,
  LOADING_TITLE,
  PROJ_FILES,
  ROAD_BG,
  STALL_BG,
  VFX_FILES,
  VILLAGE_BG,
  VILLAGE_HOME_BG,
  YARD_BG,
  animPath,
  enemyArtId,
  enemyArtPath,
  hasHeroGrip,
  heroEvoPath,
  heroGripPath,
  heroStillPath,
  modPath,
  projPath,
  uiPath,
  vfxPath,
} from '@/core/TextureLoader';
import { HOME_UI_NAMES } from '@/config/HomePack';
import { flipFiles } from '@/fx/Flipbook';

export interface HeroArtNeed {
  id: string;
  evo?: number;
  lane?: string;
}

function unique(paths: readonly string[]): string[] {
  return [...new Set(paths.filter(Boolean))];
}

function clampEvo(raw?: number): number {
  return Math.max(1, Math.min(3, Math.floor(raw ?? 1)));
}

function laneOf(need: HeroArtNeed): string {
  if (need.lane) return need.lane;
  try {
    return getVillager(need.id).lane;
  } catch {
    return 'stand';
  }
}

const PAINT_DIGITS = [
  'paint_0', 'paint_1', 'paint_2', 'paint_3', 'paint_4',
  'paint_5', 'paint_6', 'paint_7', 'paint_8', 'paint_9',
] as const;

const HOME_CHROME = HOME_UI_NAMES;

const BATTLE_CHROME = [
  'title_plaque', 'play_plate', 'iron_bar', 'iron_dock', 'scrap_pile',
  'settle_stamp', 'settle_name', 'settle_btn', 'settle_chip', 'ad_btn',
  'rust_btn', 'rust_plank', 'rust_tile', 'dirt_pad', 'fight_btn', 'sandbag',
  'battle_lintel', 'rust_stamp',
  'paint_shangchang', 'paint_lai', 'paint_zhi', 'paint_bo',
  'paint_di', 'paint_lou', 'paint_changshang', 'paint_menlu',
  ...PAINT_DIGITS,
] as const;

const STALL_CHROME = [
  'battle_lintel', 'stall_chalk', 'stall_cans', 'stall_bottles', 'stall_tv',
  'stall_crate', 'stall_basin', 'stall_horn', 'stall_sling',
  'icon_scrap', 'icon_parts', 'icon_credits', 'icon_pellets',
  'paint_scrap', 'paint_parts', 'paint_credits', 'paint_pellets',
  ...PAINT_DIGITS,
  'rust_btn', 'ad_btn', 'rust_plank',
] as const;

const ROAD_CHROME = [
  'rust_plank', 'rust_btn', 'rust_tile', 'dirt_pad', 'rust_stamp',
  'road_nodes', 'fight_btn',
] as const;

const FOLKS_CHROME = [
  'top_lintel', 'rust_stamp', 'rust_exp', 'rust_tile', 'rust_plank', 'rust_btn',
  'rust_sheet', 'rust_badge',
  'icon_scrap', 'icon_parts', 'icon_credits', 'icon_pellets',
  'paint_scrap', 'paint_parts', 'paint_credits', 'paint_pellets',
  ...PAINT_DIGITS,
] as const;

/** 启动只等主包首屏。不要带 subpackages/，冷启动一张分包图会拖整包。 */
export const MAIN_PRELOAD_IMAGES: readonly string[] = [
  LOADING_SPLASH,
  LOADING_TITLE,
];

/** 村口壳：分包本地图，Loading 出插画后再等。不含全村民立绘/动画。 */
export const VILLAGE_HOME_SHELL: readonly string[] = [
  VILLAGE_BG,
  VILLAGE_HOME_BG,
  ...HOME_CHROME.map(uiPath),
];

export const DEFERRED_PRELOAD_IMAGES: readonly string[] = [...VILLAGE_HOME_SHELL];

export const STALL_SHELL_IMAGES: readonly string[] = [
  STALL_BG,
  YARD_BG,
  ...STALL_CHROME.map(uiPath),
];

export const FOLKS_SHELL_IMAGES: readonly string[] = [
  VILLAGE_BG,
  VILLAGE_HOME_BG,
  ...FOLKS_CHROME.map(uiPath),
];

export const ROAD_SHELL_IMAGES: readonly string[] = [
  ROAD_BG,
  VILLAGE_HOME_BG,
  ...ROAD_CHROME.map(uiPath),
];

export const BATTLE_SHELL_IMAGES: readonly string[] = [
  BATTLE_BG,
  VILLAGE_BG,
  ...BATTLE_CHROME.map(uiPath),
];

/** 战场特效：进场后后台补，不挡开战。 */
export const BATTLE_FX_IMAGES: readonly string[] = unique([
  ...VFX_FILES.map((n) => vfxPath(n)),
  ...flipFiles(),
  ...PROJ_FILES.map((n) => projPath(n)),
  'images/fx/hammer.png',
]);

export function heroStillArt(need: HeroArtNeed): string[] {
  const evo = clampEvo(need.evo);
  const paths = [heroEvoPath(need.id, evo), heroStillPath(need.id)];
  if (hasHeroGrip(need.id)) paths.push(heroGripPath(need.id));
  return paths;
}

export function heroIdleArt(need: HeroArtNeed): string[] {
  const paths = heroStillArt(need);
  for (let i = 0; i < 4; i += 1) paths.push(animPath(need.id, 'idle', i));
  return paths;
}

export function heroBattleArt(need: HeroArtNeed): string[] {
  const evo = clampEvo(need.evo);
  const paths = heroIdleArt(need);
  for (let i = 0; i < 4; i += 1) paths.push(animPath(need.id, 'atk', i));
  paths.push(resolveHandGear(need.id, evo).path);
  const wear = wearOf(need.id, laneOf(need), evo);
  for (const item of [wear.head, wear.back, wear.body]) {
    if (item) paths.push(modPath(item));
  }
  return paths;
}

export function enemyBattleArt(id: string): string[] {
  const art = enemyArtId(id);
  const paths = [enemyArtPath(id)];
  for (let i = 0; i < 4; i += 1) {
    paths.push(animPath(art, 'walk', i));
    paths.push(animPath(art, 'atk', i));
  }
  paths.push(animPath(art, 'idle', 0), animPath(art, 'idle', 1));
  return paths;
}

export function stageEnemyIds(stage: StageDef): string[] {
  const ids = new Set<string>();
  for (const wave of stage.waves) {
    for (const g of wave.groups) ids.add(g.enemy);
  }
  return [...ids];
}

export function hornPreloadImages(people: readonly HeroArtNeed[] = []): string[] {
  const paths = [...VILLAGE_HOME_SHELL];
  for (const p of people) paths.push(...heroIdleArt(p));
  return unique(paths);
}

export function villageHomeImages(people: readonly HeroArtNeed[] = []): string[] {
  const paths = [...VILLAGE_HOME_SHELL];
  for (const p of people) paths.push(...heroIdleArt(p));
  return unique(paths);
}

export function roadPreloadImages(people: readonly HeroArtNeed[] = []): string[] {
  const paths = [...ROAD_SHELL_IMAGES];
  for (const p of people) paths.push(...heroIdleArt(p));
  return unique(paths);
}

export function stallPreloadImages(): string[] {
  return [...STALL_SHELL_IMAGES];
}

export function folksPreloadImages(opts?: {
  job?: Job | 'all';
  owned?: ReadonlySet<string>;
  evo?: Readonly<Record<string, number>>;
}): string[] {
  const job = opts?.job ?? 'all';
  const paths = [...FOLKS_SHELL_IMAGES];
  const shown = VILLAGERS.filter((v) => job === 'all' || jobOf(v.role) === job);
  for (const v of shown) {
    const evo = opts?.owned?.has(v.id) ? (opts.evo?.[v.id] ?? 1) : 1;
    paths.push(...heroStillArt({ id: v.id, evo, lane: v.lane }));
  }
  return unique(paths);
}

export function villagerDetailImages(id: string, evo = 1): string[] {
  const paths = [...FOLKS_SHELL_IMAGES];
  for (const s of [1, 2, 3] as const) {
    paths.push(...heroStillArt({ id, evo: s }));
  }
  paths.push(...heroIdleArt({ id, evo }));
  return unique(paths);
}

export function battlePreloadImages(
  stageId: number,
  heroes: readonly HeroArtNeed[],
): string[] {
  const stage = getStage(stageId);
  const paths = [...BATTLE_SHELL_IMAGES];
  for (const h of heroes) paths.push(...heroBattleArt(h));
  for (const id of stageEnemyIds(stage)) paths.push(...enemyBattleArt(id));
  return unique(paths);
}

/** 出手预览台：本机浏览器，可以把当前池子一次性拉齐。 */
export function animLabImages(): string[] {
  const paths = [...BATTLE_SHELL_IMAGES, ...BATTLE_FX_IMAGES];
  for (const v of VILLAGERS) {
    for (const s of [1, 2, 3] as const) {
      paths.push(...heroBattleArt({ id: v.id, evo: s, lane: v.lane }));
    }
  }
  for (const g of Object.values(HAND_GEAR)) paths.push(g.path);
  for (const e of ENEMIES) paths.push(...enemyBattleArt(e.id));
  return unique(paths);
}

/** 对照用：若开局整包踢图会拉到的全集（测试预算，运行时不要用）。 */
export function villageArtDump(): string[] {
  const paths = [VILLAGE_BG, VILLAGE_HOME_BG, YARD_BG, STALL_BG, ROAD_BG];
  for (const v of VILLAGERS) {
    paths.push(heroStillPath(v.id));
    for (const s of [1, 2, 3] as const) paths.push(heroEvoPath(v.id, s));
    for (let i = 0; i < 4; i += 1) paths.push(animPath(v.id, 'idle', i));
  }
  return unique(paths);
}

export function defaultHomePeople(): HeroArtNeed[] {
  return DEFAULT_SQUAD.map((id) => ({ id, evo: 1 }));
}
