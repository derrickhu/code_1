import { describe, expect, it } from 'vitest';
import { HEROES } from '@/balance/heroes';
import { ENEMY_PROTOS } from '@/balance/enemies';
import { CLIP_BODY, clipBody } from '@/fx/spriteBody';
import { motionFor } from '@/fx/UnitActor';

describe('clipBody', () => {
  it('每个上场单位都有身体高度，避免出手按整帧压小', () => {
    for (const h of HEROES) expect(CLIP_BODY[h.id]?.idle).toBeGreaterThan(80);
    for (const e of ENEMY_PROTOS) expect(CLIP_BODY[e.id]?.idle).toBeGreaterThan(80);
  });

  it('大锤走重击抡砸，不走突刺', () => {
    expect(motionFor('smash')).toBe('crush');
    expect(motionFor('slash')).toBe('lunge');
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
