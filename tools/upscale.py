#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成图只有 720 像素级，直接放大到 1080x1920 线条发虚。
先用 Real-ESRGAN 动漫模型放大 4 倍，再按目标尺寸缩回去，描边和瓦片都是硬边。

用法：python3 tools/upscale.py 输入 输出 [宽 高]
  不给宽高就输出 2 倍尺寸。输出后缀决定格式（.jpg 质量 95 / .png 保留透明）。

依赖：~/.cache/realesrgan/realesrgan-ncnn-vulkan（xinntao/Real-ESRGAN v0.2.5.0 macOS 包）。
透明图先把 RGB 和 Alpha 拆开各放大一次，再合回去。
"""

import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

BIN = Path.home() / ".cache/realesrgan/realesrgan-ncnn-vulkan"
MODEL = "realesrgan-x4plus-anime"


def esrgan(src: Image.Image) -> Image.Image:
    if not BIN.exists():
        raise SystemExit(f"缺少 {BIN}，先下载 Real-ESRGAN ncnn macOS 包")
    with tempfile.TemporaryDirectory() as tmp:
        a, b = Path(tmp) / "in.png", Path(tmp) / "out.png"
        src.save(a)
        subprocess.run([str(BIN), "-i", str(a), "-o", str(b), "-n", MODEL, "-s", "4", "-m", str(BIN.parent / "models")],
                       check=True, cwd=BIN.parent, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return Image.open(b).convert("RGB")


def upscale(im: Image.Image, size=None) -> Image.Image:
    if size is None:
        size = (im.width * 2, im.height * 2)
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        im = im.convert("RGBA")
        rgb = esrgan(im.convert("RGB")).resize(size, Image.Resampling.LANCZOS)
        alpha = esrgan(im.getchannel("A").convert("RGB")).convert("L").resize(size, Image.Resampling.LANCZOS)
        rgb.putalpha(alpha)
        return rgb
    return esrgan(im.convert("RGB")).resize(size, Image.Resampling.LANCZOS)


def main():
    if len(sys.argv) not in (3, 5):
        raise SystemExit(__doc__)
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    size = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) == 5 else None
    out = upscale(Image.open(src), size)
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.suffix.lower() in (".jpg", ".jpeg"):
        out.convert("RGB").save(dst, "JPEG", quality=95, subsampling=0, optimize=True)
    else:
        out.save(dst, optimize=True)
    print(f"{src.name} → {dst}  {out.width}x{out.height}")


if __name__ == "__main__":
    main()
