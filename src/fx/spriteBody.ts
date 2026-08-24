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
  tiezhu: { idle: 309, atk: 138 },
  laoli: { idle: 1230, atk: 99 },
  erjiu: { idle: 490, atk: 105 },
  sanshen: { idle: 490, atk: 119 },
  laoyanqiang: { idle: 488, atk: 86 },
  grey: { idle: 309, atk: 151, walk: 157 },
  cube: { idle: 314, atk: 112, walk: 160 },
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
