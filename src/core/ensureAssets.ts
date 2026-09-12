/**
 * 场景入口统一拉资源：分包 + CDN 预下载（带超时）+ 纹理解码。
 *
 * 对齐 xiaochu2：只传本屏要用的路径。
 * 分包失败 / CDN miss / 超时不卡死；随后 tex() 仍会后台补齐，watchArt 到货再刷。
 * 村口壳在分包里，必须先 loadSubpackage 再解码，否则真机读不到文件。
 */
import { loadSubpackagesForPaths } from '@/config/Subpackages';
import { CdnAssetService } from '@/core/CdnAssetService';
import { preloadPaths } from '@/core/TextureLoader';

export async function ensureAssets(
  paths: readonly string[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  const list = [...new Set(paths.filter(Boolean))];
  await Promise.all([
    loadSubpackagesForPaths(list).catch((e) => {
      console.warn('[ensureAssets] 分包加载失败', e);
    }),
    CdnAssetService.preloadPaths(list).catch((e) => {
      console.warn('[ensureAssets] CDN 预热失败', e);
    }),
  ]);
  await preloadPaths(list, onProgress);
}
