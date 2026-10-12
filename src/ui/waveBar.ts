import type { BattleState } from '@/game/BattleEngine';

export interface WaveBarView {
  /** 已经出场的占全关几成 */
  frac: number;
  /** 一大波那一波第一只在条上的位置；走过了就亮 */
  flags: { at: number; reached: boolean }[];
}

/**
 * 出怪进度条，植物大战僵尸那根：按出场只数走，一大波插旗。
 * 按只数不按时间 —— 打残了下一波会提前来，按时间算旗子会往回跳。
 */
export function waveBarView(s: BattleState): WaveBarView {
  const n = s.schedule.length;
  if (n === 0) return { frac: 0, flags: [] };
  const flags: WaveBarView['flags'] = [];
  s.stage.waves.forEach((w, i) => {
    if (!w.surge) return;
    const idx = s.schedule.findIndex((x) => x.wave === i + 1);
    if (idx < 0) return;
    flags.push({ at: idx / n, reached: s.spawnIdx > idx });
  });
  return { frac: Math.min(1, s.spawnIdx / n), flags };
}
