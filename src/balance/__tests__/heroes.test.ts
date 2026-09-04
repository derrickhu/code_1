import { describe, expect, it } from 'vitest';
import { HEROES, placeHero, swapSquad } from '@/balance/heroes';
import { MODS } from '@/balance/mods';

const SMOKE_DRINK = /烟|酒|醉|香烟|旱烟|抽烟|喝酒/;

describe('备案：对外文案不含烟酒', () => {
  it('村民名字、技能、介绍都不带烟酒', () => {
    for (const h of HEROES) {
      const blob = [h.name, h.skillName, h.skillDesc, h.flavor, h.eats].join(' ');
      expect(blob, h.id).not.toMatch(SMOKE_DRINK);
    }
  });

  it('破烂名字和说明也不带烟酒', () => {
    for (const m of MODS) {
      const blob = [m.name, m.desc, m.becomes].join(' ');
      expect(blob, m.id).not.toMatch(SMOKE_DRINK);
    }
  });
});

describe('叫人换位子', () => {
  it('没满就补进去', () => {
    expect(placeHero(['tiezhu'], 'dachui', 0, 3)).toEqual({
      squad: ['tiezhu', 'dachui'],
      focus: 1,
    });
  });

  it('点已在队里的人，只是改高亮槽', () => {
    expect(placeHero(['tiezhu', 'dachui', 'laoyanqiang'], 'dachui', 0, 3)).toEqual({
      squad: ['tiezhu', 'dachui', 'laoyanqiang'],
      focus: 1,
    });
  });

  it('满员再点新人，换进高亮那个位子', () => {
    expect(placeHero(['tiezhu', 'dachui', 'laoyanqiang'], 'erjiu', 0, 3)).toEqual({
      squad: ['erjiu', 'dachui', 'laoyanqiang'],
      focus: 0,
    });
    expect(placeHero(['tiezhu', 'dachui', 'laoyanqiang'], 'sanshen', 2, 3)).toEqual({
      squad: ['tiezhu', 'dachui', 'sanshen'],
      focus: 2,
    });
  });

  it('点两个人对调位子', () => {
    expect(swapSquad(['sanshen', 'dachui', 'laoyanqiang'], 0, 1)).toEqual([
      'dachui',
      'sanshen',
      'laoyanqiang',
    ]);
    expect(swapSquad(['sanshen', 'dachui', 'laoyanqiang'], 0, 0)).toEqual([
      'sanshen',
      'dachui',
      'laoyanqiang',
    ]);
  });
});
