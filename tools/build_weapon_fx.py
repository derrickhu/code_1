"""生成对标《永远的蔚蓝星球》的 4x 超采样物理兵器与箭矢周身气流特效贴图套件（高对比度标准 Alpha 混合版，在亮黄石板路上 100% 浓郁醒目！）：

输出到 Assets/Resources/Art/：
1. fx_spin_vortex.png (256x256)
   - 复刻参考图骑士飞斧周边的『浓郁冰青深海蓝旋风刀环』：外沿深海青蓝描边托底 + 中层鲜亮天青旋风弧 + 内锋纯白高光丝！
2. fx_arrow_cone.png (224x288)
   - 射手箭矢/毒叉专属『超音速破空双翼激波套』：深青/亮金高对比 V 字锐利破风双翼 + 箭身螺旋涡流环 + 箭头耀眼寒星！
3. fx_spear_cone.png (240x304)
   - 长枪/钩镰/重拳突刺专属『螺旋破阵双环钻风锥』：高对比深青蓝托底 + 亮白音爆气环！

用法：python3 tools/build_weapon_fx.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets/Resources/Art")
SS = 2


def rgb(h: str) -> np.ndarray:
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def blend(dst: np.ndarray, col: np.ndarray, mask: np.ndarray) -> np.ndarray:
    m = np.clip(mask, 0.0, 1.0)[:, :, None]
    return dst * (1.0 - m) + col * m


def make_spin_vortex() -> Image.Image:
    """复刻参考图骑士旋转飞斧周身的浓郁青蓝旋风刀环（标准 Alpha 混合，深海蓝底托 + 冰青亮弧 + 纯白风刃）。"""
    bw = bh = 256
    w = h = bw * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = cy = (w - 1) * 0.5
    dx, dy = x - cx, y - cy
    rad = np.hypot(dx, dy)
    rn = rad / (bw * 0.5 * SS)
    ang = np.arctan2(dy, dx)

    center_open = np.clip((rn - 0.14) / 0.22, 0.0, 1.0)
    outer_fade = np.clip((0.97 - rn) / 0.12, 0.0, 1.0)

    # 主厚实新月旋风带（如参考图左下浓青蓝满月弧）
    spiral1 = ang + rn * 2.2
    arc1_w = 0.5 + 0.5 * np.cos(spiral1 - 2.1)
    r_target1 = 0.63 + 0.07 * np.sin(ang - 1.2)
    band_wide = np.exp(-(((rn - r_target1) / (0.18 + 0.08 * arc1_w)) ** 2)) * (arc1_w ** 1.1)
    band_mid = np.exp(-(((rn - (r_target1 + 0.03)) / 0.095) ** 2)) * (arc1_w ** 1.7)

    # 对侧副旋风弧
    spiral2 = ang + rn * 2.2 + np.pi
    arc2_w = 0.5 + 0.5 * np.cos(spiral2 - 2.1)
    r_target2 = 0.57 + 0.05 * np.cos(ang)
    band2 = np.exp(-(((rn - r_target2) / 0.13) ** 2)) * (arc2_w ** 1.6) * 0.82

    # 锋利亮白青外刃丝
    rim_sharp = np.exp(-(((rn - (r_target1 + 0.085)) / 0.032) ** 2)) * (arc1_w ** 2.2)
    rim2 = np.exp(-(((rn - (r_target2 + 0.065)) / 0.026) ** 2)) * (arc2_w ** 2.4) * 0.85

    m_deep = np.clip(np.maximum(band_wide * 0.92, band2 * 0.85) * center_open * outer_fade, 0.0, 1.0)
    m_cyan = np.clip(np.maximum(band_mid, band2 * 0.72) * center_open * outer_fade, 0.0, 1.0)
    m_white = np.clip(np.maximum(rim_sharp, rim2) * outer_fade, 0.0, 1.0)

    col = np.zeros((h, w, 3), dtype=np.float32)
    # 底层深海青蓝 (#0872B8) 在亮黄石板上对比度拉满！
    col = blend(col, rgb("0872B8")[None, None, :], m_deep)
    # 中层鲜亮冰青 (#1ED6FF)
    col = blend(col, rgb("1ED6FF")[None, None, :], m_cyan * 0.95)
    # 顶层纯白刀锋丝 (#F2FFFF)
    col = blend(col, rgb("F2FFFF")[None, None, :], m_white)

    alpha = np.clip(np.maximum.reduce([m_deep * 0.85, m_cyan * 0.94, m_white]), 0.0, 1.0)
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_arrow_cone() -> Image.Image:
    """射手箭矢高对比超音速破风套（标准 Alpha 混合，深海蓝外衬 + 鲜亮冰青双翼 + 纯白破空锋芒 + 螺旋音爆圈）：
    在亮色石板地面上一眼就能看到整支箭裹挟着凌厉的破空气流呼啸穿云！
    """
    bw, bh = 224, 288
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = (w - 1) * 0.5
    vn = y / float(h)
    ux = (x - cx) / (bw * 0.5 * SS)
    ax = np.abs(ux)

    # 外层宽阔 V 型激波双翼：从箭头 vn=0.08 张开到 vn=0.92
    t = np.clip((vn - 0.08) / 0.84, 0.0, 1.0)
    cone_x = 0.04 + 0.82 * (t ** 0.70)
    along_fade = np.clip(t / 0.06, 0.0, 1.0) * ((1.0 - t) ** 1.10)

    d_wake = np.abs(ax - cone_x)
    m_deep_wing = np.exp(-((d_wake / 0.095) ** 2)) * along_fade
    m_cyan_wing = np.exp(-((d_wake / 0.052) ** 2)) * along_fade
    m_white_edge = np.exp(-(((ax - (cone_x - 0.015)) / 0.026) ** 2)) * along_fade

    # 内侧紧贴箭杆的高速气流束 + 一圈音爆小涡环 (vn = 0.42)
    cone2_x = 0.02 + 0.36 * (t ** 0.78)
    m_inner = np.exp(-((np.abs(ax - cone2_x) / 0.055) ** 2)) * along_fade * 0.82
    ell = np.hypot(ux / 0.50, (vn - 0.40) / 0.060)
    m_ring = np.exp(-(((ell - 1.0) / 0.18) ** 2)) * 0.88

    # 箭头鼻端十字破甲寒星 (vn = 0.11)
    d_tip = np.hypot(ux * 1.15, (vn - 0.11) * 2.2)
    m_tip_glow = np.exp(-((d_tip / 0.22) ** 2))
    m_tip_core = np.exp(-((d_tip / 0.11) ** 2))

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("0A76BC")[None, None, :], np.clip(np.maximum.reduce([m_deep_wing, m_inner * 0.8, m_tip_glow * 0.85]), 0.0, 1.0))
    col = blend(col, rgb("24DCFF")[None, None, :], np.clip(np.maximum.reduce([m_cyan_wing, m_inner, m_ring, m_tip_glow]), 0.0, 1.0))
    col = blend(col, rgb("F5FFFF")[None, None, :], np.clip(np.maximum.reduce([m_white_edge, m_ring * 0.65, m_tip_core]), 0.0, 1.0))

    alpha = np.clip(
        np.maximum.reduce([m_deep_wing * 0.84, m_cyan_wing * 0.95, m_white_edge, m_inner * 0.85, m_ring * 0.90, m_tip_glow * 0.95]),
        0.0,
        1.0,
    )
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_spear_cone() -> Image.Image:
    """长枪/重拳突刺高对比双环钻风锥（标准 Alpha 混合，深海蓝底托 + 冰青螺旋音爆双环 + 纯白枪芒）。"""
    bw, bh = 240, 304
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = (w - 1) * 0.5
    vn = y / float(h)
    ux = (x - cx) / (bw * 0.5 * SS)
    ax = np.abs(ux)

    t = np.clip((vn - 0.07) / 0.85, 0.0, 1.0)
    cone_x = 0.04 + 0.84 * (t ** 0.66)
    along_fade = np.clip(t / 0.06, 0.0, 1.0) * ((1.0 - t) ** 1.15)
    m_deep = np.exp(-((np.abs(ax - cone_x) / 0.095) ** 2)) * along_fade
    m_cyan = np.exp(-((np.abs(ax - cone_x) / 0.050) ** 2)) * along_fade

    m_rings = np.zeros((h, w), dtype=np.float32)
    for ry, rx_w, strength in [(0.34, 0.48, 0.95), (0.58, 0.70, 0.82)]:
        ell = np.hypot(ux / rx_w, (vn - ry) / 0.068)
        mr = np.exp(-(((ell - 1.0) / 0.18) ** 2)) * strength
        m_rings = np.maximum(m_rings, mr)

    d_tip = np.hypot(ux * 1.15, (vn - 0.10) * 2.2)
    m_tip = np.exp(-((d_tip / 0.20) ** 2))

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("0974BA")[None, None, :], np.clip(np.maximum(m_deep, m_rings * 0.85), 0.0, 1.0))
    col = blend(col, rgb("24DCFF")[None, None, :], np.clip(np.maximum.reduce([m_cyan, m_rings, m_tip]), 0.0, 1.0))
    col = blend(col, rgb("F5FFFF")[None, None, :], np.clip(np.maximum.reduce([m_cyan * 0.65, m_rings * 0.65, np.exp(-((d_tip / 0.10) ** 2))]), 0.0, 1.0))

    alpha = np.clip(np.maximum.reduce([m_deep * 0.84, m_cyan * 0.95, m_rings * 0.92, m_tip]), 0.0, 1.0)
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for name, fn in [
        ("fx_spin_vortex.png", make_spin_vortex),
        ("fx_arrow_cone.png", make_arrow_cone),
        ("fx_spear_cone.png", make_spear_cone),
    ]:
        im = fn()
        im.save(os.path.join(OUT, name), optimize=True)
        print(f"wrote {name:20s} {im.size}")


if __name__ == "__main__":
    main()
