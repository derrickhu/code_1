import { describe, expect, it } from 'vitest';
import { placeHero } from '@/balance/heroes';

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
});
