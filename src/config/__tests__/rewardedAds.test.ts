import { describe, expect, it } from 'vitest';
import { WX_REWARDED_AD, rewardedAdUnitId } from '@/config/rewardedAds';

describe('微信激励视频广告位', () => {
  it('三个入口各有一个已开启的广告位，互不共用', () => {
    const ids = Object.values(WX_REWARDED_AD);
    expect(ids).toEqual([
      'adunit-39a3bb98a95fc55c',
      'adunit-fe7a8a11e1ea7ee9',
      'adunit-6233ca9f96b05e36',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('只在微信宿主上带广告位，抖音和本地传空串', () => {
    expect(rewardedAdUnitId('revive', 'wechat')).toBe(WX_REWARDED_AD.revive);
    expect(rewardedAdUnitId('revive', 'douyin')).toBe('');
    expect(rewardedAdUnitId('stallPellets', 'unknown')).toBe('');
  });
});
