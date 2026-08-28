/**
 * GM 调试。只在微信/抖音开发者工具里开；真机一律关掉。
 * 工具里自动激活。村子标题牌连点 5 次也能开。
 */
import { scopedStorageKey } from '@/config/gameKeyScope';
import { EventBus } from '@/core/EventBus';
import { Platform } from '@/core/PlatformService';
import { SceneManager } from '@/core/SceneManager';
import { DEFAULT_SQUAD } from '@/balance/heroes';
import { CHAPTER_COUNT, STAGES_PER_CHAPTER, findStage, getStage } from '@/balance/stages';
import { gmUnlockToStage, loadMemory } from '@/core/RunMemory';

const GM_STORAGE_KEY = scopedStorageKey('gm');
const GM_LEGACY_KEY = 'code1_gm';

class GMManagerClass {
  private _enabled = false;
  private readonly _runtimeAllowed: boolean;
  private _tapCount = 0;
  private _lastTapTime = 0;
  private _instantClear: (() => string) | null = null;

  get isRuntimeAllowed(): boolean {
    return this._runtimeAllowed;
  }

  get isEnabled(): boolean {
    return this._runtimeAllowed && this._enabled;
  }

  constructor() {
    this._runtimeAllowed = Platform.isDevtools;
    this._loadState();
  }

  onTitleTap(): void {
    if (!this._runtimeAllowed) return;
    const now = Date.now();
    if (now - this._lastTapTime > 1500) this._tapCount = 1;
    else this._tapCount += 1;
    this._lastTapTime = now;
    if (this._tapCount >= 5) {
      this._tapCount = 0;
      this._enabled = true;
      this._saveState();
      console.log('[GM] GM 模式已激活');
      EventBus.emit('gm:activated');
      EventBus.emit('gm:open');
    }
  }

  openPanel(): void {
    if (!this._runtimeAllowed) {
      console.warn('[GM] 真机环境禁用 GM');
      return;
    }
    if (!this._enabled) {
      console.warn('[GM] GM 未激活：村子标题牌连点 5 次');
      return;
    }
    EventBus.emit('gm:open');
  }

  closePanel(): void {
    EventBus.emit('gm:close');
  }

  registerInstantClear(fn: () => string): void {
    this._instantClear = fn;
  }

  unregisterInstantClear(): void {
    this._instantClear = null;
  }

  skipWave(): string {
    if (!this.isEnabled) return 'GM 未激活';
    if (!this._instantClear) return '请进入战斗后使用';
    const result = this._instantClear();
    console.log(`[GM] 跳过本波 → ${result}`);
    return result;
  }

  unlockToStage(chapter: number, index: number): string {
    if (!this.isEnabled) return 'GM 未激活';
    const ch = Math.max(1, Math.min(CHAPTER_COUNT, Math.floor(chapter)));
    const idx = Math.max(1, Math.min(STAGES_PER_CHAPTER, Math.floor(index)));
    const stage = findStage(ch, idx);
    if (!stage) return `无效关卡 ${ch}-${idx}`;
    gmUnlockToStage(stage.id);
    EventBus.emit('home:refresh');
    Platform.showToast(`已解锁 ${stage.label}`, 'success');
    return `可打 ${stage.label} ${stage.name}（${stage.pitch}）`;
  }

  enterStage(chapter: number, index: number): string {
    const msg = this.unlockToStage(chapter, index);
    if (msg.startsWith('GM') || msg.startsWith('无效')) return msg;
    const ch = Math.max(1, Math.min(CHAPTER_COUNT, Math.floor(chapter)));
    const idx = Math.max(1, Math.min(STAGES_PER_CHAPTER, Math.floor(index)));
    const stage = findStage(ch, idx) ?? getStage(1);
    const mem = loadMemory();
    const squad = mem.squadIds.length === 3 ? mem.squadIds : [...DEFAULT_SQUAD];
    EventBus.emit('gm:close');
    SceneManager.switchTo('battle', { heroIds: [...squad], stageId: stage.id });
    return `${msg} → 已开战`;
  }

  private _saveState(): void {
    try {
      Platform.setStorageSync(GM_STORAGE_KEY, JSON.stringify({ enabled: this._enabled }));
    } catch { /* */ }
  }

  private _loadState(): void {
    if (!this._runtimeAllowed) {
      this._enabled = false;
      return;
    }
    try {
      const raw = Platform.getStorageSync(GM_STORAGE_KEY) || Platform.getStorageSync(GM_LEGACY_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { enabled?: boolean };
        this._enabled = !!parsed.enabled;
      }
    } catch { /* */ }
    if (!this._enabled) {
      this._enabled = true;
      this._saveState();
      console.log('[GM] 开发者工具环境，自动激活 GM');
    }
  }
}

export const GMManager = new GMManagerClass();
