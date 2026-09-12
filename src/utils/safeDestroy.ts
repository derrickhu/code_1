/**
 * PIXI Graphics.destroy 会先把 _geometry 置空，再标 destroyed。
 * 二次调用读 null.refCount，微信小游戏直接 MiniProgramError。
 */
export function safeDestroy(obj: { destroyed?: boolean } | null | undefined, options?: unknown): void {
  if (!obj || obj.destroyed) return;
  const destroy = (obj as { destroy?: (opts?: unknown) => void }).destroy;
  if (typeof destroy !== 'function') return;
  try {
    destroy.call(obj, options);
  } catch {
    /* 已经拆过，或父节点带 children 拆过 */
  }
}
