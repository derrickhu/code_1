/**
 * 绝活和首领的红线。数值随便调，这几条红了说明机制坏了：
 * 手动点了放不出来、关了自动还偷偷放、定身定不住、首领漏过去只算一个、清场不催下一波。
 */
import { describe, expect, it } from 'vitest';

import { GOAL_POS, TICK_MS, cellPos } from '@/balance/combat';
import {
  ENERGY_MAX, SKILLS, SKILL_EXECUTE, SKILL_STAR_POW, SKILL_WAIT_MS, skillAt, skillOf, skillPower,
} from '@/balance/skills';
import { getEnemy, getStage } from '@/balance/stages';
import { VILLAGERS, getVillager } from '@/balance/villagers';
import {
  castSkill, createBattle, foeOf, skillReady, startFight, tick,
  type BattleState, type Foe,
} from '@/game/BattleEngine';

const HUGE = 9_999_999;

function fieldWith(id: string, cell = 3): BattleState {
  const place = [{ villager: getVillager(id), lane: 1, cell, evoStage: 1, stars: 1 }];
  const state = createBattle(getStage(1), [], 1, 1, place);
  startFight(state);
  state.schedule = [];
  for (const f of state.team) {
    f.cd = HUGE;
    f.hp = HUGE;
    f.maxHp = HUGE;
  }
  return state;
}

function put(state: BattleState, lane: number, pos: number, extra: Partial<Foe> = {}): Foe {
  const e: Foe = {
    ...foeOf(getEnemy('grunt'), state.nextFoeId, lane, pos), hp: HUGE, maxHp: HUGE, atk: 0, ...extra,
  };
  state.nextFoeId += 1;
  state.foes.push(e);
  return e;
}

describe('绝活', () => {
  it('每个村民都有一招，招名不重', () => {
    for (const v of VILLAGERS) expect(SKILLS[v.id], v.id).toBeDefined();
    const names = VILLAGERS.map((v) => skillOf(v).name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('劲头没满点了不放，满了点一下就放、清零', () => {
    const state = fieldWith('laoyanqiang');
    const f = state.team[0]!;
    put(state, 1, cellPos(0));
    f.energy = ENERGY_MAX - 1;
    expect(castSkill(state, f.uid)).toBe(false);
    f.energy = ENERGY_MAX;
    expect(skillReady(f)).toBe(true);
    expect(castSkill(state, f.uid)).toBe(true);
    expect(f.energy).toBe(0);
    expect(state.events.some((e) => e.kind === 'skill' && e.manual)).toBe(true);
    expect(state.events.some((e) => e.kind === 'skillHit')).toBe(true);
  });

  it('关了自动，满了也不自己放', () => {
    const state = fieldWith('laoyanqiang');
    state.autoSkill = false;
    const f = state.team[0]!;
    put(state, 1, cellPos(0));
    f.energy = ENERGY_MAX;
    for (let i = 0; i < 5; i += 1) tick(state);
    expect(state.skillsCast).toBe(0);
    expect(skillReady(f)).toBe(true);
  });

  it('开着自动，有目标就自己放', () => {
    const state = fieldWith('laoyanqiang');
    const f = state.team[0]!;
    put(state, 1, cellPos(0));
    f.energy = ENERGY_MAX;
    tick(state);
    expect(state.skillsCast).toBe(1);
  });

  it('定身期间怪一步不走', () => {
    const state = fieldWith('yuwang');
    state.autoSkill = false;
    const f = state.team[0]!;
    const e = put(state, 1, 0.5);
    f.energy = ENERGY_MAX;
    expect(castSkill(state, f.uid)).toBe(true);
    expect(e.stunMs).toBeGreaterThan(0);
    const before = e.pos;
    for (let i = 0; i < 5; i += 1) tick(state);
    expect(e.pos).toBe(before);
  });

  it('首领的定身只吃一半', () => {
    const state = fieldWith('yuwang');
    state.autoSkill = false;
    const f = state.team[0]!;
    const small = put(state, 1, 0.5);
    const big = put(state, 1, 0.6, { boss: true });
    f.energy = ENERGY_MAX;
    castSkill(state, f.uid);
    expect(big.stunMs).toBeCloseTo(small.stunMs / 2, 5);
  });

  it('三阶真多一个效果，一阶二阶没有', () => {
    for (const v of VILLAGERS) {
      const def = skillOf(v);
      const extra = Object.keys(def.evo3) as (keyof typeof def.evo3)[];
      expect(extra.length, v.id).toBeGreaterThan(0);
      for (const k of extra) {
        expect(skillAt(v, 3)[k], `${v.id}.${k}`).toBe(def.evo3[k]);
        if (!(k in def)) expect(skillAt(v, 2)[k], `${v.id}.${k}`).toBeUndefined();
      }
    }
  });

  it('星级每颗加威力', () => {
    expect(skillPower(1, 5) / skillPower(1, 1)).toBeCloseTo((1 + 5 * SKILL_STAR_POW) / (1 + SKILL_STAR_POW), 5);
    expect(skillPower(3, 1)).toBeGreaterThan(skillPower(2, 1));
  });

  it('自动时，控场招等怪贴上来；憋满 6 秒才兜底，也只定贴上来的', () => {
    const state = fieldWith('yuwang');
    const f = state.team[0]!;
    const far = put(state, 1, 0.3, { spd: 0 });
    f.energy = ENERGY_MAX;
    tick(state);
    expect(state.skillsCast).toBe(0);
    for (let t = 0; t < SKILL_WAIT_MS; t += TICK_MS) tick(state);
    expect(state.skillsCast).toBe(1);
    expect(far.stunMs).toBe(0);
  });

  it('自动时，伤害招等怪贴上来或攒成三只一堆再砸', () => {
    const one = fieldWith('laoyanqiang');
    put(one, 1, 0.3, { spd: 0 });
    one.team[0]!.energy = ENERGY_MAX;
    tick(one);
    expect(one.skillsCast).toBe(0);

    const pack = fieldWith('laoyanqiang');
    for (const p of [0.2, 0.3, 0.4]) put(pack, 1, p, { spd: 0 });
    pack.team[0]!.energy = ENERGY_MAX;
    tick(pack);
    expect(pack.skillsCast).toBe(1);
  });

  it('打残的小怪直接带走，首领不吃这一套', () => {
    const state = fieldWith('laoyanqiang');
    state.autoSkill = false;
    const f = state.team[0]!;
    const small = put(state, 1, cellPos(0), { hp: HUGE * (SKILL_EXECUTE - 0.01) });
    const big = put(state, 1, cellPos(0), { boss: true, hp: HUGE * (SKILL_EXECUTE - 0.01) });
    f.energy = ENERGY_MAX;
    castSkill(state, f.uid);
    expect(small.hp).toBeLessThanOrEqual(0);
    expect(big.hp).toBeGreaterThan(0);
  });

  it('站后排的「面前一圈」也砸得到本路前排脚前的怪', () => {
    const place = [
      { villager: getVillager('guogai'), lane: 1, cell: 0, evoStage: 1, stars: 1 },
      { villager: getVillager('miankuzhang'), lane: 1, cell: 2, evoStage: 1, stars: 1 },
    ];
    const state = createBattle(getStage(1), [], 1, 1, place);
    startFight(state);
    state.schedule = [];
    state.autoSkill = false;
    const e = put(state, 1, cellPos(0) - 1);
    const f = state.team.find((t) => t.def.id === 'miankuzhang')!;
    f.energy = ENERGY_MAX;
    castSkill(state, f.uid);
    expect(state.events.some((ev) => ev.kind === 'skillHit' && ev.foeId === e.id)).toBe(true);
  });
});

describe('首领和节奏', () => {
  it('首领漏过去算两个', () => {
    const state = fieldWith('guogai');
    put(state, 0, GOAL_POS - 0.01, { boss: true, spd: 5 });
    for (let i = 0; i < 3; i += 1) tick(state);
    expect(state.leaked).toBe(2);
  });

  it('场上清空后下一波提前来，跳过的时间记在 skippedMs', () => {
    const state = fieldWith('guogai');
    state.wave = 1;
    state.schedule = [{ atMs: 20_000, lane: 1, enemy: 'grunt', wave: 2, boss: false }];
    state.spawnIdx = 0;
    tick(state);
    expect(state.skippedMs).toBeGreaterThan(10_000);
    expect(state.schedule[0]!.atMs).toBeLessThan(5_000);
  });
});
