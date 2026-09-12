/**
 * 路上 5 个墩子的 GM 布局。本地先看，导出片段后再写回 ROAD_PATH。
 */
import { scopedStorageKey } from '@/config/gameKeyScope';
import { Platform } from '@/core/PlatformService';
import {
  ROAD_PATH, formatRoadPathSnippet, roadPathOf, type MapPoint,
} from '@/balance/roadMap';

const STORAGE_KEY = scopedStorageKey('road_layout');

interface StoreData {
  v: 2;
  points: MapPoint[];
}

function emptyStore(): StoreData {
  return { v: 2, points: [] };
}

function loadStore(): StoreData {
  try {
    const raw = Platform.getStorageSync(STORAGE_KEY);
    if (!raw) return emptyStore();
    const data = (typeof raw === 'string' ? JSON.parse(raw) : raw) as StoreData;
    if (data?.v === 2 && Array.isArray(data.points) && data.points.length === ROAD_PATH.length) {
      return { v: 2, points: data.points.map((p) => ({ x: p.x, y: p.y })) };
    }
  } catch { /* */ }
  return emptyStore();
}

function persistStore(data: StoreData): boolean {
  try {
    Platform.setStorageSync(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('[RoadLayoutStore] 写入失败', e);
    return false;
  }
}

export const RoadLayoutStore = {
  get(): MapPoint[] | null {
    const pts = loadStore().points;
    return pts.length === ROAD_PATH.length ? pts : null;
  },

  live(): readonly MapPoint[] {
    return roadPathOf(this.get());
  },

  save(points: readonly MapPoint[]): { ok: boolean; snippet: string; message: string } {
    if (points.length !== ROAD_PATH.length) {
      return { ok: false, snippet: '', message: '保存失败：必须是 5 个点' };
    }
    const normalized = points.map((p) => ({
      x: Math.round(p.x * 10000) / 10000,
      y: Math.round(p.y * 10000) / 10000,
    }));
    const snippet = formatRoadPathSnippet(normalized);
    const ok = persistStore({ v: 2, points: normalized });
    if (!ok) return { ok: false, snippet, message: '保存失败：storage 写入异常' };
    console.warn('[RoadLayoutStore] 墩子坐标\n', snippet);
    return {
      ok: true,
      snippet,
      message: '已存本地并打到控制台，把 ROAD_PATH 那段发给我固化',
    };
  },

  clear(): void {
    persistStore(emptyStore());
  },

  exportReport(): string {
    const live = this.live();
    return [
      '========== 路上墩子坐标 ==========',
      formatRoadPathSnippet(live),
      '================================',
    ].join('\n');
  },
};
