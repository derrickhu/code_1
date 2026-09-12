import { describe, expect, it } from 'vitest';
import {
  HOME_ART_PACK_ROOT,
  HOME_PACK_ROOT,
  homePackPath,
  isHomePackPath,
  isHomeUiName,
  unpackHomePackPath,
} from '@/config/HomePack';
import { subpackageForPath } from '@/config/Subpackages';
import { VILLAGE_BG, VILLAGE_HOME_BG, uiPath } from '@/core/TextureLoader';

describe('村口分包路径', () => {
  it('底图和普通壳进 pkg-home，大门两张大图进 pkg-home-art', () => {
    expect(VILLAGE_BG.startsWith(`${HOME_PACK_ROOT}/`)).toBe(true);
    expect(VILLAGE_HOME_BG.startsWith(`${HOME_PACK_ROOT}/`)).toBe(true);
    expect(uiPath('top_lintel')).toBe(`${HOME_PACK_ROOT}/images/ui/top_lintel.png`);
    expect(uiPath('rust_atlas')).toBe(`${HOME_ART_PACK_ROOT}/images/ui/rust_atlas.png`);
    expect(uiPath('rust_gate')).toBe(`${HOME_ART_PACK_ROOT}/images/ui/rust_gate.png`);
    expect(uiPath('settle_stamp')).toBe('images/ui/settle_stamp.png');
    expect(isHomeUiName('top_lintel')).toBe(true);
    expect(isHomeUiName('settle_stamp')).toBe(false);
  });

  it('浏览器剥回 assets 路径，分包反查对得上', () => {
    expect(unpackHomePackPath(uiPath('rust_gate'))).toBe('images/ui/rust_gate.png');
    expect(homePackPath('images/bg/village.jpg')).toBe(VILLAGE_BG);
    expect(isHomePackPath(VILLAGE_HOME_BG)).toBe(true);
    expect(subpackageForPath(uiPath('top_lintel'))).toBe('home');
    expect(subpackageForPath(uiPath('rust_atlas'))).toBe('homeArt');
    expect(subpackageForPath('images/hero/dachui.png')).toBeNull();
  });
});
