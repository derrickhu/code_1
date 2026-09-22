import { describe, expect, it } from 'vitest';
import { plainTrackPayload } from '@/core/PlatformService';

describe('plainTrackPayload', () => {
  it('布阵 lanes 数组要折成字符串，不能原样丢给 reportEvent', () => {
    const out = plainTrackPayload({
      stage_id: 3,
      placed: 2,
      fighting: false,
      lanes: [0, 1, 1],
    });
    expect(out.stage_id).toBe(3);
    expect(out.placed).toBe(2);
    expect(out.fighting).toBe(false);
    expect(out.lanes).toBe('[0,1,1]');
  });
});
