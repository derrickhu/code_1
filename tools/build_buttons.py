"""生成全游戏统一的 04 风格（45° 切角战术按钮 + 硬边赛璐珞高光带 + 黑曜石金属底唇 + 深暗内凹消耗槽）按钮套件。

输出到 Assets/Resources/Art/ui/：
- btn_{gold,blue,teal,green,purple,orange,red,grey}.png       (240x104, 9-slice 38,38,38,38)
- btn_{gold,blue,teal,green,purple,orange,red,grey}_lip.png   (256x120, 9-slice 46,46,46,46)
- btn_{gold,blue,teal,green,purple,orange,red,grey}_well.png  (168x46,  9-slice 22,22,22,22)
- h_start.png     (496x144, 9-slice 54,54,54,54)
- h_start_lip.png (512x160, 9-slice 62,62,62,62)
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
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def blend(dst: np.ndarray, col: np.ndarray, mask: np.ndarray) -> np.ndarray:
    m = np.clip(mask, 0.0, 1.0)[:, :, None]
    return dst * (1.0 - m) + col * m


def sdf_segment(x: np.ndarray, y: np.ndarray, ax: float, ay: float, bx: float, by: float) -> np.ndarray:
    vx, vy = bx - ax, by - ay
    l2 = vx * vx + vy * vy + 1e-6
    t = np.clip(((x - ax) * vx + (y - ay) * vy) / l2, 0.0, 1.0)
    return np.hypot(x - (ax + t * vx), y - (ay + t * vy))


def sdf_oct_box(w: int, h: int, ch: float, pad: float = 0.0, dy_off: float = 0.0, r_tiny: float = 4.0) -> np.ndarray:
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 + dy_off
    W = max(2.0, (w - 2.0 * pad) * 0.5 - r_tiny)
    H = max(2.0, (h - 2.0 * pad) * 0.5 - r_tiny)
    C = np.clip(ch, 0.5, min(W, H) - 0.5)
    ax = np.abs(x - cx)
    ay = np.abs(y - cy)
    d1 = sdf_segment(ax, ay, 0.0, H, W - C, H)
    d2 = sdf_segment(ax, ay, W - C, H, W, H - C)
    d3 = sdf_segment(ax, ay, W, H - C, W, 0.0)
    min_d = np.minimum(np.minimum(d1, d2), d3)
    m = np.maximum(np.maximum(ax - W, ay - H), (ax + ay - (W + H - C)) * 0.70710678)
    return np.where(m <= 0.0, -min_d, min_d) - r_tiny


# 04 战术配色表：(上半锐利亮面, 下半饱和主面, 外环霓虹亮边, 实心金属暗唇, 黑曜石轮廓, 内部暗槽框色, 内部暗槽底色)
THEMES = {
    "gold":   ("FFD638", "F29A0A", "FFF6B8", "7C4206", "060A14", "FFB800", "0B1222"),
    "blue":   ("2E9EFF", "1060D4", "A8E4FF", "092E6E", "060A14", "00D8FF", "091326"),
    "teal":   ("18E4F8", "0092BA", "C4FAFF", "06425A", "060A14", "00E5FF", "081524"),
    "green":  ("1EF280", "00A852", "B8FFE0", "064E2A", "060A14", "00F57A", "081818"),
    "purple": ("B65CFF", "7828E2", "ECC4FF", "360E74", "060A14", "C47DFF", "120C28"),
    "orange": ("FF9226", "DE4E08", "FFD8A8", "681E04", "060A14", "FF9838", "1C0E0A"),
    "red":    ("FF4B40", "C61C22", "FFB4AE", "58090E", "060A14", "FF5E54", "1C0A10"),
    "grey":   ("2A3C58", "1A263A", "6482A6", "0B1220", "060A14", "4A6484", "0A101E"),
}


def render_face(bw: int, bh: int, chamfer: float, theme_tuple, ornate: bool = False) -> Image.Image:
    w, h = bw * SS, bh * SS
    ch = chamfer * SS
    pad = 2.0 * SS
    stroke_w = (2.8 if ornate else 2.6) * SS
    rt = 1.1 * SS

    c_top, c_bot, c_hi, _, c_stroke, _, _ = [rgb(x) for x in theme_tuple]

    d = sdf_oct_box(w, h, ch, pad=pad, r_tiny=rt)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    d_rim = d + stroke_w
    rim_mask = np.clip(0.5 - d_rim, 0.0, 1.0)
    d_body = d_rim + (2.2 if ornate else 1.8) * SS
    body_mask = np.clip(0.5 - d_body, 0.0, 1.0)

    y_norm = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    # 锐利硬边赛璐珞二阶切面（零糊边渐变！）
    cel_step = np.clip((y_norm - 0.46) / 0.025, 0.0, 1.0)[:, :, None]
    body = c_top[None, None, :] * (1.0 - cel_step) + c_bot[None, None, :] * cel_step
    body = np.broadcast_to(body, (h, w, 3)).copy()

    # 顶沿内侧硬边高光亮带
    d_dn = np.roll(d_body, int(round(2.6 * SS)), axis=0)
    d_dn[:int(round(2.6 * SS)), :] = 999.0
    top_band = body_mask * np.clip(d_dn + 0.5, 0.0, 1.0) * np.clip(1.0 - y_norm * 3.0, 0.0, 1.0)
    body = blend(body, c_hi[None, None, :], top_band * 0.85)

    # 内圈细战术刻线（ornate 旗舰按钮更明显，普通按钮带克制内细线）
    d_line = np.abs(d_body + (5.2 if ornate else 3.8) * SS) - (1.0 if ornate else 0.75) * SS
    line_m = np.clip(0.5 - d_line, 0.0, 1.0) * (0.55 if ornate else 0.32)
    body = blend(body, c_hi[None, None, :], line_m)

    # 外圈亮边上半更亮、下半沉稳
    rim_col = c_hi[None, None, :] * (1.0 - y_norm[:, :, None] * 0.55) + c_bot[None, None, :] * (y_norm[:, :, None] * 0.55)
    face_col = rim_col * (1.0 - body_mask[:, :, None]) + body * body_mask[:, :, None]
    col = c_stroke[None, None, :] * (1.0 - rim_mask[:, :, None]) + face_col * rim_mask[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def render_lip(bw: int, bh: int, chamfer: float, theme_tuple, margin: int = 8, ornate: bool = False) -> Image.Image:
    tw, th = bw + margin * 2, bh + margin * 2
    w, h = tw * SS, th * SS
    ch = chamfer * SS
    pad = (margin + 2.0) * SS
    stroke_w = (2.8 if ornate else 2.6) * SS
    rt = 1.1 * SS

    _, _, _, c_lip, c_stroke, _, _ = [rgb(x) for x in theme_tuple]

    d = sdf_oct_box(w, h, ch, pad=pad, r_tiny=rt)
    d_sh = sdf_oct_box(w, h, ch, pad=pad, dy_off=2.6 * SS, r_tiny=rt)
    a_body = np.clip(0.5 - d, 0.0, 1.0)
    a_sh = np.clip(0.5 - d_sh, 0.0, 1.0) * 0.42
    alpha = np.maximum(a_body, a_sh)
    lip_mask = np.clip(0.5 - (d + stroke_w), 0.0, 1.0)

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("02040A")[None, None, :], a_sh)
    body_col = c_stroke[None, None, :] * (1.0 - lip_mask[:, :, None]) + c_lip[None, None, :] * lip_mask[:, :, None]
    col = blend(col, body_col, a_body)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((tw, th), Image.Resampling.LANCZOS)


def render_well(bw: int, bh: int, chamfer: float, theme_tuple) -> Image.Image:
    """双行按钮下半区 04 风格深黑曜石内凹消耗槽（对齐 style04_page_home 摇人守村内嵌 [5] 槽）。"""
    w, h = bw * SS, bh * SS
    ch = chamfer * SS
    pad = 1.5 * SS
    _, _, _, _, _, c_rim, c_well = [rgb(x) for x in theme_tuple]

    d = sdf_oct_box(w, h, ch, pad=pad, r_tiny=0.8 * SS)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    m_in = np.clip(0.5 - (d + 1.8 * SS), 0.0, 1.0)

    y_norm = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
    inner = c_well[None, None, :] * (0.82 + 0.18 * y_norm[:, :, None])
    fill = c_rim[None, None, :] * 0.78 * (1.0 - m_in[:, :, None]) + inner * m_in[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(fill), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 246.0), 0, 255).astype(np.uint8)
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
        face = render_face(240, 104, 18.0, th, ornate=False)
        lip = render_lip(240, 104, 18.0, th, margin=8, ornate=False)
        well = render_well(168, 46, 10.0, th)

        face.save(os.path.join(OUT, f"btn_{name}.png"), optimize=True)
        lip.save(os.path.join(OUT, f"btn_{name}_lip.png"), optimize=True)
        well.save(os.path.join(OUT, f"btn_{name}_well.png"), optimize=True)

    st_face = render_face(496, 144, 26.0, THEMES["gold"], ornate=True)
    st_lip = render_lip(496, 144, 26.0, THEMES["gold"], margin=8, ornate=True)
    st_face.save(os.path.join(OUT, "h_start.png"), optimize=True)
    st_lip.save(os.path.join(OUT, "h_start_lip.png"), optimize=True)
    print("Generated all 04-style chamfered button skins in", OUT)


if __name__ == "__main__":
    main()
