/**
 * 两件破烂装在同一个人身上，点名变成一种新打法。
 * 不做开放配方：玩家看见的是「这两件叠一起出事了」，不是背表。
 */
import type { Ability } from './mods';

export interface JunkCombo {
  id: string;
  parts: readonly [string, string];
  name: string;
  becomes: string;
  /** 覆盖出手签名，交给 resolveAttackFx */
  fx?: 'saw' | 'smash' | 'blast' | 'pierce' | 'wind' | 'slash';
  extras: readonly Ability[];
}

export const COMBOS: readonly JunkCombo[] = [
  {
    id: 'longsaw',
    parts: ['pipe', 'chainsaw'],
    name: '加长电锯',
    becomes: '站后面锯一条线',
    fx: 'saw',
    extras: [{ kind: 'pierce', extraTargets: 1 }],
  },
  {
    id: 'doorcannon',
    parts: ['steelplate', 'weight'],
    name: '门口重炮',
    becomes: '队首一下砸穿',
    fx: 'smash',
    extras: [{ kind: 'atkPct', value: 20 }],
  },
  {
    id: 'ragepot',
    parts: ['pressurecooker', 'pot'],
    name: '越挨越炸',
    becomes: '挨打就是输出',
    extras: [{ kind: 'thorns', reflectPct: 25 }],
  },
  {
    id: 'windcrack',
    parts: ['blower', 'firecracker'],
    name: '风里鞭炮',
    becomes: '扇形一起炸',
    fx: 'blast',
    extras: [{ kind: 'splash', damagePct: 35, radius: 1.2 }],
  },
  {
    id: 'beatrack',
    parts: ['wire', 'speaker'],
    name: '带电音响',
    becomes: '一条线全跟着跳',
    fx: 'pierce',
    extras: [{ kind: 'slowOnHit', slowPct: 22, durationMs: 700 }],
  },
  {
    id: 'quiltlid',
    parts: ['helmet', 'quilt'],
    name: '厚被头盔',
    becomes: '倒了还能再躺着挨',
    extras: [{ kind: 'armorPct', value: 15 }, { kind: 'revive', hpPct: 70 }],
  },
];

export function comboOf(modIds: readonly string[]): JunkCombo | undefined {
  const set = new Set(modIds);
  return COMBOS.find((c) => c.parts.every((id) => set.has(id)));
}

/** 再装这一件会不会在这个人身上点名合体 */
export function comboIfAdd(modIds: readonly string[], nextId: string): JunkCombo | undefined {
  return comboOf([...modIds, nextId]);
}
