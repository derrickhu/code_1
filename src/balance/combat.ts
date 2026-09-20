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

/** 地面怪停在挡人脚前这么远。空格不挡，人在哪格就停在哪格前面 */
export const BLOCK_GAP = 0.5;

/** 前排有人时的默认挡点（cell 0 的人脚前） */
export const BLOCK_POS = cellPos(0) - BLOCK_GAP;

/**
 * 近战打到前排时停在这儿（前排 pos 2、射程 1）。
 * 屏幕映射用它当空场终点，别用 BLOCK_POS —— 否则怪停在空场三分之二处就开始砍，
 * 看上去像隔着半条路隔空打人。
 */
export const VIS_ENGAGE_POS = cellPos(0) - 1;

/**
 * 走出空场才许开火。空场是走路舞台，不是战场。
 *
 * 钉在可站区上沿（和 VIS_ENGAGE_POS 同一条线）：从这儿开始
 * posScreenY 按格匀速，出手和地上那片用同一把尺。
 * 再往门洞里开（旧的 0.28）会让轴距和屏幕距拧成两套，换格子扇形就变形。
 */
export const COMBAT_POS = VIS_ENGAGE_POS;

export function inCombatZone(pos: number): boolean {
  return pos >= COMBAT_POS;
}

/**
 * 空场要走多久。由 moveSpd 反推，别再手写一套秒数 ——
 * 上一版按秒数校入场、过线再换回表里的 spd，屏幕上就是踩一脚刹车。
 */
export function approachWalkSec(spd: number): number {
  return VIS_ENGAGE_POS / moveSpd(spd, 0);
}

/**
 * 走路速度。过了贴脸线用表里的 spd；空场按屏幕匀速反推轴速度。
 *
 * 空场 1 格轴距占了屏幕 60%，可站区 5 格只占 40%。同一套 spd 直接用，
 * 空场上会快 7.5 倍，过线再换挡 —— 看上去就是「走下来一会停顿一下」。
 *
 * 王国保卫战 / PvZ / 塔塔都是路上匀速，减速只来自冰冻这类状态，
 * 不会为了入场把整条行军切成两档。我们空场要拉长当舞台，只能在轴速度上
 * 补这个视觉比，不能在过线时换挡。
 *
 * 最慢的壳也别在空场走上 12 秒：1–2 分钟的关会把前半场堵死。
 */
export function moveSpd(spd: number, pos: number): number {
  if (pos >= VIS_ENGAGE_POS) return spd;
  const want = spd * combatVisualPerPos() / approachScreenPerPos();
  return Math.max(want, VIS_ENGAGE_POS / APPROACH_SEC_MAX);
}

const APPROACH_SEC_MAX = 11;

/** 漏几个判负。留 3 个是为了给星评腾出档位，也别让第一次漏就劝退 */
export const LEAK_ALLOW = 3;

/** 一波隔多久放下一波。12s 时波间有明显空场，压到 10s */
export const WAVE_GAP_MS = 10_000;

/** 最后一只出场后再给多久算「清得利索」。★3 的 par 时间 = 最后出场 + 这个 */
export const PAR_GRACE_MS = 17_000;

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

/**
 * 减速只给「钉死」那一阶。拦位的活是挡路，不是每锤一记 hitstun。
 * 塔塔 / 王国保卫战 / PvZ：走路是节拍器，挨打闪一下继续走，
 * 冻和慢是技能身份，不是普攻附带。
 */
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
 *
 * 12 行时空场占 2/3，真机长屏上人缩在底下像棋子。
 * 收到 10 行：空场仍够走一段，可站格更高，人和怪才能放大。
 */
export const VIS_ROWS = 10;
export const VIS_APPROACH_ROWS = VIS_ROWS - CELL_COUNT;

/** 空场每一格轴距占屏幕的比例。moveSpd 必须用同一套，否则过线会换挡 */
function approachScreenPerPos(): number {
  return VIS_APPROACH_ROWS / VIS_ROWS / VIS_ENGAGE_POS;
}

/**
 * 可站区 1 格轴距对应的视觉比例。射程只认这把尺。
 * posScreenY / visualReachGap / combatCellPx 必须同出这里，不许各写一套。
 */
export function combatVisualPerPos(): number {
  return (1 - VIS_APPROACH_ROWS / VIS_ROWS) / (GOAL_POS - VIS_ENGAGE_POS);
}

/** 轴 pos → 场上视觉比例 0..1。怪的脚底和射程轮廓都走这里。 */
export function posVisualFrac(pos: number): number {
  const approach = VIS_APPROACH_ROWS / VIS_ROWS;
  if (pos <= VIS_ENGAGE_POS) {
    return approach * (pos / VIS_ENGAGE_POS);
  }
  const t = (pos - VIS_ENGAGE_POS) / (GOAL_POS - VIS_ENGAGE_POS);
  return approach + (1 - approach) * t;
}

/** posVisualFrac 的反函数。描射程弧线时用。 */
export function posFromVisualFrac(frac: number): number {
  const approach = VIS_APPROACH_ROWS / VIS_ROWS;
  if (frac <= approach) {
    return VIS_ENGAGE_POS * (frac / approach);
  }
  const u = (frac - approach) / (1 - approach);
  return VIS_ENGAGE_POS + u * (GOAL_POS - VIS_ENGAGE_POS);
}

/**
 * 从 from 看到 to 的视觉格差（可站区格）。
 * 可站区里等于轴距；空场被拉长，同一段轴距算更多格。
 * 出手和地上那片只问这个，不另写 pos 相减。
 */
export function visualReachGap(fromPos: number, toPos: number): number {
  return (posVisualFrac(fromPos) - posVisualFrac(toPos)) / combatVisualPerPos();
}

/** 从 from 沿视觉尺往前（正）或往后（负）gap 格，落在哪个轴 pos */
export function posFromVisualGap(fromPos: number, gap: number): number {
  return posFromVisualFrac(posVisualFrac(fromPos) - gap * combatVisualPerPos());
}

/**
 * 可站区里 1 格轴距占多少像素。
 * = 场高 × combatVisualPerPos。和 visualReachGap 是同一把尺的像素写法。
 */
export function combatCellPx(topY: number, goalY: number): number {
  return Math.max(1, (goalY - topY) * combatVisualPerPos());
}

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
 * 不是匀速插值。空场（pos 0 ~ 近战停点）占视觉上半 6 行，
 * 贴到可站区上沿才开打 —— 敌人要走一段路才碰到人，人还是站在 4 格里。
 */
export function posScreenY(pos: number, topY: number, goalY: number): number {
  return topY + (goalY - topY) * posVisualFrac(pos);
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
 * 门楣下沿到出场脚底。整只怪要落在土路上，头可以略伸进门洞，
 * 身子不许还埋在匾牌里。路从锈铁板底下切开，不许再钻进顶板后面。
 */
export const GATE_GAP_MIN = 40;

/** 按这一局格高算出门洞深度，人和怪放大时出场线跟着往下推 */
export function gateThroat(chromeBottom: number, goalY: number): number {
  const cellH = Math.max(1, (goalY - chromeBottom) / VIS_ROWS);
  return Math.max(GATE_GAP_MIN, Math.round(cellH * FIELD_VILLAGER_FILL * 0.72));
}

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
  const floor = args.placing ? args.benchH : FIGHT_BAG_H;
  const goalY = args.height - args.safeBottom - floor;
  const fightGoal = args.height - args.safeBottom - FIGHT_BAG_H;
  const spawnY = args.chromeBottom + gateThroat(args.chromeBottom, fightGoal);
  return { spawnY, goalY };
}

/**
 * 立绘约占开打后一格的高度。必须跟格走：
 * 真机 logicHeight 能到 1600+，写死 36 会在变高的土路上缩成棋子。
 */
export const FIELD_VILLAGER_FILL = 0.74;

/** 给还在写死身高的旧调用一个大约数（1334 高、门楣 240 的开打格） */
export const FIELD_VILLAGER_H = 78;

/** 这一局土路实际该用的村民身高 */
export function fieldVillagerH(topY: number, goalY: number): number {
  return Math.round(cellScreenH(topY, goalY) * FIELD_VILLAGER_FILL);
}

/** 开打后的格高定身高。布阵格子更矮也用这个，人不会开打突然变大 */
export function fieldFightUnitH(args: {
  chromeBottom: number;
  height: number;
  safeBottom: number;
  benchH: number;
}): number {
  const fight = battleFieldLay({ ...args, placing: false });
  return fieldVillagerH(fight.spawnY, fight.goalY);
}

/** 相对村民。小灰最矮，装甲最高；整体跟着村民放大 */
export const FIELD_ENEMY_MUL: Readonly<Record<string, number>> = {
  grunt: 0.82,
  rusher: 0.92,
  cube: 0.94,
  saucer: 0.88,
  canister: 1,
  armor: 1.16,
  // 二期八只。剪影高矮得跟机制对得上：支援的（天线杆、高压线）要瘦高好认，
  // 冲脸的（弹簧腿、电钻）压矮一点，不然一屏怪全一样高就看不出哪一路要崩
  lamp: 0.96,
  mast: 1.08,
  pier: 1.04,
  drill: 0.86,
  wire: 1.08,
  keg: 1.02,
  spring: 0.84,
  hatch: 1.1,
};

export function fieldEnemyH(id: string, villagerH: number): number {
  return Math.round(villagerH * (FIELD_ENEMY_MUL[id] ?? 0.92));
}

/** 局内立绘身高。场上请用 fieldVillagerH；这函数留给还在按血量分档的旧调用 */
export function villagerSpriteH(hp: number): number {
  if (hp >= 3000) return 88;
  if (hp >= 1600) return 78;
  return 70;
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
