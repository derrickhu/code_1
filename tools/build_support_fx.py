"""生成 4x 超采样高清『辅助祝福双环星阵金球』特效贴图（100% 复刻《永远的蔚蓝星球》雅典娜祝福金球质感）：
输出到 Assets/Resources/Art/fx_bless_orb.png (256x256)：
- 在浅黄褐色石板地面上清晰度极高：外层一圈浓郁琥珀橙描边光晕 + 鲜明亮金实体圆环 + 内嵌深金/纯白高对比八芒法阵星轮！
- 运行时直接用原色（暖金法球）或乘以微调色调即可，彻底杜绝白雾成团看不见内部图案的问题！
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets/Resources/Art")
SS = 2


def rgb(h: str) -> np.ndarray:
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def blend(dst: np.ndarray, col: np.ndarray, mask: np.ndarray) -> np.ndarray:
    m = np.clip(mask, 0.0, 1.0)[:, :, None]
    return dst * (1.0 - m) + col * m


def main() -> None:
    bw = bh = 256
    w = h = bw * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = cy = (w - 1) * 0.5
    dx, dy = x - cx, y - cy
    rad = np.hypot(dx, dy)
    ang = np.arctan2(dy, dx)
    rn = rad / (bw * 0.5 * SS)

    # 1. 外围浓郁琥珀橙光晕 (rn = 0.54 .. 0.96)，把金球从浅米色石板路上鲜明托出来！
    m_halo = np.exp(-((np.maximum(0.0, rn - 0.52) / 0.24) ** 2)) * np.clip((0.98 - rn) / 0.12, 0.0, 1.0) * 0.82

    # 2. 半透明深暖金内底盘 (rn < 0.58)，内部留透、边缘微深，衬托里面的亮白星芒与金环！
    m_disc = np.clip((0.585 - rn) / 0.02, 0.0, 1.0) * (0.48 + 0.34 * (rn / 0.58) ** 2)

    # 3. 鲜明双层亮金法阵圆环 (主环 rn=0.555 宽厚清晰，内细环 rn=0.41)
    m_ring_outer_rim = np.clip(1.0 - np.abs(rn - 0.585) / 0.024, 0.0, 1.0) * 0.92
    m_ring_main = np.clip(1.0 - np.abs(rn - 0.545) / 0.038, 0.0, 1.0)
    m_ring_in = np.clip(1.0 - np.abs(rn - 0.395) / 0.022, 0.0, 1.0) * 0.92

    # 环间 8 枚清晰的符文菱珠 (rn = 0.47)
    m_runes = (np.maximum(0.0, np.cos(8.0 * ang)) ** 18) * np.clip(1.0 - np.abs(rn - 0.472) / 0.032, 0.0, 1.0) * 0.95

    # 4. 正中锐利的八芒太阳星徽（4长主芒 + 4短副芒 + 中心亮珠，100% 还原参考图球内清晰星纹！）
    ray4_main = (np.abs(np.cos(2.0 * ang)) ** 18) * np.clip(1.0 - rn / 0.50, 0.0, 1.0)
    ray4_sub = (np.abs(np.sin(2.0 * ang)) ** 20) * np.clip(1.0 - rn / 0.36, 0.0, 1.0) * 0.88
    m_core = np.clip(1.0 - rn / 0.14, 0.0, 1.0)
    m_star = np.clip(np.maximum.reduce([ray4_main, ray4_sub, m_core]), 0.0, 1.0) * np.clip((0.55 - rn) / 0.02, 0.0, 1.0)

    col = np.zeros((h, w, 3), dtype=np.float32)
    # 底层暖琥珀橙光晕 (#FF8C14)
    col = blend(col, rgb("FF8812")[None, None, :], m_halo)
    # 球体底盘深琥珀金 (#E67E10) 让内部亮纹高对比凸显
    col = blend(col, rgb("E88214")[None, None, :], m_disc)
    # 外描边深金 (#D96B08)
    col = blend(col, rgb("D96B08")[None, None, :], m_ring_outer_rim)
    # 主金环与内环亮金 (#FFE46B -> #FFF6B8)
    col = blend(col, rgb("FFE052")[None, None, :], m_ring_in)
    col = blend(col, rgb("FFF088")[None, None, :], m_ring_main)
    col = blend(col, rgb("FFF6B8")[None, None, :], m_runes)
    # 中心八芒星纯白耀金 (#FFFDF0)
    col = blend(col, rgb("FFFDF2")[None, None, :], m_star)

    alpha = np.clip(
        np.maximum.reduce([m_halo, m_disc, m_ring_outer_rim, m_ring_main, m_ring_in, m_runes, m_star]),
        0.0,
        1.0,
    )

    out = np.zeros((h, w, 4), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)

    im = Image.fromarray(out).resize((bw, bh), Image.Resampling.LANCZOS)
    dst = os.path.join(OUT, "fx_bless_orb.png")
    im.save(dst, optimize=True)
    print(f"wrote {dst} {im.size}")


if __name__ == "__main__":
    main()
