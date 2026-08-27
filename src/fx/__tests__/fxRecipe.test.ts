import { describe, expect, it } from 'vitest';
import { ATTACK_FX, ENEMY_FX, FX_SKINS, attackLook, enemyLook, shouldFly, shotFlight, skinLook } from '@/fx/FxRecipe';
import { projSprite, resolveAttackFx, resolveFxSkin } from '@/balance/fx';
import { getHero } from '@/balance/heroes';
import { getMod, MODS } from '@/balance/mods';

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
  });

  it('飞弹近了也要飞一会儿，不能出手立刻炸', () => {
    expect(shotFlight(attackLook('sniper'), 80)).toBeGreaterThanOrEqual(0.22);
    expect(shotFlight(attackLook('slash'), 80, true)).toBe(0);
    expect(shotFlight(attackLook('slash'), 80, false)).toBeGreaterThanOrEqual(0.22);
    expect(shotFlight(attackLook('orb'), 80)).toBeGreaterThanOrEqual(0.28);
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
    expect(resolveAttackFx(getHero('sanshen'), [])).toBe('orb');
    expect(resolveAttackFx(getHero('sanshen'), [getMod('helmet'), getMod('quilt')])).toBe('orb');
    expect(resolveAttackFx(getHero('erjiu'), [])).toBe('bolt');
    expect(resolveAttackFx(getHero('laoli'), [])).toBe('slash');
    expect(resolveFxSkin(getHero('laoli'), [])).toBe('laoli');
    expect(resolveFxSkin(getHero('erjiu'), [getMod('wire')])).toBe('wire');
    expect(resolveFxSkin(getHero('sanshen'), [getMod('dogleash')])).toBe('sanshen');
  });

  it('每件出手破烂都有自己的皮，不共用一张光', () => {
    const tints = new Set<number>();
    for (const id of FX_SKINS) {
      const look = skinLook(id);
      expect(look.plates.length).toBeGreaterThan(0);
      tints.add(look.tint);
    }
    expect(tints.size).toBe(FX_SKINS.length);
    const attackMods = MODS.filter((m) => !['helmet', 'quilt', 'steelplate', 'pressurecooker', 'dogleash', 'chickenfeed', 'holler'].includes(m.id));
    for (const m of attackMods) {
      expect(FX_SKINS.includes(m.id)).toBe(true);
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
