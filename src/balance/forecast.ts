/**
 * 装配预告：同一件破烂装在三个人身上，说法不一样。
 * 点人之前不写值 / 浪费；焊完才用 weldVerdict 说。
 * 选牌上只点名能叠出的合体（comboTeaser）。
 */
import { comboIfAdd } from './combos';
import type { ModDef } from './mods';

export type ForecastFit = 'good' | 'ok' | 'waste';

export interface InstallForecast {
  /** 选牌上可以写长一点。人头和底栏只用 tag */
  line: string;
  tag: string;
  fit: ForecastFit;
}

const FIT_TAG: Record<ForecastFit, string> = {
  good: '值',
  ok: '能用',
  waste: '浪费',
};

function pack(line: string, fit: ForecastFit, tag?: string): InstallForecast {
  return { line, tag: tag ?? FIT_TAG[fit], fit };
}

export interface ForecastHero {
  def: { name: string; hp: number; atk: number; range: number; attackIntervalMs: number };
  slot: number;
  stats: {
    range: number;
    intervalMs: number;
    // 这三样是能教给小东西的「一手」，见 BattleEngine 的 PetUnit.learned
    slowOnHit?: { slowPct: number; durationMs: number };
    splash?: { damagePct: number; radius: number };
    lifestealPct?: number;
  };
  mods: readonly { id: string }[];
}

const THIN_HP = 1000;
/** 王大锤 165、老烟枪 210 算「能打的」；铁柱 62、二舅 92 不算 */
const PUNCHY_ATK = 150;

export function installForecast(hero: ForecastHero, mod: ModDef): InstallForecast {
  const combo = comboIfAdd(hero.mods.map((m) => m.id), mod.id);
  if (combo) return pack(`${hero.def.name}能叠出${combo.name}`, 'good', combo.name);

  const melee = hero.stats.range <= 1;
  const front = hero.slot === 0;
  const thin = hero.def.hp < THIN_HP;
  const fast = hero.def.attackIntervalMs <= 1000;

  switch (mod.effect.kind) {
    case 'rangeUp':
      return melee
        ? pack('贴脸的能站后面捅了', 'good')
        : pack('他本来就够得着，浪费', 'waste');
    case 'frontMult':
      return front
        ? pack('队首正好翻倍', 'good')
        : pack('站前排才翻倍，得换上去', 'ok');
    case 'rageOnHurt':
      return thin
        ? pack('皮薄，还没叠就倒', 'waste')
        : pack('挨打叠层，给他扛', 'good');
    case 'heavySwing':
      return fast
        ? pack('快手改成重炮', 'good')
        : pack('他已经慢，再绑更钝', 'ok');
    case 'splash':
    case 'pierce':
      return melee
        ? pack('贴脸也能扫一片', 'ok')
        : pack('站后面扫一条线', 'good');
    case 'revive':
      return thin
        ? pack('脆皮敢站前了', 'good')
        : pack('肉的本来就抗揍', 'ok');
    case 'thorns':
    case 'armorPct':
      return front
        ? pack('队首穿着才挨得到', 'good')
        : pack('后排挨不到几下', 'ok');
    case 'sawGrip':
      return melee
        ? pack('贴脸的更能锯', 'good')
        : pack('焊上就得贴脸打', 'ok');
    case 'atkPct':
      return pack(`${hero.def.name}装上更能打`, 'ok');
    case 'crit':
      return pack('打一窝小灰才值', 'ok');
    case 'teamHaste':
      return front
        ? pack('他倒了音响就停', 'waste')
        : pack('别让他站最前', 'good');
    // 小东西按主人的力气咬，还会跟主人学那一手。血量一视同仁，所以
    // 「装给谁」全看这两条 —— 这一件的三句话也就差得最远
    case 'summon': {
      const punchy = hero.def.atk >= PUNCHY_ATK;
      const teaches = Boolean(
        hero.stats.slowOnHit || hero.stats.splash || (hero.stats.lifestealPct ?? 0) > 0,
      );
      if (teaches) {
        return punchy
          ? pack('又有力气又有手艺，放出去照他的路子打', 'good')
          : pack('跟他学得到那一手，咬着还带效果', 'good');
      }
      if (punchy) return pack('按他的力气咬，够凶', 'good');
      return pack('他不凶又没手艺，放出来也软', 'waste');
    }
    default:
      return pack(mod.becomes, 'ok');
  }
}

/** 焊完再说。点人之前不写值 / 浪费 */
export function weldVerdict(hero: ForecastHero, mod: ModDef): string | undefined {
  const guess = installForecast(hero, mod);
  if (guess.fit === 'waste') return `${hero.def.name}装这件不值：${guess.line}`;
  if (guess.fit === 'good') return `${hero.def.name}对上了——${guess.line}`;
  return undefined;
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
