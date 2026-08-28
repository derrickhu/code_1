import { describe, expect, it } from 'vitest';
import {
  BASE_GAME_KEY,
  getScopedGameKey,
  getScopedGameKeyFromBackend,
  scopedStorageKey,
} from '@/config/gameKeyScope';

describe('gameKeyScope', () => {
  it('经分 / API 永远用基础名，不含平台段', () => {
    expect(BASE_GAME_KEY).toBe('cunkou');
    expect(BASE_GAME_KEY).not.toMatch(/_tt|_tap/);
  });

  it('微信用基础名，抖音加 _tt', () => {
    expect(getScopedGameKey('wechat')).toBe('cunkou');
    expect(getScopedGameKey('douyin')).toBe('cunkou_tt');
    expect(getScopedGameKey('unknown')).toBe('cunkou');
  });

  it('后端 platform 字段同样分流', () => {
    expect(getScopedGameKeyFromBackend('wx')).toBe('cunkou');
    expect(getScopedGameKeyFromBackend('dy')).toBe('cunkou_tt');
    expect(getScopedGameKeyFromBackend('anon')).toBe('cunkou');
  });

  it('本地存储 key 跟 scoped gameKey 绑定', () => {
    expect(scopedStorageKey('run_memory', 'wechat')).toBe('cunkou_run_memory');
    expect(scopedStorageKey('run_memory', 'douyin')).toBe('cunkou_tt_run_memory');
    expect(scopedStorageKey('token', 'wechat')).toBe('cunkou_token');
  });
});
