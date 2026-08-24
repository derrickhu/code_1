/**
 * 观战签名。战斗数字仍由引擎算，这里只回答「这一下长什么样、什么声」。
 * 每种破烂 / 每种外星人必须能和别的分清，否则改造等于没做。
 */

import { comboOf } from './combos';
import type { HeroDef } from './heroes';
import type { ModDef } from './mods';

/** 村民打出去的那一下 */
export type AttackFx =
  | 'slash'
  | 'saw'
  | 'smash'
  | 'poke'
  | 'bolt'
  | 'orb'
  | 'wind'
  | 'blast'
  | 'pierce'
  | 'sniper';

/** 外星人打人的那一下 */
export type EnemyFx = 'claw' | 'bash' | 'spark' | 'beam';

const MOD_FX: Readonly<Record<string, AttackFx>> = {
  pipe: 'poke',
  weight: 'smash',
  blower: 'wind',
  wire: 'pierce',
  chainsaw: 'saw',
  firecracker: 'blast',
  // 钢板站前排靠金圈说话；出手仍是挥砍，但要和没装的人分得开
  steelplate: 'slash',
  // 高压锅越挨越猛：出手改成重砸，层数条已经在身上
  pressurecooker: 'smash',
  pot: 'smash',
  speaker: 'orb',
};

const HERO_FX: Readonly<Record<string, AttackFx>> = {
  tiezhu: 'slash',
  dachui: 'smash',
  laoli: 'slash',
  erjiu: 'bolt',
  sanshen: 'orb',
  laoyanqiang: 'sniper',
};

const ENEMY_FX: Readonly<Record<string, EnemyFx>> = {
  grey: 'claw',
  cube: 'bash',
  canister: 'spark',
  saucer: 'beam',
};

/** 后装的破烂覆盖起手。钢板 / 头盔只改站位，不改这一下怎么飞 */
export function resolveAttackFx(def: HeroDef, mods: readonly ModDef[]): AttackFx {
  const comboFx = comboOf(mods.map((m) => m.id))?.fx;
  if (comboFx) return comboFx;
  for (let i = mods.length - 1; i >= 0; i -= 1) {
    const fx = MOD_FX[mods[i]!.id];
    if (fx) return fx;
  }
  return HERO_FX[def.id] ?? (def.range <= 1 ? 'slash' : 'bolt');
}

export function resolveEnemyFx(enemyId: string): EnemyFx {
  return ENEMY_FX[enemyId] ?? 'claw';
}

export function attackSfx(fx: AttackFx, phase: 'atk' | 'hit'): string {
  return `${phase}_${fx}`;
}

/** 实体弹剪影。远程靠这个认「飞出去的是啥」，不要用光团 */
export function projSprite(fx: AttackFx): string | null {
  if (fx === 'sniper') return 'pebble';
  if (fx === 'bolt') return 'needle';
  if (fx === 'orb') return 'disc';
  if (fx === 'poke') return 'pipe';
  if (fx === 'blast') return 'cracker';
  if (fx === 'wind') return 'leaf';
  return null;
}
