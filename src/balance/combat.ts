/**
 * 战场常量与几何（纯数据，不含渲染对象）
 *
 * 战场是 **3 路 × 4 格 = 12 格**，满编 12 人。敌人从上方走进来，
 * 走过最下面那条底线就是漏怪。
 *
 * 塔塔主画面就是 3 列（前期 3×3=9，后期才加宽）。堆人靠把 12 格站满，
 * 不靠加列 —— 5 列是 Rush Royale 的棋盘，敌人绕格子走，不是分路塔防。
 *
 * 这个文件同时管**逻辑轴**和**屏幕坐标**，因为两者必须同时改：
 * 射程是按格距定的，格距一动、射程不跟着动，后排就会变成哑火。
 * §8.1 记着那个 bug —— 上一版战场 12 格长而射程只有 1~5，
 * cell 2 / cell 3 打不到任何目标，上场人数从 3 涨到 8 几乎没换来输出。
 */

/** 模拟与运行时统一步长。100ms 足够表达攻速差异，又不会让千局回归变慢 */
export const TICK_MS = 100;

/* ---------------- 逻辑轴 ---------------- */

/** 3 路 × 4 格。列数跟塔塔主画面对齐，人靠填满 12 格堆起来 */
export const LANE_COUNT = 3;
export const CELL_COUNT = 4;

/**
 * 出场点到第一格之间留的空场。§4.4：空场是舞台，敌人走进来才开打。
 *
 * 和 CELL_SPAN 一起决定「后排能不能帮上忙」，别单独改其中一个。
 * 四格落在 pos 2/3/4/5，敌人挡点在 pos 1.5。挨 / 拦 / 打 的射程
 * 恰好够各自那一格打到挡点（见 villagers.ROLE_BASE 的 range 注释）。
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

/**
 * 近战打到前排时停在这儿（前排 pos 2、射程 1）。
 * 屏幕映射用它当空场终点，别用 BLOCK_POS —— 否则怪停在空场三分之二处就开始砍，
 * 看上去像隔着半条路隔空打人。
 */
export const VIS_ENGAGE_POS = cellPos(0) - 1;

/**
 * 空场要走多久才贴脸。
 *
 * 对标皇室：骑士 1 格/秒，过桥到塔大约 6–8 秒；野猪大约 3 秒。
 * 植物大战僵尸过整片草坪要 30 秒，对我们 1–2 分钟的关太慢。
 * 本项目自己写过「小灰 5 秒走进来」（docs/01），表里的 spd 却让它 1.4 秒就到。
 * 突破之后仍用表里的 spd，漏怪那段不能一起放慢。
 */
export function approachWalkSec(spd: number): number {
  return Math.max(3, Math.min(9, 2 / spd + 1.5));
}

/** 还在空场用入场步频，过了贴脸线就恢复表里的走速 */
export function moveSpd(spd: number, pos: number): number {
  if (pos >= VIS_ENGAGE_POS) return spd;
  return VIS_ENGAGE_POS / approachWalkSec(spd);
}

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
 * 战场横向：土路当主体，约占 750 设计宽的 72%。
 *
 * 土路约占七成宽。3 列时单路 180，人能认出是铁柱不是棋子。
 */
export const FIELD_W = 540;
export const FIELD_X = (750 - FIELD_W) / 2;
export const LANE_W = FIELD_W / LANE_COUNT;

/**
 * 视觉行数。逻辑 4 格可站，屏幕上把空场拉成走路的格子，下 4 行方能站人。
 */
export const VIS_ROWS = 12;
export const VIS_APPROACH_ROWS = VIS_ROWS - CELL_COUNT;

export function laneScreenX(lane: number): number {
  return FIELD_X + LANE_W * (lane + 0.5);
}

/** 视觉第 row 条线的屏幕 y（0 在出场，VIS_ROWS 在底线） */
export function visualRowY(row: number, topY: number, goalY: number): number {
  return topY + ((goalY - topY) * row) / VIS_ROWS;
}

/**
 * 战场纵向：轴上的 pos 映射到屏幕 y。
 *
 * 不是匀速插值。空场（pos 0 ~ 近战停点）占视觉上半 8 行，
 * 贴到可站区上沿才开打 —— 敌人要走一段路才碰到人，人还是站在 4 格里。
 */
export function posScreenY(pos: number, topY: number, goalY: number): number {
  const span = goalY - topY;
  const approach = (VIS_APPROACH_ROWS / VIS_ROWS) * span;
  if (pos <= VIS_ENGAGE_POS) {
    return topY + approach * (pos / VIS_ENGAGE_POS);
  }
  const t = (pos - VIS_ENGAGE_POS) / (GOAL_POS - VIS_ENGAGE_POS);
  return topY + approach + (span - approach) * t;
}

/** 第 i 格（可站区）顶边 */
export function cellRectTop(cell: number, topY: number, goalY: number): number {
  return visualRowY(VIS_APPROACH_ROWS + cell, topY, goalY);
}

/**
 * 第 i 格的屏幕 y（脚底）。
 *
 * 立绘从脚底往上长。脚底落在格心再往下半个身高，人的视觉中心才在格正中。
 * 以前钉在格下沿，人会坐在格子底边上，再加左右错位就更歪。
 */
export function cellScreenY(
  cell: number,
  topY: number,
  goalY: number,
  spriteH = 40,
): number {
  const top = cellRectTop(cell, topY, goalY);
  const h = cellScreenH(topY, goalY);
  return top + h / 2 + spriteH / 2;
}

/** 一格在屏幕上多高。画格垫和热区用 */
export function cellScreenH(topY: number, goalY: number): number {
  return (goalY - topY) / VIS_ROWS;
}

/**
 * 门楣下沿到出场线。人从锈铁板底下走出来，头可以先被挡住一截。
 * 路不许再钻进顶板后面 —— 顶板就是村口门楣，和土路要切开。
 */
export const GATE_GAP = 4;
/** 开打后坞收掉，底线落到沙袋那么高，人跟着下去，空场变长 */
export const FIGHT_BAG_H = 48;

/** 出场线 / 底线。布阵要给坞留位，开打后把那段空地还给路 */
export function battleFieldLay(args: {
  chromeBottom: number;
  height: number;
  placing: boolean;
  safeBottom: number;
  benchH: number;
}): { spawnY: number; goalY: number } {
  const spawnY = args.chromeBottom + GATE_GAP;
  const floor = args.placing ? args.benchH : FIGHT_BAG_H;
  const goalY = args.height - args.safeBottom - floor;
  return { spawnY, goalY };
}

/** 场上棋子身高。3 列下用 36，认得出脸，又不顶格 */
export const FIELD_VILLAGER_H = 36;

/** 局内立绘身高。场上请用 FIELD_VILLAGER_H；这函数留给还在按血量分档的旧调用 */
export function villagerSpriteH(hp: number): number {
  if (hp >= 3000) return 40;
  if (hp >= 1600) return 36;
  return 32;
}

/** 点人 / 点空格的热区，相对脚底。格小了也要把整格点满，别逼人钉在立绘上 */
export function cellHitBox(cw: number, ch: number): { x: number; y: number; w: number; h: number } {
  const w = Math.max(56, cw - 4);
  const h = Math.max(56, ch - 4);
  return { x: -w / 2, y: -h, w, h };
}

/** 设计坐标落到哪一格。空场和路外是 null，别靠 Pixi hitTest */
export function hitDeployCell(
  x: number,
  y: number,
  topY: number,
  goalY: number,
): { lane: number; cell: number } | null {
  if (x < FIELD_X || x >= FIELD_X + FIELD_W) return null;
  const top = cellRectTop(0, topY, goalY);
  if (y < top || y > goalY) return null;
  const lane = Math.min(LANE_COUNT - 1, Math.max(0, Math.floor((x - FIELD_X) / LANE_W)));
  const cell = Math.min(
    CELL_COUNT - 1,
    Math.max(0, Math.floor((y - top) / cellScreenH(topY, goalY))),
  );
  return { lane, cell };
}
