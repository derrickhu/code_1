/**
 * CDN 资源加载：manifest + 按需下载 + 本地缓存
 *
 * 对齐 xiao_chu AssetLoader / game2D_huahua CdnAssetService：
 * - 逻辑路径不变；CDN 目录未命中缓存时异步下载，不阻塞主流程超时窗口外继续。
 * - manifest 用 request 拉文本，避免 downloadFile 解析 JSON 坑。
 */
import { CDN_CONFIG, type CdnConfig } from '@/config/CdnConfig';
import { unpackHomePackPath } from '@/config/HomePack';
import { Platform } from '@/core/PlatformService';

export interface CdnManifestFile {
  hash?: string;
  size?: number;
}

export interface CdnManifest {
  version?: number;
  updated?: string;
  filePrefix?: string;
  files: Record<string, CdnManifestFile>;
}

type ProgressCallback = (loaded: number, total: number) => void;

/** 真机 wx.downloadFile / request 合计并发约 10；自建队列避免瞬间打满后超时失败 */
const DOWNLOAD_CONCURRENCY = 4;

function errorText(err: unknown): string {
  const any = err as { message?: string; errMsg?: string } | null;
  return `${any?.message || ''} ${any?.errMsg || ''} ${String(err ?? '')}`;
}

/** 微信 copyFileSync / writeFile 写满 USER_DATA 时的典型文案 */
export function isFileQuotaError(err: unknown): boolean {
  return /storage limit|file storage limit|maximum size/i.test(errorText(err));
}

/** 清空缓存后目录没了，或 downloadFile 临时文件被回收 */
export function isMissingPathError(err: unknown): boolean {
  return /no such file|not exist|not found|ENOENT/i.test(errorText(err));
}

/** 图和 BGM 都落 USER_DATA。downloadFile 临时路径 InnerAudio 读不了。 */
export function shouldPersistCdnPath(_path: string): boolean {
  return true;
}

/** 微信 downloadFile 临时文件。InnerAudioContext 设这个 src 会 request:fail timeout */
export function isWxTempPath(src: string): boolean {
  return /(?:wxfile|http):\/\/tmp\//i.test(src);
}

/**
 * 开发者工具 USER_DATA_PATH 是 `http://usr/...`。
 * 文件系统认这条；InnerAudio 当 HTTP 会 request:fail。
 * 真机已经是 `wxfile://usr`。
 * Mac 模拟器里两套路径不是同一份，改过去就是 readFile no such file。
 */
export function toInnerAudioSrc(path: string): string {
  if (/^https?:\/\/usr\//i.test(path)) {
    return path.replace(/^https?:\/\/usr\//i, 'wxfile://usr/');
  }
  return path;
}

/** InnerAudio 能稳播的地址：真机本地缓存 / HTTPS。模拟器 http://usr 一律走 CDN。 */
export function playableInnerAudioSrc(
  src: string,
  cdnUrl: string,
  localExists?: (path: string) => boolean,
): string {
  if (!src || isWxTempPath(src) || /^https?:\/\/usr\//i.test(src)) return cdnUrl;
  if (/^wxfile:\/\/usr\//i.test(src) && localExists && !localExists(src)) return cdnUrl;
  return src;
}

class CdnAssetServiceClass {
  private readonly _config: CdnConfig = CDN_CONFIG;
  private readonly _cdnPrefixes = this._config.cdnPrefixes?.length
    ? [...this._config.cdnPrefixes]
    : this._config.cdnDirs.map((d) => this._prefix(d));
  private readonly _bundledPrefixes = this._config.bundledDirs.map((d) => this._prefix(d));
  private readonly _bundledFiles = new Set(this._config.bundledFiles ?? []);
  private _manifest: CdnManifest | null = null;
  private _manifestReady = false;
  /**
   * 仅「成功拉到非空云端 manifest」时为 true。
   * 空缓存 / 拉失败时若仍按 files[path] 判无，会把全部 CDN 下载误杀，
   * 真机上就只剩本地残留缓存（常见：只剩第一只宠头像）。
   */
  private _manifestAuthoritative = false;
  private _downloadQueue = new Map<string, Promise<boolean>>();
  private _downloadWaiters: Array<() => void> = [];
  private _downloadActive = 0;
  private _localExistsCache = new Map<string, boolean>();
  private _accessLog = new Map<string, number>();
  private _accessFrame = 0;
  /** copy 进 USER_DATA 失败时，本局用 downloadFile 临时路径顶上 */
  private _temps = new Map<string, string>();
  private _persistDisabled = false;
  private _quotaWipe: Promise<void> | null = null;
  private _prepared = false;
  private _manifestTask: Promise<boolean> | null = null;

  get enabled(): boolean {
    return this._config.enabled;
  }

  get manifestReady(): boolean {
    return this._manifestReady;
  }

  get manifest(): CdnManifest | null {
    return this._manifest;
  }

  isCdnPath(path: string): boolean {
    const normalized = this._normalize(path);
    if (!this.enabled || this.isBundledPath(normalized)) return false;
    return this._cdnPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(prefix));
  }

  isBundledPath(path: string): boolean {
    const normalized = this._normalize(path);
    if (this._bundledFiles.has(normalized)) return true;
    return this._bundledPrefixes.some((prefix) => normalized === prefix || normalized.startsWith(prefix));
  }

  areAllCdnPaths(paths: readonly string[]): boolean {
    return paths.length > 0 && paths.every((path) => this.isCdnPath(path));
  }

  /**
   * 同步解析：
   * - 非 CDN → 原路径
   * - CDN 缓存有效 → USER_DATA 缓存路径
   * - 包内仍有本地文件（开发期 / 未瘦包）→ 逻辑路径
   * - 否则 null（调用方应 download / 占位，勿设 src）
   */
  resolveAsset(path: string): string | null {
    const logicalPath = this._normalize(path);
    if (!Platform.isMinigame) return unpackHomePackPath(logicalPath);
    if (!this.isCdnPath(logicalPath)) return logicalPath;

    this._touch(logicalPath);
    if (this._isCacheValid(logicalPath)) return this._getCachePath(logicalPath);
    const temp = this._temps.get(logicalPath);
    if (temp && !this._isAudioPath(logicalPath)) return temp;
    if (this._packageFileExists(logicalPath)) return logicalPath;
    return null;
  }

  cdnUrl(path: string): string {
    return this._getCdnUrl(this._normalize(path));
  }

  async resolveOrDownload(path: string): Promise<string> {
    const logicalPath = this._normalize(path);
    const resolved = this.resolveAsset(logicalPath);
    if (resolved) return this._playableSrc(logicalPath, resolved);

    if (!this.isCdnPath(logicalPath)) return logicalPath;
    if (this._skipDownload()) return this._getCdnUrl(logicalPath);

    // manifest 尚未就绪时先拉一次，避免空清单把下载误杀
    if (!this._manifestReady) {
      await this.fetchManifest().catch(() => false);
    }

    const ok = await this.download(logicalPath);
    if (ok && this._isCacheValid(logicalPath)) {
      return this._playableSrc(logicalPath, this._getCachePath(logicalPath));
    }
    if (this._isAudioPath(logicalPath)) return this._getCdnUrl(logicalPath);
    const temp = this._temps.get(logicalPath);
    if (temp) return temp;

    // 分包可能在 CDN 下载期间才 load 完：包内存在性不做「永久 false」缓存，这里再探一次
    if (this._packageFileExists(logicalPath)) return logicalPath;
    throw new Error(`[CDN] 下载失败且包内无文件: ${logicalPath}`);
  }

  private _isAudioPath(logicalPath: string): boolean {
    return logicalPath.startsWith('audio/');
  }

  /**
   * 开发者工具里不往本地缓存搬，直接吃 HTTPS。
   *
   * 工具的 downloadFile 内部是 XHR，回包过结构化克隆会抛
   * `An object could not be cloned.` —— 点一下布阵里的人去取立绘就刷一条。
   * createImage / InnerAudio 都认 HTTPS，绕开这次下载就没这回事。
   * 真机不动：照旧下到 USER_DATA，省流量也省启动。
   */
  private _skipDownload(): boolean {
    return Platform.isDevtools;
  }

  /**
   * 给 InnerAudio 的 src。图可以读 `http://usr`，BGM 不行。
   * 模拟器不要改成 wxfile://usr（文件不在那），直接 HTTPS。
   */
  private _playableSrc(logicalPath: string, src: string): string {
    if (!this._isAudioPath(logicalPath)) return src;
    return playableInnerAudioSrc(
      src,
      this._getCdnUrl(logicalPath),
      (path) => this._localFileExists(path),
    );
  }

  /** BGM 专用：本地播不了就回 HTTPS，别把 http://usr 丢给 InnerAudio */
  async resolveAudioSrc(path: string): Promise<string> {
    const logicalPath = this._normalize(path);
    try {
      return await this.resolveOrDownload(logicalPath);
    } catch {
      return this._getCdnUrl(logicalPath);
    }
  }

  /**
   * 启动先按文件树清掉 cdn_cache*。微信 rmdirSync(dir, true) 对非空目录经常是空操作，
   * 旧的整包缓存（约 54MB）会一直占着额度，后面任何 copy 都会报满。
   */
  prepareLocalCache(): number {
    if (this._prepared) return 0;
    this._prepared = true;
    const removed = this._wipeCacheRoots(false);
    if (removed > 0) {
      console.log(`[CDN] 启动清掉 ${removed} 个旧缓存文件`);
    }
    return removed;
  }

  async fetchManifest(): Promise<boolean> {
    if (this._manifestTask) return this._manifestTask;
    this._manifestTask = this._fetchManifestOnce().finally(() => {
      this._manifestTask = null;
    });
    return this._manifestTask;
  }

  private async _fetchManifestOnce(): Promise<boolean> {
    if (!this.enabled) {
      this._manifest = { files: {} };
      this._manifestReady = true;
      this._manifestAuthoritative = false;
      return false;
    }
    this.prepareLocalCache();

    const fs = this._getFs();
    if (!fs || !this._config.baseUrl || !Platform.isMinigame) {
      this._loadCachedManifest();
      return false;
    }

    const url = this._getCdnUrl('manifest.json');
    try {
      /**
       * manifest 易被边缘 CDN 缓存：优先带时间戳的 request 拉最新版，
       * 再与 downloadFile（无 query，兼容抖音白名单）取 version 更高者。
       */
      type Cand = { text: string; via: string; version: number; count: number };
      const parseCand = (text: string, via: string): Cand | null => {
        try {
          const parsed = JSON.parse(text) as CdnManifest;
          const count = Object.keys(parsed.files || {}).length;
          return {
            text,
            via,
            version: Number(parsed.version || 0),
            count,
          };
        } catch {
          return null;
        }
      };

      const cands: Cand[] = [];
      try {
        const t = await this._requestText(`${url}?_t=${Date.now()}`);
        const c = parseCand(t, 'request');
        if (c) cands.push(c);
      } catch (reqErr) {
        console.warn('[CDN] request 拉 manifest 失败:', String((reqErr as Error)?.message || reqErr));
      }
      try {
        const t = await this._downloadText(url);
        const c = parseCand(t, 'downloadFile');
        if (c) cands.push(c);
      } catch (dlErr) {
        console.warn('[CDN] downloadFile 拉 manifest 失败:', String((dlErr as Error)?.message || dlErr));
      }

      // 本地缓存也参与比较，避免边缘返回更旧版本时倒退
      try {
        const cached = String(fs.readFileSync(this._getCachePath('manifest.json'), 'utf-8') || '');
        const c = parseCand(cached, 'local-cache');
        if (c) cands.push(c);
      } catch { /* ignore */ }

      if (cands.length === 0) {
        this._loadCachedManifest();
        return false;
      }
      cands.sort((a, b) => b.version - a.version || b.count - a.count);
      const best = cands[0];
      const parsed = JSON.parse(best.text) as CdnManifest;
      this._manifest = parsed;
      this._manifestReady = true;
      this._manifestAuthoritative = best.count > 0;
      this._ensureCacheDir(this._getCachePath('manifest.json'));
      try {
        fs.writeFileSync(this._getCachePath('manifest.json'), best.text, 'utf-8');
      } catch (_) { /* ignore */ }
      console.log(
        `[CDN] manifest 就绪 via=${best.via}, v${best.version}, files=${best.count}`
        + (cands.length > 1 ? ` (candidates=${cands.map((c) => `${c.via}:v${c.version}`).join(',')})` : ''),
      );
      if (best.count === 0) {
        console.warn('[CDN] 云端 manifest 文件列表为空，下载不做「名单外跳过」');
      } else {
        const stale = this._purgeStaleCache();
        if (stale > 0) console.log(`[CDN] 已清理 ${stale} 个过期本地缓存`);
      }
      return best.count > 0;
    } catch (e) {
      console.warn('[CDN] manifest 拉取失败，使用本地缓存:', e);
      this._loadCachedManifest();
      return false;
    }
  }

  /** downloadFile → 读临时文件文本（manifest / 兜底） */
  private async _downloadText(url: string): Promise<string> {
    const fs = this._getFs();
    if (!fs) throw new Error('getFileSystemManager unavailable');
    const res = await Platform.downloadFile(url);
    if (!res.tempFilePath) throw new Error('downloadFile missing tempFilePath');
    let text = '';
    try {
      text = String(fs.readFileSync(res.tempFilePath, 'utf-8') || '');
    } catch (e) {
      // 少数端 utf-8 读失败时再试默认编码
      text = String(fs.readFileSync(res.tempFilePath) || '');
      if (typeof text !== 'string') text = '';
    }
    if (!text) throw new Error('downloaded manifest empty');
    return text;
  }

  /** 权威 manifest 才把「名单外」当不存在；空清单绝不拦下载 */
  private _knownMissing(logicalPath: string): boolean {
    if (!this._manifestAuthoritative) return false;
    const files = this._manifest?.files;
    return !!files && !files[logicalPath];
  }

  async download(path: string): Promise<boolean> {
    const logicalPath = this._normalize(path);
    if (!this.isCdnPath(logicalPath)) return true;
    if (this._isCacheValid(logicalPath)) return true;
    // 权威 manifest 缺条目：先强刷一次（真机可能残留旧清单）。
    // 刷新后仍没有，说明云端本来就没这张，不要去 404。
    if (this._knownMissing(logicalPath)) {
      await this.fetchManifest().catch(() => false);
      if (this._knownMissing(logicalPath)) return false;
    }

    const inflight = this._downloadQueue.get(logicalPath);
    if (inflight) return inflight;

    const task = this._runDownloadSlot(() => this._downloadWithRetry(logicalPath)).finally(() => {
      this._downloadQueue.delete(logicalPath);
    });
    this._downloadQueue.set(logicalPath, task);
    return task;
  }

  private _runDownloadSlot<T>(job: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this._downloadActive += 1;
        job().then(resolve, reject).finally(() => {
          this._downloadActive -= 1;
          const next = this._downloadWaiters.shift();
          if (next) next();
        });
      };
      if (this._downloadActive < DOWNLOAD_CONCURRENCY) run();
      else this._downloadWaiters.push(run);
    });
  }

  /** 静默预下载；超时后仍 resolve，后台任务可继续 */
  async preloadPaths(paths: readonly string[], onProgress?: ProgressCallback): Promise<void> {
    if (!this._manifestReady) {
      await this.fetchManifest().catch(() => false);
    }
    const cdnPaths = paths
      .map((p) => this._normalize(p))
      .filter((p) => {
        if (this._skipDownload()) return false;
        if (!this.isCdnPath(p) || this._isCacheValid(p) || this._packageFileExists(p)) return false;
        if (this._temps.has(p)) return false;
        if (this._knownMissing(p)) return false;
        return true;
      });

    if (cdnPaths.length === 0) {
      onProgress?.(paths.length, paths.length);
      return;
    }

    let done = 0;
    await Promise.race([
      Promise.all(
        cdnPaths.map(async (p) => {
          await this.download(p);
          done++;
          onProgress?.(paths.length - cdnPaths.length + done, paths.length);
        }),
      ),
      new Promise<void>((resolve) => setTimeout(resolve, this._config.downloadTimeoutMs)),
    ]);
  }

  async preloadCategory(prefix: string, onProgress?: ProgressCallback): Promise<void> {
    if (!this._manifestReady) await this.fetchManifest();
    const normalized = this._prefix(prefix);
    const files = Object.keys(this._manifest?.files || {}).filter((f) => f.startsWith(normalized));
    await this.preloadPaths(files, onProgress);
  }

  clearCache(): void {
    const fs = this._getFs();
    if (!fs || this._accessLog.size === 0) return;

    const entries = [...this._accessLog.entries()].sort((a, b) => a[1] - b[1]);
    const evictCount = Math.ceil(entries.length * 0.2);
    for (let i = 0; i < evictCount; i++) {
      const logicalPath = entries[i][0];
      const cachePath = this._getCachePath(logicalPath);
      try { fs.unlinkSync(cachePath); } catch (_) { /* ignore */ }
      try { fs.unlinkSync(`${cachePath}.meta`); } catch (_) { /* ignore */ }
      this._localExistsCache.delete(cachePath);
      this._accessLog.delete(logicalPath);
    }
  }

  clearAllCache(): void {
    this._localExistsCache.clear();
    this._accessLog.clear();
    this._wipeCacheRoots(true);
  }

  private async _downloadWithRetry(logicalPath: string): Promise<boolean> {
    const fs = this._getFs();
    if (!fs || !this._config.baseUrl) return false;

    for (let attempt = 0; attempt <= this._config.downloadRetry; attempt++) {
      try {
        const res = await Platform.downloadFile(this._getCdnUrl(logicalPath));
        if (!res.tempFilePath) throw new Error('downloadFile missing tempFilePath');
        await this._keepLocalCopy(logicalPath, res.tempFilePath);
        return true;
      } catch (e) {
        if (attempt >= this._config.downloadRetry) {
          console.warn(`[CDN] 下载失败 ${logicalPath}:`, e);
          return false;
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
    return false;
  }

  /**
   * 尽量 copy 进 USER_DATA。额度满、目录被并发清空、临时文件被回收，
   * 都改用 downloadFile 临时路径顶上，不当成下载失败（否则 TextureLoader 会标 missing）。
   */
  private async _keepLocalCopy(logicalPath: string, tempFilePath: string): Promise<void> {
    if (this._persistDisabled || !shouldPersistCdnPath(logicalPath)) {
      this._temps.set(logicalPath, tempFilePath);
      return;
    }

    try {
      this._writeCacheFile(logicalPath, tempFilePath);
      return;
    } catch (copyErr) {
      if (isFileQuotaError(copyErr)) {
        await this._abandonPersist();
        this._temps.set(logicalPath, tempFilePath);
        return;
      }
      if (isMissingPathError(copyErr)) {
        try {
          this._writeCacheFile(logicalPath, tempFilePath);
          return;
        } catch (again) {
          if (isFileQuotaError(again)) await this._abandonPersist();
          this._temps.set(logicalPath, tempFilePath);
          return;
        }
      }
      console.warn(`[CDN] 落盘失败，改用临时文件 ${logicalPath}:`, copyErr);
      this._temps.set(logicalPath, tempFilePath);
    }
  }

  private _writeCacheFile(logicalPath: string, tempFilePath: string): void {
    const fs = this._getFs();
    if (!fs) throw new Error('getFileSystemManager unavailable');
    if (this._persistDisabled) throw new Error('persist disabled');
    const cachePath = this._getCachePath(logicalPath);
    this._ensureCacheDir(cachePath);
    fs.copyFileSync(tempFilePath, cachePath);
    this._localExistsCache.set(cachePath, true);
    const hash = this._manifest?.files?.[logicalPath]?.hash || '';
    try { fs.writeFileSync(`${cachePath}.meta`, hash, 'utf-8'); } catch { /* ignore */ }
  }

  private _requestText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const api = Platform.api;
      if (!api?.request) {
        reject(new Error('request unavailable'));
        return;
      }
      api.request({
        url,
        method: 'GET',
        responseType: 'text',
        dataType: 'text',
        timeout: this._config.downloadTimeoutMs,
        success: (res: any) => {
          const statusCode = Number(res?.statusCode || 0);
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`request status=${statusCode || 'unknown'} url=${url}`));
            return;
          }
          const data = res?.data;
          const text = typeof data === 'string' ? data : (data ? JSON.stringify(data) : '');
          resolve(text);
        },
        fail: (err: any) => {
          const msg = err?.errMsg || err?.message || String(err);
          console.warn(`[CDN] request fail: ${url}, ${msg}`);
          reject(new Error(msg));
        },
      });
    });
  }

  private _loadCachedManifest(): void {
    const fs = this._getFs();
    try {
      const text = fs?.readFileSync(this._getCachePath('manifest.json'), 'utf-8');
      this._manifest = text ? JSON.parse(text) as CdnManifest : { files: {} };
    } catch (_) {
      this._manifest = { files: {} };
    }
    this._manifestReady = true;
    const count = Object.keys(this._manifest.files || {}).length;
    // 本地残留 manifest 可作权威；完全空则放开下载，靠 URL 直拉
    this._manifestAuthoritative = count > 0;
  }

  private _isCacheValid(logicalPath: string): boolean {
    if (!this._cacheFileExists(logicalPath)) return false;
    const entry = this._manifest?.files?.[logicalPath];
    if (entry?.size && this._getLocalFileSize(this._getCachePath(logicalPath)) !== entry.size) {
      return false;
    }
    if (!entry?.hash) return true;
    return this._readCachedHash(logicalPath) === entry.hash;
  }

  private _cacheFileExists(logicalPath: string): boolean {
    return this._localFileExists(this._getCachePath(logicalPath));
  }

  /**
   * 包内是否仍有该文件（开发未 strip / 分包刚 load 完）。
   * 注意：loadSubpackage 与 CDN 下载并行，「不存在」不能永久缓存，否则分包到位后仍误判。
   */
  private _packageFileExists(logicalPath: string): boolean {
    const fs = this._getFs();
    if (!fs) return false;
    try {
      fs.accessSync(logicalPath);
      this._localExistsCache.set(logicalPath, true);
      return true;
    } catch {
      return false;
    }
  }

  private _localFileExists(path: string): boolean {
    const cached = this._localExistsCache.get(path);
    if (cached !== undefined) return cached;

    const fs = this._getFs();
    if (!fs) {
      this._localExistsCache.set(path, false);
      return false;
    }

    try {
      fs.accessSync(path);
      this._localExistsCache.set(path, true);
      return true;
    } catch (_) {
      this._localExistsCache.set(path, false);
      return false;
    }
  }

  private _getLocalFileSize(path: string): number {
    const fs = this._getFs();
    try {
      const stat = fs?.statSync(path);
      return Number(stat?.size || 0);
    } catch (_) {
      return 0;
    }
  }

  private _readCachedHash(logicalPath: string): string | null {
    const fs = this._getFs();
    try {
      return String(fs?.readFileSync(`${this._getCachePath(logicalPath)}.meta`, 'utf-8') || '').trim();
    } catch (_) {
      return null;
    }
  }

  private _getCdnUrl(logicalPath: string): string {
    const base = this._config.baseUrl.replace(/\/+$/, '');
    return `${base}/${this._config.filePrefix}/${logicalPath}`;
  }

  private _getCachePath(logicalPath: string): string {
    return `${this._getCacheRootPath()}/${logicalPath}`;
  }

  private _getCacheRootPath(): string {
    const userDataPath = this._getUserDataPath();
    return userDataPath ? `${userDataPath}/${this._config.cacheRootName}` : '';
  }

  private _ensureCacheDir(filePath: string): void {
    const fs = this._getFs();
    const userDataPath = this._getUserDataPath();
    if (!fs || !userDataPath) return;

    const dir = filePath.split('/').slice(0, -1).join('/');
    try { fs.accessSync(dir); return; } catch (_) { /* mkdir */ }

    const segments = dir.replace(`${userDataPath}/`, '').split('/').filter(Boolean);
    let cur = userDataPath;
    for (const seg of segments) {
      cur += `/${seg}`;
      try { fs.accessSync(cur); } catch (_) {
        try { fs.mkdirSync(cur, true); } catch (_) { /* ignore */ }
      }
    }
  }

  /** 额度仍满：立刻停落盘。启动已经清过旧根，这里不再当事故刷屏。 */
  private _abandonPersist(): Promise<void> {
    this._persistDisabled = true;
    if (this._quotaWipe) return this._quotaWipe;
    this._quotaWipe = Promise.resolve().then(() => {
      this._wipeCacheRoots(true);
    });
    return this._quotaWipe;
  }

  /**
   * @param forceCurrent 真：连当前代一起删（额度兜底）。
   * 假：只删旧代；当前代文件过多（上次整包残留）也删。
   */
  private _wipeCacheRoots(forceCurrent: boolean): number {
    const user = this._getUserDataPath();
    if (!user) return 0;
    const current = this._config.cacheRootName;
    let removed = 0;
    let hadLegacy = false;
    const names = new Set(this._listDirNames(user));
    for (const extra of ['cdn_cache', 'cdn_cache_v1', 'cdn_cache_v2', 'cdn_cache_v3', current]) {
      names.add(extra);
    }
    for (const name of names) {
      if (!name.startsWith('cdn_cache') || name === current) continue;
      const n = this._removeTree(`${user}/${name}`);
      if (n > 0) hadLegacy = true;
      removed += n;
    }
    const currentCount = this._listCacheFiles().length;
    if (forceCurrent || hadLegacy || currentCount > 80) {
      removed += this._removeTree(`${user}/${current}`);
    }
    this._localExistsCache.clear();
    this._accessLog.clear();
    return removed;
  }

  /** 先按文件 unlink，再删空目录。不依赖微信 recursive rmdir。 */
  private _removeTree(dir: string): number {
    const fs = this._getFs();
    if (!fs) return 0;
    let removed = 0;
    for (const name of this._listDirNames(dir)) {
      if (name === '.' || name === '..') continue;
      const full = `${dir}/${name}`;
      if (this._isDir(full)) {
        removed += this._removeTree(full);
        continue;
      }
      try { fs.unlinkSync(full); removed += 1; } catch { /* ignore */ }
    }
    this._rmdir(dir);
    return removed;
  }

  private _rmdir(dir: string): void {
    const fs = this._getFs();
    if (!fs) return;
    try { fs.rmdirSync(dir, true); return; } catch { /* 再试对象写法 */ }
    try { fs.rmdirSync({ dirPath: dir, recursive: true }); } catch { /* ignore */ }
  }

  /** 删掉 manifest 里没有的旧路径（路径改版后扁平缓存会占满额度） */
  private _purgeStaleCache(): number {
    if (!this._manifestAuthoritative) return 0;
    const keep = new Set(Object.keys(this._manifest?.files || {}));
    keep.add('manifest.json');
    let removed = 0;
    for (const rel of this._listCacheFiles()) {
      if (keep.has(rel)) continue;
      this._unlinkCache(rel);
      removed += 1;
    }
    return removed;
  }

  private _unlinkCache(logicalPath: string): void {
    const fs = this._getFs();
    if (!fs) return;
    const full = this._getCachePath(logicalPath);
    try { fs.unlinkSync(full); } catch { /* ignore */ }
    try { fs.unlinkSync(`${full}.meta`); } catch { /* ignore */ }
    this._localExistsCache.delete(full);
    this._accessLog.delete(logicalPath);
  }

  private _listDirNames(dir: string): string[] {
    const fs = this._getFs();
    try {
      const names = fs?.readdirSync(dir);
      if (!Array.isArray(names)) return [];
      return names.map((n: unknown) => (typeof n === 'string' ? n : String((n as { name?: string })?.name || '')))
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  private _isDir(full: string): boolean {
    try {
      const st = this._getFs()?.statSync(full);
      if (!st) return false;
      return typeof st.isDirectory === 'function' ? st.isDirectory() : false;
    } catch {
      return false;
    }
  }

  private _listCacheFiles(): string[] {
    const root = this._getCacheRootPath();
    if (!root) return [];
    const out: string[] = [];
    const walk = (dir: string, prefix: string) => {
      for (const name of this._listDirNames(dir)) {
        if (name === '.' || name === '..') continue;
        const full = `${dir}/${name}`;
        const rel = prefix ? `${prefix}/${name}` : name;
        if (this._isDir(full)) {
          walk(full, rel);
          continue;
        }
        if (rel.endsWith('.meta')) continue;
        out.push(rel);
      }
    };
    walk(root, '');
    return out;
  }

  private _getFs(): any {
    return Platform.api?.getFileSystemManager?.() ?? null;
  }

  private _getUserDataPath(): string {
    return Platform.api?.env?.USER_DATA_PATH || '';
  }

  private _touch(logicalPath: string): void {
    this._accessFrame++;
    this._accessLog.set(logicalPath, this._accessFrame);
  }

  private _prefix(path: string): string {
    const normalized = this._normalize(path);
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  }

  private _normalize(path: string): string {
    return path.replace(/^\/+/, '').replace(/^(?:minigame|assets)\//, '');
  }
}

export const CdnAssetService = new CdnAssetServiceClass();
