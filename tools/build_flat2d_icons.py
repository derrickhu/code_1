"""纯 4x 超采样重绘《村口大战外星人》全部 73 枚根目录 UI 图标、页签与战斗条（ic_*.png 57 枚 + tab_*.png 12 枚 + ui_*.png 4 枚）：
- 100% 04 风格：45° 切角几何块面 + #050914 黑曜石硬边暗核 + 高饱和 #FFB800 鎏金 / #00F57A 霓虹翠绿 / #00E5FF 赛博青 / #FF3B30 绯红 / #A84CFF 霓虹紫！
- 绝不触碰 eq_*.png / totem_*.png / code_2，严格原位覆写并 100% 保持原像素尺寸与 .meta GUID。
"""
import os
import math
import numpy as np
from PIL import Image, ImageDraw

C1_ART = "/Users/rosa/rosa_games/code_1/Assets/Resources/Art"
SS = 4
INK = (5, 9, 20, 255)  # #050914


def rgba(h: str, a: int = 255) -> tuple:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def new_cv(w: int = 256, h: int = 256):
    W, H = w * SS, h * SS
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im), W, H


def save_ic(im: Image.Image, name: str, w: int = 256, h: int = 256):
    out = im.resize((w, h), Image.Resampling.LANCZOS)
    out.save(os.path.join(C1_ART, name), optimize=True)
    print(f"wrote 04-icon {name:26s} {out.size[0]}x{out.size[1]}")


def oct_pts(x0: float, y0: float, x1: float, y1: float, ch: float):
    return [
        (x0 + ch, y0), (x1 - ch, y0), (x1, y0 + ch), (x1, y1 - ch),
        (x1 - ch, y1), (x0 + ch, y1), (x0, y1 - ch), (x0, y0 + ch),
    ]


def draw_oct(dr: ImageDraw.ImageDraw, x0, y0, x1, y1, ch, fill, outline=INK, width=7 * SS):
    dr.polygon(oct_pts(x0, y0, x1, y1, ch), fill=fill, outline=outline, width=int(width))


def star_pts(cx: float, cy: float, r_out: float, r_in: float, n: int = 5, rot: float = -math.pi * 0.5):
    pts = []
    for k in range(n * 2):
        a = rot + k * math.pi / n
        r = r_out if k % 2 == 0 else r_in
        pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
    return pts


def hex_pts(cx: float, cy: float, rx: float, ry: float = None):
    if ry is None:
        ry = rx
    pts = []
    for k in range(6):
        a = -math.pi * 0.5 + k * math.pi / 3.0
        pts.append((cx + math.cos(a) * rx, cy + math.sin(a) * ry))
    return pts


# ==================== 1. 八枚 04 风格黑曜石战术补给宝箱 ====================

def draw_tactical_chest(name: str, body_h: str, rib_top: str, rib_bot: str, gem_h: str, gem_hi: str, opened: bool = False, crown: bool = False):
    im, dr, W, H = new_cv(256, 256)
    cx = W * 0.5
    s = SS

    # 底部战术投影
    dr.polygon(oct_pts(30 * s, 210 * s, 226 * s, 234 * s, 10 * s), fill=(3, 6, 14, 150))

    if opened:
        # 后箱盖掀开 + 爆棚鎏金星币与霓虹光辉
        dr.polygon([(40 * s, 106 * s), (58 * s, 32 * s), (198 * s, 32 * s), (216 * s, 106 * s)], fill=rgba(body_h), outline=INK, width=7 * s)
        dr.polygon([(40 * s, 106 * s), (58 * s, 32 * s), (76 * s, 32 * s), (62 * s, 106 * s)], fill=rgba(rib_top), outline=INK, width=6 * s)
        dr.polygon([(198 * s, 32 * s), (180 * s, 32 * s), (194 * s, 106 * s), (216 * s, 106 * s)], fill=rgba(rib_top), outline=INK, width=6 * s)
        dr.line([(58 * s, 36 * s), (198 * s, 36 * s)], fill=rgba(rib_top), width=8 * s)
        # 内部爆发光晕与金币晶钻堆
        dr.polygon([(52 * s, 122 * s), (92 * s, 54 * s), (128 * s, 40 * s), (164 * s, 54 * s), (204 * s, 122 * s)], fill=rgba(gem_h, 110))
        for gx, gy, gr in [(86, 104, 24), (128, 92, 28), (170, 104, 24), (106, 118, 22), (150, 118, 22)]:
            dr.ellipse([(gx - gr) * s, (gy - gr) * s, (gx + gr) * s, (gy + gr) * s], fill=rgba("FFD438"), outline=INK, width=5 * s)
            dr.ellipse([(gx - gr + 6) * s, (gy - gr + 6) * s, (gx + gr - 6) * s, (gy + gr - 6) * s], fill=rgba("FFF4A8"))
        # 中央跃出霓虹晶钻
        dr.polygon([(cx, 54 * s), (cx + 22 * s, 84 * s), (cx, 114 * s), (cx - 22 * s, 84 * s)], fill=rgba(gem_h), outline=INK, width=5 * s)
        dr.polygon([(cx, 62 * s), (cx + 12 * s, 84 * s), (cx, 94 * s), (cx - 12 * s, 84 * s)], fill=rgba(gem_hi))

    # 下半箱体（切角黑曜石装甲仓 + 垂直发光条纹）
    by0 = 114 * s if opened else 108 * s
    by1 = 222 * s
    draw_oct(dr, 34 * s, by0, 222 * s, by1, 18 * s, fill=rgba(body_h), width=7 * s)
    # 箱面双能量发光竖槽
    for sx in (88, 168):
        dr.rectangle([(sx - 12) * s, by0 + 8 * s, (sx + 12) * s, by1 - 10 * s], fill=rgba(gem_h, 90))
        dr.line([(sx * s, by0 + 10 * s), (sx * s, by1 - 12 * s)], fill=rgba(gem_hi, 210), width=4 * s)

    # 左右重型金属包角肋骨
    for x0, x1 in [(34, 68), (188, 222)]:
        draw_oct(dr, x0 * s, by0, x1 * s, by1, 10 * s, fill=rgba(rib_bot), width=6 * s)
        dr.rectangle([(x0 + 5) * s, by0 + 6 * s, (x1 - 5) * s, by0 + 36 * s], fill=rgba(rib_top))

    # 底沿装甲横梁
    draw_oct(dr, 30 * s, 198 * s, 226 * s, 224 * s, 8 * s, fill=rgba(rib_bot), width=6 * s)

    if not opened:
        # 闭合态梯形切角箱盖
        lid = [(30 * s, 114 * s), (48 * s, 54 * s), (208 * s, 54 * s), (226 * s, 114 * s)]
        dr.polygon(lid, fill=rgba(body_h), outline=INK, width=7 * s)
        for sx in (88, 168):
            dr.polygon([((sx - 10) * s, 58 * s), ((sx + 10) * s, 58 * s), ((sx + 13) * s, 110 * s), ((sx - 13) * s, 110 * s)], fill=rgba(gem_h, 155))
        # 箱盖左右金属肋
        dr.polygon([(30 * s, 114 * s), (48 * s, 54 * s), (76 * s, 54 * s), (66 * s, 114 * s)], fill=rgba(rib_top), outline=INK, width=6 * s)
        dr.polygon([(180 * s, 54 * s), (208 * s, 54 * s), (226 * s, 114 * s), (190 * s, 114 * s)], fill=rgba(rib_top), outline=INK, width=6 * s)
        if crown:
            cr = [(86 * s, 56 * s), (96 * s, 24 * s), (116 * s, 42 * s), (128 * s, 18 * s), (140 * s, 42 * s), (160 * s, 24 * s), (170 * s, 56 * s)]
            dr.polygon(cr, fill=rgba("FFD438"), outline=INK, width=6 * s)

    # 中腰金属锁梁 + 六角霓虹能量核心锁扣
    ym = by0 + (8 * s if opened else 4 * s)
    draw_oct(dr, 28 * s, ym - 12 * s, 228 * s, ym + 16 * s, 6 * s, fill=rgba(rib_top), width=6 * s)
    dr.polygon(hex_pts(cx, ym + 14 * s, 34 * s, 36 * s), fill=rgba(rib_top), outline=INK, width=6 * s)
    dr.polygon(hex_pts(cx, ym + 14 * s, 22 * s, 24 * s), fill=rgba(gem_h), outline=INK, width=5 * s)
    dr.polygon([(cx, ym - 4 * s), (cx + 14 * s, ym + 10 * s), (cx, ym + 18 * s), (cx - 14 * s, ym + 10 * s)], fill=rgba(gem_hi))

    save_ic(im, name)


# ==================== 2. 十二枚 04 风格页签徽章 (tab_*.png) ====================

def build_tabs():
    s = SS
    # tab_shop.png: 04 供销社（红白切角遮阳棚 + 黑曜石霓虹橱窗 + 金星牌匾）
    im, dr, W, H = new_cv()
    draw_oct(dr, 38 * s, 96 * s, 218 * s, 226 * s, 14 * s, fill=rgba("13203A"), width=7 * s)
    draw_oct(dr, 56 * s, 134 * s, 132 * s, 202 * s, 8 * s, fill=rgba("0B2848"), outline=rgba("00E5FF"), width=5 * s)
    dr.line([(66 * s, 188 * s), (116 * s, 146 * s)], fill=rgba("9CF8FF"), width=6 * s)
    draw_oct(dr, 146 * s, 134 * s, 200 * s, 224 * s, 6 * s, fill=rgba("FFB800"), width=6 * s)
    # 红白战术顶棚 + 顶星牌
    dr.polygon([(24 * s, 114 * s), (46 * s, 64 * s), (210 * s, 64 * s), (232 * s, 114 * s)], fill=rgba("FF3B30"), outline=INK, width=7 * s)
    for k in range(3):
        x0 = 64 + k * 52
        dr.polygon([(x0 * s, 68 * s), ((x0 + 24) * s, 68 * s), ((x0 + 28) * s, 110 * s), ((x0 - 4) * s, 110 * s)], fill=rgba("EAF4FF"))
    draw_oct(dr, 68 * s, 28 * s, 188 * s, 68 * s, 10 * s, fill=rgba("FFB800"), width=6 * s)
    dr.polygon(star_pts(128 * s, 48 * s, 15 * s, 7 * s), fill=rgba("FF3B30"), outline=INK, width=3 * s)
    save_ic(im, "tab_shop.png")

    # tab_hero.png: 04 逆光斗笠乡亲剪影（金色几何斗笠 + 黑曜石面庞 + 发光双眸 + 绯红围巾）
    im, dr, W, H = new_cv()
    cx = 128 * s
    # 肩部与红领巾
    dr.polygon([(54 * s, 228 * s), (78 * s, 174 * s), (178 * s, 174 * s), (202 * s, 228 * s)], fill=rgba("13223E"), outline=INK, width=7 * s)
    dr.polygon([(72 * s, 172 * s), (184 * s, 172 * s), (166 * s, 212 * s), (128 * s, 226 * s), (90 * s, 212 * s)], fill=rgba("FF3B30"), outline=INK, width=7 * s)
    # 黑曜石逆光头部 + 发光锐利战意双眼
    draw_oct(dr, 80 * s, 96 * s, 176 * s, 184 * s, 22 * s, fill=rgba("0B1326"), width=7 * s)
    dr.polygon([(94 * s, 134 * s), (118 * s, 142 * s), (114 * s, 152 * s), (92 * s, 146 * s)], fill=rgba("00F57A"))
    dr.polygon([(162 * s, 134 * s), (138 * s, 142 * s), (142 * s, 152 * s), (164 * s, 146 * s)], fill=rgba("00F57A"))
    # 几何锥形金斗笠 + 翠绿轮廓光
    hat = [(20 * s, 114 * s), (128 * s, 30 * s), (236 * s, 114 * s), (204 * s, 124 * s), (52 * s, 124 * s)]
    dr.polygon(hat, fill=rgba("FFB800"), outline=INK, width=7 * s)
    dr.polygon([(38 * s, 110 * s), (128 * s, 38 * s), (128 * s, 112 * s)], fill=rgba("FFE478"))
    dr.line([(30 * s, 112 * s), (128 * s, 34 * s), (226 * s, 112 * s)], fill=rgba("00F57A"), width=4 * s)
    save_ic(im, "tab_hero.png")

    # tab_battle.png: 04 守村战术星盾 + 交叉扳手 + 绯红大喇叭
    im, dr, W, H = new_cv()
    cx = 128 * s
    dr.line([(46 * s, 206 * s), (210 * s, 50 * s)], fill=INK, width=28 * s)
    dr.line([(46 * s, 206 * s), (210 * s, 50 * s)], fill=rgba("9CC2E6"), width=16 * s)
    for ex, ey in [(46, 206), (210, 50)]:
        dr.ellipse([(ex - 18) * s, (ey - 18) * s, (ex + 18) * s, (ey + 18) * s], fill=rgba("00E5FF"), outline=INK, width=6 * s)
    sh = [(cx, 30 * s), (206 * s, 58 * s), (196 * s, 152 * s), (cx, 226 * s), (60 * s, 152 * s), (50 * s, 58 * s)]
    dr.polygon(sh, fill=rgba("FFB800"), outline=INK, width=7 * s)
    sh_in = [(cx, 48 * s), (186 * s, 70 * s), (178 * s, 144 * s), (cx, 204 * s), (78 * s, 144 * s), (70 * s, 70 * s)]
    dr.polygon(sh_in, fill=rgba("13203A"), outline=rgba("FFF4A8"), width=4 * s)
    dr.polygon(star_pts(cx, 120 * s, 42 * s, 19 * s), fill=rgba("FFD438"), outline=INK, width=5 * s)
    # 左下角大喇叭徽记
    dr.polygon([(36 * s, 176 * s), (98 * s, 146 * s), (108 * s, 198 * s), (46 * s, 196 * s)], fill=rgba("FF3B30"), outline=INK, width=6 * s)
    save_ic(im, "tab_battle.png")

    # tab_forge.png: 04 老村长军绿战术风衣 + 鎏金扩音大喇叭
    im, dr, W, H = new_cv()
    coat = [(42 * s, 96 * s), (84 * s, 44 * s), (156 * s, 44 * s), (186 * s, 96 * s), (172 * s, 216 * s), (54 * s, 216 * s)]
    dr.polygon(coat, fill=rgba("1B5E44"), outline=INK, width=7 * s)
    dr.polygon([(84 * s, 44 * s), (120 * s, 98 * s), (156 * s, 44 * s)], fill=rgba("0D182C"), outline=rgba("00F57A"), width=4 * s)
    dr.line([(54 * s, 92 * s), (86 * s, 50 * s)], fill=rgba("00F57A"), width=5 * s)
    # 右前景高光大喇叭
    horn = [(112 * s, 134 * s), (222 * s, 78 * s), (222 * s, 190 * s), (112 * s, 158 * s)]
    dr.polygon(horn, fill=rgba("FFB800"), outline=INK, width=7 * s)
    dr.polygon([(120 * s, 136 * s), (216 * s, 88 * s), (216 * s, 134 * s), (120 * s, 146 * s)], fill=rgba("FFF4A8"))
    dr.ellipse([204 * s, 78 * s, 234 * s, 190 * s], fill=rgba("FF3B30"), outline=INK, width=6 * s)
    draw_oct(dr, 122 * s, 156 * s, 152 * s, 222 * s, 6 * s, fill=rgba("FF3B30"), width=6 * s)
    save_ic(im, "tab_forge.png")

    # tab_fort.png: 04 村委门楼 + 赛博青信号发射塔
    im, dr, W, H = new_cv()
    # 右侧信号铁塔
    dr.polygon([(164 * s, 222 * s), (190 * s, 68 * s), (198 * s, 68 * s), (224 * s, 222 * s)], fill=rgba("1B3254"), outline=INK, width=6 * s)
    dr.line([(172 * s, 174 * s), (216 * s, 174 * s)], fill=rgba("00E5FF"), width=5 * s)
    dr.line([(180 * s, 126 * s), (208 * s, 126 * s)], fill=rgba("00E5FF"), width=5 * s)
    dr.ellipse([182 * s, 46 * s, 206 * s, 70 * s], fill=rgba("00F57A"), outline=INK, width=5 * s)
    for rad in (24, 40):
        dr.arc([(194 - rad) * s, (58 - rad) * s, (194 + rad) * s, (58 + rad) * s], 200, 340, fill=rgba("00E5FF"), width=5 * s)
    # 左侧现代门楼牌坊
    draw_oct(dr, 38 * s, 110 * s, 172 * s, 224 * s, 8 * s, fill=rgba("152440"), width=7 * s)
    dr.rectangle([82 * s, 150 * s, 128 * s, 224 * s], fill=rgba("070C18"), outline=rgba("FFB800"), width=5 * s)
    roof = [(22 * s, 116 * s), (52 * s, 76 * s), (158 * s, 76 * s), (188 * s, 116 * s)]
    dr.polygon(roof, fill=rgba("FF6828"), outline=INK, width=7 * s)
    dr.line([(36 * s, 112 * s), (174 * s, 112 * s)], fill=rgba("FFB800"), width=5 * s)
    save_ic(im, "tab_fort.png")

    # tab_welfare.png: 绯红鎏金福袋 + 霓虹晶钻与金麦穗
    im, dr, W, H = new_cv()
    for gx, gy, hc in [(96, 62, "00E5FF"), (128, 48, "A84CFF"), (160, 62, "FFB800")]:
        dr.polygon([(gx * s, (gy - 26) * s), ((gx + 22) * s, gy * s), (gx * s, (gy + 26) * s), ((gx - 22) * s, gy * s)], fill=rgba(hc), outline=INK, width=6 * s)
    bag = [(74 * s, 92 * s), (182 * s, 92 * s), (214 * s, 168 * s), (192 * s, 226 * s), (64 * s, 226 * s), (42 * s, 168 * s)]
    dr.polygon(bag, fill=rgba("D81E28"), outline=INK, width=7 * s)
    draw_oct(dr, 72 * s, 80 * s, 184 * s, 106 * s, 8 * s, fill=rgba("FFB800"), width=6 * s)
    dr.polygon(hex_pts(128 * s, 166 * s, 32 * s), fill=rgba("FFB800"), outline=INK, width=5 * s)
    dr.polygon(star_pts(128 * s, 166 * s, 18 * s, 8 * s), fill=rgba("FF3B30"))
    save_ic(im, "tab_welfare.png")

    # tab_gift.png: 切角绯红礼盒 + 鎏金十字丝带
    im, dr, W, H = new_cv()
    draw_oct(dr, 46 * s, 94 * s, 210 * s, 224 * s, 14 * s, fill=rgba("DF242C"), width=7 * s)
    draw_oct(dr, 36 * s, 68 * s, 220 * s, 110 * s, 10 * s, fill=rgba("FF4B40"), width=7 * s)
    dr.rectangle([110 * s, 68 * s, 146 * s, 224 * s], fill=rgba("FFB800"), outline=INK, width=6 * s)
    dr.polygon([(128 * s, 72 * s), (74 * s, 30 * s), (62 * s, 64 * s)], fill=rgba("FFD84C"), outline=INK, width=6 * s)
    dr.polygon([(128 * s, 72 * s), (182 * s, 30 * s), (194 * s, 64 * s)], fill=rgba("FFD84C"), outline=INK, width=6 * s)
    save_ic(im, "tab_gift.png")

    # tab_task.png: 黑曜石金边战术任务板 + 霓虹翠绿大对勾
    im, dr, W, H = new_cv()
    draw_oct(dr, 44 * s, 44 * s, 202 * s, 224 * s, 16 * s, fill=rgba("101C36"), outline=rgba("FFB800"), width=7 * s)
    draw_oct(dr, 86 * s, 24 * s, 160 * s, 58 * s, 8 * s, fill=rgba("FFB800"), width=6 * s)
    for ly in (88, 122, 156):
        dr.line([(72 * s, ly * s), (154 * s, ly * s)], fill=rgba("00E5FF"), width=8 * s)
    chk = [(116 * s, 168 * s), (150 * s, 204 * s), (224 * s, 122 * s), (206 * s, 104 * s), (150 * s, 166 * s), (134 * s, 150 * s)]
    dr.polygon(chk, fill=rgba("00F57A"), outline=INK, width=6 * s)
    save_ic(im, "tab_task.png")

    # tab_seven.png: 04 切角黄金圣杯 + 绯红飘带
    im, dr, W, H = new_cv()
    for sgn in (-1, 1):
        cx_h = 128 + sgn * 72
        dr.ellipse([(cx_h - 28) * s, 64 * s, (cx_h + 28) * s, 136 * s], outline=rgba("FFB800"), width=12 * s)
    cup = [(62 * s, 44 * s), (194 * s, 44 * s), (172 * s, 148 * s), (128 * s, 172 * s), (84 * s, 148 * s)]
    dr.polygon(cup, fill=rgba("FFD438"), outline=INK, width=7 * s)
    dr.rectangle([112 * s, 166 * s, 144 * s, 202 * s], fill=rgba("EA920C"), outline=INK, width=6 * s)
    draw_oct(dr, 76 * s, 198 * s, 180 * s, 228 * s, 8 * s, fill=rgba("FFB800"), width=7 * s)
    dr.polygon(star_pts(128 * s, 102 * s, 28 * s, 12 * s), fill=rgba("FF3B30"), outline=INK, width=4 * s)
    save_ic(im, "tab_seven.png")

    # tab_sprint.png: 烈焰双翼鎏金冲刺徽章
    im, dr, W, H = new_cv()
    fl = [(128 * s, 18 * s), (192 * s, 68 * s), (224 * s, 136 * s), (188 * s, 214 * s), (128 * s, 232 * s), (68 * s, 214 * s), (32 * s, 136 * s), (64 * s, 68 * s)]
    dr.polygon(fl, fill=rgba("FF3B30"), outline=INK, width=7 * s)
    dr.polygon(hex_pts(128 * s, 136 * s, 74 * s), fill=rgba("FFB800"), outline=INK, width=7 * s)
    dr.polygon(hex_pts(128 * s, 136 * s, 50 * s), fill=rgba("13203A"), outline=rgba("FFF4A8"), width=4 * s)
    dr.polygon([(136 * s, 86 * s), (98 * s, 140 * s), (126 * s, 140 * s), (116 * s, 188 * s), (158 * s, 130 * s), (130 * s, 130 * s)], fill=rgba("00F57A"))
    save_ic(im, "tab_sprint.png")

    # tab_idle.png: 赛博蓝村口巡逻三轮车 + 满载金钻
    im, dr, W, H = new_cv()
    for gx, gy, hc in [(144, 78, "A84CFF"), (178, 74, "00E5FF"), (162, 96, "FFB800")]:
        dr.polygon([(gx * s, (gy - 22) * s), ((gx + 20) * s, gy * s), (gx * s, (gy + 22) * s), ((gx - 20) * s, gy * s)], fill=rgba(hc), outline=INK, width=5 * s)
    draw_oct(dr, 108 * s, 96 * s, 224 * s, 184 * s, 10 * s, fill=rgba("0E78C8"), outline=INK, width=7 * s)
    dr.polygon([(42 * s, 184 * s), (68 * s, 96 * s), (114 * s, 96 * s), (114 * s, 184 * s)], fill=rgba("00C8F8"), outline=INK, width=7 * s)
    dr.polygon([(64 * s, 106 * s), (104 * s, 106 * s), (104 * s, 142 * s), (54 * s, 142 * s)], fill=rgba("0B182E"))
    for wx in (68, 184):
        dr.ellipse([(wx - 28) * s, 166 * s, (wx + 28) * s, 222 * s], fill=rgba("121D32"), outline=INK, width=7 * s)
        dr.ellipse([(wx - 12) * s, 182 * s, (wx + 12) * s, 206 * s], fill=rgba("FFB800"))
    save_ic(im, "tab_idle.png")

    # tab_codex.png: 黑曜石切角外星雷达档案夹
    im, dr, W, H = new_cv()
    dr.polygon([(30 * s, 50 * s), (108 * s, 50 * s), (126 * s, 70 * s), (226 * s, 70 * s), (226 * s, 214 * s), (30 * s, 214 * s)], fill=rgba("0D182E"), outline=rgba("A84CFF"), width=7 * s)
    draw_oct(dr, 46 * s, 84 * s, 210 * s, 198 * s, 12 * s, fill=rgba("071426"), outline=rgba("00E5FF"), width=5 * s)
    for r in (22, 42):
        dr.ellipse([(128 - r) * s, (141 - r) * s, (128 + r) * s, (141 + r) * s], outline=rgba("00F57A"), width=4 * s)
    dr.line([(76 * s, 141 * s), (180 * s, 141 * s)], fill=rgba("00F57A"), width=3 * s)
    dr.line([(128 * s, 92 * s), (128 * s, 190 * s)], fill=rgba("00F57A"), width=3 * s)
    save_ic(im, "tab_codex.png")


# ==================== 3. 四十九枚 ic_*.png 04 风格矢量图标 ====================

def build_all_ic():
    s = SS

    # ic_wine.png: 村口大碗能量绿茶/汤（对齐 style04_page_home 左上体力碗！）
    im, dr, W, H = new_cv()
    dr.ellipse([40 * s, 88 * s, 216 * s, 162 * s], fill=rgba("163258"), outline=INK, width=7 * s)
    dr.pieslice([40 * s, 68 * s, 216 * s, 216 * s], 0, 180, fill=rgba("DCEEFF"), outline=INK, width=7 * s)
    dr.rectangle([88 * s, 206 * s, 168 * s, 224 * s], fill=rgba("9CC2E6"), outline=INK, width=6 * s)
    dr.ellipse([52 * s, 98 * s, 204 * s, 152 * s], fill=rgba("00F57A"), outline=INK, width=5 * s)
    dr.ellipse([72 * s, 108 * s, 184 * s, 138 * s], fill=rgba("B8FFE0"))
    for sx_w in (96, 128, 160):
        dr.line([(sx_w * s, 78 * s), ((sx_w - 8) * s, 54 * s), ((sx_w + 6) * s, 32 * s)], fill=rgba("EAF8FF"), width=6 * s)
    save_ic(im, "ic_wine.png")

    # ic_coins.png: 叠放八角金星币
    im, dr, W, H = new_cv()
    for cx, cy in [(164, 156), (164, 128), (118, 92), (92, 156)]:
        dr.ellipse([(cx - 48) * s, (cy - 44) * s, (cx + 48) * s, (cy + 44) * s], fill=rgba("EA920C"), outline=INK, width=7 * s)
        dr.ellipse([(cx - 48) * s, (cy - 50) * s, (cx + 48) * s, (cy + 38) * s], fill=rgba("FFD638"), outline=INK, width=7 * s)
        dr.polygon(star_pts(cx * s, (cy - 6) * s, 22 * s, 10 * s), fill=rgba("FFF8C4"), outline=rgba("B86806"), width=3 * s)
    save_ic(im, "ic_coins.png")

    # ic_ingot.png: 三簇棱面外星紫青能量晶钻（对齐 style04_page_home 顶部晶钻！）
    im, dr, W, H = new_cv()
    gems = [
        ([(72, 74), (108, 126), (86, 206), (40, 148)], "00B8E8", "8CF6FF"),
        ([(184, 74), (216, 148), (170, 206), (148, 126)], "8E38E8", "E0B0FF"),
        ([(128, 30), (174, 118), (128, 222), (82, 118)], "00E5FF", "FFFFFF"),
    ]
    for pts, c1, c2 in gems:
        p = [(x * s, y * s) for x, y in pts]
        dr.polygon(p, fill=rgba(c1), outline=INK, width=7 * s)
        dr.polygon([p[0], p[1], ((p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2)], fill=rgba(c2, 190))
    save_ic(im, "ic_ingot.png")

    # ic_silver.png: 赛博青闪电能量银币
    im, dr, W, H = new_cv()
    dr.polygon(hex_pts(128 * s, 128 * s, 96 * s), fill=rgba("00B8E6"), outline=INK, width=7 * s)
    dr.polygon(hex_pts(128 * s, 128 * s, 76 * s), fill=rgba("0E2442"), outline=rgba("9CF8FF"), width=5 * s)
    bolt = [(138 * s, 68 * s), (94 * s, 132 * s), (126 * s, 132 * s), (114 * s, 190 * s), (162 * s, 122 * s), (130 * s, 122 * s)]
    dr.polygon(bolt, fill=rgba("00F57A"), outline=INK, width=5 * s)
    save_ic(im, "ic_silver.png")

    # ic_credit.png: 切角绯红金穗供销社粮票券
    im, dr, W, H = new_cv()
    pts = [(36 * s, 148 * s), (168 * s, 40 * s), (224 * s, 108 * s), (92 * s, 216 * s)]
    dr.polygon(pts, fill=rgba("DF242C"), outline=INK, width=7 * s)
    pts_in = [(54 * s, 146 * s), (166 * s, 58 * s), (206 * s, 106 * s), (94 * s, 198 * s)]
    dr.polygon(pts_in, fill=rgba("240C16"), outline=rgba("FFB800"), width=5 * s)
    dr.polygon(star_pts(130 * s, 128 * s, 26 * s, 11 * s), fill=rgba("FFD438"))
    save_ic(im, "ic_credit.png")

    # ic_token.png: 村口铜锣+大喇叭摇人令
    im, dr, W, H = new_cv()
    dr.polygon(hex_pts(128 * s, 128 * s, 98 * s), fill=rgba("FF3B30"), outline=INK, width=7 * s)
    dr.ellipse([54 * s, 54 * s, 202 * s, 202 * s], fill=rgba("FFB800"), outline=INK, width=7 * s)
    dr.ellipse([86 * s, 86 * s, 170 * s, 170 * s], fill=rgba("FFF4A8"), outline=rgba("B86406"), width=5 * s)
    dr.polygon([(122 * s, 148 * s), (196 * s, 118 * s), (196 * s, 186 * s)], fill=rgba("FF3B30"), outline=INK, width=6 * s)
    save_ic(im, "ic_token.png")

    # ic_feast.png: 村口流水席大铁锅（黑曜石双耳锅 + 金鸡腿大白馒头 + 翠绿葱花）
    im, dr, W, H = new_cv()
    dr.ellipse([56 * s, 84 * s, 200 * s, 152 * s], fill=rgba("FFF4D8"), outline=INK, width=6 * s)
    dr.polygon([(104 * s, 112 * s), (144 * s, 52 * s), (168 * s, 68 * s), (136 * s, 122 * s)], fill=rgba("F29218"), outline=INK, width=6 * s)
    dr.pieslice([38 * s, 72 * s, 218 * s, 220 * s], 0, 180, fill=rgba("132038"), outline=INK, width=7 * s)
    dr.line([(32 * s, 144 * s), (224 * s, 144 * s)], fill=rgba("FFB800"), width=8 * s)
    save_ic(im, "ic_feast.png")

    # ic_hammer.png: 赛博青+鎏金液压改装重锤
    im, dr, W, H = new_cv()
    dr.line([(62 * s, 204 * s), (156 * s, 110 * s)], fill=INK, width=30 * s)
    dr.line([(62 * s, 204 * s), (156 * s, 110 * s)], fill=rgba("FFB800"), width=18 * s)
    head = [(108 * s, 68 * s), (156 * s, 28 * s), (224 * s, 96 * s), (176 * s, 144 * s)]
    dr.polygon(head, fill=rgba("00E5FF"), outline=INK, width=7 * s)
    dr.line([(124 * s, 84 * s), (196 * s, 84 * s)], fill=rgba("FFF8C4"), width=6 * s)
    save_ic(im, "ic_hammer.png")

    # ic_iron.png: 三块切角合金钢锭
    im, dr, W, H = new_cv()
    for ox, oy in [(54, 134), (118, 134), (86, 82)]:
        pts = [(ox * s, (oy + 44) * s), ((ox + 18) * s, oy * s), ((ox + 72) * s, oy * s), ((ox + 90) * s, (oy + 44) * s)]
        dr.polygon(pts, fill=rgba("7E9EBC"), outline=INK, width=7 * s)
        dr.line([((ox + 22) * s, (oy + 12) * s), ((ox + 68) * s, (oy + 12) * s)], fill=rgba("00E5FF"), width=5 * s)
    save_ic(im, "ic_iron.png")

    # ic_refine.png: 霓虹翠绿外星改装芯片
    im, dr, W, H = new_cv()
    for py in (78, 112, 146, 180):
        dr.line([(36 * s, py * s), (220 * s, py * s)], fill=rgba("FFB800"), width=10 * s)
    draw_oct(dr, 56 * s, 46 * s, 200 * s, 210 * s, 18 * s, fill=rgba("092822"), outline=rgba("00F57A"), width=7 * s)
    draw_oct(dr, 88 * s, 86 * s, 168 * s, 170 * s, 10 * s, fill=rgba("00F57A"), outline=INK, width=5 * s)
    save_ic(im, "ic_refine.png")

    # ic_silk.png: 军绿凯夫拉防弹布卷 + 金绑带
    im, dr, W, H = new_cv()
    roll = [(48 * s, 156 * s), (156 * s, 48 * s), (212 * s, 104 * s), (104 * s, 212 * s)]
    dr.polygon(roll, fill=rgba("1E6B48"), outline=INK, width=7 * s)
    dr.ellipse([144 * s, 44 * s, 216 * s, 116 * s], fill=rgba("00F57A"), outline=INK, width=6 * s)
    dr.line([(98 * s, 102 * s), (154 * s, 158 * s)], fill=rgba("FFB800"), width=14 * s)
    save_ic(im, "ic_silk.png")

    # ic_meteor.png: 霓虹紫金星环外星飞碟核心
    im, dr, W, H = new_cv()
    dr.ellipse([58 * s, 58 * s, 198 * s, 198 * s], fill=rgba("8E32E8"), outline=INK, width=7 * s)
    dr.ellipse([86 * s, 82 * s, 162 * s, 152 * s], fill=rgba("E0A8FF"))
    ring = [(22 * s, 156 * s), (86 * s, 108 * s), (234 * s, 100 * s), (170 * s, 148 * s)]
    dr.line([ring[0], ring[2]], fill=INK, width=22 * s)
    dr.line([ring[0], ring[2]], fill=rgba("FFB800"), width=12 * s)
    save_ic(im, "ic_meteor.png")

    # ic_book.png & ic_tome.png: 绯红闪电战术手册 / 广播宝典
    for nm, main_c, badge_c in [("ic_book.png", "C81E28", "FFB800"), ("ic_tome.png", "8A28D8", "00F57A")]:
        im, dr, W, H = new_cv()
        bk = [(58 * s, 38 * s), (198 * s, 38 * s), (206 * s, 206 * s), (50 * s, 218 * s)]
        dr.polygon(bk, fill=rgba(main_c), outline=INK, width=7 * s)
        dr.rectangle([50 * s, 192 * s, 204 * s, 216 * s], fill=rgba("EAF4FF"), outline=INK, width=6 * s)
        dr.polygon(hex_pts(132 * s, 116 * s, 36 * s), fill=rgba("0D162C"), outline=rgba(badge_c), width=5 * s)
        bolt = [(138 * s, 86 * s), (112 * s, 118 * s), (132 * s, 118 * s), (124 * s, 148 * s), (152 * s, 114 * s), (132 * s, 114 * s)]
        dr.polygon(bolt, fill=rgba(badge_c))
        save_ic(im, nm)

    # ic_page.png: 鎏金村委广播传单
    im, dr, W, H = new_cv()
    draw_oct(dr, 48 * s, 40 * s, 208 * s, 216 * s, 14 * s, fill=rgba("FFD438"), width=7 * s)
    draw_oct(dr, 66 * s, 58 * s, 190 * s, 198 * s, 8 * s, fill=rgba("FFF6BE"), outline=rgba("B86E08"), width=4 * s)
    dr.polygon([(94 * s, 132 * s), (156 * s, 104 * s), (156 * s, 160 * s)], fill=rgba("FF3B30"), outline=INK, width=5 * s)
    save_ic(im, "ic_page.png")

    # ic_scroll.png: 赛博青+鎏金战术蓝图卷轴
    im, dr, W, H = new_cv()
    sc = [(52 * s, 174 * s), (160 * s, 44 * s), (208 * s, 84 * s), (100 * s, 214 * s)]
    dr.polygon(sc, fill=rgba("00C8F0"), outline=INK, width=7 * s)
    for cx_r, cy_r in [(184, 64), (76, 194)]:
        dr.ellipse([(cx_r - 26) * s, (cy_r - 26) * s, (cx_r + 26) * s, (cy_r + 26) * s], fill=rgba("FFB800"), outline=INK, width=6 * s)
    dr.line([(114 * s, 114 * s), (146 * s, 146 * s)], fill=rgba("FF3B30"), width=12 * s)
    save_ic(im, "ic_scroll.png")

    # ic_shard.png: 霓虹紫金拼图英雄碎片
    im, dr, W, H = new_cv()
    draw_oct(dr, 52 * s, 52 * s, 204 * s, 204 * s, 18 * s, fill=rgba("9838F0"), outline=rgba("FFB800"), width=8 * s)
    dr.ellipse([104 * s, 26 * s, 152 * s, 74 * s], fill=rgba("9838F0"), outline=rgba("FFB800"), width=6 * s)
    dr.ellipse([180 * s, 104 * s, 228 * s, 152 * s], fill=rgba("9838F0"), outline=rgba("FFB800"), width=6 * s)
    dr.polygon(star_pts(128 * s, 128 * s, 34 * s, 15 * s), fill=rgba("FFD84C"), outline=INK, width=4 * s)
    save_ic(im, "ic_shard.png")

    # ic_anyshard.png: 幻彩霓虹八角万能大喇叭碎片
    im, dr, W, H = new_cv()
    draw_oct(dr, 32 * s, 32 * s, 224 * s, 224 * s, 46 * s, fill=rgba("00E5FF"), width=7 * s)
    draw_oct(dr, 48 * s, 48 * s, 208 * s, 208 * s, 38 * s, fill=rgba("A84CFF"), outline=rgba("FFB800"), width=6 * s)
    dr.polygon([(88 * s, 136 * s), (164 * s, 96 * s), (164 * s, 168 * s)], fill=rgba("FFE268"), outline=INK, width=6 * s)
    save_ic(im, "ic_anyshard.png")

    # ic_gearbox.png: 绯红金扣战术装备箱
    im, dr, W, H = new_cv()
    draw_oct(dr, 92 * s, 44 * s, 164 * s, 84 * s, 8 * s, fill=rgba("FFB800"), width=6 * s)
    draw_oct(dr, 38 * s, 74 * s, 218 * s, 214 * s, 16 * s, fill=rgba("D8222A"), width=7 * s)
    dr.line([(38 * s, 134 * s), (218 * s, 134 * s)], fill=rgba("FFB800"), width=10 * s)
    draw_oct(dr, 112 * s, 116 * s, 144 * s, 156 * s, 5 * s, fill=rgba("FFE478"), width=5 * s)
    save_ic(im, "ic_gearbox.png")

    # ic_cart.png: 紫晶重装补给方箱
    im, dr, W, H = new_cv()
    draw_oct(dr, 44 * s, 48 * s, 212 * s, 216 * s, 20 * s, fill=rgba("7832D8"), width=7 * s)
    for x0, y0 in [(44, 48), (176, 48), (44, 180), (176, 180)]:
        dr.rectangle([x0 * s, y0 * s, (x0 + 36) * s, (y0 + 36) * s], fill=rgba("FFB800"), outline=INK, width=5 * s)
    dr.polygon(hex_pts(128 * s, 132 * s, 34 * s), fill=rgba("00E5FF"), outline=INK, width=5 * s)
    save_ic(im, "ic_cart.png")

    # ic_arrow.png (320x320!): 赛博穿甲弹箭
    im, dr, W, H = new_cv(320, 320)
    dr.polygon([(256 * s, 64 * s), (178 * s, 102 * s), (218 * s, 142 * s)], fill=rgba("EAF6FF"), outline=INK, width=7 * s)
    dr.line([(86 * s, 234 * s), (204 * s, 116 * s)], fill=INK, width=28 * s)
    dr.line([(86 * s, 234 * s), (204 * s, 116 * s)], fill=rgba("00E5FF"), width=14 * s)
    draw_oct(dr, 54 * s, 212 * s, 108 * s, 266 * s, 8 * s, fill=rgba("FF3B30"), width=6 * s)
    save_ic(im, "ic_arrow.png", 320, 320)

    # ic_bomb.png (320x320!): 绯红金箍高爆雷管 + 电光引信
    im, dr, W, H = new_cv(320, 320)
    draw_oct(dr, 116 * s, 96 * s, 204 * s, 272 * s, 14 * s, fill=rgba("DF2228"), width=7 * s)
    for ry in (128, 232):
        dr.rectangle([116 * s, ry * s, 204 * s, (ry + 18) * s], fill=rgba("FFB800"), outline=INK, width=5 * s)
    dr.line([(160 * s, 96 * s), (172 * s, 58 * s)], fill=rgba("FFE278"), width=8 * s)
    dr.polygon(star_pts(176 * s, 52 * s, 28 * s, 10 * s, 6), fill=rgba("FFB800"), outline=rgba("FF3B30"), width=3 * s)
    save_ic(im, "ic_bomb.png", 320, 320)

    # ic_fan.png (288x288!): 鎏金翠绿旋风蒲扇
    im, dr, W, H = new_cv(288, 288)
    dr.line([(168 * s, 168 * s), (236 * s, 236 * s)], fill=INK, width=24 * s)
    dr.line([(168 * s, 168 * s), (236 * s, 236 * s)], fill=rgba("FF5838"), width=12 * s)
    draw_oct(dr, 44 * s, 44 * s, 204 * s, 204 * s, 44 * s, fill=rgba("FFB800"), width=7 * s)
    draw_oct(dr, 62 * s, 62 * s, 186 * s, 186 * s, 34 * s, fill=rgba("1C382E"), outline=rgba("00F57A"), width=5 * s)
    save_ic(im, "ic_fan.png", 288, 288)

    # ic_sword.png: 交叉合金扳手 + 黄金闪电（战力/攻击通用标）
    im, dr, W, H = new_cv()
    dr.line([(54 * s, 54 * s), (202 * s, 202 * s)], fill=INK, width=30 * s)
    dr.line([(54 * s, 54 * s), (202 * s, 202 * s)], fill=rgba("9CC2E6"), width=16 * s)
    bolt = [(156 * s, 32 * s), (76 * s, 134 * s), (126 * s, 134 * s), (98 * s, 224 * s), (184 * s, 118 * s), (134 * s, 118 * s)]
    dr.polygon(bolt, fill=rgba("FFD438"), outline=INK, width=7 * s)
    save_ic(im, "ic_sword.png")

    # ic_wall.png: 村口城防砖墙 + 黄黑警示底座
    im, dr, W, H = new_cv()
    draw_oct(dr, 42 * s, 68 * s, 214 * s, 184 * s, 10 * s, fill=rgba("C84828"), width=7 * s)
    dr.line([(42 * s, 124 * s), (214 * s, 124 * s)], fill=INK, width=6 * s)
    dr.line([(128 * s, 68 * s), (128 * s, 124 * s)], fill=INK, width=6 * s)
    draw_oct(dr, 34 * s, 178 * s, 222 * s, 218 * s, 6 * s, fill=rgba("FFB800"), width=7 * s)
    for sx_w in (64, 116, 168):
        dr.polygon([(sx_w * s, 182 * s), ((sx_w + 22) * s, 182 * s), ((sx_w + 8) * s, 214 * s), ((sx_w - 14) * s, 214 * s)], fill=INK)
    save_ic(im, "ic_wall.png")

    # ic_flag.png: 绯红金星守村战旗
    im, dr, W, H = new_cv()
    dr.line([(52 * s, 48 * s), (204 * s, 48 * s)], fill=rgba("FFB800"), width=12 * s)
    fl = [(68 * s, 54 * s), (188 * s, 54 * s), (188 * s, 178 * s), (128 * s, 218 * s), (68 * s, 178 * s)]
    dr.polygon(fl, fill=rgba("DF242C"), outline=rgba("FFB800"), width=7 * s)
    dr.polygon(star_pts(128 * s, 126 * s, 32 * s, 14 * s), fill=rgba("FFD84C"), outline=INK, width=4 * s)
    save_ic(im, "ic_flag.png")

    # ic_crown.png: 鎏金荣耀双翼星冠
    im, dr, W, H = new_cv()
    cr = [(38 * s, 184 * s), (28 * s, 78 * s), (88 * s, 122 * s), (128 * s, 44 * s), (168 * s, 122 * s), (228 * s, 78 * s), (218 * s, 184 * s)]
    dr.polygon(cr, fill=rgba("FFD438"), outline=INK, width=7 * s)
    draw_oct(dr, 42 * s, 178 * s, 214 * s, 212 * s, 6 * s, fill=rgba("EA9008"), width=6 * s)
    dr.polygon([(128 * s, 114 * s), (144 * s, 142 * s), (128 * s, 170 * s), (112 * s, 142 * s)], fill=rgba("00E5FF"), outline=INK, width=4 * s)
    save_ic(im, "ic_crown.png")

    # ic_medal.png: 绯红绶带黄金五角勋章
    im, dr, W, H = new_cv()
    dr.polygon([(88 * s, 32 * s), (168 * s, 32 * s), (148 * s, 118 * s), (108 * s, 118 * s)], fill=rgba("FF3B30"), outline=INK, width=7 * s)
    dr.polygon(star_pts(128 * s, 158 * s, 68 * s, 30 * s), fill=rgba("FFD438"), outline=INK, width=7 * s)
    save_ic(im, "ic_medal.png")

    # ic_star.png: 锐利切面黄金五角星
    im, dr, W, H = new_cv()
    pts = star_pts(128 * s, 132 * s, 102 * s, 46 * s)
    dr.polygon([(x, y + 6 * s) for x, y in pts], fill=rgba("8C4C06"), outline=INK, width=7 * s)
    dr.polygon(pts, fill=rgba("FFD638"), outline=INK, width=7 * s)
    dr.polygon(star_pts(128 * s, 130 * s, 62 * s, 26 * s)[:5], fill=rgba("FFF8C8"))
    save_ic(im, "ic_star.png")

    # ic_check.png: 八角霓虹翠绿对勾章
    im, dr, W, H = new_cv()
    draw_oct(dr, 28 * s, 28 * s, 228 * s, 228 * s, 48 * s, fill=rgba("00D868"), width=7 * s)
    draw_oct(dr, 42 * s, 42 * s, 214 * s, 214 * s, 40 * s, fill=rgba("0D2E24"), outline=rgba("00F57A"), width=5 * s)
    chk = [(74 * s, 132 * s), (112 * s, 172 * s), (186 * s, 92 * s), (168 * s, 74 * s), (112 * s, 134 * s), (92 * s, 114 * s)]
    dr.polygon(chk, fill=rgba("00F57A"))
    save_ic(im, "ic_check.png")

    # ic_active.png: 活跃度绯红绶带烈焰金章
    im, dr, W, H = new_cv()
    dr.polygon([(82 * s, 154 * s), (68 * s, 232 * s), (128 * s, 208 * s), (188 * s, 232 * s), (174 * s, 154 * s)], fill=rgba("FF3B30"), outline=INK, width=7 * s)
    dr.polygon(hex_pts(128 * s, 108 * s, 78 * s), fill=rgba("FFB800"), outline=INK, width=7 * s)
    dr.polygon([(128 * s, 58 * s), (158 * s, 108 * s), (128 * s, 154 * s), (98 * s, 108 * s)], fill=rgba("FF3B30"), outline=INK, width=5 * s)
    save_ic(im, "ic_active.png")

    # ic_ad.png: 04 黑曜石霓虹场记视频标
    im, dr, W, H = new_cv()
    draw_oct(dr, 34 * s, 74 * s, 222 * s, 220 * s, 16 * s, fill=rgba("101D38"), outline=rgba("FFB800"), width=7 * s)
    draw_oct(dr, 30 * s, 36 * s, 222 * s, 82 * s, 10 * s, fill=rgba("FF3B30"), width=7 * s)
    for sx_a in (68, 126, 184):
        dr.polygon([(sx_a * s, 40 * s), ((sx_a + 22) * s, 40 * s), ((sx_a + 8) * s, 78 * s), ((sx_a - 14) * s, 78 * s)], fill=rgba("EAF4FF"))
    dr.polygon([(106 * s, 114 * s), (166 * s, 148 * s), (106 * s, 182 * s)], fill=rgba("00F57A"), outline=INK, width=5 * s)
    save_ic(im, "ic_ad.png")

    # ic_fast.png: 双快进黄金切角箭头
    im, dr, W, H = new_cv()
    for ox in (36, 122):
        pts = [(ox * s, 52 * s), ((ox + 96) * s, 128 * s), (ox * s, 204 * s)]
        dr.polygon([(x, y + 7 * s) for x, y in pts], fill=rgba("783A06"), outline=INK, width=7 * s)
        dr.polygon(pts, fill=rgba("FFD438"), outline=INK, width=7 * s)
    save_ic(im, "ic_fast.png")

    # ic_fist.png: 绯红金边重装战拳
    im, dr, W, H = new_cv()
    draw_oct(dr, 74 * s, 166 * s, 182 * s, 224 * s, 12 * s, fill=rgba("FFB800"), width=7 * s)
    draw_oct(dr, 46 * s, 42 * s, 208 * s, 178 * s, 34 * s, fill=rgba("FF3B30"), width=7 * s)
    draw_oct(dr, 42 * s, 108 * s, 130 * s, 156 * s, 16 * s, fill=rgba("C81E24"), width=6 * s)
    save_ic(im, "ic_fist.png")

    # ic_gear.png: 黄金八齿齿轮 + 赛博青内芯
    im, dr, W, H = new_cv()
    cx = cy = 128 * s
    for k in range(8):
        a = k * math.pi / 4.0
        tx, ty = cx + math.cos(a) * 88 * s, cy + math.sin(a) * 88 * s
        nx, ny = -math.sin(a) * 20 * s, math.cos(a) * 20 * s
        rx, ry = math.cos(a) * 24 * s, math.sin(a) * 24 * s
        dr.polygon([(tx - rx - nx, ty - ry - ny), (tx + rx - nx, ty + ry - ny), (tx + rx + nx, ty + ry + ny), (tx - rx + nx, ty - ry + ny)], fill=rgba("FFB800"), outline=INK, width=7 * s)
    dr.ellipse([cx - 78 * s, cy - 78 * s, cx + 78 * s, cy + 78 * s], fill=rgba("FFD638"), outline=INK, width=7 * s)
    dr.ellipse([cx - 42 * s, cy - 42 * s, cx + 42 * s, cy + 42 * s], fill=rgba("00E5FF"), outline=INK, width=7 * s)
    save_ic(im, "ic_gear.png")

    # ic_hand.png: 战术亮白点击手套 + 霓虹青护腕
    im, dr, W, H = new_cv()
    dr.line([(122 * s, 148 * s), (70 * s, 48 * s)], fill=INK, width=48 * s)
    dr.ellipse([46 * s, 24 * s, 94 * s, 72 * s], fill=INK)
    draw_oct(dr, 74 * s, 94 * s, 208 * s, 202 * s, 28 * s, fill=rgba("EAF4FF"), width=7 * s)
    dr.line([(122 * s, 148 * s), (70 * s, 48 * s)], fill=rgba("FFFFFF"), width=34 * s)
    dr.ellipse([53 * s, 31 * s, 87 * s, 65 * s], fill=rgba("FFFFFF"))
    draw_oct(dr, 112 * s, 184 * s, 212 * s, 226 * s, 10 * s, fill=rgba("00E5FF"), width=7 * s)
    save_ic(im, "ic_hand.png")

    # ic_heart.png: 切面霓虹翠绿生命核心
    im, dr, W, H = new_cv()
    ht = [(128 * s, 220 * s), (36 * s, 128 * s), (36 * s, 74 * s), (76 * s, 42 * s), (128 * s, 78 * s), (180 * s, 42 * s), (220 * s, 74 * s), (220 * s, 128 * s)]
    dr.polygon(ht, fill=rgba("00D868"), outline=INK, width=7 * s)
    ht_in = [(128 * s, 196 * s), (56 * s, 124 * s), (56 * s, 82 * s), (82 * s, 62 * s), (128 * s, 96 * s), (174 * s, 62 * s), (200 * s, 82 * s), (200 * s, 124 * s)]
    dr.polygon(ht_in, fill=rgba("00F57A"))
    save_ic(im, "ic_heart.png")

    # ic_hourglass.png: 鎏金赛博青沙漏
    im, dr, W, H = new_cv()
    dr.polygon([(72 * s, 52 * s), (184 * s, 52 * s), (138 * s, 128 * s), (118 * s, 128 * s)], fill=rgba("00E5FF"), outline=INK, width=7 * s)
    dr.polygon([(118 * s, 128 * s), (138 * s, 128 * s), (184 * s, 204 * s), (72 * s, 204 * s)], fill=rgba("0D2240"), outline=INK, width=7 * s)
    dr.polygon([(128 * s, 148 * s), (170 * s, 198 * s), (86 * s, 198 * s)], fill=rgba("FFB800"))
    draw_oct(dr, 54 * s, 30 * s, 202 * s, 56 * s, 6 * s, fill=rgba("FFB800"), width=6 * s)
    draw_oct(dr, 54 * s, 200 * s, 202 * s, 226 * s, 6 * s, fill=rgba("FFB800"), width=6 * s)
    save_ic(im, "ic_hourglass.png")

    # ic_lock.png: 八角黄金黑曜石挂锁
    im, dr, W, H = new_cv()
    dr.arc([78 * s, 34 * s, 178 * s, 144 * s], 180, 360, fill=rgba("9CC2E6"), width=20 * s)
    draw_oct(dr, 54 * s, 102 * s, 202 * s, 222 * s, 20 * s, fill=rgba("FFD438"), width=7 * s)
    dr.ellipse([112 * s, 140 * s, 144 * s, 172 * s], fill=INK)
    dr.polygon([(120 * s, 164 * s), (136 * s, 164 * s), (142 * s, 198 * s), (114 * s, 198 * s)], fill=INK)
    save_ic(im, "ic_lock.png")

    # ic_map.png: 黑曜石防线电子战术地图
    im, dr, W, H = new_cv()
    for x0, x1, dy, hc in [(36, 98, 0, "10203C"), (98, 158, 14, "162C50"), (158, 220, 0, "10203C")]:
        dr.polygon([(x0 * s, (46 + dy) * s), (x1 * s, (60 - dy) * s), (x1 * s, (206 - dy) * s), (x0 * s, (192 + dy) * s)], fill=rgba(hc), outline=rgba("00E5FF"), width=6 * s)
    dr.line([(62 * s, 156 * s), (128 * s, 118 * s), (186 * s, 138 * s)], fill=rgba("00F57A"), width=7 * s)
    dr.line([(172 * s, 124 * s), (200 * s, 152 * s)], fill=rgba("FF3B30"), width=8 * s)
    dr.line([(200 * s, 124 * s), (172 * s, 152 * s)], fill=rgba("FF3B30"), width=8 * s)
    save_ic(im, "ic_map.png")

    # ic_rage.png: 锐利绯红怒火能量苗
    im, dr, W, H = new_cv()
    outer = [(128 * s, 24 * s), (182 * s, 84 * s), (212 * s, 72 * s), (214 * s, 152 * s), (184 * s, 214 * s), (128 * s, 230 * s), (72 * s, 214 * s), (42 * s, 152 * s), (44 * s, 72 * s), (74 * s, 84 * s)]
    dr.polygon(outer, fill=rgba("FF3B30"), outline=INK, width=7 * s)
    dr.polygon([(128 * s, 82 * s), (168 * s, 132 * s), (162 * s, 200 * s), (128 * s, 214 * s), (94 * s, 200 * s), (88 * s, 132 * s)], fill=rgba("FFB800"))
    dr.line([(88 * s, 144 * s), (118 * s, 158 * s)], fill=INK, width=9 * s)
    dr.line([(168 * s, 144 * s), (138 * s, 158 * s)], fill=INK, width=9 * s)
    save_ic(im, "ic_rage.png")

    # ic_refresh.png: 霓虹翠绿双回环刷新箭头
    im, dr, W, H = new_cv()
    dr.arc([44 * s, 44 * s, 212 * s, 212 * s], 20, 160, fill=INK, width=34 * s)
    dr.arc([44 * s, 44 * s, 212 * s, 212 * s], 200, 340, fill=INK, width=34 * s)
    dr.arc([48 * s, 48 * s, 208 * s, 208 * s], 20, 160, fill=rgba("00F57A"), width=20 * s)
    dr.arc([48 * s, 48 * s, 208 * s, 208 * s], 200, 340, fill=rgba("00F57A"), width=20 * s)
    dr.polygon([(174 * s, 42 * s), (224 * s, 88 * s), (162 * s, 102 * s)], fill=rgba("8CFFBE"), outline=INK, width=6 * s)
    dr.polygon([(82 * s, 214 * s), (32 * s, 168 * s), (94 * s, 154 * s)], fill=rgba("8CFFBE"), outline=INK, width=6 * s)
    save_ic(im, "ic_refresh.png")

    # ic_sweep.png: 黄金闪电 + 战术扫荡帚
    im, dr, W, H = new_cv()
    bolt = [(114 * s, 32 * s), (44 * s, 128 * s), (92 * s, 128 * s), (68 * s, 216 * s), (146 * s, 114 * s), (98 * s, 114 * s)]
    dr.polygon(bolt, fill=rgba("FFD438"), outline=INK, width=7 * s)
    dr.line([(198 * s, 48 * s), (168 * s, 152 * s)], fill=rgba("C88428"), width=14 * s)
    dr.polygon([(144 * s, 148 * s), (192 * s, 156 * s), (206 * s, 222 * s), (126 * s, 214 * s)], fill=rgba("FF8824"), outline=INK, width=6 * s)
    save_ic(im, "ic_sweep.png")

    # ic_thumb.png: 鎏金赛博青点赞大拇指
    im, dr, W, H = new_cv()
    draw_oct(dr, 40 * s, 114 * s, 90 * s, 216 * s, 10 * s, fill=rgba("00E5FF"), width=7 * s)
    draw_oct(dr, 84 * s, 104 * s, 212 * s, 214 * s, 22 * s, fill=rgba("FFB800"), width=7 * s)
    dr.polygon([(92 * s, 116 * s), (124 * s, 36 * s), (156 * s, 40 * s), (154 * s, 110 * s)], fill=rgba("FFE268"), outline=INK, width=7 * s)
    save_ic(im, "ic_thumb.png")

    # 排行榜五图标：ic_rank_arena, ic_rank_escort, ic_rank_like, ic_rank_power, ic_rank_stage
    # ic_rank_arena.png
    im, dr, W, H = new_cv()
    dr.line([(44 * s, 208 * s), (212 * s, 44 * s)], fill=rgba("9CC2E6"), width=18 * s)
    dr.line([(212 * s, 208 * s), (44 * s, 44 * s)], fill=rgba("9CC2E6"), width=18 * s)
    sh = [(128 * s, 48 * s), (196 * s, 74 * s), (184 * s, 158 * s), (128 * s, 216 * s), (72 * s, 158 * s), (60 * s, 74 * s)]
    dr.polygon(sh, fill=rgba("FF3B30"), outline=rgba("FFB800"), width=7 * s)
    dr.polygon(star_pts(128 * s, 128 * s, 30 * s, 13 * s), fill=rgba("FFD84C"))
    save_ic(im, "ic_rank_arena.png")

    # ic_rank_escort.png
    im, dr, W, H = new_cv()
    for gx, gy in [(86, 72), (128, 56), (170, 72)]:
        dr.polygon([(gx * s, (gy - 26) * s), ((gx + 24) * s, gy * s), (gx * s, (gy + 26) * s), ((gx - 24) * s, gy * s)], fill=rgba("00E5FF"), outline=INK, width=6 * s)
    draw_oct(dr, 44 * s, 98 * s, 212 * s, 192 * s, 14 * s, fill=rgba("132B52"), outline=rgba("00E5FF"), width=7 * s)
    dr.rectangle([48 * s, 152 * s, 208 * s, 174 * s], fill=rgba("FFB800"), outline=INK, width=5 * s)
    for wx in (82, 174):
        dr.ellipse([(wx - 26) * s, 170 * s, (wx + 26) * s, 222 * s], fill=rgba("0B1326"), outline=INK, width=7 * s)
    save_ic(im, "ic_rank_escort.png")

    # ic_rank_like.png
    im, dr, W, H = new_cv()
    draw_oct(dr, 28 * s, 28 * s, 228 * s, 228 * s, 48 * s, fill=rgba("13203A"), outline=rgba("FFB800"), width=8 * s)
    draw_oct(dr, 92 * s, 112 * s, 184 * s, 186 * s, 14 * s, fill=rgba("FFD438"), width=6 * s)
    dr.polygon([(98 * s, 120 * s), (122 * s, 64 * s), (146 * s, 68 * s), (144 * s, 118 * s)], fill=rgba("FFF4A8"), outline=INK, width=5 * s)
    save_ic(im, "ic_rank_like.png")

    # ic_rank_power.png
    im, dr, W, H = new_cv()
    dr.polygon([(58 * s, 52 * s), (178 * s, 52 * s), (158 * s, 146 * s), (118 * s, 168 * s), (78 * s, 146 * s)], fill=rgba("FFB800"), outline=INK, width=7 * s)
    draw_oct(dr, 76 * s, 188 * s, 160 * s, 218 * s, 6 * s, fill=rgba("EA9008"), width=6 * s)
    dr.polygon([(142 * s, 210 * s), (206 * s, 56 * s), (222 * s, 72 * s), (162 * s, 218 * s)], fill=rgba("00E5FF"), outline=INK, width=6 * s)
    save_ic(im, "ic_rank_power.png")

    # ic_rank_stage.png
    im, dr, W, H = new_cv()
    draw_oct(dr, 34 * s, 142 * s, 98 * s, 216 * s, 6 * s, fill=rgba("00C8F0"), width=6 * s)
    draw_oct(dr, 158 * s, 156 * s, 222 * s, 216 * s, 6 * s, fill=rgba("E08A42"), width=6 * s)
    draw_oct(dr, 92 * s, 108 * s, 164 * s, 216 * s, 8 * s, fill=rgba("FFB800"), width=7 * s)
    dr.polygon(star_pts(128 * s, 68 * s, 32 * s, 14 * s), fill=rgba("FFD84C"), outline=INK, width=5 * s)
    save_ic(im, "ic_rank_stage.png")


# ==================== 4. 四枚战斗 UI 贴图 (ui_*.png) ====================

def build_ui_fx():
    s = SS
    # ui_buff_pill.png (224x80)
    im, dr, W, H = new_cv(224, 80)
    draw_oct(dr, 8 * s, 8 * s, 216 * s, 72 * s, 18 * s, fill=rgba("0B1326"), outline=rgba("FFB800"), width=4 * s)
    save_ic(im, "ui_buff_pill.png", 224, 80)

    # ui_buff_wing.png (96x96)
    im, dr, W, H = new_cv(96, 96)
    for dy_w, hc in [(0, "FFF8C8"), (26, "FFB800")]:
        pts = [(14 * s, (48 + dy_w) * s), (48 * s, (18 + dy_w) * s), (82 * s, (48 + dy_w) * s), (82 * s, (64 + dy_w) * s), (48 * s, (34 + dy_w) * s), (14 * s, (64 + dy_w) * s)]
        dr.polygon(pts, fill=rgba(hc), outline=INK, width=3 * s)
    save_ic(im, "ui_buff_wing.png", 96, 96)

    # ui_crit_burst.png (256x256)
    im, dr, W, H = new_cv(256, 256)
    dr.polygon(star_pts(128 * s, 128 * s, 114 * s, 58 * s, 10), fill=rgba("FF3B30"), outline=INK, width=6 * s)
    dr.polygon(star_pts(128 * s, 128 * s, 84 * s, 42 * s, 10), fill=rgba("FFB800"))
    save_ic(im, "ui_crit_burst.png", 256, 256)

    # ui_ink_strip.png (640x160)
    im, dr, W, H = new_cv(640, 160)
    pts = [(24 * s, 80 * s), (76 * s, 42 * s), (564 * s, 42 * s), (616 * s, 80 * s), (564 * s, 118 * s), (76 * s, 118 * s)]
    dr.polygon(pts, fill=(9, 16, 34, 215), outline=rgba("00E5FF", 185), width=3 * s)
    save_ic(im, "ui_ink_strip.png", 640, 160)


if __name__ == "__main__":
    # 8 枚战术宝箱
    draw_tactical_chest("ic_chest_wood.png", "102028", "E4A448", "A8681C", "00F57A", "C8FFE4", opened=False)
    draw_tactical_chest("ic_chest_wood_open.png", "102028", "E4A448", "A8681C", "00F57A", "C8FFE4", opened=True)
    draw_tactical_chest("ic_chest_silver.png", "161432", "DCEEFF", "7A98B8", "A84CFF", "F0D4FF", opened=False)
    draw_tactical_chest("ic_chest_silver_open.png", "161432", "DCEEFF", "7A98B8", "A84CFF", "F0D4FF", opened=True)
    draw_tactical_chest("ic_chest.png", "101D38", "FFE268", "D8860C", "00E5FF", "D8FCFF", opened=False)
    draw_tactical_chest("ic_chest_gold.png", "101D38", "FFE268", "D8860C", "00E5FF", "D8FCFF", opened=False)
    draw_tactical_chest("ic_chest_open.png", "101D38", "FFE268", "D8860C", "00E5FF", "D8FCFF", opened=True)
    draw_tactical_chest("ic_rank_chest.png", "280E1C", "FFE268", "D8860C", "FF3B30", "FFD4CC", opened=False, crown=True)
    # 12 枚页签 + 49 枚功能图标 + 4 枚战斗条
    build_tabs()
    build_all_ic()
    build_ui_fx()
    print("Completed all 73 04-style root icons, tabs & combat strips!")
