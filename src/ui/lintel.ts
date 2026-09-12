/**
 * 村子门楣只给主界面、图鉴、详情用：大牌 + 经验槽 + 四枚资源章。
 * 编队 / 战斗 / 弹弓摊另用切下来的上半块锈铁，不要把经验条和四格硬塞进去。
 * 摊顶走 stallHudLay：同一张底板，门楣更矮；三枚小口袋叠在板上，不抬高度。
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
 * 编队 / 战斗顶板。底只铺切下来的上半块锈铁，
 * 上场 / 来 / 波 等字和锈章是另出的图，叠在板上，不烤进底板。
 *
 * 切图是 1280×398，750 宽时约 233 高；为了塞下三枚章会略往下拉。
 */
export interface BattleHudLay {
  titleH: number;
  title: { cx: number; cy: number };
  titleGlyphH: number;
  hintY: number;
  stamp: { y: number; w: number; h: number; cxs: readonly number[] };
  barBottom: number;
}

export function battleHudLay(safeTop: number, height: number): BattleHudLay {
  const safe = Math.max(safeTop, 16);
  let titleH = Math.round(750 * 398 / 1280);
  if (titleH < safe + 200) titleH = Math.min(Math.round(height * 0.24), safe + 220);
  if (titleH > height * 0.24) titleH = Math.round(height * 0.24);
  const titleGlyphH = Math.max(32, Math.round(titleH * 0.16));
  let titleCy = titleH * 0.24;
  if (titleCy - titleGlyphH / 2 < safe + 4) {
    titleCy = safe + 4 + titleGlyphH / 2;
  }
  const hintY = titleH - 16;
  const stampH = Math.round(titleH * 0.30);
  const stampY = hintY - 12 - stampH / 2;
  return {
    titleH,
    title: { cx: 375, cy: titleCy },
    titleGlyphH,
    hintY,
    stamp: {
      y: stampY,
      w: 200,
      h: stampH,
      cxs: [155, 375, 595],
    },
    barBottom: titleH,
  };
}

/**
 * 弹弓摊顶板。底图跟战斗同一张切下来的锈铁，字另叠。
 * 弹子对准底牌本身的上下中线（板顶到口袋上沿），别按胶囊下沿把字往下推。
 * 口袋钉在锈铁下沿。750 宽时按原图比例大约 233 高。
 */
export interface StallHudLay {
  titleH: number;
  title: { cx: number; cy: number };
  titleGlyphH: number;
  hintY: number;
  pocket: { y: number; w: number; h: number; cxs: readonly [number, number, number] };
  barBottom: number;
}

export function stallHudLay(safeTop: number, height: number): StallHudLay {
  const safe = Math.max(safeTop, 16);
  let titleH = Math.round(750 * 398 / 1280);
  if (titleH < safe + 96) titleH = Math.min(Math.round(height * 0.18), safe + 140);
  if (titleH > height * 0.2) titleH = Math.round(height * 0.2);

  const padB = 12;
  const pocketH = 44;
  const pocketY = titleH - padB - pocketH / 2;
  const pocketTop = pocketY - pocketH / 2;
  const titleGlyphH = Math.max(36, Math.round(titleH * 0.22));
  const hintH = 22;
  const gap1 = 6;
  const plateTop = titleH * 0.10;
  let titleCy = (plateTop + pocketTop) / 2;
  const ceil = pocketTop - hintH - gap1 - 8 - titleGlyphH / 2;
  const floor = titleGlyphH / 2 + 8;
  titleCy = Math.max(floor, Math.min(titleCy, ceil));
  const hintY = titleCy + titleGlyphH / 2 + gap1 + hintH / 2;

  return {
    titleH,
    title: { cx: 375, cy: titleCy },
    titleGlyphH,
    hintY,
    pocket: {
      y: pocketY,
      w: 156,
      h: pocketH,
      cxs: [145, 375, 605],
    },
    barBottom: titleH,
  };
}
