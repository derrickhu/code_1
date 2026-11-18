"""生成商城祈愿长卷 & 擂鼓抽卡演出专属 4x 超采样高清 UI 皮肤（v10 翻牌与终局大爆发升级版）。

输出到 Assets/Resources/Art/ui/：
- gacha_dock_gold.png    (256x256, 9-slice 52,52,52,52) 擂鼓招募·皇家霁蓝鎏金大卡坞
- gacha_dock_purple.png  (256x256, 9-slice 52,52,52,52) 兽魂寻宝·星宿紫金大卡坞
- gacha_tray.png         (256x256, 9-slice 48,36,48,48) 抽卡演出下半屏·鎏金顶梁暗纹菱格席位盘
- gacha_oct_badge.png    (360x72,  9-slice 56,0,56,0)   抽卡中腰八角鎏金进度铭牌（已招募 X/10）
- gacha_skip_btn.png     (196x76)                       抽卡左上角鎏金快进胶囊底板
- gacha_check_off.png    (56x56)                        精致 3D 金属边复选框（未勾选）
- gacha_check_on.png     (56x56)                        精致 3D 鎏金翠绿复选框（已勾选含对勾）
- gacha_card_back.png    (200x252)                      抽卡席位专属·梁山聚义玄金浮雕卡背
- gacha_sum_crown.png    (860x184)                      累计获得专属·皇家展翼鎏金天罡大冠冕
- gacha_sum_pedestal.png (256x256, 9-slice 56,56,56,56) 累计获得专属·星耀鎏金神坛托盘
- gacha_shine_bar.png    (128x256)                      SSR/SR 卡面斜向流光扫光条

用法：python3 tools/build_recruit_ui.py
"""
import os
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


def sdf_chamfer_rect(x: np.ndarray, y: np.ndarray, cx: float, cy: float, hw: float, hh: float, ch: float) -> np.ndarray:
    dx = np.abs(x - cx) - hw
    dy = np.abs(y - cy) - hh
    d_box = np.maximum(dx, dy)
    d_ch = (np.abs(x - cx) + np.abs(y - cy) - (hw + hh - ch)) * 0.70710678
    return np.maximum(d_box, d_ch)


def sdf_segment(x: np.ndarray, y: np.ndarray, ax: float, ay: float, bx: float, by: float) -> np.ndarray:
    vx, vy = bx - ax, by - ay
    l2 = vx * vx + vy * vy + 1e-6
    t = np.clip(((x - ax) * vx + (y - ay) * vy) / l2, 0.0, 1.0)
    return np.hypot(x - (ax + t * vx), y - (ay + t * vy))


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
    signed = np.where(inside, -min_d, min_d)
    return signed - round_r


def make_dock(theme: str) -> Image.Image:
    bw, bh = 256, 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    yn = y / max(1.0, h - 1)

    if theme == "gold":
        c_outer = rgb("0A1624")
        c_rim_hi = rgb("FFF0A6")
        c_rim_lo = rgb("C8861A")
        c_groove = rgb("0D1D2E")
        c_in_rim = rgb("5CC4EA")
        c_bg_top = rgb("16304B")
        c_bg_bot = rgb("0E2034")
        c_stud = rgb("FFE484")
    else:
        c_outer = rgb("110B24")
        c_rim_hi = rgb("F7DCFF")
        c_rim_lo = rgb("9B56D8")
        c_groove = rgb("150E2C")
        c_in_rim = rgb("DF9EFF")
        c_bg_top = rgb("261A48")
        c_bg_bot = rgb("140E2B")
        c_stud = rgb("FFD97D")

    d_sh = sdf_rrect(x, y - 5 * SS, cx, cy, 121 * SS, 121 * SS, 30 * SS)
    sh_a = np.clip(1.0 - d_sh / (7.0 * SS), 0.0, 1.0) ** 1.6 * 0.42

    d0 = sdf_rrect(x, y, cx, cy, 122 * SS, 122 * SS, 30 * SS)
    a_main = np.clip(0.5 - d0, 0.0, 1.0)

    m_rim = np.clip(0.5 - (d0 + 3.0 * SS), 0.0, 1.0)
    m_groove = np.clip(0.5 - (d0 + 9.5 * SS), 0.0, 1.0)
    m_in_rim = np.clip(0.5 - (d0 + 12.5 * SS), 0.0, 1.0)
    m_body = np.clip(0.5 - (d0 + 14.5 * SS), 0.0, 1.0)

    rim_col = c_rim_hi[None, None, :] * (1.0 - yn[:, :, None] * 0.85) + c_rim_lo[None, None, :] * (yn[:, :, None] * 0.85)
    sheen = np.exp(-((yn - 0.04) / 0.035) ** 2) * 0.55
    rim_col = np.clip(rim_col + 255.0 * sheen[:, :, None], 0.0, 255.0)

    body_col = c_bg_top[None, None, :] * (1.0 - yn[:, :, None]) + c_bg_bot[None, None, :] * yn[:, :, None]
    pat = (np.sin((x + y) * (np.pi / (18.0 * SS))) * np.sin((x - y) * (np.pi / (18.0 * SS)))) > 0.65
    body_col = body_col + pat[:, :, None].astype(np.float32) * 5.5

    col = np.broadcast_to(c_outer, (h, w, 3)).copy()
    col = col * (1.0 - m_rim[:, :, None]) + rim_col * m_rim[:, :, None]
    col = col * (1.0 - m_groove[:, :, None]) + c_groove[None, None, :] * m_groove[:, :, None]
    col = col * (1.0 - m_in_rim[:, :, None]) + (c_in_rim * 0.72)[None, None, :] * m_in_rim[:, :, None]
    col = col * (1.0 - m_body[:, :, None]) + body_col * m_body[:, :, None]

    for sx in (-104 * SS, 104 * SS):
        for sy in (-104 * SS, 104 * SS):
            dd = (np.abs(x - (cx + sx)) + np.abs(y - (cy + sy))) - 6.0 * SS
            ms = np.clip(0.5 - dd, 0.0, 1.0)
            ms_in = np.clip(0.5 - (dd + 1.8 * SS), 0.0, 1.0)
            sc = c_outer[None, None, :] * (1.0 - ms_in[:, :, None]) + c_stud[None, None, :] * ms_in[:, :, None]
            col = col * (1.0 - ms[:, :, None]) + sc * ms[:, :, None]

    alpha = np.clip(a_main + sh_a * (1.0 - a_main), 0.0, 1.0)
    sh_rgb = np.zeros_like(col)
    final_rgb = sh_rgb * (1.0 - a_main[:, :, None]) + col * a_main[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(final_rgb), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_tray() -> Image.Image:
    bw, bh = 256, 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    yn = y / max(1.0, h - 1)

    c_top_bg = rgb("142840")
    c_bot_bg = rgb("091322")
    col = c_top_bg[None, None, :] * (1.0 - yn[:, :, None]) + c_bot_bg[None, None, :] * yn[:, :, None]

    cell = 28.0 * SS
    gx = np.abs(((x % cell) / cell) - 0.5)
    gy = np.abs(((y % cell) / cell) - 0.5)
    line = np.clip(1.0 - np.abs(gx + gy - 0.5) * 26.0, 0.0, 1.0)
    col = col + line[:, :, None] * rgb("325F8E")[None, None, :] * 0.30

    col[y < 15 * SS] = rgb("091320")
    col[(y >= 2 * SS) & (y < 11 * SS)] = rgb("DF9B22")
    col[(y >= 2.5 * SS) & (y < 6.0 * SS)] = rgb("FFF2A6")
    col[(y >= 11 * SS) & (y < 13.2 * SS)] = rgb("58CCF4")

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = 248
    out[y < 14 * SS, 3] = 255
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_oct_badge() -> Image.Image:
    bw, bh = 360, 72
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    yn = y / max(1.0, h - 1)

    d = sdf_chamfer_rect(x, y, cx, cy, 174 * SS, 31 * SS, 22 * SS)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    m_rim = np.clip(0.5 - (d + 2.6 * SS), 0.0, 1.0)
    m_in = np.clip(0.5 - (d + 7.2 * SS), 0.0, 1.0)

    rim = rgb("FFF2A6")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("CA8214")[None, None, :] * yn[:, :, None]
    body = rgb("9E2220")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("581014")[None, None, :] * yn[:, :, None]

    col = np.broadcast_to(rgb("260C08"), (h, w, 3)).copy()
    col = col * (1.0 - m_rim[:, :, None]) + rim * m_rim[:, :, None]
    col = col * (1.0 - m_in[:, :, None]) + body * m_in[:, :, None]

    for sx in (-144 * SS, 144 * SS):
        dd = (np.abs(x - (cx + sx)) + np.abs(y - cy)) - 6.5 * SS
        ms = np.clip(0.5 - dd, 0.0, 1.0)
        col = col * (1.0 - ms[:, :, None]) + rgb("FFE688")[None, None, :] * ms[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_skip_btn() -> Image.Image:
    bw, bh = 196, 76
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    yn = y / max(1.0, h - 1)

    d = sdf_rrect(x, y, cx, cy, 92 * SS, 32 * SS, 32 * SS)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    m_rim = np.clip(0.5 - (d + 2.5 * SS), 0.0, 1.0)
    m_in = np.clip(0.5 - (d + 6.5 * SS), 0.0, 1.0)

    rim = rgb("FFF2A6")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("CF8B1A")[None, None, :] * yn[:, :, None]
    body = rgb("1B3552")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("0E1E31")[None, None, :] * yn[:, :, None]

    col = np.broadcast_to(rgb("091420"), (h, w, 3)).copy()
    col = col * (1.0 - m_rim[:, :, None]) + rim * m_rim[:, :, None]
    col = col * (1.0 - m_in[:, :, None]) + body * m_in[:, :, None]

    t1 = [(34 * SS, 24 * SS), (52 * SS, 38 * SS), (34 * SS, 52 * SS)]
    t2 = [(51 * SS, 24 * SS), (69 * SS, 38 * SS), (51 * SS, 52 * SS)]
    dt = np.minimum(sdf_triangle(w, h, t1, 2.2 * SS), sdf_triangle(w, h, t2, 2.2 * SS))
    dbar = sdf_rrect(x, y, 74.5 * SS, 38 * SS, 2.8 * SS, 13.5 * SS, 2.2 * SS)
    di = np.minimum(dt, dbar)
    m_ic_out = np.clip(0.5 - (di - 1.8 * SS), 0.0, 1.0)
    m_ic = np.clip(0.5 - di, 0.0, 1.0)
    ic_col = rgb("FFF4B2")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("F5B128")[None, None, :] * yn[:, :, None]
    col = col * (1.0 - m_ic_out[:, :, None]) + rgb("0B1622")[None, None, :] * m_ic_out[:, :, None]
    col = col * (1.0 - m_ic[:, :, None]) + ic_col * m_ic[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 244.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_checkbox(checked: bool) -> Image.Image:
    bw, bh = 56, 56
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    yn = y / max(1.0, h - 1)

    d = sdf_rrect(x, y, cx, cy, 24 * SS, 24 * SS, 11 * SS)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    m_rim = np.clip(0.5 - (d + 2.5 * SS), 0.0, 1.0)
    m_in = np.clip(0.5 - (d + 6.2 * SS), 0.0, 1.0)

    if checked:
        rim = rgb("FFF2A6")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("D4901C")[None, None, :] * yn[:, :, None]
        body = rgb("4BE87A")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("1FA84B")[None, None, :] * yn[:, :, None]
    else:
        rim = rgb("B8DAEE")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("5B84A4")[None, None, :] * yn[:, :, None]
        body = rgb("0F1E2E")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("193149")[None, None, :] * yn[:, :, None]

    col = np.broadcast_to(rgb("0A1522"), (h, w, 3)).copy()
    col = col * (1.0 - m_rim[:, :, None]) + rim * m_rim[:, :, None]
    col = col * (1.0 - m_in[:, :, None]) + body * m_in[:, :, None]

    if checked:
        d1 = sdf_segment(x, y, 16.5 * SS, 29.0 * SS, 25.0 * SS, 37.5 * SS) - 3.8 * SS
        d2 = sdf_segment(x, y, 25.0 * SS, 37.5 * SS, 40.5 * SS, 19.0 * SS) - 3.8 * SS
        dc = np.minimum(d1, d2)
        m_chk_sh = np.clip(0.5 - (np.roll(dc, int(2 * SS), axis=0) - 1.2 * SS), 0.0, 1.0)
        m_chk = np.clip(0.5 - dc, 0.0, 1.0)
        col = col * (1.0 - m_chk_sh[:, :, None]) + rgb("0E4E24")[None, None, :] * m_chk_sh[:, :, None]
        col = col * (1.0 - m_chk[:, :, None]) + rgb("FFFFFF")[None, None, :] * m_chk[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_card_back() -> Image.Image:
    """抽卡席位专属·梁山聚义玄金浮雕卡背 (200x252)，翻牌前充满悬念与厚重金属质感。"""
    bw, bh = 200, 252
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    yn = y / max(1.0, h - 1)

    d_sh = sdf_rrect(x, y - 4 * SS, cx, cy, 92 * SS, 118 * SS, 22 * SS)
    sh_a = np.clip(1.0 - d_sh / (6.0 * SS), 0.0, 1.0) ** 1.6 * 0.48

    d0 = sdf_rrect(x, y, cx, cy, 93 * SS, 119 * SS, 22 * SS)
    a_main = np.clip(0.5 - d0, 0.0, 1.0)

    m_gold = np.clip(0.5 - (d0 + 2.8 * SS), 0.0, 1.0)
    m_groove = np.clip(0.5 - (d0 + 10.5 * SS), 0.0, 1.0)
    m_in_gold = np.clip(0.5 - (d0 + 13.5 * SS), 0.0, 1.0)
    m_face = np.clip(0.5 - (d0 + 16.5 * SS), 0.0, 1.0)

    gold_grad = rgb("FFF3AE")[None, None, :] * (1.0 - yn[:, :, None] * 0.85) + rgb("C47E14")[None, None, :] * (yn[:, :, None] * 0.85)
    sheen = np.exp(-((yn - 0.07) / 0.05) ** 2) * 0.45
    gold_grad = np.clip(gold_grad + 255.0 * sheen[:, :, None], 0.0, 255.0)

    # Rich deep imperial indigo-crimson radial backplate
    rad = np.hypot((x - cx) / (85 * SS), (y - cy) / (108 * SS))
    face_col = rgb("28486E")[None, None, :] * np.clip(1.0 - rad[:, :, None] * 0.72, 0.0, 1.0) \
        + rgb("102036")[None, None, :] * np.clip(rad[:, :, None] * 0.72, 0.0, 1.0)

    # Geometric diamond lattice inside face
    ang1 = np.abs(((x + y) % (22 * SS)) / (22 * SS) - 0.5)
    ang2 = np.abs(((x - y) % (22 * SS)) / (22 * SS) - 0.5)
    lat = np.clip(1.0 - np.minimum(ang1, ang2) * 28.0, 0.0, 1.0)
    face_col = face_col + lat[:, :, None] * rgb("5688BA")[None, None, :] * 0.22

    # Central embossed golden & crimson war-drum medallion
    r_px = np.hypot(x - cx, y - cy)
    m_ring_out = np.clip(0.5 - (r_px - 48 * SS), 0.0, 1.0)
    m_ring_dark = np.clip(0.5 - (r_px - 42 * SS), 0.0, 1.0)
    m_crimson = np.clip(0.5 - (r_px - 38 * SS), 0.0, 1.0)
    m_star_ring = np.clip(0.5 - np.abs(r_px - 28 * SS) + 1.6 * SS, 0.0, 1.0)

    # 4-pointed golden star emblem in center
    ux = np.abs(x - cx) / (24.0 * SS)
    uy = np.abs(y - cy) / (24.0 * SS)
    star_d = (ux ** 0.65 + uy ** 0.65) - 1.0
    m_star = np.clip(0.5 - star_d * (18.0 * SS), 0.0, 1.0)

    crim_grad = rgb("E84438")[None, None, :] * (1.0 - yn[:, :, None] * 0.5) + rgb("8E1818")[None, None, :] * (yn[:, :, None] * 0.5)
    face_col = face_col * (1.0 - m_ring_out[:, :, None]) + gold_grad * m_ring_out[:, :, None]
    face_col = face_col * (1.0 - m_ring_dark[:, :, None]) + rgb("0D1A2B")[None, None, :] * m_ring_dark[:, :, None]
    face_col = face_col * (1.0 - m_crimson[:, :, None]) + crim_grad * m_crimson[:, :, None]
    face_col = face_col * (1.0 - m_star_ring[:, :, None]) + rgb("FFE28A")[None, None, :] * m_star_ring[:, :, None]
    face_col = face_col * (1.0 - m_star[:, :, None]) + rgb("FFF5BE")[None, None, :] * m_star[:, :, None]

    # 8 brass drum studs around the medallion ring
    for k in range(8):
        ang = k * np.pi * 0.25
        sx = cx + np.cos(ang) * 45.0 * SS
        sy = cy + np.sin(ang) * 45.0 * SS
        ds = np.hypot(x - sx, y - sy) - 3.2 * SS
        ms = np.clip(0.5 - ds, 0.0, 1.0)
        face_col = face_col * (1.0 - ms[:, :, None]) + rgb("FFF6C4")[None, None, :] * ms[:, :, None]

    # Corner diamond studs
    for sx in (-74 * SS, 74 * SS):
        for sy in (-98 * SS, 98 * SS):
            dd = (np.abs(x - (cx + sx)) + np.abs(y - (cy + sy))) - 7.5 * SS
            ms = np.clip(0.5 - dd, 0.0, 1.0)
            face_col = face_col * (1.0 - ms[:, :, None]) + gold_grad * ms[:, :, None]

    col = np.broadcast_to(rgb("09121E"), (h, w, 3)).copy()
    col = col * (1.0 - m_gold[:, :, None]) + gold_grad * m_gold[:, :, None]
    col = col * (1.0 - m_groove[:, :, None]) + rgb("0D1C2E")[None, None, :] * m_groove[:, :, None]
    col = col * (1.0 - m_in_gold[:, :, None]) + (gold_grad * 0.88) * m_in_gold[:, :, None]
    col = col * (1.0 - m_face[:, :, None]) + face_col * m_face[:, :, None]

    alpha = np.clip(a_main + sh_a * (1.0 - a_main), 0.0, 1.0)
    final_rgb = col * a_main[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(final_rgb), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_sum_crown() -> Image.Image:
    """累计获得专属·皇家展翼鎏金天罡大冠冕 (860x184)。"""
    bw, bh = 860, 184
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.56
    yn = y / max(1.0, h - 1)
    ax = np.abs(x - cx)

    # 3-tier spread golden wings on left and right
    d_wings = np.full((h, w), 1e9, dtype=np.float32)
    wing_specs = [
        # (inner_x, inner_y, tip_x, tip_y, bot_x, bot_y)
        (170 * SS, cy - 34 * SS, 418 * SS, cy - 48 * SS, 352 * SS, cy - 6 * SS),
        (180 * SS, cy - 8 * SS,  394 * SS, cy - 10 * SS, 330 * SS, cy + 24 * SS),
        (170 * SS, cy + 16 * SS, 352 * SS, cy + 26 * SS, 292 * SS, cy + 50 * SS),
    ]
    for ix, iy, tx, ty, bx, by in wing_specs:
        # Symmetric in ax
        min_seg = np.minimum(
            sdf_segment(ax, y, ix, iy, tx, ty),
            np.minimum(sdf_segment(ax, y, tx, ty, bx, by), sdf_segment(ax, y, bx, by, ix, iy))
        )
        pcx, pcy = (ix + tx + bx) / 3.0, (iy + ty + by) / 3.0
        inside = np.ones((h, w), dtype=bool)
        pts = [(ix, iy), (tx, ty), (bx, by)]
        for k in range(3):
            x0, y0 = pts[k]
            x1, y1 = pts[(k + 1) % 3]
            cc = (x1 - x0) * (pcy - y0) - (y1 - y0) * (pcx - x0)
            cp = (x1 - x0) * (y - y0) - (y1 - y0) * (ax - x0)
            inside &= (cp * np.sign(cc) >= -1e-4)
        dw = np.where(inside, -min_seg, min_seg) - 5.5 * SS
        d_wings = np.minimum(d_wings, dw)

    # Central royal chamfered arch plaque
    arch_lift = np.clip(1.0 - (ax / (230.0 * SS)) ** 2, 0.0, 1.0) * 14.0 * SS
    d_plaque = sdf_chamfer_rect(x, y + arch_lift * 0.45, cx, cy, 246 * SS, 52 * SS, 28 * SS)

    # Top central imperial star-crest gem
    d_crest = (ax * 0.82 + np.abs(y - (cy - 58 * SS))) - 28 * SS

    d_all = np.minimum(np.minimum(d_wings, d_plaque), d_crest)
    d_sh = np.roll(d_all, int(5 * SS), axis=0)
    d_sh[:int(5 * SS), :] = 999.0
    sh_a = np.clip(1.0 - d_sh / (8.0 * SS), 0.0, 1.0) ** 1.5 * 0.52

    a_main = np.clip(0.5 - d_all, 0.0, 1.0)

    gold_hi = rgb("FFF7BD")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("D48814")[None, None, :] * yn[:, :, None]
    wing_fill = np.clip(0.5 - (d_wings + 3.2 * SS), 0.0, 1.0)
    wing_ridge = np.clip(0.5 - (d_wings + 9.0 * SS), 0.0, 1.0)

    col = np.broadcast_to(rgb("2E1606"), (h, w, 3)).copy()
    col = col * (1.0 - wing_fill[:, :, None]) + gold_hi * wing_fill[:, :, None]
    col = col * (1.0 - wing_ridge[:, :, None]) + (gold_hi * 0.86 + rgb("FFAE24")[None, None, :] * 0.14) * wing_ridge[:, :, None]

    # Plaque layers: dark outline -> thick bright gold bevel -> deep royal crimson-vermilion silk core
    m_p_out = np.clip(0.5 - d_plaque, 0.0, 1.0)
    m_p_gold = np.clip(0.5 - (d_plaque + 3.2 * SS), 0.0, 1.0)
    m_p_in = np.clip(0.5 - (d_plaque + 12.0 * SS), 0.0, 1.0)
    m_p_line = np.clip(0.5 - np.abs(d_plaque + 16.5 * SS) + 1.4 * SS, 0.0, 1.0)

    silk = rgb("C82824")[None, None, :] * (1.0 - yn[:, :, None] * 0.65) + rgb("6E1014")[None, None, :] * (yn[:, :, None] * 0.65)
    # Warm central glow behind title text
    c_glow = np.exp(-((x - cx) / (165 * SS)) ** 2 - ((y - cy) / (42 * SS)) ** 2)
    silk = np.clip(silk + rgb("FF9E2C")[None, None, :] * c_glow[:, :, None] * 0.42, 0.0, 255.0)

    col = col * (1.0 - m_p_out[:, :, None]) + rgb("2A1206")[None, None, :] * m_p_out[:, :, None]
    col = col * (1.0 - m_p_gold[:, :, None]) + gold_hi * m_p_gold[:, :, None]
    col = col * (1.0 - m_p_in[:, :, None]) + silk * m_p_in[:, :, None]
    col = col * (1.0 - m_p_line[:, :, None]) + rgb("FFE68C")[None, None, :] * (m_p_line * 0.78)[:, :, None]

    # Top central ruby-gold star crest
    m_c_out = np.clip(0.5 - d_crest, 0.0, 1.0)
    m_c_gold = np.clip(0.5 - (d_crest + 2.8 * SS), 0.0, 1.0)
    m_c_gem = np.clip(0.5 - (d_crest + 9.5 * SS), 0.0, 1.0)
    col = col * (1.0 - m_c_out[:, :, None]) + rgb("2A1206")[None, None, :] * m_c_out[:, :, None]
    col = col * (1.0 - m_c_gold[:, :, None]) + rgb("FFF5B6")[None, None, :] * m_c_gold[:, :, None]
    col = col * (1.0 - m_c_gem[:, :, None]) + rgb("FF4436")[None, None, :] * m_c_gem[:, :, None]

    alpha = np.clip(a_main + sh_a * (1.0 - a_main), 0.0, 1.0)
    final_rgb = col * a_main[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(final_rgb), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_sum_pedestal() -> Image.Image:
    """累计获得专属·星耀鎏金神坛半透托盘 (256x256, 9-slice 56,56,56,56)。"""
    bw, bh = 256, 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    yn = y / max(1.0, h - 1)

    d = sdf_chamfer_rect(x, y, cx, cy, 122 * SS, 122 * SS, 26 * SS)
    a_box = np.clip(0.5 - d, 0.0, 1.0)
    m_rim = np.clip(0.5 - (d + 2.4 * SS), 0.0, 1.0)
    m_in = np.clip(0.5 - (d + 6.8 * SS), 0.0, 1.0)

    rim = rgb("FFEFA6")[None, None, :] * (1.0 - yn[:, :, None] * 0.6) + rgb("D48E1A")[None, None, :] * (yn[:, :, None] * 0.6)
    body = rgb("162C48")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("0C192C")[None, None, :] * yn[:, :, None]

    cell = 32.0 * SS
    gx = np.abs(((x % cell) / cell) - 0.5)
    gy = np.abs(((y % cell) / cell) - 0.5)
    pat = np.clip(1.0 - np.abs(gx + gy - 0.5) * 28.0, 0.0, 1.0)
    body = body + pat[:, :, None] * rgb("4C88C4")[None, None, :] * 0.18

    col = np.broadcast_to(rgb("091320"), (h, w, 3)).copy()
    col = col * (1.0 - m_rim[:, :, None]) + rim * m_rim[:, :, None]
    col = col * (1.0 - m_in[:, :, None]) + body * m_in[:, :, None]

    # Corner gold studs
    for sx in (-104 * SS, 104 * SS):
        for sy in (-104 * SS, 104 * SS):
            dd = (np.abs(x - (cx + sx)) + np.abs(y - (cy + sy))) - 6.0 * SS
            ms = np.clip(0.5 - dd, 0.0, 1.0)
            col = col * (1.0 - ms[:, :, None]) + rgb("FFF0A0")[None, None, :] * ms[:, :, None]

    alpha = a_box * (1.0 - m_in * 0.22)  # Rich translucent glass interior (78% alpha), solid crisp gold rim
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_shine_bar() -> Image.Image:
    """斜向 35 度柔滑闪卡扫光条 (128x256)。"""
    bw, bh = 128, 256
    y, x = np.mgrid[0:bh, 0:bw].astype(np.float32)
    u = (x - bw * 0.5) + (y - bh * 0.5) * 0.42
    core = np.exp(-(u / 13.0) ** 2) * 0.92
    sub = np.exp(-((u - 22.0) / 5.5) ** 2) * 0.48
    v_fade = np.clip(1.0 - (np.abs(y - bh * 0.5) / (bh * 0.52)) ** 4, 0.0, 1.0)
    a = np.clip((core + sub) * v_fade, 0.0, 1.0)

    out = np.zeros((bh, bw, 4), dtype=np.uint8)
    out[:, :, 0] = 255
    out[:, :, 1] = 252
    out[:, :, 2] = 232
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def main():
    os.makedirs(OUT, exist_ok=True)
    items = {
        "gacha_dock_gold.png": make_dock("gold"),
        "gacha_dock_purple.png": make_dock("purple"),
        "gacha_tray.png": make_tray(),
        "gacha_oct_badge.png": make_oct_badge(),
        "gacha_skip_btn.png": make_skip_btn(),
        "gacha_check_off.png": make_checkbox(False),
        "gacha_check_on.png": make_checkbox(True),
        "gacha_card_back.png": make_card_back(),
        "gacha_sum_crown.png": make_sum_crown(),
        "gacha_sum_pedestal.png": make_sum_pedestal(),
        "gacha_shine_bar.png": make_shine_bar(),
    }
    for name, im in items.items():
        p = os.path.join(OUT, name)
        im.save(p)
        print(f"wrote {name} {im.size}")


if __name__ == "__main__":
    main()


def make_summon_pillar() -> Image.Image:
    """天罡降临冲天圣光柱 (384x768)：炽白高能纤芯 + 丝绸流光束纹理 + 祭坛圣火托底，四边严格归零羽化。"""
    bw, bh = 384, 768
    y, x = np.mgrid[0:bh, 0:bw].astype(np.float32)
    u = (x - (bw - 1) * 0.5) / (bw * 0.5)  # -1..1
    v = y / max(1.0, bh - 1)                # 0(top)..1(bottom altar)

    width_scale = 0.66 + 0.38 * v
    ux = u / width_scale

    # Razor-sharp incandescent core + layered silk ribbons + soft outer aura
    core = np.exp(-(ux / 0.095) ** 2) * 1.0
    inner = np.exp(-(ux / 0.24) ** 2) * 0.68
    outer = np.exp(-(ux / 0.58) ** 2) * 0.30

    rib1 = (0.5 + 0.5 * np.cos(ux * 34.0 + v * 3.0)) ** 5 * np.exp(-(ux / 0.44) ** 2) * 0.38
    rib2 = (0.5 + 0.5 * np.sin(ux * 58.0 - v * 4.5)) ** 7 * np.exp(-(ux / 0.32) ** 2) * 0.28

    v_top = np.clip(v / 0.24, 0.0, 1.0) ** 1.7
    v_bot = np.clip((1.0 - v) / 0.22, 0.0, 1.0) ** 2.0
    v_env = v_top * v_bot
    base_flare = np.exp(-((v - 0.78) / 0.075) ** 2) * np.exp(-(ux / 0.52) ** 2) * 0.52

    a = np.clip((core * 0.96 + inner + outer + rib1 + rib2 + base_flare) * v_env, 0.0, 1.0)
    edge_x = np.clip((1.0 - np.abs(u)) / 0.18, 0.0, 1.0) ** 2.0
    a *= edge_x

    whiteness = np.clip(core * 1.25 + rib1 * 0.55 + base_flare * 0.65, 0.0, 1.0)
    c_edge = rgb("FFD478")[None, None, :]
    c_core = rgb("FFFFFF")[None, None, :]
    col = c_edge * (1.0 - whiteness[:, :, None]) + c_core * whiteness[:, :, None]

    out = np.zeros((bh, bw, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def make_shock_burst() -> Image.Image:
    """英雄降临瞬间背后的星芒爆裂法相 (384x384)，纯羽化放射光芒无生硬圆框。"""
    n = 384
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    cx = cy = (n - 1) * 0.5
    dx, dy = (x - cx) / (n * 0.5), (y - cy) / (n * 0.5)
    r = np.hypot(dx, dy) + 1e-6
    ang = np.arctan2(dy, dx)

    # 4 major cardinal star spikes + 8 secondary rays + soft central corona
    sp4 = (np.abs(np.cos(ang * 2.0)) ** 18) * np.exp(-r * 2.3) * 0.95
    sp8 = (np.abs(np.cos(ang * 4.0 + np.pi * 0.25)) ** 24) * np.exp(-r * 3.0) * 0.70
    sp16 = (0.5 + 0.5 * np.cos(ang * 12.0)) ** 8 * np.exp(-r * 3.6) * 0.35
    corona = np.exp(-(r / 0.34) ** 2) * 0.88
    soft_wave = np.exp(-((r - 0.56) / 0.09) ** 2) * 0.26

    fade_edge = np.clip((1.0 - r) / 0.16, 0.0, 1.0) ** 1.5
    a = np.clip((sp4 + sp8 + sp16 + corona + soft_wave) * fade_edge, 0.0, 1.0)

    whiteness = np.clip(corona + sp4 * 0.7, 0.0, 1.0)
    col = rgb("FFEAA0")[None, None, :] * (1.0 - whiteness[:, :, None]) + 255.0 * whiteness[:, :, None]

    out = np.zeros((n, n, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def make_meteor_streak() -> Image.Image:
    """天外星陨流光彗星 (192x420)：头部在下 (v=0.84)，拖尾朝上渐隐。"""
    bw, bh = 192, 420
    y, x = np.mgrid[0:bh, 0:bw].astype(np.float32)
    u = (x - (bw - 1) * 0.5) / (bw * 0.5)
    v = y / max(1.0, bh - 1)

    head_v = 0.83
    # Tail stretches from v=0.04 to head_v
    tail_t = np.clip(v / head_v, 0.0, 1.0)
    tail_w = 0.05 + 0.24 * (tail_t ** 1.6)
    tail = np.exp(-(u / tail_w) ** 2) * (tail_t ** 2.1) * np.clip((head_v + 0.06 - v) / 0.08, 0.0, 1.0)

    # Glowing star head
    hd_r = np.hypot(u / 0.42, (v - head_v) / 0.11)
    head = np.exp(-(hd_r ** 2) * 2.2) * 1.0
    cross = (np.exp(-(u / 0.07) ** 2) * np.exp(-((v - head_v) / 0.14) ** 2) +
             np.exp(-((v - head_v) / 0.03) ** 2) * np.exp(-(u / 0.62) ** 2)) * 0.85

    edge_x = np.clip((1.0 - np.abs(u)) / 0.10, 0.0, 1.0)
    a = np.clip((tail * 0.88 + head + cross) * edge_x, 0.0, 1.0)

    whiteness = np.clip(head + cross * 0.8 + (tail ** 2) * 0.5, 0.0, 1.0)
    col = rgb("FFE28A")[None, None, :] * (1.0 - whiteness[:, :, None]) + 255.0 * whiteness[:, :, None]

    out = np.zeros((bh, bw, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def make_hero_plaque() -> Image.Image:
    """点将台英雄登场专属·鎏金展翼高定报幕铭牌 (460x92)。"""
    bw, bh = 460, 92
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    yn = y / max(1.0, h - 1)

    d = sdf_chamfer_rect(x, y, cx, cy, 214 * SS, 38 * SS, 26 * SS)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    m_rim = np.clip(0.5 - (d + 2.4 * SS), 0.0, 1.0)
    m_in = np.clip(0.5 - (d + 6.6 * SS), 0.0, 1.0)

    # Horizontal fade on body so left/right tips blend airily while center is rich dark indigo
    ux = np.abs(x - cx) / (214.0 * SS)
    rim = rgb("FFF3AE")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("C98418")[None, None, :] * yn[:, :, None]
    body = rgb("162B46")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("0B1728")[None, None, :] * yn[:, :, None]

    col = np.broadcast_to(rgb("08111C"), (h, w, 3)).copy()
    col = col * (1.0 - m_rim[:, :, None]) + rim * m_rim[:, :, None]
    col = col * (1.0 - m_in[:, :, None]) + body * m_in[:, :, None]

    for sx in (-186 * SS, 186 * SS):
        dd = (np.abs(x - (cx + sx)) + np.abs(y - cy)) - 6.0 * SS
        ms = np.clip(0.5 - dd, 0.0, 1.0)
        col = col * (1.0 - ms[:, :, None]) + rgb("FFE88E")[None, None, :] * ms[:, :, None]

    fade_a = alpha * (1.0 - 0.14 * m_in * (ux ** 1.5))
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(fade_a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)



def make_magic_seal() -> Image.Image:
    """国风天罡星宿双环罗盘大法阵 (512x512)：2x 超采样，炽白高光脊线 + 柔光外晕，叠加时极具流光立体感。"""
    bw = 512
    n = bw * 2
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    cx = cy = (n - 1) * 0.5
    dx, dy = (x - cx) / (n * 0.5), (y - cy) / (n * 0.5)
    r = np.hypot(dx, dy) + 1e-6
    ang = np.arctan2(dy, dx)

    sharp = np.zeros((n, n), dtype=np.float32)
    # Ornate multi-gauge astrological rings
    for rad, w_ring, inten in [
        (0.91, 0.011, 1.00), (0.86, 0.005, 0.80), (0.76, 0.009, 0.94),
        (0.58, 0.011, 0.96), (0.53, 0.005, 0.72), (0.34, 0.009, 0.88), (0.16, 0.007, 0.78)
    ]:
        sharp = np.maximum(sharp, np.clip(1.0 - np.abs(r - rad) / w_ring, 0.0, 1.0) * inten)

    # 28 Lunar Mansion fine ticks (outer band 0.76..0.86) + 36 Tiangang ticks (0.86..0.91)
    t28 = np.clip(1.0 - np.abs(np.sin(ang * 14.0)) * 18.0, 0.0, 1.0) * ((r >= 0.76) & (r <= 0.86))
    t36 = np.clip(1.0 - np.abs(np.sin(ang * 18.0)) * 22.0, 0.0, 1.0) * ((r >= 0.86) & (r <= 0.91))
    sharp = np.maximum(sharp, np.maximum(t28 * 0.82, t36 * 0.75))

    # 8 Radiant celestial star jewels on r=0.81 + 8 inner pearls on r=0.44
    jewels = np.zeros((n, n), dtype=np.float32)
    for k in range(8):
        ak = k * np.pi * 0.25
        sx, sy = np.cos(ak) * 0.81, np.sin(ak) * 0.81
        rx = (dx - sx) * np.cos(ak) + (dy - sy) * np.sin(ak)
        ry = -(dx - sx) * np.sin(ak) + (dy - sy) * np.cos(ak)
        d_dia = np.abs(rx) / 0.036 + np.abs(ry) / 0.022
        jewels = np.maximum(jewels, np.clip(1.0 - (d_dia - 0.55) / 0.45, 0.0, 1.0))

        ak2 = ak + np.pi * 0.125
        px, py = np.cos(ak2) * 0.44, np.sin(ak2) * 0.44
        dp = np.hypot(dx - px, dy - py)
        jewels = np.maximum(jewels, np.exp(-(dp / 0.022) ** 2) * 0.95)
    sharp = np.maximum(sharp, jewels)

    # Sacred Octagram (two rotated squares inscribed in r=0.76)
    for rot in (0.0, np.pi * 0.25):
        rx = dx * np.cos(rot) + dy * np.sin(rot)
        ry = -dx * np.sin(rot) + dy * np.cos(rot)
        sq = 0.537
        d_sq = np.minimum(
            np.where(np.abs(ry) <= sq + 0.008, np.abs(np.abs(rx) - sq), 9.0),
            np.where(np.abs(rx) <= sq + 0.008, np.abs(np.abs(ry) - sq), 9.0)
        )
        sharp = np.maximum(sharp, np.clip(1.0 - d_sq / 0.009, 0.0, 1.0) * 0.90)

    # 8 Cardinal dragon-lance needles
    needle = (np.abs(np.cos(ang * 4.0)) ** 56) * ((r > 0.14) & (r < 0.95))
    sharp = np.maximum(sharp, needle * 0.85)

    # Rich soft halo rings + central nebula
    glow = (np.exp(-((r - 0.84) / 0.09) ** 2) * 0.42 +
            np.exp(-((r - 0.56) / 0.08) ** 2) * 0.30 +
            np.exp(-(r / 0.42) ** 2) * 0.20)
    fade = np.clip((1.0 - r) / 0.07, 0.0, 1.0) ** 1.6
    a = np.clip((sharp * 0.96 + glow) * fade, 0.0, 1.0)

    # Specular white ridges + warm golden halo for luminous depth
    whiteness = np.clip(sharp * 1.10, 0.0, 1.0)
    col = rgb("FFD678")[None, None, :] * (1.0 - whiteness[:, :, None]) + 255.0 * whiteness[:, :, None]

    out = np.zeros((n, n, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bw), Image.Resampling.LANCZOS)


def make_halo_ring() -> Image.Image:
    """神将背光鎏金日轮法相 (512x512)：72 根精密太阳神芒针 + 双道纤细星环 + 十字长芒，四边 0-alpha。"""
    bw = 512
    n = bw * 2
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    cx = cy = (n - 1) * 0.5
    dx, dy = (x - cx) / (n * 0.5), (y - cy) / (n * 0.5)
    r = np.hypot(dx, dy) + 1e-6
    ang = np.arctan2(dy, dx)

    # 72 ultra-fine radial sun needles between r=0.40 and r=0.88
    n72 = (0.5 + 0.5 * np.cos(ang * 72.0)) ** 18 * np.exp(-((r - 0.58) / 0.22) ** 2) * 0.78
    n16 = (0.5 + 0.5 * np.cos(ang * 16.0)) ** 36 * np.exp(-((r - 0.62) / 0.26) ** 2) * 0.92
    n4 = (np.abs(np.cos(ang * 2.0)) ** 80) * np.exp(-((r - 0.52) / 0.34) ** 2) * 1.00

    ring1 = np.clip(1.0 - np.abs(r - 0.54) / 0.008, 0.0, 1.0) * 0.96
    ring2 = np.clip(1.0 - np.abs(r - 0.68) / 0.005, 0.0, 1.0) * 0.78
    corona = np.exp(-(r / 0.44) ** 2) * 0.62 + np.exp(-((r - 0.54) / 0.06) ** 2) * 0.38

    fade_edge = (np.clip((1.0 - r) / 0.14, 0.0, 1.0) ** 1.8) * (np.clip((1.0 - np.maximum(np.abs(dx), np.abs(dy))) / 0.10, 0.0, 1.0) ** 1.5)
    sharp = np.maximum(np.maximum(ring1, ring2), np.maximum(n4, n16 * 0.85))
    a = np.clip((n72 + n16 * 0.6 + n4 + ring1 + ring2 + corona) * fade_edge, 0.0, 1.0)

    whiteness = np.clip(sharp * 1.05 + corona * 0.55, 0.0, 1.0)
    col = rgb("FFE082")[None, None, :] * (1.0 - whiteness[:, :, None]) + 255.0 * whiteness[:, :, None]

    out = np.zeros((n, n, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bw), Image.Resampling.LANCZOS)


def make_arc_slash() -> Image.Image:
    """破晓电影级横拉星芒斩 (512x256)：修长锐利横贯光刃 + 中心钻石耀斑，四边严格 0-alpha。"""
    bw, bh = 512, 256
    y, x = np.mgrid[0:bh, 0:bw].astype(np.float32)
    u = (x - (bw - 1) * 0.5) / (bw * 0.5)
    v = (y - (bh - 1) * 0.5) / (bh * 0.5)

    # Anamorphic horizontal streak tapering smoothly to tips
    x_env = np.clip(1.0 - np.abs(u), 0.0, 1.0) ** 1.6
    y_env = np.clip(1.0 - np.abs(v), 0.0, 1.0) ** 1.8
    blade_w = 0.028 + 0.065 * (1.0 - np.abs(u)) ** 2
    blade = np.exp(-(v / blade_w) ** 2) * (x_env ** 0.7) * 1.0
    halo_h = np.exp(-(v / 0.24) ** 2) * np.exp(-(u / 0.68) ** 2) * 0.52
    vert_spike = np.exp(-(u / 0.026) ** 2) * np.exp(-(v / 0.62) ** 2) * 0.92
    center_star = np.exp(-(np.hypot(u / 0.16, v / 0.30)) ** 2 * 1.8) * 1.0

    a = np.clip((blade + halo_h + vert_spike + center_star) * x_env * y_env, 0.0, 1.0)
    whiteness = np.clip(blade * 1.1 + center_star + vert_spike * 0.9, 0.0, 1.0)
    col = rgb("FFE288")[None, None, :] * (1.0 - whiteness[:, :, None]) + 255.0 * whiteness[:, :, None]

    out = np.zeros((bh, bw, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def make_stage_vignette() -> Image.Image:
    """高光时刻专属·深邃星夜聚光剧场遮罩 (512x512)：中心点将台通透，四周深靛玄夜压住背景杂光。"""
    n = 512
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    u = (x - (n - 1) * 0.5) / (n * 0.5)       # -1..1
    v = (y - (n - 1) * 0.62) / (n * 0.5)      # spotlight centered slightly lower on stone altar
    r_spot = np.hypot(u / 0.56, v / 0.50)

    a = np.clip((r_spot - 0.32) / 0.92, 0.0, 1.0) ** 1.35
    a = np.clip(a * 0.94 + 0.14, 0.0, 0.96)

    c_in = rgb("0A1026")[None, None, :]
    c_out = rgb("02050E")[None, None, :]
    t = np.clip(r_spot / 1.4, 0.0, 1.0)[:, :, None]
    col = c_in * (1.0 - t) + c_out * t

    out = np.zeros((n, n, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def make_speed_lines() -> Image.Image:
    """动漫大片级四周放射冲击速度线 (512x512)：中心留空突出英雄，外圈凌厉高能放射线束。"""
    n = 512
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    cx = cy = (n - 1) * 0.5
    dx, dy = (x - cx) / (n * 0.5), (y - cy) / (n * 0.5)
    r = np.hypot(dx, dy) + 1e-6
    ang = np.arctan2(dy, dx)

    s1 = (0.5 + 0.5 * np.sin(ang * 42.0 + 0.4)) ** 14
    s2 = (0.5 + 0.5 * np.sin(ang * 68.0 + 1.9)) ** 18
    s3 = (0.5 + 0.5 * np.sin(ang * 24.0 - 0.8)) ** 10
    spikes = np.clip(s1 * 0.88 + s2 * 0.96 + s3 * 0.50, 0.0, 1.0)

    radial_mask = np.clip((r - 0.38) / 0.42, 0.0, 1.0) ** 1.6
    outer_vignette = np.clip((r - 0.72) / 0.55, 0.0, 1.0) * 0.24
    a = np.clip(spikes * radial_mask * 0.94 + outer_vignette, 0.0, 1.0)

    whiteness = np.clip(spikes * 0.95, 0.0, 1.0)
    col = rgb("FFE490")[None, None, :] * (1.0 - whiteness[:, :, None]) + 255.0 * whiteness[:, :, None]

    out = np.zeros((n, n, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def make_lightning_crack() -> Image.Image:
    """异变逆转专属·天机碎裂闪电纹 (512x512)：炽白雷芯 + 柔光雷晕，裂屏惊雷质感拉满！"""
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
        [(162, 146), (112, 132), (70, 98)],
        [(234, 154), (290, 148), (344, 124)],
        [(184, 108), (208, 72), (198, 42)],
        [(144, 214), (132, 256), (96, 294)],
    ]
    for pts in branches:
        for i in range(len(pts) - 1):
            ax, ay = pts[i][0] * s, pts[i][1] * s
            bx, by = pts[i + 1][0] * s, pts[i + 1][1] * s
            d_min = np.minimum(d_min, sdf_segment(x, y, ax, ay, bx, by))

    core = np.clip(1.0 - d_min / 3.0, 0.0, 1.0)
    inner = np.exp(-(d_min / 7.5) ** 2) * 0.85
    glow = np.exp(-(d_min / 20.0) ** 2) * 0.58
    cx = cy = (n - 1) * 0.5
    r = np.hypot(x - cx, y - cy) / (n * 0.5)
    fade = np.clip((1.0 - r) / 0.14, 0.0, 1.0) ** 1.5
    a = np.clip((core + inner * 0.6 + glow * 0.7) * fade, 0.0, 1.0)

    whiteness = np.clip(core + inner * 0.75, 0.0, 1.0)
    col = rgb("FFE088")[None, None, :] * (1.0 - whiteness[:, :, None]) + 255.0 * whiteness[:, :, None]

    out = np.zeros((n, n, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


for _nm, _fn in [
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
]:
    _im = _fn()
    _im.save(os.path.join(OUT, _nm))
    print(f"wrote extra {_nm} {_im.size}")
