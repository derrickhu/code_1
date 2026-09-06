/**
 * 装备挂点。身体和家伙分层，才能换武器。
 *
 * 柄在拳里，头朝外。贴图里柄在哪、头朝哪，这里必须对上，否则锅会拿反。
 *
 * 手上拿什么由**村民 + 进化阶**决定，不再由焊在身上的改装件决定。
 * 这是 §4.1 的硬要求：进化必须看得见，而「看得见」最直接的一笔就是换家伙。
 */

export type GearSlot = 'hand' | 'head' | 'back' | 'body';

export interface HandGear {
  id: string;
  /** 贴图路径，相对小游戏 images/ */
  path: string;
  /** 握住的点（贴图锚点），必须落在柄上 */
  gripX: number;
  gripY: number;
  /** 贴图里头（刃 / 锅口 / 锤头）相对握点的朝向。0 朝右，-π/2 朝上 */
  headLocal: number;
  /** 刃口再转一点 */
  twist?: number;
  /** 相对身体高度 */
  scale: number;
  /** 待机臂角。不填则用动作默认 */
  rest?: number;
}

export const HAND_GEAR: Readonly<Record<string, HandGear>> = {
  wrench: { id: 'wrench', path: 'images/wep_wrench.png', gripX: 0.22, gripY: 0.84, headLocal: -Math.PI / 4, scale: 0.6 },
  hammer: { id: 'hammer', path: 'images/fx_hammer.png', gripX: 0.28, gripY: 0.8, headLocal: -Math.PI / 4, scale: 0.64 },
  cleaver: { id: 'cleaver', path: 'images/wep_cleaver.png', gripX: 0.2, gripY: 0.86, headLocal: -0.9, twist: 0.18, scale: 0.58 },
  driver: { id: 'driver', path: 'images/wep_driver.png', gripX: 0.26, gripY: 0.84, headLocal: -Math.PI / 2.5, scale: 0.52 },
  radio: { id: 'radio', path: 'images/wep_radio.png', gripX: 0.5, gripY: 0.14, headLocal: 1.15, scale: 0.5, rest: -0.2 },
  sling: { id: 'sling', path: 'images/wep_sling.png', gripX: 0.5, gripY: 0.86, headLocal: -Math.PI / 2, scale: 0.58, rest: -Math.PI / 2 },
  pipe: { id: 'pipe', path: 'images/mod_pipe.png', gripX: 0.16, gripY: 0.86, headLocal: -Math.PI / 3.4, scale: 0.7 },
  chainsaw: { id: 'chainsaw', path: 'images/mod_chainsaw.png', gripX: 0.8, gripY: 0.52, headLocal: Math.PI, scale: 0.66, rest: -0.12 },
  weight: { id: 'weight', path: 'images/mod_weight.png', gripX: 0.5, gripY: 0.16, headLocal: Math.PI / 2, scale: 0.52, rest: 0.22 },
  pot: { id: 'pot', path: 'images/mod_pot.png', gripX: 0.88, gripY: 0.7, headLocal: 2.72, scale: 0.62, rest: -0.28 },
  speaker: { id: 'speaker', path: 'images/mod_speaker.png', gripX: 0.5, gripY: 0.12, headLocal: 1.2, scale: 0.52, rest: -0.18 },
  blower: { id: 'blower', path: 'images/mod_blower.png', gripX: 0.5, gripY: 0.18, headLocal: Math.PI, scale: 0.56, rest: -0.08 },
  firecracker: { id: 'firecracker', path: 'images/mod_firecracker.png', gripX: 0.5, gripY: 0.5, headLocal: 2.45, scale: 0.5 },
  wire: { id: 'wire', path: 'images/mod_wire.png', gripX: 0.46, gripY: 0.4, headLocal: 0.55, scale: 0.5 },
};

/**
 * 每人三阶手上拿什么。长度必须是 3，且要和 villagers.evo[].pitch 对得上 ——
 * pitch 写「换成双股皮筋」而这里还是同一把弹弓，那进化就只是数字变大。
 *
 * 贴图不够用时允许复用（村里的家伙本来就是同一堆破烂里翻出来的），
 * 但**同一个人的三阶不许三张一样**，除非 pitch 里写的变化在身上其他位置。
 */
export const VILLAGER_HAND: Readonly<Record<string, readonly [string, string, string]>> = {
  guogai: ['pot', 'pipe', 'speaker'],
  yuwang: ['wire', 'weight', 'pipe'],
  laoyanqiang: ['sling', 'pipe', 'driver'],
  labaye: ['speaker', 'radio', 'blower'],
  tiezhu: ['wrench', 'pipe', 'pot'],
  shimo: ['weight', 'pipe', 'pot'],
  miankuzhang: ['pipe', 'weight', 'pot'],
  erjiu: ['driver', 'wrench', 'hammer'],
  chengtuo: ['weight', 'pipe', 'hammer'],
  dachui: ['hammer', 'weight', 'pipe'],
  dianju: ['cleaver', 'chainsaw', 'pipe'],
  shazhu: ['cleaver', 'pipe', 'pot'],
  gaoyaguo: ['pot', 'wrench', 'speaker'],
  gangban: ['wrench', 'wire', 'pot'],
  laoli: ['cleaver', 'pipe', 'weight'],
  bianpao: ['firecracker', 'speaker', 'pot'],
  qiangou: ['pipe', 'blower', 'weight'],
  jishi: ['blower', 'pot', 'speaker'],
  sanshen: ['radio', 'speaker', 'blower'],
  baowenhu: ['pot', 'speaker', 'pipe'],
};

/** 立绘那只出击拳，相对脚底。x 乘朝向，y 向上为负，单位是身体高度 */
export const HAND: Readonly<Record<string, { x: number; y: number }>> = {
  tiezhu: { x: 0.22, y: -0.38 },
  dachui: { x: 0.2, y: -0.52 },
  laoli: { x: 0.28, y: -0.38 },
  erjiu: { x: 0.18, y: -0.5 },
  sanshen: { x: 0.16, y: -0.52 },
  laoyanqiang: { x: 0.2, y: -0.5 },
};

/**
 * 这一阶身上穿 / 背 / 戴什么。手上那一件之外的第二条「进化看得见」的线。
 *
 * 一阶基本是空的、二阶多一件、三阶两件 —— 站在一排三个阶段的同一个人面前，
 * 轮廓必须一眼分出来。§4.1 把这条写成了硬约束，别为了省事让三阶共用一套。
 */
export interface EvoWear {
  head?: string;
  back?: string;
  body?: string;
}

/** 按门路给的兜底。新加村民没进 override 表时也有个像样的轮廓变化 */
const WEAR_BY_LANE: Readonly<Record<string, readonly [EvoWear, EvoWear, EvoWear]>> = {
  stand: [{}, { body: 'quilt' }, { body: 'steelplate', head: 'helmet' }],
  heavy: [{}, { head: 'helmet' }, { head: 'helmet', back: 'weight' }],
  rage: [{}, { back: 'pressurecooker' }, { back: 'pressurecooker', body: 'steelplate' }],
  reach: [{}, { head: 'helmet' }, { head: 'helmet', back: 'pot' }],
  band: [{}, { body: 'quilt' }, { body: 'quilt', back: 'speaker' }],
};

/** 逐人指定。写在这儿的都是 villagers.evo[].pitch 里点名了实物的 */
const WEAR_OVERRIDE: Readonly<Record<string, readonly [EvoWear, EvoWear, EvoWear]>> = {
  tiezhu: [{}, { body: 'steelplate', head: 'helmet' }, { head: 'pressurecooker', back: 'quilt', body: 'steelplate' }],
  gaoyaguo: [{ back: 'pressurecooker' }, { back: 'pressurecooker', head: 'helmet' }, { back: 'pressurecooker', body: 'steelplate', head: 'helmet' }],
  gangban: [{ body: 'steelplate' }, { body: 'steelplate', head: 'helmet' }, { body: 'steelplate', head: 'helmet', back: 'weight' }],
  guogai: [{ back: 'pot' }, { back: 'pot', head: 'helmet' }, { back: 'pot', body: 'steelplate', head: 'helmet' }],
  labaye: [{}, { back: 'speaker' }, { back: 'speaker', head: 'helmet' }],
  sanshen: [{}, { back: 'speaker' }, { back: 'speaker', body: 'quilt' }],
  yuwang: [{}, { body: 'weight' }, { back: 'wire', head: 'helmet' }],
  laoyanqiang: [{}, { body: 'steelplate' }, { back: 'slingshot', head: 'helmet' }],
  shimo: [{}, { body: 'weight' }, { back: 'weight', head: 'helmet' }],
  miankuzhang: [{}, { body: 'steelplate' }, { body: 'steelplate', back: 'quilt', head: 'helmet' }],
  erjiu: [{}, { head: 'helmet' }, { back: 'weight', head: 'helmet' }],
  chengtuo: [{}, { body: 'weight' }, { back: 'weight', head: 'helmet' }],
  dachui: [{}, { head: 'helmet' }, { back: 'weight', head: 'helmet' }],
  dianju: [{}, { head: 'helmet' }, { back: 'chainsaw', head: 'helmet' }],
  shazhu: [{}, { body: 'steelplate' }, { back: 'weight', head: 'helmet' }],
  laoli: [{}, { body: 'steelplate' }, { back: 'weight', head: 'helmet' }],
  bianpao: [{}, { body: 'firecracker' }, { back: 'firecracker', head: 'helmet' }],
  qiangou: [{}, { body: 'quilt' }, { back: 'dogleash', head: 'helmet' }],
  jishi: [{}, { body: 'chickenfeed' }, { back: 'chickenfeed', head: 'helmet' }],
  baowenhu: [{}, { back: 'thermos' }, { back: 'thermos', head: 'helmet' }],
};

export function wearOf(villagerId: string, lane: string, evoStage = 1): EvoWear {
  const row = WEAR_OVERRIDE[villagerId] ?? WEAR_BY_LANE[lane] ?? WEAR_BY_LANE.stand!;
  return row[Math.max(0, Math.min(2, Math.floor(evoStage) - 1))]!;
}

/** 这一阶手上拿的那一件 */
export function handIdOf(villagerId: string, evoStage = 1): string {
  const row = VILLAGER_HAND[villagerId];
  if (!row) return 'wrench';
  return row[Math.max(0, Math.min(2, Math.floor(evoStage) - 1))]!;
}

export function resolveHandGear(villagerId: string, evoStage = 1): HandGear {
  return HAND_GEAR[handIdOf(villagerId, evoStage)] ?? HAND_GEAR.wrench!;
}

export const STARTER_WEP_IDS = ['wrench', 'cleaver', 'driver', 'radio', 'sling'] as const;
