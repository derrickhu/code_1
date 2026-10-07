/**
 * 详情页按 v6：人卡 + 养成卡 + 黄按钮。
 * 星、手艺各压一根出图横条，下手抗造够得着出手仍在 rust_panel 上。
 * 星星和条只用贴图，不手绘。
 */
import * as PIXI from 'pixi.js';
import type { FolkSheet, FolkStatRow } from '@/balance/folkSheet';
import { STAR_MAX } from '@/balance/villagers';
import { uiTex, type UiName } from '@/core/TextureLoader';
import { GOLD, fillSprite, fitSprite, painted } from '@/ui/paint';

const CREAM = 0xfff4c4;
const UP = 0x9be08a;

const STAR_ROW = 44;
const CRAFT_ROW = 42;
/** 横条两端是铆钉轮廓，字必须让进槽里，不能贴边 */
const RAIL_PAD = 72;
const ROW_H = 26;
const STAT_COUNT = 4;
const INNER_X = 16;
const INNER_Y = 14;
const STAR_SIZE = 22;
const STAR_GAP = 4;
const BAR_H = 16;
const FILL_INSET_X = 0.09;
const FILL_INSET_Y = 0.32;
/** 够得着三个字，数值必须让开；升完预览也要落在条子前面 */
const STAT_LABEL_W = 92;
const STAT_VAL_W = 118;

export function folkSheetContentH(): number {
  return STAR_ROW + CRAFT_ROW + ROW_H * STAT_COUNT;
}

export interface OneFolkLay {
  plateW: number;
  plateCx: number;
  heroTop: number;
  heroH: number;
  heroCx: number;
  heroW: number;
  growTop: number;
  growH: number;
  btnY: number;
  btnH: number;
  btnW: number;
  btnCx: number;
  backCx: number;
  backW: number;
  /** 养成卡和按钮之间的材料条。没有下一档时高度为 0 */
  costTop: number;
  costH: number;
  costX: number;
  costW: number;
}

/**
 * 门楣之下：人、养成、底栏。
 * 底栏跟喇叭页同一套：左边窄返回，右边宽黄按钮，同一排。
 * 人卡封顶后多出来的空档全给养成卡。
 */
export function oneFolkLay(top: number, viewH: number, safeBottom: number, costH = 0): OneFolkLay {
  const plateW = 690;
  const plateCx = 375;
  const btnH = costH > 0 ? 96 : 112;
  const gap = 12;
  const dockGap = 12;
  const backW = 176;
  const btnW = plateW - dockGap - backW;
  const side = (750 - plateW) / 2;
  const btnY = viewH - safeBottom - 16 - btnH / 2;
  const backCx = side + backW / 2;
  const btnCx = side + backW + dockGap + btnW / 2;
  const heroTop = top + 10;
  const minGrow = folkSheetContentH() + INNER_Y * 2;
  const costGap = costH > 0 ? 8 : 0;
  const floor = btnY - btnH / 2 - gap - costGap - costH;
  const avail = Math.max(minGrow + 176, floor - heroTop - gap);
  let heroH = Math.min(360, Math.max(176, avail - minGrow));
  let growH = avail - heroH;
  if (growH < minGrow) {
    growH = minGrow;
    heroH = Math.max(176, avail - growH);
  }
  const growTop = heroTop + heroH + gap;
  return {
    plateW, plateCx,
    heroTop, heroH, heroCx: plateCx, heroW: plateW,
    growTop, growH,
    btnY, btnH, btnW, btnCx, backCx, backW,
    costTop: costH > 0 ? floor + gap : 0,
    costH,
    costX: side,
    costW: plateW,
  };
}

/**
 * 升级材料。两块方铁牌并排，不是横条。
 * 够了底下写手上有多少；不够就盖一枚章，写还差多少。
 */
export function paintCraftBill(
  parent: PIXI.Container,
  plates: readonly {
    name: string;
    icon: UiName;
    need: string;
    have: string;
    short: string;
  }[],
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (plates.length === 0 || h <= 0 || w <= 0) return;
  const gap = 16;
  const plateW = (w - gap * (plates.length - 1)) / plates.length;
  plates.forEach((plate, i) => {
    const cx = x + plateW / 2 + i * (plateW + gap);
    const cy = y + h / 2;
    fillSprite(parent, uiTex('rust_badge'), cx, cy, plateW, h);

    const icon = plate.icon === 'icon_scrap' ? (uiTex('icon_scrap') ?? uiTex('scrap_pile')) : uiTex(plate.icon);
    fitSprite(parent, icon, cx, cy - h * 0.32, 48, 48);

    const name = painted(22, GOLD, '#1a1008', 3);
    name.anchor.set(0.5);
    name.position.set(cx, cy - h * 0.14);
    name.text = plate.name;
    parent.addChild(name);

    const word = painted(20, CREAM, '#1a1008', 3);
    word.anchor.set(0, 0.5);
    word.text = '要';
    const num = painted(36, CREAM, '#1a1008', 4);
    num.anchor.set(0, 0.5);
    num.text = plate.need;
    const pair = word.width + 8 + num.width;
    const left = cx - pair / 2;
    word.position.set(left, cy + h * 0.02);
    num.position.set(left + word.width + 8, cy + h * 0.02);
    parent.addChild(word);
    parent.addChild(num);

    if (plate.short) {
      const stamp = new PIXI.Container();
      stamp.eventMode = 'none';
      stamp.position.set(cx, cy + h * 0.34);
      stamp.rotation = -0.06;
      parent.addChild(stamp);
      fillSprite(stamp, uiTex('settle_stamp'), 0, 0, Math.min(plateW * 0.72, 210), 58);
      const lack = painted(22, 0x6e2218, '#f3e2c2', 3);
      lack.anchor.set(0.5);
      lack.text = `还差 ${plate.short}`;
      stamp.addChild(lack);
      return;
    }
    const have = painted(20, UP, '#1a1008', 3);
    have.anchor.set(0.5);
    have.position.set(cx, cy + h * 0.32);
    have.text = `手上 ${plate.have}`;
    parent.addChild(have);
  });
}

export function paintGrowCard(
  parent: PIXI.Container,
  opts: {
    stars: number;
    starMax?: number;
    craft: number;
    cap: number;
    max: number;
    sheet: FolkSheet;
  },
  cx: number,
  top: number,
  width: number,
  height: number,
): void {
  fillSprite(parent, uiTex('rust_panel'), cx, top + height / 2, width, height);
  const x = cx - width / 2 + INNER_X;
  const w = width - INNER_X * 2;
  const { starH, craftH, statH, padY } = growRowHs(height);
  let y = top + padY;
  paintStarRow(parent, opts.stars, opts.starMax ?? STAR_MAX, x, y, w, starH);
  y += starH;
  paintCraftRow(parent, opts, x, y, w, craftH);
  y += craftH;
  opts.sheet.stats.forEach((row, i) => {
    paintStatRow(parent, row, x, y + i * statH, w, statH);
  });
}

function growRowHs(height: number): {
  starH: number;
  craftH: number;
  statH: number;
  padY: number;
} {
  const minInner = folkSheetContentH();
  const padY = Math.max(INNER_Y, Math.round((height - minInner) * 0.12));
  const extra = Math.max(0, height - padY * 2 - minInner);
  return {
    starH: STAR_ROW + extra * 0.16,
    craftH: CRAFT_ROW + extra * 0.14,
    statH: ROW_H + extra * 0.175,
    padY,
  };
}

function paintRowRail(
  parent: PIXI.Container,
  name: UiName,
  x: number,
  y: number,
  w: number,
  rowH: number,
): number {
  const cy = y + rowH / 2;
  const railH = Math.max(32, rowH - 6);
  fillSprite(parent, uiTex(name), x + w / 2, cy, w, railH);
  return cy;
}

function paintStarRow(
  parent: PIXI.Container,
  stars: number,
  max: number,
  x: number,
  y: number,
  w: number,
  rowH = STAR_ROW,
): void {
  const n = Math.max(0, Math.min(max, Math.floor(stars)));
  const cy = paintRowRail(parent, 'star_rail', x, y, w, rowH);
  const tag = painted(Math.round(Math.min(26, 18 + rowH * 0.12)), GOLD, '#1a1008', 3);
  tag.anchor.set(0, 0.5);
  tag.position.set(x + RAIL_PAD, cy);
  tag.text = `星级 ${n}/${max}`;
  parent.addChild(tag);

  const size = Math.min(36, Math.max(STAR_SIZE, rowH - 16));
  const gap = Math.max(4, Math.round(size * 0.18));
  const rowLeft = tag.x + tag.width + 20;
  for (let i = 0; i < max; i += 1) {
    const art: UiName = i < n ? 'star_on' : 'star_off';
    fitSprite(
      parent,
      uiTex(art),
      rowLeft + i * (size + gap) + size / 2,
      cy,
      size,
      size,
    );
  }
}

function paintCraftRow(
  parent: PIXI.Container,
  opts: { craft: number; cap: number; max: number },
  x: number,
  y: number,
  w: number,
  rowH = CRAFT_ROW,
): void {
  const cy = paintRowRail(parent, 'craft_rail', x, y, w, rowH);
  const size = Math.round(Math.min(26, 18 + rowH * 0.12));
  const title = painted(size, GOLD, '#1a1008', 3);
  title.anchor.set(0, 0.5);
  title.position.set(x + RAIL_PAD, cy);
  title.text = `手艺  Lv.${opts.craft}`;
  parent.addChild(title);

  const cap = painted(size, CREAM, '#1a1008', 3);
  cap.anchor.set(0, 0.5);
  cap.position.set(title.x + title.width + 28, cy);
  cap.text = `上限 ${opts.cap}/${opts.max}`;
  parent.addChild(cap);
}

export function paintFolkStats(
  parent: PIXI.Container,
  sheet: FolkSheet,
  left: number,
  top: number,
  width: number,
): number {
  sheet.stats.forEach((row, i) => {
    paintStatRow(parent, row, left, top + i * ROW_H, width, ROW_H - 4);
  });
  return ROW_H * sheet.stats.length;
}

function growBarX(x: number): number {
  return x + STAT_LABEL_W + STAT_VAL_W;
}

function paintStatRow(
  parent: PIXI.Container,
  row: FolkStatRow,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const cy = y + h / 2;
  const name = painted(Math.round(Math.min(20, 14 + h * 0.08)), row.color, '#1a1008', 3);
  name.anchor.set(0, 0.5);
  name.position.set(x, cy);
  name.text = row.label;
  parent.addChild(name);

  const val = painted(Math.round(Math.min(20, 14 + h * 0.08)), row.next ? UP : CREAM, '#1a1008', 3);
  val.anchor.set(0, 0.5);
  val.position.set(x + STAT_LABEL_W, cy);
  val.text = row.next ? `${row.text}→${row.next}` : row.text;
  parent.addChild(val);

  const barX = growBarX(x);
  const barW = Math.max(40, w - STAT_LABEL_W - STAT_VAL_W);
  const barH = Math.min(32, Math.max(BAR_H, h * 0.52));
  putSheet(parent, 'bar_track', barX + barW / 2, cy, barW, barH);
  const fillW = Math.max(2, (barW * (1 - FILL_INSET_X * 2)) * Math.min(1, Math.max(0, row.ratio)));
  const fillH = Math.max(4, barH * (1 - FILL_INSET_Y * 2));
  putBar(parent, 'bar_fill', barX + barW * FILL_INSET_X, cy, fillW, fillH, row.color);
}

function putSheet(
  parent: PIXI.Container,
  name: UiName,
  cx: number,
  cy: number,
  w: number,
  h: number,
): void {
  fillSprite(parent, uiTex(name), cx, cy, w, h);
}

function putBar(
  parent: PIXI.Container,
  name: UiName,
  x: number,
  cy: number,
  w: number,
  h: number,
  tint?: number,
): void {
  const texture = uiTex(name);
  if (!texture?.baseTexture.valid || texture.width <= 1 || w <= 0) return;
  const spr = new PIXI.Sprite(texture);
  spr.anchor.set(0, 0.5);
  spr.position.set(x, cy);
  spr.width = w;
  spr.height = h;
  if (tint != null) spr.tint = tint;
  spr.eventMode = 'none';
  parent.addChild(spr);
}
