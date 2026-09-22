/**
 * 手上拿什么只决定打击特效皮（FxRecipe.SKIN），不再往人身上叠贴图。
 *
 * 三阶立绘已经把帽子、家伙画进一张图里。进化看得见靠 evo 立绘，
 * 出手长什么样还是跟这一阶的家伙 id 走。
 */

export const HAND_SKINS = [
  'wrench',
  'hammer',
  'cleaver',
  'driver',
  'radio',
  'sling',
  'pipe',
  'chainsaw',
  'weight',
  'pot',
  'speaker',
  'blower',
  'firecracker',
  'wire',
] as const;

export type HandSkin = (typeof HAND_SKINS)[number];

/**
 * 每人三阶手上拿什么。长度必须是 3，且要和 villagers.evo[].pitch 对得上 ——
 * pitch 写「换成双股皮筋」而这里还是同一把弹弓，那进化就只是数字变大。
 */
export const VILLAGER_HAND: Readonly<Record<string, readonly [HandSkin, HandSkin, HandSkin]>> = {
  guogai: ['pot', 'pipe', 'speaker'],
  yuwang: ['wire', 'weight', 'pipe'],
  laoyanqiang: ['sling', 'sling', 'sling'],
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

/** 这一阶手上拿的那一件（只用来取特效皮，不叠图） */
export function handIdOf(villagerId: string, evoStage = 1): HandSkin {
  const row = VILLAGER_HAND[villagerId];
  if (!row) return 'wrench';
  return row[Math.max(0, Math.min(2, Math.floor(evoStage) - 1))]!;
}
