from pathlib import Path
from PIL import Image
import tempfile
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from check_portrait_qc import inspect


def _save(im: Image.Image, name: str) -> Path:
    p = Path(tempfile.gettempdir()) / name
    im.save(p)
    return p


def test_clean_passes():
    im = Image.new("RGBA", (200, 260), (0, 0, 0, 0))
    for x in range(40, 160):
        for y in range(40, 220):
            im.putpixel((x, y), (200, 80, 40, 255))
    assert inspect(_save(im, "qc_clean.png")) == []


def test_clip_and_leak():
    im = Image.new("RGBA", (200, 260), (0, 0, 0, 0))
    for x in range(0, 80):
        for y in range(40, 200):
            im.putpixel((x, y), (200, 80, 40, 255))
    for x in range(170, 200):
        for y in range(230, 260):
            im.putpixel((x, y), (80, 80, 80, 255))
    fails = inspect(_save(im, "qc_clip_leak.png"))
    assert "CLIP" in fails
    assert any(f.startswith("LEAK") for f in fails)


if __name__ == "__main__":
    test_clean_passes()
    test_clip_and_leak()
    print("qc tests ok")
