import { describe, expect, it } from 'vitest';
import { VisualVitals } from '@/fx/VisualVitals';

describe('画面血条跟弹着点', () => {
  it('出手先记账，落地才掉', () => {
    const v = new VisualVitals();
    v.seed('e:1', 360, 0);
    expect(v.shown('e:1', { hp: 100, extra: 0 }).hp).toBe(360);
    v.landEnemy('e:1', 80);
    expect(v.shown('e:1', { hp: 100, extra: 0 }).hp).toBe(280);
  });

  it('壳先吃，啃穿了才掉血', () => {
    const v = new VisualVitals();
    v.seed('e:2', 400, 50);
    v.landEnemy('e:2', 30);
    expect(v.shown('e:2', { hp: 0, extra: 0 })).toEqual({ hp: 400, extra: 20 });
    v.landEnemy('e:2', 40);
    expect(v.shown('e:2', { hp: 0, extra: 0 })).toEqual({ hp: 380, extra: 0 });
  });

  it('村民挨打：盾先吃，吸血等落地再加', () => {
    const v = new VisualVitals();
    v.seed('h:laoyanqiang', 200, 40);
    v.landHero('h:laoyanqiang', 25, 40);
    expect(v.shown('h:laoyanqiang', { hp: 0, extra: 0 })).toEqual({ hp: 175, extra: 0 });
    v.healHero('h:laoyanqiang', 10, 200);
    expect(v.shown('h:laoyanqiang', { hp: 0, extra: 0 }).hp).toBe(185);
  });

  it('没种过的用引擎现血，不把条画飞', () => {
    const v = new VisualVitals();
    expect(v.shown('e:9', { hp: 12, extra: 3 })).toEqual({ hp: 12, extra: 3 });
  });
});
