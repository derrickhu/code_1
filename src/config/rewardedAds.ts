/**
 * 微信激励视频广告位。
 *
 * 只在微信宿主上使用。抖音流量主还没开，传空串，走 Platform 的开发桩，
 * 不把微信的 adUnitId 塞给 tt.createRewardedVideoAd。
 */
export const WX_REWARDED_AD = {
  /** 村里弹弓摊「看一段」领弹子 */
  stallPellets: 'adunit-39a3bb98a95fc55c',
  /** 战斗漏怪后原地复活 */
  revive: 'adunit-fe7a8a11e1ea7ee9',
  /** 赢了结算「这关再拿一份」：弹子和废铁各再给一次 */
  settleDouble: 'adunit-6233ca9f96b05e36',
  /** 村口每日礼包（签到）：领完再看一段，今天这份翻倍 */
  dailyGift: 'adunit-ccd98449734cdc58',
  /** 输了结算的补给 */
  loseBonus: 'adunit-3e808f8ac0bd9209',
  /** 升手艺零件差一点时，看一段拿零件 */
  craftParts: 'adunit-c5587bc19363af50',
} as const;

export type RewardedSlot = keyof typeof WX_REWARDED_AD;

export function rewardedAdUnitId(slot: RewardedSlot, platform: string): string {
  return platform === 'wechat' ? WX_REWARDED_AD[slot] : '';
}
