/**
 * GameKey 平台命名空间 — 多平台数据隔离（对齐 xiaochu2）
 *
 * - 经分 / CloudBase API 路由永远用 BASE_GAME_KEY（cunkou / cunkou-api）
 * - 微信存档：cunkou_{suffix}
 * - 抖音存档：cunkou_tt_{suffix}
 * 禁止把 cunkou_tt 传给 Analytics.init({ gameKey })
 */
import type { PlatformName } from '@/core/PlatformService';

/** 游戏根标识（CloudBase 函数名 / HTTP 前缀 / 经分白名单，不含平台段） */
export const BASE_GAME_KEY = 'cunkou';

export type PlatformScopeSegment = 'tt' | 'tap';

const PLATFORM_SCOPE: Partial<Record<PlatformName, PlatformScopeSegment>> = {
  douyin: 'tt',
};

export type BackendPlatformCode = 'wx' | 'dy' | 'tap' | 'anon';

const BACKEND_SCOPE: Partial<Record<BackendPlatformCode, PlatformScopeSegment>> = {
  dy: 'tt',
  tap: 'tap',
};

function detectHostPlatform(): PlatformName {
  if (typeof tt !== 'undefined') return 'douyin';
  if (typeof wx !== 'undefined') return 'wechat';
  return 'unknown';
}

export function getPlatformScope(platform: PlatformName = detectHostPlatform()): PlatformScopeSegment | null {
  return PLATFORM_SCOPE[platform] ?? null;
}

export function getPlatformScopeFromBackend(platform: string): PlatformScopeSegment | null {
  const code = String(platform || '').toLowerCase() as BackendPlatformCode;
  return BACKEND_SCOPE[code] ?? null;
}

/** 存档 / 集合 / JWT gameKey 使用的命名空间 */
export function getScopedGameKey(platform: PlatformName = detectHostPlatform()): string {
  const scope = getPlatformScope(platform);
  return scope ? `${BASE_GAME_KEY}_${scope}` : BASE_GAME_KEY;
}

export function getScopedGameKeyFromBackend(platform: string): string {
  const scope = getPlatformScopeFromBackend(platform);
  return scope ? `${BASE_GAME_KEY}_${scope}` : BASE_GAME_KEY;
}

/** cunkou_run_memory / cunkou_tt_run_memory */
export function scopedStorageKey(suffix: string, platform: PlatformName = detectHostPlatform()): string {
  return `${getScopedGameKey(platform)}_${suffix}`;
}

declare const wx: unknown;
declare const tt: unknown;
