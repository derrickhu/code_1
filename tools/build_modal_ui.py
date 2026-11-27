"""生成全游通用 04 风格（45° 切角深黑曜石 #0D1528 战术装甲板 + 双线霓虹青/翠绿/鎏金边框）弹窗与列表横条套件。

严格匹配 Art.SkinBorder 九宫格尺寸：
- panel.png         (384x448, 9-slice 68,68,68,68)  45° 切角黑曜石主弹窗 (#0D1528) + 双线霓虹青金装甲外框 + 角标
- banner.png        (640x136, 9-slice 148,0,148,0)  45° 切角黑曜石霓虹青战术横幅
- banner_grey.png   (640x136, 9-slice 148,0,148,0)  45° 切角黑曜石冷钢灰战术横幅
- banner_warm.png   (640x136, 9-slice 148,0,148,0)  45° 切角赤黑鎏金闪电翼战术横幅
- close.png         (112x112)                       45° 切角八角绯红霓虹战术关闭钮 + 锐利亮白 X
- row.png           (288x140, 9-slice 42,42,42,42)  45° 切角深靛黑曜石列表横条 (#131E38) + 细青钢边
- row_claim.png     (288x140, 9-slice 42,42,42,42)  45° 切角可领取态黑曜石高亮横条 (#1D2B44) + 鎏金/翠绿双霓虹边
- row_done.png      (288x140, 9-slice 42,42,42,42)  45° 切角已完成态暗黑曜石横条 (#0A1020)
- quest_tray.png    (288x216, 9-slice 56,42,56,52)  顶部活跃度黑曜石战术挂板 (#080D1A) + 鎏金/青双线框
- modal_well.png    (256x256, 9-slice 44,44,44,44)  弹窗内凹深黑曜石槽底 (#080D1A)
- dark.png          (256x256, 9-slice 48,48,48,48)  45° 切角名册/预览深黑曜石战术框 (#0C1326) + 双线霓虹青边
- tab_on.png        (240x250, 9-slice 40,40,40,40)  供销社/签到黑曜石鎏金高亮卡
- vtab_{on,off,lock}.png (168x128, 9-slice 36,36,36,36) 侧边切角战术卡签
- bar_bg.png        (256x40,  9-slice 22,0,22,0)    45° 切角黑曜石进度槽底
- bar_{green,gold,azure,white}.png (256x32, 9-slice 18,0,18,0) 45° 切角高对比赛璐珞霓虹进度条
- hint.png          (288x224, 9-slice 52,52,52,52)  45° 切角黑曜石浮层说明卡 (#0B1326) + 霓虹青细框
"""
import os
import shutil
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets/Resources/Art/ui")
BAK = os.path.join(ROOT, "tools/src/modal_bak")
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


def sdf_oct_box(x: np.ndarray, y: np.ndarray, cx: float, cy: float, hw: float, hh: float, ch: float, r_tiny: float = 0.0) -> np.ndarray:
    """精确欧氏距离的 45° 切角矩形 SDF（内外等宽偏移无变形）。"""
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


def corner_brackets_mask(x: np.ndarray, y: np.ndarray, cx: float, cy: float, hw: float, hh: float, ch: float, arm: float, thick: float) -> np.ndarray:
    """在四角 45° 切角内侧绘制锐利 L+斜切战术角标（严格落在九宫格四角内）。"""
    ax = np.abs(x - cx)
    ay = np.abs(y - cy)
    W, H, C = hw, hh, ch
    s1 = sdf_segment(ax, ay, max(0.0, W - C - arm), H, W - C, H)
    s2 = sdf_segment(ax, ay, W - C, H, W, H - C)
    s3 = sdf_segment(ax, ay, W, H - C, W, max(0.0, H - C - arm))
    d = np.minimum(np.minimum(s1, s2), s3) - thick * 0.5
    return np.clip(0.5 - d, 0.0, 1.0)


def make_panel() -> Image.Image:
    bw, bh = 384, 448
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 3.0 * SS

    hw, hh, ch = (bw * 0.5 - 5.5) * SS, (bh * 0.5 - 8.5) * SS, 26.0 * SS
    rt = 1.2 * SS
    d_face = sdf_oct_box(x, y, cx, cy, hw, hh, ch, rt)
    d_lip = sdf_oct_box(x, y - 6.5 * SS, cx, cy, hw, hh, ch, rt)
    d_sh = sdf_oct_box(x, y - 9.0 * SS, cx, cy, hw, hh, ch, rt)
    d_u = np.minimum(d_face, d_lip)

    a_main = np.clip(0.5 - d_u, 0.0, 1.0)
    a_sh = np.clip(0.5 - d_sh, 0.0, 1.0) * 0.42
    alpha = np.maximum(a_main, a_sh)

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("02040A")[None, None, :], a_sh)
    # 最外硬黑装甲轮廓 + 底部立体金属暗唇
    col = blend(col, rgb("050914")[None, None, :], a_main)
    col = blend(col, rgb("09162B")[None, None, :], np.clip(0.5 - (d_lip + 2.6 * SS), 0.0, 1.0))

    # 外层霓虹青键线 (2.4px) + 顶沿冰青高光
    d_rim = d_face + 2.4 * SS
    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    rim_col = rgb("64F4FF")[None, None, :] * (1.0 - yn[:, :, None] * 0.65) + rgb("00A8D6")[None, None, :] * (yn[:, :, None] * 0.65)
    col = blend(col, rim_col, np.clip(0.5 - d_rim, 0.0, 1.0))

    # 外装甲凹槽带 (#081020)
    d_armor = d_face + 5.0 * SS
    col = blend(col, rgb("081020")[None, None, :], np.clip(0.5 - d_armor, 0.0, 1.0))

    # 内层细钢青第二键线 + #0D1528 深黑曜石主体
    d_in_rim = d_face + 11.5 * SS
    col = blend(col, rgb("1E3C64")[None, None, :], np.clip(0.5 - d_in_rim, 0.0, 1.0))

    d_body = d_face + 13.3 * SS
    m_body = np.clip(0.5 - d_body, 0.0, 1.0)
    body_fill = rgb("16264A")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("101B36")[None, None, :] * yn[:, :, None]
    # 斜向黑曜宝石蓝冷光扫掠
    diag = (x - cx) / (2.0 * hw) + (y - cy) / (2.0 * hh)
    sheen = np.clip(1.0 - np.abs(diag + 0.18) / 0.14, 0.0, 1.0) * 0.13
    body_fill = blend(body_fill, rgb("3464A0")[None, None, :], sheen)
    col = blend(col, body_fill, m_body)

    # 四角 45° 鎏金/霓虹青双色战术角标（严格在 68px 九宫格角保护区内：5.5 + 8 + 20 = 33.5 < 68）
    brk_cyan = corner_brackets_mask(x, y, cx, cy, hw - 8.2 * SS, hh - 8.2 * SS, ch - 4.0 * SS, 18.0 * SS, 2.2 * SS)
    col = blend(col, rgb("00E5FF")[None, None, :], brk_cyan * 0.92)

    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            px = cx + sx * (hw - 20.0 * SS)
            py = cy + sy * (hh - 20.0 * SS)
            dd = (np.abs(x - px) + np.abs(y - py)) - 3.2 * SS
            col = blend(col, rgb("FFB800")[None, None, :], np.clip(0.5 - dd, 0.0, 1.0) * 0.95)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_banner(theme: str) -> Image.Image:
    bw, bh = 640, 136
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.46

    c_str = rgb("050914")
    if theme == "warm":
        c_wing, c_fold, c_lip = rgb("C8740C"), rgb("682214"), rgb("7A3A08")
        c_rim, c_in_rim = rgb("FFD438"), rgb("FF6438")
        c_top, c_bot, c_orn = rgb("2E1220"), rgb("1A0B16"), rgb("FFF4B8")
    elif theme == "grey":
        c_wing, c_fold, c_lip = rgb("3A4E68"), rgb("1C2838"), rgb("223044")
        c_rim, c_in_rim = rgb("7A94B2"), rgb("3E5672")
        c_top, c_bot, c_orn = rgb("182338"), rgb("101828"), rgb("CFE0F2")
    else:
        c_wing, c_fold, c_lip = rgb("0E6888"), rgb("083248"), rgb("0A3C58")
        c_rim, c_in_rim = rgb("00E5FF"), rgb("FFB800")
        c_top, c_bot, c_orn = rgb("112240"), rgb("0B162C"), rgb("FFB800")

    # 左右锐利切角战术侧翼（严格在 148px 九宫格端区内：x < 148 或 x > 492）
    d_tails = np.full((h, w), 1e9, dtype=np.float32)
    for side in (-1.0, 1.0):
        tx = cx + side * 252.0 * SS
        ty = cy + 10.0 * SS
        dt = sdf_oct_box(x, y, tx, ty, 54.0 * SS, 30.0 * SS, 14.0 * SS, 1.0 * SS)
        notch_x = cx + side * 308.0 * SS
        dn = (np.abs(x - notch_x) * 0.90 + np.abs(y - ty) * 1.15) - 22.0 * SS
        d_tails = np.minimum(d_tails, np.maximum(dt, -dn))

    d_fold_l = sdf_oct_box(x, y, cx - 214.0 * SS, cy + 15.0 * SS, 20.0 * SS, 24.0 * SS, 8.0 * SS, 1.0 * SS)
    d_fold_r = sdf_oct_box(x, y, cx + 214.0 * SS, cy + 15.0 * SS, 20.0 * SS, 24.0 * SS, 8.0 * SS, 1.0 * SS)
    d_folds = np.minimum(d_fold_l, d_fold_r)

    d_main_face = sdf_oct_box(x, y, cx, cy - 2.0 * SS, 228.0 * SS, 41.0 * SS, 20.0 * SS, 1.2 * SS)
    d_main_lip = sdf_oct_box(x, y - 5.5 * SS, cx, cy - 2.0 * SS, 228.0 * SS, 41.0 * SS, 20.0 * SS, 1.2 * SS)
    d_main = np.minimum(d_main_face, d_main_lip)

    d_all = np.minimum(np.minimum(d_tails, d_folds), d_main)
    d_sh = np.roll(d_all, 3 * SS, axis=0)
    d_sh[:3 * SS, :] = 1e9
    sh_a = np.clip(0.5 - d_sh, 0.0, 1.0) * 0.38
    a_main = np.clip(0.5 - d_all, 0.0, 1.0)
    alpha = np.maximum(a_main, sh_a)

    st = 2.6 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("02040A")[None, None, :], sh_a)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_wing[None, None, :], np.clip(0.5 - (d_tails + st), 0.0, 1.0))
    col = blend(col, c_fold[None, None, :], np.clip(0.5 - (d_folds + st), 0.0, 1.0))

    col = blend(col, c_str[None, None, :], np.clip(0.5 - d_main, 0.0, 1.0))
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_main_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_main_face + st), 0.0, 1.0))
    col = blend(col, c_str[None, None, :], np.clip(0.5 - (d_main_face + 5.8 * SS), 0.0, 1.0))

    ym = np.clip((y - (cy - 42.0 * SS)) / (82.0 * SS), 0.0, 1.0)
    cel = np.clip((ym - 0.46) / 0.06, 0.0, 1.0)[:, :, None]
    face = c_top[None, None, :] * (1.0 - cel) + c_bot[None, None, :] * cel
    col = blend(col, face, np.clip(0.5 - (d_main_face + 7.6 * SS), 0.0, 1.0))

    # 内侧霓虹细线
    d_in = np.abs(d_main_face + 11.2 * SS) - 0.95 * SS
    col = blend(col, c_in_rim[None, None, :], np.clip(0.5 - d_in, 0.0, 1.0) * 0.80)

    # 左右棱形战术铆钉（位于 x = cx ± 196，严格在左右 148px 端区内：320 - 196 = 124 < 148）
    for side in (-1.0, 1.0):
        px = cx + side * 196.0 * SS
        py = cy - 2.0 * SS
        dia = (np.abs(x - px) + np.abs(y - py)) - 6.8 * SS
        col = blend(col, c_orn[None, None, :], np.clip(0.5 - dia, 0.0, 1.0) * 0.95)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_close() -> Image.Image:
    bw = bh = 112
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 2.6 * SS

    d_face = sdf_oct_box(x, y, cx, cy, 43.0 * SS, 43.0 * SS, 18.0 * SS, 1.2 * SS)
    d_lip = sdf_oct_box(x, y - 5.5 * SS, cx, cy, 43.0 * SS, 43.0 * SS, 18.0 * SS, 1.2 * SS)
    d_u = np.minimum(d_face, d_lip)
    d_sh = np.roll(d_u, 3 * SS, axis=0)
    d_sh[:3 * SS, :] = 1e9

    a_main = np.clip(0.5 - d_u, 0.0, 1.0)
    sh_a = np.clip(0.5 - d_sh, 0.0, 1.0) * 0.40
    alpha = np.maximum(a_main, sh_a)

    st = 2.6 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("02040A")[None, None, :], sh_a)
    col = blend(col, rgb("060914")[None, None, :], a_main)
    col = blend(col, rgb("6A0E18")[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, rgb("FF4B40")[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))
    col = blend(col, rgb("090A14")[None, None, :], np.clip(0.5 - (d_face + 6.0 * SS), 0.0, 1.0))

    yn = np.clip((y - (cy - 43 * SS)) / (86 * SS), 0.0, 1.0)
    cel = np.clip((yn - 0.45) / 0.06, 0.0, 1.0)[:, :, None]
    body = rgb("3A0E1A")[None, None, :] * (1.0 - cel) + rgb("220810")[None, None, :] * cel
    col = blend(col, body, np.clip(0.5 - (d_face + 7.8 * SS), 0.0, 1.0))

    arm, thick = 14.5 * SS, 5.2 * SS
    d_x = np.minimum(
        sdf_segment(x, y, cx - arm, cy - arm, cx + arm, cy + arm) - thick,
        sdf_segment(x, y, cx - arm, cy + arm, cx + arm, cy - arm) - thick,
    )
    d_x_sh = np.roll(d_x, int(round(2.4 * SS)), axis=0)
    d_x_sh[:int(round(2.4 * SS)), :] = 1e9
    col = blend(col, rgb("FF3B30")[None, None, :], np.clip(0.5 - (d_x - 1.6 * SS), 0.0, 1.0) * 0.55)
    col = blend(col, rgb("520810")[None, None, :], np.clip(0.5 - d_x_sh, 0.0, 1.0) * 0.90)
    col = blend(col, rgb("FFFFFF")[None, None, :], np.clip(0.5 - d_x, 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_row(kind: str) -> Image.Image:
    bw, bh = 288, 140
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 2.2 * SS
    hw, hh, ch = (bw * 0.5 - 5.0) * SS, (bh * 0.5 - 7.2) * SS, 16.0 * SS

    if kind == "claim":
        c_str, c_lip = rgb("050914"), rgb("6E4608")
        c_rim, c_face_top, c_face_bot = rgb("FFB800"), rgb("223352"), rgb("17243C")
        c_in_frame, c_brk = rgb("00F57A"), rgb("FFE680")
    elif kind == "done":
        c_str, c_lip = rgb("050811"), rgb("070C18")
        c_rim, c_face_top, c_face_bot = rgb("1E2D46"), rgb("0C1324"), rgb("090F1D")
        c_in_frame, c_brk = rgb("152036"), rgb("263A5A")
    else:
        c_str, c_lip = rgb("050914"), rgb("091428")
        c_rim, c_face_top, c_face_bot = rgb("2E4E7E"), rgb("15223E"), rgb("101B32")
        c_in_frame, c_brk = rgb("1E3558"), rgb("00E5FF")

    d_face = sdf_oct_box(x, y, cx, cy, hw, hh, ch, 1.0 * SS)
    d_lip = sdf_oct_box(x, y - 4.2 * SS, cx, cy, hw, hh, ch, 1.0 * SS)
    d_u = np.minimum(d_face, d_lip)
    a_main = np.clip(0.5 - d_u, 0.0, 1.0)

    st = 2.2 * SS
    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))

    face_fill = c_face_top[None, None, :] * (1.0 - yn[:, :, None]) + c_face_bot[None, None, :] * yn[:, :, None]
    col = blend(col, face_fill, np.clip(0.5 - (d_face + 4.4 * SS), 0.0, 1.0))

    d_in = np.abs(d_face + 7.4 * SS) - 0.85 * SS
    col = blend(col, c_in_frame[None, None, :], np.clip(0.5 - d_in, 0.0, 1.0) * (0.85 if kind == "claim" else 0.55))

    if kind != "done":
        brk = corner_brackets_mask(x, y, cx, cy, hw - 3.3 * SS, hh - 3.3 * SS, ch - 1.5 * SS, 10.0 * SS, 1.8 * SS)
        col = blend(col, c_brk[None, None, :], brk * (0.95 if kind == "claim" else 0.72))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_quest_tray() -> Image.Image:
    bw, bh = 288, 216
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = (w - 1) * 0.5

    ty0, ty1 = 14.0 * SS, (bh - 6.0) * SS
    tcy, thh = (ty0 + ty1) * 0.5, (ty1 - ty0) * 0.5
    thw, ch = (bw * 0.5 - 5.0) * SS, 18.0 * SS
    d_board = sdf_oct_box(x, y, cx, tcy, thw, thh, ch, 1.0 * SS)
    d_lip = sdf_oct_box(x, y - 3.8 * SS, cx, tcy, thw, thh, ch, 1.0 * SS)

    d_pegs = np.full((h, w), 1e9, dtype=np.float32)
    for side in (-1.0, 1.0):
        px = cx + side * (bw * 0.5 - 38.0) * SS
        py = 15.5 * SS
        d_pegs = np.minimum(d_pegs, sdf_oct_box(x, y, px, py, 9.5 * SS, 12.5 * SS, 4.0 * SS, 0.8 * SS))

    d_board_u = np.minimum(d_board, d_lip)
    d_all = np.minimum(d_board_u, d_pegs)
    a_main = np.clip(0.5 - d_all, 0.0, 1.0)

    st = 2.2 * SS
    yn = np.clip((y - ty0) / max(1.0, ty1 - ty0), 0.0, 1.0)
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("050914")[None, None, :], np.clip(0.5 - d_board_u, 0.0, 1.0))
    col = blend(col, rgb("523808")[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, rgb("FFB800")[None, None, :], np.clip(0.5 - (d_board + st), 0.0, 1.0))
    fill = rgb("0D162B")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("080E1C")[None, None, :] * yn[:, :, None]
    col = blend(col, fill, np.clip(0.5 - (d_board + 4.4 * SS), 0.0, 1.0))

    d_in = np.abs(d_board + 7.6 * SS) - 0.85 * SS
    col = blend(col, rgb("00E5FF")[None, None, :], np.clip(0.5 - d_in, 0.0, 1.0) * 0.45)

    col = blend(col, rgb("050914")[None, None, :], np.clip(0.5 - d_pegs, 0.0, 1.0))
    col = blend(col, rgb("FFD44C")[None, None, :], np.clip(0.5 - (d_pegs + 2.2 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_modal_well() -> Image.Image:
    bw = bh = 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    d = sdf_oct_box(x, y, cx, cy, 123 * SS, 123 * SS, 18 * SS, 1.0 * SS)
    a = np.clip(0.5 - d, 0.0, 1.0)

    col = np.broadcast_to(rgb("1E3356"), (h, w, 3)).copy()
    m_in = np.clip(0.5 - (d + 2.2 * SS), 0.0, 1.0)
    top_step = 1.0 - np.clip((y - 14 * SS) / (4 * SS), 0.0, 1.0)
    fill = rgb("080D1A")[None, None, :] * (1.0 - top_step[:, :, None] * 0.45) + rgb("050811")[None, None, :] * (top_step[:, :, None] * 0.45)
    col = blend(col, fill, m_in)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_dark() -> Image.Image:
    bw = bh = 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    ch = 20.0 * SS
    d = sdf_oct_box(x, y, cx, cy, 123 * SS, 123 * SS, ch, 1.0 * SS)
    a = np.clip(0.5 - d, 0.0, 1.0)

    col = np.broadcast_to(rgb("050812"), (h, w, 3)).copy()
    # 图 4 设定图同款：电光紫青渐变外框 + 深邃宝蓝靛内胆（彻底告别纯黑底！）
    yn = np.clip(y / h, 0.0, 1.0)
    rim_grad = rgb("00E5FF")[None, None, :] * (1.0 - yn[:, :, None] * 0.72) + rgb("9D4EDD")[None, None, :] * (yn[:, :, None] * 0.72)
    col = blend(col, rim_grad, np.clip(0.5 - (d + 2.2 * SS), 0.0, 1.0))
    col = blend(col, rgb("0A1328")[None, None, :], np.clip(0.5 - (d + 5.0 * SS), 0.0, 1.0))
    fill = rgb("16264A")[None, None, :] * (1.0 - yn[:, :, None] * 0.52) + rgb("101B38")[None, None, :] * (yn[:, :, None] * 0.52)
    diag = (x - cx) / w + (y - cy) / h
    sheen = np.clip(1.0 - np.abs(diag + 0.16) / 0.16, 0.0, 1.0) * 0.12
    fill = blend(fill, rgb("325B96")[None, None, :], sheen)
    col = blend(col, fill, np.clip(0.5 - (d + 7.2 * SS), 0.0, 1.0))

    d_in = np.abs(d + 9.6 * SS) - 0.95 * SS
    col = blend(col, rgb("38C8FF")[None, None, :], np.clip(0.5 - d_in, 0.0, 1.0) * 0.52)
    brk = corner_brackets_mask(x, y, cx, cy, 119.5 * SS, 119.5 * SS, ch - 1.5 * SS, 15.0 * SS, 2.2 * SS)
    col = blend(col, rgb("FFB800")[None, None, :], brk * 0.92)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_vtab(state: str) -> Image.Image:
    bw, bh = 168, 128
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 2.0 * SS
    hw, hh, ch = (bw * 0.5 - 5.0) * SS, (bh * 0.5 - 6.8) * SS, 14.0 * SS

    if state == "on":
        c_str, c_lip, c_rim, c_face = rgb("050914"), rgb("085834"), rgb("00F57A"), rgb("0E2E28")
    elif state == "lock":
        c_str, c_lip, c_rim, c_face = rgb("050811"), rgb("0A101E"), rgb("1F2F48"), rgb("0A1120")
    else:
        c_str, c_lip, c_rim, c_face = rgb("050914"), rgb("0B162C"), rgb("32507C"), rgb("121E38")

    d_face = sdf_oct_box(x, y, cx, cy, hw, hh, ch, 1.0 * SS)
    d_lip = sdf_oct_box(x, y - 4.2 * SS, cx, cy, hw, hh, ch, 1.0 * SS)
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
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_tab_on() -> Image.Image:
    bw, bh = 240, 250
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 2.4 * SS
    hw, hh, ch = (bw * 0.5 - 5.0) * SS, (bh * 0.5 - 7.5) * SS, 18.0 * SS

    d_face = sdf_oct_box(x, y, cx, cy, hw, hh, ch, 1.0 * SS)
    d_lip = sdf_oct_box(x, y - 4.8 * SS, cx, cy, hw, hh, ch, 1.0 * SS)
    d_u = np.minimum(d_face, d_lip)
    a_main = np.clip(0.5 - d_u, 0.0, 1.0)

    st = 2.4 * SS
    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("050914")[None, None, :], a_main)
    col = blend(col, rgb("724808")[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, rgb("FFB800")[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))
    face = rgb("1A2948")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("111C34")[None, None, :] * yn[:, :, None]
    col = blend(col, face, np.clip(0.5 - (d_face + 5.0 * SS), 0.0, 1.0))

    d_in = np.abs(d_face + 8.4 * SS) - 0.9 * SS
    col = blend(col, rgb("00E5FF")[None, None, :], np.clip(0.5 - d_in, 0.0, 1.0) * 0.48)
    brk = corner_brackets_mask(x, y, cx, cy, hw - 3.6 * SS, hh - 3.6 * SS, ch - 1.5 * SS, 12.0 * SS, 2.0 * SS)
    col = blend(col, rgb("FFE888")[None, None, :], brk * 0.92)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_bar_bg() -> Image.Image:
    bw, bh = 256, 40
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    hw, hh = (bw * 0.5 - 2.0) * SS, (bh * 0.5 - 2.0) * SS

    d = sdf_oct_box(x, y, cx, cy, hw, hh, 11.0 * SS, 0.8 * SS)
    a = np.clip(0.5 - d, 0.0, 1.0)

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("040710")[None, None, :], a)
    col = blend(col, rgb("2E4E7A")[None, None, :], np.clip(0.5 - (d + 2.0 * SS), 0.0, 1.0))
    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    track = rgb("070C18")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("0C1528")[None, None, :] * yn[:, :, None]
    col = blend(col, track, np.clip(0.5 - (d + 4.0 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_bar_fill(kind: str) -> Image.Image:
    bw, bh = 256, 32
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    hw, hh = (bw * 0.5 - 1.5) * SS, (bh * 0.5 - 1.5) * SS

    if kind == "green":
        c_top, c_bot, c_rim = rgb("28FF8A"), rgb("00B856"), rgb("C8FFE2")
    elif kind == "gold":
        c_top, c_bot, c_rim = rgb("FFD842"), rgb("F09808"), rgb("FFF8C4")
    elif kind == "azure":
        c_top, c_bot, c_rim = rgb("38ECFF"), rgb("0098D4"), rgb("D6FBFF")
    else:
        c_top, c_bot, c_rim = rgb("F4F9FF"), rgb("C8DCF2"), rgb("FFFFFF")

    d = sdf_oct_box(x, y, cx, cy, hw, hh, 9.0 * SS, 0.8 * SS)
    a = np.clip(0.5 - d, 0.0, 1.0)
    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    cel = np.clip((yn - 0.45) / 0.05, 0.0, 1.0)[:, :, None]
    body = c_top[None, None, :] * (1.0 - cel) + c_bot[None, None, :] * cel

    d_hi = sdf_oct_box(x, y, cx, cy - hh * 0.40, hw - 4.0 * SS, hh * 0.22, 3.0 * SS, 0.4 * SS)
    body = blend(body, c_rim[None, None, :], np.clip(0.5 - d_hi, 0.0, 1.0) * 0.78)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(body), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_hint() -> Image.Image:
    bw, bh = 288, 224
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    hw, hh, ch = (bw * 0.5 - 4.5) * SS, (bh * 0.5 - 4.5) * SS, 20.0 * SS

    d = sdf_oct_box(x, y, cx, cy, hw, hh, ch, 1.0 * SS)
    a = np.clip(0.5 - d, 0.0, 1.0) * 0.97

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("040710")[None, None, :], np.clip(0.5 - d, 0.0, 1.0))
    col = blend(col, rgb("00E5FF")[None, None, :], np.clip(0.5 - (d + 2.4 * SS), 0.0, 1.0))
    col = blend(col, rgb("0B1326")[None, None, :], np.clip(0.5 - (d + 4.8 * SS), 0.0, 1.0))
    d_in = np.abs(d + 8.0 * SS) - 0.85 * SS
    col = blend(col, rgb("1E3B62")[None, None, :], np.clip(0.5 - d_in, 0.0, 1.0) * 0.75)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(BAK, exist_ok=True)

    jobs = [
        ("panel.png", make_panel),
        ("banner.png", lambda: make_banner("blue")),
        ("banner_grey.png", lambda: make_banner("grey")),
        ("banner_warm.png", lambda: make_banner("warm")),
        ("close.png", make_close),
        ("row.png", lambda: make_row("normal")),
        ("row_claim.png", lambda: make_row("claim")),
        ("row_done.png", lambda: make_row("done")),
        ("quest_tray.png", make_quest_tray),
        ("modal_well.png", make_modal_well),
        ("dark.png", make_dark),
        ("tab_on.png", make_tab_on),
        ("vtab_on.png", lambda: make_vtab("on")),
        ("vtab_off.png", lambda: make_vtab("off")),
        ("vtab_lock.png", lambda: make_vtab("lock")),
        ("bar_bg.png", make_bar_bg),
        ("bar_green.png", lambda: make_bar_fill("green")),
        ("bar_gold.png", lambda: make_bar_fill("gold")),
        ("bar_azure.png", lambda: make_bar_fill("azure")),
        ("bar_white.png", lambda: make_bar_fill("white")),
        ("hint.png", make_hint),
    ]

    for name, fn in jobs:
        dst = os.path.join(OUT, name)
        bak = os.path.join(BAK, name)
        if os.path.exists(dst) and not os.path.exists(bak):
            shutil.copy(dst, bak)
        im = fn()
        im.save(dst, optimize=True)
        print(f"wrote {name:18s} {im.size[0]}x{im.size[1]}")


if __name__ == "__main__":
    main()
