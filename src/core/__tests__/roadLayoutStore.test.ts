import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => new Map<string, string>());
vi.mock('@/core/PlatformService', () => ({
  Platform: {
    getStorageSync: (k: string) => store.get(k) ?? null,
    setStorageSync: (k: string, v: string) => {
      store.set(k, v);
    },
    isDevtools: true,
  },
}));

import { ROAD_PATH } from '@/balance/roadMap';
import { RoadLayoutStore } from '@/core/roadLayoutStore';

describe('路上墩子布局', () => {
  beforeEach(() => store.clear());

  it('没存过就用代码默认点', () => {
    expect(RoadLayoutStore.get()).toBeNull();
    expect(RoadLayoutStore.live()).toEqual(ROAD_PATH);
  });

  it('保存五坑后立刻能读回来，导出带 ROAD_PATH', () => {
    const pts = ROAD_PATH.map((p, i) => ({ x: p.x + 0.01, y: p.y - 0.01 * i }));
    const result = RoadLayoutStore.save(pts);
    expect(result.ok).toBe(true);
    expect(result.snippet).toContain('export const ROAD_PATH');
    expect(RoadLayoutStore.get()).toEqual(pts.map((p) => ({
      x: Math.round(p.x * 10000) / 10000,
      y: Math.round(p.y * 10000) / 10000,
    })));
    expect(RoadLayoutStore.exportReport()).toContain('路上墩子坐标');
  });

  it('点数不对不写', () => {
    expect(RoadLayoutStore.save([{ x: 0.5, y: 0.5 }]).ok).toBe(false);
    expect(RoadLayoutStore.get()).toBeNull();
  });
});
