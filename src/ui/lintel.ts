/**
 * 村子门楣只给主界面用：大牌 + 经验槽 + 四枚资源章。
 * 编队 / 战斗另用切下来的上半块锈铁（battleHudLay），不要把经验条和四格硬塞进去。
 */
export interface LintelLay {
  titleH: number;
  title: { cx: number; cy: number; w: number; h: number };
  titleGlyphH: number;
  /** 中间凹槽中线，经验条 / 门路字落在这儿 */
  exp: { x: number; y: number; w: number };
  hintY: number;
  stamp: { y: number; w: number; h: number; cxs: readonly number[] };
  barBottom: number;
}

export function lintelLay(safeTop: number, height: number): LintelLay {
  const safe = Math.max(safeTop, 16);
  let titleH = Math.round(750 * 9 / 16);
  if (titleH > height * 0.32) titleH = Math.round(height * 0.32);
  if (titleH < safe + 200) titleH = Math.min(Math.round(height * 0.34), safe + 240);
  const slotTop = titleH * 0.35;
  const slotMid = titleH * 0.405;
  const plateTop = titleH * 0.10;
  let glyphH = Math.max(44, Math.round(titleH * 0.15));
  let titleCy = (plateTop + slotTop) / 2 + 12;
  if (titleCy + glyphH / 2 > slotTop - 10) {
    titleCy = slotTop - 10 - glyphH / 2;
  }
  if (titleCy - glyphH / 2 < 8) {
    glyphH = Math.max(32, (titleCy - 8) * 2);
  }
  return {
    titleH,
    title: { cx: 375, cy: titleCy, w: 750, h: titleH },
    titleGlyphH: glyphH,
    exp: { x: 78, y: slotMid, w: 594 },
    hintY: slotTop + titleH * 0.12,
    stamp: {
      y: titleH * 0.71,
      w: 750 * 0.20,
      h: titleH * 0.20,
      cxs: [750 * 0.141, 750 * 0.379, 750 * 0.615, 750 * 0.854],
    },
    barBottom: titleH,
  };
}

/**
 * 编队 / 战斗顶板。只用切下来的上半块锈铁，按原图比例铺满顶，
 * 不再带经验槽和四枚章。
 *
 * 切图是 1280×398，750 宽时约 233 高。
 */
export interface BattleHudLay {
  titleH: number;
  title: { cx: number; cy: number };
  titleGlyphH: number;
  infoY: number;
  hintY: number;
  barBottom: number;
}

export function battleHudLay(safeTop: number, height: number): BattleHudLay {
  const safe = Math.max(safeTop, 16);
  let titleH = Math.round(750 * 398 / 1280);
  if (titleH < safe + 140) titleH = Math.min(Math.round(height * 0.22), safe + 176);
  if (titleH > height * 0.22) titleH = Math.round(height * 0.22);
  const titleGlyphH = Math.max(34, Math.round(titleH * 0.26));
  let titleCy = titleH * 0.38;
  if (titleCy - titleGlyphH / 2 < safe + 4) {
    titleCy = safe + 4 + titleGlyphH / 2;
  }
  const infoY = titleCy + titleGlyphH * 0.58;
  const hintY = Math.min(titleH - 20, infoY + 26);
  return {
    titleH,
    title: { cx: 375, cy: titleCy },
    titleGlyphH,
    infoY,
    hintY,
    barBottom: titleH,
  };
}
