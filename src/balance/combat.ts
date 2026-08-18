/**
 * 战斗常量（纯数据）
 *
 * 整屏棋盘：3 列 × 6 排。下三排我方、上三排敌阵。
 * 距离单位就是「排」：敌人从第 5 排往第 0 排走，走过 0 即漏。
 * 近战打邻排，远程跨排射。格子才是站位，不是一条跑道。
 */

/** 模拟与运行时统一步长。100ms 足够表达攻速差异，又不会让千局回归变慢 */
export const TICK_MS = 100;

/** 列数 */
export const SLOTS_PER_ROW = 3;

/** 我方可站的排：后 / 中 / 前，对应 rank 0 / 1 / 2 */
export const RANK = {
  back: 0,
  mid: 1,
  front: 2,
} as const;

export type Row = keyof typeof RANK;

export const PLAYER_ROWS: readonly Row[] = ['front', 'mid', 'back'];

/** 棋盘总排数：0–2 我方，3–5 敌阵 */
export const BOARD_RANKS = 6;

/** 敌队出现在最远那一排 */
export const SPAWN_DIST = 5;

/**
 * 兼容旧名。棋盘上站位用 RANK，不再用「离底线多少格」。
 * 测试与旧注释若还写 ROW_POS，读的是同一套排号。
 */
export const ROW_POS = RANK;

/** 上场人数上限。棋盘有 9 格，空格是站位，不是再塞 3 个人 */
export const TOTAL_SLOTS = 6;

/** 我方格子数（3 列 × 3 排） */
export const PLAYER_CELLS = SLOTS_PER_ROW * 3;

/**
 * 底线血量：每漏一个敌人扣 1。
 * 给 10 点而不是 1 点，是为了让「快要守不住」有一段可感的过程。
 */
export const BASE_HP = 10;

/** 护甲减伤：reduction = def / (def + K) */
export const ARMOR_K = 100;

/** 近战（敌人砍人、英雄贴脸）能打几排 */
export const MELEE_REACH = 1;

/** 单局波次总数 */
export const TOTAL_WAVES = 15;

/** 一波清空后到下一波出怪的间隔 */
export const WAVE_GAP_MS = 1500;

/**
 * 单波超时保护。若一波在此时间内没打完，视为推不动（DPS 不足），
 * 直接判本波失败，避免模拟陷入「双方都杀不死对方」的死循环。
 */
export const WAVE_TIMEOUT_MS = 120_000;
