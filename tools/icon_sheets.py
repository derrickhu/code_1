"""把白底图标网格切成单个透明 PNG，并把局外场景图缩放后放进 Resources/Art。

用法：python3 tools/icon_sheets.py <原图目录>
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from anim_frames import ART, cutout  # noqa: E402

GRIDS = {
    "items_sheet.jpg": (3, 3, [None, "ic_shard", "ic_iron", "ic_wine", "ic_chest_wood", "ic_chest_silver",
                               "ic_chest_gold", "ic_book", "ic_medal"]),
    "equip_sheet.jpg": (3, 2, ["eq_weapon", "eq_helmet", "eq_armor", "eq_boots", "eq_amulet", "eq_horn"]),
    "tabs_sheet.jpg": (3, 3, ["tab_shop", "tab_hero", "tab_battle", "tab_fort", "tab_forge", "tab_task",
                              "tab_gift", "tab_idle", "tab_codex"]),
    "token_icon.jpg": (1, 1, ["ic_token"]),
}
# 场景图：(输出名, 长边像素)。
SCENES = {
    "map_fort.jpg": ("map_fort", 1920),
    "forge_scene.jpg": ("forge_scene", 1080),
    "recruit_banner.jpg": ("recruit_banner", 1080),
}


def save_icon(rgba, name, size=256):
    a = rgba[..., 3] > 30
    lab, n = ndimage.label(a)
    if n == 0:
        print("空格子", name)
        return
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    keep = np.isin(lab, [i + 1 for i in range(n) if sizes[i] >= max(80, sizes.max() * 0.02)])
    ys, xs = np.where(keep)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop = rgba[y0:y1, x0:x1].copy()
    crop[..., 3] = np.where(keep[y0:y1, x0:x1], crop[..., 3], 0)
    h, w = crop.shape[:2]
    side = int(max(h, w) * 1.06)
    canvas = np.zeros((side, side, 4), np.uint8)
    oy, ox = (side - h) // 2, (side - w) // 2
    canvas[oy:oy + h, ox:ox + w] = crop
    Image.fromarray(canvas).resize((size, size), Image.LANCZOS).save(os.path.join(ART, name + ".png"))
    print("icon", name)


def main(src):
    for f, (cols, rows, names) in GRIDS.items():
        img = Image.open(os.path.join(src, f))
        rgba = cutout(img)
        h, w = rgba.shape[:2]
        for r in range(rows):
            for c in range(cols):
                name = names[r * cols + c]
                if not name:
                    continue
                cell = rgba[r * h // rows:(r + 1) * h // rows, c * w // cols:(c + 1) * w // cols]
                save_icon(cell, name)
    for f, (name, side) in SCENES.items():
        img = Image.open(os.path.join(src, f)).convert("RGB")
        k = side / max(img.size)
        img.resize((round(img.size[0] * k), round(img.size[1] * k)), Image.LANCZOS).save(
            os.path.join(ART, name + ".jpg"), quality=90)
        print("scene", name, img.size)


if __name__ == "__main__":
    main(sys.argv[1])
