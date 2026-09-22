import { describe, expect, it } from 'vitest';
import {
  CRAFT_MAX, EVO_STAR_GATE, craftCap, craftOf, emptyProgress, evoFromStars, evoOf,
  nextCapStars, nextEvoStars, nextFeed, starOpenedEvo,
} from '@/balance/village';
import { EVO_MAX, STAR_MAX, STAR_STEP } from '@/balance/villagers';

/**
 * 星 × 手艺的耦合。
 *
 * 这一组钉的是**机制的形状**，不是数值：一颗星解开一段手艺、没有白档。
 * 上一版 10 星那张表里 ★4 一档都不解（8→8），玩家喊到星却发现还是喂不动，
 * 于是「星管上限」这条规则在他嘴里说不出来。数可以再调，形状不许再塌回去。
 */
describe('星管手艺上限', () => {
  it('星是 5 颗，满星正好焊满手艺', () => {
    expect(STAR_MAX).toBe(5);
    expect(craftCap(STAR_MAX)).toBe(CRAFT_MAX);
    // 越界要夹住，不能读出 undefined 当上限
    expect(craftCap(STAR_MAX + 3)).toBe(CRAFT_MAX);
    expect(craftCap(-1)).toBe(craftCap(0));
  });

  it('每一颗星都解开一段手艺，没有白档', () => {
    for (let s = 1; s <= STAR_MAX; s += 1) {
      expect(craftCap(s), `★${s} 一档都没解开`).toBeGreaterThan(craftCap(s - 1));
    }
  });

  it('所以详情页永远只说「再来一颗」', () => {
    for (let s = 0; s < STAR_MAX; s += 1) {
      const gate = nextCapStars(s)!;
      expect(gate, `★${s} 查不到下一格上限`).toBeDefined();
      expect(gate.need).toBe(1);
      expect(gate.stars).toBe(s + 1);
      expect(gate.cap).toBe(craftCap(s + 1));
    }
    expect(nextCapStars(STAR_MAX)).toBeUndefined();
  });

  /**
   * craft 6 是手校段里最重的一跳（×2.4，而 craft 4 只有 ×1.75）。
   * 它不再换形态了，但那一下面板还在，而喊重了头几天就在发星：
   * ★1 就放开 craft 6 等于全员提前两周涨四成面板，手校的 40 关曲线会被冲掉
   * —— 2026-09-21 真红过一次，种子 555 在 D12 推完 40 关。
   */
  it('最重的那一跳面板押在 ★2 后面', () => {
    const heavy = 6;
    expect(craftCap(0)).toBeLessThan(heavy);
    expect(craftCap(1)).toBeLessThan(heavy);
    expect(craftCap(2)).toBeGreaterThanOrEqual(heavy);
  });

  /** 递增是玩家能背下来的唯一规律：星越多，一颗星解开的手艺越多 */
  it('一颗星解开的档数只增不减', () => {
    const open = Array.from(
      { length: STAR_MAX },
      (_, i) => craftCap(i + 1) - craftCap(i),
    );
    for (let i = 1; i < open.length; i += 1) {
      expect(open[i], `★${i + 1} 解开 ${open[i]} 档，比 ★${i} 的 ${open[i - 1]} 档还少`)
        .toBeGreaterThanOrEqual(open[i - 1]!);
    }
  });

  it('星的天花板还是 ×1.8，只是刻度变粗', () => {
    expect(1 + STAR_MAX * STAR_STEP).toBeCloseTo(1.8, 6);
  });

  it('顶到星卡的上限就喂不动了，喊到星才松开', () => {
    const p = emptyProgress(['tiezhu']);
    const at0 = craftCap(0);
    expect(nextFeed({ ...p, craft: { tiezhu: at0 - 1 } }, 'tiezhu')).toBeDefined();
    expect(nextFeed({ ...p, craft: { tiezhu: at0 } }, 'tiezhu')).toBeUndefined();
    expect(
      nextFeed({ ...p, craft: { tiezhu: at0 }, stars: { tiezhu: 1 } }, 'tiezhu'),
    ).toBeDefined();
  });
});

/**
 * 形态（立绘 + 打法）归星管，手艺只管面板。
 *
 * 这条分工是拿「玩家看不懂」换来的：形态原来挂在手艺 3 / 6 上，
 * 于是「阶」只是手艺的一个别名，而界面上却当第三个数在显示。
 */
describe('形态归星管', () => {
  it('三身各有一道星闸，一身是白板自带', () => {
    expect(EVO_STAR_GATE).toHaveLength(EVO_MAX);
    expect(EVO_STAR_GATE[0]).toBe(0);
    for (let i = 1; i < EVO_STAR_GATE.length; i += 1) {
      expect(EVO_STAR_GATE[i]!, `第 ${i + 1} 身的星闸没往后放`)
        .toBeGreaterThan(EVO_STAR_GATE[i - 1]!);
    }
    // 闸门必须在星的射程之内，不然那身立绘和那套打法就是死内容
    expect(EVO_STAR_GATE[EVO_MAX - 1]!).toBeLessThanOrEqual(STAR_MAX);
  });

  it('星数一路涨上去，形态跟着换到最后一身', () => {
    expect(evoFromStars(0)).toBe(1);
    expect(evoFromStars(STAR_MAX)).toBe(EVO_MAX);
    for (let s = 1; s <= STAR_MAX; s += 1) {
      expect(evoFromStars(s)).toBeGreaterThanOrEqual(evoFromStars(s - 1));
    }
  });

  /** 喂料只买面板。喂到哪一档都不许把人喂变样，否则两条轴又缠回去了 */
  it('喂手艺不换形态', () => {
    const p = emptyProgress(['tiezhu']);
    const at = { ...p, stars: { tiezhu: 1 } };
    const low = evoOf(at, 'tiezhu');
    const fed = { ...at, craft: { tiezhu: craftCap(1) } };
    expect(craftOf(fed, 'tiezhu')).toBeGreaterThan(craftOf(at, 'tiezhu'));
    expect(evoOf(fed, 'tiezhu')).toBe(low);
  });

  /** 换形态那一下只有揭晓牌能报，靠这个判断该不该报 */
  it('正好换样的那颗星报得出来，别的星不报', () => {
    for (let s = 1; s <= STAR_MAX; s += 1) {
      const turned = evoFromStars(s) !== evoFromStars(s - 1);
      expect(starOpenedEvo(s), `★${s} 报错了`).toBe(turned);
    }
    expect(starOpenedEvo(0)).toBe(false);
  });

  it('还没换到最后一身时，能说出再几颗星换哪一身', () => {
    const gate = nextEvoStars(0)!;
    expect(gate.stage).toBe(2);
    expect(gate.need).toBe(EVO_STAR_GATE[1]!);
    expect(nextEvoStars(STAR_MAX)).toBeUndefined();
  });
});
