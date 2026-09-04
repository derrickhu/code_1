/**
 * 门路：本局能抽到的破烂按「这么打」分成 5 条路。
 *
 * 它解决的是局外养成一直没解决的那件事 —— 单件升星只碰 1/27 的池子，
 * 买完下一局大概率抽不到，钱花了看不见。门路把 5~6 件绑成一条，
 * 研发一路等于同时改这一局的**牌面构成**和**这几件的数值**：
 * 出得更勤 + 更猛。玩家能说出「我这号是走打得开的」，这才叫养成。
 *
 * 划分按玩家能说出口的打法，不按 effect.kind：
 * 「站远点打」「下手重」「挨得住」「越挨越猛」「带一帮人」。
 *
 * 门路和合体表是**故意不对齐**的。9 组合体里只有 4 组落在同一条路
 * （厚被头盔 / 厚血被在「挨得住」，越挨越炸在「越挨越猛」，一溜割完在「站远点打」），
 * 「下手重」和「带一帮人」内部一组都没有。所以专精一路**不会**让合体更容易撞上 ——
 * 实测研发满「站远点打」之后合体率反而从 43.7% 掉到 36.7%，因为跨路那 5 组被挤掉了，
 * 而这条路内部只有一组。
 *
 * 这是有意的，别为了拉合体率去重排门路：门路按「玩家能说出口的打法」分，
 * 合体则是撞出来的惊喜。两者一对齐，合体就变成研发线的附属进度条了。
 */
import { RUN_MODS, MOD_STAR_MAX } from './mods';

export type LaneId = 'reach' | 'heavy' | 'stand' | 'rage' | 'band';

export interface LaneDef {
  id: LaneId;
  /** 门路名。玩家用这个词说自己这号怎么打 */
  name: string;
  /** 这条路打出来是什么样。卡面第一行 */
  pitch: string;
  /** 研发满级时那句吹的。给个奔头 */
  dream: string;
  /**
   * 打通第几关才开这条路。
   *
   * 五条一次全开，第一天就是五张卡摊在脸上、每张都买不起 ——
   * 那是选择过载，不是选择。头两条先立起「门路」这个概念，
   * 后面几条留着当往前走的理由。
   */
  openAt: number;
  mods: readonly string[];
}

export const LANES: readonly LaneDef[] = [
  {
    id: 'reach',
    name: '站远点打',
    pitch: '射程、穿透、一刀带一串',
    dream: '三个人全站后排，前面没人也照样清',
    openAt: 2,
    mods: ['pipe', 'wire', 'sickle', 'blower'],
  },
  {
    id: 'stand',
    name: '挨得住',
    pitch: '掉血慢、倒了还能起',
    dream: '外星人打半天，人还在那儿站着',
    openAt: 2,
    mods: ['helmet', 'quilt', 'sack', 'battery', 'foam'],
  },
  {
    id: 'heavy',
    name: '下手重',
    pitch: '出手慢，一下顶三下',
    dream: '一棍子下去，一整排一起躺',
    openAt: 5,
    mods: ['weight', 'chainsaw', 'firecracker'],
  },
  {
    id: 'rage',
    name: '越挨越猛',
    pitch: '挨打换输出，扎手',
    dream: '谁上来打他，谁自己先炸',
    openAt: 5,
    mods: ['pressurecooker', 'pot', 'steelplate'],
  },
  {
    id: 'band',
    name: '带一帮人',
    pitch: '狗、鸡、乡亲，全队跟着快',
    dream: '三个人拉出一支队伍',
    openAt: 9,
    mods: ['dogleash', 'chickenfeed', 'holler', 'speaker', 'thermos'],
  },
];

/** 打通到第 stageTop-1 关为止的进度下，这条路开了没 */
export function laneOpen(id: LaneId, stageTop: number): boolean {
  return stageTop >= LANE_BY_ID[id].openAt;
}

/** 这个进度下开了几条路。全没开时研发入口整个不出现 */
export function openLanes(stageTop: number): readonly LaneDef[] {
  return LANES.filter((l) => stageTop >= l.openAt);
}

export const LANE_BY_ID: Readonly<Record<LaneId, LaneDef>> = Object.fromEntries(
  LANES.map((l) => [l.id, l]),
) as Readonly<Record<LaneId, LaneDef>>;

const LANE_OF_MOD: Readonly<Record<string, LaneId>> = Object.fromEntries(
  LANES.flatMap((l) => l.mods.map((id) => [id, l.id])),
);

export function laneOf(modId: string): LaneId | undefined {
  return LANE_OF_MOD[modId];
}

export type LaneLevels = Record<LaneId, number>;

/** 一条路研发到几级。5 级是一条路的头 */
export const LANE_LV_MAX = 5;

/**
 * 研发一级的价钱。一条路满级 595，五条全满 2975。
 *
 * 刻意做成前两级便宜、后两级贵：头两级是「让玩家看见门路这回事」，
 * 三级往后是长线。别把首级抬上去，第一笔必须当天就能买到。
 */
export const LANE_LV_COSTS = [35, 60, 100, 160, 240] as const;

/**
 * 研发等级 → 这条路的件在三选一里的份量倍数。
 *
 * 满级 2.75 倍：够让一局的牌明显偏向这条路，但不会把别的路挤干 ——
 * 别调到 4 以上，三选一会变成同一条路刷屏，局里的选择就没了。
 */
export function laneDrawMul(lv: number): number {
  const v = Math.max(0, Math.min(LANE_LV_MAX, Math.floor(lv)));
  return 1 + v * 0.15;
}

/**
 * 研发等级 → 这条路每件白给几星。
 *
 * 2 级第一次变猛，5 级跳 3 星是这条路的爽点。
 * 星的放大逻辑还是 mods.ts 的 scaleAbility，一处口径。
 */
const LANE_STAR_AT = [0, 0, 1, 1, 2, 3] as const;

export function laneStars(lv: number): number {
  const v = Math.max(0, Math.min(LANE_LV_MAX, Math.floor(lv)));
  return Math.min(MOD_STAR_MAX, LANE_STAR_AT[v] ?? 0);
}

export function emptyLanes(): LaneLevels {
  return { reach: 0, heavy: 0, stand: 0, rage: 0, band: 0 };
}

export function clampLaneLv(raw: unknown): number {
  return Math.max(0, Math.min(LANE_LV_MAX, Math.floor(Number(raw) || 0)));
}

export function clampLanes(raw: Partial<LaneLevels> | undefined): LaneLevels {
  const out = emptyLanes();
  if (!raw) return out;
  for (const l of LANES) out[l.id] = clampLaneLv(raw[l.id]);
  return out;
}

export function nextLaneCost(lv: number): number | undefined {
  if (lv < 0 || lv >= LANE_LV_MAX) return undefined;
  return LANE_LV_COSTS[lv];
}

export function laneTotalCost(): number {
  return LANES.length * LANE_LV_COSTS.reduce((a, c) => a + c, 0);
}

/**
 * 门路等级摊成每件的星级。
 *
 * 摊完之后局里那套 masteredMod / modStars 一个字都不用改：
 * 战斗只认「这件几星」，不关心星是买单件还是买门路来的。
 */
export function starsFromLanes(lv: LaneLevels): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of LANES) {
    const s = laneStars(lv[l.id]);
    if (s <= 0) continue;
    for (const id of l.mods) out[id] = s;
  }
  return out;
}

/** 门路等级摊成每件的抽取份量倍数。发牌那一步直接查表 */
export function drawMulFromLanes(lv: LaneLevels): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of LANES) {
    const mul = laneDrawMul(lv[l.id]);
    if (mul === 1) continue;
    for (const id of l.mods) out[id] = mul;
  }
  return out;
}

/** 卡面那一行：点下去这条路变成什么 */
export function laneTag(lv: number, maxed: boolean): string {
  const at = maxed ? lv : lv + 1;
  const mul = laneDrawMul(at);
  const st = laneStars(at);
  const draw = `出得勤 ×${mul.toFixed(2).replace(/0$/, '')}`;
  return st > 0 ? `${draw} · 全路 ★${st}` : draw;
}

/** 启动时校验：别让加件的人漏打门路标签 */
export function assertLanesCoverMods(): void {
  const missing = RUN_MODS.filter((m) => !LANE_OF_MOD[m.id]).map((m) => m.id);
  if (missing.length > 0) throw new Error(`这些破烂没打门路标签: ${missing.join(', ')}`);
}
