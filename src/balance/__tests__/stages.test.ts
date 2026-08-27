import { describe, expect, it } from 'vitest';
import { TOTAL_WAVES, WAVE_HANDOFF_MS } from '../combat';
import { getEnemyProto } from '../enemies';
import {
  CALIBRATE_STAGE_ID,
  CHAPTER_COUNT,
  LAST_STAGE_ID,
  STAGE_COUNT,
  STAGES,
  STAGES_PER_CHAPTER,
  findStage,
  getStage,
  inferStageTop,
  migrateStageTop,
  stageBeats,
} from '../stages';
import { applyPick, createRun, gmSkipWave, installMod, installTargets, tick } from '../../game/BattleEngine';

describe('主线关卡', () => {
  it('八章四十关，不是四个大门', () => {
    expect(CHAPTER_COUNT).toBe(8);
    expect(STAGE_COUNT).toBe(40);
    expect(STAGES[0]!.label).toBe('1-1');
    expect(STAGES[STAGE_COUNT - 1]!.label).toBe('8-5');
    expect(getStage(LAST_STAGE_ID).waveFrom).toBeGreaterThanOrEqual(10);
    expect(STAGES_PER_CHAPTER).toBe(5);
    expect(findStage(3, 2)?.label).toBe('3-2');
    expect(findStage(9, 1)).toBeUndefined();
  });

  it('越往后越长越硬，首关短', () => {
    const first = getStage(1);
    const last = getStage(LAST_STAGE_ID);
    expect(stageBeats(first)).toBeLessThanOrEqual(3);
    expect(stageBeats(last)).toBeGreaterThan(stageBeats(first));
    expect(first.atkMul).toBeGreaterThan(0.18);
    expect(first.atkMul).toBeLessThan(0.32);
    expect(first.spdMul).toBeLessThan(1);
    expect(first.atkMul).toBeLessThan(last.atkMul);
    expect(first.hpMul).toBeLessThan(last.hpMul);
    expect(first.stripSplit).toBe(true);
    expect(last.packExtra).toBeGreaterThan(0);
  });

  it('老存档按打到过的波次把进度补回来', () => {
    expect(inferStageTop(0)).toBe(1);
    expect(inferStageTop(8)).toBe(6);
    expect(inferStageTop(12)).toBe(16);
    expect(inferStageTop(15)).toBe(25);
    expect(migrateStageTop(2, 8, 0)).toBe(6);
    expect(migrateStageTop(16, 12, 2)).toBe(16);
  });

  it('默认一局仍是完整 15 段，回归曲线不跟短关绑死', () => {
    const s = createRun(7);
    expect(s.stageId).toBe(CALIBRATE_STAGE_ID);
    expect(s.lastWave).toBe(TOTAL_WAVES);
    expect(s.waveFrom).toBe(1);
  });

  it('1-1 打三段就赢，怪比校准局软', () => {
    const easy = createRun(8, 0, 'ad', '', undefined, ['tiezhu', 'dachui', 'laoyanqiang'], '', 0, 1);
    const full = createRun(8, 0, 'ad', '', undefined, ['tiezhu', 'dachui', 'laoyanqiang'], '', 0);
    expect(easy.lastWave).toBe(3);
    expect(easy.stripSplit).toBe(true);
    tick(easy);
    tick(full);
    const a = easy.enemies[0];
    const b = full.enemies.find((e) => e.proto.id === a?.proto.id);
    expect(a && b).toBeTruthy();
    if (a && b) {
      expect(a.proto.atk).toBeLessThan(b.proto.atk);
      expect(a.maxHp).toBeLessThan(b.maxHp);
    }
    expect(getEnemyProto('cube').split).toBeTruthy();
  });

  it('短关下一波会叠上来，但不在上波刚出完就砸下来', () => {
    const s = createRun(8, 0, 'ad', '', undefined, ['tiezhu', 'dachui', 'laoyanqiang'], '', 0, 1);
    const beat = getStage(1).beatMs;
    const gap = Math.max(WAVE_HANDOFF_MS, Math.round(beat * 0.5));
    let guard = 0;
    while (s.wave < 2 && s.phase === 'fighting' && guard++ < 400) tick(s);
    expect(s.wave).toBe(2);
    expect(s.enemies.length).toBeGreaterThan(0);
    expect(s.totalMs).toBeGreaterThan(7 * 600 + WAVE_HANDOFF_MS);
    expect(s.totalMs).toBeLessThanOrEqual(7 * 600 + gap + 200);
  });

  it('1-1 默认队能焊上第一件，并且打得过', () => {
    const s = createRun(8, 0, 'ad', '', undefined, ['tiezhu', 'dachui', 'laoyanqiang'], '', 0, 1);
    let firstPickAlive = false;
    let guard = 0;
    while (s.phase !== 'won' && s.phase !== 'lost' && guard++ < 8_000) {
      if (s.phase === 'picking') {
        const opt = s.pendingOptions.find(
          (o) => o.kind === 'mod' || !s.team.some((h) => h.def.id === o.heroId),
        );
        if (!opt) break;
        if (opt.kind === 'mod' && !firstPickAlive) {
          firstPickAlive = s.team.some((h) => h.alive);
        }
        applyPick(s, opt);
        continue;
      }
      if (s.phase === 'installing') {
        const target = installTargets(s)[0];
        if (!target) break;
        installMod(s, target.def.id);
        continue;
      }
      tick(s);
      s.events.length = 0;
    }
    expect(firstPickAlive).toBe(true);
    expect(s.level).toBeGreaterThanOrEqual(1);
    expect(s.phase).toBe('won');
  });

  it('GM 跳过本波：1-1 连跳三次通关', () => {
    const s = createRun(8, 0, 'ad', '', undefined, ['tiezhu', 'dachui', 'laoyanqiang'], '', 0, 1);
    expect(s.wave).toBe(1);
    expect(s.phase).toBe('fighting');
    expect(gmSkipWave(s)).toMatch(/第 2/);
    expect(s.wave).toBe(2);
    expect(s.enemies).toHaveLength(0);
    expect(s.phase).toBe('fighting');
    expect(gmSkipWave(s)).toMatch(/第 3/);
    expect(s.wave).toBe(3);
    expect(gmSkipWave(s)).toMatch(/通关/);
    expect(s.phase).toBe('won');
    expect(s.wave).toBe(s.lastWave);
  });
});
