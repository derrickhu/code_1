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
  WAVE_TIMEOUT_MS,
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
import { BACK_AIM_DIST, WAVES, getEnemyProto, waveAtkMult, waveHpMult } from '../../balance/enemies';
import { installForecast } from '../../balance/forecast';
import { availableMods, isModUnlocked, yardDeposit } from '../../balance/yard';
import { HEROES, getHero } from '../../balance/heroes';
import { MODS, getMod } from '../../balance/mods';
import { PICK_STRATEGIES } from '../../balance/picker';
import {
  applyPick,
  buildOptions,
  canInstallOn,
  claimJunkyard,
  claimOpeningGift,
  computeStats,
  createRun,
  heroAt,
  enemyVictim,
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
  };
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

  it('全队倒下即判负', () => {
    const s = createRun(3);
    runUntil(s, (x) => x.phase === 'fighting');
    for (const h of s.team) {
      h.hp = 0;
      h.alive = false;
    }
    tick(s);
    expect(s.phase).toBe('lost');
    expect(s.loseReason).toBe('wipe');
  });

  it('推不动记成 timeout，不是队灭', () => {
    const s = createRun(3);
    runUntil(s, (x) => x.phase === 'fighting');
    s.waveElapsedMs = WAVE_TIMEOUT_MS;
    tick(s);
    expect(s.phase).toBe('lost');
    expect(s.loseReason).toBe('timeout');
  });

  it('队灭后可以就地站起继续当前波', () => {
    const s = createRun(3);
    runUntil(s, (x) => x.phase === 'fighting');
    for (const h of s.team) {
      h.hp = 0;
      h.alive = false;
    }
    tick(s);
    expect(reviveAfterWipe(s)).toBe(true);
    expect(s.phase).toBe('fighting');
    expect(s.team.every((h) => h.alive && h.hp > 0)).toBe(true);
    expect(s.loseReason).toBeUndefined();
  });

  it('推不动不能靠复活过', () => {
    const s = createRun(3);
    runUntil(s, (x) => x.phase === 'fighting');
    s.waveElapsedMs = WAVE_TIMEOUT_MS;
    tick(s);
    expect(reviveAfterWipe(s)).toBe(false);
    expect(s.phase).toBe('lost');
  });

  it('结算废品跟波次和改装件数走', () => {
    expect(runScrap(10, 3)).toBe(10 * 8 + 3 * 4);
  });

  it('队灭复活会压回超时前的宽限', () => {
    const s = createRun(3);
    runUntil(s, (x) => x.phase === 'fighting');
    s.waveElapsedMs = WAVE_TIMEOUT_MS - 100;
    for (const h of s.team) {
      h.hp = 0;
      h.alive = false;
    }
    tick(s);
    expect(reviveAfterWipe(s)).toBe(true);
    expect(s.waveElapsedMs).toBeLessThanOrEqual(WAVE_TIMEOUT_MS - REVIVE_GRACE_MS);
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
    expect(s.enemies.length).toBe(0);
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

  it('废品站没买的破烂不进本局池子', () => {
    expect(isModUnlocked('pipe', [])).toBe(true);
    expect(isModUnlocked('chainsaw', [])).toBe(false);
    expect(availableMods([]).some((m) => m.id === 'chainsaw')).toBe(false);
    const s = createRun(61, 0, 'ad', '', []);
    expect(s.modPool.some((m) => m.id === 'chainsaw')).toBe(false);
    expect(s.modPool.some((m) => m.id === 'pipe')).toBe(true);
  });

  it('买下的破烂和翻到的钉子能进池子', () => {
    const s = createRun(62, 0, 'ad', 'chainsaw', ['chainsaw']);
    expect(s.pinnedMods.map((m) => m.id)).toEqual(['chainsaw']);
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
    expect(resolveAttackFx(getHero('erjiu'), [getMod('steelplate')])).toBe('slash');
    expect(resolveAttackFx(getHero('laoli'), [getMod('pressurecooker')])).toBe('smash');
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
   * 所以这个差值就是「装对人」的价值。掉到 1 波以下时不要改这条测试，
   * 要回去加强 mods.ts 里的定位改写。
   */
  it('装给谁真的有差别：smart 比 random 平均多打一波以上', () => {
    const smart = simulateBatch('smart', 200, 5150);
    const random = simulateBatch('random', 200, 5150);
    expect(smart.meanWave - random.meanWave).toBeGreaterThan(1);
  });

  it('单局时长落在碎片时间里', () => {
    const s = simulateBatch('smart', 120, 6161);
    expect(s.avgDurationSec).toBeGreaterThan(120);
    expect(s.avgDurationSec).toBeLessThan(600);
  });
});
