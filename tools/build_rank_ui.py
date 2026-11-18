"""生成排行榜专属 4x 超采样高清 UI 组件皮肤（v2 旗舰重构版：彻底修复微拱顶檐方向、深海蓝双层立体大面板、暖金卷轴标题、天青雕版底栏图标）。

输出到 Assets/Resources/Art/ui/：
- rank_podium_1.png  (368x248)                   冠军朱砂鎏金荣耀高台（紧凑饱满比例，把上方大空间留给角色）
- rank_podium_2.png  (320x208)                   亚军霁蓝银辉荣耀高台
- rank_podium_3.png  (320x194)                   季军古铜琥珀荣耀高台
- rank_medal_1.png   (96x96)                     冠军金翼圆章底托
- rank_medal_2.png   (88x88)                     亚军银翼圆章底托
- rank_medal_3.png   (88x88)                     季军铜翼圆章底托
- rank_arch.png      (1080x112)                  排行榜深海蓝微拱顶檐（上方透明承托高台，下方 100% 实心无缝衔接列表仓体 + 鎏金弧线与中央菱星扣）
- rank_well.png      (256x256, 9-slice 48,48,48,48) 中部列表内凹深海暗蓝圆角槽底（如参考图外亮蓝框+内深蓝凹槽的双层质感）
- rank_row.png       (256x144, 9-slice 44,44,44,44) 4~50 名温润奶油米白圆角榜卡
- rank_row_me.png    (256x152, 9-slice 44,44,44,44) 底部「我」专属暖琥珀香槟横幅卡
- rank_scroll_hdr.png(560x116)                   参考图同款皇室暖金折耳卷轴标题横幅

用法：python3 tools/build_rank_ui.py
"""
import os
import math
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


def sdf_trapezoid(x: np.ndarray, y: np.ndarray, cx: float, y0: float, y1: float, hw0: float, hw1: float, r: float) -> np.ndarray:
    h = max(1.0, y1 - y0)
    t = np.clip((y - y0) / h, 0.0, 1.0)
    hw = hw0 + (hw1 - hw0) * t
    dx = np.abs(x - cx) - (hw - r)
    dy = np.maximum(y0 + r - y, y - (y1 - r))
    outside = np.hypot(np.maximum(dx, 0.0), np.maximum(dy, 0.0))
    inside = np.minimum(np.maximum(dx, dy), 0.0)
    return outside + inside - r


def blend(dst: np.ndarray, col: np.ndarray, mask: np.ndarray) -> np.ndarray:
    m = np.clip(mask, 0.0, 1.0)[:, :, None]
    return dst * (1.0 - m) + col * m


def make_podium(tier: int) -> Image.Image:
    if tier == 1:
        bw, bh = 368, 248
        c_stroke = rgb("3A1A14")
        c_top_hi, c_top_face, c_top_lip = rgb("FFF5AE"), rgb("F2BC46"), rgb("BA7818")
        c_deck = rgb("FFE38E")
        c_body_top, c_body_bot = rgb("D85054"), rgb("B0353C")
        c_frame_outer, c_frame_in = rgb("F6C65B"), rgb("7A1E24")
        c_plaque_top, c_plaque_bot = rgb("C84248"), rgb("9E2A32")
        c_stud = rgb("FFF4B4")
    elif tier == 2:
        bw, bh = 320, 208
        c_stroke = rgb("1A2B40")
        c_top_hi, c_top_face, c_top_lip = rgb("F4FBFF"), rgb("A2C6EA"), rgb("5C82AA")
        c_deck = rgb("DCEEFF")
        c_body_top, c_body_bot = rgb("648EC2"), rgb("476B98")
        c_frame_outer, c_frame_in = rgb("BBD9F5"), rgb("2E4C72")
        c_plaque_top, c_plaque_bot = rgb("567FB2"), rgb("3D608C")
        c_stud = rgb("F2FAFF")
    else:
        bw, bh = 320, 194
        c_stroke = rgb("2D1B10")
        c_top_hi, c_top_face, c_top_lip = rgb("FFECDA"), rgb("DFA06E"), rgb("925630")
        c_deck = rgb("F8D2AA")
        c_body_top, c_body_bot = rgb("BD7A50"), rgb("8E5332")
        c_frame_outer, c_frame_in = rgb("EBB484"), rgb("63361E")
        c_plaque_top, c_plaque_bot = rgb("AC6A42"), rgb("824B2B")
        c_stud = rgb("FFEEE0")

    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = (w - 1) * 0.5

    deck_y0, deck_y1 = 8 * SS, 36 * SS
    cap_y0, cap_y1 = 28 * SS, 52 * SS
    body_y0, body_y1 = 46 * SS, (bh - 2) * SS

    hw_deck0 = (bw * 0.415) * SS
    hw_deck1 = (bw * 0.478) * SS
    hw_cap = (bw * 0.482) * SS
    hw_body0 = (bw * 0.448) * SS
    hw_body1 = (bw * 0.456) * SS

    d_deck = sdf_trapezoid(x, y, cx, deck_y0, deck_y1, hw_deck0, hw_deck1, 6 * SS)
    d_cap = sdf_rrect(x, y, cx, (cap_y0 + cap_y1) * 0.5, hw_cap, (cap_y1 - cap_y0) * 0.5, 6.5 * SS)
    d_body = sdf_trapezoid(x, y, cx, body_y0, body_y1, hw_body0, hw_body1, 6 * SS)

    d_all = np.minimum(np.minimum(d_deck, d_cap), d_body)
    alpha = np.clip(0.5 - d_all, 0.0, 1.0)
    col = np.broadcast_to(c_stroke, (h, w, 3)).copy()
    st = 2.6 * SS

    m_body = np.clip(0.5 - (d_body + st), 0.0, 1.0)
    t_body = np.clip((y - body_y0) / max(1.0, body_y1 - body_y0), 0.0, 1.0)
    body_grad = c_body_top[None, None, :] * (1.0 - t_body[:, :, None]) + c_body_bot[None, None, :] * t_body[:, :, None]
    side_shade = np.clip((np.abs(x - cx) - (hw_body0 - 20 * SS)) / (18 * SS), 0.0, 1.0) * 0.20
    body_grad = body_grad * (1.0 - side_shade[:, :, None])
    eave_sh = np.clip(1.0 - (y - cap_y1) / (11 * SS), 0.0, 1.0) * 0.30
    body_grad = body_grad * (1.0 - eave_sh[:, :, None])
    col = blend(col, body_grad, m_body)

    pw = hw_body0 - 18 * SS
    py0, py1 = body_y0 + 14 * SS, body_y1 - 8 * SS
    pcy, phh = (py0 + py1) * 0.5, (py1 - py0) * 0.5
    d_fr_out = sdf_rrect(x, y, cx, pcy, pw, phh, 8 * SS)
    d_fr_mid = sdf_rrect(x, y, cx, pcy, pw - 2.8 * SS, phh - 2.8 * SS, 6.5 * SS)
    d_fr_in = sdf_rrect(x, y, cx, pcy, pw - 5.4 * SS, phh - 5.4 * SS, 5.0 * SS)
    col = blend(col, c_frame_in[None, None, :], np.clip(0.5 - d_fr_out, 0.0, 1.0) * m_body)
    col = blend(col, c_frame_outer[None, None, :], np.clip(0.5 - d_fr_mid, 0.0, 1.0) * m_body)
    tp = np.clip((y - py0) / max(1.0, py1 - py0), 0.0, 1.0)
    plaque_col = c_plaque_top[None, None, :] * (1.0 - tp[:, :, None]) + c_plaque_bot[None, None, :] * tp[:, :, None]
    glow = np.exp(-(((x - cx) / (pw * 0.85)) ** 2 + ((y - (py0 + 34 * SS)) / (phh * 0.9)) ** 2)) * 0.16
    plaque_col = np.clip(plaque_col + 255.0 * glow[:, :, None], 0.0, 255.0)
    col = blend(col, plaque_col, np.clip(0.5 - d_fr_in, 0.0, 1.0) * m_body)

    for sx in (-1, 1):
        for sy in (-1, 1):
            rx = cx + sx * (pw - 10 * SS)
            ry = pcy + sy * (phh - 10 * SS)
            dr = np.hypot(x - rx, y - ry) - 2.6 * SS
            col = blend(col, c_stud[None, None, :], np.clip(0.5 - dr, 0.0, 1.0) * m_body)

    m_deck = np.clip(0.5 - (d_deck + st), 0.0, 1.0)
    td = np.clip((y - deck_y0) / max(1.0, deck_y1 - deck_y0), 0.0, 1.0)
    deck_col = (c_top_hi * 0.94)[None, None, :] * (1.0 - td[:, :, None]) + c_deck[None, None, :] * td[:, :, None]
    col = blend(col, deck_col, m_deck)

    m_cap_out = np.clip(0.5 - d_cap, 0.0, 1.0)
    col = blend(col, c_stroke[None, None, :], m_cap_out * (1.0 - np.clip(0.5 - (d_cap + st), 0.0, 1.0)))
    m_cap = np.clip(0.5 - (d_cap + st), 0.0, 1.0)
    tc = np.clip((y - cap_y0) / max(1.0, cap_y1 - cap_y0), 0.0, 1.0)
    cap_col = np.where(tc[:, :, None] > 0.70, c_top_lip[None, None, :],
                       c_top_hi[None, None, :] * (1.0 - tc[:, :, None] * 0.85) + c_top_face[None, None, :] * (tc[:, :, None] * 0.85))
    hi_line = np.exp(-((y - (cap_y0 + 3.8 * SS)) / (1.6 * SS)) ** 2) * 0.65
    cap_col = np.clip(cap_col + 255.0 * hi_line[:, :, None], 0.0, 255.0)
    col = blend(col, cap_col, m_cap)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_medal(tier: int) -> Image.Image:
    bw = bh = 96 if tier == 1 else 88
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.52

    if tier == 1:
        c_str = rgb("3A2006")
        c_wing_hi, c_wing_lo = rgb("FFF6B2"), rgb("D48B16")
        c_rim_hi, c_rim_lo = rgb("FFF8C2"), rgb("C87E10")
        c_core_top, c_core_bot = rgb("F7B424"), rgb("B56408")
    elif tier == 2:
        c_str = rgb("18283C")
        c_wing_hi, c_wing_lo = rgb("F6FBFF"), rgb("7EA6CE")
        c_rim_hi, c_rim_lo = rgb("FFFFFF"), rgb("789EC4")
        c_core_top, c_core_bot = rgb("7CAAD8"), rgb("3D6696")
    else:
        c_str = rgb("2E180A")
        c_wing_hi, c_wing_lo = rgb("FFECDA"), rgb("B66D3C")
        c_rim_hi, c_rim_lo = rgb("FFF2E0"), rgb("AD6434")
        c_core_top, c_core_bot = rgb("D08652"), rgb("844622")

    d_wings = np.full((h, w), 1e9, dtype=np.float32)
    R = bw * 0.30 * SS
    for side in (-1.0, 1.0):
        for ang_deg, ox, oy, rx, ry in [
            (-26, 0.34, 0.08, 0.14, 0.062),
            (4,   0.37, -0.05, 0.155, 0.065),
            (32,  0.33, -0.18, 0.145, 0.060),
        ]:
            px = cx + side * bw * ox * SS
            py = cy + bh * oy * SS
            rad = math.radians(ang_deg * side)
            ca, sa = math.cos(rad), math.sin(rad)
            ux = (x - px) * ca + (y - py) * sa
            uy = -(x - px) * sa + (y - py) * ca
            de = (np.hypot(ux / (bw * rx * SS), uy / (bh * ry * SS)) - 1.0) * min(bw * rx, bh * ry) * SS
            d_wings = np.minimum(d_wings, de)

    d_disc = np.hypot(x - cx, y - cy) - R
    d_all = np.minimum(d_wings, d_disc)

    d_sh = np.roll(d_all, 3 * SS, axis=0)
    d_sh[:3 * SS, :] = 1e9
    sh_a = np.clip(0.5 - d_sh, 0.0, 1.0) * 0.34

    a_main = np.clip(0.5 - d_all, 0.0, 1.0)
    alpha = np.maximum(a_main, sh_a)

    yn = np.clip(y / h, 0.0, 1.0)
    st = 2.6 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)

    wing_col = c_wing_hi[None, None, :] * (1.0 - yn[:, :, None]) + c_wing_lo[None, None, :] * yn[:, :, None]
    col = blend(col, wing_col, np.clip(0.5 - (d_wings + st), 0.0, 1.0))

    col = blend(col, c_str[None, None, :], np.clip(0.5 - d_disc, 0.0, 1.0))
    rim_col = c_rim_hi[None, None, :] * (1.0 - yn[:, :, None] * 0.9) + c_rim_lo[None, None, :] * (yn[:, :, None] * 0.9)
    col = blend(col, rim_col, np.clip(0.5 - (d_disc + st), 0.0, 1.0))
    col = blend(col, c_str[None, None, :] * 0.85, np.clip(0.5 - (d_disc + 7.2 * SS), 0.0, 1.0))
    core_col = c_core_top[None, None, :] * (1.0 - yn[:, :, None]) + c_core_bot[None, None, :] * yn[:, :, None]
    shine = np.exp(-(((x - (cx - 4 * SS)) / (R * 0.65)) ** 2 + ((y - (cy - 6 * SS)) / (R * 0.45)) ** 2)) * 0.35
    core_col = np.clip(core_col + 255.0 * shine[:, :, None], 0.0, 255.0)
    col = blend(col, core_col, np.clip(0.5 - (d_disc + 9.0 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_arch() -> Image.Image:
    """修复版深海青蓝微拱顶檐：
    PIL 图像 y=0 在最顶、y=h-1 在最底！
    - y < arch_y（拱线上方）必须透明（仅紧贴拱线外侧带柔和投影），绝不横穿高台！
    - y >= arch_y（拱线下方）必须 100% 不透明深青蓝，底边像素与列表外框 #2F5678 完全同色无缝衔接！
    """
    bw, bh = 1080, 112
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = (w - 1) * 0.5
    nx = (x - cx) / max(1.0, cx)

    # 中央微拱高（y=20）、两侧自然微垂（y=48）的优雅圆弧，精准复刻参考图腰线
    arch_y = (20.0 + 28.0 * (nx ** 2)) * SS
    # signed < 0 表示在拱线下方（实心区），signed > 0 表示在拱线上方（透明区）
    signed = arch_y - y

    up_sh = np.clip(1.0 - signed / (10.0 * SS), 0.0, 1.0) * (signed > 0).astype(np.float32) * 0.28
    a_body = np.clip(0.5 - signed, 0.0, 1.0)
    alpha = np.maximum(a_body, up_sh)

    c_dark = rgb("162D44")
    c_bevel = rgb("5886AE")
    c_fill_top = rgb("355F84")
    c_fill_bot = rgb("2F5678")  # 底沿严格等于列表外面板 #2F5678，0 接缝！
    c_gold_hi = rgb("FFF2AA")
    c_gold = rgb("EEBD54")

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_dark[None, None, :], a_body)
    col = blend(col, c_bevel[None, None, :], np.clip(0.5 - (signed + 2.6 * SS), 0.0, 1.0))
    tb = np.clip((y - arch_y) / np.maximum(1.0, h - arch_y), 0.0, 1.0)
    body = c_fill_top[None, None, :] * (1.0 - tb[:, :, None]) + c_fill_bot[None, None, :] * tb[:, :, None]
    col = blend(col, body, np.clip(0.5 - (signed + 7.5 * SS), 0.0, 1.0))

    # 弧形鎏金嵌线 + 中央星芒金扣（复刻参考图拱檐中心金星装饰）
    gold_y = arch_y + 15.0 * SS
    fade = np.clip((0.78 - np.abs(nx)) / 0.20, 0.0, 1.0)
    g_line = np.exp(-((y - gold_y) / (1.6 * SS)) ** 2) * fade
    col = blend(col, c_gold[None, None, :], g_line * 0.95 * a_body)

    cy_gem = (20.0 + 15.0) * SS
    # 四芒星菱花金扣
    dx_g = np.abs(x - cx) / (15.0 * SS)
    dy_g = np.abs(y - cy_gem) / (10.5 * SS)
    star = (dx_g ** 0.65 + dy_g ** 0.65) - 1.0
    col = blend(col, c_gold_hi[None, None, :], np.clip(0.5 - star * 10.0 * SS, 0.0, 1.0) * a_body)

    for sx in (-1.0, 1.0):
        px = cx + sx * 156 * SS
        nx_p = sx * 156 / 540.0
        py = (20.0 + 28.0 * (nx_p ** 2) + 15.0) * SS
        ds = (np.abs(x - px) / 1.3 + np.abs(y - py)) - 4.8 * SS
        col = blend(col, c_gold_hi[None, None, :], np.clip(0.5 - ds, 0.0, 1.0) * a_body)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_well() -> Image.Image:
    """参考图同款列表内凹圆角深海蓝槽底（外层 #2F5678 亮蓝灰面板托底，内层 #22415E 内凹大圆角暗槽）。"""
    bw = bh = 256
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    d = sdf_rrect(x, y, cx, cy, 122 * SS, 122 * SS, 30 * SS)
    a = np.clip(0.5 - d, 0.0, 1.0)

    c_rim_bot = rgb("457298")
    c_in_sh = rgb("172E44")
    c_body = rgb("22415E")

    col = np.broadcast_to(c_rim_bot, (h, w, 3)).copy()
    m_in = np.clip(0.5 - (d + 2.5 * SS), 0.0, 1.0)
    # 顶部内阴影营造真实下凹感
    top_sh = np.clip(1.0 - (y - 6 * SS) / (14 * SS), 0.0, 1.0) * 0.45
    fill = c_body[None, None, :] * (1.0 - top_sh[:, :, None]) + c_in_sh[None, None, :] * top_sh[:, :, None]
    col = blend(col, fill, m_in)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_row_card(me: bool) -> Image.Image:
    bw, bh = (256, 152) if me else (256, 144)
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 2.0 * SS
    hw, hh, r = 122 * SS, (bh * 0.5 - 7) * SS, 22 * SS

    if me:
        c_str = rgb("4E320A")
        c_lip = rgb("C68B24")
        c_rim = rgb("FFF5BE")
        c_top, c_bot = rgb("FFEFB8"), rgb("F3CF78")
    else:
        c_str = rgb("183048")
        c_lip = rgb("D2C3A6")
        c_rim = rgb("FFFDF8")
        c_top, c_bot = rgb("FDF9EF"), rgb("F5ECD9")

    d_face = sdf_rrect(x, y, cx, cy, hw, hh, r)
    d_lip = sdf_rrect(x, y - 4.8 * SS, cx, cy, hw, hh, r)
    d_sh = sdf_rrect(x, y - 8.0 * SS, cx, cy, hw + 1.5 * SS, hh, r)

    sh_a = np.clip(1.0 - d_sh / (4.8 * SS), 0.0, 1.0) * 0.26
    d_u = np.minimum(d_face, d_lip)
    a_main = np.clip(0.5 - d_u, 0.0, 1.0)
    alpha = np.maximum(a_main, sh_a)

    st = 2.2 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))

    yn = np.clip((y - (cy - hh)) / max(1.0, 2 * hh), 0.0, 1.0)
    body = c_top[None, None, :] * (1.0 - yn[:, :, None]) + c_bot[None, None, :] * yn[:, :, None]
    col = blend(col, body, np.clip(0.5 - (d_face + 4.8 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_scroll_header() -> Image.Image:
    """参考图顶部同款暖金立体双折耳卷轴牌匾（浓郁金黄饱和度，非苍白米色）。"""
    bw, bh = 560, 116
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.46

    # 两侧下垂燕尾折带
    d_tails = np.full((h, w), 1e9, dtype=np.float32)
    for side in (-1.0, 1.0):
        tx = cx + side * 218 * SS
        ty = cy + 12 * SS
        dt = sdf_rrect(x, y, tx, ty, 48 * SS, 30 * SS, 8 * SS)
        # 燕尾外侧三角凹口
        notch_x = cx + side * 268 * SS
        dn = (np.abs(x - notch_x) * 0.9 + np.abs(y - ty) * 1.25) - 20 * SS
        dt = np.maximum(dt, -dn)
        d_tails = np.minimum(d_tails, dt)

    # 主牌匾（微拱金卷轴）
    arch_off = -4.5 * SS * (1.0 - ((x - cx) / (210 * SS)) ** 2)
    d_main = sdf_rrect(x, y - arch_off, cx, cy, 198 * SS, 35 * SS, 13 * SS)
    d_fold_l = sdf_rrect(x, y, cx - 188 * SS, cy + 16 * SS, 18 * SS, 22 * SS, 6 * SS)
    d_fold_r = sdf_rrect(x, y, cx + 188 * SS, cy + 16 * SS, 18 * SS, 22 * SS, 6 * SS)
    d_folds = np.minimum(d_fold_l, d_fold_r)

    d_all = np.minimum(np.minimum(d_tails, d_folds), d_main)
    d_sh = np.roll(d_all, 4 * SS, axis=0)
    d_sh[:4 * SS, :] = 1e9
    sh_a = np.clip(0.5 - d_sh, 0.0, 1.0) * 0.30
    a_main = np.clip(0.5 - d_all, 0.0, 1.0)
    alpha = np.maximum(a_main, sh_a)

    c_str = rgb("6B3E0A")
    c_tail_top, c_tail_bot = rgb("E2A23B"), rgb("BA7518")
    c_fold = rgb("9E5D10")
    c_rim = rgb("FFF2A2")
    c_face_top, c_face_bot = rgb("F9CD62"), rgb("E5A434")

    st = 2.6 * SS
    yn = np.clip(y / h, 0.0, 1.0)
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)

    tail_col = c_tail_top[None, None, :] * (1.0 - yn[:, :, None]) + c_tail_bot[None, None, :] * yn[:, :, None]
    col = blend(col, tail_col, np.clip(0.5 - (d_tails + st), 0.0, 1.0))
    col = blend(col, c_fold[None, None, :], np.clip(0.5 - (d_folds + st), 0.0, 1.0))

    col = blend(col, c_str[None, None, :], np.clip(0.5 - d_main, 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_main + st), 0.0, 1.0))
    ym = np.clip((y - (cy - 35 * SS)) / (70 * SS), 0.0, 1.0)
    face = c_face_top[None, None, :] * (1.0 - ym[:, :, None]) + c_face_bot[None, None, :] * ym[:, :, None]
    col = blend(col, face, np.clip(0.5 - (d_main + 6.0 * SS), 0.0, 1.0))

    # 内侧精致暗金细线框
    d_in = np.abs(d_main + 11.5 * SS) - 1.1 * SS
    col = blend(col, rgb("C98520")[None, None, :], np.clip(0.5 - d_in, 0.0, 1.0) * 0.75)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ("rank_podium_1.png", lambda: make_podium(1)),
        ("rank_podium_2.png", lambda: make_podium(2)),
        ("rank_podium_3.png", lambda: make_podium(3)),
        ("rank_medal_1.png", lambda: make_medal(1)),
        ("rank_medal_2.png", lambda: make_medal(2)),
        ("rank_medal_3.png", lambda: make_medal(3)),
        ("rank_arch.png", make_arch),
        ("rank_well.png", make_well),
        ("rank_row.png", lambda: make_row_card(False)),
        ("rank_row_me.png", lambda: make_row_card(True)),
        ("rank_scroll_hdr.png", make_scroll_header),
    ]
    for name, fn in jobs:
        im = fn()
        p = os.path.join(OUT, name)
        im.save(p, optimize=True)
        print(f"wrote {name:20s} {im.size[0]}x{im.size[1]}")


if __name__ == "__main__":
    main()
