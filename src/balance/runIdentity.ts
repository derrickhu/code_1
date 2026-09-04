/**
 * 这一局叫什么。结算和 HUD 只认这句话，不认总伤害。
 * 先看谁叠出了合体；没有合体就看谁被改了定位。
 */
import { comboOf } from './combos';

export interface IdentityHero {
  def: { id: string; name: string };
  slot: number;
  mods: readonly { id: string; kind: string; becomes: string; name: string }[];
}

export interface RunIdentity {
  title: string;
  line: string;
  heroId: string;
  heroName: string;
  kind: 'combo' | 'pivot' | 'none';
}

const NONE: RunIdentity = {
  title: '还没叠出名堂',
  line: '焊的都是零件，没成一套',
  heroId: '',
  heroName: '',
  kind: 'none',
};

export function runIdentity(team: readonly IdentityHero[]): RunIdentity {
  const bySlot = [...team].sort((a, b) => a.slot - b.slot);
  for (const h of bySlot) {
    const combo = comboOf(h.mods.map((m) => m.id));
    if (combo) {
      return {
        title: combo.name,
        line: `${h.def.name} · ${combo.becomes}`,
        heroId: h.def.id,
        heroName: h.def.name,
        kind: 'combo',
      };
    }
  }
  for (const h of bySlot) {
    const pivot = [...h.mods].reverse().find((m) => m.kind === 'pivot');
    if (pivot) {
      return {
        title: pivot.name,
        line: `${h.def.name} · ${pivot.becomes}`,
        heroId: h.def.id,
        heroName: h.def.name,
        kind: 'pivot',
      };
    }
  }
  return NONE;
}

export function settleIdentityLine(id: RunIdentity, won: boolean): string {
  if (id.kind === 'none') return id.line;
  return won
    ? `靠${id.heroName}的${id.title}`
    : `${id.heroName}那套${id.title}没撑住`;
}
