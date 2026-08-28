/**
 * 关键音效。只播磁盘上真有的文件；没单独出的签名落到同类已有音。
 * 微信 InnerAudioContext 对不存在的路径会立刻 readFile 报错，所以不能先试再兜底。
 * UI 点击走预建池：每次 new + destroy 会卡二三十毫秒，听起来像按钮没反应。
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
  enemy_beam: 'audio/enemy_beam.mp3',
  enemy_spark: 'audio/enemy_spark.mp3',
  hero_down: 'audio/hero_down.mp3',
  atk_slash: 'audio/atk_slash.mp3',
  hit_slash: 'audio/hit_slash.mp3',
  atk_bolt: 'audio/atk_bolt.mp3',
  hit_bolt: 'audio/hit_bolt.mp3',
  atk_orb: 'audio/atk_orb.mp3',
  hit_orb: 'audio/hit_orb.mp3',
  enemy_claw: 'audio/enemy_claw.mp3',
};

/** 没单独出文件的签名，直接用已有音，不发空路径 */
const ALIAS: Readonly<Record<string, string>> = {
  enemy_bash: 'hit_smash',
};

export type SfxName = keyof typeof FILE | keyof typeof ALIAS;

const lastAt = new Map<string, number>();
const dead = new Set<string>();
const pool = new Map<string, WechatMinigame.InnerAudioContext[]>();
const poolAt = new Map<string, number>();

const POOL_SIZE: Readonly<Record<string, number>> = {
  ui_tap: 2,
};

function resolveKey(name: string): string | undefined {
  const key = FILE[name] ? name : ALIAS[name];
  if (!key || dead.has(key)) return undefined;
  return key;
}

function resolveSrc(name: string): string | undefined {
  const key = resolveKey(name);
  return key ? FILE[key] : undefined;
}

function makeCtx(src: string): WechatMinigame.InnerAudioContext | null {
  const ctx = Platform.createInnerAudioContext();
  if (!ctx) return null;
  ctx.src = src;
  ctx.volume = 1;
  return ctx;
}

function ensurePool(key: string, src: string): WechatMinigame.InnerAudioContext[] {
  let list = pool.get(key);
  if (list) return list;
  list = [];
  const n = POOL_SIZE[key] ?? 1;
  for (let i = 0; i < n; i += 1) {
    const ctx = makeCtx(src);
    if (ctx) list.push(ctx);
  }
  pool.set(key, list);
  poolAt.set(key, 0);
  return list;
}

function playPooled(key: string, src: string): void {
  const list = ensurePool(key, src);
  if (!list.length) return;
  const i = poolAt.get(key) ?? 0;
  poolAt.set(key, (i + 1) % list.length);
  const ctx = list[i]!;
  ctx.volume = 1;
  try { ctx.seek(0); } catch { /* */ }
  try { ctx.play(); } catch { /* 开发者工具没手势时不炸 */ }
}

export function warmSfx(names: readonly string[] = ['ui_tap']): void {
  for (const name of names) {
    const key = resolveKey(name);
    const src = key ? FILE[key] : undefined;
    if (key && src) ensurePool(key, src);
  }
}

export function playSfx(name: string, gapMs = 80): void {
  const key = resolveKey(name);
  const src = key ? FILE[key] : undefined;
  if (!key || !src) return;
  const now = Date.now();
  if ((lastAt.get(key) ?? 0) + gapMs > now) return;
  lastAt.set(key, now);
  if (POOL_SIZE[key]) {
    playPooled(key, src);
    return;
  }
  try {
    const ctx = makeCtx(src);
    if (!ctx) return;
    ctx.play();
    const drop = (): void => {
      try { ctx.destroy(); } catch { /* */ }
    };
    ctx.onEnded(drop);
    ctx.onError(() => {
      dead.add(key);
      drop();
    });
  } catch {
    /* 开发者工具没文件时不炸 */
  }
}

export function buzz(kind: 'light' | 'medium' | 'heavy' = 'light'): void {
  Platform.vibrateShort(kind);
}
