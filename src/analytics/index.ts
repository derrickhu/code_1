/**
 * 经分埋点：SDK 初始化 + 业务门面（对齐 xiaochu2）
 *
 * - GAME_KEY / ENDPOINT 单一真源：@/config/CloudConfig
 * - 经分 gameKey 必须用 BASE_GAME_KEY，平台分流走 platform 字段
 */
import {
  Analytics,
  EVENT_NAMES,
  type DeviceInfo,
  type EventParamValue,
  type PlatformName,
} from '@gp/analytics-sdk';

import { ANALYTICS_ENDPOINT } from '@/config/CloudConfig';
import { BASE_GAME_KEY } from '@/config/gameKeyScope';
import { Platform } from '@/core/PlatformService';

export { EVENT_NAMES };
export type AnalyticsParams = Record<string, EventParamValue>;

declare const __APP_VERSION__: string;

let inited = false;

function toParams(payload: Record<string, unknown>): AnalyticsParams {
  const out: AnalyticsParams = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value == null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[key] = value;
    } else {
      out[key] = JSON.stringify(value);
    }
  }
  return out;
}

function sdkTrack(eventName: string, params: AnalyticsParams = {}): void {
  if (!inited) return;
  try {
    Analytics.track(eventName, params);
  } catch {
    /* SDK 未就绪或上报失败不挡玩 */
  }
}

/** SDK 初始化：main.ts 启动尽早调用 */
export function initAnalytics(opts?: { endpoint?: string; userId?: string; debug?: boolean }): void {
  if (inited) return;

  Analytics.init({
    endpoint: opts?.endpoint || ANALYTICS_ENDPOINT,
    gameKey: BASE_GAME_KEY,
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.1.0',
    platform: mapPlatform(),
    deviceInfo: buildDeviceInfo(),
    initialUserId: opts?.userId,
    transport: { request: Platform.request.bind(Platform) },
    storage: {
      get: Platform.getStorageSync.bind(Platform),
      set: Platform.setStorageSync.bind(Platform),
      remove: Platform.removeStorageSync.bind(Platform),
    },
    lifecycle: { onHide: Platform.onHide.bind(Platform) },
    debug: opts?.debug ?? Platform.isDevtools,
  });

  inited = true;
  console.log(`[analytics] init gameKey=${BASE_GAME_KEY} platform=${mapPlatform()}`);
}

/** 登录拿到 openid 后调用；SDK 内部自动 track login + flush */
export function setAnalyticsUserId(userId: string): void {
  if (!inited) return;
  Analytics.setUserId(userId || '');
  if (userId) {
    console.log(`[analytics] setUserId userId=${userId}`);
  } else {
    console.warn('[analytics] setUserId skipped: empty userId');
  }
}

/**
 * 把切片业务事件转发到经分 SDK。
 * 未 init 时静默跳过，单测只断言本地缓冲不受影响。
 */
export function forwardBusinessTrack(name: string, payload: Record<string, unknown> = {}): void {
  const params = toParams(payload);
  if (name === 'run_start') {
    sdkTrack(EVENT_NAMES.LEVEL_START, {
      level_id: Number(payload.stage_id) || 0,
      level_name: payload.stage_id != null ? String(payload.stage_id) : '',
      seed: Number(payload.seed) || 0,
      ...params,
    });
    return;
  }
  if (name === 'run_end') {
    const event = payload.cleared ? EVENT_NAMES.LEVEL_CLEAR : EVENT_NAMES.LEVEL_FAIL;
    sdkTrack(event, {
      level_id: Number(payload.stage_id) || 0,
      duration_ms: Math.max(0, Math.floor(Number(payload.duration_ms) || 0)),
      reached_wave: Number(payload.reached_wave) || 0,
      reason: payload.cleared ? 'clear' : 'defeat',
      ...params,
    });
    return;
  }
  if (name === 'ad_show') {
    sdkTrack(EVENT_NAMES.AD_SHOW, {
      scene: String(payload.placement || 'unknown'),
      ad_type: 'reward',
      ...params,
    });
    return;
  }
  if (name === 'ad_close') {
    sdkTrack(EVENT_NAMES.AD_CLOSE, {
      scene: String(payload.placement || 'unknown'),
      ad_type: 'reward',
      completed: payload.completed === true,
      ...params,
    });
    return;
  }
  sdkTrack(name, params);
}

export const analytics = {
  track: sdkTrack,

  trackSessionStart(params: AnalyticsParams = {}): void {
    sdkTrack(EVENT_NAMES.SESSION_START, {
      entry: 'main',
      with_user_id: false,
      ...params,
    });
  },

  trackSessionEnd(reasonOrParams: string | AnalyticsParams = 'app-hide'): void {
    const params = typeof reasonOrParams === 'string'
      ? { reason: reasonOrParams }
      : reasonOrParams;
    sdkTrack(EVENT_NAMES.SESSION_END, params);
  },

  trackAppShow(params: AnalyticsParams = {}): void {
    sdkTrack(EVENT_NAMES.APP_SHOW, params);
  },

  trackAppError(error: unknown, extra: AnalyticsParams = {}): void {
    const err = error as { message?: string; errMsg?: string; stack?: string; errCode?: number };
    sdkTrack(EVENT_NAMES.APP_ERROR, {
      err_msg: String(err?.message || err?.errMsg || error || 'unknown').slice(0, 240),
      err_code: err?.errCode == null ? -1 : Number(err.errCode),
      stack: err?.stack ? String(err.stack).slice(0, 500) : '',
      ...extra,
    });
  },

  trackAdShow(scene: string, extra: AnalyticsParams = {}): void {
    sdkTrack(EVENT_NAMES.AD_SHOW, { scene, ad_type: 'reward', ...extra });
  },

  trackAdClose(scene: string, completed: boolean, extra: AnalyticsParams = {}): void {
    sdkTrack(EVENT_NAMES.AD_CLOSE, { scene, ad_type: 'reward', completed, ...extra });
  },
};

function mapPlatform(): PlatformName {
  if (Platform.name === 'douyin') return 'douyin';
  if (Platform.name === 'wechat') return 'wechat';
  return Platform.isMinigame ? 'unknown' : 'h5';
}

function buildDeviceInfo(): DeviceInfo {
  const sys = Platform.getSystemInfoSync();
  return {
    brand: String(sys.brand || ''),
    model: String(sys.model || ''),
    system: String(sys.system || sys.platform || ''),
    sdkVersion: String(sys.SDKVersion || sys.sdkVersion || ''),
    screenWidth: Number(sys.screenWidth) || 0,
    screenHeight: Number(sys.screenHeight) || 0,
    network: 'unknown',
  };
}
