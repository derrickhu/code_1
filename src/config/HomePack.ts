/**
 * 村口主界面进分包，不走 CDN。
 *
 * 微信主包 / 单分包都卡 4MB。Loading 插画留主包；村口壳合计约 5.4MB，
 * 拆成 pkg-home 与 pkg-home-art（锈铁图鉴墙 + 铁门底）。
 * Loading 出插画后再 loadSubpackage，浏览器开发期剥回 assets 路径。
 */
export const HOME_PACK_ROOT = 'subpackages/pkg-home';
export const HOME_ART_PACK_ROOT = 'subpackages/pkg-home-art';

export const HOME_PACK_ROOTS = [HOME_PACK_ROOT, HOME_ART_PACK_ROOT] as const;

/** 两张大门图单独一包，避免单分包超过 4MB */
export const HOME_ART_UI_NAMES = ['rust_atlas', 'rust_gate'] as const;

/** 村口第一眼用到的 UI。战斗专用件（结算章、战场门楣）仍走 CDN。 */
export const HOME_UI_NAMES = [
  'top_lintel', 'rust_stamp', 'rust_exp', 'rust_btn',
  'icon_scrap', 'icon_parts', 'icon_credits', 'icon_pellets', 'scrap_pile',
  'paint_scrap', 'paint_parts', 'paint_credits', 'paint_pellets',
  'paint_cunzi', 'paint_ji',
  'paint_0', 'paint_1', 'paint_2', 'paint_3', 'paint_4',
  'paint_5', 'paint_6', 'paint_7', 'paint_8', 'paint_9',
  'stall_chalk', 'home_stall', 'home_post', 'home_atlas', 'home_horn',
  'stage_post', 'wood_sign', 'gate_chu', 'rust_plank', 'rust_tile',
  ...HOME_ART_UI_NAMES,
] as const;

const HOME_UI_SET = new Set<string>(HOME_UI_NAMES);
const HOME_ART_SET = new Set<string>(HOME_ART_UI_NAMES);

export function isHomeUiName(name: string): boolean {
  return HOME_UI_SET.has(name);
}

export function homeUiPackRoot(name: string): string {
  return HOME_ART_SET.has(name) ? HOME_ART_PACK_ROOT : HOME_PACK_ROOT;
}

export function homePackPath(logical: string): string {
  const n = logical.replace(/^\/+/, '');
  if (n.startsWith('subpackages/')) return n;
  const ui = /^images\/ui\/([^.]+)\.png$/.exec(n);
  if (ui?.[1] && HOME_ART_SET.has(ui[1])) return `${HOME_ART_PACK_ROOT}/${n}`;
  return `${HOME_PACK_ROOT}/${n}`;
}

/** 开发期 / 浏览器没有分包目录，剥回 assets 逻辑路径 */
export function unpackHomePackPath(path: string): string {
  for (const root of HOME_PACK_ROOTS) {
    const prefix = `${root}/`;
    if (path.startsWith(prefix)) return path.slice(prefix.length);
  }
  return path;
}

export function isHomePackPath(path: string): boolean {
  const n = path.replace(/^\/+/, '');
  return HOME_PACK_ROOTS.some((root) => n === root || n.startsWith(`${root}/`));
}
