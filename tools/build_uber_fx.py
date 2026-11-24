"""商业级动态特效图集与流场噪波生成器（配合 Liangshan/FxUber Shader + 序列帧播放）。

生成到 Assets/Resources/Art/：
  fx_noise_tile.png      256x256 四向无缝循环噪波图（R/G=双通道正交旋流场，B=多频FBM溶解云，供 FxUber 采样）
  fx_slash_lut.png       512x128 弧形刀光网格主纹理（u: 0尾->1刃尖，v: 0内腹->0.82锋刃亮脊->1外沿；多道破风血槽丝）
  fx_beam_lut.png        512x128 能量射线主纹理（中心炽白等离子芯 + 外层波浪火舌包络）
  fx_sheet_explosion.png 1024x1024 (4x4=16帧，每帧256) 高帧率体积火云爆炸序列帧：
                         起爆十字白闪 -> 橘红翻滚火核膨胀 -> 表面冷却结成深褐浓烟 -> 烟圈碎散成余烬火星
  fx_sheet_lightning.png 1024x1024 (4x4=16帧，每帧256) 狂暴雷霆落雷序列帧：
                         先导细电丝 -> 主干炽白雷柱贯顶 + 多级分叉电弧 -> 地面球状跳电 -> 残余电弧闪烁熄灭
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets/Resources/Art")


def tile_fbm(n, freqs, seed):
    """真正的周期无缝傅里叶/网格插值多频噪声（在 0..n 上严格无缝平铺）。"""
    rng = np.random.default_rng(seed)
    acc = np.zeros((n, n), np.float32)
    tw = 0.0
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32) / n
    for f, amp in freqs:
        g = rng.random((f, f)).astype(np.float32)
        # Wrap pad for seamless bicubic
        gp = np.pad(g, ((2, 2), (2, 2)), mode="wrap")
        im = Image.fromarray((gp * 255).astype(np.uint8)).resize(((f + 4) * (n // f + 1), (f + 4) * (n // f + 1)), Image.Resampling.BICUBIC)
        # Exact periodic bilinear/cosine value noise
        gx = xx * f
        gy = yy * f
        ix = np.floor(gx).astype(int) % f
        iy = np.floor(gy).astype(int) % f
        fx = gx - np.floor(gx)
        fy = gy - np.floor(gy)
        ux = fx * fx * (3 - 2 * fx)
        uy = fy * fy * (3 - 2 * fy)
        c00 = g[iy, ix]
        c10 = g[iy, (ix + 1) % f]
        c01 = g[(iy + 1) % f, ix]
        c11 = g[(iy + 1) % f, (ix + 1) % f]
        layer = (c00 * (1 - ux) + c10 * ux) * (1 - uy) + (c01 * (1 - ux) + c11 * ux) * uy
        acc += layer * amp
        tw += amp
    acc /= max(tw, 1e-6)
    acc = (acc - acc.min()) / max(1e-6, acc.max() - acc.min())
    return acc


def make_noise_tile():
    n = 256
    r = tile_fbm(n, [(4, 1.0), (8, 0.55), (16, 0.28), (32, 0.14)], 101)
    g = tile_fbm(n, [(4, 1.0), (8, 0.55), (16, 0.28), (32, 0.14)], 203)
    # B channel: sharp cellular/billow FBM for crisp flame/wind erosion
    b1 = tile_fbm(n, [(3, 1.0), (6, 0.6), (12, 0.35), (24, 0.2), (48, 0.1)], 307)
    b2 = 1.0 - np.abs(tile_fbm(n, [(5, 1.0), (10, 0.5), (20, 0.25)], 409) * 2.0 - 1.0)
    b = np.clip(b1 * 0.62 + b2 * 0.38, 0, 1)
    b = (b - b.min()) / max(1e-6, b.max() - b.min())
    arr = np.dstack([r, g, b, np.ones_like(r)])
    return Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8))


def make_slash_lut():
    W, H = 512, 128
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    u = xx / (W - 1)          # 0 = tail, 1 = leading tip
    v = yy / (H - 1)          # 0 = inner belly, 1 = outer cutting edge

    # Leading edge sharp taper at tip (u > 0.88), long feathery tail (u < 0.55)
    tip = np.clip((1.0 - u) / 0.11, 0, 1) ** 0.55
    tail = np.clip(u / 0.65, 0, 1) ** 1.15
    along = tip * tail

    # Cross profile: sharp bright spine near outer edge v = 0.78, multi-streak wind grooves inside
    ridge = np.exp(-((v - 0.78) / 0.085) ** 2)
    outer_fall = np.clip((0.97 - v) / 0.18, 0, 1) ** 0.7
    inner_body = np.exp(-((v - 0.55) / 0.32) ** 2) * 0.68

    # Secondary wind streaks along the blade wake
    groove1 = np.exp(-((v - 0.42) / 0.035) ** 2) * np.clip((u - 0.15) / 0.6, 0, 1) * 0.55
    groove2 = np.exp(-((v - 0.24) / 0.025) ** 2) * np.clip((u - 0.05) / 0.5, 0, 1) * 0.38

    profile = (ridge * 1.15 + inner_body + groove1 + groove2) * (v < 0.98) * outer_fall
    alpha = np.clip(profile * along * 1.25, 0, 1)
    # R channel encodes core intensity (1.0 on the sharp cutting ridge near tip)
    core = np.clip(ridge * np.clip((u - 0.18) / 0.65, 0, 1) ** 0.7 * 1.15 + groove1 * 0.45, 0, 1)
    arr = np.dstack([core, core, core, alpha])
    return Image.fromarray((arr * 255).astype(np.uint8))


def make_beam_lut():
    W, H = 512, 128
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    u = xx / (W - 1)
    v = np.abs(yy / (H - 1) - 0.5) * 2.0  # 0 at center, 1 at edge
    ends = np.clip(u / 0.06, 0, 1) * np.clip((1 - u) / 0.06, 0, 1)
    core = np.exp(-(v / 0.20) ** 2)
    sheath = np.exp(-(v / 0.58) ** 2) * 0.72
    alpha = np.clip((core + sheath) * ends, 0, 1)
    inten = np.clip(core * 1.12 + sheath * 0.35, 0, 1)
    arr = np.dstack([inten, inten, inten, alpha])
    return Image.fromarray((arr * 255).astype(np.uint8))


def fbm2d(h, w, freqs, seed):
    rng = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32)
    tw = 0.0
    for cell, amp in freqs:
        gh, gw = max(2, h // cell + 2), max(2, w // cell + 2)
        g = (rng.random((gh, gw)) * 255).astype(np.uint8)
        up = np.asarray(Image.fromarray(g).resize((w, h), Image.Resampling.BICUBIC), np.float32) / 255.0
        acc += up * amp
        tw += amp
    acc /= tw
    return (acc - acc.min()) / max(1e-6, acc.max() - acc.min())


def make_explosion_sheet():
    """4x4 = 16 帧 256x256 高动态体积火云爆炸图集（总 1024x1024）。"""
    N = 256
    grid = 4
    sheet = Image.new("RGBA", (N * grid, N * grid), (0, 0, 0, 0))
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    ux = (xx - N * 0.5) / (N * 0.5)
    uy = (yy - N * 0.52) / (N * 0.5)
    r = np.sqrt(ux * ux + uy * uy)
    ang = np.arctan2(uy, ux)

    base_n = fbm2d(N, N, [(42, 1.0), (20, 0.65), (10, 0.35), (5, 0.18)], 511)
    detail_n = fbm2d(N, N, [(24, 1.0), (12, 0.6), (6, 0.3)], 613)
    rng = np.random.default_rng(701)
    embers = [(rng.uniform(0, 2 * np.pi), rng.uniform(0.55, 1.05), rng.uniform(0.014, 0.028)) for _ in range(26)]

    c_white  = np.array([1.00, 0.99, 0.90], np.float32)
    c_yellow = np.array([1.00, 0.84, 0.28], np.float32)
    c_orange = np.array([0.98, 0.42, 0.08], np.float32)
    c_red    = np.array([0.68, 0.14, 0.05], np.float32)
    c_soot   = np.array([0.19, 0.15, 0.14], np.float32)
    c_rim    = np.array([0.10, 0.07, 0.07], np.float32)

    for idx in range(16):
        t = idx / 15.0  # 0..1
        # Expanding billow radius: fast burst in first 4 frames, then rolling expansion
        rad = 0.20 + 0.64 * (1.0 - (1.0 - t) ** 2.6)
        # Advect noise outward to simulate rolling fireball lobes!
        adv_x = np.clip(xx - ux * t * 38.0, 0, N - 1).astype(int)
        adv_y = np.clip(yy - (uy - 0.12 * t) * t * 38.0, 0, N - 1).astype(int)
        n_roll = base_n[adv_y, adv_x] * 0.68 + detail_n[adv_y, adv_x] * 0.32
        lobes = 0.5 + 0.5 * np.cos(ang * 7.0 + n_roll * 4.2)

        # Density field of the cloud
        shell_r = rad * (0.76 + 0.34 * n_roll + 0.08 * lobes)
        # Hollow out center in late frames as smoke ring rises
        hollow = np.clip((t - 0.42) / 0.58, 0, 1) * np.exp(-((r / max(0.15, rad * 0.62)) ** 2)) * (0.65 + 0.35 * (1 - n_roll))
        density = np.clip((shell_r - r) / (0.09 + 0.12 * t), 0, 1) * (1.0 - hollow * 0.82)

        # Break into discrete puffs at late frames
        erode_thresh = np.clip((t - 0.48) / 0.52, 0, 1) * 0.68
        cloud_a = np.clip((density * (0.55 + 0.65 * n_roll) - erode_thresh) / max(0.08, 0.22 - 0.10 * t), 0, 1)

        # Temperature field: hot core early -> cools from outside into dark rolling smoke with glowing crevices!
        cool = np.clip((t - 0.12) / 0.72, 0, 1)
        temp = (1.0 - (r / np.maximum(0.12, shell_r)) ** 1.45) * (1.05 - cool * 0.92) + (n_roll - 0.42) * (0.55 - 0.25 * cool)
        if idx <= 2:
            temp += (1.0 - idx / 3.0) * 0.65
        temp = np.clip(temp, 0, 1)

        # Map temperature -> soot -> deep red -> bright orange -> yellow -> incandescent white
        col = np.zeros((N, N, 3), np.float32)
        k0 = np.clip(temp / 0.22, 0, 1)[..., None]
        k1 = np.clip((temp - 0.22) / 0.26, 0, 1)[..., None]
        k2 = np.clip((temp - 0.48) / 0.28, 0, 1)[..., None]
        k3 = np.clip((temp - 0.76) / 0.24, 0, 1)[..., None]
        col = c_rim * (1 - k0) + c_soot * k0
        col = col * (1 - k1) + c_red * k1
        col = col * (1 - k2) + c_orange * k2
        col = col * (1 - k3) + c_yellow * k3
        hot_core = np.clip((temp - 0.88) / 0.12, 0, 1)[..., None]
        col = col * (1 - hot_core) + c_white * hot_core

        # Frame 0..2: crisp shockwave ring + starburst spikes!
        alpha = cloud_a * (1.0 if t < 0.72 else 1.0 - ((t - 0.72) / 0.28) ** 1.3)
        if idx <= 4:
            sk = idx / 4.0
            sr = 0.22 + 0.70 * (sk ** 0.65)
            ring = np.exp(-((r - sr) / 0.032) ** 2) * (1.0 - sk) * 0.92
            col = np.clip(col + c_yellow * ring[..., None], 0, 1)
            alpha = np.clip(alpha + ring * 0.85, 0, 1)
        if idx <= 1:
            ray_a = (np.exp(-(ux / 0.055) ** 2) * np.exp(-(uy / 0.82) ** 2) +
                     np.exp(-(uy / 0.055) ** 2) * np.exp(-(ux / 0.82) ** 2)) * (1.0 - idx * 0.55)
            col = np.clip(col + c_white * ray_a[..., None], 0, 1)
            alpha = np.clip(alpha + ray_a * 0.9, 0, 1)

        # Flying hot embers shooting outward across frames 2..13
        if 1 <= idx <= 13:
            et = (idx - 1) / 12.0
            emb = np.zeros((N, N), np.float32)
            for ea, espd, esz in embers:
                er = 0.12 + espd * (et ** 0.72) * 0.78
                ex = np.cos(ea) * er
                ey = np.sin(ea) * er + 0.14 * (et * et)  # slight gravity drop in y
                d2 = ((ux - ex) ** 2 + (uy - ey) ** 2) / (esz * esz)
                emb += np.exp(-d2)
            emb = np.clip(emb * (1.0 - et * 0.75), 0, 1)
            col = col * (1 - emb[..., None] * 0.85) + c_yellow * (emb[..., None] * 0.85)
            alpha = np.clip(alpha + emb * 0.9, 0, 1)

        frame = Image.fromarray((np.clip(np.dstack([col, alpha]), 0, 1) * 255).astype(np.uint8))
        gx, gy = idx % grid, idx // grid
        sheet.paste(frame, (gx * N, (grid - 1 - gy) * N))  # row 0 = top in visual order -> we'll index top-to-bottom in C#!
    return sheet


def draw_bolt_segment(field_core, field_glow, x0, y0, x1, y1, N, w_core, w_glow):
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    dx, dy = x1 - x0, y1 - y0
    l2 = max(1e-4, dx * dx + dy * dy)
    t = np.clip(((xx - x0) * dx + (yy - y0) * dy) / l2, 0.0, 1.0)
    px = x0 + t * dx
    py = y0 + t * dy
    d2 = (xx - px) ** 2 + (yy - py) ** 2
    field_core[:] = np.maximum(field_core, np.exp(-d2 / (w_core * w_core)))
    field_glow[:] = np.maximum(field_glow, np.exp(-d2 / (w_glow * w_glow)))


def build_jagged_path(rng, x0, y0, x1, y1, depth, jitter):
    pts = [(x0, y0), (x1, y1)]
    for _ in range(depth):
        nxt = [pts[0]]
        for i in range(len(pts) - 1):
            ax, ay = pts[i]
            bx, by = pts[i + 1]
            mx, my = (ax + bx) * 0.5, (ay + by) * 0.5
            dx, dy = bx - ax, by - ay
            nx, ny = -dy, dx
            mx += nx * rng.uniform(-jitter, jitter)
            my += ny * rng.uniform(-jitter * 0.25, jitter * 0.25)
            nxt.extend([(mx, my), (bx, by)])
        pts = nxt
    return pts


def make_lightning_sheet():
    """4x4 = 16 帧 256x256 雷霆劈落序列帧（底端锚在 y = N*0.88 处）。"""
    N = 256
    grid = 4
    sheet = Image.new("RGBA", (N * grid, N * grid), (0, 0, 0, 0))
    rng = np.random.default_rng(909)

    # Pre-generate two distinct jagged main trunks so the arc dances/re-strikes realistically!
    trunk_a = build_jagged_path(rng, N * 0.50, N * 0.03, N * 0.50, N * 0.88, 5, 0.16)
    trunk_b = build_jagged_path(rng, N * 0.48, N * 0.03, N * 0.50, N * 0.88, 5, 0.18)
    branches_a = [
        build_jagged_path(rng, trunk_a[8][0], trunk_a[8][1], trunk_a[8][0] - 58, trunk_a[8][1] + 68, 4, 0.20),
        build_jagged_path(rng, trunk_a[14][0], trunk_a[14][1], trunk_a[14][0] + 64, trunk_a[14][1] + 72, 4, 0.20),
        build_jagged_path(rng, trunk_a[21][0], trunk_a[21][1], trunk_a[21][0] - 46, trunk_a[21][1] + 52, 3, 0.22),
    ]
    branches_b = [
        build_jagged_path(rng, trunk_b[10][0], trunk_b[10][1], trunk_b[10][0] + 60, trunk_b[10][1] + 65, 4, 0.20),
        build_jagged_path(rng, trunk_b[18][0], trunk_b[18][1], trunk_b[18][0] - 54, trunk_b[18][1] + 58, 4, 0.20),
    ]

    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32)
    c_deep = np.array([0.14, 0.42, 0.98], np.float32)
    c_cyan = np.array([0.45, 0.86, 1.00], np.float32)
    c_white = np.array([0.98, 0.99, 1.00], np.float32)

    for idx in range(16):
        core = np.zeros((N, N), np.float32)
        glow = np.zeros((N, N), np.float32)
        trunk = trunk_a if (idx < 5 or (7 <= idx <= 9)) else trunk_b
        brs = branches_a if trunk is trunk_a else branches_b

        if idx == 0:
            # Frame 0: stepped leader descending top 65%
            lim = int(len(trunk) * 0.65)
            for i in range(lim - 1):
                draw_bolt_segment(core, glow, *trunk[i], *trunk[i + 1], N, 1.8, 7.5)
        elif idx <= 8:
            # Main strike & re-strike! Thickest at frames 1..3 and 6 (secondary surge)
            surge = 1.35 if idx in (1, 2, 6) else (1.0 if idx in (3, 4, 7) else 0.72)
            wc = 3.2 * surge
            wg = 14.5 * surge
            for i in range(len(trunk) - 1):
                draw_bolt_segment(core, glow, *trunk[i], *trunk[i + 1], N, wc, wg)
            for br in brs:
                for i in range(len(br) - 1):
                    draw_bolt_segment(core, glow, *br[i], *br[i + 1], N, wc * 0.52, wg * 0.58)
        else:
            # Frames 9..15: bolt breaks into snapping plasma beads & ground arcs
            fade = 1.0 - (idx - 9) / 6.5
            step = 2 if idx < 12 else 3
            for i in range(0, len(trunk) - 1, step):
                if (i + idx) % 3 == 0:
                    continue
                draw_bolt_segment(core, glow, *trunk[i], *trunk[i + 1], N, 2.0 * fade + 0.5, 9.0 * fade + 1.5)

        # Ground impact plasma burst + radial ground arcs at y = N * 0.88!
        gx0, gy0 = N * 0.50, N * 0.88
        if 1 <= idx <= 12:
            gt = (idx - 1) / 11.0
            ball_r = (26.0 if idx <= 3 else 18.0 * (1.0 - gt * 0.65))
            d2_ball = ((xx - gx0) ** 2 + ((yy - gy0) * 1.65) ** 2)
            core = np.maximum(core, np.exp(-d2_ball / max(4.0, (ball_r * 0.48) ** 2)) * (1.0 - gt * 0.6))
            glow = np.maximum(glow, np.exp(-d2_ball / max(12.0, (ball_r * 1.45) ** 2)) * (1.0 - gt * 0.5))
            # Crawling ground sparks
            for s_i in range(5):
                ang = -np.pi + (s_i + 0.5) * (np.pi / 5.0) * 2.0
                r_end = (18 + 52 * (gt ** 0.6))
                ex = gx0 + np.cos(ang) * r_end
                ey = gy0 + np.sin(ang) * r_end * 0.36
                if (idx + s_i) % 2 == 0 and idx <= 10:
                    gpath = build_jagged_path(np.random.default_rng(1200 + idx * 17 + s_i), gx0, gy0, ex, ey, 3, 0.28)
                    for k in range(len(gpath) - 1):
                        draw_bolt_segment(core, glow, *gpath[k], *gpath[k + 1], N, 1.5 * (1 - gt * 0.5), 6.5 * (1 - gt * 0.4))

        alpha = np.clip(glow * 0.88 + core, 0, 1)
        col = c_deep[None, None, :] * (1 - np.clip(glow, 0, 1)[..., None]) + c_cyan[None, None, :] * np.clip(glow, 0, 1)[..., None]
        ck = np.clip(core * 1.15, 0, 1)[..., None]
        col = col * (1 - ck) + c_white * ck
        frame = Image.fromarray((np.clip(np.dstack([col, alpha]), 0, 1) * 255).astype(np.uint8))
        gx, gy = idx % grid, idx // grid
        sheet.paste(frame, (gx * N, (grid - 1 - gy) * N))
    return sheet


def main():
    os.makedirs(OUT, exist_ok=True)
    items = [
        ("fx_noise_tile", make_noise_tile),
        ("fx_slash_lut", make_slash_lut),
        ("fx_beam_lut", make_beam_lut),
    ]
    for name, fn in items:
        im = fn()
        im.save(os.path.join(OUT, name + ".png"), optimize=True)
        print(f"wrote {name:20s} {im.size}")


if __name__ == "__main__":
    main()
