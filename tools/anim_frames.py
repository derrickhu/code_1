"""把 1×4 角色动画帧图切成对齐好的单帧 PNG，并生成 AnimMeta.cs。

用法：python3 tools/anim_frames.py <原图目录>
原图命名 anim_<角色>.jpg，角色到资源名的映射见 TARGETS。
每个角色输出 <资源名>_0..3.png（同一方形画布，脚底贴底边、身体居中），<资源名>.png 为第 0 帧（立绘/图标用）。
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

TARGETS = {
    "soldier": "en_soldier", "shield": "en_shield", "cavalry": "en_cavalry", "crossbow": "en_crossbow",
    "elite": "en_elite", "porter": "en_porter", "boss": "en_boss",
    "huarong": "hero_huarong", "lingzhen": "hero_lingzhen", "gongsun": "hero_gongsun", "wusong": "hero_wusong",
    "linchong": "hero_linchong", "luzhishen": "hero_luzhishen", "zhangqing": "hero_zhangqing", "wuyong": "hero_wuyong",
    "hawk": "en_hawk", "armored": "en_armored", "firebomb": "en_firebomb", "chainhorse": "en_chainhorse",
    "luan": "en_luan", "shiwengong": "en_shiwen", "huyan": "en_huyan", "gaoqiu": "en_gaoqiu",
}
# 第二批 24 位好汉：帧画布 384（战场上只占 150 像素左右，省包体）。
SMALL = [
    "lujunyi", "guansheng", "yanqing", "fanrui", "husanniang", "andaoquan", "daizong", "qinming",
    "likui", "qiaodaoqing", "zhuwu", "xuning", "shantinggui", "weidingguo",
    "shixiu", "xiezhen", "xiebao", "maling", "kongliang", "tanglong", "sunerniang", "ruanxiaoqi", "shiqian", "jiangjing",
]
for _k in SMALL:
    TARGETS[_k] = "hero_" + _k
for _k in ("diver", "farmer", "hound", "rattan", "taoist", "berserker", "catapult", "lantern", "scout", "brute",
           "hetao", "zhucf", "zengkui", "hantao", "liuml",
           "waterchief", "crossbowcapt", "goldeneagle", "ironpagoda", "highpriest", "giantbrute", "firecart"):
    TARGETS[_k] = "en_" + _k
BIG = {"en_boss", "en_luan", "en_shiwen", "en_huyan", "en_gaoqiu", "en_hetao", "en_zhucf", "en_zengkui", "en_hantao", "en_liuml"}
# 32 位乡亲第 0 帧「鞋底 → 标准头顶（含正常发髻/矮帽，不含高举长枪/大旗/长翎）」的校准像素高度。
# 解决长柄/高旗角色被缩成矮人、低蹲/无冠角色被放大成巨人的问题。
HERO_HUMAN_H = {
    "huarong": 229, "lingzhen": 286, "gongsun": 233, "wusong": 286,
    "zhangqing": 358, "linchong": 190, "luzhishen": 268, "wuyong": 271,
    "lujunyi": 262, "guansheng": 204, "yanqing": 426, "fanrui": 215,
    "husanniang": 245, "andaoquan": 146, "daizong": 236, "qinming": 225,
    "likui": 255, "qiaodaoqing": 245, "zhuwu": 265, "xuning": 135,
    "shantinggui": 246, "weidingguo": 248, "shixiu": 298, "xiezhen": 272,
    "xiebao": 256, "maling": 290, "kongliang": 231, "tanglong": 264,
    "sunerniang": 314, "ruanxiaoqi": 262, "shiqian": 214, "jiangjing": 277,
}
FRAMES = 4
ART = os.path.join(os.path.dirname(__file__), "..", "Assets", "Resources", "Art")
# 逐帧图走 CDN 图包（ArtPack），立绘留在首包 ART。
CDN_ART = os.path.join(os.path.dirname(__file__), "..", "Assets", "ArtCdn")
META = os.path.join(os.path.dirname(__file__), "..", "Assets", "Scripts", "Game", "AnimMeta.cs")


def cutout(img):
    """纯白底抠图：四边漫水 + 封闭白洞清理，外圈背景 100% 归零，仅对紧贴轮廓的 1px 抗锯齿环去白边。"""
    rgb = np.asarray(img.convert("RGB")).astype(np.float32)
    dark = 255.0 - rgb.min(axis=2)
    near_white = dark < 34
    lab, _ = ndimage.label(near_white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    # 弓弦、手臂围出来的封闭白底：面积大且几乎纯白（眼白这种小块保留）。
    n = lab.max()
    if n:
        areas = ndimage.sum(near_white, lab, range(1, n + 1))
        means = ndimage.mean(dark, lab, range(1, n + 1))
        holes = [i + 1 for i in range(n) if i + 1 not in border and areas[i] > 2800 and means[i] < 8]
        bg |= np.isin(lab, holes)
    # 背景像素彻底透明 (a=0)，仅对紧邻背景的 1px 前景轮廓边缘按暗度做干净去白混合，杜绝外圈白雾虚边
    edge = (~bg) & ndimage.binary_dilation(bg, iterations=1)
    a = np.where(bg, 0.0, np.where(edge, np.clip((dark - 24.0) / 56.0, 0.0, 1.0), 1.0))
    safe = np.maximum(a, 1e-3)[..., None]
    col = np.where(a[..., None] > 0, np.clip((rgb - (1.0 - a[..., None]) * 252.0) / safe, 0, 255), 0.0)
    out = np.dstack([col, np.round(a * 255.0)]).astype(np.uint8)
    return out


def split(rgba, is_hero=False):
    """在相邻两帧之间找最空的竖线切开（武器、马匹偶尔会碰到隔壁帧）。"""
    a = rgba[..., 3] > 40
    lab, n = ndimage.label(a)
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    min_sz = 180 if is_hero else 60
    keep = np.isin(lab, [i + 1 for i in range(n) if sizes[i] >= min_sz])
    w = a.shape[1]
    col = keep.sum(axis=0).astype(np.float32)
    cuts = [0]
    for i in range(1, FRAMES):
        c = int(w * i / FRAMES)
        lo, hi = c - int(w * 0.09), c + int(w * 0.09)
        cuts.append(lo + int(np.argmin(col[lo:hi])))
    cuts.append(w)
    groups = [np.zeros_like(a) for _ in range(FRAMES)]
    big = [s for s in sizes if s >= min_sz]
    typical = float(np.median(sorted(big)[-FRAMES:])) if big else 1.0
    for i in range(n):
        if sizes[i] < min_sz:
            continue
        ys, xs = np.where(lab == i + 1)
        if sizes[i] > typical * 1.5:
            for k in range(FRAMES):
                m = (xs >= cuts[k]) & (xs < cuts[k + 1])
                groups[k][ys[m], xs[m]] = True
        else:
            k = int(np.searchsorted(cuts, xs.mean(), side="right")) - 1
            groups[min(max(k, 0), FRAMES - 1)][ys, xs] = True
    return groups


def resize_rgba(img, tw, th):
    """预乘 Alpha 高质量缩放：避免透明区黑色 (0,0,0,0) 混入边缘产生灰黑毛边或半透明虚化。"""
    arr = np.asarray(img, dtype=np.float32)
    a = arr[..., 3:4] / 255.0
    pm = np.concatenate([arr[..., :3] * a, arr[..., 3:4]], axis=-1)
    pm_u8 = np.clip(np.round(pm), 0, 255).astype(np.uint8)
    rs = np.asarray(Image.fromarray(pm_u8).resize((tw, th), Image.LANCZOS), dtype=np.float32)
    ra = rs[..., 3:4]
    rgb = np.where(ra > 1.0, rs[..., :3] * (255.0 / np.maximum(ra, 1.0)), 0.0)
    ra_clean = np.where(ra < 4.0, 0.0, np.where(ra > 251.0, 255.0, ra))
    out = np.concatenate([np.clip(np.round(rgb), 0, 255), np.round(ra_clean)], axis=-1).astype(np.uint8)
    return Image.fromarray(out)


def body_anchor(mask, is_hero=False):
    ys, xs = np.where(mask)
    top, bot = ys.min(), ys.max()
    h = bot - top
    band = (ys > top + h * (0.52 if is_hero else 0.4)) & (ys < top + h * (0.92 if is_hero else 0.85))
    cx = float(np.median(xs[band])) if band.any() else float(np.median(xs))
    # 好汉收窄鞋底采样列（防两侧下垂枪尾/披风尖拉低脚底导致人物悬空）
    near = np.abs(xs - cx) < (38 if is_hero else h * 0.3)
    feet = float(np.percentile(ys[near], 99.8 if is_hero else 99.5)) if near.any() else float(bot)
    return cx, feet, top


def main(src_dir):
    meta = []
    for key, name in TARGETS.items():
        path = None
        for ext in (".jpg", ".png"):
            p = os.path.join(src_dir, f"anim_{key}{ext}")
            if os.path.exists(p):
                path = p
        if path is None:
            print("skip", key)
            continue
        is_hero = name.startswith("hero_")
        rgba = cutout(Image.open(path))
        groups = split(rgba, is_hero=is_hero)
        anchors = [body_anchor(g, is_hero=is_hero) for g in groups]
        # 方形画布：左右按身体中线对称，脚底贴底边，上方留够最高的帧。
        half_w = 0
        up = 0
        for g, (cx, feet, _) in zip(groups, anchors):
            ys, xs = np.where(g)
            half_w = max(half_w, cx - xs.min(), xs.max() - cx)
            up = max(up, feet - ys.min())
        down = 8 if is_hero else 6
        body_h = float(HERO_HUMAN_H[key]) if (is_hero and key in HERO_HUMAN_H) else float(anchors[0][1] - anchors[0][2])
        # 好汉优先统一按人体基准占画布 0.64 排布（极长枪/高举锤放不下时再自动外扩画布），保证帧画布内人物本身大小也高度一致。
        req_side = int(max(half_w * 2, up + down) * 1.10) + 8
        side = max(int(round(body_h / 0.64)), req_side) if is_hero else int(max(half_w * 2, up + down) * 1.12) + 8
        frames = []
        for i, (g, (cx, feet, _)) in enumerate(zip(groups, anchors)):
            canvas = np.zeros((side, side, 4), np.uint8)
            ys, xs = np.where(g)
            # 必须先对标量偏移取整再加整数像素坐标，严禁对 (xs + x.5) 逐像素 np.round（偶数舍入会导致隔列镂空半透明条纹！）
            dy = int(round(side - down - feet))
            dx = int(round(side / 2.0 - cx))
            ty = ys + dy
            tx = xs + dx
            ok = (ty >= 0) & (ty < side) & (tx >= 0) & (tx < side)
            canvas[ty[ok], tx[ok]] = rgba[ys[ok], xs[ok]]
            img = Image.fromarray(canvas)
            target = 768 if name in BIG else 512 if is_hero else 384 if key in SMALL else 512
            img = resize_rgba(img, target, target)
            img.save(os.path.join(CDN_ART, f"{name}_{i}.png"))
            frames.append(img)
        if is_hero:
            # 首包立绘输出到紧凑标准画布 410x410（靴底固定在 y=402，标准人体高 336px，超高大旗/长枪自动收进框内不裁边）
            pw, ph, p_foot, p_human = 410, 410, 8, 336.0
            g0 = groups[0]
            cx0, feet0, _ = anchors[0]
            ys0, xs0 = np.where(g0)
            y0, y1, x0, x1 = ys0.min(), ys0.max(), xs0.min(), xs0.max()
            sub0 = Image.fromarray(np.where(g0[..., None], rgba, 0)[y0:y1 + 1, x0:x1 + 1])
            sc0 = min(p_human / body_h, (ph - p_foot - 6) / max(1.0, feet0 - y0), (pw - 16) / max(1.0, sub0.width))
            sw, sh = max(1, int(round(sub0.width * sc0))), max(1, int(round(sub0.height * sc0)))
            sp0 = resize_rgba(sub0, sw, sh)
            p_canvas = Image.new("RGBA", (pw, ph), (0, 0, 0, 0))
            px = int(round((pw - sw) / 2))
            py = int(round(ph - p_foot - (feet0 - y0) * sc0))
            p_canvas.alpha_composite(sp0, (px, py))
            p_canvas.save(os.path.join(ART, f"{name}.png"))
        else:
            frames[0].crop(frames[0].getbbox()).save(os.path.join(ART, f"{name}.png"))
        leg_cx, leg_top = legs(np.asarray(frames[0])[..., 3], down / side, body_h / side)
        meta.append((name, body_h / side, down / side, leg_cx, leg_top))
        print(name, "legCx %.3f legTop %.3f" % (leg_cx, leg_top))
        print(name, "side", side, "bodyFrac %.3f" % (body_h / side))

    lines = [
        "// 由 tools/anim_frames.py 生成，勿手改。",
        "using System.Collections.Generic;",
        "",
        "namespace Liangshan",
        "{",
        "    public static class AnimMeta",
        "    {",
        "        /// <summary>",
        "        /// 角色画布中身体（第 0 帧脚底到头顶）占画布边长的比例、脚底离底边的比例、",
        "        /// 两腿分界线的 x（画布比例）、胯部高度（占身体高）。",
        "        /// </summary>",
        "        public static readonly Dictionary<string, (float Body, float Foot, float LegCx, float LegTop)> Info =",
        "            new Dictionary<string, (float, float, float, float)>",
        "        {",
    ]
    # 这次没给原图的角色沿用 AnimMeta.cs 里已有的数值。
    done = {m[0] for m in meta}
    if os.path.exists(META):
        old = []
        for ln in open(META, encoding="utf-8"):
            ln = ln.strip()
            if ln.startswith('["'):
                name = ln[2:ln.index('"', 2)]
                nums = [float(x.strip().rstrip("f")) for x in ln[ln.index("(") + 1:ln.index(")")].split(",")]
                if name not in done:
                    old.append((name, *nums))
        meta = old + meta
    for name, body, foot, leg_cx, leg_top in meta:
        lines.append(f'            ["{name}"] = ({body:.4f}f, {foot:.4f}f, {leg_cx:.4f}f, {leg_top:.4f}f),')
    lines += [
        "        };",
        "",
        f"        public const int Frames = {FRAMES};",
        "",
        "        /// <summary>走路序列帧的基准帧率，和展示台 code_2 的 fps 相同。实际播放按移动速度对步；比它慢的（首领、精英）取对步帧率和它的几何平均。</summary>",
        "        public const float WalkFps = 6f;",
        "",
        "        /// <summary>再快 8 张图就糊了。当前最快的火药兵按步幅大约 20 帧/秒，上限留在这之上。</summary>",
        "        public const float WalkFpsMax = 24f;",
        "    }",
        "}",
        "",
    ]
    with open(META, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def legs(alpha, foot, body):
    """站立帧里找两腿之间的缝：从脚底往上逐行，在中间一段找左右都有腿、中间透明的缺口。"""
    n = alpha.shape[0]
    solid = alpha > 60
    base = n - 1 - int(foot * n)
    top_px = int(body * n)
    centers, crotch = [], 0
    # 身体按躯干居中在画布中线上，两腿的缝只会在中线附近、身体下部三成以内。
    mid0, mid1 = int(n * 0.38), int(n * 0.62)
    for dy in range(2, int(top_px * 0.3)):
        row = solid[base - dy, mid0:mid1]
        gap = np.where(~row)[0]
        if len(gap) >= 2 and row[: gap.min()].any() and row[gap.max():].any() and gap.max() - gap.min() < (mid1 - mid0) * 0.5:
            centers.append(mid0 + gap.mean())
            crotch = dy
    if len(centers) < 3:
        return 0.5, 0.22
    leg_top = min(0.32, max(0.16, crotch / top_px + 0.05))
    return float(np.median(centers)) / n, leg_top


if __name__ == "__main__":
    main(sys.argv[1])
