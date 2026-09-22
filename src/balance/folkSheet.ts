/**
 * 村民能力表。给图鉴 / 详情用，不另造一套养成。
 *
 * 战斗数字仍只来自 statsOf：下手=atk、抗造=hp、够得着=range、出手=interval。
 *
 * 条分两段，都拿**全村现役峰值**当 1（`folkLivePeak`）：
 * 暗的那段是他一阶的天生身位，亮的那段是你在他身上练出来的。
 * 早先条钉死在「一阶 0 星村子 1 级」上，喂到 20 级条也不动 ——
 * 数字跳了条纹丝不动，玩家会信条不信数，这是误导，已经改掉。
 * 够得着和出手不吃成长，所以那两条天生就没有亮段，这是实话，别补。
 *
 * 招牌是每人两字，打法章跟 evoKind 走，文案不许写成攻防血魔。
 */
import {
  STAR_STEP, VILLAGERS, craftMul, evoKindOf, jobOf, statsOf,
  type EvoKind, type Stats, type VillagerDef,
} from '@/balance/villagers';

export type FolkStatKey = 'hit' | 'hide' | 'reach' | 'tempo';

export interface FolkStatRow {
  key: FolkStatKey;
  label: string;
  text: string;
  /** 喂完下一档变成多少。这一项不吃成长、或者喂不动了就没有 */
  next?: string;
  /** 当前值在全村现役里的身位 */
  ratio: number;
  /** 他一阶的天生身位。跟 ratio 的差就是练出来的那一截 */
  identRatio: number;
  color: number;
}

/** 条拿什么当 1。给 folkSheet 传现役峰，不传就退回全村一阶身份峰 */
export interface FolkPeak {
  hit: number;
  hide: number;
  reach: number;
  tempo: number;
}

/** 下手和抗造是怎么堆出来的。够得着和出手不吃这些，所以不在这儿 */
export interface FolkGrow {
  craft: number;
  star: number;
  village: number;
  total: number;
  /** 给人看的那一行 */
  text: string;
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
  grow: FolkGrow;
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
  yuwang: '不用贴脸，往前撒网。换了身之后网住的走不动，整排往前挤。',
  laoyanqiang: '站最后面点名。够得着最远，撂倒一个立刻再打一下。',
  labaye: '隔着场子喊人回血。自己不用往前走，后排站着补。',
  tiezhu: '站最前面挨。抗造最高，焊上那身之后倒了还能自己爬起来。',
  shimo: '把路堵死。怪推不动她，后面的人才能打得着。',
  miankuzhang: '站第二排贴脸磨。抗造比打手厚，不靠一下打死，靠熬到对面先倒。',
  erjiu: '边挨边修。伤得最重的那个归他补，前排倒得慢。',
  chengtuo: '挨一下砸一下。人围得越多越划算，别让他空站。',
  dachui: '站中排抡锤。焊到最后那身，锤下去会把人钉住，给后排留出手时间。',
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

/**
 * 这一身多出来的那一手。
 *
 * 不写「第几阶」：形态归星管（village.EVO_STAR_GATE），界面上只有形态名和星数，
 * 「一阶二阶三阶」这个说法已经不出现了。
 */
export const KIND_LINE: Readonly<Record<EvoKind, string>> = {
  plain: '',
  pierce: '这一身：一发能打到后面的人。',
  cleave: '这一身：一下扫到旁边几个。',
  regen: '这一身：站着会自己回血。',
  standUp: '这一身：倒下去能原地爬起来一次。',
  laneHeal: '这一身：一次补一整条路。',
  allHeal: '这一身：一次补全场。',
  lifesteal: '这一身：砍出去的伤害会吃回自己身上。',
  reflect: '这一身：挨的打会弹回对面。',
  burst: '这一身：挨够了自己炸一圈。',
  slowHard: '这一身：打中的会钉在原地走不动。',
  hasteAura: '这一身：旁边的人出手变快。',
};

export function folkSignName(id: string): string {
  return FOLK_SIGN[id] ?? '本职';
}

export function folkKindName(kind: EvoKind): string {
  return KIND_NAME[kind];
}

function identOf(def: VillagerDef): Stats {
  return statsOf(def, 1, 0, 1, 1);
}

function peakOf(list: readonly Stats[]): FolkPeak {
  let hit = 0;
  let hide = 0;
  let reach = 0;
  let tempo = 0;
  for (const s of list) {
    hit = Math.max(hit, s.atk);
    hide = Math.max(hide, s.hp);
    reach = Math.max(reach, s.range);
    tempo = Math.max(tempo, 1 / Math.max(1, s.interval));
  }
  return {
    hit: Math.max(1, hit),
    hide: Math.max(1, hide),
    reach: Math.max(1, reach),
    tempo: Math.max(1e-6, tempo),
  };
}

let _peak: FolkPeak | null = null;

/** 全村一阶底子的峰。没有现役名单时拿它兜底 */
export function folkIdentPeak(): FolkPeak {
  if (!_peak) _peak = peakOf(VILLAGERS.map(identOf));
  return _peak;
}

/**
 * 现役峰：按玩家手上真有的人、各自当前手艺星级算。
 *
 * 拿它当条的 1，条才会跟着养成动 —— 你把谁喂上去，谁的条就顶到头，
 * 别人的条相对就短了。名单空着就退回一阶峰，免得除零。
 */
export function folkLivePeak(
  rows: readonly { def: VillagerDef; craft: number; stars: number; villageMul?: number }[],
): FolkPeak {
  if (rows.length === 0) return folkIdentPeak();
  return peakOf(rows.map((r) => statsOf(r.def, 1, r.stars, r.villageMul ?? 1, r.craft)));
}

function clamp01(n: number): number {
  return Math.max(0.08, Math.min(1, n));
}

function growOf(craft: number, stars: number, villageMul: number): FolkGrow {
  const c = craftMul(craft);
  const s = 1 + Math.max(0, stars) * STAR_STEP;
  const v = Math.max(1, villageMul);
  return {
    craft: c,
    star: s,
    village: v,
    total: c * s * v,
    text: `下手·抗造：手艺${c.toFixed(2)} · 星${s.toFixed(2)} · 村子${v.toFixed(2)} = ×${(c * s * v).toFixed(2)}`,
  };
}

export function folkSheet(
  def: VillagerDef,
  opts: {
    craft: number;
    stars: number;
    villageMul?: number;
    stage?: number;
    /** 条拿什么当 1。不给就用全村一阶峰 */
    peak?: FolkPeak;
    /** 喂完下一档是什么样。给了才出「→」预览 */
    next?: { craft: number; stars?: number; stage?: number };
  },
): FolkSheet {
  const stage = opts.stage ?? 1;
  const villageMul = opts.villageMul ?? 1;
  const now = statsOf(def, stage, opts.stars, villageMul, opts.craft);
  const ident = identOf(def);
  const peak = opts.peak ?? folkIdentPeak();
  const heal = jobOf(def.role) === 'heal';
  const after = opts.next
    ? statsOf(
      def,
      opts.next.stage ?? stage,
      opts.next.stars ?? opts.stars,
      villageMul,
      opts.next.craft,
    )
    : undefined;
  const stats: FolkStatRow[] = [
    {
      key: 'hit',
      label: heal ? '修补' : '下手',
      text: String(now.atk),
      next: after && after.atk !== now.atk ? String(after.atk) : undefined,
      ratio: clamp01(now.atk / peak.hit),
      identRatio: clamp01(ident.atk / peak.hit),
      color: FOLK_STAT_COLOR.hit,
    },
    {
      key: 'hide',
      label: '抗造',
      text: String(now.hp),
      next: after && after.hp !== now.hp ? String(after.hp) : undefined,
      ratio: clamp01(now.hp / peak.hide),
      identRatio: clamp01(ident.hp / peak.hide),
      color: FOLK_STAT_COLOR.hide,
    },
    {
      key: 'reach',
      label: '够得着',
      text: `${now.range}格`,
      next: after && after.range !== now.range ? `${after.range}格` : undefined,
      ratio: clamp01(now.range / peak.reach),
      identRatio: clamp01(ident.range / peak.reach),
      color: FOLK_STAT_COLOR.reach,
    },
    {
      key: 'tempo',
      label: '出手',
      text: `${(now.interval / 1000).toFixed(1)}秒`,
      next: after && after.interval !== now.interval
        ? `${(after.interval / 1000).toFixed(1)}秒`
        : undefined,
      ratio: clamp01((1 / Math.max(1, now.interval)) / peak.tempo),
      identRatio: clamp01((1 / Math.max(1, ident.interval)) / peak.tempo),
      color: FOLK_STAT_COLOR.tempo,
    },
  ];
  const kind = evoKindOf(def, stage);
  return {
    stats,
    grow: growOf(opts.craft, opts.stars, villageMul),
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
