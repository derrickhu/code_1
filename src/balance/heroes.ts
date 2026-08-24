/**
 * 村民池（纯数据）
 *
 * 代码里沿用 hero / HeroDef 这套术语（改名不产生玩家价值，只会牵动全工程），
 * 但游戏里他们是**村口闲人**，名字与文案都按 docs/00-体验目标.md §1 的基调走。
 *
 * 三条设计原则：
 *
 * 1. **村民是起点，不是终点。** 每人只有一个起手特性，用来给改造提供一个方向；
 *    真正决定这一局长什么样的是改装件（见 mods.ts）。所以起手特性刻意做得朴素，
 *    强度留给改装件——「一个平平无奇的人被我改造成怪物」，前半句必须先成立。
 *
 * 2. **没有等级。** 局内唯一的成长来源是改装件，因此每件改装件都是大事。
 *    加了等级系统就会出现「升级卡」这种只加数值的选项，直接撞反目标第一条。
 *
 * 3. **起手特性必须肉眼可见。** 自走战斗里玩家不点技能，所谓特性就是常驻表现，
 *    看不见的特性等于没做。
 */

import type { Ability } from './mods';

/**
 * 起手特性。刻意只取 Ability 里这六种「朴素」效果——
 * 改定位那几种（射程、队首翻倍、越挨越猛……）是改装件的专属戏份，
 * 村民自带的话，「平平无奇的人被我改造成怪物」这句话的前半句就不成立了。
 */
export type HeroSkill = Extract<
  Ability,
  { kind: 'shield' | 'heal' | 'splash' | 'execute' | 'slowOnHit' | 'lifesteal' }
>;

export interface HeroDef {
  id: string;
  /** 村民名。一听就是身边人，不要奇幻词 */
  name: string;
  hp: number;
  atk: number;
  def: number;
  /** 射程（格）。1 即近战，只能打贴到脸上的 */
  range: number;
  /** 攻击间隔（ms），越小越快 */
  attackIntervalMs: number;
  /** 起手特性的名字，说人话 */
  skillName: string;
  skill: HeroSkill;
  /** 面向玩家的一句话，选人卡与结算都用它 */
  skillDesc: string;
  /** 一句人物介绍，只用于选人卡，帮玩家记住脸 */
  flavor: string;
  /** 别人替不了的活。选人看这个，不看面板 */
  job: string;
  /** 哪类破烂装他最值 */
  eats: string;
}

/** 近战挥砍，远程走弹道。观战层用，不改伤害规则 */
export function isMeleeRole(def: HeroDef): boolean {
  return def.range <= 1;
}

/** 能打多远。别写成「后排 5」，那会被认成第五个位子 */
export function heroReachLine(range: number): string {
  return range <= 1 ? '贴脸' : `射程 ${range}`;
}

/** 村子没点过人时的默认三人：肉、锤、后排 */
export const DEFAULT_SQUAD: readonly string[] = ['tiezhu', 'dachui', 'laoyanqiang'];

export const HEROES: readonly HeroDef[] = [
  {
    id: 'tiezhu',
    name: '铁柱',
    hp: 1700,
    atk: 62,
    def: 50,
    range: 1,
    attackIntervalMs: 1000,
    skillName: '棉袄够厚',
    skill: { kind: 'shield', amount: 160, everyMs: 5000 },
    skillDesc: '每 5 秒自己缓一层，能扛 160 点',
    flavor: '三层棉袄加摩托头盔，站前面最合适',
    job: '挨',
    eats: '高压锅、反弹、加厚，装他最值',
  },
  {
    id: 'dachui',
    name: '王大锤',
    hp: 1000,
    atk: 165,
    def: 22,
    range: 1,
    attackIntervalMs: 1300,
    skillName: '锤一下晕半天',
    skill: { kind: 'slowOnHit', slowPct: 35, durationMs: 2000 },
    skillDesc: '被他锤到的，两秒内动作慢 35%',
    flavor: '五金店老板，抡起大锤来不看人',
    job: '控',
    eats: '秤砣、电锯，打一下能拖住',
  },
  {
    id: 'laoli',
    name: '屠户老李',
    hp: 1150,
    atk: 120,
    def: 28,
    range: 2,
    attackIntervalMs: 1000,
    skillName: '越砍越精神',
    skill: { kind: 'lifesteal', healPct: 30 },
    skillDesc: '砍出去的伤害，三成变自己的血',
    flavor: '剁了半辈子肉，站第二排也能砍到',
    job: '中',
    eats: '水管、电锯，不当队首也能输出',
  },
  {
    id: 'erjiu',
    name: '二舅',
    hp: 900,
    atk: 92,
    def: 22,
    range: 3,
    attackIntervalMs: 1100,
    skillName: '顺手修一下',
    skill: { kind: 'heal', amount: 110, everyMs: 3000 },
    skillDesc: '每 3 秒给伤得最重的那个补 110',
    flavor: '什么破烂到他手里都能装上',
    job: '修',
    eats: '队里软的时候带他，音响装谁都行',
  },
  {
    id: 'sanshen',
    name: '三婶',
    hp: 780,
    atk: 105,
    def: 14,
    range: 4,
    attackIntervalMs: 1200,
    skillName: '音响一开一片倒',
    skill: { kind: 'splash', damagePct: 55, radius: 1 },
    skillDesc: '打人带响，旁边的也吃 55% 伤害',
    flavor: '广场舞领队，音响就是她的武器',
    job: '片',
    eats: '鼓风机、电线，一群怪过来她是芯',
  },
  {
    id: 'laoyanqiang',
    name: '老烟枪',
    hp: 680,
    atk: 210,
    def: 10,
    range: 5,
    attackIntervalMs: 1500,
    skillName: '抽完这口接着来',
    skill: { kind: 'execute', maxChain: 2 },
    skillDesc: '打倒一个立刻再来一下，最多连 2 次',
    flavor: '蹲着抽烟，站起来才动手，站得越远越准',
    job: '点',
    eats: '钢板、头盔，脆皮被逼到最前面',
  },
];

export const HERO_BY_ID: Readonly<Record<string, HeroDef>> = Object.fromEntries(
  HEROES.map((h) => [h.id, h]),
);

export function getHero(id: string): HeroDef {
  const h = HERO_BY_ID[id];
  if (!h) throw new Error(`未知村民: ${id}`);
  return h;
}

export { SLOT_NAME as QUEUE_LABELS, SLOT_VIEW_ORDER } from './combat';

/**
 * 叫人是换位子，不是收集。满员再点新人，换进当前高亮槽，不要点了没反应。
 */
export function placeHero(
  squad: readonly string[],
  id: string,
  focus: number,
  cap: number,
): { squad: string[]; focus: number } {
  const i = squad.indexOf(id);
  if (i >= 0) return { squad: [...squad], focus: i };
  if (squad.length < cap) {
    const next = [...squad, id];
    return { squad: next, focus: next.length - 1 };
  }
  const slot = Math.max(0, Math.min(cap - 1, Math.floor(focus)));
  const next = [...squad];
  next[slot] = id;
  return { squad: next, focus: slot };
}

/** 村里点两个人换位子。和局里 placeInSlot 同一件事，只是还没开打 */
export function swapSquad(squad: readonly string[], a: number, b: number): string[] {
  const next = [...squad];
  const i = Math.max(0, Math.min(next.length - 1, Math.floor(a)));
  const j = Math.max(0, Math.min(next.length - 1, Math.floor(b)));
  if (i === j) return next;
  const tmp = next[i];
  next[i] = next[j]!;
  next[j] = tmp!;
  return next;
}
