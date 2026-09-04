import { describe, expect, it } from 'vitest';
import { ATTACK_FX, ENEMY_FX, FX_SKINS, attackLook, enemyLook, shouldFly, shotFlight, skinLook } from '@/fx/FxRecipe';
import { projSprite, resolveAttackFx, resolveFxSkin } from '@/balance/fx';
import { getVillager, VILLAGERS } from '@/balance/villagers';
import { HAND_GEAR, handIdOf } from '@/balance/gear';

describe('观战配方', () => {
  it('每种村民出手都有自己的色和落点，不共用一张光', () => {
    const tints = new Set<number>();
    for (const fx of ATTACK_FX) {
      const look = attackLook(fx);
      expect(look.plates.length).toBeGreaterThan(0);
      expect(look.spray.n).toBeGreaterThan(0);
      expect(look.hitStop[1]).toBeGreaterThanOrEqual(look.hitStop[0]);
      tints.add(look.tint);
    }
    expect(tints.size).toBe(ATTACK_FX.length);
  });

  it('每种外星人出手也分得开', () => {
    const tints = new Set<number>();
    for (const fx of ENEMY_FX) {
      const look = enemyLook(fx);
      expect(look.plates.length).toBeGreaterThan(0);
      tints.add(look.tint);
    }
    expect(tints.size).toBe(ENEMY_FX.length);
  });

  it('飞弹才带拖尾，抡砸当场打完', () => {
    expect(attackLook('slash').instant).toBe(true);
    expect(attackLook('smash').instant).toBe(true);
    expect(attackLook('slash').dry).toBe(true);
    expect(attackLook('pierce').beam).toBeFalsy();
    expect(skinLook('wire').beam).toBeFalsy();
    expect(skinLook('wire').dry).toBe(true);
    expect(skinLook('wire').proj).toBe('wire');
    expect(enemyLook('beam').beam).toBe(true);
    expect(enemyLook('claw').quiet).toBe(true);
    expect(enemyLook('claw').instant).toBe(true);
    expect(enemyLook('claw').ribbon).toBeFalsy();
    expect(enemyLook('bash').quiet).toBe(true);
    expect(enemyLook('bash').instant).toBe(true);
    expect(enemyLook('bash').plates[0]?.name).not.toBe('smash');
    expect(enemyLook('spark').ribbon).toBeFalsy();
    expect(shouldFly(enemyLook('claw'), true)).toBe(false);
    expect(shouldFly(enemyLook('bash'), true)).toBe(false);
  });

  it('飞弹近了也要飞一会儿，不能出手立刻炸', () => {
    expect(shotFlight(attackLook('sniper'), 80)).toBeGreaterThanOrEqual(0.22);
    expect(shotFlight(attackLook('slash'), 80, true)).toBe(0);
    expect(shotFlight(attackLook('slash'), 80, false)).toBeGreaterThanOrEqual(0.22);
    expect(shotFlight(attackLook('orb'), 80)).toBeGreaterThanOrEqual(0.34);
    expect(shotFlight(attackLook('sniper'), 80)).toBeGreaterThanOrEqual(0.34);
    expect(shotFlight(attackLook('bolt'), 400)).toBeGreaterThan(0.2);
    expect(shouldFly(attackLook('orb'), false)).toBe(true);
    expect(shouldFly(attackLook('slash'), false)).toBe(true);
    expect(shouldFly(attackLook('slash'), true)).toBe(false);
  });

  it('远程各有弹，穿戴件不改三婶飞碟', () => {
    expect(projSprite('orb')).toBe('disc');
    expect(projSprite('sniper')).toBe('pebble');
    expect(projSprite('bolt')).toBe('needle');
    expect(projSprite('wind')).toBe('leaf');
    expect(projSprite('blast')).toBe('cracker');
    expect(projSprite('poke')).toBe('pipe');
    expect(projSprite('slash')).toBe('cleaver');
    expect(attackLook('slash').dry).toBe(true);
    expect(attackLook('slash').ribbon).toBeFalsy();
    expect(resolveAttackFx(getVillager('sanshen'), 1)).toBe('orb');
    expect(resolveAttackFx(getVillager('erjiu'), 1)).toBe('bolt');
    expect(resolveAttackFx(getVillager('laoli'), 1)).toBe('slash');
    // 进化换打法：电锯哥二阶拉响电锯，王大锤三阶扛来风镐
    expect(resolveAttackFx(getVillager('dianju'), 1)).toBe('slash');
    expect(resolveAttackFx(getVillager('dianju'), 2)).toBe('saw');
    expect(resolveAttackFx(getVillager('dachui'), 3)).toBe('poke');
    // 皮跟着手上那一件走，不跟着人走
    expect(resolveFxSkin(getVillager('laoli'), 1)).toBe('cleaver');
    expect(resolveFxSkin(getVillager('dianju'), 2)).toBe('chainsaw');
  });

  it('每件家伙都有自己的皮，不共用一张光', () => {
    const tints = new Set<number>();
    for (const id of FX_SKINS) {
      const look = skinLook(id);
      expect(look.plates.length).toBeGreaterThan(0);
      tints.add(look.tint);
    }
    expect(tints.size).toBe(FX_SKINS.length);
    // 皮表和家伙表必须一一对上，否则某个进化阶会退回默认那张光
    for (const id of Object.keys(HAND_GEAR)) {
      expect(FX_SKINS.includes(id), `家伙 ${id} 没有皮`).toBe(true);
    }
  });

  it('每个村民的每一阶都能取到皮', () => {
    for (const v of VILLAGERS) {
      for (const st of [1, 2, 3]) {
        expect(FX_SKINS.includes(handIdOf(v.id, st))).toBe(true);
      }
    }
  });

  it('弹弓是石子抛物线，不拖能量带、不炸星爆', () => {
    const s = attackLook('sniper');
    expect(s.dry).toBe(true);
    expect(s.ribbon).toBeFalsy();
    expect(s.beam).toBeFalsy();
    expect(s.loft).toBeGreaterThan(0);
    expect(attackLook('poke').dry).toBe(true);
    expect(attackLook('poke').ribbon).toBeFalsy();
  });
});
