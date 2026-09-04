/**
 * 两件破烂装在同一个人身上，点名变成一种新打法。
 *
 * 教规则，不教表：玩家知道「两件焊同一个人，有时候会出事」，
 * 不知道要背哪 9 组。气味只说这件还缺哪种手感，不点另一件的名。
 */
import type { Ability } from './mods';

export interface JunkCombo {
  id: string;
  parts: readonly [string, string];
  name: string;
  becomes: string;
  /**
   * 刚焊上对应那一件、还没凑成时的气味。跟 parts 对齐。
   * 不写另一件的名字，避免变成作业。
   */
  scents: readonly [string, string];
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
    scents: ['再焊点带齿的，这管子能加长', '再接点够得着的，能锯一条线'],
    fx: 'saw',
    extras: [{ kind: 'pierce', extraTargets: 1 }],
  },
  {
    id: 'doorcannon',
    parts: ['steelplate', 'weight'],
    name: '门口重炮',
    becomes: '队首一下砸穿',
    scents: ['再绑点沉的，门口能砸穿', '再贴层铁皮，队首一下能砸穿'],
    fx: 'smash',
    extras: [{ kind: 'atkPct', value: 20 }],
  },
  {
    id: 'ragepot',
    parts: ['pressurecooker', 'pot'],
    name: '越挨越炸',
    becomes: '挨打就是输出',
    scents: ['再反手一口铁的，挨打就能炸', '再背个会憋气的，挨打就是输出'],
    extras: [{ kind: 'thorns', reflectPct: 25 }],
  },
  {
    id: 'windcrack',
    parts: ['blower', 'firecracker'],
    name: '风里鞭炮',
    becomes: '扇形一起炸',
    scents: ['风里再塞点会炸的，能一起响', '再扇一阵风，能炸一片'],
    fx: 'blast',
    extras: [{ kind: 'splash', damagePct: 35, radius: 1.2 }],
  },
  {
    id: 'beatrack',
    parts: ['wire', 'speaker'],
    name: '带电音响',
    becomes: '一条线全跟着跳',
    scents: ['再配点会响的，一条线全跟着跳', '再绕圈带电的，一条线全跟着跳'],
    fx: 'pierce',
    extras: [{ kind: 'slowOnHit', slowPct: 22, durationMs: 700 }],
  },
  {
    id: 'quiltlid',
    parts: ['helmet', 'quilt'],
    name: '厚被头盔',
    becomes: '倒了还能再躺着挨',
    scents: ['再套层厚的，倒了还能躺着挨', '再扣个硬壳，倒了还能再躺'],
    extras: [{ kind: 'armorPct', value: 15 }, { kind: 'revive', hpPct: 70 }],
  },
  {
    id: 'coldwind',
    parts: ['foam', 'blower'],
    name: '冷风筒',
    becomes: '一片人都走不动',
    scents: ['再扇一阵风，一片人都走不动', '风里再灌点冷的，一片人都走不动'],
    fx: 'wind',
    extras: [{ kind: 'slowOnHit', slowPct: 18, durationMs: 600 }],
  },
  {
    id: 'harvest',
    parts: ['sickle', 'wire'],
    name: '一溜割完',
    becomes: '一条线上的全收了',
    scents: ['再绕圈带电的，一条线上的全收了', '再配点会割的，一条线上的全收了'],
    fx: 'pierce',
    extras: [{ kind: 'execute', maxChain: 1 }],
  },
  {
    id: 'bloodbag',
    parts: ['sack', 'quilt'],
    name: '厚血被',
    becomes: '挨着打着自己回',
    scents: ['再套层厚的，挨着打着自己回', '再叠层会回血的，挨着打着自己回'],
    extras: [{ kind: 'lifesteal', healPct: 10 }],
  },
];

/** 一件挂在两组上、还没锁死是哪一组时，不点任何一边的名 */
const SHARED_SCENT: Readonly<Record<string, string>> = {
  blower: '风里再塞点东西，能一起出事',
  wire: '再配点会响的或会割的，一条线能出事',
  quilt: '再叠一层，能多挨几下',
};

export function comboOf(modIds: readonly string[]): JunkCombo | undefined {
  const set = new Set(modIds);
  return COMBOS.find((c) => c.parts.every((id) => set.has(id)));
}

/** 再装这一件会不会在这个人身上点名合体 */
export function comboIfAdd(modIds: readonly string[], nextId: string): JunkCombo | undefined {
  return comboOf([...modIds, nextId]);
}

/**
 * 焊完这一下该说的话。
 * 凑成了点名出事；只焊到一半就留气味；跟合体无关的件不说话。
 */
export function weldTalk(
  heroName: string,
  had: readonly string[],
  added: string,
): string | undefined {
  const formed = comboIfAdd(had, added);
  const already = comboOf(had);
  if (formed && formed.id !== already?.id) {
    return `${heroName}叠出${formed.name}——${formed.becomes}`;
  }
  const after = [...had, added];
  const open = COMBOS.filter(
    (c) => c.parts.includes(added) && !c.parts.every((id) => after.includes(id)),
  );
  if (open.length === 0) return undefined;
  if (open.length > 1) return SHARED_SCENT[added] ?? open[0]?.scents[0];
  const hit = open[0]!;
  const i = hit.parts[0] === added ? 0 : 1;
  return hit.scents[i];
}
