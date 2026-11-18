"""生成装备强化/洗炼页专属 4x 超采样高清 UI 组件皮肤（对标《永远的蔚蓝星球》铁匠铺界面）。

输出到 Assets/Resources/Art/ui/：
- forge_darrow.png  (88x64)   圆润厚涂鎏金双箭头 ▶▶（用于 +0 ▶▶ +1）
- forge_sarrow.png  (38x42)   圆润鎏金单箭头 ▶（用于主属性数值对比）
- forge_sel.png     (160x160, 9-slice 48,48,48,48) 鎏金四角折边立体选中框
- forge_back.png    (132x92)  青灰蓝 3D 圆角返回键（含立体底沿 + 圆润粗白左箭头）
- forge_tab_on.png  (132x132) 底栏激活态亮蓝菱盾底托
- forge_tab_off.png (132x132) 底栏未激活态深海暗铁菱盾底托
- forge_arch.png    (1080x64) 微拱折顶宋石工作台顶梁（含双层斜切石檐 + 鎏金细线与三枚菱花金扣）
- forge_card.png    (256x256, 9-slice 44,44,44,44) 内嵌微凹暖灰石纹属性碑卡

用法：python3 tools/build_forge_ui.py
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

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
    """圆角三角形 SDF（内部 < 0，外部 > 0）。"""
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
    c_top, c_bot = rgb("FFF288")[None, None, :], rgb("F2AE22")[None, None, :]
    c_lip, c_str = rgb("C27A0E")[None, None, :], rgb("4E3008")[None, None, :]
    grad = c_top * (1.0 - y_norm) + c_bot * y_norm
    grad = np.broadcast_to(grad, (h, w, 3)).copy()

    d_dn = np.roll(d + stroke, int(round(2.0 * SS)), axis=0)
    d_dn[:int(round(2.0 * SS)), :] = 999.0
    hi = face_mask * np.clip(d_dn + 0.5, 0.0, 1.0) * 0.72
    grad = grad * (1.0 - hi[:, :, None]) + 255.0 * hi[:, :, None]

    col = c_str * (1.0 - np.maximum(face_mask, lip_mask)[:, :, None]) \
        + c_lip * lip_mask[:, :, None] + grad * face_mask[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_single_arrow() -> Image.Image:
    bw, bh = 38, 42
    w, h = bw * SS, bh * SS
    r = 3.2 * SS
    stroke = 2.4 * SS
    pts = [(9 * SS, 8 * SS), (29 * SS, 21 * SS), (9 * SS, 34 * SS)]
    d = sdf_triangle(w, h, pts, r)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    face = np.clip(0.5 - (d + stroke), 0.0, 1.0)
    y_norm = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    grad = rgb("FFE875")[None, None, :] * (1.0 - y_norm) + rgb("EAA21B")[None, None, :] * y_norm
    col = rgb("523208")[None, None, :] * (1.0 - face[:, :, None]) + grad * face[:, :, None]
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_corner_sel() -> Image.Image:
    """四角鎏金立体折边选中框（带高光脊线与深棕描边，包住当前选中的部位槽）。"""
    bw, bh = 160, 160
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5

    def rrect(hw, hh, rad):
        dx = np.maximum(np.abs(x - cx) - (hw - rad), 0.0)
        dy = np.maximum(np.abs(y - cy) - (hh - rad), 0.0)
        return np.hypot(dx, dy) - rad

    d_outer = rrect(76 * SS, 76 * SS, 21 * SS)
    d_inner = rrect(64 * SS, 64 * SS, 11 * SS)
    ring_d = np.maximum(d_outer, -d_inner)

    cut_x = (28 * SS) - np.abs(x - cx)
    cut_y = (28 * SS) - np.abs(y - cy)
    cut_d = np.maximum(cut_x, cut_y)
    bracket_d = np.maximum(ring_d, cut_d)

    alpha = np.clip(0.5 - bracket_d, 0.0, 1.0)
    stroke = 2.5 * SS
    face = np.clip(0.5 - (bracket_d + stroke), 0.0, 1.0)
    hi_band = np.clip(0.5 - (bracket_d + stroke + 2.2 * SS), 0.0, 1.0)

    y_norm = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    grad = rgb("FFF7A8")[None, None, :] * (1.0 - y_norm) + rgb("F0A61A")[None, None, :] * y_norm
    grad = grad * (1.0 - (face - hi_band)[:, :, None] * 0.45) + 255.0 * (face - hi_band)[:, :, None] * 0.45
    col = rgb("4A2B05")[None, None, :] * (1.0 - face[:, :, None]) + grad * face[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_back_btn() -> Image.Image:
    """对标参考图左下角的青灰蓝 3D 圆角返回按钮 + 圆润粗白左箭头。"""
    bw, bh = 132, 92
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 3.0 * SS
    r = 22.0 * SS
    hw, hh = 58.0 * SS, 37.0 * SS
    dx = np.maximum(np.abs(x - cx) - (hw - r), 0.0)
    dy = np.maximum(np.abs(y - cy) - (hh - r), 0.0)
    d = np.hypot(dx, dy) - r

    lip_dy = int(round(6.0 * SS))
    d_lip = np.roll(d, lip_dy, axis=0)
    d_lip[:lip_dy, :] = 999.0
    d_u = np.minimum(d, d_lip)
    stroke = 2.8 * SS

    alpha = np.clip(0.5 - d_u, 0.0, 1.0)
    face_m = np.clip(0.5 - (d + stroke), 0.0, 1.0)
    lip_m = np.clip(0.5 - (d_lip + stroke), 0.0, 1.0) * (1.0 - np.clip(0.5 - d, 0.0, 1.0))

    y_norm = np.clip((y - (cy - hh)) / (2.0 * hh), 0.0, 1.0)[:, :, None]
    grad = rgb("7EC0D8")[None, None, :] * (1.0 - y_norm) + rgb("4D8CA8")[None, None, :] * y_norm
    d_dn = np.roll(d + stroke, int(round(2.2 * SS)), axis=0)
    d_dn[:int(round(2.2 * SS)), :] = 999.0
    hi = face_m * np.clip(d_dn + 0.5, 0.0, 1.0) * np.clip(1.0 - y_norm[:, :, 0] * 2.2, 0.0, 1.0) * 0.65
    grad = grad * (1.0 - hi[:, :, None]) + 255.0 * hi[:, :, None]

    ay = cy + 0.5 * SS
    tri = [(cx - 23 * SS, ay), (cx - 2 * SS, ay - 16 * SS), (cx - 2 * SS, ay + 16 * SS)]
    d_tri = sdf_triangle(w, h, tri, 4.2 * SS)
    d_shaft = sdf_segment(x, y, cx - 6 * SS, ay, cx + 19 * SS, ay) - 6.8 * SS
    d_arr = np.minimum(d_tri, d_shaft)
    arr_str = np.clip(0.5 - (d_arr - 2.2 * SS), 0.0, 1.0)
    arr_fill = np.clip(0.5 - d_arr, 0.0, 1.0)

    c_arr_s = rgb("23485C")[None, None, :]
    c_arr_f = rgb("F4FAFE")[None, None, :]
    grad = grad * (1.0 - arr_str[:, :, None]) + c_arr_s * arr_str[:, :, None]
    grad = grad * (1.0 - arr_fill[:, :, None]) + c_arr_f * arr_fill[:, :, None]

    col = rgb("162F40")[None, None, :] * (1.0 - np.maximum(face_m, lip_m)[:, :, None]) \
        + rgb("31637C")[None, None, :] * lip_m[:, :, None] + grad * face_m[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_tab_diamond(active: bool) -> Image.Image:
    """底栏激活/未激活态圆角菱形徽章底托。"""
    bw, bh = 132, 132
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    rx = (x - cx) * 0.7071 + (y - cy) * 0.7071
    ry = -(x - cx) * 0.7071 + (y - cy) * 0.7071
    hs = (43.0 if active else 38.0) * SS
    r = 12.0 * SS
    dx = np.maximum(np.abs(rx) - (hs - r), 0.0)
    dy = np.maximum(np.abs(ry) - (hs - r), 0.0)
    d = np.hypot(dx, dy) - r

    stroke = 2.5 * SS
    alpha = np.clip(0.5 - d, 0.0, 1.0) * (1.0 if active else 0.88)
    rim = np.clip(0.5 - (d + stroke), 0.0, 1.0)
    inner = np.clip(0.5 - (d + stroke + (3.6 if active else 2.8) * SS), 0.0, 1.0)

    y_norm = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None, None]
    if active:
        c_in = rgb("4E88C2")[None, None, :] * (1.0 - y_norm) + rgb("294F78")[None, None, :] * y_norm
        c_rim = rgb("9AD2FF")[None, None, :] * (1.0 - y_norm * 0.5) + rgb("457EB4")[None, None, :] * (y_norm * 0.5)
        c_str = rgb("102236")[None, None, :]
    else:
        c_in = rgb("1E3956")[None, None, :] * (1.0 - y_norm) + rgb("162C44")[None, None, :] * y_norm
        c_rim = rgb("3D648A")[None, None, :] * (1.0 - y_norm * 0.5) + rgb("274868")[None, None, :] * (y_norm * 0.5)
        c_str = rgb("0E1E30")[None, None, :]

    col = c_str * (1.0 - rim[:, :, None]) + c_rim * (rim - inner)[:, :, None] + c_in * inner[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_forge_arch() -> Image.Image:
    """对标参考图微拱折顶工作台石檐（560x64 2x超采样至1120x128，适配1080+宽窗口无缝衔接）。"""
    bw, bh = 1120, 64
    S2 = 2
    W, H = bw * S2, bh * S2
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))

    # Central subtle gable peak: center rises to y=8, sides slope gently to y=26
    cx = W * 0.5
    def roof_pts(dy: float):
        return [
            (-10, 27 * S2 + dy),
            (cx, 8 * S2 + dy),
            (W + 10, 27 * S2 + dy),
            (W + 10, H + 10),
            (-10, H + 10),
        ]

    # Soft upward drop shadow onto the dark forge anvil base
    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).polygon(roof_pts(-3.5 * S2), fill=(8, 12, 18, 135))
    sh = sh.filter(ImageFilter.GaussianBlur(3.2 * S2))
    im.alpha_composite(sh)

    dr = ImageDraw.Draw(im)
    # 1. Dark bronze-stone outer contour
    dr.polygon(roof_pts(0.0), fill=rgba_t("595143"))
    # 2. Upper chiseled sandstone bevel (#DFD6C2)
    dr.polygon(roof_pts(2.4 * S2), fill=rgba_t("DFD6C2"))
    # 3. Subtle bright top highlight line along the bevel ridge
    dr.line([(-10, 29.8 * S2), (cx, 10.8 * S2), (W + 10, 29.8 * S2)], fill=rgba_t("F6F1E4"), width=int(2 * S2))
    # 4. Crisp inner molding groove (#BCB19A)
    dr.polygon(roof_pts(15.5 * S2), fill=rgba_t("B8AC94"))
    # 5. Main warm Song-stone workbench face (#F2EDE2) seamlessly matching sheetFace below!
    dr.polygon(roof_pts(18.0 * S2), fill=rgba_t("F2EDE2"))

    # 6. Delicate gilded trim line + 3 sculpted diamond clasps (center + ±136px, matching reference!)
    dr.line([(cx - 380 * S2, 33.5 * S2), (cx, 27.0 * S2), (cx + 380 * S2, 33.5 * S2)], fill=rgba_t("C7B898"), width=int(1.6 * S2))
    for dx_off, r_sz in [(-132, 5.2), (0, 7.2), (132, 5.2)]:
        px = cx + dx_off * S2
        t_frac = abs(dx_off) / 380.0
        py = (27.0 * (1.0 - t_frac) + 33.5 * t_frac) * S2
        rr = r_sz * S2
        dr.polygon([(px, py - rr - 1.5), (px + rr + 1.5, py), (px, py + rr + 1.5), (px - rr - 1.5, py)], fill=rgba_t("8E7B58"))
        dr.polygon([(px, py - rr), (px + rr, py), (px, py + rr), (px - rr, py)], fill=rgba_t("EBCD7A"))
        ri = rr * 0.48
        dr.polygon([(px, py - ri), (px + ri, py), (px, py + ri), (px - ri, py)], fill=rgba_t("FFF6CE"))

    return im.resize((bw, bh), Image.Resampling.LANCZOS)


def make_forge_card() -> Image.Image:
    """256x256 (9-slice 44,44,44,44) 内嵌微凹暖灰石纹属性碑卡 (`forge_card.png`)。"""
    bw, bh = 256, 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5

    def rrect(hw, hh, rad):
        dx = np.maximum(np.abs(x - cx) - (hw - rad), 0.0)
        dy = np.maximum(np.abs(y - cy) - (hh - rad), 0.0)
        return np.hypot(dx, dy) - rad

    hw, hh, rad = 124 * SS, 124 * SS, 26 * SS
    d0 = rrect(hw, hh, rad)
    # Bottom ivory highlight lip (recessed tablet look!)
    d_bot_hi = np.roll(d0, int(2.2 * SS), axis=0)
    d_bot_hi[:int(2.2 * SS), :] = 999.0

    alpha = np.clip(0.5 - np.minimum(d0, d_bot_hi), 0.0, 1.0)
    rim_m = np.clip(0.5 - d0, 0.0, 1.0)
    in_m = np.clip(0.5 - (d0 + 2.4 * SS), 0.0, 1.0)

    vy = np.clip((y - (cy - hh)) / (2.0 * hh), 0.0, 1.0)[:, :, None]
    c_rim = rgb("C7BDA9")[None, None, :] * (1.0 - vy) + rgb("D8D0BE")[None, None, :] * vy
    c_in = rgb("E4DDD0")[None, None, :] * (1.0 - vy * 0.5) + rgb("EAE4D8")[None, None, :] * (vy * 0.5)

    # Subtle recessed top inner shadow
    d_top_sh = np.roll(d0 + 2.4 * SS, int(3.0 * SS), axis=0)
    d_top_sh[:int(3.0 * SS), :] = 999.0
    top_sh = in_m * (1.0 - np.clip(0.5 - d_top_sh, 0.0, 1.0)) * np.clip(1.0 - vy[:, :, 0] * 3.0, 0.0, 1.0) * 0.35
    c_in = c_in * (1.0 - top_sh[:, :, None]) + rgb("BDB39E")[None, None, :] * top_sh[:, :, None]

    col = rgb("FAF7F0")[None, None, :] * (1.0 - rim_m[:, :, None]) \
        + c_rim * (rim_m - in_m)[:, :, None] + c_in * in_m[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    make_double_arrow().save(os.path.join(OUT, "forge_darrow.png"))
    make_single_arrow().save(os.path.join(OUT, "forge_sarrow.png"))
    make_corner_sel().save(os.path.join(OUT, "forge_sel.png"))
    make_back_btn().save(os.path.join(OUT, "forge_back.png"))
    make_tab_diamond(True).save(os.path.join(OUT, "forge_tab_on.png"))
    make_tab_diamond(False).save(os.path.join(OUT, "forge_tab_off.png"))
    make_forge_arch().save(os.path.join(OUT, "forge_arch.png"))
    make_forge_card().save(os.path.join(OUT, "forge_card.png"))
    print("Generated upgraded v9 forge UI kit sprites in", OUT)


if __name__ == "__main__":
    main()
