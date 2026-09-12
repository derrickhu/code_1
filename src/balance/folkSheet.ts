/**
 * 村民能力表。给图鉴 / 详情用，不另造一套养成。
 *
 * 战斗数字仍只来自 statsOf：下手=atk、抗造=hp、够得着=range、出手=interval。
 * 条的长短按「一阶身份」比全村，不跟手艺一起涨 —— 涨的是右边那个数。
 * 招牌是每人两字，打法章跟 evoKind 走，文案不许写成攻防血魔。
 */
import {
  VILLAGERS, evoKindOf, jobOf, statsOf,
  type EvoKind, type VillagerDef,
} from '@/balance/villagers';

export type FolkStatKey = 'hit' | 'hide' | 'reach' | 'tempo';

export interface FolkStatRow {
  key: FolkStatKey;
  label: string;
  text: string;
  ratio: number;
  color: number;
}

export interface FolkSign {
  name: string;
  /** 别人替不了的活，原句 */
  line: string;
  /** 上场怎么用。两字招牌要靠这句才读得懂 */
  use: string;
  kind: EvoKind;
  kindName: string;
  /** 这一阶改了什么打法，空着就是还没改 */
  kindLine: string;
}

export interface FolkSheet {
  stats: readonly FolkStatRow[];
  sign: FolkSign;
}

export const FOLK_STAT_COLOR: Readonly<Record<FolkStatKey, number>> = {
  hit: 0xc45a22,
  hide: 0xc9a46a,
  reach: 0x7a9e7e,
  tempo: 0xd9a13b,
};

/** 每人两字招牌。别人替不了的活压成章，别写成通用职业名 */
export const FOLK_SIGN: Readonly<Record<string, string>> = {
  guogai: '挡伞',
  yuwang: '撒网',
  laoyanqiang: '连珠',
  labaye: '喊人',
  tiezhu: '顶门',
  shimo: '堵路',
  miankuzhang: '磨人',
  erjiu: '焊修',
  chengtuo: '回砸',
  dachui: '钉人',
  dianju: '横切',
  shazhu: '分汤',
  gaoyaguo: '攒炸',
  gangban: '反弹',
  laoli: '凶砍',
  bianpao: '炸响',
  qiangou: '狗挡',
  jishi: '鸡围',
  sanshen: '震场',
  baowenhu: '热水',
};

export const KIND_NAME: Readonly<Record<EvoKind, string>> = {
  plain: '',
  pierce: '穿透',
  cleave: '横扫',
  regen: '回劲',
  standUp: '爬起来',
  laneHeal: '一路补',
  allHeal: '全场补',
  lifesteal: '回血砍',
  reflect: '弹回去',
  burst: '攒炸',
  slowHard: '钉死',
  hasteAura: '催手',
};

/** 两字招牌的用法。玩家要能回答「带他上场干什么」 */
export const FOLK_USE: Readonly<Record<string, string>> = {
  guogai: '站中排给人挡飞碟。远程弹先打在锅盖上，后排才能安心打。',
  yuwang: '不用贴脸，往前撒网。网住的走不动，整排往前挤。',
  laoyanqiang: '站最后面点名。够得着最远，撂倒一个立刻再打一下。',
  labaye: '隔着场子喊人回血。自己不用往前走，后排站着补。',
  tiezhu: '站最前面挨。抗造最高，倒了这一阶还能自己爬起来。',
  shimo: '把路堵死。怪推不动她，后面的人才能打得着。',
  miankuzhang: '站第二排贴脸磨。抗造比打手厚，不靠一下打死，靠熬到对面先倒。',
  erjiu: '边挨边修。伤得最重的那个归他补，前排倒得慢。',
  chengtuo: '挨一下砸一下。人围得越多越划算，别让他空站。',
  dachui: '锤一下就变慢。冲脸的按住，给后排留出手时间。',
  dianju: '出手慢，一下切一片。怪挤成排时再上场，别拿他点名。',
  shazhu: '下手最重的奶。砍出去的伤害分给队友，输出和补血绑在一刀上。',
  gaoyaguo: '挨够了自己炸。越挨越勤，站前面把伤害攒成一圈。',
  gangban: '谁打他谁疼。把输出怪按在自己身上，伤害弹回去。',
  laoli: '血越少打得越凶。别满血藏着，掉血才是他的手艺。',
  bianpao: '被打就炸一串。炸完周围回血，挨打也是在干活。',
  qiangou: '狗替他挡第一波。自己站后面看，前面倒了狗还会回来。',
  jishi: '一群鸡围住最前面那个。用数量拦路，不靠自己抗。',
  sanshen: '音响一开一片倒。怪挤得越密越值，别拿她点单。',
  baowenhu: '给旁边倒热水。出手变快，跟着他的人都快一档。',
};

export const KIND_LINE: Readonly<Record<EvoKind, string>> = {
  plain: '',
  pierce: '这一阶：一发能打到后面的人。',
  cleave: '这一阶：一下扫到旁边几个。',
  regen: '这一阶：站着会自己回血。',
  standUp: '这一阶：倒下去能原地爬起来一次。',
  laneHeal: '这一阶：一次补一整条路。',
  allHeal: '这一阶：一次补全场。',
  lifesteal: '这一阶：砍出去的伤害会吃回自己身上。',
  reflect: '这一阶：挨的打会弹回对面。',
  burst: '这一阶：挨够了自己炸一圈。',
  slowHard: '这一阶：打中的会钉在原地走不动。',
  hasteAura: '这一阶：旁边的人出手变快。',
};

export function folkSignName(id: string): string {
  return FOLK_SIGN[id] ?? '本职';
}

export function folkKindName(kind: EvoKind): string {
  return KIND_NAME[kind];
}

function identOf(def: VillagerDef): ReturnType<typeof statsOf> {
  return statsOf(def, 1, 0, 1, 1);
}

let _peak: { hit: number; hide: number; reach: number; tempo: number } | null = null;

/** 全村一阶底子的峰。条用这个当 1，手艺只改数字不改长短 */
export function folkIdentPeak(): { hit: number; hide: number; reach: number; tempo: number } {
  if (_peak) return _peak;
  let hit = 0;
  let hide = 0;
  let reach = 0;
  let tempo = 0;
  for (const v of VILLAGERS) {
    const s = identOf(v);
    hit = Math.max(hit, s.atk);
    hide = Math.max(hide, s.hp);
    reach = Math.max(reach, s.range);
    tempo = Math.max(tempo, 1 / Math.max(1, s.interval));
  }
  _peak = {
    hit: Math.max(1, hit),
    hide: Math.max(1, hide),
    reach: Math.max(1, reach),
    tempo: Math.max(1e-6, tempo),
  };
  return _peak;
}

function clamp01(n: number): number {
  return Math.max(0.08, Math.min(1, n));
}

export function folkSheet(
  def: VillagerDef,
  opts: { craft: number; stars: number; villageMul?: number; stage?: number },
): FolkSheet {
  const stage = opts.stage ?? 1;
  const now = statsOf(def, stage, opts.stars, opts.villageMul ?? 1, opts.craft);
  const ident = identOf(def);
  const peak = folkIdentPeak();
  const heal = jobOf(def.role) === 'heal';
  const stats: FolkStatRow[] = [
    {
      key: 'hit',
      label: heal ? '修补' : '下手',
      text: String(now.atk),
      ratio: clamp01(ident.atk / peak.hit),
      color: FOLK_STAT_COLOR.hit,
    },
    {
      key: 'hide',
      label: '抗造',
      text: String(now.hp),
      ratio: clamp01(ident.hp / peak.hide),
      color: FOLK_STAT_COLOR.hide,
    },
    {
      key: 'reach',
      label: '够得着',
      text: `${now.range}格`,
      ratio: clamp01(ident.range / peak.reach),
      color: FOLK_STAT_COLOR.reach,
    },
    {
      key: 'tempo',
      label: '出手',
      text: `${(now.interval / 1000).toFixed(1)}秒`,
      ratio: clamp01((1 / Math.max(1, ident.interval)) / peak.tempo),
      color: FOLK_STAT_COLOR.tempo,
    },
  ];
  const kind = evoKindOf(def, stage);
  return {
    stats,
    sign: {
      name: folkSignName(def.id),
      line: def.job,
      use: FOLK_USE[def.id] ?? def.job,
      kind,
      kindName: folkKindName(kind),
      kindLine: KIND_LINE[kind],
    },
  };
}
