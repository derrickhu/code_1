"""把思源黑体可变字体固化为纯静态字重（彻底剥离 fvar/gvar/STAT/HVAR 等可变表与 OVERLAP_SIMPLE 标志），
再按游戏内实际用到的字符（扫描 Assets/Scripts、Tests、Editor 与 BalanceConfig.json）裁剪子集，输出到 Resources/Fonts。

用法：python3 tools/build_font.py
依赖：fontTools
"""
import os
import pathlib
import re
import shutil

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parent.parent
_env_src = os.environ.get("FONT_SRC")

VF_CANDIDATES = [
    *( [pathlib.Path(_env_src) / "NotoSansSC-VF.ttf", pathlib.Path(_env_src) / "NotoSansSC[wght].ttf"] if _env_src else [] ),
    ROOT.parent / "game_assets" / "code_2" / "fonts" / "NotoSansSC-VF.ttf",
    ROOT.parent / "game_assets" / "black-rosa" / "字体" / "NotoSansSC[wght].ttf",
]

BRUSH_CANDIDATES = [
    *( [pathlib.Path(_env_src) / "SmileySans-Oblique.ttf", pathlib.Path(_env_src) / "MaShanZheng-Regular.ttf"] if _env_src else [] ),
    ROOT.parent / "game_assets" / "code_2" / "fonts" / "SmileySans-Oblique.ttf",
    ROOT.parent / "game_assets" / "srpg-rosa" / "assets" / "fonts" / "archived" / "SmileySans-Oblique.ttf",
    ROOT.parent / "game_assets" / "code_2" / "fonts" / "MaShanZheng-Regular.ttf",
]

NUMBER_CANDIDATES = [
    *( [pathlib.Path(_env_src) / "LilitaOne-Regular.ttf"] if _env_src else [] ),
    ROOT.parent / "game_assets" / "code_2" / "fonts" / "LilitaOne-Regular.ttf",
]

OUT = ROOT / "Assets" / "Resources" / "Fonts"
LICENSES = ROOT / "LICENSES"

# 与 Assets/Resources/Fonts/*.ttf.meta 中的 fontNames 严格保持一致
FONTS = [
    ("Heavy.ttf", 750, "Liangshan Heavy"),
    ("Bold.ttf", 570, "Liangshan Bold"),
]

EXTRA = (
    "，。！？、：；「」『』（）【】《》—…·★☆◆◇▲▼◀▶↑↓←→♂♀"
    "×÷＋－±％‰✓!?•"
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
)

VAR_TABLES = ("fvar", "gvar", "cvar", "avar", "STAT", "HVAR", "VVAR", "MVAR")


def first_existing(cands):
    for p in cands:
        if p.exists():
            return p
    return None


def collect_chars() -> str:
    chars = set(chr(c) for c in range(0x20, 0x7F))
    chars.update(EXTRA)
    for folder in ("Scripts", "Tests", "Editor"):
        base = ROOT / "Assets" / folder
        if not base.exists():
            continue
        for p in base.rglob("*.cs"):
            for m in re.finditer(r"[^\x00-\x7F]", p.read_text(encoding="utf-8")):
                chars.add(m.group(0))
    bal = ROOT / "Assets" / "Resources" / "BalanceConfig.json"
    if bal.exists():
        for m in re.finditer(r"[^\x00-\x7F]", bal.read_text(encoding="utf-8")):
            chars.add(m.group(0))
    return "".join(sorted(chars))


def sanitize_static_ttf(font: TTFont) -> None:
    """剥离全部可变字体残留表与 OpenType 1.8 OVERLAP_SIMPLE (0x40) 轮廓标志，确保团结/Unity FreeType 100% 兼容。"""
    for tbl in VAR_TABLES:
        if tbl in font:
            del font[tbl]
    if "glyf" in font:
        glyf = font["glyf"]
        for gname in font.getGlyphOrder():
            g = glyf[gname]
            if g.numberOfContours > 0 and hasattr(g, "flags") and len(g.flags) > 0:
                for idx in range(len(g.flags)):
                    if g.flags[idx] & 0x40:
                        g.flags[idx] &= ~0x40


def rename(font: TTFont, family: str) -> None:
    ps = family.replace(" ", "")
    for rec in font["name"].names:
        if rec.nameID in (1, 4, 16, 21):
            rec.string = family
        elif rec.nameID in (3, 6, 20):
            rec.string = ps
        elif rec.nameID in (2, 17, 22):
            rec.string = "Regular"


def subset_and_save(font: TTFont, want: str, family: str, dst_path: pathlib.Path) -> tuple:
    cmap = font.getBestCmap()
    missing = [c for c in want if ord(c) not in cmap and not c.isspace() and ord(c) > 0x7F]
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.notdef_outline = True
    opts.drop_tables += list(VAR_TABLES)
    sub = subset.Subsetter(opts)
    sub.populate(text=want)
    sub.subset(font)
    sanitize_static_ttf(font)
    rename(font, family)
    font.save(dst_path)
    return dst_path.stat().st_size // 1024, missing


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    LICENSES.mkdir(exist_ok=True)
    vf_path = first_existing(VF_CANDIDATES)
    if vf_path is None:
        raise FileNotFoundError(f"未找到思源黑体可变字体: {VF_CANDIDATES}")
    text = collect_chars()

    for dst, weight, family in FONTS:
        vf = TTFont(vf_path)
        font = instancer.instantiateVariableFont(vf, {"wght": weight}, inplace=False)
        sanitize_static_ttf(font)
        kb, missing = subset_and_save(font, text, family, OUT / dst)
        print(f"{dst}: {len(text)} 字, {kb} KB, 缺字 {''.join(missing) or '无'}")

    ofl_src = vf_path.parent / "OFL-NotoSansSC.txt"
    if ofl_src.exists():
        shutil.copy(ofl_src, LICENSES / "OFL-NotoSansSC.txt")

    brush_path = first_existing(BRUSH_CANDIDATES)
    if brush_path is not None:
        bfont = TTFont(brush_path)
        kb, missing = subset_and_save(bfont, text, "Liangshan Brush", OUT / "Brush.ttf")
        print(f"Brush.ttf ({brush_path.name}): {len(text)} 字, {kb} KB, 缺字 {len(missing)} 个")

    num_path = first_existing(NUMBER_CANDIDATES)
    if num_path is not None:
        nfont = TTFont(num_path)
        want_num = "".join(chr(c) for c in range(0x20, 0x7F)) + "×"
        kb, _ = subset_and_save(nfont, want_num, "Liangshan Number", OUT / "Number.ttf")
        print(f"Number.ttf: {len(want_num)} 字, {kb} KB")
    else:
        print(f"Number.ttf: 保留现有 {OUT / 'Number.ttf'}")


if __name__ == "__main__":
    main()
