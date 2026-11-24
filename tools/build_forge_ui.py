"""生成装备强化/改装页专属 4x 超采样扁平 2D 矢量 UI 组件皮肤（统一 #2B2338 暖深描边 + 清爽二阶赛璐珞填充）。"""
import os
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets/Resources/Art/ui")
SS = 4


def rgb(h: str) -> np.ndarray:
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def rgba_t(h: str, a: int = 255) -> tuple:
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


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
    return np.where(inside, -min_d, min_d) - round_r


def make_double_arrow() -> Image.Image:
    bw, bh = 88, 64
    w, h = bw * SS, bh * SS
    r = 4.2 * SS
    stroke = 2.6 * SS
    lip_dy = int(round(3.2 * SS))

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
    cel = np.clip((y_norm - 0.45) / 0.06, 0.0, 1.0)
    fill = rgb("FFE46B")[None, None, :] * (1.0 - cel) + rgb("F4B424")[None, None, :] * cel
    c_lip, c_str = rgb("C27A0E")[None, None, :], rgb("2B2338")[None, None, :]

    col = c_str * (1.0 - np.maximum(face_mask, lip_mask)[:, :, None]) + c_lip * lip_mask[:, :, None] + fill * face_mask[:, :, None]
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_single_arrow() -> Image.Image:
    bw, bh = 38, 42
    w, h = bw * SS, bh * SS
    pts = [(9 * SS, 8 * SS), (29 * SS, 21 * SS), (9 * SS, 34 * SS)]
    d = sdf_triangle(w, h, pts, 3.2 * SS)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    face = np.clip(0.5 - (d + 2.4 * SS), 0.0, 1.0)
    y_norm = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    cel = np.clip((y_norm - 0.45) / 0.06, 0.0, 1.0)
    fill = rgb("FFE46B")[None, None, :] * (1.0 - cel) + rgb("F4B424")[None, None, :] * cel
    col = rgb("2B2338")[None, None, :] * (1.0 - face[:, :, None]) + fill * face[:, :, None]
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_corner_sel() -> Image.Image:
    bw, bh = 160, 160
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5

    def rrect(hw, hh, rad):
        dx = np.maximum(np.abs(x - cx) - (hw - rad), 0.0)
        dy = np.maximum(np.abs(y - cy) - (hh - rad), 0.0)
        return np.hypot(dx, dy) - rad

    ring_d = np.maximum(rrect(76 * SS, 76 * SS, 21 * SS), -rrect(64 * SS, 64 * SS, 11 * SS))
    cut_d = np.maximum((28 * SS) - np.abs(x - cx), (28 * SS) - np.abs(y - cy))
    bracket_d = np.maximum(ring_d, cut_d)

    alpha = np.clip(0.5 - bracket_d, 0.0, 1.0)
    face = np.clip(0.5 - (bracket_d + 2.6 * SS), 0.0, 1.0)
    hi_band = np.clip(0.5 - (bracket_d + 4.8 * SS), 0.0, 1.0)

    fill = rgb("FFD44A")[None, None, :] * (1.0 - (face - hi_band)[:, :, None] * 0.6) + rgb("FFF9CA")[None, None, :] * ((face - hi_band)[:, :, None] * 0.6)
    col = rgb("2B2338")[None, None, :] * (1.0 - face[:, :, None]) + fill * face[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_back_btn() -> Image.Image:
    bw, bh = 132, 92
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 3.0 * SS
    r, hw, hh = 22.0 * SS, 58.0 * SS, 37.0 * SS
    d = np.hypot(np.maximum(np.abs(x - cx) - (hw - r), 0.0), np.maximum(np.abs(y - cy) - (hh - r), 0.0)) - r

    lip_dy = int(round(6.0 * SS))
    d_lip = np.roll(d, lip_dy, axis=0)
    d_lip[:lip_dy, :] = 999.0
    d_u = np.minimum(d, d_lip)
    stroke = 2.8 * SS

    alpha = np.clip(0.5 - d_u, 0.0, 1.0)
    face_m = np.clip(0.5 - (d + stroke), 0.0, 1.0)
    lip_m = np.clip(0.5 - (d_lip + stroke), 0.0, 1.0) * (1.0 - np.clip(0.5 - d, 0.0, 1.0))

    y_norm = np.clip((y - (cy - hh)) / (2.0 * hh), 0.0, 1.0)[:, :, None]
    cel = np.clip((y_norm - 0.45) / 0.06, 0.0, 1.0)
    grad = rgb("78BEDC")[None, None, :] * (1.0 - cel) + rgb("5496B6")[None, None, :] * cel

    ay = cy + 0.5 * SS
    tri = [(cx - 23 * SS, ay), (cx - 2 * SS, ay - 16 * SS), (cx - 2 * SS, ay + 16 * SS)]
    d_arr = np.minimum(sdf_triangle(w, h, tri, 4.2 * SS), sdf_segment(x, y, cx - 6 * SS, ay, cx + 19 * SS, ay) - 6.8 * SS)
    arr_str = np.clip(0.5 - (d_arr - 2.4 * SS), 0.0, 1.0)
    arr_fill = np.clip(0.5 - d_arr, 0.0, 1.0)

    grad = grad * (1.0 - arr_str[:, :, None]) + rgb("2B2338")[None, None, :] * arr_str[:, :, None]
    grad = grad * (1.0 - arr_fill[:, :, None]) + rgb("FFFFFF")[None, None, :] * arr_fill[:, :, None]

    col = rgb("2B2338")[None, None, :] * (1.0 - np.maximum(face_m, lip_m)[:, :, None]) \
        + rgb("366882")[None, None, :] * lip_m[:, :, None] + grad * face_m[:, :, None]

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
    r = 12.0 * SS
    d = np.hypot(np.maximum(np.abs(rx) - (hs - r), 0.0), np.maximum(np.abs(ry) - (hs - r), 0.0)) - r

    stroke = 2.6 * SS
    alpha = np.clip(0.5 - d, 0.0, 1.0) * (1.0 if active else 0.90)
    rim = np.clip(0.5 - (d + stroke), 0.0, 1.0)
    inner = np.clip(0.5 - (d + stroke + (3.6 if active else 2.8) * SS), 0.0, 1.0)

    c_str = rgb("2B2338")[None, None, :]
    if active:
        c_rim, c_in = rgb("A8DCFF")[None, None, :], rgb("3E84C2")[None, None, :]
    else:
        c_rim, c_in = rgb("4A7298")[None, None, :], rgb("203C58")[None, None, :]

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
    dr.polygon(roof_pts(0.0), fill=rgba_t("2B2338"))
    dr.polygon(roof_pts(2.8 * S2), fill=rgba_t("E4DAC6"))
    dr.line([(-10, 30.2 * S2), (cx, 11.2 * S2), (W + 10, 30.2 * S2)], fill=rgba_t("FFFBF2"), width=int(2.2 * S2))
    dr.polygon(roof_pts(15.5 * S2), fill=rgba_t("C2B69E"))
    dr.polygon(roof_pts(18.0 * S2), fill=rgba_t("F2EDE2"))

    dr.line([(cx - 380 * S2, 33.5 * S2), (cx, 27.0 * S2), (cx + 380 * S2, 33.5 * S2)], fill=rgba_t("CBBBA0"), width=int(1.6 * S2))
    for dx_off, r_sz in [(-132, 5.2), (0, 7.2), (132, 5.2)]:
        px = cx + dx_off * S2
        t_frac = abs(dx_off) / 380.0
        py = (27.0 * (1.0 - t_frac) + 33.5 * t_frac) * S2
        rr = r_sz * S2
        dr.polygon([(px, py - rr - 1.8), (px + rr + 1.8, py), (px, py + rr + 1.8), (px - rr - 1.8, py)], fill=rgba_t("2B2338"))
        dr.polygon([(px, py - rr), (px + rr, py), (px, py + rr), (px - rr, py)], fill=rgba_t("FFD862"))

    return im.resize((bw, bh), Image.Resampling.LANCZOS)


def make_forge_card() -> Image.Image:
    bw, bh = 256, 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    hw, hh, rad = 124 * SS, 124 * SS, 26 * SS
    d0 = np.hypot(np.maximum(np.abs(x - cx) - (hw - rad), 0.0), np.maximum(np.abs(y - cy) - (hh - rad), 0.0)) - rad

    alpha = np.clip(0.5 - d0, 0.0, 1.0)
    in_m = np.clip(0.5 - (d0 + 2.4 * SS), 0.0, 1.0)
    col = rgb("C8BEA8")[None, None, :] * (1.0 - in_m[:, :, None]) + rgb("E8E2D5")[None, None, :] * in_m[:, :, None]

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
    print("Generated flat-2D forge UI kit sprites in", OUT)


if __name__ == "__main__":
    main()
