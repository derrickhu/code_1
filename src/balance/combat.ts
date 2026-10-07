/**
 * 战场常量与几何（纯数据，不含渲染对象）
 *
 * 战场是 **3 路 × 4 格 = 12 格**，满编 12 人。敌人从上方走进来，
 * 走过最下面那条底线就是漏怪。
 *
 * 塔塔主画面就是 3 列（前期 3×3=9，后期才加宽）。堆人靠把 12 格站满，
 * 不靠加列 —— 5 列是 Rush Royale 的棋盘，敌人绕格子走，不是分路塔防。
 *
 * 这个文件管**逻辑轴**和**屏幕坐标**。怎么走在 `@/game/march`，
 * 怎么打在 `@/game/reach`，这里只出尺子。
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
 * 出场点到第一格之间的土路。牌下面的土路才是村口，怪从那儿露头。
 * 人只站底下 4 格；空场拉开是给走路看的，立绘仍按这 4 格的高度来。
 *
 * 四格落在 pos 2/3/4/5。怪停哪只看自己的射程，见 `@/game/foeEngage`。
 * 射程按连续平面配，见 `@/game/reach` 的 coverRange。
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

/** 人脚前半格。村民测试用的「贴脸点」，不是怪的停点 */
export const BLOCK_GAP = 0.5;

/** 前排脚前（cell 0 的人面前半格） */
export const BLOCK_POS = cellPos(0) - BLOCK_GAP;

/**
 * 可站区上沿往外 1 格。只给 `coverRange` 量「从推荐格罩到门口要多远」，
 * 不是走路换挡线，也不是开火线。
 */
export const VIS_ENGAGE_POS = cellPos(0) - 1;

/** 漏几个判负。留 3 个是为了给星评腾出档位，也别让第一次漏就劝退 */
export const LEAK_ALLOW = 3;

/** 一波隔多久放下一波。12s 时波间有明显空场，压到 10s */
export const WAVE_GAP_MS = 10_000;

/**
 * 场上清空之后，下一波最多再等这么久。
 * 省下的时间记进 skippedMs，星评和超时仍按原时间轴算，清得快不白送 ★3。
 */
export const EARLY_CALL_MS = 2_500;

/**
 * 外星人走路整体提速。走得太慢，还在半路就被射程罩死，
 * 前排一刀都没挨过 —— 玩家管这个叫「送死队」。
 */
export const FOE_SPD_MUL = 2;

/**
 * 外星人出手整体加重。贴上来只挠一下的话，全队血条从头到尾不动，
 * 赢了也不知道自己差点输。
 */
export const FOE_ATK_MUL = 4;

/** 首领「大个子」：一只顶这么多只的血 */
export const BOSS_HP_MUL = 7;
export const BOSS_ATK_MUL = 1.6;
/** 首领走得慢一点，给玩家留出手的时间 */
export const BOSS_SPD_MUL = 0.8;
/** 首领漏过去算几个 */
export const BOSS_LEAK = 2;
/**
 * 首领不占杂兵名额。血量另乘 BOSS_HP_MUL。
 * 以前按 5 只从只数里扣，每章第 3 关杂兵比前两关少，再摊进多出来的那一波，路上看着空。
 */
/** 定身和击退打在首领、水泥墩身上只剩这么多 */
export const HARD_FOE_CC = 0.5;
/**
 * 「面前一圈」多大，轴格。本路从最前排那个人往外够 SKILL_NEAR（站后排也砸得到前排脚前的怪），
 * 往后只够半格多；邻路只算同一排上下 SKILL_NEAR_SIDE。
 */
export const SKILL_NEAR = 1.2;
export const SKILL_NEAR_SIDE = 1.2;

/** 最后一只出场后再给多久算「清得利索」。★3 的 par 时间 = 最后出场 + 这个 */
export const PAR_GRACE_MS = 19_000;

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
 * 视觉行数。逻辑 4 格可站，屏幕上下 4 行方能站人。
 * 立绘和格垫只认这把尺，不许跟轴 pos 一格对一格把人拉成巨人。
 */
export const VIS_ROWS = 10;
export const VIS_APPROACH_ROWS = VIS_ROWS - CELL_COUNT;

/**
 * 可站区 1 格轴距对应的视觉比例。射程和行军只认这把尺。
 * 行军按视觉比例积分，屏幕上一路匀速；格子仍占底下 4 行。
 */
export function combatVisualPerPos(): number {
  return (1 - VIS_APPROACH_ROWS / VIS_ROWS) / (GOAL_POS - VIS_ENGAGE_POS);
}

/** 轴 pos → 场上视觉比例。怪的脚底和射程轮廓都走这里。 */
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
 * 可站区里等于轴距；空场被拉开，同一段轴距算更多格。
 * 出手和地上那片只问这个，不另写 pos 相减。
 */
export function visualReachGap(fromPos: number, toPos: number): number {
  return (posVisualFrac(fromPos) - posVisualFrac(toPos)) / combatVisualPerPos();
}

/** 从 from 沿视觉尺往前（正）或往后（负）gap 格，落在哪个轴 pos */
export function posFromVisualGap(fromPos: number, gap: number): number {
  return posFromVisualFrac(posVisualFrac(fromPos) - gap * combatVisualPerPos());
}

/* ---------------- 村口 / 战场 ---------------- */

/**
 * 牌下沿以下才是战场，pos 0 落在牌下面那只怪的脚底。
 */
export const COMBAT_POS = 0;

export function inCombatZone(pos: number): boolean {
  return pos >= COMBAT_POS;
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
 * 战场纵向：轴 pos 映到屏幕 y。
 * 上 6 行是村口到可站区的土路，下 4 行站人。人仍按这 4 格的高度画。
 */
export function posScreenY(pos: number, topY: number, goalY: number): number {
  return topY + (goalY - topY) * posVisualFrac(pos);
}

/** 第 i 格（可站区）顶边。跟视觉行走，不跟轴 pos 一格对一格。 */
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

/** 一格在屏幕上多高。画格垫、热区和立绘都认视觉行，不认轴上那 6 格 */
export function cellScreenH(topY: number, goalY: number): number {
  return (goalY - topY) / VIS_ROWS;
}

/**
 * 铁皮板下沿到出场脚底。
 * 必须空出一只怪的身高：整只怪都在牌下面的土路上，
 * 不许身子钻进匾牌、人看不见却已经开打。
 */
export const GATE_LIP = 88;

/** @deprecated 村口改贴铁皮板下沿，门洞不再往下挖。留着给还没改完的调用 */
export const GATE_GAP_MIN = GATE_LIP;

export function gateThroat(_chromeBottom: number, _goalY: number): number {
  return GATE_LIP;
}

/** 开打后坞收掉，底下换成绝活栏（92）再垫一道沙袋，人跟着下去，土路变长 */
export const FIGHT_BAG_H = 100;

/** 出场线贴铁皮板下沿。布阵要给坞留位，开打后把那段空地还给路 */
export function battleFieldLay(args: {
  chromeBottom: number;
  height: number;
  placing: boolean;
  safeBottom: number;
  benchH: number;
}): { spawnY: number; goalY: number } {
  const floor = args.placing ? args.benchH : FIGHT_BAG_H;
  const goalY = args.height - args.safeBottom - floor;
  const spawnY = args.chromeBottom + GATE_LIP;
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
