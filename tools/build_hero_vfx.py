"""英雄品级专属商业化特效纹理与序列帧生成器（配合 Liangshan/FxUber Shader + WorldFx.Flipbook）。

输出到 Assets/Resources/Art/：
  fx_spear_thrust_lut.png  512x192 长枪突刺破阵枪罡 LUT（u: 0枪尾->1枪尖；双螺旋盘龙气带 + 双道音爆激波环 + 锋锐破空锥）
  fx_bolt_wing_lut.png     320x320 史诗/传说箭矢燕翼破云激波套 LUT（尖朝上，留出箭头视窗，两侧后掠双翼气刃 + 尾流涡环）
  fx_tornado_lut.png       320x448 传说樊瑞立体龙卷风柱 LUT（锥形螺旋上升风带，供 FxUber 高速横向滚动出 3D 旋转风暴）
  fx_fire_pool_lut.png     384x384 魏定国猛火油海 / 秦明熔岩火潭贴地 LUT（外圈焦黑油边 + 内圈翻涌火舌，供 FxUber 噪波燃烧）
  fx_chain_rope.png        256x64  传说扈三娘红锦缚龙索流金红绸绳段（横向无缝平铺）
  fx_sheet_lightning.png   1024x1024 (4x4=16帧) 公孙胜天罡狂雷体积序列帧
  fx_sheet_explosion.png   1024x1024 (4x4=16帧) 秦明/凌振高动态体积火云爆破序列帧

用法：python3 tools/build_hero_vfx.py
"""
import os
import sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets/Resources/Art")

from build_uber_fx import make_explosion_sheet, make_lightning_sheet, fbm2d


def gauss(d, s):
    return np.exp(-((d / s) ** 2))


def make_spear_thrust_lut():
    """512x192 横向突刺枪罡 LUT（u: 0=尾 -> 1=枪尖）。
    R/G/B 存核心亮度（供 FxUber 映射 _Color 外罡 与 _CoreColor 亮芯），A 存轮廓透明度。
    枪尖留锋、两侧缠绕双股盘龙螺旋气带与两道超音速激波环，彻底告别死板扁光条！
    """
    SS = 2
    bw, bh = 512, 192
    W, H = bw * SS, bh * SS
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    u = xx / (W - 1)                      # 0 = tail, 1 = tip
    v = (yy / (H - 1) - 0.5) * 2.0        # -1..+1 across width
    av = np.abs(v)

    nz = fbm2d(H, W, [(48, 1.0), (24, 0.55), (12, 0.28)], 311)

    # Mach shock cone expanding backward from tip u=0.96 toward tail
    t_back = np.clip((0.96 - u) / 0.90, 0.0, 1.0)
    cone_w = 0.04 + 0.78 * (t_back ** 0.62)
    along = np.clip((0.98 - u) / 0.04, 0.0, 1.0) * np.clip(u / 0.22, 0.0, 1.0) ** 0.85

    # Outer swept shock wings
    wing = gauss(av - cone_w, 0.075 + 0.05 * t_back) * along * (1.0 - 0.35 * t_back)
    wing_sharp = gauss(av - (cone_w - 0.02), 0.028) * along * (1.0 - 0.25 * t_back)

    # Twin helical dragon ribbons coiling around central spear axis!
    phase = u * 15.5
    h1_y = np.sin(phase) * (0.12 + 0.34 * np.sin(np.clip(t_back * 1.15, 0, 1) * np.pi))
    h2_y = -h1_y
    helix1 = gauss(v - h1_y, 0.068) * along * (0.65 + 0.35 * np.cos(phase))
    helix2 = gauss(v - h2_y, 0.058) * along * (0.65 - 0.35 * np.cos(phase))

    # Central focused thrust spine (narrows sharply near tip so spearhead stays crisp!)
    spine = gauss(av, 0.085 + 0.08 * t_back) * np.clip((0.92 - u) / 0.08, 0.0, 1.0) * np.clip(u / 0.16, 0.0, 1.0)
    spine_core = gauss(av, 0.032) * np.clip((0.95 - u) / 0.05, 0.0, 1.0) * np.clip((u - 0.12) / 0.25, 0.0, 1.0)

    # Two supersonic Mach rings at u=0.74 and u=0.50
    rings = np.zeros_like(u)
    for ru, rw, strength in [(0.74, 0.36, 0.95), (0.50, 0.56, 0.78)]:
        ell = np.hypot((u - ru) / 0.042, v / rw)
        rings = np.maximum(rings, gauss(ell - 1.0, 0.19) * strength)

    streaks = gauss(np.sin(v * 18.0 + nz * 2.5), 0.25) * gauss(av, 0.48) * along * 0.38

    alpha = np.clip(
        np.maximum.reduce([wing * 0.92, wing_sharp, helix1 * 0.95, helix2 * 0.88, spine * 0.85, rings * 0.92]) + streaks * 0.35,
        0.0, 1.0
    )
    alpha *= np.clip((1.0 - av) / 0.06, 0.0, 1.0) * (0.82 + 0.28 * nz)
    alpha = np.clip(alpha, 0.0, 1.0)

    core = np.clip(
        np.maximum.reduce([wing_sharp * 0.95, helix1 * 0.85, helix2 * 0.78, spine_core * 1.15, rings * 0.80]),
        0.0, 1.0
    )
    arr = np.dstack([core, core, core, alpha])
    im = Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))
    return im.resize((bw, bh), Image.Resampling.LANCZOS)


def make_bolt_wing_lut():
    """320x320 史诗/传说箭矢后掠双翼破云激波 LUT（尖朝上 y=0）。
    正中箭头区留出通透窗口绝不糊住箭头，两侧张开锐利燕尾双层气翼 + 箭尾涡环。
    """
    SS = 2
    bw = bh = 320
    W = H = bw * SS
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    vn = yy / (H - 1)                     # 0 = top tip, 1 = bottom tail
    ux = (xx - (W - 1) * 0.5) / (W * 0.5) # -1..1
    ax = np.abs(ux)

    # Swept-back outer swallow wings starting behind arrowhead (vn = 0.14..0.92)
    t = np.clip((vn - 0.12) / 0.80, 0.0, 1.0)
    wing_x = 0.08 + 0.80 * (t ** 0.68)
    fade = np.clip(t / 0.07, 0.0, 1.0) * ((1.0 - t) ** 1.05)

    w1 = gauss(ax - wing_x, 0.075) * fade
    w1_core = gauss(ax - (wing_x - 0.018), 0.025) * fade

    # Secondary inner feather-wake blades
    t2 = np.clip((vn - 0.24) / 0.70, 0.0, 1.0)
    wing2_x = 0.06 + 0.44 * (t2 ** 0.75)
    fade2 = np.clip(t2 / 0.08, 0.0, 1.0) * ((1.0 - t2) ** 0.95)
    w2 = gauss(ax - wing2_x, 0.052) * fade2 * 0.88
    w2_core = gauss(ax - (wing2_x - 0.012), 0.020) * fade2 * 0.90

    # Slipstream ring around mid-tail (vn = 0.56), leaving top arrowhead 100% clear!
    ell = np.hypot(ux / 0.46, (vn - 0.56) / 0.055)
    ring = gauss(ell - 1.0, 0.18) * 0.86

    # Subtle tip star halo ahead of tip (vn = 0.07)
    d_tip = np.hypot(ux * 1.4, (vn - 0.07) * 2.8)
    tip_star = gauss(d_tip, 0.13) * 0.65

    alpha = np.clip(np.maximum.reduce([w1 * 0.92, w1_core, w2, ring, tip_star]), 0.0, 1.0)
    core = np.clip(np.maximum.reduce([w1_core * 1.05, w2_core * 0.92, ring * 0.75, gauss(d_tip, 0.06) * 0.9]), 0.0, 1.0)
    arr = np.dstack([core, core, core, alpha])
    return Image.fromarray((arr * 255).astype(np.uint8)).resize((bw, bh), Image.Resampling.LANCZOS)


def make_tornado_lut():
    """320x448 传说樊瑞立体螺旋龙卷风柱 LUT（底端 y=H-1 为风眼接地处，顶端 y=0 为风暴散逸冠）。"""
    SS = 2
    bw, bh = 320, 448
    W, H = bw * SS, bh * SS
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    hgt = 1.0 - yy / (H - 1)              # 0 = ground bottom, 1 = top crown
    ux = (xx - (W - 1) * 0.5) / (W * 0.5) # -1..1

    # S-curve sway + funnel expansion from narrow ground base (0.24) to wide crown (0.86)
    sway = 0.07 * np.sin(hgt * 5.2)
    rad = 0.20 + 0.66 * (hgt ** 0.68)
    nx = (ux - sway) / np.maximum(rad, 0.05)
    anx = np.abs(nx)

    nz = fbm2d(H, W, [(40, 1.0), (20, 0.55), (10, 0.30)], 521)

    # Cylindrical volume silhouette + crisp rim
    inside = np.clip((1.02 - anx) / 0.16, 0.0, 1.0)
    v_fade = np.clip(hgt / 0.06, 0.0, 1.0) * np.clip((1.0 - hgt) / 0.14, 0.0, 1.0)

    # Helical wind-blade bands wrapping up the funnel
    theta = np.arcsin(np.clip(nx, -1.0, 1.0))
    bands1 = 0.5 + 0.5 * np.cos(theta * 2.0 + hgt * 18.0 + nz * 2.4)
    bands2 = 0.5 + 0.5 * np.cos(theta * 3.0 - hgt * 13.0 + nz * 1.8)
    blade_ribbon = np.maximum(bands1 ** 3.2, (bands2 ** 4.0) * 0.85)

    # Rim lighting on edges of cylinder gives 3D volume!
    rim = np.exp(-(((anx - 0.78) / 0.18) ** 2)) * 0.75
    ground_swirl = np.exp(-((hgt / 0.12) ** 2)) * np.exp(-((ux / 0.52) ** 2)) * 0.85

    alpha = np.clip((0.34 + 0.56 * blade_ribbon + rim * 0.45) * inside * v_fade + ground_swirl * 0.6, 0.0, 1.0)
    core = np.clip((blade_ribbon * 0.90 + rim * 0.55) * inside * v_fade + ground_swirl * 0.7, 0.0, 1.0)
    arr = np.dstack([core, core, core, alpha])
    return Image.fromarray((arr * 255).astype(np.uint8)).resize((bw, bh), Image.Resampling.LANCZOS)


def make_fire_pool_lut():
    """384x384 魏定国猛火油海 / 熔岩火潭贴地 LUT（供 FxUber 噪波溶解与双色火舌燃烧）。"""
    N = 384
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    ux = (xx - (N - 1) * 0.5) / (N * 0.5)
    uy = (yy - (N - 1) * 0.5) / (N * 0.5)
    r = np.hypot(ux, uy)
    ang = np.arctan2(uy, ux)

    n1 = fbm2d(N, N, [(48, 1.0), (24, 0.6), (12, 0.35)], 607)
    n2 = fbm2d(N, N, [(28, 1.0), (14, 0.55), (7, 0.30)], 733)

    # Irregular splashed oil puddle boundary
    lobes = 0.78 + 0.14 * np.sin(ang * 5.0 + n1 * 3.2) + 0.08 * np.cos(ang * 9.0 - n2 * 2.5)
    alpha = np.clip((lobes - r) / 0.14, 0.0, 1.0) * (0.65 + 0.35 * n1)
    alpha = np.clip(alpha * 1.18, 0.0, 1.0)

    # Bright licking flame ridges & hot center pockets
    ridges = (1.0 - np.abs(n2 * 2.0 - 1.0)) ** 2.2
    ring_fire = gauss(r - lobes * 0.72, 0.16) * 0.75
    center_hot = np.clip(1.0 - r / 0.68, 0.0, 1.0) ** 1.4
    core = np.clip((ridges * 0.72 + ring_fire * 0.55 + center_hot * 0.55) * (alpha > 0.05), 0.0, 1.0)

    arr = np.dstack([core, core, core, alpha])
    return Image.fromarray((arr * 255).astype(np.uint8))


def make_chain_rope():
    """256x64 扈三娘红锦缚龙索横向平铺丝绸金线绳纹理。"""
    W, H = 256, 64
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    u = xx / W
    v = (yy / (H - 1) - 0.5) * 2.0  # -1..1

    twist = np.sin(u * 2.0 * np.pi * 6.0 + v * 1.8)
    half_w = 0.42 + 0.06 * np.sin(u * 2.0 * np.pi * 12.0)
    outline = np.clip((half_w + 0.14 - np.abs(v)) * (H * 0.5) / 1.5, 0.0, 1.0)
    fill = np.clip((half_w - np.abs(v)) * (H * 0.5) / 1.5, 0.0, 1.0)

    # Dark crimson outline (#3C0808), rich scarlet silk (#DF2824), gold braided thread (#FFD458)
    c_edge = np.array([60, 8, 8], np.float32)
    c_silk = np.array([224, 38, 34], np.float32)
    c_hi = np.array([255, 138, 118], np.float32)
    c_gold = np.array([255, 218, 92], np.float32)

    shade = np.clip(0.5 + 0.5 * twist, 0.0, 1.0)[..., None]
    gold_band = (np.exp(-(((twist - 0.85) / 0.18) ** 2)) * np.clip(1.0 - np.abs(v) / half_w, 0.0, 1.0))[..., None]
    spec = np.exp(-(((v + 0.16) / 0.16) ** 2))[..., None] * 0.45

    body = c_silk * (0.72 + 0.28 * shade) + (c_hi - c_silk) * spec
    body = body * (1.0 - gold_band * 0.85) + c_gold * (gold_band * 0.85)
    col = c_edge * (1.0 - fill[..., None]) + body * fill[..., None]

    out = np.dstack([np.clip(col, 0, 255), np.clip(outline * 255.0, 0, 255)]).astype(np.uint8)
    return Image.fromarray(out)


def make_arrow_blast():
    """256x256 爆裂箭 / 轻量小火药爆星专属贴图：
    清脆锐利的八芒火药星瓣 + 纤细赤橙破片冲击环，无厚重黑烟蘑菇云，专配小半径箭簇爆裂与副弹轻爆。
    """
    SS = 2
    bw = bh = 256
    N = bw * SS
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    ux = (xx - (N - 1) * 0.5) / (N * 0.5)
    uy = (yy - (N - 1) * 0.5) / (N * 0.5)
    r = np.hypot(ux, uy)
    ang = np.arctan2(uy, ux)

    # 4 primary long crisp spikes + 4 secondary diagonal spikes
    sp4 = np.abs(np.cos(ang * 2.0)) ** 7.0
    sp_diag = np.abs(np.sin(ang * 2.0)) ** 9.0
    reach = 0.24 + 0.56 * sp4 + 0.34 * sp_diag
    star = np.clip((reach - r) / np.maximum(0.08, reach * 0.28), 0.0, 1.0) ** 1.35

    # Crisp thin gunpowder shock ring at r = 0.62
    ring = gauss(r - 0.62, 0.048) * (0.72 + 0.28 * np.cos(ang * 6.0 + 0.7)) * np.clip((0.92 - r) / 0.12, 0.0, 1.0)
    core_ball = gauss(r, 0.19)

    c_edge = np.array([150, 34, 10], np.float32)
    c_orange = np.array([255, 118, 28], np.float32)
    c_gold = np.array([255, 214, 78], np.float32)
    c_white = np.array([255, 252, 236], np.float32)

    heat = np.clip(np.maximum(star * 0.92, ring * 0.78) + core_ball * 0.65, 0.0, 1.0)
    k1 = np.clip(heat / 0.35, 0.0, 1.0)[..., None]
    k2 = np.clip((heat - 0.35) / 0.38, 0.0, 1.0)[..., None]
    k3 = np.clip((heat - 0.73) / 0.27, 0.0, 1.0)[..., None]
    col = c_edge * (1.0 - k1) + c_orange * k1
    col = col * (1.0 - k2) + c_gold * k2
    col = col * (1.0 - k3) + c_white * k3

    alpha = np.clip(np.maximum.reduce([star * 0.96, ring * 0.88, core_ball * 0.95]), 0.0, 1.0)
    alpha *= np.clip((0.96 - r) / 0.08, 0.0, 1.0)
    arr = np.dstack([col / 255.0, alpha])
    return Image.fromarray((np.clip(arr, 0.0, 1.0) * 255).astype(np.uint8)).resize((bw, bh), Image.Resampling.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ("fx_spear_thrust_lut", make_spear_thrust_lut),
        ("fx_bolt_wing_lut", make_bolt_wing_lut),
        ("fx_tornado_lut", make_tornado_lut),
        ("fx_fire_pool_lut", make_fire_pool_lut),
        ("fx_chain_rope", make_chain_rope),
        ("fx_arrow_blast", make_arrow_blast),
        ("fx_sheet_lightning", make_lightning_sheet),
        ("fx_sheet_explosion", make_explosion_sheet),
    ]
    for name, fn in jobs:
        im = fn()
        im.save(os.path.join(OUT, name + ".png"), optimize=True)
        print(f"wrote {name:24s} {im.size}")


if __name__ == "__main__":
    main()
