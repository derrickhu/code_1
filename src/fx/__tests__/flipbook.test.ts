import { describe, expect, it } from 'vitest';
import { VFX_FLIP, flipFiles, flipFrameIndex, flipLife, vfxHasFlip } from '@/fx/Flipbook';
import { attackLook } from '@/fx/FxRecipe';

describe('落点序列帧', () => {
  it('挥砍砸爆电都有表，格数对得上', () => {
    for (const name of ['slash', 'smash', 'blast', 'bolt'] as const) {
      expect(vfxHasFlip(name)).toBe(true);
      const spec = VFX_FLIP[name];
      expect(spec.cols * spec.rows).toBe(8);
      expect(spec.fps).toBeGreaterThanOrEqual(18);
    }
  });

  it('按时间切帧，不会越界，第一帧是接触', () => {
    expect(flipFrameIndex(0, 22, 8)).toBe(0);
    expect(flipFrameIndex(1 / 22, 22, 8)).toBe(1);
    expect(flipFrameIndex(10, 22, 8)).toBe(7);
    expect(flipFrameIndex(-0.1, 22, 8)).toBe(0);
  });

  it('寿命够播完最后一帧', () => {
    expect(flipLife(8, 22)).toBeGreaterThan(7 / 22);
  });

  it('配方落点名对得上序列，不会再用一张 slash 冒充电', () => {
    expect(attackLook('slash').plates[0]?.name).toBe('slash');
    expect(attackLook('smash').plates[0]?.name).toBe('smash');
    expect(attackLook('blast').plates[0]?.name).toBe('blast');
    expect(attackLook('bolt').plates[0]?.name).toBe('bolt');
    expect(attackLook('pierce').plates[0]?.name).toBe('pierce');
  });

  it('进战斗要预载的表文件不漏', () => {
    const files = flipFiles();
    expect(files).toContain('images/vfx_fb_slash.png');
    expect(files).toContain('images/vfx_fb_smash.png');
    expect(files).toContain('images/vfx_fb_blast.png');
    expect(files).toContain('images/vfx_fb_bolt.png');
    expect(files).toContain('images/vfx_fb_spark.png');
  });
});
