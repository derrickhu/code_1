import {
  CLOUD_SYNC_BASE_DELAY_MS,
  CLOUD_SYNC_DEBOUNCE_MS,
  CLOUD_SYNC_LOG_THRESHOLD,
  CLOUD_SYNC_MAX_BACKOFF_MS,
  CLOUD_SYNC_MAX_FAIL_COUNT,
  CLOUD_SYNC_RETRY_INTERVAL_MS,
  CLOUD_SYNC_STARTUP_TIMEOUT_MS,
} from '@/config/CloudConfig';
import { BackendError, BackendService } from '@/core/BackendService';
import { PersistService } from '@/core/PersistService';
import { Platform } from '@/core/PlatformService';

export type CloudAuthorityState = 'disabled' | 'unknown' | 'confirmedRemote' | 'cacheOnly';

export interface CloudStartupSyncResult {
  status: 'disabled' | 'confirmed' | 'remote-applied' | 'cache-only';
  reason: string;
}

class CloudSyncManagerClass {
  private initPromise: Promise<void> | null = null;
  private startupPromise: Promise<void> | null = null;
  private cloudReady = false;
  private initDone = false;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private syncFailCount = 0;
  private syncDisabled = false;
  private syncing = false;
  private syncPending = false;
  private authorityState: CloudAuthorityState = this.enabled ? 'unknown' : 'disabled';
  private lastStartupRemoteApplied = false;

  constructor() {
    PersistService.subscribe((changedKeys) => {
      if (changedKeys.length > 0) {
        this.scheduleSync(`dirty:${changedKeys.length}`);
      }
    });
  }

  get enabled(): boolean {
    return BackendService.available;
  }

  get ready(): boolean {
    return this.cloudReady;
  }

  get userId(): string {
    return BackendService.userId;
  }

  prewarm(): void {
    if (!this.enabled) {
      return;
    }
    if (!this.startupPromise) {
      this.startupPromise = this.initialize();
    }
  }

  async awaitStartupSync(timeoutMs = CLOUD_SYNC_STARTUP_TIMEOUT_MS): Promise<CloudStartupSyncResult> {
    if (!this.enabled) {
      this.authorityState = 'disabled';
      return { status: 'disabled', reason: 'backend-disabled' };
    }
    this.prewarm();
    if (!this.startupPromise) {
      return { status: 'disabled', reason: 'startup-missing' };
    }
    let timer: ReturnType<typeof setTimeout> | null = null;
    const result = await Promise.race([
      this.startupPromise.then(() => 'done' as const).catch(() => 'done' as const),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }).then(() => 'timeout' as const),
    ]);
    if (timer) {
      clearTimeout(timer);
    }
    if (result === 'timeout') {
      return { status: 'cache-only', reason: 'startup-timeout' };
    }
    if (this.authorityState === 'cacheOnly') {
      return { status: 'cache-only', reason: 'startup-pull-failed' };
    }
    return {
      status: this.lastStartupRemoteApplied ? 'remote-applied' : 'confirmed',
      reason: this.lastStartupRemoteApplied ? 'remote-imported' : 'cloud-confirmed',
    };
  }

  scheduleSync(reason = 'debounce'): void {
    if (!this.enabled) {
      return;
    }
    this.prewarm();
    if (this.authorityState === 'cacheOnly') {
      this.syncPending = true;
      return;
    }
    if (!this.initDone) {
      this.syncPending = true;
      return;
    }
    if (!this.cloudReady || this.syncDisabled) {
      return;
    }
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    const delay = this.syncFailCount > 0
      ? Math.min(CLOUD_SYNC_BASE_DELAY_MS * Math.pow(2, this.syncFailCount - 1), CLOUD_SYNC_MAX_BACKOFF_MS)
      : CLOUD_SYNC_DEBOUNCE_MS;
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      void this.syncToCloud(reason);
    }, delay);
  }

  async flushNow(reason = 'manual'): Promise<void> {
    if (!this.enabled) {
      return;
    }
    this.prewarm();
    if (this.startupPromise) {
      try {
        await this.startupPromise;
      } catch {
        // 初始化失败已经走本地缓存
      }
    }
    if (this.authorityState === 'cacheOnly' || !this.cloudReady) {
      return;
    }
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    await this.syncToCloud(reason, true);
  }

  private async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = (async () => {
      try {
        await BackendService.ensureToken();
        this.cloudReady = !!BackendService.userId;
        if (!this.cloudReady) {
          this.enterCacheOnly('no-user-id');
          return;
        }
        await this.pullFromCloudOnStartup();
      } catch (error) {
        console.warn('[CloudSync] init failed, using local cache', error);
        this.enterCacheOnly('init-failed');
      } finally {
        this.initDone = true;
        if (this.syncPending && this.cloudReady) {
          this.syncPending = false;
          this.scheduleSync('pending-after-init');
        }
      }
    })();
    return this.initPromise;
  }

  private async pullFromCloudOnStartup(): Promise<void> {
    let remote;
    try {
      remote = await BackendService.pullSave();
    } catch (error) {
      console.warn('[CloudSync] startup pull failed, keeping local cache', error);
      this.enterCacheOnly('startup-pull-failed');
      return;
    }

    const hasLocalData = PersistService.hasAnyLocalCloudData();

    if (!remote.exists || Object.keys(remote.payload || {}).length === 0) {
      // 远端空档：保留本地进度，标脏后推上去。不能按空 payload 覆盖本地。
      this.confirmRemoteBaseline(0, remote.exists ? 'startup-empty-remote-doc' : 'startup-no-remote-doc');
      this.lastStartupRemoteApplied = false;
      if (hasLocalData) {
        PersistService.touchCloudMeta();
        this.scheduleSync('startup-seed-remote');
      }
      return;
    }

    const localMeta = PersistService.getCloudSyncMeta();
    const remoteUpdatedAt = Number(remote.updatedAt) || 0;
    const hasKnownRemoteBaseline = localMeta.remoteUpdatedAt > 0;
    const shouldApplyRemote = !hasLocalData || !hasKnownRemoteBaseline || remoteUpdatedAt > localMeta.remoteUpdatedAt;
    if (shouldApplyRemote) {
      PersistService.importCloudSnapshot({
        updatedAt: remoteUpdatedAt,
        payload: remote.payload || {},
        reason: 'startup',
      });
      this.confirmRemoteBaseline(remoteUpdatedAt, 'startup-remote-imported');
      this.lastStartupRemoteApplied = true;
      return;
    }

    this.confirmRemoteBaseline(remoteUpdatedAt, 'startup-remote-confirmed');
    if (PersistService.isCloudDirty()) {
      this.scheduleSync('startup-local-dirty');
    }
  }

  private async syncToCloud(reason: string, force = false): Promise<void> {
    if (!this.cloudReady || (!force && this.syncDisabled) || this.authorityState === 'cacheOnly') {
      return;
    }
    if (this.syncing) {
      this.syncPending = true;
      return;
    }
    this.syncing = true;
    try {
      const snapshot = PersistService.exportCloudSnapshot();
      if (!PersistService.isCloudDirty() || snapshot.payloadKeys.length === 0) {
        return;
      }
      if (snapshot.updatedAt <= 0) {
        PersistService.touchCloudMeta();
      }
      const finalSnapshot = PersistService.exportCloudSnapshot();
      try {
        const res = await BackendService.pushSave({
          schemaVersion: finalSnapshot.schemaVersion,
          updatedAt: finalSnapshot.updatedAt,
          baseRemoteUpdatedAt: finalSnapshot.baseRemoteUpdatedAt,
          clientFingerprint: this.buildClientFingerprint(),
          payload: finalSnapshot.payload,
        });
        PersistService.markCloudSynced(res.updatedAt || finalSnapshot.updatedAt);
        this.confirmRemoteBaseline(res.updatedAt || finalSnapshot.updatedAt, `push-ok:${reason}`);
        this.syncFailCount = 0;
        this.syncDisabled = false;
        if (this.retryTimer) {
          clearInterval(this.retryTimer);
          this.retryTimer = null;
        }
      } catch (error) {
        if (error instanceof BackendError && error.code === 'STALE_UPDATE' && error.data && typeof error.data === 'object') {
          const remote = (error.data as { remote?: { updatedAt?: number; payload?: Record<string, string> } }).remote;
          PersistService.importCloudSnapshot({
            updatedAt: Number(remote?.updatedAt) || Date.now(),
            payload: remote?.payload || {},
            reason: 'stale-update',
          });
          this.confirmRemoteBaseline(Number(remote?.updatedAt) || Date.now(), 'stale-update');
          this.syncFailCount = 0;
          this.syncDisabled = false;
          return;
        }
        throw error;
      }
    } catch (error: unknown) {
      this.syncFailCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      if (this.syncFailCount <= CLOUD_SYNC_LOG_THRESHOLD) {
        console.warn(`[CloudSync] push failed (${this.syncFailCount}/${CLOUD_SYNC_MAX_FAIL_COUNT})`, message);
      }
      if (this.syncFailCount >= CLOUD_SYNC_MAX_FAIL_COUNT) {
        this.syncDisabled = true;
        if (!this.retryTimer) {
          this.retryTimer = setInterval(() => {
            if (!this.syncing && PersistService.isCloudDirty()) {
              void this.syncToCloud('retry-interval', true);
            }
          }, CLOUD_SYNC_RETRY_INTERVAL_MS);
        }
      } else if (PersistService.isCloudDirty()) {
        this.scheduleSync(`retry-after-fail:${reason}`);
      }
    } finally {
      this.syncing = false;
      if (this.syncPending && !this.syncDisabled) {
        this.syncPending = false;
        this.scheduleSync('pending-resume');
      }
    }
  }

  private buildClientFingerprint(): string {
    const info = Platform.getSystemInfoSync();
    return [
      Platform.name,
      info.brand,
      info.model,
      info.platform,
    ].map((v) => (v == null ? '' : String(v))).filter(Boolean).join('|').slice(0, 160);
  }

  private enterCacheOnly(reason: string): void {
    if (this.authorityState === 'cacheOnly') {
      return;
    }
    this.authorityState = 'cacheOnly';
    console.warn(`[CloudSync] cacheOnly reason=${reason}`);
  }

  private confirmRemoteBaseline(remoteUpdatedAt: number, reason: string): void {
    this.authorityState = 'confirmedRemote';
    console.log(`[CloudSync] remote baseline confirmed reason=${reason}, remoteUpdatedAt=${remoteUpdatedAt}`);
  }
}

export const CloudSyncManager = new CloudSyncManagerClass();
