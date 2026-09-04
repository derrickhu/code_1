/**
 * 落点序列帧表。黑底加法叠，切片在 TextureLoader，这里只定格数 / 帧率 / 寿命。
 */
export interface FlipSpec {
  file: string;
  cols: number;
  rows: number;
  fps: number;
}

/** 落点核才走序列。flash / ring / streak 仍是单帧。 */
export const VFX_FLIP: Readonly<Record<string, FlipSpec>> = {
  slash: { file: 'fb_slash', cols: 4, rows: 2, fps: 22 },
  poke: { file: 'fb_slash', cols: 4, rows: 2, fps: 24 },
  smash: { file: 'fb_smash', cols: 4, rows: 2, fps: 20 },
  blast: { file: 'fb_blast', cols: 4, rows: 2, fps: 22 },
  fire: { file: 'fb_blast', cols: 4, rows: 2, fps: 22 },
  bolt: { file: 'fb_bolt', cols: 4, rows: 2, fps: 24 },
  pierce: { file: 'fb_bolt', cols: 4, rows: 2, fps: 24 },
};

export const SPARK_FLIP: FlipSpec = { file: 'fb_spark', cols: 2, rows: 2, fps: 1 };

export function vfxHasFlip(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(VFX_FLIP, name);
}

export function flipFrameIndex(elapsed: number, fps: number, count: number): number {
  if (count <= 1) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor(elapsed * fps)));
}

/** 播完最后一帧再留一丁点，避免切到最后一格就灭 */
export function flipLife(count: number, fps: number): number {
  return Math.max(0.18, (count - 0.25) / Math.max(1, fps));
}

export function flipFiles(): string[] {
  const files = new Set<string>([`images/vfx_${SPARK_FLIP.file}.png`]);
  for (const spec of Object.values(VFX_FLIP)) {
    files.add(`images/vfx_${spec.file}.png`);
  }
  return [...files];
}
