/**
 * 村民池（20 人，纯数据）
 *
 * 这一版的村民是**收集对象**，不再是「给改造提供起点的弱辅」。
 * 见 docs/00-体验目标.md §2：主体验的一半是「攒出一村子的怪物」。
 *
 * 三条设计原则：
 *
 * 1. **池子是 5 门路 × 4 定位 的完整方阵，每格恰好一人。**
 *    这不是为了整齐 —— 它是 §6 第 4 条「克制不是惩罚」的硬要求：
 *    只要有任何一条门路缺某个定位（比如「站远点打」没有坦克），
 *    那么「这关敌人克你的坦克、你得换一条门路的坦克上来」就会变成无解，
 *    克制立刻退回运气惩罚。方阵完整 = 换人永远有路。
 *    `assertRosterComplete()` 在启动时校验这件事，别加人时把它破了。
 *
 * 2. **门路天生固定，不可更改。** 上一版曾考虑让门路由焊在身上的破烂决定，
 *    被否掉了（见 §修订记录 2026-09-04）：那是自研机制、没有产品验证，
 *    而且会让主体验读起来仍然围着改装件转。
 *
 * 3. **每人三阶，每阶换打法不换数字。** §4.1 是硬约束：每一阶必须有独立立绘、
 *    必须改攻击方式或射程。只把数值调大的进化不做，所以 `stages[].pitch`
 *    里写的是「他变成什么样」，不是「他强了多少」。
 */

/** 门路。天生的定位，也是克制属性。循环见 COUNTERS */
export type Lane = 'reach' | 'stand' | 'heavy' | 'rage' | 'band';

/** 定位。决定他在 3×4 格子上该站哪儿 */
export type Role = 'tank' | 'block' | 'dps' | 'heal';

export const LANES: readonly Lane[] = ['reach', 'stand', 'heavy', 'rage', 'band'];
export const ROLES: readonly Role[] = ['tank', 'block', 'dps', 'heal'];

export const LANE_NAME: Readonly<Record<Lane, string>> = {
  reach: '站远点打',
  stand: '挨得住',
  heavy: '下手重',
  rage: '越挨越猛',
  band: '带一帮人',
};

export const ROLE_NAME: Readonly<Record<Role, string>> = {
  tank: '挨',
  block: '拦',
  dps: '打',
  heal: '修',
};

/**
 * 克制循环：key 克 value。
 *
 * 站远点打 → 带一帮人 → 挨得住 → 下手重 → 越挨越猛 → 站远点打
 *
 * 倍率刻意压低（见 COUNTER_UP / COUNTER_DOWN）：克制要能让人想换阵，
 * 但不许让被克的阵容打不过去。这条有回归护栏钉着。
 */
export const COUNTERS: Readonly<Record<Lane, Lane>> = {
  reach: 'band',
  band: 'stand',
  stand: 'heavy',
  heavy: 'rage',
  rage: 'reach',
};

/** 克制加成。别往上调，先看护栏「克制不是惩罚」 */
export const COUNTER_UP = 1.3;
/** 被克减伤。1 / 1.3 取两位，保持来回对称 */
export const COUNTER_DOWN = 0.77;

export function laneMul(attacker: Lane, defender: Lane): number {
  if (COUNTERS[attacker] === defender) return COUNTER_UP;
  if (COUNTERS[defender] === attacker) return COUNTER_DOWN;
  return 1;
}

/** 一阶的底子，按定位给。门路再往上乘一层 */
interface RoleBase {
  hp: number;
  atk: number;
  def: number;
  /** 射程（格）。1 即贴脸 */
  range: number;
  /** 出手间隔（ms），越小越快 */
  interval: number;
}

/**
 * 射程是按战场几何定的，别单独调。
 *
 * 四格在 pos 2/3/4/5，敌人被最前面的人挡在 pos 1.5（见 stages.SPAWN_GAP）。
 * 每个定位的射程恰好够它**该站的那一格**打到挡点：
 *
 *   挨 range 1 → 站 cell 0（pos 2），够到 1.0
 *   拦 range 2 → 站 cell 1（pos 3），够到 1.0
 *   打 range 3 → 站 cell 2（pos 4），够到 1.0
 *   修 range 3 → 站 cell 3（pos 5），够不到，但它的活是回血，不看射程
 *
 * 于是「站远点打」+1 射程有了实打实的机械意义：只有这条门路的「打」
 * 能站到最后一格还够得着挡点，别的门路挪后一格就变哑火。
 */
const ROLE_BASE: Readonly<Record<Role, RoleBase>> = {
  tank: { hp: 1700, atk: 60, def: 50, range: 1, interval: 1000 },
  block: { hp: 1100, atk: 110, def: 28, range: 2, interval: 1300 },
  dps: { hp: 800, atk: 175, def: 14, range: 3, interval: 1200 },
  heal: { hp: 900, atk: 80, def: 20, range: 3, interval: 1100 },
};

/** 门路怎么改这个人的底子。刻意都是小幅，人物差异主要来自定位与三阶形态 */
interface LaneMod {
  hp: number;
  atk: number;
  def: number;
  rangeAdd: number;
  intervalMul: number;
}

const LANE_MOD: Readonly<Record<Lane, LaneMod>> = {
  reach: { hp: 0.9, atk: 1, def: 0.9, rangeAdd: 1, intervalMul: 1 },
  stand: { hp: 1.2, atk: 0.85, def: 1.2, rangeAdd: 0, intervalMul: 1 },
  heavy: { hp: 0.95, atk: 1.35, def: 1, rangeAdd: 0, intervalMul: 1.4 },
  rage: { hp: 1.05, atk: 1.05, def: 0.8, rangeAdd: 0, intervalMul: 0.95 },
  band: { hp: 0.95, atk: 0.9, def: 1, rangeAdd: 0, intervalMul: 1 },
};

/**
 * 进化倍数。二阶 1.55、三阶 2.4。
 *
 * 这只是数值那一层；真正让进化「看得见」的是 EvoStage.pitch 里写的形态与打法变化，
 * §4.1 把「只调数值的进化不做」写成了硬约束。
 */
export const EVO_MUL = [1, 1.55, 2.4] as const;
export const EVO_MAX = 3;

/** 星级。喊重了的人折一颗星，每星 +8%，上限 ★5 */
export const STAR_MAX = 5;
export const STAR_STEP = 0.08;

export interface EvoStage {
  /** 这一阶叫什么。文案按 §1：形态用实物说，不用奇幻词 */
  name: string;
  /** 这一阶身上多了什么、打法怎么变。美术按这条画立绘 */
  pitch: string;
}

export interface VillagerDef {
  id: string;
  name: string;
  lane: Lane;
  role: Role;
  /** 别人替不了的活。§6 第 3 条要求每个新人都能回答这一句 */
  job: string;
  /** 一句人物介绍，帮玩家记住脸 */
  flavor: string;
  /** 三阶形态。长度必须是 3 */
  evo: readonly [EvoStage, EvoStage, EvoStage];
}

/**
 * 20 人方阵。行是门路，列是定位。
 *
 * 头 6 个（铁柱 / 王大锤 / 屠户老李 / 二舅 / 三婶 / 弹弓叔）是上一版就有的人，
 * 立绘和动画已经在 assets 里，门路按他们原来的起手特性归的类：
 * 铁柱的护盾归「挨得住」、王大锤的击晕归「下手重」、老李的吸血归「越挨越猛」、
 * 三婶的广场舞音响归「带一帮人」、弹弓叔的射程归「站远点打」。
 */
export const VILLAGERS: readonly VillagerDef[] = [
  // ---- 站远点打 ----
  {
    id: 'guogai',
    name: '锅盖二哥',
    lane: 'reach',
    role: 'tank',
    job: '挡飞碟的光束，替后排吃远程',
    flavor: '长竹竿挑着一面大锅盖，站中排给人打伞',
    evo: [
      { name: '挑着锅盖', pitch: '竹竿挑锅盖，正面来的远程弹被挡下来' },
      { name: '双锅盖', pitch: '两手各一面，挡的范围扩到左右邻格' },
      { name: '锅盖阵', pitch: '身后架起一排锅盖，整条路的远程伤害都先过他' },
    ],
  },
  {
    id: 'yuwang',
    name: '渔网婶',
    lane: 'reach',
    role: 'block',
    job: '远距离网住一整排，不用贴脸就能拦',
    flavor: '河边打渔出身，撒网又快又准',
    evo: [
      { name: '撒渔网', pitch: '往前撒一张网，网住的走不动' },
      { name: '带铅渔网', pitch: '网上挂了铅坨，网住的还掉血' },
      { name: '拦河大网', pitch: '整条路横一张大网，后面的怪堆在网前面挤成一团' },
    ],
  },
  {
    id: 'laoyanqiang',
    name: '弹弓叔',
    lane: 'reach',
    role: 'dps',
    job: '站最远点名，撂倒一个立刻再来一下',
    flavor: '蹲着瞄，站起来才动手，站得越远越准',
    evo: [
      { name: '弹弓', pitch: '钢珠弹弓，撂倒一个立刻补一下' },
      { name: '双股弹弓', pitch: '换成双股皮筋，一发穿两个' },
      { name: '滑轮弓', pitch: '装了滑轮和瞄具，一发从头串到尾' },
    ],
  },
  {
    id: 'labaye',
    name: '喇叭爷',
    lane: 'reach',
    role: 'heal',
    job: '隔着整个场子喊人回血，不用挪窝',
    flavor: '村委会广播员，嗓门盖得过外星人的引擎',
    evo: [
      { name: '铁皮喇叭', pitch: '举着喇叭喊，喊到的人回血' },
      { name: '电喇叭', pitch: '接上电瓶，一次喊一整条路' },
      { name: '大喇叭杆', pitch: '架起村口那根喇叭杆，全场都在他的嗓子里' },
    ],
  },

  // ---- 挨得住 ----
  {
    id: 'tiezhu',
    name: '铁柱',
    lane: 'stand',
    role: 'tank',
    job: '站最前面挨，倒了还能自己爬起来',
    flavor: '三层棉袄加摩托头盔，站前面最合适',
    evo: [
      { name: '三层棉袄', pitch: '棉袄够厚，每几秒自己缓一层' },
      { name: '焊了钢板', pitch: '棉袄外面焊上钢板，正面来的伤害先削一刀' },
      { name: '顶着高压锅', pitch: '头上高压锅、背上弹簧床垫，倒下一次能原地起来' },
    ],
  },
  {
    id: 'shimo',
    name: '石磨姨',
    lane: 'stand',
    role: 'block',
    job: '把路堵死，怪推不动她',
    flavor: '推了三十年石磨，腰比谁都稳',
    evo: [
      { name: '推着石磨', pitch: '石磨横在路上，撞上来的先停一下' },
      { name: '双扇磨', pitch: '两扇磨盘一起转，撞上来的会被磨得慢' },
      { name: '碾子', pitch: '换成大碾子，整条路的怪都得排队过' },
    ],
  },
  {
    id: 'miankuzhang',
    name: '棉裤张',
    lane: 'stand',
    role: 'dps',
    job: '贴脸慢慢磨，别人早倒了他还在打',
    flavor: '一年四季穿棉裤，挨两下跟没事一样',
    evo: [
      { name: '棉裤', pitch: '穿得厚，贴脸对砍不怕换血' },
      { name: '铁裤腰', pitch: '腰上箍了铁圈，掉的血越多打得越稳' },
      { name: '一身家当', pitch: '浑身挂满破烂，站着挨着打，谁先倒看谁厚' },
    ],
  },
  {
    id: 'erjiu',
    name: '二舅',
    lane: 'stand',
    role: 'heal',
    job: '什么破烂到他手里都能装上，边挨边修',
    flavor: '修了半辈子农机，手上没有修不好的东西',
    evo: [
      { name: '万能扳手', pitch: '每几秒给伤得最重的那个补一口' },
      { name: '焊枪', pitch: '换成焊枪，补的同时给对方加一层壳' },
      { name: '一整套家伙', pitch: '推着工具车上场，边挨边修，修完还能顺手拍一下' },
    ],
  },

  // ---- 下手重 ----
  {
    id: 'chengtuo',
    name: '秤砣老赵',
    lane: 'heavy',
    role: 'tank',
    job: '挨一下砸一下，越围着他人越多他越划算',
    flavor: '收粮的老秤砣从不离手，谁挤上来砸谁',
    evo: [
      { name: '抱着秤砣', pitch: '挨打之后回砸一下，砸中的会踉跄' },
      { name: '铁链秤砣', pitch: '秤砣系上铁链，回砸变成横着甩一圈' },
      { name: '大秤杆', pitch: '扛起整根秤杆，一圈下去周围全躺' },
    ],
  },
  {
    id: 'dachui',
    name: '王大锤',
    lane: 'heavy',
    role: 'block',
    job: '锤一下晕半天，把冲脸的按住',
    flavor: '五金店老板，抡起大锤来不看人',
    evo: [
      { name: '大锤', pitch: '被他锤到的，两秒内动作变慢' },
      { name: '双手锤', pitch: '换成双手锤，一下锤一片，都变慢' },
      { name: '风镐', pitch: '扛来工地的风镐，锤中的直接钉在原地' },
    ],
  },
  {
    id: 'dianju',
    name: '电锯哥',
    lane: 'heavy',
    role: 'dps',
    job: '出手慢，但一下切一整排',
    flavor: '锯木厂的，手一抖就是一片木屑',
    evo: [
      { name: '手锯', pitch: '一下砍一个，砍得重' },
      { name: '电锯', pitch: '拉响电锯，一下横切一排' },
      { name: '双头电锯', pitch: '两头都是锯片，转起来前后一起切' },
    ],
  },
  {
    id: 'shazhu',
    name: '杀猪匠',
    lane: 'heavy',
    role: 'heal',
    job: '下手最重的奶，砍出来的伤害分给队友',
    flavor: '一刀下去从不含糊，杀完顺手给人添碗汤',
    evo: [
      { name: '杀猪刀', pitch: '砍出去的伤害，一部分变成队友的血' },
      { name: '砍骨刀', pitch: '换成砍骨刀，砍得越重给队友回得越多' },
      { name: '一整案板', pitch: '推着案板上场，砍一下全队一起回' },
    ],
  },

  // ---- 越挨越猛 ----
  {
    id: 'gaoyaguo',
    name: '高压锅婶',
    lane: 'rage',
    role: 'tank',
    job: '挨够了自己炸，炸完还能接着挨',
    flavor: '灶上那口高压锅从没洗过，压力一直在攒',
    evo: [
      { name: '背着高压锅', pitch: '挨打攒压力，满了自己炸一圈' },
      { name: '加压阀', pitch: '攒得更快，炸完留一圈热气烫人' },
      { name: '一排高压锅', pitch: '身上挂一排锅，炸完接着攒，越挨越勤' },
    ],
  },
  {
    id: 'gangban',
    name: '钢板哥',
    lane: 'rage',
    role: 'block',
    job: '谁打他谁疼，把输出怪按在自己身上',
    flavor: '钢厂下岗，身上那块板子焊死了取不下来',
    evo: [
      { name: '一块钢板', pitch: '挨的伤害按比例弹回去' },
      { name: '带刺钢板', pitch: '板上焊了钢筋刺，弹回去的还带流血' },
      { name: '一身铁皮', pitch: '整个人裹成铁罐，弹回去的伤害溅到旁边' },
    ],
  },
  {
    id: 'laoli',
    name: '屠户老李',
    lane: 'rage',
    role: 'dps',
    job: '越砍越精神，血越少打得越凶',
    flavor: '剁了半辈子肉，站第二排也能砍到',
    evo: [
      { name: '剁肉刀', pitch: '砍出去的伤害三成变自己的血' },
      { name: '双刀', pitch: '一手一把，血越少出手越快' },
      { name: '一排挂钩', pitch: '腰上挂满钩子刀，掉血换伤害，血线越低越凶' },
    ],
  },
  {
    id: 'bianpao',
    name: '鞭炮婆',
    lane: 'rage',
    role: 'heal',
    job: '被打就炸一串，炸完全队回血',
    flavor: '过年剩的鞭炮全在她身上，一碰就响',
    evo: [
      { name: '一挂鞭炮', pitch: '挨打时炸一串，炸完给周围回血' },
      { name: '两响炮', pitch: '换成二踢脚，炸两下，回血翻一倍' },
      { name: '一箱烟花', pitch: '背一箱烟花，炸起来整条路都在回血' },
    ],
  },

  // ---- 带一帮人 ----
  {
    id: 'qiangou',
    name: '牵狗大爷',
    lane: 'band',
    role: 'tank',
    job: '狗替他挡刀，自己站着抽烟看',
    flavor: '牵着一条不怕人的大黄，狗比他先动手',
    evo: [
      { name: '牵一条狗', pitch: '狗冲上去替他挨第一波' },
      { name: '两条狗', pitch: '一条挡前面一条咬后面，狗倒了会自己回来' },
      { name: '一群狗', pitch: '哨子一吹三条狗齐上，前面基本挤不动' },
    ],
  },
  {
    id: 'jishi',
    name: '养鸡婶',
    lane: 'band',
    role: 'block',
    job: '一群鸡围住怪，用数量拦路',
    flavor: '后院两百只鸡，撒把食就全跟着走',
    evo: [
      { name: '撒鸡食', pitch: '一把鸡食下去，几只鸡围住最前面那个' },
      { name: '一笼鸡', pitch: '鸡更多，围住的范围扩到整格' },
      { name: '放鸡出栏', pitch: '整栏鸡冲出去，一路的怪都被啄得走不动' },
    ],
  },
  {
    id: 'sanshen',
    name: '三婶',
    lane: 'band',
    role: 'dps',
    job: '音响一开一片倒，人越多她越值',
    flavor: '广场舞领队，音响就是她的武器',
    evo: [
      { name: '手提音响', pitch: '打人带响，旁边的也吃伤害' },
      { name: '落地音箱', pitch: '换成落地箱，震到的范围更大' },
      { name: '整套音响', pitch: '一排音箱加低音炮，一开整条路一起倒' },
    ],
  },
  {
    id: 'baowenhu',
    name: '保温壶爷',
    lane: 'band',
    role: 'heal',
    job: '给全队倒热水，跟着他的人都快一档',
    flavor: '保温壶不离手，走到哪儿都能倒出一碗热的',
    evo: [
      { name: '保温壶', pitch: '给周围的人倒水，出手变快' },
      { name: '大铁壶', pitch: '换成大铁壶，加速范围扩到整条路' },
      { name: '一挑担子', pitch: '挑着两桶热水上场，全队跟着他快，还慢慢回血' },
    ],
  },
];

export const VILLAGER_BY_ID: Readonly<Record<string, VillagerDef>> = Object.fromEntries(
  VILLAGERS.map((v) => [v.id, v]),
);

export function getVillager(id: string): VillagerDef {
  const v = VILLAGER_BY_ID[id];
  if (!v) throw new Error(`未知村民: ${id}`);
  return v;
}

/** 上一版就有立绘的 6 个人。第一批可玩内容用他们，新增的 14 个等美术 */
export const LEGACY_IDS: readonly string[] = [
  'tiezhu', 'dachui', 'laoli', 'erjiu', 'sanshen', 'laoyanqiang',
];

/** 村子没点过人时的默认三人：挨、拦、打 */
export const DEFAULT_SQUAD: readonly string[] = ['tiezhu', 'dachui', 'laoyanqiang'];

export function byLaneRole(lane: Lane, role: Role): VillagerDef | undefined {
  return VILLAGERS.find((v) => v.lane === lane && v.role === role);
}

/**
 * 启动时校验方阵完整。
 *
 * 这条不是洁癖。5 门路 × 4 定位每格必须恰好一人，否则
 * 「敌人克你的坦克、换另一条门路的坦克上来」会变成无解，
 * 克制立刻退化成运气惩罚（撞反目标第三条）。加人删人都得过这一关。
 */
export function assertRosterComplete(): void {
  const bad: string[] = [];
  for (const lane of LANES) {
    for (const role of ROLES) {
      const hit = VILLAGERS.filter((v) => v.lane === lane && v.role === role);
      if (hit.length !== 1) {
        bad.push(`${LANE_NAME[lane]}·${ROLE_NAME[role]} 有 ${hit.length} 人`);
      }
    }
  }
  if (bad.length > 0) {
    throw new Error(`村民方阵不完整，克制会变成运气惩罚: ${bad.join('; ')}`);
  }
  for (const v of VILLAGERS) {
    if (v.evo.length !== EVO_MAX) throw new Error(`${v.name} 的形态不是 ${EVO_MAX} 阶`);
  }
}

/** 一个村民在某一阶、某星级、某村庄等级下的实际面板 */
export interface Stats {
  hp: number;
  atk: number;
  def: number;
  range: number;
  interval: number;
}

/**
 * 算面板。三条乘数分别来自：进化阶（EVO_MUL）、星级（STAR_STEP）、村庄等级。
 *
 * 只有 hp / atk 吃这三层放大；def / range / interval 只跟定位、门路和进化阶有关，
 * 免得村庄等级把射程和出手速度也一起买掉（撞 §6 第 12 条）。
 */
export function statsOf(
  def: VillagerDef,
  evoStage = 1,
  stars = 0,
  villageMul = 1,
): Stats {
  const base = ROLE_BASE[def.role];
  const mod = LANE_MOD[def.lane];
  const evo = EVO_MUL[Math.max(0, Math.min(EVO_MAX - 1, Math.floor(evoStage) - 1))] ?? 1;
  const star = 1 + Math.max(0, Math.min(STAR_MAX, Math.floor(stars))) * STAR_STEP;
  const grow = evo * star * Math.max(1, villageMul);
  return {
    hp: Math.round(base.hp * mod.hp * grow),
    atk: Math.round(base.atk * mod.atk * grow),
    def: Math.round(base.def * mod.def),
    range: base.range + mod.rangeAdd,
    interval: Math.round(base.interval * mod.intervalMul),
  };
}
