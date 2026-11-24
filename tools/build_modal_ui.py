"""生成全游通用清爽扁平 2D 卡通矢量弹窗与列表横条皮肤套件（统一 #2B2338 暖深描边 + 平涂暖白纸面 + 实心扁平底唇，零黑灰脏影）。

严格匹配 Art.SkinBorder 九宫格尺寸：
- panel.png         (384x448, 9-slice 68,68,68,68)  扁平 2D 石青蓝外框 + 温润奶油平涂内页纸 + 几何细转角
- banner.png        (640x136, 9-slice 148,0,148,0)  扁平 2D 石青蓝双折耳燕尾绶带
- banner_grey.png   (640x136, 9-slice 148,0,148,0)  扁平 2D 冷灰蓝双折耳燕尾绶带
- banner_warm.png   (640x136, 9-slice 148,0,148,0)  扁平 2D 明亮暖金双折耳燕尾绶带
- close.png         (112x112)                       扁平 2D 珊瑚红圆润八角关闭钮 + 粗白 X
- row.png           (288x140, 9-slice 42,42,42,42)  扁平 2D 奶油白横条 + 暖褐实心底沿（零黑影）
- row_claim.png     (288x140, 9-slice 42,42,42,42)  可领取态暖香槟金扁平横条
- row_done.png      (288x140, 9-slice 42,42,42,42)  已完成态清爽浅米灰扁平横条
- quest_tray.png    (288x216, 9-slice 56,42,56,52)  顶部暖米黄活跃度扁平挂板
- modal_well.png    (256x256, 9-slice 44,44,44,44)  弹窗内部暖米灰平涂滚动列表槽底
- dark.png          (256x256, 9-slice 48,48,48,48)  扁平 2D 深靛青蓝展示框
- tab_on.png        (240x250, 9-slice 40,40,40,40)  供销社/签到高亮米金扁平卡
- vtab_{on,off,lock}.png (168x128, 9-slice 36,36,36,36) 侧边日签扁平卡签
- bar_bg.png        (256x40,  9-slice 22,0,22,0)    扁平 2D 胶囊进度槽底
- bar_{green,gold,azure,white}.png (256x32, 9-slice 18,0,18,0) 扁平 2D 赛璐珞亮泽胶囊填充条
- hint.png          (288x224, 9-slice 52,52,52,52)  扁平 2D 深靛浮层说明卡
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
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def blend(dst: np.ndarray, col: np.ndarray, mask: np.ndarray) -> np.ndarray:
    m = np.clip(mask, 0.0, 1.0)[:, :, None]
    return dst * (1.0 - m) + col * m


def sdf_rrect(x: np.ndarray, y: np.ndarray, cx: float, cy: float, hw: float, hh: float, r: float) -> np.ndarray:
    dx = np.abs(x - cx) - (hw - r)
    dy = np.abs(y - cy) - (hh - r)
    outside = np.hypot(np.maximum(dx, 0.0), np.maximum(dy, 0.0))
    inside = np.minimum(np.maximum(dx, dy), 0.0)
    return outside + inside - r


def sdf_segment(x: np.ndarray, y: np.ndarray, ax: float, ay: float, bx: float, by: float) -> np.ndarray:
    vx, vy = bx - ax, by - ay
    l2 = vx * vx + vy * vy + 1e-6
    t = np.clip(((x - ax) * vx + (y - ay) * vy) / l2, 0.0, 1.0)
    return np.hypot(x - (ax + t * vx), y - (ay + t * vy))


def sdf_octagon(x: np.ndarray, y: np.ndarray, cx: float, cy: float, radius: float, round_r: float) -> np.ndarray:
    ax = np.abs(x - cx)
    ay = np.abs(y - cy)
    k = 0.70710678
    ri = radius - round_r
    d1, d2, d3 = ax - ri, ay - ri, (ax + ay) * k - ri
    m = np.maximum(np.maximum(d1, d2), d3)
    p1, p2, p3 = np.maximum(d1, 0.0), np.maximum(d2, 0.0), np.maximum(d3, 0.0)
    out = np.maximum(np.hypot(p1, p2) * 0.55 + p3 * 0.45, m)
    return np.where(m <= 0.0, m, out) - round_r


def make_panel() -> Image.Image:
    bw, bh = 384, 448
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 3.2 * SS

    hw, hh, r_out = (bw * 0.5 - 5.5) * SS, (bh * 0.5 - 8.5) * SS, 34.0 * SS
    d_face = sdf_rrect(x, y, cx, cy, hw, hh, r_out)
    d_lip = sdf_rrect(x, y - 6.8 * SS, cx, cy, hw, hh, r_out)
    d_sh = sdf_rrect(x, y - 9.0 * SS, cx, cy, hw, hh, r_out)
    d_union = np.minimum(d_face, d_lip)

    a_main = np.clip(0.5 - d_union, 0.0, 1.0)
    a_sh = np.clip(0.5 - d_sh, 0.0, 1.0) * 0.16
    alpha = np.maximum(a_main, a_sh)
    st = 3.0 * SS

    c_stroke = rgb("2B2338")
    c_lip = rgb("395872")
    c_out_top, c_out_bot = rgb("7098B4"), rgb("58809C")
    c_out_hi = rgb("A8D0EA")

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("1E1A28")[None, None, :], a_sh)
    col = blend(col, c_stroke[None, None, :], a_main)
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))

    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    cel_step = np.clip((yn - 0.32) / 0.05, 0.0, 1.0)[:, :, None]
    outer_fill = c_out_top[None, None, :] * (1.0 - cel_step) + c_out_bot[None, None, :] * cel_step

    d_out_in = d_face + st
    d_out_dn = np.roll(d_out_in, int(round(2.4 * SS)), axis=0)
    d_out_dn[:int(round(2.4 * SS)), :] = 1e9
    top_hi = np.clip(0.5 - d_out_in, 0.0, 1.0) * np.clip(d_out_dn + 0.5, 0.0, 1.0) * np.clip(1.0 - yn * 3.2, 0.0, 1.0)
    outer_fill = blend(outer_fill, c_out_hi[None, None, :], top_hi * 0.90)
    col = blend(col, outer_fill, np.clip(0.5 - d_out_in, 0.0, 1.0))

    # 内层干净平涂奶油白纸面
    in_pad_x, in_pad_top, in_pad_bot = 13.0 * SS, 15.0 * SS, 13.0 * SS
    in_cy = cy + (in_pad_top - in_pad_bot) * 0.5
    in_hw = hw - in_pad_x
    in_hh = hh - (in_pad_top + in_pad_bot) * 0.5
    r_in = 23.0 * SS

    d_paper = sdf_rrect(x, y, cx, in_cy, in_hw, in_hh, r_in)
    col = blend(col, rgb("2B2338")[None, None, :], np.clip(0.5 - (d_paper - 2.2 * SS), 0.0, 1.0))
    col = blend(col, rgb("FFFFFF")[None, None, :], np.clip(0.5 - d_paper, 0.0, 1.0))
    yp = np.clip((y - (in_cy - in_hh)) / max(1.0, 2.0 * in_hh), 0.0, 1.0)
    paper_fill = rgb("FCF9F2")[None, None, :] * (1.0 - yp[:, :, None] * 0.6) + rgb("F7F0E4")[None, None, :] * (yp[:, :, None] * 0.6)
    col = blend(col, paper_fill, np.clip(0.5 - (d_paper + 2.2 * SS), 0.0, 1.0))

    # 干净扁平内框细线与四角小圆点（严格在 68px 九宫格角内）
    d_deco = sdf_rrect(x, y, cx, in_cy, in_hw - 7.5 * SS, in_hh - 7.5 * SS, 16.0 * SS)
    deco_line = np.clip(0.9 - np.abs(d_deco) / (1.0 * SS), 0.0, 1.0) * 0.50
    col = blend(col, rgb("DFCEB0")[None, None, :], deco_line * np.clip(0.5 - d_paper, 0.0, 1.0))

    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            px = cx + sx * (in_hw - 16.5 * SS)
            py = in_cy + sy * (in_hh - 16.5 * SS)
            dd = np.hypot(x - px, y - py) - 2.8 * SS
            col = blend(col, rgb("D8C098")[None, None, :], np.clip(0.5 - dd, 0.0, 1.0) * 0.78)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_banner(theme: str) -> Image.Image:
    bw, bh = 640, 136
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.45

    c_str = rgb("2B2338")
    if theme == "warm":
        c_tail, c_fold, c_lip = rgb("D89228"), rgb("9C5C10"), rgb("BA7416")
        c_rim, c_top, c_bot = rgb("FFF8C4"), rgb("FEDC6C"), rgb("F2B034")
        c_in_line, c_orn = rgb("CC861E"), rgb("FFFCE0")
    elif theme == "grey":
        c_tail, c_fold, c_lip = rgb("6C8094"), rgb("485A6C"), rgb("586C80")
        c_rim, c_top, c_bot = rgb("E8EFF6"), rgb("A6BACD"), rgb("889EB4")
        c_in_line, c_orn = rgb("687E94"), rgb("F4F8FC")
    else:
        c_tail, c_fold, c_lip = rgb("4D82A4"), rgb("325A76"), rgb("3E6E8E")
        c_rim, c_top, c_bot = rgb("D4F0FF"), rgb("82BCE0"), rgb("609CC2")
        c_in_line, c_orn = rgb("467EA2"), rgb("ECFAFF")

    d_tails = np.full((h, w), 1e9, dtype=np.float32)
    for side in (-1.0, 1.0):
        tx = cx + side * 252.0 * SS
        ty = cy + 14.0 * SS
        dt = sdf_rrect(x, y, tx, ty, 54.0 * SS, 33.0 * SS, 9.0 * SS)
        notch_x = cx + side * 308.0 * SS
        dn = (np.abs(x - notch_x) * 0.88 + np.abs(y - ty) * 1.25) - 23.0 * SS
        d_tails = np.minimum(d_tails, np.maximum(dt, -dn))

    d_fold_l = sdf_rrect(x, y, cx - 216.0 * SS, cy + 18.0 * SS, 20.0 * SS, 25.0 * SS, 6.0 * SS)
    d_fold_r = sdf_rrect(x, y, cx + 216.0 * SS, cy + 18.0 * SS, 20.0 * SS, 25.0 * SS, 6.0 * SS)
    d_folds = np.minimum(d_fold_l, d_fold_r)

    d_main_face = sdf_rrect(x, y, cx, cy - 2.0 * SS, 228.0 * SS, 40.0 * SS, 16.0 * SS)
    d_main_lip = sdf_rrect(x, y - 5.2 * SS, cx, cy - 2.0 * SS, 228.0 * SS, 40.0 * SS, 16.0 * SS)
    d_main = np.minimum(d_main_face, d_main_lip)

    d_all = np.minimum(np.minimum(d_tails, d_folds), d_main)
    d_sh = np.roll(d_all, 3 * SS, axis=0)
    d_sh[:3 * SS, :] = 1e9
    sh_a = np.clip(0.5 - d_sh, 0.0, 1.0) * 0.16
    a_main = np.clip(0.5 - d_all, 0.0, 1.0)
    alpha = np.maximum(a_main, sh_a)

    st = 2.8 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("1E1A28")[None, None, :], sh_a)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_tail[None, None, :], np.clip(0.5 - (d_tails + st), 0.0, 1.0))
    col = blend(col, c_fold[None, None, :], np.clip(0.5 - (d_folds + st), 0.0, 1.0))

    col = blend(col, c_str[None, None, :], np.clip(0.5 - d_main, 0.0, 1.0))
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_main_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_main_face + st), 0.0, 1.0))

    ym = np.clip((y - (cy - 42.0 * SS)) / (80.0 * SS), 0.0, 1.0)
    cel = np.clip((ym - 0.44) / 0.05, 0.0, 1.0)[:, :, None]
    face = c_top[None, None, :] * (1.0 - cel) + c_bot[None, None, :] * cel
    col = blend(col, face, np.clip(0.5 - (d_main_face + 5.6 * SS), 0.0, 1.0))

    d_stitch = np.abs(d_main_face + 11.2 * SS) - 1.05 * SS
    col = blend(col, c_in_line[None, None, :], np.clip(0.5 - d_stitch, 0.0, 1.0) * 0.62)

    for side in (-1.0, 1.0):
        px = cx + side * 198.0 * SS
        py = cy - 2.0 * SS
        star = ((np.abs(x - px) / (7.5 * SS)) ** 0.72 + (np.abs(y - py) / (7.5 * SS)) ** 0.72) - 1.0
        col = blend(col, c_orn[None, None, :], np.clip(0.5 - star * 7.0 * SS, 0.0, 1.0) * 0.92)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_close() -> Image.Image:
    bw = bh = 112
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 3.0 * SS

    d_face = sdf_octagon(x, y, cx, cy, 43.0 * SS, 11.0 * SS)
    d_lip = sdf_octagon(x, y - 6.0 * SS, cx, cy, 43.0 * SS, 11.0 * SS)
    d_u = np.minimum(d_face, d_lip)
    d_sh = np.roll(d_u, 3 * SS, axis=0)
    d_sh[:3 * SS, :] = 1e9

    a_main = np.clip(0.5 - d_u, 0.0, 1.0)
    sh_a = np.clip(0.5 - d_sh, 0.0, 1.0) * 0.18
    alpha = np.maximum(a_main, sh_a)

    st = 3.0 * SS
    c_str = rgb("2B2338")
    c_lip = rgb("A82B2E")
    c_rim = rgb("FFC8C2")
    c_top, c_bot = rgb("F66862"), rgb("DF4542")

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("1E1A28")[None, None, :], sh_a)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))

    yn = np.clip((y - (cy - 43 * SS)) / (86 * SS), 0.0, 1.0)
    cel = np.clip((yn - 0.45) / 0.06, 0.0, 1.0)[:, :, None]
    body = c_top[None, None, :] * (1.0 - cel) + c_bot[None, None, :] * cel
    col = blend(col, body, np.clip(0.5 - (d_face + 5.4 * SS), 0.0, 1.0))

    gl = np.hypot(x - (cx - 16 * SS), y - (cy - 18 * SS)) - 4.2 * SS
    col = blend(col, rgb("FFF2EE")[None, None, :], np.clip(0.6 - gl, 0.0, 1.0) * 0.85)

    arm, thick = 14.0 * SS, 5.8 * SS
    d_x = np.minimum(
        sdf_segment(x, y, cx - arm, cy - arm, cx + arm, cy + arm) - thick,
        sdf_segment(x, y, cx - arm, cy + arm, cx + arm, cy - arm) - thick,
    )
    d_x_sh = np.roll(d_x, int(round(2.5 * SS)), axis=0)
    d_x_sh[:int(round(2.5 * SS)), :] = 1e9
    col = blend(col, rgb("861E22")[None, None, :], np.clip(0.5 - d_x_sh, 0.0, 1.0) * 0.90)
    col = blend(col, rgb("FFFFFF")[None, None, :], np.clip(0.5 - d_x, 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_row(kind: str) -> Image.Image:
    bw, bh = 288, 140
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 2.4 * SS
    hw, hh, r = (bw * 0.5 - 5.0) * SS, (bh * 0.5 - 7.5) * SS, 22.0 * SS

    if kind == "claim":
        c_str, c_lip, c_rim = rgb("8E6220"), rgb("DFB45A"), rgb("FFFFF6")
        c_face, c_in_frame = rgb("FFF4CF"), rgb("ECD088")
    elif kind == "done":
        c_str, c_lip, c_rim = rgb("A8A296"), rgb("D0CABD"), rgb("F7F5F0")
        c_face, c_in_frame = rgb("EAE5DA"), rgb("D8D2C6")
    else:
        c_str, c_lip, c_rim = rgb("B29E84"), rgb("DFD1BA"), rgb("FFFFFF")
        c_face, c_in_frame = rgb("FCF8F0"), rgb("EFE5D4")

    d_face = sdf_rrect(x, y, cx, cy, hw, hh, r)
    d_lip = sdf_rrect(x, y - 4.6 * SS, cx, cy, hw, hh, r)
    d_u = np.minimum(d_face, d_lip)
    a_main = np.clip(0.5 - d_u, 0.0, 1.0)

    st = 2.2 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))
    col = blend(col, c_face[None, None, :], np.clip(0.5 - (d_face + 4.4 * SS), 0.0, 1.0))

    d_in = np.abs(d_face + 7.4 * SS) - 0.9 * SS
    col = blend(col, c_in_frame[None, None, :], np.clip(0.5 - d_in, 0.0, 1.0) * 0.72)

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
    thw = (bw * 0.5 - 5.0) * SS
    d_board = sdf_rrect(x, y, cx, tcy, thw, thh, 22.0 * SS)
    d_lip = sdf_rrect(x, y - 3.8 * SS, cx, tcy, thw, thh, 22.0 * SS)

    d_pegs = np.full((h, w), 1e9, dtype=np.float32)
    for side in (-1.0, 1.0):
        px = cx + side * (bw * 0.5 - 38.0) * SS
        py = 16.0 * SS
        d_pegs = np.minimum(d_pegs, sdf_rrect(x, y, px, py, 9.5 * SS, 13.0 * SS, 5.5 * SS))

    d_board_u = np.minimum(d_board, d_lip)
    d_all = np.minimum(d_board_u, d_pegs)
    a_main = np.clip(0.5 - d_all, 0.0, 1.0)

    st = 2.2 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("9E8258")[None, None, :], np.clip(0.5 - d_board_u, 0.0, 1.0))
    col = blend(col, rgb("D6BC90")[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, rgb("FFF9EC")[None, None, :], np.clip(0.5 - (d_board + st), 0.0, 1.0))
    col = blend(col, rgb("F5E8CA")[None, None, :], np.clip(0.5 - (d_board + 4.4 * SS), 0.0, 1.0))

    col = blend(col, rgb("2B2338")[None, None, :], np.clip(0.5 - d_pegs, 0.0, 1.0))
    col = blend(col, rgb("DDA968")[None, None, :], np.clip(0.5 - (d_pegs + 2.4 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_modal_well() -> Image.Image:
    bw = bh = 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    d = sdf_rrect(x, y, cx, cy, 123 * SS, 123 * SS, 26 * SS)
    a = np.clip(0.5 - d, 0.0, 1.0)

    col = np.broadcast_to(rgb("D2C3AB"), (h, w, 3)).copy()
    m_in = np.clip(0.5 - (d + 2.2 * SS), 0.0, 1.0)
    top_step = 1.0 - np.clip((y - 12 * SS) / (3 * SS), 0.0, 1.0)
    fill = rgb("EAE1CF")[None, None, :] * (1.0 - top_step[:, :, None] * 0.45) + rgb("D5C6AE")[None, None, :] * (top_step[:, :, None] * 0.45)
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
    d = sdf_rrect(x, y, cx, cy, 123 * SS, 123 * SS, 28 * SS)
    a = np.clip(0.5 - d, 0.0, 1.0)

    col = np.broadcast_to(rgb("2B2338"), (h, w, 3)).copy()
    col = blend(col, rgb("7CA6C4")[None, None, :], np.clip(0.5 - (d + 2.6 * SS), 0.0, 1.0))
    col = blend(col, rgb("1B3248")[None, None, :], np.clip(0.5 - (d + 5.2 * SS), 0.0, 1.0))
    yn = np.clip(y / h, 0.0, 1.0)
    fill = rgb("264660")[None, None, :] * (1.0 - yn[:, :, None] * 0.5) + rgb("1E384E")[None, None, :] * (yn[:, :, None] * 0.5)
    col = blend(col, fill, np.clip(0.5 - (d + 7.6 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_vtab(state: str) -> Image.Image:
    bw, bh = 168, 128
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 2.2 * SS
    hw, hh, r = (bw * 0.5 - 5.0) * SS, (bh * 0.5 - 7.0) * SS, 22.0 * SS

    if state == "on":
        c_str, c_lip, c_rim, c_face = rgb("2B2338"), rgb("1A827A"), rgb("C8FFF8"), rgb("32BCAE")
    elif state == "lock":
        c_str, c_lip, c_rim, c_face = rgb("6C7D8E"), rgb("9BAAB8"), rgb("F2F6FA"), rgb("CED8E2")
    else:
        c_str, c_lip, c_rim, c_face = rgb("AE9B80"), rgb("D8C7AC"), rgb("FFFFFF"), rgb("FAF2E2")

    d_face = sdf_rrect(x, y, cx, cy, hw, hh, r)
    d_lip = sdf_rrect(x, y - 4.5 * SS, cx, cy, hw, hh, r)
    d_u = np.minimum(d_face, d_lip)
    a_main = np.clip(0.5 - d_u, 0.0, 1.0)

    st = 2.4 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))
    col = blend(col, c_face[None, None, :], np.clip(0.5 - (d_face + 4.6 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_tab_on() -> Image.Image:
    bw, bh = 240, 250
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 2.5 * SS
    hw, hh, r = (bw * 0.5 - 5.0) * SS, (bh * 0.5 - 7.5) * SS, 26.0 * SS

    d_face = sdf_rrect(x, y, cx, cy, hw, hh, r)
    d_lip = sdf_rrect(x, y - 5.0 * SS, cx, cy, hw, hh, r)
    d_u = np.minimum(d_face, d_lip)
    a_main = np.clip(0.5 - d_u, 0.0, 1.0)

    st = 2.4 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("8E6A28")[None, None, :], a_main)
    col = blend(col, rgb("D8B266")[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, rgb("FFFFFF")[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))
    col = blend(col, rgb("FCF1CF")[None, None, :], np.clip(0.5 - (d_face + 5.0 * SS), 0.0, 1.0))

    d_in = np.abs(d_face + 8.5 * SS) - 1.0 * SS
    col = blend(col, rgb("E6CA8A")[None, None, :], np.clip(0.5 - d_in, 0.0, 1.0) * 0.72)

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

    d = sdf_rrect(x, y, cx, cy, hw, hh, hh)
    a = np.clip(0.5 - d, 0.0, 1.0)
    st = 2.6 * SS

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("2B2338")[None, None, :], a)
    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    cel = np.clip((yn - 0.30) / 0.08, 0.0, 1.0)[:, :, None]
    track = rgb("5E5664")[None, None, :] * (1.0 - cel) + rgb("746C7A")[None, None, :] * cel
    col = blend(col, track, np.clip(0.5 - (d + st), 0.0, 1.0))

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
        c_top, c_bot, c_rim = rgb("6EF08E"), rgb("36C862"), rgb("CAFFDA")
    elif kind == "gold":
        c_top, c_bot, c_rim = rgb("FFE268"), rgb("F2AE24"), rgb("FFF8CA")
    elif kind == "azure":
        c_top, c_bot, c_rim = rgb("86E0FF"), rgb("48B4EA"), rgb("DCF6FF")
    else:
        c_top, c_bot, c_rim = rgb("FFFFFF"), rgb("E4ECF4"), rgb("FFFFFF")

    d = sdf_rrect(x, y, cx, cy, hw, hh, hh)
    a = np.clip(0.5 - d, 0.0, 1.0)
    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    cel = np.clip((yn - 0.45) / 0.06, 0.0, 1.0)[:, :, None]
    body = c_top[None, None, :] * (1.0 - cel) + c_bot[None, None, :] * cel

    d_hi = sdf_rrect(x, y, cx, cy - hh * 0.36, hw - 5.0 * SS, hh * 0.22, hh * 0.22)
    body = blend(body, c_rim[None, None, :], np.clip(0.5 - d_hi, 0.0, 1.0) * 0.65)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(body), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_hint() -> Image.Image:
    bw, bh = 288, 224
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    hw, hh, r = (bw * 0.5 - 4.5) * SS, (bh * 0.5 - 4.5) * SS, 28.0 * SS

    d = sdf_rrect(x, y, cx, cy, hw, hh, r)
    a = np.clip(0.5 - d, 0.0, 1.0) * 0.96

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("2B2338")[None, None, :], np.clip(0.5 - d, 0.0, 1.0))
    col = blend(col, rgb("7CAAD0")[None, None, :], np.clip(0.5 - (d + 2.6 * SS), 0.0, 1.0))
    col = blend(col, rgb("213E58")[None, None, :], np.clip(0.5 - (d + 5.0 * SS), 0.0, 1.0))

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
