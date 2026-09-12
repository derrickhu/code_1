/**
 * 立绘不透明宽高、底边空、原图画布（像素）。
 * 首页按身体定高，再按身宽排站位。
 */

export interface PortraitBody {
  w: number;
  h: number;
  padB: number;
  texW: number;
  texH: number;
}

export const PORTRAIT_BODY: Readonly<Record<string, readonly [PortraitBody, PortraitBody, PortraitBody]>> = {
  baowenhu: [{ w: 305, h: 589, padB: 26, texW: 357, texH: 641 }, { w: 359, h: 587, padB: 26, texW: 401, texH: 639 }, { w: 718, h: 997, padB: 24, texW: 766, texH: 1045 }],
  bianpao: [{ w: 575, h: 1051, padB: 24, texW: 623, texH: 1099 }, { w: 337, h: 540, padB: 24, texW: 385, texH: 588 }, { w: 813, h: 1024, padB: 52, texW: 903, texH: 1128 }],
  chengtuo: [{ w: 260, h: 566, padB: 24, texW: 308, texH: 614 }, { w: 481, h: 1069, padB: 24, texW: 529, texH: 1117 }, { w: 793, h: 1080, padB: 24, texW: 841, texH: 1128 }],
  dachui: [{ w: 313, h: 594, padB: 24, texW: 361, texH: 642 }, { w: 554, h: 1077, padB: 24, texW: 602, texH: 1125 }, { w: 794, h: 1060, padB: 24, texW: 842, texH: 1108 }],
  dianju: [{ w: 689, h: 1074, padB: 24, texW: 737, texH: 1122 }, { w: 543, h: 1078, padB: 40, texW: 623, texH: 1138 }, { w: 810, h: 1052, padB: 24, texW: 858, texH: 1100 }],
  erjiu: [{ w: 332, h: 595, padB: 24, texW: 380, texH: 643 }, { w: 637, h: 1079, padB: 24, texW: 685, texH: 1127 }, { w: 745, h: 1066, padB: 24, texW: 793, texH: 1114 }],
  gangban: [{ w: 377, h: 600, padB: 24, texW: 414, texH: 648 }, { w: 705, h: 1087, padB: 24, texW: 753, texH: 1135 }, { w: 814, h: 949, padB: 56, texW: 912, texH: 1061 }],
  gaoyaguo: [{ w: 827, h: 1045, padB: 52, texW: 920, texH: 1149 }, { w: 813, h: 1016, padB: 24, texW: 855, texH: 1064 }, { w: 742, h: 1048, padB: 24, texW: 790, texH: 1096 }],
  guogai: [{ w: 272, h: 560, padB: 24, texW: 320, texH: 608 }, { w: 771, h: 1061, padB: 24, texW: 819, texH: 1109 }, { w: 803, h: 1076, padB: 24, texW: 848, texH: 1124 }],
  jishi: [{ w: 771, h: 1039, padB: 52, texW: 866, texH: 1143 }, { w: 358, h: 550, padB: 24, texW: 406, texH: 598 }, { w: 699, h: 1049, padB: 24, texW: 747, texH: 1097 }],
  labaye: [{ w: 338, h: 589, padB: 24, texW: 386, texH: 637 }, { w: 673, h: 1053, padB: 24, texW: 721, texH: 1101 }, { w: 747, h: 1042, padB: 24, texW: 795, texH: 1090 }],
  laoli: [{ w: 772, h: 1058, padB: 24, texW: 820, texH: 1106 }, { w: 797, h: 1070, padB: 52, texW: 890, texH: 1174 }, { w: 417, h: 600, padB: 24, texW: 465, texH: 648 }],
  laoyanqiang: [{ w: 615, h: 1066, padB: 24, texW: 663, texH: 1114 }, { w: 739, h: 1078, padB: 24, texW: 787, texH: 1126 }, { w: 799, h: 1051, padB: 24, texW: 847, texH: 1099 }],
  miankuzhang: [{ w: 674, h: 1066, padB: 24, texW: 722, texH: 1114 }, { w: 794, h: 1045, padB: 52, texW: 883, texH: 1149 }, { w: 837, h: 1077, padB: 52, texW: 920, texH: 1181 }],
  qiangou: [{ w: 559, h: 1086, padB: 24, texW: 607, texH: 1134 }, { w: 685, h: 1045, padB: 24, texW: 733, texH: 1093 }, { w: 825, h: 1025, padB: 52, texW: 918, texH: 1129 }],
  sanshen: [{ w: 287, h: 494, padB: 24, texW: 335, texH: 542 }, { w: 756, h: 1029, padB: 24, texW: 804, texH: 1077 }, { w: 778, h: 1078, padB: 24, texW: 825, texH: 1126 }],
  shazhu: [{ w: 775, h: 982, padB: 24, texW: 823, texH: 1030 }, { w: 798, h: 1013, padB: 24, texW: 841, texH: 1061 }, { w: 838, h: 958, padB: 52, texW: 920, texH: 1062 }],
  shimo: [{ w: 674, h: 1059, padB: 24, texW: 722, texH: 1107 }, { w: 693, h: 1072, padB: 24, texW: 741, texH: 1120 }, { w: 663, h: 1025, padB: 24, texW: 711, texH: 1073 }],
  tiezhu: [{ w: 659, h: 1078, padB: 24, texW: 707, texH: 1126 }, { w: 795, h: 1083, padB: 24, texW: 840, texH: 1131 }, { w: 797, h: 1069, padB: 24, texW: 845, texH: 1117 }],
  yuwang: [{ w: 337, h: 517, padB: 24, texW: 385, texH: 565 }, { w: 333, h: 513, padB: 24, texW: 381, texH: 561 }, { w: 735, h: 1060, padB: 24, texW: 783, texH: 1108 }],
};

export function portraitBody(id: string, evo: number, texH: number): PortraitBody {
  const row = PORTRAIT_BODY[id];
  const box = row?.[Math.max(0, Math.min(2, Math.floor(evo) - 1))];
  if (!box || box.h < 8) {
    const h = Math.max(1, texH);
    return { w: h, h, padB: 0, texW: h, texH: h };
  }
  return box;
}

export function portraitFit(id: string, evo: number, texH: number): { bodyH: number; padB: number } {
  const box = portraitBody(id, evo, texH);
  const k = texH > 8 && box.texH > 8 ? texH / box.texH : 1;
  return { bodyH: Math.max(1, box.h * k), padB: Math.max(0, box.padB * k) };
}

export function barePlantY(padB: number, targetH: number, bodyH: number): number {
  return padB * (targetH / Math.max(1, bodyH));
}

/**
 * 图鉴三阶卡：按不透明身体定高，各自缩放。
 * 不能三张图共用一个像素比例——一阶画布矮、二三阶画布高时，
 * 共用比例会把一阶缩成小孩。
 */
export function portraitCardScale(
  id: string,
  evo: number,
  texW: number,
  texH: number,
  maxW: number,
  maxH: number,
): { scale: number; plantY: number } {
  if (texW <= 1 || texH <= 1 || maxW <= 1 || maxH <= 1) {
    return { scale: 1, plantY: 0 };
  }
  const box = portraitBody(id, evo, texH);
  const k = texH > 8 && box.texH > 8 ? texH / box.texH : 1;
  const bodyW = Math.max(1, box.w * k);
  const bodyH = Math.max(1, box.h * k);
  const scale = Math.min(maxW / bodyW, maxH / bodyH);
  return { scale, plantY: box.padB * k * scale };
}

export function portraitWidth(id: string, evo: number, peopleH: number): number {
  const row = PORTRAIT_BODY[id];
  const box = row?.[Math.max(0, Math.min(2, Math.floor(evo) - 1))];
  if (!box || box.h < 8 || box.w < 8) return peopleH * 0.72;
  return box.w * (peopleH / box.h);
}

export const YARD_MAX_SPAN = 680;
export const YARD_PAD = 18;

export function packPortraitRow(
  widths: readonly number[],
  midX: number,
  maxSpan = YARD_MAX_SPAN,
  pad = YARD_PAD,
): number[] {
  const n = widths.length;
  if (n <= 0) return [];
  if (n === 1) return [midX];
  const half = widths.map((w) => Math.max(8, w) / 2);
  const sumW = half.reduce((sum, h) => sum + h * 2, 0);
  let air = pad;
  let span = sumW + (n - 1) * air;
  if (span > maxSpan) {
    air = (maxSpan - sumW) / (n - 1);
    span = maxSpan;
  }
  const xs = [midX - span / 2 + half[0]!];
  for (let i = 1; i < n; i += 1) {
    xs.push(xs[i - 1]! + half[i - 1]! + air + half[i]!);
  }
  return xs;
}
