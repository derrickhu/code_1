/**
 * 切片埋点。文档 §10 的事件必须先接上，否则卡关、装给谁、IPU 都没数可看。
 * 先落本地 + 宿主 reportEvent，不接支付、不发后端。
 */
import { Platform } from '@/core/PlatformService';

export type TrackName =
  | 'run_start'
  | 'run_end'
  | 'wave_clear'
  | 'pick_show'
  | 'pick_choose'
  | 'mod_install'
  | 'queue_change'
  | 'hero_down'
  | 'ad_show'
  | 'ad_close';

export interface TrackedEvent {
  name: TrackName;
  t: number;
  payload: Record<string, unknown>;
}

const KEY = 'code1_track';
const MAX = 80;
const buf: TrackedEvent[] = [];

export function track(name: TrackName, payload: Record<string, unknown> = {}): void {
  const ev: TrackedEvent = { name, t: Date.now(), payload };
  buf.push(ev);
  if (buf.length > MAX) buf.shift();
  Platform.reportEvent(name, payload);
  try {
    Platform.setStorageAsync(KEY, JSON.stringify(buf));
  } catch {
    /* 写失败不挡玩 */
  }
}

export function recentEvents(): readonly TrackedEvent[] {
  return buf;
}

export function resetAnalytics(): void {
  buf.length = 0;
}
