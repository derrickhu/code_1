"""生成排行榜专属 4x 超采样扁平 2D 矢量 UI 组件皮肤（统一 #2B2338 暖深描边 + 利落二阶赛璐珞填充 + 平涂高台与勋章）。"""
import os
import math
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets/Resources/Art/ui")
SS = 4


def rgb(h: str) -> np.ndarray:
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def sdf_rrect(x: np.ndarray, y: np.ndarray, cx: float, cy: float, hw: float, hh: float, r: float) -> np.ndarray:
    dx = np.abs(x - cx) - (hw - r)
    dy = np.abs(y - cy) - (hh - r)
    outside = np.hypot(np.maximum(dx, 0.0), np.maximum(dy, 0.0))
    inside = np.minimum(np.maximum(dx, dy), 0.0)
    return outside + inside - r


def sdf_trapezoid(x: np.ndarray, y: np.ndarray, cx: float, y0: float, y1: float, hw0: float, hw1: float, r: float) -> np.ndarray:
    h = max(1.0, y1 - y0)
    t = np.clip((y - y0) / h, 0.0, 1.0)
    hw = hw0 + (hw1 - hw0) * t
    dx = np.abs(x - cx) - (hw - r)
    dy = np.maximum(y0 + r - y, y - (y1 - r))
    outside = np.hypot(np.maximum(dx, 0.0), np.maximum(dy, 0.0))
    inside = np.minimum(np.maximum(dx, dy), 0.0)
    return outside + inside - r


def blend(dst: np.ndarray, col: np.ndarray, mask: np.ndarray) -> np.ndarray:
    m = np.clip(mask, 0.0, 1.0)[:, :, None]
    return dst * (1.0 - m) + col * m


def make_podium(tier: int) -> Image.Image:
    c_stroke = rgb("2B2338")
    if tier == 1:
        bw, bh = 368, 248
        c_deck, c_cap, c_cap_lip = rgb("FFF2AA"), rgb("FFD24C"), rgb("C88418")
        c_body, c_frame, c_plaque, c_stud = rgb("DA4C50"), rgb("FFD866"), rgb("BD383E"), rgb("FFF8C8")
    elif tier == 2:
        bw, bh = 320, 208
        c_deck, c_cap, c_cap_lip = rgb("EDF8FF"), rgb("B2D6F4"), rgb("6A92B8")
        c_body, c_frame, c_plaque, c_stud = rgb("5C88BE"), rgb("D4ECFF"), rgb("4B74A6"), rgb("FFFFFF")
    else:
        bw, bh = 320, 194
        c_deck, c_cap, c_cap_lip = rgb("FFECDA"), rgb("E4A876"), rgb("9C5E36")
        c_body, c_frame, c_plaque, c_stud = rgb("B6744C"), rgb("F2BE90"), rgb("9A5E3A"), rgb("FFF4E6")

    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = (w - 1) * 0.5

    deck_y0, deck_y1 = 8 * SS, 36 * SS
    cap_y0, cap_y1 = 28 * SS, 52 * SS
    body_y0, body_y1 = 46 * SS, (bh - 2) * SS

    d_deck = sdf_trapezoid(x, y, cx, deck_y0, deck_y1, (bw * 0.415) * SS, (bw * 0.478) * SS, 6 * SS)
    d_cap = sdf_rrect(x, y, cx, (cap_y0 + cap_y1) * 0.5, (bw * 0.482) * SS, (cap_y1 - cap_y0) * 0.5, 6.5 * SS)
    d_body = sdf_trapezoid(x, y, cx, body_y0, body_y1, (bw * 0.448) * SS, (bw * 0.456) * SS, 6 * SS)

    d_all = np.minimum(np.minimum(d_deck, d_cap), d_body)
    alpha = np.clip(0.5 - d_all, 0.0, 1.0)
    col = np.broadcast_to(c_stroke, (h, w, 3)).copy()
    st = 2.8 * SS

    m_body = np.clip(0.5 - (d_body + st), 0.0, 1.0)
    eave_step = 1.0 - np.clip((y - (cap_y1 + 6 * SS)) / (2.5 * SS), 0.0, 1.0)
    body_col = c_body[None, None, :] * (1.0 - eave_step[:, :, None] * 0.22)
    col = blend(col, body_col, m_body)

    pw = (bw * 0.448 - 18) * SS
    py0, py1 = body_y0 + 14 * SS, body_y1 - 8 * SS
    pcy, phh = (py0 + py1) * 0.5, (py1 - py0) * 0.5
    d_fr_out = sdf_rrect(x, y, cx, pcy, pw, phh, 8 * SS)
    d_fr_mid = sdf_rrect(x, y, cx, pcy, pw - 2.6 * SS, phh - 2.6 * SS, 6.5 * SS)
    d_fr_in = sdf_rrect(x, y, cx, pcy, pw - 5.4 * SS, phh - 5.4 * SS, 5.0 * SS)
    col = blend(col, c_stroke[None, None, :], np.clip(0.5 - d_fr_out, 0.0, 1.0) * m_body)
    col = blend(col, c_frame[None, None, :], np.clip(0.5 - d_fr_mid, 0.0, 1.0) * m_body)
    col = blend(col, c_plaque[None, None, :], np.clip(0.5 - d_fr_in, 0.0, 1.0) * m_body)

    for sx in (-1, 1):
        for sy in (-1, 1):
            rx, ry = cx + sx * (pw - 10 * SS), pcy + sy * (phh - 10 * SS)
            col = blend(col, c_stud[None, None, :], np.clip(0.5 - (np.hypot(x - rx, y - ry) - 2.6 * SS), 0.0, 1.0) * m_body)

    col = blend(col, c_deck[None, None, :], np.clip(0.5 - (d_deck + st), 0.0, 1.0))
    col = blend(col, c_stroke[None, None, :], np.clip(0.5 - d_cap, 0.0, 1.0))
    m_cap = np.clip(0.5 - (d_cap + st), 0.0, 1.0)
    tc = np.clip((y - cap_y0) / max(1.0, cap_y1 - cap_y0), 0.0, 1.0)[:, :, None]
    cap_col = np.where(tc > 0.68, c_cap_lip[None, None, :], c_cap[None, None, :])
    col = blend(col, cap_col, m_cap)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_medal(tier: int) -> Image.Image:
    bw = bh = 96 if tier == 1 else 88
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.52

    c_str = rgb("2B2338")
    if tier == 1:
        c_wing, c_rim, c_core_top, c_core_bot = rgb("FFE882"), rgb("FFF6BE"), rgb("FFC838"), rgb("DF9214")
    elif tier == 2:
        c_wing, c_rim, c_core_top, c_core_bot = rgb("DCEEFF"), rgb("FFFFFF"), rgb("8EBEEC"), rgb("5888BC")
    else:
        c_wing, c_rim, c_core_top, c_core_bot = rgb("FAD8BE"), rgb("FFF0E2"), rgb("DC9664"), rgb("A66036")

    d_wings = np.full((h, w), 1e9, dtype=np.float32)
    R = bw * 0.30 * SS
    for side in (-1.0, 1.0):
        for ang_deg, ox, oy, rx, ry in [(-24, 0.34, 0.08, 0.14, 0.060), (4, 0.37, -0.05, 0.155, 0.062), (30, 0.33, -0.18, 0.145, 0.058)]:
            px, py = cx + side * bw * ox * SS, cy + bh * oy * SS
            rad = math.radians(ang_deg * side)
            ca, sa = math.cos(rad), math.sin(rad)
            ux = (x - px) * ca + (y - py) * sa
            uy = -(x - px) * sa + (y - py) * ca
            de = (np.hypot(ux / (bw * rx * SS), uy / (bh * ry * SS)) - 1.0) * min(bw * rx, bh * ry) * SS
            d_wings = np.minimum(d_wings, de)

    d_disc = np.hypot(x - cx, y - cy) - R
    d_all = np.minimum(d_wings, d_disc)
    a_main = np.clip(0.5 - d_all, 0.0, 1.0)

    st = 2.8 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_wing[None, None, :], np.clip(0.5 - (d_wings + st), 0.0, 1.0))
    col = blend(col, c_str[None, None, :], np.clip(0.5 - d_disc, 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_disc + st), 0.0, 1.0))
    col = blend(col, c_str[None, None, :], np.clip(0.5 - (d_disc + 6.8 * SS), 0.0, 1.0))

    yn = np.clip(y / h, 0.0, 1.0)
    cel = np.clip((yn - 0.50) / 0.06, 0.0, 1.0)[:, :, None]
    core_col = c_core_top[None, None, :] * (1.0 - cel) + c_core_bot[None, None, :] * cel
    col = blend(col, core_col, np.clip(0.5 - (d_disc + 9.0 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_arch() -> Image.Image:
    bw, bh = 1080, 112
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = (w - 1) * 0.5
    nx = (x - cx) / max(1.0, cx)

    arch_y = (20.0 + 28.0 * (nx ** 2)) * SS
    signed = arch_y - y
    a_body = np.clip(0.5 - signed, 0.0, 1.0)

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("2B2338")[None, None, :], a_body)
    col = blend(col, rgb("6696BE")[None, None, :], np.clip(0.5 - (signed + 2.8 * SS), 0.0, 1.0))
    tb = np.clip((y - arch_y) / np.maximum(1.0, h - arch_y), 0.0, 1.0)[:, :, None]
    body = rgb("355F84")[None, None, :] * (1.0 - tb) + rgb("2F5678")[None, None, :] * tb
    col = blend(col, body, np.clip(0.5 - (signed + 7.5 * SS), 0.0, 1.0))

    gold_y = arch_y + 15.0 * SS
    fade = np.clip((0.78 - np.abs(nx)) / 0.20, 0.0, 1.0)
    g_line = np.clip(1.0 - np.abs(y - gold_y) / (1.5 * SS), 0.0, 1.0) * fade
    col = blend(col, rgb("FFD862")[None, None, :], g_line * 0.92 * a_body)

    cy_gem = 35.0 * SS
    star = ((np.abs(x - cx) / (14.0 * SS)) ** 0.72 + (np.abs(y - cy_gem) / (10.0 * SS)) ** 0.72) - 1.0
    col = blend(col, rgb("FFF6BE")[None, None, :], np.clip(0.5 - star * 10.0 * SS, 0.0, 1.0) * a_body)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_body * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_well() -> Image.Image:
    bw = bh = 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    d = sdf_rrect(x, y, cx, cy, 122 * SS, 122 * SS, 30 * SS)
    a = np.clip(0.5 - d, 0.0, 1.0)

    col = np.broadcast_to(rgb("457298"), (h, w, 3)).copy()
    m_in = np.clip(0.5 - (d + 2.6 * SS), 0.0, 1.0)
    top_step = 1.0 - np.clip((y - 12 * SS) / (3 * SS), 0.0, 1.0)
    fill = rgb("22415E")[None, None, :] * (1.0 - top_step[:, :, None] * 0.4) + rgb("183048")[None, None, :] * (top_step[:, :, None] * 0.4)
    col = blend(col, fill, m_in)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_row_card(me: bool) -> Image.Image:
    bw, bh = (256, 152) if me else (256, 144)
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 2.2 * SS
    hw, hh, r = 122 * SS, (bh * 0.5 - 7) * SS, 22 * SS

    c_str = rgb("2B2338")
    if me:
        c_lip, c_rim, c_face = rgb("CA8E26"), rgb("FFF8CE"), rgb("FCE08C")
    else:
        c_lip, c_rim, c_face = rgb("D4C5AA"), rgb("FFFFFF"), rgb("FAF4E8")

    d_face = sdf_rrect(x, y, cx, cy, hw, hh, r)
    d_lip = sdf_rrect(x, y - 4.8 * SS, cx, cy, hw, hh, r)
    d_u = np.minimum(d_face, d_lip)
    a_main = np.clip(0.5 - d_u, 0.0, 1.0)

    st = 2.4 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))
    col = blend(col, c_face[None, None, :], np.clip(0.5 - (d_face + 4.8 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_scroll_header() -> Image.Image:
    bw, bh = 560, 116
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.46

    d_tails = np.full((h, w), 1e9, dtype=np.float32)
    for side in (-1.0, 1.0):
        tx, ty = cx + side * 218 * SS, cy + 12 * SS
        dt = sdf_rrect(x, y, tx, ty, 48 * SS, 30 * SS, 8 * SS)
        dn = (np.abs(x - (cx + side * 268 * SS)) * 0.9 + np.abs(y - ty) * 1.25) - 20 * SS
        d_tails = np.minimum(d_tails, np.maximum(dt, -dn))

    d_main = sdf_rrect(x, y, cx, cy - 2 * SS, 198 * SS, 35 * SS, 13 * SS)
    d_main_lip = sdf_rrect(x, y - 4.5 * SS, cx, cy - 2 * SS, 198 * SS, 35 * SS, 13 * SS)
    d_m_u = np.minimum(d_main, d_main_lip)
    d_folds = np.minimum(
        sdf_rrect(x, y, cx - 188 * SS, cy + 16 * SS, 18 * SS, 22 * SS, 6 * SS),
        sdf_rrect(x, y, cx + 188 * SS, cy + 16 * SS, 18 * SS, 22 * SS, 6 * SS),
    )

    d_all = np.minimum(np.minimum(d_tails, d_folds), d_m_u)
    a_main = np.clip(0.5 - d_all, 0.0, 1.0)
    c_str = rgb("2B2338")
    st = 2.6 * SS

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, rgb("D89228")[None, None, :], np.clip(0.5 - (d_tails + st), 0.0, 1.0))
    col = blend(col, rgb("9E5D10")[None, None, :], np.clip(0.5 - (d_folds + st), 0.0, 1.0))
    col = blend(col, c_str[None, None, :], np.clip(0.5 - d_m_u, 0.0, 1.0))
    col = blend(col, rgb("BA7416")[None, None, :], np.clip(0.5 - (d_main_lip + st), 0.0, 1.0))
    col = blend(col, rgb("FFF8C4")[None, None, :], np.clip(0.5 - (d_main + st), 0.0, 1.0))

    ym = np.clip((y - (cy - 35 * SS)) / (70 * SS), 0.0, 1.0)
    cel = np.clip((ym - 0.45) / 0.06, 0.0, 1.0)[:, :, None]
    face = rgb("FEDC6C")[None, None, :] * (1.0 - cel) + rgb("F0AE34")[None, None, :] * cel
    col = blend(col, face, np.clip(0.5 - (d_main + 5.6 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ("rank_podium_1.png", lambda: make_podium(1)),
        ("rank_podium_2.png", lambda: make_podium(2)),
        ("rank_podium_3.png", lambda: make_podium(3)),
        ("rank_medal_1.png", lambda: make_medal(1)),
        ("rank_medal_2.png", lambda: make_medal(2)),
        ("rank_medal_3.png", lambda: make_medal(3)),
        ("rank_arch.png", make_arch),
        ("rank_well.png", make_well),
        ("rank_row.png", lambda: make_row_card(False)),
        ("rank_row_me.png", lambda: make_row_card(True)),
        ("rank_scroll_hdr.png", make_scroll_header),
    ]
    for name, fn in jobs:
        im = fn()
        im.save(os.path.join(OUT, name), optimize=True)
        print(f"wrote {name:20s} {im.size[0]}x{im.size[1]}")


if __name__ == "__main__":
    main()
