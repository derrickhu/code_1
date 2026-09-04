import { describe, expect, it } from 'vitest';
import { LEGACY_IDS, VILLAGERS } from '@/balance/villagers';
import { ENEMIES } from '@/balance/stages';
import { HAND_GEAR, handIdOf, resolveHandGear, wearOf } from '@/balance/gear';
import { CLIP_BODY, clipBody } from '@/fx/spriteBody';
import { contactAt, motionFor, releaseAt, swingKeyframes } from '@/fx/UnitActor';

describe('clipBody', () => {
  it('有帧动画的单位都有身体高度，避免出手按整帧压小', () => {
    // 只校验有帧动画的那几个。新加的 14 个村民还没有立绘，
    // 走程序动作，不进 CLIP_BODY（见 TextureLoader.preloadBattleArt 的注释）
    for (const id of LEGACY_IDS) expect(CLIP_BODY[id]?.idle).toBeGreaterThan(80);
    for (const e of ENEMIES) {
      if (CLIP_BODY[e.id]) expect(CLIP_BODY[e.id]?.idle).toBeGreaterThan(80);
    }
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
  it('手上拿什么跟着进化阶换', () => {
    expect(resolveHandGear('dachui', 1).id).toBe('hammer');
    expect(resolveHandGear('dachui', 2).id).toBe('hammer');
    // 三阶「扛来工地的风镐」，家伙必须跟着 pitch 换
    expect(resolveHandGear('dachui', 3).id).toBe('pipe');
    expect(resolveHandGear('dianju', 1).id).toBe('cleaver');
    expect(resolveHandGear('dianju', 2).id).toBe('chainsaw');
  });

  it('每个村民三阶都在家伙表里，且贴图存在', () => {
    for (const v of VILLAGERS) {
      for (const st of [1, 2, 3]) {
        const id = handIdOf(v.id, st);
        expect(HAND_GEAR[id], `${v.name} 第 ${st} 阶的 ${id} 没有贴图`).toBeDefined();
      }
    }
  });

  /*
   * §4.1 是硬约束：进化必须看得见。手上那一件 + 身上穿戴，
   * 三阶之间至少得有一处不同，否则玩家花了 520 废铁 22 零件看不出变化。
   */
  it('每个村民的三阶轮廓都不一样', () => {
    for (const v of VILLAGERS) {
      const looks = [1, 2, 3].map((st) => {
        const w = wearOf(v.id, v.lane, st);
        return `${handIdOf(v.id, st)}|${w.head ?? ''}|${w.back ?? ''}|${w.body ?? ''}`;
      });
      expect(new Set(looks).size, `${v.name} 的三阶看起来一样`).toBe(3);
    }
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
