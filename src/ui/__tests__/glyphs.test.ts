import { describe, expect, it } from 'vitest';

import { numGlyphs } from '@/ui/glyphs';

describe('漆字数字', () => {
  it('拆成 paint_0 到 paint_9', () => {
    expect(numGlyphs(0)).toEqual(['paint_0']);
    expect(numGlyphs(13)).toEqual(['paint_1', 'paint_3']);
    expect(numGlyphs(-2)).toEqual(['paint_0']);
  });
});
