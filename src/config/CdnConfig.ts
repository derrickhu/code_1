/**
 * CDN 资源配置（腾讯云 CloudBase / COS）
 *
 * - 同一份配置同时服务运行时与 scripts/upload_cdn.js（脚本用正则+vm 解析本对象字面量）。
 * - 游戏代码继续使用 images/、audio/ 逻辑路径，不改调用方。
 * - 云端对象键必须以 gameKey 为前缀，与 petTower / xiaochu 隔离。
 *
 * 上传只收「游戏内用到的文件」：cdn_scan 用代码引用表过滤，磁盘废图不同步。
 * Loading 插画留主包；村口壳走分包（pkg-home / pkg-home-art），不进 CDN。
 * 微信自动预览按源码体积卡 4MB：assemble 会从 build/<端>/ 剔除 CDN 目录，
 * packOptions.ignore 用目录级规则兜底。恢复本地整包：npm run cdn:restore。
 */

export interface CdnConfig {
  enabled: boolean;
  appId: string;
  cloudEnv: string;
  /**
   * 云存储 bucket 标识，用于拼 cloud:// fileID。
   * 也可在 scripts/.cdn_secret 中用 CDN_CLOUD_BUCKET 覆盖。
   */
  cloudBucket: string;
  baseUrl: string;
  /** 云端目录前缀：`{BASE_GAME_KEY}/assets_cdn` */
  filePrefix: string;
  cacheRootName: string;
  downloadRetry: number;
  downloadTimeoutMs: number;
  /** 扫描用，assets 下的目录 */
  cdnDirs: readonly string[];
  /**
   * 命中此前缀才走 CDN。比整目录更细：
   * loading / 标题 / 短音效不在此列，留包内。
   */
  cdnPrefixes: readonly string[];
  bundledDirs: readonly string[];
  bundledFiles: readonly string[];
  ignoreFiles: readonly string[];
}

export const CDN_CONFIG: CdnConfig = {
  enabled: true,
  appId: 'wx4afec790790030e8',
  cloudEnv: 'rosa-env-d7grf78r5dbd37323',
  cloudBucket: '726f-rosa-env-d7grf78r5dbd37323-1414200063',
  baseUrl: 'https://726f-rosa-env-d7grf78r5dbd37323-1414200063.tcb.qcloud.la',
  filePrefix: 'cunkou/assets_cdn',
  cacheRootName: 'cdn_cache_v3',
  downloadRetry: 2,
  downloadTimeoutMs: 30000,
  cdnDirs: [
    'images',
    'audio',
  ],
  cdnPrefixes: [
    'images/hero/',
    'images/anim/',
    'images/enemy/',
    'images/vfx/',
    'images/proj/',
    'images/bg/',
    'images/ui/',
    'audio/bgm_',
  ],
  bundledDirs: [
    'images/boot',
    'subpackages/pkg-home',
    'subpackages/pkg-home-art',
  ],
  bundledFiles: [
    'images/boot/loading_splash.jpg',
    'images/boot/title_logo.png',
  ],
  ignoreFiles: ['game.js', '.DS_Store', 'Thumbs.db', 'sfx_manifest.json'],
};
