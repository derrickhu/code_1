/**
 * 关键音效。文件或 API 没有就静默，不挡玩。
 */
import { Platform } from '@/core/PlatformService';

const SRC: Readonly<Record<string, string>> = {
  ui_tap: 'audio/ui_tap.mp3',
  hero_land: 'audio/hero_land.mp3',
  atk: 'audio/atk.mp3',
  hit: 'audio/hit.mp3',
  hit_counter: 'audio/hit_counter.mp3',
  skill: 'audio/skill.mp3',
  enemy_down: 'audio/enemy_down.mp3',
  leak: 'audio/leak.mp3',
  win: 'audio/win.mp3',
  lose: 'audio/lose.mp3',
};

const lastAt = new Map<string, number>();

export function playSfx(name: keyof typeof SRC, gapMs = 80): void {
  const src = SRC[name];
  if (!src) return;
  const now = Date.now();
  if ((lastAt.get(name) ?? 0) + gapMs > now) return;
  lastAt.set(name, now);
  try {
    const ctx = Platform.createInnerAudioContext();
    if (!ctx) return;
    ctx.src = src;
    ctx.volume = 0.7;
    ctx.play();
    const drop = (): void => {
      try { ctx.destroy(); } catch { /* */ }
    };
    ctx.onEnded(drop);
    ctx.onError(drop);
  } catch {
    /* 开发者工具没文件时不炸 */
  }
}
