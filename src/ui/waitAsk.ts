/**
 * 乡亲里点一个还没来的人，先看他，再决定等不等。
 * 按钮说要做的那件事。概率不写进这句。
 */
export function waitAskLabel(pinnedId: string, id: string): string {
  if (pinnedId && pinnedId === id) return '不等了';
  if (pinnedId) return '改等他';
  return '就等他';
}
