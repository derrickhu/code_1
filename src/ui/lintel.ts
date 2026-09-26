/**
 * 村子门楣只给主界面、图鉴、详情用：大牌 + 经验槽 + 四枚资源章。
 * 底板 top_lintel 是纯锈板（大牌 + 四格），经验槽是独立的 rust_exp，金条铺在槽图里。
 * 编队 / 战斗 / 弹弓摊另用切下来的上半块锈铁，不要把经验条和四格硬塞进去。
 * 摊顶走 stallHudLay：同一张底板，门楣更矮；三枚小口袋叠在板上，不抬高度。
 */
export interface LintelLay {
  titleH: number;
  title: { cx: number; cy: number; w: number; h: number };
  titleGlyphH: number;
  /** rust_exp 整张槽的外框，随 titleH 走 */
  exp: { x: number; y: number; w: number; h: number };
  hintY: number;
  stamp: { y: number; w: number; h: number; cxs: readonly number[] };
  barBottom: number;
}

export const LINTEL_ART = { w: 1280, h: 720 } as const;

/** rust_exp.png 原图像素。内凹是量过的，不是左右对折 */
export const RUST_EXP_ART = { w: 348, h: 84 } as const;

/**
 * 槽图里那块凹下去的板。标定：左 34 顶 22 右 340 底 56。
 * 底停在内凹亮边（原图 y≈58）之上，避免铜浆盖住下沿。顶沿不动。
 */
export const RUST_EXP_WELL = {
  x0: 34 / RUST_EXP_ART.w,
  y0: 22 / RUST_EXP_ART.h,
  x1: 340 / RUST_EXP_ART.w,
  y1: 56 / RUST_EXP_ART.h,
} as const;

export function rustExpFillRect(slot: { x: number; y: number; w: number; h: number }): {
  x: number; y: number; w: number; h: number;
} {
  const x = Math.round(slot.x + slot.w * RUST_EXP_WELL.x0);
  const y = Math.round(slot.y + slot.h * RUST_EXP_WELL.y0);
  const r = Math.round(slot.x + slot.w * RUST_EXP_WELL.x1);
  const b = Math.round(slot.y + slot.h * RUST_EXP_WELL.y1);
  const insetTop = 1;
  const insetBot = 2;
  return {
    x: x + 1,
    y: y + insetTop,
    w: Math.max(1, r - x - 2),
    h: Math.max(2, b - y - insetTop - insetBot),
  };
}

/** 大牌和四格章中间那条带。顶沿不动，只把底往上收，躲开下面那道边 */
export function lintelExpRect(titleH: number, destW = 750): {
  x: number; y: number; w: number; h: number;
} {
  const w = Math.round(destW * 0.70);
  const h = Math.max(24, Math.round(titleH * 0.068));
  return {
    x: Math.round((destW - w) / 2),
    y: Math.round(titleH * 0.445),
    w,
    h,
  };
}

export function lintelLay(safeTop: number, height: number): LintelLay {
  const safe = Math.max(safeTop, 16);
  let titleH = Math.round(750 * LINTEL_ART.h / LINTEL_ART.w);
  if (titleH > height * 0.32) titleH = Math.round(height * 0.32);
  if (titleH < safe + 200) titleH = Math.min(Math.round(height * 0.34), safe + 240);
  const exp = lintelExpRect(titleH);
  const plateTop = titleH * 0.08;
  const plateBot = exp.y - 8;
  let glyphH = Math.max(44, Math.round(titleH * 0.15));
  let titleCy = (plateTop + plateBot) / 2;
  if (titleCy + glyphH / 2 > plateBot) {
    titleCy = plateBot - glyphH / 2;
  }
  if (titleCy - glyphH / 2 < 8) {
    glyphH = Math.max(32, (titleCy - 8) * 2);
  }
  const titleBottom = titleCy + glyphH / 2;
  let hintY = titleBottom + 6;
  if (hintY + 16 > exp.y - 4) hintY = Math.max(titleBottom + 2, exp.y - 20);
  return {
    titleH,
    title: { cx: 375, cy: titleCy, w: 750, h: titleH },
    titleGlyphH: glyphH,
    exp,
    hintY,
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
 * 切图是 1280×398，750 宽时约 233 高。高度按内容往下排：
 * 关卡名抬到胶囊那一行（左是「撤」，右是系统胶囊），章贴在名字下面。
 * 不再按屏幕 24% 把整块板拉高 —— 那样章钉在底上，顶上会空出一大截锈。
 */
export interface BattleHudLay {
  titleH: number;
  title: { cx: number; cy: number };
  titleGlyphH: number;
  hintY: number;
  stamp: { y: number; w: number; h: number; cxs: readonly number[] };
  barBottom: number;
}

export function battleHudLay(safeTop: number, height: number, headerCenter = 0): BattleHudLay {
  const safe = Math.max(safeTop, 16);
  const titleGlyphH = 40;
  // 有胶囊中线时，名字坐进那一行的下半截，吃掉顶上的空锈。
  // 没有时贴着安全区，避免字钻进刘海。
  const lifted = headerCenter > 0 ? headerCenter + 6 : safe + 2;
  const titleTop = Math.min(lifted, safe + 2);
  const titleCy = titleTop + titleGlyphH / 2;
  const stampH = 72;
  const stampY = titleCy + titleGlyphH / 2 + 6 + stampH / 2;
  const hintY = stampY + stampH / 2 + 11;
  let titleH = Math.round(hintY + 16);
  const artH = Math.round(750 * 398 / 1280);
  // 比切图再矮，铆钉会被压扁。多出来的高度留在板底，字和章不再往下掉。
  if (titleH < artH) titleH = artH;
  const cap = Math.round(height * 0.2);
  if (titleH > cap && cap > hintY) titleH = cap;
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
