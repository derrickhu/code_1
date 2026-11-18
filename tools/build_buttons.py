"""生成全游戏统一的高清 4x 超采样 3D 亮泽圆角按钮皮肤套件（对标《永远的蔚蓝星球》顶级休闲策略质感）。

输出到 Assets/Resources/Art/ui/：
- btn_{gold,blue,teal,green,purple,orange,red,grey}.png       (240x104, 9-slice 38,38,38,38) 按钮亮面主体
- btn_{gold,blue,teal,green,purple,orange,red,grey}_lip.png   (256x120, 9-slice 46,46,46,46) 同曲率立体底沿 + 柔和环境投影（含外扩 8px 阴影留白）
- btn_{gold,blue,teal,green,purple,orange,red,grey}_well.png  (168x48,  9-slice 22,22,22,22) 双行按钮内部干净凹槽（零脏黑阴影）
- h_start.png     (496x144, 9-slice 54,54,54,54) 首页「开始挑战」旗舰鎏金主按钮面
- h_start_lip.png (512x160, 9-slice 62,62,62,62) 首页「开始挑战」同曲率立体底沿 + 柔和投影

用法：python3 tools/build_buttons.py
"""
import os
import shutil
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets/Resources/Art/ui")
BAK = os.path.join(ROOT, "tools/src/ui_bak")

SS = 4  # 4x 超采样抗锯齿


def rgb(h: str) -> np.ndarray:
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


# 配色表：(顶渐变, 中渐变, 底渐变, 立体底沿色, 外描边深色, 内部凹槽底色, 内部凹槽顶暗边)
THEMES = {
    "gold":   ("FFF492", "FFD444", "F3AC1C", "BA760C", "482805", "D68E14", "AD6D08"),
    "blue":   ("A4E6FF", "5CB8F0", "3992D0", "24689E", "12324E", "2E7CB6", "1F5E8E"),
    "teal":   ("84F6E6", "30C8B8", "1B9E94", "12726E", "0C383B", "168680", "0F6460"),
    "green":  ("9AF6B8", "46D476", "26AB54", "197E3B", "103B1F", "1F9447", "156E33"),
    "purple": ("EEBEFF", "BF70FF", "9442DE", "6A24AC", "341256", "7D31C2", "5C1E98"),
    "orange": ("FFCC7E", "FA8E2E", "DD6210", "A84208", "4E1E05", "C2500C", "963B06"),
    "red":    ("FF9C9C", "EE4E52", "C82A30", "92181E", "4C0E12", "AD2026", "84151A"),
    "grey":   ("E4ECF4", "B6C8DA", "92A7BC", "667B90", "2A3848", "7C92A8", "5E7388"),
}


def sdf_round_rect(w: int, h: int, r: float, pad: float = 0.0) -> np.ndarray:
    """返回像素中心到圆角矩形边界的有符号距离（内部 < 0，外部 > 0）。"""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    hx = (w - 2.0 * pad) * 0.5 - r
    hy = (h - 2.0 * pad) * 0.5 - r
    dx = np.maximum(np.abs(x - cx) - hx, 0.0)
    dy = np.maximum(np.abs(y - cy) - hy, 0.0)
    return np.hypot(dx, dy) - r


def capsule_glint(w: int, h: int, x0: float, y0: float, x1: float, y1: float, rad: float) -> np.ndarray:
    """线段胶囊 SDF 柔光斑（用于左上角标志性亮白高光点，严格落在 9-slice 左上角内）。"""
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    vx, vy = x1 - x0, y1 - y0
    l2 = vx * vx + vy * vy + 1e-6
    t = np.clip(((x - x0) * vx + (y - y0) * vy) / l2, 0.0, 1.0)
    px, py = x0 + t * vx, y0 + t * vy
    d = np.hypot(x - px, y - py) - rad
    return np.clip(0.8 - d, 0.0, 1.0)


def render_face(bw: int, bh: int, radius: float, theme_tuple, ornate: bool = False) -> Image.Image:
    w, h = bw * SS, bh * SS
    r = radius * SS
    pad = 2.0 * SS
    stroke_w = (3.2 if ornate else 2.8) * SS

    c_top, c_mid, c_bot, _, c_stroke, _, _ = [rgb(x) for x in theme_tuple]

    d = sdf_round_rect(w, h, r, pad=pad)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    inner_d = d + stroke_w  # < 0 表示在描边内部的面域
    face_mask = np.clip(0.5 - inner_d, 0.0, 1.0)

    # 三段式饱满竖向渐变
    y_norm = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]  # (h, 1)
    t1 = np.clip(y_norm / 0.48, 0.0, 1.0)[:, :, None]
    t2 = np.clip((y_norm - 0.48) / 0.52, 0.0, 1.0)[:, :, None]
    grad = np.where(
        y_norm[:, :, None] <= 0.48,
        c_top[None, None, :] * (1.0 - t1) + c_mid[None, None, :] * t1,
        c_mid[None, None, :] * (1.0 - t2) + c_bot[None, None, :] * t2,
    )
    grad = np.broadcast_to(grad, (h, w, 3)).copy()

    # 上半部通透玻璃清漆层（水平完全均匀，9-slice 任意拉伸零接缝）
    gloss_band = np.clip((0.46 - y_norm) * (h * 0.12), 0.0, 1.0) * (0.16 + 0.10 * (1.0 - y_norm / 0.46))
    grad = grad + (255.0 - grad) * gloss_band[:, :, None]

    # 顶沿内侧奶油白高光边（紧贴内描边上沿）
    d_shifted_down = sdf_round_rect(w, h, max(4.0, r - stroke_w), pad=pad + stroke_w)
    # 通过上下偏移差构造仅出现在顶沿的高光月牙
    y_idx, _ = np.mgrid[0:h, 0:w]
    d_down = np.roll(d_shifted_down, int(round(2.4 * SS)), axis=0)
    d_down[:int(round(2.4 * SS)), :] = 999.0
    top_rim = np.clip(0.5 - d_shifted_down, 0.0, 1.0) * np.clip(d_down + 0.5, 0.0, 1.0)
    top_fade = np.clip(1.0 - y_norm * 2.4, 0.0, 1.0)
    top_rim_a = top_rim * top_fade * 0.78
    grad = grad * (1.0 - top_rim_a[:, :, None]) + 255.0 * top_rim_a[:, :, None]

    # 底沿内侧温润反光细线（让主体下沿与立体底沿分界锐利通透）
    d_up = np.roll(d_shifted_down, -int(round(1.6 * SS)), axis=0)
    d_up[-int(round(1.6 * SS)):, :] = 999.0
    bot_rim = np.clip(0.5 - d_shifted_down, 0.0, 1.0) * np.clip(d_up + 0.5, 0.0, 1.0)
    bot_fade = np.clip((y_norm - 0.65) * 3.0, 0.0, 1.0)
    bot_rim_a = bot_rim * bot_fade * 0.32
    grad = grad + (255.0 - grad) * bot_rim_a[:, :, None]

    # 旗舰按钮（开始挑战）专属：内嵌一圈精致香槟金双线细框 + 四角小圆铆钉高光
    if ornate:
        inset_pad = pad + stroke_w + 5.5 * SS
        d_in = sdf_round_rect(w, h, max(6.0, r - stroke_w - 5.5 * SS), pad=inset_pad)
        ring = np.clip(1.0 - np.abs(d_in) / (0.95 * SS), 0.0, 1.0) * 0.42
        cream = rgb("FFF9D6")
        grad = grad * (1.0 - ring[:, :, None]) + cream[None, None, :] * ring[:, :, None]

    # 左上角标志性休闲策略高光星点（严格在 x < 34, y < 30 的 9-slice 固定角内）
    g1 = capsule_glint(w, h, 14.5 * SS, 18.0 * SS, 23.5 * SS, 11.5 * SS, 2.3 * SS)
    g2 = capsule_glint(w, h, 29.5 * SS, 10.5 * SS, 30.5 * SS, 10.5 * SS, 1.6 * SS)
    glint = np.clip(g1 * 0.86 + g2 * 0.72, 0.0, 0.90) * face_mask
    grad = grad * (1.0 - glint[:, :, None]) + 255.0 * glint[:, :, None]

    # 合成外描边与内面
    col = c_stroke[None, None, :] * (1.0 - face_mask[:, :, None]) + grad * face_mask[:, :, None]
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.LANCZOS)


def render_lip(bw: int, bh: int, radius: float, theme_tuple, margin: int = 8, ornate: bool = False) -> Image.Image:
    """与按钮主体 100% 同曲率的立体底沿 + 柔和环境投影（四周外扩 margin 像素承接羽化阴影）。"""
    tw, th = bw + margin * 2, bh + margin * 2
    w, h = tw * SS, th * SS
    r = radius * SS
    pad = (margin + 2.0) * SS
    stroke_w = (3.2 if ornate else 2.8) * SS

    _, _, _, c_lip, c_stroke, _, _ = [rgb(x) for x in theme_tuple]

    d = sdf_round_rect(w, h, r, pad=pad)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    lip_mask = np.clip(0.5 - (d + stroke_w), 0.0, 1.0)

    # 底沿中间略亮、两侧微收的立体柱面感（仅在圆角区微暗，中段平坦保 9-slice）
    col = c_stroke[None, None, :] * (1.0 - lip_mask[:, :, None]) + c_lip[None, None, :] * lip_mask[:, :, None]
    body_rgba = np.zeros((h, w, 4), dtype=np.uint8)
    body_rgba[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    body_rgba[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    body_im = Image.fromarray(body_rgba, "RGBA").resize((tw, th), Image.LANCZOS)

    # 柔和自然环境投影（绝不发黑发脏）
    sh_mask = Image.fromarray(np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8), "L").resize((tw, th), Image.LANCZOS)
    sh_blur = sh_mask.filter(ImageFilter.GaussianBlur(radius=3.2))
    sh_arr = np.array(sh_blur, dtype=np.float32) * 0.22
    sh_rgba = np.zeros((th, tw, 4), dtype=np.uint8)
    sh_rgba[:, :, 0] = 8
    sh_rgba[:, :, 1] = 18
    sh_rgba[:, :, 2] = 32
    # 向下偏移 2px
    sh_rgba[2:, :, 3] = np.clip(np.round(sh_arr[:-2, :]), 0, 255).astype(np.uint8)

    canvas = Image.fromarray(sh_rgba, "RGBA")
    canvas.alpha_composite(body_im, (0, 0))
    return canvas


def render_well(bw: int, bh: int, radius: float, theme_tuple) -> Image.Image:
    """双行按钮下半区的干净内嵌凹槽：同色系深琥珀/深蔚蓝实心槽 + 顶内微暗沿 + 底边亮金高光丝，0% 黑灰脏阴影。"""
    w, h = bw * SS, bh * SS
    r = radius * SS
    pad = 1.5 * SS
    _, _, _, _, _, c_well, c_well_top = [rgb(x) for x in theme_tuple]

    d = sdf_round_rect(w, h, r, pad=pad)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    y_norm = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]

    # 顶部 2px 内凹微深边，主体干净纯正同色系
    top_band = (np.clip(1.0 - y_norm * 5.0, 0.0, 1.0) * 0.55)[:, :, None]
    fill = c_well[None, None, :] * (1.0 - top_band) + c_well_top[None, None, :] * top_band
    fill = np.broadcast_to(fill, (h, w, 3)).copy()

    # 底边 1.5px 亮高光托线（做出精致镶嵌槽感）
    d_up = np.roll(d, -int(round(1.5 * SS)), axis=0)
    d_up[-int(round(1.5 * SS)):, :] = 999.0
    bot_hi = np.clip(0.5 - d, 0.0, 1.0) * np.clip(d_up + 0.5, 0.0, 1.0) * np.clip((y_norm - 0.55) * 3.0, 0.0, 1.0) * 0.48
    fill = fill + (255.0 - fill) * bot_hi[:, :, None]

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(fill), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.LANCZOS)


def main():
    os.makedirs(BAK, exist_ok=True)
    for fn in os.listdir(OUT):
        if (fn.startswith("btn_") or fn.startswith("h_start")) and fn.endswith(".png"):
            bak_p = os.path.join(BAK, fn)
            if not os.path.exists(bak_p):
                shutil.copy(os.path.join(OUT, fn), bak_p)

    preview = Image.new("RGBA", (1120, 420), (232, 238, 244, 255))
    px, py = 20, 20

    for name, th in THEMES.items():
        face = render_face(240, 104, 28.0, th, ornate=False)
        lip = render_lip(240, 104, 28.0, th, margin=8, ornate=False)
        well = render_well(168, 46, 21.0, th)

        face.save(os.path.join(OUT, f"btn_{name}.png"))
        lip.save(os.path.join(OUT, f"btn_{name}_lip.png"))
        well.save(os.path.join(OUT, f"btn_{name}_well.png"))

        # 合成预览：lip 在 (px-8, py-8+7)，face 在 (px, py)，内部贴 well
        comp = Image.new("RGBA", (260, 130), (0, 0, 0, 0))
        comp.alpha_composite(lip, (2, 9))
        comp.alpha_composite(face, (10, 2))
        comp.alpha_composite(well, (10 + (240 - 168) // 2, 2 + 50))
        preview.alpha_composite(comp, (px, py))
        px += 270
        if px > 850:
            px = 20
            py += 136

    # 旗舰首页「开始挑战」主按钮
    st_face = render_face(496, 144, 38.0, THEMES["gold"], ornate=True)
    st_lip = render_lip(496, 144, 38.0, THEMES["gold"], margin=8, ornate=True)
    st_face.save(os.path.join(OUT, "h_start.png"))
    st_lip.save(os.path.join(OUT, "h_start_lip.png"))

    preview.alpha_composite(st_lip, (20, 292 + 9 - 8))
    preview.alpha_composite(st_face, (28, 292))
    st_well = render_well(156, 42, 20.0, THEMES["gold"])
    preview.alpha_composite(st_well, (28 + (496 - 156) // 2, 292 + 86))

    preview.convert("RGB").save("/tmp/c2_new_btns_preview.png")
    print("Generated all HD button skins + /tmp/c2_new_btns_preview.png")


if __name__ == "__main__":
    main()
