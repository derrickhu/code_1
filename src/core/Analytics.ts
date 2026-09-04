/**
 * 切片埋点。文档 §10 的事件必须先接上，否则卡关、装给谁、IPU 都没数可看。
 * 本地缓冲 + 宿主 reportEvent + 经分 SDK（未 init 时 SDK 静默跳过）。
 */
import { scopedStorageKey } from '@/config/gameKeyScope';
import { forwardBusinessTrack } from '@/analytics';
import { Platform } from '@/core/PlatformService';

/**
 * 埋点名。这一版换了游戏循环，事件也跟着换了：
 * 三选一、焊改装件、调队序都没了，取而代之的是布阵、漏怪、摊子和进化。
 *
 * 只留**能回答设计问题**的那几个。反目标第五条那句「加之前先想清楚要回答什么」
 * 对埋点同样适用 —— 上一版留过 wave_clear，但没人用它做过任何判断。
 */
export type TrackName =
  /** 开打（带布阵结果：谁站哪一路）。卡关时要能看出玩家试过几种排法 */
  | 'run_start'
  /** 结束（带星评、漏了几个、败因）。曲线校准的主数据 */
  | 'run_end'
  /** 布阵改动。「玩家到底会不会重排」是这一版最关键的未知 */
  | 'place_change'
  /** 摊子打了一发。看弹子是当天打完还是攒着 */
  | 'stall_shot'
  /** 喊人（新人 / 喊重了）。工分的去处 */
  | 'call_villager'
  /** 喂了一阶。看玩家是摊平养还是堆主力 */
  | 'evolve'
  | 'ad_show'
  | 'ad_close';

export interface TrackedEvent {
  name: TrackName;
  t: number;
  payload: Record<string, unknown>;
}

const KEY = scopedStorageKey('track');
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
  forwardBusinessTrack(name, payload);
}

export function recentEvents(): readonly TrackedEvent[] {
  return buf;
}

export function resetAnalytics(): void {
  buf.length = 0;
}
