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
 * 1. **一局内每件只出一次**（抽中即从池里拿掉）。12 件里发 7 件，
 *    组合每局不同，「这一局才有的戏」才立得住。
 * 2. **效果必须能在 tick 模拟里量化**，否则 tools/sim.ts 没法回归。
 *    做不到量化的想法在切片阶段一律不做。
 */

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
  | { kind: 'teamHaste'; value: number };

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
];

export const MOD_BY_ID: Readonly<Record<string, ModDef>> = Object.fromEntries(
  MODS.map((m) => [m.id, m]),
);

export function getMod(id: string): ModDef {
  const m = MOD_BY_ID[id];
  if (!m) throw new Error(`未知改装件: ${id}`);
  return m;
}

/** 图鉴和货架上用的短名，去掉「绑了个」这类前缀 */
export function shortModName(name: string): string {
  return name
    .replace(/^(接了根|手上焊把|兜里塞满|反手一口|又套一层|扛个|绑了[块个]|背了个)/, '')
    .replace(/绑手上$/, '')
    .replace(/缠一圈$/, '');
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
  }
}
