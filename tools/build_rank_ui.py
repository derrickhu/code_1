"""生成排行榜专属 04 风格（45° 切角黑曜石 + 鎏金/赛博青/琥珀铜高台与双线霓虹榜单）UI 套件。"""
import os
import math
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
    c_stroke = rgb("050914")
    if tier == 1:
        bw, bh = 368, 248
        c_deck, c_cap, c_cap_lip = rgb("FFF4A8"), rgb("FFB800"), rgb("783C06")
        c_body, c_frame, c_plaque, c_stud = rgb("281220"), rgb("FFB800"), rgb("160B16"), rgb("00F57A")
    elif tier == 2:
        bw, bh = 320, 208
        c_deck, c_cap, c_cap_lip = rgb("D8FAFF"), rgb("00D8FF"), rgb("0A4C72")
        c_body, c_frame, c_plaque, c_stud = rgb("11203C"), rgb("00E5FF"), rgb("0A1428"), rgb("EAF8FF")
    else:
        bw, bh = 320, 194
        c_deck, c_cap, c_cap_lip = rgb("FFE2BD"), rgb("E08A42"), rgb("683210")
        c_body, c_frame, c_plaque, c_stud = rgb("1F1524"), rgb("E49650"), rgb("120D18"), rgb("FFD8A8")

    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = (w - 1) * 0.5

    deck_y0, deck_y1 = 8 * SS, 36 * SS
    cap_y0, cap_y1 = 28 * SS, 52 * SS
    body_y0, body_y1 = 46 * SS, (bh - 2) * SS

    d_deck = sdf_trapezoid(x, y, cx, deck_y0, deck_y1, (bw * 0.415) * SS, (bw * 0.478) * SS, 3.0 * SS)
    d_cap = sdf_oct_box(x, y, cx, (cap_y0 + cap_y1) * 0.5, (bw * 0.482) * SS, (cap_y1 - cap_y0) * 0.5, 6.0 * SS, 0.8 * SS)
    d_body = sdf_trapezoid(x, y, cx, body_y0, body_y1, (bw * 0.448) * SS, (bw * 0.456) * SS, 3.0 * SS)

    d_all = np.minimum(np.minimum(d_deck, d_cap), d_body)
    alpha = np.clip(0.5 - d_all, 0.0, 1.0)
    col = np.broadcast_to(c_stroke, (h, w, 3)).copy()
    st = 2.6 * SS

    m_body = np.clip(0.5 - (d_body + st), 0.0, 1.0)
    eave_step = 1.0 - np.clip((y - (cap_y1 + 6 * SS)) / (2.5 * SS), 0.0, 1.0)
    body_col = c_body[None, None, :] * (1.0 - eave_step[:, :, None] * 0.30)
    col = blend(col, body_col, m_body)

    pw = (bw * 0.448 - 18) * SS
    py0, py1 = body_y0 + 14 * SS, body_y1 - 8 * SS
    pcy, phh = (py0 + py1) * 0.5, (py1 - py0) * 0.5
    d_fr_out = sdf_oct_box(x, y, cx, pcy, pw, phh, 12 * SS, 0.8 * SS)
    d_fr_mid = sdf_oct_box(x, y, cx, pcy, pw - 2.4 * SS, phh - 2.4 * SS, 10.5 * SS, 0.8 * SS)
    d_fr_in = sdf_oct_box(x, y, cx, pcy, pw - 5.2 * SS, phh - 5.2 * SS, 9.0 * SS, 0.8 * SS)
    col = blend(col, c_stroke[None, None, :], np.clip(0.5 - d_fr_out, 0.0, 1.0) * m_body)
    col = blend(col, c_frame[None, None, :], np.clip(0.5 - d_fr_mid, 0.0, 1.0) * m_body)
    col = blend(col, c_plaque[None, None, :], np.clip(0.5 - d_fr_in, 0.0, 1.0) * m_body)

    for sx in (-1, 1):
        for sy in (-1, 1):
            rx, ry = cx + sx * (pw - 11 * SS), pcy + sy * (phh - 11 * SS)
            dd = (np.abs(x - rx) + np.abs(y - ry)) - 3.6 * SS
            col = blend(col, c_stud[None, None, :], np.clip(0.5 - dd, 0.0, 1.0) * m_body)

    col = blend(col, c_deck[None, None, :], np.clip(0.5 - (d_deck + st), 0.0, 1.0))
    col = blend(col, c_stroke[None, None, :], np.clip(0.5 - d_cap, 0.0, 1.0))
    m_cap = np.clip(0.5 - (d_cap + st), 0.0, 1.0)
    tc = np.clip((y - cap_y0) / max(1.0, cap_y1 - cap_y0), 0.0, 1.0)[:, :, None]
    cap_col = np.where(tc > 0.66, c_cap_lip[None, None, :], c_cap[None, None, :])
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

    c_str = rgb("050914")
    if tier == 1:
        c_wing, c_rim, c_core_top, c_core_bot = rgb("FFE468"), rgb("FFF8C4"), rgb("FFB800"), rgb("C86E08")
    elif tier == 2:
        c_wing, c_rim, c_core_top, c_core_bot = rgb("8CEEFF"), rgb("F0FCFF"), rgb("00C8F0"), rgb("0A6CA8")
    else:
        c_wing, c_rim, c_core_top, c_core_bot = rgb("F4BE90"), rgb("FFF0DE"), rgb("D88246"), rgb("8C441E")

    d_wings = np.full((h, w), 1e9, dtype=np.float32)
    R = bw * 0.30 * SS
    for side in (-1.0, 1.0):
        for ang_deg, ox, oy, rx, ry in [(-24, 0.34, 0.08, 0.14, 0.056), (4, 0.37, -0.05, 0.155, 0.058), (30, 0.33, -0.18, 0.145, 0.054)]:
            px, py = cx + side * bw * ox * SS, cy + bh * oy * SS
            rad = math.radians(ang_deg * side)
            ca, sa = math.cos(rad), math.sin(rad)
            ux = (x - px) * ca + (y - py) * sa
            uy = -(x - px) * sa + (y - py) * ca
            de = sdf_oct_box(ux + cx, uy + cy, cx, cy, bw * rx * SS, bh * ry * SS, 3.0 * SS, 0.6 * SS)
            d_wings = np.minimum(d_wings, de)

    d_disc = sdf_oct_box(x, y, cx, cy, R, R, R * 0.42, 1.0 * SS)
    d_all = np.minimum(d_wings, d_disc)
    a_main = np.clip(0.5 - d_all, 0.0, 1.0)

    st = 2.6 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_wing[None, None, :], np.clip(0.5 - (d_wings + st), 0.0, 1.0))
    col = blend(col, c_str[None, None, :], np.clip(0.5 - d_disc, 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_disc + st), 0.0, 1.0))
    col = blend(col, c_str[None, None, :], np.clip(0.5 - (d_disc + 6.4 * SS), 0.0, 1.0))

    yn = np.clip(y / h, 0.0, 1.0)
    cel = np.clip((yn - 0.50) / 0.05, 0.0, 1.0)[:, :, None]
    core_col = c_core_top[None, None, :] * (1.0 - cel) + c_core_bot[None, None, :] * cel
    col = blend(col, core_col, np.clip(0.5 - (d_disc + 8.6 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_arch() -> Image.Image:
    bw, bh = 1080, 112
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = (w - 1) * 0.5
    nx = np.abs(x - cx) / max(1.0, cx)

    # 45° 折线切角战术顶拱
    arch_y = (18.0 + 30.0 * np.clip((nx - 0.16) / 0.84, 0.0, 1.0)) * SS
    signed = arch_y - y
    a_body = np.clip(0.5 - signed, 0.0, 1.0)

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("050914")[None, None, :], a_body)
    col = blend(col, rgb("00E5FF")[None, None, :], np.clip(0.5 - (signed + 2.6 * SS), 0.0, 1.0))
    tb = np.clip((y - arch_y) / np.maximum(1.0, h - arch_y), 0.0, 1.0)[:, :, None]
    body = rgb("111E38")[None, None, :] * (1.0 - tb) + rgb("0C1426")[None, None, :] * tb
    col = blend(col, body, np.clip(0.5 - (signed + 6.5 * SS), 0.0, 1.0))

    gold_y = arch_y + 14.0 * SS
    fade = np.clip((0.82 - nx) / 0.20, 0.0, 1.0)
    g_line = np.clip(1.0 - np.abs(y - gold_y) / (1.5 * SS), 0.0, 1.0) * fade
    col = blend(col, rgb("FFB800")[None, None, :], g_line * 0.90 * a_body)

    cy_gem = 32.0 * SS
    dia = (np.abs(x - cx) / (14.0 * SS) + np.abs(y - cy_gem) / (10.0 * SS)) - 1.0
    col = blend(col, rgb("00F57A")[None, None, :], np.clip(0.5 - dia * 10.0 * SS, 0.0, 1.0) * a_body)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_body * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_well() -> Image.Image:
    bw = bh = 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    d = sdf_oct_box(x, y, cx, cy, 122 * SS, 122 * SS, 20 * SS, 1.0 * SS)
    a = np.clip(0.5 - d, 0.0, 1.0)

    col = np.broadcast_to(rgb("223E66"), (h, w, 3)).copy()
    m_in = np.clip(0.5 - (d + 2.4 * SS), 0.0, 1.0)
    top_step = 1.0 - np.clip((y - 12 * SS) / (3 * SS), 0.0, 1.0)
    fill = rgb("091020")[None, None, :] * (1.0 - top_step[:, :, None] * 0.4) + rgb("050914")[None, None, :] * (top_step[:, :, None] * 0.4)
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
    hw, hh, ch = 122 * SS, (bh * 0.5 - 7) * SS, 16 * SS

    c_str = rgb("050914")
    if me:
        c_lip, c_rim, c_face_top, c_face_bot, c_in = rgb("724808"), rgb("FFB800"), rgb("223354"), rgb("17243E"), rgb("00F57A")
    else:
        c_lip, c_rim, c_face_top, c_face_bot, c_in = rgb("091428"), rgb("2E4E7E"), rgb("15223E"), rgb("101B32"), rgb("00E5FF")

    d_face = sdf_oct_box(x, y, cx, cy, hw, hh, ch, 1.0 * SS)
    d_lip = sdf_oct_box(x, y - 4.6 * SS, cx, cy, hw, hh, ch, 1.0 * SS)
    d_u = np.minimum(d_face, d_lip)
    a_main = np.clip(0.5 - d_u, 0.0, 1.0)

    st = 2.4 * SS
    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))
    face = c_face_top[None, None, :] * (1.0 - yn[:, :, None]) + c_face_bot[None, None, :] * yn[:, :, None]
    col = blend(col, face, np.clip(0.5 - (d_face + 4.8 * SS), 0.0, 1.0))

    d_in = np.abs(d_face + 7.8 * SS) - 0.85 * SS
    col = blend(col, c_in[None, None, :], np.clip(0.5 - d_in, 0.0, 1.0) * (0.78 if me else 0.35))

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
        dt = sdf_oct_box(x, y, tx, ty, 48 * SS, 28 * SS, 10 * SS, 0.8 * SS)
        dn = (np.abs(x - (cx + side * 268 * SS)) * 0.9 + np.abs(y - ty) * 1.25) - 20 * SS
        d_tails = np.minimum(d_tails, np.maximum(dt, -dn))

    d_main = sdf_oct_box(x, y, cx, cy - 2 * SS, 198 * SS, 35 * SS, 16 * SS, 1.0 * SS)
    d_main_lip = sdf_oct_box(x, y - 4.5 * SS, cx, cy - 2 * SS, 198 * SS, 35 * SS, 16 * SS, 1.0 * SS)
    d_m_u = np.minimum(d_main, d_main_lip)
    d_folds = np.minimum(
        sdf_oct_box(x, y, cx - 188 * SS, cy + 15 * SS, 18 * SS, 21 * SS, 6 * SS, 0.8 * SS),
        sdf_oct_box(x, y, cx + 188 * SS, cy + 15 * SS, 18 * SS, 21 * SS, 6 * SS, 0.8 * SS),
    )

    d_all = np.minimum(np.minimum(d_tails, d_folds), d_m_u)
    a_main = np.clip(0.5 - d_all, 0.0, 1.0)
    c_str = rgb("050914")
    st = 2.6 * SS

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, rgb("B86E0C")[None, None, :], np.clip(0.5 - (d_tails + st), 0.0, 1.0))
    col = blend(col, rgb("5E2212")[None, None, :], np.clip(0.5 - (d_folds + st), 0.0, 1.0))
    col = blend(col, c_str[None, None, :], np.clip(0.5 - d_m_u, 0.0, 1.0))
    col = blend(col, rgb("783A06")[None, None, :], np.clip(0.5 - (d_main_lip + st), 0.0, 1.0))
    col = blend(col, rgb("FFB800")[None, None, :], np.clip(0.5 - (d_main + st), 0.0, 1.0))
    col = blend(col, c_str[None, None, :], np.clip(0.5 - (d_main + 5.2 * SS), 0.0, 1.0))

    ym = np.clip((y - (cy - 35 * SS)) / (70 * SS), 0.0, 1.0)
    cel = np.clip((ym - 0.45) / 0.06, 0.0, 1.0)[:, :, None]
    face = rgb("2E1220")[None, None, :] * (1.0 - cel) + rgb("1A0B16")[None, None, :] * cel
    col = blend(col, face, np.clip(0.5 - (d_main + 7.0 * SS), 0.0, 1.0))

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
