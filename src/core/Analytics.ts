/**
 * 切片埋点。文档 §10 的事件必须先接上，否则卡关、装给谁、IPU 都没数可看。
 * 本地缓冲 + 宿主 reportEvent + 经分 SDK（未 init 时 SDK 静默跳过）。
 */
import { scopedStorageKey } from '@/config/gameKeyScope';
import { forwardBusinessTrack } from '@/analytics';
import { Platform } from '@/core/PlatformService';

/**
 * 埋点名。布阵、漏怪、摊子和进化之外，局内层（三选一、增援、焊一下、家伙事）回来了，
 * 要回答的是「玩家在局里到底动不动手」。
 *
 * 只留**能回答设计问题**的那几个。反目标第五条那句「加之前先想清楚要回答什么」
 * 对埋点同样适用 —— 上一版留过 wave_clear，但没人用它做过任何判断。
 */
export type TrackName =
  /** 开打（带布阵结果：谁站哪一路）。卡关时要能看出玩家试过几种排法 */
  | 'run_start'
  /** 结束（带星评、漏了几个、败因）。曲线校准的主数据 */
  | 'run_end'
  /** 局内中途回路上（布阵或开打后）。看有多少人是卡关撤的，不是打完结算的 */
  | 'run_leave'
  /** 开打 5 秒还在局里。用来区分划走和画面停住 */
  | 'run_pulse'
  /** 星星宝箱开了。看玩家会不会为了星回头重打 */
  | 'star_chest'
  /** 布阵改动。「玩家到底会不会重排」是这一版最关键的未知 */
  | 'place_change'
  /** 摊子打了一发。看弹子是当天打完还是攒着 */
  | 'stall_shot'
  /** 喊人（新人 / 喊重了）。工分的去处 */
  | 'call_villager'
  /** 喂了一阶。看玩家是摊平养还是堆主力 */
  | 'evolve'
  /** 村口每日礼包白领了一天。看签到能不能把人拉回来 */
  | 'sign_in'
  /** 弹出三选一（带三张卡、是不是大礼包）。和 boost_pick 一对，看停留多久 */
  | 'boost_offer'
  /** 选了哪张、是不是推荐那张、是自己点的还是超时替选的。卡池调权重靠它 */
  | 'boost_pick'
  /** 战中送人上去（板凳 / 倒了再上 / 托管替送）。看增援是不是真有人用 */
  | 'deploy'
  /** 焊一下（焊给谁、几阶、自己点的还是托管）。看高潮有没有人自己按 */
  | 'weld'
  /** 用了一件家伙事 */
  | 'gadget_use'
  | 'ad_offer'
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
