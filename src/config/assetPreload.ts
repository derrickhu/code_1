/**
 * 场景按需预加载（避免开局把全村立绘 / 全战斗图写进微信本地缓存）。
 *
 * 对齐 xiaochu2：
 * - 启动只等 MAIN_PRELOAD_IMAGES（主包 Loading 插画，不含分包路径）
 * - Loading 出图后再等 VILLAGE_HOME_SHELL（分包村口壳，不含全英雄）
 * - 立绘 / 战斗 / 摊子走 CDN，各页 ensureAssets(本屏清单) 后台预热
 */
import { ENEMIES, getEnemy, getStage, type StageDef } from '@/balance/stages';
import {
  DEFAULT_SQUAD, VILLAGERS, jobOf, type Job,
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
  heroEvoPath,
  heroStillPath,
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
  'rust_sheet', 'rust_panel', 'rust_badge', 'fight_btn',
  'star_on', 'star_off', 'star_rail', 'craft_rail', 'bar_track', 'bar_fill',
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
]);

export function heroStillArt(need: HeroArtNeed): string[] {
  const evo = clampEvo(need.evo);
  return [heroEvoPath(need.id, evo), heroStillPath(need.id)];
}

/**
 * 先下站姿切片，人能立刻站出来。高清立绘随后补。
 * 真机 CDN 并发只有 4，立绘若排在最前，三婶这种没在村口缓存过的人会空等半晌。
 */
export function heroFaceArt(need: HeroArtNeed): string[] {
  const evo = clampEvo(need.evo);
  return [
    animPath(need.id, 'idle', 0),
    animPath(need.id, 'idle', 1),
    heroStillPath(need.id),
    heroEvoPath(need.id, evo),
  ];
}

export function heroIdleArt(need: HeroArtNeed): string[] {
  const paths = heroFaceArt(need);
  for (let i = 2; i < 4; i += 1) paths.push(animPath(need.id, 'idle', i));
  return paths;
}

export function heroBattleArt(need: HeroArtNeed): string[] {
  const paths = heroIdleArt(need);
  for (let i = 0; i < 4; i += 1) paths.push(animPath(need.id, 'atk', i));
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

/**
 * 这一关会出现哪些怪。
 *
 * **要把下的蛋也算进来。** 孵化器的蛋不写在波次表里，但它一定会上场；
 * 第 8 章正好有孵化器而没有小灰，漏掉就是打到一半蹦出一排白方块。
 */
export function stageEnemyIds(stage: StageDef): string[] {
  const ids = new Set<string>();
  const add = (id: string): void => {
    if (ids.has(id)) return;
    ids.add(id);
    const egg = getEnemy(id).spawn?.enemy;
    if (egg) add(egg);
  };
  for (const wave of stage.waves) {
    for (const g of wave.groups) add(g.enemy);
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

/** 上场的人先露脸。进战斗先拉这一批，顶板和特效往后排 */
export function battleFaceImages(heroes: readonly HeroArtNeed[]): string[] {
  const paths: string[] = [];
  for (const h of heroes) paths.push(...heroFaceArt(h));
  return unique(paths);
}

export function battlePreloadImages(
  stageId: number,
  heroes: readonly HeroArtNeed[],
): string[] {
  const stage = getStage(stageId);
  const faces: string[] = [];
  const rest = [...BATTLE_SHELL_IMAGES];
  for (const h of heroes) {
    faces.push(...heroFaceArt(h));
    rest.push(...heroBattleArt(h));
  }
  for (const id of stageEnemyIds(stage)) rest.push(...enemyBattleArt(id));
  return unique([...faces, ...rest]);
}

/** 出手预览台：本机浏览器，可以把当前池子一次性拉齐。 */
export function animLabImages(): string[] {
  const paths = [...BATTLE_SHELL_IMAGES, ...BATTLE_FX_IMAGES];
  for (const v of VILLAGERS) {
    for (const s of [1, 2, 3] as const) {
      paths.push(...heroBattleArt({ id: v.id, evo: s, lane: v.lane }));
    }
  }
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
