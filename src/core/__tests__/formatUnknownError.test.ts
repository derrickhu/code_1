import { describe, expect, it } from 'vitest';
import { BackendError, formatUnknownError } from '@/core/BackendService';

describe('云同步错误不能打成 [object Object]', () => {
  it('wx.request fail 那种 { errMsg } 要读出原文', () => {
    expect(formatUnknownError({ errMsg: 'request:fail url not in domain list' }))
      .toBe('request:fail url not in domain list');
  });

  it('BackendError 带上 code 和 status', () => {
    expect(formatUnknownError(new BackendError(409, 'STALE_UPDATE', '存档旧了')))
      .toBe('存档旧了 code=STALE_UPDATE status=409');
  });

  it('普通 Error 只留 message', () => {
    expect(formatUnknownError(new Error('request timeout'))).toBe('request timeout');
  });
});
