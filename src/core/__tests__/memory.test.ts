import { beforeEach, describe, expect, it, vi } from 'vitest';

/** 小程序存储在 node 下是空操作，塞一个内存版进去才测得到存档逻辑 */
const store = vi.hoisted(() => new Map<string, string>());
vi.mock('@/core/PlatformService', () => ({
  Platform: {
    getStorageSync: (k: string) => store.get(k) ?? null,
    setStorageSync: (k: string, v: string) => {
      store.set(k, v);
    },
    removeStorageSync: (k: string) => {
      store.delete(k);
    },
  },
}));

const KEY = 'cunkou_run_memory';

import { LAST_STAGE_ID } from '@/balance/stages';
import {
  PELLET_AD, PELLET_AD_DAILY, PELLET_CLEAR, PELLET_FIRST, PELLET_LOSE,
  PELLET_CAP, SETTLE_SCRAP, pelletCap, pelletRegenMin,
} from '@/balance/stall';
import {
  CALL_COST, CRAFT_COST, STAR_GRANT_COST, emptyProgress, nextVillageCost, rollCall, squadCap, starWeekKey,
} from '@/balance/village';
import { CRAFT_MAX, DEFAULT_SQUAD, STAR_MAX, VILLAGERS } from '@/balance/villagers';
import {
  buyEvo,
  callVillager,
  grantStar,
  setWait,
  capOf,
  claimAdPellets,
  gmGrant,
  gmUnlockToStage,
  loadMemory,
  saveLayout,
  setStageId,
  settlePellets,
  settleStage,
  shootStall,
  stallAdLeft,
  starGap,
  nextGap,
  nextGoal,
  totalStars,
} from '@/core/RunMemory';
import { STAGE_COUNT } from '@/balance/stages';

function write(patch: Record<string, unknown>): void {
  store.set(KEY, JSON.stringify({ ...loadMemory(), ...patch }));
}

describe('新档开局', () => {
  beforeEach(() => store.clear());

  it('开局就有三个人，能上的人数跟村庄等级对得上', () => {
    const mem = loadMemory();
    expect(mem.roster).toEqual([...DEFAULT_SQUAD]);
    expect(mem.villageLv).toBe(1);
    expect(capOf(mem)).toBe(squadCap(1));
    // 第一关必须能打：没有弹子也不该卡在村里
    expect(mem.stageId).toBe(1);
    expect(mem.stageTop).toBe(1);
  });

  /*
   * 上一版的存档字段这一版全没有（改装件星级、门路等级、废品堆），
   * 硬折算只会折出一个玩家看不懂的开局，所以 rev 不匹配就当新档。
   */
  it('老版本存档直接当新档，不做迁移', () => {
    store.set(KEY, JSON.stringify({
      campaignRev: 2, highestWave: 30, yardScrap: 9999, laneLv: { grip: 5 },
    }));
    const mem = loadMemory();
    expect(mem.scrap).toBe(0);
    expect(mem.roster).toEqual([...DEFAULT_SQUAD]);
  });

  it('坏字段不会把存档读崩', () => {
    store.set(KEY, JSON.stringify({
      rev: 3,
      roster: ['tiezhu', 'nobody', 42],
      evo: { tiezhu: 99 },
      stars: { tiezhu: -3 },
      scrap: 'x',
      villageLv: 999,
    }));
    const mem = loadMemory();
    expect(mem.roster).toEqual(['tiezhu']);
    // 越界的阶被夹到 3，负数的星直接丢掉（读的时候当 0）
    expect(mem.evo.tiezhu).toBe(3);
    expect(mem.stars.tiezhu).toBeUndefined();
    expect(mem.scrap).toBe(0);
  });
});

describe('推图进度', () => {
  beforeEach(() => store.clear());

  it('赢了解锁下一关并记星，输了留在原地', () => {
    const win = settleStage(1, true, 3);
    expect(win.mem.stageTop).toBe(2);
    expect(win.mem.stageId).toBe(2);
    expect(win.mem.stageStars[1]).toBe(3);
    expect(win.scrap).toBe(SETTLE_SCRAP);
    // 首通额外给一份弹子，第二次通同一关只给基础那份
    expect(win.pellets).toBe(PELLET_CLEAR + PELLET_FIRST);
    expect(settleStage(1, true, 1).pellets).toBe(PELLET_CLEAR);

    const lose = settleStage(2, false, 0);
    expect(lose.mem.stageTop).toBe(2);
    expect(lose.mem.stageId).toBe(2);
    // 输了也给一发：空手回村会让人干脆不打第二次
    expect(lose.pellets).toBe(PELLET_LOSE);
    expect(lose.scrap).toBe(0);
  });

  it('星评只记最高的那次，重打差了不会掉', () => {
    settleStage(1, true, 3);
    settleStage(1, true, 1);
    expect(loadMemory().stageStars[1]).toBe(3);
    expect(totalStars(loadMemory())).toBe(3);
  });

  it('挑关只能在打过的范围里，不给跳关', () => {
    settleStage(1, true, 2);
    expect(setStageId(9).stageId).toBe(2);
    expect(setStageId(1).stageId).toBe(1);
  });

  it('GM 解锁到末关也不会越界', () => {
    const mem = gmUnlockToStage(LAST_STAGE_ID + 50);
    expect(mem.stageTop).toBe(LAST_STAGE_ID);
    expect(mem.stageId).toBe(LAST_STAGE_ID);
  });

  it('排法存下来，认不出的人会被滤掉', () => {
    const mem = saveLayout([
      { id: 'tiezhu', lane: 0, cell: 0 },
      { id: 'nobody', lane: 1, cell: 1 },
    ]);
    expect(mem.layout.map((s) => s.id)).toEqual(['tiezhu']);
  });
});

describe('弹弓摊', () => {
  beforeEach(() => store.clear());

  /*
   * 弹子是次数不是货币：攒着不玩没有额外好处。
   * 这条是「每天回来打一会儿」和「攒一周一次性刷完」之间的那道闸，
   * 上限一旦漏掉，摊子就变成了可以囤积的资源池。
   */
  it('离线回弹到上限就停', () => {
    const cap = pelletCap(1);
    const per = pelletRegenMin(1) * 60_000;
    // 时刻要够大：pelletAtMs 算成负数会被存档层夹成 0，那条路走的是「首次进村」
    const now = 10_000_000_000;
    write({ pellets: 0, pelletAtMs: now - per * (cap + 20) });
    const mem = settlePellets(now);
    expect(mem.pellets).toBe(cap);
    expect(cap).toBeLessThanOrEqual(PELLET_CAP);
  });

  it('过关和广告顶过上限的，回弹不加也不收回', () => {
    const cap = pelletCap(5);
    const per = pelletRegenMin(5) * 60_000;
    const now = 10_000_000_000;
    const stock = cap + PELLET_CLEAR * 2;
    write({ villageLv: 5, pellets: stock, pelletAtMs: now - per * 10 });
    const mem = settlePellets(now);
    expect(mem.pellets).toBe(stock);
    expect(mem.pelletAtMs).toBe(now);

    write({ pellets: cap - 1, pelletAtMs: mem.pelletAtMs });
    const next = settlePellets(now + per);
    expect(next.pellets).toBe(cap);
  });

  it('回弹留零头，频繁进出不会把时间抹掉', () => {
    const per = pelletRegenMin(1) * 60_000;
    const now = 10_000_000_000;
    write({ pellets: 0, pelletAtMs: now - per - per / 2 });
    const mem = settlePellets(now);
    expect(mem.pellets).toBe(1);
    // 剩下的半发还在计时里，没被清成 now
    expect(now - mem.pelletAtMs).toBeCloseTo(per / 2, 0);
  });

  it('打一发扣一发并且真的出东西', () => {
    write({ pellets: 3, pelletAtMs: Date.now() });
    const res = shootStall();
    expect(res).toBeDefined();
    expect(res!.mem.pellets).toBe(2);
    const g = res!.result.gain;
    expect(g.exp + g.scrap + g.parts + g.credits).toBeGreaterThan(0);
  });

  it('没弹子就打不了', () => {
    write({ pellets: 0, pelletAtMs: Date.now() });
    expect(shootStall()).toBeUndefined();
  });

  it('广告弹子有日限，且允许顶到上限之上', () => {
    write({ pellets: pelletCap(1), pelletAtMs: Date.now(), adCount: 0, adDay: '' });
    expect(stallAdLeft()).toBe(PELLET_AD_DAILY);
    const first = claimAdPellets();
    expect(first).toBeDefined();
    // 满仓时不许把广告位作废，否则那一格永远点不动
    expect(first!.pellets).toBe(pelletCap(1) + PELLET_AD);
    for (let i = 1; i < PELLET_AD_DAILY; i += 1) expect(claimAdPellets()).toBeDefined();
    expect(claimAdPellets()).toBeUndefined();
    expect(stallAdLeft()).toBe(0);
  });
});

describe('喊人与进化', () => {
  beforeEach(() => store.clear());

  it('工分不够喊不动', () => {
    write({ credits: CALL_COST - 1 });
    expect(callVillager()).toBeUndefined();
  });

  it('前几次必出新人，别让新手连着喊到重的', () => {
    write({ credits: CALL_COST * 4, callCount: 0 });
    for (let i = 0; i < 4; i += 1) {
      const res = callVillager();
      expect(res).toBeDefined();
      expect(res!.isNew).toBe(true);
    }
    expect(loadMemory().roster.length).toBe(DEFAULT_SQUAD.length + 4);
  });

  it('人满了之后喊重的折废铁并且加星', () => {
    const all = VILLAGERS.map((v) => v.id);
    write({ credits: CALL_COST, roster: all, callCount: 99, scrap: 0 });
    const res = callVillager();
    expect(res).toBeDefined();
    expect(res!.isNew).toBe(false);
    expect(loadMemory().scrap).toBeGreaterThan(0);
    expect(res!.starTo).toBeDefined();
  });

  it('星有上限，不会喊到 ★6', () => {
    const all = VILLAGERS.map((v) => v.id);
    const full = Object.fromEntries(all.map((id) => [id, STAR_MAX]));
    write({ credits: CALL_COST, roster: all, stars: full, callCount: 99 });
    const res = callVillager();
    expect(res!.starTo).toBeUndefined();
    for (const id of all) expect(loadMemory().stars[id]).toBe(STAR_MAX);
  });

  it('材料够才能喂一手艺，喂完扣料', () => {
    const cost = CRAFT_COST[0]!;
    write({ roster: ['tiezhu'], scrap: cost.scrap, parts: cost.parts, evo: {}, craft: {} });
    const mem = buyEvo('tiezhu');
    expect(mem).toBeDefined();
    expect(mem!.craft.tiezhu).toBe(2);
    expect(mem!.scrap).toBe(0);
    expect(mem!.parts).toBe(0);
  });

  it('料不够、不在名单里、星卡住都喂不了', () => {
    write({ roster: ['tiezhu'], scrap: 0, parts: 0 });
    expect(buyEvo('tiezhu')).toBeUndefined();
    write({ roster: ['tiezhu'], scrap: 99999, parts: 9999 });
    expect(buyEvo('dianju')).toBeUndefined();
    write({
      roster: ['tiezhu'], scrap: 99999, parts: 9999,
      craft: { tiezhu: 3 }, evo: { tiezhu: 2 },
    });
    expect(buyEvo('tiezhu')).toBeUndefined();
  });

  it('一颗星就能喂过二阶，往三阶走', () => {
    const cost = CRAFT_COST[2]!;
    write({
      roster: ['tiezhu'], scrap: cost.scrap, parts: cost.parts,
      craft: { tiezhu: 3 }, evo: { tiezhu: 2 }, stars: { tiezhu: 1 },
    });
    const mem = buyEvo('tiezhu');
    expect(mem).toBeDefined();
    expect(mem!.craft.tiezhu).toBe(4);
    expect(mem!.evo.tiezhu).toBe(2);
  });

  /**
   * 存档上限曾经写死 10，而手艺能焊到 75 —— 喂到 11 档以上的料一重载就没了。
   * 这条是拿这个 bug 换来的。
   */
  it('手艺喂过 10 档，重载之后不许被夹回去', () => {
    write({ roster: ['tiezhu'], craft: { tiezhu: 40 }, stars: { tiezhu: STAR_MAX } });
    expect(loadMemory().craft.tiezhu).toBe(40);
    write({ roster: ['tiezhu'], craft: { tiezhu: CRAFT_MAX + 20 } });
    expect(loadMemory().craft.tiezhu).toBe(CRAFT_MAX);
  });

  it('GM 送资源只加不减', () => {
    const mem = gmGrant({ scrap: 100, parts: 5, credits: 12, pellets: 3, villageExp: 10 });
    expect(mem.scrap).toBe(100);
    expect(mem.parts).toBe(5);
    expect(mem.credits).toBe(12);
    expect(mem.pellets).toBeGreaterThanOrEqual(3);
    expect(mem.villageExp).toBe(10);
    const again = gmGrant({ scrap: -50, credits: -3 });
    expect(again.scrap).toBe(mem.scrap);
    expect(again.credits).toBe(mem.credits);
  });

  it('GM 送村庄经验会升级', () => {
    write({ villageLv: 1, villageExp: 0 });
    const need = nextVillageCost(1);
    expect(need).toBeGreaterThan(0);
    const mem = gmGrant({ villageExp: need });
    expect(mem.villageLv).toBe(2);
    expect(mem.villageExp).toBe(0);
  });
});

describe('下一个目标', () => {
  beforeEach(() => store.clear());

  /** 没打过的关不算「没打利索」—— 那是还没推到，不是欠着的债 */
  it('只把打过又没满星的关算进欠账', () => {
    write({ stageStars: { 1: 3, 2: 2, 3: 0, 4: 1 } });
    expect(starGap(loadMemory())).toEqual([2, 4]);
  });

  it('从当前关往后找，找到头绕回开头', () => {
    write({ stageStars: { 2: 1, 9: 2 } });
    const mem = loadMemory();
    expect(nextGap(mem, 1)).toBe(2);
    expect(nextGap(mem, 5)).toBe(9);
    expect(nextGap(mem, 20)).toBe(2);
  });

  it('全打利索了就没有欠账', () => {
    write({ stageStars: { 1: 3, 2: 3 } });
    expect(nextGap(loadMemory(), 1)).toBeUndefined();
  });

  /**
   * §8 验收「随时有下一个目标」：任何时候点开村子都不该是「齐了」。
   * 这条以前没有实现，也就无从测起。现在只要 done 冒出来，这里就红。
   */
  it('推图路上永远有下一步，不会是「齐了」', () => {
    write({ scrap: 0, parts: 0, credits: 0, stageTop: 1, stageStars: {} });
    expect(nextGoal(loadMemory()).kind).toBe('stage');
  });

  it('材料够了先喂人，喂不动了才提别的', () => {
    const cost = CRAFT_COST[0]!;
    write({ roster: ['tiezhu'], scrap: cost.scrap, parts: cost.parts, credits: 0 });
    expect(nextGoal(loadMemory()).kind).toBe('craft');
    expect(nextGoal(loadMemory()).text).toBe('1 人可以再练一级');
  });

  it('推完 40 关之后，回头刷星就是主线', () => {
    const stars: Record<number, number> = {};
    for (let i = 1; i <= STAGE_COUNT; i += 1) stars[i] = i % 3 === 0 ? 2 : 3;
    write({
      roster: [], scrap: 0, parts: 0, credits: 0,
      stageTop: STAGE_COUNT, stageStars: stars,
    });
    const goal = nextGoal(loadMemory());
    expect(goal.kind).toBe('stars');
    expect(goal.text).toContain('没打利索');
  });

});

describe('等他来，和指定加星', () => {
  beforeEach(() => store.clear());

  const thisWeek = Date.parse('2026-09-21T04:00:00Z');
  const nextWeek = Date.parse('2026-09-28T04:00:00Z');

  it('没来的人可以标上，再点一次取消', () => {
    expect(setWait('sanshen').waitId).toBe('sanshen');
    expect(setWait('sanshen').waitId).toBe('');
    expect(setWait('tiezhu').waitId).toBe('');
  });

  it('出新人时，标着的人两回里有一回是他', () => {
    const p = emptyProgress(['tiezhu', 'dachui']);
    const ids = ['tiezhu', 'dachui', 'sanshen', 'erjiu'];
    const hit = rollCall(p, 1, () => 0.1, ids, STAR_MAX, 'sanshen');
    expect(hit).toEqual({ id: 'sanshen', isNew: true, scrap: 0 });
    const seq = [0.9, 0.6];
    let i = 0;
    const miss = rollCall(p, 1, () => seq[i++] ?? 0, ids, STAR_MAX, 'sanshen');
    expect(miss.id).toBe('erjiu');
    expect(miss.isNew).toBe(true);
  });

  it('手艺满了才能花 12 工分给这个人加星，一周一次', () => {
    write({
      roster: ['tiezhu', 'dachui'],
      craft: { tiezhu: 3, dachui: 3 },
      stars: { tiezhu: 0, dachui: 0 },
      credits: STAR_GRANT_COST,
    });
    expect(grantStar('tiezhu', thisWeek)?.stars.tiezhu).toBe(1);
    expect(loadMemory().credits).toBe(0);
    expect(loadMemory().stars.dachui ?? 0).toBe(0);
    write({ credits: STAR_GRANT_COST });
    expect(grantStar('dachui', thisWeek)).toBeUndefined();
    expect(grantStar('dachui', nextWeek)?.stars.dachui).toBe(1);
  });

  it('手艺还没练满，不能买星', () => {
    write({ roster: ['tiezhu'], craft: { tiezhu: 1 }, credits: 99 });
    expect(grantStar('tiezhu', thisWeek)).toBeUndefined();
  });

  it('北京时间同一周的标记不跟机器时区走', () => {
    expect(starWeekKey(thisWeek)).toBe(starWeekKey(Date.parse('2026-09-26T10:00:00Z')));
    expect(starWeekKey(nextWeek)).not.toBe(starWeekKey(thisWeek));
  });
});
