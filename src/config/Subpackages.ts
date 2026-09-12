/**
 * 小游戏分包：微信 wx.loadSubpackage / 抖音 tt.loadSubpackage。
 *
 * 主包只留 Loading 插画和短音效。村口壳在 pkg-home / pkg-home-art，
 * 进村前在 Loading 里等它们。
 */
import { HOME_ART_PACK_ROOT, HOME_PACK_ROOT } from '@/config/HomePack';
import { Platform } from '@/core/PlatformService';

export const SUBPACKAGE_ROOT = {
  home: HOME_PACK_ROOT,
  homeArt: HOME_ART_PACK_ROOT,
} as const;

export type SubpackageName = keyof typeof SUBPACKAGE_ROOT;

const PLATFORM_SUBPACKAGE_NAME: Record<SubpackageName, string> = {
  home: 'pkg-home',
  homeArt: 'pkg-home-art',
};

const NAME_BY_PREFIX = (Object.entries(SUBPACKAGE_ROOT) as [SubpackageName, string][])
  .map(([name, root]) => ({ name, prefix: `${root}/` }));

const loaded = new Set<SubpackageName>();
const inflight = new Map<SubpackageName, Promise<void>>();

export function subpackageForPath(assetPath: string): SubpackageName | null {
  for (const { name, prefix } of NAME_BY_PREFIX) {
    if (assetPath.startsWith(prefix)) return name;
  }
  return null;
}

export function loadSubpackage(name: SubpackageName): Promise<void> {
  if (loaded.has(name)) return Promise.resolve();
  const pending = inflight.get(name);
  if (pending) return pending;
  if (!Platform.isMinigame) {
    loaded.add(name);
    return Promise.resolve();
  }
  const api = Platform.api;
  const loadPkg = api?.loadSubpackage;
  if (!loadPkg) {
    loaded.add(name);
    return Promise.resolve();
  }
  const promise = new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      const err = new Error(`[Subpackage] 加载超时 ${PLATFORM_SUBPACKAGE_NAME[name]}`);
      console.error(err.message);
      finish(() => reject(err));
    }, 45000);
    loadPkg.call(api, {
      name: PLATFORM_SUBPACKAGE_NAME[name],
      success: () => {
        loaded.add(name);
        finish(resolve);
      },
      fail: (err: unknown) => {
        console.error(`[Subpackage] 加载失败 ${PLATFORM_SUBPACKAGE_NAME[name]}`, err);
        finish(() => reject(err));
      },
    });
  }).finally(() => {
    inflight.delete(name);
  });
  inflight.set(name, promise);
  return promise;
}

export async function loadSubpackagesForPaths(paths: readonly string[]): Promise<void> {
  const names = new Set<SubpackageName>();
  for (const p of paths) {
    const pkg = subpackageForPath(p);
    if (pkg) names.add(pkg);
  }
  await Promise.all([...names].map(loadSubpackage));
}
