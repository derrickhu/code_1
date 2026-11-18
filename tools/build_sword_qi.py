"""替天行道剑气贴图（4x 超采样）。输出到 Assets/Resources/Art/：

- fx_qi_blade.png  (1024x512) 月牙剑身：最前一道刃口，后面青白流光拖成丝。普通混合，亮地面上也看得清。
- fx_qi_edge.png   (1024x512) 只有刃口和内侧第二道锋线，白色，叠加发光用。
- fx_qi_glow.png   (512x256)  剑身的大半径柔光，叠加打底。
- fx_qi_streak.png (512x48)   风痕：右端亮头、左边拖长尾，白色。
- fx_qi_scar.png   (1024x96)  地面剑痕：中间一线亮，边上带锯齿碎光，两头收尖，白色。
- fx_qi_ring.png   (1024x512) 半圆余波：圆心在底边中点，外沿亮线往里拖柔光，白色。

贴图上方 = 剑气前进方向。白色贴图由代码着色。

用法：python3 tools/build_sword_qi.py
"""
import os

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets/Resources/Art")
SS = 4
RNG = np.random.default_rng(20261114)


def save(name: str, rgb: np.ndarray, a: np.ndarray, w: int, h: int) -> None:
    a = np.clip(a, 0.0, 1.0)
    rgb = np.clip(rgb, 0.0, 1.0)
    # 先预乘再缩，边缘不出黑边或白边
    pm = np.dstack([rgb * a[..., None], a[..., None]]).astype(np.float32)
    p = np.dstack([np.asarray(Image.fromarray(np.ascontiguousarray(pm[..., c])).resize((w, h), Image.BOX)) for c in range(4)])
    p = np.clip(p, 0.0, 1.0)
    al = p[..., 3:4]
    col = np.where(al > 1e-5, p[..., :3] / np.maximum(al, 1e-5), 0.0)
    out = np.dstack([np.clip(col, 0, 1), al])
    out[0, :, 3] = out[-1, :, 3] = 0.0
    out[:, 0, 3] = out[:, -1, 3] = 0.0
    Image.fromarray((out * 255.0 + 0.5).astype(np.uint8)).save(os.path.join(OUT, name))


def stripes(t: np.ndarray, n: int, lo: float, hi: float) -> np.ndarray:
    """沿刃口方向的细丝：几组随机频率相位的正弦叠起来，归一到 0..1。"""
    s = np.zeros_like(t)
    for _ in range(n):
        f = RNG.uniform(lo, hi)
        ph = RNG.uniform(0, np.pi * 2)
        s += np.sin(t * f + ph) * RNG.uniform(0.5, 1.0)
    s = (s - s.min()) / max(1e-6, s.max() - s.min())
    return s


def blade_fields(w: int, h: int):
    py, px = np.mgrid[0:h, 0:w].astype(np.float32)
    X = (px + 0.5) / w * 2.0 - 1.0
    Y = 1.0 - (py + 0.5) / h
    yc, R = -0.52, 1.42
    dx, dy = X, Y - yc
    r = np.hypot(dx, dy)
    th_max = np.arcsin(0.95 / R)
    t = np.arctan2(dx, dy) / th_max
    e = R - r
    span = np.clip(1.0 - t * t, 0.0, 1.0)
    return t, e, span


def make_blade() -> None:
    W, H = 1024, 512
    w, h = W * SS, H * SS
    t, e, span = blade_fields(w, h)
    inside = np.abs(t) <= 1.0
    th = 0.20 * span ** 1.0 + 1e-4
    ep = np.clip(e, 0.0, None)

    # 每根流丝长短不一：长度随刃口位置起伏，尾巴平滑散掉，不留硬边
    Xs = np.linspace(-1.0, 1.0, w, dtype=np.float32)[None, :]
    fil = stripes(Xs, 9, 18.0, 60.0)
    fil2 = stripes(Xs, 8, 90.0, 240.0)
    strand = 0.6 * fil + 0.4 * fil2
    trail_len = (0.26 + 0.09 * strand) * span ** 0.85 + 1e-4
    trail = np.exp(-ep / trail_len) * (e >= 0)
    trail *= (0.50 + 0.50 * strand ** 1.5) * span ** 0.5

    ahead = np.where(e < 0, np.exp(e / 0.016), 0.0) * span ** 0.6
    core = np.exp(-np.abs(e) / 0.011) * span ** 0.35
    body = np.where(e >= 0, np.exp(-(ep / th) ** 1.6), 0.0) * span ** 0.3
    inner = np.exp(-np.abs(e - th * 0.62) / 0.008) * span ** 1.2 * 0.32
    tip = np.clip((1.0 - np.abs(t)) / 0.16, 0.0, 1.0) ** 1.2
    Y = 1.0 - (np.arange(h, dtype=np.float32)[:, None] + 0.5) / h
    fade_bottom = np.clip(Y / 0.08, 0.0, 1.0)

    white = np.array([1.0, 1.0, 0.96])
    ice = np.array([1.0, 0.90, 0.45])
    cyan = np.array([1.0, 0.68, 0.16])
    azure = np.array([0.28, 0.86, 1.0])
    indigo = np.array([0.92, 0.42, 0.08])

    # 颜色按到刃口的距离走：白刃 → 冰青 → 青 → 深蓝。亮石板上要靠饱和的蓝压出轮廓
    d = ep[..., None]
    g1 = np.clip(d / 0.028, 0, 1)
    g2 = np.clip((d - 0.028) / 0.10, 0, 1)
    g3 = np.clip((d - 0.13) / 0.30, 0, 1)
    rgb = white * (1 - g1) + ice * g1
    rgb = rgb * (1 - g2) + cyan * g2
    rgb = rgb * (1 - g3) + indigo * g3
    rgb = np.where(e[..., None] < 0, azure * 0.4 + ice * 0.6, rgb)
    rgb = rgb * (1 - inner[..., None]) + white * inner[..., None]

    a = np.maximum.reduce([core, body * 0.96, trail * 0.86, ahead * 0.5, inner])
    a = np.clip(a, 0.0, 1.0) * tip * inside * fade_bottom
    save("fx_qi_blade.png", rgb, a, W, H)

    ea = np.clip(core * 1.2 + inner * 1.2 + body * 0.18, 0.0, 1.0) * tip * inside
    save("fx_qi_edge.png", np.ones((h, w, 3), np.float32), ea, W, H)

    gw, gh = 512, 256
    small = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).resize((gw * 2, gh * 2), Image.LANCZOS)
    pad = Image.new("L", (gw * 2, gh * 2), 0)
    pad.paste(small.resize((int(gw * 2 * 0.78), int(gh * 2 * 0.78)), Image.LANCZOS),
              (int(gw * 2 * 0.11), int(gh * 2 * 0.11)))
    blur = pad.filter(ImageFilter.GaussianBlur(radius=gw * 2 * 0.035))
    ga = np.asarray(blur).astype(np.float32) / 255.0
    ga = np.clip(ga / max(1e-4, ga.max()), 0, 1) ** 0.9
    ga[:2, :] = ga[-2:, :] = 0.0
    ga[:, :2] = ga[:, -2:] = 0.0
    save("fx_qi_glow.png", np.ones((gh * 2, gw * 2, 3), np.float32), ga, gw, gh)


def make_streak() -> None:
    W, H = 512, 48
    w, h = W * SS, H * SS
    py, px = np.mgrid[0:h, 0:w].astype(np.float32)
    u = (px + 0.5) / w
    v = (py + 0.5) / h * 2.0 - 1.0
    width = 0.08 + 0.92 * u ** 1.6
    head = np.clip((1.0 - u) / 0.04, 0.0, 1.0)
    body = np.exp(-(v / (width * 0.55 + 1e-4)) ** 2) * u ** 1.8 * head
    a = np.clip(body * 1.1, 0, 1)
    save("fx_qi_streak.png", np.ones((h, w, 3), np.float32), a, W, H)


def make_scar() -> None:
    W, H = 1024, 96
    w, h = W * SS, H * SS
    py, px = np.mgrid[0:h, 0:w].astype(np.float32)
    u = (px + 0.5) / w
    v = (py + 0.5) / h * 2.0 - 1.0
    env = np.clip(np.sin(np.pi * u), 0, 1) ** 0.55
    env *= np.clip(u / 0.05, 0, 1)
    jag = stripes(u * 1.0, 10, 30.0, 120.0)
    edge_w = (0.30 + 0.35 * jag) * env + 1e-4
    core = np.exp(-(v / (0.06 * env + 1e-4)) ** 2) * env
    halo = np.exp(-np.abs(v) / (edge_w * 0.42)) * env * 0.45
    chips = (stripes(u, 12, 400.0, 1200.0) > 0.86).astype(np.float32)
    chip = chips * np.exp(-((np.abs(v) - edge_w * 0.7) / 0.04) ** 2) * env * 0.35
    a = np.clip(np.maximum.reduce([core, halo, chip]), 0, 1)
    save("fx_qi_scar.png", np.ones((h, w, 3), np.float32), a, W, H)


def make_ring() -> None:
    """半圆余波：圆心在图底边中点，半径 0.96（以半宽为 1），只有上半圈。外沿一线亮，往里拖一段柔光，两端贴地处淡掉。"""
    W, H = 1024, 512
    w, h = W * SS, H * SS
    py, px = np.mgrid[0:h, 0:w].astype(np.float32)
    X = (px + 0.5) / w * 2.0 - 1.0
    Y = (1.0 - (py + 0.5) / h)
    r = np.hypot(X, Y)
    e = 0.96 - r
    ang = np.arctan2(Y, np.abs(X) + 1e-6) / (np.pi / 2)
    ends = np.clip(ang / 0.18, 0.0, 1.0) ** 1.2
    fil = stripes(np.arctan2(X, Y + 1e-6), 9, 20.0, 80.0)
    core = np.exp(-np.abs(e) / 0.006)
    inner = np.where(e >= 0, np.exp(-e / (0.025 + 0.02 * fil)), 0.0) * (0.35 + 0.3 * fil)
    a = np.clip(np.maximum(core, inner), 0, 1) * ends * (r <= 0.99)
    save("fx_qi_ring.png", np.ones((h, w, 3), np.float32), a, W, H)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    make_blade()
    make_streak()
    make_scar()
    make_ring()
    for n in ("fx_qi_blade.png", "fx_qi_edge.png", "fx_qi_glow.png", "fx_qi_streak.png", "fx_qi_scar.png", "fx_qi_ring.png"):
        im = np.asarray(Image.open(os.path.join(OUT, n)))
        edge = max(im[0, :, 3].max(), im[-1, :, 3].max(), im[:, 0, 3].max(), im[:, -1, 3].max())
        print(f"{n}: {im.shape[1]}x{im.shape[0]} 边缘 alpha 最大 {edge}")


if __name__ == "__main__":
    main()
