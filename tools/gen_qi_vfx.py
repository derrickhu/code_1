"""生成 1:1 像素级对标《永远的蔚蓝星球》特写图的主公剑气动态贴图组（2x 超采样抗锯齿）：
严格依据特写实拍图采样色盘与圆拱水幕几何重构：
1. fx_qi_dome_body.png    (512x512)  : 圆拱半圆顶 + 垂直垂落水幕侧壁；顶冠咬合处深天蔚蓝(#16A0FF) -> 上腹清澈亮青绿松石(#22DCFA) -> 中下腹半透海青蓝(#1692C4 -> #1C78AC，绝不发黑紫！)，U型中空半透肚腹 + 宽幅丝绸水瀑笔触尾翼
2. fx_qi_dome_streaks.png (2048x512) : 4帧逐帧向下倾泻的顺滑拉丝青白水瀑流带图集（配合 FxUber 纵向层流滚动，杜绝果冻扭曲）
3. fx_qi_dome_sonic.png   (512x512)  : 轻盈半透暖杏金/香槟破空气浪肩纱(#FFE2B8 -> #F2AF82) + 尾流底部精致紫晶横裂隙(#9E28FF)
4. fx_qi_crest_sheet.png  (2048x512) : 4帧赛璐珞象牙白(#FAFFF8)渐变浅柠香槟金(#F3F3AE)三叉皇冠浪冠 + 正中镂空天青菱形纹章(◇, #32BCF8) + 两侧修长弯月颊翼
5. fx_qi_flare_v.png      (256x256)  : 纤细针芒状四芒星（竖放作左侧电青星芒针，横放作受击镜头白炽十字耀斑）
6. fx_qi_slash_red.png    (256x256)  : 鲜亮绯红弯月破甲斩痕（带粉白高光刃口）
"""
import os
import numpy as np
from PIL import Image

ART = os.path.join(os.path.dirname(__file__), "..", "Assets", "Resources", "Art")


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / np.maximum(1e-6, e1 - e0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def downsample(rgba_float, out_w, out_h):
    """预乘 Alpha 2x 超采样下采样，边缘纯净锐利无杂色。"""
    arr = np.clip(rgba_float, 0.0, 1.0)
    pm = np.concatenate([arr[..., :3] * arr[..., 3:4], arr[..., 3:4]], axis=-1)
    im = Image.fromarray(np.round(pm * 255.0).astype(np.uint8)).resize((out_w, out_h), Image.LANCZOS)
    rs = np.asarray(im, dtype=np.float32) / 255.0
    a = rs[..., 3:4]
    rgb = np.where(a > 1e-3, np.clip(rs[..., :3] / np.maximum(a, 1e-3), 0.0, 1.0), 0.0)
    a_clean = np.where(a < 0.006, 0.0, a)
    out = np.concatenate([rgb, a_clean], axis=-1)
    return Image.fromarray(np.round(out * 255.0).astype(np.uint8))


def dome_arch_y(xn):
    """参考图同款圆润半圆拱顶曲线：顶点 y=0.105 平滑圆润，至 |xn|=1 (y=0.365) 顺滑过渡为垂直水幕侧壁。"""
    u = np.clip(np.abs(xn), 0.0, 1.08)
    circ = 1.0 - np.sqrt(np.maximum(0.0, 1.0 - np.minimum(1.0, u * 0.985) ** 2))
    extra = np.maximum(0.0, u - 1.0) * 0.45
    return 0.105 + 0.260 * circ + extra


def crown_prongs_thickness(dx, xn, phase=0.0):
    """参考图标志性皇冠内沿：仅正中(|xn|<0.22)塑出饱满大气的三尖莲冠托住 ◇ 印记，两侧翼保持圆润顺滑新月弧（告别细碎冰刺感）！"""
    ax = np.abs(xn)
    # 饱满顺滑的圆拱新月冠底，向两侧肩翼平滑收尖
    base = 0.040 * np.maximum(0.0, 1.0 - 0.52 * (ax ** 1.55))
    # 正中饱满主尖齿（稳稳托住 ◇ 底部）
    c_prong = 0.052 * np.maximum(0.0, 1.0 - ax / 0.115) ** 1.35
    # 紧贴正中主齿两侧的短促精致护肩小尖角（|xn| ≈ 0.165，形成紧凑大气的皇冠徽章，不在外翼乱长细刺！）
    wobble = 0.004 * np.sin(phase)
    s_dist = np.abs(ax - (0.165 + wobble))
    s_prong = (0.024 + 0.004 * np.cos(phase)) * np.maximum(0.0, 1.0 - s_dist / 0.058) ** 1.4
    # 肩部顺滑延伸的修长弯月颊翼
    cheek = 0.022 * np.exp(-((ax - 0.76) / 0.22) ** 2) * (1.0 - smoothstep(0.95, 1.04, ax))
    return (base + c_prong + s_prong + cheek) * (1.0 - smoothstep(0.97, 1.05, ax))


def make_dome_body():
    N = 1024
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) / (N - 1.0)
    dx = xx - 0.5

    # 上圆拱、下垂直微收束的水幕宽度：上部半宽 0.330，下部几乎垂直略微内收至 0.308（还原参考图垂直水幕外壁！）
    half_w = 0.332 - 0.022 * smoothstep(0.36, 0.88, yy)
    xn = dx / half_w
    ax = np.abs(xn)
    arch = dome_arch_y(xn)
    depth = yy - arch

    inside_w = 1.0 - smoothstep(0.92, 1.02, ax)
    front_in = smoothstep(-0.004, 0.016, depth)

    # 宽幅手绘水瀑笔触（7 道宽窄错落的顺滑丝绸水带，顶部顺圆拱微收，中下部垂直垂落，绝不用高频细条码！）
    top_pull = 1.0 + 0.22 * (1.0 - smoothstep(0.12, 0.42, yy))
    ux = xn * top_pull
    # 叠加几道非对称宽笔触
    b1 = 0.5 + 0.5 * np.cos(ux * np.pi * 3.2 - 0.25)
    b2 = 0.5 + 0.5 * np.sin(ux * np.pi * 5.6 + 0.85)
    b3 = 0.5 + 0.5 * np.cos(ux * np.pi * 8.8 - 1.40)
    brush = 0.50 * b1 + 0.32 * b2 + 0.18 * b3

    # 左右两侧水幕壁加厚提亮，正中肚腹半透留空（还原参考图中腹能清晰透出地面石砖与骨头的通透玻璃水幕感！）
    wall_rim = smoothstep(0.50, 0.88, ax) * (1.0 - smoothstep(0.95, 1.03, ax))
    belly_hollow = (1.0 - smoothstep(0.0, 0.68, ax)) * smoothstep(0.16, 0.36, depth)

    # 参差顺滑的水瀑尾摆长度：两侧壁与主笔触垂得更长（至 y≈0.88），中上腹保持浓郁通透青蓝直至过半身后再丝滑羽化
    tail_reach = 0.62 + 0.14 * b1 + 0.08 * b2 + 0.09 * wall_rim - 0.05 * belly_hollow
    tail_fade = 1.0 - smoothstep(tail_reach * 0.56, tail_reach, depth)

    # === 兼顾亮黄砂岩砖路与深色地砖的高饱和清澈色盘（皇冠天蔚蓝咬合 -> 亮青绿松石 -> 宝石海青蓝）===
    c_azure_bite = np.array([0.04, 0.56, 1.00], dtype=np.float32)   # #0A8FFF 皇冠下沿鲜亮天蔚蓝
    c_aqua_hi    = np.array([0.09, 0.85, 0.99], dtype=np.float32)   # #17D9FC 上腹清澈亮青绿松石
    c_teal_mid   = np.array([0.03, 0.56, 0.84], dtype=np.float32)   # #088FD6 中腹浓郁宝石海青蓝（压住亮黄地面不发灰绿）
    c_ocean_tail = np.array([0.06, 0.41, 0.74], dtype=np.float32)   # #0F69BD 下摆深海蔚蓝水幕
    c_wall_cyan  = np.array([0.22, 0.84, 1.00], dtype=np.float32)   # #38D6FF 两侧水幕壁亮天青描边
    c_base_indigo = np.array([0.28, 0.22, 0.86], dtype=np.float32)  # #4738DC 内杯底一抹轻柔靛蓝尾韵

    k1 = smoothstep(0.015, 0.085, depth)[..., None]
    k2 = smoothstep(0.10, 0.28, depth)[..., None]
    k3 = smoothstep(0.26, 0.56, depth)[..., None]

    col = c_azure_bite * (1.0 - k1) + c_aqua_hi * k1
    col = col * (1.0 - k2) + c_teal_mid * k2
    col = col * (1.0 - k3) + c_ocean_tail * k3

    indigo_pocket = np.exp(-((xn / 0.42) ** 2 + ((yy - 0.68) / 0.070) ** 2)) * 0.42
    col = col * (1.0 - indigo_pocket[..., None]) + c_base_indigo * indigo_pocket[..., None]

    # 叠加宽笔触明暗层次与两侧亮青水壁
    brush_hi = (brush ** 1.55) * (1.0 - smoothstep(0.05, 0.56, depth))
    col = col * (0.86 + 0.24 * brush[..., None]) + c_aqua_hi * (brush_hi[..., None] * 0.24)
    col = col * (1.0 - wall_rim[..., None] * 0.48) + c_wall_cyan * (wall_rim[..., None] * 0.48)
    col = np.clip(col, 0.0, 1.0)

    # 透明度曲线：上中段饱满浓郁（0.95 -> 0.82，在浅黄砖路上依旧湛蓝透亮，同时隐约透出地面砖缝），尾摆丝滑羽化归零
    base_op = 0.96 - 0.14 * belly_hollow - 0.08 * smoothstep(0.22, 0.54, depth) + 0.12 * wall_rim
    alpha = front_in * inside_w * tail_fade * base_op * (0.84 + 0.16 * brush)
    alpha = np.clip(alpha, 0.0, 0.96)

    downsample(np.dstack([col, alpha]), 512, 512).save(os.path.join(ART, "fx_qi_dome_body.png"))


def make_streaks_sheet():
    """2048x512 四帧逐帧向下奔涌的丝绸拉丝青白水瀑流带（无果冻弯曲，纯正纵向高速拉丝动态！）。"""
    N = 1024
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) / (N - 1.0)
    dx = xx - 0.5
    half_w = 0.332 - 0.022 * smoothstep(0.36, 0.88, yy)
    xn = dx / half_w
    ax = np.abs(xn)
    arch = dome_arch_y(xn)
    depth = yy - arch

    top_pull = 1.0 + 0.24 * (1.0 - smoothstep(0.12, 0.40, yy))
    ux = xn * top_pull

    # 固定几条优雅的纵向水瀑流道位置（左右侧壁各两条主力亮流带 + 腹内三条轻盈细流丝）
    centers = [-0.84, -0.58, -0.24, 0.06, 0.34, 0.62, 0.85]
    widths  = [ 0.055, 0.065, 0.050, 0.045, 0.055, 0.065, 0.055]
    weights = [ 0.90,  0.82,  0.52,  0.44,  0.58,  0.85,  0.92]
    freqs   = [ 3.0,   2.0,   3.0,   2.0,   3.0,   2.0,   3.0]
    phases0 = [ 0.2,   1.7,   3.1,   0.9,   2.4,   4.0,   1.1]

    envelope = smoothstep(0.015, 0.055, depth) * (1.0 - smoothstep(0.24, 0.72, depth)) * (1.0 - smoothstep(0.90, 1.01, ax))

    frames = []
    for fi in range(4):
        t_step = fi / 4.0  # 严格按整周期推进，4帧无缝循环向下倾泻！
        ribbon_sum = np.zeros((N, N), dtype=np.float32)
        hot_sum = np.zeros((N, N), dtype=np.float32)
        for c0, w0, wt, fq, p0 in zip(centers, widths, weights, freqs, phases0):
            # 每一帧流光团沿 depth 从冠部向尾部高速滑落
            travel = depth * fq * 2.0 * np.pi - t_step * 2.0 * np.pi + p0
            long_wave = (0.5 + 0.5 * np.cos(travel)) ** 1.8
            long_dart = (0.5 + 0.5 * np.cos(travel * 2.0 + 0.6)) ** 3.2
            lat = np.exp(-((ux - c0) / w0) ** 2)
            lat_thin = np.exp(-((ux - c0) / (w0 * 0.38)) ** 2)
            ribbon_sum += wt * lat * (0.42 + 0.58 * long_wave)
            hot_sum += wt * lat_thin * long_dart

        a = np.clip((ribbon_sum * 0.58 + hot_sum * 0.52) * envelope, 0.0, 0.92)
        whiteness = np.clip(hot_sum * 0.75, 0.0, 1.0)[..., None]
        c_aqua = np.array([0.30, 0.93, 1.00], dtype=np.float32)
        c_white = np.array([0.92, 0.99, 1.00], dtype=np.float32)
        col = c_aqua * (1.0 - whiteness) + c_white * whiteness
        frames.append(downsample(np.dstack([col, a]), 512, 512))

    sheet = Image.new("RGBA", (512 * 4, 512), (0, 0, 0, 0))
    for i, im in enumerate(frames):
        sheet.alpha_composite(im, (i * 512, 0))
    sheet.save(os.path.join(ART, "fx_qi_dome_streaks.png"))


def make_dome_sonic():
    """外圈轻盈暖杏香槟色破空气浪肩纱 + 尾流底部精致紫晶横裂隙（1:1 匹配特写图两侧柔和暖雾翼与底部紫光缝）。"""
    N = 1024
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) / (N - 1.0)
    dx = xx - 0.5

    # 外扩一圈的柔和圆拱破空纱翼（左右肩部 0.35..0.52 处最舒展通透，顶冠正中极薄不脏白冠）
    xn = dx / 0.405
    ax = np.abs(xn)
    bow = dome_arch_y(xn) - 0.014
    d_bow = yy - bow

    veil1 = smoothstep(-0.016, 0.008, d_bow) * (1.0 - smoothstep(0.012, 0.115 + 0.075 * (ax ** 2), d_bow))
    shoulder_emph = (0.28 + 0.72 * smoothstep(0.22, 0.72, ax)) * (1.0 - smoothstep(0.88, 1.12, ax)) * (1.0 - smoothstep(0.32, 0.56, yy))

    # 第二缕更外侧的轻薄气流丝（还原特写图左右两侧淡淡斜拉出去的两缕暖白风线）
    xn2 = dx / 0.445
    ax2 = np.abs(xn2)
    d_bow2 = yy - (dome_arch_y(xn2) - 0.010)
    wisp = smoothstep(-0.006, 0.003, d_bow2) * (1.0 - smoothstep(0.004, 0.032, d_bow2)) * smoothstep(0.35, 0.75, ax2) * (1.0 - smoothstep(0.92, 1.10, ax2)) * (1.0 - smoothstep(0.28, 0.50, yy))

    peach_a = np.clip(veil1 * shoulder_emph * 0.50 + wisp * 0.36, 0.0, 0.60)
    c_cream = np.array([1.00, 0.92, 0.76], dtype=np.float32)  # #FFEBC2
    c_peach = np.array([0.96, 0.68, 0.44], dtype=np.float32)  # #F5AD70
    k_sh = np.clip(ax, 0.0, 1.0)[..., None]
    peach_col = c_cream * (1.0 - k_sh * 0.65) + c_peach * (k_sh * 0.65)
    downsample(np.dstack([peach_col, peach_a]), 512, 512).save(os.path.join(ART, "fx_qi_dome_sonic.png"))


def make_crest_sheet():
    """2048x512 四帧赛璐珞象牙白+浅柠香槟金三叉皇冠浪冠 + 正中镂空天青菱形纹章(◇)。"""
    N = 1024
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) / (N - 1.0)
    dx = xx - 0.5
    xn = dx / 0.332
    ax = np.abs(xn)
    arch = dome_arch_y(xn)

    frames = []
    for fi in range(4):
        phase = fi * (np.pi * 0.5)
        thick = crown_prongs_thickness(dx, xn, phase)
        d = yy - arch

        # 顶冠前缘加一圈细腻暖琥珀金包边光晕，使纯白浅柠皇冠在亮黄砂岩砖地上也锐利醒目、绝不融底！
        halo = np.exp(-((d - 0.004) ** 2) / (0.015 ** 2)) * (1.0 - smoothstep(0.90, 1.05, ax)) * 0.48
        c_halo_gold = np.array([0.96, 0.68, 0.26], dtype=np.float32)

        # 干脆利落的赛璐珞皇冠本体遮罩
        in_crest = smoothstep(-0.004, 0.0035, d) * (1.0 - smoothstep(thick - 0.0045, thick + 0.0035, d)) * (1.0 - smoothstep(0.98, 1.04, ax))

        # 皇冠锯齿正下方紧咬一圈清澈冰青亮边（#6CEEFF），让象牙浅柠冠与天蔚蓝水体交界清脆分明
        cyan_lip = smoothstep(thick - 0.005, thick + 0.001, d) * (1.0 - smoothstep(thick + 0.003, thick + 0.018, d)) * (1.0 - smoothstep(0.92, 1.02, ax))

        # 皇冠本色：正中顶冠纯净象牙白(#FAFFF8) -> 向下沿及左右长弯月颊翼自然过渡为浅柠香槟奶油金(#F1F3AC -> #F6E69B)
        c_ivory = np.array([0.98, 1.00, 0.97], dtype=np.float32)  # #FAFFF7
        c_lemon = np.array([0.95, 0.95, 0.68], dtype=np.float32)  # #F2F3AD (实采样自特写图 #E9F1AE / #F6F2BD!)
        c_warm  = np.array([0.98, 0.88, 0.60], dtype=np.float32)  # #FAE099 颊翼尖端柔和香槟色
        c_lip   = np.array([0.38, 0.91, 1.00], dtype=np.float32)

        wing_k = smoothstep(0.18, 0.68, ax)
        edge_k = smoothstep(thick * 0.42, thick, np.maximum(0.0, d))
        lemon_mix = np.clip(wing_k * 0.78 + edge_k * 0.55, 0.0, 1.0)[..., None]
        tip_mix = smoothstep(0.65, 0.98, ax)[..., None]
        crest_col = c_ivory * (1.0 - lemon_mix) + c_lemon * lemon_mix
        crest_col = crest_col * (1.0 - tip_mix * 0.45) + c_warm * (tip_mix * 0.45)

        # === 正中镂空天青菱形纹章（◇）：严格匹配特写图尺寸比例与冰青描边+浅亮内芯 ===
        d_scale = 1.0 + 0.035 * np.sin(phase)
        dy_d = (yy - 0.148) / (0.036 * d_scale)
        dx_d = dx / (0.0185 * d_scale)
        manh = np.abs(dx_d) + np.abs(dy_d)
        dia_outer = 1.0 - smoothstep(0.93, 1.06, manh)
        dia_hole  = 1.0 - smoothstep(0.42, 0.55, manh)
        dia_stroke = np.clip(dia_outer - dia_hole, 0.0, 1.0)

        c_dia_border = np.array([0.20, 0.74, 0.97], dtype=np.float32)  # #33BDF7 精准还原特写图青蓝菱形框
        c_dia_inner  = np.array([0.85, 0.97, 0.99], dtype=np.float32)  # #D9F7FC 清透冰白内窗
        dia_col = c_dia_border * (1.0 - dia_hole[..., None]) + c_dia_inner * dia_hole[..., None]

        # 合成单帧
        col = c_halo_gold * halo[..., None]
        a = halo.copy()

        a_lip = cyan_lip * 0.85
        col = col * (1.0 - a_lip[..., None]) + c_lip * a_lip[..., None]
        a = a + a_lip * (1.0 - a)

        col = col * (1.0 - in_crest[..., None]) + crest_col * in_crest[..., None]
        a = a + in_crest * (1.0 - a)

        col = col * (1.0 - dia_outer[..., None] * 0.96) + dia_col * (dia_outer[..., None] * 0.96)
        a = np.clip(np.maximum(a, dia_outer), 0.0, 1.0)

        rgb_unpm = np.where(a[..., None] > 1e-4, np.clip(col / np.maximum(a[..., None], 1e-4), 0.0, 1.0), 0.0)
        solid_rgb = crest_col * (1.0 - dia_outer[..., None] * 0.96) + dia_col * (dia_outer[..., None] * 0.96)
        rgb_final = np.where(in_crest[..., None] > 0.5, solid_rgb, rgb_unpm)
        frames.append(downsample(np.dstack([rgb_final, a]), 512, 512))

    sheet = Image.new("RGBA", (512 * 4, 512), (0, 0, 0, 0))
    for i, im in enumerate(frames):
        sheet.alpha_composite(im, (i * 512, 0))
    sheet.save(os.path.join(ART, "fx_qi_crest_sheet.png"))


def make_flare_and_red_slash():
    """纤细锐利镜头十字星芒 fx_qi_flare_v.png + 鲜红高光弯月破甲斩痕 fx_qi_slash_red.png。"""
    N = 512
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) / (N - 1.0)
    dx = np.abs(xx - 0.5)
    dy = np.abs(yy - 0.5)

    # 特写图同款：极细锐长主芒 + 短横芒 + 饱满菱形白芯 + 天青柔晕
    v_spike = np.exp(-(dx / 0.011) ** 1.45) * np.maximum(0.0, 1.0 - dy / 0.48) ** 1.65
    h_spike = np.exp(-(dy / 0.012) ** 1.45) * np.maximum(0.0, 1.0 - dx / 0.20) ** 1.9
    dia_core = np.maximum(0.0, 1.0 - (dx / 0.085 + dy / 0.115)) ** 1.5
    halo = np.exp(-((dx / 0.11) ** 2 + (dy / 0.20) ** 2)) * 0.40
    a = np.clip(v_spike + h_spike * 0.85 + dia_core * 0.98 + halo, 0.0, 1.0)
    whiteness = np.clip(v_spike * 0.85 + h_spike * 0.85 + dia_core * 1.1, 0.0, 1.0)[..., None]
    col = np.array([0.32, 0.86, 1.00], np.float32) * (1.0 - whiteness) + np.array([1.0, 1.0, 1.0], np.float32) * whiteness
    downsample(np.dstack([col, a]), 256, 256).save(os.path.join(ART, "fx_qi_flare_v.png"))

    # 绯红弯月破甲斩痕（外弧带炽亮珊瑚粉白锋刃，内腹纯正鲜红，还原特写图右侧鲜红刀痕！）
    sx = (xx - 0.5) * 2.0
    sy = (yy - 0.5) * 2.0
    r = np.sqrt(sx * sx + (sy + 0.52) ** 2)
    ang = np.arctan2(sy + 0.52, sx) - np.pi * 0.5
    span = 1.0 - smoothstep(0.58, 0.90, np.abs(ang))
    taper = np.maximum(0.0, 1.0 - (ang / 0.88) ** 2)
    r_outer = 0.92
    r_inner = 0.92 - 0.28 * taper
    slash = smoothstep(r_inner - 0.018, r_inner + 0.022, r) * (1.0 - smoothstep(r_outer - 0.014, r_outer + 0.014, r)) * span
    hot_rim = smoothstep(r_outer - 0.055, r_outer - 0.004, r) * slash
    s_col = np.array([1.00, 0.18, 0.20], np.float32) * (1.0 - hot_rim[..., None] * 0.72) + np.array([1.00, 0.82, 0.82], np.float32) * (hot_rim[..., None] * 0.72)
    downsample(np.dstack([s_col, np.clip(slash * 0.96, 0.0, 1.0)]), 256, 256).save(os.path.join(ART, "fx_qi_slash_red.png"))


if __name__ == "__main__":
    make_dome_body()
    make_streaks_sheet()
    make_dome_sonic()
    make_crest_sheet()
    make_flare_and_red_slash()
    print("GENERATED_QI_V2_OK")
