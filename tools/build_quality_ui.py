#!/usr/bin/env python3
"""生成全游统一的 04 风格（饱和逆光宝石内胆 + 径向聚光 + 45° 切角霓虹稀有度双线框 + 锐利战术包角）品质框套件。

严格对标图 4（04·乡亲英雄养成页设定图）的色彩区分度与逆光质感！
输出到 Assets/Resources/Art/ui/：
  - card_{grey,blue,purple,orange,red,lock}.png   (240x288, 9-slice 52,52,52,52)
  - slot_{grey,blue,purple,orange,red,wood}.png   (176x176, 9-slice 44,44,44,44)
  - eqcard_{grey,blue,purple,orange,red}.png      (200x172, 9-slice 44,48,44,44)
  - slot_empty_tech.png                           (176x176, 空背包战术凹槽底格)
  - power_crest.png                               (392x92,  9-slice 96,0,96,0)
  - tag_red.png                                   (156x60)
"""
import os
import numpy as np
from PIL import Image, ImageDraw

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Assets/Resources/Art/ui")
os.makedirs(OUT_DIR, exist_ok=True)


def hex_rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)], dtype=np.float32)


def hex_rgba(h: str, a: int = 255) -> tuple:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def sdf_segment(x: np.ndarray, y: np.ndarray, ax: float, ay: float, bx: float, by: float) -> np.ndarray:
    vx, vy = bx - ax, by - ay
    l2 = vx * vx + vy * vy + 1e-6
    t = np.clip(((x - ax) * vx + (y - ay) * vy) / l2, 0.0, 1.0)
    return np.hypot(x - (ax + t * vx), y - (ay + t * vy))


def sd_oct_box(x: np.ndarray, y: np.ndarray, cx: float, cy: float, hw: float, hh: float, ch: float, r_tiny: float = 0.0) -> np.ndarray:
    W = max(2.0, hw - r_tiny)
    H = max(2.0, hh - r_tiny)
    C = np.clip(ch, 0.5, min(W, H) - 0.5)
    ax = np.abs(x - cx)
    ay = np.abs(y - cy)
    d1 = sdf_segment(ax, ay, 0.0, H, W - C, H)
    d2 = sdf_segment(ax, ay, W - C, H, W, H - C)
    d3 = sdf_segment(ax, ay, W, H - C, W, 0.0)
    min_d = np.minimum(np.minimum(d1, d2), d3)
    m = np.maximum(np.maximum(ax - W, ay - H), (ax + ay - (W + H - C)) * 0.70710678)
    return np.where(m <= 0.0, -min_d, min_d) - r_tiny


def aa_cov(sd: np.ndarray, w: float = 1.2) -> np.ndarray:
    return np.clip(0.5 - sd / w, 0.0, 1.0)


def over(dst: np.ndarray, rgb_c: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    a = alpha[..., None]
    out_a = a + dst[..., 3:4] / 255.0 * (1.0 - a)
    safe = np.maximum(out_a, 1e-6)
    out_rgb = (rgb_c * a + dst[..., :3] * (dst[..., 3:4] / 255.0) * (1.0 - a)) / safe
    res = np.empty_like(dst)
    res[..., :3] = np.where(out_a > 1e-5, out_rgb, 0.0)
    res[..., 3:4] = out_a * 255.0
    return res


def pil_over(canvas: np.ndarray, overlay_img: Image.Image) -> np.ndarray:
    ov = np.asarray(overlay_img, dtype=np.float32)
    return over(canvas, ov[..., :3], ov[..., 3] / 255.0)


# 严格对标图 4（04·乡亲英雄养成页设定图）：饱和逆光内胆 + 强烈品阶色彩区分度！
# 每个品阶内胆都有清晰的「上深压暗 -> 中央径向逆光核心 -> 底部浓郁霓虹背光」三层体积感，彻底告别黑呼呼一片！
THEMES = {
    "grey": {
        # 图 4 右下翠绿/冷青科技阶（普通/基础物资也拥有清爽松石翠绿逆光质感）
        "tier": 0,
        "ink": "050914",
        "rim_top": "52F5B8",
        "rim_bot": "14A878",
        "lip": "094836",
        "rim_hi": "D8FFF0",
        "in_line": "24C892",
        "bg_top": "0B2428",
        "bg_mid": "13524E",
        "bg_bot": "1E8E78",
        "core_glow": "32F5B2",
        "sheen": "78FFCE",
        "gem": "7CFFD0",
    },
    "wood": {
        # 暖古铜琥珀底（金币/手稿等暖色物资专用，亮润温暖）
        "tier": 0,
        "ink": "050914",
        "rim_top": "F6B856",
        "rim_bot": "C0761E",
        "lip": "542E06",
        "rim_hi": "FFF0BE",
        "in_line": "DA9030",
        "bg_top": "26170C",
        "bg_mid": "583516",
        "bg_bot": "965C20",
        "core_glow": "F0A43C",
        "sheen": "FFD88A",
        "gem": "FFD470",
    },
    "blue": {
        # 图 4 左下电光冰青蓝阶（稀有）
        "tier": 1,
        "ink": "050914",
        "rim_top": "5EF4FF",
        "rim_bot": "00A6EC",
        "lip": "074872",
        "rim_hi": "E6FFFF",
        "in_line": "26CEFF",
        "bg_top": "0A2244",
        "bg_mid": "115896",
        "bg_bot": "18A4E0",
        "core_glow": "3CE8FF",
        "sheen": "98F8FF",
        "gem": "58F2FF",
    },
    "purple": {
        # 图 4 右上电光紫晶阶（史诗：浓郁紫罗兰逆光舞台，衬托暗色剪影极度醒目！）
        "tier": 2,
        "ink": "050914",
        "rim_top": "DF8CFF",
        "rim_bot": "902EE8",
        "lip": "42107A",
        "rim_hi": "FAE4FF",
        "in_line": "BD5CFF",
        "bg_top": "200E44",
        "bg_mid": "581EA4",
        "bg_bot": "9E36EC",
        "core_glow": "D268FF",
        "sheen": "F0B4FF",
        "gem": "E8A2FF",
    },
    "orange": {
        # 图 4 左上熔岩鎏金阶（传说：炽烈暖金聚光舞台 + 四角亮金包角！）
        "tier": 3,
        "ink": "050914",
        "rim_top": "FFE24A",
        "rim_bot": "F28C06",
        "lip": "743804",
        "rim_hi": "FFFCE0",
        "in_line": "FFB81C",
        "bg_top": "2E1806",
        "bg_mid": "7C480A",
        "bg_bot": "D88A10",
        "core_glow": "FFC832",
        "sheen": "FFF09E",
        "gem": "FFF078",
    },
    "red": {
        # 绝世赤焰鎏金阶（红金双色尊享逆光舞台！）
        "tier": 4,
        "ink": "050914",
        "rim_top": "FF6A58",
        "rim_bot": "DA1822",
        "lip": "640810",
        "rim_hi": "FFE2D4",
        "in_line": "FFC838",
        "bg_top": "360A18",
        "bg_mid": "8E182E",
        "bg_bot": "E83632",
        "core_glow": "FF6846",
        "sheen": "FFD478",
        "gem": "FFD84C",
    },
    "lock": {
        # 未解锁蓝图暗钢框（通透冷靛蓝，不再死黑）
        "tier": -1,
        "ink": "050914",
        "rim_top": "4C6A92",
        "rim_bot": "2E4464",
        "lip": "142034",
        "rim_hi": "7E9EC4",
        "in_line": "365074",
        "bg_top": "101B32",
        "bg_mid": "182848",
        "bg_bot": "223862",
        "core_glow": "385888",
        "sheen": "5278A8",
        "gem": "6282A8",
    },
}


def draw_04_corner_brackets(W: int, H: int, cx: float, cy: float, hw: float, hh: float, ch: float, th: dict, is_card: bool) -> Image.Image:
    """绘制图 4 设定图同款锐利 45° 切角立体包角、外护翼角扣与宝石铆点（严格落在九宫格角保护区内）。"""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    tier = th["tier"]
    if tier < 0:
        return im

    s = min(W, H) / (240.0 if is_card else 180.0)
    ink = hex_rgba(th["ink"], 255)
    hi = hex_rgba(th["rim_hi"], 255)
    rim_c = hex_rgba(th["rim_top"], 255)
    gem_c = hex_rgba(th["gem"], 255)

    arm = (20.0 if tier <= 1 else 25.0 if tier == 2 else 30.0) * s
    inset = (10.0 if is_card else 8.8) * s
    iw, ih = hw - inset, hh - inset
    ic = max(4.0 * s, ch - inset * 0.62)
    lw = max(2, int(round((2.4 if tier <= 1 else 3.2) * s)))

    for sx in (-1, 1):
        for sy in (-1, 1):
            p1 = (cx + sx * max(0.0, iw - ic - arm), cy + sy * ih)
            p2 = (cx + sx * (iw - ic), cy + sy * ih)
            p3 = (cx + sx * iw, cy + sy * (ih - ic))
            p4 = (cx + sx * iw, cy + sy * max(0.0, ih - ic - arm))
            dr.line([p1, p2, p3, p4], fill=hi if tier >= 2 else rim_c, width=lw, joint="curve")

            # 传说/绝世专属外沿战术包角亮翼（还原图 4 左上角金框四角折角高光！）
            if tier >= 3:
                ow, oh = hw + 1.2 * s, hh + 1.2 * s
                oc = ch + 0.8 * s
                o_arm = 22.0 * s
                q1 = (cx + sx * max(0.0, ow - oc - o_arm), cy + sy * oh)
                q2 = (cx + sx * (ow - oc), cy + sy * oh)
                q3 = (cx + sx * ow, cy + sy * (oh - oc))
                q4 = (cx + sx * ow, cy + sy * max(0.0, oh - oc - o_arm))
                dr.line([q1, q2, q3, q4], fill=hi, width=max(3, int(round(3.4 * s))), joint="curve")

            if tier >= 1:
                gx = cx + sx * (hw - ic * 0.52)
                gy = cy + sy * (hh - ic * 0.52)
                ro = (4.6 if tier == 1 else 5.4 if tier == 2 else 6.6) * s
                ri = (2.8 if tier == 1 else 3.4 if tier == 2 else 4.2) * s
                dr.polygon([(gx, gy - ro), (gx + ro, gy), (gx, gy + ro), (gx - ro, gy)], fill=ink)
                dr.polygon([(gx, gy - ri), (gx + ri, gy), (gx, gy + ri), (gx - ri, gy)], fill=gem_c if tier >= 3 else hi)

    return im


def render_quality_box(
    w_out: int,
    h_out: int,
    theme_key: str,
    chamfer_px: float = 18.0,
    border_w: float = 6.6,
    pad_px: float = 3.5,
    is_card: bool = True,
    socket_dock_h: float = 0.0,
) -> Image.Image:
    SS = 4
    W, H = w_out * SS, h_out * SS
    th = THEMES[theme_key]
    tier = th["tier"]

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W * 0.5, H * 0.5 - 1.2 * SS
    pad = pad_px * SS
    hw, hh = W * 0.5 - pad, H * 0.5 - pad - 1.2 * SS
    ch = chamfer_px * SS
    bw = border_w * SS
    rt = 1.0 * SS

    canvas = np.zeros((H, W, 4), dtype=np.float32)

    sd_outer = sd_oct_box(xx, yy, cx, cy, hw, hh, ch, rt)
    sd_lip = sd_oct_box(xx, yy - 3.2 * SS, cx, cy, hw, hh, ch, rt)
    sd_union = np.minimum(sd_outer, sd_lip)
    ink_t = 2.2 * SS

    # 0. 高品阶柔和外发光边缘（让格子与深色抽屉面板自然剥离、熠熠生辉）
    if tier >= 1:
        outer_halo = np.exp(-np.maximum(sd_outer, 0.0) / ((3.0 if tier <= 2 else 4.2) * SS)) * (0.28 if tier <= 2 else 0.42)
        canvas = over(canvas, hex_rgb(th["rim_top"]), outer_halo * (sd_union > -0.5))

    # 1. 黑曜石外轮廓与立体金属暗唇
    canvas = over(canvas, hex_rgb(th["ink"]), aa_cov(sd_union, 1.2))
    canvas = over(canvas, hex_rgb(th["lip"]), aa_cov(sd_lip + ink_t, 1.2))

    # 2. 锐利 45° 切角霓虹主边框（高饱和金属赛璐珞双阶折射）
    sd_rim = sd_outer + ink_t
    vy = np.clip((yy - (cy - hh)) / (2.0 * hh), 0.0, 1.0)
    cel_rim = np.clip((vy - 0.52) / 0.08, 0.0, 1.0)[..., None]
    rim_rgb = hex_rgb(th["rim_top"]) * (1.0 - cel_rim) + hex_rgb(th["rim_bot"]) * cel_rim
    canvas = over(canvas, rim_rgb, aa_cov(sd_rim, 1.2))

    d_rim_dn = np.roll(sd_rim, int(round(2.0 * SS)), axis=0)
    d_rim_dn[:int(round(2.0 * SS)), :] = 1e9
    top_hi = aa_cov(sd_rim, 1.2) * np.clip(d_rim_dn + 0.5, 0.0, 1.0) * np.clip(1.0 - vy * 2.4, 0.0, 1.0)
    canvas = over(canvas, hex_rgb(th["rim_hi"]), top_hi * 0.94)

    # 3. 图 4 同款饱和逆光宝石舞台内胆（三段渐变 + 中下径向逆光聚光灯 + 硬边斜切几何光束！）
    sd_inner_ink = sd_outer + bw
    canvas = over(canvas, hex_rgb(th["ink"]), aa_cov(sd_inner_ink, 1.2))

    sd_bg = sd_inner_ink + 1.8 * SS
    a_bg = aa_cov(sd_bg, 1.2)

    # 三段式纵深色彩：上半深宝石压衬剪影头肩，中下明亮逆光烘托剪影全身！
    t_top = np.clip(vy / 0.48, 0.0, 1.0)[..., None]
    t_bot = np.clip((vy - 0.48) / 0.52, 0.0, 1.0)[..., None]
    bg_upper = hex_rgb(th["bg_top"]) * (1.0 - t_top) + hex_rgb(th["bg_mid"]) * t_top
    bg_lower = hex_rgb(th["bg_mid"]) * (1.0 - t_bot) + hex_rgb(th["bg_bot"]) * t_bot
    bg_rgb = np.where(vy[..., None] < 0.48, bg_upper, bg_lower)

    if tier >= 0:
        # 中央偏下强烈逆光聚光核心（让黑色剪影角色/深色徽章瞬间立起来！）
        spot_cy = cy + hh * (0.14 if is_card else 0.10)
        rx = (xx - cx) / (hw * 0.88)
        ry = (yy - spot_cy) / (hh * 0.82)
        rad = np.sqrt(rx * rx + ry * ry)
        spot = np.clip(1.0 - rad, 0.0, 1.0) ** 1.45 * (0.52 if tier >= 2 else 0.44)
        bg_rgb = bg_rgb * (1.0 - spot[..., None]) + hex_rgb(th["core_glow"]) * spot[..., None]

        # 内边缘一圈微妙的宝石内发光晕（增强框体厚度感）
        edge_vignette = np.clip(1.0 - (-sd_bg) / (18.0 * SS), 0.0, 1.0) ** 2.0 * 0.22
        bg_rgb = bg_rgb * (1.0 - edge_vignette[..., None]) + hex_rgb(th["rim_top"]) * edge_vignette[..., None]

    canvas = over(canvas, bg_rgb, a_bg)

    # 内侧第二道明亮霓虹刻线
    sd_in_line = np.abs(sd_bg + 3.4 * SS) - 0.95 * SS
    canvas = over(canvas, hex_rgb(th["in_line"]), aa_cov(sd_in_line, 1.2) * a_bg * 0.90)

    # 4. 装备卡底部镶孔底座（深宝石金属质感，不再死黑）
    if socket_dock_h > 0:
        dock_top_y = (cy + hh) - (border_w + socket_dock_h) * SS
        in_dock = np.clip((yy - dock_top_y) / 1.3, 0.0, 1.0) * a_bg
        dock_col = hex_rgb(th["bg_top"]) * 0.65 + hex_rgb("081022") * 0.35
        canvas = over(canvas, np.broadcast_to(dock_col, (H, W, 3)), in_dock * 0.92)

        bar_ink = aa_cov(np.abs(yy - dock_top_y) - 2.0 * SS, 1.2) * a_bg
        bar_hi = aa_cov(np.abs(yy - dock_top_y) - 0.95 * SS, 1.2) * a_bg
        canvas = over(canvas, hex_rgb(th["ink"]), bar_ink)
        canvas = over(canvas, hex_rgb(th["rim_top"]), bar_hi * 0.92)

    # 5. 四角 45° 战术包角与铆钻
    orn = draw_04_corner_brackets(W, H, cx, cy, hw, hh, ch, th, is_card=is_card)
    canvas = pil_over(canvas, orn)

    out = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
    return out.resize((w_out, h_out), Image.Resampling.LANCZOS)


def build_empty_tech_slot() -> Image.Image:
    """176x176 村长背包/徽章矩阵空槽战术凹格（消除未填满区域的死黑空洞感）。"""
    w_out, h_out, SS = 176, 176, 4
    W, H = w_out * SS, h_out * SS
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W * 0.5, H * 0.5
    hw, hh, ch = (w_out * 0.5 - 4.5) * SS, (h_out * 0.5 - 4.5) * SS, 16.0 * SS

    canvas = np.zeros((H, W, 4), dtype=np.float32)
    sd = sd_oct_box(xx, yy, cx, cy, hw, hh, ch, 1.0 * SS)
    vy = np.clip((yy - (cy - hh)) / (2.0 * hh), 0.0, 1.0)

    # 外细青蓝框 + 内凹宝石蓝科技槽底
    canvas = over(canvas, hex_rgb("070E1E"), aa_cov(sd, 1.2) * 0.90)
    canvas = over(canvas, hex_rgb("2A4C7D"), aa_cov(sd + 1.6 * SS, 1.2) * 0.85)
    sd_in = sd + 3.8 * SS
    a_in = aa_cov(sd_in, 1.2) * 0.88
    fill = hex_rgb("101D38") * (1.0 - vy[..., None]) + hex_rgb("16294C") * vy[..., None]
    canvas = over(canvas, fill, a_in)

    # 中央极精致暗青菱形准星与四角微刻度
    im = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
    dr = ImageDraw.Draw(im)
    r1, r2 = 22 * SS, 10 * SS
    dr.polygon([(cx, cy - r1), (cx + r1, cy), (cx, cy + r1), (cx - r1, cy)], outline=hex_rgba("284B7E", 145), width=int(1.8 * SS))
    dr.polygon([(cx, cy - r2), (cx + r2, cy), (cx, cy + r2), (cx - r2, cy)], fill=hex_rgba("22406E", 130))
    for sx in (-1, 1):
        for sy in (-1, 1):
            px, py = cx + sx * (hw - 12 * SS), cy + sy * (hh - 12 * SS)
            dr.line([(px - sx * 10 * SS, py), (px, py), (px, py - sy * 10 * SS)], fill=hex_rgba("3B6CB0", 165), width=int(2.0 * SS))

    return im.resize((w_out, h_out), Image.Resampling.LANCZOS)


def build_power_crest() -> Image.Image:
    """392x92 (9-slice 96,0,96,0) 04 风格切角黑曜石鎏金战力铭牌 (`ui/power_crest.png`)。"""
    w_out, h_out, SS = 392, 92, 4
    W, H = w_out * SS, h_out * SS
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)

    def poly(inset: float, dy: float = 0.0):
        i = inset * SS
        d = dy * SS
        return [
            (22 * SS + i * 0.9, H * 0.50 + d),
            (58 * SS + i * 0.5, 11 * SS + i + d),
            (W - 58 * SS - i * 0.5, 11 * SS + i + d),
            (W - 22 * SS - i * 0.9, H * 0.50 + d),
            (W - 54 * SS - i * 0.5, H - 14 * SS - i + d),
            (54 * SS + i * 0.5, H - 14 * SS - i + d),
        ]

    dr.polygon(poly(0.0, 3.5), fill=hex_rgba("050914", 255))
    dr.polygon(poly(2.4, 3.5), fill=hex_rgba("683E06", 255))
    dr.polygon(poly(0.0, 0.0), fill=hex_rgba("050914", 255))
    dr.polygon(poly(2.4, 0.0), fill=hex_rgba("FFC828", 255))
    dr.polygon(poly(5.2, 0.0), fill=hex_rgba("050914", 255))
    dr.polygon(poly(7.0, 0.0), fill=hex_rgba("162648", 255))
    dr.polygon(poly(9.8, 0.0), outline=hex_rgba("00E5FF", 190), width=int(1.8 * SS))

    for sx in [56 * SS, W - 56 * SS]:
        sy = H * 0.49
        ro, ri = 6.8 * SS, 4.4 * SS
        dr.polygon([(sx, sy - ro), (sx + ro, gy := sy), (sx, sy + ro), (sx - ro, gy)], fill=hex_rgba("050914", 255))
        dr.polygon([(sx, sy - ri), (sx + ri, gy), (sx, sy + ri), (sx - ri, gy)], fill=hex_rgba("00F57A", 255))

    return im.resize((w_out, h_out), Image.Resampling.LANCZOS)


def build_tag_red() -> Image.Image:
    """156x60 04 风格锐利切角绯红鎏金『出战中』战术角签 (`ui/tag_red.png`)。"""
    w_out, h_out, SS = 156, 60, 4
    W, H = w_out * SS, h_out * SS
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)

    def poly(inset: float = 0.0, dy: float = 0.0):
        i = inset * SS
        d = dy * SS
        return [
            (6 * SS + i, 9 * SS + i + d),
            (W - 8 * SS - i * 1.2, 9 * SS + i + d),
            (W - 26 * SS - i * 0.8, H * 0.48 + d),
            (W - 8 * SS - i * 1.2, H - 13 * SS - i + d),
            (6 * SS + i, H - 13 * SS - i + d),
        ]

    dr.polygon(poly(0.0, 2.8), fill=hex_rgba("050914", 255))
    dr.polygon(poly(2.2, 2.8), fill=hex_rgba("680A10", 255))
    dr.polygon(poly(0.0, 0.0), fill=hex_rgba("050914", 255))
    dr.polygon(poly(2.2, 0.0), fill=hex_rgba("FFD038", 255))
    dr.polygon(poly(4.4, 0.0), fill=hex_rgba("E42228", 255))
    dr.polygon([(10 * SS, 13 * SS), (W - 15 * SS, 13 * SS), (W - 25 * SS, H * 0.46), (10 * SS, H * 0.46)], fill=(255, 108, 92, 130))
    dr.rectangle([6 * SS, 7 * SS, 13 * SS, H - 11 * SS], fill=hex_rgba("FFE058", 255), outline=hex_rgba("050914", 255), width=int(2.2 * SS))

    return im.resize((w_out, h_out), Image.Resampling.LANCZOS)


def main():
    for k in ["grey", "blue", "purple", "orange", "red", "lock"]:
        im = render_quality_box(240, 288, k, chamfer_px=20.0, border_w=7.6 if THEMES[k]["tier"] >= 2 else 6.6, pad_px=3.5, is_card=True)
        im.save(os.path.join(OUT_DIR, f"card_{k}.png"), optimize=True)

    for k in ["grey", "blue", "purple", "orange", "red", "wood"]:
        im = render_quality_box(176, 176, k, chamfer_px=16.0, border_w=7.0 if THEMES[k]["tier"] >= 2 else 6.0, pad_px=3.5, is_card=False)
        im.save(os.path.join(OUT_DIR, f"slot_{k}.png"), optimize=True)

    for k in ["grey", "blue", "purple", "orange", "red"]:
        im = render_quality_box(200, 172, k, chamfer_px=16.0, border_w=6.8 if THEMES[k]["tier"] >= 2 else 6.0, pad_px=3.5, is_card=False, socket_dock_h=34.0)
        im.save(os.path.join(OUT_DIR, f"eqcard_{k}.png"), optimize=True)

    build_empty_tech_slot().save(os.path.join(OUT_DIR, "slot_empty_tech.png"), optimize=True)
    build_power_crest().save(os.path.join(OUT_DIR, "power_crest.png"), optimize=True)
    build_tag_red().save(os.path.join(OUT_DIR, "tag_red.png"), optimize=True)
    print("Generated all vivid backlit 04-style quality frames in", OUT_DIR)


if __name__ == "__main__":
    main()
