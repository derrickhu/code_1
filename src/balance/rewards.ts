/**
 * 废品是本局零钱：过波、装上能攒，重抽和拆件要花。
 * 打完清零。看广告只把剩余带进下一局开场，不开局外店。
 */
export const SCRAP_PER_WAVE = 8;
export const SCRAP_PER_INSTALL = 4;
export const REROLL_COST = 10;
export const STRIP_COST = 8;

export type RewardSource = 'free' | 'ad' | 'iap' | 'quest';

/** 每一笔发放都带 source，日后 IAA / IAP 分账不用重做存档。 */
export interface ScrapGrant {
  amount: number;
  source: RewardSource;
}

export function runScrap(wave: number, installs: number): number {
  return Math.max(0, wave) * SCRAP_PER_WAVE + Math.max(0, installs) * SCRAP_PER_INSTALL;
}
