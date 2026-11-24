"""构建《村口大战外星人》主页 v6 现代守村扁平 2D 舞台组件 + 全套独立 UI 皮肤扁平化重制脚本。

100% 纯 Python 4x 超采样 SDF 矢量生成（统一 #2B2338 暖深褐描边 + 清爽二阶赛璐珞色块 + 扁平实心立体底唇，零历史遗留古风/厚涂 3D 贴图）：
1. 主页 v6 舞台套件：h_podium4, h_pad_0..4, h_chest_mat, h_start_hex{,_lip}, h_stage_arrow, fx_gold_sheen, fx_gold_star, h_podium_crest, h_bond_pill{,_lip}, ic_bond_knot, ic_bond_go
2. 全量独立 UI 皮肤重制（严格保持原分辨率与 Art.SkinBorder 九宫格）：
   tabbar, h_tabbar, h_tile, h_round, h_avatar, h_capsule, h_ribbon, h_plaque, h_pedestal, h_tab_on, h_arrow,
   arrow, btn_arrow, btn_start, dot, flame_bar, plaque, plate, banner_gold, lv, medal, pill, hex, hint_tail,
   tag, tag_intel, rank_badge_1..4, rank_av_azure, rank_av_gold
"""
import os
import math
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI_DIR = os.path.join(ROOT, "Assets/Resources/Art/ui")
SS = 4


def rgb(h: str) -> np.ndarray:
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def rgba_t(h: str, a: int = 255) -> tuple:
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


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


def sdf_convex_poly(w: int, h: int, verts) -> np.ndarray:
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    pts = np.array(verts, dtype=np.float32)
    n = len(pts)
    max_half = np.full((h, w), -1e9, dtype=np.float32)
    min_seg = np.full((h, w), 1e9, dtype=np.float32)
    for i in range(n):
        ax, ay = pts[i]
        bx, by = pts[(i + 1) % n]
        ex, ey = bx - ax, by - ay
        el = float(np.hypot(ex, ey)) + 1e-6
        nx, ny = ey / el, -ex / el
        max_half = np.maximum(max_half, (x - ax) * nx + (y - ay) * ny)
        t = np.clip(((x - ax) * ex + (y - ay) * ey) / (el * el), 0.0, 1.0)
        min_seg = np.minimum(min_seg, np.hypot(x - (ax + t * ex), y - (ay + t * ey)))
    return np.where(max_half > 0.0, min_seg, max_half)


def hex_plaque_sdf(w: int, h: int, pad_x: float, pad_y: float, tip_dx: float, round_r: float) -> np.ndarray:
    L, R = pad_x + round_r, (w - 1) - pad_x - round_r
    T, B = pad_y + round_r, (h - 1) - pad_y - round_r
    my = (h - 1) * 0.5
    verts = [(L + tip_dx, T), (R - tip_dx, T), (R, my), (R - tip_dx, B), (L + tip_dx, B), (L, my)]
    return sdf_convex_poly(w, h, verts) - round_r


# ==================== 1. 主页 v6 四连位现代守村点将石台 h_podium4.png ====================

def build_podium4():
    """760x240 扁平 2D 矢量四连位现代守村青白石防御台：
    严格对齐 HomeScreen.cs 站位中心 [0.1508, 0.3869, 0.6134, 0.8483] 与顶面中心 y=72px (padY=0.20*podH)。
    """
    bw, bh = 760, 240
    S = 3
    W, H = bw * S, bh * S
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)

    ink = rgba_t("2B2338")
    top_rim = rgba_t("DFE6EC")
    top_slab = rgba_t("BDC7D0")
    groove_c = rgba_t("8E9AA6")
    front_lip = rgba_t("9AA6B2")
    wall_face = rgba_t("727F8C")
    wall_side = rgba_t("606C78")
    base_trim = rgba_t("8E8576")
    tab_hi = rgba_t("F0E4CA")
    tab_face = rgba_t("AE9E84")

    # 四座并联梯形墩台参数（透视微外扩，完美贴合 1 点透视地面）
    # slot centers at 760px: 114.6, 294.0, 466.2, 644.7
    bays = [
        (36, 200, 14, 198),
        (206, 376, 199, 377),
        (384, 554, 383, 561),
        (560, 724, 562, 746),
    ]

    # 1) 底部干净 2D 接触投影
    sh_pts = [(10 * S, 214 * S), (750 * S, 214 * S), (754 * S, 232 * S), (6 * S, 232 * S)]
    dr.polygon(sh_pts, fill=(24, 28, 38, 68))

    # 2) 前壁主体与底座脚线（每格微切角，四连一体）
    for tx0, tx1, bx0, bx1 in bays:
        y_mid = 132 * S
        y_bot = 224 * S
        ch = 12 * S
        wall_poly = [
            (bx0 * S, y_mid),
            (bx1 * S, y_mid),
            (bx1 * S, y_bot - ch),
            (bx1 * S - ch, y_bot),
            (bx0 * S + ch, y_bot),
            (bx0 * S, y_bot - ch),
        ]
        dr.polygon(wall_poly, fill=wall_face, outline=ink, width=int(3.0 * S))
        # 两侧斜切暗面
        dr.polygon([(bx0 * S + 3 * S, y_mid), (bx0 * S + 22 * S, y_mid), (bx0 * S + 22 * S, y_bot - 3 * S), (bx0 * S + ch, y_bot - 3 * S), (bx0 * S + 3 * S, y_bot - ch)], fill=wall_side)
        dr.polygon([(bx1 * S - 22 * S, y_mid), (bx1 * S - 3 * S, y_mid), (bx1 * S - 3 * S, y_bot - ch), (bx1 * S - ch, y_bot - 3 * S), (bx1 * S - 22 * S, y_bot - 3 * S)], fill=wall_side)
        # 底部暖灰护脚边
        y_trim = 208 * S
        trim_poly = [
            (bx0 * S + 2 * S, y_trim),
            (bx1 * S - 2 * S, y_trim),
            (bx1 * S - 2 * S, y_bot - ch),
            (bx1 * S - ch, y_bot - 2 * S),
            (bx0 * S + ch, y_bot - 2 * S),
            (bx0 * S + 2 * S, y_bot - ch),
        ]
        dr.polygon(trim_poly, fill=base_trim, outline=ink, width=int(2.4 * S))

    # 3) 顶面透视石台盖板 + 内凹台面槽 + 前沿小铭扣
    for idx, (tx0, tx1, bx0, bx1) in enumerate(bays):
        yt, yb = 14 * S, 128 * S
        lip_b = 150 * S
        ct = 12 * S
        cb = 15 * S

        # 前立面石檐
        eave_poly = [
            (bx0 * S, yb - cb),
            (bx1 * S, yb - cb),
            (bx1 * S, lip_b - cb),
            (bx1 * S - cb, lip_b),
            (bx0 * S + cb, lip_b),
            (bx0 * S, lip_b - cb),
        ]
        dr.polygon(eave_poly, fill=front_lip, outline=ink, width=int(3.0 * S))

        # 顶面外亮沿
        deck_poly = [
            (tx0 * S + ct, yt),
            (tx1 * S - ct, yt),
            (tx1 * S, yt + ct),
            (bx1 * S, yb - cb),
            (bx1 * S - cb, yb),
            (bx0 * S + cb, yb),
            (bx0 * S, yb - cb),
            (tx0 * S, yt + ct),
        ]
        dr.polygon(deck_poly, fill=top_rim, outline=ink, width=int(3.0 * S))

        # 顶面内凹平涂浅槽（供运行时叠加 h_pad_0..4）
        pad_in = 14 * S
        in_poly = [
            (tx0 * S + pad_in + 6 * S, yt + pad_in),
            (tx1 * S - pad_in - 6 * S, yt + pad_in),
            (tx1 * S - pad_in, yt + pad_in + 6 * S),
            (bx1 * S - pad_in, yb - pad_in - 6 * S),
            (bx1 * S - pad_in - 6 * S, yb - pad_in),
            (bx0 * S + pad_in + 6 * S, yb - pad_in),
            (bx0 * S + pad_in, yb - pad_in - 6 * S),
            (tx0 * S + pad_in, yt + pad_in + 6 * S),
        ]
        dr.polygon(in_poly, fill=top_slab, outline=groove_c, width=int(2.4 * S))

        # 前沿中心扁平 2D 装饰卡扣
        mcx = 0.5 * (bx0 + bx1) * S
        tw, th_t = 31 * S, 13 * S
        ty0 = yb - 5 * S
        dr.rounded_rectangle([mcx - tw, ty0, mcx + tw, ty0 + th_t * 2], radius=int(5 * S), fill=tab_face, outline=ink, width=int(2.6 * S))
        dr.rounded_rectangle([mcx - tw + 3 * S, ty0 + 2 * S, mcx + tw - 3 * S, ty0 + 9 * S], radius=int(3 * S), fill=tab_hi)

    im.resize((bw, bh), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "h_podium4.png"), optimize=True)
    print("Saved flat-2D h_podium4.png (760x240)")


def build_podium_crest_suite():
    # h_podium_crest.png (540x64)
    bw, bh = 540, 64
    w, h = bw * SS, bh * SS
    d = hex_plaque_sdf(w, h, 4.0 * SS, 5.0 * SS, 16.0 * SS, 12.0 * SS)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    m_rim = np.clip(0.5 - (d + 2.6 * SS), 0.0, 1.0)
    m_in = np.clip(0.5 - (d + 5.2 * SS), 0.0, 1.0)
    col = rgb("2B2338")[None, None, :] * (1.0 - m_rim[:, :, None]) + (
        rgb("B4D4EA")[None, None, :] * (1.0 - m_in[:, :, None]) + rgb("254056")[None, None, :] * m_in[:, :, None]
    ) * m_rim[:, :, None]
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.clip(np.round(alpha * 242.0), 0, 255).astype(np.uint8)
    Image.fromarray(rgba).resize((bw, bh), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "h_podium_crest.png"), optimize=True)

    # h_bond_pill.png (260x42) & h_bond_pill_lip.png (264x46)
    pw, ph = 260, 42
    W2, H2 = pw * SS, ph * SS
    y2, x2 = np.mgrid[0:H2, 0:W2].astype(np.float32)
    d2 = sdf_rrect(x2, y2, (W2 - 1) * 0.5, (H2 - 1) * 0.5, (pw * 0.5 - 1.5) * SS, (ph * 0.5 - 1.5) * SS, 18.5 * SS)
    a2 = np.clip(0.5 - d2, 0.0, 1.0)
    m2_rim = np.clip(0.5 - (d2 + 2.2 * SS), 0.0, 1.0)
    m2_in = np.clip(0.5 - (d2 + 4.2 * SS), 0.0, 1.0)
    col2 = rgb("2B2338")[None, None, :] * (1.0 - m2_rim[:, :, None]) + (
        rgb("A8CCE0")[None, None, :] * (1.0 - m2_in[:, :, None]) + rgb("2F4D64")[None, None, :] * m2_in[:, :, None]
    ) * m2_rim[:, :, None]
    p_rgba = np.zeros((H2, W2, 4), dtype=np.uint8)
    p_rgba[:, :, :3] = np.clip(np.round(col2), 0, 255).astype(np.uint8)
    p_rgba[:, :, 3] = np.clip(np.round(a2 * 244.0), 0, 255).astype(np.uint8)
    Image.fromarray(p_rgba).resize((pw, ph), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "h_bond_pill.png"), optimize=True)

    lpw, lph = 264, 46
    LW2, LH2 = lpw * SS, lph * SS
    ly2, lx2 = np.mgrid[0:LH2, 0:LW2].astype(np.float32)
    ld2 = sdf_rrect(lx2, ly2, (LW2 - 1) * 0.5, (LH2 - 1) * 0.5, (pw - 3.0) * 0.5 * SS, (ph - 3.0) * 0.5 * SS, 18.5 * SS)
    lp_rgba = np.zeros((LH2, LW2, 4), dtype=np.uint8)
    lp_rgba[:, :, :3] = [43, 35, 56]
    lp_rgba[:, :, 3] = np.clip(np.round(np.clip(0.5 - ld2, 0.0, 1.0) * 180.0), 0, 255).astype(np.uint8)
    Image.fromarray(lp_rgba).resize((lpw, lph), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "h_bond_pill_lip.png"), optimize=True)

    # ic_bond_knot.png (64x64) & ic_bond_go.png (40x40)
    ks = 64 * SS
    ky, kx = np.mgrid[0:ks, 0:ks].astype(np.float32)
    ku, kv = (kx + 0.5) / ks * 2.0 - 1.0, (ky + 0.5) / ks * 2.0 - 1.0
    d_rg = np.abs(np.hypot(ku + 0.21, kv - 0.02) - 0.42) - 0.115
    d_rj = np.abs(np.hypot(ku - 0.21, kv + 0.02) - 0.42) - 0.115
    ag = np.clip(0.5 - d_rg * (ks * 0.5), 0.0, 1.0)
    mg = np.clip(0.5 - (d_rg + 0.05) * (ks * 0.5), 0.0, 1.0)
    aj = np.clip(0.5 - d_rj * (ks * 0.5), 0.0, 1.0)
    mj = np.clip(0.5 - (d_rj + 0.05) * (ks * 0.5), 0.0, 1.0)
    cg = rgb("2B2338")[None, None, :] * (1.0 - mg[:, :, None]) + rgb("FFE078")[None, None, :] * mg[:, :, None]
    cj = rgb("2B2338")[None, None, :] * (1.0 - mj[:, :, None]) + rgb("7CE4CA")[None, None, :] * mj[:, :, None]
    gold_over = kv < 0.0
    a_out = np.clip(ag + aj - ag * aj, 0.0, 1.0)
    over_a = np.where(gold_over, ag, aj)[:, :, None]
    under_a = np.where(gold_over, aj, ag)[:, :, None]
    comp_c = (np.where(gold_over[:, :, None], cg, cj) * over_a + np.where(gold_over[:, :, None], cj, cg) * under_a * (1.0 - over_a)) / np.maximum(a_out[:, :, None], 1e-4)
    k_rgba = np.zeros((ks, ks, 4), dtype=np.uint8)
    k_rgba[:, :, :3] = np.clip(np.round(comp_c), 0, 255).astype(np.uint8)
    k_rgba[:, :, 3] = np.clip(np.round(a_out * 255.0), 0, 255).astype(np.uint8)
    Image.fromarray(k_rgba).resize((64, 64), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "ic_bond_knot.png"), optimize=True)

    gs = 40 * SS
    d_tri = sdf_convex_poly(gs, gs, [(15.0 * SS, 10.5 * SS), (27.5 * SS, 20.0 * SS), (15.0 * SS, 29.5 * SS)]) - 1.8 * SS
    a_tri = np.clip(0.5 - d_tri, 0.0, 1.0)
    m_tri = np.clip(0.5 - (d_tri + 2.0 * SS), 0.0, 1.0)
    g_col = rgb("2B2338")[None, None, :] * (1.0 - m_tri[:, :, None]) + rgb("DCF2FA")[None, None, :] * m_tri[:, :, None]
    g_rgba = np.zeros((gs, gs, 4), dtype=np.uint8)
    g_rgba[:, :, :3] = np.clip(np.round(g_col), 0, 255).astype(np.uint8)
    g_rgba[:, :, 3] = np.clip(np.round(a_tri * 240.0), 0, 255).astype(np.uint8)
    Image.fromarray(g_rgba).resize((40, 40), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "ic_bond_go.png"), optimize=True)


def build_chest_mat():
    """744x140 扁平 2D 透视六角三宝箱红毯托盘（#2B2338 暖深描边 + 暖米金内嵌边 + 利落扁平赛璐珞箱影）。"""
    bw, bh = 372, 70
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)

    pad_x, top_y, bot_y, round_r, tip_dx = 10.0 * SS, 5.0 * SS, 61.0 * SS, 7.5 * SS, 15.5 * SS
    L, R = pad_x + round_r, (w - 1) - pad_x - round_r
    T, B = top_y + round_r, bot_y - round_r
    my = 0.5 * (T + B)
    verts = [(L + tip_dx, T), (R - tip_dx, T), (R, my), (R - tip_dx, B), (L + tip_dx, B), (L, my)]
    d = sdf_convex_poly(w, h, verts) - round_r
    d_lip = np.roll(d, int(2.6 * SS), axis=0)
    d_lip[:int(2.6 * SS), :] = 1e9
    d_u = np.minimum(d, d_lip)

    a_out = np.clip(0.5 - d_u, 0.0, 1.0)
    m_lip = np.clip(0.5 - (d_lip + 2.2 * SS), 0.0, 1.0)
    m_piping = np.clip(0.5 - (d + 2.4 * SS), 0.0, 1.0)
    m_surf = np.clip(0.5 - (d + 4.4 * SS), 0.0, 1.0)
    m_shadow_clip = np.clip(0.5 - (d + 5.0 * SS), 0.0, 1.0)

    c_surf = np.broadcast_to(rgb("B45252"), (h, w, 3)).copy()
    cx_mid = (w - 1) * 0.5
    cast_mask = np.zeros((h, w), dtype=np.float32)
    for k in (-1, 0, 1):
        bx = cx_mid + k * 114.0 * SS
        sy_top, sy_bot = 18.0 * SS, 52.5 * SS
        st = np.clip((y - sy_top) / (sy_bot - sy_top), 0.0, 1.0)
        scx = bx + (6.0 + 6.0 * st) * SS
        scy = 0.5 * (sy_top + sy_bot)
        half_w = (42.5 + 3.0 * st) * SS
        sh_r = 8.5 * SS
        sd = sdf_rrect(x, y, scx, scy, half_w, 0.5 * (sy_bot - sy_top), sh_r)
        cast_mask = np.maximum(cast_mask, np.clip(0.5 - sd / (1.2 * SS), 0.0, 1.0))

    cast_mask *= m_shadow_clip
    c_surf = blend(c_surf, rgb("823638")[None, None, :], cast_mask)

    col = np.broadcast_to(rgb("2B2338"), (h, w, 3)).copy()
    col = blend(col, rgb("783034")[None, None, :], m_lip)
    col = blend(col, rgb("2B2338")[None, None, :], np.clip(0.5 - d, 0.0, 1.0))
    col = blend(col, rgb("E8BEA4")[None, None, :], m_piping)
    col = blend(col, c_surf, m_surf)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_out * 255.0), 0, 255).astype(np.uint8)
    im = Image.fromarray(out).resize((bw * 2, bh * 2), Image.Resampling.LANCZOS)
    im.save(os.path.join(UI_DIR, "h_chest_mat.png"), optimize=True)
    print("Saved flat-2D h_chest_mat.png (744x140)")


def build_hex_start_button():
    """468x142 扁平 2D 鎏金六角主行动按钮 + 484x158 实心立体底沿 + fx_gold_sheen/star。"""
    bw, bh = 468, 142
    margin, tip_dx, round_r = 8, 30.0, 12.0
    w, h = bw * SS, bh * SS
    pad, stroke_w, rim_w = 2.2 * SS, 3.0 * SS, 8.5 * SS

    d_outer = hex_plaque_sdf(w, h, pad, pad, tip_dx * SS, round_r * SS)
    alpha = np.clip(0.5 - d_outer, 0.0, 1.0)
    d_frame = d_outer + stroke_w
    frame_mask = np.clip(0.5 - d_frame, 0.0, 1.0)
    d_inner = d_frame + rim_w
    inner_mask = np.clip(0.5 - d_inner, 0.0, 1.0)

    y_idx, x_idx = np.mgrid[0:h, 0:w].astype(np.float32)
    yn = y_idx / (h - 1)
    cel = np.clip((yn - 0.45) / 0.045, 0.0, 1.0)[:, :, None]

    rim_col = rgb("FFF4AA")[None, None, :] * (1.0 - cel) + rgb("F2BD38")[None, None, :] * cel
    in_col = rgb("FFE268")[None, None, :] * (1.0 - cel) + rgb("F4B224")[None, None, :] * cel

    # 顶沿内侧利落高光丝
    d_dn = np.roll(d_frame, int(round(2.4 * SS)), axis=0)
    d_dn[:int(round(2.4 * SS)), :] = 999.0
    top_hi = frame_mask * np.clip(d_dn + 0.5, 0.0, 1.0) * np.clip(1.0 - yn * 3.0, 0.0, 1.0)
    face_col = rim_col * (1.0 - inner_mask[:, :, None]) + in_col * inner_mask[:, :, None]
    groove = np.clip(1.0 - np.abs(d_inner) / (1.1 * SS), 0.0, 1.0)
    face_col = blend(face_col, rgb("C98412")[None, None, :], groove * 0.62)
    face_col = blend(face_col, rgb("FFFFFF")[None, None, :], top_hi * 0.82)

    c_stroke = rgb("2B2338")
    full_col = c_stroke[None, None, :] * (1.0 - frame_mask[:, :, None]) + face_col * frame_mask[:, :, None]
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.clip(np.round(full_col), 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    Image.fromarray(rgba).resize((bw, bh), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "h_start_hex.png"), optimize=True)

    # h_start_hex_lip.png (484x158)
    tw, th = bw + margin * 2, bh + margin * 2
    lw, lh = tw * SS, th * SS
    lpad = (margin + 2.2) * SS
    d_lip = hex_plaque_sdf(lw, lh, lpad, lpad, tip_dx * SS, round_r * SS)
    d_sh = np.roll(d_lip, int(2.4 * SS), axis=0)
    d_sh[:int(2.4 * SS), :] = 1e9
    l_alpha = np.clip(0.5 - d_lip, 0.0, 1.0)
    sh_a = np.clip(0.5 - d_sh, 0.0, 1.0) * 0.18
    tot_a = np.maximum(l_alpha, sh_a)
    l_body = np.clip(0.5 - (d_lip + stroke_w), 0.0, 1.0)
    l_col = np.zeros((lh, lw, 3), dtype=np.float32)
    l_col = blend(l_col, rgb("1E1A28")[None, None, :], sh_a)
    l_col = blend(l_col, c_stroke[None, None, :] * (1.0 - l_body[:, :, None]) + rgb("BD7810")[None, None, :] * l_body[:, :, None], l_alpha)
    l_rgba = np.zeros((lh, lw, 4), dtype=np.uint8)
    l_rgba[:, :, :3] = np.clip(np.round(l_col), 0, 255).astype(np.uint8)
    l_rgba[:, :, 3] = np.clip(np.round(tot_a * 255.0), 0, 255).astype(np.uint8)
    Image.fromarray(l_rgba).resize((tw, th), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "h_start_hex_lip.png"), optimize=True)

    # fx_gold_sheen.png (180x220) & fx_gold_star.png (128x128) for AttachStartGlint
    sw, sh = 180, 220
    sy, sx = np.mgrid[0:sh, 0:sw].astype(np.float32)
    su = (sx - sw * 0.5) + (sy - sh * 0.5) * 0.48
    sa = np.clip(np.clip(1.0 - np.abs(su) / 22.0, 0.0, 1.0) * 0.85 + np.clip(1.0 - np.abs(su - 32.0) / 8.0, 0.0, 1.0) * 0.45, 0.0, 1.0)
    s_out = np.zeros((sh, sw, 4), dtype=np.uint8)
    s_out[:, :, :3] = [255, 252, 232]
    s_out[:, :, 3] = np.clip(np.round(sa * 255.0), 0, 255).astype(np.uint8)
    Image.fromarray(s_out).save(os.path.join(UI_DIR, "fx_gold_sheen.png"), optimize=True)

    zn = 128 * 2
    zy, zx = np.mgrid[0:zn, 0:zn].astype(np.float32)
    zu, zv = np.abs(zx - (zn - 1) * 0.5) / (zn * 0.42), np.abs(zy - (zn - 1) * 0.5) / (zn * 0.42)
    z_star = np.clip(0.5 - ((zu ** 0.52 + zv ** 0.52) - 1.0) * 28.0, 0.0, 1.0)
    z_glow = np.exp(-((zu * zu + zv * zv) * 4.2)) * 0.45
    za = np.clip(z_star + z_glow, 0.0, 1.0)
    z_col = rgb("FFE882")[None, None, :] * (1.0 - z_star[:, :, None]) + 255.0 * z_star[:, :, None]
    z_out = np.zeros((zn, zn, 4), dtype=np.uint8)
    z_out[:, :, :3] = np.clip(np.round(z_col), 0, 255).astype(np.uint8)
    z_out[:, :, 3] = np.clip(np.round(za * 255.0), 0, 255).astype(np.uint8)
    Image.fromarray(z_out).resize((128, 128), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "fx_gold_star.png"), optimize=True)


def build_stage_arrow():
    bw, bh = 74, 84
    w, h = bw * SS, bh * SS
    round_r, stroke_w = 8.5 * SS, 2.6 * SS
    sink = int(round(4.4 * SS))
    verts_face = [(15.0 * SS, (bh * 0.5 - 2.5) * SS), (57.0 * SS, 14.0 * SS), (57.0 * SS, (bh - 19.0) * SS)]
    verts_lip = [(vx, vy + sink) for vx, vy in verts_face]

    d_face = sdf_convex_poly(w, h, verts_face) - round_r
    d_lip = sdf_convex_poly(w, h, verts_lip) - round_r
    d_u = np.minimum(d_face, d_lip)

    alpha = np.clip(0.5 - d_u, 0.0, 1.0)
    m_lip = np.clip(0.5 - (d_lip + stroke_w), 0.0, 1.0)
    m_face = np.clip(0.5 - (d_face + stroke_w), 0.0, 1.0)

    y_idx, _ = np.mgrid[0:h, 0:w].astype(np.float32)
    cel = np.clip((y_idx / (h - 1) - 0.48) / 0.06, 0.0, 1.0)[:, :, None]
    face_fill = rgb("F7F9FA")[None, None, :] * (1.0 - cel) + rgb("DCE4EC")[None, None, :] * cel

    col = np.broadcast_to(rgb("2B2338"), (h, w, 3)).copy()
    col = blend(col, rgb("8898A8")[None, None, :], m_lip)
    col = blend(col, rgb("2B2338")[None, None, :], np.clip(0.5 - d_face, 0.0, 1.0))
    col = blend(col, face_fill, m_face)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "h_stage_arrow.png"), optimize=True)


def build_quality_pads():
    """276x176 扁平 2D 五阶品质站位光盘 h_pad_0..4.png（#2B2338 内嵌边 + 利落二阶赛璐珞彩盘 + 几何星环）。"""
    bw, bh = 276, 176
    S2 = 3
    w, h = bw * S2, bh * S2
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    rx, ry = 96.0 * S2, 55.0 * S2
    ux, uy = (x - cx) / rx, (y - cy) / ry
    r = np.hypot(ux, uy)
    ang = np.arctan2(uy, ux)
    aa = 1.4 / rx

    tiers = [
        (0, "288E68", "56D6A6", "C8FCEC", 0),
        (1, "2474CC", "58B8FC", "D6F4FF", 1),
        (2, "6E38D0", "A86CFC", "F0DCFF", 2),
        (3, "CF7A0E", "FFC438", "FFF8C4", 3),
        (4, "BD2822", "FA5848", "FFE0D4", 3),
    ]

    for tid, h_top, h_bot, h_rim, plv in tiers:
        c_top, c_bot, c_rim = rgb(h_top), rgb(h_bot), rgb(h_rim)
        m_outer = np.clip((1.03 - r) / aa, 0.0, 1.0)
        m_pool = np.clip((0.97 - r) / aa, 0.0, 1.0)

        cel = np.clip((uy + 0.15) / 0.25, 0.0, 1.0)[:, :, None]
        pool_col = c_top[None, None, :] * (1.0 - cel) + c_bot[None, None, :] * cel

        ring1 = np.clip(1.0 - np.abs(r - 0.78) / 0.024, 0.0, 1.0) * 0.65
        insig = ring1.copy()
        if plv == 2:
            pips = (np.abs(np.cos(2.0 * ang)) ** 18.0) * np.clip(1.0 - np.abs(r - 0.86) / 0.055, 0.0, 1.0) * 0.82
            insig = np.maximum(insig, pips)
        elif plv >= 3:
            ring2 = np.clip(1.0 - np.abs(r - 0.87) / 0.018, 0.0, 1.0) * 0.58
            ticks = (np.abs(np.cos(4.0 * ang)) ** 22.0) * np.clip(1.0 - np.abs(r - 0.825) / 0.052, 0.0, 1.0) * 0.88
            insig = np.maximum(insig, np.maximum(ring2, ticks))

        rim_ring = np.clip(1.0 - np.abs(r - 0.945) / 0.026, 0.0, 1.0) * 0.85
        hi_m = np.clip(insig + rim_ring, 0.0, 1.0) * m_pool
        pool_col = blend(pool_col, c_rim[None, None, :], hi_m)

        col = blend(np.broadcast_to(rgb("2B2338"), (h, w, 3)).copy(), pool_col, m_pool)
        out = np.zeros((h, w, 4), dtype=np.uint8)
        out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
        out[:, :, 3] = np.clip(np.round(m_outer * 238.0), 0, 255).astype(np.uint8)
        Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, f"h_pad_{tid}.png"), optimize=True)
    print("Saved flat-2D h_pad_0..4.png")


# ==================== 2. 29 张独立 UI 皮肤全量扁平 2D 矢量重制 ====================

def save_ui(name: str, im: Image.Image):
    im.save(os.path.join(UI_DIR, name), optimize=True)
    print(f"wrote standalone flat-2D {name:22s} {im.size[0]}x{im.size[1]}")


def flat_pill_box(bw: int, bh: int, r: float, pad: float, c_fill_top: str, c_fill_bot: str, c_rim: str, c_lip: str = None, alpha_mul: float = 1.0) -> Image.Image:
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - (1.4 * SS if c_lip else 0.0)
    hw, hh = (bw * 0.5 - pad) * SS, (bh * 0.5 - pad - (1.4 if c_lip else 0.0)) * SS
    d_face = sdf_rrect(x, y, cx, cy, hw, hh, r * SS)
    d_u = np.minimum(d_face, sdf_rrect(x, y - 2.8 * SS, cx, cy, hw, hh, r * SS)) if c_lip else d_face
    a = np.clip(0.5 - d_u, 0.0, 1.0) * alpha_mul
    st = 2.4 * SS

    col = np.broadcast_to(rgb("2B2338"), (h, w, 3)).copy()
    if c_lip:
        col = blend(col, rgb(c_lip)[None, None, :], np.clip(0.5 - (sdf_rrect(x, y - 2.8 * SS, cx, cy, hw, hh, r * SS) + st), 0.0, 1.0))
        col = blend(col, rgb("2B2338")[None, None, :], np.clip(0.5 - d_face, 0.0, 1.0))
    col = blend(col, rgb(c_rim)[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))
    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    cel = np.clip((yn - 0.45) / 0.08, 0.0, 1.0)[:, :, None]
    fill = rgb(c_fill_top)[None, None, :] * (1.0 - cel) + rgb(c_fill_bot)[None, None, :] * cel
    col = blend(col, fill, np.clip(0.5 - (d_face + 4.4 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def flat_circle_badge(bw: int, bh: int, c_top: str, c_bot: str, c_rim: str, c_lip: str) -> Image.Image:
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 2.0 * SS
    R = (min(bw, bh) * 0.5 - 4.0) * SS
    d_face = np.hypot(x - cx, y - cy) - R
    d_lip = np.hypot(x - cx, y - (cy + 3.6 * SS)) - R
    d_u = np.minimum(d_face, d_lip)
    a = np.clip(0.5 - d_u, 0.0, 1.0)
    st = 2.6 * SS

    col = np.broadcast_to(rgb("2B2338"), (h, w, 3)).copy()
    col = blend(col, rgb(c_lip)[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, rgb("2B2338")[None, None, :], np.clip(0.5 - d_face, 0.0, 1.0))
    col = blend(col, rgb(c_rim)[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))
    yn = np.clip((y - (cy - R)) / (2.0 * R), 0.0, 1.0)
    cel = np.clip((yn - 0.46) / 0.06, 0.0, 1.0)[:, :, None]
    fill = rgb(c_top)[None, None, :] * (1.0 - cel) + rgb(c_bot)[None, None, :] * cel
    col = blend(col, fill, np.clip(0.5 - (d_face + 5.2 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def build_all_standalone_ui():
    # 1. h_capsule (216x56), pill (240x54), plate (396x45), h_plaque (260x88), h_tile (168x124)
    save_ui("h_capsule.png", flat_pill_box(216, 56, 25.0, 2.0, "2B4862", "1F364C", "7EB0D2", None, 0.94))
    save_ui("pill.png", flat_pill_box(240, 54, 24.0, 2.0, "28435C", "1C3246", "6EA2C6", None, 0.95))
    save_ui("plate.png", flat_pill_box(396, 45, 19.5, 2.0, "58B4F0", "3A8ED0", "BCE8FF", None, 0.98))
    save_ui("h_plaque.png", flat_pill_box(260, 88, 22.0, 3.0, "31526E", "223C54", "86B8DA", "182B3E"))
    save_ui("h_tile.png", flat_pill_box(168, 124, 22.0, 3.0, "2C4B66", "1F374E", "7AAED0", "16283A"))

    # 2. h_round (108x108), lv (130x135), medal (156x160), dot (44x44)
    save_ui("h_round.png", flat_circle_badge(108, 108, "2E4E6A", "20384E", "8AC0E2", "162838"))
    save_ui("lv.png", flat_circle_badge(130, 135, "5AC0FA", "3490DC", "DCF6FF", "1E64A8"))
    save_ui("medal.png", flat_circle_badge(156, 160, "CBE6FA", "9CC4E4", "FFFFFF", "6E98BC"))

    # dot.png (44x44) 扁平 2D 珊瑚红提醒圆点 + 左上小白高光点
    dw = dh = 44 * SS
    dy, dx = np.mgrid[0:dh, 0:dw].astype(np.float32)
    dcx, dcy = (dw - 1) * 0.5, (dh - 1) * 0.5
    dd = np.hypot(dx - dcx, dy - dcy) - 18.5 * SS
    da = np.clip(0.5 - dd, 0.0, 1.0)
    dcol = np.broadcast_to(rgb("2B2338"), (dh, dw, 3)).copy()
    dcol = blend(dcol, rgb("FF5248")[None, None, :], np.clip(0.5 - (dd + 2.8 * SS), 0.0, 1.0))
    dcol = blend(dcol, rgb("FFFFFF")[None, None, :], np.clip(0.5 - (np.hypot(dx - (dcx - 6 * SS), dy - (dcy - 6 * SS)) - 3.6 * SS), 0.0, 1.0))
    dout = np.zeros((dh, dw, 4), dtype=np.uint8)
    dout[:, :, :3] = np.clip(np.round(dcol), 0, 255).astype(np.uint8)
    dout[:, :, 3] = np.clip(np.round(da * 255.0), 0, 255).astype(np.uint8)
    save_ui("dot.png", Image.fromarray(dout).resize((44, 44), Image.Resampling.LANCZOS))

    # 3. h_avatar.png (124x124) 扁平 2D 香槟金+深靛头像框
    aw = ah = 124 * SS
    ay, ax = np.mgrid[0:ah, 0:aw].astype(np.float32)
    acx, acy = (aw - 1) * 0.5, (ah - 1) * 0.5 - 1.5 * SS
    ad_f = sdf_rrect(ax, ay, acx, acy, 56 * SS, 56 * SS, 20 * SS)
    ad_l = sdf_rrect(ax, ay - 3.0 * SS, acx, acy, 56 * SS, 56 * SS, 20 * SS)
    ad_u = np.minimum(ad_f, ad_l)
    acol = np.broadcast_to(rgb("2B2338"), (ah, aw, 3)).copy()
    acol = blend(acol, rgb("B47A18")[None, None, :], np.clip(0.5 - (ad_l + 2.8 * SS), 0.0, 1.0))
    acol = blend(acol, rgb("2B2338")[None, None, :], np.clip(0.5 - ad_f, 0.0, 1.0))
    acol = blend(acol, rgb("FFE27A")[None, None, :], np.clip(0.5 - (ad_f + 2.8 * SS), 0.0, 1.0))
    acol = blend(acol, rgb("2B2338")[None, None, :], np.clip(0.5 - (ad_f + 7.2 * SS), 0.0, 1.0))
    acol = blend(acol, rgb("223C54")[None, None, :], np.clip(0.5 - (ad_f + 9.4 * SS), 0.0, 1.0))
    aout = np.zeros((ah, aw, 4), dtype=np.uint8)
    aout[:, :, :3] = np.clip(np.round(acol), 0, 255).astype(np.uint8)
    aout[:, :, 3] = np.clip(np.round(np.clip(0.5 - ad_u, 0.0, 1.0) * 255.0), 0, 255).astype(np.uint8)
    save_ui("h_avatar.png", Image.fromarray(aout).resize((124, 124), Image.Resampling.LANCZOS))

    # 4. hex.png (220x253) — 精准贴合 Art.HexInnerTex (cx=109.2, cy=127.0, hw=96.4, hh=113.4, rad=21.0)
    hw_i, hh_i = 220, 253
    W, H = hw_i * SS, hh_i * SS
    cx, cy = 109.2 * SS, (253.0 - 127.0) * SS
    verts_o = [
        (cx, cy - 120.0 * SS),
        (cx + 104.0 * SS, cy - 60.0 * SS),
        (cx + 104.0 * SS, cy + 60.0 * SS),
        (cx, cy + 120.0 * SS),
        (cx - 104.0 * SS, cy + 60.0 * SS),
        (cx - 104.0 * SS, cy - 60.0 * SS),
    ]
    d_hex = sdf_convex_poly(W, H, verts_o) - 18.0 * SS
    a_hex = np.clip(0.5 - d_hex, 0.0, 1.0)
    m_gold = np.clip(0.5 - (d_hex + 3.0 * SS), 0.0, 1.0)
    m_in_ink = np.clip(0.5 - (d_hex + 11.5 * SS), 0.0, 1.0)
    m_core = np.clip(0.5 - (d_hex + 14.2 * SS), 0.0, 1.0)
    hy, _ = np.mgrid[0:H, 0:W].astype(np.float32)
    hcel = np.clip((hy / (H - 1) - 0.46) / 0.06, 0.0, 1.0)[:, :, None]
    gfill = rgb("FFE67C")[None, None, :] * (1.0 - hcel) + rgb("EAA624")[None, None, :] * hcel
    hcol = np.broadcast_to(rgb("2B2338"), (H, W, 3)).copy()
    hcol = blend(hcol, gfill, m_gold)
    hcol = blend(hcol, rgb("2B2338")[None, None, :], m_in_ink)
    hcol = blend(hcol, rgb("9EC4E2")[None, None, :], m_core)
    hout = np.zeros((H, W, 4), dtype=np.uint8)
    hout[:, :, :3] = np.clip(np.round(hcol), 0, 255).astype(np.uint8)
    hout[:, :, 3] = np.clip(np.round(a_hex * 255.0), 0, 255).astype(np.uint8)
    save_ui("hex.png", Image.fromarray(hout).resize((hw_i, hh_i), Image.Resampling.LANCZOS))

    # 5. h_tab_on.png (227x230) 现代扁平 2D 鎏金青蓝盾章（零古风卷云！）
    tw, th = 227, 230
    W, H = tw * SS, th * SS
    sh_pts = [
        (W * 0.50, 12 * SS),
        (W * 0.88, 34 * SS),
        (W * 0.90, 118 * SS),
        (W * 0.50, 218 * SS),
        (W * 0.10, 118 * SS),
        (W * 0.12, 34 * SS),
    ]
    d_sh = sdf_convex_poly(W, H, sh_pts) - 14.0 * SS
    a_sh = np.clip(0.5 - d_sh, 0.0, 1.0)
    m_rim = np.clip(0.5 - (d_sh + 3.2 * SS), 0.0, 1.0)
    m_ink2 = np.clip(0.5 - (d_sh + 11.5 * SS), 0.0, 1.0)
    m_in = np.clip(0.5 - (d_sh + 14.2 * SS), 0.0, 1.0)
    sy, sx = np.mgrid[0:H, 0:W].astype(np.float32)
    scel = np.clip((sy / (H - 1) - 0.45) / 0.07, 0.0, 1.0)[:, :, None]
    s_gold = rgb("FFE882")[None, None, :] * (1.0 - scel) + rgb("EAA624")[None, None, :] * scel
    s_cyan = rgb("58D4F6")[None, None, :] * (1.0 - scel) + rgb("2A98CC")[None, None, :] * scel
    scol = np.broadcast_to(rgb("2B2338"), (H, W, 3)).copy()
    scol = blend(scol, s_gold, m_rim)
    scol = blend(scol, rgb("2B2338")[None, None, :], m_ink2)
    scol = blend(scol, s_cyan, m_in)
    # 顶冠精致扁平小菱钻
    dia = (np.abs(sx - W * 0.5) / (14 * SS) + np.abs(sy - 24 * SS) / (10 * SS)) - 1.0
    scol = blend(scol, rgb("2B2338")[None, None, :], np.clip(0.5 - (dia - 0.22) * 12 * SS, 0.0, 1.0))
    scol = blend(scol, rgb("FFF8CE")[None, None, :], np.clip(0.5 - dia * 12 * SS, 0.0, 1.0))
    sout = np.zeros((H, W, 4), dtype=np.uint8)
    sout[:, :, :3] = np.clip(np.round(scol), 0, 255).astype(np.uint8)
    sout[:, :, 3] = np.clip(np.round(a_sh * 255.0), 0, 255).astype(np.uint8)
    save_ui("h_tab_on.png", Image.fromarray(sout).resize((tw, th), Image.Resampling.LANCZOS))

    # 6. tabbar.png (950x133) & h_tabbar.png (512x176)
    for nm, bw, bh in [("tabbar.png", 950, 133), ("h_tabbar.png", 512, 176)]:
        im = Image.new("RGBA", (bw, bh), (36, 62, 86, 255))
        dr = ImageDraw.Draw(im)
        dr.rectangle([0, 0, bw, 4], fill=rgba_t("2B2338"))
        dr.rectangle([0, 4, bw, 9], fill=rgba_t("7EB0D2"))
        save_ui(nm, im)

    # 7. arrow.png (144x146), h_arrow.png (211x215), btn_arrow.png (381x583), btn_start.png (1263x256)
    for nm, bw, bh, ct, cb, cl in [("arrow.png", 144, 146, "66C4FA", "3A94DC", "2064A6"), ("h_arrow.png", 211, 215, "58DFCF", "2BB4A6", "187A72")]:
        im = flat_circle_badge(bw, bh, ct, cb, "E8FAFF", cl)
        W, H = bw * 2, bh * 2
        im2 = im.resize((W, H), Image.Resampling.LANCZOS)
        dr = ImageDraw.Draw(im2)
        cx, cy = W * 0.5, H * 0.49
        s = min(bw, bh) / 144.0 * 2.0
        pts = [(cx - 26 * s, cy), (cx + 12 * s, cy - 26 * s), (cx + 12 * s, cy - 10 * s), (cx + 28 * s, cy - 10 * s), (cx + 28 * s, cy + 10 * s), (cx + 12 * s, cy + 10 * s), (cx + 12 * s, cy + 26 * s)]
        dr.polygon(pts, fill=rgba_t("FFFFFF"), outline=rgba_t("2B2338"), width=max(2, int(2.6 * s)))
        save_ui(nm, im2.resize((bw, bh), Image.Resampling.LANCZOS))

    # btn_arrow.png (381x583)
    bw, bh = 381, 583
    im = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    pts = [(68, bh // 2), (bw - 86, 56), (bw - 42, 108), (168, bh // 2), (bw - 42, bh - 108), (bw - 86, bh - 56)]
    dr.polygon([(x, y + 12) for x, y in pts], fill=rgba_t("BA7612"), outline=rgba_t("2B2338"), width=8)
    dr.polygon(pts, fill=rgba_t("FFD44E"), outline=rgba_t("2B2338"), width=8)
    save_ui("btn_arrow.png", im)

    # btn_start.png (1263x256)
    im = Image.new("RGBA", (1263, 256), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    dr.rounded_rectangle([12, 22, 1251, 244], radius=56, fill=rgba_t("BA7612"), outline=rgba_t("2B2338"), width=7)
    dr.rounded_rectangle([12, 10, 1251, 228], radius=56, fill=rgba_t("FFD44E"), outline=rgba_t("2B2338"), width=7)
    dr.rounded_rectangle([28, 22, 1235, 112], radius=40, fill=(255, 248, 200, 110))
    save_ui("btn_start.png", im)

    # 8. h_ribbon.png (303x100), plaque.png (753x160), banner_gold.png (760x231) — 扁平 2D 几何燕尾牌匾（零古风卷云）
    def flat_swallowtail_plaque(bw: int, bh: int, pad_x: int, c_top: str, c_bot: str, c_rim: str, c_tail: str) -> Image.Image:
        S2 = 2
        W, H = bw * S2, bh * S2
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(im)
        ink = rgba_t("2B2338")
        # 左右燕尾
        ty0, ty1 = int(H * 0.24), int(H * 0.88)
        tmy = (ty0 + ty1) // 2
        dr.polygon([(8 * S2, ty0), (pad_x * S2 + 20 * S2, ty0), (pad_x * S2 + 20 * S2, ty1), (8 * S2, ty1), (28 * S2, tmy)], fill=rgba_t(c_tail), outline=ink, width=int(2.8 * S2))
        dr.polygon([(W - pad_x * S2 - 20 * S2, ty0), (W - 8 * S2, ty0), (W - 28 * S2, tmy), (W - 8 * S2, ty1), (W - pad_x * S2 - 20 * S2, ty1)], fill=rgba_t(c_tail), outline=ink, width=int(2.8 * S2))
        # 主体圆角牌匾
        mx0, mx1 = int(pad_x * 0.55 * S2), W - int(pad_x * 0.55 * S2)
        my0, my1 = int(H * 0.12), int(H * 0.82)
        dr.rounded_rectangle([mx0, my0 + 5 * S2, mx1, my1 + 5 * S2], radius=int(14 * S2), fill=rgba_t(c_tail), outline=ink, width=int(2.8 * S2))
        dr.rounded_rectangle([mx0, my0, mx1, my1], radius=int(14 * S2), fill=rgba_t(c_rim), outline=ink, width=int(2.8 * S2))
        dr.rounded_rectangle([mx0 + 5 * S2, my0 + 5 * S2, mx1 - 5 * S2, my1 - 5 * S2], radius=int(10 * S2), fill=rgba_t(c_bot))
        dr.rounded_rectangle([mx0 + 5 * S2, my0 + 5 * S2, mx1 - 5 * S2, (my0 + my1) // 2], radius=int(10 * S2), fill=rgba_t(c_top))
        return im.resize((bw, bh), Image.Resampling.LANCZOS)

    save_ui("h_ribbon.png", flat_swallowtail_plaque(303, 100, 64, "5AB0D8", "3B8BB4", "C8EEFF", "29688A"))
    save_ui("plaque.png", flat_swallowtail_plaque(753, 160, 140, "66B4DC", "4892BC", "D8F2FF", "326E92"))
    save_ui("banner_gold.png", flat_swallowtail_plaque(760, 231, 110, "FFE06B", "F2AE2C", "FFF8C8", "C88218"))

    # 9. h_pedestal.png (234x170) 扁平 2D 村口石台圆盘
    pw, ph = 234, 170
    W, H = pw * 2, ph * 2
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    dr.ellipse([14, 28, W - 14, H - 12], fill=rgba_t("6E7C8A"), outline=rgba_t("2B2338"), width=6)
    dr.ellipse([14, 14, W - 14, H - 26], fill=rgba_t("DCE4EC"), outline=rgba_t("2B2338"), width=6)
    dr.ellipse([34, 28, W - 34, H - 40], fill=rgba_t("B6C2CE"), outline=rgba_t("8C9AA8"), width=4)
    save_ui("h_pedestal.png", im.resize((pw, ph), Image.Resampling.LANCZOS))

    # 10. flame_bar.png (560x324, 9-slice 60,60,230,130) 扁平 2D 庆典火苗横条
    fw, fh = 560, 324
    im = Image.new("RGBA", (fw * 2, fh * 2), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    ink = rgba_t("2B2338")
    # 右侧扁平 2D 卡通双色火焰簇（落在右 230px 九宫格区）
    flames_outer = [(820, 190), (920, 70), (950, 160), (1040, 48), (1085, 195), (1095, 360), (990, 520), (820, 520)]
    flames_inner = [(850, 230), (930, 140), (960, 210), (1025, 125), (1055, 240), (1055, 360), (970, 480), (850, 480)]
    dr.polygon(flames_outer, fill=rgba_t("FF6428"), outline=ink, width=6)
    dr.polygon(flames_inner, fill=rgba_t("FFD23C"))
    dr.rounded_rectangle([24, 178, 996, 536], radius=56, fill=rgba_t("B83214"), outline=ink, width=6)
    dr.rounded_rectangle([24, 164, 996, 520], radius=56, fill=rgba_t("FA6E24"), outline=ink, width=6)
    dr.rounded_rectangle([40, 180, 980, 320], radius=42, fill=(255, 214, 120, 96))
    save_ui("flame_bar.png", im.resize((fw, fh), Image.Resampling.LANCZOS))

    # 11. hint_tail.png (542x452), tag.png (154x107), tag_intel.png (701x462)
    im = Image.new("RGBA", (542, 452), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    dr.polygon([(271, 26), (510, 428), (32, 428)], fill=rgba_t("213E58"), outline=rgba_t("2B2338"), width=8)
    save_ui("hint_tail.png", im)

    for nm, bw, bh, c_main, c_hi, c_lip in [
        ("tag.png", 154, 107, "38C268", "84F2A8", "1E8640"),
        ("tag_intel.png", 701, 462, "E2463A", "FF9286", "9E241E"),
    ]:
        S2 = 2
        W, H = bw * S2, bh * S2
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(im)
        pts = [(12 * S2, 14 * S2), (W - 14 * S2, 14 * S2), (W - int(bw * 0.18 * S2), H // 2), (W - 14 * S2, H - 18 * S2), (12 * S2, H - 18 * S2)]
        lw = max(3, int(min(bw, bh) * 0.028 * S2))
        dr.polygon([(x, y + lw) for x, y in pts], fill=rgba_t(c_lip), outline=rgba_t("2B2338"), width=lw)
        dr.polygon(pts, fill=rgba_t(c_main), outline=rgba_t("2B2338"), width=lw)
        dr.rectangle([12 * S2, 10 * S2, 24 * S2, H - 14 * S2], fill=rgba_t("FFE27A"), outline=rgba_t("2B2338"), width=lw)
        save_ui(nm, im.resize((bw, bh), Image.Resampling.LANCZOS))

    # 12. rank_badge_1..4.png (264x84, 9-slice 76,0,76,0) 扁平 2D 几何翼钻段位铭牌（零古风盘龙）
    rb_themes = [
        ("rank_badge_1.png", "FFE478", "DE3832", "FF6E62", "FF4236"),
        ("rank_badge_2.png", "F0D4FF", "7E42D4", "B880FF", "C66EFF"),
        ("rank_badge_3.png", "DCF2FF", "3488D4", "72C4FA", "42B6FF"),
        ("rank_badge_4.png", "FFE898", "2EA25A", "66DC8E", "46DC78"),
    ]
    for nm, c_rim, c_bot, c_top, c_gem in rb_themes:
        bw, bh = 264, 84
        W, H = bw * 3, bh * 3
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(im)
        ink = rgba_t("2B2338")
        # 左右扁平双翼（严格在左右 76px 九宫格端区内）
        for sgn in (-1, 1):
            cx_e = (46 if sgn < 0 else bw - 46) * 3
            dr.polygon([(cx_e, 24 * 3), (cx_e + sgn * 36 * 3, 14 * 3), (cx_e + sgn * 28 * 3, 42 * 3), (cx_e + sgn * 34 * 3, 68 * 3), (cx_e, 60 * 3)], fill=rgba_t(c_rim), outline=ink, width=7)
        # 中央八角圆润横牌
        dr.rounded_rectangle([38 * 3, 16 * 3, (bw - 38) * 3, (bh - 14) * 3], radius=24, fill=rgba_t(c_rim), outline=ink, width=8)
        dr.rounded_rectangle([44 * 3, 22 * 3, (bw - 44) * 3, (bh - 20) * 3], radius=18, fill=rgba_t(c_bot), outline=ink, width=6)
        dr.rounded_rectangle([46 * 3, 24 * 3, (bw - 46) * 3, 42 * 3], radius=12, fill=rgba_t(c_top))
        for gx in (38 * 3, (bw - 38) * 3):
            gy = 42 * 3
            dr.polygon([(gx, gy - 21), (gx + 21, gy), (gx, gy + 21), (gx - 21, gy)], fill=ink)
            dr.polygon([(gx, gy - 14), (gx + 14, gy), (gx, gy + 14), (gx - 14, gy)], fill=rgba_t(c_gem))
        save_ui(nm, im.resize((bw, bh), Image.Resampling.LANCZOS))

    # 13. rank_av_gold.png & rank_av_azure.png (220x220) 扁平 2D 荣耀翼冠头像框（零古风刀剑祥云！）
    for nm, c_main, c_hi, c_gem in [
        ("rank_av_gold.png", "FFC83C", "FFF6BE", "FF4E3E"),
        ("rank_av_azure.png", "6EC2F6", "EEFAFF", "38A8FF"),
    ]:
        bw = bh = 220
        S3 = 3
        W = H = bw * S3
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(im)
        ink = rgba_t("2B2338")
        # 左右扁平荣耀双翼
        for sgn in (-1, 1):
            bx = W // 2 + sgn * 72 * S3
            for dy_w, ext, w_h in [(-32, 34, 20), (0, 38, 20), (32, 30, 18)]:
                by = H // 2 + dy_w * S3
                pts = [(bx, by - w_h * S3 // 2), (bx + sgn * ext * S3, by - (w_h - 4) * S3 // 2), (bx + sgn * (ext - 8) * S3, by + w_h * S3 // 2), (bx, by + w_h * S3 // 2)]
                dr.polygon(pts, fill=rgba_t(c_main), outline=ink, width=7)
        # 外框圆角方环 + 中央镂空透明区（供头像完美露出）
        y, x = np.mgrid[0:H, 0:W].astype(np.float32)
        cx = cy = (W - 1) * 0.5
        d_out = sdf_rrect(x, y, cx, cy, 78 * S3, 78 * S3, 24 * S3)
        d_hole = sdf_rrect(x, y, cx, cy, 62 * S3, 62 * S3, 14 * S3)
        ring_d = np.maximum(d_out, -d_hole)

        arr = np.array(im, dtype=np.float32)
        a_ring = np.clip(0.5 - ring_d, 0.0, 1.0)
        m_ring_fill = np.clip(0.5 - (ring_d + 2.8 * S3), 0.0, 1.0)
        cel = np.clip((y / (H - 1) - 0.45) / 0.08, 0.0, 1.0)[:, :, None]
        rfill = rgb(c_hi)[None, None, :] * (1.0 - cel) + rgb(c_main)[None, None, :] * cel
        rcol = rgb("2B2338")[None, None, :] * (1.0 - m_ring_fill[:, :, None]) + rfill * m_ring_fill[:, :, None]

        # Alpha-over onto wing base, punching out inner hole cleanly
        hole_keep = np.clip(0.5 + d_hole, 0.0, 1.0)
        arr[:, :, 3] *= hole_keep
        sa = a_ring[:, :, None]
        da = (arr[:, :, 3:4] / 255.0)
        na = sa + da * (1.0 - sa)
        arr[:, :, :3] = np.where(na > 1e-5, (rcol * sa + arr[:, :, :3] * da * (1.0 - sa)) / np.maximum(na, 1e-5), 0.0)
        arr[:, :, 3:4] = na * 255.0
        im = Image.fromarray(np.clip(np.round(arr), 0, 255).astype(np.uint8))

        # 顶冠扁平星钻徽章
        dr = ImageDraw.Draw(im)
        tcx, tcy = W // 2, 26 * S3
        dr.polygon([(tcx - 24 * S3, tcy + 6 * S3), (tcx - 10 * S3, tcy - 10 * S3), (tcx, tcy - 16 * S3), (tcx + 10 * S3, tcy - 10 * S3), (tcx + 24 * S3, tcy + 6 * S3), (tcx, tcy + 14 * S3)], fill=rgba_t(c_hi), outline=ink, width=7)
        dr.polygon([(tcx, tcy - 8 * S3), (tcx + 9 * S3, tcy + 1 * S3), (tcx, tcy + 9 * S3), (tcx - 9 * S3, tcy + 1 * S3)], fill=rgba_t(c_gem), outline=ink, width=5)
        save_ui(nm, im.resize((bw, bh), Image.Resampling.LANCZOS))


if __name__ == "__main__":
    os.makedirs(UI_DIR, exist_ok=True)
    build_podium4()
    build_podium_crest_suite()
    build_chest_mat()
    build_hex_start_button()
    build_stage_arrow()
    build_quality_pads()
    build_all_standalone_ui()
    print("Completed full flat-2D Home v6 & standalone UI suite!")
