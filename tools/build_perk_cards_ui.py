#!/usr/bin/env python3
"""生成图 6（03·战中肉鸽三选一）同款海报级硬边逆光战技卡皮肤、赤金双雷电横幅，以及图 4 同款 V 字鎏金青霓虹分界梁。

输出到 Assets/Resources/Art/ui/：
  - perk_banner.png                              (820x176, 赤金斜切战技大横幅 + 左右双闪电劈裂翼)
  - perk_card_{cyan,emerald,purple,gold,red}.png (334x596, 45° 八角切角海报立卡 + 满幅逆光几何能量背景 + V字斜切铭牌分界)
  - drawer_header_v.png                          (1084x64, 图 4 同款鎏金-电青渐变 V 字折角顶部分界梁)
"""
import math
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Assets/Resources/Art/ui")
os.makedirs(OUT_DIR, exist_ok=True)


def rgba(h: str, a: int = 255) -> tuple:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def oct_pts(cx: float, cy: float, hw: float, hh: float, ch: float):
    return [
        (cx - hw + ch, cy - hh),
        (cx + hw - ch, cy - hh),
        (cx + hw, cy - hh + ch),
        (cx + hw, cy + hh - ch),
        (cx + hw - ch, cy + hh),
        (cx - hw + ch, cy + hh),
        (cx - hw, cy + hh - ch),
        (cx - hw, cy - hh + ch),
    ]


def build_drawer_header_v() -> Image.Image:
    """图 4（04·乡亲英雄养成页）同款：中央向下 V 字折角鎏金-电青双轨战术顶梁 (1084x64)。"""
    w_out, h_out, SS = 1084, 64, 4
    W, H = w_out * SS, h_out * SS
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    cx = W * 0.5
    vw = 34 * SS
    vy_top = 12 * SS
    vy_tip = 42 * SS

    # 柔和金青辉光衬底
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.line([(16 * SS, vy_top), (cx - vw, vy_top), (cx, vy_tip), (cx + vw, vy_top), (W - 16 * SS, vy_top)],
            fill=rgba("00E5FF", 120), width=int(10 * SS), joint="curve")
    gd.ellipse([cx - 90 * SS, 0, cx + 90 * SS, H], fill=rgba("FFB800", 110))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=6 * SS))
    im.alpha_composite(glow)

    dr = ImageDraw.Draw(im)
    # 下方暗黑装甲托底边
    pts_main = [(12 * SS, vy_top), (cx - vw, vy_top), (cx, vy_tip), (cx + vw, vy_top), (W - 12 * SS, vy_top)]
    dr.line(pts_main, fill=rgba("050914", 255), width=int(9.5 * SS), joint="curve")
    # 外侧电光冰青主轨
    dr.line(pts_main, fill=rgba("00E5FF", 245), width=int(4.2 * SS), joint="curve")
    # 中段至 V 字尖角的熔岩亮金高光覆盖（还原图 4 左青蓝->中亮金->右暖金渐变质感！）
    pts_gold = [(cx - 320 * SS, vy_top), (cx - vw, vy_top), (cx, vy_tip), (cx + vw, vy_top), (cx + 320 * SS, vy_top)]
    dr.line(pts_gold, fill=rgba("FFC828", 255), width=int(4.4 * SS), joint="curve")
    pts_hi = [(cx - 140 * SS, vy_top), (cx - vw, vy_top), (cx, vy_tip), (cx + vw, vy_top), (cx + 140 * SS, vy_top)]
    dr.line(pts_hi, fill=rgba("FFF6B8", 255), width=int(2.2 * SS), joint="curve")

    # 第二道平行细内轨
    dy2 = 9 * SS
    pts_sub = [(36 * SS, vy_top + dy2), (cx - vw - 4 * SS, vy_top + dy2), (cx, vy_tip + dy2), (cx + vw + 4 * SS, vy_top + dy2), (W - 36 * SS, vy_top + dy2)]
    dr.line(pts_sub, fill=rgba("3878C8", 165), width=int(1.8 * SS), joint="curve")

    # V 字中心菱钻
    r = 6.5 * SS
    gy = vy_tip - 13 * SS
    dr.polygon([(cx, gy - r), (cx + r, gy), (cx, gy + r), (cx - r, gy)], fill=rgba("050914", 255))
    r2 = 4.2 * SS
    dr.polygon([(cx, gy - r2), (cx + r2, gy), (cx, gy + r2), (cx - r2, gy)], fill=rgba("FFE878", 255))

    return im.resize((w_out, h_out), Image.Resampling.LANCZOS)


def build_perk_banner() -> Image.Image:
    """还原图 6 顶部：斜切赤红鎏金重装横幅 + 左右对称劈裂赤金大闪电翼！"""
    w_out, h_out, SS = 820, 176, 4
    W, H = w_out * SS, h_out * SS
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cx, cy = W * 0.5, H * 0.52

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse([cx - 320 * SS, cy - 66 * SS, cx + 320 * SS, cy + 66 * SS], fill=rgba("FF8800", 95))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=14 * SS))
    im.alpha_composite(glow)

    dr = ImageDraw.Draw(im)

    for s in (-1, 1):
        wing = [
            (cx + s * 190 * SS, cy - 28 * SS),
            (cx + s * 368 * SS, cy + 8 * SS),
            (cx + s * 290 * SS, cy + 38 * SS),
            (cx + s * 175 * SS, cy + 28 * SS),
        ]
        dr.polygon(wing, fill=rgba("0D4A36", 235), outline=rgba("00F57A", 220), width=int(2.4 * SS))

    def plaque(inset: float = 0.0, dy: float = 0.0):
        ins = inset * SS
        d = dy * SS
        top_hw = 268 * SS - ins * 0.95
        bot_hw = 236 * SS - ins * 0.95
        hh = 48 * SS - ins
        return [
            (cx - top_hw, cy - hh + d),
            (cx + top_hw, cy - hh + d),
            (cx + bot_hw, cy + hh + d),
            (cx - bot_hw, cy + hh + d),
        ]

    dr.polygon(plaque(-4.0, 5.5), fill=rgba("050914", 245))
    dr.polygon(plaque(0.0, 4.5), fill=rgba("682206", 255))
    dr.polygon(plaque(-2.5, 0.0), fill=rgba("050914", 255))
    dr.polygon(plaque(0.0, 0.0), fill=rgba("FFC828", 255))
    dr.polygon(plaque(5.2, 0.0), fill=rgba("480810", 255))
    dr.polygon(plaque(7.4, 0.0), fill=rgba("B81B28", 255))

    dr.polygon([
        (cx - 254 * SS, cy - 39 * SS),
        (cx + 254 * SS, cy - 39 * SS),
        (cx + 242 * SS, cy - 2 * SS),
        (cx - 242 * SS, cy - 2 * SS),
    ], fill=rgba("DC2A36", 255))
    dr.polygon(plaque(11.5, 0.0), outline=rgba("FF9A48", 175), width=int(1.8 * SS))

    bolt_local = [
        (340, -72),
        (256, -70),
        (214, -6),
        (252, -4),
        (196, 78),
        (310, -6),
        (270, -10),
    ]
    for s in (-1, 1):
        pts_outer = [(cx + s * px * SS, cy + py * SS) for px, py in bolt_local]
        dr.polygon(pts_outer, fill=rgba("FF4518", 255), outline=rgba("050914", 255), width=int(5.5 * SS))
        dr.polygon(pts_outer, fill=rgba("FF5818", 255), outline=rgba("FF2A18", 255), width=int(2.6 * SS))
        bolt_inner = [
            (325, -62),
            (265, -61),
            (229, -10),
            (263, -8),
            (217, 57),
            (295, -8),
            (260, -12),
        ]
        pts_in = [(cx + s * px * SS, cy + py * SS) for px, py in bolt_inner]
        dr.polygon(pts_in, fill=rgba("FFD428", 255))
        pts_hi = [
            (cx + s * 316 * SS, cy - 56 * SS),
            (cx + s * 270 * SS, cy - 56 * SS),
            (cx + s * 246 * SS, cy - 18 * SS),
            (cx + s * 278 * SS, cy - 18 * SS),
        ]
        dr.polygon(pts_hi, fill=rgba("FFF8B8", 255))

    return im.resize((w_out, h_out), Image.Resampling.LANCZOS)


CARD_SPECS = {
    "cyan": {
        "rim_outer": "00E5FF",
        "rim_inner": "68F8FF",
        "halo": "00D8FF",
        "stage_top": "061838",
        "stage_bot": "1162AD",
        "ray_a": "1888DC",
        "ray_b": "58F4FF",
        "accent": "C8FFFF",
        "chev_rim": "00E5FF",
        "motif": "lightning",
    },
    "gold": {
        "rim_outer": "FFC418",
        "rim_inner": "FFF498",
        "halo": "FFB800",
        "stage_top": "009E5C",
        "stage_bot": "00F284",
        "ray_a": "055A3B",
        "ray_b": "7CFFC0",
        "accent": "FFD838",
        "chev_rim": "FFC828",
        "motif": "burst_emerald",
    },
    "purple": {
        "rim_outer": "CC6EFF",
        "rim_inner": "00F57A",
        "halo": "A84CFF",
        "stage_top": "1A0B42",
        "stage_bot": "5C1EA8",
        "ray_a": "3C1476",
        "ray_b": "AC4CFF",
        "accent": "FFD858",
        "chev_rim": "E08EFF",
        "motif": "fireworks",
    },
    "red": {
        "rim_outer": "FF4E3C",
        "rim_inner": "FFD038",
        "halo": "FF3B30",
        "stage_top": "340814",
        "stage_bot": "B01C2C",
        "ray_a": "741022",
        "ray_b": "FF5E3A",
        "accent": "FFE878",
        "chev_rim": "FFC828",
        "motif": "solar",
    },
    "emerald": {
        "rim_outer": "00F57A",
        "rim_inner": "98FFCC",
        "halo": "00E874",
        "stage_top": "07282E",
        "stage_bot": "109674",
        "ray_a": "0D5850",
        "ray_b": "36F2A8",
        "accent": "FFF288",
        "chev_rim": "00F57A",
        "motif": "solar",
    },
}


def build_perk_card(kind: str) -> Image.Image:
    """还原图 6 海报级 45° 切角八边形立卡（334x596）：上半满幅逆光几何插画舞台 + V字斜切分界 + 下半黑曜战技铭牌槽！"""
    w_out, h_out, SS = 334, 596, 4
    W, H = w_out * SS, h_out * SS
    sp = CARD_SPECS[kind]
    cx, cy = W * 0.5, H * 0.5
    hw, hh, ch = (w_out * 0.5 - 11.0) * SS, (h_out * 0.5 - 11.0) * SS, 26.0 * SS

    base = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    # 1. 外圈浓郁霓虹辉光
    halo = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    hd = ImageDraw.Draw(halo)
    hd.polygon(oct_pts(cx, cy, hw + 4 * SS, hh + 4 * SS, ch + 2 * SS), fill=rgba(sp["halo"], 135))
    halo = halo.filter(ImageFilter.GaussianBlur(radius=9.0 * SS))
    base.alpha_composite(halo)

    dr = ImageDraw.Draw(base)

    # 2. 硬黑装甲底壳 + 主霓虹粗外框 + 黑曜内隔离槽 + 第二霓虹内框
    dr.polygon(oct_pts(cx, cy + 4 * SS, hw + 2.5 * SS, hh + 2.5 * SS, ch + 1 * SS), fill=rgba("040710", 245))
    dr.polygon(oct_pts(cx, cy, hw + 2.2 * SS, hh + 2.2 * SS, ch + 1 * SS), fill=rgba("050914", 255))
    dr.polygon(oct_pts(cx, cy, hw, hh, ch), fill=rgba(sp["rim_outer"], 255))
    dr.polygon(oct_pts(cx, cy, hw - 4.4 * SS, hh - 4.4 * SS, ch - 2 * SS), fill=rgba("060B18", 255))
    dr.polygon(oct_pts(cx, cy, hw - 7.6 * SS, hh - 7.6 * SS, ch - 3.5 * SS), fill=rgba(sp["rim_inner"], 240))

    in_hw, in_hh, in_ch = hw - 9.8 * SS, hh - 9.8 * SS, ch - 4.5 * SS
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon(oct_pts(cx, cy, in_hw, in_hh, in_ch), fill=255)

    # V字斜切分界线坐标
    y_side = int(H * 0.535)
    y_tip = int(H * 0.608)

    yy = np.linspace(0.0, 1.0, H, dtype=np.float32)[:, None]
    t_stage = np.clip(yy / 0.60, 0.0, 1.0)
    c_top = np.array(rgba(sp["stage_top"])[:3], dtype=np.float32)
    c_bot = np.array(rgba(sp["stage_bot"])[:3], dtype=np.float32)
    stage_rgb = (c_top[None, None, :] * (1.0 - t_stage[:, :, None]) + c_bot[None, None, :] * t_stage[:, :, None])
    stage_arr = np.dstack([np.broadcast_to(stage_rgb, (H, W, 3)), np.full((H, W), 255.0, dtype=np.float32)]).astype(np.uint8)
    interior = Image.fromarray(stage_arr, "RGBA")
    idr = ImageDraw.Draw(interior)

    fx, fy = cx, H * 0.285
    motif = sp["motif"]

    if motif == "burst_emerald":
        # 图 6 中卡风格：硬边深绿闪电裂谷剪影 + 斜向贯通大雷霆光束（干净有力、零碎杂三角！）
        idr.polygon([(0, 0), (W * 0.38, 0), (W * 0.18, H * 0.22), (W * 0.34, H * 0.25), (0, H * 0.46)], fill=rgba("05543A", 230))
        idr.polygon([(W, 0), (W * 0.66, 0), (W * 0.84, H * 0.20), (W * 0.68, H * 0.26), (W, H * 0.48)], fill=rgba("05543A", 230))
        for k in range(12):
            ang = math.radians(k * 30.0 + 15.0)
            w_a = 0.075
            idr.polygon([
                (fx, fy),
                (fx + math.cos(ang - w_a) * 400 * SS, fy + math.sin(ang - w_a) * 400 * SS),
                (fx + math.cos(ang + w_a) * 400 * SS, fy + math.sin(ang + w_a) * 400 * SS),
            ], fill=rgba("88FFCA", 95))
        # 中央向上贯通式硬边金红巨型闪电衬底（还原图 6 C 位主视觉！）
        mega_bolt = [
            (cx - 26 * SS, 8 * SS),
            (cx + 46 * SS, H * 0.22),
            (cx + 2 * SS, H * 0.24),
            (cx + 58 * SS, H * 0.48),
            (cx - 38 * SS, H * 0.27),
            (cx + 4 * SS, H * 0.25),
        ]
        idr.polygon(mega_bolt, fill=rgba("FFD438", 210), outline=rgba("FF3B20", 225), width=int(4.0 * SS))
    elif motif == "lightning":
        for i in range(14):
            ang = math.radians(i * (360.0 / 14.0) + 12.0)
            a1, a2 = ang - 0.07, ang + 0.07
            idr.polygon([
                (fx, fy - 20 * SS),
                (fx + math.cos(a1) * 380 * SS, fy - 20 * SS + math.sin(a1) * 380 * SS),
                (fx + math.cos(a2) * 380 * SS, fy - 20 * SS + math.sin(a2) * 380 * SS),
            ], fill=rgba(sp["ray_a"], 145))
        arcs = [
            [(0, -155), (-24, -84), (16, -42), (-18, 24), (12, 96)],
            [(-118, -125), (-56, -64), (-84, -18), (-28, 44)],
            [(118, -120), (58, -58), (88, -12), (32, 48)],
        ]
        for idx_a, arc in enumerate(arcs):
            pts = [(fx + px * SS, fy + py * SS) for px, py in arc]
            idr.line(pts, fill=rgba("48F4FF", 225), width=int((5.5 if idx_a == 0 else 3.8) * SS), joint="curve")
            idr.line(pts, fill=rgba("EEFFFF", 235), width=int((2.2 if idx_a == 0 else 1.4) * SS), joint="curve")
    elif motif == "fireworks":
        # 图 6 右卡风格：皇家深紫放射暗芒 + 四簇璀璨金红烟花星芒（去掉生硬斜灰条！）
        for k in range(14):
            ang = math.radians(k * (360.0 / 14.0))
            idr.polygon([
                (fx, fy),
                (fx + math.cos(ang - 0.065) * 400 * SS, fy + math.sin(ang - 0.065) * 400 * SS),
                (fx + math.cos(ang + 0.065) * 400 * SS, fy + math.sin(ang + 0.065) * 400 * SS),
            ], fill=rgba("7B28D8", 95))
        burst_centers = [
            (cx - 82 * SS, H * 0.13, 56 * SS),
            (cx + 88 * SS, H * 0.18, 48 * SS),
            (cx + 84 * SS, H * 0.40, 66 * SS),
            (cx - 76 * SS, H * 0.42, 46 * SS),
        ]
        for bx, by, br in burst_centers:
            for k in range(12):
                ang = math.radians(k * 30.0 + 15.0)
                r_end = br * (1.0 if k % 2 == 0 else 0.58)
                idr.line([(bx + math.cos(ang) * 9 * SS, by + math.sin(ang) * 9 * SS),
                          (bx + math.cos(ang) * r_end, by + math.sin(ang) * r_end)],
                         fill=rgba("FFD44C", 220), width=int(2.6 * SS))
            idr.ellipse([bx - 5 * SS, by - 5 * SS, bx + 5 * SS, by + 5 * SS], fill=rgba("FFF8C4", 245))
    else:
        for k in range(16):
            ang = math.radians(k * 22.5)
            w_a = 0.082 if k % 2 == 0 else 0.042
            idr.polygon([
                (fx, fy),
                (fx + math.cos(ang - w_a) * 400 * SS, fy + math.sin(ang - w_a) * 400 * SS),
                (fx + math.cos(ang + w_a) * 400 * SS, fy + math.sin(ang + w_a) * 400 * SS),
            ], fill=rgba(sp["ray_b"], 125 if k % 2 == 0 else 68))

    spot = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(spot)
    sd.ellipse([fx - 118 * SS, fy - 118 * SS, fx + 118 * SS, fy + 118 * SS], fill=rgba(sp["accent"], 96))
    spot = spot.filter(ImageFilter.GaussianBlur(radius=18 * SS))
    interior.alpha_composite(spot)

    # 下半幅深靛黑曜战技铭牌底舱
    lower_poly = [(0, y_side), (cx, y_tip), (W, y_side), (W, H), (0, H)]
    idr.polygon(lower_poly, fill=rgba("070E20", 255))
    idr.polygon([(0, y_side + 11 * SS), (cx, y_tip + 11 * SS), (W, y_side + 11 * SS), (W, H), (0, H)], fill=rgba("0C1732", 255))

    # V字双轨金属霓虹分界梁
    idr.line([(0, y_side - 5 * SS), (cx, y_tip - 5 * SS), (W, y_side - 5 * SS)], fill=rgba("050914", 255), width=int(10.0 * SS), joint="curve")
    idr.line([(0, y_side - 6 * SS), (cx, y_tip - 6 * SS), (W, y_side - 6 * SS)], fill=rgba(sp["chev_rim"], 255), width=int(3.8 * SS), joint="curve")
    idr.line([(0, y_side + 3 * SS), (cx, y_tip + 3 * SS), (W, y_side + 3 * SS)], fill=rgba(sp["rim_inner"], 195), width=int(2.0 * SS), joint="curve")

    b_hw, b_hh, b_ch = in_hw - 6.5 * SS, in_hh - 6.5 * SS, in_ch - 3.0 * SS
    low_pts = [
        (cx - b_hw, y_side + 6 * SS),
        (cx - b_hw, cy + b_hh - b_ch),
        (cx - b_hw + b_ch, cy + b_hh),
        (cx + b_hw - b_ch, cy + b_hh),
        (cx + b_hw, cy + b_hh - b_ch),
        (cx + b_hw, y_side + 6 * SS),
    ]
    idr.line(low_pts, fill=rgba(sp["chev_rim"], 145), width=int(1.8 * SS), joint="curve")
    dr_gem = 5.5 * SS
    gy = cy + b_hh - 9 * SS
    idr.polygon([(cx, gy - dr_gem), (cx + dr_gem, gy), (cx, gy + dr_gem), (cx - dr_gem, gy)], fill=rgba(sp["accent"], 240))

    clipped = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    clipped.paste(interior, (0, 0), mask)
    base.alpha_composite(clipped)

    for sx_s in (-1, 1):
        px = cx + sx_s * (in_hw - 12 * SS)
        py = cy - in_hh + 12 * SS
        r = 4.2 * SS
        dr.polygon([(px, py - r), (px + r, py), (px, py + r), (px - r, py)], fill=rgba("FFF8D6", 245))

    return base.resize((w_out, h_out), Image.Resampling.LANCZOS)


def main():
    build_drawer_header_v().save(os.path.join(OUT_DIR, "drawer_header_v.png"), optimize=True)
    build_perk_banner().save(os.path.join(OUT_DIR, "perk_banner.png"), optimize=True)
    for k in CARD_SPECS:
        build_perk_card(k).save(os.path.join(OUT_DIR, f"perk_card_{k}.png"), optimize=True)
    print("Generated drawer_header_v, perk_banner, and 5 polished perk_card_* skins in", OUT_DIR)


if __name__ == "__main__":
    main()
