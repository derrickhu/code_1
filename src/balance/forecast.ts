/**
 * 装配预告：同一件破烂装在三个人身上，说出三句不同的话。
 * 玩家点人之前就该看见「值 / 能用 / 浪费」，不要装完才懂。
 */
import { comboIfAdd } from './combos';
import type { ModDef } from './mods';

export type ForecastFit = 'good' | 'ok' | 'waste';

export interface InstallForecast {
  line: string;
  fit: ForecastFit;
}

export interface ForecastHero {
  def: { name: string; hp: number; range: number; attackIntervalMs: number };
  slot: number;
  stats: { range: number; intervalMs: number };
  mods: readonly { id: string }[];
}

const THIN_HP = 1000;

export function installForecast(hero: ForecastHero, mod: ModDef): InstallForecast {
  const combo = comboIfAdd(hero.mods.map((m) => m.id), mod.id);
  if (combo) return { line: `${hero.def.name}能叠出${combo.name}`, fit: 'good' };

  const melee = hero.stats.range <= 1;
  const front = hero.slot === 0;
  const thin = hero.def.hp < THIN_HP;
  const fast = hero.def.attackIntervalMs <= 1000;

  switch (mod.effect.kind) {
    case 'rangeUp':
      return melee
        ? { line: '贴脸的能站后面捅了', fit: 'good' }
        : { line: '他本来就够得着，浪费', fit: 'waste' };
    case 'frontMult':
      return front
        ? { line: '队首正好翻倍', fit: 'good' }
        : { line: '站前排才翻倍，得换上去', fit: 'ok' };
    case 'rageOnHurt':
      return thin
        ? { line: '皮薄，还没叠就倒', fit: 'waste' }
        : { line: '挨打叠层，给他扛', fit: 'good' };
    case 'heavySwing':
      return fast
        ? { line: '快手改成重炮', fit: 'good' }
        : { line: '他已经慢，再绑更钝', fit: 'ok' };
    case 'splash':
    case 'pierce':
      return melee
        ? { line: '贴脸也能扫一片', fit: 'ok' }
        : { line: '站后面扫一条线', fit: 'good' };
    case 'revive':
      return thin
        ? { line: '脆皮敢站前了', fit: 'good' }
        : { line: '肉的本来就抗揍', fit: 'ok' };
    case 'thorns':
    case 'armorPct':
      return front
        ? { line: '队首穿着才挨得到', fit: 'good' }
        : { line: '后排挨不到几下', fit: 'ok' };
    case 'sawGrip':
      return melee
        ? { line: '贴脸的更能锯', fit: 'good' }
        : { line: '焊上就得贴脸打', fit: 'ok' };
    case 'atkPct':
      return { line: `${hero.def.name}装上更能打`, fit: 'ok' };
    case 'crit':
      return { line: '打一窝小灰才值', fit: 'ok' };
    case 'teamHaste':
      return front
        ? { line: '他倒了音响就停', fit: 'waste' }
        : { line: '别让他站最前', fit: 'good' };
    default:
      return { line: mod.becomes, fit: 'ok' };
  }
}

/** 选牌上点名：队里谁再拿这件能合体 */
export function comboTeaser(
  team: readonly ForecastHero[],
  modId: string,
): string | undefined {
  for (const h of team) {
    const combo = comboIfAdd(h.mods.map((m) => m.id), modId);
    if (combo) return `${h.def.name}能叠出${combo.name}`;
  }
  return undefined;
}
