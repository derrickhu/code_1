"""生成外星图鉴与详情页专属 04 风格（45° 切角深黑曜石档案卡 #0D1528 + 赛博青/鎏金/翠绿双线霓虹框 + 雷达星标暗印）UI 套件。"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets/Resources/Art/ui")
SS = 4


def rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def blend(dst: np.ndarray, col: np.ndarray, mask: np.ndarray) -> np.ndarray:
    m = np.clip(mask, 0.0, 1.0)[:, :, None]
    return dst * (1.0 - m) + col * m


def sdf_segment(x: np.ndarray, y: np.ndarray, ax: float, ay: float, bx: float, by: float) -> np.ndarray:
    vx, vy = bx - ax, by - ay
    l2 = vx * vx + vy * vy + 1e-6
    t = np.clip(((x - ax) * vx + (y - ay) * vy) / l2, 0.0, 1.0)
    return np.hypot(x - (ax + t * vx), y - (ay + t * vy))


def sdf_oct_box(x: np.ndarray, y: np.ndarray, cx: float, cy: float, hw: float, hh: float, ch: float, r_tiny: float = 0.0) -> np.ndarray:
    W = max(2.0, hw - r_tiny)
    H = max(2.0, hh - r_tiny)
    C = np.clip(ch, 0.5, min(W, H) - 0.5)
    ax = np.abs(x - cx)
    ay = np.abs(y - cy)
    d1 = sdf_segment(ax, ay, 0.0, H, W - C, H)
    d2 = sdf_segment(ax, ay, W - C, H, W, H - C)
    d3 = sdf_segment(ax, ay, W, H - C, W, 0.0)
    min_d = np.minimum(np.minimum(d1, d2), d3)
    m = np.maximum(np.maximum(ax - W, ay - H), (ax + ay - (W + H - C)) * 0.70710678)
    return np.where(m <= 0.0, -min_d, min_d) - r_tiny


def sdf_diamond(x: np.ndarray, y: np.ndarray, cx: float, cy: float, rx: float, ry: float, round_r: float = 0.0) -> np.ndarray:
    scale = (rx * ry) / max(1e-5, np.hypot(rx, ry))
    d = (np.abs(x - cx) / max(1e-5, rx) + np.abs(y - cy) / max(1e-5, ry) - 1.0) * scale
    return d - round_r


def sdf_down_tri(x: np.ndarray, y: np.ndarray, cx: float, cy: float, hw: float, hh: float) -> np.ndarray:
    ax = np.abs(x - cx)
    d_top = (cy - hh) - y
    nx, ny = 2.0 * hh, hw
    nl = np.hypot(nx, ny)
    d_side = (nx * ax + ny * (y - (cy + hh))) / nl
    d_in = np.maximum(d_top, d_side)
    d1 = sdf_segment(ax, y, 0.0, cy - hh, hw, cy - hh)
    d2 = sdf_segment(ax, y, hw, cy - hh, 0.0, cy + hh)
    return np.where(d_in <= 0.0, d_in, np.minimum(d1, d2))


def make_codex_card(kind: str) -> Image.Image:
    bw, bh = 264, 296
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 2.2 * SS
    hw, hh, ch = (bw * 0.5 - 5.0) * SS, (bh * 0.5 - 7.5) * SS, 18.0 * SS

    if kind == "claim":
        c_str, c_lip, c_rim = rgb("050914"), rgb("724808"), rgb("FFB800")
        c_face_top, c_face_bot, c_orn, c_pat = rgb("1E2D4C"), rgb("131F36"), rgb("00F57A"), rgb("3E5838")
    elif kind == "lock":
        c_str, c_lip, c_rim = rgb("040710"), rgb("090E1C"), rgb("1E2D46")
        c_face_top, c_face_bot, c_orn, c_pat = rgb("0B1222"), rgb("080D1A"), rgb("16233A"), rgb("121D32")
    else:
        c_str, c_lip, c_rim = rgb("050914"), rgb("091A34"), rgb("00E5FF")
        c_face_top, c_face_bot, c_orn, c_pat = rgb("13203C"), rgb("0C1528"), rgb("264B7A"), rgb("1A365A")

    d_face = sdf_oct_box(x, y, cx, cy, hw, hh, ch, 1.0 * SS)
    d_lip = sdf_oct_box(x, y - 4.4 * SS, cx, cy, hw, hh, ch, 1.0 * SS)
    d_u = np.minimum(d_face, d_lip)
    a_main = np.clip(0.5 - d_u, 0.0, 1.0)

    st = 2.2 * SS
    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))

    m_body = np.clip(0.5 - (d_face + 4.4 * SS), 0.0, 1.0)
    face_fill = c_face_top[None, None, :] * (1.0 - yn[:, :, None]) + c_face_bot[None, None, :] * yn[:, :, None]
    col = blend(col, face_fill, m_body)

    pcy = cy - 14.0 * SS
    dm1 = np.abs((np.abs(x - cx) * 0.92 + np.abs(y - pcy) * 0.82) - 64.0 * SS) - 2.0 * SS
    dm2 = (np.abs(x - cx) * 0.92 + np.abs(y - pcy) * 0.82) - 50.0 * SS
    pat_m = (np.clip(0.5 - dm1, 0.0, 1.0) * 0.48 + np.clip(0.5 - dm2, 0.0, 1.0) * 0.24) * m_body
    col = blend(col, c_pat[None, None, :], pat_m)

    in_hw, in_hh = hw - 9.0 * SS, hh - 9.0 * SS
    d_in = np.abs(sdf_oct_box(x, y, cx, cy, in_hw, in_hh, ch - 4.0 * SS, 0.8 * SS)) - 0.95 * SS
    orn_m = np.clip(0.5 - d_in, 0.0, 1.0) * 0.78
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            px = cx + sx * (in_hw - 8.5 * SS)
            py = cy + sy * (in_hh - 8.5 * SS)
            dd_dot = (np.abs(x - px) + np.abs(y - py)) - 3.0 * SS
            orn_m = np.maximum(orn_m, np.clip(0.5 - dd_dot, 0.0, 1.0) * 0.85)
    col = blend(col, c_orn[None, None, :], orn_m * m_body)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_btab(active: bool) -> Image.Image:
    bw, bh = 224, 108
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = (w - 1) * 0.5
    cy = (h - 1) * 0.5 - 12.0 * SS
    hw, hh, ch = (bw * 0.5 - 5.0) * SS, (bh * 0.5 + 8.0) * SS, 18.0 * SS

    d_face = np.maximum(sdf_oct_box(x, y, cx, cy, hw, hh, ch, 1.0 * SS), -y)
    d_lip = np.maximum(sdf_oct_box(x, y - 5.2 * SS, cx, cy, hw, hh, ch, 1.0 * SS), -y)
    d_u = np.minimum(d_face, d_lip)
    a_main = np.clip(0.5 - d_u, 0.0, 1.0)

    c_str = rgb("050914")
    if active:
        c_lip, c_rim, c_face = rgb("724808"), rgb("FFB800"), rgb("182848")
    else:
        c_lip, c_rim, c_face = rgb("081122"), rgb("2E4E7A"), rgb("0C1528")

    st = 2.6 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))
    m_body = np.clip(0.5 - (d_face + 4.8 * SS), 0.0, 1.0)
    col = blend(col, c_face[None, None, :], m_body)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(a_main * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_crest() -> Image.Image:
    bw = bh = 320
    w = h = bw * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = cy = (w - 1) * 0.5
    dx, dy = x - cx, y - cy
    rad = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx)

    m_band = np.clip(0.5 - np.abs(rad - 114.0 * SS) + 12.0 * SS, 0.0, 1.0) * 0.16
    m_ring_out = np.clip(1.0 - np.abs(rad - 127.0 * SS) / (2.2 * SS), 0.0, 1.0) * 0.52
    m_ring_in = np.clip(1.0 - np.abs(rad - 101.0 * SS) / (2.0 * SS), 0.0, 1.0) * 0.48
    cos4 = np.abs(np.cos(2.0 * ang))
    ear_r = (127.0 + 20.0 * (cos4 ** 10)) * SS
    m_ears = np.clip(1.0 - np.abs(rad - ear_r) / (2.4 * SS), 0.0, 1.0) * np.clip((cos4 - 0.55) / 0.2, 0.0, 1.0) * 0.56

    alpha = np.clip(np.maximum.reduce([m_band, m_ring_out, m_ring_in, m_ears]), 0.0, 1.0)
    col = np.broadcast_to(rgb("00E5FF"), (h, w, 3)).copy()

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_tag_edge() -> Image.Image:
    bw, bh = 180, 64
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)

    cx, cy = (bw * 0.5 - 2.0) * SS, 26.0 * SS
    hw, hh, ch = (bw * 0.5 - 4.0) * SS, 22.0 * SS, 11.0 * SS
    d_rr = sdf_oct_box(x, y, cx, cy, hw, hh, ch, 0.8 * SS)
    d_left_box = np.maximum(np.maximum(2.0 * SS - x, x - 36.0 * SS), np.abs(y - cy) - hh)
    d_face = np.minimum(d_rr, d_left_box)
    d_lip = np.minimum(
        sdf_oct_box(x, y - 3.6 * SS, cx, cy, hw, hh, ch, 0.8 * SS),
        np.maximum(np.maximum(2.0 * SS - x, x - 36.0 * SS), np.abs((y - 3.6 * SS) - cy) - hh),
    )

    d_fold = np.maximum.reduce([
        2.0 * SS - x,
        x - 14.0 * SS,
        47.0 * SS - y,
        (y - 48.0 * SS) * 12.0 - (x - 2.0 * SS) * 11.0,
    ])
    m_fold = np.clip(0.5 - d_fold, 0.0, 1.0)
    d_u = np.minimum(d_face, d_lip)
    m_main = np.clip(0.5 - d_u, 0.0, 1.0)
    alpha = np.maximum(m_main, m_fold)

    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, np.array([112.0, 118.0, 130.0])[None, None, :], m_fold)
    col = blend(col, np.array([170.0, 180.0, 196.0])[None, None, :], m_main)
    col = blend(col, np.array([252.0, 254.0, 255.0])[None, None, :], np.clip(0.5 - d_face, 0.0, 1.0))

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_name_wing() -> Image.Image:
    bw, bh = 240, 36
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cy = (h - 1) * 0.5

    m_dot = np.clip(0.5 - (np.hypot(x - 10.0 * SS, y - cy) - 2.4 * SS), 0.0, 1.0)
    m_line = np.clip(0.5 - (sdf_segment(x, y, 21.0 * SS, cy, 178.0 * SS, cy) - 1.45 * SS), 0.0, 1.0)
    m_dm1 = np.clip(0.5 - (np.abs(sdf_diamond(x, y, 191.0 * SS, cy, 9.5 * SS, 7.5 * SS)) - 1.65 * SS), 0.0, 1.0)
    m_dm2 = np.clip(0.5 - (np.abs(sdf_diamond(x, y, 215.0 * SS, cy, 12.0 * SS, 9.5 * SS)) - 1.85 * SS), 0.0, 1.0)

    alpha = np.clip(np.maximum.reduce([m_dot, m_line, m_dm1, m_dm2]), 0.0, 1.0)
    col = np.broadcast_to(rgb("00E5FF"), (h, w, 3)).copy()
    col = blend(col, rgb("FFB800")[None, None, :], np.maximum(m_dm1, m_dm2))
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_divider() -> Image.Image:
    bw, bh = 780, 28
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    ax = np.abs(x - cx)

    d_cap = sdf_oct_box(ax, y, 378.0 * SS, cy, 6.5 * SS, 1.5 * SS, 1.0 * SS)
    d_seg = sdf_oct_box(ax, y, 213.0 * SS, cy, 147.0 * SS, 1.35 * SS, 0.8 * SS)
    m_line = np.maximum(np.clip(0.5 - d_cap, 0.0, 1.0), np.clip(0.5 - d_seg, 0.0, 1.0))
    m_tri = np.zeros_like(m_line)
    for dx_off, tw, th in [(0.0, 9.5, 6.2), (-26.0, 7.2, 4.8), (26.0, 7.2, 4.8)]:
        dt = sdf_down_tri(x, y, cx + dx_off * SS, cy + 1.0 * SS, tw * SS, th * SS) - 0.8 * SS
        m_tri = np.maximum(m_tri, np.clip(0.5 - dt, 0.0, 1.0))

    m = np.maximum(m_line * 0.65, m_tri)
    col = np.broadcast_to(rgb("2E5282"), (h, w, 3)).copy()
    col = blend(col, rgb("FFB800")[None, None, :], m_tri)
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(m * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_bullet() -> Image.Image:
    bw = bh = 32
    w = h = bw * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = cy = (w - 1) * 0.5
    d = sdf_diamond(x, y, cx, cy, 9.5 * SS, 9.5 * SS, 0.8 * SS)
    m = np.clip(0.5 - d, 0.0, 1.0)
    col = np.broadcast_to(rgb("00F57A"), (h, w, 3)).copy()
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(m * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_watermark() -> Image.Image:
    bw, bh = 232, 168
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = 148.0 * SS, 94.0 * SS
    r = np.hypot(x - cx, y - cy)

    r1 = np.clip(1.0 - np.abs(r - 58.0 * SS) / (2.4 * SS), 0.0, 1.0)
    r2 = np.clip(1.0 - np.abs(r - 36.0 * SS) / (2.0 * SS), 0.0, 1.0)
    ch = np.clip(0.5 - (sdf_segment(x, y, cx - 68 * SS, cy, cx + 68 * SS, cy) - 1.4 * SS), 0.0, 1.0)
    cv = np.clip(0.5 - (sdf_segment(x, y, cx, cy - 68 * SS, cx, cy + 68 * SS) - 1.4 * SS), 0.0, 1.0)
    star = np.clip(0.5 - sdf_diamond(x, y, cx, cy, 9.0 * SS, 9.0 * SS, 0.8 * SS), 0.0, 1.0)
    ufo = np.clip(0.5 - sdf_oct_box(x, y, cx - 48 * SS, cy - 36 * SS, 16 * SS, 4.5 * SS, 3.0 * SS), 0.0, 1.0)
    dome = np.clip(0.5 - (np.hypot(x - (cx - 48 * SS), y - (cy - 40 * SS)) - 8.0 * SS), 0.0, 1.0) * (y <= (cy - 36 * SS))

    alpha = np.clip(np.maximum.reduce([r1, r2, ch * 0.75, cv * 0.75, star, ufo, dome]), 0.0, 1.0) * 0.28
    col = np.broadcast_to(rgb("00E5FF"), (h, w, 3)).copy()
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    jobs = [
        ("codex_card.png", lambda: make_codex_card("normal")),
        ("codex_card_claim.png", lambda: make_codex_card("claim")),
        ("codex_card_lock.png", lambda: make_codex_card("lock")),
        ("codex_btab_on.png", lambda: make_btab(True)),
        ("codex_btab_off.png", lambda: make_btab(False)),
        ("codex_crest.png", make_crest),
        ("codex_tag_edge.png", make_tag_edge),
        ("codex_name_wing.png", make_name_wing),
        ("codex_divider.png", make_divider),
        ("codex_bullet.png", make_bullet),
        ("codex_watermark.png", make_watermark),
    ]
    for name, fn in jobs:
        im = fn()
        im.save(os.path.join(OUT, name), optimize=True)
        print(f"wrote {name:22s} {im.size[0]}x{im.size[1]}")


if __name__ == "__main__":
    main()
