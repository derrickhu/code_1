import { describe, expect, it } from 'vitest';
import { LEGACY_IDS, VILLAGERS } from '@/balance/villagers';
import { ENEMIES } from '@/balance/stages';
import { HAND_SKINS, handIdOf } from '@/balance/gear';
import { enemyArtId } from '@/core/TextureLoader';
import { CLIP_BODY, battleBodyH, clipBody, fitBodyH, heroBattleLook } from '@/fx/spriteBody';
import { PORTRAIT_BODY } from '@/fx/portraitFit';
import { contactAt, motionFor, motionForSkin, readyTexH, releaseAt, swingKeyframes } from '@/fx/UnitActor';
import { texReady } from '@/core/TextureLoader';

describe('clipBody', () => {
  it('有帧动画的单位都有身体高度，避免出手按整帧压小', () => {
    for (const id of LEGACY_IDS) expect(CLIP_BODY[id]?.idle).toBeGreaterThan(80);
    for (const v of VILLAGERS) expect(CLIP_BODY[v.id]?.idle, v.id).toBeGreaterThan(80);
    for (const e of ENEMIES) {
      if (CLIP_BODY[e.id]) expect(CLIP_BODY[e.id]?.idle).toBeGreaterThan(80);
    }
  });

  it('立绘和表对不上时按整张图定高，铁柱不会比别人大一倍', () => {
    expect(fitBodyH(309, 652, false)).toBe(652);
    expect(fitBodyH(503, 511, false)).toBe(503);
    expect(fitBodyH(318, 320, false)).toBe(318);
    expect(fitBodyH(369, 369, false)).toBe(369);
    expect(fitBodyH(97, 158, true)).toBe(97);
  });

  it('小灰的图叫 grey，不能按逻辑 id 去找 grunt', () => {
    expect(enemyArtId('grunt')).toBe('grey');
    expect(enemyArtId('cube')).toBe('cube');
    for (const e of ENEMIES) {
      expect(CLIP_BODY[enemyArtId(e.id)] ?? CLIP_BODY[e.id], e.id).toBeTruthy();
    }
  });

  it('大锤走重击抡砸，不走突刺', () => {
    expect(motionFor('smash')).toBe('crush');
    expect(motionFor('slash')).toBe('lunge');
  });

  it('弹弓手上还是弹弓，pierce 也走拉弹，出手帧才对得上', () => {
    expect(motionForSkin('sling', 'pierce')).toBe('sling');
    expect(motionForSkin('sling', 'sniper')).toBe('sling');
    expect(motionForSkin('pipe', 'pierce')).toBe('recoil');
    expect(releaseAt(motionForSkin('sling', 'pierce'))).toBe(releaseAt('sling'));
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

describe('立绘尺寸未就绪', () => {
  it('0 高不能拿格子高去 fit', () => {
    expect(readyTexH(0)).toBeNull();
    expect(readyTexH(1)).toBeNull();
    expect(readyTexH(8)).toBeNull();
    expect(readyTexH(78)).toBe(78);
    expect(readyTexH(542)).toBe(542);
  });

  it('空贴图不能当立绘', () => {
    expect(texReady(null)).toBe(false);
  });
});

describe('局内站姿', () => {
  it('有立绘就用立绘，不叠道具图标', () => {
    const look = heroBattleLook(true, 4, 4);
    expect(look.idle).toBe('portrait');
    expect(look.atkSheet).toBe(true);
  });

  it('没有立绘才退回切片', () => {
    const look = heroBattleLook(false, 4, 4);
    expect(look.idle).toBe('sheet');
  });

  it('站姿立绘按身体定高，弹弓叔和大锤不会比三婶大一倍', () => {
    const slot = 78;
    const shown = (['laoyanqiang', 'dachui', 'sanshen'] as const).map((id) => {
      const box = PORTRAIT_BODY[id][0];
      const bodyH = battleBodyH({
        id, evo: 1, clip: 'idle', texH: box.texH, portrait: true, sheet: true,
      });
      return (slot / bodyH) * box.h;
    });
    expect(shown[0]).toBeCloseTo(slot);
    expect(shown[1]).toBeCloseTo(slot);
    expect(shown[2]).toBeCloseTo(slot);
    expect(fitBodyH(CLIP_BODY.laoyanqiang.idle, PORTRAIT_BODY.laoyanqiang[0].texH, true))
      .toBe(CLIP_BODY.laoyanqiang.idle);
  });

  it('攻击切片仍按 CLIP_BODY，不按立绘画布放大', () => {
    expect(battleBodyH({
      id: 'dachui', evo: 1, clip: 'atk', texH: 158, portrait: false, sheet: true,
    })).toBe(97);
  });
});

describe('打击皮', () => {
  it('手上拿什么跟着进化阶换', () => {
    expect(handIdOf('dachui', 1)).toBe('hammer');
    expect(handIdOf('dachui', 2)).toBe('weight');
    expect(handIdOf('dachui', 3)).toBe('pipe');
    expect(handIdOf('dianju', 1)).toBe('cleaver');
    expect(handIdOf('dianju', 2)).toBe('chainsaw');
    expect(handIdOf('dianju', 3)).toBe('pipe');
  });

  it('每个村民三阶都在家伙表里', () => {
    for (const v of VILLAGERS) {
      for (const st of [1, 2, 3]) {
        const id = handIdOf(v.id, st);
        expect(HAND_SKINS.includes(id), `${v.name} 第 ${st} 阶的 ${id}`).toBe(true);
      }
    }
  });
});
