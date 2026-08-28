/**
 * 统一 HTTP 后端 / 经分配置（CloudBase HTTP 访问服务）
 *
 * 多游戏复用时改 BASE_GAME_KEY；多平台数据隔离见 gameKeyScope.ts。
 */
import {
  BASE_GAME_KEY,
  getScopedGameKey,
  scopedStorageKey,
} from '@/config/gameKeyScope';

/** CloudBase HTTP 访问服务根域名（不含路径） */
export const BACKEND_BASE_URL = 'https://rosa-env-d7grf78r5dbd37323.service.tcloudbase.com';

/** 本游戏 API 挂载前缀（cloudfunctions/${BASE_GAME_KEY}-api，平台无关） */
export const BACKEND_PATH_PREFIX = `/${BASE_GAME_KEY}-api`;

export const BACKEND_LOGIN_PATH = `${BACKEND_PATH_PREFIX}/login`;
export const BACKEND_PULL_PATH = `${BACKEND_PATH_PREFIX}/save/pull`;
export const BACKEND_PUSH_PATH = `${BACKEND_PATH_PREFIX}/save/push`;
export const BACKEND_HEALTH_PATH = `${BACKEND_PATH_PREFIX}/health`;

/** 经分批量上报（多游戏共用云函数，按 game_key 区分） */
export const ANALYTICS_INGEST_PATH = '/analytics-ingest/track';
export const ANALYTICS_ENDPOINT = `${BACKEND_BASE_URL}${ANALYTICS_INGEST_PATH}`;

export const BACKEND_REQUEST_TIMEOUT_MS = 10000;

/** 运行时按宿主：微信 cunkou，抖音 cunkou_tt */
export const GAME_KEY = getScopedGameKey();

export const BACKEND_TOKEN_KEY = scopedStorageKey('token');
export const BACKEND_ANON_ID_KEY = scopedStorageKey('anon_id');

/** 本地养成存档（与 SCOPED GAME_KEY 绑定） */
export const SAVE_KEY = scopedStorageKey('run_memory');

export const CLOUD_SYNC_SCHEMA_VERSION = 1;
export const CLOUD_SYNC_META_KEY = scopedStorageKey('cloud_meta');

/** 参与云同步的本地 storage key（value 为原始 JSON 字符串） */
export const CLOUD_SYNC_ALLOWLIST = [SAVE_KEY] as const;

export const CLOUD_SYNC_STARTUP_TIMEOUT_MS = 2500;
export const CLOUD_SYNC_DEBOUNCE_MS = 1500;
export const CLOUD_SYNC_BASE_DELAY_MS = 1500;
export const CLOUD_SYNC_MAX_BACKOFF_MS = 30000;
export const CLOUD_SYNC_MAX_FAIL_COUNT = 5;
export const CLOUD_SYNC_RETRY_INTERVAL_MS = 60000;
export const CLOUD_SYNC_LOG_THRESHOLD = 3;

export type CloudSyncKey = typeof CLOUD_SYNC_ALLOWLIST[number];

export { BASE_GAME_KEY, getScopedGameKey, scopedStorageKey } from '@/config/gameKeyScope';
