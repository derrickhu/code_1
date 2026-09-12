import { describe, expect, it } from 'vitest';
import { VILLAGERS } from '@/balance/villagers';
import {
  PORTRAIT_BODY, barePlantY, packPortraitRow, portraitCardScale, portraitFit, portraitWidth,
} from '@/fx/portraitFit';

describe('portraitFit', () => {
  it('每个村民三阶都有身体高度', () => {
    for (const v of VILLAGERS) {
      const row = PORTRAIT_BODY[v.id];
      expect(row, v.id).toBeTruthy();
      for (const box of row) {
        expect(box.h, v.id).toBeGreaterThan(80);
        expect(box.w, v.id).toBeGreaterThan(60);
        expect(box.texH, v.id).toBeGreaterThan(box.h - 1);
        expect(box.padB, v.id).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('首页按身体定高，三婶和铁柱一样高', () => {
    const slot = 168;
    const sTex = PORTRAIT_BODY.sanshen[0].texH;
    const tTex = PORTRAIT_BODY.tiezhu[0].texH;
    const lTex = PORTRAIT_BODY.laoli[0].texH;
    const sanshen = portraitFit('sanshen', 1, sTex);
    const tiezhu = portraitFit('tiezhu', 1, tTex);
    const laoli = portraitFit('laoli', 1, lTex);
    expect(sanshen.bodyH).toBe(PORTRAIT_BODY.sanshen[0].h);
    expect(tiezhu.bodyH).toBe(PORTRAIT_BODY.tiezhu[0].h);
    expect(laoli.bodyH).toBe(PORTRAIT_BODY.laoli[0].h);
    expect((slot / sanshen.bodyH) * sanshen.bodyH).toBeCloseTo((slot / tiezhu.bodyH) * tiezhu.bodyH);
    expect((slot / laoli.bodyH) * laoli.bodyH).toBeCloseTo(slot);
  });

  it('底边有空时脚要落到路上', () => {
    const texH = PORTRAIT_BODY.erjiu[0].texH;
    const box = portraitFit('erjiu', 1, texH);
    const y = barePlantY(box.padB, 168, box.bodyH);
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(40);
  });

  it('贴图 2x 时按原图比例伸缩', () => {
    const texH = PORTRAIT_BODY.laoli[0].texH;
    const one = portraitFit('laoli', 1, texH);
    const two = portraitFit('laoli', 1, texH * 2);
    expect(two.bodyH).toBeCloseTo(one.bodyH * 2, 5);
    expect(two.padB).toBeCloseTo(one.padB * 2, 5);
  });

  it('图鉴三阶按身体定高，大锤一阶和二阶一样高', () => {
    const maxW = 188;
    const maxH = 220;
    const a = portraitCardScale('dachui', 1, PORTRAIT_BODY.dachui[0].texW, PORTRAIT_BODY.dachui[0].texH, maxW, maxH);
    const b = portraitCardScale('dachui', 2, PORTRAIT_BODY.dachui[1].texW, PORTRAIT_BODY.dachui[1].texH, maxW, maxH);
    const c = portraitCardScale('dachui', 3, PORTRAIT_BODY.dachui[2].texW, PORTRAIT_BODY.dachui[2].texH, maxW, maxH);
    const h1 = PORTRAIT_BODY.dachui[0].h * a.scale;
    const h2 = PORTRAIT_BODY.dachui[1].h * b.scale;
    const h3 = PORTRAIT_BODY.dachui[2].h * c.scale;
    expect(h1).toBeCloseTo(h2, 0);
    expect(h2).toBeCloseTo(h3, 0);
    expect(h1).toBeGreaterThan(200);
  });

  it('没在表里的人按整张图', () => {
    const box = portraitFit('nobody', 1, 400);
    expect(box.bodyH).toBe(400);
    expect(box.padB).toBe(0);
  });
});

describe('packPortraitRow', () => {
  it('村口五人按身宽让开，肩膀不再叠', () => {
    const slot = 168;
    const ids = ['tiezhu', 'dachui', 'laoyanqiang', 'erjiu', 'sanshen'] as const;
    const widths = ids.map((id) => portraitWidth(id, 1, slot));
    const xs = packPortraitRow(widths, 375);
    for (let i = 0; i < xs.length - 1; i += 1) {
      const need = widths[i]! / 2 + widths[i + 1]! / 2 + 12;
      expect(xs[i + 1]! - xs[i]!, `${ids[i]}-${ids[i + 1]}`).toBeGreaterThanOrEqual(need);
    }
    expect(xs[0]! - widths[0]! / 2).toBeGreaterThan(20);
    expect(xs[4]! + widths[4]! / 2).toBeLessThan(730);
  });

  it('路宽不够时整排仍落在路上', () => {
    const xs = packPortraitRow([200, 200, 200, 200, 200], 375, 500, 18);
    expect(xs[4]! - xs[0]!).toBeLessThanOrEqual(500);
    expect(Math.min(...xs)).toBeGreaterThan(375 - 260);
    expect(Math.max(...xs)).toBeLessThan(375 + 260);
  });

  it('一个人站中间', () => {
    expect(packPortraitRow([120], 375)).toEqual([375]);
    expect(packPortraitRow([], 375)).toEqual([]);
  });
});
