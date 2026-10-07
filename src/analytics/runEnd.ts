/**
 * 结算上报用哪条标准事件。
 * 战斗传的是 `won`，以前只认 `cleared`，赢了也会记成失败。
 */
export function runEndForward(payload: Record<string, unknown>): { won: boolean; reason: string } {
  const won = payload.won === true || payload.cleared === true;
  const lose = payload.lose_reason;
  const reason = won ? 'clear' : (typeof lose === 'string' && lose ? lose : 'defeat');
  return { won, reason };
}

/** 标准时长字段。战斗记在 play_ms，没填 duration_ms 时用它 */
export function runEndDurationMs(payload: Record<string, unknown>): number {
  const raw = Number(payload.duration_ms) || Number(payload.play_ms) || 0;
  return Math.max(0, Math.floor(raw));
}
