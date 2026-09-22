import { describe, expect, it } from 'vitest';

import {
  addVillageExp, emptyProgress, nextVillageCost, villageBar, villageCumExp,
  villageNeedHint, VILLAGE_LV_MAX,
} from '@/balance/village';

describe('村子经验条', () => {
  it('villageExp 是本级剩余，不能再减累计', () => {
    const need = nextVillageCost(6)!;
    expect(need).toBe(150);
    expect(villageCumExp(6)).toBe(633);

    const bar = villageBar(6, 64);
    expect(bar.into).toBe(64);
    expect(bar.left).toBe(86);
    expect(bar.ratio).toBeCloseTo(64 / 150);
    expect(bar.maxed).toBe(false);

    // 旧门楣：into = 64 - 633，再 719 点，金条永远是空的
    const oldLeft = need - (64 - villageCumExp(6));
    expect(oldLeft).toBe(719);
    expect(bar.left).not.toBe(oldLeft);
  });

  it('6 级下一档加人，说还能多带谁，不说空点', () => {
    expect(villageNeedHint(6, 64)).toBe('还差 86 经验，出村能多带一个人');
    expect(villageNeedHint(5, 0)).toBe(`还差 ${nextVillageCost(5)} 经验，全员再硬一截`);
    expect(villageNeedHint(VILLAGE_LV_MAX, 0)).toBe('村子满级了');
  });

  it('摊上灌经验，条跟着本级走，够了就连升', () => {
    const base = emptyProgress([]);
    const mid = addVillageExp(base, 40);
    expect(mid.lv).toBe(1);
    expect(villageBar(mid.lv, mid.exp).into).toBe(40);
    expect(villageBar(mid.lv, mid.exp).left).toBe((nextVillageCost(1) ?? 0) - 40);

    const over = addVillageExp({ ...base, villageLv: mid.lv, villageExp: mid.exp }, 80);
    expect(over.lv).toBe(2);
    expect(over.gained).toBe(1);
    const stepped = villageBar(over.lv, over.exp);
    expect(stepped.into).toBe(40 + 80 - (nextVillageCost(1) ?? 0));
    expect(stepped.left).toBe((nextVillageCost(2) ?? 0) - stepped.into);
  });
});
