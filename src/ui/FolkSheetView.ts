/**
 * 详情页能力表。锈铁底板出图，四条竖着排，招牌章跟「怎么打」错开。
 */
import * as PIXI from 'pixi.js';
import type { FolkSheet, FolkStatRow } from '@/balance/folkSheet';
import { uiTex } from '@/core/TextureLoader';
import { GOLD, fillSprite, ironSlab, label, painted } from '@/ui/paint';

const CREAM = 0xfff4c4;
const MUTED = 0xc4b59a;

const SHEET_H = 278;

export function oneFolkLay(top: number, viewH: number, safeBottom: number): {
  plateTop: number;
  plateH: number;
  plateW: number;
  plateCx: number;
  cardTop: number;
  cardH: number;
  sheetTop: number;
  sheetH: number;
  btnY: number;
} {
  const plateTop = top + 8;
  const plateH = 78;
  const plateW = 690;
  const cardTop = plateTop + plateH + 8;
  const btnY = viewH - safeBottom - 150;
  const sheetH = SHEET_H;
  const sheetTop = btnY - 8 - sheetH;
  const cardH = Math.min(260, Math.max(188, sheetTop - 10 - cardTop));
  return {
    plateTop, plateH, plateW, plateCx: 375,
    cardTop, cardH, sheetTop, sheetH, btnY,
  };
}

export function paintFolkStats(
  parent: PIXI.Container,
  sheet: FolkSheet,
  left: number,
  top: number,
  width: number,
): number {
  const rowH = 34;
  sheet.stats.forEach((row, i) => {
    paintStatRow(parent, row, left, top + i * rowH, width, rowH - 5);
  });
  const useY = top + rowH * sheet.stats.length + 8;
  paintUse(parent, sheet, left, useY, width);
  return useY + 112 - top;
}

export function paintFolkSheetPlate(
  parent: PIXI.Container,
  sheet: FolkSheet,
  cx: number,
  top: number,
  width: number,
  height: number,
): void {
  const left = cx - width / 2;
  if (!fillSprite(parent, uiTex('rust_sheet'), cx, top + height / 2, width, height)) {
    const g = new PIXI.Graphics();
    ironSlab(g, left, top, width, height, 14);
    parent.addChild(g);
  }
  paintFolkStats(parent, sheet, left + 28, top + 18, width - 56);
}

function paintStatRow(
  parent: PIXI.Container,
  row: FolkStatRow,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const g = new PIXI.Graphics();
  const barX = x + 86;
  const barW = w - 196;
  const barY = y + h / 2 - 6;
  g.beginFill(0x0a0604, 0.62).drawRoundedRect(barX, barY, barW, 12, 3).endFill();
  const fill = Math.max(10, barW * row.ratio);
  g.beginFill(row.color, 0.9).drawRoundedRect(barX, barY, fill, 12, 3).endFill();
  g.lineStyle(1.4, 0x6a3a18, 0.7).drawRoundedRect(barX, barY, barW, 12, 3).lineStyle(0);
  parent.addChild(g);

  const name = painted(17, row.color, '#1a1008', 3);
  name.anchor.set(0, 0.5);
  name.position.set(x + 4, y + h / 2);
  name.text = row.label;
  parent.addChild(name);

  const val = painted(19, CREAM, '#1a1008', 3);
  val.anchor.set(1, 0.5);
  val.position.set(x + w - 4, y + h / 2);
  val.text = row.text;
  parent.addChild(val);
}

function paintUse(
  parent: PIXI.Container,
  sheet: FolkSheet,
  x: number,
  y: number,
  w: number,
): void {
  const how = painted(15, 0xe8c080, '#1a1008', 3);
  how.position.set(x + 4, y);
  how.text = '怎么打';
  parent.addChild(how);

  const badgeY = y + 26;
  const badgeCx = x + 40;
  const badgeCy = badgeY + 34;
  if (!fillSprite(parent, uiTex('rust_badge'), badgeCx, badgeCy, 72, 72)) {
    const g = new PIXI.Graphics();
    g.beginFill(0x2a1810).drawRoundedRect(x + 6, badgeY, 68, 68, 8).endFill();
    g.beginFill(0x8a3a18, 0.85).drawRoundedRect(x + 10, badgeY + 4, 60, 60, 6).endFill();
    parent.addChild(g);
  }

  const stamp = painted(22, 0xfff4c4, '#1a1008', 4);
  stamp.anchor.set(0.5);
  stamp.position.set(badgeCx, badgeCy);
  stamp.text = sheet.sign.name;
  parent.addChild(stamp);

  const use = label(16, CREAM, true);
  use.position.set(x + 84, badgeY + 2);
  use.style.wordWrap = true;
  use.style.wordWrapWidth = w - 92;
  use.text = sheet.sign.use;
  parent.addChild(use);

  const kind = label(15, sheet.sign.kindLine ? GOLD : MUTED, true);
  kind.position.set(x + 84, badgeY + 54);
  kind.text = sheet.sign.kindLine || '这一阶还没改打法，先靠上面那句。';
  parent.addChild(kind);
}
