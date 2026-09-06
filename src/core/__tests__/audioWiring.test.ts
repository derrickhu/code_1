import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BGM_FILE } from '@/core/BgmPlayer';
import { SFX_ALIAS, SFX_FILE } from '@/core/SfxPlayer';
import { ATTACK_FX, ENEMY_FX } from '@/fx/FxRecipe';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function onDisk(src: string): boolean {
  return existsSync(join(root, 'assets', src));
}

describe('音频接线', () => {
  it('村子 BGM 的 home / village 都指向同一首', () => {
    expect(BGM_FILE.home).toBe('audio/bgm_village.mp3');
    expect(BGM_FILE.village).toBe('audio/bgm_village.mp3');
    expect(onDisk(BGM_FILE.home)).toBe(true);
    expect(onDisk(BGM_FILE.battle)).toBe(true);
    expect(onDisk(BGM_FILE.battle_hot)).toBe(true);
  });

  it('音效表和别名落点都有文件', () => {
    for (const [name, src] of Object.entries(SFX_FILE)) {
      expect(onDisk(src), name).toBe(true);
    }
    for (const [name, key] of Object.entries(SFX_ALIAS)) {
      expect(SFX_FILE[key], `${name} → ${key}`).toBeDefined();
    }
  });

  it('出手和挨打的签名都有独立音', () => {
    for (const fx of ATTACK_FX) {
      expect(SFX_FILE[`atk_${fx}`], `atk_${fx}`).toBeDefined();
      expect(SFX_FILE[`hit_${fx}`], `hit_${fx}`).toBeDefined();
    }
    for (const fx of ENEMY_FX) {
      const key = SFX_FILE[`enemy_${fx}`] ? `enemy_${fx}` : SFX_ALIAS[`enemy_${fx}`];
      expect(key, `enemy_${fx}`).toBeDefined();
    }
    expect(SFX_ALIAS.wave_in).toBe('install_on');
  });
});
