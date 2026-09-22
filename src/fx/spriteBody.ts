/**
 * 身体高度（像素），不含举过头顶的武器。
 *
 * 业界（Hades / Dead Cells / srpg-rosa）按身体定高，道具可以溢出。
 * 若按整张包围盒去 fit，锤子一举高，身子就被一起缩小。
 *
 * 每个动作只用一档：取该动作里「最不像道具」的那帧（攻击取最小），
 * 同一拍里换帧不再改缩放，人不会一抡就瘪。
 */
import { portraitFit } from '@/fx/portraitFit';

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
  grey: { idle: 343, atk: 279, walk: 303 },
  grunt: { idle: 343, atk: 279, walk: 303 },
  rusher: { idle: 380, atk: 296, walk: 305 },
  cube: { idle: 329, atk: 248, walk: 256 },
  armor: { idle: 376, atk: 280, walk: 348 },
  canister: { idle: 409, atk: 212, walk: 341 },
  saucer: { idle: 301, atk: 230, walk: 235 },
  lamp: { idle: 333, atk: 305, walk: 312 },
  mast: { idle: 321, atk: 302, walk: 348 },
  pier: { idle: 270, atk: 268, walk: 258 },
  drill: { idle: 337, atk: 264, walk: 304 },
  wire: { idle: 315, atk: 287, walk: 346 },
  keg: { idle: 321, atk: 284, walk: 290 },
  spring: { idle: 318, atk: 221, walk: 295 },
  hatch: { idle: 320, atk: 306, walk: 348 },
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
 * 切片帧可以比整张矮。立绘不行：铁柱场上拿的是 652 高的 evo，
 * 表还写着 309，人会被放大一倍。
 */
/**
 * 局内站姿怎么画。
 *
 * 三阶立绘已经把安全帽、锤子画进一张图里，不再叠道具图标。
 * 有立绘就用立绘，攻击有切片再切切片。
 */
export function heroBattleLook(hasPortrait: boolean, idleFrames: number, atkFrames: number): {
  idle: 'portrait' | 'sheet' | 'still';
  atkSheet: boolean;
} {
  if (hasPortrait) {
    return { idle: 'portrait', atkSheet: atkFrames >= 2 };
  }
  if (idleFrames >= 2) {
    return { idle: 'sheet', atkSheet: atkFrames >= 2 };
  }
  return { idle: 'still', atkSheet: false };
}

export function fitBodyH(clipH: number, texH: number, spriteSheet: boolean): number {
  const tex = Math.max(1, texH);
  const clip = Math.max(1, clipH);
  if (spriteSheet) return Math.min(clip, tex);
  if (clip > tex * 1.15 || clip < tex * 0.7) return tex;
  return Math.min(clip, tex);
}

/**
 * 手里这张图该按哪段身体定高。
 *
 * 站姿立绘必须走 PORTRAIT_BODY：有攻击切片时 _spriteSheet 也是 true，
 * 若仍用 CLIP_BODY 套高清立绘，弹弓叔 / 大锤会被放大两三倍。
 * 切片帧才用 CLIP_BODY。
 */
export function battleBodyH(args: {
  id: string;
  evo: number;
  clip: 'idle' | 'walk' | 'atk';
  texH: number;
  portrait: boolean;
  sheet: boolean;
}): number {
  if (args.portrait) return portraitFit(args.id, args.evo, args.texH).bodyH;
  return fitBodyH(clipBody(args.id, args.clip, args.texH), args.texH, args.sheet);
}
