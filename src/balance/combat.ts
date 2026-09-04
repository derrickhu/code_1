/**
 * 战场常量与几何（纯数据，不含渲染对象）
 *
 * 战场是 **3 路 × 4 格**。敌人从上方走进来，走过最下面那条底线就是漏怪；
 * 漏够 LEAK_ALLOW 只判负。见 docs/00-体验目标.md §4.4。
 *
 * 这个文件同时管**逻辑轴**和**屏幕坐标**，因为两者必须同时改：
 * 射程是按格距定的，格距一动、射程不跟着动，后排就会变成哑火。
 * §8.1 记着那个 bug —— 上一版战场 12 格长而射程只有 1~5，
 * cell 2 / cell 3 打不到任何目标，上场人数从 3 涨到 8 几乎没换来输出。
 */

/** 模拟与运行时统一步长。100ms 足够表达攻速差异，又不会让千局回归变慢 */
export const TICK_MS = 100;

/* ---------------- 逻辑轴 ---------------- */

/** 3 路 × 4 格 = 12 格，满级只给 8 个人上，空着的 4 格就是取舍 */
export const LANE_COUNT = 3;
export const CELL_COUNT = 4;

/**
 * 出场点到第一格之间留的空场。§4.4：空场是舞台，敌人走进来才开打。
 *
 * 和 CELL_SPAN 一起决定「后排能不能帮上忙」，别单独改其中一个。
 * 四格落在 pos 2/3/4/5，敌人挡点在 pos 1.5，四个定位的射程
 * 恰好够到挡点（见 villagers.ROLE_BASE 的 range 注释）。
 */
export const SPAWN_GAP = 2;
/** 相邻格子的间距 */
export const CELL_SPAN = 1;

/** 第 i 格（0 最靠敌方）在轴上的坐标 */
export function cellPos(i: number): number {
  return SPAWN_GAP + i * CELL_SPAN;
}

/** 底线坐标。敌人走过这里就是漏怪 */
export const GOAL_POS = cellPos(CELL_COUNT - 1) + CELL_SPAN;

/** 地面怪被最前面的人挡住的位置 */
export const BLOCK_POS = cellPos(0) - 0.5;

/** 漏几个判负。留 3 个是为了给星评腾出档位，也别让第一次漏就劝退 */
export const LEAK_ALLOW = 3;

/** 一波隔多久放下一波。12s 时波间有明显空场，压到 10s */
export const WAVE_GAP_MS = 10_000;

/** 最后一只出场后再给多久算「清得利索」。★3 的 par 时间 = 最后出场 + 这个 */
export const PAR_GRACE_MS = 14_000;

/**
 * 护甲的软化常数。减伤 = def / (def + ARMOR_K)。
 *
 * **必须是百分比，不能改回扁平减法。** 扁平那版铁柱 def 60，
 * 第 1~4 章每次只吃 1 点伤害（字面意义上无敌），第 8 章突然一下 214，
 * 「免疫」和「秒删」之间没有过渡，曲线根本没法校。
 * 更要紧的是它把判负也带歪了：前排打不死，敌人就永远堆在他面前过不去，
 * 于是没有漏怪、只有干等到超时 —— 而超时是玩家读不懂的失败。
 * 改成百分比之后超时率从 30% 掉到 5%（见 §8.1）。
 *
 * K=200 时：def 60 → 减 23%，def 13 → 减 6%，装甲的 def 34 → 减 15%。
 */
export const ARMOR_K = 200;

/** 「拦」位打中之后的减速 */
export const SLOW_MUL = 0.65;
export const SLOW_MS = 1600;
/** 「修」位每次回多少（按 atk 的倍数），以及它出手打人的折扣 */
export const HEAL_MUL = 1.4;
export const HEAL_ATK_CUT = 0.5;
/** 「越挨越猛」：血越少攻击越高，最多加这么多 */
export const RAGE_BONUS = 0.5;

/* ---------------- 屏幕坐标 ---------------- */

/**
 * 战场横向：三条路等分 750 设计宽，两侧留边。
 *
 * 路要够宽，一格里站一个人 + 名牌不能挤到隔壁路去 ——
 * 「看得出哪一路要崩」是硬约束（反目标第二条）。
 */
export const FIELD_X = 40;
export const FIELD_W = 670;
export const LANE_W = FIELD_W / LANE_COUNT;

export function laneScreenX(lane: number): number {
  return FIELD_X + LANE_W * (lane + 0.5);
}

/**
 * 战场纵向：轴上的 pos 映射到屏幕 y。
 *
 * pos 0（出场点）在 topY，GOAL_POS（底线）在 goalY，中间线性插值。
 * 空场（pos 0 ~ BLOCK_POS）占的那一段刻意留出来当舞台，上面不画格子。
 */
export function posScreenY(pos: number, topY: number, goalY: number): number {
  return topY + ((goalY - topY) * pos) / GOAL_POS;
}

/** 第 i 格的屏幕 y（脚底） */
export function cellScreenY(cell: number, topY: number, goalY: number): number {
  return posScreenY(cellPos(cell), topY, goalY);
}

/** 一格在屏幕上多高。画格垫和热区用 */
export function cellScreenH(topY: number, goalY: number): number {
  return ((goalY - topY) * CELL_SPAN) / GOAL_POS;
}

/** 局内立绘身高。村子预览跟局里用同一套，比例才对得上 */
export function villagerSpriteH(hp: number): number {
  if (hp >= 3000) return 104;
  if (hp >= 1600) return 96;
  return 88;
}

/** 点人 / 点空格的热区，相对格心 */
export function cellHitBox(cw: number, ch: number): { x: number; y: number; w: number; h: number } {
  const w = Math.min(cw - 8, 132);
  const h = Math.min(ch - 4, 116);
  return { x: -w / 2, y: -h, w, h };
}
