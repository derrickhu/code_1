/**
 * CDN 后台预热：不阻塞首屏插画，只在 Loading 出图后拉 manifest / BGM。
 * BGM 必须 copy 进 USER_DATA 再播，对齐 xiaochu2；临时路径 InnerAudio 会超时。
 */
import { BGM_FILE } from '@/core/BgmPlayer';
import { CdnAssetService } from '@/core/CdnAssetService';
import { Platform } from '@/core/PlatformService';

let started = false;

/** 启动后 fire-and-forget：拉 manifest + 把三首 BGM 落到本地缓存。短音效留包内。 */
export function warmupCdnAssets(): void {
  if (started || !Platform.isMinigame || !CdnAssetService.enabled) return;
  started = true;

  void (async () => {
    try {
      await CdnAssetService.fetchManifest();
    } catch (e) {
      console.warn('[CDN] manifest 预热失败', e);
    }

    const bgmPaths = [...new Set(Object.values(BGM_FILE))];
    void CdnAssetService.preloadPaths(bgmPaths).catch((e) => {
      console.warn('[CDN] BGM 预热失败', e);
    });
  })();
}
