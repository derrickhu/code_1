/**
 * 身体高度（像素），不含举过头顶的武器。
 *
 * 业界（Hades / Dead Cells / srpg-rosa）按身体定高，道具可以溢出。
 * 若按整张包围盒去 fit，锤子一举高，身子就被一起缩小。
 *
 * 每个动作只用一档：取该动作里「最不像道具」的那帧（攻击取最小），
 * 同一拍里换帧不再改缩放，人不会一抡就瘪。
 */
export const CLIP_BODY: Record<string, { idle: number; atk: number; walk?: number }> = {
  dachui: { idle: 318, atk: 97 },
  tiezhu: { idle: 503, atk: 138 },
  laoli: { idle: 1230, atk: 99 },
  erjiu: { idle: 490, atk: 105 },
  sanshen: { idle: 490, atk: 119 },
  laoyanqiang: { idle: 369, atk: 372 },
  guogai: { idle: 276, atk: 276 },
  yuwang: { idle: 285, atk: 285 },
  labaye: { idle: 328, atk: 328 },
  shimo: { idle: 307, atk: 307 },
  miankuzhang: { idle: 333, atk: 333 },
  chengtuo: { idle: 314, atk: 314 },
  dianju: { idle: 314, atk: 314 },
  shazhu: { idle: 315, atk: 315 },
  gaoyaguo: { idle: 319, atk: 319 },
  gangban: { idle: 339, atk: 339 },
  bianpao: { idle: 310, atk: 310 },
  qiangou: { idle: 305, atk: 305 },
  jishi: { idle: 301, atk: 301 },
  baowenhu: { idle: 335, atk: 335 },
  grey: { idle: 309, atk: 151, walk: 157 },
  grunt: { idle: 309, atk: 151, walk: 157 },
  rusher: { idle: 309, atk: 151, walk: 157 },
  cube: { idle: 314, atk: 112, walk: 160 },
  armor: { idle: 296, atk: 142, walk: 152 },
  canister: { idle: 296, atk: 142, walk: 152 },
  saucer: { idle: 310, atk: 83, walk: 156 },
};

export function clipBody(id: string, clip: 'idle' | 'walk' | 'atk', texH: number): number {
  const m = CLIP_BODY[id];
  if (!m) return Math.max(1, texH);
  if (clip === 'atk') return m.atk;
  if (clip === 'walk') return m.walk ?? m.idle;
  return m.idle;
}

/**
 * 把「表里的身体像素」对上「手里这张图」。
 *
 * 切片帧可以比整张矮（武器溢出）。立绘 / 握点不行：铁柱没有 grip，
 * 场上拿的是 652 高的 evo，表还写着 309，人会被放大一倍。
 */
export function fitBodyH(clipH: number, texH: number, spriteSheet: boolean): number {
  const tex = Math.max(1, texH);
  const clip = Math.max(1, clipH);
  if (spriteSheet) return Math.min(clip, tex);
  if (clip > tex * 1.15 || clip < tex * 0.7) return tex;
  return Math.min(clip, tex);
}
