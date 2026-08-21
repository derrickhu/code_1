/**
 * 关键音效。只播磁盘上真有的文件；没单独出的签名落到同类已有音。
 * 微信 InnerAudioContext 对不存在的路径会立刻 readFile 报错，所以不能先试再兜底。
 */
import { Platform } from '@/core/PlatformService';

const FILE: Readonly<Record<string, string>> = {
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
  atk_saw: 'audio/atk_saw.mp3',
  hit_saw: 'audio/hit_saw.mp3',
  atk_smash: 'audio/atk_smash.mp3',
  hit_smash: 'audio/hit_smash.mp3',
  atk_poke: 'audio/atk_poke.mp3',
  hit_poke: 'audio/hit_poke.mp3',
  atk_wind: 'audio/atk_wind.mp3',
  hit_wind: 'audio/hit_wind.mp3',
  atk_blast: 'audio/atk_blast.mp3',
  hit_blast: 'audio/hit_blast.mp3',
  atk_pierce: 'audio/atk_pierce.mp3',
  hit_pierce: 'audio/hit_pierce.mp3',
  atk_sniper: 'audio/atk_sniper.mp3',
  hit_sniper: 'audio/hit_sniper.mp3',
  kill_pop: 'audio/kill_pop.mp3',
  install_on: 'audio/install_on.mp3',
};

/** 没单独出文件的签名，直接用已有音，不发空路径 */
const ALIAS: Readonly<Record<string, string>> = {
  atk_slash: 'atk',
  hit_slash: 'hit',
  atk_bolt: 'atk',
  hit_bolt: 'hit',
  atk_orb: 'atk',
  hit_orb: 'hit',
  enemy_claw: 'hit',
  enemy_bash: 'hit_smash',
  enemy_spark: 'atk_pierce',
  enemy_beam: 'atk_pierce',
};

export type SfxName = keyof typeof FILE | keyof typeof ALIAS;

const lastAt = new Map<string, number>();
const dead = new Set<string>();

function resolveSrc(name: string): string | undefined {
  const key = FILE[name] ? name : ALIAS[name];
  if (!key || dead.has(key)) return undefined;
  return FILE[key];
}

export function playSfx(name: string, gapMs = 80): void {
  const src = resolveSrc(name);
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
    ctx.onError(() => {
      const key = FILE[name] ? name : ALIAS[name];
      if (key) dead.add(key);
      drop();
    });
  } catch {
    /* 开发者工具没文件时不炸 */
  }
}

export function buzz(kind: 'light' | 'medium' | 'heavy' = 'light'): void {
  Platform.vibrateShort(kind);
}
