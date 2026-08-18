/**
 * 三选一规则（纯数据 + 抽取规则）
 *
 * 取舍是设计出来的，不是随机出来的：每次固定各抽一张
 * 「新英雄 / 升级已有 / 阵型增益」，让三张牌分别对应
 * **覆盖面、单点强度、通用收益**三种不同价值。玩家因此必须权衡
 * 「我缺一个能克下一波的系」和「我把手里这个练厚」。
 *
 * 两个刻意的反直觉设定：
 * 1. 升级卡的目标是**随机**指定已有英雄，不让玩家挑。否则玩家永远升最强的那个，
 *    升级卡就成了无脑最优解，取舍消失。
 * 2. 新英雄卡**不**优先给玩家缺的系。总给你需要的等于替玩家做了决策，
 *    「刚才那个三选一选对了」这句台词也就无从产生。
 *
 * 验收指标：埋点看每次三选一的类别选择分布，任一类别被选超过 60%
 * 即说明没有真取舍，要回来改本文件而不是改数值。
 */

import type { Row } from './combat';
import type { HeroRole } from './heroes';

/**
 * 三选一出现在这些波次之前。加上开局首次选人，一局共 9 次选择。
 *
 * 前 5 波连续给，是因为开局只有 1 个英雄，「一个人」谈不上编队 ——
 * 必须让玩家在两分钟内把队组到 5 人左右，收英雄的手感才立得住。
 * 之后改为每两波一次，把节奏让回给观战。
 */
export const PICK_WAVES: readonly number[] = [2, 3, 4, 5, 7, 9, 11, 13];

/** 开局给几张英雄卡挑（只挑 1 个上场，满足十秒可懂：进来就选人然后开打） */
export const OPENING_CHOICES = 3;

export type TeamBuffEffect =
  | { kind: 'atkPct'; value: number }
  | { kind: 'hpPct'; value: number }
  | { kind: 'hastePct'; value: number }
  | { kind: 'frontDefPct'; value: number }
  | { kind: 'backAtkPct'; value: number }
  | { kind: 'baseHp'; value: number }
  /** 克制加成：放大「选对系别」的收益，是对抗反目标第一条的直接手段 */
  | { kind: 'counterBonus'; value: number };

export interface TeamBuffDef {
  id: string;
  name: string;
  desc: string;
  effect: TeamBuffEffect;
}

export const TEAM_BUFFS: readonly TeamBuffDef[] = [
  { id: 'buff_atk', name: '锋锐', desc: '全队攻击 +12%', effect: { kind: 'atkPct', value: 12 } },
  { id: 'buff_hp', name: '坚韧', desc: '全队生命 +15%', effect: { kind: 'hpPct', value: 15 } },
  { id: 'buff_haste', name: '疾风', desc: '全队攻速 +10%', effect: { kind: 'hastePct', value: 10 } },
  { id: 'buff_front_def', name: '铁壁', desc: '前排受到伤害降低 15%', effect: { kind: 'frontDefPct', value: 15 } },
  { id: 'buff_back_atk', name: '远射', desc: '后排攻击 +18%', effect: { kind: 'backAtkPct', value: 18 } },
  { id: 'buff_base_hp', name: '加固', desc: '底线生命 +2', effect: { kind: 'baseHp', value: 2 } },
  { id: 'buff_counter', name: '相克', desc: '克制时额外 +15% 伤害', effect: { kind: 'counterBonus', value: 15 } },
];

export const BUFF_BY_ID: Readonly<Record<string, TeamBuffDef>> = Object.fromEntries(
  TEAM_BUFFS.map((b) => [b.id, b]),
);

export function getTeamBuff(id: string): TeamBuffDef {
  const b = BUFF_BY_ID[id];
  if (!b) throw new Error(`未知阵型增益: ${id}`);
  return b;
}

export type PickOption =
  | { kind: 'recruit'; heroId: string }
  | { kind: 'levelUp'; heroId: string }
  | { kind: 'buff'; buffId: string };

export type PickKind = PickOption['kind'];

/** 模拟里用的选牌策略，用于比较不同玩家倾向对卡关波次的影响 */
export type PickStrategy =
  /** 总拿新英雄：覆盖面优先 */
  | 'coverage'
  /** 总升已有：单点强度优先 */
  | 'power'
  /** 总拿增益：通用收益优先 */
  | 'buff'
  /** 会看下一波系别选克制英雄，代表「懂了的玩家」 */
  | 'smart'
  /** 随机，代表首次接触的玩家 */
  | 'random';

export const PICK_STRATEGIES: readonly PickStrategy[] = [
  'coverage',
  'power',
  'buff',
  'smart',
  'random',
];

/** 上场人数上限。棋盘 9 格，只上 6 人，空格是站位 */
export const MAX_TEAM_SIZE = 6;

/** 招到新人时默认站哪一排 */
export const ROLE_ROW: Readonly<Record<HeroRole, Row>> = {
  guard: 'front',
  striker: 'mid',
  splash: 'mid',
  support: 'back',
};
