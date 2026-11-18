"""把生成的 UI 件整张图切成 Art/ui 下的皮肤。

用法：python3 tools/ui_kit.py home      # 主界面件（h_*）
      python3 tools/ui_kit.py <sheet名>  # 见下面 SHEETS

流程：整张先用 Real-ESRGAN 放大 4 倍（tools/upscale.py），抠掉纯色底，
半透明边缘去掉底色残留，再按画布尺寸出图。
横条件（mode=h）按目标高度缩放后只伸缩中段，两端花纹原样保留，
所以 Art.SkinBorder 左右边框要盖住两端花纹。
"""
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT.parent / "game_assets/code_2/assets/raw/home_v4"
FINAL = ROOT.parent / "game_assets/code_2/assets/final/home_v4"
OUT = ROOT / "Assets/Resources/Art/ui"

# 名字 -> (所在格子 x0,y0,x1,y1（原图 0~1 坐标），画布宽高，模式)
# fit：等比放进画布居中；stretch：直接拉满画布；h：横条，两端保留、中段伸缩
SHEETS = {
    "home": ("home_kit_v4.jpg", {
        "h_tile":     ((0.00, 0.00, 0.333, 0.36), (217, 215), "stretch"),
        "h_round":    ((0.333, 0.00, 0.666, 0.36), (213, 218), "fit"),
        "h_arrow":    ((0.666, 0.00, 1.00, 0.36), (211, 215), "fit"),
        "h_tab_on":   ((0.00, 0.36, 0.333, 0.68), (227, 230), "fit"),
        "h_pedestal": ((0.333, 0.36, 0.666, 0.68), (234, 170), "fit"),
        "h_avatar":   ((0.666, 0.36, 1.00, 0.68), (206, 211), "stretch"),
        "h_capsule":  ((0.00, 0.68, 0.333, 1.00), (269, 116), "h"),
        "h_ribbon":   ((0.333, 0.68, 0.666, 1.00), (303, 100), "h"),
        "h_plaque":   ((0.666, 0.68, 1.00, 1.00), (268, 108), "h"),
    }),
    "wide": ("home_wide_v4.jpg", {
        "h_start":  ((0.0, 0.0, 1.0, 0.54), (698, 209), "h"),
        "h_tabbar": ((0.0, 0.54, 1.0, 1.0), (1185, 172), "h"),
    }),
}


def hd(name):
    src = RAW / name
    dst = RAW / (src.stem + "_x4.png")
    if not dst.exists():
        w, h = Image.open(src).size
        subprocess.run([sys.executable, str(ROOT / "tools/upscale.py"), str(src), str(dst), str(w * 4), str(h * 4)], check=True)
    return Image.open(dst).convert("RGB")


def key(img):
    a = np.asarray(img).astype(np.float32)
    edge = np.concatenate([a[:8].reshape(-1, 3), a[-8:].reshape(-1, 3), a[:, :8].reshape(-1, 3), a[:, -8:].reshape(-1, 3)])
    bg = np.median(edge, axis=0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    alpha = np.clip((d - 22) / 28, 0, 1)
    k = np.maximum(alpha, 1e-3)[..., None]
    rgb = np.clip((a - (1 - k) * bg) / k, 0, 255)
    return rgb, alpha


def piece(rgb, alpha, box):
    h, w = alpha.shape
    x0, y0, x1, y1 = int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h)
    m = alpha[y0:y1, x0:x1] > 0.5
    lab, n = ndimage.label(m)
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > sizes.max() * 0.02])
    keep = ndimage.binary_dilation(keep, iterations=6)
    ys, xs = np.nonzero(keep)
    by0, by1, bx0, bx1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    a = alpha[y0:y1, x0:x1] * keep
    out = np.dstack([rgb[y0:y1, x0:x1], a * 255])[by0:by1, bx0:bx1]
    return Image.fromarray(out.astype(np.uint8))


def fit(im, size, mode):
    W, H = size
    if mode == "stretch":
        return im.resize(size, Image.LANCZOS)
    if mode == "fit":
        s = min(W / im.width, H / im.height)
        r = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        c = Image.new("RGBA", size, (0, 0, 0, 0))
        c.paste(r, ((W - r.width) // 2, (H - r.height) // 2))
        return c
    w = max(1, round(im.width * H / im.height))
    r = im.resize((w, H), Image.LANCZOS)
    if w == W:
        return r
    end = min(w, W) * 0.36
    e = int(end)
    c = Image.new("RGBA", size, (0, 0, 0, 0))
    c.paste(r.crop((0, 0, e, H)), (0, 0))
    c.paste(r.crop((w - e, 0, w, H)), (W - e, 0))
    mid = r.crop((e, 0, w - e, H)).resize((W - 2 * e, H), Image.LANCZOS)
    c.paste(mid, (e, 0))
    return c


def main():
    which = sys.argv[1:] or list(SHEETS)
    FINAL.mkdir(parents=True, exist_ok=True)
    for k in which:
        sheet, parts = SHEETS[k]
        rgb, alpha = key(hd(sheet))
        for name, (box, size, mode) in parts.items():
            im = fit(piece(rgb, alpha, box), size, mode)
            im.save(FINAL / f"{name}.png")
            im.save(OUT / f"{name}.png", optimize=True)
            print(f"{name:12s} {size[0]}x{size[1]} {mode}")


if __name__ == "__main__":
    main()
