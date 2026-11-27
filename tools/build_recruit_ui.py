"""生成供销社摇人/神宠寻宝 & 抽卡演出专属 04 风格（45° 切角黑曜石 + 鎏金/霓虹紫/赛博青双线框）UI 皮肤套件。"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets/Resources/Art/ui")
SS = 4


def rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def sdf_segment(x: np.ndarray, y: np.ndarray, ax: float, ay: float, bx: float, by: float) -> np.ndarray:
    vx, vy = bx - ax, by - ay
    l2 = vx * vx + vy * vy + 1e-6
    t = np.clip(((x - ax) * vx + (y - ay) * vy) / l2, 0.0, 1.0)
    return np.hypot(x - (ax + t * vx), y - (ay + t * vy))


def sdf_oct_box(x: np.ndarray, y: np.ndarray, cx: float, cy: float, hw: float, hh: float, ch: float, r_tiny: float = 0.0) -> np.ndarray:
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


def sdf_triangle(w: int, h: int, pts, round_r: float) -> np.ndarray:
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    n = len(pts)
    min_d = np.full((h, w), 1e9, dtype=np.float32)
    inside = np.ones((h, w), dtype=bool)
    cx = sum(p[0] for p in pts) / n
    cy = sum(p[1] for p in pts) / n
    for i in range(n):
        ax, ay = pts[i]
        bx, by = pts[(i + 1) % n]
        min_d = np.minimum(min_d, sdf_segment(x, y, ax, ay, bx, by))
        cross_c = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
        cross_p = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
        inside &= (cross_p * np.sign(cross_c) >= -1e-4)
    return np.where(inside, -min_d, min_d) - round_r


def make_dock(theme: str) -> Image.Image:
    bw, bh = 256, 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    yn = y / max(1.0, h - 1)

    c_outer = rgb("050914")
    if theme == "gold":
        c_rim_top, c_rim_bot = rgb("FFE268"), rgb("EA920C")
        c_in_rim, c_bg_top, c_bg_bot, c_stud = rgb("00E5FF"), rgb("101D38"), rgb("091122"), rgb("00F57A")
    else:
        c_rim_top, c_rim_bot = rgb("D888FF"), rgb("8C32E8")
        c_in_rim, c_bg_top, c_bg_bot, c_stud = rgb("00F57A"), rgb("181034"), rgb("0D0920"), rgb("FFB800")

    d0 = sdf_oct_box(x, y, cx, cy, 122 * SS, 122 * SS, 22 * SS, 1.0 * SS)
    a_main = np.clip(0.5 - d0, 0.0, 1.0)

    m_rim = np.clip(0.5 - (d0 + 2.8 * SS), 0.0, 1.0)
    m_groove = np.clip(0.5 - (d0 + 8.2 * SS), 0.0, 1.0)
    m_in_rim = np.clip(0.5 - (d0 + 10.8 * SS), 0.0, 1.0)
    m_body = np.clip(0.5 - (d0 + 12.8 * SS), 0.0, 1.0)

    cel = np.clip((yn - 0.45) / 0.05, 0.0, 1.0)[:, :, None]
    rim_col = c_rim_top[None, None, :] * (1.0 - cel) + c_rim_bot[None, None, :] * cel
    body_col = c_bg_top[None, None, :] * (1.0 - yn[:, :, None]) + c_bg_bot[None, None, :] * yn[:, :, None]

    col = np.broadcast_to(c_outer, (h, w, 3)).copy()
    col = col * (1.0 - m_rim[:, :, None]) + rim_col * m_rim[:, :, None]
    col = col * (1.0 - m_groove[:, :, None]) + c_outer[None, None, :] * m_groove[:, :, None]
    col = col * (1.0 - m_in_rim[:, :, None]) + c_in_rim[None, None, :] * m_in_rim[:, :, None]
    col = col * (1.0 - m_body[:, :, None]) + body_col * m_body[:, :, None]

    for sx in (-100 * SS, 100 * SS):
        for sy in (-100 * SS, 100 * SS):
            dd = (np.abs(x - (cx + sx)) + np.abs(y - (cy + sy))) - 5.8 * SS
            ms = np.clip(0.5 - dd, 0.0, 1.0)
            ms_in = np.clip(0.5 - (dd + 1.8 * SS), 0.0, 1.0)
            sc = c_outer[None, None, :] * (1.0 - ms_in[:, :, None]) + c_stud[None, None, :] * ms_in[:, :, None]
            col = col * (1.0 - ms[:, :, None]) + sc * ms[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_tray() -> Image.Image:
    bw, bh = 256, 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    yn = y / max(1.0, h - 1)

    col = rgb("0D182E")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("070C1A")[None, None, :] * yn[:, :, None]
    cell = 28.0 * SS
    gx = np.abs(((x % cell) / cell) - 0.5)
    gy = np.abs(((y % cell) / cell) - 0.5)
    line = np.clip(1.0 - np.abs(gx + gy - 0.5) * 28.0, 0.0, 1.0)
    col = col + line[:, :, None] * rgb("1E4878")[None, None, :] * 0.22

    col[y < 15 * SS] = rgb("050914")
    col[(y >= 2.5 * SS) & (y < 10.5 * SS)] = rgb("FFB800")
    col[(y >= 2.5 * SS) & (y < 5.5 * SS)] = rgb("FFF4B8")
    col[(y >= 11.0 * SS) & (y < 13.5 * SS)] = rgb("00F57A")

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = 250
    out[y < 14 * SS, 3] = 255
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_oct_badge() -> Image.Image:
    bw, bh = 360, 72
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5

    d = sdf_oct_box(x, y, cx, cy, 174 * SS, 31 * SS, 20 * SS, 0.8 * SS)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    m_rim = np.clip(0.5 - (d + 2.6 * SS), 0.0, 1.0)
    m_in = np.clip(0.5 - (d + 6.6 * SS), 0.0, 1.0)

    col = np.broadcast_to(rgb("050914"), (h, w, 3)).copy()
    col = col * (1.0 - m_rim[:, :, None]) + rgb("FFB800")[None, None, :] * m_rim[:, :, None]
    col = col * (1.0 - m_in[:, :, None]) + rgb("340D1A")[None, None, :] * m_in[:, :, None]

    for sx in (-144 * SS, 144 * SS):
        dd = (np.abs(x - (cx + sx)) + np.abs(y - cy)) - 6.0 * SS
        ms = np.clip(0.5 - dd, 0.0, 1.0)
        col = col * (1.0 - ms[:, :, None]) + rgb("00F57A")[None, None, :] * ms[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_skip_btn() -> Image.Image:
    bw, bh = 196, 76
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5

    d = sdf_oct_box(x, y, cx, cy, 92 * SS, 32 * SS, 14 * SS, 1.0 * SS)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    m_rim = np.clip(0.5 - (d + 2.6 * SS), 0.0, 1.0)
    m_in = np.clip(0.5 - (d + 6.0 * SS), 0.0, 1.0)

    col = np.broadcast_to(rgb("050914"), (h, w, 3)).copy()
    col = col * (1.0 - m_rim[:, :, None]) + rgb("FFB800")[None, None, :] * m_rim[:, :, None]
    col = col * (1.0 - m_in[:, :, None]) + rgb("0E1B34")[None, None, :] * m_in[:, :, None]

    t1 = [(34 * SS, 24 * SS), (52 * SS, 38 * SS), (34 * SS, 52 * SS)]
    t2 = [(51 * SS, 24 * SS), (69 * SS, 38 * SS), (51 * SS, 52 * SS)]
    dt = np.minimum(sdf_triangle(w, h, t1, 1.6 * SS), sdf_triangle(w, h, t2, 1.6 * SS))
    dbar = sdf_oct_box(x, y, 74.5 * SS, 38 * SS, 2.8 * SS, 13.5 * SS, 1.0 * SS, 0.5 * SS)
    di = np.minimum(dt, dbar)
    m_ic_out = np.clip(0.5 - (di - 2.0 * SS), 0.0, 1.0)
    m_ic = np.clip(0.5 - di, 0.0, 1.0)
    col = col * (1.0 - m_ic_out[:, :, None]) + rgb("050914")[None, None, :] * m_ic_out[:, :, None]
    col = col * (1.0 - m_ic[:, :, None]) + rgb("FFE268")[None, None, :] * m_ic[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 248.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_checkbox(checked: bool) -> Image.Image:
    bw, bh = 56, 56
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5

    d = sdf_oct_box(x, y, cx, cy, 24 * SS, 24 * SS, 8 * SS, 0.8 * SS)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    m_rim = np.clip(0.5 - (d + 2.6 * SS), 0.0, 1.0)
    m_in = np.clip(0.5 - (d + 5.8 * SS), 0.0, 1.0)

    col = np.broadcast_to(rgb("050914"), (h, w, 3)).copy()
    if checked:
        col = col * (1.0 - m_rim[:, :, None]) + rgb("00F57A")[None, None, :] * m_rim[:, :, None]
        col = col * (1.0 - m_in[:, :, None]) + rgb("0D2E24")[None, None, :] * m_in[:, :, None]
        d1 = sdf_segment(x, y, 16.5 * SS, 29.0 * SS, 25.0 * SS, 37.5 * SS) - 3.6 * SS
        d2 = sdf_segment(x, y, 25.0 * SS, 37.5 * SS, 40.5 * SS, 19.0 * SS) - 3.6 * SS
        dc = np.minimum(d1, d2)
        m_chk = np.clip(0.5 - dc, 0.0, 1.0)
        col = col * (1.0 - m_chk[:, :, None]) + rgb("00F57A")[None, None, :] * m_chk[:, :, None]
    else:
        col = col * (1.0 - m_rim[:, :, None]) + rgb("3E6EA0")[None, None, :] * m_rim[:, :, None]
        col = col * (1.0 - m_in[:, :, None]) + rgb("0B1428")[None, None, :] * m_in[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_card_back() -> Image.Image:
    """04 风格 45° 切角黑曜石鎏金招募卡背 (200x252)。"""
    bw, bh = 200, 252
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 1.5 * SS
    yn = y / max(1.0, h - 1)

    d_face = sdf_oct_box(x, y, cx, cy, 93 * SS, 118 * SS, 20 * SS, 1.0 * SS)
    d_lip = sdf_oct_box(x, y - 3.5 * SS, cx, cy, 93 * SS, 118 * SS, 20 * SS, 1.0 * SS)
    d0 = np.minimum(d_face, d_lip)
    a_main = np.clip(0.5 - d0, 0.0, 1.0)

    c_ink = rgb("050914")
    cel = np.clip((yn - 0.45) / 0.05, 0.0, 1.0)[:, :, None]
    gold_col = rgb("FFE468")[None, None, :] * (1.0 - cel) + rgb("EA940C")[None, None, :] * cel

    m_lip = np.clip(0.5 - (d_lip + 2.6 * SS), 0.0, 1.0)
    m_gold = np.clip(0.5 - (d_face + 2.6 * SS), 0.0, 1.0)
    m_groove = np.clip(0.5 - (d_face + 9.5 * SS), 0.0, 1.0)
    m_in_cyan = np.clip(0.5 - (d_face + 11.8 * SS), 0.0, 1.0)
    m_core = np.clip(0.5 - (d_face + 14.2 * SS), 0.0, 1.0)

    face_col = rgb("11203E")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("091022")[None, None, :] * yn[:, :, None]
    diag = (x - cx) / (186 * SS) + (y - cy) / (236 * SS)
    band = np.clip((1.0 - np.abs(diag + 0.12) / 0.09 - 0.3) / 0.15, 0.0, 1.0) * 0.16
    face_col = face_col * (1.0 - band[:, :, None]) + rgb("00E5FF")[None, None, :] * band[:, :, None]

    d_oct_em = sdf_oct_box(x, y, cx, cy, 46 * SS, 46 * SS, 18 * SS, 1.0 * SS)
    m_r_ink = np.clip(0.5 - d_oct_em, 0.0, 1.0)
    m_r_gold = np.clip(0.5 - (d_oct_em + 2.6 * SS), 0.0, 1.0)
    m_r_in_ink = np.clip(0.5 - (d_oct_em + 7.5 * SS), 0.0, 1.0)
    m_r_red = np.clip(0.5 - (d_oct_em + 9.8 * SS), 0.0, 1.0)

    ux, uy = np.abs(x - cx) / (23.0 * SS), np.abs(y - cy) / (23.0 * SS)
    star_d = (ux ** 0.60 + uy ** 0.60) - 1.0
    m_star_ink = np.clip(0.5 - (star_d - 0.10) * (18.0 * SS), 0.0, 1.0)
    m_star = np.clip(0.5 - star_d * (18.0 * SS), 0.0, 1.0)

    face_col = face_col * (1.0 - m_r_ink[:, :, None]) + c_ink[None, None, :] * m_r_ink[:, :, None]
    face_col = face_col * (1.0 - m_r_gold[:, :, None]) + gold_col * m_r_gold[:, :, None]
    face_col = face_col * (1.0 - m_r_in_ink[:, :, None]) + c_ink[None, None, :] * m_r_in_ink[:, :, None]
    face_col = face_col * (1.0 - m_r_red[:, :, None]) + rgb("D81E24")[None, None, :] * m_r_red[:, :, None]
    face_col = face_col * (1.0 - m_star_ink[:, :, None]) + c_ink[None, None, :] * m_star_ink[:, :, None]
    face_col = face_col * (1.0 - m_star[:, :, None]) + rgb("FFE878")[None, None, :] * m_star[:, :, None]

    col = np.broadcast_to(c_ink, (h, w, 3)).copy()
    col = col * (1.0 - m_lip[:, :, None]) + rgb("783A06")[None, None, :] * m_lip[:, :, None]
    col = col * (1.0 - np.clip(0.5 - d_face, 0.0, 1.0)[:, :, None]) + c_ink[None, None, :] * np.clip(0.5 - d_face, 0.0, 1.0)[:, :, None]
    col = col * (1.0 - m_gold[:, :, None]) + gold_col * m_gold[:, :, None]
    col = col * (1.0 - m_groove[:, :, None]) + c_ink[None, None, :] * m_groove[:, :, None]
    col = col * (1.0 - m_in_cyan[:, :, None]) + rgb("00E5FF")[None, None, :] * m_in_cyan[:, :, None]
    col = col * (1.0 - m_core[:, :, None]) + face_col * m_core[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_sum_crown() -> Image.Image:
    bw, bh = 860, 184
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.56
    yn = y / max(1.0, h - 1)
    ax = np.abs(x - cx)

    d_wings = np.full((h, w), 1e9, dtype=np.float32)
    wing_specs = [
        (170 * SS, cy - 34 * SS, 418 * SS, cy - 48 * SS, 352 * SS, cy - 6 * SS),
        (180 * SS, cy - 8 * SS,  394 * SS, cy - 10 * SS, 330 * SS, cy + 24 * SS),
        (170 * SS, cy + 16 * SS, 352 * SS, cy + 26 * SS, 292 * SS, cy + 50 * SS),
    ]
    for ix, iy, tx, ty, bx, by in wing_specs:
        min_seg = np.minimum(sdf_segment(ax, y, ix, iy, tx, ty), np.minimum(sdf_segment(ax, y, tx, ty, bx, by), sdf_segment(ax, y, bx, by, ix, iy)))
        pcx, pcy = (ix + tx + bx) / 3.0, (iy + ty + by) / 3.0
        inside = np.ones((h, w), dtype=bool)
        pts = [(ix, iy), (tx, ty), (bx, by)]
        for k in range(3):
            x0, y0 = pts[k]
            x1, y1 = pts[(k + 1) % 3]
            cc = (x1 - x0) * (pcy - y0) - (y1 - y0) * (pcx - x0)
            cp = (x1 - x0) * (y - y0) - (y1 - y0) * (ax - x0)
            inside &= (cp * np.sign(cc) >= -1e-4)
        dw = np.where(inside, -min_seg, min_seg) - 2.5 * SS
        d_wings = np.minimum(d_wings, dw)

    arch_lift = np.clip(1.0 - (ax / (230.0 * SS)) ** 2, 0.0, 1.0) * 14.0 * SS
    d_plaque = sdf_oct_box(x, y + arch_lift * 0.45, cx, cy, 246 * SS, 52 * SS, 26 * SS, 1.0 * SS)
    d_crest = (ax * 0.82 + np.abs(y - (cy - 58 * SS))) - 28 * SS
    d_all = np.minimum(np.minimum(d_wings, d_plaque), d_crest)
    a_main = np.clip(0.5 - d_all, 0.0, 1.0)

    c_ink = rgb("050914")
    cel = np.clip((yn - 0.50) / 0.05, 0.0, 1.0)[:, :, None]
    gold_col = rgb("FFE468")[None, None, :] * (1.0 - cel) + rgb("EA940C")[None, None, :] * cel

    col = np.broadcast_to(c_ink, (h, w, 3)).copy()
    col = col * (1.0 - np.clip(0.5 - (d_wings + 3.0 * SS), 0.0, 1.0)[:, :, None]) + gold_col * np.clip(0.5 - (d_wings + 3.0 * SS), 0.0, 1.0)[:, :, None]

    m_p_out = np.clip(0.5 - d_plaque, 0.0, 1.0)
    m_p_gold = np.clip(0.5 - (d_plaque + 3.0 * SS), 0.0, 1.0)
    m_p_in = np.clip(0.5 - (d_plaque + 10.5 * SS), 0.0, 1.0)
    silk = rgb("2C0E1C")[None, None, :] * (1.0 - cel) + rgb("180812")[None, None, :] * cel

    col = col * (1.0 - m_p_out[:, :, None]) + c_ink[None, None, :] * m_p_out[:, :, None]
    col = col * (1.0 - m_p_gold[:, :, None]) + gold_col * m_p_gold[:, :, None]
    col = col * (1.0 - m_p_in[:, :, None]) + silk * m_p_in[:, :, None]

    m_c_out = np.clip(0.5 - d_crest, 0.0, 1.0)
    m_c_gold = np.clip(0.5 - (d_crest + 2.8 * SS), 0.0, 1.0)
    m_c_gem = np.clip(0.5 - (d_crest + 9.0 * SS), 0.0, 1.0)
    col = col * (1.0 - m_c_out[:, :, None]) + c_ink[None, None, :] * m_c_out[:, :, None]
    col = col * (1.0 - m_c_gold[:, :, None]) + rgb("FFF6BE")[None, None, :] * m_c_gold[:, :, None]
    col = col * (1.0 - m_c_gem[:, :, None]) + rgb("00F57A")[None, None, :] * m_c_gem[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_sum_pedestal() -> Image.Image:
    bw, bh = 256, 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    yn = y / max(1.0, h - 1)

    d = sdf_oct_box(x, y, cx, cy, 122 * SS, 122 * SS, 24 * SS, 1.0 * SS)
    a_box = np.clip(0.5 - d, 0.0, 1.0)
    m_rim = np.clip(0.5 - (d + 2.6 * SS), 0.0, 1.0)
    m_in = np.clip(0.5 - (d + 6.4 * SS), 0.0, 1.0)

    col = np.broadcast_to(rgb("050914"), (h, w, 3)).copy()
    col = col * (1.0 - m_rim[:, :, None]) + rgb("FFB800")[None, None, :] * m_rim[:, :, None]
    body = rgb("11203E")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("091122")[None, None, :] * yn[:, :, None]
    col = col * (1.0 - m_in[:, :, None]) + body * m_in[:, :, None]

    alpha = a_box * (1.0 - m_in * 0.16)
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_shine_bar() -> Image.Image:
    bw, bh = 128, 256
    y, x = np.mgrid[0:bh, 0:bw].astype(np.float32)
    u = (x - bw * 0.5) + (y - bh * 0.5) * 0.42
    core = np.clip(1.0 - np.abs(u) / 14.0, 0.0, 1.0) * 0.88
    sub = np.clip(1.0 - np.abs(u - 22.0) / 6.0, 0.0, 1.0) * 0.48
    v_fade = np.clip(1.0 - (np.abs(y - bh * 0.5) / (bh * 0.52)) ** 4, 0.0, 1.0)
    a = np.clip((core + sub) * v_fade, 0.0, 1.0)
    out = np.zeros((bh, bw, 4), dtype=np.uint8)
    out[:, :, :3] = [244, 252, 255]
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def make_hero_plaque() -> Image.Image:
    bw, bh = 460, 92
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5

    d = sdf_oct_box(x, y, cx, cy, 214 * SS, 38 * SS, 24 * SS, 1.0 * SS)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    m_rim = np.clip(0.5 - (d + 2.6 * SS), 0.0, 1.0)
    m_in = np.clip(0.5 - (d + 6.4 * SS), 0.0, 1.0)

    col = np.broadcast_to(rgb("050914"), (h, w, 3)).copy()
    col = col * (1.0 - m_rim[:, :, None]) + rgb("FFB800")[None, None, :] * m_rim[:, :, None]
    col = col * (1.0 - m_in[:, :, None]) + rgb("0D162C")[None, None, :] * m_in[:, :, None]

    for sx in (-186 * SS, 186 * SS):
        dd = (np.abs(x - (cx + sx)) + np.abs(y - cy)) - 6.0 * SS
        ms = np.clip(0.5 - dd, 0.0, 1.0)
        col = col * (1.0 - ms[:, :, None]) + rgb("00E5FF")[None, None, :] * ms[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_summon_pillar() -> Image.Image:
    bw, bh = 384, 768
    y, x = np.mgrid[0:bh, 0:bw].astype(np.float32)
    u = (x - (bw - 1) * 0.5) / (bw * 0.5)
    v = y / max(1.0, bh - 1)
    ux = u / (0.66 + 0.38 * v)
    core = np.exp(-(ux / 0.11) ** 2)
    inner = np.exp(-(ux / 0.28) ** 2) * 0.65
    v_env = (np.clip(v / 0.22, 0.0, 1.0) ** 1.6) * (np.clip((1.0 - v) / 0.20, 0.0, 1.0) ** 1.8)
    edge_x = np.clip((1.0 - np.abs(u)) / 0.18, 0.0, 1.0) ** 2.0
    a = np.clip((core + inner) * v_env * edge_x, 0.0, 1.0)
    col = rgb("FFD460")[None, None, :] * (1.0 - core[:, :, None]) + 255.0 * core[:, :, None]
    out = np.zeros((bh, bw, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def make_shock_burst() -> Image.Image:
    n = 384
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    cx = cy = (n - 1) * 0.5
    dx, dy = (x - cx) / (n * 0.5), (y - cy) / (n * 0.5)
    r = np.hypot(dx, dy) + 1e-6
    ang = np.arctan2(dy, dx)
    sp4 = (np.abs(np.cos(ang * 2.0)) ** 18) * np.exp(-r * 2.3) * 0.96
    sp8 = (np.abs(np.cos(ang * 4.0 + np.pi * 0.25)) ** 22) * np.exp(-r * 3.0) * 0.70
    corona = np.exp(-(r / 0.34) ** 2) * 0.86
    fade_edge = np.clip((1.0 - r) / 0.16, 0.0, 1.0) ** 1.5
    a = np.clip((sp4 + sp8 + corona) * fade_edge, 0.0, 1.0)
    whiteness = np.clip(corona + sp4 * 0.7, 0.0, 1.0)
    col = rgb("FFE488")[None, None, :] * (1.0 - whiteness[:, :, None]) + 255.0 * whiteness[:, :, None]
    out = np.zeros((n, n, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def make_meteor_streak() -> Image.Image:
    bw, bh = 192, 420
    y, x = np.mgrid[0:bh, 0:bw].astype(np.float32)
    u = (x - (bw - 1) * 0.5) / (bw * 0.5)
    v = y / max(1.0, bh - 1)
    head_v = 0.83
    tail_t = np.clip(v / head_v, 0.0, 1.0)
    tail_w = 0.05 + 0.24 * (tail_t ** 1.6)
    tail = np.exp(-(u / tail_w) ** 2) * (tail_t ** 2.1) * np.clip((head_v + 0.06 - v) / 0.08, 0.0, 1.0)
    hd_r = np.hypot(u / 0.42, (v - head_v) / 0.11)
    head = np.exp(-(hd_r ** 2) * 2.2)
    cross = (np.exp(-(u / 0.07) ** 2) * np.exp(-((v - head_v) / 0.14) ** 2) + np.exp(-((v - head_v) / 0.03) ** 2) * np.exp(-(u / 0.62) ** 2)) * 0.85
    edge_x = np.clip((1.0 - np.abs(u)) / 0.10, 0.0, 1.0)
    a = np.clip((tail * 0.88 + head + cross) * edge_x, 0.0, 1.0)
    whiteness = np.clip(head + cross * 0.8, 0.0, 1.0)
    col = rgb("FFE078")[None, None, :] * (1.0 - whiteness[:, :, None]) + 255.0 * whiteness[:, :, None]
    out = np.zeros((bh, bw, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def make_magic_seal() -> Image.Image:
    bw = 512
    n = bw * 2
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    cx = cy = (n - 1) * 0.5
    dx, dy = (x - cx) / (n * 0.5), (y - cy) / (n * 0.5)
    r = np.hypot(dx, dy) + 1e-6
    ang = np.arctan2(dy, dx)
    sharp = np.zeros((n, n), dtype=np.float32)
    for rad, w_ring, inten in [(0.90, 0.012, 1.0), (0.76, 0.010, 0.92), (0.56, 0.011, 0.94), (0.34, 0.010, 0.86)]:
        sharp = np.maximum(sharp, np.clip(1.0 - np.abs(r - rad) / w_ring, 0.0, 1.0) * inten)
    for rot in (0.0, np.pi * 0.25):
        rx = dx * np.cos(rot) + dy * np.sin(rot)
        ry = -dx * np.sin(rot) + dy * np.cos(rot)
        sq = 0.537
        d_sq = np.minimum(np.where(np.abs(ry) <= sq + 0.008, np.abs(np.abs(rx) - sq), 9.0), np.where(np.abs(rx) <= sq + 0.008, np.abs(np.abs(ry) - sq), 9.0))
        sharp = np.maximum(sharp, np.clip(1.0 - d_sq / 0.010, 0.0, 1.0) * 0.90)
    needle = (np.abs(np.cos(ang * 4.0)) ** 48) * ((r > 0.14) & (r < 0.94))
    sharp = np.maximum(sharp, needle * 0.85)
    glow = np.exp(-((r - 0.82) / 0.09) ** 2) * 0.36 + np.exp(-(r / 0.42) ** 2) * 0.18
    fade = np.clip((1.0 - r) / 0.07, 0.0, 1.0) ** 1.6
    a = np.clip((sharp * 0.96 + glow) * fade, 0.0, 1.0)
    whiteness = np.clip(sharp * 1.1, 0.0, 1.0)
    col = rgb("FFD668")[None, None, :] * (1.0 - whiteness[:, :, None]) + 255.0 * whiteness[:, :, None]
    out = np.zeros((n, n, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bw), Image.Resampling.LANCZOS)


def make_halo_ring() -> Image.Image:
    bw = 512
    n = bw * 2
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    cx = cy = (n - 1) * 0.5
    dx, dy = (x - cx) / (n * 0.5), (y - cy) / (n * 0.5)
    r = np.hypot(dx, dy) + 1e-6
    ang = np.arctan2(dy, dx)
    n16 = (0.5 + 0.5 * np.cos(ang * 16.0)) ** 32 * np.exp(-((r - 0.62) / 0.25) ** 2) * 0.90
    n4 = (np.abs(np.cos(ang * 2.0)) ** 72) * np.exp(-((r - 0.52) / 0.34) ** 2)
    ring1 = np.clip(1.0 - np.abs(r - 0.54) / 0.009, 0.0, 1.0) * 0.96
    corona = np.exp(-(r / 0.42) ** 2) * 0.58
    fade_edge = np.clip((1.0 - r) / 0.14, 0.0, 1.0) ** 1.8
    a = np.clip((n16 * 0.65 + n4 + ring1 + corona) * fade_edge, 0.0, 1.0)
    whiteness = np.clip(np.maximum(ring1, n4) + corona * 0.5, 0.0, 1.0)
    col = rgb("FFDC74")[None, None, :] * (1.0 - whiteness[:, :, None]) + 255.0 * whiteness[:, :, None]
    out = np.zeros((n, n, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bw), Image.Resampling.LANCZOS)


def make_arc_slash() -> Image.Image:
    bw, bh = 512, 256
    y, x = np.mgrid[0:bh, 0:bw].astype(np.float32)
    u = (x - (bw - 1) * 0.5) / (bw * 0.5)
    v = (y - (bh - 1) * 0.5) / (bh * 0.5)
    x_env = np.clip(1.0 - np.abs(u), 0.0, 1.0) ** 1.6
    y_env = np.clip(1.0 - np.abs(v), 0.0, 1.0) ** 1.8
    blade_w = 0.028 + 0.065 * (1.0 - np.abs(u)) ** 2
    blade = np.exp(-(v / blade_w) ** 2) * (x_env ** 0.7)
    vert_spike = np.exp(-(u / 0.026) ** 2) * np.exp(-(v / 0.62) ** 2) * 0.92
    center_star = np.exp(-(np.hypot(u / 0.16, v / 0.30)) ** 2 * 1.8)
    a = np.clip((blade + vert_spike + center_star) * x_env * y_env, 0.0, 1.0)
    whiteness = np.clip(blade + center_star, 0.0, 1.0)
    col = rgb("FFDE7C")[None, None, :] * (1.0 - whiteness[:, :, None]) + 255.0 * whiteness[:, :, None]
    out = np.zeros((bh, bw, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def make_stage_vignette() -> Image.Image:
    n = 512
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    u = (x - (n - 1) * 0.5) / (n * 0.5)
    v = (y - (n - 1) * 0.62) / (n * 0.5)
    r_spot = np.hypot(u / 0.56, v / 0.50)
    a = np.clip((np.clip((r_spot - 0.32) / 0.92, 0.0, 1.0) ** 1.35) * 0.94 + 0.14, 0.0, 0.96)
    t = np.clip(r_spot / 1.4, 0.0, 1.0)[:, :, None]
    col = rgb("090E20")[None, None, :] * (1.0 - t) + rgb("02040C")[None, None, :] * t
    out = np.zeros((n, n, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def make_speed_lines() -> Image.Image:
    n = 512
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    cx = cy = (n - 1) * 0.5
    dx, dy = (x - cx) / (n * 0.5), (y - cy) / (n * 0.5)
    r = np.hypot(dx, dy) + 1e-6
    ang = np.arctan2(dy, dx)
    spikes = np.clip((0.5 + 0.5 * np.sin(ang * 42.0 + 0.4)) ** 14 * 0.88 + (0.5 + 0.5 * np.sin(ang * 68.0 + 1.9)) ** 18 * 0.96, 0.0, 1.0)
    radial_mask = np.clip((r - 0.38) / 0.42, 0.0, 1.0) ** 1.6
    a = np.clip(spikes * radial_mask * 0.94, 0.0, 1.0)
    col = rgb("FFE282")[None, None, :] * (1.0 - spikes[:, :, None] * 0.95) + 255.0 * (spikes[:, :, None] * 0.95)
    out = np.zeros((n, n, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def make_lightning_crack() -> Image.Image:
    n = 512
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    d_min = np.full((n, n), 1e9, dtype=np.float32)
    s = n / 384.0
    branches = [
        [(192, 192), (162, 146), (184, 108), (134, 62), (148, 18)],
        [(192, 192), (234, 154), (216, 118), (278, 74), (326, 28)],
        [(192, 192), (144, 214), (114, 196), (64, 246), (22, 272)],
        [(192, 192), (240, 224), (266, 204), (314, 260), (360, 296)],
        [(192, 192), (182, 248), (208, 290), (176, 352)],
    ]
    for pts in branches:
        for i in range(len(pts) - 1):
            d_min = np.minimum(d_min, sdf_segment(x, y, pts[i][0] * s, pts[i][1] * s, pts[i + 1][0] * s, pts[i + 1][1] * s))
    core = np.clip(1.0 - d_min / 3.0, 0.0, 1.0)
    glow = np.exp(-(d_min / 14.0) ** 2) * 0.65
    cx = cy = (n - 1) * 0.5
    fade = np.clip((1.0 - np.hypot(x - cx, y - cy) / (n * 0.5)) / 0.14, 0.0, 1.0) ** 1.5
    a = np.clip((core + glow) * fade, 0.0, 1.0)
    col = rgb("FFDC78")[None, None, :] * (1.0 - core[:, :, None]) + 255.0 * core[:, :, None]
    out = np.zeros((n, n, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ("gacha_dock_gold.png", lambda: make_dock("gold")),
        ("gacha_dock_purple.png", lambda: make_dock("purple")),
        ("gacha_tray.png", make_tray),
        ("gacha_oct_badge.png", make_oct_badge),
        ("gacha_skip_btn.png", make_skip_btn),
        ("gacha_check_off.png", lambda: make_checkbox(False)),
        ("gacha_check_on.png", lambda: make_checkbox(True)),
        ("gacha_card_back.png", make_card_back),
        ("gacha_sum_crown.png", make_sum_crown),
        ("gacha_sum_pedestal.png", make_sum_pedestal),
        ("gacha_shine_bar.png", make_shine_bar),
        ("fx_summon_pillar.png", make_summon_pillar),
        ("fx_shock_burst.png", make_shock_burst),
        ("fx_meteor_streak.png", make_meteor_streak),
        ("fx_hero_plaque.png", make_hero_plaque),
        ("fx_magic_seal.png", make_magic_seal),
        ("fx_halo_ring.png", make_halo_ring),
        ("fx_arc_slash.png", make_arc_slash),
        ("fx_stage_vignette.png", make_stage_vignette),
        ("fx_speed_lines.png", make_speed_lines),
        ("fx_lightning_crack.png", make_lightning_crack),
    ]
    for name, fn in jobs:
        im = fn()
        im.save(os.path.join(OUT, name), optimize=True)
        print(f"wrote {name:24s} {im.size}")


if __name__ == "__main__":
    main()
