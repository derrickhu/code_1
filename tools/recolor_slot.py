"""把局内石垛、石坛、点将台重新上色成浅色条石 + 霁蓝内线，和城墙走道同一种石料。

原图留在 tools/src/<名字>_src.png，重复运行不会越调越浅。
用法：python3 tools/recolor_slot.py
"""
import os
import shutil
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "Assets/Resources/Art")
SRC_DIR = os.path.join(ROOT, "tools/src")

# 名字: (内底区域, 内线区域)，坐标按原图像素；None 表示不单独处理。
JOBS = {
    "b_slot": ((88, 40, 296, 200), (70, 24, 312, 214)),
    "b_pedestal": (None, (0, 0, 9999, 9999)),
    "b_throne_base": (None, (0, 0, 9999, 9999)),
}


def hexc(h):
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def ramp(stops, t):
    t = max(0.0, min(1.0, t))
    for (a, ca), (b, cb) in zip(stops, stops[1:]):
        if t <= b:
            k = (t - a) / (b - a) if b > a else 0
            return tuple(int(ca[i] + (cb[i] - ca[i]) * k) for i in range(3))
    return stops[-1][1]


STONE = [(0.0, hexc("34373F")), (0.22, hexc("67676C")), (0.45, hexc("A9A49C")),
         (0.62, hexc("CFC6B8")), (0.80, hexc("E8E0D2")), (1.0, hexc("F8F3EA"))]
FLOOR = [(0.0, hexc("8E8576")), (0.40, hexc("BFB3A0")), (0.47, hexc("CDC2AF")), (1.0, hexc("E2D9C8"))]
LINE = hexc("336F96")
LINE_HI = hexc("6FAFD4")


def inside(box, x, y):
    return box is not None and box[0] <= x <= box[2] and box[1] <= y <= box[3]


def recolor(name, floor_box, line_box):
    dst = os.path.join(ART, name + ".png")
    src = os.path.join(SRC_DIR, name + "_src.png")
    if not os.path.exists(src):
        os.makedirs(SRC_DIR, exist_ok=True)
        shutil.copy(dst, src)
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()
    out = Image.new("RGBA", (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255.0
            if r - b > 25 and inside(line_box, x, y):
                k = max(0.0, min(1.0, (lum - 0.35) / 0.5))
                c = tuple(int(LINE[i] + (LINE_HI[i] - LINE[i]) * k) for i in range(3))
            elif inside(floor_box, x, y):
                c = ramp(FLOOR, lum + (y - floor_box[1]) / (floor_box[3] - floor_box[1]) * 0.06)
            else:
                c = ramp(STONE, lum * 1.12)
            op[x, y] = (c[0], c[1], c[2], a)
    out.save(dst)
    print("saved", dst)


def main():
    for name, (floor_box, line_box) in JOBS.items():
        recolor(name, floor_box, line_box)


if __name__ == "__main__":
    main()
