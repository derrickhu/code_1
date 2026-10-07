import { describe, expect, it } from 'vitest';

import {
  FOLK_SIGN, FOLK_USE, folkIdentPeak, folkLivePeak, folkSheet, folkSignName,
} from '@/balance/folkSheet';
import { STAR_STEP, VILLAGERS, getVillager, statsOf } from '@/balance/villagers';
import { folkSheetContentH, oneFolkLay } from '@/ui/FolkSheetView';

describe('村民能力表', () => {
  it('二十人各有两字招牌，不重名', () => {
    const names = VILLAGERS.map((v) => folkSignName(v.id));
    expect(names).toHaveLength(20);
    expect(new Set(names).size).toBe(20);
    for (const v of VILLAGERS) {
      expect(FOLK_SIGN[v.id]).toBeTruthy();
      expect(FOLK_SIGN[v.id]!.length).toBeGreaterThanOrEqual(2);
      expect(FOLK_SIGN[v.id]!.length).toBeLessThanOrEqual(2);
      expect(FOLK_USE[v.id]!.length).toBeGreaterThan(12);
    }
  });

  it('四条都是战斗里的数，奶显示修补', () => {
    const uncle = folkSheet(getVillager('laoyanqiang'), { craft: 3, stars: 0, stage: 1 });
    expect(uncle.sign.name).toBe('连珠');
    expect(uncle.sign.kindName).toBe('');
    expect(uncle.stats.map((s) => s.label)).toEqual(['下手', '抗造', '够得着', '出手']);
    expect(uncle.stats[0]!.text).toMatch(/^\d+$/);
    expect(uncle.stats[2]!.text).toBe(`${statsOf(getVillager('laoyanqiang')).range}格`);
    expect(uncle.stats[3]!.text).toMatch(/秒$/);

    const heal = folkSheet(getVillager('erjiu'), { craft: 1, stars: 0, stage: 1 });
    expect(heal.stats[0]!.label).toBe('修补');
    expect(heal.sign.name).toBe('焊修');
  });

  it('招牌要写清上场干什么，不只甩两个字', () => {
    const grind = folkSheet(getVillager('miankuzhang'), { craft: 3, stars: 0, stage: 2 });
    expect(grind.sign.name).toBe('磨人');
    expect(grind.sign.use).toContain('贴脸');
    expect(grind.sign.use).toContain('抗造');
    expect(grind.sign.kindLine).toContain('吃回自己身上');
    expect(grind.sign.kindName).toBe('回血砍');
  });

  it('三阶弹弓叔才盖穿透章，练过的那一截要在条上看得见', () => {
    const peak = folkLivePeak([
      { def: getVillager('laoyanqiang'), craft: 6, stars: 2, villageMul: 1.2 },
      { def: getVillager('tiezhu'), craft: 6, stars: 2, villageMul: 1.2 },
    ]);
    const low = folkSheet(getVillager('laoyanqiang'), { craft: 1, stars: 0, stage: 1, peak });
    const high = folkSheet(getVillager('laoyanqiang'), {
      craft: 6, stars: 2, villageMul: 1.2, stage: 3, peak,
    });
    expect(high.sign.kindName).toBe('穿透');
    expect(Number(high.stats[0]!.text)).toBeGreaterThan(Number(low.stats[0]!.text));
    // 下手吃成长：条要跟着长，天生那一段不动
    expect(high.stats[0]!.ratio).toBeGreaterThan(low.stats[0]!.ratio);
    expect(high.stats[0]!.identRatio).toBeCloseTo(low.stats[0]!.identRatio, 5);
    expect(high.stats[0]!.ratio).toBeGreaterThan(high.stats[0]!.identRatio);
    // 够得着不吃成长：两段必须一样长，不许拿亮色糊出个「练过了」
    expect(high.stats[2]!.ratio).toBeCloseTo(high.stats[2]!.identRatio, 5);
    expect(high.stats[3]!.ratio).toBeCloseTo(high.stats[3]!.identRatio, 5);
  });

  it('喂下一档要先给出升完的数，且只有下手抗造会变', () => {
    const now = folkSheet(getVillager('tiezhu'), {
      craft: 5, stars: 2, villageMul: 1.2, stage: 2,
      next: { craft: 6, stage: 3 },
    });
    const hit = now.stats.find((s) => s.key === 'hit')!;
    const hide = now.stats.find((s) => s.key === 'hide')!;
    expect(Number(hit.next)).toBeGreaterThan(Number(hit.text));
    expect(Number(hide.next)).toBeGreaterThan(Number(hide.text));
    expect(now.stats.find((s) => s.key === 'reach')!.next).toBeUndefined();
    expect(now.stats.find((s) => s.key === 'tempo')!.next).toBeUndefined();

    const flat = folkSheet(getVillager('tiezhu'), { craft: 5, stars: 2, stage: 2 });
    expect(flat.stats.every((s) => s.next === undefined)).toBe(true);
  });

  it('来源那一行要把三层乘数摊开，别烤成一个数', () => {
    const sheet = folkSheet(getVillager('tiezhu'), { craft: 6, stars: 2, villageMul: 1.2, stage: 3 });
    const star = 1 + 2 * STAR_STEP;
    expect(sheet.grow.craft).toBeCloseTo(2.4, 5);
    expect(sheet.grow.star).toBeCloseTo(star, 5);
    expect(sheet.grow.village).toBeCloseTo(1.2, 5);
    expect(sheet.grow.total).toBeCloseTo(2.4 * star * 1.2, 5);
    expect(sheet.grow.text).toContain('下手·抗造');
    expect(sheet.grow.text).toContain('手艺2.40');
    expect(sheet.grow.text).toContain(`星${star.toFixed(2)}`);
    expect(sheet.grow.text).toContain('村子1.20');
  });

  it('下手重出手更慢，挨得住抗造更长', () => {
    const saw = folkSheet(getVillager('dianju'), { craft: 1, stars: 0, stage: 1 });
    const rage = folkSheet(getVillager('laoli'), { craft: 1, stars: 0, stage: 1 });
    const tank = folkSheet(getVillager('tiezhu'), { craft: 1, stars: 0, stage: 1 });
    const sniper = folkSheet(getVillager('laoyanqiang'), { craft: 1, stars: 0, stage: 1 });
    expect(saw.stats.find((s) => s.key === 'tempo')!.ratio)
      .toBeLessThan(rage.stats.find((s) => s.key === 'tempo')!.ratio);
    expect(tank.stats.find((s) => s.key === 'hide')!.ratio)
      .toBeGreaterThan(sniper.stats.find((s) => s.key === 'hide')!.ratio);
    expect(sniper.stats.find((s) => s.key === 'reach')!.ratio)
      .toBeGreaterThan(tank.stats.find((s) => s.key === 'reach')!.ratio);
    const peak = folkIdentPeak();
    expect(peak.reach).toBeGreaterThanOrEqual(4);
  });

  it('人卡、养成卡、黄按钮三块，属性列在养成卡里', () => {
    const lay = oneFolkLay(422, 1334, 34);
    expect(lay.growTop).toBeGreaterThan(lay.heroTop + lay.heroH);
    expect(lay.growTop - (lay.heroTop + lay.heroH)).toBeLessThanOrEqual(16);
    expect(lay.growTop + lay.growH).toBeLessThan(lay.btnY - lay.btnH / 2);
    expect((lay.btnY - lay.btnH / 2) - (lay.growTop + lay.growH)).toBeLessThanOrEqual(16);
    expect(lay.heroH).toBeGreaterThanOrEqual(176);
    expect(lay.btnH).toBeGreaterThanOrEqual(96);
    expect(lay.heroW).toBe(lay.plateW);
    expect(lay.backW).toBeGreaterThanOrEqual(150);
    expect(lay.btnW).toBeGreaterThan(lay.backW);
    expect(lay.backCx + lay.backW / 2).toBeLessThan(lay.btnCx - lay.btnW / 2);
    expect(lay.backW + lay.btnW).toBeLessThanOrEqual(lay.plateW);
    expect(folkSheetContentH() + 20).toBeLessThanOrEqual(lay.growH);
    expect(lay.growH).toBeGreaterThan(lay.heroH * 0.7);
    expect(folkSheetContentH()).toBe(44 + 42 + 26 * 4);
    expect(lay.costH).toBe(0);
  });

  it('有下一档时，材料条夹在养成卡和黄按钮中间', () => {
    const lay = oneFolkLay(422, 1334, 34, 188);
    expect(lay.costH).toBe(188);
    expect(lay.growTop + lay.growH).toBeLessThanOrEqual(lay.costTop);
    expect(lay.costTop + lay.costH).toBeLessThan(lay.btnY - lay.btnH / 2);
    expect(lay.btnH).toBeGreaterThanOrEqual(96);
    expect(lay.growH).toBeGreaterThanOrEqual(folkSheetContentH());
    expect(lay.costW).toBe(lay.plateW);
  });
});
