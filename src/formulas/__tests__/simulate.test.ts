/**
 * 回归测试。
 *
 * 这里守的不是「代码没报错」，而是 docs/00-体验目标.md 里那几条能被数值证伪的承诺：
 *
 * - 失败条件是队灭或推不动，**不存在漏怪与底线血**（反目标第五条：不像塔防）；
 * - 改装件能改定位，而不只是加数值（审视清单第 1 条）；
 * - **装给谁真的有差别**（反目标第一条，头号风险）；
 * - 卡关点稳定落在第 9–12 波。
 *
 * 数值一旦挂在最后那两条上，要回去改 mods.ts 或曲线，而不是改测试。
 */

import { describe, expect, it } from 'vitest';
import {
  MELEE_REACH,
  MOD_SLOTS_PER_HERO,
  REAR_POS,
  REVIVE_GRACE_MS,
  SPAWN_DIST,
  TEAM_SIZE,
  TOTAL_WAVES,
  STAGE_MS,
  EMPTY_PULL_MS,
  STAGE_HEAL_PCT,
  DOWN_RECOVER_MS,
  DOWN_RECOVER_HP_PCT,
  JAM_COUNT,
  JAM_MS,
  TICK_MS,
  stageStartMs,
  slotPos,
  slotScreenX,
  slotScreenY,
  slotTagPos,
  slotHitBox,
  SQUAD_X,
  BACK_DX,
  BACK_DY,
} from '../../balance/combat';
import { comboOf } from '../../balance/combos';
import { REROLL_COST, SCRAP_PER_INSTALL, STRIP_COST, runScrap } from '../../balance/rewards';
import { resolveAttackFx } from '../../balance/fx';
import {
  BACK_AIM_DIST,
  WAVES,
  getEnemyProto,
  getWave,
  waveAtkMult,
  waveHpMult,
} from '../../balance/enemies';
import { installForecast } from '../../balance/forecast';
import { availableMods, isModUnlocked, yardDeposit } from '../../balance/yard';
import { HEROES, getHero } from '../../balance/heroes';
import { MODS, getMod } from '../../balance/mods';
import { PET_CAP, PET_MAX_DIST, PET_PROTOS } from '../../balance/pets';
import { LADDER_TOP, ladderDownMult, ladderStageMs } from '../../balance/ladder';
import { LEVEL_EXP, PICK_STRATEGIES, levelThreshold } from '../../balance/picker';
import {
  applyPick,
  buildOptions,
  canInstallOn,
  claimJunkyard,
  claimOpeningGift,
  computeStats,
  createRun,
  damageEnemy,
  heroAt,
  enemyVictim,
  heroCanReach,
  heroReach,
  installMod,
  installTargets,
  placeInSlot,
  rerollMods,
  reviveAfterWipe,
  stripMod,
  swapSlots,
  teamInOrder,
  tick,
  type EnemyUnit,
  type HeroUnit,
  type PetUnit,
  type RunState,
} from '../../game/BattleEngine';
import { armorReduction, computeDamage } from '../damage';
import { simulateBatch, simulateRun } from '../simulate';

// ── 测试替身 ────────────────────────────────────────────

function unit(heroId: string, slot: number, modIds: string[] = []): HeroUnit {
  const def = getHero(heroId);
  const mods = modIds.map(getMod);
  const stats = computeStats(def, mods);
  return {
    def,
    slot,
    hp: stats.maxHp,
    maxHp: stats.maxHp,
    shield: 0,
    cdMs: 0,
    skillCdMs: 0,
    alive: true,
    mods,
    stats,
    rageStacks: 0,
    usedRevive: false,
    summonCd: {},
    downMs: 0,
  };
}

/** 把全队打趴。躺下带着自愈倒计时，跟真被打倒时一样 */
function dropAll(s: RunState): void {
  for (const h of s.team) {
    h.hp = 0;
    h.alive = false;
    h.downMs = DOWN_RECOVER_MS;
  }
}

/** 场上塞满怪，用来验「推不动」。堆的是数量，不涉及漏怪 */
function jamField(s: RunState, n = JAM_COUNT): void {
  while (s.enemies.length < n) {
    s.enemies.push(enemyAt(SPAWN_DIST, 9000 + s.enemies.length));
  }
  // 堆在出场点：测的是「场上人多」，不能再塞进交战圈里被秒掉或把人锤死
  for (const e of s.enemies) {
    if (e.id >= 9000) e.dist = SPAWN_DIST;
  }
}

function enemyAt(dist: number, id = 1, protoId = 'cube'): EnemyUnit {
  const proto = getEnemyProto(protoId);
  return {
    id,
    proto: { ...proto, hp: 300, atk: 20 },
    hp: 300,
    maxHp: 300,
    atk: 20,
    dist,
    cdMs: 0,
    slowMs: 0,
    slowPct: 0,
    shell: proto.shell?.hp ?? 0,
    isShard: false,
  };
}

/**
 * 把一局推进到满足 pred 为止。装配阶段若还没达成条件就默认装给第一个人，
 * 免得卡在等玩家点击的状态里空转。
 */
function runUntil(
  state: RunState,
  pred: (s: RunState) => boolean,
  limit = 60_000,
): boolean {
  for (let i = 0; i < limit; i += 1) {
    if (pred(state)) return true;
    if (state.phase === 'won' || state.phase === 'lost') return false;
    if (state.phase === 'picking') {
      const opt = state.pendingOptions.find(
        (o) => o.kind === 'mod' || !state.team.some((h) => h.def.id === o.heroId),
      );
      if (!opt) return false;
      applyPick(state, opt);
      continue;
    }
    if (state.phase === 'installing') {
      const target = installTargets(state)[0];
      if (!target) return false;
      installMod(state, target.def.id);
      continue;
    }
    tick(state);
    state.events.length = 0;
  }
  return false;
}

// ── 布局与失败条件 ──────────────────────────────────────

describe('队列站位', () => {
  it('队首坐标为 0，往后依次退一格', () => {
    expect(slotPos(0)).toBe(0);
    expect(slotPos(1)).toBe(-1);
    expect(slotPos(2)).toBe(-2);
    expect(REAR_POS).toBe(slotPos(TEAM_SIZE - 1));
  });

  it('画面三角：前排居中靠前，两人分列左后右后', () => {
    expect(slotScreenX(0)).toBe(SQUAD_X);
    expect(slotScreenX(1)).toBe(SQUAD_X - BACK_DX);
    expect(slotScreenX(2)).toBe(SQUAD_X + BACK_DX);
    expect(slotScreenY(0, 800)).toBe(800);
    expect(slotScreenY(1, 800)).toBe(800 + BACK_DY);
    expect(slotScreenY(2, 800)).toBe(800 + BACK_DY);
    expect(slotTagPos(1, 279, 862).x).toBeLessThan(279);
    expect(slotTagPos(2, 471, 862).x).toBeGreaterThan(471);
    const boxes = [0, 1, 2].map((slot) => {
      const box = slotHitBox(slot);
      const x = slotScreenX(slot);
      return { l: x + box.x, r: x + box.x + box.w };
    });
    expect(boxes[1]!.r).toBeLessThan(boxes[0]!.l);
    expect(boxes[0]!.r).toBeLessThan(boxes[2]!.l);
  });

  it('外星人先打队首，后面的人被替着挡刀', () => {
    const team = [unit('laoyanqiang', 0), unit('tiezhu', 1), unit('erjiu', 2)];
    const victim = enemyVictim(enemyAt(0.5), team);
    expect(victim?.slot).toBe(0);
  });

  it('队首倒下后才轮到第二个人', () => {
    const team = [unit('laoyanqiang', 0), unit('tiezhu', 1)];
    team[0]!.alive = false;
    // 站 0.5 打不到 -1 的人，得再往前走
    expect(enemyVictim(enemyAt(0.5), team)).toBeUndefined();
    expect(enemyVictim(enemyAt(-0.5), team)?.slot).toBe(1);
  });

  it('够不着时不出手，继续往前走', () => {
    const team = [unit('tiezhu', 0)];
    expect(enemyVictim(enemyAt(MELEE_REACH + 0.1), team)).toBeUndefined();
  });

  it('挤到身上或刚挤过去仍算贴脸，不会走进队里就失踪', () => {
    const team = [unit('tiezhu', 0), unit('dachui', 1), unit('sanshen', 2)];
    expect(enemyVictim(enemyAt(0), team)?.slot).toBe(0);
    expect(enemyVictim(enemyAt(-0.2), team)?.slot).toBe(0);
    expect(enemyVictim(enemyAt(REAR_POS - MELEE_REACH), team)?.slot).toBe(2);
  });

  it('脚边和身后一格的怪，村民还打得到', () => {
    const front = unit('tiezhu', 0);
    const rear = unit('sanshen', 2);
    expect(heroCanReach(front, 0)).toBe(true);
    expect(heroCanReach(front, -MELEE_REACH)).toBe(true);
    expect(heroCanReach(front, -MELEE_REACH - 0.1)).toBe(false);
    expect(heroCanReach(rear, REAR_POS - MELEE_REACH)).toBe(true);
  });

  it('卡在队尾缓冲里的铁罐，出手一下就能打到', () => {
    const s = createRun(88);
    runUntil(s, (x) => x.phase === 'fighting');
    const stuck = enemyAt(REAR_POS - MELEE_REACH, 7701, 'canister');
    stuck.proto = getEnemyProto('canister');
    stuck.hp = 400;
    stuck.maxHp = 400;
    stuck.shell = 0;
    s.enemies = [stuck];
    for (const h of s.team) h.cdMs = 0;
    tick(s);
    expect(stuck.hp).toBeLessThan(400);
  });

  it('飞碟进村口打后排，脆皮躲后面会被点名', () => {
    const team = [unit('tiezhu', 0), unit('dachui', 1), unit('sanshen', 2)];
    expect(enemyVictim(enemyAt(1.5, 1, 'saucer'), team)?.slot).toBe(2);
  });

  it('飞碟还在路上不打', () => {
    const team = [unit('tiezhu', 0), unit('sanshen', 2)];
    expect(enemyVictim(enemyAt(BACK_AIM_DIST + 0.2, 1, 'saucer'), team)).toBeUndefined();
  });

  it('飞碟来时后排倒了才轮到前面', () => {
    const team = [unit('tiezhu', 0), unit('sanshen', 2)];
    team[1]!.alive = false;
    expect(enemyVictim(enemyAt(1.5, 1, 'saucer'), team)?.slot).toBe(0);
  });

  it('射程从自己的位置往外算，站得靠后就够得更远', () => {
    // 老烟枪射程 5：站队首够到 5，退到第三位只够到 3
    expect(heroReach(unit('laoyanqiang', 0))).toBe(5);
    expect(heroReach(unit('laoyanqiang', 2))).toBe(3);
  });

  it('出场点留出了空场，落地时谁都打不到', () => {
    const backline = unit('laoyanqiang', TEAM_SIZE - 1);
    expect(heroReach(backline)).toBeLessThan(SPAWN_DIST);
  });
});

describe('失败条件是队灭，不是漏怪', () => {
  it('RunState 上不存在底线血这类字段', () => {
    const s = createRun(7) as unknown as Record<string, unknown>;
    expect(s.baseHp).toBeUndefined();
    expect(s.maxBaseHp).toBeUndefined();
  });

  it('战斗事件里没有漏怪这回事', () => {
    const s = createRun(11);
    const kinds = new Set<string>();
    runUntil(s, (x) => x.phase === 'won' || x.phase === 'lost' || x.wave > 6);
    for (const ev of s.events) kinds.add(ev.kind);
    expect([...kinds]).not.toContain('leak');
  });

  it('全队同时躺下即判负', () => {
    const s = createRun(3);
    runUntil(s, (x) => x.phase === 'fighting');
    dropAll(s);
    tick(s);
    expect(s.phase).toBe('lost');
    expect(s.loseReason).toBe('wipe');
  });

  it('推不动记成 timeout，不是队灭', () => {
    const s = createRun(3);
    runUntil(s, (x) => x.phase === 'fighting');
    jamField(s);
    // 堆够数还得堆够时间，一瞬间的拥挤不算推不动
    for (let i = 0; i * TICK_MS <= JAM_MS + TICK_MS; i += 1) {
      if (s.phase !== 'fighting') break;
      jamField(s);
      tick(s);
    }
    expect(s.phase).toBe('lost');
    expect(s.loseReason).toBe('timeout');
  });

  it('堆一下就清掉不算推不动', () => {
    const s = createRun(3);
    runUntil(s, (x) => x.phase === 'fighting');
    jamField(s);
    tick(s);
    expect(s.jamMs).toBeGreaterThan(0);
    s.enemies = [];
    // 清下去之后计时器要往回退，不能停在原地等着下次一碰就死
    const before = s.jamMs;
    tick(s);
    expect(s.jamMs).toBeLessThan(before);
    expect(s.phase).toBe('fighting');
  });

  it('队灭后可以就地站起，场上的怪还在', () => {
    const s = createRun(3);
    runUntil(s, (x) => x.phase === 'fighting' && x.enemies.length > 0);
    const standing = s.enemies.length;
    dropAll(s);
    tick(s);
    expect(reviveAfterWipe(s)).toBe(true);
    expect(s.phase).toBe('fighting');
    expect(s.team.every((h) => h.alive && h.hp > 0)).toBe(true);
    expect(s.enemies.length).toBe(standing);
    expect(s.loseReason).toBeUndefined();
  });

  it('推不动不能靠复活过', () => {
    const s = createRun(3);
    runUntil(s, (x) => x.phase === 'fighting');
    for (let i = 0; i * TICK_MS <= JAM_MS + TICK_MS; i += 1) {
      if (s.phase !== 'fighting') break;
      jamField(s);
      tick(s);
    }
    expect(s.loseReason).toBe('timeout');
    expect(reviveAfterWipe(s)).toBe(false);
    expect(s.phase).toBe('lost');
  });

  it('结算废品跟波次和改装件数走', () => {
    expect(runScrap(10, 3)).toBe(10 * 8 + 3 * 4);
  });

  it('队灭复活给一段堆积豁免，免得广告白看', () => {
    const s = createRun(3);
    runUntil(s, (x) => x.phase === 'fighting');
    jamField(s);
    dropAll(s);
    tick(s);
    expect(reviveAfterWipe(s)).toBe(true);
    // 站起来时场上那堆怪还在，计时器得先从负数爬回 0
    expect(s.jamMs).toBe(-REVIVE_GRACE_MS);
    jamField(s);
    tick(s);
    expect(s.phase).toBe('fighting');
  });

  it('外星人推到队尾后面也不会直接结束这一局', () => {
    const s = createRun(5);
    runUntil(s, (x) => x.phase === 'fighting' && x.enemies.length > 0);
    // 人还活着，怪已经推到最深处：不许因为位置判负
    for (const e of s.enemies) e.dist = REAR_POS - MELEE_REACH;
    tick(s);
    expect(s.phase).toBe('fighting');
  });
});

// ── 连续战场 ────────────────────────────────────────────

/**
 * 这一组守的是「一个图不断出怪」这件事本身。
 *
 * 从前 15 波是 15 场互不相干的小仗：打光一波就清场、全员满血、重新开打，
 * 每一波开头都像重开一局。这组测试盯的就是那几个断点有没有真的没了。
 */
describe('一个图不断出怪，不是十五场小仗', () => {
  it('时间到就换刻度，不等你清完场', () => {
    const s = createRun(11);
    runUntil(s, (x) => x.phase === 'fighting');
    // 故意留一堆怪在场上：从前这会把过波卡住，现在刻度照走
    jamField(s, 6);
    s.totalMs = stageStartMs(2) - TICK_MS;
    tick(s);
    expect(s.wave).toBe(2);
    expect(s.enemies.length).toBeGreaterThan(0);
  });

  it('过刻度不清场：怪一只都不许少', () => {
    const s = createRun(12);
    runUntil(s, (x) => x.phase === 'fighting' && x.enemies.length > 0);
    const ids = s.enemies.map((e) => e.id);
    s.totalMs = stageStartMs(2) - TICK_MS;
    tick(s);
    expect(s.wave).toBe(2);
    for (const id of ids) expect(s.enemies.some((e) => e.id === id)).toBe(true);
  });

  it('过刻度只回一小口血，不是满血重开', () => {
    const s = createRun(13);
    runUntil(s, (x) => x.phase === 'fighting');
    const h = s.team[0]!;
    h.hp = h.maxHp * 0.3;
    s.totalMs = stageStartMs(2) - TICK_MS;
    tick(s);
    expect(s.wave).toBe(2);
    expect(h.hp).toBeGreaterThan(h.maxHp * 0.3);
    // 回满就等于把「一波一场」原样搬回来了，损耗必须能累积
    expect(h.hp).toBeLessThan(h.maxHp);
    expect(h.hp).toBeLessThanOrEqual(h.maxHp * (0.3 + STAGE_HEAL_PCT / 100) + 1);
  });

  it('倒下的人自己爬起来，带的血不是满的', () => {
    const s = createRun(14);
    runUntil(s, (x) => x.phase === 'fighting');
    const victim = s.team[0]!;
    const others = s.team.filter((h) => h !== victim);
    expect(others.length).toBeGreaterThan(0);
    victim.hp = 0;
    victim.alive = false;
    victim.downMs = DOWN_RECOVER_MS;
    // 躺着期间不许提前起来
    tick(s);
    expect(victim.alive).toBe(false);
    for (let i = 0; i * TICK_MS <= DOWN_RECOVER_MS + TICK_MS; i += 1) {
      if (victim.alive || s.phase !== 'fighting') break;
      tick(s);
    }
    expect(victim.alive).toBe(true);
    expect(victim.hp).toBeCloseTo(victim.maxHp * (DOWN_RECOVER_HP_PCT / 100), 0);
  });

  it('躺着的人在自愈途中，全队都躺下照样判负', () => {
    const s = createRun(15);
    runUntil(s, (x) => x.phase === 'fighting');
    // 三个人都在自愈倒计时里 —— 张力就在这儿：等得起一个，等不起三个
    dropAll(s);
    tick(s);
    expect(s.phase).toBe('lost');
    expect(s.loseReason).toBe('wipe');
  });

  it('摩托头盔的「一次」跟着刻度重开，越挨越猛跟着刻度清零', () => {
    const s = createRun(16);
    runUntil(s, (x) => x.phase === 'fighting');
    const h = s.team[0]!;
    h.usedRevive = true;
    h.rageStacks = 5;
    s.totalMs = stageStartMs(2) - TICK_MS;
    tick(s);
    expect(s.wave).toBe(2);
    expect(h.usedRevive).toBe(false);
    expect(h.rageStacks).toBe(0);
  });

  it('打完最后一批才算赢，不是走到第十五个刻度就赢', () => {
    const s = createRun(17);
    runUntil(s, (x) => x.phase === 'fighting');
    s.totalMs = stageStartMs(TOTAL_WAVES) + STAGE_MS;
    jamField(s, 3);
    tick(s);
    expect(s.wave).toBe(TOTAL_WAVES);
    expect(s.phase).toBe('fighting');
    s.enemies = [];
    tick(s);
    expect(s.phase).toBe('won');
  });

  it('出怪排在整局的时间轴上，强度仍按各自的刻度缩放', () => {
    const s = createRun(18);
    runUntil(s, (x) => x.phase === 'fighting' && x.enemies.length > 0);
    const early = Math.max(...s.enemies.map((e) => e.maxHp));
    // 跳到后面的刻度：同一张时间轴，但那批怪该按自己那一档的曲线放大
    s.enemies = [];
    s.totalMs = stageStartMs(6);
    runUntil(s, (x) => x.enemies.length > 0 || x.phase !== 'fighting');
    const late = Math.max(...s.enemies.map((e) => e.maxHp));
    expect(s.enemies.length).toBeGreaterThan(0);
    expect(late).toBeGreaterThan(early);
  });

  it('场上清了就接着来，不等下一个刻度', () => {
    const s = createRun(21);
    runUntil(s, (x) => x.phase === 'fighting');
    // 跳过第 1 波的出怪窗口，再清场：按旧表，下一批要等到第 30 秒
    s.totalMs = 8_000;
    tick(s);
    s.enemies = [];
    s.pets = [];
    expect(s.totalMs).toBeLessThan(stageStartMs(2));
    const before = s.totalMs;
    const reached = runUntil(s, (x) => x.enemies.length > 0, 80);
    expect(reached).toBe(true);
    expect(s.totalMs - before).toBeLessThanOrEqual(EMPTY_PULL_MS + TICK_MS * 2);
    expect(s.totalMs).toBeLessThan(stageStartMs(2));
  });

  it('第一张牌在还打着的时候发，不卡在清完场那一帧', () => {
    const s = createRun(22);
    runUntil(s, (x) => x.phase === 'installing' || x.phase === 'won' || x.phase === 'lost');
    expect(s.phase).toBe('installing');
    expect(s.enemies.length).toBeGreaterThan(0);
  });
});

// ── 难度阶梯 ────────────────────────────────────────────

/** 数一数这一档到某个时刻总共放出来多少只 */
function spawnedBy(ladderLv: number, untilMs: number, seed = 91): number {
  const s = createRun(seed, 0, 'ad', '', undefined, undefined, '', ladderLv);
  runUntil(s, (x) => x.phase === 'fighting');
  let seen = 0;
  const ids = new Set<number>();
  while (s.totalMs < untilMs && s.phase === 'fighting') {
    // 清空场面只为了数「放出来过几只」，不让它们互相打死影响计数。
    // 留一只占场，否则空场会把后面的表抽上来，数的就不是这条时间轴上排了多少
    for (const e of s.enemies) ids.add(e.id);
    const hold = s.enemies[0];
    s.enemies = hold ? [{ ...hold, hp: 9_999, dist: 0 }] : [];
    if (s.enemies.length === 0) jamField(s, 1);
    tick(s);
  }
  for (const e of s.enemies) ids.add(e.id);
  seen = ids.size;
  return seen;
}

describe('难度阶梯真的落在局里', () => {
  it('照旧那一档跟没有阶梯时一模一样', () => {
    const plain = createRun(31);
    const lv0 = createRun(31, 0, 'ad', '', undefined, undefined, '', 0);
    expect(lv0.ladderLv).toBe(0);
    expect(plain.ladderLv).toBe(0);
  });

  it('第一档半程多来一小队：同样一段时间里放出来的怪更多', () => {
    const until = stageStartMs(4);
    expect(spawnedBy(1, until)).toBeGreaterThan(spawnedBy(0, until));
  });

  it('第二档刻度缩短：刻度换得更早', () => {
    const s = createRun(32, 0, 'ad', '', undefined, undefined, '', 2);
    runUntil(s, (x) => x.phase === 'fighting');
    const plainStage2 = stageStartMs(2);
    s.totalMs = ladderStageMs(2, STAGE_MS) * 1 - TICK_MS;
    tick(s);
    expect(s.wave).toBe(2);
    // 照旧那一档在这个时刻还没到第二个刻度
    expect(ladderStageMs(2, STAGE_MS)).toBeLessThan(plainStage2);
  });

  it('第三档倒下爬得更慢', () => {
    const s = createRun(33, 0, 'ad', '', undefined, undefined, '', 3);
    runUntil(s, (x) => x.phase === 'fighting');
    const h = s.team[0]!;
    h.hp = 1;
    // 让一只怪把他打倒，看躺下的计时给了多长
    const e = s.enemies[0] ?? (jamField(s, 1), s.enemies[0]!);
    e.dist = 0;
    let guard = 0;
    while (h.alive && guard++ < 4000) tick(s);
    expect(h.alive).toBe(false);
    expect(h.downMs).toBeGreaterThan(DOWN_RECOVER_MS);
    expect(h.downMs).toBeLessThanOrEqual(DOWN_RECOVER_MS * ladderDownMult(3));
  });

  it('存档里的档带进这一局，不是每局都从照旧开始', () => {
    const s = createRun(34, 0, 'ad', '', undefined, undefined, '', 2);
    expect(s.ladderLv).toBe(2);
  });

  it('乱传的档一律压回范围内', () => {
    expect(createRun(35, 0, 'ad', '', undefined, undefined, '', 99).ladderLv).toBe(LADDER_TOP);
    expect(createRun(36, 0, 'ad', '', undefined, undefined, '', -5).ladderLv).toBe(0);
  });
});

// ── 改装件 ──────────────────────────────────────────────

describe('改装件能改定位，而不只是加数值', () => {
  it('电锯焊给远程就得贴脸，焊给近战只加伤害', () => {
    const ranged = computeStats(getHero('sanshen'), []);
    const sawed = computeStats(getHero('sanshen'), [getMod('chainsaw')]);
    expect(ranged.range).toBeGreaterThan(1);
    expect(sawed.range).toBe(1);
    expect(sawed.atk).toBeGreaterThan(ranged.atk);
    const melee = computeStats(getHero('tiezhu'), [getMod('chainsaw')]);
    expect(melee.range).toBe(1);
  });

  it('水管加电锯仍能站后面，不被焊死成近战', () => {
    const st = computeStats(getHero('tiezhu'), [getMod('pipe'), getMod('chainsaw')]);
    expect(st.range).toBe(4);
  });

  it('装配预告：同一件装三个人说法不一样', () => {
    const pipe = getMod('pipe');
    const melee = installForecast(unit('tiezhu', 0), pipe);
    const ranged = installForecast(unit('sanshen', 2), pipe);
    expect(melee.fit).toBe('good');
    expect(ranged.fit).toBe('waste');
    expect(melee.line).not.toBe(ranged.line);
  });

  it('接了根长水管把近战改成远程', () => {
    const before = computeStats(getHero('tiezhu'), []);
    const after = computeStats(getHero('tiezhu'), [getMod('pipe')]);
    expect(before.range).toBe(1);
    expect(after.range).toBe(4);
  });

  it('秤砣绑手上：出手更慢，单下更重', () => {
    const base = computeStats(getHero('dachui'), []);
    const heavy = computeStats(getHero('dachui'), [getMod('weight')]);
    expect(heavy.intervalMs).toBeGreaterThan(base.intervalMs);
    expect(heavy.heavyMult).toBeGreaterThan(1);
    // 净 DPS 要真的提升，否则这件只是纯负面
    const dps = (st: { atk: number; intervalMs: number; heavyMult: number }) =>
      (st.atk * st.heavyMult) / st.intervalMs;
    expect(dps(heavy)).toBeGreaterThan(dps(base));
  });

  it('背了个高压锅：挨打累积攻击加成', () => {
    const st = computeStats(getHero('tiezhu'), [getMod('pressurecooker')]);
    expect(st.ragePerHit).toBeGreaterThan(0);
    expect(st.rageMaxStacks).toBeGreaterThan(0);
  });

  it('多件一起装会同时生效', () => {
    const st = computeStats(getHero('tiezhu'), [getMod('pipe'), getMod('chainsaw'), getMod('quilt')]);
    expect(st.range).toBe(4);
    expect(st.atk).toBeGreaterThan(getHero('tiezhu').atk);
    expect(st.armorPct).toBe(30);
  });

  it('溅射取更强的一份而不是叠加', () => {
    // 三婶自带溅射 55%，再装鼓风机 60%，结果应是 60% 而不是 115%
    const st = computeStats(getHero('sanshen'), [getMod('blower')]);
    expect(st.splash?.damagePct).toBe(60);
  });

  it('每件改装件都写明了装上之后变成什么', () => {
    for (const m of MODS) {
      expect(m.becomes.length).toBeGreaterThan(0);
      expect(m.desc.length).toBeGreaterThan(0);
    }
  });

  it('改定位的那一类占多数，纯数值的是少数', () => {
    const pivot = MODS.filter((m) => m.kind === 'pivot').length;
    const pure = MODS.filter((m) => m.kind === 'output').length;
    expect(pivot).toBeGreaterThan(pure);
  });

  it('水管加电锯点名合体，多穿一个', () => {
    expect(comboOf(['pipe', 'chainsaw'])?.id).toBe('longsaw');
    const alone = computeStats(getHero('tiezhu'), [getMod('pipe'), getMod('chainsaw')]);
    const pipe = computeStats(getHero('tiezhu'), [getMod('pipe')]);
    expect(alone.pierce).toBe(pipe.pierce + 1);
    expect(resolveAttackFx(getHero('tiezhu'), [getMod('pipe'), getMod('chainsaw')])).toBe('saw');
  });

  it('头盔加棉被把复活加厚', () => {
    const lid = computeStats(getHero('erjiu'), [getMod('helmet'), getMod('quilt')]);
    const helm = computeStats(getHero('erjiu'), [getMod('helmet')]);
    expect(lid.revivePct).toBeGreaterThan(helm.revivePct);
    expect(lid.armorPct).toBeGreaterThan(helm.armorPct);
  });

  it('摩托头盔让人本波倒下一次还能站起来，但只有一次', () => {
    const s = createRun(21);
    runUntil(s, (x) => x.phase === 'fighting');
    const head = teamInOrder(s)[0]!;
    head.mods.push(getMod('helmet'));
    head.stats = computeStats(head.def, head.mods);
    expect(head.stats.revivePct).toBeGreaterThan(0);
    expect(head.usedRevive).toBe(false);
  });
});

// ── 装配这一步 ──────────────────────────────────────────

describe('「装给谁」是独立的一步', () => {
  it('选中改装件后进入装配阶段，不直接开打', () => {
    const s = createRun(31);
    const reached = runUntil(s, (x) => x.phase === 'installing');
    expect(reached).toBe(true);
    expect(s.pendingMod).toBeDefined();
    // 场上有怪是对的：发牌由经验触发，落在打到一半的时候，
    // 战场就冻在原地等你点人 —— 从前是清完场才发牌
    const frozen = s.enemies.map((e) => `${e.id}:${e.dist}`);
    tick(s);
    expect(s.enemies.map((e) => `${e.id}:${e.dist}`)).toEqual(frozen);
  });

  it('装上之后才开打', () => {
    const s = createRun(33);
    runUntil(s, (x) => x.phase === 'installing');
    const target = installTargets(s)[0]!;
    const before = target.mods.length;
    expect(installMod(s, target.def.id)).toBe(true);
    expect(target.mods.length).toBe(before + 1);
    expect(s.phase).toBe('fighting');
  });

  it('装配会发出事件，好让画面演一次', () => {
    const s = createRun(37);
    runUntil(s, (x) => x.phase === 'installing');
    s.events.length = 0;
    const target = installTargets(s)[0]!;
    installMod(s, target.def.id);
    expect(s.events.some((e) => e.kind === 'install')).toBe(true);
  });

  it('每人最多三件，装满就不再是可选目标', () => {
    const s = createRun(41);
    runUntil(s, (x) => x.phase === 'installing');
    const target = installTargets(s)[0]!;
    while (target.mods.length < MOD_SLOTS_PER_HERO) target.mods.push(getMod('chainsaw'));
    expect(installTargets(s).map((h) => h.def.id)).not.toContain(target.def.id);
  });

  it('全员改装位满了也不会卡死在装配阶段', () => {
    const s = createRun(43);
    runUntil(s, (x) => x.phase === 'installing');
    for (const h of s.team) {
      while (h.mods.length < MOD_SLOTS_PER_HERO) h.mods.push(getMod('chainsaw'));
    }
    // 重新走一次选牌：此时没有可装的人，引擎应直接开打
    s.phase = 'picking';
    s.pendingMod = undefined;
    s.pendingOptions = [{ kind: 'mod', modId: 'speaker' }];
    applyPick(s, s.pendingOptions[0]!);
    expect(s.phase).toBe('fighting');
  });
});

describe('本局废品', () => {
  it('开局可以带着上一局剩下的废品', () => {
    const s = createRun(1, 20);
    expect(s.scrap).toBe(20);
    expect(s.scrapEarned).toBe(20);
    expect(s.scrapSpent).toBe(0);
    expect(s.seed).toBe(1);
    expect(s.scrapLog).toEqual([{ amount: 20, source: 'ad' }]);
  });

  it('装上发的废品记成 free', () => {
    const s = createRun(33);
    runUntil(s, (x) => x.phase === 'installing');
    const target = installTargets(s)[0]!;
    expect(installMod(s, target.def.id)).toBe(true);
    expect(s.scrapLog[s.scrapLog.length - 1]).toEqual({ amount: SCRAP_PER_INSTALL, source: 'free' });
  });

  it('重抽扣废品并换一批', () => {
    const s = createRun(71, 30);
    const reached = runUntil(s, (x) => x.phase === 'picking' && x.pendingOptions[0]?.kind === 'mod');
    expect(reached).toBe(true);
    const before = s.pendingOptions.map((o) => (o.kind === 'mod' ? o.modId : '')).join(',');
    const scrap = s.scrap;
    expect(rerollMods(s)).toBe(true);
    expect(s.scrap).toBe(scrap - REROLL_COST);
    expect(s.scrapSpent).toBe(REROLL_COST);
    expect(s.pendingOptions).toHaveLength(3);
    expect(s.pendingOptions.every((o) => o.kind === 'mod')).toBe(true);
    const after = s.pendingOptions.map((o) => (o.kind === 'mod' ? o.modId : '')).join(',');
    expect(after).not.toBe(before);
  });

  it('废品不够不能重抽', () => {
    const s = createRun(73, 0);
    runUntil(s, (x) => x.phase === 'picking' && x.pendingOptions[0]?.kind === 'mod');
    s.scrap = 0;
    const before = s.pendingOptions.map((o) => (o.kind === 'mod' ? o.modId : '')).join(',');
    expect(rerollMods(s)).toBe(false);
    expect(s.pendingOptions.map((o) => (o.kind === 'mod' ? o.modId : '')).join(',')).toBe(before);
  });

  it('拆一件腾槽并退回本局池', () => {
    const s = createRun(41, 40);
    runUntil(s, (x) => x.phase === 'installing');
    const hero = installTargets(s)[0]!;
    hero.mods.push(getMod('chainsaw'));
    hero.stats = computeStats(hero.def, hero.mods);
    const scrap = s.scrap;
    expect(stripMod(s, hero.def.id, hero.mods.length - 1)).toBe(true);
    expect(hero.mods.some((m) => m.id === 'chainsaw')).toBe(false);
    expect(s.modPool.some((m) => m.id === 'chainsaw')).toBe(true);
    expect(s.scrap).toBe(scrap - STRIP_COST);
    expect(canInstallOn(hero)).toBe(true);
  });
});

describe('发牌规则', () => {
  it('点齐三个人直接开打，进场不再先选破烂', () => {
    const s = createRun(51);
    expect(s.pendingOptions.every((o) => o.kind === 'recruit')).toBe(true);
    expect(s.pendingOptions.length).toBe(HEROES.length);
    applyPick(s, { kind: 'recruit', heroId: 'tiezhu' });
    expect(s.phase).toBe('picking');
    expect(s.team).toHaveLength(1);
    applyPick(s, { kind: 'recruit', heroId: 'tiezhu' });
    expect(s.team).toHaveLength(0);
    applyPick(s, { kind: 'recruit', heroId: 'tiezhu' });
    applyPick(s, { kind: 'recruit', heroId: 'dachui' });
    applyPick(s, { kind: 'recruit', heroId: 'sanshen' });
    expect(s.team).toHaveLength(TEAM_SIZE);
    expect(s.phase).toBe('fighting');
    expect(s.wave).toBe(1);
  });

  it('带着三人进场直接开打', () => {
    const s = createRun(52, 0, 'ad', '', undefined, ['tiezhu', 'dachui', 'sanshen']);
    expect(s.phase).toBe('fighting');
    expect(s.team).toHaveLength(TEAM_SIZE);
    expect(s.pendingOptions).toHaveLength(0);
  });

  it('村子排好的位子进场不重排', () => {
    const s = createRun(52, 0, 'ad', '', undefined, ['sanshen', 'dachui', 'laoyanqiang']);
    expect(s.team.find((h) => h.slot === 0)?.def.id).toBe('sanshen');
    expect(s.team.find((h) => h.slot === 1)?.def.id).toBe('dachui');
    expect(s.team.find((h) => h.slot === 2)?.def.id).toBe('laoyanqiang');
  });

  it('首局白送的破烂点满三人后自动焊上再开打', () => {
    const s = createRun(57);
    const gift = claimOpeningGift(s);
    expect(gift).toBeDefined();
    expect(gift!.kind).toBe('pivot');
    applyPick(s, { kind: 'recruit', heroId: 'tiezhu' });
    applyPick(s, { kind: 'recruit', heroId: 'dachui' });
    applyPick(s, { kind: 'recruit', heroId: 'sanshen' });
    expect(s.phase).toBe('fighting');
    expect(s.team.some((h) => h.mods.some((m) => m.id === gift!.id))).toBe(true);
    expect(s.wave).toBe(1);
  });

  it('翻废品站翻到的破烂下一手三选一必出', () => {
    const s = createRun(59);
    const found = claimJunkyard(s);
    expect(found).toBeDefined();
    s.wave = 2;
    s.pendingOptions = buildOptions(s);
    expect(s.pendingOptions[0]).toEqual({ kind: 'mod', modId: found!.id });
  });

  it('createRun 可以带进上一局翻到的件', () => {
    const s = createRun(60, 0, 'ad', 'pipe');
    expect(s.pinnedMods.map((m) => m.id)).toEqual(['pipe']);
    expect(s.modPool.some((m) => m.id === 'pipe')).toBe(false);
  });

  it('破烂不用买，开打全在池子里', () => {
    expect(isModUnlocked('pipe', [])).toBe(true);
    expect(isModUnlocked('chainsaw', [])).toBe(true);
    expect(availableMods([]).some((m) => m.id === 'chainsaw')).toBe(true);
    const s = createRun(61, 0, 'ad', '', []);
    expect(s.modPool.some((m) => m.id === 'chainsaw') || s.pinnedMods.some((m) => m.id === 'chainsaw')).toBe(true);
    expect(s.modPool.some((m) => m.id === 'pipe') || s.pinnedMods.some((m) => m.id === 'pipe')).toBe(true);
  });

  it('翻到的钉子能进第一手', () => {
    const s = createRun(62, 0, 'ad', 'chainsaw');
    expect(s.pinnedMods.map((m) => m.id)).toEqual(['chainsaw']);
  });

  it('进场先焊：人齐了身上已经有件破烂', () => {
    const s = createRun(
      63,
      0,
      'ad',
      '',
      undefined,
      ['tiezhu', 'dachui', 'laoyanqiang'],
      '',
      0,
      0,
      { expPct: 0, freeRerolls: 0, luckPicks: 0, startWelds: 1, freeRevives: 0 },
    );
    expect(s.team.some((h) => h.mods.length > 0)).toBe(true);
  });

  it('走得越深废品堆进账越多', () => {
    expect(yardDeposit(10, 20)).toBe(20 + 50);
    expect(yardDeposit(1, 0)).toBeGreaterThan(0);
  });

  it('开打之后发的都是改装件', () => {
    const s = createRun(53);
    const seen: string[] = [];
    runUntil(s, (x) => {
      if (x.phase === 'picking' && x.pendingOptions[0]?.kind === 'mod') {
        for (const o of x.pendingOptions) seen.push(o.kind);
      }
      return x.wave >= 8;
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen)).toEqual(new Set(['mod']));
  });

  it('每次至少给一张能改定位的', () => {
    for (const seed of [61, 62, 63, 64]) {
      const s = createRun(seed);
      runUntil(s, (x) => x.phase === 'installing');
      // 走到装配说明上一手三选一全是改装件，回看它给了什么
      expect(s.pendingMod).toBeDefined();
    }
    const s = createRun(65);
    let sawPivot = false;
    runUntil(s, (x) => {
      if (x.phase === 'picking' && x.pendingOptions[0]?.kind === 'mod') {
        sawPivot = x.pendingOptions.some(
          (o) => o.kind === 'mod' && getMod(o.modId).kind === 'pivot',
        );
        return true;
      }
      return false;
    });
    expect(sawPivot).toBe(true);
  });

  it('同一件改装件一局只发一次', () => {
    for (const seed of [71, 72, 73]) {
      const r = simulateRun({ strategy: 'smart', seed });
      const all = r.team.flatMap((t) => t.mods);
      expect(new Set(all).size).toBe(all.length);
    }
  });

  it('一局发出的改装件数量不超过池子大小', () => {
    const r = simulateRun({ strategy: 'spread', seed: 77 });
    expect(r.installs).toBeLessThanOrEqual(MODS.length);
    expect(r.installs).toBeGreaterThan(0);
  });
});

// ── 发牌由杀敌驱动，不再由波次驱动 ──────────────────────

describe('捡破烂的时机由杀敌决定', () => {
  const SQUAD = ['tiezhu', 'dachui', 'sanshen'] as const;

  it('档位表递增，发完就不再发', () => {
    for (let i = 1; i < LEVEL_EXP.length; i += 1) {
      expect(LEVEL_EXP[i]!).toBeGreaterThan(LEVEL_EXP[i - 1]!);
    }
    expect(levelThreshold(0)).toBe(LEVEL_EXP[0]);
    expect(levelThreshold(LEVEL_EXP.length)).toBeUndefined();
    // 池子二十多件，档数必须少于件数，否则「每件一局只出一次」撑不住
    expect(LEVEL_EXP.length).toBeLessThan(MODS.length);
  });

  it('越硬的外星人给的经验和废品越多', () => {
    const chain = ['grey', 'cube', 'canister', 'saucer'].map(getEnemyProto);
    for (const p of chain) {
      expect(p.exp).toBeGreaterThan(0);
      expect(p.scrap).toBeGreaterThan(0);
    }
    for (let i = 1; i < chain.length; i += 1) {
      expect(chain[i]!.exp).toBeGreaterThan(chain[i - 1]!.exp);
      expect(chain[i]!.scrap).toBeGreaterThan(chain[i - 1]!.scrap);
    }
  });

  it('杀满第一波就攒够第一档，当场发牌而不是等过波', () => {
    const s = createRun(101, 0, 'ad', '', undefined, SQUAD);
    expect(s.exp).toBe(0);
    expect(s.level).toBe(0);

    expect(runUntil(s, (x) => x.phase === 'picking')).toBe(true);
    expect(s.level).toBe(1);
    expect(s.exp).toBeGreaterThanOrEqual(LEVEL_EXP[0]!);
    expect(s.pendingOptions.every((o) => o.kind === 'mod')).toBe(true);
    // 还没过波就发了牌，这正是与旧的 PICK_WAVES 的区别
    expect(s.wave).toBe(1);
    // 第一档 5 点经验，5 只小灰各掉 0.5，累加器攒出 2 个整废品，余数留着
    expect(s.scrapEarned).toBe(2);
    expect(s.scrapFrac).toBeCloseTo(0.5);
  });

  it('打到一半发的牌，选完接着打同一波：怪还在，血也没回', () => {
    const s = createRun(102, 0, 'ad', '', undefined, SQUAD);
    // 场上还有怪时发的牌，才是「战斗中途发牌」
    expect(runUntil(s, (x) => x.phase === 'picking' && x.enemies.length > 0)).toBe(true);

    const wave = s.wave;
    const enemyIds = s.enemies.map((e) => e.id);
    const enemyHp = s.enemies.map((e) => e.hp);
    const heroHp = s.team.map((h) => h.hp);

    applyPick(s, s.pendingOptions[0]!);
    expect(s.phase).toBe('installing');
    expect(installMod(s, installTargets(s)[0]!.def.id)).toBe(true);

    expect(s.phase).toBe('fighting');
    expect(s.wave).toBe(wave);
    expect(s.enemies.map((e) => e.id)).toEqual(enemyIds);
    expect(s.enemies.map((e) => e.hp)).toEqual(enemyHp);
    expect(s.team.map((h) => h.hp)).toEqual(heroHp);
  });

  it('一局里确实有牌是打到一半发的', () => {
    let midFight = 0;
    for (const seed of [201, 202, 203, 204, 205]) {
      const s = createRun(seed, 0, 'ad', '', undefined, SQUAD);
      let guard = 0;
      while (s.phase !== 'won' && s.phase !== 'lost' && guard++ < 60_000) {
        if (s.phase === 'picking') {
          if (s.enemies.length > 0) midFight += 1;
          const opt = s.pendingOptions[0];
          if (!opt) break;
          applyPick(s, opt);
          continue;
        }
        if (s.phase === 'installing') {
          const t = installTargets(s)[0];
          if (!t) break;
          installMod(s, t.def.id);
          continue;
        }
        tick(s);
        s.events.length = 0;
      }
    }
    expect(midFight).toBeGreaterThan(0);
  });

  it('打得越深牌越多，且不超过档位数', () => {
    const shallow = simulateRun({ strategy: 'output', seed: 301 });
    const deep = simulateRun({ strategy: 'smart', seed: 301 });
    expect(deep.reachedWave).toBeGreaterThan(shallow.reachedWave);
    expect(deep.installs).toBeGreaterThan(shallow.installs);
    expect(deep.installs).toBeLessThanOrEqual(LEVEL_EXP.length);
  });
});

/**
 * 外星人的行为分化。
 *
 * 这一组守的是「压力有几个维度」。在此之前 WaveDef.pressure 写了硬 / 多 / 快
 * 三档，但只靠 waveHpMult 放大数值，行为上从未兑现 —— 逐波到达率里第 6、9、11
 * 波（都是「多」型）和前一波**完全相同**，玩家从不死在那儿，压力实际只有护甲
 * 一个维度。三种行为各自对应一类应对手段，这组测试锁的是那个对应关系还在。
 */
describe('外星人的行为分化', () => {
  function shellEnemy(dist = 1, protoId = 'canister'): EnemyUnit {
    const proto = getEnemyProto(protoId);
    const e = enemyAt(dist, 1, protoId);
    e.proto = proto;
    e.hp = proto.hp;
    e.maxHp = proto.hp;
    e.shell = proto.shell?.hp ?? 0;
    return e;
  }

  /**
   * 进战斗态并清掉场上的怪，只留测试自己放的那只。
   * 村民必须留着 —— tick 见到全队不在就直接判负返回，推进和清理都不会跑。
   * 出怪表还在继续加怪，所以断言一律按 isShard 或 id 认人，不数总长度。
   */
  function cleanBattle(seed: number): RunState {
    const s = createRun(seed);
    runUntil(s, (x) => x.phase === 'fighting');
    s.enemies = [];
    return s;
  }

  it('三种行为各安在一种外星人身上，且跟它的长相对得上', () => {
    // 铁罐有壳、方块兵砸碎会裂、小灰又小又快会扑上来
    expect(getEnemyProto('canister').shell).toBeTruthy();
    expect(getEnemyProto('cube').split).toBeTruthy();
    expect(getEnemyProto('grey').rush).toBeTruthy();
    // 飞碟不掺和，它已经有「飞过队首打后排」那一条了
    expect(getEnemyProto('saucer').aim).toBe('back');
  });

  it('壳把一次一小下的削成零头，一次一大下的几乎不受影响', () => {
    const shell = getEnemyProto('canister').shell!;
    const big = shell.flat * 10;

    const heavy = shellEnemy();
    const beforeHeavy = heavy.shell;
    damageEnemy(heavy, big);
    const heavyLanded = beforeHeavy - heavy.shell;

    // 同样的总伤害拆成十次小的，被壳吃掉的比例应该高得多
    const light = shellEnemy();
    const beforeLight = light.shell;
    for (let i = 0; i < 10; i += 1) damageEnemy(light, shell.flat);
    const lightLanded = beforeLight - light.shell;

    expect(heavyLanded).toBeGreaterThan(lightLanded * 3);
  });

  it('壳再厚也不做成完全免疫：小伤害保底推进一点', () => {
    const e = shellEnemy();
    const before = e.shell;
    damageEnemy(e, 1);
    expect(e.shell).toBeLessThan(before);
  });

  it('壳砸开之后就照常见血了', () => {
    const e = shellEnemy();
    const hp = e.hp;
    damageEnemy(e, e.shell + getEnemyProto('canister').shell!.flat + 500);
    expect(e.shell).toBe(0);
    expect(e.hp).toBeLessThan(hp);
  });

  it('方块兵砸碎了会裂成小块，小块不再往下裂', () => {
    const split = getEnemyProto('cube').split!;
    const s = cleanBattle(4242);
    s.enemies = [shellEnemy(2, 'cube')];

    s.enemies[0]!.hp = 0;
    tick(s);
    const shards = s.enemies.filter((e) => e.isShard);
    expect(shards).toHaveLength(split.count);

    s.enemies = shards;
    for (const e of s.enemies) e.hp = 0;
    tick(s);
    expect(s.enemies.filter((e) => e.isShard)).toHaveLength(0);
  });

  /**
   * 碎块不重复结算，否则分裂会把阶段一校准好的经验曲线整体通胀，
   * 「什么时候能捡下一件破烂」就跟着漂了。
   * 从整局看比逐次看更严：一局拿到的经验不许超过波次表里排的总量。
   */
  it('小块不重复给经验：一局的经验不超过波次表排的总量', () => {
    for (const seed of [777, 1010, 2323]) {
      const s = createRun(seed);
      runUntil(s, (x) => x.phase === 'lost' || x.phase === 'won');
      let cap = 0;
      for (let w = 1; w <= s.wave; w += 1) {
        for (const g of getWave(w).spawns) cap += getEnemyProto(g.enemyId).exp * g.count;
      }
      expect(s.exp).toBeLessThanOrEqual(cap);
    }
  });

  it('小灰走近了会加速扑上来，减速压得住这一段', () => {
    const rush = getEnemyProto('grey').rush!;

    const walked = (dist: number, slowPct = 0): number => {
      const s = cleanBattle(1);
      const e = enemyAt(dist, 9001, 'grey');
      e.proto = getEnemyProto('grey');
      e.slowMs = slowPct > 0 ? 2000 : 0;
      e.slowPct = slowPct;
      s.enemies = [e];
      tick(s);
      const after = s.enemies.find((x) => x.id === 9001);
      return dist - (after?.dist ?? dist);
    };

    const far = walked(rush.withinDist + 1.5);
    const near = walked(rush.withinDist - 0.1);
    expect(near).toBeGreaterThan(far * 1.5);
    expect(walked(rush.withinDist - 0.1, 35)).toBeLessThan(near);
  });
});

/**
 * 放出来的小东西。
 *
 * 这一组守的全是同一件事：**小东西的强弱必须由主人决定**。
 * 一旦哪天有人把它改成固定数值，「栓给谁」就退化成「装了就行」，
 * 这一件也就不配叫改装件了 —— 那些断言就是拦这个的。
 */
describe('栓出来的小东西', () => {
  /** 只留一个人、清空场地，方便盯住这一只是谁放的 */
  function loneOwner(heroId: string, modId: string, slot = 0): RunState {
    const s = createRun(1234);
    runUntil(s, (x) => x.phase === 'fighting');
    const h = unit(heroId, slot, [modId]);
    s.team = [h];
    s.enemies = [];
    s.pets = [];
    return s;
  }

  /** 攒到第一只放出来。cd 走完最多 everyMs，多给两倍余量 */
  function firstPet(s: RunState, everyMs: number): PetUnit {
    const limit = Math.ceil((everyMs * 2) / 100);
    for (let i = 0; i < limit && s.pets.length === 0; i += 1) tick(s);
    const p = s.pets[0];
    expect(p).toBeDefined();
    return p!;
  }

  /** 把村民的出手压住，好把小东西那一段单独看清楚 */
  function muteHeroes(s: RunState): void {
    for (const h of s.team) h.cdMs = 1e9;
  }

  it('三件放小东西的破烂都在池子里，各放一种', () => {
    const ids = ['dogleash', 'chickenfeed', 'holler'];
    const kinds = new Set<string>();
    for (const id of ids) {
      const eff = getMod(id).effect;
      expect(eff.kind).toBe('summon');
      if (eff.kind !== 'summon') continue;
      expect(PET_PROTOS.some((p) => p.id === eff.petId)).toBe(true);
      kinds.add(eff.petId);
    }
    expect(kinds.size).toBe(ids.length);
  });

  it('狗的攻击按主人算：栓给能打的就是另一条狗', () => {
    const beefy = firstPet(loneOwner('tiezhu', 'dogleash'), 7800);
    const punchy = firstPet(loneOwner('laoyanqiang', 'dogleash'), 7800);
    // 老烟枪 atk 210、铁柱 62，狗身上必须看得出这个差距
    expect(punchy.atk).toBeGreaterThan(beefy.atk * 2);
  });

  /**
   * 血量必须一视同仁。
   *
   * 试过跟着主人走，两版都把差异往反方向抹：栓给铁柱的狗攻击只有三分之一，
   * 却因为血厚挡刀挡得久，把「装错人」的亏补了回来，2000 局回归里
   * smart 与 random 的差值反而掉了。谁要是又把血量接回主人身上，这条会拦住。
   */
  it('血量不看主人是谁，差异只许落在攻击和手艺上', () => {
    const beefy = firstPet(loneOwner('tiezhu', 'dogleash'), 7800);
    const punchy = firstPet(loneOwner('laoyanqiang', 'dogleash'), 7800);
    expect(beefy.maxHp).toBe(punchy.maxHp);
  });

  it('从主人站的那一格出生：栓给后排就得先跑一段', () => {
    const front = firstPet(loneOwner('tiezhu', 'dogleash', 0), 7800);
    const back = firstPet(loneOwner('tiezhu', 'dogleash', 2), 7800);
    // 放出来那一帧就会往前迈一步，所以比的是两者的间距而不是绝对坐标
    expect(front.dist - back.dist).toBeCloseTo(slotPos(0) - slotPos(2), 1);
  });

  it('跟主人学那一手：会减速的人放出来的也会减速', () => {
    // 王大锤自带命中减速，铁柱只会给自己叠盾，学不到东西
    const learner = firstPet(loneOwner('dachui', 'dogleash'), 7800);
    const plain = firstPet(loneOwner('tiezhu', 'dogleash'), 7800);
    expect(learner.learned.slowOnHit).toBeTruthy();
    expect(plain.learned.slowOnHit).toBeUndefined();
  });

  it('学来的减速真落在被咬的那只身上', () => {
    const s = loneOwner('dachui', 'dogleash');
    const p = firstPet(s, 7800);
    muteHeroes(s);
    const e = enemyAt(p.dist + 0.5, 9100, 'grey');
    e.proto = getEnemyProto('grey');
    s.enemies = [e];
    p.cdMs = 0;
    tick(s);
    expect(s.enemies.find((x) => x.id === 9100)?.slowMs ?? 0).toBeGreaterThan(0);
  });

  it('往前冲不许越过村民的火力范围', () => {
    const s = loneOwner('tiezhu', 'dogleash');
    const p = firstPet(s, 7800);
    for (let i = 0; i < 200; i += 1) {
      s.enemies = [];
      tick(s);
    }
    const still = s.pets.find((x) => x.id === p.id);
    expect(still?.dist ?? 0).toBeLessThanOrEqual(PET_MAX_DIST + 0.01);
    // 老烟枪站后排也就够到 3 格，闸门必须在这之内，否则整队会被狗挡住空转
    expect(PET_MAX_DIST).toBeLessThan(slotPos(2) + getHero('laoyanqiang').range);
  });

  it('挡在前面的先挨打，村民少吃这几下', () => {
    const s = loneOwner('tiezhu', 'chickenfeed');
    const p = firstPet(s, 6200);
    muteHeroes(s);
    const hero = s.team[0]!;
    // 鸡是两只一起撒的，挨打的不一定是手上这只，所以看的是总血量
    const flockBefore = s.pets.reduce((n, x) => n + x.hp, 0);
    const e = enemyAt(p.dist + 0.5, 9200, 'cube');
    e.proto = getEnemyProto('cube');
    e.cdMs = 0;
    s.enemies = [e];
    const heroHpBefore = hero.hp;
    tick(s);
    expect(hero.hp).toBe(heroHpBefore);
    expect(s.pets.reduce((n, x) => n + x.hp, 0)).toBeLessThan(flockBefore);
  });

  it('全队同屏有上限，不许满屏小东西', () => {
    const s = createRun(4321);
    runUntil(s, (x) => x.phase === 'fighting');
    // 三个人各栓三件，随它放到吐
    s.team = [
      unit('tiezhu', 0, ['dogleash', 'chickenfeed', 'holler']),
      unit('dachui', 1, ['dogleash', 'chickenfeed', 'holler']),
      unit('laoyanqiang', 2, ['dogleash', 'chickenfeed', 'holler']),
    ];
    s.pets = [];
    for (let i = 0; i < 400; i += 1) {
      s.enemies = [];
      tick(s);
      expect(s.pets.length).toBeLessThanOrEqual(PET_CAP);
    }
  });

  it('小东西咬死的照样给经验和废品，功劳记在主人名下', () => {
    const s = loneOwner('laoyanqiang', 'dogleash');
    const p = firstPet(s, 7800);
    // 老烟枪射程 5 格，不压住的话这只残血怪根本活不到狗跟前
    muteHeroes(s);
    const e = enemyAt(p.dist + 0.5, 9300, 'grey');
    e.proto = getEnemyProto('grey');
    e.hp = 1;
    e.cdMs = 9999;
    s.enemies = [e];
    p.cdMs = 0;
    const expBefore = s.exp;
    tick(s);
    expect(s.exp).toBeGreaterThan(expBefore);
    const bite = s.events.find((ev) => ev.kind === 'hit' && ev.byPet === p.id);
    expect(bite).toBeTruthy();
    if (bite?.kind === 'hit') expect(bite.heroId).toBe('laoyanqiang');
  });

  /**
   * 这一条是放小东西那三件的验收线，也是 mods.ts 第一条原则的直接量化：
   * **钉着同一件必出，只换装法，smart 与 random 必须拉得开。**
   *
   * 为什么不看整池差值：池子里每多一件，抽到强定位件的概率就被摊薄一次，
   * 整池差值会跟着降 —— 加这三件时实测从 4.00 掉到 3.90，但那是稀释，
   * 不是新件不挑人。钉单件跑才量得出这一件本身好不好。
   * 掉破阈值时回去改 mods.ts 的定位改写强度，别改这个数。
   */
  it('三件都必须挑人：钉着它跑，装对和乱装拉得开', () => {
    const RUNS = 150;
    const meanWave = (strategy: 'smart' | 'random', pinModId: string): number => {
      let sum = 0;
      for (let i = 0; i < RUNS; i += 1) {
        sum += simulateRun({ strategy, seed: 1 + i * 7919, pinModId }).reachedWave;
      }
      return sum / RUNS;
    };
    for (const id of ['dogleash', 'chickenfeed', 'holler']) {
      // 交战圈含脚边之后，乱装不再白捡「怪走进队形没人打」。
      // 装对仍须多打两波以上，数字是那条线，不是旧 bug 撑出来的 2.5。
      expect(meanWave('smart', id) - meanWave('random', id)).toBeGreaterThan(2);
    }
    // 连续战场把单局拉长到 3000 多个 tick，这条 900 局跑到 3.7 秒，
    // 默认的 5 秒只剩一点余量，和 build 并行时挂过一次
  }, 20_000);

  it('过刻度战场不断，狗跟着一起过去', () => {
    const s = loneOwner('tiezhu', 'dogleash');
    firstPet(s, 7800);
    const ids = s.pets.map((p) => p.id);
    expect(ids.length).toBeGreaterThan(0);
    // 停在刻度边界前一帧，只跨这一步，排除掉「狗在路上被打死」的干扰
    s.totalMs = stageStartMs(2) - TICK_MS;
    tick(s);
    expect(s.wave).toBe(2);
    // 从前这里会被清空，让「上一波攒的狗」消失。现在战场不断，是同一条狗
    expect(s.pets.some((p) => ids.includes(p.id))).toBe(true);
  });
});

describe('队列顺序可以由玩家改', () => {
  it('交换两个位置只换站位，不换人', () => {
    const s = createRun(81);
    runUntil(s, (x) => x.team.length >= 2 && x.phase === 'fighting');
    const before = teamInOrder(s).map((h) => h.def.id);
    swapSlots(s, 0, 1);
    const after = teamInOrder(s).map((h) => h.def.id);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
    expect(s.team.length).toBe(before.length);
  });

  it('玩家换位会计入 queueMoves', () => {
    const s = createRun(82);
    runUntil(s, (x) => x.team.length >= 2 && x.phase === 'fighting');
    const first = teamInOrder(s)[0]!;
    expect(placeInSlot(s, first.def.id, 2)).toBe(true);
    expect(s.stats.queueMoves).toBe(1);
  });

  it('人少时可以站到空着的后排，不必跟谁换', () => {
    const s = createRun(81);
    runUntil(s, (x) => x.phase === 'fighting');
    const first = teamInOrder(s)[0]!;
    s.team = [first];
    first.slot = 0;
    expect(placeInSlot(s, first.def.id, 2)).toBe(true);
    expect(first.slot).toBe(2);
    expect(heroAt(s, 0)).toBeUndefined();
  });
});

// ── 数值 ────────────────────────────────────────────────

describe('伤害公式', () => {
  it('护甲收益递减且不会免伤', () => {
    expect(armorReduction(0)).toBe(0);
    expect(armorReduction(100)).toBeCloseTo(0.5);
    expect(armorReduction(1e6)).toBeLessThan(1);
  });

  it('没有克制乘区，改装倍率独占一个乘区', () => {
    const base = computeDamage({ atk: 100, targetDef: 0, modMult: 1, targetDamageReductionPct: 0 });
    const doubled = computeDamage({ atk: 100, targetDef: 0, modMult: 2, targetDamageReductionPct: 0 });
    expect(doubled).toBeCloseTo(base * 2);
  });

  it('减伤按百分比生效，且伤害有下限', () => {
    const cut = computeDamage({ atk: 100, targetDef: 0, modMult: 1, targetDamageReductionPct: 30 });
    expect(cut).toBeCloseTo(70);
    expect(computeDamage({ atk: 1, targetDef: 1e6, modMult: 1, targetDamageReductionPct: 90 })).toBe(1);
  });
});

describe('波次编排', () => {
  it('15 波齐全且不带系别', () => {
    expect(WAVES.length).toBe(TOTAL_WAVES);
    for (let w = 1; w <= TOTAL_WAVES; w += 1) {
      const def = WAVES.find((x) => x.wave === w);
      expect(def).toBeDefined();
      expect(def!.hint.length).toBeGreaterThan(0);
      expect(['硬', '多', '快']).toContain(def!.pressure);
      for (const sp of def!.spawns) {
        expect((sp as unknown as Record<string, unknown>).element).toBeUndefined();
      }
    }
  });

  it('走完空场要看得见，小灰不能像传送带', () => {
    const walk = (id: string) => SPAWN_DIST / getEnemyProto(id).speed;
    expect(walk('grey')).toBeGreaterThanOrEqual(11);
    expect(walk('grey')).toBeLessThan(14);
    expect(walk('cube')).toBeGreaterThan(walk('grey'));
    expect(walk('canister')).toBeGreaterThan(walk('cube'));
    expect(walk('saucer')).toBeGreaterThan(walk('cube'));
  });

  it('第 1 波只出小灰，三人上场仍是见面礼', () => {
    const first = WAVES[0]!;
    const total = first.spawns.reduce((n, sp) => n + sp.count, 0);
    expect(first.spawns.every((sp) => sp.enemyId === 'grey')).toBe(true);
    expect(total).toBeGreaterThanOrEqual(6);
    expect(total).toBeLessThanOrEqual(8);
  });

  it('强度曲线单调不降', () => {
    for (let w = 2; w <= TOTAL_WAVES; w += 1) {
      expect(waveHpMult(w)).toBeGreaterThanOrEqual(waveHpMult(w - 1));
      expect(waveAtkMult(w)).toBeGreaterThanOrEqual(waveAtkMult(w - 1));
    }
  });

  it('15 波总成长与改装件能给的成长同量级', () => {
    // 一局只发几件破烂，曲线若失控就必然出现断崖
    expect(waveHpMult(TOTAL_WAVES)).toBeLessThan(6);
  });
});

describe('村民', () => {
  it('每人都有起手特性和一句人物介绍', () => {
    for (const h of HEROES) {
      expect(h.skillName.length).toBeGreaterThan(0);
      expect(h.skillDesc.length).toBeGreaterThan(0);
      expect(h.flavor.length).toBeGreaterThan(0);
      expect(h.job.length).toBeGreaterThan(0);
      expect(h.eats.length).toBeGreaterThan(0);
    }
  });

  it('村民自带的特性不含改定位那几种，改定位是改装件的戏份', () => {
    const pivotKinds = new Set(['rangeUp', 'frontMult', 'rageOnHurt', 'heavySwing', 'revive']);
    for (const h of HEROES) {
      expect(pivotKinds.has(h.skill.kind)).toBe(false);
    }
  });

  it('六个人活不一样，电锯会改出手签名', () => {
    expect(new Set(HEROES.map((h) => h.job)).size).toBe(HEROES.length);
    expect(resolveAttackFx(getHero('tiezhu'), [])).toBe('slash');
    expect(resolveAttackFx(getHero('tiezhu'), [getMod('chainsaw')])).toBe('saw');
    expect(resolveAttackFx(getHero('sanshen'), [])).toBe('orb');
    expect(resolveAttackFx(getHero('laoyanqiang'), [getMod('pipe')])).toBe('poke');
    expect(resolveAttackFx(getHero('erjiu'), [getMod('steelplate')])).toBe('bolt');
    expect(resolveAttackFx(getHero('laoli'), [getMod('pressurecooker')])).toBe('slash');
    expect(resolveAttackFx(getHero('sanshen'), [getMod('helmet')])).toBe('orb');
    expect(resolveAttackFx(getHero('sanshen'), [getMod('speaker')])).toBe('orb');
  });

  it('没有等级系统，成长只来自改装件', () => {
    const h = unit('tiezhu', 0) as unknown as Record<string, unknown>;
    expect(h.level).toBeUndefined();
  });
});

// ── 整局回归 ────────────────────────────────────────────

describe('整局回归', () => {
  it('每种策略都能跑完不卡死', () => {
    for (const st of PICK_STRATEGIES) {
      const r = simulateRun({ strategy: st, seed: 1234 });
      expect(r.reachedWave).toBeGreaterThanOrEqual(1);
      expect(r.reachedWave).toBeLessThanOrEqual(TOTAL_WAVES);
    }
  });

  it('同一 seed 必得同一结果', () => {
    const a = simulateRun({ strategy: 'smart', seed: 909 });
    const b = simulateRun({ strategy: 'smart', seed: 909 });
    expect(b).toEqual(a);
  });

  it('上场人数不超过队列长度', () => {
    const r = simulateRun({ strategy: 'focus', seed: 313 });
    expect(r.team.length).toBeLessThanOrEqual(TEAM_SIZE);
  });

  it('没人身上装超过三件', () => {
    for (const seed of [11, 22, 33, 44]) {
      const r = simulateRun({ strategy: 'focus', seed });
      for (const t of r.team) expect(t.mods.length).toBeLessThanOrEqual(MOD_SLOTS_PER_HERO);
    }
  });

  it('卡关点落在第 9–12 波', () => {
    const s = simulateBatch('smart', 200, 2026);
    expect(s.medianWave).toBeGreaterThanOrEqual(9);
    expect(s.medianWave).toBeLessThanOrEqual(12);
  });

  it('打到最后的人有真实通关概率', () => {
    const s = simulateBatch('smart', 200, 4041);
    expect(s.clearRate).toBeGreaterThan(0.08);
    expect(s.clearRate).toBeLessThan(0.5);
  });

  /**
   * 头号风险的防线。smart 与 random 挑牌倾向一致，唯一差别是装给谁，
   * 所以这个差值就是「装对人」的价值。跌破阈值时不要改这条测试，
   * 要回去加强 mods.ts 里的定位改写。
   *
   * 阈值定在 2.5：实测差值稳定在 3.8 到 4.4 波之间（多个 seed，各 200 局），
   * 留 1.3 波余量吸收抽样噪声。原来写的是 1 波，离实测差了四倍，
   * 定位改写强度砍掉一半都不会报红，等于没有防线。
   */
  it('装给谁真的有差别：smart 比 random 平均多打两波半以上', () => {
    const smart = simulateBatch('smart', 200, 5150);
    const random = simulateBatch('random', 200, 5150);
    expect(smart.meanWave - random.meanWave).toBeGreaterThan(2.5);
  });

  it('单局时长落在碎片时间里', () => {
    const s = simulateBatch('smart', 120, 6161);
    expect(s.avgDurationSec).toBeGreaterThan(120);
    expect(s.avgDurationSec).toBeLessThan(600);
  });

  /**
   * 行为分化的验收线，也是这一整块改动存在的理由。
   *
   * 「快」型只有第 11 波一处。分化之前它的到达率和第 10 波**一模一样** ——
   * 那一波不杀人，pressure 里的「快」是个空标签，玩家全程只在跟护甲打交道。
   * 这条跌了别改测试，回去看 grey 的 rush 和 cube 的 split 是不是被数值抹平了。
   */
  it('「快」型那一波真的会杀人，不是个空标签', () => {
    const s = simulateBatch('smart', 200, 2026);
    const reachedFast = s.reachRate[10]; // 索引 10 = 第 11 波
    const reachedPrev = s.reachRate[9];
    expect(reachedFast).toBeDefined();
    expect(reachedPrev).toBeDefined();
    expect(reachedFast!).toBeLessThan(reachedPrev!);
  });

  /**
   * 分化不该顺手把难度也改掉。这条锁的是「只改压力的形状，不改总强度」：
   * 三种行为都配了对应的基础数值下调，中位卡关点必须还在原地。
   * 校准过程踩过三次坑 —— 补血量把第 8 波变成硬墙、补速度把第 15 波变成围攻、
   * 攻击补满让并行的碎块把一波总 dps 翻三倍，三次都把通关率打到 5% 以下。
   */
  it('行为分化没把难度一起改掉', () => {
    const s = simulateBatch('smart', 200, 4041);
    expect(s.medianWave).toBeGreaterThanOrEqual(9);
    expect(s.medianWave).toBeLessThanOrEqual(12);
    expect(s.clearRate).toBeGreaterThan(0.08);
  });
});
