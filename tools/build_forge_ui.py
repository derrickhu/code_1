"""生成装备强化/改装页专属 04 风格（45° 切角黑曜石 + 霓虹青/翠绿/鎏金双线）UI 组件皮肤。"""
import os
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets/Resources/Art/ui")
SS = 4


def rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def rgba_t(h: str, a: int = 255) -> tuple:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


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


def make_double_arrow() -> Image.Image:
    bw, bh = 88, 64
    w, h = bw * SS, bh * SS
    r = 2.0 * SS
    stroke = 2.4 * SS
    lip_dy = int(round(3.0 * SS))

    t1 = [(14 * SS, 12 * SS), (41 * SS, 30.5 * SS), (14 * SS, 49 * SS)]
    t2 = [(43 * SS, 12 * SS), (72 * SS, 30.5 * SS), (43 * SS, 49 * SS)]
    d = np.minimum(sdf_triangle(w, h, t1, r), sdf_triangle(w, h, t2, r))

    d_lip = np.roll(d, lip_dy, axis=0)
    d_lip[:lip_dy, :] = 999.0
    d_union = np.minimum(d, d_lip)

    alpha = np.clip(0.5 - d_union, 0.0, 1.0)
    face_mask = np.clip(0.5 - (d + stroke), 0.0, 1.0)
    lip_mask = np.clip(0.5 - (d_lip + stroke), 0.0, 1.0) * (1.0 - np.clip(0.5 - d, 0.0, 1.0))

    y_norm = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    cel = np.clip((y_norm - 0.45) / 0.05, 0.0, 1.0)
    fill = rgb("58FFAC")[None, None, :] * (1.0 - cel) + rgb("00C864")[None, None, :] * cel
    c_lip, c_str = rgb("06542E")[None, None, :], rgb("050914")[None, None, :]

    col = c_str * (1.0 - np.maximum(face_mask, lip_mask)[:, :, None]) + c_lip * lip_mask[:, :, None] + fill * face_mask[:, :, None]
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_single_arrow() -> Image.Image:
    bw, bh = 38, 42
    w, h = bw * SS, bh * SS
    pts = [(9 * SS, 8 * SS), (29 * SS, 21 * SS), (9 * SS, 34 * SS)]
    d = sdf_triangle(w, h, pts, 1.8 * SS)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    face = np.clip(0.5 - (d + 2.2 * SS), 0.0, 1.0)
    y_norm = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    cel = np.clip((y_norm - 0.45) / 0.05, 0.0, 1.0)
    fill = rgb("58FFAC")[None, None, :] * (1.0 - cel) + rgb("00C864")[None, None, :] * cel
    col = rgb("050914")[None, None, :] * (1.0 - face[:, :, None]) + fill * face[:, :, None]
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_corner_sel() -> Image.Image:
    bw, bh = 160, 160
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5

    ring_d = np.maximum(
        sdf_oct_box(x, y, cx, cy, 76 * SS, 76 * SS, 18 * SS, 1.0 * SS),
        -sdf_oct_box(x, y, cx, cy, 65 * SS, 65 * SS, 13 * SS, 1.0 * SS),
    )
    cut_d = np.maximum((28 * SS) - np.abs(x - cx), (28 * SS) - np.abs(y - cy))
    bracket_d = np.maximum(ring_d, cut_d)

    alpha = np.clip(0.5 - bracket_d, 0.0, 1.0)
    face = np.clip(0.5 - (bracket_d + 2.4 * SS), 0.0, 1.0)
    hi_band = np.clip(0.5 - (bracket_d + 4.4 * SS), 0.0, 1.0)

    fill = rgb("FFB800")[None, None, :] * (1.0 - (face - hi_band)[:, :, None] * 0.65) + rgb("FFF8C4")[None, None, :] * ((face - hi_band)[:, :, None] * 0.65)
    col = rgb("050914")[None, None, :] * (1.0 - face[:, :, None]) + fill * face[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_back_btn() -> Image.Image:
    bw, bh = 132, 92
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 2.8 * SS
    hw, hh, ch = 58.0 * SS, 37.0 * SS, 15.0 * SS
    d = sdf_oct_box(x, y, cx, cy, hw, hh, ch, 1.0 * SS)

    lip_dy = int(round(5.4 * SS))
    d_lip = np.roll(d, lip_dy, axis=0)
    d_lip[:lip_dy, :] = 999.0
    d_u = np.minimum(d, d_lip)
    stroke = 2.6 * SS

    alpha = np.clip(0.5 - d_u, 0.0, 1.0)
    rim_m = np.clip(0.5 - (d + stroke), 0.0, 1.0)
    face_m = np.clip(0.5 - (d + stroke + 2.2 * SS), 0.0, 1.0)
    lip_m = np.clip(0.5 - (d_lip + stroke), 0.0, 1.0) * (1.0 - np.clip(0.5 - d, 0.0, 1.0))

    y_norm = np.clip((y - (cy - hh)) / (2.0 * hh), 0.0, 1.0)[:, :, None]
    cel = np.clip((y_norm - 0.45) / 0.06, 0.0, 1.0)
    grad = rgb("162A4C")[None, None, :] * (1.0 - cel) + rgb("0D1A32")[None, None, :] * cel

    ay = cy + 0.5 * SS
    tri = [(cx - 23 * SS, ay), (cx - 2 * SS, ay - 16 * SS), (cx - 2 * SS, ay + 16 * SS)]
    d_arr = np.minimum(sdf_triangle(w, h, tri, 2.4 * SS), sdf_segment(x, y, cx - 6 * SS, ay, cx + 19 * SS, ay) - 6.4 * SS)
    arr_str = np.clip(0.5 - (d_arr - 2.2 * SS), 0.0, 1.0)
    arr_fill = np.clip(0.5 - d_arr, 0.0, 1.0)

    grad = grad * (1.0 - arr_str[:, :, None]) + rgb("050914")[None, None, :] * arr_str[:, :, None]
    grad = grad * (1.0 - arr_fill[:, :, None]) + rgb("EAF6FF")[None, None, :] * arr_fill[:, :, None]

    face_col = rgb("00E5FF")[None, None, :] * (1.0 - face_m[:, :, None]) + grad * face_m[:, :, None]
    col = rgb("050914")[None, None, :] * (1.0 - np.maximum(rim_m, lip_m)[:, :, None]) \
        + rgb("083A58")[None, None, :] * lip_m[:, :, None] + face_col * rim_m[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_tab_diamond(active: bool) -> Image.Image:
    bw, bh = 132, 132
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    rx = (x - cx) * 0.7071 + (y - cy) * 0.7071
    ry = -(x - cx) * 0.7071 + (y - cy) * 0.7071
    hs = (43.0 if active else 38.0) * SS
    d = sdf_oct_box(rx + cx, ry + cy, cx, cy, hs, hs, 8.0 * SS, 1.5 * SS)

    stroke = 2.6 * SS
    alpha = np.clip(0.5 - d, 0.0, 1.0) * (1.0 if active else 0.92)
    rim = np.clip(0.5 - (d + stroke), 0.0, 1.0)
    inner = np.clip(0.5 - (d + stroke + (3.6 if active else 2.6) * SS), 0.0, 1.0)

    c_str = rgb("050914")[None, None, :]
    if active:
        c_rim, c_in = rgb("FFB800")[None, None, :], rgb("182E54")[None, None, :]
    else:
        c_rim, c_in = rgb("2E4E78")[None, None, :], rgb("0C1528")[None, None, :]

    col = c_str * (1.0 - rim[:, :, None]) + c_rim * (rim - inner)[:, :, None] + c_in * inner[:, :, None]
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_forge_arch() -> Image.Image:
    bw, bh = 1120, 64
    S2 = 2
    W, H = bw * S2, bh * S2
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    cx = W * 0.5

    def roof_pts(dy: float):
        return [(-10, 27 * S2 + dy), (cx, 8 * S2 + dy), (W + 10, 27 * S2 + dy), (W + 10, H + 10), (-10, H + 10)]

    dr = ImageDraw.Draw(im)
    dr.polygon(roof_pts(0.0), fill=rgba_t("050914"))
    dr.polygon(roof_pts(2.8 * S2), fill=rgba_t("00E5FF"))
    dr.polygon(roof_pts(5.6 * S2), fill=rgba_t("13223E"))
    dr.polygon(roof_pts(16.0 * S2), fill=rgba_t("223A62"))
    dr.polygon(roof_pts(18.0 * S2), fill=rgba_t("0B1222"))

    dr.line([(cx - 380 * S2, 33.5 * S2), (cx, 27.0 * S2), (cx + 380 * S2, 33.5 * S2)], fill=rgba_t("FFB800", 190), width=int(1.8 * S2))
    for dx_off, r_sz, gem_h in [(-132, 5.4, "00E5FF"), (0, 7.6, "FFB800"), (132, 5.4, "00E5FF")]:
        px = cx + dx_off * S2
        t_frac = abs(dx_off) / 380.0
        py = (27.0 * (1.0 - t_frac) + 33.5 * t_frac) * S2
        rr = r_sz * S2
        dr.polygon([(px, py - rr - 2.0), (px + rr + 2.0, py), (px, py + rr + 2.0), (px - rr - 2.0, py)], fill=rgba_t("050914"))
        dr.polygon([(px, py - rr), (px + rr, py), (px, py + rr), (px - rr, py)], fill=rgba_t(gem_h))

    return im.resize((bw, bh), Image.Resampling.LANCZOS)


def make_forge_card() -> Image.Image:
    bw, bh = 256, 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    d0 = sdf_oct_box(x, y, cx, cy, 124 * SS, 124 * SS, 20 * SS, 1.0 * SS)

    alpha = np.clip(0.5 - d0, 0.0, 1.0)
    rim_m = np.clip(0.5 - (d0 + 2.2 * SS), 0.0, 1.0)
    in_m = np.clip(0.5 - (d0 + 4.4 * SS), 0.0, 1.0)
    col = rgb("050914")[None, None, :] * (1.0 - rim_m[:, :, None]) \
        + rgb("2A4A76")[None, None, :] * (rim_m - in_m)[:, :, None] \
        + rgb("0F182E")[None, None, :] * in_m[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    make_double_arrow().save(os.path.join(OUT, "forge_darrow.png"), optimize=True)
    make_single_arrow().save(os.path.join(OUT, "forge_sarrow.png"), optimize=True)
    make_corner_sel().save(os.path.join(OUT, "forge_sel.png"), optimize=True)
    make_back_btn().save(os.path.join(OUT, "forge_back.png"), optimize=True)
    make_tab_diamond(True).save(os.path.join(OUT, "forge_tab_on.png"), optimize=True)
    make_tab_diamond(False).save(os.path.join(OUT, "forge_tab_off.png"), optimize=True)
    make_forge_arch().save(os.path.join(OUT, "forge_arch.png"), optimize=True)
    make_forge_card().save(os.path.join(OUT, "forge_card.png"), optimize=True)
    print("Generated 04-style forge UI kit sprites in", OUT)


if __name__ == "__main__":
    main()
