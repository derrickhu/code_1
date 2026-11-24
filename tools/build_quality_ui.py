#!/usr/bin/env python3
"""生成全游统一的清爽扁平 2D 卡通矢量五阶品质框套件（统一 #2B2338 暖深描边 + 利落几何角标 + 干净二阶赛璐珞斜向清透光泽，零杂乱放射光/零厚重金属浮雕）。

输出到 Assets/Resources/Art/ui/（不写入 panel.png / row.png / dark.png，严格交由 build_modal_ui.py 统一维护九宫格尺寸！）：
  - card_{grey,blue,purple,orange,red,lock}.png   (240x288, 9-slice 52,52,52,52)
  - slot_{grey,blue,purple,orange,red,wood}.png   (176x176, 9-slice 44,44,44,44)
  - eqcard_{grey,blue,purple,orange,red}.png      (200x172, 9-slice 44,48,44,44)
  - power_crest.png                               (392x92,  9-slice 96,0,96,0)
  - tag_red.png                                   (156x60)
"""
import os
import math
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


def sd_rrect(x: np.ndarray, y: np.ndarray, cx: float, cy: float, hw: float, hh: float, r: float) -> np.ndarray:
    qx = np.abs(x - cx) - (hw - r)
    qy = np.abs(y - cy) - (hh - r)
    return np.hypot(np.maximum(qx, 0.0), np.maximum(qy, 0.0)) + np.minimum(np.maximum(qx, qy), 0.0) - r


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


# 扁平 2D 赛璐珞五阶品质色板（全系共享 #2B2338 暖深褐轮廓线，明亮通透不抢角色）
THEMES = {
    "grey": {
        "tier": 0,
        "ink": "2B2338",
        "rim_top": "C9D6E2",
        "rim_bot": "94A6B8",
        "lip": "687A8C",
        "rim_hi": "F2F7FC",
        "bg_top": "8FA2B6",
        "bg_bot": "788CA0",
        "sheen": "DCE8F4",
        "gem_hi": "FFFFFF",
        "gem_mid": "B2C4D6",
    },
    "blue": {
        "tier": 1,
        "ink": "2B2338",
        "rim_top": "76CCFA",
        "rim_bot": "3C98EC",
        "lip": "2268B0",
        "rim_hi": "E4F8FF",
        "bg_top": "5EB2F2",
        "bg_bot": "4294DF",
        "sheen": "D6F2FF",
        "gem_hi": "FFFFFF",
        "gem_mid": "45C4FF",
    },
    "purple": {
        "tier": 2,
        "ink": "2B2338",
        "rim_top": "C28AFF",
        "rim_bot": "8E54E8",
        "lip": "5E2CA8",
        "rim_hi": "F8EAFF",
        "bg_top": "9F6EF0",
        "bg_bot": "7E4CD4",
        "sheen": "EED8FF",
        "gem_hi": "FFFFFF",
        "gem_mid": "D488FF",
    },
    "orange": {
        "tier": 3,
        "ink": "2B2338",
        "rim_top": "FFE066",
        "rim_bot": "F2A622",
        "lip": "B86C0C",
        "rim_hi": "FFFCE0",
        "bg_top": "F6BE42",
        "bg_bot": "DF961E",
        "sheen": "FFF4B8",
        "gem_hi": "FFFFF2",
        "gem_mid": "FF6830",
    },
    "red": {
        "tier": 4,
        "ink": "2B2338",
        "rim_top": "FF8674",
        "rim_bot": "E64236",
        "lip": "9E1E1A",
        "rim_hi": "FFF0B8",
        "bg_top": "EE5848",
        "bg_bot": "CC342A",
        "sheen": "FFD8CE",
        "gem_hi": "FFFFEA",
        "gem_mid": "FFD23C",
    },
    "lock": {
        "tier": -1,
        "ink": "2B2338",
        "rim_top": "647688",
        "rim_bot": "485868",
        "lip": "323E4C",
        "rim_hi": "8CA0B4",
        "bg_top": "3A4A5A",
        "bg_bot": "2E3B4A",
        "sheen": "566A7E",
        "gem_hi": "8FA2B4",
        "gem_mid": "526476",
    },
    "wood": {
        "tier": 0,
        "ink": "2B2338",
        "rim_top": "E8BE82",
        "rim_bot": "C49052",
        "lip": "8C5E2A",
        "rim_hi": "FFF2D6",
        "bg_top": "CA985C",
        "bg_bot": "AC7C42",
        "sheen": "F4D8A8",
        "gem_hi": "FFF6DC",
        "gem_mid": "DDA85C",
    },
}


def draw_flat2d_corner_badges(W: int, H: int, pad: float, th: dict, is_card: bool = True, bottom_inset: float = 0.0) -> Image.Image:
    """绘制清爽利落的扁平 2D 矢量几何角标（全部严格在 9-slice 角保护区内，#2B2338 描边 + 二阶赛璐珞色块）。"""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    tier = th["tier"]
    s = min(W, H) / (240.0 if is_card else 180.0)
    ink = hex_rgba(th["ink"], 255)
    hi = hex_rgba(th["rim_hi"], 255)
    top_c = hex_rgba(th["rim_top"], 255)
    gem_c = hex_rgba(th["gem_mid"], 255)

    left, top = pad, pad
    right, bot = W - pad, H - pad

    if tier <= 0:
        if th is THEMES["wood"]:
            off = pad + 8.5 * s
            for cx, cy in [(off, off), (right - 8.5 * s, off), (off, bot - 8.5 * s), (right - 8.5 * s, bot - 8.5 * s)]:
                r = 3.2 * s
                dr.ellipse([cx - r - 1.4 * s, cy - r - 1.4 * s, cx + r + 1.4 * s, cy + r + 1.4 * s], fill=ink)
                dr.ellipse([cx - r, cy - r, cx + r, cy + r], fill=hi)
        return im

    if tier == 1:
        # 稀有(蓝)：清爽扁平小菱点角标
        for sx_sgn, sy_sgn in [(-1, -1), (1, -1), (-1, 1), (1, 1)]:
            cx = left + 9.5 * s if sx_sgn < 0 else right - 9.5 * s
            cy = top + 9.5 * s if sy_sgn < 0 else bot - 9.5 * s
            r_out, r_in = 5.6 * s, 3.6 * s
            dr.polygon([(cx, cy - r_out), (cx + r_out, cy), (cx, cy + r_out), (cx - r_out, cy)], fill=ink)
            dr.polygon([(cx, cy - r_in), (cx + r_in, cy), (cx, cy + r_in), (cx - r_in, cy)], fill=hi)

    elif tier == 2:
        # 史诗(紫)：利落扁平 2D 折角翼 + 四角星钻
        for sx_sgn, sy_sgn in [(-1, -1), (1, -1), (-1, 1), (1, 1)]:
            cx = left + 6.5 * s if sx_sgn < 0 else right - 6.5 * s
            cy = top + 6.5 * s if sy_sgn < 0 else bot - 6.5 * s
            dx, dy = -sx_sgn, -sy_sgn
            arm = 28.0 * s
            pts_ink = [
                (cx - dx * 2.0 * s, cy - dy * 2.0 * s),
                (cx + dx * arm, cy - dy * 1.5 * s),
                (cx + dx * (arm - 5.5 * s), cy + dy * 5.5 * s),
                (cx + dx * 9.5 * s, cy + dy * 9.5 * s),
                (cx + dx * 5.5 * s, cy + dy * (arm - 5.5 * s)),
                (cx - dx * 1.5 * s, cy + dy * arm),
            ]
            pts_fill = [
                (cx, cy),
                (cx + dx * (arm - 2.2 * s), cy + dy * 0.4 * s),
                (cx + dx * (arm - 6.8 * s), cy + dy * 3.8 * s),
                (cx + dx * 7.8 * s, cy + dy * 7.8 * s),
                (cx + dx * 3.8 * s, cy + dy * (arm - 6.8 * s)),
                (cx + dy * 0.4 * s, cy + dy * (arm - 2.2 * s)),
            ]
            dr.polygon(pts_ink, fill=ink)
            dr.polygon(pts_fill, fill=hi)
            gx, gy = cx + dx * 5.8 * s, cy + dy * 5.8 * s
            ro, ri = 6.8 * s, 4.4 * s
            dr.polygon([(gx, gy - ro), (gx + ro, gy), (gx, gy + ro), (gx - ro, gy)], fill=ink)
            dr.polygon([(gx, gy - ri), (gx + ri, gy), (gx, gy + ri), (gx - ri, gy)], fill=gem_c)

    elif tier >= 3:
        # 传说(橙)/绝世(红)：扁平 2D 几何双翼金冠角标（#2B2338 锐利轮廓 + 金黄/亮白二阶色块 + 扁平切面宝石）
        gold_fill = hex_rgba("FFD84D", 255)
        gold_hi = hex_rgba("FFF9CA", 255)
        for sx_sgn, sy_sgn in [(-1, -1), (1, -1), (-1, 1), (1, 1)]:
            cx = left + 6.0 * s if sx_sgn < 0 else right - 6.0 * s
            cy = top + 6.0 * s if sy_sgn < 0 else bot - 6.0 * s
            dx, dy = -sx_sgn, -sy_sgn
            arm = (35.0 if tier == 3 else 37.0) * s
            wing_ink = [
                (cx - dx * 3.0 * s, cy - dy * 3.0 * s),
                (cx + dx * arm, cy - dy * 2.2 * s),
                (cx + dx * (arm - 6.0 * s), cy + dy * 6.2 * s),
                (cx + dx * 18.0 * s, cy + dy * 6.8 * s),
                (cx + dx * 11.5 * s, cy + dy * 11.5 * s),
                (cx + dx * 6.8 * s, cy + dy * 18.0 * s),
                (cx + dx * 6.2 * s, cy + dy * (arm - 6.0 * s)),
                (cx - dx * 2.2 * s, cy + dy * arm),
            ]
            wing_body = [
                (cx - dx * 0.8 * s, cy - dy * 0.8 * s),
                (cx + dx * (arm - 2.4 * s), cy - dy * 0.2 * s),
                (cx + dx * (arm - 7.4 * s), cy + dy * 4.2 * s),
                (cx + dx * 16.0 * s, cy + dy * 4.8 * s),
                (cx + dx * 9.8 * s, cy + dy * 9.8 * s),
                (cx + dx * 4.8 * s, cy + dy * 16.0 * s),
                (cx + dx * 4.2 * s, cy + dy * (arm - 7.4 * s)),
                (cx - dx * 0.2 * s, cy + dy * (arm - 2.4 * s)),
            ]
            wing_top = [
                (cx, cy),
                (cx + dx * 24.0 * s, cy + dy * 0.6 * s),
                (cx + dx * 8.0 * s, cy + dy * 8.0 * s),
                (cx + dx * 0.6 * s, cy + dy * 24.0 * s),
            ]
            dr.polygon(wing_ink, fill=ink)
            dr.polygon(wing_body, fill=gold_fill)
            dr.polygon(wing_top, fill=gold_hi)

            gx, gy = cx + dx * 5.8 * s, cy + dy * 5.8 * s
            ro, rm, ri = 8.8 * s, 6.6 * s, 4.4 * s
            dr.polygon([(gx, gy - ro), (gx + ro, gy), (gx, gy + ro), (gx - ro, gy)], fill=ink)
            dr.polygon([(gx, gy - rm), (gx + rm, gy), (gx, gy + rm), (gx - rm, gy)], fill=gold_hi)
            dr.polygon([(gx, gy - ri), (gx + ri, gy), (gx, gy + ri), (gx - ri, gy)], fill=gem_c)
            dr.polygon([(gx, gy - ri), (gx + ri * 0.6, gy - ri * 0.1), (gx - ri * 0.1, gy - ri * 0.6), (gx - ri, gy)], fill=(255, 255, 255, 220))

        # 顶边中央精致小菱冠（仅卡牌和装备卡不拉伸宽度或等比显示时自然居中）
        if not is_card and bottom_inset <= 0.0:
            pass
        else:
            tcx, tcy = W * 0.5, top + 5.2 * s
            dr.polygon([(tcx - 13 * s, tcy), (tcx, tcy - 7.2 * s), (tcx + 13 * s, tcy), (tcx, tcy + 7.2 * s)], fill=ink)
            dr.polygon([(tcx - 10.6 * s, tcy), (tcx, tcy - 5.2 * s), (tcx + 10.6 * s, tcy), (tcx, tcy + 5.2 * s)], fill=gold_hi)
            dr.polygon([(tcx - 5.2 * s, tcy), (tcx, tcy - 3.0 * s), (tcx + 5.2 * s, tcy), (tcx, tcy + 3.0 * s)], fill=gem_c)

    return im


def render_quality_box(
    w_out: int,
    h_out: int,
    theme_key: str,
    corner_r: float = 22.0,
    border_w: float = 8.5,
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
    rad = corner_r * SS
    bw = border_w * SS

    canvas = np.zeros((H, W, 4), dtype=np.float32)

    # 1. 扁平 2D 实心立体底唇（替代糊黑投影）
    sd_outer = sd_rrect(xx, yy, cx, cy, hw, hh, rad)
    sd_lip = sd_rrect(xx, yy - 3.0 * SS, cx, cy, hw, hh, rad)
    sd_union = np.minimum(sd_outer, sd_lip)
    ink_t = 2.4 * SS

    canvas = over(canvas, hex_rgb(th["ink"]), aa_cov(sd_union, 1.2))
    canvas = over(canvas, hex_rgb(th["lip"]), aa_cov(sd_lip + ink_t, 1.2))

    # 2. 扁平 2D 二阶赛璐珞外框 + 顶沿清透亮丝
    sd_rim = sd_outer + ink_t
    vy = np.clip((yy - (cy - hh)) / (2.0 * hh), 0.0, 1.0)
    cel_rim = np.clip((vy - 0.45) / 0.05, 0.0, 1.0)[..., None]
    rim_rgb = hex_rgb(th["rim_top"]) * (1.0 - cel_rim) + hex_rgb(th["rim_bot"]) * cel_rim
    canvas = over(canvas, rim_rgb, aa_cov(sd_rim, 1.2))

    d_rim_dn = np.roll(sd_rim, int(round(2.0 * SS)), axis=0)
    d_rim_dn[:int(round(2.0 * SS)), :] = 1e9
    top_hi = aa_cov(sd_rim, 1.2) * np.clip(d_rim_dn + 0.5, 0.0, 1.0) * np.clip(1.0 - vy * 3.0, 0.0, 1.0)
    canvas = over(canvas, hex_rgb(th["rim_hi"]), top_hi * 0.85)

    # 3. 锐利内描边 + 清爽扁平 2D 舞台底色（零杂乱放射光、零星尘噪点！）
    sd_inner_ink = sd_outer + bw
    canvas = over(canvas, hex_rgb(th["ink"]), aa_cov(sd_inner_ink, 1.2))

    sd_bg = sd_inner_ink + 2.0 * SS
    a_bg = aa_cov(sd_bg, 1.2)

    # 干净柔和的二阶色底 + 标志性扁平 2D 斜向玻璃清透光带
    bg_rgb = hex_rgb(th["bg_top"]) * (1.0 - vy * 0.75)[..., None] + hex_rgb(th["bg_bot"]) * (vy * 0.75)[..., None]
    diag = (xx - cx) / (2.0 * hw) + (yy - cy) / (2.0 * hh)
    band1 = np.clip(1.0 - np.abs(diag + 0.16) / 0.095, 0.0, 1.0)
    band1 = np.clip((band1 - 0.35) / 0.12, 0.0, 1.0) * (0.20 if tier >= 0 else 0.08)
    band2 = np.clip(1.0 - np.abs(diag - 0.03) / 0.042, 0.0, 1.0)
    band2 = np.clip((band2 - 0.35) / 0.15, 0.0, 1.0) * (0.13 if tier >= 0 else 0.05)
    sheen_m = np.clip(band1 + band2, 0.0, 0.26)[..., None]
    bg_rgb = bg_rgb * (1.0 - sheen_m) + hex_rgb(th["sheen"]) * sheen_m

    # 顶沿 1.5px 内高光细边
    d_bg_dn = np.roll(sd_bg, int(round(1.6 * SS)), axis=0)
    d_bg_dn[:int(round(1.6 * SS)), :] = 1e9
    in_top_hi = a_bg * np.clip(d_bg_dn + 0.5, 0.0, 1.0) * np.clip(1.0 - vy * 3.0, 0.0, 1.0) * 0.48
    bg_rgb = bg_rgb * (1.0 - in_top_hi[..., None]) + hex_rgb(th["rim_hi"]) * in_top_hi[..., None]

    canvas = over(canvas, bg_rgb, a_bg)

    # 4. 装备卡底部扁平 2D 镶孔底座
    if socket_dock_h > 0:
        dock_top_y = (cy + hh) - (border_w + socket_dock_h) * SS
        in_dock = np.clip((yy - dock_top_y) / 1.3, 0.0, 1.0) * a_bg
        dock_c = hex_rgb("1E2D3E") if tier <= 2 else hex_rgb("2A211C")
        canvas = over(canvas, np.broadcast_to(dock_c, (H, W, 3)), in_dock * 0.94)

        bar_ink = aa_cov(np.abs(yy - dock_top_y) - 2.2 * SS, 1.2) * a_bg
        bar_hi = aa_cov(np.abs(yy - dock_top_y) - 0.9 * SS, 1.2) * a_bg
        canvas = over(canvas, hex_rgb(th["ink"]), bar_ink)
        canvas = over(canvas, hex_rgb(th["rim_top"]), bar_hi)

    # 5. 扁平 2D 几何角标
    orn = draw_flat2d_corner_badges(W, H, pad, th, is_card=is_card, bottom_inset=socket_dock_h)
    canvas = pil_over(canvas, orn)

    out = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
    return out.resize((w_out, h_out), Image.Resampling.LANCZOS)


def build_power_crest() -> Image.Image:
    """392x92 (9-slice 96,0,96,0) 扁平 2D 矢量六角战力铭牌 (`ui/power_crest.png`)。"""
    w_out, h_out, SS = 392, 92, 4
    W, H = w_out * SS, h_out * SS
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)

    def poly(inset: float, dy: float = 0.0):
        i = inset * SS
        d = dy * SS
        return [
            (26 * SS + i * 0.9, H * 0.50 + d),
            (62 * SS + i * 0.5, 11 * SS + i + d),
            (W - 62 * SS - i * 0.5, 11 * SS + i + d),
            (W - 26 * SS - i * 0.9, H * 0.50 + d),
            (W - 56 * SS - i * 0.5, H - 14 * SS - i + d),
            (56 * SS + i * 0.5, H - 14 * SS - i + d),
        ]

    # 扁平 2D 立体底沿 + #2B2338 描边 + 青蓝内芯 + 左右菱形金铆钉
    dr.polygon(poly(0.0, 3.5), fill=hex_rgba("2B2338", 255))
    dr.polygon(poly(2.6, 3.5), fill=hex_rgba("1B3348", 255))
    dr.polygon(poly(0.0, 0.0), fill=hex_rgba("2B2338", 255))
    dr.polygon(poly(2.6, 0.0), fill=hex_rgba("8CC0DE", 255))
    dr.polygon(poly(5.4, 0.0), fill=hex_rgba("2B2338", 255))
    dr.polygon(poly(7.4, 0.0), fill=hex_rgba("294C68", 255))

    for sx in [58 * SS, W - 58 * SS]:
        sy = H * 0.49
        ro, ri = 6.8 * SS, 4.4 * SS
        dr.polygon([(sx, sy - ro), (sx + ro, sy), (sx, sy + ro), (sx - ro, sy)], fill=hex_rgba("2B2338", 255))
        dr.polygon([(sx, sy - ri), (sx + ri, sy), (sx, sy + ri), (sx - ri, sy)], fill=hex_rgba("FFE27A", 255))

    return im.resize((w_out, h_out), Image.Resampling.LANCZOS)


def build_tag_red() -> Image.Image:
    """156x60 扁平 2D 矢量燕尾红旗标 (`ui/tag_red.png`) 用于『出战中』。"""
    w_out, h_out, SS = 156, 60, 4
    W, H = w_out * SS, h_out * SS
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)

    def poly(inset: float = 0.0, dy: float = 0.0):
        i = inset * SS
        d = dy * SS
        return [
            (6 * SS + i, 9 * SS + i + d),
            (W - 9 * SS - i * 1.2, 9 * SS + i + d),
            (W - 25 * SS - i * 0.8, H * 0.48 + d),
            (W - 9 * SS - i * 1.2, H - 13 * SS - i + d),
            (6 * SS + i, H - 13 * SS - i + d),
        ]

    dr.polygon(poly(0.0, 2.8), fill=hex_rgba("2B2338", 255))
    dr.polygon(poly(2.2, 2.8), fill=hex_rgba("9E2220", 255))
    dr.polygon(poly(0.0, 0.0), fill=hex_rgba("2B2338", 255))
    dr.polygon(poly(2.2, 0.0), fill=hex_rgba("FFE288", 255))
    dr.polygon(poly(4.4, 0.0), fill=hex_rgba("EC4A3E", 255))
    dr.polygon([(10 * SS, 13 * SS), (W - 15 * SS, 13 * SS), (W - 25 * SS, H * 0.46), (10 * SS, H * 0.46)], fill=(255, 132, 118, 115))
    dr.rectangle([6 * SS, 7 * SS, 13 * SS, H - 11 * SS], fill=hex_rgba("FFE28A", 255), outline=hex_rgba("2B2338", 255), width=int(2.2 * SS))

    return im.resize((w_out, h_out), Image.Resampling.LANCZOS)


def main():
    for k in ["grey", "blue", "purple", "orange", "red", "lock"]:
        im = render_quality_box(240, 288, k, corner_r=22.0, border_w=9.2 if THEMES[k]["tier"] >= 2 else 8.0, pad_px=3.5, is_card=True)
        im.save(os.path.join(OUT_DIR, f"card_{k}.png"), optimize=True)

    for k in ["grey", "blue", "purple", "orange", "red", "wood"]:
        im = render_quality_box(176, 176, k, corner_r=22.0, border_w=8.4 if THEMES[k]["tier"] >= 2 else 7.2, pad_px=3.5, is_card=False)
        im.save(os.path.join(OUT_DIR, f"slot_{k}.png"), optimize=True)

    for k in ["grey", "blue", "purple", "orange", "red"]:
        im = render_quality_box(200, 172, k, corner_r=20.0, border_w=8.0 if THEMES[k]["tier"] >= 2 else 6.8, pad_px=3.5, is_card=False, socket_dock_h=34.0)
        im.save(os.path.join(OUT_DIR, f"eqcard_{k}.png"), optimize=True)

    build_power_crest().save(os.path.join(OUT_DIR, "power_crest.png"), optimize=True)
    build_tag_red().save(os.path.join(OUT_DIR, "tag_red.png"), optimize=True)
    print("Generated all flat-2D 5-tier quality frames in", OUT_DIR)


if __name__ == "__main__":
    main()
