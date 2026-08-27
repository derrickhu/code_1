/**
 * 改装件（纯数据）
 *
 * 这是主体验的载体：「我把一个杂兵改造成了怪物」。三选一发的是破烂，
 * 玩家再决定装到谁身上——**「装给谁」那一步才是这个游戏的核心动作**。
 *
 * 每件改装件都必须能回答一句：**它让谁从什么变成了什么。**
 * 只加百分比数值、不改打法的改装件一律不做（docs/00-体验目标.md 审视清单第 1 条）。
 * 因此 `pivot` 类占了一半以上，纯强度类只留两件，用来在构筑成型后补最后一脚。
 *
 * 另外两条约束：
 *
 * 1. **一局内每件只出一次**（抽中即从池里拿掉）。池子里二十多件发 7 件，
 *    组合每局不同，「这一局才有的戏」才立得住。
 * 2. **效果必须能在 tick 模拟里量化**，否则 tools/sim.ts 没法回归。
 *    做不到量化的想法在切片阶段一律不做。
 */

import { getPetProto } from './pets';

/**
 * 能力效果。村民的起手特性与改装件共用这一套类型，
 * 引擎因此只需要一套 switch 就能把「天生的」和「装上的」一起算。
 */
export type Ability =
  // ── 村民起手特性也会用到的几种 ──
  /** 周期给自己叠一层吸收护盾 */
  | { kind: 'shield'; amount: number; everyMs: number }
  /** 周期治疗当前血量最低的队友 */
  | { kind: 'heal'; amount: number; everyMs: number }
  /** 攻击溅射到附近的敌人 */
  | { kind: 'splash'; damagePct: number; radius: number }
  /** 击杀后立刻追加一次攻击，可连锁 */
  | { kind: 'execute'; maxChain: number }
  /** 命中时减速目标（同时拖慢移动与出手） */
  | { kind: 'slowOnHit'; slowPct: number; durationMs: number }
  /** 造成伤害时按比例回复自身 */
  | { kind: 'lifesteal'; healPct: number }
  // ── 改装件专有 ──
  /** 射程加若干格：能把近战改造成远程 */
  | { kind: 'rangeUp'; value: number }
  /** 站在队首时伤害翻倍：逼远程往前站 */
  | { kind: 'frontMult'; mult: number }
  /** 每次受击累积攻击加成：把肉盾改造成主输出 */
  | { kind: 'rageOnHurt'; pctPerHit: number; maxStacks: number }
  /** 出手变慢但单下更重：把快攻改造成重炮 */
  | { kind: 'heavySwing'; intervalPct: number; damageMult: number }
  /** 攻击穿透，额外命中身后若干个 */
  | { kind: 'pierce'; extraTargets: number }
  /** 攻击力百分比 */
  | { kind: 'atkPct'; value: number }
  /** 攻击变强，但焊死成近战：远程装上就得贴脸 */
  | { kind: 'sawGrip'; atkPct: number }
  /** 自身暴击 */
  | { kind: 'crit'; chancePct: number; mult: number }
  /** 受伤减免 */
  | { kind: 'armorPct'; value: number }
  /** 本波第一次倒下时原地站起来：让脆皮敢站前排 */
  | { kind: 'revive'; hpPct: number }
  /** 受击反弹伤害：把挨打变成输出 */
  | { kind: 'thorns'; reflectPct: number }
  /** 光环：全队攻速 */
  | { kind: 'teamHaste'; value: number }
  /**
   * 定期放出小东西（狗、鸡、乡亲）。
   *
   * 强弱和出生位置全看主人：攻击按 `atkInherit` 继承，还会跟主人学一手
   * （减速、带响、回血），并从主人站的那一格出生。这是刻意的 ——
   * 按钮谁按都一样，改装件栓给谁完全不一样。见 pets.ts 开头。
   *
   * **血量刻意不继承。** 试过继承，结果是它把差异抹平了：栓给铁柱的狗攻击
   * 只有三分之一，却因为血厚、挡刀挡得久，把「装错人」的亏补了回来。
   * 于是这一件的「装给谁」敏感度低于池子平均，smart 与 random 的差值反而被拉低。
   */
  | {
      kind: 'summon';
      petId: string;
      everyMs: number;
      /** 这一件最多同时养着几只。全队还有 PET_CAP 那道画面硬闸 */
      maxAlive: number;
      atkInherit: number;
    };

/** 放小东西那一支的载荷。跟着 Ability 自动同步，别单独再抄一份 */
export type SummonSpec = Extract<Ability, { kind: 'summon' }>;

/**
 * 改装件的用途分类。只用于保证三选一的三张牌价值不同向，
 * 不影响任何数值。见 picker.ts 的发牌规则。
 */
export type ModKind = 'pivot' | 'output' | 'tanky' | 'team';

export interface ModDef {
  id: string;
  /** 破烂的名字。必须是实物，玩家一眼知道能干什么 */
  name: string;
  kind: ModKind;
  effect: Ability;
  /** 卡面上的一句话。说效果，不说花名 */
  desc: string;
  /** 装上之后这个人变成了什么。这句话是本件改装件存在的理由 */
  becomes: string;
  /**
   * 进三选一的份量。老件 2、新件 1：池子变大也不许把水管电锯摊没。
   * 不写当 1。
   */
  drawW?: number;
}

export const MODS: readonly ModDef[] = [
  // ── pivot：改定位。这一类是主体验的主力 ──
  {
    id: 'pipe',
    name: '接了根长水管',
    kind: 'pivot',
    effect: { kind: 'rangeUp', value: 3 },
    desc: '射程加 3 格',
    becomes: '近战从此能站后面捅人',
  },
  {
    id: 'steelplate',
    name: '绑了块钢板',
    kind: 'pivot',
    effect: { kind: 'frontMult', mult: 2 },
    desc: '站队首时伤害翻倍',
    becomes: '远程被逼到最前面，值',
  },
  {
    id: 'pressurecooker',
    name: '背了个高压锅',
    kind: 'pivot',
    effect: { kind: 'rageOnHurt', pctPerHit: 14, maxStacks: 10 },
    desc: '每挨一下攻击 +14%，本波最多叠 10 层',
    becomes: '越挨打越猛，肉盾变主力',
  },
  {
    id: 'weight',
    name: '秤砣绑手上',
    kind: 'pivot',
    effect: { kind: 'heavySwing', intervalPct: 80, damageMult: 2.5 },
    desc: '出手慢 80%，但一下打 2.5 倍',
    becomes: '快手改成重炮',
  },
  {
    id: 'blower',
    name: '绑了个鼓风机',
    kind: 'pivot',
    effect: { kind: 'splash', damagePct: 60, radius: 1 },
    desc: '打人带风，旁边的吃 60% 伤害',
    becomes: '单点改成一片',
  },
  {
    id: 'wire',
    name: '电线缠一圈',
    kind: 'pivot',
    effect: { kind: 'pierce', extraTargets: 2 },
    desc: '打穿过去，身后 2 个一起吃',
    becomes: '一条线上的全归他管',
  },
  {
    id: 'helmet',
    name: '摩托头盔',
    kind: 'pivot',
    effect: { kind: 'revive', hpPct: 50 },
    desc: '本波第一次倒下时半血站起来',
    becomes: '脆皮也敢站前面了',
  },

  // ── output：纯强度。只留两件，用来给成型的构筑补最后一脚 ──
  {
    id: 'chainsaw',
    name: '手上焊把电锯',
    kind: 'output',
    effect: { kind: 'sawGrip', atkPct: 50 },
    desc: '攻击 +50%，焊上就只能贴脸',
    becomes: '远程焊上就得贴脸',
  },
  {
    id: 'firecracker',
    name: '兜里塞满鞭炮',
    kind: 'output',
    effect: { kind: 'crit', chancePct: 25, mult: 2 },
    desc: '25% 概率炸出 2 倍伤害',
    becomes: '打一窝小灰才值，打铁罐浪费',
  },

  // ── tanky ──
  {
    id: 'pot',
    name: '反手一口锅',
    kind: 'tanky',
    effect: { kind: 'thorns', reflectPct: 45 },
    desc: '谁打他就吃 45% 反弹',
    becomes: '挨打本身变成输出',
  },
  {
    id: 'quilt',
    name: '又套一层被',
    kind: 'tanky',
    effect: { kind: 'armorPct', value: 30 },
    desc: '受到的伤害降低 30%',
    becomes: '站得更久，撑住队首',
  },

  // ── team ──
  {
    id: 'speaker',
    name: '扛个广场舞音响',
    kind: 'team',
    effect: { kind: 'teamHaste', value: 25 },
    desc: '全队出手快 25%，他倒了光环停',
    becomes: '别让他站最前，倒了全队变慢',
  },

  // ── 放小东西的三件。狗和鸡都从主人脚下出生，强弱按主人算 ──
  //
  // 这三件是「两军对撞」那个感觉的全部来源：3 个村民 + 几只小东西
  // 对上涌进来的外星人。但它们不占队列格，「上场 3 人」那条硬约束没破。
  {
    id: 'dogleash',
    name: '栓了条狗',
    kind: 'pivot',
    effect: { kind: 'summon', petId: 'dog', everyMs: 9000, maxAlive: 1, atkInherit: 88 },
    desc: '每 9 秒放一条狗，咬人按主人的力气算',
    becomes: '栓给谁完全是两条狗：猛的还是耐揍的',
  },
  {
    id: 'chickenfeed',
    name: '撒了把鸡食',
    kind: 'tanky',
    effect: { kind: 'summon', petId: 'chicken', everyMs: 8200, maxAlive: 2, atkInherit: 14 },
    desc: '每 8 秒来两只鸡，替他挨几下',
    becomes: '前面多两个活肉垫',
  },
  {
    id: 'holler',
    name: '扯着嗓子喊人',
    kind: 'team',
    effect: { kind: 'summon', petId: 'militia', everyMs: 14500, maxAlive: 2, atkInherit: 38 },
    desc: '每 14 秒喊来两个乡亲，帮着打',
    becomes: '一个人喊成一小队',
  },

  // ── 扩池：仍是改定位，不靠纯数值。局里抽得到，废品站只给它升星 ──
  {
    id: 'sickle',
    name: '生锈镰刀',
    kind: 'pivot',
    effect: { kind: 'execute', maxChain: 3 },
    desc: '砍倒一个立刻再削 3 个',
    becomes: '收割手，专清小灰',
  },
  {
    id: 'foam',
    name: '提了个灭火器',
    kind: 'pivot',
    effect: { kind: 'slowOnHit', slowPct: 38, durationMs: 1000 },
    desc: '打中的人变慢 38%，持续 1.0 秒',
    becomes: '单点改成控场',
  },
  {
    id: 'sack',
    name: '套了个旧麻袋',
    kind: 'tanky',
    effect: { kind: 'lifesteal', healPct: 22 },
    desc: '打出去的伤害 22% 回到自己身上',
    becomes: '脆皮也能站前面磨',
  },
  {
    id: 'shovel',
    name: '扛把铁锹',
    kind: 'output',
    effect: { kind: 'pierce', extraTargets: 1 },
    desc: '打穿过去，再吃一个',
    becomes: '近战也能管身后那个',
  },
  {
    id: 'battery',
    name: '背了块电瓶',
    kind: 'tanky',
    effect: { kind: 'shield', amount: 260, everyMs: 4000 },
    desc: '每 4.0 秒给自己一层 260 的壳',
    becomes: '远程也敢挨一口',
  },
  {
    id: 'slingshot',
    name: '弹弓皮筋绑手上',
    kind: 'pivot',
    effect: { kind: 'rangeUp', value: 2 },
    desc: '射程加 2 格',
    becomes: '贴脸的能退半步打',
  },
  {
    id: 'stool',
    name: '板凳抡圆',
    kind: 'pivot',
    effect: { kind: 'heavySwing', intervalPct: 55, damageMult: 2.2 },
    desc: '出手慢 55%，一下打 2.2 倍',
    becomes: '快手改成闷棍',
  },
  {
    id: 'chili',
    name: '一把辣椒面',
    kind: 'tanky',
    effect: { kind: 'thorns', reflectPct: 36 },
    desc: '谁打他就辣回去 36%',
    becomes: '挨打也扎手',
  },
  {
    id: 'fridge',
    name: '冰箱门挡前面',
    kind: 'tanky',
    effect: { kind: 'armorPct', value: 24 },
    desc: '受到的伤害降低 24%',
    becomes: '门板往前一立',
  },
  {
    id: 'gascan',
    name: '煤气罐绑腰上',
    kind: 'output',
    effect: { kind: 'crit', chancePct: 22, mult: 2.3 },
    desc: '22% 概率炸出 2.3 倍',
    becomes: '打中了特别响',
  },
  {
    id: 'thermos',
    name: '拎个暖水瓶',
    kind: 'team',
    effect: { kind: 'heal', amount: 120, everyMs: 6000 },
    desc: '每 6.0 秒给血最低的人灌 120',
    becomes: '别让他站最前，倒了没人灌',
  },
  {
    id: 'bell',
    name: '挂个自行车铃',
    kind: 'team',
    effect: { kind: 'teamHaste', value: 18 },
    desc: '全队出手快 18%，他倒了铃就停',
    becomes: '让他站后面叮铃铃',
  },
];

export const MOD_BY_ID: Readonly<Record<string, ModDef>> = Object.fromEntries(
  MODS.map((m) => [m.id, m]),
);

export function getMod(id: string): ModDef {
  const m = MOD_BY_ID[id];
  if (!m) throw new Error(`未知改装件: ${id}`);
  return m;
}

/** 村里早就有的那 15 件，抽卡时份量加倍，新件摊不掉水管电锯 */
const FAMILIAR_MODS = new Set([
  'pipe', 'steelplate', 'pressurecooker', 'weight', 'blower', 'wire', 'helmet',
  'chainsaw', 'firecracker', 'pot', 'quilt', 'speaker',
  'dogleash', 'chickenfeed', 'holler',
]);

export function isFamiliarMod(id: string): boolean {
  return FAMILIAR_MODS.has(id);
}

export function modDrawWeight(mod: ModDef): number {
  return mod.drawW ?? (FAMILIAR_MODS.has(mod.id) ? 3 : 1);
}

export const MOD_STAR_MAX = 4;

/** 哈迪斯稀有度 / 向僵尸开炮升星：星级只放大这件，不改定位 */
export function scaleAbility(a: Ability, stars: number): Ability {
  const s = Math.max(0, Math.min(MOD_STAR_MAX, Math.floor(stars)));
  if (s <= 0) return a;
  const bump = (n: number, step = 0.2): number => Math.round(n * (1 + s * step) * 10) / 10;
  const extra = (at: readonly number[]): number => at.filter((t) => s >= t).length;
  switch (a.kind) {
    case 'shield':
      return { ...a, amount: Math.round(bump(a.amount)), everyMs: Math.round(a.everyMs * (1 - 0.06 * s)) };
    case 'heal':
      return { ...a, amount: Math.round(bump(a.amount)), everyMs: Math.round(a.everyMs * (1 - 0.06 * s)) };
    case 'splash':
      return { ...a, damagePct: bump(a.damagePct, 0.12), radius: bump(a.radius, 0.1) };
    case 'execute':
      return { ...a, maxChain: a.maxChain + extra([2, 4]) };
    case 'slowOnHit':
      return { ...a, slowPct: bump(a.slowPct, 0.12), durationMs: Math.round(a.durationMs * (1 + 0.12 * s)) };
    case 'lifesteal':
      return { ...a, healPct: bump(a.healPct, 0.18) };
    case 'rangeUp':
      return { ...a, value: a.value + extra([2, 4]) };
    case 'frontMult':
      return { ...a, mult: bump(a.mult, 0.1) };
    case 'rageOnHurt':
      return { ...a, pctPerHit: bump(a.pctPerHit, 0.12), maxStacks: a.maxStacks + extra([2, 4]) };
    case 'heavySwing':
      return { ...a, damageMult: bump(a.damageMult, 0.12) };
    case 'pierce':
      return { ...a, extraTargets: a.extraTargets + extra([2, 4]) };
    case 'atkPct':
      return { ...a, value: bump(a.value, 0.15) };
    case 'sawGrip':
      return { ...a, atkPct: bump(a.atkPct, 0.15) };
    case 'crit':
      return { ...a, chancePct: bump(a.chancePct, 0.15), mult: bump(a.mult, 0.08) };
    case 'armorPct':
      return { ...a, value: bump(a.value, 0.15) };
    case 'revive':
      return { ...a, hpPct: Math.min(80, bump(a.hpPct, 0.12)) };
    case 'thorns':
      return { ...a, reflectPct: bump(a.reflectPct, 0.12) };
    case 'teamHaste':
      return { ...a, value: bump(a.value, 0.12) };
    case 'summon':
      return {
        ...a,
        everyMs: Math.round(a.everyMs * (1 - 0.08 * s)),
        atkInherit: bump(a.atkInherit, 0.1),
        maxAlive: a.maxAlive + extra([3]),
      };
  }
}

export function formatEffect(a: Ability): string {
  switch (a.kind) {
    case 'shield': return `每 ${(a.everyMs / 1000).toFixed(1)} 秒给自己一层 ${Math.round(a.amount)} 的壳`;
    case 'heal': return `每 ${(a.everyMs / 1000).toFixed(1)} 秒给血最低的人灌 ${Math.round(a.amount)}`;
    case 'splash': return `打人带风，旁边的吃 ${Math.round(a.damagePct)}% 伤害`;
    case 'execute': return `砍倒一个立刻再削 ${a.maxChain} 个`;
    case 'slowOnHit': return `打中的人变慢 ${Math.round(a.slowPct)}%，持续 ${(a.durationMs / 1000).toFixed(1)} 秒`;
    case 'lifesteal': return `打出去的伤害 ${Math.round(a.healPct)}% 回到自己身上`;
    case 'rangeUp': return `射程加 ${a.value} 格`;
    case 'frontMult': return `站队首时伤害 ${a.mult} 倍`;
    case 'rageOnHurt': return `每挨一下攻击 +${Math.round(a.pctPerHit)}%，本波最多叠 ${a.maxStacks} 层`;
    case 'heavySwing': return `出手慢 ${a.intervalPct}%，一下打 ${a.damageMult} 倍`;
    case 'pierce': return `打穿过去，身后 ${a.extraTargets} 个一起吃`;
    case 'atkPct': return `攻击 +${Math.round(a.value)}%`;
    case 'sawGrip': return `攻击 +${Math.round(a.atkPct)}%，焊上就只能贴脸`;
    case 'crit': return `${Math.round(a.chancePct)}% 概率炸出 ${a.mult} 倍伤害`;
    case 'armorPct': return `受到的伤害降低 ${Math.round(a.value)}%`;
    case 'revive': return `本波第一次倒下时 ${Math.round(a.hpPct)}% 血站起来`;
    case 'thorns': return `谁打他就吃 ${Math.round(a.reflectPct)}% 反弹`;
    case 'teamHaste': return `全队出手快 ${Math.round(a.value)}%，他倒了光环停`;
    case 'summon': {
      const pet = getPetProto(a.petId).name;
      return `每 ${(a.everyMs / 1000).toFixed(1)} 秒放${pet}，最多 ${a.maxAlive} 只`;
    }
  }
}

export function starMarks(stars: number): string {
  const n = Math.max(0, Math.min(MOD_STAR_MAX, Math.floor(stars)));
  if (n <= 0) return '';
  return ` ${'★'.repeat(n)}`;
}

/** 带星的那份。名字和定位不变，数字和说明跟着星走 */
export function masteredMod(mod: ModDef, stars: number): ModDef {
  const s = Math.max(0, Math.min(MOD_STAR_MAX, Math.floor(stars)));
  if (s <= 0) return mod;
  const effect = scaleAbility(mod.effect, s);
  return { ...mod, effect, desc: formatEffect(effect) };
}

export function shortModName(name: string): string {
  return name
    .replace(/^(接了根|手上焊把|兜里塞满|反手一口|又套一层|扛个|绑了[块个]|背了[个块]|提了个|套了个|扛把|弹弓|一把|冰箱门|煤气罐|拎个|挂个|生锈|撒了把|栓了条|扯着)/, '')
    .replace(/绑手上$/, '')
    .replace(/缠一圈$/, '')
    .replace(/挡前面$/, '')
    .replace(/绑腰上$/, '')
    .replace(/抡圆$/, '');
}

/** 场上显示的短词，说效果不说花名 */
export function abilityTag(a: Ability): string {
  switch (a.kind) {
    case 'shield': return '护盾';
    case 'heal': return '治疗';
    case 'splash': return '溅射';
    case 'execute': return '连击';
    case 'slowOnHit': return '减速';
    case 'lifesteal': return '吸血';
    case 'rangeUp': return '长射程';
    case 'frontMult': return '队首翻倍';
    case 'rageOnHurt': return '越挨越猛';
    case 'heavySwing': return '重击';
    case 'pierce': return '穿透';
    case 'atkPct': return '强攻';
    case 'sawGrip': return '焊成近战';
    case 'crit': return '暴击';
    case 'armorPct': return '硬';
    case 'revive': return '站得起来';
    case 'thorns': return '反弹';
    case 'teamHaste': return '全队攻速';
    case 'summon': return `放${getPetProto(a.petId).name}`;
  }
}
