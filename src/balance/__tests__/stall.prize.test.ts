import { describe, expect, it } from 'vitest';

import {
  PRIZE_BEAT, creditPity, prizeAccent, prizeBanner, prizeChips, prizeSub, prizeTier, prizeTitle, shoot,
} from '@/balance/stall';
import { needsCard } from '@/ui/StallPrizeFx';

describe('弹弓摊亮奖', () => {
  it('按拿到的东西分层，保底工分也是 jackpot', () => {
    expect(prizeTier({ exp: 6, scrap: 0, parts: 0, credits: 0 })).toBe('common');
    expect(prizeTier({ exp: 0, scrap: 4, parts: 0, credits: 0 })).toBe('uncommon');
    expect(prizeTier({ exp: 4, scrap: 0, parts: 1, credits: 0 })).toBe('rare');
    expect(prizeTier({ exp: 6, scrap: 0, parts: 0, credits: 1 })).toBe('jackpot');
    expect(prizeTier({ exp: 0, scrap: 0, parts: 1, credits: 1 })).toBe('jackpot');
  });

  it('每种资源一枚筹码，经验排最前', () => {
    expect(prizeChips({ exp: 8.4, scrap: 0, parts: 1, credits: 0 })).toEqual([
      { kind: 'exp', amount: 8 },
      { kind: 'parts', amount: 1 },
    ]);
  });

  it('零件/工分才出横幅，保底文案跟打中喇叭分开', () => {
    const base = {
      hit: { id: 'cans', name: '罐', weight: 1, exp: 6, scrap: 0, parts: 0, credits: 0, pitch: '' },
      rebounds: 0,
    };
    expect(prizeBanner({
      ...base,
      gain: { exp: 6, scrap: 0, parts: 0, credits: 0 },
      pityHit: false,
    })).toBeNull();
    expect(prizeBanner({
      ...base,
      gain: { exp: 0, scrap: 0, parts: 1, credits: 0 },
      pityHit: false,
    })).toBe('零件 +1');
    expect(prizeBanner({
      ...base,
      hit: { ...base.hit, id: 'horn', name: '喇叭', credits: 1 },
      gain: { exp: 0, scrap: 0, parts: 0, credits: 1 },
      pityHit: false,
    })).toBe('工分 +1');
    expect(prizeBanner({
      ...base,
      gain: { exp: 6, scrap: 0, parts: 0, credits: 1 },
      pityHit: true,
    })).toBe('保底工分 +1');
    expect(prizeTitle({
      ...base,
      gain: { exp: 0, scrap: 0, parts: 0, credits: 1 },
      pityHit: true,
    })).toBe('保底到了');
    expect(prizeTitle({
      ...base,
      hit: { ...base.hit, id: 'horn', name: '喇叭', credits: 1 },
      gain: { exp: 0, scrap: 0, parts: 0, credits: 1 },
      pityHit: false,
    })).toBe('工分入手');
    expect(prizeTitle({
      ...base,
      gain: { exp: 0, scrap: 0, parts: 1, credits: 0 },
      pityHit: false,
    })).toBe('零件到手');
    expect(prizeSub({
      ...base,
      hit: { ...base.hit, id: 'tv', name: '电视' },
      gain: { exp: 0, scrap: 0, parts: 1, credits: 0 },
      pityHit: false,
    })).toBe('破电视里掉出来');
  });

  it('jackpot 比普通停得久，飞行差不多长', () => {
    expect(PRIZE_BEAT.jackpot.hold).toBeGreaterThan(PRIZE_BEAT.rare.hold);
    expect(PRIZE_BEAT.rare.hold).toBeGreaterThan(PRIZE_BEAT.common.hold);
    expect(PRIZE_BEAT.jackpot.hitStop).toBeGreaterThan(PRIZE_BEAT.common.hitStop);
    expect(PRIZE_BEAT.jackpot.fly).toBeLessThan(0.8);
    expect(PRIZE_BEAT.common.hold).toBeGreaterThanOrEqual(0.55);
    expect(PRIZE_BEAT.common.hold + PRIZE_BEAT.common.fly).toBeLessThan(1.15);
    expect(needsCard('jackpot')).toBe(true);
    expect(needsCard('rare')).toBe(true);
    expect(needsCard('common')).toBe(false);
    expect(prizeAccent('jackpot')).toBe(0xffe08a);
  });

  it('差一发保底时打中铁皮罐会补工分', () => {
    const { result, pityCount } = shoot(() => 0, 1, creditPity(1) - 1);
    expect(result.hit.id).toBe('cans');
    expect(result.gain.credits).toBe(1);
    expect(result.pityHit).toBe(true);
    expect(pityCount).toBe(0);
  });

  it('打中喇叭本身出工分，不算保底', () => {
    const { result } = shoot(() => 0.95, 8, 0);
    expect(result.hit.id).toBe('horn');
    expect(result.gain.credits).toBe(1);
    expect(result.pityHit).toBe(false);
  });
});
