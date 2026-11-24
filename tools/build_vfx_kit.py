"""局内战斗特效贴图套件（对标《永远的蔚蓝星球》）。

蔚蓝星球的特效不是一张圆对称贴图放大淡出，而是：有体积（明暗、高光、边缘光）、有朝向（亮边朝飞行方向）、
有内部流动（噪声丝缕）、命中有实体碎片。这里全部 4x 超采样后 Lanczos 缩小，边缘干净。

输出到 Assets/Resources/Art/：
  fx_wind_shell   飞斧/飞刀外面包的半透明风球：亮月牙朝上（= 飞行方向），内部旋流丝，普通混合
  fx_wisp_trail   拖尾贴图（左 = 头，右 = 尾）：几股会散开、断开的风丝，白色，靠顶点色染色
  fx_shard_ice    冰晶碎片（尖朝上）：两面明暗 + 白脊 + 深蓝描边
  fx_shard_steel  钢片碎片：灰白两面 + 深描边，可染色
  fx_glint        四芒星闪：细长十字光芒 + 斜向短芒 + 亮芯，叠加
  fx_spark        拉长火花：上端亮头、往下变细变淡，沿速度方向摆放，叠加
  fx_orb_core     祝福法球本体：金色球体明暗、左上高光、边缘光、内嵌八芒星纹、深琥珀描边，普通混合
  fx_orb_swirl    法球内部能量旋涡：三股螺旋臂，叠加，旋转使用
  fx_light_beam   光柱（底 = 地面）：亮芯 + 柔边 + 竖向流光条纹，叠加
  fx_sigil        贴地法阵：双环 + 刻度 + 菱形 + 外圈冠刺，压扁贴地使用

用法：python3 tools/build_vfx_kit.py
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets/Resources/Art")
SS = 4


def rgb(h):
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def noise(h, w, cell, seed):
    rng = np.random.default_rng(seed)
    gh, gw = max(2, h // cell + 2), max(2, w // cell + 2)
    g = (rng.random((gh, gw)) * 255).astype(np.uint8)
    im = Image.fromarray(g).resize((w + cell * 2, h + cell * 2), Image.Resampling.BICUBIC)
    a = np.asarray(im, dtype=np.float32)[cell:cell + h, cell:cell + w] / 255.0
    return a


def fbm(h, w, cell, seed, octaves=4):
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        out += noise(h, w, max(2, cell >> o), seed + o * 17) * amp
        tot += amp
        amp *= 0.5
    return out / tot


def mix(dst, col, m):
    m = np.clip(m, 0.0, 1.0)[:, :, None]
    return dst * (1.0 - m) + col[None, None, :] * m


def finish(col, alpha, size):
    h, w = alpha.shape
    out = np.zeros((h, w, 4), np.float32)
    out[:, :, :3] = np.clip(col, 0, 255)
    out[:, :, 3] = np.clip(alpha, 0, 1) * 255.0
    im = Image.fromarray(np.round(out).astype(np.uint8))
    return im.resize(size, Image.Resampling.LANCZOS)


def white(alpha, size):
    col = np.full(alpha.shape + (3,), 255.0, np.float32)
    return finish(col, alpha, size)


def polar(bw, bh=None):
    bh = bh or bw
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    ux = (x - (w - 1) * 0.5) / (w * 0.5)
    uy = (y - (h - 1) * 0.5) / (h * 0.5)
    return ux, uy, np.hypot(ux, uy), np.arctan2(uy, ux)


def gauss(d, s):
    return np.exp(-(d / s) ** 2)


def make_wind_shell():
    n = 256
    ux, uy, r, ang = polar(n)
    H = W = n * SS
    lead = np.clip(-uy / np.maximum(r, 1e-4), -1, 1) * 0.5 + 0.5
    warp = fbm(H, W, 96 * SS, 11, octaves=2) - 0.5
    rr = r + warp * 0.04

    edge_in = np.clip((0.86 - rr) / 0.05, 0, 1)
    body = (0.24 + 0.40 * np.clip(rr / 0.86, 0, 1) ** 2.0) * edge_in

    def arcs(phase, turns, lo, hi, width):
        th = ang + rr * turns + phase + warp * 0.5
        d = np.angle(np.exp(1j * th))
        band = np.clip((rr - lo) / 0.15, 0, 1) * np.clip((hi - rr) / 0.15, 0, 1)
        return gauss(d, width) * band

    soft = np.maximum.reduce([arcs(k * 2.094, 2.4, 0.28, 0.84, 0.45) for k in range(3)])
    thin = np.maximum.reduce([arcs(k * 2.094 + 0.25, 2.4, 0.36, 0.84, 0.10) for k in range(3)])
    strands = np.maximum(soft * 0.55, thin) * edge_in
    strands2 = arcs(1.0, -1.6, 0.18, 0.55, 0.30) * edge_in * 0.5

    crest_r = 0.78 + 0.03 * np.sin(ang * 2 + 0.6) + warp * 0.03
    lw = np.clip((lead - 0.18) / 0.82, 0, 1)
    cres = gauss(rr - crest_r, 0.12) * lw ** 1.3
    cres_core = gauss(rr - (crest_r + 0.04), 0.03) * lw ** 2.2
    back_rim = gauss(rr - 0.83, 0.035) * (1 - lw) * 0.6
    halo = gauss(np.clip(rr - 0.86, 0, None), 0.07) * (0.25 + 0.55 * lw) * (rr > 0.84)

    col = np.zeros((H, W, 3), np.float32)
    col[:] = rgb("0B56C2")
    col = mix(col, rgb("12A0F0"), np.clip(rr / 0.86, 0, 1) ** 1.5)
    col = mix(col, rgb("6CEBFF"), strands * 0.9 + strands2 * 0.7)
    col = mix(col, rgb("54E2FF"), cres + back_rim + halo)
    col = mix(col, rgb("F4FFFF"), cres_core)

    alpha = np.maximum.reduce([body, strands * 0.6 + body, strands2 * 0.5 + body, cres * 0.95, cres_core, back_rim, halo * 0.6])
    return finish(col, alpha, (n, n))


def make_wisp_trail():
    bw, bh = 512, 128
    W, H = bw * SS, bh * SS
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    u = x / W
    v = y / H
    nz = fbm(H, W, 40 * SS, 23)
    alpha = np.zeros((H, W), np.float32)
    rng = np.random.default_rng(5)
    for i in range(7):
        ph = rng.uniform(0, 6.28)
        fr = rng.uniform(5, 11)
        spread = rng.uniform(0.10, 0.34) * (1 if i % 2 else -1)
        c = 0.5 + spread * u ** 0.8 + 0.05 * np.sin(u * fr + ph) * u
        th = (0.06 - 0.035 * u) * rng.uniform(0.7, 1.2)
        line = gauss(v - c, th)
        brk = np.clip((noise(H, W, 30 * SS, 100 + i) - (0.25 + 0.45 * u)) / 0.25, 0, 1)
        alpha = np.maximum(alpha, line * brk * rng.uniform(0.6, 1.0))
    core = gauss(v - 0.5, 0.16 * (1 - 0.6 * u)) * (1 - u) ** 1.6 * 0.75
    alpha = np.maximum(alpha, core) * (0.75 + 0.25 * nz)
    alpha *= np.clip(u / 0.025, 0, 1) * (1 - u) ** 0.7
    alpha *= np.clip(np.minimum(v, 1 - v) / 0.08, 0, 1)
    return white(alpha, (bw, bh))


def shard(lit, dark, ridge, outline):
    bw, bh = 64, 192
    W, H = bw * SS, bh * SS
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    ux = (x - (W - 1) * 0.5) / (W * 0.5)
    v = y / H
    peak = 0.68
    half = np.where(v < peak, (v / peak) ** 1.15, ((1 - v) / (1 - peak)) ** 0.8) * 0.86
    half = np.where((v > 0.02) & (v < 0.98), half, 0)
    inside = np.clip((half - np.abs(ux)) * W * 0.5 / (1.2 * SS), 0, 1)
    rim = np.clip((half - np.abs(ux)) * W * 0.5 / (3.2 * SS), 0, 1)
    col = np.zeros((H, W, 3), np.float32)
    col[:] = rgb(outline)
    face = np.where(ux < 0, 1.0, 0.0)
    shade = np.clip(0.35 + 0.65 * (1 - v), 0, 1)
    fc = rgb(lit)[None, None, :] * face[:, :, None] + rgb(dark)[None, None, :] * (1 - face[:, :, None])
    fc = fc * (0.8 + 0.2 * shade[:, :, None])
    m = rim[:, :, None]
    col = col * (1 - m) + fc * m
    col = mix(col, rgb(ridge), gauss(ux + 0.02, 0.05) * rim * (1 - v) ** 0.6)
    return finish(col, inside, (bw, bh))


def make_glint():
    n = 256
    ux, uy, r, _ = polar(n)
    ax, ay = np.abs(ux), np.abs(uy)
    ray_h = gauss(uy, 0.010 + 0.035 * np.clip(1 - ax, 0, 1) ** 3) * np.clip(1 - ax, 0, 1) ** 1.6
    ray_v = gauss(ux, 0.010 + 0.035 * np.clip(1 - ay / 0.85, 0, 1) ** 3) * np.clip(1 - ay / 0.85, 0, 1) ** 1.6
    d1, d2 = (ux + uy) / 1.414, (ux - uy) / 1.414
    diag = (gauss(d2, 0.012) * np.clip(1 - np.abs(d1) / 0.38, 0, 1) ** 2
            + gauss(d1, 0.012) * np.clip(1 - np.abs(d2) / 0.38, 0, 1) ** 2) * 0.6
    core = gauss(r, 0.07)
    halo = gauss(r, 0.26) * 0.32
    return white(np.clip(ray_h + ray_v + diag + core + halo, 0, 1), (n, n))


def make_spark():
    bw, bh = 32, 128
    W, H = bw * SS, bh * SS
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    ux = (x - (W - 1) * 0.5) / (W * 0.5)
    v = y / H
    width = 0.08 + 0.55 * np.clip(1 - v, 0, 1) ** 2.5
    a = gauss(ux, width) * np.clip(1 - v, 0, 1) ** 1.3 * np.clip(v / 0.05, 0, 1)
    head = gauss(np.hypot(ux * 0.9, (v - 0.12) * 3.0), 0.35)
    return white(np.clip(a + head * 0.8, 0, 1), (bw, bh))


def make_orb_core():
    n = 256
    ux, uy, r, ang = polar(n)
    H = W = n * SS
    R = 0.74
    rn = np.clip(r / R, 0, 1)
    z = np.sqrt(np.clip(1 - rn ** 2, 0, 1))
    L = np.array([-0.42, -0.55, 0.72])
    L = L / np.linalg.norm(L)
    nx, ny = ux / R, uy / R
    diff = np.clip(nx * L[0] + ny * L[1] + z * L[2], 0, 1)
    inside = np.clip((R - r) * W * 0.5 / (1.5 * SS), 0, 1)

    energy = np.clip(0.45 * diff + 0.75 * (1 - rn) ** 1.4, 0, 1.2)
    col = np.zeros((H, W, 3), np.float32)
    col[:] = rgb("9C4306")
    col = mix(col, rgb("E58A12"), np.clip(energy * 1.6, 0, 1))
    col = mix(col, rgb("FFC52E"), np.clip((energy - 0.35) * 2.0, 0, 1))
    col = mix(col, rgb("FFF2B0"), np.clip((energy - 0.78) * 2.6, 0, 1))

    warp = fbm(H, W, 48 * SS // 4, 31) - 0.5
    th = ang - rn * 4.2 + warp * 0.6
    swirl = gauss(np.angle(np.exp(1j * th * 3)) / 3, 0.16)
    col = mix(col, rgb("FFE88A"), swirl * np.clip(rn / 0.3, 0, 1) * np.clip((0.95 - rn) / 0.3, 0, 1) * 0.55 * inside)

    star_r = 0.40 + 0.16 * np.abs(np.cos(ang * 4)) ** 3
    star = gauss(rn - star_r * 1.1, 0.03) * 0.6 + gauss(rn - 0.60, 0.016) * 0.5
    cross = (gauss(nx, 0.022) + gauss(ny, 0.022)) * np.clip(1 - rn / 0.6, 0, 1) * 0.5
    col = mix(col, rgb("FFFBE6"), np.clip(star + cross, 0, 1) * inside * 0.7)

    spec = gauss(np.hypot((nx + 0.36) / 1.25, ny + 0.42), 0.17)
    col = mix(col, rgb("FFFFFF"), spec * 0.9 * inside)
    fres = gauss(rn - 0.93, 0.07) * (0.55 + 0.45 * np.clip((nx + ny) * 0.7 + 0.3, 0, 1))
    col = mix(col, rgb("FFE58A"), fres * inside)

    glow = gauss(np.clip(r - R, 0, None), 0.16) * (r > R)
    col = mix(col, rgb("FFA21E"), (1 - inside))

    alpha = np.maximum(inside, glow * 0.62)
    return finish(col, alpha, (n, n))


def make_orb_swirl():
    n = 256
    ux, uy, r, ang = polar(n)
    H = W = n * SS
    warp = fbm(H, W, 40 * SS // 4, 41) - 0.5
    a = np.zeros_like(r)
    for k in range(3):
        th = ang + r * 5.5 + k * 2.094 + warp * 1.2
        d = np.angle(np.exp(1j * th))
        arm = gauss(d, 0.22 + 0.25 * r) * np.clip(r / 0.25, 0, 1) * np.clip((0.95 - r) / 0.25, 0, 1)
        a = np.maximum(a, arm)
    a = a * (0.7 + 0.6 * fbm(H, W, 20 * SS // 4, 43))
    a = np.maximum(a, gauss(r, 0.18) * 0.6)
    return white(np.clip(a, 0, 1), (n, n))


def make_light_beam():
    bw, bh = 128, 512
    W, H = bw * SS, bh * SS
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    ux = (x - (W - 1) * 0.5) / (W * 0.5)
    hgt = 1 - y / H
    prof = gauss(ux, 0.14) + gauss(ux, 0.48) * 0.45
    rng = np.random.default_rng(61)
    g = (rng.random((10, 48)) * 255).astype(np.uint8)
    st = np.asarray(Image.fromarray(g).resize((W, H), Image.Resampling.BICUBIC), np.float32) / 255.0
    rise = np.clip(1 - hgt, 0, 1) ** 0.9 * np.clip(hgt / 0.015, 0, 1)
    a = prof * rise * (0.6 + 0.55 * st)
    a = np.maximum(a, gauss(np.hypot(ux * 0.7, (hgt - 0.02) * 6), 0.45) * 0.9)
    return white(np.clip(a, 0, 1), (bw, bh))


def make_sigil():
    n = 512
    ux, uy, r, ang = polar(n)
    a = gauss(r - 0.86, 0.035) * 0.9
    a += gauss(r - 0.80, 0.008)
    a += gauss(r - 0.58, 0.008) * 0.9
    a += gauss(r - 0.54, 0.02) * 0.35
    tick = (np.cos(ang * 36) > 0.93) * ((r > 0.62) & (r < 0.76)) * 0.75
    a += tick
    for k in range(8):
        t = k * np.pi / 4
        px, py = 0.69 * np.cos(t), 0.69 * np.sin(t)
        dm = np.abs(ux - px) + np.abs(uy - py)
        a += np.clip((0.06 - dm) / 0.01, 0, 1) * 0.95
    seg = np.angle(np.exp(1j * (ang * 24))) / np.pi
    longer = np.where(np.cos(ang * 12) > 0, 0.11, 0.055)
    spike_len = longer * np.clip(1 - np.abs(seg) * 3.2, 0, 1)
    spike = np.clip((0.88 + spike_len - r) * n * SS * 0.5 / (1.5 * SS), 0, 1) * (r > 0.875)
    a += spike * 0.8
    a += gauss(r, 0.55) * 0.18 * (r < 0.86)
    return white(np.clip(a, 0, 1), (n, n))


def make_crit_burst():
    """暴击跳字底：不规则爆裂星，外深红描边、内橙红到亮黄，跳字压在上面。"""
    n = 256
    ux, uy, r, ang = polar(n)
    rng = np.random.default_rng(71)
    k = 11
    lens = rng.uniform(0.72, 0.98, k)
    t = (ang / (2 * np.pi) * k) % 1.0
    idx = np.floor((ang / (2 * np.pi) % 1.0) * k).astype(int) % k
    tip = np.abs(t - 0.5) * 2
    outer = lens[idx] * (1 - tip) + 0.48 * tip
    edge = 0.02
    inside = np.clip((outer - r) / edge, 0, 1)
    core = np.clip((outer - 0.085 - r) / edge, 0, 1)
    col = np.zeros(r.shape + (3,), np.float32)
    col[:] = rgb("4A0A06")
    fill = np.clip(r / 0.9, 0, 1)
    body = rgb("FFE45A")[None, None, :] * (1 - fill[:, :, None]) + rgb("E8361E")[None, None, :] * fill[:, :, None]
    m = core[:, :, None]
    col = col * (1 - m) + body * m
    return finish(col, inside, (n, n))


def make_ink_strip():
    """招式名底：一笔横向水墨飞白，左起笔圆钝、右收笔散成枯笔丝。"""
    bw, bh = 640, 160
    W, H = bw * SS, bh * SS
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    u = x / W
    v = (y / H - 0.5) * 2
    wob = (fbm(H, W, 64 * SS, 81, 2) - 0.5) * 0.25
    half = 0.62 * np.clip(u / 0.06, 0, 1) ** 0.5 * (1 - np.clip((u - 0.84) / 0.16, 0, 1) ** 1.4)
    body = np.clip((half - np.abs(v + wob)) / 0.05, 0, 1)
    rng = np.random.default_rng(83)
    g = (rng.random((40, 6)) * 255).astype(np.uint8)
    dry = np.asarray(Image.fromarray(g).resize((W, H), Image.Resampling.BICUBIC), np.float32) / 255.0
    drybrush = np.clip((dry - (0.3 + 0.6 * np.clip((u - 0.7) / 0.3, 0, 1))) / 0.12, 0, 1)
    a = body * np.where(u > 0.7, drybrush, 1.0) * (0.82 + 0.18 * fbm(H, W, 12 * SS, 85))
    col = np.zeros((H, W, 3), np.float32)
    col[:] = rgb("2B0F0A")
    col = mix(col, rgb("5A1A10"), np.clip(1 - np.abs(v) / 0.5, 0, 1) * 0.6)
    return finish(col, a * 0.88, (bw, bh))


def make_book_lit():
    """可强化时的天书兵法坛：书页泛起青碧灵光、云纹透亮泛白、书沿外溢柔晕与竖向升腾微光丝。"""
    src = Image.open(os.path.join(OUT, "prop_book.png")).convert("RGBA")
    arr = np.asarray(src, dtype=np.float32) / 255.0
    H, W, _ = arr.shape
    c_src, a = arr[:, :, :3], arr[:, :, 3]
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    luma = 0.299 * c_src[:, :, 0] + 0.587 * c_src[:, :, 1] + 0.114 * c_src[:, :, 2]

    wood = (c_src[:, :, 0] - c_src[:, :, 2] > 0.12) & (luma < 0.65)
    page_seed = (a > 0.3) & (yy < 168) & (~wood) & (
        (luma > 0.50) | ((c_src[:, :, 2] - c_src[:, :, 0] > 0.02) & (luma > 0.38) & (yy < 150))
    )
    pm_img = Image.fromarray((page_seed * 255).astype(np.uint8))
    pm_book = (np.asarray(pm_img.filter(ImageFilter.MaxFilter(7)).filter(ImageFilter.GaussianBlur(1.5)), np.float32) / 255.0) * (a > 0.05)
    pm_core = np.asarray(pm_img.filter(ImageFilter.GaussianBlur(0.8)), np.float32) / 255.0

    rune = np.clip((c_src[:, :, 2] - c_src[:, :, 0] + 0.01) / 0.16, 0.0, 1.0) ** 0.85 * pm_core
    t = np.clip((luma - 0.12) / 0.82, 0.0, 1.0)

    c_outline = np.array([0.08, 0.36, 0.43], np.float32)
    c_side    = np.array([0.22, 0.70, 0.76], np.float32)
    c_page    = np.array([0.42, 0.90, 0.92], np.float32)
    c_page_hi = np.array([0.64, 0.96, 0.98], np.float32)
    c_rune    = np.array([0.96, 1.00, 1.00], np.float32)

    k1 = np.clip(t / 0.38, 0, 1)[..., None]
    k2 = np.clip((t - 0.38) / 0.38, 0, 1)[..., None]
    k3 = np.clip((t - 0.76) / 0.24, 0, 1)[..., None]
    book_col = c_outline * (1 - k1) + c_side * k1
    book_col = book_col * (1 - k2) + c_page * k2
    book_col = book_col * (1 - k3) + c_page_hi * k3
    book_col = book_col * (1 - rune[..., None] * 0.92) + c_rune * (rune[..., None] * 0.92)

    out_rgb = c_src * (1 - pm_book[..., None]) + book_col * pm_book[..., None]
    lectern_rim = np.exp(-((yy - 148) / 32.0) ** 2) * np.exp(-((xx - 200) / 120.0) ** 2) * (1 - pm_book) * (a > 0.1)
    out_rgb = out_rgb + np.array([0.04, 0.18, 0.22], np.float32) * lectern_rim[..., None] * 0.45
    ped_cyan = np.clip((c_src[:, :, 2] - c_src[:, :, 0] - 0.10) / 0.25, 0, 1) * (yy > 190)
    out_rgb = np.clip(out_rgb + np.array([0.15, 0.40, 0.44], np.float32) * ped_cyan[..., None] * 0.75, 0, 1)

    aura_outer = np.asarray(pm_img.filter(ImageFilter.GaussianBlur(13)), np.float32) / 255.0
    aura_inner = np.asarray(pm_img.filter(ImageFilter.GaussianBlur(4.5)), np.float32) / 255.0
    rays = np.zeros((H, W), np.float32)
    for rx, rw, y_base, r_len, r_str in [
        (118, 3.2, 62, 52, 0.52), (148, 4.5, 72, 68, 0.72), (178, 2.8, 58, 46, 0.45),
        (204, 5.0, 68, 66, 0.78), (234, 3.0, 62, 50, 0.48), (262, 4.2, 74, 66, 0.68), (288, 3.0, 66, 48, 0.46),
    ]:
        gx = np.exp(-((xx - rx) / rw) ** 2)
        u = np.clip((y_base - yy) / r_len, 0.0, 1.0)
        gy = np.where((yy <= y_base) & (yy >= y_base - r_len), (np.maximum(np.sin(u * np.pi), 0.0) ** 0.75) * (1 - 0.35 * u), 0.0)
        rays += gx * gy * r_str
    plume = np.exp(-((xx - 202) / 82.0) ** 2) * np.exp(-((yy - 36) / 34.0) ** 2) * 0.42

    glow_a = np.clip(aura_outer * 0.62 + aura_inner * 0.50 + rays * 0.88 + plume, 0, 0.95)
    c_glow = np.array([0.36, 0.93, 0.97], np.float32)
    c_ray  = np.array([0.88, 1.00, 1.00], np.float32)
    rk = np.clip(rays * 1.2, 0, 1)[..., None]
    g_rgb = c_glow * (1 - rk) + c_ray * rk

    over_book = np.clip(rays * 0.42, 0, 0.45) * a
    lit_src_rgb = np.clip(out_rgb + c_ray * over_book[..., None], 0, 1)

    final_a = a + glow_a * (1 - a)
    final_rgb = (lit_src_rgb * a[..., None] + g_rgb * glow_a[..., None] * (1 - a[..., None])) / np.maximum(final_a, 1e-5)[..., None]
    out = np.clip(np.dstack([final_rgb, final_a]) * 255.0 + 0.5, 0, 255).astype(np.uint8)
    return Image.fromarray(out)


def make_buff_pill():
    """好汉头顶增益小Buff条底图：圆润斜切金属胶囊 + 鎏金亮边 + 左侧暖金微光，精致不呆板。"""
    bw, bh = 224, 80
    W, H = bw * SS, bh * SS
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # 中心归一化坐标，带轻微右上斜切动感 (italic shear)
    cx = (xx - W * 0.5) + (yy - H * 0.5) * (-0.14)
    cy = (yy - H * 0.5)
    hw, hh = W * 0.43, H * 0.36
    rad = hh  # 半圆胶囊端头
    dx = np.maximum(np.abs(cx) - (hw - rad), 0.0)
    dy = np.maximum(np.abs(cy) - (hh - rad), 0.0)
    dist = np.sqrt(dx * dx + dy * dy) - rad  # SDF in supersampled pixels

    aa = 1.6 * SS
    # 柔和底影
    dx_s = np.maximum(np.abs(cx - 1.5 * SS) - (hw - rad), 0.0)
    dy_s = np.maximum(np.abs(cy - 3.5 * SS) - (hh - rad), 0.0)
    dist_s = np.sqrt(dx_s * dx_s + dy_s * dy_s) - rad
    sh_a = np.clip(1.0 - dist_s / (5.5 * SS), 0.0, 1.0) ** 1.8 * 0.45

    outer_a = np.clip(0.5 - dist / aa, 0.0, 1.0)
    rim_in = np.clip(0.5 - (dist + 3.6 * SS) / aa, 0.0, 1.0)
    inner_bevel = np.clip(0.5 - (dist + 5.8 * SS) / aa, 0.0, 1.0)

    vy = np.clip((yy / H - 0.14) / 0.72, 0.0, 1.0)
    ux = np.clip((xx / W - 0.08) / 0.84, 0.0, 1.0)

    # 外圈鎏金渐变边（上亮金 #FFF0A6 -> 下琥珀金 #C87E1E）
    rim_col = rgb("FFF2AA")[None, None, :] * (1 - vy[..., None]) + rgb("C47A1C")[None, None, :] * vy[..., None]
    # 内圈高光细线
    bevel_col = rgb("6E4B26")[None, None, :] * (1 - vy[..., None]) + rgb("2A1B10")[None, None, :] * vy[..., None]
    # 内膛深色温润底（深褐靛 #2B1D14 -> #16100D），左侧图标区泛一团柔和暖金光晕
    body_col = rgb("362316")[None, None, :] * (1 - vy[..., None]) + rgb("17100C")[None, None, :] * vy[..., None]
    left_glow = np.exp(-((ux - 0.24) / 0.26) ** 2) * np.exp(-((vy - 0.5) / 0.48) ** 2)
    body_col = body_col + rgb("8C5414")[None, None, :] * (left_glow[..., None] * 0.55)
    # 顶部玻璃高光带
    gloss = np.clip(1.0 - np.abs(vy - 0.22) / 0.14, 0.0, 1.0) ** 1.5 * inner_bevel * 0.22
    body_col = np.clip(body_col + 255.0 * gloss[..., None], 0, 255)

    pill_col = rim_col * (1 - rim_in[..., None]) + bevel_col * rim_in[..., None]
    pill_col = pill_col * (1 - inner_bevel[..., None]) + body_col * inner_bevel[..., None]

    # 叠合投影与本体
    out_a = outer_a + sh_a * (1.0 - outer_a)
    sh_col = rgb("090604")[None, None, :]
    out_col = (pill_col * outer_a[..., None] + sh_col * sh_a[..., None] * (1.0 - outer_a[..., None])) / np.maximum(out_a, 1e-5)[..., None]
    return finish(out_col, out_a * 0.96, (bw, bh))


def make_buff_wing():
    """增益小Buff条左侧精致双翼疾风徽标（鎏金渐变 + 深褐描边，一眼表达攻速/加持）。"""
    n = 96
    W = H = n * SS
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    u = (xx / W - 0.5) * 2.0   # -1..1
    v = (0.5 - yy / H) * 2.0   # +1(top)..-1(bottom)
    ax = np.abs(u)

    def chevron(v_off, span, thick, slope):
        yc = v - v_off + ax * slope
        return (ax < span) & (np.abs(yc) < thick * (1.0 - 0.38 * (ax / span)))

    c_top = chevron(0.30, 0.70, 0.21, 0.62)
    c_bot = chevron(-0.16, 0.56, 0.18, 0.62)
    diamond = (ax * 1.6 + np.abs(v + 0.44) * 1.1) < 0.24
    shape = c_top | c_bot | diamond

    im_mask = Image.fromarray((shape * 255).astype(np.uint8))
    stroke = np.asarray(im_mask.filter(ImageFilter.MaxFilter(5 * SS + 1)).filter(ImageFilter.GaussianBlur(1.0 * SS)), np.float32) / 255.0
    fill = np.asarray(im_mask.filter(ImageFilter.GaussianBlur(0.8 * SS)), np.float32) / 255.0

    vy = np.clip((v + 0.7) / 1.4, 0.0, 1.0)
    col_fill = rgb("FFFBE0")[None, None, :] * vy[..., None] + rgb("FFA81E")[None, None, :] * (1 - vy[..., None])
    hi = np.clip(-u * 0.5 + 0.25, 0.0, 0.30)[..., None] * 255.0
    col_fill = np.clip(col_fill + hi, 0, 255)
    col_edge = rgb("3D1C04")[None, None, :]

    col = col_edge * (1 - fill[..., None]) + col_fill * fill[..., None]
    a = np.clip(stroke * 1.15, 0, 1)
    return finish(col, a, (n, n))


def main():
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ("fx_wind_shell", make_wind_shell),
        ("fx_wisp_trail", make_wisp_trail),
        ("fx_shard_ice", lambda: shard("D8FAFF", "4CC2F2", "FFFFFF", "0B4C96")),
        ("fx_shard_steel", lambda: shard("FFFFFF", "B4BECC", "FFFFFF", "3A4250")),
        ("fx_glint", make_glint),
        ("fx_spark", make_spark),
        ("fx_orb_core", make_orb_core),
        ("fx_orb_swirl", make_orb_swirl),
        ("fx_light_beam", make_light_beam),
        ("fx_sigil", make_sigil),
        ("ui_crit_burst", make_crit_burst),
        ("ui_ink_strip", make_ink_strip),
        ("prop_book_lit", make_book_lit),
        ("ui_buff_pill", make_buff_pill),
        ("ui_buff_wing", make_buff_wing),
    ]
    for name, fn in jobs:
        im = fn()
        im.save(os.path.join(OUT, name + ".png"), optimize=True)
        print(f"wrote {name:16s} {im.size}")


if __name__ == "__main__":
    main()
