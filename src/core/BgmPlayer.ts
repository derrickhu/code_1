/**
 * 局外 / 局内背景乐。一首 InnerAudioContext，切曲才重建。
 * 音量压过音效：BGM 常驻，抬太高会盖掉点击和打击。
 */
import { Platform } from '@/core/PlatformService';

export const BGM_FILE = {
  home: 'audio/bgm_village.mp3',
  village: 'audio/bgm_village.mp3',
  battle: 'audio/bgm_battle.mp3',
  battle_hot: 'audio/bgm_battle_hot.mp3',
} as const;

/** 局内再压一档，给打击音让路 */
const VOLUME: Readonly<Record<BgmId, number>> = {
  home: 0.32,
  village: 0.32,
  battle: 0.22,
  battle_hot: 0.24,
};

export type BgmId = keyof typeof BGM_FILE;

class BgmPlayerClass {
  private _ctx: WechatMinigame.InnerAudioContext | null = null;
  private _id: BgmId | null = null;
  private _volume = 0.32;
  private _paused = false;

  play(id: BgmId): void {
    const src = BGM_FILE[id];
    if (!src) return;
    if (this._id === id && this._ctx) {
      if (this._paused) {
        try { this._ctx.play(); } catch { /* */ }
        this._paused = false;
      }
      return;
    }
    this.stop();
    const ctx = Platform.createInnerAudioContext();
    if (!ctx) return;
    this._ctx = ctx;
    this._id = id;
    this._paused = false;
    ctx.loop = true;
    ctx.volume = VOLUME[id] ?? this._volume;
    ctx.src = src;
    ctx.onError((err) => {
      console.warn('[Bgm] 播失败', id, err);
      this.stop();
    });
    try { ctx.play(); } catch { /* 开发者工具没手势时不炸 */ }
  }

  pause(): void {
    if (!this._ctx || this._paused) return;
    try { this._ctx.pause(); } catch { /* */ }
    this._paused = true;
  }

  resume(): void {
    if (!this._ctx || !this._paused) return;
    try { this._ctx.play(); } catch { /* */ }
    this._paused = false;
  }

  stop(): void {
    if (!this._ctx) {
      this._id = null;
      this._paused = false;
      return;
    }
    try { this._ctx.stop(); } catch { /* */ }
    try { this._ctx.destroy(); } catch { /* */ }
    this._ctx = null;
    this._id = null;
    this._paused = false;
  }
}

export const BgmPlayer = new BgmPlayerClass();
