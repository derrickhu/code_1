/**
 * 观战签名。战斗数字仍由引擎算，这里只回答「这一下长什么样、什么声」。
 * 每种破烂 / 每种外星人必须能和别的分清，否则改造等于没做。
 */

import { comboOf } from './combos';
import { MOD_SLOT } from './gear';
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

/** 栓狗、穿戴不改这一下怎么飞 */
const FX_SKIP = new Set([
  'helmet', 'quilt', 'steelplate', 'pressurecooker',
  'dogleash', 'chickenfeed', 'holler',
]);

const MOD_FX: Readonly<Record<string, AttackFx>> = {
  pipe: 'poke',
  weight: 'smash',
  blower: 'wind',
  wire: 'pierce',
  chainsaw: 'saw',
  firecracker: 'blast',
  steelplate: 'slash',
  pressurecooker: 'smash',
  pot: 'smash',
  speaker: 'orb',
  helmet: 'slash',
  quilt: 'slash',
  dogleash: 'slash',
  chickenfeed: 'slash',
  holler: 'orb',
  sickle: 'slash',
  foam: 'wind',
  sack: 'slash',
  shovel: 'poke',
  battery: 'bolt',
  slingshot: 'sniper',
  stool: 'smash',
  chili: 'blast',
  fridge: 'smash',
  gascan: 'blast',
  thermos: 'orb',
  bell: 'orb',
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

/** 这一下用哪件破烂的皮。穿戴 / 栓狗不改飞法 */
export function resolveFxSkin(def: HeroDef, mods: readonly ModDef[]): string {
  const combo = comboOf(mods.map((m) => m.id));
  if (combo?.fx) return combo.id;
  for (let i = mods.length - 1; i >= 0; i -= 1) {
    const id = mods[i]!.id;
    if (FX_SKIP.has(id)) continue;
    const slot = MOD_SLOT[id];
    if (slot && slot !== 'hand') continue;
    if (MOD_FX[id]) return id;
  }
  return def.id;
}

export function fxFamilyOf(skin: string): AttackFx {
  const comboFx = COMBOS_FX[skin];
  if (comboFx) return comboFx;
  const mod = MOD_FX[skin];
  if (mod) return mod;
  return HERO_FX[skin] ?? 'slash';
}

const COMBOS_FX: Readonly<Record<string, AttackFx>> = {
  longsaw: 'saw',
  doorcannon: 'smash',
  windcrack: 'blast',
  beatrack: 'pierce',
  coldwind: 'wind',
  harvest: 'pierce',
};

/** 后装的破烂覆盖起手。钢板 / 头盔 / 棉被只改站位，不改这一下怎么飞 */
export function resolveAttackFx(def: HeroDef, mods: readonly ModDef[]): AttackFx {
  return fxFamilyOf(resolveFxSkin(def, mods));
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
  if (fx === 'slash') return 'cleaver';
  return null;
}
