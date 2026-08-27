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

/**
 * 点人热区，相对脚底。罩住立绘身体，三块左右错开、互不重叠。
 * 左后若只罩外侧，点老烟枪身子会落空。
 */
export function slotHitBox(slot: number): { x: number; y: number; w: number; h: number } {
  if (slot === 1) return { x: -52, y: -112, w: 100, h: 128 };
  if (slot === 2) return { x: -48, y: -112, w: 100, h: 128 };
  return { x: -42, y: -108, w: 84, h: 120 };
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

/** 单局推进刻度总数。仍叫「波」，但已经不是一场场独立的小仗了，见下 */
export const TOTAL_WAVES = 15;

/**
 * 一个推进刻度多长。
 *
 * 这是连续战场的心跳：**时间到了下一批就来，不看你有没有清完场。**
 * 从前是「打光这一波 → 停 1.5 秒 → 清场并全员满血 → 下一波」，
 * 15 波等于 15 场互不相干的小仗，每一波开头都像重开一局。
 * 现在整局是一条时间轴，刻度只决定「这一批按第几波的曲线算」和进度显示。
 *
 * 30 秒是校准出来的。先按改造前的实测反推取了 25 秒（那时单局 378 秒打完
 * 15 波，平均一波正好 25 秒），但连续制下清不完的会叠到下一批，25 秒让
 * 第 9 波（16 只小灰 280ms 涌入）撞上第 8 波的残兵，到达率从 64% 断崖到 12%。
 * 多给 5 秒清场就回到了正常曲线 —— **强度曲线和波次编排因此一个数都没动**。
 */
export const STAGE_MS = 30_000;

/**
 * 场上清了之后，下一批最晚再过多久必须出现。
 *
 * 连续战场第一版只删了清场和满血，出怪表仍按 30 秒一刻度钉死。
 * 第 1 波 7 只小灰大约 4 秒出完，下一批要等到第 30 秒 —— 打得快的人
 * 会对着空场发呆，再叠上经验刚好 7 点弹牌，整段冻住，看起来像第二波卡死。
 * 时间轴还在，但空档把「一个图不断出怪」又拆回一波一波。
 *
 * 打得慢的人本来就会叠怪，这条碰不到他们；只在空场时把后面的表往前抽。
 */
export const EMPTY_PULL_MS = 500;

/**
 * 短关里下一波的第一只，跟上波最后一只出场只隔这么久。
 *
 * 僵尸来开炮那一类：波次是计数，兵是连续流，上波还在路上时下波已经出了。
 * 校准局（完整 15 段）仍按 STAGE_MS 钉时间轴，这条只作用在主线短关上。
 */
export const WAVE_HANDOFF_MS = 800;

/**
 * 倒下之后多久自己爬起来，以及爬起来带多少血。
 *
 * 不清场就意味着没有「下一波全员满血复活」那个时机了，倒下的人会永远躺着。
 * 所以必须有替代：躺一会儿自己起来。它同时是连续战场的张力来源 ——
 * 一个人倒下能等他起来，但要是接连倒到全队都躺下，那一刻就判负。
 */
export const DOWN_RECOVER_MS = 6_000;
export const DOWN_RECOVER_HP_PCT = 45;

/**
 * 撑过一个刻度回多少血。
 *
 * 刻度必须有回报，否则连续战场就是一路单向掉血、只能等死。
 * 但也**绝不能回满** —— 回满就等于把「一波一场」原样搬了回来，
 * 损耗不累积，前面打得好不好就不影响后面。
 */
export const STAGE_HEAL_PCT = 20;

/**
 * 推不动的判定：场上堆到这么多只，并且持续这么久。
 *
 * 替代原来的「单波超时」—— 连续制下已经没有「单波」了。
 * 注意这里判的是**场上堆积**，不是漏怪：外星人走到队尾就停住，
 * 既没有防线血条也没有漏怪扣血。只要写了那两样，第一眼就永远是塔防
 * （docs/00-体验目标.md §4）。
 *
 * 这两个数是**故意调宽**的，它只该当兜底。一开始按「场上 16 只、堆 9 秒」
 * 设，结果 300 局里 300 局都死于推不动、队灭一次都没出现 ——
 * 第 6 波本来就是 12 只小灰密集涌入，正常的密集波直接被判成了推不动。
 * 更要紧的是复活广告只卖队灭，死因全成 timeout 等于把那个位置废掉了。
 * 放宽到 32 只堆 28 秒之后，队灭回到六成，堆积退回它该在的位置。
 */
export const JAM_COUNT = 32;
export const JAM_MS = 28_000;

/**
 * 最后一批出完之后再撑这么久，就算守住了村口。
 *
 * 这条同时兼着收敛保护：倒地自愈让「几只清不掉的硬怪反复磨一个人」
 * 谁也赢不了 —— 场上堆不到 JAM_COUNT，全队又不会同时躺下，能耗到天亮。
 * 一开始把它写成判负，实测占了失败局的一半：15 波全过来了、人还站着，
 * 却因为场上剩三个铁罐没扫掉判输，玩家只会觉得莫名其妙。
 * 输赢看人有没有倒，不看场地扫没扫干净。
 */
export const CLEANUP_MS = 45_000;

/** 第 3–8 波加快走进来。前两波保持慢，后期堆怪已经够密不再加速。只改走路，不改漏怪。 */
export const WALK_HASTE_FROM_WAVE = 3;
export const WALK_HASTE_UNTIL_WAVE = 8;
export const WALK_HASTE = 1.2;

/**
 * 队灭复活后的堆积豁免。
 *
 * 看完广告站起来时场上那堆怪还在，不给豁免就会下一帧又判「推不动」，
 * 广告等于白看。实现上是把堆积计时器压成负数，让它得先爬回 0。
 */
export const REVIVE_GRACE_MS = 15_000;

/**
 * 第 N 个刻度从整局第几毫秒开始。出怪表和进度条共用这一个换算。
 *
 * `stageMs` 留成参数是给难度阶梯用的：第二档「不给喘气」把刻度缩短，
 * 整条时间轴跟着一起压紧，出怪表和刻度推进不会各算一套。
 */
export function stageStartMs(wave: number, stageMs: number = STAGE_MS): number {
  return Math.max(0, wave - 1) * stageMs;
}
