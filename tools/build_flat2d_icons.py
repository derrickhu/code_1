"""升级《村口大战外星人》根目录全部 82 枚 UI 图标（Assets/Resources/Art/{ic_*,eq_*,tab_*,totem_*}.png）：
1. 升级全套糖果条纹 Q 版宝箱（ic_chest, ic_chest_{wood,silver,gold}, ic_chest_open, ic_chest_{wood,silver}_open），校准为统一 #2B2338 暖深褐轮廓与清爽 2D 明度；
2. 4x 超采样扁平 2D 矢量重绘全部 17 枚旧版 3D/无描边/古风图标（ic_check, ic_active, ic_ad, ic_fast, ic_fist, ic_gear, ic_hand, ic_heart, ic_hourglass, ic_lock, ic_map, ic_rage, ic_refresh, ic_star, ic_thumb, ic_rank_chest, ic_rank_escort）；
3. 对其余现代乡村主题图标做无损 #2B2338 暗部轮廓色温统一（将死黑 #000000 描边柔和校准至 #2B2338，保持全游画风 100% 统一）。
"""
import os
import math
import glob
import shutil
import numpy as np
from PIL import Image, ImageDraw

C1_ART = "/Users/rosa/rosa_games/code_1/Assets/Resources/Art"
C2_ART = "/Users/rosa/rosa_games/code_2/Assets/Resources/Art"
SS = 4

INK = (43, 35, 56, 255)  # #2B2338


def rgba(h: str, a: int = 255) -> tuple:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def rgb_f(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)], dtype=np.float32)


def harmonize_outline_to_2b2338(im: Image.Image) -> Image.Image:
    """将贴图中过深的纯黑/冷黑描边平滑校准至 #2B2338 (43, 35, 56)，并微提赛璐珞明快度。"""
    arr = np.array(im.convert("RGBA"), dtype=np.float32)
    c = arr[:, :, :3]
    a = arr[:, :, 3]
    lum = 0.299 * c[:, :, 0] + 0.587 * c[:, :, 1] + 0.114 * c[:, :, 2]
    # 针对暗轮廓像素 (lum < 56) 向 #2B2338 靠拢
    dark_w = np.clip((56.0 - lum) / 42.0, 0.0, 1.0) * (a > 32).astype(np.float32)
    target = np.array([43.0, 35.0, 56.0], dtype=np.float32)[None, None, :]
    c_out = c * (1.0 - dark_w[:, :, None] * 0.78) + target * (dark_w[:, :, None] * 0.78)
    out = np.zeros_like(arr, dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(c_out), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a), 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def upgrade_q_chests():
    chest_files = [
        "ic_chest.png",
        "ic_chest_wood.png",
        "ic_chest_silver.png",
        "ic_chest_gold.png",
        "ic_chest_open.png",
        "ic_chest_wood_open.png",
        "ic_chest_silver_open.png",
    ]
    for fn in chest_files:
        src = os.path.join(C2_ART, fn)
        dst = os.path.join(C1_ART, fn)
        im = Image.open(src).convert("RGBA")
        # 缩放到统一清爽 256x256（原图 512x512 超清下采样更锐利，且包体更轻！）
        if im.size[0] > 256:
            im = im.resize((256, 256), Image.Resampling.LANCZOS)
        im = harmonize_outline_to_2b2338(im)
        im.save(dst, optimize=True)

        # 若是 code_1 新增的 _open 图标，同步补齐 Sprite .meta（不覆盖已有 .meta）
        meta_dst = dst + ".meta"
        meta_src = src + ".meta"
        if not os.path.exists(meta_dst) and os.path.exists(meta_src):
            shutil.copyfile(meta_src, meta_dst)
        print(f"Upgraded Q-chest {fn:26s} {im.size}")

    # ic_rank_chest.png 同步采用 Q 版皇冠金边红条纹荣誉宝箱
    base = Image.open(os.path.join(C2_ART, "ic_chest_gold.png")).convert("RGBA").resize((256, 256), Image.Resampling.LANCZOS)
    arr = np.array(base, dtype=np.float32)
    r, g, b, a = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2], arr[:, :, 3]
    # 将天蓝条纹与蓝宝石色相旋至喜庆珊瑚红宝石，区分关卡金箱与宝箱榜图标
    blue_mask = np.clip(((b - r) - 18.0) / 36.0, 0.0, 1.0) * (a > 40)
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    red_c = np.stack([np.clip(lum * 1.42 + 42, 0, 255), np.clip(lum * 0.48 + 8, 0, 255), np.clip(lum * 0.46 + 12, 0, 255)], axis=-1)
    arr[:, :, :3] = arr[:, :, :3] * (1.0 - blue_mask[:, :, None]) + red_c * blue_mask[:, :, None]
    rk_im = harmonize_outline_to_2b2338(Image.fromarray(np.clip(np.round(arr), 0, 255).astype(np.uint8)))
    rk_im.save(os.path.join(C1_ART, "ic_rank_chest.png"), optimize=True)
    print("Upgraded Q-chest ic_rank_chest.png")


def new_canvas(sz: int = 256):
    W = sz * SS
    im = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im), W


def finish_icon(im: Image.Image, name: str, sz: int = 256):
    out = im.resize((sz, sz), Image.Resampling.LANCZOS)
    out.save(os.path.join(C1_ART, name), optimize=True)
    print(f"Rebuilt flat-2D icon {name:24s} {out.size}")


def build_flat_icons():
    # 1. ic_check.png (256x256): 扁平 2D 翠绿圆章 + 粗白对勾 + #2B2338 描边
    im, dr, W = new_canvas()
    cx = cy = W // 2
    R = 104 * SS
    dr.ellipse([cx - R, cy - R + 6 * SS, cx + R, cy + R + 6 * SS], fill=rgba("1E8842"), outline=INK, width=7 * SS)
    dr.ellipse([cx - R, cy - R - 2 * SS, cx + R, cy + R - 2 * SS], fill=rgba("42D46E"), outline=INK, width=7 * SS)
    dr.pieslice([cx - R + 10 * SS, cy - R + 8 * SS, cx + R - 10 * SS, cy + R - 12 * SS], 200, 340, fill=rgba("7AF29E"))
    # 粗圆头白勾
    pts = [(78 * SS, 132 * SS), (114 * SS, 168 * SS), (182 * SS, 94 * SS)]
    dr.line([(x, y + 6 * SS) for x, y in pts], fill=rgba("1B7438"), width=28 * SS, joint="curve")
    dr.line(pts, fill=rgba("FFFFFF"), width=26 * SS, joint="curve")
    for px, py in pts:
        dr.ellipse([px - 13 * SS, py - 13 * SS, px + 13 * SS, py + 13 * SS], fill=rgba("FFFFFF"))
    finish_icon(im, "ic_check.png")

    # 2. ic_active.png (256x256): 扁平 2D 活跃度红绶带金章 + 火焰芯
    im, dr, W = new_canvas()
    cx = W // 2
    rib = [(86 * SS, 156 * SS), (70 * SS, 236 * SS), (104 * SS, 218 * SS), (128 * SS, 240 * SS), (128 * SS, 156 * SS)]
    rib_r = [(W - x, y) for x, y in rib]
    dr.polygon(rib, fill=rgba("E6463C"), outline=INK, width=6 * SS)
    dr.polygon(rib_r, fill=rgba("CC362E"), outline=INK, width=6 * SS)
    cy_m, rm = 108 * SS, 78 * SS
    dr.ellipse([cx - rm, cy_m - rm + 6 * SS, cx + rm, cy_m + rm + 6 * SS], fill=rgba("C88214"), outline=INK, width=7 * SS)
    dr.ellipse([cx - rm, cy_m - rm, cx + rm, cy_m + rm], fill=rgba("FFD44C"), outline=INK, width=7 * SS)
    dr.ellipse([cx - 58 * SS, cy_m - 58 * SS, cx + 58 * SS, cy_m + 58 * SS], fill=rgba("F5AE24"), outline=rgba("FFF4B8"), width=4 * SS)
    fl = [(cx, 62 * SS), (cx + 34 * SS, 106 * SS), (cx + 22 * SS, 144 * SS), (cx, 152 * SS), (cx - 22 * SS, 144 * SS), (cx - 34 * SS, 106 * SS)]
    dr.polygon(fl, fill=rgba("FF582E"), outline=INK, width=5 * SS)
    fl_in = [(cx, 88 * SS), (cx + 16 * SS, 116 * SS), (cx, 142 * SS), (cx - 16 * SS, 116 * SS)]
    dr.polygon(fl_in, fill=rgba("FFE66D"))
    finish_icon(im, "ic_active.png")

    # 3. ic_ad.png (256x256): 扁平 2D 红白场记板视频播放标
    im, dr, W = new_canvas()
    dr.rounded_rectangle([34 * SS, 76 * SS, 222 * SS, 224 * SS], radius=24 * SS, fill=rgba("D48A1E"), outline=INK, width=7 * SS)
    dr.rounded_rectangle([34 * SS, 68 * SS, 222 * SS, 214 * SS], radius=24 * SS, fill=rgba("FFD65A"), outline=INK, width=7 * SS)
    # 顶部红白斜条打板
    dr.rounded_rectangle([30 * SS, 36 * SS, 220 * SS, 84 * SS], radius=14 * SS, fill=rgba("E8483E"), outline=INK, width=7 * SS)
    for sx in (68, 126, 184):
        dr.polygon([(sx * SS, 40 * SS), ((sx + 24) * SS, 40 * SS), ((sx + 10) * SS, 80 * SS), ((sx - 14) * SS, 80 * SS)], fill=rgba("FFF8EC"))
    dr.line([(30 * SS, 84 * SS), (222 * SS, 84 * SS)], fill=INK, width=6 * SS)
    # 中央白色播放三角
    tri = [(106 * SS, 112 * SS), (164 * SS, 146 * SS), (106 * SS, 180 * SS)]
    dr.polygon(tri, fill=rgba("FFFFFF"), outline=INK, width=6 * SS)
    finish_icon(im, "ic_ad.png")

    # 4. ic_fast.png (256x256): 扁平 2D 双快进橙金箭头
    im, dr, W = new_canvas()
    for ox in (36, 120):
        pts = [(ox * SS, 52 * SS), ((ox + 98) * SS, 128 * SS), (ox * SS, 204 * SS)]
        dr.polygon([(x, y + 8 * SS) for x, y in pts], fill=rgba("C46812"), outline=INK, width=7 * SS)
        dr.polygon(pts, fill=rgba("FFAC2E"), outline=INK, width=7 * SS)
        dr.polygon([(ox * SS + 10 * SS, 68 * SS), ((ox + 82) * SS, 124 * SS), (ox * SS + 10 * SS, 124 * SS)], fill=rgba("FFE27A"))
    finish_icon(im, "ic_fast.png")

    # 5. ic_fist.png (256x256): 扁平 2D 散打红拳套
    im, dr, W = new_canvas()
    dr.rounded_rectangle([76 * SS, 166 * SS, 180 * SS, 228 * SS], radius=18 * SS, fill=rgba("C8322E"), outline=INK, width=7 * SS)
    dr.rounded_rectangle([84 * SS, 180 * SS, 172 * SS, 206 * SS], radius=8 * SS, fill=rgba("FFD85A"), outline=INK, width=5 * SS)
    dr.rounded_rectangle([46 * SS, 42 * SS, 206 * SS, 180 * SS], radius=54 * SS, fill=rgba("EC463E"), outline=INK, width=7 * SS)
    dr.pieslice([56 * SS, 50 * SS, 196 * SS, 140 * SS], 190, 350, fill=rgba("FF7A70"))
    # 拇指横扣
    dr.rounded_rectangle([42 * SS, 108 * SS, 128 * SS, 158 * SS], radius=24 * SS, fill=rgba("D63832"), outline=INK, width=6 * SS)
    finish_icon(im, "ic_fist.png")

    # 6. ic_gear.png (256x256): 扁平 2D 机械金齿轮 + 青蓝内芯
    im, dr, W = new_canvas()
    cx = cy = W // 2
    for k in range(8):
        ang = k * math.pi / 4.0
        tx, ty = cx + math.cos(ang) * 88 * SS, cy + math.sin(ang) * 88 * SS
        nx, ny = -math.sin(ang) * 22 * SS, math.cos(ang) * 22 * SS
        rx, ry = math.cos(ang) * 24 * SS, math.sin(ang) * 24 * SS
        tooth = [(tx - rx - nx, ty - ry - ny), (tx + rx - nx * 0.8, ty + ry - ny * 0.8), (tx + rx + nx * 0.8, ty + ry + ny * 0.8), (tx - rx + nx, ty - ry + ny)]
        dr.polygon(tooth, fill=rgba("F4B228"), outline=INK, width=7 * SS)
    dr.ellipse([cx - 82 * SS, cy - 82 * SS, cx + 82 * SS, cy + 82 * SS], fill=rgba("FFD44E"), outline=INK, width=7 * SS)
    dr.ellipse([cx - 46 * SS, cy - 46 * SS, cx + 46 * SS, cy + 46 * SS], fill=rgba("38B8A8"), outline=INK, width=7 * SS)
    dr.ellipse([cx - 20 * SS, cy - 20 * SS, cx + 20 * SS, cy + 20 * SS], fill=rgba("EAF6FA"), outline=INK, width=5 * SS)
    finish_icon(im, "ic_gear.png")

    # 7. ic_hand.png (256x256): 扁平 2D 卡通白手套点击引导手势
    im, dr, W = new_canvas()
    # 食指斜向左上
    dr.line([(122 * SS, 148 * SS), (72 * SS, 52 * SS)], fill=INK, width=50 * SS)
    dr.ellipse([47 * SS, 27 * SS, 97 * SS, 77 * SS], fill=INK)
    # 掌部与其余三指圆团
    dr.rounded_rectangle([74 * SS, 94 * SS, 208 * SS, 206 * SS], radius=48 * SS, fill=rgba("F6F8FC"), outline=INK, width=7 * SS)
    dr.line([(122 * SS, 148 * SS), (72 * SS, 52 * SS)], fill=rgba("FFFFFF"), width=36 * SS)
    dr.ellipse([54 * SS, 34 * SS, 90 * SS, 70 * SS], fill=rgba("FFFFFF"))
    dr.rounded_rectangle([62 * SS, 134 * SS, 118 * SS, 184 * SS], radius=24 * SS, fill=rgba("E8EEF6"), outline=INK, width=6 * SS)
    # 蓝色袖口
    dr.rounded_rectangle([114 * SS, 184 * SS, 212 * SS, 228 * SS], radius=16 * SS, fill=rgba("4CA8E8"), outline=INK, width=7 * SS)
    finish_icon(im, "ic_hand.png")

    # 8. ic_heart.png (256x256): 扁平 2D 翠绿生命爱心（带 #2B2338 描边与赛璐珞高光）
    im, dr, W = new_canvas()
    y, x = np.mgrid[0:W, 0:W].astype(np.float32)
    ux = (x - W * 0.5) / (88.0 * SS)
    uy = -(y - W * 0.54) / (88.0 * SS)
    # 经典圆润心形隐式方程
    hy = uy + 0.18
    f = (ux * ux + hy * hy - 0.68) ** 3 - (ux * ux) * (hy ** 3) * 1.35
    in_heart = f < 0.0
    from scipy.ndimage import distance_transform_edt
    dist_in = distance_transform_edt(in_heart)
    dist_out = distance_transform_edt(~in_heart)
    sd = np.where(in_heart, -dist_in, dist_out)
    sd_lip = np.roll(sd, int(6 * SS), axis=0)
    sd_lip[:int(6 * SS), :] = 1e9
    sd_u = np.minimum(sd, sd_lip)
    a = np.clip(0.5 - sd_u / 1.3, 0.0, 1.0)
    st = 6.5 * SS
    col = np.broadcast_to(rgb_f("2B2338"), (W, W, 3)).copy()
    m_lip = np.clip(0.5 - (sd_lip + st) / 1.3, 0.0, 1.0)
    m_face = np.clip(0.5 - (sd + st) / 1.3, 0.0, 1.0)
    cel = np.clip(((y / W) - 0.50) / 0.06, 0.0, 1.0)[:, :, None]
    fill = rgb_f("5CE882")[None, None, :] * (1.0 - cel) + rgb_f("2EC25A")[None, None, :] * cel
    col = col * (1.0 - m_lip[:, :, None]) + rgb_f("1B843A")[None, None, :] * m_lip[:, :, None]
    m_f_ink = np.clip(0.5 - sd / 1.3, 0.0, 1.0)
    col = col * (1.0 - m_f_ink[:, :, None]) + rgb_f("2B2338")[None, None, :] * m_f_ink[:, :, None]
    col = col * (1.0 - m_face[:, :, None]) + fill * m_face[:, :, None]
    gl = np.hypot(x - 92 * SS, y - 92 * SS) - 16 * SS
    m_gl = np.clip(0.5 - gl / 1.3, 0.0, 1.0) * m_face
    col = col * (1.0 - m_gl[:, :, None]) + rgb_f("D8FFE2")[None, None, :] * m_gl[:, :, None]
    hout = np.zeros((W, W, 4), dtype=np.uint8)
    hout[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    hout[:, :, 3] = np.clip(np.round(a * 255.0), 0, 255).astype(np.uint8)
    finish_icon(Image.fromarray(hout), "ic_heart.png")

    # 9. ic_hourglass.png (256x256): 扁平 2D 卡通金边蓝玻沙漏
    im, dr, W = new_canvas()
    glass_top = [(74 * SS, 52 * SS), (182 * SS, 52 * SS), (140 * SS, 128 * SS), (116 * SS, 128 * SS)]
    glass_bot = [(116 * SS, 128 * SS), (140 * SS, 128 * SS), (182 * SS, 204 * SS), (74 * SS, 204 * SS)]
    dr.polygon(glass_top, fill=rgba("BDF0FF"), outline=INK, width=7 * SS)
    dr.polygon(glass_bot, fill=rgba("BDF0FF"), outline=INK, width=7 * SS)
    dr.polygon([(92 * SS, 84 * SS), (164 * SS, 84 * SS), (134 * SS, 124 * SS), (122 * SS, 124 * SS)], fill=rgba("FFC438"))
    dr.polygon([(128 * SS, 150 * SS), (168 * SS, 198 * SS), (88 * SS, 198 * SS)], fill=rgba("FFC438"))
    dr.rounded_rectangle([56 * SS, 30 * SS, 200 * SS, 58 * SS], radius=12 * SS, fill=rgba("E29828"), outline=INK, width=7 * SS)
    dr.rounded_rectangle([56 * SS, 198 * SS, 200 * SS, 226 * SS], radius=12 * SS, fill=rgba("E29828"), outline=INK, width=7 * SS)
    finish_icon(im, "ic_hourglass.png")

    # 10. ic_lock.png (256x256): 扁平 2D 黄金圆润挂锁
    im, dr, W = new_canvas()
    cx = W // 2
    dr.rounded_rectangle([78 * SS, 32 * SS, 178 * SS, 144 * SS], radius=50 * SS, fill=rgba("C2D2E2"), outline=INK, width=7 * SS)
    hole_mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(hole_mask).rounded_rectangle([104 * SS, 58 * SS, 152 * SS, 138 * SS], radius=24 * SS, fill=255)
    hm = np.array(hole_mask)
    arr = np.array(im)
    arr[hm > 127] = 0
    im = Image.fromarray(arr)
    dr = ImageDraw.Draw(im)
    dr.rounded_rectangle([98 * SS, 52 * SS, 158 * SS, 140 * SS], radius=30 * SS, fill=None, outline=INK, width=7 * SS)
    arr = np.array(im)
    arr[hm > 127] = 0
    im = Image.fromarray(arr)
    dr = ImageDraw.Draw(im)
    dr.rounded_rectangle([54 * SS, 108 * SS, 202 * SS, 226 * SS], radius=28 * SS, fill=rgba("D48A18"), outline=INK, width=7 * SS)
    dr.rounded_rectangle([54 * SS, 102 * SS, 202 * SS, 216 * SS], radius=28 * SS, fill=rgba("FFD44C"), outline=INK, width=7 * SS)
    dr.rounded_rectangle([66 * SS, 112 * SS, 190 * SS, 152 * SS], radius=16 * SS, fill=rgba("FFE98E"))
    dr.ellipse([cx - 16 * SS, 142 * SS, cx + 16 * SS, 174 * SS], fill=INK)
    dr.polygon([(cx - 8 * SS, 166 * SS), (cx + 8 * SS, 166 * SS), (cx + 12 * SS, 196 * SS), (cx - 12 * SS, 196 * SS)], fill=INK)
    finish_icon(im, "ic_lock.png")

    # 11. ic_map.png (256x256): 扁平 2D 村口防线战术地图（#2B2338 描边）
    im, dr, W = new_canvas()
    p1 = [(36 * SS, 58 * SS), (98 * SS, 42 * SS), (98 * SS, 202 * SS), (36 * SS, 218 * SS)]
    p2 = [(98 * SS, 42 * SS), (158 * SS, 60 * SS), (158 * SS, 220 * SS), (98 * SS, 202 * SS)]
    p3 = [(158 * SS, 60 * SS), (220 * SS, 44 * SS), (220 * SS, 204 * SS), (158 * SS, 220 * SS)]
    dr.polygon(p1, fill=rgba("FAF0D6"), outline=INK, width=7 * SS)
    dr.polygon(p2, fill=rgba("ECDAB6"), outline=INK, width=7 * SS)
    dr.polygon(p3, fill=rgba("FAF0D6"), outline=INK, width=7 * SS)
    # 绿野色块 + 红色行军虚线与 X 标
    dr.ellipse([52 * SS, 132 * SS, 90 * SS, 176 * SS], fill=rgba("78D884"))
    dr.ellipse([170 * SS, 76 * SS, 206 * SS, 114 * SS], fill=rgba("78D884"))
    for px, py in [(68, 96), (92, 112), (118, 132), (144, 142)]:
        dr.ellipse([(px - 5) * SS, (py - 5) * SS, (px + 5) * SS, (py + 5) * SS], fill=rgba("E6483C"))
    dr.line([(168 * SS, 146 * SS), (196 * SS, 174 * SS)], fill=rgba("E6483C"), width=8 * SS)
    dr.line([(196 * SS, 146 * SS), (168 * SS, 174 * SS)], fill=rgba("E6483C"), width=8 * SS)
    finish_icon(im, "ic_map.png")

    # 12. ic_rage.png (256x256): 扁平 2D 怒火小火苗（#2B2338 粗描边）
    im, dr, W = new_canvas()
    cx = W // 2
    outer = [(cx, 26 * SS), (178 * SS, 86 * SS), (206 * SS, 74 * SS), (212 * SS, 148 * SS), (186 * SS, 210 * SS), (cx, 230 * SS), (70 * SS, 210 * SS), (44 * SS, 148 * SS), (52 * SS, 78 * SS), (82 * SS, 90 * SS)]
    inner = [(cx, 78 * SS), (166 * SS, 128 * SS), (164 * SS, 196 * SS), (cx, 214 * SS), (92 * SS, 196 * SS), (90 * SS, 128 * SS)]
    dr.polygon(outer, fill=rgba("F4522E"), outline=INK, width=7 * SS)
    dr.polygon(inner, fill=rgba("FFC838"))
    # 怒目表情
    dr.line([(88 * SS, 138 * SS), (118 * SS, 152 * SS)], fill=INK, width=9 * SS)
    dr.line([(168 * SS, 138 * SS), (138 * SS, 152 * SS)], fill=INK, width=9 * SS)
    dr.ellipse([94 * SS, 150 * SS, 114 * SS, 170 * SS], fill=INK)
    dr.ellipse([142 * SS, 150 * SS, 162 * SS, 170 * SS], fill=INK)
    dr.pieslice([104 * SS, 176 * SS, 152 * SS, 212 * SS], 180, 360, fill=INK)
    finish_icon(im, "ic_rage.png")

    # 13. ic_refresh.png (256x256): 扁平 2D 翠绿双回环刷新箭头
    im, dr, W = new_canvas()
    cx = cy = W // 2
    dr.arc([44 * SS, 44 * SS, 212 * SS, 212 * SS], 20, 160, fill=INK, width=36 * SS)
    dr.arc([44 * SS, 44 * SS, 212 * SS, 212 * SS], 200, 340, fill=INK, width=36 * SS)
    dr.arc([48 * SS, 48 * SS, 208 * SS, 208 * SS], 20, 160, fill=rgba("46D46E"), width=22 * SS)
    dr.arc([48 * SS, 48 * SS, 208 * SS, 208 * SS], 200, 340, fill=rgba("46D46E"), width=22 * SS)
    t_top = [(174 * SS, 44 * SS), (222 * SS, 88 * SS), (164 * SS, 102 * SS)]
    t_bot = [(82 * SS, 212 * SS), (34 * SS, 168 * SS), (92 * SS, 154 * SS)]
    dr.polygon(t_top, fill=rgba("6EF092"), outline=INK, width=7 * SS)
    dr.polygon(t_bot, fill=rgba("6EF092"), outline=INK, width=7 * SS)
    finish_icon(im, "ic_refresh.png")

    # 14. ic_star.png (256x256): 扁平 2D 圆润五角金星（#2B2338 描边 + 二阶亮面）
    im, dr, W = new_canvas()
    cx, cy = W * 0.5, W * 0.52
    pts = []
    for k in range(10):
        ang = -math.pi * 0.5 + k * math.pi / 5.0
        rad = (106 if k % 2 == 0 else 52) * SS
        pts.append((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad))
    dr.polygon([(x, y + 7 * SS) for x, y in pts], fill=rgba("C98212"), outline=INK, width=7 * SS)
    dr.polygon(pts, fill=rgba("FFD444"), outline=INK, width=7 * SS)
    pts_in = []
    for k in range(10):
        ang = -math.pi * 0.5 + k * math.pi / 5.0
        rad = (80 if k % 2 == 0 else 38) * SS
        pts_in.append((cx + math.cos(ang) * rad, cy + math.sin(ang) * rad - 4 * SS))
    dr.polygon(pts_in[:6], fill=rgba("FFF29C"))
    finish_icon(im, "ic_star.png")

    # 15. ic_thumb.png (256x256): 扁平 2D 暖金点赞大拇指
    im, dr, W = new_canvas()
    dr.rounded_rectangle([42 * SS, 114 * SS, 92 * SS, 218 * SS], radius=16 * SS, fill=rgba("4CA8E8"), outline=INK, width=7 * SS)
    # 拇指 + 拳面
    dr.rounded_rectangle([84 * SS, 104 * SS, 212 * SS, 216 * SS], radius=34 * SS, fill=rgba("FFB838"), outline=INK, width=7 * SS)
    dr.polygon([(92 * SS, 120 * SS), (124 * SS, 38 * SS), (156 * SS, 42 * SS), (154 * SS, 112 * SS)], fill=rgba("FFD256"), outline=INK, width=7 * SS)
    for ry in (132, 160, 188):
        dr.line([(168 * SS, ry * SS), (206 * SS, ry * SS)], fill=INK, width=6 * SS)
    finish_icon(im, "ic_thumb.png")

    # 16. ic_rank_escort.png (256x256): 扁平 2D 村口物资补给箱车（满载金币与能量晶钻，取代旧梁山古木元宝车）
    im, dr, W = new_canvas()
    # 后排晶钻与金币堆
    for gx, gy in [(84, 72), (128, 56), (170, 74)]:
        dr.polygon([(gx * SS, (gy - 28) * SS), ((gx + 26) * SS, gy * SS), (gx * SS, (gy + 28) * SS), ((gx - 26) * SS, gy * SS)], fill=rgba("5AC8FF"), outline=INK, width=6 * SS)
    for cx_c, cy_c in [(98, 92), (148, 90), (122, 98)]:
        dr.ellipse([(cx_c - 22) * SS, (cy_c - 22) * SS, (cx_c + 22) * SS, (cy_c + 22) * SS], fill=rgba("FFD84C"), outline=INK, width=6 * SS)
    # 现代蓝色铁皮补给小推车箱体 + 黄黑条纹护杠
    dr.rounded_rectangle([44 * SS, 98 * SS, 212 * SS, 194 * SS], radius=20 * SS, fill=rgba("3E8CE4"), outline=INK, width=7 * SS)
    dr.rounded_rectangle([52 * SS, 106 * SS, 204 * SS, 140 * SS], radius=12 * SS, fill=rgba("6EB6F8"))
    dr.rectangle([48 * SS, 156 * SS, 208 * SS, 178 * SS], fill=rgba("FFD03B"), outline=INK, width=5 * SS)
    # 左右橡胶车轮
    for wx in (82, 174):
        dr.ellipse([(wx - 28) * SS, 170 * SS, (wx + 28) * SS, 226 * SS], fill=rgba("4A5668"), outline=INK, width=7 * SS)
        dr.ellipse([(wx - 12) * SS, 186 * SS, (wx + 12) * SS, 210 * SS], fill=rgba("DCE6F0"), outline=INK, width=5 * SS)
    finish_icon(im, "ic_rank_escort.png")


def harmonize_remaining_village_icons():
    rebuilt = {
        "ic_chest.png", "ic_chest_wood.png", "ic_chest_silver.png", "ic_chest_gold.png",
        "ic_chest_open.png", "ic_chest_wood_open.png", "ic_chest_silver_open.png",
        "ic_rank_chest.png", "ic_check.png", "ic_active.png", "ic_ad.png", "ic_fast.png",
        "ic_fist.png", "ic_gear.png", "ic_hand.png", "ic_heart.png", "ic_hourglass.png",
        "ic_lock.png", "ic_map.png", "ic_rage.png", "ic_refresh.png", "ic_star.png",
        "ic_thumb.png", "ic_rank_escort.png",
    }
    all_icons = sorted(
        glob.glob(f"{C1_ART}/ic_*.png")
        + glob.glob(f"{C1_ART}/eq_*.png")
        + glob.glob(f"{C1_ART}/tab_*.png")
        + glob.glob(f"{C1_ART}/totem_*.png")
    )
    cnt = 0
    for p in all_icons:
        bn = os.path.basename(p)
        if bn in rebuilt:
            continue
        im = Image.open(p).convert("RGBA")
        im_h = harmonize_outline_to_2b2338(im)
        im_h.save(p, optimize=True)
        cnt += 1
    print(f"Harmonized {cnt} modern village icons to #2B2338 warm outline")


if __name__ == "__main__":
    upgrade_q_chests()
    build_flat_icons()
    harmonize_remaining_village_icons()
