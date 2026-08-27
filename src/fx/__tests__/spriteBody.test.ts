import { describe, expect, it } from 'vitest';
import { HEROES } from '@/balance/heroes';
import { ENEMY_PROTOS } from '@/balance/enemies';
import { HAND_GEAR, isHandMod, resolveHandGear, wornModIds } from '@/balance/gear';
import { CLIP_BODY, clipBody } from '@/fx/spriteBody';
import { contactAt, motionFor, releaseAt, swingKeyframes } from '@/fx/UnitActor';

describe('clipBody', () => {
  it('每个上场单位都有身体高度，避免出手按整帧压小', () => {
    for (const h of HEROES) expect(CLIP_BODY[h.id]?.idle).toBeGreaterThan(80);
    for (const e of ENEMY_PROTOS) expect(CLIP_BODY[e.id]?.idle).toBeGreaterThan(80);
  });

  it('大锤走重击抡砸，不走突刺', () => {
    expect(motionFor('smash')).toBe('crush');
    expect(motionFor('slash')).toBe('lunge');
  });

  it('松手比抡起来晚，抡砸最晚落地', () => {
    expect(releaseAt('recoil')).toBeGreaterThan(0.1);
    expect(releaseAt('lunge')).toBeGreaterThan(releaseAt('recoil'));
    expect(releaseAt('sling')).toBeGreaterThan(0.2);
    expect(releaseAt('crush')).toBeGreaterThan(releaseAt('sling'));
    expect(contactAt('lunge')).toBeGreaterThan(releaseAt('lunge'));
    expect(contactAt('crush')).toBeGreaterThan(releaseAt('lunge'));
  });

  it('抡砸不进地，弹弓往上弹', () => {
    for (const m of ['lunge', 'crush', 'recoil'] as const) {
      const k = swingKeyframes(m);
      expect(k.rest).toBeLessThan(0);
      expect(k.hit).toBeLessThan(0.35);
      expect(k.up).toBeLessThan(k.rest);
    }
    const sling = swingKeyframes('sling');
    expect(sling.hit).toBeLessThan(-1);
    expect(sling.hit).toBeLessThan(sling.rest);
  });

  it('同一人切到攻击帧时身体显示高度不变', () => {
    const slot = 94;
    for (const id of Object.keys(CLIP_BODY)) {
      const idle = slot / clipBody(id, 'idle', 320);
      const atk = slot / clipBody(id, 'atk', 178);
      const idleBody = idle * CLIP_BODY[id].idle;
      const atkBody = atk * CLIP_BODY[id].atk;
      expect(Math.abs(idleBody - atkBody)).toBeLessThan(0.01);
    }
  });
});

describe('手脚分层', () => {
  it('每人有起手家伙，装手持破烂才换手上的', () => {
    expect(resolveHandGear('dachui', []).id).toBe('hammer');
    expect(resolveHandGear('dachui', ['helmet']).id).toBe('hammer');
    expect(resolveHandGear('dachui', ['helmet', 'chainsaw']).id).toBe('chainsaw');
    expect(resolveHandGear('tiezhu', ['pipe', 'quilt']).id).toBe('pipe');
  });

  it('头盔棉被钢板是穿的，不占手', () => {
    expect(isHandMod('helmet')).toBe(false);
    expect(isHandMod('chainsaw')).toBe(true);
    expect(wornModIds(['helmet', 'chainsaw', 'quilt'], 'head')).toEqual(['helmet']);
    expect(wornModIds(['helmet', 'chainsaw', 'quilt'], 'body')).toEqual(['quilt']);
  });

  it('每件手持家伙都有贴图路径', () => {
    for (const g of Object.values(HAND_GEAR)) {
      expect(g.path.startsWith('images/')).toBe(true);
      expect(g.scale).toBeGreaterThan(0.4);
    }
  });

  it('锅握在木柄上，头朝锅口，不会拿反', () => {
    const pot = HAND_GEAR.pot!;
    expect(pot.gripX).toBeGreaterThan(0.75);
    expect(Math.abs(pot.headLocal)).toBeGreaterThan(2);
  });
});
