/**
 * 战斗常量（纯数据）
 *
 * 战场是一条推进轴：敌人从 SPAWN_DIST 走向 0，走到 0 即突破底线。
 * 英雄不移动，只有前后两排的固定站位。之所以用一维模型，是因为
 * 「前排承伤 / 后排输出」这条策略表达不需要二维寻路，而一维能让
 * tools/sim.ts 用极低成本跑上千局回归。
 */

/** 模拟与运行时统一步长。100ms 足够表达攻速差异，又不会让千局回归变慢 */
export const TICK_MS = 100;

/**
 * 敌人出生点到底线的距离（格）。
 *
 * 取 70 而不是 100：后排射程最远 56，出生点再远的部分是敌人在射程外纯行走的
 * 无效时间，观战会闷。70 让最远射程覆盖战场八成，敌人一出现就基本在交火中。
 */
export const SPAWN_DIST = 70;

/**
 * 站位：距底线的格数。
 *
 * 数值越大越靠敌人出生点，因此 front 必须大于 back —— 敌人 dist 递减，
 * 先撞上的才是前排。坦克在 front 承伤、输出在 back 被挡住，是这套站位的全部意义。
 */
export const ROW_POS = {
  front: 26,
  back: 14,
} as const;

/** 每排 3 列，共 6 格 */
export const SLOTS_PER_ROW = 3;
export const TOTAL_SLOTS = SLOTS_PER_ROW * 2;

/**
 * 底线血量：每漏一个敌人扣 1。
 * 给 10 点而不是 1 点，是为了让「快要守不住」有一段可感的过程 ——
 * 复活广告要卖在玩家自己意识到危险之后，而不是猝死的瞬间。
 */
export const BASE_HP = 10;

/** 护甲减伤：reduction = def / (def + K) */
export const ARMOR_K = 100;

/** 近战敌人停下攻击前排的距离容差（格） */
export const MELEE_REACH = 2;

/** 单局波次总数。15 波 × 约 32 秒 ≈ 8 分钟，落在碎片时间可打完的区间 */
export const TOTAL_WAVES = 15;

/** 一波清空后到下一波出怪的间隔 */
export const WAVE_GAP_MS = 1500;

/**
 * 单波超时保护。若一波在此时间内没打完，视为推不动（DPS 不足），
 * 直接判本波失败，避免模拟陷入「双方都杀不死对方」的死循环。
 */
export const WAVE_TIMEOUT_MS = 120_000;
