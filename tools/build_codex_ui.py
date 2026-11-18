"""生成敌军图鉴与详情页专属 4x 超采样矢量级高清 UI 套件（像素级对标业界顶级清爽立体质感）。

输出到 Assets/Resources/Art/ui/：
- codex_card.png       (264x296, 9-slice 60,60,60,60)  温润浅米白立体格卡 + 四角菱纹折线内框 + 中央淡雅菱格纹章
- codex_card_claim.png (264x296, 9-slice 60,60,60,60)  可领奖态暖香槟金高光格卡
- codex_card_lock.png  (264x296, 9-slice 60,60,60,60)  未遭遇态冷灰米质感格卡（清爽不脏黑）
- codex_btab_on.png    (224x108, 9-slice 36,36,36,24)  底挂书签页签激活态（暖奶油米白立体挂签）
- codex_btab_off.png   (224x108, 9-slice 36,36,36,24)  底挂书签页签未选态（石青蓝立体沉签，顶沿带面板投影）
- codex_crest.png      (320x320)                       详情页怪兽身后淡雅水墨米金双环星芒底纹
- codex_tag_edge.png   (180x64,  9-slice 22,16,32,12)  贴左框边伸出的立体折耳角标（白底可任意染色，零锯齿）
- codex_name_wing.png  (240x36)                        怪名两侧空心双菱渐变细花线（左向原图，右侧镜像）
- codex_divider.png    (780x28)                        中央三枚圆润小倒三角 + 两侧双断线优雅分割栏
- codex_bullet.png     (32x32)                         说明框首行对齐圆润小菱星项目符号
- codex_watermark.png  (240x180)                       详情页右下角淡雅水泊云纹暗印

用法：python3 tools/build_codex_ui.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets/Resources/Art/ui")
SS = 4


def rgb(h: str) -> np.ndarray:
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def blend(dst: np.ndarray, col: np.ndarray, mask: np.ndarray) -> np.ndarray:
    m = np.clip(mask, 0.0, 1.0)[:, :, None]
    return dst * (1.0 - m) + col * m


def sdf_rrect(x: np.ndarray, y: np.ndarray, cx: float, cy: float, hw: float, hh: float, r: float) -> np.ndarray:
    dx = np.abs(x - cx) - (hw - r)
    dy = np.abs(y - cy) - (hh - r)
    outside = np.hypot(np.maximum(dx, 0.0), np.maximum(dy, 0.0))
    inside = np.minimum(np.maximum(dx, dy), 0.0)
    return outside + inside - r


def sdf_segment(x: np.ndarray, y: np.ndarray, ax: float, ay: float, bx: float, by: float) -> np.ndarray:
    vx, vy = bx - ax, by - ay
    l2 = vx * vx + vy * vy + 1e-6
    t = np.clip(((x - ax) * vx + (y - ay) * vy) / l2, 0.0, 1.0)
    return np.hypot(x - (ax + t * vx), y - (ay + t * vy))


def sdf_diamond(x: np.ndarray, y: np.ndarray, cx: float, cy: float, rx: float, ry: float, round_r: float = 0.0) -> np.ndarray:
    # 曼哈顿菱形近似有向距离
    scale = (rx * ry) / max(1e-5, np.hypot(rx, ry))
    d = (np.abs(x - cx) / max(1e-5, rx) + np.abs(y - cy) / max(1e-5, ry) - 1.0) * scale
    return d - round_r


def sdf_down_tri(x: np.ndarray, y: np.ndarray, cx: float, cy: float, hw: float, hh: float) -> np.ndarray:
    """朝下的等腰小三角有向距离（内部 < 0）：顶边 y = cy - hh，底尖 (cx, cy + hh)。"""
    ax = np.abs(x - cx)
    # 顶水平半平面：y < cy - hh 时在外部
    d_top = (cy - hh) - y
    # 斜边法向朝右上：(2*hh, hw) 归一化
    nx, ny = 2.0 * hh, hw
    nl = np.hypot(nx, ny)
    # 斜边过点 (hw, cy - hh) 与 (0, cy + hh)：nx * ax + ny * (y - (cy + hh)) = 0
    d_side = (nx * ax + ny * (y - (cy + hh))) / nl
    d_in = np.maximum(d_top, d_side)
    # 顶点外侧圆滑距离
    d1 = sdf_segment(ax, y, 0.0, cy - hh, hw, cy - hh)
    d2 = sdf_segment(ax, y, hw, cy - hh, 0.0, cy + hh)
    d_out = np.minimum(d1, d2)
    return np.where(d_in <= 0.0, d_in, d_out)


def make_codex_card(kind: str) -> Image.Image:
    bw, bh = 264, 296
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5 - 2.2 * SS
    hw, hh, r = (bw * 0.5 - 5.0) * SS, (bh * 0.5 - 7.5) * SS, 20.0 * SS

    if kind == "claim":
        c_str = rgb("B28232")
        c_lip = rgb("E0B96A")
        c_rim = rgb("FFFDF4")
        c_top, c_bot = rgb("FFF8DF"), rgb("FBEBB6")
        c_orn = rgb("DFBE78")
        c_pat = rgb("E8CB88")
    elif kind == "lock":
        c_str = rgb("B2ABA0")
        c_lip = rgb("CEC7BC")
        c_rim = rgb("F4F1EA")
        c_top, c_bot = rgb("E8E3D9"), rgb("DDD7CB")
        c_orn = rgb("C8C0B2")
        c_pat = rgb("D0C9BC")
    else:
        c_str = rgb("C2B49E")
        c_lip = rgb("DFD3BF")
        c_rim = rgb("FFFFFF")
        c_top, c_bot = rgb("F9F4EA"), rgb("EFE6D6")
        c_orn = rgb("D8CBB6")
        c_pat = rgb("E3D8C6")

    d_face = sdf_rrect(x, y, cx, cy, hw, hh, r)
    d_lip = sdf_rrect(x, y - 4.2 * SS, cx, cy, hw, hh, r)
    d_sh = sdf_rrect(x, y - 6.8 * SS, cx, cy, hw + 1.0 * SS, hh, r)

    sh_a = np.clip(1.0 - d_sh / (4.0 * SS), 0.0, 1.0) * 0.12
    d_u = np.minimum(d_face, d_lip)
    a_main = np.clip(0.5 - d_u, 0.0, 1.0)
    alpha = np.maximum(a_main, sh_a)

    st = 2.0 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("6E5B44")[None, None, :], sh_a)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))

    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    body = c_top[None, None, :] * (1.0 - yn[:, :, None]) + c_bot[None, None, :] * yn[:, :, None]
    m_body = np.clip(0.5 - (d_face + 4.2 * SS), 0.0, 1.0)
    col = blend(col, body, m_body)

    pcy = cy - 14.0 * SS
    dm1 = np.abs((np.abs(x - cx) * 0.92 + np.abs(y - pcy) * 0.82) - 66.0 * SS) - 2.2 * SS
    dm2 = (np.abs(x - cx) * 0.92 + np.abs(y - pcy) * 0.82) - 52.0 * SS
    pat_m = (np.clip(0.5 - dm1, 0.0, 1.0) * 0.50 + np.clip(0.5 - dm2, 0.0, 1.0) * 0.28) * m_body
    col = blend(col, c_pat[None, None, :], pat_m)

    in_hw, in_hh = hw - 9.5 * SS, hh - 9.5 * SS
    d_in = np.abs(sdf_rrect(x, y, cx, cy, in_hw, in_hh, 11.0 * SS)) - 1.0 * SS
    orn_m = np.clip(0.5 - d_in, 0.0, 1.0) * 0.78

    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            px = cx + sx * (in_hw - 9.0 * SS)
            py = cy + sy * (in_hh - 9.0 * SS)
            dd = np.abs((np.abs(x - px) + np.abs(y - py)) - 6.0 * SS) - 1.0 * SS
            dd_dot = (np.abs(x - px) + np.abs(y - py)) - 2.4 * SS
            orn_m = np.maximum(orn_m, np.clip(0.5 - dd, 0.0, 1.0) * 0.72)
            orn_m = np.maximum(orn_m, np.clip(0.5 - dd_dot, 0.0, 1.0) * 0.65)

    col = blend(col, c_orn[None, None, :], orn_m * m_body)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_btab(active: bool) -> Image.Image:
    bw, bh = 224, 108
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = (w - 1) * 0.5
    cy = (h - 1) * 0.5 - 12.0 * SS
    hw = (bw * 0.5 - 5.0) * SS
    hh = (bh * 0.5 + 8.0) * SS
    r = 22.0 * SS

    d_face = np.maximum(sdf_rrect(x, y, cx, cy, hw, hh, r), -y)
    d_lip = np.maximum(sdf_rrect(x, y - 5.2 * SS, cx, cy, hw, hh, r), -y)
    d_sh = np.maximum(sdf_rrect(x, y - 8.2 * SS, cx, cy, hw + 1.2 * SS, hh, r), -y)

    sh_a = np.clip(1.0 - d_sh / (4.5 * SS), 0.0, 1.0) * 0.24
    d_u = np.minimum(d_face, d_lip)
    a_main = np.clip(0.5 - d_u, 0.0, 1.0)
    alpha = np.maximum(a_main, sh_a)

    if active:
        c_str = rgb("2E4558")
        c_lip = rgb("C7B292")
        c_rim = rgb("FFFDF9")
        c_top, c_bot = rgb("FAF3E5"), rgb("EFE4CE")
        c_in = rgb("DECBA8")
    else:
        c_str = rgb("1D3346")
        c_lip = rgb("2D485E")
        c_rim = rgb("6C92AC")
        c_top, c_bot = rgb("4D708A"), rgb("3E5E76")
        c_in = rgb("35526A")

    st = 2.4 * SS
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, rgb("0C1826")[None, None, :], sh_a)
    col = blend(col, c_str[None, None, :], a_main)
    col = blend(col, c_lip[None, None, :], np.clip(0.5 - (d_lip + st), 0.0, 1.0))
    col = blend(col, c_rim[None, None, :], np.clip(0.5 - (d_face + st), 0.0, 1.0))

    yn = np.clip(y / max(1.0, (bh - 10.0) * SS), 0.0, 1.0)
    body = c_top[None, None, :] * (1.0 - yn[:, :, None]) + c_bot[None, None, :] * yn[:, :, None]
    m_body = np.clip(0.5 - (d_face + 4.6 * SS), 0.0, 1.0)
    col = blend(col, body, m_body)

    if active:
        d_deco = np.abs(np.maximum(sdf_rrect(x, y, cx, cy, hw - 9.0 * SS, hh - 9.0 * SS, 14.0 * SS), -(y - 4.0 * SS))) - 1.0 * SS
        col = blend(col, c_in[None, None, :], np.clip(0.5 - d_deco, 0.0, 1.0) * 0.58 * m_body)
    else:
        top_shade = np.clip(1.0 - y / (22.0 * SS), 0.0, 1.0) ** 1.5
        col = blend(col, rgb("243B4E")[None, None, :], top_shade * 0.55 * m_body)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_crest() -> Image.Image:
    """对标参考图：双层清透圆环 + 八向对称弧芒花瓣框 + 柔和底圈，线条细腻锐利。"""
    bw = bh = 320
    w = h = bw * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = cy = (w - 1) * 0.5
    dx, dy = x - cx, y - cy
    rad = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx)

    # 内外双圆环 + 中间柔光环带
    m_band = np.clip(0.5 - np.abs(rad - 114.0 * SS) + 12.0 * SS, 0.0, 1.0) * 0.24
    m_ring_out = np.clip(1.0 - np.abs(rad - 127.0 * SS) / (2.2 * SS), 0.0, 1.0) * 0.62
    m_ring_in = np.clip(1.0 - np.abs(rad - 101.0 * SS) / (2.0 * SS), 0.0, 1.0) * 0.56

    # 四正方向优雅尖拱耳饰（完全复刻参考图怪物背后上下左右四枚尖耳花纹）
    cos4 = np.abs(np.cos(2.0 * ang))
    ear_r = (127.0 + 22.0 * (cos4 ** 10)) * SS
    m_ears = np.clip(1.0 - np.abs(rad - ear_r) / (2.4 * SS), 0.0, 1.0) * np.clip((cos4 - 0.55) / 0.2, 0.0, 1.0) * 0.62
    # 四斜角小托珠
    diag = np.abs(np.sin(2.0 * ang)) ** 14
    dot_r = (127.0 + 9.0 * diag) * SS
    m_diag = np.clip(1.0 - np.abs(rad - dot_r) / (2.0 * SS), 0.0, 1.0) * np.clip((diag - 0.5) / 0.2, 0.0, 1.0) * 0.48

    alpha = np.clip(np.maximum.reduce([m_band, m_ring_out, m_ring_in, m_ears, m_diag]), 0.0, 1.0)
    col = np.broadcast_to(rgb("DED4C3"), (h, w, 3)).copy()

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_tag_edge() -> Image.Image:
    """复刻参考图左上角贴框伸出的丝带立体角标（白底纯灰阶明暗，运行时乘以任意主题色都自带立体底沿与左侧折耳）。
    尺寸 180x64，9-slice (22, 16, 32, 12)：
    - 左侧 x=0..10 向下折出一个深色立体小三角折耳（包住面板外框左缘）
    - 主标签面 y=4..50，左侧平齐、右侧圆角 r=12，底沿带 4px 立体暗唇与柔影
    """
    bw, bh = 180, 64
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)

    # 主标签面：左端平齐 x >= 2，右端圆角到 x = bw - 6，y = 4..48
    cx, cy = (bw * 0.5 - 2.0) * SS, 26.0 * SS
    hw, hh, r = (bw * 0.5 - 4.0) * SS, 22.0 * SS, 12.0 * SS
    # 左半部分去掉圆角使其贴齐左缘（x < 24*SS 时用矩形）
    d_rr = sdf_rrect(x, y, cx, cy, hw, hh, r)
    d_left_box = np.maximum(np.maximum(2.0 * SS - x, x - 36.0 * SS), np.abs(y - cy) - hh)
    d_face = np.minimum(d_rr, d_left_box)
    d_lip = np.minimum(
        sdf_rrect(x, y - 3.6 * SS, cx, cy, hw, hh, r),
        np.maximum(np.maximum(2.0 * SS - x, x - 36.0 * SS), np.abs((y - 3.6 * SS) - cy) - hh),
    )

    # 左下角向内折回的丝带立体暗折角：(2, 48) -> (14, 48) -> (14, 59)
    d_fold = np.maximum.reduce([
        2.0 * SS - x,
        x - 14.0 * SS,
        47.0 * SS - y,
        # 斜边从 (2, 48) 到 (14, 59)：11*(x-2) - 12*(y-48) < 0 -> (y-48) > 11/12*(x-2) 不对，我们要上方三角形：(2,48)-(14,48)-(14,59)
        (y - 48.0 * SS) * 12.0 - (x - 2.0 * SS) * 11.0,
    ])
    m_fold = np.clip(0.5 - d_fold, 0.0, 1.0)

    d_sh = sdf_rrect(x, y - 6.0 * SS, cx + 1.0 * SS, cy, hw, hh, r)
    sh_a = np.clip(1.0 - d_sh / (4.0 * SS), 0.0, 1.0) * 0.22

    d_u = np.minimum(d_face, d_lip)
    m_main = np.clip(0.5 - d_u, 0.0, 1.0)
    alpha = np.maximum(np.maximum(m_main, m_fold), sh_a)

    # 白底亮度场：Image.color 染色后，1.0 = 原色亮面，0.72 = 立体底唇，0.48 = 丝带暗折耳
    col = np.zeros((h, w, 3), dtype=np.float32)
    col = blend(col, np.array([35.0, 35.0, 35.0])[None, None, :], sh_a)
    col = blend(col, np.array([122.0, 122.0, 122.0])[None, None, :], m_fold)
    col = blend(col, np.array([182.0, 182.0, 182.0])[None, None, :], m_main)

    yn = np.clip((y - (cy - hh)) / max(1.0, 2.0 * hh), 0.0, 1.0)
    top_v = 255.0 * (1.0 - yn) + 236.0 * yn
    body = np.stack([top_v, top_v, top_v], axis=-1)
    m_face = np.clip(0.5 - d_face, 0.0, 1.0)
    col = blend(col, body, m_face)

    # 顶边一缕清透高光丝
    m_hi = np.clip(0.5 - (d_face + 1.5 * SS), 0.0, 1.0) * np.clip(1.0 - (y - (cy - hh)) / (5.0 * SS), 0.0, 1.0) * 0.35
    col = blend(col, np.array([255.0, 255.0, 255.0])[None, None, :], m_hi)

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_name_wing() -> Image.Image:
    """复刻参考图怪名左侧的精致花线：『· —— ◇◇』（右侧在 UI 里 scaleX = -1 对称镜像）。
    完全空心双菱形 + 末端小圆点，4x 超采样丝滑无锯齿。
    """
    bw, bh = 240, 36
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cy = (h - 1) * 0.5

    # 最左小圆珠 x=10，细横线 x=20..176，小空心菱形 cx=190 (r=7.5)，大空心菱形 cx=214 (r=10.5)
    d_dot = np.hypot(x - 10.0 * SS, y - cy) - 2.4 * SS
    m_dot = np.clip(0.5 - d_dot, 0.0, 1.0)

    d_line = sdf_segment(x, y, 21.0 * SS, cy, 178.0 * SS, cy) - 1.45 * SS
    m_line = np.clip(0.5 - d_line, 0.0, 1.0)

    d_dm1 = np.abs(sdf_diamond(x, y, 191.0 * SS, cy, 9.5 * SS, 7.5 * SS)) - 1.65 * SS
    m_dm1 = np.clip(0.5 - d_dm1, 0.0, 1.0)

    d_dm2 = np.abs(sdf_diamond(x, y, 215.0 * SS, cy, 12.0 * SS, 9.5 * SS)) - 1.85 * SS
    m_dm2 = np.clip(0.5 - d_dm2, 0.0, 1.0)

    alpha = np.clip(np.maximum.reduce([m_dot, m_line, m_dm1, m_dm2]), 0.0, 1.0)
    col = np.broadcast_to(rgb("D5BE95"), (h, w, 3)).copy()

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_divider() -> Image.Image:
    """复刻参考图底部奖励上方的分割栏：『-  ——————  ▾ ▾ ▾  ——————  -』
    两端带短破折点，中间三枚朝下的圆润小三角（正中略大）。
    """
    bw, bh = 780, 28
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = (w - 1) * 0.5, (h - 1) * 0.5
    ax = np.abs(x - cx)

    # 两侧短端线 ax = 372..384，主长横线 ax = 66..360
    d_cap = sdf_rrect(ax, y, 378.0 * SS, cy, 6.5 * SS, 1.4 * SS, 1.4 * SS)
    d_seg = sdf_rrect(ax, y, 213.0 * SS, cy, 147.0 * SS, 1.35 * SS, 1.35 * SS)
    m = np.maximum(np.clip(0.5 - d_cap, 0.0, 1.0), np.clip(0.5 - d_seg, 0.0, 1.0))

    # 中央三枚朝下小三角
    for dx_off, tw, th in [(0.0, 9.5, 6.2), (-26.0, 7.2, 4.8), (26.0, 7.2, 4.8)]:
        dt = sdf_down_tri(x, y, cx + dx_off * SS, cy + 1.0 * SS, tw * SS, th * SS) - 1.0 * SS
        m = np.maximum(m, np.clip(0.5 - dt, 0.0, 1.0))

    col = np.broadcast_to(rgb("CFC5B4"), (h, w, 3)).copy()
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(m * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_bullet() -> Image.Image:
    """说明框首行前的圆润四芒小菱星（彻底替代粗糙旋转白方块）。"""
    bw = bh = 32
    w = h = bw * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = cy = (w - 1) * 0.5
    d = sdf_diamond(x, y, cx, cy, 9.0 * SS, 9.0 * SS, 1.6 * SS)
    m = np.clip(0.5 - d, 0.0, 1.0)
    col = np.broadcast_to(rgb("B9AC98"), (h, w, 3)).copy()
    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(m * 255.0), 0, 255).astype(np.uint8)
    return Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)


def make_watermark() -> Image.Image:
    """详情页右下角淡雅东方祥云水波暗纹（国风契合水泊梁山，取代不搭调的星轨环）。"""
    bw, bh = 232, 168
    w, h = bw * SS, bh * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)

    # 三朵错落有致的传统圆弧祥云轮廓 + 两道柔和微波横纹
    clouds = [
        (134.0, 86.0, 34.0),
        (102.0, 96.0, 24.0),
        (166.0, 94.0, 25.0),
        (82.0, 106.0, 17.0),
        (188.0, 104.0, 18.0),
    ]
    d_union = np.full((h, w), 1e9, dtype=np.float32)
    for cx, cy, r in clouds:
        dc = np.hypot(x - cx * SS, y - cy * SS) - r * SS
        d_union = np.minimum(d_union, dc)
    # 祥云平底收束在 y = 112
    d_cloud = np.maximum(d_union, y - 112.0 * SS)
    m_cloud = np.clip(1.0 - np.abs(d_cloud) / (2.6 * SS), 0.0, 1.0)

    # 云内如意卷云小勾弧
    d_curl1 = np.abs(np.hypot(x - 134.0 * SS, y - 92.0 * SS) - 16.0 * SS)
    m_curl = np.clip(1.0 - d_curl1 / (2.2 * SS), 0.0, 1.0) * np.clip((100.0 * SS - y) / (12.0 * SS), 0.0, 1.0)

    # 下方两道平直舒展的水泊波纹线
    d_w1 = sdf_rrect(x, y, 146.0 * SS, 126.0 * SS, 54.0 * SS, 1.4 * SS, 1.4 * SS)
    d_w2 = sdf_rrect(x, y, 118.0 * SS, 140.0 * SS, 42.0 * SS, 1.3 * SS, 1.3 * SS)
    m_wave = np.maximum(np.clip(0.5 - d_w1, 0.0, 1.0), np.clip(0.5 - d_w2, 0.0, 1.0))

    alpha = np.clip(np.maximum.reduce([m_cloud, m_curl, m_wave]), 0.0, 1.0) * 0.36
    col = np.broadcast_to(rgb("D8CEBE"), (h, w, 3)).copy()
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
