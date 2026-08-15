/**
 * 英雄池（纯数据）
 *
 * 切片放 12 个 = 3 系 × 4 定位。刻意让**同定位的三个英雄基础数值完全相同**，
 * 差别只来自系别与特色技能。这不是省事，是为了让验收可归因：
 * 如果试玩者说不出「换人有差别」，就一定是克制强度或技能设计的问题，
 * 而不会被基础数值差混淆。见 docs/00-体验目标.md 审视清单第 1 条。
 *
 * 每人一个**自动触发**技能。自走战斗里玩家不点技能，所谓技能就是「常驻特性」，
 * 因此全部设计成命中时、周期性或光环式触发，且效果在战场上肉眼可见 ——
 * 主快感是看戏，看不见的技能等于没做。
 */

import type { Element } from './counters';

export type HeroRole = 'guard' | 'striker' | 'splash' | 'support';

export const ROLE_NAMES: Readonly<Record<HeroRole, string>> = {
  guard: '前排',
  striker: '单体',
  splash: '范围',
  support: '辅助',
};

/**
 * 技能效果。每一项都必须能在 tick 模拟里量化，否则无法用 tools/sim.ts 回归 ——
 * 「不可量化的技能」在切片阶段一律不做。
 */
export type HeroSkill =
  /** 受击时反弹伤害给攻击者 */
  | { kind: 'thorns'; reflectPct: number }
  /** 击杀后立刻追加一次攻击，可连锁 */
  | { kind: 'execute'; maxChain: number }
  /** 攻击溅射到目标附近的敌人 */
  | { kind: 'splash'; damagePct: number; radius: number }
  /** 光环：全队攻速提升 */
  | { kind: 'hasteAura'; hastePct: number }
  /** 命中时减速目标 */
  | { kind: 'slowOnHit'; slowPct: number; durationMs: number }
  /** 造成伤害时按比例回复自身 */
  | { kind: 'lifesteal'; healPct: number }
  /** 光环：射程内敌人持续减速 */
  | { kind: 'slowAura'; slowPct: number }
  /** 周期治疗当前血量最低的友军 */
  | { kind: 'heal'; amount: number; everyMs: number }
  /** 周期给自己叠一层吸收护盾 */
  | { kind: 'shield'; amount: number; everyMs: number }
  /** 攻击穿透同一路径上的多个敌人 */
  | { kind: 'pierce'; extraTargets: number }
  /** 周期把射程内敌人拉回并造成伤害 */
  | { kind: 'vortex'; damage: number; pullDist: number; everyMs: number }
  /** 光环：全队暴击 */
  | { kind: 'critAura'; chancePct: number; critMult: number };

export interface HeroDef {
  id: string;
  name: string;
  element: Element;
  role: HeroRole;
  /** Lv1 基础值，升级按 LEVEL_GROWTH 缩放 */
  hp: number;
  atk: number;
  def: number;
  /** 射程（格），从自身站位往战场远端延伸 */
  range: number;
  /** 攻击间隔（ms），越小越快 */
  attackIntervalMs: number;
  skillName: string;
  skill: HeroSkill;
  /** 面向玩家的一句话，结算与三选一卡面都用它 */
  skillDesc: string;
}

/** 同定位共用的基础模板，保证「差别只来自系别与技能」 */
const ROLE_BASE: Readonly<
  Record<HeroRole, Pick<HeroDef, 'hp' | 'atk' | 'def' | 'range' | 'attackIntervalMs'>>
> = {
  // 前排射程要给够：站位 14 加射程 14 才有约 5 秒的免费输出窗口，
  // 否则敌人一进射程就已经贴到脸上，前排等于只会挨打不会还手
  guard: { hp: 900, atk: 40, def: 40, range: 14, attackIntervalMs: 1000 },
  striker: { hp: 380, atk: 105, def: 10, range: 30, attackIntervalMs: 900 },
  splash: { hp: 460, atk: 62, def: 15, range: 22, attackIntervalMs: 1200 },
  support: { hp: 520, atk: 45, def: 20, range: 20, attackIntervalMs: 1100 },
};

function hero(
  id: string,
  name: string,
  element: Element,
  role: HeroRole,
  skillName: string,
  skill: HeroSkill,
  skillDesc: string,
): HeroDef {
  return { id, name, element, role, ...ROLE_BASE[role], skillName, skill, skillDesc };
}

export const HEROES: readonly HeroDef[] = [
  // ── 炎：主动进攻，技能都在「打得更狠」这条线上 ──
  hero('flame_guard', '熔岩卫', 'flame', 'guard', '焦甲', { kind: 'thorns', reflectPct: 25 },
    '被近身攻击时，把 25% 伤害烧回去'),
  hero('flame_striker', '赤刃', 'flame', 'striker', '连斩', { kind: 'execute', maxChain: 2 },
    '击杀敌人后立刻再挥一刀，最多连锁 2 次'),
  hero('flame_splash', '燎原者', 'flame', 'splash', '燎原', { kind: 'splash', damagePct: 45, radius: 6 },
    '攻击溅到附近敌人，造成 45% 伤害'),
  hero('flame_support', '战鼓手', 'flame', 'support', '战鼓', { kind: 'hasteAura', hastePct: 20 },
    '全队攻速提升 20%'),

  // ── 藤：拖时间与续航，靠拉长输出窗口取胜 ──
  hero('vine_guard', '荆棘卫', 'vine', 'guard', '荆棘壁', { kind: 'slowOnHit', slowPct: 30, durationMs: 2000 },
    '命中的敌人移速降低 30%，持续 2 秒'),
  hero('vine_striker', '汲藤客', 'vine', 'striker', '汲取', { kind: 'lifesteal', healPct: 25 },
    '造成伤害的 25% 回复自身'),
  hero('vine_splash', '缠藤妖', 'vine', 'splash', '藤缚', { kind: 'slowAura', slowPct: 25 },
    '射程内所有敌人移速降低 25%'),
  hero('vine_support', '春息祭司', 'vine', 'support', '生机', { kind: 'heal', amount: 90, everyMs: 3000 },
    '每 3 秒治疗血量最低的队友 90 点'),

  // ── 潮：爆发与穿透，处理成群与厚甲 ──
  hero('tide_guard', '浪盾武士', 'tide', 'guard', '浪盾', { kind: 'shield', amount: 220, everyMs: 5000 },
    '每 5 秒获得 220 点吸收护盾'),
  hero('tide_striker', '贯流枪手', 'tide', 'striker', '贯流', { kind: 'pierce', extraTargets: 2 },
    '攻击穿透，额外命中身后 2 个敌人'),
  hero('tide_splash', '漩涡术士', 'tide', 'splash', '漩涡', { kind: 'vortex', damage: 70, pullDist: 6, everyMs: 4500 },
    '每 4.5 秒把射程内敌人拉回 6 格并造成 70 伤害'),
  hero('tide_support', '潮汐歌者', 'tide', 'support', '潮汐', { kind: 'critAura', chancePct: 20, critMult: 1.8 },
    '全队 20% 概率打出 1.8 倍暴击'),
];

export const HERO_BY_ID: Readonly<Record<string, HeroDef>> = Object.fromEntries(
  HEROES.map((h) => [h.id, h]),
);

export function getHero(id: string): HeroDef {
  const h = HERO_BY_ID[id];
  if (!h) throw new Error(`未知英雄: ${id}`);
  return h;
}

/** 局内等级上限。只在单局内成长，不做局外养成（无版号，且切片验的是单局） */
export const MAX_LEVEL = 5;

/**
 * 每级对 hp 与 atk 的乘算加成。
 *
 * 0.35 而不是 0.25：回归显示 0.25 时满级也只有 2 倍，
 * 撑不住后期波次的敌人数量，第 13 波必现断崖且通关率恒为 0。
 * 体验目标要的是「越攒越能打」，成长空间必须真的存在。
 */
export const LEVEL_GROWTH = 0.35;

export function levelMult(level: number): number {
  return 1 + (level - 1) * LEVEL_GROWTH;
}
