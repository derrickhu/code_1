import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, string>());
vi.mock('@/core/PlatformService', () => ({
  Platform: {
    getStorageSync: (k: string) => store.get(k) ?? null,
    setStorageSync: (k: string, v: string) => {
      store.set(k, v);
    },
    removeStorageSync: (k: string) => {
      store.delete(k);
    },
  },
}));

import { SAVE_KEY } from '@/config/CloudConfig';
import { PersistService } from '@/core/PersistService';
import { saveRun } from '@/core/RunMemory';

describe('云同步快照', () => {
  beforeEach(() => store.clear());

  it('写养成存档会标脏并打进 payload', () => {
    saveRun(3, ['tiezhu'], { cleared: true, ladderLv: 0, combos: [], stageId: 1 });
    expect(PersistService.isCloudDirty()).toBe(true);
    const snap = PersistService.exportCloudSnapshot();
    expect(snap.payloadKeys).toEqual([SAVE_KEY]);
    expect(snap.payload[SAVE_KEY]).toContain('"highestWave":3');
  });

  it('空远端 payload 导入不会在本测试里被调用；本地档能单独导出', () => {
    store.set(SAVE_KEY, JSON.stringify({ highestWave: 9, campaignRev: 2 }));
    PersistService.touchCloudMeta(123);
    const snap = PersistService.exportCloudSnapshot();
    expect(snap.updatedAt).toBe(123);
    expect(snap.payload[SAVE_KEY]).toContain('"highestWave":9');
  });
});
