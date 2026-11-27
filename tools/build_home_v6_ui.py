"""构建《村口大战外星人》主页 04 风格（45° 切角深黑曜石 #0C1326 战术装甲 + 霓虹翠绿/赛博青/鎏金双线框）舞台与独立 UI 套件。

严格保持全部 49 张 Assets/Resources/Art/ui/*.png 的原始像素尺寸与 Art.SkinBorder 九宫格：
1. 主页舞台套件：h_podium4, h_pad_0..4, h_chest_mat, h_start_hex{,_lip}, h_stage_arrow, fx_gold_sheen, fx_gold_star,
   h_podium_crest, h_bond_pill{,_lip}, ic_bond_knot, ic_bond_go
2. 独立 UI 套件：tabbar, h_tabbar, h_tile, h_round, h_avatar, h_capsule, h_ribbon, h_plaque, h_pedestal, h_tab_on,
   h_arrow, arrow, btn_arrow, btn_start, dot, flame_bar, plaque, plate, banner_gold, lv, medal, pill, hex,
   hint_tail, tag, tag_intel, rank_badge_1..4, rank_av_azure, rank_av_gold
"""
import os
import math
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UI_DIR = os.path.join(ROOT, "Assets/Resources/Art/ui")
SS = 4


def rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def rgba_t(h: str, a: int = 255) -> tuple:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def blend(dst: np.ndarray, col: np.ndarray, mask: np.ndarray) -> np.ndarray:
    m = np.clip(mask, 0.0, 1.0)[:, :, None]
    return dst * (1.0 - m) + col * m


def sdf_segment(x: np.ndarray, y: np.ndarray, ax: float, ay: float, bx: float, by: float) -> np.ndarray:
    vx, vy = bx - ax, by - ay
    l2 = vx * vx + vy * vy + 1e-6
    t = np.clip(((x - ax) * vx + (y - ay) * vy) / l2, 0.0, 1.0)
    return np.hypot(x - (ax + t * vx), y - (ay + t * vy))


def sdf_oct_box(x: np.ndarray, y: np.ndarray, cx: float, cy: float, hw: float, hh: float, ch: float, r_tiny: float = 0.0) -> np.ndarray:
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


# ==================== 1. 主页 04 四连位黑曜石青钢防御桥台 h_podium4.png ====================

def build_podium4():
    """760x240 04 风格四连位黑曜石青钢切角点将台（严格对齐 style04_page_home.png 与 HomeScreen 4 槽坐标）。"""
    bw, bh = 760, 240
    S = 3
    W, H = bw * S, bh * S
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)

    ink = rgba_t("040710")
    top_rim = rgba_t("285272")
    top_slab = rgba_t("0D182C")
    groove_c = rgba_t("00E5FF", 150)
    front_lip = rgba_t("182D4A")
    wall_face = rgba_t("0E192E")
    wall_side = rgba_t("091020")
    base_trim = rgba_t("162642")
    clasp_face = rgba_t("0A1224")
    clasp_hi = rgba_t("FFB800")

    bays = [
        (36, 200, 14, 198),
        (206, 376, 199, 377),
        (384, 554, 383, 561),
        (560, 724, 562, 746),
    ]

    # 1) 底部硬朗接触暗影
    sh_pts = [(10 * S, 214 * S), (750 * S, 214 * S), (754 * S, 234 * S), (6 * S, 234 * S)]
    dr.polygon(sh_pts, fill=(2, 5, 12, 145))

    # 2) 前壁黑曜石桥墩与底座护脚
    for tx0, tx1, bx0, bx1 in bays:
        y_mid = 132 * S
        y_bot = 224 * S
        ch = 14 * S
        wall_poly = [
            (bx0 * S, y_mid),
            (bx1 * S, y_mid),
            (bx1 * S, y_bot - ch),
            (bx1 * S - ch, y_bot),
            (bx0 * S + ch, y_bot),
            (bx0 * S, y_bot - ch),
        ]
        dr.polygon(wall_poly, fill=wall_face, outline=ink, width=int(3.0 * S))
        dr.polygon([(bx0 * S + 3 * S, y_mid), (bx0 * S + 24 * S, y_mid), (bx0 * S + 24 * S, y_bot - 3 * S), (bx0 * S + ch, y_bot - 3 * S), (bx0 * S + 3 * S, y_bot - ch)], fill=wall_side)
        dr.polygon([(bx1 * S - 24 * S, y_mid), (bx1 * S - 3 * S, y_mid), (bx1 * S - 3 * S, y_bot - ch), (bx1 * S - ch, y_bot - 3 * S), (bx1 * S - 24 * S, y_bot - 3 * S)], fill=wall_side)

        # 前壁竖向青绿能量刻槽
        mcx = 0.5 * (bx0 + bx1) * S
        for ox in (-36 * S, 36 * S):
            dr.line([(mcx + ox, y_mid + 18 * S), (mcx + ox, y_bot - 22 * S)], fill=rgba_t("1E3D5E"), width=int(2.4 * S))

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

    # 3) 顶面透视黑曜石盖板 + 霓虹导流槽 + 前沿鎏金战术卡扣
    for tx0, tx1, bx0, bx1 in bays:
        yt, yb = 14 * S, 128 * S
        lip_b = 150 * S
        ct = 14 * S
        cb = 16 * S

        eave_poly = [
            (bx0 * S, yb - cb),
            (bx1 * S, yb - cb),
            (bx1 * S, lip_b - cb),
            (bx1 * S - cb, lip_b),
            (bx0 * S + cb, lip_b),
            (bx0 * S, lip_b - cb),
        ]
        dr.polygon(eave_poly, fill=front_lip, outline=ink, width=int(3.0 * S))

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
        # 前沿翠绿/冰青细高光棱
        dr.line([(bx0 * S + cb, yb - 2 * S), (bx1 * S - cb, yb - 2 * S)], fill=rgba_t("00F57A", 190), width=int(2.2 * S))

        pad_in = 13 * S
        in_poly = [
            (tx0 * S + pad_in + 7 * S, yt + pad_in),
            (tx1 * S - pad_in - 7 * S, yt + pad_in),
            (tx1 * S - pad_in, yt + pad_in + 7 * S),
            (bx1 * S - pad_in, yb - pad_in - 7 * S),
            (bx1 * S - pad_in - 7 * S, yb - pad_in),
            (bx0 * S + pad_in + 7 * S, yb - pad_in),
            (bx0 * S + pad_in, yb - pad_in - 7 * S),
            (tx0 * S + pad_in, yt + pad_in + 7 * S),
        ]
        dr.polygon(in_poly, fill=top_slab, outline=groove_c, width=int(2.2 * S))

        mcx = 0.5 * (bx0 + bx1) * S
        tw, th_t = 32 * S, 12 * S
        ty0 = yb - 5 * S
        clasp_pts = [
            (mcx - tw + 6 * S, ty0),
            (mcx + tw - 6 * S, ty0),
            (mcx + tw, ty0 + 6 * S),
            (mcx + tw, ty0 + th_t * 2 - 6 * S),
            (mcx + tw - 6 * S, ty0 + th_t * 2),
            (mcx - tw + 6 * S, ty0 + th_t * 2),
            (mcx - tw, ty0 + th_t * 2 - 6 * S),
            (mcx - tw, ty0 + 6 * S),
        ]
        dr.polygon(clasp_pts, fill=clasp_face, outline=ink, width=int(2.6 * S))
        dr.line([(mcx - tw + 10 * S, ty0 + 7 * S), (mcx + tw - 10 * S, ty0 + 7 * S)], fill=clasp_hi, width=int(3.0 * S))

    im.resize((bw, bh), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "h_podium4.png"), optimize=True)
    print("Saved 04-style h_podium4.png (760x240)")


def build_podium_crest_suite():
    # h_podium_crest.png (540x64)
    bw, bh = 540, 64
    w, h = bw * SS, bh * SS
    d = hex_plaque_sdf(w, h, 4.0 * SS, 5.0 * SS, 18.0 * SS, 4.0 * SS)
    alpha = np.clip(0.5 - d, 0.0, 1.0)
    m_rim = np.clip(0.5 - (d + 2.4 * SS), 0.0, 1.0)
    m_in = np.clip(0.5 - (d + 4.8 * SS), 0.0, 1.0)
    col = rgb("050914")[None, None, :] * (1.0 - m_rim[:, :, None]) + (
        rgb("00E5FF")[None, None, :] * (1.0 - m_in[:, :, None]) + rgb("0C1528")[None, None, :] * m_in[:, :, None]
    ) * m_rim[:, :, None]
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.clip(np.round(alpha * 246.0), 0, 255).astype(np.uint8)
    Image.fromarray(rgba).resize((bw, bh), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "h_podium_crest.png"), optimize=True)

    # h_bond_pill.png (260x42) & h_bond_pill_lip.png (264x46)
    pw, ph = 260, 42
    W2, H2 = pw * SS, ph * SS
    y2, x2 = np.mgrid[0:H2, 0:W2].astype(np.float32)
    d2 = sdf_oct_box(x2, y2, (W2 - 1) * 0.5, (H2 - 1) * 0.5, (pw * 0.5 - 1.5) * SS, (ph * 0.5 - 1.5) * SS, 11.0 * SS, 0.8 * SS)
    a2 = np.clip(0.5 - d2, 0.0, 1.0)
    m2_rim = np.clip(0.5 - (d2 + 2.0 * SS), 0.0, 1.0)
    m2_in = np.clip(0.5 - (d2 + 3.8 * SS), 0.0, 1.0)
    col2 = rgb("050914")[None, None, :] * (1.0 - m2_rim[:, :, None]) + (
        rgb("00F57A")[None, None, :] * (1.0 - m2_in[:, :, None]) + rgb("0C1528")[None, None, :] * m2_in[:, :, None]
    ) * m2_rim[:, :, None]
    p_rgba = np.zeros((H2, W2, 4), dtype=np.uint8)
    p_rgba[:, :, :3] = np.clip(np.round(col2), 0, 255).astype(np.uint8)
    p_rgba[:, :, 3] = np.clip(np.round(a2 * 246.0), 0, 255).astype(np.uint8)
    Image.fromarray(p_rgba).resize((pw, ph), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "h_bond_pill.png"), optimize=True)

    lpw, lph = 264, 46
    LW2, LH2 = lpw * SS, lph * SS
    ly2, lx2 = np.mgrid[0:LH2, 0:LW2].astype(np.float32)
    ld2 = sdf_oct_box(lx2, ly2, (LW2 - 1) * 0.5, (LH2 - 1) * 0.5, (pw - 3.0) * 0.5 * SS, (ph - 3.0) * 0.5 * SS, 11.0 * SS, 0.8 * SS)
    lp_rgba = np.zeros((LH2, LW2, 4), dtype=np.uint8)
    lp_rgba[:, :, :3] = [4, 7, 16]
    lp_rgba[:, :, 3] = np.clip(np.round(np.clip(0.5 - ld2, 0.0, 1.0) * 210.0), 0, 255).astype(np.uint8)
    Image.fromarray(lp_rgba).resize((lpw, lph), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "h_bond_pill_lip.png"), optimize=True)

    # ic_bond_knot.png (64x64) & ic_bond_go.png (40x40)
    ks = 64 * SS
    ky, kx = np.mgrid[0:ks, 0:ks].astype(np.float32)
    ku, kv = (kx + 0.5) / ks * 2.0 - 1.0, (ky + 0.5) / ks * 2.0 - 1.0
    d_rg = np.abs((np.abs(ku + 0.20) + np.abs(kv - 0.02)) - 0.50) - 0.115
    d_rj = np.abs((np.abs(ku - 0.20) + np.abs(kv + 0.02)) - 0.50) - 0.115
    ag = np.clip(0.5 - d_rg * (ks * 0.5), 0.0, 1.0)
    mg = np.clip(0.5 - (d_rg + 0.05) * (ks * 0.5), 0.0, 1.0)
    aj = np.clip(0.5 - d_rj * (ks * 0.5), 0.0, 1.0)
    mj = np.clip(0.5 - (d_rj + 0.05) * (ks * 0.5), 0.0, 1.0)
    cg = rgb("050914")[None, None, :] * (1.0 - mg[:, :, None]) + rgb("FFB800")[None, None, :] * mg[:, :, None]
    cj = rgb("050914")[None, None, :] * (1.0 - mj[:, :, None]) + rgb("00F57A")[None, None, :] * mj[:, :, None]
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
    d_tri = sdf_convex_poly(gs, gs, [(14.5 * SS, 10.0 * SS), (28.0 * SS, 20.0 * SS), (14.5 * SS, 30.0 * SS)]) - 1.2 * SS
    a_tri = np.clip(0.5 - d_tri, 0.0, 1.0)
    m_tri = np.clip(0.5 - (d_tri + 2.0 * SS), 0.0, 1.0)
    g_col = rgb("050914")[None, None, :] * (1.0 - m_tri[:, :, None]) + rgb("00F57A")[None, None, :] * m_tri[:, :, None]
    g_rgba = np.zeros((gs, gs, 4), dtype=np.uint8)
    g_rgba[:, :, :3] = np.clip(np.round(g_col), 0, 255).astype(np.uint8)
    g_rgba[:, :, 3] = np.clip(np.round(a_tri * 250.0), 0, 255).astype(np.uint8)
    Image.fromarray(g_rgba).resize((40, 40), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "ic_bond_go.png"), optimize=True)


def build_chest_mat():
    """744x140 04 风格深黑曜石切角六角三宝箱战术托盘（对齐 style04_page_home.png）。"""
    bw, bh = 372, 70
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)

    pad_x, top_y, bot_y, round_r, tip_dx = 10.0 * SS, 5.0 * SS, 61.0 * SS, 2.5 * SS, 18.5 * SS
    L, R = pad_x + round_r, (w - 1) - pad_x - round_r
    T, B = top_y + round_r, bot_y - round_r
    my = 0.5 * (T + B)
    verts = [(L + tip_dx, T), (R - tip_dx, T), (R, my), (R - tip_dx, B), (L + tip_dx, B), (L, my)]
    d = sdf_convex_poly(w, h, verts) - round_r
    d_lip = np.roll(d, int(2.8 * SS), axis=0)
    d_lip[:int(2.8 * SS), :] = 1e9
    d_u = np.minimum(d, d_lip)

    a_out = np.clip(0.5 - d_u, 0.0, 1.0)
    m_lip = np.clip(0.5 - (d_lip + 2.2 * SS), 0.0, 1.0)
    m_piping = np.clip(0.5 - (d + 2.2 * SS), 0.0, 1.0)
    m_surf = np.clip(0.5 - (d + 4.2 * SS), 0.0, 1.0)
    m_shadow_clip = np.clip(0.5 - (d + 5.0 * SS), 0.0, 1.0)

    yn = np.clip((y - T) / max(1.0, B - T), 0.0, 1.0)
    c_surf = rgb("13203A")[None, None, :] * (1.0 - yn[:, :, None]) + rgb("0B1326")[None, None, :] * yn[:, :, None]
    cx_mid = (w - 1) * 0.5
    cast_mask = np.zeros((h, w), dtype=np.float32)
    rim_slot = np.zeros((h, w), dtype=np.float32)
    for k in (-1, 0, 1):
        bx = cx_mid + k * 114.0 * SS
        sy_top, sy_bot = 18.0 * SS, 52.5 * SS
        scy = 0.5 * (sy_top + sy_bot)
        sd = sdf_oct_box(x, y, bx, scy, 44.0 * SS, 0.5 * (sy_bot - sy_top), 8.0 * SS, 0.6 * SS)
        cast_mask = np.maximum(cast_mask, np.clip(0.5 - sd / (1.2 * SS), 0.0, 1.0))
        rim_slot = np.maximum(rim_slot, np.clip(1.0 - np.abs(sd) / (1.1 * SS), 0.0, 1.0) * 0.45)

    c_surf = blend(c_surf, rgb("060A16")[None, None, :], cast_mask * m_shadow_clip)
    c_surf = blend(c_surf, rgb("00E5FF")[None, None, :], rim_slot * m_shadow_clip)

    col = np.broadcast_to(rgb("040710"), (h, w, 3)).copy()
    col = blend(col, rgb("08182E")[None, None, :], m_lip)
    col = blend(col, rgb("040710")[None, None, :], np.clip(0.5 - d, 0.0, 1.0))
    col = blend(col, rgb("3E72A4")[None, None, :], m_piping)
    col = blend(col, c_surf, m_surf)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_out * 255.0), 0, 255).astype(np.uint8)
    im = Image.fromarray(out).resize((bw * 2, bh * 2), Image.Resampling.LANCZOS)
    im.save(os.path.join(UI_DIR, "h_chest_mat.png"), optimize=True)
    print("Saved 04-style h_chest_mat.png (744x140)")


def build_hex_start_button():
    """468x142 04 风格锐利闪电切角鎏金『摇人守村』主行动按钮 + 484x158 黑曜石暗金底唇。"""
    bw, bh = 468, 142
    margin, tip_dx, round_r = 8, 34.0, 4.0
    w, h = bw * SS, bh * SS
    pad, stroke_w, rim_w = 2.2 * SS, 3.0 * SS, 7.5 * SS

    d_outer = hex_plaque_sdf(w, h, pad, pad, tip_dx * SS, round_r * SS)
    alpha = np.clip(0.5 - d_outer, 0.0, 1.0)
    d_frame = d_outer + stroke_w
    frame_mask = np.clip(0.5 - d_frame, 0.0, 1.0)
    d_inner = d_frame + rim_w
    inner_mask = np.clip(0.5 - d_inner, 0.0, 1.0)

    y_idx, x_idx = np.mgrid[0:h, 0:w].astype(np.float32)
    yn = y_idx / (h - 1)
    cel = np.clip((yn - 0.46) / 0.03, 0.0, 1.0)[:, :, None]

    rim_col = rgb("FFF4A8")[None, None, :] * (1.0 - cel) + rgb("F29E0B")[None, None, :] * cel
    in_col = rgb("FFD838")[None, None, :] * (1.0 - cel) + rgb("EA8C08")[None, None, :] * cel

    d_dn = np.roll(d_frame, int(round(2.6 * SS)), axis=0)
    d_dn[:int(round(2.6 * SS)), :] = 999.0
    top_hi = frame_mask * np.clip(d_dn + 0.5, 0.0, 1.0) * np.clip(1.0 - yn * 3.0, 0.0, 1.0)
    face_col = rim_col * (1.0 - inner_mask[:, :, None]) + in_col * inner_mask[:, :, None]
    groove = np.clip(1.0 - np.abs(d_inner) / (1.2 * SS), 0.0, 1.0)
    face_col = blend(face_col, rgb("B83C08")[None, None, :], groove * 0.72)
    face_col = blend(face_col, rgb("FFFFFF")[None, None, :], top_hi * 0.88)

    # 左右尖角闪电形绯红能量刻痕（落在左右 56px 内）
    cx = (w - 1) * 0.5
    cy = (h - 1) * 0.5
    ax = np.abs(x_idx - cx)
    bolt = sdf_segment(ax, y_idx, (bw * 0.5 - 38) * SS, cy - 16 * SS, (bw * 0.5 - 18) * SS, cy)
    bolt = np.minimum(bolt, sdf_segment(ax, y_idx, (bw * 0.5 - 18) * SS, cy, (bw * 0.5 - 38) * SS, cy + 16 * SS))
    face_col = blend(face_col, rgb("FF3B30")[None, None, :], np.clip(0.5 - (bolt - 2.2 * SS), 0.0, 1.0) * inner_mask * 0.85)

    c_stroke = rgb("050914")
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
    d_sh = np.roll(d_lip, int(2.8 * SS), axis=0)
    d_sh[:int(2.8 * SS), :] = 1e9
    l_alpha = np.clip(0.5 - d_lip, 0.0, 1.0)
    sh_a = np.clip(0.5 - d_sh, 0.0, 1.0) * 0.45
    tot_a = np.maximum(l_alpha, sh_a)
    l_body = np.clip(0.5 - (d_lip + stroke_w), 0.0, 1.0)
    l_col = np.zeros((lh, lw, 3), dtype=np.float32)
    l_col = blend(l_col, rgb("02040A")[None, None, :], sh_a)
    l_col = blend(l_col, c_stroke[None, None, :] * (1.0 - l_body[:, :, None]) + rgb("783804")[None, None, :] * l_body[:, :, None], l_alpha)
    l_rgba = np.zeros((lh, lw, 4), dtype=np.uint8)
    l_rgba[:, :, :3] = np.clip(np.round(l_col), 0, 255).astype(np.uint8)
    l_rgba[:, :, 3] = np.clip(np.round(tot_a * 255.0), 0, 255).astype(np.uint8)
    Image.fromarray(l_rgba).resize((tw, th), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "h_start_hex_lip.png"), optimize=True)

    # fx_gold_sheen.png (180x220) & fx_gold_star.png (128x128)
    sw, sh = 180, 220
    sy, sx = np.mgrid[0:sh, 0:sw].astype(np.float32)
    su = (sx - sw * 0.5) + (sy - sh * 0.5) * 0.48
    sa = np.clip(np.clip(1.0 - np.abs(su) / 20.0, 0.0, 1.0) * 0.88 + np.clip(1.0 - np.abs(su - 30.0) / 7.0, 0.0, 1.0) * 0.48, 0.0, 1.0)
    s_out = np.zeros((sh, sw, 4), dtype=np.uint8)
    s_out[:, :, :3] = [255, 252, 224]
    s_out[:, :, 3] = np.clip(np.round(sa * 255.0), 0, 255).astype(np.uint8)
    Image.fromarray(s_out).save(os.path.join(UI_DIR, "fx_gold_sheen.png"), optimize=True)

    zn = 128 * 2
    zy, zx = np.mgrid[0:zn, 0:zn].astype(np.float32)
    zu, zv = np.abs(zx - (zn - 1) * 0.5) / (zn * 0.42), np.abs(zy - (zn - 1) * 0.5) / (zn * 0.42)
    z_star = np.clip(0.5 - ((zu ** 0.48 + zv ** 0.48) - 1.0) * 30.0, 0.0, 1.0)
    z_glow = np.exp(-((zu * zu + zv * zv) * 4.5)) * 0.42
    za = np.clip(z_star + z_glow, 0.0, 1.0)
    z_col = rgb("FFD84C")[None, None, :] * (1.0 - z_star[:, :, None]) + 255.0 * z_star[:, :, None]
    z_out = np.zeros((zn, zn, 4), dtype=np.uint8)
    z_out[:, :, :3] = np.clip(np.round(z_col), 0, 255).astype(np.uint8)
    z_out[:, :, 3] = np.clip(np.round(za * 255.0), 0, 255).astype(np.uint8)
    Image.fromarray(z_out).resize((128, 128), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "fx_gold_star.png"), optimize=True)


def build_stage_arrow():
    """74x84 04 风格锐利鎏金选关三角钮（对齐 style04_page_home.png 摇人守村右侧金色箭头）。"""
    bw, bh = 74, 84
    w, h = bw * SS, bh * SS
    round_r, stroke_w = 3.5 * SS, 2.6 * SS
    sink = int(round(4.4 * SS))
    verts_face = [(14.0 * SS, (bh * 0.5 - 2.5) * SS), (58.0 * SS, 13.0 * SS), (58.0 * SS, (bh - 18.0) * SS)]
    verts_lip = [(vx, vy + sink) for vx, vy in verts_face]

    d_face = sdf_convex_poly(w, h, verts_face) - round_r
    d_lip = sdf_convex_poly(w, h, verts_lip) - round_r
    d_u = np.minimum(d_face, d_lip)

    alpha = np.clip(0.5 - d_u, 0.0, 1.0)
    m_lip = np.clip(0.5 - (d_lip + stroke_w), 0.0, 1.0)
    m_face = np.clip(0.5 - (d_face + stroke_w), 0.0, 1.0)

    y_idx, _ = np.mgrid[0:h, 0:w].astype(np.float32)
    cel = np.clip((y_idx / (h - 1) - 0.48) / 0.05, 0.0, 1.0)[:, :, None]
    face_fill = rgb("FFE260")[None, None, :] * (1.0 - cel) + rgb("F0980C")[None, None, :] * cel

    col = np.broadcast_to(rgb("050914"), (h, w, 3)).copy()
    col = blend(col, rgb("783A06")[None, None, :], m_lip)
    col = blend(col, rgb("050914")[None, None, :], np.clip(0.5 - d_face, 0.0, 1.0))
    col = blend(col, face_fill, m_face)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, "h_stage_arrow.png"), optimize=True)


def build_quality_pads():
    """276x176 04 风格透视 45° 切角五阶霓虹发光站位盘 h_pad_0..4.png（对齐 style04_page_home.png）。"""
    bw, bh = 276, 176
    S2 = 3
    w, h = bw * S2, bh * S2
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    # 将纵横比压缩为透视八角方形盘面
    sx = (x - cx)
    sy = (y - cy) * (102.0 / 56.0)
    d = sdf_oct_box(sx + cx, sy + cy, cx, cy, 102.0 * S2, 102.0 * S2, 28.0 * S2, 2.0 * S2)

    tiers = [
        (0, "142A3A", "2C6E7C", "8CC4DC", "00F57A"),  # Silver-Emerald
        (1, "0B223E", "0E68A8", "00E5FF", "BDF8FF"),  # Cyan
        (2, "1A103C", "5C24B4", "A84CFF", "ECC8FF"),  # Violet
        (3, "2A1808", "965808", "FFB800", "FFF4B0"),  # Gold
        (4, "2E0A12", "9E1A20", "FF3B30", "FFD0B8"),  # Crimson
    ]

    for tid, h_core, h_mid, h_rim, h_hi in tiers:
        c_core, c_mid, c_rim, c_hi = rgb(h_core), rgb(h_mid), rgb(h_rim), rgb(h_hi)
        m_outer = np.clip(0.5 - d / 1.4, 0.0, 1.0)
        m_rim = np.clip(0.5 - (d + 3.0 * S2) / 1.4, 0.0, 1.0)
        m_pool = np.clip(0.5 - (d + 8.5 * S2) / 1.4, 0.0, 1.0)

        rad_norm = np.clip(1.0 + d / (96.0 * S2), 0.0, 1.0)
        pool_col = c_core[None, None, :] * (1.0 - rad_norm[:, :, None] ** 1.4) + c_mid[None, None, :] * (rad_norm[:, :, None] ** 1.4)

        in_ring = np.clip(1.0 - np.abs(d + 20.0 * S2) / (2.2 * S2), 0.0, 1.0) * 0.85
        pool_col = blend(pool_col, c_hi[None, None, :], in_ring * m_pool)

        rim_col = c_hi[None, None, :] * 0.45 + c_rim[None, None, :] * 0.55
        col = np.broadcast_to(rgb("040710"), (h, w, 3)).copy()
        col = blend(col, rim_col, m_rim)
        col = blend(col, rgb("050914")[None, None, :], np.clip(0.5 - (d + 6.4 * S2) / 1.4, 0.0, 1.0))
        col = blend(col, pool_col, m_pool)

        # 外圈柔和霓虹底座辉光
        glow_a = np.exp(-np.maximum(d, 0.0) / (9.0 * S2)) * 0.36
        tot_a = np.clip(np.maximum(m_outer * 0.96, glow_a), 0.0, 1.0)
        col = np.where((m_outer > 0.02)[:, :, None], col, c_rim[None, None, :])

        out = np.zeros((h, w, 4), dtype=np.uint8)
        out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
        out[:, :, 3] = np.clip(np.round(tot_a * 255.0), 0, 255).astype(np.uint8)
        Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS).save(os.path.join(UI_DIR, f"h_pad_{tid}.png"), optimize=True)
    print("Saved 04-style h_pad_0..4.png")


# ==================== 2. 独立 UI 皮肤全量 04 切角重制 ====================

def save_ui(name: str, im: Image.Image):
    im.save(os.path.join(UI_DIR, name), optimize=True)
    print(f"wrote 04-style {name:22s} {im.size[0]}x{im.size[1]}")


def oct_pill_box(bw: int, bh: int, ch: float, pad: float, c_fill_top: str, c_fill_bot: str, c_rim: str, c_lip: str = None, alpha_mul: float = 1.0) -> Image.Image:
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - (1.4 * SS if c_lip else 0.0)
    hw, hh = (bw * 0.5 - pad) * SS, (bh * 0.5 - pad - (1.4 if c_lip else 0.0)) * SS
    d_face = sdf_oct_box(x, y, cx, cy, hw, hh, ch * SS, 0.9 * SS)
    d_u = np.minimum(d_face, sdf_oct_box(x, y - 2.8 * SS, cx, cy, hw, hh, ch * SS, 0.9 * SS)) if c_lip else d_face
    a = np.clip(0.5 - d_u, 0.0, 1.0) * alpha_mul
    st = 2.2 * SS

    col = np.broadcast_to(rgb("050914"), (h, w, 3)).copy()
    if c_lip:
        col = blend(col, rgb(c_lip)[None, None, :], np.clip(0.5 - (sdf_oct_box(x, y - 2.8 * SS, cx, cy, hw, hh, ch * SS, 0.9 * SS) + st), 0.0, 1.0))
        col = blend(col, rgb("050914")[None, None, :], np.clip(0.5 - d_face, 0.0, 1.0))
    col = blend(col, rgb(c_rim)[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))
    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    fill = rgb(c_fill_top)[None, None, :] * (1.0 - yn[:, :, None]) + rgb(c_fill_bot)[None, None, :] * yn[:, :, None]
    col = blend(col, fill, np.clip(0.5 - (d_face + 4.2 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def oct_badge(bw: int, bh: int, ch_ratio: float, c_top: str, c_bot: str, c_rim: str, c_lip: str) -> Image.Image:
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 2.0 * SS
    hw = (bw * 0.5 - 4.0) * SS
    hh = (bh * 0.5 - 5.5) * SS
    ch = min(hw, hh) * ch_ratio
    d_face = sdf_oct_box(x, y, cx, cy, hw, hh, ch, 1.2 * SS)
    d_lip = sdf_oct_box(x, y - 3.6 * SS, cx, cy, hw, hh, ch, 1.2 * SS)
    d_u = np.minimum(d_face, d_lip)
    a = np.clip(0.5 - d_u, 0.0, 1.0)
    st = 2.6 * SS

    col = np.broadcast_to(rgb("050914"), (h, w, 3)).copy()
    col = blend(col, rgb(c_lip)[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, rgb("050914")[None, None, :], np.clip(0.5 - d_face, 0.0, 1.0))
    col = blend(col, rgb(c_rim)[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))
    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    cel = np.clip((yn - 0.46) / 0.06, 0.0, 1.0)[:, :, None]
    fill = rgb(c_top)[None, None, :] * (1.0 - cel) + rgb(c_bot)[None, None, :] * cel
    col = blend(col, fill, np.clip(0.5 - (d_face + 5.2 * SS), 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def build_all_standalone_ui():
    # 1. h_capsule (216x56), pill (240x54), plate (396x45), h_plaque (260x88), h_tile (168x124)
    save_ui("h_capsule.png", oct_pill_box(216, 56, 13.0, 2.0, "101B32", "0A1122", "4274A6", None, 0.95))
    save_ui("pill.png", oct_pill_box(240, 54, 12.5, 2.0, "101B32", "0A1122", "3C6B9C", None, 0.96))
    save_ui("plate.png", oct_pill_box(396, 45, 11.0, 2.0, "142C52", "0D1E3A", "00E5FF", None, 0.98))
    save_ui("h_plaque.png", oct_pill_box(260, 88, 15.0, 3.0, "13223E", "0B1428", "00E5FF", "071020"))
    save_ui("h_tile.png", oct_pill_box(168, 124, 16.0, 3.0, "13223E", "0B1428", "3E6EA2", "071020"))

    # 2. h_round (108x108: 侧边栏八角黑曜石金框徽章！), lv (130x135), medal (156x160), dot (44x44)
    save_ui("h_round.png", oct_badge(108, 108, 0.44, "14203A", "0B1326", "FFB800", "4E3006"))
    save_ui("lv.png", oct_badge(130, 135, 0.42, "16325C", "0D1E3A", "00E5FF", "082848"))
    save_ui("medal.png", oct_badge(156, 160, 0.42, "1C3050", "111E36", "DCEEFF", "162844"))

    # dot.png (44x44) 04 风格锐利八角绯红警示点
    dw = dh = 44 * SS
    dy, dx = np.mgrid[0:dh, 0:dw].astype(np.float32)
    dcx, dcy = (dw - 1) * 0.5, (dh - 1) * 0.5
    dd = sdf_oct_box(dx, dy, dcx, dcy, 18.5 * SS, 18.5 * SS, 7.0 * SS, 1.0 * SS)
    da = np.clip(0.5 - dd, 0.0, 1.0)
    dcol = np.broadcast_to(rgb("050914"), (dh, dw, 3)).copy()
    dcol = blend(dcol, rgb("FFB800")[None, None, :], np.clip(0.5 - (dd + 2.2 * SS), 0.0, 1.0))
    dcol = blend(dcol, rgb("FF3B30")[None, None, :], np.clip(0.5 - (dd + 4.0 * SS), 0.0, 1.0))
    dcol = blend(dcol, rgb("FFFFFF")[None, None, :], np.clip(0.5 - (np.hypot(dx - (dcx - 5.5 * SS), dy - (dcy - 5.5 * SS)) - 3.2 * SS), 0.0, 1.0))
    dout = np.zeros((dh, dw, 4), dtype=np.uint8)
    dout[:, :, :3] = np.clip(np.round(dcol), 0, 255).astype(np.uint8)
    dout[:, :, 3] = np.clip(np.round(da * 255.0), 0, 255).astype(np.uint8)
    save_ui("dot.png", Image.fromarray(dout).resize((44, 44), Image.Resampling.LANCZOS))

    # 3. h_avatar.png (124x124) 04 风格 45° 切角鎏金+霓虹青黑曜石头像框
    aw = ah = 124 * SS
    ay, ax = np.mgrid[0:ah, 0:aw].astype(np.float32)
    acx, acy = (aw - 1) * 0.5, (ah - 1) * 0.5 - 1.5 * SS
    ad_f = sdf_oct_box(ax, ay, acx, acy, 56 * SS, 56 * SS, 16 * SS, 1.0 * SS)
    ad_l = sdf_oct_box(ax, ay - 3.0 * SS, acx, acy, 56 * SS, 56 * SS, 16 * SS, 1.0 * SS)
    ad_u = np.minimum(ad_f, ad_l)
    acol = np.broadcast_to(rgb("050914"), (ah, aw, 3)).copy()
    acol = blend(acol, rgb("6E4206")[None, None, :], np.clip(0.5 - (ad_l + 2.6 * SS), 0.0, 1.0))
    acol = blend(acol, rgb("050914")[None, None, :], np.clip(0.5 - ad_f, 0.0, 1.0))
    acol = blend(acol, rgb("FFB800")[None, None, :], np.clip(0.5 - (ad_f + 2.6 * SS), 0.0, 1.0))
    acol = blend(acol, rgb("050914")[None, None, :], np.clip(0.5 - (ad_f + 6.4 * SS), 0.0, 1.0))
    acol = blend(acol, rgb("00E5FF")[None, None, :], np.clip(0.5 - (ad_f + 8.0 * SS), 0.0, 1.0))
    acol = blend(acol, rgb("0C1528")[None, None, :], np.clip(0.5 - (ad_f + 9.6 * SS), 0.0, 1.0))
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
    d_hex = sdf_convex_poly(W, H, verts_o) - 10.0 * SS
    a_hex = np.clip(0.5 - d_hex, 0.0, 1.0)
    m_gold = np.clip(0.5 - (d_hex + 3.0 * SS), 0.0, 1.0)
    m_in_ink = np.clip(0.5 - (d_hex + 10.5 * SS), 0.0, 1.0)
    m_cyan = np.clip(0.5 - (d_hex + 12.8 * SS), 0.0, 1.0)
    m_core = np.clip(0.5 - (d_hex + 14.8 * SS), 0.0, 1.0)
    hy, _ = np.mgrid[0:H, 0:W].astype(np.float32)
    hcel = np.clip((hy / (H - 1) - 0.46) / 0.06, 0.0, 1.0)[:, :, None]
    gfill = rgb("FFE260")[None, None, :] * (1.0 - hcel) + rgb("EA940C")[None, None, :] * hcel
    hcol = np.broadcast_to(rgb("050914"), (H, W, 3)).copy()
    hcol = blend(hcol, gfill, m_gold)
    hcol = blend(hcol, rgb("050914")[None, None, :], m_in_ink)
    hcol = blend(hcol, rgb("00E5FF")[None, None, :], m_cyan)
    hcol = blend(hcol, rgb("0D162C")[None, None, :], m_core)
    hout = np.zeros((H, W, 4), dtype=np.uint8)
    hout[:, :, :3] = np.clip(np.round(hcol), 0, 255).astype(np.uint8)
    hout[:, :, 3] = np.clip(np.round(a_hex * 255.0), 0, 255).astype(np.uint8)
    save_ui("hex.png", Image.fromarray(hout).resize((hw_i, hh_i), Image.Resampling.LANCZOS))

    # 5. h_tab_on.png (227x230) — 04 风格鎏金琥珀切角聚光选中底座（对齐 style04_page_roster『乡亲』高亮卡！）
    tw, th = 227, 230
    W, H = tw * SS, th * SS
    sy, sx = np.mgrid[0:H, 0:W].astype(np.float32)
    sh_pts = [
        (26 * SS, 14 * SS),
        ((tw - 26) * SS, 14 * SS),
        ((tw - 10) * SS, 32 * SS),
        ((tw - 14) * SS, (th - 18) * SS),
        ((tw - 30) * SS, (th - 8) * SS),
        (30 * SS, (th - 8) * SS),
        (14 * SS, (th - 18) * SS),
        (10 * SS, 32 * SS),
    ]
    d_sh = sdf_convex_poly(W, H, sh_pts) - 3.0 * SS
    a_sh = np.clip(0.5 - d_sh, 0.0, 1.0)
    m_rim = np.clip(0.5 - (d_sh + 3.0 * SS), 0.0, 1.0)
    m_ink2 = np.clip(0.5 - (d_sh + 9.0 * SS), 0.0, 1.0)
    m_in = np.clip(0.5 - (d_sh + 11.5 * SS), 0.0, 1.0)
    yn = sy / (H - 1)
    s_rim = rgb("FFF6B8")[None, None, :] * (1.0 - yn[:, :, None] * 0.65) + rgb("EA9008")[None, None, :] * (yn[:, :, None] * 0.65)
    s_core = rgb("FFB800")[None, None, :] * (1.0 - yn[:, :, None] * 0.78) + rgb("422208")[None, None, :] * (yn[:, :, None] * 0.78)
    scol = np.broadcast_to(rgb("050914"), (H, W, 3)).copy()
    scol = blend(scol, s_rim, m_rim)
    scol = blend(scol, rgb("050914")[None, None, :], m_ink2)
    scol = blend(scol, s_core, m_in)
    # 顶沿超亮金色聚光灯条
    top_bar = np.clip(1.0 - np.abs(sy - 20 * SS) / (4.5 * SS), 0.0, 1.0) * m_rim
    scol = blend(scol, rgb("FFFFE0")[None, None, :], top_bar * 0.90)
    sout = np.zeros((H, W, 4), dtype=np.uint8)
    sout[:, :, :3] = np.clip(np.round(scol), 0, 255).astype(np.uint8)
    sout[:, :, 3] = np.clip(np.round(a_sh * 255.0), 0, 255).astype(np.uint8)
    save_ui("h_tab_on.png", Image.fromarray(sout).resize((tw, th), Image.Resampling.LANCZOS))

    # 6. tabbar.png (950x133) & h_tabbar.png (512x176)
    for nm, bw, bh in [("tabbar.png", 950, 133), ("h_tabbar.png", 512, 176)]:
        im = Image.new("RGBA", (bw, bh), (9, 14, 30, 255))
        dr = ImageDraw.Draw(im)
        dr.rectangle([0, 0, bw, 2], fill=rgba_t("040710"))
        dr.rectangle([0, 3, bw, 6], fill=rgba_t("00F57A"))
        dr.rectangle([0, 7, bw, 9], fill=rgba_t("16384C"))
        save_ui(nm, im)

    # 7. arrow.png (144x146), h_arrow.png (211x215), btn_arrow.png (381x583), btn_start.png (1263x256)
    for nm, bw, bh, ct, cb, cr, cl in [
        ("arrow.png", 144, 146, "16325A", "0C1D38", "00E5FF", "071224"),
        ("h_arrow.png", 211, 215, "0E3832", "092220", "00F57A", "051614"),
    ]:
        im = oct_badge(bw, bh, 0.42, ct, cb, cr, cl)
        W, H = bw * 2, bh * 2
        im2 = im.resize((W, H), Image.Resampling.LANCZOS)
        dr = ImageDraw.Draw(im2)
        cx, cy = W * 0.5, H * 0.49
        s = min(bw, bh) / 144.0 * 2.0
        pts = [(cx - 26 * s, cy), (cx + 12 * s, cy - 26 * s), (cx + 12 * s, cy - 10 * s), (cx + 28 * s, cy - 10 * s), (cx + 28 * s, cy + 10 * s), (cx + 12 * s, cy + 10 * s), (cx + 12 * s, cy + 26 * s)]
        dr.polygon(pts, fill=rgba_t("EAF6FF"), outline=rgba_t("050914"), width=max(2, int(2.6 * s)))
        save_ui(nm, im2.resize((bw, bh), Image.Resampling.LANCZOS))

    # btn_arrow.png (381x583)
    bw, bh = 381, 583
    im = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    pts = [(68, bh // 2), (bw - 86, 56), (bw - 42, 108), (168, bh // 2), (bw - 42, bh - 108), (bw - 86, bh - 56)]
    dr.polygon([(x, y + 12) for x, y in pts], fill=rgba_t("783A06"), outline=rgba_t("050914"), width=8)
    dr.polygon(pts, fill=rgba_t("FFD438"), outline=rgba_t("050914"), width=8)
    save_ui("btn_arrow.png", im)

    # btn_start.png (1263x256)
    im = Image.new("RGBA", (1263, 256), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    p_lip = [(48, 22), (1215, 22), (1251, 58), (1251, 208), (1215, 244), (48, 244), (12, 208), (12, 58)]
    p_top = [(48, 10), (1215, 10), (1251, 46), (1251, 192), (1215, 228), (48, 228), (12, 192), (12, 46)]
    dr.polygon(p_lip, fill=rgba_t("783A06"), outline=rgba_t("050914"), width=7)
    dr.polygon(p_top, fill=rgba_t("FFD438"), outline=rgba_t("050914"), width=7)
    dr.polygon([(56, 22), (1207, 22), (1235, 50), (1235, 112), (28, 112), (28, 50)], fill=(255, 248, 196, 115))
    save_ui("btn_start.png", im)

    # 8. h_ribbon.png (303x100), plaque.png (753x160), banner_gold.png (760x231)
    def oct_wing_plaque(bw: int, bh: int, pad_x: int, c_top: str, c_bot: str, c_rim: str, c_tail: str) -> Image.Image:
        S2 = 2
        W, H = bw * S2, bh * S2
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(im)
        ink = rgba_t("050914")
        ty0, ty1 = int(H * 0.24), int(H * 0.88)
        tmy = (ty0 + ty1) // 2
        dr.polygon([(8 * S2, ty0), (pad_x * S2 + 20 * S2, ty0), (pad_x * S2 + 20 * S2, ty1), (8 * S2, ty1), (28 * S2, tmy)], fill=rgba_t(c_tail), outline=ink, width=int(2.8 * S2))
        dr.polygon([(W - pad_x * S2 - 20 * S2, ty0), (W - 8 * S2, ty0), (W - 28 * S2, tmy), (W - 8 * S2, ty1), (W - pad_x * S2 - 20 * S2, ty1)], fill=rgba_t(c_tail), outline=ink, width=int(2.8 * S2))
        mx0, mx1 = int(pad_x * 0.55 * S2), W - int(pad_x * 0.55 * S2)
        my0, my1 = int(H * 0.12), int(H * 0.82)
        ch = int(14 * S2)
        def oct_pts(x0, y0, x1, y1, c):
            return [(x0 + c, y0), (x1 - c, y0), (x1, y0 + c), (x1, y1 - c), (x1 - c, y1), (x0 + c, y1), (x0, y1 - c), (x0, y0 + c)]
        dr.polygon(oct_pts(mx0, my0 + 5 * S2, mx1, my1 + 5 * S2, ch), fill=rgba_t(c_tail), outline=ink, width=int(2.8 * S2))
        dr.polygon(oct_pts(mx0, my0, mx1, my1, ch), fill=rgba_t(c_rim), outline=ink, width=int(2.8 * S2))
        dr.polygon(oct_pts(mx0 + 5 * S2, my0 + 5 * S2, mx1 - 5 * S2, my1 - 5 * S2, max(4, ch - 4 * S2)), fill=rgba_t(c_bot))
        dr.polygon([(mx0 + ch, my0 + 5 * S2), (mx1 - ch, my0 + 5 * S2), (mx1 - 5 * S2, my0 + ch), (mx1 - 5 * S2, (my0 + my1) // 2), (mx0 + 5 * S2, (my0 + my1) // 2), (mx0 + 5 * S2, my0 + ch)], fill=rgba_t(c_top))
        return im.resize((bw, bh), Image.Resampling.LANCZOS)

    save_ui("h_ribbon.png", oct_wing_plaque(303, 100, 64, "162C52", "0D1B34", "00E5FF", "0A3C58"))
    save_ui("plaque.png", oct_wing_plaque(753, 160, 140, "162C52", "0D1B34", "00E5FF", "0A3C58"))
    save_ui("banner_gold.png", oct_wing_plaque(760, 231, 110, "361420", "1E0B16", "FFB800", "7C3C08"))

    # 9. h_pedestal.png (234x170) 04 风格八角黑曜石能量底座
    pw, ph = 234, 170
    W, H = pw * 2, ph * 2
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    def ped_oct(y_off, fill_c, out_c, w_st):
        pts = [(74, 18 + y_off), (W - 74, 18 + y_off), (W - 16, H // 2 - 8 + y_off), (W - 74, H - 30 + y_off), (74, H - 30 + y_off), (16, H // 2 - 8 + y_off)]
        dr.polygon(pts, fill=fill_c, outline=out_c, width=w_st)
    ped_oct(16, rgba_t("0A1628"), rgba_t("050914"), 6)
    ped_oct(0, rgba_t("162A48"), rgba_t("00E5FF"), 5)
    dr.polygon([(92, 34), (W - 92, 34), (W - 42, H // 2 - 8), (W - 92, H - 46), (92, H - 46), (42, H // 2 - 8)], fill=rgba_t("0D182C"), outline=rgba_t("FFB800"), width=3)
    save_ui("h_pedestal.png", im.resize((pw, ph), Image.Resampling.LANCZOS))

    # 10. flame_bar.png (560x324, 9-slice 60,60,230,130)
    fw, fh = 560, 324
    im = Image.new("RGBA", (fw * 2, fh * 2), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    ink = rgba_t("050914")
    flames_outer = [(820, 190), (920, 64), (952, 160), (1044, 44), (1090, 195), (1098, 360), (990, 520), (820, 520)]
    flames_inner = [(850, 230), (930, 136), (960, 210), (1028, 122), (1058, 240), (1058, 360), (970, 480), (850, 480)]
    dr.polygon(flames_outer, fill=rgba_t("FF3B30"), outline=ink, width=6)
    dr.polygon(flames_inner, fill=rgba_t("FFB800"))
    bar_pts = [(56, 164), (964, 164), (996, 196), (996, 488), (964, 520), (56, 520), (24, 488), (24, 196)]
    bar_lip = [(x, y + 14) for x, y in bar_pts]
    dr.polygon(bar_lip, fill=rgba_t("5E0E14"), outline=ink, width=6)
    dr.polygon(bar_pts, fill=rgba_t("220D1A"), outline=rgba_t("FFB800"), width=6)
    save_ui("flame_bar.png", im.resize((fw, fh), Image.Resampling.LANCZOS))

    # 11. hint_tail.png (542x452), tag.png (154x107), tag_intel.png (701x462)
    im = Image.new("RGBA", (542, 452), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    dr.polygon([(271, 26), (510, 428), (32, 428)], fill=rgba_t("0B1326"), outline=rgba_t("00E5FF"), width=8)
    save_ui("hint_tail.png", im)

    for nm, bw, bh, c_main, c_rim, c_lip in [
        ("tag.png", 154, 107, "0D2E24", "00F57A", "061C16"),
        ("tag_intel.png", 701, 462, "2E0E18", "FF3B30", "1A060C"),
    ]:
        S2 = 2
        W, H = bw * S2, bh * S2
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(im)
        pts = [(12 * S2, 14 * S2), (W - 14 * S2, 14 * S2), (W - int(bw * 0.18 * S2), H // 2), (W - 14 * S2, H - 18 * S2), (12 * S2, H - 18 * S2)]
        lw = max(3, int(min(bw, bh) * 0.028 * S2))
        dr.polygon([(x, y + lw) for x, y in pts], fill=rgba_t(c_lip), outline=rgba_t("050914"), width=lw)
        dr.polygon(pts, fill=rgba_t(c_main), outline=rgba_t(c_rim), width=lw)
        dr.rectangle([12 * S2, 10 * S2, 24 * S2, H - 14 * S2], fill=rgba_t("FFB800"), outline=rgba_t("050914"), width=lw)
        save_ui(nm, im.resize((bw, bh), Image.Resampling.LANCZOS))

    # 12. rank_badge_1..4.png (264x84, 9-slice 76,0,76,0)
    rb_themes = [
        ("rank_badge_1.png", "FFB800", "2C0E18", "4A1422", "FF3B30"),
        ("rank_badge_2.png", "C47DFF", "1A1038", "2C1A58", "A84CFF"),
        ("rank_badge_3.png", "00E5FF", "0C1D38", "143058", "00E5FF"),
        ("rank_badge_4.png", "00F57A", "0A241E", "123C30", "00F57A"),
    ]
    for nm, c_rim, c_bot, c_top, c_gem in rb_themes:
        bw, bh = 264, 84
        W, H = bw * 3, bh * 3
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(im)
        ink = rgba_t("050914")
        for sgn in (-1, 1):
            cx_e = (46 if sgn < 0 else bw - 46) * 3
            dr.polygon([(cx_e, 24 * 3), (cx_e + sgn * 36 * 3, 14 * 3), (cx_e + sgn * 28 * 3, 42 * 3), (cx_e + sgn * 34 * 3, 68 * 3), (cx_e, 60 * 3)], fill=rgba_t(c_rim), outline=ink, width=7)
        p_out = [(52 * 3, 16 * 3), ((bw - 52) * 3, 16 * 3), ((bw - 38) * 3, 30 * 3), ((bw - 38) * 3, (bh - 28) * 3), ((bw - 52) * 3, (bh - 14) * 3), (52 * 3, (bh - 14) * 3), (38 * 3, (bh - 28) * 3), (38 * 3, 30 * 3)]
        p_in = [(56 * 3, 22 * 3), ((bw - 56) * 3, 22 * 3), ((bw - 44) * 3, 34 * 3), ((bw - 44) * 3, (bh - 32) * 3), ((bw - 56) * 3, (bh - 20) * 3), (56 * 3, (bh - 20) * 3), (44 * 3, (bh - 32) * 3), (44 * 3, 34 * 3)]
        dr.polygon(p_out, fill=rgba_t(c_rim), outline=ink, width=8)
        dr.polygon(p_in, fill=rgba_t(c_bot), outline=ink, width=6)
        dr.polygon([(56 * 3, 24 * 3), ((bw - 56) * 3, 24 * 3), ((bw - 46) * 3, 42 * 3), (46 * 3, 42 * 3)], fill=rgba_t(c_top))
        for gx in (38 * 3, (bw - 38) * 3):
            gy = 42 * 3
            dr.polygon([(gx, gy - 21), (gx + 21, gy), (gx, gy + 21), (gx - 21, gy)], fill=ink)
            dr.polygon([(gx, gy - 14), (gx + 14, gy), (gx, gy + 14), (gx - 14, gy)], fill=rgba_t(c_gem))
        save_ui(nm, im.resize((bw, bh), Image.Resampling.LANCZOS))

    # 13. rank_av_gold.png & rank_av_azure.png (220x220)
    for nm, c_main, c_hi, c_gem in [
        ("rank_av_gold.png", "FFB800", "FFF6BE", "FF3B30"),
        ("rank_av_azure.png", "00E5FF", "E0FCFF", "00F57A"),
    ]:
        bw = bh = 220
        S3 = 3
        W = H = bw * S3
        im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        dr = ImageDraw.Draw(im)
        ink = rgba_t("050914")
        for sgn in (-1, 1):
            bx = W // 2 + sgn * 72 * S3
            for dy_w, ext, w_h in [(-32, 34, 20), (0, 38, 20), (32, 30, 18)]:
                by = H // 2 + dy_w * S3
                pts = [(bx, by - w_h * S3 // 2), (bx + sgn * ext * S3, by - (w_h - 4) * S3 // 2), (bx + sgn * (ext - 8) * S3, by + w_h * S3 // 2), (bx, by + w_h * S3 // 2)]
                dr.polygon(pts, fill=rgba_t(c_main), outline=ink, width=7)
        y, x = np.mgrid[0:H, 0:W].astype(np.float32)
        cx = cy = (W - 1) * 0.5
        d_out = sdf_oct_box(x, y, cx, cy, 78 * S3, 78 * S3, 22 * S3, 1.5 * S3)
        d_hole = sdf_oct_box(x, y, cx, cy, 62 * S3, 62 * S3, 14 * S3, 1.5 * S3)
        ring_d = np.maximum(d_out, -d_hole)

        arr = np.array(im, dtype=np.float32)
        a_ring = np.clip(0.5 - ring_d, 0.0, 1.0)
        m_ring_fill = np.clip(0.5 - (ring_d + 2.8 * S3), 0.0, 1.0)
        cel = np.clip((y / (H - 1) - 0.45) / 0.08, 0.0, 1.0)[:, :, None]
        rfill = rgb(c_hi)[None, None, :] * (1.0 - cel) + rgb(c_main)[None, None, :] * cel
        rcol = rgb("050914")[None, None, :] * (1.0 - m_ring_fill[:, :, None]) + rfill * m_ring_fill[:, :, None]

        hole_keep = np.clip(0.5 + d_hole, 0.0, 1.0)
        arr[:, :, 3] *= hole_keep
        sa = a_ring[:, :, None]
        da = (arr[:, :, 3:4] / 255.0)
        na = sa + da * (1.0 - sa)
        arr[:, :, :3] = np.where(na > 1e-5, (rcol * sa + arr[:, :, :3] * da * (1.0 - sa)) / np.maximum(na, 1e-5), 0.0)
        arr[:, :, 3:4] = na * 255.0
        im = Image.fromarray(np.clip(np.round(arr), 0, 255).astype(np.uint8))

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
    print("Completed full 04-style Home & standalone UI suite!")
