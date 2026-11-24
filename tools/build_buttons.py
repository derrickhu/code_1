"""生成全游戏统一的清爽扁平 2D 卡通矢量圆角按钮皮肤套件（统一 #2B2338 暖深褐描边 + 利落二阶赛璐珞色块 + 扁平实心立体底沿）。

输出到 Assets/Resources/Art/ui/：
- btn_{gold,blue,teal,green,purple,orange,red,grey}.png       (240x104, 9-slice 38,38,38,38) 扁平 2D 亮面主体
- btn_{gold,blue,teal,green,purple,orange,red,grey}_lip.png   (256x120, 9-slice 46,46,46,46) 同曲率扁平 2D 实心底沿（外扩 8px 留白兼容九宫格）
- btn_{gold,blue,teal,green,purple,orange,red,grey}_well.png  (168x46,  9-slice 22,22,22,22) 双行按钮内部干净扁平凹槽
- h_start.png     (496x144, 9-slice 54,54,54,54) 旗舰鎏金圆角按钮面
- h_start_lip.png (512x160, 9-slice 62,62,62,62) 旗舰鎏金同曲率扁平底沿
"""
import os
import shutil
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets/Resources/Art/ui")
BAK = os.path.join(ROOT, "tools/src/ui_bak")

SS = 4


def rgb(h: str) -> np.ndarray:
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def blend(dst: np.ndarray, col: np.ndarray, mask: np.ndarray) -> np.ndarray:
    m = np.clip(mask, 0.0, 1.0)[:, :, None]
    return dst * (1.0 - m) + col * m


# 扁平 2D 赛璐珞配色表：(上半明快亮阶, 下半饱满主色, 顶沿高光丝, 扁平实心底沿色, 统一暖深描边色, 内部凹槽主色, 内部凹槽顶沿暗阶)
THEMES = {
    "gold":   ("FFE46B", "F7BC28", "FFFBE0", "C47E10", "2B2338", "D89216", "B4720A"),
    "blue":   ("72CAF8", "469EE2", "E8F8FF", "266CA6", "2B2338", "3182C2", "22649A"),
    "teal":   ("54DFD0", "28B6A8", "DFFEF9", "167C76", "2B2338", "1C948A", "13706A"),
    "green":  ("6AE28E", "38BF64", "E4FFEC", "1E8640", "2B2338", "269E4E", "1A7838"),
    "purple": ("C484FF", "9B54E8", "F6E8FF", "6B2BB2", "2B2338", "7E38C8", "5E229E"),
    "orange": ("FFA64C", "EC761E", "FFF0DC", "AF480A", "2B2338", "C85610", "9C3E08"),
    "red":    ("FA6E6E", "DF3E42", "FFE6E6", "9C1E24", "2B2338", "B6262C", "8A181E"),
    "grey":   ("C6D4E2", "9EB0C2", "F4F8FC", "6E8094", "2B2338", "8296AA", "667A8E"),
}


def sdf_round_rect(w: int, h: int, r: float, pad: float = 0.0, dy_off: float = 0.0) -> np.ndarray:
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 + dy_off
    hx = (w - 2.0 * pad) * 0.5 - r
    hy = (h - 2.0 * pad) * 0.5 - r
    dx = np.maximum(np.abs(x - cx) - hx, 0.0)
    dy = np.maximum(np.abs(y - cy) - hy, 0.0)
    return np.hypot(dx, dy) - r


def capsule_glint(w: int, h: int, x0: float, y0: float, x1: float, y1: float, rad: float) -> np.ndarray:
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    vx, vy = x1 - x0, y1 - y0
    l2 = vx * vx + vy * vy + 1e-6
    t = np.clip(((x - x0) * vx + (y - y0) * vy) / l2, 0.0, 1.0)
    px, py = x0 + t * vx, y0 + t * vy
    d = np.hypot(x - px, y - py) - rad
    return np.clip(0.65 - d, 0.0, 1.0)


def render_face(bw: int, bh: int, radius: float, theme_tuple, ornate: bool = False) -> Image.Image:
    w, h = bw * SS, bh * SS
    r = radius * SS
    pad = 2.0 * SS
    stroke_w = (3.0 if ornate else 2.8) * SS

    c_top, c_bot, c_hi, _, c_stroke, _, _ = [rgb(x) for x in theme_tuple]

    d = sdf_round_rect(w, h, r, pad=pad)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    inner_d = d + stroke_w
    face_mask = np.clip(0.5 - inner_d, 0.0, 1.0)

    # 利落扁平 2D 二阶赛璐珞分层（上半 45% 清爽亮阶 + 下半 55% 纯净主色，水平 100% 均匀支持九宫格拉伸）
    y_norm = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    cel_step = np.clip((y_norm - 0.44) / 0.035, 0.0, 1.0)[:, :, None]
    subtle_v = y_norm[:, :, None] * 0.06
    body = c_top[None, None, :] * (1.0 - cel_step) + c_bot[None, None, :] * cel_step
    body = body * (1.0 - subtle_v) + c_bot[None, None, :] * subtle_v
    body = np.broadcast_to(body, (h, w, 3)).copy()

    # 顶沿内侧利落扁平高光亮条（2.2px 实心亮带，不糊边）
    d_in = sdf_round_rect(w, h, max(4.0, r - stroke_w), pad=pad + stroke_w)
    d_dn = np.roll(d_in, int(round(2.4 * SS)), axis=0)
    d_dn[:int(round(2.4 * SS)), :] = 999.0
    top_rim = np.clip(0.5 - d_in, 0.0, 1.0) * np.clip(d_dn + 0.5, 0.0, 1.0) * np.clip(1.0 - y_norm * 2.8, 0.0, 1.0)
    body = blend(body, c_hi[None, None, :], top_rim * 0.88)

    if ornate:
        inset_pad = pad + stroke_w + 5.5 * SS
        d_ring = sdf_round_rect(w, h, max(6.0, r - stroke_w - 5.5 * SS), pad=inset_pad)
        ring = np.clip(0.8 - np.abs(d_ring) / (1.0 * SS), 0.0, 1.0) * 0.45
        body = blend(body, c_hi[None, None, :], ring)

    # 左上角扁平 2D 胶囊高光点（严格落在 38px 九宫格角内）
    g1 = capsule_glint(w, h, 14.5 * SS, 17.5 * SS, 23.0 * SS, 11.5 * SS, 2.2 * SS)
    g2 = capsule_glint(w, h, 29.0 * SS, 10.8 * SS, 29.8 * SS, 10.8 * SS, 1.5 * SS)
    glint = np.clip(g1 * 0.88 + g2 * 0.78, 0.0, 0.92) * face_mask
    body = blend(body, np.array([255.0, 255.0, 255.0])[None, None, :], glint)

    col = c_stroke[None, None, :] * (1.0 - face_mask[:, :, None]) + body * face_mask[:, :, None]
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def render_lip(bw: int, bh: int, radius: float, theme_tuple, margin: int = 8, ornate: bool = False) -> Image.Image:
    """扁平 2D 实心底沿 + 利落 2px 卡通微贴地影（彻底告别脏黑高斯糊影）。"""
    tw, th = bw + margin * 2, bh + margin * 2
    w, h = tw * SS, th * SS
    r = radius * SS
    pad = (margin + 2.0) * SS
    stroke_w = (3.0 if ornate else 2.8) * SS

    _, _, _, c_lip, c_stroke, _, _ = [rgb(x) for x in theme_tuple]

    d = sdf_round_rect(w, h, r, pad=pad)
    d_sh = sdf_round_rect(w, h, r, pad=pad, dy_off=2.2 * SS)
    a_body = np.clip(0.5 - d, 0.0, 1.0)
    a_sh = np.clip(0.5 - d_sh, 0.0, 1.0) * 0.18
    alpha = np.maximum(a_body, a_sh)
    lip_mask = np.clip(0.5 - (d + stroke_w), 0.0, 1.0)

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("1E1A28")[None, None, :], a_sh)
    body_col = c_stroke[None, None, :] * (1.0 - lip_mask[:, :, None]) + c_lip[None, None, :] * lip_mask[:, :, None]
    col = blend(col, body_col, a_body)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((tw, th), Image.Resampling.LANCZOS)


def render_well(bw: int, bh: int, radius: float, theme_tuple) -> Image.Image:
    """双行按钮下半区扁平 2D 实心消耗胶囊槽（零脏黑半透阴影）。"""
    w, h = bw * SS, bh * SS
    r = radius * SS
    pad = 1.5 * SS
    _, _, _, _, _, c_well, c_well_top = [rgb(x) for x in theme_tuple]

    d = sdf_round_rect(w, h, r, pad=pad)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    y_norm = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]

    # 顶沿 2px 利落赛璐珞内压边，其余纯平同色系槽底
    top_step = (1.0 - np.clip((y_norm - 0.16) / 0.05, 0.0, 1.0))[:, :, None]
    fill = c_well[None, None, :] * (1.0 - top_step) + c_well_top[None, None, :] * top_step
    fill = np.broadcast_to(fill, (h, w, 3)).copy()

    d_up = np.roll(d, -int(round(1.4 * SS)), axis=0)
    d_up[-int(round(1.4 * SS)):, :] = 999.0
    bot_hi = np.clip(0.5 - d, 0.0, 1.0) * np.clip(d_up + 0.5, 0.0, 1.0) * np.clip((y_norm - 0.65) * 3.0, 0.0, 1.0) * 0.36
    fill = fill + (255.0 - fill) * bot_hi[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(fill), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(BAK, exist_ok=True)
    for fn in os.listdir(OUT):
        if (fn.startswith("btn_") or fn.startswith("h_start")) and fn.endswith(".png"):
            bak_p = os.path.join(BAK, fn)
            if not os.path.exists(bak_p):
                shutil.copy(os.path.join(OUT, fn), bak_p)

    for name, th in THEMES.items():
        face = render_face(240, 104, 28.0, th, ornate=False)
        lip = render_lip(240, 104, 28.0, th, margin=8, ornate=False)
        well = render_well(168, 46, 21.0, th)

        face.save(os.path.join(OUT, f"btn_{name}.png"), optimize=True)
        lip.save(os.path.join(OUT, f"btn_{name}_lip.png"), optimize=True)
        well.save(os.path.join(OUT, f"btn_{name}_well.png"), optimize=True)

    st_face = render_face(496, 144, 38.0, THEMES["gold"], ornate=True)
    st_lip = render_lip(496, 144, 38.0, THEMES["gold"], margin=8, ornate=True)
    st_face.save(os.path.join(OUT, "h_start.png"), optimize=True)
    st_lip.save(os.path.join(OUT, "h_start_lip.png"), optimize=True)
    print("Generated all flat-2D button skins in", OUT)


if __name__ == "__main__":
    main()
