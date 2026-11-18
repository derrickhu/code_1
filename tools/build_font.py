"""把思源黑体可变字体定成两个字重，再裁成游戏内实际用到的字（扫描 Assets/Scripts、Tests 与 BalanceConfig.json 里的非 ASCII 字符 + ASCII），输出到 Resources/Fonts。

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
SRC = pathlib.Path(_env_src) if _env_src else (ROOT.parent / "game_assets" / "code_2" / "fonts")
OUT = ROOT / "Assets" / "Resources" / "Fonts"
LICENSES = ROOT / "LICENSES"

# (输出名, 字重, 改名后的家族名)。OFL 字体改动后要换家族名。
FONTS = [
    ("Heavy.ttf", 750, "Cunkou Heavy"),
    ("Bold.ttf", 570, "Cunkou Bold"),
]

EXTRA = (
    "，。！？、：；「」『』（）【】《》—…·★☆◆◇▲▼◀▶↑↓←→♂♀"
    "×÷＋－±％‰✓!?"
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
)


def collect_chars() -> str:
    chars = set(chr(c) for c in range(0x20, 0x7F))
    chars.update(EXTRA)
    for folder in ("Scripts", "Tests"):
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


def rename(font: TTFont, family: str) -> None:
    ps = family.replace(" ", "")
    for rec in font["name"].names:
        if rec.nameID in (1, 4, 16, 21):
            rec.string = family
        elif rec.nameID in (3, 6, 20):
            rec.string = ps
        elif rec.nameID in (2, 17, 22):
            rec.string = "Regular"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    LICENSES.mkdir(exist_ok=True)
    text = collect_chars()
    for dst, weight, family in FONTS:
        vf = TTFont(SRC / "NotoSansSC-VF.ttf")
        font = instancer.instantiateVariableFont(vf, {"wght": weight})
        cmap = font.getBestCmap()
        missing = [c for c in text if ord(c) not in cmap and not c.isspace()]
        opts = subset.Options()
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        opts.name_languages = ["*"]
        opts.notdef_outline = True
        sub = subset.Subsetter(opts)
        sub.populate(text=text)
        sub.subset(font)
        rename(font, family)
        font.save(OUT / dst)
        size = (OUT / dst).stat().st_size // 1024
        print(f"{dst}: {len(text)} 字, {size} KB, 缺字 {''.join(missing) or '无'}")
    if (SRC / "OFL-NotoSansSC.txt").exists():
        shutil.copy(SRC / "OFL-NotoSansSC.txt", LICENSES / "OFL-NotoSansSC.txt")

    # 伤害数字用 Lilita One（若源目录未放则保留仓库内已裁好的 Number.ttf）；招式跳字优先用得意黑 SmileySans-Oblique
    brush_src = "SmileySans-Oblique.ttf" if (SRC / "SmileySans-Oblique.ttf").exists() else "MaShanZheng-Regular.ttf"
    brush_lic = "OFL-SmileySans.txt" if brush_src.startswith("Smiley") else "OFL-MaShanZheng.txt"
    extra_fonts = [
        ("LilitaOne-Regular.ttf", "Number.ttf", "Cunkou Number", "".join(chr(c) for c in range(0x20, 0x7F)) + "×", "OFL-LilitaOne.txt"),
        (brush_src, "Brush.ttf", "Cunkou Brush", "", brush_lic),
    ]
    for src, dst, family, chars, lic in extra_fonts:
        if not (SRC / src).exists():
            print(f"{dst}: 源字体 {src} 不在 {SRC}，保留现有 {OUT / dst}")
            continue
        font = TTFont(SRC / src)
        want = chars or text
        cmap = font.getBestCmap()
        missing = [c for c in want if ord(c) not in cmap and not c.isspace() and ord(c) > 0x7F]
        opts = subset.Options()
        opts.layout_features = ["*"]
        opts.name_IDs = ["*"]
        opts.name_languages = ["*"]
        opts.notdef_outline = True
        sub = subset.Subsetter(opts)
        sub.populate(text=want)
        sub.subset(font)
        rename(font, family)
        font.save(OUT / dst)
        size = (OUT / dst).stat().st_size // 1024
        print(f"{dst}: {len(want)} 字, {size} KB, 缺字 {len(missing)} 个（运行时回落到思源黑体）")
        if (SRC / lic).exists():
            shutil.copy(SRC / lic, LICENSES / lic)


if __name__ == "__main__":
    main()
