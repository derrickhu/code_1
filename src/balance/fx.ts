/**
 * 观战签名。战斗数字仍由引擎算，这里只回答「这一下长什么样、什么声」。
 *
 * **每个村民的每一阶都必须能和别的分清。** 这不是美术偏好，
 * 是 §4.1「进化改的是打法和形态，不是数值」的落地口：
 * 玩家花了 400 废铁 18 零件把电锯哥喂到三阶，屏幕上得看出他换了家伙。
 * 只把血量攻击调大的进化不做，所以这张表里凡是进化阶换了打法的，
 * 特效也必须跟着换（弹弓叔 sniper→pierce、电锯哥 slash→saw、王大锤 smash→poke）。
 */

import { handIdOf } from './gear';
import type { Lane, VillagerDef } from './villagers';

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

/**
 * 每人三阶的打击特效。长度必须是 3。
 *
 * 同一阶里换了特效的那几个，对应 villagers.evo[].pitch 里写的形态变化 ——
 * 两处必须同时改，否则「他明明换了家伙，打起来还是老样子」。
 */
const FX_BY_STAGE: Readonly<Record<string, readonly [AttackFx, AttackFx, AttackFx]>> = {
  // 站远点打
  guogai: ['smash', 'smash', 'smash'],
  yuwang: ['wind', 'wind', 'pierce'],
  laoyanqiang: ['sniper', 'sniper', 'pierce'],
  labaye: ['orb', 'orb', 'orb'],
  // 挨得住
  tiezhu: ['slash', 'slash', 'smash'],
  shimo: ['smash', 'smash', 'smash'],
  miankuzhang: ['poke', 'poke', 'poke'],
  erjiu: ['bolt', 'bolt', 'bolt'],
  // 下手重
  chengtuo: ['smash', 'smash', 'smash'],
  dachui: ['smash', 'smash', 'poke'],
  dianju: ['slash', 'saw', 'saw'],
  shazhu: ['slash', 'slash', 'slash'],
  // 越挨越猛
  gaoyaguo: ['smash', 'blast', 'blast'],
  gangban: ['slash', 'pierce', 'pierce'],
  laoli: ['slash', 'slash', 'slash'],
  bianpao: ['blast', 'blast', 'blast'],
  // 带一帮人
  qiangou: ['slash', 'slash', 'slash'],
  jishi: ['wind', 'wind', 'wind'],
  sanshen: ['orb', 'orb', 'orb'],
  baowenhu: ['orb', 'orb', 'orb'],
};


/** 门路的兜底特效。新加村民忘了进表时不至于全场一个样 */
const LANE_FX: Readonly<Record<Lane, AttackFx>> = {
  reach: 'sniper',
  stand: 'slash',
  heavy: 'smash',
  rage: 'slash',
  band: 'orb',
};

const ENEMY_FX: Readonly<Record<string, EnemyFx>> = {
  grunt: 'claw',
  cube: 'bash',
  canister: 'spark',
  rusher: 'claw',
  saucer: 'beam',
  armor: 'bash',
};

export function resolveAttackFx(def: VillagerDef, evoStage = 1): AttackFx {
  const row = FX_BY_STAGE[def.id];
  if (!row) return LANE_FX[def.lane];
  const i = Math.max(0, Math.min(2, Math.floor(evoStage) - 1));
  return row[i]!;
}

/**
 * 这一下用哪一件家伙的皮。
 *
 * 皮跟着**手上那一件**走，而 AttackFx 跟着**进化阶**走，两者刻意分开：
 * 弹弓叔三阶才真穿两个，弹体还是石子；二阶皮筋加厚但不改家族，
 * 免得特效穿过去、引擎只打一个。
 */
export function resolveFxSkin(def: VillagerDef, evoStage = 1): string {
  return handIdOf(def.id, evoStage);
}

/** 家伙自带的家族。skinLook 拿它当底子，场景会再传准确的 fx 覆盖 */
const GEAR_FX: Readonly<Record<string, AttackFx>> = {
  wrench: 'slash',
  hammer: 'smash',
  cleaver: 'slash',
  driver: 'bolt',
  radio: 'orb',
  sling: 'sniper',
  pipe: 'poke',
  chainsaw: 'saw',
  weight: 'smash',
  pot: 'smash',
  speaker: 'orb',
  blower: 'wind',
  firecracker: 'blast',
  wire: 'pierce',
};

export function fxFamilyOf(skin: string): AttackFx {
  return GEAR_FX[skin] ?? 'slash';
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
