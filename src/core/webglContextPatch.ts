/**
 * iOS 微信小游戏 WebGL2 上下文不完整（instanceof 失败、无 uint32 index），
 * Sprite/Graphics 静默不绘制。须让 Pixi 走纯 WebGL1：
 * - settings.PREFER_ENV = WEBGL（Pixi7 已忽略 preferWebGLVersion）
 * - getContext('webgl2') 返回 null（勿把 webgl2 降级成 webgl，会与 Pixi 内部版本检测冲突）
 */
import { ENV } from '@pixi/constants';
import { settings } from '@pixi/settings';
import { getNativePlatformApi } from '@/core/PlatformService';

function platformApi(): any {
  return getNativePlatformApi();
}

export function iosPlatform(): boolean {
  try {
    return platformApi()?.getSystemInfoSync?.()?.platform === 'ios';
  } catch {
    return false;
  }
}

/** 解析 getSystemInfoSync().system，如 "iOS 26.5" → 26 */
export function iosMajorVersion(): number {
  try {
    const sys = platformApi()?.getSystemInfoSync?.()?.system ?? '';
    const m = String(sys).match(/iOS\s+(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  } catch {
    return 0;
  }
}

/** iOS 真机：与 caizhu-rosa 一致，默认 drawImage 合成 */
export function configurePixiWebGLEnvForPlatform(platform: string): void {
  if (platform !== 'ios') return;
  settings.PREFER_ENV = ENV.WEBGL;
}

/** 主屏 / 离屏 canvas：webgl2 请求返回 null，让 Pixi 正确降级 */
export function blockWebGL2OnCanvas(canvas: unknown): void {
  const c = canvas as {
    getContext?: (type: string, opts?: object) => unknown;
    __webgl2Blocked?: boolean;
  } | null;
  if (!c?.getContext || c.__webgl2Blocked) return;

  const orig = c.getContext.bind(c);
  c.getContext = (type: string, opts?: object) => {
    if (type === 'webgl2') return null;
    return orig(type, opts);
  };
  c.__webgl2Blocked = true;
}

/** iOS：patch wx.createCanvas，新建 canvas 一律禁用 webgl2 */
export function installBlockWebGL2OnPlatform(): void {
  if (!iosPlatform()) return;

  const api = platformApi();
  if (!api?.createCanvas || api.__webgl2BlockedCreateCanvas) return;
  api.__webgl2BlockedCreateCanvas = true;

  const origCreate = api.createCanvas.bind(api);
  api.createCanvas = (...args: unknown[]) => {
    const c = origCreate(...args);
    blockWebGL2OnCanvas(c);
    return c;
  };
}
