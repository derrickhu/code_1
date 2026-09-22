/**
 * GM 调试。只在微信/抖音开发者工具里开；真机一律关掉。
 * 工具里自动激活。村子标题牌连点 5 次也能开。
 */
import { scopedStorageKey } from '@/config/gameKeyScope';
import { EventBus } from '@/core/EventBus';
import { Platform } from '@/core/PlatformService';
import { RoadLayoutStore } from '@/core/roadLayoutStore';
import { SceneManager } from '@/core/SceneManager';
import { CHAPTER_COUNT, findStage, getStage } from '@/balance/stages';
import { nextVillageCost } from '@/balance/village';
import { gmGrant, gmUnlockToStage, loadMemory } from '@/core/RunMemory';

export type GmGrantKind = 'credits' | 'scrap' | 'parts' | 'pellets' | 'villageExp';

const GRANT_NAME: Record<GmGrantKind, string> = {
  credits: '工分',
  scrap: '废铁',
  parts: '零件',
  pellets: '弹子',
  villageExp: '村庄经验',
};

const GM_STORAGE_KEY = scopedStorageKey('gm');
const GM_LEGACY_KEY = 'code1_gm';

class GMManagerClass {
  private _enabled = false;
  private readonly _runtimeAllowed: boolean;
  private _tapCount = 0;
  private _lastTapTime = 0;
  private _instantClear: (() => string) | null = null;
  private _roadEdit = false;

  get isRuntimeAllowed(): boolean {
    return this._runtimeAllowed;
  }

  get isEnabled(): boolean {
    return this._runtimeAllowed && this._enabled;
  }

  get roadEditMode(): boolean {
    return this.isEnabled && this._roadEdit;
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

  grantPellets(n: number): string {
    return this.grant('pellets', n);
  }

  grant(kind: GmGrantKind, n: number): string {
    if (!this.isEnabled) return 'GM 未激活';
    const add = Math.max(0, Math.floor(n));
    if (add <= 0) return '无效数量';
    const mem = gmGrant({ [kind]: add });
    EventBus.emit('home:refresh');
    const have = kind === 'villageExp'
      ? `村子 ${mem.villageLv} 级 · 经验 ${mem.villageExp}`
      : String(mem[kind]);
    const msg = `${GRANT_NAME[kind]} +${add} · 现有 ${have}`;
    Platform.showToast(msg, 'success');
    return msg;
  }

  /** 刚好够升 1 级。满级就停。 */
  grantVillageLevel(): string {
    if (!this.isEnabled) return 'GM 未激活';
    const mem = loadMemory();
    const need = nextVillageCost(mem.villageLv);
    if (need === undefined) return '村子已经满级';
    return this.grant('villageExp', Math.max(1, need - mem.villageExp));
  }

  unlockToStage(chapter: number, index: number): string {
    if (!this.isEnabled) return 'GM 未激活';
    const ch = Math.max(1, Math.min(CHAPTER_COUNT, Math.floor(chapter)));
    const idx = Math.max(1, Math.min(5, Math.floor(index)));
    const stage = findStage(ch, idx);
    if (!stage) return `无效关卡 ${ch}-${idx}`;
    gmUnlockToStage(stage.id);
    EventBus.emit('home:refresh');
    Platform.showToast(`已解锁 ${stage.label}`, 'success');
    return `可打 ${stage.label} ${stage.name}（${stage.pitch}）`;
  }

  setRoadEdit(on: boolean): void {
    this._roadEdit = !!on && this.isEnabled;
    EventBus.emit('gm:roadEditToggle', this._roadEdit);
  }

  toggleRoadEdit(): string {
    if (!this.isEnabled) return 'GM 未激活';
    this._roadEdit = !this._roadEdit;
    EventBus.emit('gm:close');
    EventBus.emit('gm:roadEditToggle', this._roadEdit);
    if (this._roadEdit && SceneManager.current?.name !== 'road') {
      SceneManager.switchTo('road');
    }
    const msg = this._roadEdit
      ? '已进入墩子编辑：拖到土坑上，再点打印坐标'
      : '已退出墩子编辑';
    Platform.showToast(msg, 'success');
    return msg;
  }

  printRoadLayout(): string {
    if (!this.isEnabled) return 'GM 未激活';
    const report = RoadLayoutStore.exportReport();
    console.warn('[GM] 路上墩子坐标\n', report);
    Platform.showToast('坐标已打到控制台', 'success');
    return '已导出到控制台，把 ROAD_PATH 那段发给我';
  }

  enterStage(chapter: number, index: number): string {
    const msg = this.unlockToStage(chapter, index);
    if (msg.startsWith('GM') || msg.startsWith('无效')) return msg;
    const ch = Math.max(1, Math.min(CHAPTER_COUNT, Math.floor(chapter)));
    const idx = Math.max(1, Math.min(5, Math.floor(index)));
    const stage = findStage(ch, idx) ?? getStage(1);
    EventBus.emit('gm:close');
    // 上场名单由战斗场景自己从存档读（村民名单 + 村庄等级决定上几个），
    // GM 只负责挑关。上一版在这儿传 squadIds，改成收集制之后没有「固定三人」了
    SceneManager.switchTo('battle', { stageId: stage.id });
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
