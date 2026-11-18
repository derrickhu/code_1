"""生成全游通用顶级弹窗与列表横条 4x 超采样 UI 皮肤套件（对标《永远的蔚蓝星球》清爽克制立体质感）。

输出到 Assets/Resources/Art/ui/（原地替换已有文件名以保留 Unity .meta GUID，并补充任务专属皮肤）：
- panel.png         (384x448, 9-slice 68,68,68,68)  双层立体石青蓝外框 + 温润米白内页纸 + 四角精致暖金细框转角
- banner.png        (640x136, 9-slice 148,0,148,0)  清爽石青蓝立体双折耳燕尾卷轴牌匾
- banner_grey.png   (640x136, 9-slice 148,0,148,0)  冷灰蓝立体双折耳燕尾卷轴牌匾（战败/禁用等）
- banner_warm.png   (640x136, 9-slice 148,0,148,0)  皇室暖金立体双折耳燕尾卷轴牌匾（胜利/金榜/冲刺等）
- close.png         (112x112)                       珊瑚朱红立体圆润八角关闭勋章 + 粗圆白 X
- row.png           (288x140, 9-slice 42,42,42,42)  温润奶油米白立体横条（柔和暖棕双线框 + 立体底沿，零黑灰脏影）
- row_claim.png     (288x140, 9-slice 42,42,42,42)  可领取态暖香槟金立体横条
- row_done.png      (288x140, 9-slice 42,42,42,42)  已完成/锁定态温润浅米灰横条（清爽不发脏）
- quest_tray.png    (288x216, 9-slice 56,42,56,52)  顶部暖米黄活跃/积分进度挂板（含左右立体小木栓）
- modal_well.png    (256x256, 9-slice 44,44,44,44)  弹窗内部暖米灰微凹滚动列表槽底
- dark.png          (256x256, 9-slice 48,48,48,48)  深海青蓝内凹展示框（含柔和金棕细内框，首领/天书/战氅等头部舞台）
- tab_on.png        (240x250, 9-slice 40,40,40,40)  集市/签到高亮立体米金卡面（含顶部柔和高光与立体底托）
- vtab_on.png       (168x128, 9-slice 36,36,36,36)  侧边日签激活态（青翠立体卡签）
- vtab_off.png      (168x128, 9-slice 36,36,36,36)  侧边日签常规态（暖白立体卡签）
- vtab_lock.png     (168x128, 9-slice 36,36,36,36)  侧边日签未开启态（清爽冷灰蓝立体卡签）
- bar_bg.png        (256x40,  9-slice 22,0,22,0)    清爽胶囊进度槽底（柔和深棕描边 + 温润暗石板内凹槽）
- bar_green.png     (256x32,  9-slice 18,0,18,0)    饱满翠绿亮泽胶囊填充条
- bar_gold.png      (256x32,  9-slice 18,0,18,0)    饱满琥珀金亮泽胶囊填充条
- bar_azure.png     (256x32,  9-slice 18,0,18,0)    清爽冰天蓝亮泽胶囊填充条（参考图同款日常进度条）
- bar_white.png     (256x32,  9-slice 18,0,18,0)    纯白亮泽胶囊填充条（供任意染色兜底）
- hint.png          (288x224, 9-slice 52,52,52,52)  高清深海磨砂石青浮层说明卡

用法：python3 tools/build_modal_ui.py
"""
import os
import shutil
import numpy as np
from PIL import Image, ImageFilter

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
    """正八边形圆角 SDF（内部 < 0，外部 > 0），用于参考图右上角立体红底关闭按钮。"""
    ax = np.abs(x - cx)
    ay = np.abs(y - cy)
    k = 0.70710678
    # 正八边形半内切距 = radius - round_r
    ri = radius - round_r
    d1 = ax - ri
    d2 = ay - ri
    d3 = (ax + ay) * k - ri
    # 近似精确圆角八边形外距
    m = np.maximum(np.maximum(d1, d2), d3)
    # 用超椭圆修正八角圆弧过渡，极其圆润自然
    # 精确多边形外部距离：对八条半平面做柔和圆角
    p1 = np.maximum(d1, 0.0)
    p2 = np.maximum(d2, 0.0)
    p3 = np.maximum(d3, 0.0)
    # 取主轴与斜轴组合的平滑外距
    out_card = np.hypot(p1, p2)
    out = np.maximum(out_card * 0.55 + p3 * 0.45, m)
    return np.where(m <= 0.0, m, out) - round_r


# ---------------- 1. 旗舰双层弹窗主面板 panel.png ----------------

def make_panel() -> Image.Image:
    """复刻参考图 1 双层弹窗主框：
    - 外层：温润石青蓝圆角厚框（#5D829B -> #486B84）+ 底部立体厚唇（#35536A）+ 深海蓝细描边（#1F364A）
    - 内层：宽敞明亮的暖羊皮奶油白纸面（#FCF9F2 -> #F6EFE2），留出 14px 石青外框边
    - 内页四角带极克制的暖金装饰细线框与菱角（全部严格落在 68px 九宫格保护区内，拉伸零变形！）
    """
    bw, bh = 384, 448
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 3.0 * SS

    hw, hh, r_out = (bw * 0.5 - 6.0) * SS, (bh * 0.5 - 9.0) * SS, 34.0 * SS
    d_face = sdf_rrect(x, y, cx, cy, hw, hh, r_out)
    d_lip = sdf_rrect(x, y - 7.0 * SS, cx, cy, hw, hh, r_out)
    d_union = np.minimum(d_face, d_lip)

    a_main = np.clip(0.5 - d_union, 0.0, 1.0)
    st = 2.8 * SS

    c_stroke = rgb("1E3448")
    c_lip = rgb("335068")
    c_out_top, c_out_bot = rgb("678CA6"), rgb("4B6E88")
    c_out_hi = rgb("94B8D0")

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_stroke[None, None, :], a_main)
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))

    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    outer_grad = c_out_top[None, None, :] * (1.0 - yn[:, :, None]) + c_out_bot[None, None, :] * yn[:, :, None]
    # 外框顶沿清透高光丝
    d_out_in = d_face + st
    d_out_dn = np.roll(d_out_in, int(round(2.5 * SS)), axis=0)
    d_out_dn[:int(round(2.5 * SS)), :] = 1e9
    top_hi = np.clip(0.5 - d_out_in, 0.0, 1.0) * np.clip(d_out_dn + 0.5, 0.0, 1.0) * np.clip(1.0 - yn * 3.0, 0.0, 1.0)
    outer_grad = blend(outer_grad, c_out_hi[None, None, :], top_hi * 0.85)
    col = blend(col, outer_grad, np.clip(0.5 - d_out_in, 0.0, 1.0))

    # 内层暖奶油白纸面（向内缩 13px，顶边略多留 15px 承托卷轴）
    in_pad_x = 13.0 * SS
    in_pad_top = 15.0 * SS
    in_pad_bot = 13.0 * SS
    in_cy = cy + (in_pad_top - in_pad_bot) * 0.5
    in_hw = hw - in_pad_x
    in_hh = hh - (in_pad_top + in_pad_bot) * 0.5
    r_in = 23.0 * SS

    d_paper = sdf_rrect(x, y, cx, in_cy, in_hw, in_hh, r_in)
    # 纸面外圈深石青嵌槽细边
    col = blend(col, rgb("35526A")[None, None, :], np.clip(0.5 - (d_paper - 2.0 * SS), 0.0, 1.0))
    # 纸面纯白亮边 + 温润奶油底渐变
    col = blend(col, rgb("FFFDF9")[None, None, :], np.clip(0.5 - d_paper, 0.0, 1.0))
    yp = np.clip((y - (in_cy - in_hh)) / max(1.0, 2.0 * in_hh), 0.0, 1.0)
    paper_top, paper_bot = rgb("FCF8F0"), rgb("F5EDE0")
    paper_fill = paper_top[None, None, :] * (1.0 - yp[:, :, None]) + paper_bot[None, None, :] * yp[:, :, None]
    col = blend(col, paper_fill, np.clip(0.5 - (d_paper + 2.4 * SS), 0.0, 1.0))

    # 内页优雅细金棕装饰内框线（距离纸边 8px，四角带双折角，完全在 68px 9-slice 边界内）
    d_deco = sdf_rrect(x, y, cx, in_cy, in_hw - 7.5 * SS, in_hh - 7.5 * SS, 16.0 * SS)
    deco_line = np.clip(1.0 - np.abs(d_deco) / (1.05 * SS), 0.0, 1.0) * 0.55
    col = blend(col, rgb("DECBA8")[None, None, :], deco_line * np.clip(0.5 - d_paper, 0.0, 1.0))

    # 顶边中央菱星辉光点缀（由于中央会被横向拉伸，只放四角精致暖金小圆珠，绝不放中央！）
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            px = cx + sx * (in_hw - 16.5 * SS)
            py = in_cy + sy * (in_hh - 16.5 * SS)
            dd = (np.abs(x - px) + np.abs(y - py)) - 3.6 * SS
            col = blend(col, rgb("DFC496")[None, None, :], np.clip(0.5 - dd, 0.0, 1.0) * 0.72)

    body_rgba = np.zeros((h, w, 4), dtype=np.uint8)
    body_rgba[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    body_rgba[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    im = Image.fromarray(body_rgba, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)

    # 柔和环境底影（绝不黑脏）
    sh_a = Image.fromarray(np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8), "L").resize((bw, bh), Image.Resampling.LANCZOS)
    sh_blur = sh_a.filter(ImageFilter.GaussianBlur(radius=4.0))
    sh_np = np.array(sh_blur, dtype=np.float32) * 0.28
    canvas_np = np.zeros((bh, bw, 4), dtype=np.uint8)
    canvas_np[:, :, 0] = 10
    canvas_np[:, :, 1] = 22
    canvas_np[:, :, 2] = 36
    canvas_np[3:, :, 3] = np.clip(np.round(sh_np[:-3, :]), 0, 255).astype(np.uint8)
    canvas = Image.fromarray(canvas_np, "RGBA")
    canvas.alpha_composite(im, (0, 0))
    return canvas


# ---------------- 2. 顶部双折耳燕尾卷轴标题 banner / banner_grey / banner_warm ----------------

def make_banner(theme: str) -> Image.Image:
    """复刻参考图 1 顶部清雅立体双折耳燕尾绶带（9-slice 左右各 148px 保护折耳，中间平直光滑支持任意宽度拉伸）。"""
    bw, bh = 640, 136
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.45

    if theme == "warm":
        c_str = rgb("5C3408")
        c_tail_top, c_tail_bot = rgb("E09C34"), rgb("B56E14")
        c_fold = rgb("8E500C")
        c_rim = rgb("FFF4AA")
        c_face_top, c_face_bot = rgb("FAD064"), rgb("E5A02E")
        c_in_line = rgb("C6801B")
        c_orn = rgb("FFF6BA")
    elif theme == "grey":
        c_str = rgb("283644")
        c_tail_top, c_tail_bot = rgb("7A8FA4"), rgb("5C7084")
        c_fold = rgb("46586A")
        c_rim = rgb("DCE6F0")
        c_face_top, c_face_bot = rgb("9BB0C4"), rgb("788EA4")
        c_in_line = rgb("62788E")
        c_orn = rgb("EBF2F8")
    else:  # 默认石青霁蓝（与参考图 1「每日任务」丝滑同色系！）
        c_str = rgb("1D384E")
        c_tail_top, c_tail_bot = rgb("5A8EAE"), rgb("407090")
        c_fold = rgb("2E5672")
        c_rim = rgb("BEE4FA")
        c_face_top, c_face_bot = rgb("78B4D6"), rgb("538EB2")
        c_in_line = rgb("3F7598")
        c_orn = rgb("DCFAFF")

    # 两侧燕尾飘带（严格落在左右 148px 9-slice 端区内：|x - cx| > 172）
    d_tails = np.full((h, w), 1e9, dtype=np.float32)
    for side in (-1.0, 1.0):
        tx = cx + side * 252.0 * SS
        ty = cy + 14.0 * SS
        dt = sdf_rrect(x, y, tx, ty, 54.0 * SS, 33.0 * SS, 9.0 * SS)
        notch_x = cx + side * 308.0 * SS
        dn = (np.abs(x - notch_x) * 0.88 + np.abs(y - ty) * 1.25) - 23.0 * SS
        dt = np.maximum(dt, -dn)
        d_tails = np.minimum(d_tails, dt)

    # 折耳阴影三角块
    d_fold_l = sdf_rrect(x, y, cx - 216.0 * SS, cy + 18.0 * SS, 20.0 * SS, 25.0 * SS, 6.0 * SS)
    d_fold_r = sdf_rrect(x, y, cx + 216.0 * SS, cy + 18.0 * SS, 20.0 * SS, 25.0 * SS, 6.0 * SS)
    d_folds = np.minimum(d_fold_l, d_fold_r)

    # 主牌匾（平直圆角矩形，保证 9-slice 中段拉伸 100% 水平无畸变！）
    d_main_face = sdf_rrect(x, y, cx, cy - 2.0 * SS, 228.0 * SS, 40.0 * SS, 16.0 * SS)
    d_main_lip = sdf_rrect(x, y - 5.0 * SS, cx, cy - 2.0 * SS, 228.0 * SS, 40.0 * SS, 16.0 * SS)
    d_main = np.minimum(d_main_face, d_main_lip)

    d_all = np.minimum(np.minimum(d_tails, d_folds), d_main)
    d_sh = np.roll(d_all, 5 * SS, axis=0)
    d_sh[:5 * SS, :] = 1e9
    sh_a = np.clip(0.5 - d_sh, 0.0, 1.0) * 0.26
    a_main = np.clip(0.5 - d_all, 0.0, 1.0)
    alpha = np.maximum(a_main, sh_a)

    st = 2.8 * SS
    yn = np.clip(y / h, 0.0, 1.0)
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)

    tail_col = c_tail_top[None, None, :] * (1.0 - yn[:, :, None]) + c_tail_bot[None, None, :] * yn[:, :, None]
    col = blend(col, tail_col, np.clip(0.5 - (d_tails + st), 0.0, 1.0))
    col = blend(col, c_fold[None, None, :], np.clip(0.5 - (d_folds + st), 0.0, 1.0))

    # 主牌匾立体底沿 + 外描边 + 顶高光边 + 面渐变
    col = blend(col, c_str[None, None, :], np.clip(0.5 - d_main, 0.0, 1.0))
    col = blend(col, c_tail_bot[None, None, :], np.clip(0.5 - (d_main_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_main_face + st), 0.0, 1.0))

    ym = np.clip((y - (cy - 42.0 * SS)) / (80.0 * SS), 0.0, 1.0)
    face = c_face_top[None, None, :] * (1.0 - ym[:, :, None]) + c_face_bot[None, None, :] * ym[:, :, None]
    # 上半玻璃清漆层
    gloss = np.clip((0.46 - ym) * 4.0, 0.0, 1.0) * 0.14
    face = np.clip(face + (255.0 - face) * gloss[:, :, None], 0.0, 255.0)
    col = blend(col, face, np.clip(0.5 - (d_main_face + 5.8 * SS), 0.0, 1.0))

    # 内嵌精致缝线框
    d_stitch = np.abs(d_main_face + 11.5 * SS) - 1.15 * SS
    col = blend(col, c_in_line[None, None, :], np.clip(0.5 - d_stitch, 0.0, 1.0) * 0.65)

    # 左右端头对称小菱星点缀（严格在左右 148px 保护区内：|x - cx| = 198）
    for side in (-1.0, 1.0):
        px = cx + side * 198.0 * SS
        py = cy - 2.0 * SS
        star = ((np.abs(x - px) / (7.5 * SS)) ** 0.72 + (np.abs(y - py) / (7.5 * SS)) ** 0.72) - 1.0
        col = blend(col, c_orn[None, None, :], np.clip(0.5 - star * 7.0 * SS, 0.0, 1.0) * 0.88)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


# ---------------- 3. 右上角立体珊瑚红圆润八角关闭钮 close.png ----------------

def make_close() -> Image.Image:
    """复刻参考图 1 右上角珊瑚朱红圆润八角立体关闭勋章（彻底告别廉价平涂圆形红叉）。"""
    bw = bh = 112
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 3.0 * SS

    d_face = sdf_octagon(x, y, cx, cy, 43.0 * SS, 11.0 * SS)
    d_lip = sdf_octagon(x, y - 6.0 * SS, cx, cy, 43.0 * SS, 11.0 * SS)
    d_u = np.minimum(d_face, d_lip)
    d_sh = np.roll(d_u, 4 * SS, axis=0)
    d_sh[:4 * SS, :] = 1e9

    a_main = np.clip(0.5 - d_u, 0.0, 1.0)
    sh_a = np.clip(0.5 - d_sh, 0.0, 1.0) * 0.28
    alpha = np.maximum(a_main, sh_a)

    st = 3.0 * SS
    c_str = rgb("4A1416")
    c_lip = rgb("9E2B2E")
    c_rim = rgb("FFB6B0")
    c_top, c_bot = rgb("EF625C"), rgb("CE3E3B")

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))

    yn = np.clip((y - (cy - 43 * SS)) / (86 * SS), 0.0, 1.0)
    body = c_top[None, None, :] * (1.0 - yn[:, :, None]) + c_bot[None, None, :] * yn[:, :, None]
    col = blend(col, body, np.clip(0.5 - (d_face + 5.6 * SS), 0.0, 1.0))

    # 左上小高光斑
    gl = np.hypot(x - (cx - 16 * SS), y - (cy - 18 * SS)) - 4.5 * SS
    col = blend(col, rgb("FFE6E2")[None, None, :], np.clip(0.8 - gl, 0.0, 1.0) * 0.72)

    # 中央圆头粗白 X（带微下沉暗红底影，立体厚实）
    arm = 14.2 * SS
    thick = 5.8 * SS
    d_x1 = sdf_segment(x, y, cx - arm, cy - arm, cx + arm, cy + arm) - thick
    d_x2 = sdf_segment(x, y, cx - arm, cy + arm, cx + arm, cy - arm) - thick
    d_x = np.minimum(d_x1, d_x2)
    d_x_sh = np.roll(d_x, int(round(2.6 * SS)), axis=0)
    d_x_sh[:int(round(2.6 * SS)), :] = 1e9

    col = blend(col, rgb("7D1D20")[None, None, :], np.clip(0.5 - d_x_sh, 0.0, 1.0) * 0.85)
    col = blend(col, rgb("FFF9F5")[None, None, :], np.clip(0.5 - d_x, 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


# ---------------- 4. 温润奶油立体横条卡 row / row_claim / row_done ----------------

def make_row(kind: str) -> Image.Image:
    """复刻参考图 1 列表横条质感：
    - 柔和暖棕灰描边 + 温润浅褐立体厚底沿 + 纯白内高光边 + 奶油象牙面 + 极轻暖调投影（0% 黑灰脏影！）
    """
    bw, bh = 288, 140
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 2.2 * SS
    hw, hh, r = (bw * 0.5 - 5.0) * SS, (bh * 0.5 - 7.5) * SS, 22.0 * SS

    if kind == "claim":
        c_str = rgb("9E7328")
        c_lip = rgb("DFB45E")
        c_rim = rgb("FFFDF2")
        c_top, c_bot = rgb("FFF7DA"), rgb("FCE6A6")
        c_in_frame = rgb("ECD088")
    elif kind == "done":
        c_str = rgb("B4AE9E")
        c_lip = rgb("D4CEBE")
        c_rim = rgb("F7F5EE")
        c_top, c_bot = rgb("EDEAE0"), rgb("E4DFD2")
        c_in_frame = rgb("D8D2C4")
    else:  # 默认奶油象牙白
        c_str = rgb("BBA98E")
        c_lip = rgb("DFD1BA")
        c_rim = rgb("FFFFFF")
        c_top, c_bot = rgb("FFFDF9"), rgb("FAF3E6")
        c_in_frame = rgb("EFE5D2")

    d_face = sdf_rrect(x, y, cx, cy, hw, hh, r)
    d_lip = sdf_rrect(x, y - 4.4 * SS, cx, cy, hw, hh, r)
    d_sh = sdf_rrect(x, y - 7.0 * SS, cx, cy, hw + 1.0 * SS, hh, r)

    sh_a = np.clip(1.0 - d_sh / (4.0 * SS), 0.0, 1.0) * 0.14
    d_u = np.minimum(d_face, d_lip)
    a_main = np.clip(0.5 - d_u, 0.0, 1.0)
    alpha = np.maximum(a_main, sh_a)

    st = 2.0 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    # 阴影底色用暖褐而非纯黑，贴在米白底板上干净通透
    col = blend(col, rgb("6E583E")[None, None, :], sh_a)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))

    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    body = c_top[None, None, :] * (1.0 - yn[:, :, None]) + c_bot[None, None, :] * yn[:, :, None]
    col = blend(col, body, np.clip(0.5 - (d_face + 4.4 * SS), 0.0, 1.0))

    # 极细的内嵌装饰双线（复刻参考图任务卡四边细腻的浅米色内线）
    d_in = np.abs(d_face + 7.2 * SS) - 0.9 * SS
    col = blend(col, c_in_frame[None, None, :], np.clip(0.5 - d_in, 0.0, 1.0) * 0.75)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


# ---------------- 5. 顶部暖米黄宝箱挂板 quest_tray.png ----------------

def make_quest_tray() -> Image.Image:
    """复刻参考图 1 顶部带两枚小木栓的暖米黄任务活跃度挂板（9-slice 56,42,56,52 保护两侧木栓不被拉伸）。"""
    bw, bh = 288, 216
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = (w - 1) * 0.5

    # 主板体（顶部留 14px 给木栓探头）
    ty0, ty1 = 14.0 * SS, (bh - 6.0) * SS
    tcy, thh = (ty0 + ty1) * 0.5, (ty1 - ty0) * 0.5
    thw = (bw * 0.5 - 5.0) * SS
    d_board = sdf_rrect(x, y, cx, tcy, thw, thh, 22.0 * SS)
    d_lip = sdf_rrect(x, y - 3.6 * SS, cx, tcy, thw, thh, 22.0 * SS)

    # 左右两枚圆润小木栓（位于 x = 36 与 bw - 36，严格在 56px 9-slice 左右边界之内！）
    d_pegs = np.full((h, w), 1e9, dtype=np.float32)
    for side in (-1.0, 1.0):
        px = cx + side * (bw * 0.5 - 38.0) * SS
        py = 16.0 * SS
        dp = sdf_rrect(x, y, px, py, 9.5 * SS, 13.0 * SS, 5.5 * SS)
        d_pegs = np.minimum(d_pegs, dp)

    d_board_u = np.minimum(d_board, d_lip)
    d_all = np.minimum(d_board_u, d_pegs)
    a_main = np.clip(0.5 - d_all, 0.0, 1.0)

    st = 2.0 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("AF9368")[None, None, :], np.clip(0.5 - d_board_u, 0.0, 1.0))
    col = blend(col, rgb("D7BE92")[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, rgb("FFF8E6")[None, None, :], np.clip(0.5 - (d_board + st), 0.0, 1.0))

    yb = np.clip((y - ty0) / max(1.0, ty1 - ty0), 0.0, 1.0)
    fill = rgb("F7EBD0")[None, None, :] * (1.0 - yb[:, :, None]) + rgb("EFE0BE")[None, None, :] * yb[:, :, None]
    col = blend(col, fill, np.clip(0.5 - (d_board + 4.5 * SS), 0.0, 1.0))

    # 木栓压在挂板顶沿之上（带小投射影与高光帽）
    d_peg_sh = np.roll(d_pegs, int(round(3.0 * SS)), axis=0)
    d_peg_sh[:int(round(3.0 * SS)), :] = 1e9
    col = blend(col, rgb("B89B6C")[None, None, :], np.clip(0.5 - d_peg_sh, 0.0, 1.0) * np.clip(0.5 - d_board, 0.0, 1.0) * 0.45)
    col = blend(col, rgb("7D5A34")[None, None, :], np.clip(0.5 - d_pegs, 0.0, 1.0))
    yp = np.clip((y - 3.0 * SS) / (26.0 * SS), 0.0, 1.0)
    peg_col = rgb("DFB982")[None, None, :] * (1.0 - yp[:, :, None]) + rgb("B48650")[None, None, :] * yp[:, :, None]
    col = blend(col, peg_col, np.clip(0.5 - (d_pegs + 2.2 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


# ---------------- 6. 弹窗内凹列表槽 modal_well.png & 深海展示台 dark.png ----------------

def make_modal_well() -> Image.Image:
    """暖米色弹窗内部包裹滚动列表的微凹圆角槽底（让多行横条整体有归属感，层次分明）。"""
    bw = bh = 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    d = sdf_rrect(x, y, cx, cy, 123 * SS, 123 * SS, 26 * SS)
    a = np.clip(0.5 - d, 0.0, 1.0)

    col = np.broadcast_to(rgb("D5C6AE"), (h, w, 3)).copy()
    # 底沿纯白托光
    d_up = np.roll(d, -int(round(2.0 * SS)), axis=0)
    d_up[-int(round(2.0 * SS)):, :] = 1e9
    yn = np.clip(y / h, 0.0, 1.0)
    m_in = np.clip(0.5 - (d + 2.0 * SS), 0.0, 1.0)
    top_sh = np.clip(1.0 - (y - 5 * SS) / (16 * SS), 0.0, 1.0) * 0.35
    fill = rgb("EAE0CE")[None, None, :] * (1.0 - top_sh[:, :, None]) + rgb("D2C3AA")[None, None, :] * top_sh[:, :, None]
    col = blend(col, fill, m_in)
    bot_hi = np.clip(0.5 - d, 0.0, 1.0) * np.clip(d_up + 0.5, 0.0, 1.0) * np.clip((yn - 0.7) * 3.3, 0.0, 1.0)
    col = blend(col, rgb("FFFDF8")[None, None, :], bot_hi * 0.85)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_dark() -> Image.Image:
    """深海石青内凹舞台框（用于日常首领、天书、战氅、集市等暗底高对比展示区）。"""
    bw = bh = 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    d = sdf_rrect(x, y, cx, cy, 123 * SS, 123 * SS, 28 * SS)
    a = np.clip(0.5 - d, 0.0, 1.0)

    c_rim = rgb("C7B089")
    c_str = rgb("162A3E")
    c_top, c_bot = rgb("1F3B56"), rgb("2A4E6E")

    col = np.broadcast_to(c_rim, (h, w, 3)).copy()
    col = blend(col, c_str[None, None, :], np.clip(0.5 - (d + 2.6 * SS), 0.0, 1.0))
    yn = np.clip(y / h, 0.0, 1.0)
    fill = c_top[None, None, :] * (1.0 - yn[:, :, None]) + c_bot[None, None, :] * yn[:, :, None]
    top_sh = np.clip(1.0 - (y - 6 * SS) / (18 * SS), 0.0, 1.0) * 0.35
    fill = fill * (1.0 - top_sh[:, :, None])
    col = blend(col, fill, np.clip(0.5 - (d + 5.2 * SS), 0.0, 1.0))

    d_in = np.abs(d + 9.5 * SS) - 1.0 * SS
    col = blend(col, rgb("4D789E")[None, None, :], np.clip(0.5 - d_in, 0.0, 1.0) * 0.45)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


# ---------------- 7. 侧边书签页签 & 签到/集市高亮卡 ----------------

def make_vtab(state: str) -> Image.Image:
    """七日目标侧边日签 / 弹窗分段页签：告别模糊黑描边，改用立体双层色阶书签。"""
    bw, bh = 168, 128
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 2.2 * SS
    hw, hh, r = (bw * 0.5 - 5.0) * SS, (bh * 0.5 - 7.0) * SS, 22.0 * SS

    if state == "on":
        c_str = rgb("124A48")
        c_lip = rgb("1A807A")
        c_rim = rgb("A8FFF4")
        c_top, c_bot = rgb("42D4C4"), rgb("24A69A")
    elif state == "lock":
        c_str = rgb("6C7D8E")
        c_lip = rgb("9BAAB8")
        c_rim = rgb("EBF0F5")
        c_top, c_bot = rgb("D7E0E8"), rgb("C4CFD9")
    else:  # "off" 已解锁未选中（今天/可切换）
        c_str = rgb("B5A184")
        c_lip = rgb("D8C7AC")
        c_rim = rgb("FFFFFF")
        c_top, c_bot = rgb("FFFDF7"), rgb("F5EBD8")

    d_face = sdf_rrect(x, y, cx, cy, hw, hh, r)
    d_lip = sdf_rrect(x, y - 4.5 * SS, cx, cy, hw, hh, r)
    d_u = np.minimum(d_face, d_lip)
    a_main = np.clip(0.5 - d_u, 0.0, 1.0)

    st = 2.2 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))

    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    body = c_top[None, None, :] * (1.0 - yn[:, :, None]) + c_bot[None, None, :] * yn[:, :, None]
    col = blend(col, body, np.clip(0.5 - (d_face + 4.6 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_tab_on() -> Image.Image:
    """梁山集市商品卡 / 七日签到今日高亮格：清透奶油香槟立体卡。"""
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
    col = blend(col, rgb("9B7632")[None, None, :], a_main)
    col = blend(col, rgb("D8B266")[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, rgb("FFFDF5")[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))

    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    body = rgb("FFF9E8")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("F8E8BE")[None, None, :] * yn[:, :, None]
    col = blend(col, body, np.clip(0.5 - (d_face + 5.0 * SS), 0.0, 1.0))

    d_in = np.abs(d_face + 8.5 * SS) - 1.0 * SS
    col = blend(col, rgb("E6CA8A")[None, None, :], np.clip(0.5 - d_in, 0.0, 1.0) * 0.7)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


# ---------------- 8. 清爽胶囊进度条套件 bar_bg / bar_{green,gold,azure,white} ----------------

def make_bar_bg() -> Image.Image:
    """彻底解决旧进度条『黑漆漆粗大丑槽』痛点：
    对标参考图 1：柔和深灰棕细外边（#5A524A）+ 温润中灰褐内凹底槽（#787068 -> #898178），
    未填满时清爽柔和、绝不抢戏，填满时更衬托亮色填充条！
    """
    bw, bh = 256, 40
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    hw, hh = (bw * 0.5 - 2.0) * SS, (bh * 0.5 - 2.0) * SS
    r = hh

    d = sdf_rrect(x, y, cx, cy, hw, hh, r)
    a = np.clip(0.5 - d, 0.0, 1.0)
    st = 2.4 * SS

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("524A42")[None, None, :], a)

    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    # 上方微暗内凹阴影，下方温润灰褐底
    track = rgb("6B635B")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("877F76")[None, None, :] * yn[:, :, None]
    col = blend(col, track, np.clip(0.5 - (d + st), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


def make_bar_fill(kind: str) -> Image.Image:
    """清爽糖果亮泽胶囊填充条（完美契合 bar_bg 内部槽高，带上半清透高光带）。"""
    bw, bh = 256, 32
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    hw, hh = (bw * 0.5 - 1.5) * SS, (bh * 0.5 - 1.5) * SS
    r = hh

    if kind == "green":
        c_top, c_bot, c_rim = rgb("7EF29A"), rgb("32C25E"), rgb("BAFFD0")
    elif kind == "gold":
        c_top, c_bot, c_rim = rgb("FFE875"), rgb("F0A622"), rgb("FFF7BD")
    elif kind == "azure":
        c_top, c_bot, c_rim = rgb("96E6FF"), rgb("4FB6E8"), rgb("D4F6FF")
    else:  # white
        c_top, c_bot, c_rim = rgb("FFFFFF"), rgb("DCE6F0"), rgb("FFFFFF")

    d = sdf_rrect(x, y, cx, cy, hw, hh, r)
    a = np.clip(0.5 - d, 0.0, 1.0)
    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)

    body = c_top[None, None, :] * (1.0 - yn[:, :, None]) + c_bot[None, None, :] * yn[:, :, None]
    # 上半高光胶囊带
    d_hi = sdf_rrect(x, y, cx, cy - hh * 0.34, hw - 5.0 * SS, hh * 0.26, hh * 0.26)
    body = blend(body, c_rim[None, None, :], np.clip(0.5 - d_hi, 0.0, 1.0) * 0.52)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(body), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGBA").resize((bw, bh), Image.Resampling.LANCZOS)


# ---------------- 9. 浮层说明卡 hint.png ----------------

def make_hint() -> Image.Image:
    bw, bh = 288, 224
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    hw, hh, r = (bw * 0.5 - 5.0) * SS, (bh * 0.5 - 5.0) * SS, 28.0 * SS

    d = sdf_rrect(x, y, cx, cy, hw, hh, r)
    a = np.clip(0.5 - d, 0.0, 1.0) * 0.96

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("122436")[None, None, :], np.clip(0.5 - d, 0.0, 1.0))
    col = blend(col, rgb("6F9AC0")[None, None, :], np.clip(0.5 - (d + 2.4 * SS), 0.0, 1.0))
    yn = np.clip(y / h, 0.0, 1.0)
    fill = rgb("23425E")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("183046")[None, None, :] * yn[:, :, None]
    col = blend(col, fill, np.clip(0.5 - (d + 4.8 * SS), 0.0, 1.0))

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
