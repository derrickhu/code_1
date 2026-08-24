/**
 * 装备挂点。身体和家伙分层，才能换武器。
 *
 * 柄在拳里，头朝外。贴图里柄在哪、头朝哪，这里必须对上，否则锅会拿反。
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

/** 改装件里哪些是手上换的家伙，哪些是穿/背的 */
export const MOD_SLOT: Readonly<Record<string, GearSlot>> = {
  pipe: 'hand',
  chainsaw: 'hand',
  weight: 'hand',
  pot: 'hand',
  speaker: 'hand',
  blower: 'hand',
  firecracker: 'hand',
  wire: 'hand',
  helmet: 'head',
  quilt: 'body',
  steelplate: 'body',
  pressurecooker: 'back',
};

export const STARTER_HAND: Readonly<Record<string, string>> = {
  tiezhu: 'wrench',
  dachui: 'hammer',
  laoli: 'cleaver',
  erjiu: 'driver',
  sanshen: 'radio',
  laoyanqiang: 'sling',
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

export function isHandMod(modId: string): boolean {
  return MOD_SLOT[modId] === 'hand';
}

export function wornModIds(modIds: readonly string[], slot: GearSlot): string[] {
  return modIds.filter((id) => MOD_SLOT[id] === slot);
}

/** 手上这一件：后装的手持破烂盖过起手家伙 */
export function resolveHandGear(heroId: string, modIds: readonly string[]): HandGear {
  for (let i = modIds.length - 1; i >= 0; i -= 1) {
    const id = modIds[i];
    if (id && isHandMod(id) && HAND_GEAR[id]) return HAND_GEAR[id];
  }
  const starter = STARTER_HAND[heroId] ?? 'wrench';
  return HAND_GEAR[starter] ?? HAND_GEAR.wrench!;
}

export const STARTER_WEP_IDS = ['wrench', 'cleaver', 'driver', 'radio', 'sling'] as const;
