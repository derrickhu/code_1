import {
  CLOUD_SYNC_ALLOWLIST,
  CLOUD_SYNC_META_KEY,
  CLOUD_SYNC_SCHEMA_VERSION,
} from '@/config/CloudConfig';
import { Platform } from '@/core/PlatformService';

export interface CloudSyncMeta {
  updatedAt: number;
  dirty: boolean;
  lastSyncAt: number;
  remoteUpdatedAt: number;
}

export interface PersistSnapshot {
  schemaVersion: number;
  updatedAt: number;
  baseRemoteUpdatedAt: number;
  payload: Record<string, string>;
  payloadKeys: string[];
  sizeBytes: number;
}

type DirtyListener = (changedKeys: string[]) => void;
export type CloudImportReason = 'startup' | 'startup-late' | 'stale-update' | 'manual';

export interface CloudImportInfo {
  reason: CloudImportReason;
  updatedAt: number;
  changedKeys: string[];
  payloadKeys: string[];
}

type CloudImportListener = (info: CloudImportInfo) => void;

interface WriteOptions {
  markDirty?: boolean;
}

class PersistServiceClass {
  private readonly allowlist = new Set<string>(CLOUD_SYNC_ALLOWLIST);
  private readonly dirtyListeners = new Set<DirtyListener>();
  private readonly importListeners = new Set<CloudImportListener>();
  private dirtyTrackingSuspended = 0;

  isCloudSyncKey(key: string): boolean {
    return this.allowlist.has(key);
  }

  readRaw(key: string): string | null {
    return Platform.getStorageSync(key);
  }

  readJSON<T>(key: string): T | null {
    const raw = this.readRaw(key);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      console.warn(`[Persist] JSON parse failed key=${key}`, error);
      return null;
    }
  }

  writeRaw(key: string, value: string, options: WriteOptions = {}): void {
    Platform.setStorageSync(key, value);
    if (options.markDirty !== false) {
      this.onDataChanged([key]);
    }
  }

  writeJSON(key: string, value: unknown, options: WriteOptions = {}): void {
    this.writeRaw(key, JSON.stringify(value), options);
  }

  remove(key: string, options: WriteOptions = {}): void {
    Platform.removeStorageSync(key);
    if (options.markDirty !== false) {
      this.onDataChanged([key]);
    }
  }

  subscribe(listener: DirtyListener): () => void {
    this.dirtyListeners.add(listener);
    return () => this.dirtyListeners.delete(listener);
  }

  subscribeCloudImport(listener: CloudImportListener): () => void {
    this.importListeners.add(listener);
    return () => this.importListeners.delete(listener);
  }

  withSuppressedDirtyTracking<T>(runner: () => T): T {
    this.dirtyTrackingSuspended += 1;
    try {
      return runner();
    } finally {
      this.dirtyTrackingSuspended = Math.max(0, this.dirtyTrackingSuspended - 1);
    }
  }

  getCloudSyncMeta(): CloudSyncMeta {
    const parsed = this.readJSON<Partial<CloudSyncMeta>>(CLOUD_SYNC_META_KEY);
    if (parsed && typeof parsed.updatedAt === 'number') {
      return {
        updatedAt: parsed.updatedAt,
        dirty: !!parsed.dirty,
        lastSyncAt: typeof parsed.lastSyncAt === 'number' ? parsed.lastSyncAt : 0,
        remoteUpdatedAt: typeof parsed.remoteUpdatedAt === 'number' ? parsed.remoteUpdatedAt : 0,
      };
    }
    return {
      updatedAt: 0,
      dirty: false,
      lastSyncAt: 0,
      remoteUpdatedAt: 0,
    };
  }

  isCloudDirty(): boolean {
    return this.getCloudSyncMeta().dirty;
  }

  touchCloudMeta(updatedAt = Date.now()): CloudSyncMeta {
    const prev = this.getCloudSyncMeta();
    const next = {
      updatedAt,
      dirty: true,
      lastSyncAt: prev.lastSyncAt,
      remoteUpdatedAt: prev.remoteUpdatedAt,
    };
    this.writeMeta(next);
    return next;
  }

  markCloudSynced(updatedAt: number): void {
    const prev = this.getCloudSyncMeta();
    this.writeMeta({
      updatedAt: updatedAt > 0 ? updatedAt : prev.updatedAt,
      dirty: false,
      lastSyncAt: Date.now(),
      remoteUpdatedAt: updatedAt > 0 ? updatedAt : prev.remoteUpdatedAt,
    });
  }

  hasAnyLocalCloudData(): boolean {
    return CLOUD_SYNC_ALLOWLIST.some((key) => this.readRaw(key) !== null);
  }

  exportCloudSnapshot(): PersistSnapshot {
    const meta = this.getCloudSyncMeta();
    const payload: Record<string, string> = {};
    let sizeBytes = 0;
    for (const key of CLOUD_SYNC_ALLOWLIST) {
      const raw = this.readRaw(key);
      if (raw === null) {
        continue;
      }
      payload[key] = raw;
      sizeBytes += raw.length;
    }
    const payloadKeys = Object.keys(payload);
    return {
      schemaVersion: CLOUD_SYNC_SCHEMA_VERSION,
      updatedAt: meta.updatedAt,
      baseRemoteUpdatedAt: meta.remoteUpdatedAt,
      payload,
      payloadKeys,
      sizeBytes,
    };
  }

  importCloudSnapshot(snapshot: {
    updatedAt?: number;
    payload?: Record<string, unknown>;
    reason?: CloudImportReason;
  }): void {
    const payload = snapshot.payload || {};
    const updatedAt = typeof snapshot.updatedAt === 'number' ? snapshot.updatedAt : Date.now();
    const changedKeys: string[] = [];

    this.withSuppressedDirtyTracking(() => {
      for (const key of CLOUD_SYNC_ALLOWLIST) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) {
          const value = payload[key];
          if (value === undefined || value === null) {
            if (this.readRaw(key) !== null) {
              changedKeys.push(key);
            }
            Platform.removeStorageSync(key);
          } else {
            const raw = typeof value === 'string' ? value : JSON.stringify(value);
            if (this.readRaw(key) !== raw) {
              changedKeys.push(key);
            }
            Platform.setStorageSync(key, raw);
          }
        } else if (this.readRaw(key) !== null) {
          changedKeys.push(key);
          Platform.removeStorageSync(key);
        }
      }
      this.writeMeta({
        updatedAt,
        dirty: false,
        lastSyncAt: Date.now(),
        remoteUpdatedAt: updatedAt,
      });
    });

    const payloadKeys = Object.keys(payload);
    for (const listener of this.importListeners) {
      try {
        listener({
          reason: snapshot.reason || 'manual',
          updatedAt,
          changedKeys,
          payloadKeys,
        });
      } catch (error) {
        console.warn('[Persist] cloud import listener failed', error);
      }
    }
  }

  private onDataChanged(changedKeys: string[]): void {
    if (this.dirtyTrackingSuspended > 0) {
      return;
    }
    const syncKeys = changedKeys.filter((key) => this.isCloudSyncKey(key));
    if (syncKeys.length === 0) {
      return;
    }
    const updatedAt = Date.now();
    const prev = this.getCloudSyncMeta();
    this.writeMeta({
      updatedAt,
      dirty: true,
      lastSyncAt: prev.lastSyncAt,
      remoteUpdatedAt: prev.remoteUpdatedAt,
    });
    for (const listener of this.dirtyListeners) {
      try {
        listener(syncKeys);
      } catch (error) {
        console.warn('[Persist] dirty listener failed', error);
      }
    }
  }

  private writeMeta(meta: CloudSyncMeta): void {
    this.withSuppressedDirtyTracking(() => {
      Platform.setStorageSync(CLOUD_SYNC_META_KEY, JSON.stringify(meta));
    });
  }
}

export const PersistService = new PersistServiceClass();
