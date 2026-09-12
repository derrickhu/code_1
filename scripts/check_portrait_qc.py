#!/usr/bin/env python3
"""立绘质检 v3：贴边 / 碎块泄漏 / 太空 / 留白不够。"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image


EDGE = 8
LEAK_MIN = 80
EMPTY_MIN = 0.08
MARGIN = 16
ALPHA = 16
NEAR = 28


def _mask(im: Image.Image) -> Image.Image:
    return im.convert("RGBA").getchannel("A").point(lambda v: 255 if v >= ALPHA else 0)


def _components(mask: Image.Image) -> list[tuple[int, tuple[int, int, int, int]]]:
    w, h = mask.size
    pix = mask.load()
    seen = [[False] * w for _ in range(h)]
    out: list[tuple[int, tuple[int, int, int, int]]] = []
    for y in range(h):
        for x in range(w):
            if seen[y][x] or pix[x, y] == 0:
                continue
            n = 0
            x0 = x1 = x
            y0 = y1 = y
            stack = [(x, y)]
            seen[y][x] = True
            while stack:
                cx, cy = stack.pop()
                n += 1
                if cx < x0:
                    x0 = cx
                if cy < y0:
                    y0 = cy
                if cx > x1:
                    x1 = cx
                if cy > y1:
                    y1 = cy
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny][nx] and pix[nx, ny]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            out.append((n, (x0, y0, x1 + 1, y1 + 1)))
    return out


def _near(a: tuple[int, int, int, int], b: tuple[int, int, int, int], pad: int) -> bool:
    return not (a[2] + pad < b[0] or b[2] + pad < a[0] or a[3] + pad < b[1] or b[3] + pad < a[1])


def inspect(path: Path) -> list[str]:
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    mask = _mask(im)
    bb = mask.getbbox()
    fails: list[str] = []
    if not bb:
        return ["EMPTY"]
    x0, y0, x1, y1 = bb
    solid = sum(1 for v in mask.getdata() if v)
    if solid / (w * h) < EMPTY_MIN:
        fails.append("EMPTY")
    if x0 < MARGIN or y0 < MARGIN or (w - x1) < MARGIN or (h - y1) < MARGIN:
        fails.append("MARGIN")
    src = mask.load()
    for y in range(h):
        for x in range(w):
            if (x < EDGE or y < EDGE or x >= w - EDGE or y >= h - EDGE) and src[x, y]:
                fails.append("CLIP")
                break
        else:
            continue
        break
    comps = [c for c in _components(mask) if c[0] >= LEAK_MIN]
    if comps:
        comps.sort(key=lambda c: c[0], reverse=True)
        main = comps[0][1]
        stray = sum(1 for n, box in comps[1:] if not _near(main, box, NEAR))
        if stray:
            fails.append(f"LEAK:{stray}")
    return fails


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("input", help="file or directory of PNG portraits")
    p.add_argument("--glob", default="*_evo[123].png", help="when input is a dir")
    args = p.parse_args()
    root = Path(args.input)
    files = sorted(root.glob(args.glob)) if root.is_dir() else [root]
    bad = 0
    for f in files:
        fails = inspect(f)
        if fails:
            bad += 1
            print(f"FAIL {f.name} {' '.join(fails)}", flush=True)
        else:
            print(f"OK   {f.name}", flush=True)
    print(f"\n{len(files) - bad}/{len(files)} pass, {bad} fail", flush=True)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
