/**
 * 二期八只外星人的机制自检。
 *
 * 这一组盯的不是数值，是**「每只怪是一道题，而且那道题有解」**。
 * 数值可以调，下面这些一旦红了说明机制本身被改坏了：
 * 钻地绕过了前排却打不到最后排、弹簧腿跳完还被原来那个人挡着、
 * 光环把自己也罩上了、孵化器下蛋没完没了。
 */
import { describe, expect, it } from 'vitest';

import { BLOCK_GAP, PAR_GRACE_MS, cellPos, posFromVisualGap } from '@/balance/combat';
import {
  ENEMIES, STAGES, getEnemy, lastSpawnMs, spawnTailMs,
} from '@/balance/stages';
import { getStage } from '@/balance/stages';
import { battlePreloadImages, stageEnemyIds } from '@/config/assetPreload';
import { enemyArtPath } from '@/core/TextureLoader';
import { getVillager } from '@/balance/villagers';
import {
  createBattle, foeHaltPos, foeOf, startFight, tick,
  type BattleState, type Foe,
} from '@/game/BattleEngine';

const HUGE = 9_999_999;

/** 一条路上摆几个人，然后把他们冻住：不出手、打不死，只当路障用 */
function fieldWith(spots: readonly [string, number][]): BattleState {
  const place = spots.map(([id, cell]) => ({
    villager: getVillager(id), lane: 1, cell, evoStage: 1, stars: 1,
  }));
  const state = createBattle(getStage(1), [], place.length, 1, place);
  startFight(state);
  state.schedule = [];
  return state;
}

function freeze(state: BattleState): void {
  for (const f of state.team) {
    f.atk = 0;
    f.cd = HUGE;
    f.hp = HUGE;
    f.maxHp = HUGE;
  }
}

/** 放一只打不死的怪进来，专看它怎么走 */
function put(state: BattleState, id: string, lane = 1): Foe {
  const e: Foe = { ...foeOf(getEnemy(id), state.nextFoeId, lane), hp: HUGE, maxHp: HUGE, atk: 0 };
  state.nextFoeId += 1;
  state.foes.push(e);
  return e;
}

/** 一直走到它停下来为止 */
function settle(state: BattleState, e: Foe): void {
  for (let i = 0; i < 400; i += 1) {
    const before = e.pos;
    tick(state);
    if (!e.alive) return;
    if (e.pos === before && i > 10) return;
  }
}

describe('外星人机制的红线', () => {
  it('id 不重复，下的蛋也得是池子里真有的怪', () => {
    const ids = ENEMIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of ENEMIES) {
      if (!e.spawn) continue;
      expect(() => getEnemy(e.spawn!.enemy), e.id).not.toThrow();
      // 下蛋必须有数。无限下蛋点不掉就只能等超时，那个判负玩家看不懂
      expect(e.spawn.times, e.id).toBeGreaterThan(0);
      expect(e.spawn.everyMs, e.id).toBeGreaterThan(0);
    }
  });

  it('免疫减速的不许同时不被阻挡 —— 那就是无解只能硬吃', () => {
    for (const e of ENEMIES) {
      if (!e.steady) continue;
      expect(e.flying, e.id).toBeFalsy();
      expect(e.burrow, e.id).toBeFalsy();
    }
  });

  it('二期那八只每只都带一条规则，不是只换了数值', () => {
    const second = ['lamp', 'mast', 'pier', 'drill', 'wire', 'keg', 'spring', 'hatch'];
    for (const id of second) {
      const e = getEnemy(id);
      const traits = [e.flying, e.burrow, e.steady, e.leap, e.crack, e.aura, e.spawn]
        .filter(Boolean);
      expect(traits, `${id} 只有数值没有规则`).toHaveLength(1);
    }
  });
});

describe('钻地：绕过前排，直奔最后排', () => {
  it('前排挡不住它，它停在最后那个人脚前', () => {
    const state = fieldWith([['tiezhu', 0], ['erjiu', 3]]);
    freeze(state);
    const e = put(state, 'drill');
    expect(foeHaltPos(e, state.team)).toBeCloseTo(posFromVisualGap(cellPos(3), e.def.range));
    settle(state, e);
    expect(e.alive).toBe(true);
    expect(e.pos).toBeGreaterThan(cellPos(0));
    expect(e.pos).toBeCloseTo(posFromVisualGap(cellPos(3), e.def.range), 2);
  });

  it('但它得贴上去才打得着，不像飞碟那样隔着射程点', () => {
    const state = fieldWith([['erjiu', 3]]);
    freeze(state);
    const drill = put(state, 'drill');
    const saucer = put(state, 'saucer', 0);
    // 飞碟悬在射程外，钻地的必须走到脸上
    expect(foeHaltPos(drill, state.team)!)
      .toBeGreaterThan(foeHaltPos(saucer, state.team) ?? -1);
  });
});

describe('弹簧腿：一局跳一次', () => {
  it('跳过最前面那个，被第二格的人接住', () => {
    const state = fieldWith([['tiezhu', 0], ['erjiu', 1]]);
    freeze(state);
    const e = put(state, 'spring');
    // 起手仍然被前排挡着，跳是撞上去那一刻才发生的
    expect(foeHaltPos(e, state.team)).toBeCloseTo(posFromVisualGap(cellPos(0), e.def.range));
    settle(state, e);
    expect(e.leapt).toBe(true);
    expect(e.pos).toBeCloseTo(posFromVisualGap(cellPos(1), e.def.range), 2);
  });

  it('第二格空着，它就落到后面那个人脸上', () => {
    const state = fieldWith([['tiezhu', 0], ['erjiu', 3]]);
    freeze(state);
    const e = put(state, 'spring');
    settle(state, e);
    expect(e.pos).toBeCloseTo(posFromVisualGap(cellPos(3), e.def.range), 2);
  });

  it('只跳一次：整条路就一个人，跳完就通天了', () => {
    const state = fieldWith([['tiezhu', 0]]);
    freeze(state);
    const e = put(state, 'spring');
    settle(state, e);
    expect(e.alive).toBe(false);
    expect(state.leaked).toBe(1);
  });
});

describe('减速只跟钉死走，不跟拦位普攻走', () => {
  it('一阶大锤砸中不掉速，三阶钉死才掉；水泥墩两边都不吃', () => {
    const state = fieldWith([['dachui', 0]]);
    const cube = put(state, 'cube');
    const pier = put(state, 'pier');
    cube.pos = cellPos(0) - BLOCK_GAP;
    pier.pos = cellPos(0) - BLOCK_GAP;
    state.team[0]!.cd = 0;
    for (let i = 0; i < 40; i += 1) tick(state);
    expect(cube.slowMs).toBe(0);
    expect(pier.slowMs).toBe(0);

    state.team[0]!.evoStage = 3;
    cube.slowMs = 0;
    state.team[0]!.cd = 0;
    for (let i = 0; i < 40; i += 1) tick(state);
    expect(cube.slowMs).toBeGreaterThan(0);
    expect(pier.slowMs).toBe(0);
  });
});

describe('光环：加给同路，不加给自己', () => {
  it('天线杆罩的是别人，自己是裸的', () => {
    const state = fieldWith([['tiezhu', 0]]);
    freeze(state);
    const mast = put(state, 'mast');
    const cube = put(state, 'cube');
    tick(state);
    expect(cube.shieldPct).toBeCloseTo(0.25, 3);
    expect(mast.shieldPct).toBe(0);
  });

  it('高压线加的攻也不加给自己', () => {
    const state = fieldWith([['tiezhu', 0]]);
    freeze(state);
    const wire = put(state, 'wire');
    const cube = put(state, 'cube');
    tick(state);
    expect(cube.atkPct).toBeCloseTo(0.3, 3);
    expect(wire.atkPct).toBe(0);
  });

  it('叠几个也封顶，不许叠出打不动的一波', () => {
    const state = fieldWith([['tiezhu', 0]]);
    freeze(state);
    for (let i = 0; i < 6; i += 1) put(state, 'mast');
    const cube = put(state, 'cube');
    tick(state);
    expect(cube.shieldPct).toBeLessThanOrEqual(0.5);
  });

  it('隔壁路的光环管不着这一路', () => {
    const state = fieldWith([['tiezhu', 0]]);
    freeze(state);
    put(state, 'mast', 0);
    const cube = put(state, 'cube', 1);
    tick(state);
    expect(cube.shieldPct).toBe(0);
  });
});

describe('探照灯：照住最前面那个，往后挪就废了', () => {
  /**
   * `who` 这个人在 200 tick 里出手多少次。
   *
   * **只数这一个人的**：探照灯自己也是个靶子，场上多一只就会把
   * 「全场出手总数」带偏，那样测出来的是「靶子变多了」不是「他变慢了」。
   * 一阶电锯哥是 plain，一次出手正好一条 hit。
   */
  function hits(spots: readonly [string, number][], who: string, withLamp: boolean): number {
    const state = fieldWith(spots);
    if (withLamp) put(state, 'lamp');
    const dummy = put(state, 'cube');
    dummy.pos = cellPos(0) - BLOCK_GAP;
    let n = 0;
    for (let i = 0; i < 200; i += 1) {
      state.events.length = 0;
      tick(state);
      n += state.events.filter((e) => e.kind === 'hit' && e.uid.startsWith(`${who}#`)).length;
    }
    return n;
  }

  it('被照住的那个出手明显变慢', () => {
    const spots: [string, number][] = [['dianju', 0]];
    expect(hits(spots, 'dianju', true)).toBeLessThan(hits(spots, 'dianju', false));
  });

  it('把输出挪到后面，前面留个挨打的，照就吃不到他了', () => {
    const spots: [string, number][] = [['tiezhu', 0], ['dianju', 1]];
    // 灯照的是最前面的铁柱，电锯哥的出手次数一下都不该少
    expect(hits(spots, 'dianju', true)).toBe(hits(spots, 'dianju', false));
    // 而铁柱确实被照慢了 —— 这一路的解法就是「谁站前面」
    expect(hits(spots, 'tiezhu', true)).toBeLessThan(hits(spots, 'tiezhu', false));
  });
});

describe('孵化器：下蛋有数', () => {
  it('下满就不下了，不是无限出怪', () => {
    const state = fieldWith([['tiezhu', 0]]);
    freeze(state);
    const hatch = put(state, 'hatch');
    const times = getEnemy('hatch').spawn!.times;
    for (let i = 0; i < 600; i += 1) tick(state);
    expect(hatch.spawnLeft).toBe(0);
    expect(state.foes).toHaveLength(1 + times);
  });

  it('蛋和它自己吃的是同一份关卡倍率', () => {
    const late = getStage(30);
    const state = createBattle(late, [], 1, 1, [
      { villager: getVillager('tiezhu'), lane: 1, cell: 0, evoStage: 1, stars: 1 },
    ]);
    startFight(state);
    state.schedule = [];
    freeze(state);
    put(state, 'hatch');
    for (let i = 0; i < 60; i += 1) tick(state);
    const egg = state.foes.find((e) => e.def.id === 'grunt');
    expect(egg).toBeDefined();
    expect(egg!.maxHp).toBe(Math.round(getEnemy('grunt').hp * late.hpMul));
  });

  it('蛋的图也在预载名单里，不然打到一半蹦出白方块', () => {
    const hatchStage = STAGES.find(
      (s) => stageEnemyIds(s).includes('hatch'),
    );
    expect(hatchStage).toBeDefined();
    const ids = stageEnemyIds(hatchStage!);
    expect(ids).toContain(getEnemy('hatch').spawn!.enemy);
    expect(battlePreloadImages(hatchStage!.id, [])).toContain(
      enemyArtPath(getEnemy('hatch').spawn!.enemy),
    );
  });

  it('带孵化器的关卡，par 时间算上了下蛋那一段', () => {
    const withHatch = STAGES.filter((s) => spawnTailMs(s.waves) > 0);
    expect(withHatch.length).toBeGreaterThan(0);
    for (const s of withHatch) {
      expect(s.parMs, s.label).toBeGreaterThan(lastSpawnMs(s.waves) + PAR_GRACE_MS);
    }
  });
});

describe('闷罐：血过半破壳', () => {
  it('壳掉了，但跑得更快 —— 这是交换不是白送', () => {
    const state = fieldWith([['tiezhu', 0]]);
    freeze(state);
    const keg = put(state, 'keg');
    const def = getEnemy('keg');
    expect(keg.armor).toBe(def.def);
    expect(keg.spd).toBeCloseTo(def.spd, 3);

    keg.maxHp = 1000;
    keg.hp = 400;
    tick(state);
    expect(keg.cracked).toBe(true);
    expect(keg.armor).toBe(0);
    expect(keg.spd).toBeGreaterThan(def.spd);
  });

  it('只破一次，不会每 tick 再乘一遍速度', () => {
    const state = fieldWith([['tiezhu', 0]]);
    freeze(state);
    const keg = put(state, 'keg');
    keg.maxHp = 1000;
    keg.hp = 400;
    tick(state);
    const after = keg.spd;
    for (let i = 0; i < 20; i += 1) tick(state);
    expect(keg.spd).toBeCloseTo(after, 6);
  });
});
