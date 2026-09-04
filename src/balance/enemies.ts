/**
 * 外星人原型与 15 波编排（纯数据）
 *
 * 波次结构与数值曲线分开：结构（出什么、几只、什么时候出）写死在 WAVES 里，
 * 强度只由 waveHpMult / waveAtkMult 两条曲线控制。调难度时只动曲线参数，
 * 不动编排 —— 否则每次调参都会顺手改掉「第几波第一次出铁罐」这类体验节奏。
 *
 * 没有系别。三系克制已在 2026-08-18 裁掉：3 人固定队没有换人对位的空间，
 * 克制只会退化成无法应对的运气惩罚（docs/00-体验目标.md §4）。
 * 波次的压力靠**数量、护甲、速度**三样区分，玩家的应对手段是改装件。
 *
 * 编排目标（§8）：卡关点稳定落在第 9 到 12 波。
 * 太早挫败，太晚则复活广告没有需求。
 */

export interface EnemyProto {
  id: string;
  /** 外星人名。画得高级又呆，名字也别太正经 */
  name: string;
  /** 第 1 波的基础值 */
  hp: number;
  atk: number;
  def: number;
  /**
   * 推进速度（格/秒）。对标植物大战僵尸 / Kingdom Rush 首波列队，
   * 不是 Brotato 围攻冲刺。空场现在是大半个屏幕，走路按秒算。
   * 出场 6 格：小灰约 12 秒贴脸，方块兵约 20 秒，铁罐／飞碟约 25 秒。
   */
  speed: number;
  attackIntervalMs: number;
  isBoss: boolean;
  /**
   * 进村口后打谁。默认打队首。
   * `back`：飞过队首打还活着的最后排，逼玩家把脆皮换下来。
   */
  aim?: 'front' | 'back';
  /**
   * 打死他给多少经验。经验满一档就发一次三选一，
   * 所以这个数直接决定「什么时候能捡下一件破烂」。见 picker.LEVEL_EXP。
   */
  exp: number;
  /**
   * 打死他掉多少废品。可以是小数，引擎用累加器攒够 1 才发，
   * 不走概率——同一 seed 必得同一局这条不能破。
   */
  scrap: number;

  // ── 行为。这三样兑现 WaveDef.pressure 的「硬 / 多 / 快」三档 ──
  //
  // 在这之前三档只靠 waveHpMult 放大数值，行为上从未兑现，结果是
  // 逐波到达率里第 6、9、11 波（都是「多」型）和前一波完全相同 ——
  // 玩家从不死在那儿，压力实际只有护甲一个维度。
  //
  // 这不是克制系。§4 裁掉的是「火克木」式属性对位，理由是 3 人固定队
  // 没有换人空间；这里加的是敌人行为，应对手段仍然是改装件。

  /**
   * 打死会裂成几个小的（「多」）。小块不再分裂，也不给经验不掉废品 ——
   * 它是同一只怪的残骸，重复结算会让阶段一校准好的经验曲线通胀。
   *
   * 母体的基础血量已经下调过，母体加上按 hpPct 算出的小块，总血量与拆分前相等：
   * 变的是要打几次，不是要打多少血。溅射和穿透因此才有了确定的用武之地。
   *
   * **atkPct 刻意不跟着 hpPct 砍**。拆分本身就让这只怪的威胁时间变短了：
   * 母体血少会提前倒下，脆碎块也活不久，一只怪能持续输出的总时长比不分裂时更短。
   * 再把碎块的攻击按血量同比例砍，前四波会直接白送（实测到达第 5 波从 88%
   * 涨到 99.6%）。
   *
   * 补偿加在攻击上，不加在血量或速度上 —— 后两者都会被「一波里怪很多」
   * 二次放大：加血把第 8 波（10 只方块兵）变成硬墙，加速度把第 15 波变成围攻，
   * 两次都把通关率打到 5% 以下。
   *
   * 但攻击也不能补满。碎块是**并行**输出的，atkPct 给到 100 时一波的总 dps
   * 直接翻三倍，终局同样崩。70 是这两头之间实测出来的值。
   */
  split?: { count: number; hpPct: number; atkPct: number };
  /**
   * 外壳（「硬」）。壳没破之前每次受击先削掉 flat 点，再拿剩下的去啃壳。
   *
   * flat 是**固定值**减免，和 def 的百分比减伤是两种机制，这才产生新决策：
   * 一次一大下的（秤砣、暴击、老烟枪）几乎不受影响，一次一小下的
   * （溅射分摊、穿透的尾段）会被削到只剩零头。
   * 但永远保底 1 点，不做成完全免疫 —— 那就成了没手段就锁死的运气惩罚。
   */
  shell?: { hp: number; flat: number };
  /** 走到这么近就加速扑上来（「快」）。减速由此才真正有价值 */
  rush?: { withinDist: number; mult: number };
}

/** 飞碟飞进这个距离才打后排，路上不出手 */
export const BACK_AIM_DIST = 1.6;
/** 打后排是点名，不是秒脆皮。站位题要成立，第 7 波不能变成墙 */
export const BACK_AIM_DAMAGE = 0.5;

// exp / scrap 按血量档位递增，飞碟另给一笔「打赢了值得庆祝」的量。
// 打满 15 波约 346 经验、153 废品，与旧的按波发放（15×8）同量级。
//
// 掉落的形状和按波发放不同：按波是匀的，掉落是前少后多，
// 所以前期废品比旧版少一些。这不影响第一次重抽的时机 ——
// 装上一件给的 4 块才是前期的大头，打完第 2 波仍然攒得出重抽钱。
//
// 每种外星人一个鲜明行为，且都跟它的名字与长相对得上 ——
// 铁罐有壳、方块兵砸碎成小方块、小灰又小又快会扑上来。
// 飞碟保持原样：它已经有「飞过队首打后排」这一条了。
//
// 方块兵和铁罐的基础血量都下调过，把降下来的量放进了小块和壳里：
// 目标是只改压力的形状，不改难度。实测中位卡关、单局时长、smart−random
// 差值都守在原位，通关率 14.8%（原 18.6%）—— 略紧但仍在 8%–50% 的目标区内。
export const ENEMY_PROTOS: readonly EnemyProto[] = [
  {
    id: 'grey', name: '小灰', hp: 360, atk: 13, def: 0, speed: 0.48,
    attackIntervalMs: 900, isBoss: false, exp: 1, scrap: 0.5,
    rush: { withinDist: 2.4, mult: 2.1 },
  },
  {
    // 720 拆成 400 的母体加两个 160 的小块，总血量守恒
    id: 'cube', name: '方块兵', hp: 400, atk: 22, def: 8, speed: 0.30,
    attackIntervalMs: 1100, isBoss: false, exp: 2, scrap: 0.85,
    split: { count: 2, hpPct: 40, atkPct: 70 },
  },
  {
    // 1500 拆成 1120 的身子加 320 的壳，差额由 flat 减免补回来
    id: 'canister', name: '铁罐', hp: 1120, atk: 38, def: 32, speed: 0.22,
    attackIntervalMs: 1400, isBoss: false, exp: 4, scrap: 1.6,
    shell: { hp: 320, flat: 14 },
  },
  {
    id: 'saucer', name: '飞碟', hp: 2600, atk: 42, def: 40, speed: 0.24,
    attackIntervalMs: 1600, isBoss: true, aim: 'back', exp: 10, scrap: 5,
  },
];

const PROTO_BY_ID: Readonly<Record<string, EnemyProto>> = Object.fromEntries(
  ENEMY_PROTOS.map((e) => [e.id, e]),
);

export function getEnemyProto(id: string): EnemyProto {
  const p = PROTO_BY_ID[id];
  if (!p) throw new Error(`未知外星人: ${id}`);
  return p;
}

export interface WaveSpawn {
  enemyId: string;
  count: number;
  /** 同组出怪间隔 */
  intervalMs: number;
  /** 该组相对本波开始的延迟出场 */
  delayMs: number;
}

/** 这一波难在哪。装给谁之前先看见这个字 */
export type WavePressure = '硬' | '多' | '快';

export interface WaveDef {
  wave: number;
  spawns: readonly WaveSpawn[];
  pressure: WavePressure;
  /**
   * 这一波的短标签，给 HUD 角标用。
   * 只写类型（集群 / 装甲 / 突击），不写「先拿小灰试」这种教人的话。
   */
  hint: string;
  /** 这一波出的题。玩家该听见要扫、要破壳、还是要拖住 */
  ask: string;
}

function s(enemyId: string, count: number, intervalMs = 600, delayMs = 0): WaveSpawn {
  return { enemyId, count, intervalMs, delayMs };
}

/**
 * 波次编排。五个阶段的意图：
 * 1–3   只有小灰与方块兵，三人已齐，建立「他们自己能打」的信任；
 * 4–6   引入铁罐（护甲），第一次需要真输出而不是站着挨；
 * 7     飞碟压阵，第一个可能卡住的点；
 * 8–12  数量与护甲混合，主卡关区，也是复活广告的需求来源；
 * 13–15 高压收尾。
 */
export const WAVES: readonly WaveDef[] = [
  // 开局三人已齐，第 1 波仍只出小灰，让玩家看清「他们自己会打」
  { wave: 1, spawns: [s('grey', 7)], pressure: '多', hint: '集群', ask: '一窝一窝的，得扫得开' },
  { wave: 2, spawns: [s('grey', 9, 500)], pressure: '多', hint: '集群', ask: '还是一窝，软的清不完' },
  { wave: 3, spawns: [s('cube', 6)], pressure: '硬', hint: '分裂', ask: '方块打碎还打，得连着收' },
  { wave: 4, spawns: [s('cube', 6), s('grey', 6, 400, 3000)], pressure: '多', hint: '混合', ask: '小的加碎块，扫不开就堆' },
  { wave: 5, spawns: [s('cube', 7), s('canister', 2, 700, 4000)], pressure: '硬', hint: '装甲', ask: '铁罐有壳，一下一下的打不动' },
  { wave: 6, spawns: [s('grey', 12, 320)], pressure: '多', hint: '集群', ask: '小灰铺过来，得扫一片' },
  { wave: 7, spawns: [s('saucer', 1), s('cube', 6, 600, 2500)], pressure: '硬', hint: '飞碟', ask: '飞碟打后排，脆的别站前' },
  { wave: 8, spawns: [s('cube', 10, 450), s('canister', 3, 800, 4500)], pressure: '硬', hint: '装甲', ask: '壳多了，软手打出白字' },
  { wave: 9, spawns: [s('grey', 16, 280), s('canister', 3, 800, 5000)], pressure: '多', hint: '集群', ask: '又多又有壳，光砸一个不够' },
  { wave: 10, spawns: [s('canister', 4, 800), s('cube', 10, 500, 4000)], pressure: '硬', hint: '装甲', ask: '铁罐扎堆，得一下砸穿' },
  { wave: 11, spawns: [s('grey', 18, 260), s('cube', 10, 450, 5000)], pressure: '快', hint: '突击', ask: '扑上来的，得拖住' },
  { wave: 12, spawns: [s('canister', 5, 750), s('grey', 16, 280, 4500)], pressure: '硬', hint: '混合', ask: '壳和窝一起，配错就堆死' },
  { wave: 13, spawns: [s('saucer', 1), s('canister', 2, 800, 3000)], pressure: '硬', hint: '飞碟', ask: '又打后排，脆皮换下去' },
  { wave: 14, spawns: [s('cube', 8, 450), s('canister', 3, 800, 5000)], pressure: '硬', hint: '装甲', ask: '还是破壳的题' },
  // 终局刻意不做成数值墙：一个飞碟加三铁罐六方块，
  // 让打到第 15 波的玩家有真实通关概率。终局要的是高潮，不是劝退
  {
    wave: 15,
    spawns: [s('saucer', 1), s('canister', 2, 800, 3000), s('cube', 5, 450, 6000)],
    pressure: '硬',
    hint: '终局',
    ask: '飞碟加铁罐，这局那套还在不在',
  },
];

/** HUD 角标：两个字，不讲故事 */
export function waveHeadline(wave: number): string {
  return getWave(wave).hint;
}

/** 这一波出的题，给 HUD 和过场说 */
export function waveAsk(wave: number): string {
  return getWave(wave).ask;
}

/**
 * 强度曲线。这两个数是整个切片最需要回归的参数。
 *
 * 上限由改装件的成长空间决定。没有等级系统，改装件是唯一成长来源，
 * 所以曲线必须压到「15 波总成长与改装成长同量级、略高一线」，否则后段必出断崖。
 *
 * knee 之后换用更缓的成长：后段压力主要来自怪的数量与护甲（见 WAVES），
 * 血量再指数下去会变成硬墙。
 *
 * **lateGrowth 从 1.05 提到 1.09，是跟着发牌密度走的。** 这条曲线原先按
 * 「一局发 7 件」校准，LEVEL_EXP 切密到 10 档后实测一局焊 8.0 件，
 * 改装成长多出约四成，后段立刻松掉（通关率 15.8% → 35.8%）。
 * 只动 late 段是因为前 8 波的到达率几乎没变，松的全在 knee 之后。
 * 回归对齐结果：中位 11 波、通关率 14.4%，与提档前的 11 波 / 15.8% 同档，
 * 但一局焊件数从 5.60 涨到 8.01。
 *
 * 这两个数与 LEVEL_EXP 是绑死的，改任何一边都要重跑 npm run sim。
 */
export const WAVE_CURVE = {
  hpGrowth: 1.18,
  atkGrowth: 1.12,
  lateGrowth: 1.09,
  lateAtkGrowth: 1.02,
  knee: 7,
} as const;

function segmented(growth: number, late: number, wave: number): number {
  if (wave <= WAVE_CURVE.knee) return growth ** (wave - 1);
  return growth ** (WAVE_CURVE.knee - 1) * late ** (wave - WAVE_CURVE.knee);
}

export function waveHpMult(wave: number): number {
  return segmented(WAVE_CURVE.hpGrowth, WAVE_CURVE.lateGrowth, wave);
}

export function waveAtkMult(wave: number): number {
  return segmented(WAVE_CURVE.atkGrowth, WAVE_CURVE.lateAtkGrowth, wave);
}

export function getWave(wave: number): WaveDef {
  const w = WAVES.find((x) => x.wave === wave);
  if (!w) throw new Error(`未定义波次: ${wave}`);
  return w;
}
