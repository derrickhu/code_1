import { describe, expect, it } from 'vitest';
import { chapter1CraftStep, villageGateOpen, winFooter } from '@/balance/opening';
import { runEndDurationMs, runEndForward } from '@/analytics/runEnd';

describe('第 1 章这条路', () => {
  it('赢下 1-3 之后村口才开放', () => {
    expect(villageGateOpen(1)).toBe(false);
    expect(villageGateOpen(3)).toBe(false);
    expect(villageGateOpen(4)).toBe(true);
    expect(villageGateOpen(6)).toBe(true);
  });

  it('1-5 没过、手艺还是 1，先攒零件再点人', () => {
    expect(chapter1CraftStep(3, false, 1, 0)).toBe('done');
    expect(chapter1CraftStep(5, false, 1, 0)).toBe('stall');
    expect(chapter1CraftStep(5, false, 1, 2)).toBe('craft');
    expect(chapter1CraftStep(5, false, 2, 0)).toBe('done');
    expect(chapter1CraftStep(6, true, 1, 0)).toBe('done');
  });

  it('赢了的大按钮：往下推、回村、下一关', () => {
    expect(winFooter(1, 1)).toBe('push');
    expect(winFooter(1, 4)).toBe('push');
    expect(winFooter(1, 5)).toBe('home');
    expect(winFooter(2, 1)).toBe('next');
  });
});

describe('结算上报认赢', () => {
  it('won 为真就是通关，败因留在失败里', () => {
    expect(runEndForward({ won: true, stars: 3 })).toEqual({ won: true, reason: 'clear' });
    expect(runEndForward({ won: false, lose_reason: 'leak' })).toEqual({ won: false, reason: 'leak' });
    expect(runEndForward({ cleared: true })).toEqual({ won: true, reason: 'clear' });
    expect(runEndForward({})).toEqual({ won: false, reason: 'defeat' });
  });

  it('没填 duration_ms 时用 play_ms', () => {
    expect(runEndDurationMs({ play_ms: 30100 })).toBe(30100);
    expect(runEndDurationMs({ duration_ms: 10, play_ms: 99 })).toBe(10);
  });
});
