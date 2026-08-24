/**
 * 平台服务抽象层 - 统一封装微信/抖音双平台 API
 *
 * 业务侧跨平台 SDK 入口：所有 wx/tt 差异（存储、登录、分享、生命周期等）
 * 都必须走 Platform，禁止在业务里写 typeof wx / typeof tt。
 *
 * 宿主识别：抖音注入 tt（可同时存在 wx 兼容层）；微信仅 wx。
 * 检测到哪个宿主，就只绑定该宿主原生 API（抖音→tt，微信→wx），互不倒用。
 */

declare const wx: any;
declare const tt: any;

export type PlatformName = 'wechat' | 'douyin' | 'unknown';
export type BackendPlatformCode = 'wx' | 'dy' | 'anon';

/** 检测当前小游戏宿主（单一真源，与 minigame/runtime.js 逻辑一致） */
export function detectMinigamePlatform(): PlatformName {
  if (typeof tt !== 'undefined') return 'douyin';
  if (typeof wx !== 'undefined') return 'wechat';
  return 'unknown';
}

/** 指定宿主的原生 API：抖音仅 tt，微信仅 wx */
export function getNativePlatformApi(platform: PlatformName = detectMinigamePlatform()): any {
  if (platform === 'douyin') return typeof tt !== 'undefined' ? tt : null;
  if (platform === 'wechat') return typeof wx !== 'undefined' ? wx : null;
  return null;
}

/** @deprecated 请用 detectMinigamePlatform + getNativePlatformApi */
export function resolveMinigameRuntime(): { name: PlatformName; api: any } {
  const name = detectMinigamePlatform();
  return { name, api: getNativePlatformApi(name) };
}

export function toBackendPlatformCode(name: PlatformName): BackendPlatformCode {
  if (name === 'douyin') return 'dy';
  if (name === 'wechat') return 'wx';
  return 'anon';
}

class PlatformServiceClass {
  /** 当前平台名 */
  readonly name: PlatformName;

  /** 底层平台 API 对象（wx / tt / null） */
  private _api: any;

  /** adUnitId → 激励视频实例（宿主本身也是单例，这里避免重复注册回调） */
  private _adCache = new Map<string, any>();

  /** 当前在播广告的 Promise resolver，null = 无广告在播 */
  private _adResolve: ((ok: boolean) => void) | null = null;

  constructor() {
    this.name = detectMinigamePlatform();
    this._api = getNativePlatformApi(this.name);
    console.log(`[Platform] 当前平台: ${this.name}, api=${this.name === 'douyin' ? 'tt' : this.name === 'wechat' ? 'wx' : 'none'}`);
  }

  /** 是否在小游戏环境中 */
  get isMinigame(): boolean {
    return this._api !== null;
  }

  get isWechat(): boolean {
    return this.name === 'wechat';
  }

  get isDouyin(): boolean {
    return this.name === 'douyin';
  }

  /** 后端 login 接口 platform 字段（wx / dy / anon） */
  get backendPlatformCode(): BackendPlatformCode {
    return toBackendPlatformCode(this.name);
  }

  /** 是否具备 HTTP 能力（小游戏 request 或浏览器 fetch） */
  get canUseBackend(): boolean {
    return typeof this._api?.request === 'function' || typeof fetch === 'function';
  }

  /** 开发者工具（非真机） */
  get isDevtools(): boolean {
    if (!this.isMinigame) return false;
    try {
      return this._api?.getSystemInfoSync?.()?.platform === 'devtools';
    } catch {
      return false;
    }
  }

  /** 底层 API（慎用，优先使用封装方法） */
  get api(): any {
    return this._api;
  }

  // ═══════════════ 存储 ═══════════════

  getStorageSync(key: string): string | null {
    try {
      return this._api?.getStorageSync(key) || null;
    } catch (_) {
      return null;
    }
  }

  setStorageSync(key: string, value: string): void {
    try {
      this._api?.setStorageSync(key, value);
    } catch (_) {}
  }

  /** 异步写入本地存储（避免阻塞主线程） */
  setStorageAsync(key: string, value: string): void {
    try {
      if (this._api?.setStorage) {
        this._api.setStorage({ key, data: value, fail() {} });
      } else {
        this._api?.setStorageSync(key, value);
      }
    } catch (_) {}
  }

  removeStorageSync(key: string): void {
    try {
      this._api?.removeStorageSync(key);
    } catch (_) {}
  }

  getSystemInfoSync(): Record<string, unknown> {
    try {
      return this._api?.getSystemInfoSync?.() ?? {};
    } catch {
      return {};
    }
  }

  /** 经分 SDK / 后端 HTTP 请求（Promise 风格） */
  request(opts: {
    url: string;
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    data?: unknown;
    headers?: Record<string, string>;
    timeoutMs?: number;
  }): Promise<{ statusCode: number; data: unknown }> {
    const method = (opts.method || 'POST').toUpperCase();
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...(opts.headers || {}),
    };
    const timeoutMs = opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : 10000;
    const payload = opts.data === undefined || typeof opts.data === 'string'
      ? opts.data
      : JSON.stringify(opts.data);

    if (this._api?.request) {
      return new Promise((resolve, reject) => {
        let done = false;
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          reject(new Error(`request timeout: ${opts.url}`));
        }, timeoutMs);
        try {
          this._api.request({
            url: opts.url,
            method,
            data: payload,
            header: headers,
            timeout: timeoutMs,
            success: (res: { statusCode?: number; data?: unknown }) => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              resolve({ statusCode: res?.statusCode ?? 0, data: res?.data });
            },
            fail: (err: unknown) => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              reject(err);
            },
          });
        } catch (e) {
          if (!done) {
            done = true;
            clearTimeout(timer);
            reject(e);
          }
        }
      });
    }

    if (typeof fetch === 'function') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      return fetch(opts.url, {
        method,
        headers,
        body: payload as BodyInit | undefined,
        signal: controller.signal,
      })
        .then(async (res) => {
          clearTimeout(timer);
          const text = await res.text();
          let data: unknown = text;
          try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
          return { statusCode: res.status, data };
        })
        .catch((e) => {
          clearTimeout(timer);
          throw e;
        });
    }

    return Promise.reject(new Error('no http transport available'));
  }

  /** 平台登录 code（wx.login / tt.login） */
  loginCode(): Promise<string> {
    return new Promise((resolve) => {
      if (!this._api?.login) {
        resolve('');
        return;
      }
      try {
        this._api.login({
          success: (res: { code?: string }) => resolve(res?.code || ''),
          fail: () => resolve(''),
        });
      } catch {
        resolve('');
      }
    });
  }

  // ═══════════════ 创建资源 ═══════════════

  /** 创建平台 Image 对象（加载本地/网络图片用） */
  createImage(): any {
    if (this._api?.createImage) return this._api.createImage();
    if (typeof Image !== 'undefined') return new Image();
    return null;
  }

  /** 下载远程文件到临时路径（CDN 资源用） */
  downloadFile(url: string): Promise<{ tempFilePath?: string; statusCode?: number }> {
    return new Promise((resolve, reject) => {
      if (!this._api?.downloadFile) {
        reject(new Error('downloadFile unavailable'));
        return;
      }
      this._api.downloadFile({
        url,
        success: (res: { tempFilePath?: string; statusCode?: number }) => {
          const statusCode = Number(res?.statusCode || 0);
          if (statusCode > 0 && (statusCode < 200 || statusCode >= 300)) {
            reject(new Error(`downloadFile status=${statusCode} url=${url}`));
            return;
          }
          if (!res?.tempFilePath) {
            reject(new Error(`downloadFile missing tempFilePath url=${url}`));
            return;
          }
          resolve(res);
        },
        fail: (err: any) => {
          reject(new Error(err?.errMsg || err?.message || String(err)));
        },
      });
    });
  }

  /** 创建 InnerAudioContext（BGM / 音效） */
  createInnerAudioContext(): WechatMinigame.InnerAudioContext | null {
    try {
      return this._api?.createInnerAudioContext?.() ?? null;
    } catch {
      return null;
    }
  }

  // ═══════════════ 交互反馈 ═══════════════

  /** 短振动（消除/点击反馈），type 控制强度 */
  vibrateShort(type: 'light' | 'medium' | 'heavy' = 'light'): void {
    try {
      this._api?.vibrateShort?.({ type });
    } catch (_) {}
  }

  /** 长振动（重击/Boss 登场等强反馈） */
  vibrateLong(): void {
    try {
      this._api?.vibrateLong?.();
    } catch (_) {}
  }

  showToast(title: string, icon: 'success' | 'error' | 'none' = 'none'): void {
    try {
      this._api?.showToast?.({ title, icon });
    } catch (_) {}
  }

  /** 自定义分析。有宿主走 reportEvent，没有就打日志，切片验收够用。 */
  reportEvent(name: string, data: Record<string, unknown> = {}): void {
    try {
      if (typeof this._api?.reportEvent === 'function') {
        this._api.reportEvent(name, data);
        return;
      }
    } catch {
      /* 上报失败不挡玩 */
    }
    try {
      console.log(`[track] ${name}`, data);
    } catch {
      /* */
    }
  }

  /** 关掉当前原生 toast（激励广告关闭后宿主偶发自带提示时用） */
  hideToast(): void {
    try {
      this._api?.hideToast?.();
    } catch (_) {}
  }

  /**
   * 激励视频广告。已配置 createRewardedVideoAd 则拉起；
   * 否则开发/本地环境短暂提示后视为成功，便于联调各广告位。
   *
   * 广告实例按 adUnitId 缓存并只注册一次回调：宿主的 createRewardedVideoAd 对同一
   * adUnitId 返回同一单例，每次播放都重新 onClose 会让回调越积越多，
   * 同一次关闭被回调 N 次（第二次以后打到已结束的 Promise 上，静默丢失奖励）。
   */
  showRewardedVideo(adUnitId = ''): Promise<boolean> {
    return new Promise((resolve) => {
      // 同一时刻只允许一支广告在播，避免两个入口的奖励串到一起
      if (this._adResolve) {
        resolve(false);
        return;
      }

      let ad: any = null;
      try {
        ad = this._rewardedAd(adUnitId);
      } catch (_) { /* fall through mock */ }

      if (!ad) {
        this.showToast('广告播放中…');
        setTimeout(() => {
          // 桩结束立刻清掉，避免和业务侧翻倍数额动画叠在一起
          this.hideToast();
          resolve(true);
        }, 700);
        return;
      }

      this._adResolve = resolve;
      try {
        const p = ad.show();
        // 拉取失败先 load 再播一次：小游戏侧常见于弱网首次拉取超时
        if (p?.catch) {
          p.catch(() => {
            const l = ad.load?.();
            if (l?.then) l.then(() => ad.show()).catch(() => this._settleAd(false));
            else this._settleAd(false);
          });
        }
      } catch (_) {
        this._settleAd(false);
      }
    });
  }

  private _rewardedAd(adUnitId: string): any {
    const cached = this._adCache.get(adUnitId);
    if (cached) return cached;
    const create = this._api?.createRewardedVideoAd;
    if (typeof create !== 'function') return null;
    const ad = create.call(this._api, { adUnitId });
    if (!ad?.onClose || !ad?.show) return null;
    ad.onClose((res: { isEnded?: boolean }) => this._settleAd(!!res?.isEnded));
    ad.onError?.(() => this._settleAd(false));
    this._adCache.set(adUnitId, ad);
    return ad;
  }

  private _settleAd(ok: boolean): void {
    const resolve = this._adResolve;
    this._adResolve = null;
    resolve?.(ok);
  }

  /**
   * 插屏广告（抖音流量主 / 广告金政策建议接入）。
   * 未配置 adUnitId、宿主不支持、加载失败 → resolve(false)，不挡流程。
   * 抖音要求「展示成功后再播须 destroy 再建」：每次调用新建实例，关闭后销毁。
   */
  showInterstitialAd(adUnitId = ''): Promise<boolean> {
    return new Promise((resolve) => {
      if (!adUnitId) {
        resolve(false);
        return;
      }
      const create = this._api?.createInterstitialAd;
      if (typeof create !== 'function') {
        resolve(false);
        return;
      }

      let ad: any = null;
      let settled = false;
      let shown = false;
      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        try { ad?.destroy?.(); } catch { /* ignore */ }
        resolve(ok);
      };

      try {
        ad = create.call(this._api, { adUnitId });
      } catch {
        resolve(false);
        return;
      }
      if (!ad?.show) {
        resolve(false);
        return;
      }

      ad.onError?.(() => finish(false));
      ad.onClose?.(() => finish(true));
      ad.onLoad?.(() => {
        try {
          const p = ad.show();
          if (p?.then) {
            p.then(() => { shown = true; }).catch(() => finish(false));
          } else {
            shown = true;
          }
        } catch {
          finish(false);
        }
      });

      // 创建后会自动 load；超时仍未展示则放行（避免卡死跳转）
      setTimeout(() => {
        if (!settled && !shown) finish(false);
      }, 5000);
    });
  }

  /**
   * 订阅消息（抖音广告金政策建议接入）。
   * 必须在用户点击/支付回调里调用；tmplIds 来自后台「运营-订阅消息」。
   * 返回各模板 id → accept|reject|ban|fail；失败或未配置返回空对象。
   */
  requestSubscribeMessage(tmplIds: readonly string[]): Promise<Record<string, string>> {
    return new Promise((resolve) => {
      const ids = tmplIds.filter(Boolean).slice(0, 3);
      const api = this._api?.requestSubscribeMessage;
      if (typeof api !== 'function' || ids.length === 0) {
        resolve({});
        return;
      }
      try {
        api.call(this._api, {
          tmplIds: ids,
          success: (res: Record<string, string>) => resolve(res ?? {}),
          fail: () => resolve({}),
          complete: () => { /* success/fail 已 settle */ },
        });
      } catch {
        resolve({});
      }
    });
  }

  showModal(title: string, content: string): void {
    try {
      this._api?.showModal?.({ title, content, showCancel: false });
    } catch (_) {}
  }

  // ═══════════════ 分享 ═══════════════

  showShareMenu(opts?: { withShareTicket?: boolean; menus?: string[] }): void {
    try {
      this._api?.showShareMenu?.({
        withShareTicket: opts?.withShareTicket ?? true,
        menus: opts?.menus ?? ['shareAppMessage', 'shareTimeline'],
      });
    } catch (_) {}
  }

  shareAppMessage(opts: { title: string; imageUrl?: string; query?: string }): void {
    try {
      this._api?.shareAppMessage?.(opts);
    } catch (_) {}
  }

  onShareAppMessage(callback: () => { title: string; imageUrl?: string; query?: string }): void {
    try {
      this._api?.onShareAppMessage?.(callback);
    } catch (_) {}
  }

  onShareTimeline(callback: () => { title: string; imageUrl?: string; query?: string }): void {
    try {
      this._api?.onShareTimeline?.(callback);
    } catch (_) {}
  }

  // ═══════════════ 生命周期 ═══════════════

  onShow(handler: (opts: any) => void): void {
    try {
      this._api?.onShow?.(handler);
    } catch (_) {}
  }

  onHide(handler: () => void): void {
    try {
      this._api?.onHide?.(handler);
    } catch (_) {}
  }

  // ═══════════════ 抖音侧边栏复访 ═══════════════

  /** 检测宿主是否支持指定场景（如 sidebar） */
  checkScene(opts: {
    scene: string;
    success?: (res: { isExist?: boolean }) => void;
    fail?: (err?: unknown) => void;
  }): void {
    try {
      if (this._api?.checkScene) {
        this._api.checkScene(opts);
      } else {
        opts.fail?.({ errMsg: 'checkScene not supported' });
      }
    } catch (e) {
      opts.fail?.(e);
    }
  }

  /** 跳转宿主场景（侧边栏复访必接） */
  navigateToScene(opts: {
    scene: string;
    success?: () => void;
    fail?: (err?: unknown) => void;
  }): void {
    try {
      if (this._api?.navigateToScene) {
        this._api.navigateToScene(opts);
      } else {
        opts.fail?.({ errMsg: 'navigateToScene not supported' });
      }
    } catch (e) {
      opts.fail?.(e);
    }
  }

  // ═══════════════ 抖音添加到桌面（广告金政策必接） ═══════════════

  /** 检查桌面快捷方式是否已添加（仅 Android 有效） */
  checkShortcut(opts: {
    success?: (res: { status?: { exist?: boolean; needUpdate?: boolean } }) => void;
    fail?: (err?: unknown) => void;
  }): void {
    try {
      if (this._api?.checkShortcut) {
        this._api.checkShortcut(opts);
      } else {
        opts.fail?.({ errMsg: 'checkShortcut not supported' });
      }
    } catch (e) {
      opts.fail?.(e);
    }
  }

  /**
   * 添加小游戏到手机桌面（须在用户点击/touchend 内同步调用）
   * 仅支持抖音 / 抖音极速版 / 抖音火山版
   */
  addShortcut(opts: {
    success?: () => void;
    fail?: (err?: { errMsg?: string }) => void;
    complete?: () => void;
  }): void {
    try {
      if (this._api?.addShortcut) {
        this._api.addShortcut(opts);
      } else {
        opts.fail?.({ errMsg: 'addShortcut not supported' });
      }
    } catch (e) {
      opts.fail?.(e as { errMsg?: string });
    }
  }

  /**
   * 加载本地自定义字体。
   * 优先 wx/tt.loadFont(path)（同步返回 family）；否则走 loadFontFace。
   * 非小游戏环境返回 null，由 FontService 用 @font-face 兜底。
   */
  loadFont(path: string, family: string): Promise<string | null> {
    if (!this.isMinigame) return Promise.resolve(null);

    // 微信/抖音小游戏：loadFont 最稳，直接返回可用 family 名
    if (typeof this._api?.loadFont === 'function') {
      try {
        const loaded = this._api.loadFont(path) as string | undefined;
        return Promise.resolve(loaded || family);
      } catch (e) {
        console.warn('[Platform] loadFont 失败', path, e);
      }
    }

    if (typeof this._api?.loadFontFace === 'function') {
      return new Promise((resolve) => {
        try {
          this._api.loadFontFace({
            family,
            source: `url("${path}")`,
            global: true,
            success: () => resolve(family),
            fail: (err: unknown) => {
              console.warn('[Platform] loadFontFace 失败', path, err);
              resolve(null);
            },
          });
        } catch (e) {
          console.warn('[Platform] loadFontFace 异常', path, e);
          resolve(null);
        }
      });
    }

    return Promise.resolve(null);
  }
}

export const Platform = new PlatformServiceClass();
