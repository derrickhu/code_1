#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
启动页合成：主视觉 + 书法标题 + 底部暗场 + 进度槽 + 健康游戏忠告 + 12+ 适龄标，压成一张 1080x1920。
微信封面和游戏内启动页用的都是这一张，进度条填充和状态字由各自叠在槽里。

排版以 720x1280 设计尺寸写（和微信 loadingPageConfig 同一套坐标），合成时乘 1.5。
微信封面按 noBorder 铺满，长屏裁掉左右一点边，不再上下留黑边。

图层：game_assets/code_2/assets/raw/loading_key.jpg、loading_logo.jpg。
主视觉先用 tools/upscale.py 超分成 loading_key_hd.jpg，有高清版就用高清版。
标题字是洋红底，这里抠掉。印章里的「梁山」用书法字体补上。
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT.parent / "game_assets/code_1/assets/raw"
if not RAW.exists():
    RAW = ROOT / "tools/src"
KEY = (ROOT / "tools/src/loading_key_hd.jpg") if (ROOT / "tools/src/loading_key_hd.jpg").exists() else (RAW / "loading_key_hd.jpg")
if not KEY.exists():
    KEY = RAW / "loading_key.jpg"
LOGO = RAW / "loading_logo.jpg"
if not LOGO.exists():
    LOGO = ROOT / "tools/src/loading_logo.png"
OUT = ROOT / "Assets/Resources/Art/loading.jpg"
LOGO_OUT = ROOT / "Assets/Resources/Art/logo.png"
BRUSH = ROOT / "Assets/Resources/Fonts/Brush.ttf"
# 楷体子集缺字，忠告正文用系统宋体。标题仍用毛笔字。
SONG = Path("/System/Library/Fonts/Supplemental/Songti.ttc")

# 720x1280 设计坐标（进度槽、状态字离底边），和 wechat_loading_cover.py / LoadingScreen.cs 共用。
DW, DH = 720, 1280
S = 1.5
W, H = round(DW * S), round(DH * S)
BAR_W, BAR_H, BAR_BOTTOM = 400, 10, 214
TEXT_BOTTOM, TEXT_H = 232, 20
ADVICE_TITLE_Y = 162
ADVICE_BOTTOM, ADVICE_STEP = 36, 26
LOGO_W, LOGO_CY = 600, 292
BADGE_X, BADGE_Y, BADGE_SIZE = 92, 100, 58

GOLD = (222, 186, 112)
GOLD_DEEP = (176, 132, 62)
PAPER = (236, 225, 202)
NIGHT = (20, 13, 9)

ADVICE_TITLE = "健康游戏忠告"
ADVICE = [
    "抵制不良游戏，拒绝盗版游戏。",
    "注意自我保护，谨防受骗上当。",
    "适度游戏益脑，沉迷游戏伤身。",
    "合理安排时间，享受健康生活。",
]


def px(v):
    return round(v * S)


def from_bottom(v):
    return H - px(v)


def text_center(draw, text, face, cx, cy, fill, **kw):
    box = draw.textbbox((0, 0), text, font=face, **{k: v for k, v in kw.items() if k == "stroke_width"})
    tw, th = box[2] - box[0], box[3] - box[1]
    draw.text((cx - tw / 2 - box[0], cy - th / 2 - box[1]), text, font=face, fill=fill, **kw)


def is_magenta(r, g, b):
    return g < 80 and b > 55 and r > 130 and b > g + 25 and r > b * 0.9


def key_logo():
    if LOGO.suffix.lower() == ".png":
        rgba = Image.open(LOGO).convert("RGBA")
        bbox = rgba.getbbox()
        return rgba.crop(bbox) if bbox else rgba
    im = Image.open(LOGO).convert("RGB")
    out = Image.new("RGBA", im.size)
    src, dst = im.load(), out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b = src[x, y]
            if is_magenta(r, g, b):
                continue
            # 白边和金边上的洋红溢色拉回。
            if b > 70 and b > g * 0.55 and g > 30 and r > 160:
                b = min(b, g)
            dst[x, y] = (r, g, b, 255)
    bbox = out.getbbox()
    if not bbox:
        raise SystemExit("标题抠完是空的")
    return out.crop(bbox)


def seal_box(im):
    """右下角那枚小方印的红芯。笔画是一大片红，方印是独立的小方块。"""
    w, h = im.size
    pix = im.load()
    seen = bytearray(w * h)

    def red(x, y):
        r, g, b, a = pix[x, y]
        return a > 180 and r > 130 and g < 60 and b < 70 and r > g + 60

    best = None
    for y in range(h):
        for x in range(w // 2, w):
            i = y * w + x
            if seen[i] or not red(x, y):
                continue
            stack = [(x, y)]
            seen[i] = 1
            pts = []
            while stack:
                cx, cy = stack.pop()
                pts.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    j = ny * w + nx
                    if seen[j] or not red(nx, ny):
                        continue
                    seen[j] = 1
                    stack.append((nx, ny))
            if len(pts) < 40 or len(pts) > 6000:
                continue
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            bw, bh = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
            if bw < 10 or bh < 10 or not 0.65 <= bw / bh <= 1.45:
                continue
            # 越靠右下越像印章。
            score = min(xs) + min(ys)
            if best is None or score > best[0]:
                best = (score, min(xs), min(ys), max(xs) + 1, max(ys) + 1)
    if best is None:
        raise SystemExit("没找到标题上的空印章")
    return best[1:]


def paint_seal(lg, box):
    x0, y0, x1, y1 = box
    d = ImageDraw.Draw(lg)
    size = max(8, round((y1 - y0) * 0.46))
    face = ImageFont.truetype(str(BRUSH), size)
    cx = (x0 + x1) / 2
    text_center(d, "守", face, cx, y0 + (y1 - y0) * 0.27, (250, 236, 214, 255))
    text_center(d, "村", face, cx, y0 + (y1 - y0) * 0.73, (250, 236, 214, 255))


def key_art():
    im = Image.open(KEY).convert("RGB")
    sw, sh = im.size
    scale = max(W / sw, H / sh)
    im = im.resize((round(sw * scale), round(sh * scale)), Image.Resampling.LANCZOS)
    x, y = (im.width - W) // 2, (im.height - H) // 2
    return im.crop((x, y, x + W, y + H)).convert("RGBA")


def bottom_shade(base):
    """底部压一层墨色暗场，忠告和进度条在上面读得清；顶端从透明开始。"""
    shade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(shade)
    # 人物脚在 70% 高处，暗场从脚下的空地开始，不压人。
    top = from_bottom(420)
    for y in range(top, H):
        t = (y - top) / max(1, H - top)
        a = (t * t * (3 - 2 * t)) ** 0.72 * 0.94
        d.line([(0, y), (W, y)], fill=NIGHT + (round(a * 255),))
    base.alpha_composite(shade)
    vig = Image.new("L", (W, H), 0)
    ImageDraw.Draw(vig).ellipse((-W * 0.22, -H * 0.08, W * 1.22, H * 1.02), fill=255)
    vig = vig.filter(ImageFilter.GaussianBlur(px(64)))
    dark = Image.new("RGBA", (W, H), NIGHT + (255,))
    dark.putalpha(vig.point(lambda v: round((255 - v) * 0.28)))
    base.alpha_composite(dark)


def export_logo():
    """主界面顶上用的同一枚标题，透明底。"""
    lg = key_logo()
    has_raw_seal = LOGO.suffix.lower() != ".png"
    box = seal_box(lg) if has_raw_seal else None
    w = 900
    scale = w / lg.width
    lg = lg.resize((w, round(lg.height * scale)), Image.Resampling.LANCZOS)
    if box is not None:
        paint_seal(lg, tuple(round(v * scale) for v in box))
    lg.save(LOGO_OUT, optimize=True)
    print(f"标题 {LOGO_OUT}  {lg.width}x{lg.height}")


def logo(base):
    lg = key_logo()
    has_raw_seal = LOGO.suffix.lower() != ".png"
    box = seal_box(lg) if has_raw_seal else None
    w = px(LOGO_W)
    h = round(lg.height * w / lg.width)
    scale = w / lg.width
    lg = lg.resize((w, h), Image.Resampling.LANCZOS)
    if box is not None:
        paint_seal(lg, tuple(round(v * scale) for v in box))
    cx, cy = W // 2, px(LOGO_CY)
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse((cx - w * 0.55, cy - h * 0.7, cx + w * 0.55, cy + h * 0.7), fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(px(36)))
    light = Image.new("RGBA", (W, H), (255, 244, 214, 255))
    light.putalpha(glow.point(lambda v: round(v * 0.42)))
    base.alpha_composite(light)
    shadow = Image.new("RGBA", lg.size, NIGHT + (0,))
    shadow.putalpha(lg.getchannel("A").point(lambda v: round(v * 0.5)))
    shadow = shadow.filter(ImageFilter.GaussianBlur(px(5)))
    base.alpha_composite(shadow, (cx - w // 2, cy - h // 2 + px(5)))
    base.alpha_composite(lg, (cx - w // 2, cy - h // 2))


def diamond(d, cx, cy, r, fill):
    d.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], fill=fill)


def bar_slot(base):
    """进度槽：黑漆胶囊、金边，两头一颗金菱。插件的进度条正好落在里面。"""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cy = from_bottom(BAR_BOTTOM + BAR_H / 2)
    half_w = px(BAR_W / 2 + 7)
    half_h = px(BAR_H / 2 + 6)
    cx = W // 2
    box = (cx - half_w, cy - half_h, cx + half_w, cy + half_h)
    d.rounded_rectangle(box, radius=half_h, fill=(10, 7, 5, 235), outline=GOLD_DEEP + (255,), width=max(2, px(1.6)))
    inner = (box[0] + px(2.2), box[1] + px(2.2), box[2] - px(2.2), box[3] - px(2.2))
    d.rounded_rectangle(inner, radius=max(1, half_h - px(2.2)), outline=(255, 226, 160, 70), width=1)
    for sgn in (-1, 1):
        ex = cx + sgn * (half_w + px(10))
        diamond(d, ex, cy, px(5.5), GOLD + (255,))
        diamond(d, ex, cy, px(2.4), NIGHT + (255,))
        d.line([(ex + sgn * px(7), cy), (ex + sgn * px(30), cy)], fill=GOLD_DEEP + (200,), width=max(1, px(1.2)))
    base.alpha_composite(layer)


def advice(base):
    d = ImageDraw.Draw(base)
    brush = ImageFont.truetype(str(BRUSH), px(21))
    kai = ImageFont.truetype(str(SONG), px(17), index=1)
    cy = from_bottom(ADVICE_TITLE_Y)
    text_center(d, ADVICE_TITLE, brush, W / 2, cy, GOLD + (255,))
    box = d.textbbox((0, 0), ADVICE_TITLE, font=brush)
    half = (box[2] - box[0]) / 2 + px(14)
    for sgn in (-1, 1):
        x0 = W / 2 + sgn * half
        x1 = W / 2 + sgn * (half + px(78))
        d.line([(x0, cy), (x1, cy)], fill=GOLD_DEEP + (220,), width=max(1, px(1)))
        diamond(d, x1 + sgn * px(5), cy, px(3.2), GOLD + (255,))
    n = len(ADVICE)
    for i, line in enumerate(ADVICE):
        y = from_bottom(ADVICE_BOTTOM + ADVICE_STEP * (n - 1 - i) + ADVICE_STEP / 2)
        text_center(d, line, kai, W / 2, y, PAPER + (235,))


def age_badge(base):
    """CADPA 适龄提示：蓝底 12+，和后台填的适龄一致。"""
    size = px(BADGE_SIZE)
    k = 4
    big = size * k
    im = Image.new("RGBA", (big, big + 6 * k), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = round(big * 0.2)
    d.rounded_rectangle((0, 5 * k, big, big + 5 * k), radius=r, fill=(0, 0, 0, 70))
    d.rounded_rectangle((0, 0, big, big), radius=r, fill=(255, 255, 255, 255))
    pad = round(big * 0.06)
    d.rounded_rectangle((pad, pad, big - pad, big - pad), radius=r - pad, fill=(23, 105, 210, 255))
    num = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", round(big * 0.46), index=1)
    tag = ImageFont.truetype("/System/Library/Fonts/HelveticaNeue.ttc", round(big * 0.15), index=1)
    text_center(d, "12+", num, big / 2, big * 0.43, (255, 255, 255, 255))
    text_center(d, "CADPA", tag, big / 2, big * 0.78, (255, 255, 255, 235))
    im = im.resize((size, size + 6), Image.Resampling.LANCZOS)
    base.alpha_composite(im, (px(BADGE_X) - size // 2, px(BADGE_Y) - size // 2))


def main():
    for f in (KEY, LOGO, BRUSH, SONG):
        if not f.exists():
            raise SystemExit(f"缺少 {f}")
    im = key_art()
    bottom_shade(im)
    logo(im)
    bar_slot(im)
    advice(im)
    age_badge(im)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(OUT, "JPEG", quality=92, optimize=True, subsampling=0)
    print(f"启动页 {OUT}  {W}x{H}  {OUT.stat().st_size // 1024}KB")
    export_logo()


if __name__ == "__main__":
    main()
