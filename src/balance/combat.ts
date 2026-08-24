/**
 * 战斗常量（纯数据）
 *
 * 逻辑仍是有序队列：队首 slot 0 站 0，后面依次 -1、-2，谁更靠前谁先挨刀。
 * 画面上画成前 1 后 2 的小三角，避免竖排拉开显得空。见 BattleScene 站位。
 *
 * 为什么不要棋盘：站位要有表达空间，但不需要二维。见 docs/00-体验目标.md §4。
 *
 * 为什么没有底线血量：失败条件是全队倒下或推不动。只要还写「漏怪扣血」，
 * 玩家第一眼就会认成塔防——这一点已经用三版战场验证过了。
 */

/** 模拟与运行时统一步长。100ms 足够表达攻速差异，又不会让千局回归变慢 */
export const TICK_MS = 100;

/** 上场人数 = 队列长度。3 人是为了看得清谁是谁，见反目标第二条 */
export const TEAM_SIZE = 3;

/** 画面名。和局里三角、底栏同一套：前排居中靠前，两人分列左后右后 */
export const SLOT_NAME = ['前排', '左后', '右后'] as const;
/** 从左到右看过去：左后、前排、右后 */
export const SLOT_VIEW_ORDER = [1, 0, 2] as const;

/**
 * 画面三角。逻辑队列仍是 0 / -1 / -2，只有渲染用这套。
 * 村子主页必须走同一公式、同一身高，否则大立绘会把三角压成横排。
 */
export const SQUAD_X = 375;
export const BACK_DX = 96;
export const BACK_DY = 62;

export function slotScreenX(slot: number, cx = SQUAD_X): number {
  if (slot === 1) return cx - BACK_DX;
  if (slot === 2) return cx + BACK_DX;
  return cx;
}

export function slotScreenY(slot: number, frontY: number): number {
  return slot <= 0 ? frontY : frontY + BACK_DY;
}

/** 局内立绘身高。村子预览跟局里用同一套，三角比例才对得上 */
export function heroSpriteH(hp: number): number {
  if (hp >= 1000) return 102;
  if (hp >= 700) return 94;
  return 88;
}

/** 槽位名相对脚底的偏移。左后写左边，右后写右边，前排写脚下 */
export function slotTagPos(slot: number, x: number, feetY: number): { x: number; y: number } {
  if (slot === 1) return { x: x - 54, y: feetY - 6 };
  if (slot === 2) return { x: x + 54, y: feetY - 6 };
  return { x, y: feetY + 20 };
}

/** 每人最多装几件改装件。有上限才有取舍，否则无脑堆一个人 */
export const MOD_SLOTS_PER_HERO = 3;

/**
 * 队列序号转战场深度。队首 slot 0 站 0，后面的人依次往后退一格。
 * 坐标越大越靠敌方来向，外星人的 dist 用的是同一根轴。
 */
export function slotPos(slot: number): number {
  return slot === 0 ? 0 : -slot;
}

/** 队尾坐标。外星人推到这后面就说明全队已经被打穿了 */
export const REAR_POS = slotPos(TEAM_SIZE - 1);

/**
 * 外星人出场坐标。
 *
 * 6 是这样定的：最远支援位在 -2，射程 5 时够到 3，敌人落地后还要走几格
 * 才挨打。那一段是敌我之间的对打区，不是己方身后的荒地。
 */
export const SPAWN_DIST = 6;

/** 护甲减伤：reduction = def / (def + K) */
export const ARMOR_K = 100;

/** 近战能打几格（外星人砍人、村民贴脸都用它） */
export const MELEE_REACH = 1;

/** 单局波次总数 */
export const TOTAL_WAVES = 15;

/** 一波清空后到下一波出怪的间隔 */
export const WAVE_GAP_MS = 1500;

/**
 * 单波超时保护。若一波在此时间内没打完，视为推不动（DPS 不足），
 * 直接判负。这同时是失败条件的一半：不是漏怪，是这套配崩了。
 */
export const WAVE_TIMEOUT_MS = 120_000;

/** 第 3–8 波加快走进来。前两波保持慢，后期堆怪已经够密不再加速。只改走路，不改漏怪。 */
export const WALK_HASTE_FROM_WAVE = 3;
export const WALK_HASTE_UNTIL_WAVE = 8;
export const WALK_HASTE = 1.2;

/** 队灭复活后至少再给这么久，避免看完广告下一帧「推不动」 */
export const REVIVE_GRACE_MS = 15_000;
