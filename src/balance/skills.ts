/**
 * 绝活：每个村民一招，劲头攒满放一次。纯数据，执行在 BattleEngine。
 *
 * 20 招不是 20 套逻辑，是同一组参数拼出来的：打多疼、定多久、摔多远、减速多久、
 * 回多少血、护住几成、手快多少，外加打谁（本路 / 身边 / 射程里 / 全场）。
 * 加新招先试着用这几个数拼，拼不出来再往引擎里加字段。
 *
 * **稀而重**：一场每人放 2–4 次，一招要能看出结果。劲头主要按时间攒，
 * 出手攒的按出手间隔折算 —— 按次数给的话，出手快的人一场能放十几次，招就廉价了。
 *
 * 养成三条线：
 * - 形态：二阶 ×1.25；三阶 ×1.6，**并多一个效果**（`evo3`，卡片上 `up` 那句说的就是它）；
 * - 星级：每颗星威力 +6%、攒劲 +4%；
 * - 工艺等级、村子等级：走攻击，绝活按攻击算，自然跟着涨。
 */
import type { Role, VillagerDef } from './villagers';

/** 打谁。`lane` 整条路从头到尾；`near` 自己面前两格 + 邻路同一排；`reach` 射程里的；`all` 全场 */
export type SkillScope = 'lane' | 'near' | 'reach' | 'all';
/** 帮谁。`self` 只有自己；`lane` 同一路的人；`all` 全队 */
export type SkillAlly = 'self' | 'lane' | 'all';

export interface SkillEffect {
  scope: SkillScope;
  /** 打一下 = 攻击 × dmg × 威力 */
  dmg?: number;
  /** 定住多久 ms。首领、水泥墩只吃一半 */
  stunMs?: number;
  /** 往回摔多少轴格 */
  push?: number;
  /** 减速多久 ms。`steady` 的怪不吃 */
  slowMs?: number;
  ally?: SkillAlly;
  /** 每人回 攻击 × heal × 威力 */
  heal?: number;
  /** 受到的伤害减这么多成 */
  guard?: number;
  /** 出手间隔乘这个 */
  haste?: number;
  /** guard / haste 持续多久 ms */
  buffMs?: number;
}

export interface SkillDef extends SkillEffect {
  name: string;
  /** 放的时候喊的那一句，横切条上用 */
  cry: string;
  /** 一句话说清干什么。布阵卡上用 */
  line: string;
  /** 三阶多出来的那个效果，一句话。和 evo3 必须对得上 */
  up: string;
  /** 三阶叠上去的效果。数值字段直接覆盖，没写的沿用 */
  evo3: Partial<SkillEffect>;
}

export const SKILLS: Readonly<Record<string, SkillDef>> = {
  // ---- 站远点打 ----
  guogai: {
    name: '锅盖阵', cry: '都躲我后头！', line: '这一路的人受伤减半，撑 5 秒',
    up: '三阶：锅盖一亮，面前的怪晃神 1 秒', scope: 'near', ally: 'lane', guard: 0.5, buffMs: 5000,
    evo3: { stunMs: 1000 },
  },
  yuwang: {
    name: '拦河大网', cry: '一网打尽！', line: '整条路横一张大网，怪堆在网前 3 秒',
    up: '三阶：收网，把网住的怪往回拖一格', scope: 'lane', stunMs: 2800, dmg: 0.6,
    evo3: { push: 1 },
  },
  laoyanqiang: {
    name: '滑轮连射', cry: '看我的！', line: '一串钢珠从头串到尾，整条路都挨',
    up: '三阶：钢珠打得腿软，整条路减速 3 秒', scope: 'lane', dmg: 2.6,
    evo3: { slowMs: 3000 },
  },
  labaye: {
    name: '全村广播', cry: '全村注意啦！', line: '大喇叭一喊，全队回一大口血',
    up: '三阶：一喊全队手快两成，撑 4 秒', scope: 'near', ally: 'all', heal: 2.2,
    evo3: { haste: 0.8, buffMs: 4000 },
  },
  // ---- 挨得住 ----
  tiezhu: {
    name: '顶高压锅', cry: '往这儿打！', line: '顶上高压锅，这一路的人少挨六成',
    up: '三阶：锅一顶，面前的怪被弹回去', scope: 'near', ally: 'lane', guard: 0.6, buffMs: 5000,
    evo3: { push: 0.8 },
  },
  shimo: {
    name: '碾子压路', cry: '都给我排队！', line: '大碾子压过去，整条路的怪停 2 秒还掉血',
    up: '三阶：压过去顺手给这一路的人垫一层，少挨三成', scope: 'lane', stunMs: 2000, dmg: 1.2,
    evo3: { ally: 'lane', guard: 0.3, buffMs: 3000 },
  },
  miankuzhang: {
    name: '一身家当', cry: '谁先倒看谁厚！', line: '抡起一身破烂，面前一圈都挨砸',
    up: '三阶：砸完自己回一大口血', scope: 'near', dmg: 2.4,
    evo3: { ally: 'self', heal: 1.5 },
  },
  erjiu: {
    name: '一整套家伙', cry: '修修就好！', line: '推着工具车过来，这一路的人回血还加层壳',
    up: '三阶：修完这一路手快两成半', scope: 'near', ally: 'lane', heal: 3, guard: 0.3, buffMs: 3000,
    evo3: { haste: 0.75, buffMs: 4000 },
  },
  // ---- 下手重 ----
  chengtuo: {
    name: '大秤杆', cry: '一圈全躺下！', line: '秤杆甩一圈，面前的怪挨砸还往后摔',
    up: '三阶：摔出去的怪晕 1 秒', scope: 'near', dmg: 1.4, push: 1.2,
    evo3: { stunMs: 1000 },
  },
  dachui: {
    name: '一锤定音', cry: '给我钉住！', line: '一锤砸地，面前的怪挨一下还钉在原地',
    up: '三阶：地面砸裂，钉完还减速 3 秒', scope: 'near', dmg: 2, stunMs: 1800,
    evo3: { slowMs: 3000 },
  },
  dianju: {
    name: '双头电锯', cry: '突突突——', line: '电锯转起来，够得着的全挨一大下',
    up: '三阶：锯完自己回一口血', scope: 'reach', dmg: 2.6,
    evo3: { ally: 'self', heal: 1 },
  },
  shazhu: {
    name: '一整案板', cry: '开席了！', line: '砍一刀够得着的，砍下来的变成全队的血',
    up: '三阶：开席了，全队手快两成，撑 4 秒', scope: 'reach', dmg: 1.5, ally: 'all', heal: 1.6,
    evo3: { haste: 0.8, buffMs: 4000 },
  },
  // ---- 越挨越猛 ----
  gaoyaguo: {
    name: '一排高压锅', cry: '要炸了都闪开！', line: '身上的锅一起炸，面前一圈挨炸还往后退',
    up: '三阶：炸完冒热气，怪减速 3 秒', scope: 'near', dmg: 2.2, push: 0.6,
    evo3: { slowMs: 3000 },
  },
  gangban: {
    name: '一身铁皮', cry: '打我？弹回去！', line: '裹成铁罐，这一路的人少挨五成，面前的怪挨一下',
    up: '三阶：铁皮带刺，面前的怪晕 1 秒', scope: 'near', dmg: 1, ally: 'lane', guard: 0.5, buffMs: 4000,
    evo3: { stunMs: 1000 },
  },
  laoli: {
    name: '一排挂钩', cry: '剁了！', line: '挂钩刀甩出去，整条路都挨一刀',
    up: '三阶：钩子勾住，把怪往回拖', scope: 'lane', dmg: 2.8,
    evo3: { push: 0.8 },
  },
  bianpao: {
    name: '一箱烟花', cry: '过年啦！', line: '一箱烟花点着，整条路挨炸，全队回血',
    up: '三阶：炸得整条路的怪愣 1 秒', scope: 'lane', dmg: 0.8, ally: 'all', heal: 2,
    evo3: { stunMs: 1000 },
  },
  // ---- 带一帮人 ----
  qiangou: {
    name: '一群狗', cry: '上！咬它！', line: '哨子一吹，狗群把整条路的怪顶回去',
    up: '三阶：狗咬住不撒嘴，怪减速 3 秒', scope: 'lane', dmg: 0.8, push: 1.5,
    evo3: { slowMs: 3000 },
  },
  jishi: {
    name: '放鸡出栏', cry: '咯咯咯——', line: '整栏鸡冲出去，整条路的怪被啄得走不动',
    up: '三阶：鸡啄完不走，怪再减速 3 秒', scope: 'lane', stunMs: 2400, dmg: 0.4,
    evo3: { slowMs: 3000 },
  },
  sanshen: {
    name: '整套音响', cry: '音乐起！', line: '低音炮一开，全场的怪一起挨震',
    up: '三阶：音乐一响，全队手快一成半', scope: 'all', dmg: 1,
    evo3: { ally: 'all', haste: 0.85, buffMs: 4000 },
  },
  baowenhu: {
    name: '一挑担子', cry: '喝口热的！', line: '两桶热水挑上来，全队手快四成，还回点血',
    up: '三阶：热水顺手泼出去，面前的怪挨烫', scope: 'near', ally: 'all', haste: 0.6, buffMs: 5000, heal: 1,
    evo3: { dmg: 1.5 },
  },
};

/** 形态给的威力。一阶就有绝活，二阶、三阶更猛，三阶另加 evo3 */
export const SKILL_EVO_POW = [1, 1.25, 1.6] as const;
/** 每颗星加多少威力 */
export const SKILL_STAR_POW = 0.06;
/**
 * 所有招整体的威力倍率。节奏改稀之后单招要够重，
 * 同时把绝活占总伤害压在三成上下，不让普攻变成摆设。
 */
export const SKILL_POW_MUL = 1.05;

/**
 * 绝活打完还剩不到这么多血的，直接带走（首领不算）。
 * 一招要看得出结果：怪残着血晃悠比多打三成伤害更显得招没用。
 */
export const SKILL_EXECUTE = 0.16;

/** 劲头满格 */
export const ENERGY_MAX = 100;
/** 场上有怪时每秒自己涨多少。节奏主要靠这个定 */
export const ENERGY_PER_S = 3.5;
/**
 * 一直在出手的话，每秒额外攒多少。按出手间隔折算：
 * 出手快的一下攒得少，慢的一下攒得多，一秒下来差不多。
 */
export const ENERGY_ACT_PER_S = 1.2;
/** 挨一下攒多少。前排挨得多，攒得快一点，但不许快到刷招 */
export const ENERGY_HIT = 2.5;
/** 每颗星攒劲快这么多 */
export const ENERGY_STAR = 0.04;
/** 开打时先给的劲头：第一招大约 10–12 秒 */
export const ENERGY_START = 45;
/** 满了憋这么久还没放，打得着什么就放什么 */
export const SKILL_WAIT_MS = 6000;

export function skillOf(def: VillagerDef): SkillDef {
  const s = SKILLS[def.id];
  if (!s) throw new Error(`没配绝活: ${def.id}`);
  return s;
}

/** 这个形态实际用的效果：三阶叠上 evo3 */
export function skillAt(def: VillagerDef, evoStage: number): SkillDef {
  const s = skillOf(def);
  return evoStage >= 3 ? { ...s, ...s.evo3 } : s;
}

/** 形态威力。定身、减速、增益的时长也按它 */
export function skillPow(evoStage: number): number {
  const i = Math.max(0, Math.min(SKILL_EVO_POW.length - 1, Math.floor(evoStage) - 1));
  return SKILL_EVO_POW[i]!;
}

/** 伤害和回血的总倍率：整体 × 形态 × 星级 */
export function skillPower(evoStage: number, stars: number): number {
  return SKILL_POW_MUL * skillPow(evoStage) * (1 + SKILL_STAR_POW * Math.max(0, Math.floor(stars)));
}

export function chargeMul(stars: number): number {
  return 1 + ENERGY_STAR * Math.max(0, Math.floor(stars));
}

/** 定位对应的绝活大类，布阵卡上的小标签 */
export const ROLE_SKILL_TAG: Readonly<Record<Role, string>> = {
  tank: '护人',
  block: '定怪',
  dps: '爆发',
  heal: '回血',
};
