import { describe, expect, it } from 'vitest';
import { getMod } from '@/balance/mods';
import { runIdentity, settleIdentityLine } from '@/balance/runIdentity';

function hero(
  id: string,
  name: string,
  slot: number,
  modIds: readonly string[],
) {
  return {
    def: { id, name },
    slot,
    mods: modIds.map((mid) => {
      const m = getMod(mid);
      return { id: m.id, kind: m.kind, becomes: m.becomes, name: m.name };
    }),
  };
}

describe('本局身份', () => {
  it('合体优先点名，不报总伤害', () => {
    const id = runIdentity([
      hero('tiezhu', '铁柱', 0, ['pipe', 'chainsaw']),
      hero('dachui', '王大锤', 1, ['weight']),
    ]);
    expect(id.kind).toBe('combo');
    expect(id.title).toBe('加长电锯');
    expect(id.heroName).toBe('铁柱');
    expect(settleIdentityLine(id, true)).toContain('加长电锯');
  });

  it('没合体就报改了定位的那件', () => {
    const id = runIdentity([hero('tiezhu', '铁柱', 0, ['pipe'])]);
    expect(id.kind).toBe('pivot');
    expect(id.title).toBe('接了根长水管');
    expect(id.line).toContain('铁柱');
  });

  it('空焊报还没叠出名堂', () => {
    const id = runIdentity([hero('tiezhu', '铁柱', 0, [])]);
    expect(id.kind).toBe('none');
    expect(settleIdentityLine(id, false)).toBe(id.line);
  });
});
