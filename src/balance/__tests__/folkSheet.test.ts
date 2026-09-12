import { describe, expect, it } from 'vitest';

import { FOLK_SIGN, FOLK_USE, folkSheet, folkSignName, folkIdentPeak } from '@/balance/folkSheet';
import { VILLAGERS, getVillager } from '@/balance/villagers';
import { oneFolkLay } from '@/ui/FolkSheetView';

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
    const uncle = folkSheet(getVillager('laoyanqiang'), { craft: 3, stars: 0, stage: 2 });
    expect(uncle.sign.name).toBe('连珠');
    expect(uncle.sign.kindName).toBe('');
    expect(uncle.stats.map((s) => s.label)).toEqual(['下手', '抗造', '够得着', '出手']);
    expect(uncle.stats[0]!.text).toMatch(/^\d+$/);
    expect(uncle.stats[2]!.text).toBe('4格');
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

  it('三阶弹弓叔才盖穿透章，条不跟手艺一起涨', () => {
    const low = folkSheet(getVillager('laoyanqiang'), { craft: 1, stars: 0, stage: 1 });
    const high = folkSheet(getVillager('laoyanqiang'), { craft: 6, stars: 2, villageMul: 1.2, stage: 3 });
    expect(high.sign.kindName).toBe('穿透');
    expect(Number(high.stats[0]!.text)).toBeGreaterThan(Number(low.stats[0]!.text));
    expect(high.stats[0]!.ratio).toBeCloseTo(low.stats[0]!.ratio, 5);
    expect(high.stats[2]!.ratio).toBeCloseTo(low.stats[2]!.ratio, 5);
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

  it('名牌在上，立绘在中，能力表竖着压在脚下', () => {
    const lay = oneFolkLay(422, 1334, 34);
    expect(lay.plateH).toBeLessThan(90);
    expect(lay.cardTop).toBeGreaterThan(lay.plateTop + lay.plateH);
    expect(lay.sheetTop).toBeGreaterThan(lay.cardTop + lay.cardH);
    expect(lay.sheetTop + lay.sheetH).toBeLessThan(lay.btnY);
    expect(lay.sheetH).toBeGreaterThan(200);
    expect(lay.sheetH).toBeLessThan(300);
  });
});
