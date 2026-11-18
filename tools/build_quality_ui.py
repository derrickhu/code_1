#!/usr/bin/env python3
"""
Generate 4x-supersampled unified quality frames & top-tier UI containers for code_2:
  - card_{grey,blue,purple,orange,red,lock}.png   (240x288, 9-slice 52,52,52,52)
  - slot_{grey,blue,purple,orange,red,wood}.png   (176x176, 9-slice 44,44,44,44)
  - eqcard_{grey,blue,purple,orange,red}.png      (200x172, 9-slice 44,48,44,44)
  - dark.png                                      (256x256, 9-slice 48,48,48,48)
  - panel.png                                     (520x640, 9-slice 56,56,56,56)
  - row.png                                       (320x120, 9-slice 32,32,32,32)
  - power_crest.png                               (392x92,  9-slice 96,0,96,0)
  - tag_red.png                                   (156x60)

Escalating visual prestige across Unified Quality Tiers:
  Tier 0 (grey   普通): Clean forged silver-steel bevel frame
  Tier 1 (blue   稀有/精良): Chamfered sapphire-ice frame + corner silver studs + crystal sheen
  Tier 2 (purple 史诗): Double-rimmed royal amethyst & platinum frame + 4 faceted star-diamond clasps + 8-ray starlight
  Tier 3 (orange 传说): Heavy sculpted Imperial Gold frame + 4 3D golden wing-cloud corner crests with amber gems + top/bottom crown clasps + 12-ray sunburst
  Tier 4 (red    绝世): Blazing Crimson & Imperial Gold bi-metallic sovereign frame + 4 golden flame crests with ruby gems + 16-ray divine burst
"""

import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "Assets/Resources/Art/ui")
os.makedirs(OUT_DIR, exist_ok=True)


def hex_rgb(h: str) -> np.ndarray:
    h = h.lstrip("#")
    return np.array([int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)], dtype=np.float32)


def hex_rgba(h: str, a: int = 255) -> tuple:
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


def sd_rrect(x: np.ndarray, y: np.ndarray, cx: float, cy: float, hw: float, hh: float, r: float) -> np.ndarray:
    qx = np.abs(x - cx) - (hw - r)
    qy = np.abs(y - cy) - (hh - r)
    return np.hypot(np.maximum(qx, 0.0), np.maximum(qy, 0.0)) + np.minimum(np.maximum(qx, qy), 0.0) - r


def aa_cov(sd: np.ndarray, w: float = 1.15) -> np.ndarray:
    return np.clip(0.5 - sd / w, 0.0, 1.0)


def over(dst: np.ndarray, rgb: np.ndarray, alpha: np.ndarray) -> np.ndarray:
    """Alpha-over compositing on float32 RGBA canvas [H,W,4] in 0..255, alpha in 0..1."""
    a = alpha[..., None]
    out_a = a + dst[..., 3:4] / 255.0 * (1.0 - a)
    safe = np.maximum(out_a, 1e-6)
    out_rgb = (rgb * a + dst[..., :3] * (dst[..., 3:4] / 255.0) * (1.0 - a)) / safe
    res = np.empty_like(dst)
    res[..., :3] = np.where(out_a > 1e-5, out_rgb, 0.0)
    res[..., 3:4] = out_a * 255.0
    return res


def pil_over(canvas: np.ndarray, overlay_img: Image.Image) -> np.ndarray:
    ov = np.asarray(overlay_img, dtype=np.float32)
    return over(canvas, ov[..., :3], ov[..., 3] / 255.0)


# Canonical 5-Tier + Lock + Wood Theme Definitions
THEMES = {
    "grey": {
        "tier": 0,
        "ink": "1C2733",
        "rim_hi": "DAE4EE",
        "rim_mid": "8FA0B2",
        "rim_lo": "546476",
        "rim2_hi": "B8C6D4",
        "rim2_lo": "667688",
        "bg_top": "7C8EA2",
        "bg_mid": "92A4B8",
        "bg_bot": "647588",
        "glow": "DCE8F5",
        "accent": "E8F0F8",
        "gem_hi": "F2F7FC",
        "gem_mid": "9EB2C6",
        "gem_lo": "4D5E70",
        "rays": 0,
    },
    "blue": {
        "tier": 1,
        "ink": "112A48",
        "rim_hi": "BDF0FF",
        "rim_mid": "459FF0",
        "rim_lo": "1C5EA6",
        "rim2_hi": "E4F8FF",
        "rim2_lo": "2B76C8",
        "bg_top": "4C9AE6",
        "bg_mid": "82C8FA",
        "bg_bot": "387EC9",
        "glow": "DDF5FF",
        "accent": "CCF2FF",
        "gem_hi": "FFFFFF",
        "gem_mid": "45B6FF",
        "gem_lo": "14569C",
        "rays": 6,
    },
    "purple": {
        "tier": 2,
        "ink": "221144",
        "rim_hi": "F5E2FF",
        "rim_mid": "9B64EE",
        "rim_lo": "4F259C",
        "rim2_hi": "F8ECFF",
        "rim2_lo": "7842CC",
        "bg_top": "8458D8",
        "bg_mid": "BA9CF6",
        "bg_bot": "673CB8",
        "glow": "F3E4FF",
        "accent": "E8C8FF",
        "gem_hi": "FFFFFF",
        "gem_mid": "C87CFF",
        "gem_lo": "581EA8",
        "rays": 8,
    },
    "orange": {
        "tier": 3,
        "ink": "3D2105",
        "rim_hi": "FFF9CE",
        "rim_mid": "F8BD36",
        "rim_lo": "AD6508",
        "rim2_hi": "FFFDF0",
        "rim2_lo": "D88912",
        "bg_top": "E4A429",
        "bg_mid": "FBE088",
        "bg_bot": "C98216",
        "glow": "FFF9D6",
        "accent": "FFF2A6",
        "gem_hi": "FFFFF0",
        "gem_mid": "FF6A2B",
        "gem_lo": "9E2408",
        "rays": 12,
    },
    "red": {
        "tier": 4,
        "ink": "3C0C08",
        "rim_hi": "FFF3B8",
        "rim_mid": "F2503C",
        "rim_lo": "941B14",
        "rim2_hi": "FFE896",
        "rim2_lo": "C98418",
        "bg_top": "D94030",
        "bg_mid": "FF8E72",
        "bg_bot": "A8221A",
        "glow": "FFE6D8",
        "accent": "FFE28A",
        "gem_hi": "FFFFE8",
        "gem_mid": "FFD038",
        "gem_lo": "B25A08",
        "rays": 16,
    },
    "lock": {
        "tier": -1,
        "ink": "121A22",
        "rim_hi": "6A7D90",
        "rim_mid": "465668",
        "rim_lo": "293542",
        "rim2_hi": "5A6C7E",
        "rim2_lo": "222D38",
        "bg_top": "2D3A48",
        "bg_mid": "3B4B5C",
        "bg_bot": "232E3A",
        "glow": "5A7086",
        "accent": "6A7D90",
        "gem_hi": "8FA2B4",
        "gem_mid": "526476",
        "gem_lo": "24303C",
        "rays": 0,
    },
    "wood": {
        "tier": 0,
        "ink": "2E1C0C",
        "rim_hi": "F6DCAC",
        "rim_mid": "C89658",
        "rim_lo": "784E22",
        "rim2_hi": "FFE8BE",
        "rim2_lo": "986834",
        "bg_top": "B4834A",
        "bg_mid": "D8AD74",
        "bg_bot": "8E602E",
        "glow": "FFF0CE",
        "accent": "F6DCAC",
        "gem_hi": "FFF6DC",
        "gem_mid": "DDA85C",
        "gem_lo": "6E441A",
        "rays": 0,
    },
}


def draw_corner_ornaments(W: int, H: int, pad: float, rad: float, th: dict, is_card: bool = True, bottom_inset: float = 0.0) -> Image.Image:
    """Draw 4x-resolution sculpted corner clasps / wings / gems based on tier."""
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    tier = th["tier"]
    if tier <= 0:
        if th is THEMES["wood"]:
            # Subtle brass corner rivets for wood slot
            s = W / 176.0
            off = pad + 9.0 * s
            for cx, cy in [(off, off), (W - off, off), (off, H - off), (W - off, H - off)]:
                r = 3.2 * s
                dr.ellipse([cx - r - 1.2, cy - r - 1.2, cx + r + 1.2, cy + r + 1.2], fill=hex_rgba(th["ink"], 190))
                dr.ellipse([cx - r, cy - r, cx + r, cy + r], fill=hex_rgba(th["rim_hi"], 245))
        return im

    s = min(W, H) / (240.0 if is_card else 180.0)
    ink = hex_rgba(th["ink"], 235)
    hi = hex_rgba(th["rim_hi"], 255)
    mid = hex_rgba(th["rim_mid"], 255)
    lo = hex_rgba(th["rim_lo"], 255)
    r2_hi = hex_rgba(th["rim2_hi"], 255)
    r2_lo = hex_rgba(th["rim2_lo"], 255)

    left, top = pad, pad
    right, bot = W - pad, H - pad

    if tier == 1:
        # Tier 1 (Blue): Clean chamfered silver-sapphire corner L-brackets + glowing ice rivets
        arm = 26.0 * s
        t_out = 5.2 * s
        inset = 3.5 * s
        for sx_sgn, sy_sgn in [(-1, -1), (1, -1), (-1, 1), (1, 1)]:
            cx = left + inset if sx_sgn < 0 else right - inset
            cy = top + inset if sy_sgn < 0 else bot - inset
            dx, dy = -sx_sgn, -sy_sgn
            # Small faceted corner stud
            pts_outer = [
                (cx + dx * 3 * s, cy + dy * 12 * s),
                (cx + dx * 12 * s, cy + dy * 3 * s),
                (cx + dx * 20 * s, cy + dy * 7 * s),
                (cx + dx * 13 * s, cy + dy * 13 * s),
                (cx + dx * 7 * s, cy + dy * 20 * s),
            ]
            dr.polygon(pts_outer, fill=hi, outline=ink)
            rx, ry = cx + dx * 10.5 * s, cy + dy * 10.5 * s
            rr = 3.2 * s
            dr.ellipse([rx - rr, ry - rr, rx + rr, ry + rr], fill=hex_rgba(th["gem_mid"], 255), outline=ink)
            dr.ellipse([rx - rr * 0.45, ry - rr * 0.45, rx + rr * 0.15, ry + rr * 0.15], fill=(255, 255, 255, 240))

    elif tier == 2:
        # Tier 2 (Purple): Bold Royal Amethyst & Platinum Star-Diamond Corner Clasps + Side Filigree
        p_ink = hex_rgba("1D0A3B", 248)
        for sx_sgn, sy_sgn in [(-1, -1), (1, -1), (-1, 1), (1, 1)]:
            cx = left + 8.0 * s if sx_sgn < 0 else right - 8.0 * s
            cy = top + 8.0 * s if sy_sgn < 0 else bot - 8.0 * s
            dx, dy = -sx_sgn, -sy_sgn
            # Bold swept filigree wing arms along top/side edges
            arm_p = 36.0 * s
            wing_sh = [
                (cx - dx * 3.0 * s, cy - dy * 3.0 * s),
                (cx + dx * (arm_p + 1.5 * s), cy - dy * 2.0 * s),
                (cx + dx * (arm_p - 5.5 * s), cy + dy * 6.5 * s),
                (cx + dx * 12.5 * s, cy + dy * 9.5 * s),
                (cx + dx * 9.5 * s, cy + dy * 12.5 * s),
                (cx + dx * 6.5 * s, cy + dy * (arm_p - 5.5 * s)),
                (cx - dx * 2.0 * s, cy + dy * (arm_p + 1.5 * s)),
            ]
            dr.polygon(wing_sh, fill=p_ink)
            wing = [
                (cx - dx * 1.8 * s, cy - dy * 1.8 * s),
                (cx + dx * arm_p, cy - dy * 0.8 * s),
                (cx + dx * (arm_p - 6.5 * s), cy + dy * 5.2 * s),
                (cx + dx * 11.5 * s, cy + dy * 8.2 * s),
                (cx + dx * 8.2 * s, cy + dy * 11.5 * s),
                (cx + dx * 5.2 * s, cy + dy * (arm_p - 6.5 * s)),
                (cx - dx * 0.8 * s, cy + dy * arm_p),
            ]
            dr.polygon(wing, fill=mid)
            wing_in = [
                (cx + dx * 0.5 * s, cy + dy * 0.5 * s),
                (cx + dx * 28 * s, cy + dy * 0.8 * s),
                (cx + dx * 9.5 * s, cy + dy * 7.5 * s),
                (cx + dx * 7.5 * s, cy + dy * 9.5 * s),
                (cx + dx * 0.8 * s, cy + dy * 28 * s),
            ]
            dr.polygon(wing_in, fill=hi)
            # Bold 4-point faceted platinum-amethyst star at corner
            gx, gy = cx + dx * 6.5 * s, cy + dy * 6.5 * s
            R_sh, r_sh = 13.8 * s, 6.2 * s
            star_sh = [(gx + math.cos(k * math.pi / 4.0) * (R_sh if k % 2 == 0 else r_sh),
                        gy + math.sin(k * math.pi / 4.0) * (R_sh if k % 2 == 0 else r_sh)) for k in range(8)]
            dr.polygon(star_sh, fill=p_ink)
            R1, R2 = 12.2 * s, 5.2 * s
            star = [(gx + math.cos(k * math.pi / 4.0) * (R1 if k % 2 == 0 else R2),
                     gy + math.sin(k * math.pi / 4.0) * (R1 if k % 2 == 0 else R2)) for k in range(8)]
            dr.polygon(star, fill=r2_hi)
            # Inner glowing royal violet crystal diamond
            d_r = 6.0 * s
            dr.polygon([(gx, gy - d_r - 1.2 * s), (gx + d_r + 1.2 * s, gy), (gx, gy + d_r + 1.2 * s), (gx - d_r - 1.2 * s, gy)], fill=p_ink)
            dia = [(gx, gy - d_r), (gx + d_r, gy), (gx, gy + d_r), (gx - d_r, gy)]
            dr.polygon(dia, fill=hex_rgba("B858FF", 255))
            dr.ellipse([gx - 2.4 * s, gy - 2.8 * s, gx + 1.0 * s, gy + 0.6 * s], fill=(255, 255, 255, 250))

        # Top & bottom star-diamond clasps for Epic
        tcx, tcy = W * 0.5, top + 5.5 * s
        dr.polygon([(tcx - 15 * s, tcy), (tcx, tcy - 7.5 * s), (tcx + 15 * s, tcy), (tcx, tcy + 7.5 * s)], fill=p_ink)
        dr.polygon([(tcx - 13 * s, tcy), (tcx, tcy - 6.0 * s), (tcx + 13 * s, tcy), (tcx, tcy + 6.0 * s)], fill=hi)
        dr.polygon([(tcx - 6.8 * s, tcy), (tcx, tcy - 3.6 * s), (tcx + 6.8 * s, tcy), (tcx, tcy + 3.6 * s)], fill=hex_rgba("B858FF", 255))
        if bottom_inset <= 0.0:
            bcy = bot - 5.5 * s
            dr.polygon([(tcx - 13 * s, bcy), (tcx, bcy - 6.2 * s), (tcx + 13 * s, bcy), (tcx, bcy + 6.2 * s)], fill=p_ink)
            dr.polygon([(tcx - 11 * s, bcy), (tcx, bcy - 4.8 * s), (tcx + 11 * s, bcy), (tcx, bcy + 4.8 * s)], fill=hi)
            dr.polygon([(tcx - 5.5 * s, bcy), (tcx, bcy - 2.8 * s), (tcx + 5.5 * s, bcy), (tcx, bcy + 2.8 * s)], fill=hex_rgba("B858FF", 255))

    elif tier >= 3:
        # Tier 3 (Imperial Gold) & Tier 4 (Crimson-Gold Mythic):
        # Heavy 3D Sculpted Golden Cloud-Wing / Flame Corner Crests + Faceted Cabochon Gems + Royal Top Crown Clasp!
        gold_ink = hex_rgba("3A1D03" if tier == 3 else "380906", 252)
        gold_hi = hex_rgba("FFFBD6", 255)
        gold_mid = hex_rgba("F9BF32" if tier == 3 else "FAC238", 255)
        gold_lo = hex_rgba("B56A06", 255)

        for sx_sgn, sy_sgn in [(-1, -1), (1, -1), (-1, 1), (1, 1)]:
            cx = left + 7.2 * s if sx_sgn < 0 else right - 7.2 * s
            cy = top + 7.2 * s if sy_sgn < 0 else bot - 7.2 * s
            dx, dy = -sx_sgn, -sy_sgn

            arm_len = (44.0 if tier == 3 else 47.0) * s
            # Bold dark-bronze outer silhouette so the wing stands out sharply after 4x downsample
            wing_ink = [
                (cx - dx * 4.8 * s, cy - dy * 4.8 * s),
                (cx + dx * (arm_len + 1.8 * s), cy - dy * 3.6 * s),
                (cx + dx * (arm_len - 5.5 * s), cy + dy * 7.2 * s),
                (cx + dx * 25 * s, cy + dy * 7.2 * s),
                (cx + dx * 19.5 * s, cy + dy * 12.5 * s),
                (cx + dx * 12.5 * s, cy + dy * 19.5 * s),
                (cx + dx * 7.2 * s, cy + dy * 25 * s),
                (cx + dx * 7.2 * s, cy + dy * (arm_len - 5.5 * s)),
                (cx - dx * 3.6 * s, cy + dy * (arm_len + 1.8 * s)),
            ]
            dr.polygon(wing_ink, fill=gold_ink)

            wing_base = [
                (cx - dx * 3.2 * s, cy - dy * 3.2 * s),
                (cx + dx * arm_len, cy - dy * 2.0 * s),
                (cx + dx * (arm_len - 6.8 * s), cy + dy * 5.6 * s),
                (cx + dx * 23.5 * s, cy + dy * 5.6 * s),
                (cx + dx * 18 * s, cy + dy * 11 * s),
                (cx + dx * 11 * s, cy + dy * 18 * s),
                (cx + dx * 5.6 * s, cy + dy * 23.5 * s),
                (cx + dx * 5.6 * s, cy + dy * (arm_len - 6.8 * s)),
                (cx - dx * 2.0 * s, cy + dy * arm_len),
            ]
            dr.polygon(wing_base, fill=gold_lo)

            # Upper lit bevel face of golden wing
            wing_lit = [
                (cx - dx * 1.6 * s, cy - dy * 1.6 * s),
                (cx + dx * (arm_len - 2.5 * s), cy - dy * 0.6 * s),
                (cx + dx * (arm_len - 8.5 * s), cy + dy * 4.0 * s),
                (cx + dx * 15 * s, cy + dy * 4.5 * s),
                (cx + dx * 10 * s, cy + dy * 10 * s),
                (cx + dx * 4.5 * s, cy + dy * 15 * s),
                (cx + dx * 4.0 * s, cy + dy * (arm_len - 8.5 * s)),
                (cx - dx * 0.6 * s, cy + dy * (arm_len - 2.5 * s)),
            ]
            dr.polygon(wing_lit, fill=gold_mid)

            # Specular ridge highlight
            wing_spec = [
                (cx - dx * 0.5 * s, cy - dy * 0.5 * s),
                (cx + dx * 30 * s, cy + dy * 0.8 * s),
                (cx + dx * 8.5 * s, cy + dy * 8.5 * s),
                (cx + dx * 0.8 * s, cy + dy * 30 * s),
            ]
            dr.polygon(wing_spec, fill=gold_hi)

            # Secondary inner feather/flame spur
            spur_len = (26.0 if tier == 3 else 31.0) * s
            dr.polygon([
                (cx + dx * 1.5 * s, cy + dy * 1.5 * s),
                (cx + dx * (spur_len + 1.5 * s), cy + dy * 8.0 * s),
                (cx + dx * 13 * s, cy + dy * 13 * s),
                (cx + dx * 8.0 * s, cy + dy * (spur_len + 1.5 * s)),
            ], fill=gold_ink)
            dr.polygon([
                (cx + dx * 2.2 * s, cy + dy * 2.2 * s),
                (cx + dx * spur_len, cy + dy * 7.5 * s),
                (cx + dx * 12 * s, cy + dy * 12 * s),
                (cx + dx * 7.5 * s, cy + dy * spur_len),
            ], fill=gold_hi if tier == 3 else hex_rgba("FF6040", 255))

            # Corner Gem Bezel + Glowing Cabochon Jewel
            gx, gy = cx + dx * 6.5 * s, cy + dy * 6.5 * s
            br_ink = 10.4 * s
            dr.polygon([(gx, gy - br_ink), (gx + br_ink, gy), (gx, gy + br_ink), (gx - br_ink, gy)], fill=gold_ink)
            br = 8.8 * s
            dr.polygon([(gx, gy - br), (gx + br, gy), (gx, gy + br), (gx - br, gy)], fill=gold_hi)
            gr = 5.8 * s
            dr.polygon([(gx, gy - gr), (gx + gr, gy), (gx, gy + gr), (gx - gr, gy)], fill=hex_rgba(th["gem_mid"], 255))
            dr.ellipse([gx - 2.4 * s, gy - 2.8 * s, gx + 1.0 * s, gy + 0.5 * s], fill=hex_rgba(th["gem_hi"], 252))

        # Top-center Imperial Crown / Sunburst Clasp (bold dark-bronze silhouette + faceted gem)
        tcx, tcy = W * 0.5, top + 5.8 * s
        dr.polygon([
            (tcx - 19 * s, tcy),
            (tcx - 8.5 * s, tcy - 7.5 * s),
            (tcx, tcy - 10.2 * s),
            (tcx + 8.5 * s, tcy - 7.5 * s),
            (tcx + 19 * s, tcy),
            (tcx + 8.5 * s, tcy + 7.2 * s),
            (tcx, tcy + 9.5 * s),
            (tcx - 8.5 * s, tcy + 7.2 * s),
        ], fill=gold_ink)
        crown = [
            (tcx - 17 * s, tcy),
            (tcx - 7.5 * s, tcy - 6.2 * s),
            (tcx, tcy - 8.6 * s),
            (tcx + 7.5 * s, tcy - 6.2 * s),
            (tcx + 17 * s, tcy),
            (tcx + 7.5 * s, tcy + 5.8 * s),
            (tcx, tcy + 7.8 * s),
            (tcx - 7.5 * s, tcy + 5.8 * s),
        ]
        dr.polygon(crown, fill=gold_mid)
        dr.polygon([
            (tcx - 12.5 * s, tcy - 0.5 * s),
            (tcx, tcy - 6.4 * s),
            (tcx + 12.5 * s, tcy - 0.5 * s),
            (tcx, tcy + 4.4 * s),
        ], fill=gold_hi)
        cgr = 4.6 * s
        dr.polygon([(tcx, tcy - cgr), (tcx + cgr, tcy), (tcx, tcy + cgr), (tcx - cgr, tcy)], fill=hex_rgba(th["gem_mid"], 255))
        dr.ellipse([tcx - 1.6 * s, tcy - 2.0 * s, tcx + 0.8 * s, tcy + 0.5 * s], fill=(255, 255, 255, 250))

        if bottom_inset <= 0.0:
            bcy = bot - 5.8 * s
            dr.polygon([(tcx - 15.5 * s, bcy), (tcx, bcy - 7.4 * s), (tcx + 15.5 * s, bcy), (tcx, bcy + 7.4 * s)], fill=gold_ink)
            dr.polygon([(tcx - 13.5 * s, bcy), (tcx, bcy - 5.8 * s), (tcx + 13.5 * s, bcy), (tcx, bcy + 5.8 * s)], fill=gold_mid)
            dr.polygon([(tcx - 8.5 * s, bcy), (tcx, bcy - 3.6 * s), (tcx + 8.5 * s, bcy), (tcx, bcy + 3.6 * s)], fill=gold_hi)

    return im


def render_quality_box(
    w_out: int,
    h_out: int,
    theme_key: str,
    corner_r: float = 24.0,
    border_w: float = 8.5,
    pad_px: float = 4.0,
    is_card: bool = True,
    socket_dock_h: float = 0.0,
) -> Image.Image:
    """Render 4x-supersampled tiered card / slot / eqcard."""
    SS = 4
    W, H = w_out * SS, h_out * SS
    th = THEMES[theme_key]
    tier = th["tier"]

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W * 0.5, H * 0.5
    pad = pad_px * SS
    hw, hh = W * 0.5 - pad, H * 0.5 - pad
    rad = corner_r * SS
    bw = border_w * SS

    canvas = np.zeros((H, W, 4), dtype=np.float32)

    # 1. Crisp Subtle Drop Shadow
    sd_sh = sd_rrect(xx, yy, cx, cy + 2.5 * SS, hw + 0.5 * SS, hh + 0.5 * SS, rad + 1.0 * SS)
    sh_a = np.clip(0.5 - sd_sh / (3.8 * SS), 0.0, 1.0) * 0.34
    canvas = over(canvas, np.array([8.0, 14.0, 24.0], dtype=np.float32), sh_a)

    # 2. Outer Dark Ink Contour
    sd_outer = sd_rrect(xx, yy, cx, cy, hw, hh, rad)
    a_outer = aa_cov(sd_outer, 1.25)
    canvas = over(canvas, hex_rgb(th["ink"]), a_outer)

    # 3. Primary Metallic Bevel Frame (Top-lit specular -> Mid -> Bottom shadow + side sheen)
    ink_t = 2.1 * SS
    sd_metal = sd_outer + ink_t
    a_metal = aa_cov(sd_metal, 1.25)

    vy = np.clip((yy - (cy - hh)) / (2.0 * hh), 0.0, 1.0)
    vx = np.clip((xx - (cx - hw)) / (2.0 * hw), 0.0, 1.0)

    c_hi = hex_rgb(th["rim_hi"])
    c_mid = hex_rgb(th["rim_mid"])
    c_lo = hex_rgb(th["rim_lo"])

    # Rich metallic curve: bright top 28%, rich mid, deep bronze/indigo base + subtle bottom bounce
    t1 = np.clip(vy / 0.36, 0.0, 1.0)
    t2 = np.clip((vy - 0.36) / 0.52, 0.0, 1.0)
    metal_rgb = c_hi * (1.0 - t1)[..., None] + c_mid * t1[..., None]
    metal_rgb = metal_rgb * (1.0 - t2)[..., None] + c_lo * t2[..., None]
    # Diagonal specular band across metallic rim
    diag_rim = np.exp(-((vx * 0.8 + vy * 0.6 - 0.42) ** 2) / 0.018) * (0.28 if tier >= 1 else 0.14)
    metal_rgb = np.clip(metal_rgb + diag_rim[..., None] * 255.0 * 0.45, 0.0, 255.0)
    canvas = over(canvas, metal_rgb, a_metal)

    # For Tier >= 2 (Epic / Legendary / Mythic): Double-channeled inner metallic trim!
    if tier >= 2:
        groove_d = sd_outer + bw * 0.56
        a_groove = aa_cov(groove_d, 1.25)
        canvas = over(canvas, hex_rgb(th["ink"]) * 0.85 + hex_rgb(th["rim_lo"]) * 0.15, a_groove * 0.88)

        inner_rim_d = groove_d + 1.5 * SS
        a_irim = aa_cov(inner_rim_d, 1.25)
        c2_hi = hex_rgb(th["rim2_hi"])
        c2_lo = hex_rgb(th["rim2_lo"])
        irim_rgb = c2_hi * (1.0 - vy)[..., None] + c2_lo * vy[..., None]
        canvas = over(canvas, irim_rgb, a_irim)

    # 4. Inner Recessed Groove + Rich Quality Stage Interior
    sd_inner_sep = sd_outer + bw
    a_inner_sep = aa_cov(sd_inner_sep, 1.25)
    canvas = over(canvas, hex_rgb(th["ink"]), a_inner_sep * 0.82)

    sd_bg = sd_inner_sep + 1.7 * SS
    a_bg = aa_cov(sd_bg, 1.25)

    # Interior color field: vertical gradient + warm/cool center spotlight + sunburst rays + diagonal glass sheen
    bg_top = hex_rgb(th["bg_top"])
    bg_mid = hex_rgb(th["bg_mid"])
    bg_bot = hex_rgb(th["bg_bot"])
    glow_c = hex_rgb(th["glow"])

    stage_cy = cy - (socket_dock_h * 0.45 * SS if socket_dock_h > 0 else (H * 0.04 if is_card else 0.0))
    dx_n = (xx - cx) / max(hw, 1.0)
    dy_n = (yy - stage_cy) / max(hh, 1.0)
    rad_d = np.hypot(dx_n, dy_n * (0.88 if is_card else 1.0))

    # Base vertical gradient
    bg_rgb = bg_top * (1.0 - vy)[..., None] + bg_bot * vy[..., None]
    # Center luminous spotlight
    spot = np.clip(1.0 - rad_d * 0.88, 0.0, 1.0) ** 1.45
    bg_rgb = bg_rgb * (1.0 - spot * 0.72)[..., None] + bg_mid * (spot * 0.72)[..., None]

    # Sunburst / Starlight Rays for Tier >= 1 (Stronger & grander as tier rises!)
    n_rays = th["rays"]
    if n_rays > 0:
        ang = np.arctan2(dy_n, dx_n)
        ray_wave = 0.5 + 0.5 * np.cos(ang * n_rays)
        ray_sharp = (ray_wave ** (2.6 if tier >= 3 else 3.4))
        ray_fade = np.clip(1.0 - rad_d * 0.72, 0.0, 1.0) * np.clip(rad_d * 3.2, 0.0, 1.0)
        ray_str = {1: 0.07, 2: 0.14, 3: 0.24, 4: 0.28}.get(tier, 0.0)
        ray_amt = (ray_sharp * ray_fade * ray_str)[..., None]
        bg_rgb = bg_rgb * (1.0 - ray_amt) + glow_c * ray_amt

    # Diagonal crystal glass sheen (signature look of reference cards!)
    diag_u = (xx - cx) / (2.0 * hw) + (yy - cy) / (2.0 * hh)
    sheen1 = np.exp(-((diag_u + 0.16) ** 2) / 0.011) * (0.18 if tier >= 0 else 0.08)
    sheen2 = np.exp(-((diag_u - 0.05) ** 2) / 0.0025) * (0.11 if tier >= 0 else 0.05)
    sheen = np.clip(sheen1 + sheen2, 0.0, 0.35)[..., None]
    bg_rgb = bg_rgb * (1.0 - sheen) + glow_c * sheen

    # Subtle inner edge vignette + bottom stage grounding shadow (NO chalky white strip!)
    inner_edge = np.clip((sd_bg + 10.0 * SS) / (10.0 * SS), 0.0, 1.0)
    bg_rgb = bg_rgb * (1.0 - inner_edge * 0.18)[..., None]

    if is_card and tier >= 0:
        # Soft elliptical stage shadow where the hero stands + subtle lower vignette for progress bar / name contrast
        sh_ell = np.exp(-((dx_n / 0.58) ** 2 + ((dy_n - 0.36) / 0.13) ** 2)) * 0.18
        foot_grad = np.clip((vy - 0.72) / 0.28, 0.0, 1.0) ** 1.35 * 0.26
        dark_mul = np.clip(1.0 - sh_ell - foot_grad, 0.55, 1.0)[..., None]
        bg_rgb = bg_rgb * dark_mul

    # Floating stardust / golden motes for Epic (2), Legendary (3), Mythic (4)
    if tier >= 2:
        rng = np.random.default_rng(1000 + tier * 37 + (17 if is_card else 3))
        n_motes = 10 if tier == 2 else (18 if tier == 3 else 22)
        mote_field = np.zeros((H, W), dtype=np.float32)
        for _ in range(n_motes):
            mx = cx + rng.uniform(-0.74, 0.74) * hw
            my = cy + rng.uniform(-0.74, 0.52) * hh
            mr = rng.uniform(1.6, 3.6) * SS
            md = np.hypot(xx - mx, yy - my) / mr
            mote_field += np.exp(-(md ** 2)) * rng.uniform(0.28, 0.62)
        mote_a = np.clip(mote_field, 0.0, 0.68)[..., None]
        bg_rgb = bg_rgb * (1.0 - mote_a) + glow_c * mote_a

    # Crisp inner top highlight rim inside the card stage
    top_hl = aa_cov(np.abs(sd_bg + 1.2 * SS) - 0.9 * SS, 1.2) * np.clip(1.0 - vy * 2.2, 0.0, 1.0) * 0.55
    bg_rgb = np.clip(bg_rgb + top_hl[..., None] * 95.0, 0.0, 255.0)

    canvas = over(canvas, bg_rgb, a_bg)

    # 5. Optional Integrated Gem-Socket Dock at Bottom (for Equipment Cards `eqcard_*`)
    if socket_dock_h > 0:
        dock_top_y = (cy + hh) - (border_w + socket_dock_h) * SS
        in_dock = np.clip((yy - dock_top_y) / 1.4, 0.0, 1.0) * a_bg
        dock_vy = np.clip((yy - dock_top_y) / max(socket_dock_h * SS, 1.0), 0.0, 1.0)
        dock_top_c = hex_rgb("1B2A3A") if tier <= 2 else hex_rgb("261D14")
        dock_bot_c = hex_rgb("121D28") if tier <= 2 else hex_rgb("1A120B")
        dock_rgb = dock_top_c * (1.0 - dock_vy)[..., None] + dock_bot_c * dock_vy[..., None]
        canvas = over(canvas, dock_rgb, in_dock * 0.92)

        # Crisp metallic divider bar between upper icon stage and lower gem-socket tray
        bar_d = np.abs(yy - dock_top_y) - 1.35 * SS
        bar_a = aa_cov(bar_d, 1.2) * a_bg
        bar_rgb = hex_rgb(th["rim_hi"]) * 0.55 + hex_rgb(th["rim_mid"]) * 0.45
        canvas = over(canvas, bar_rgb, bar_a * 0.95)
        bar_sh = aa_cov(np.abs(yy - (dock_top_y + 2.2 * SS)) - 0.9 * SS, 1.2) * a_bg
        canvas = over(canvas, hex_rgb(th["ink"]), bar_sh * 0.65)

    # 6. Sculpted Corner Ornaments (4x resolution vector polygons + cabochon gems)
    orn = draw_corner_ornaments(W, H, pad, rad, th, is_card=is_card, bottom_inset=socket_dock_h)
    canvas = pil_over(canvas, orn)

    out = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
    return out.resize((w_out, h_out), Image.Resampling.LANCZOS)


def build_dark_drawer() -> Image.Image:
    """256x256 (9-slice 48,48,48,48) Deep Celadon-Navy Sculpted Roster Container (`ui/dark.png`)."""
    w_out, h_out, SS = 256, 256, 4
    W, H = w_out * SS, h_out * SS
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W * 0.5, H * 0.5
    pad = 3.0 * SS
    hw, hh = W * 0.5 - pad, H * 0.5 - pad
    rad = 28.0 * SS

    canvas = np.zeros((H, W, 4), dtype=np.float32)
    sd0 = sd_rrect(xx, yy, cx, cy, hw, hh, rad)
    # Outer deep ink contour
    canvas = over(canvas, hex_rgb("0D1A26"), aa_cov(sd0, 1.25))
    # Gilded champagne-teal outer rim (matches reference roster border!)
    vy = np.clip((yy - (cy - hh)) / (2.0 * hh), 0.0, 1.0)
    rim_c = hex_rgb("E8D396") * np.clip(1.0 - vy * 2.4, 0.0, 1.0)[..., None] + hex_rgb("4D7B96") * np.clip(vy * 2.4, 0.0, 1.0)[..., None]
    canvas = over(canvas, rim_c, aa_cov(sd0 + 2.0 * SS, 1.25))
    # Dark inner groove
    canvas = over(canvas, hex_rgb("122434"), aa_cov(sd0 + 5.2 * SS, 1.25))
    # Subtle cyan-slate inner hairline
    canvas = over(canvas, hex_rgb("3E6B88"), aa_cov(sd0 + 7.0 * SS, 1.25))
    # Rich deep slate-teal body (#27465B -> #1C3446)
    body_c = hex_rgb("2A4B62") * (1.0 - vy)[..., None] + hex_rgb("1B3345") * vy[..., None]
    canvas = over(canvas, body_c, aa_cov(sd0 + 8.6 * SS, 1.25))

    out = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
    return out.resize((w_out, h_out), Image.Resampling.LANCZOS)


def build_power_crest() -> Image.Image:
    """392x92 (9-slice 96,0,96,0) Sculpted Arched Combat Power Plaque (`ui/power_crest.png`) matching reference!"""
    w_out, h_out, SS = 392, 92, 4
    W, H = w_out * SS, h_out * SS
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)

    # Outer flared shield plaque polygon withchamfered royal wings
    def poly(inset: float):
        i = inset * SS
        return [
            (28 * SS + i * 0.9, H * 0.56),
            (66 * SS + i * 0.5, 10 * SS + i),
            (W - 66 * SS - i * 0.5, 10 * SS + i),
            (W - 28 * SS - i * 0.9, H * 0.56),
            (W - 58 * SS - i * 0.5, H - 10 * SS - i),
            (58 * SS + i * 0.5, H - 10 * SS - i),
        ]

    # Soft shadow
    sh_im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh_im).polygon([(x, y + 3 * SS) for x, y in poly(-1.0)], fill=(6, 14, 22, 120))
    sh_im = sh_im.filter(ImageFilter.GaussianBlur(3.0 * SS))
    im.alpha_composite(sh_im)

    dr.polygon(poly(0.0), fill=hex_rgba("122332", 255))
    dr.polygon(poly(2.2), fill=hex_rgba("7BA6C2", 255))
    dr.polygon(poly(5.0), fill=hex_rgba("1B3448", 255))
    dr.polygon(poly(7.2), fill=hex_rgba("315772", 255))
    dr.polygon(poly(9.0), fill=hex_rgba("23435A", 255))

    # Left & right subtle crown/wing gold studs
    for sx in [62 * SS, W - 62 * SS]:
        sy = H * 0.52
        r = 5.5 * SS
        dr.polygon([(sx, sy - r), (sx + r, sy), (sx, sy + r), (sx - r, sy)], fill=hex_rgba("FFE28A", 245), outline=hex_rgba("122332", 230))

    return im.resize((w_out, h_out), Image.Resampling.LANCZOS)


def build_panel_modal() -> Image.Image:
    """520x640 (9-slice 56,56,56,56) Sculpted Song-Porcelain & Gilt-Stone Modal Frame (`ui/panel.png`)."""
    w_out, h_out, SS = 520, 640, 2
    W, H = w_out * SS, h_out * SS
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W * 0.5, H * 0.5
    pad = 5.0 * SS
    hw, hh = W * 0.5 - pad, H * 0.5 - pad
    rad = 34.0 * SS

    canvas = np.zeros((H, W, 4), dtype=np.float32)
    sd_sh = sd_rrect(xx, yy, cx, cy + 4.0 * SS, hw + 1.0 * SS, hh + 1.0 * SS, rad + 2.0 * SS)
    canvas = over(canvas, np.array([10.0, 18.0, 28.0], dtype=np.float32), np.clip(0.5 - sd_sh / (5.0 * SS), 0.0, 1.0) * 0.30)

    sd0 = sd_rrect(xx, yy, cx, cy, hw, hh, rad)
    vy = np.clip((yy - (cy - hh)) / (2.0 * hh), 0.0, 1.0)

    # Outer dark bronze-slate contour
    canvas = over(canvas, hex_rgb("2B3744"), aa_cov(sd0, 1.2))
    # Warm gilt-jade outer bevel
    rim_c = hex_rgb("EDE4D2") * (1.0 - vy)[..., None] + hex_rgb("A69A84") * vy[..., None]
    canvas = over(canvas, rim_c, aa_cov(sd0 + 2.5 * SS, 1.2))
    # Crisp inner groove
    canvas = over(canvas, hex_rgb("B8AD98"), aa_cov(sd0 + 7.5 * SS, 1.2))
    # Pure warm Song-porcelain interior (#F7F4EC -> #EDE8DC)
    face_c = hex_rgb("FAF7F0") * (1.0 - vy)[..., None] + hex_rgb("EDE7DA") * vy[..., None]
    canvas = over(canvas, face_c, aa_cov(sd0 + 9.5 * SS, 1.2))
    # Subtle inner porcelain frame hairline
    hl_ring = aa_cov(np.abs(sd0 + 15.0 * SS) - 0.9 * SS, 1.2) * 0.45
    canvas = over(canvas, hex_rgb("D5CCB8"), hl_ring)

    out = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
    return out.resize((w_out, h_out), Image.Resampling.LANCZOS)


def build_row_card() -> Image.Image:
    """320x120 (9-slice 32,32,32,32) Crisp Sculpted Porcelain Row Card (`ui/row.png`)."""
    w_out, h_out, SS = 320, 120, 4
    W, H = w_out * SS, h_out * SS
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W * 0.5, H * 0.5
    pad = 2.5 * SS
    hw, hh = W * 0.5 - pad, H * 0.5 - pad
    rad = 22.0 * SS

    canvas = np.zeros((H, W, 4), dtype=np.float32)
    sd_sh = sd_rrect(xx, yy, cx, cy + 2.2 * SS, hw, hh, rad)
    canvas = over(canvas, np.array([20.0, 28.0, 38.0], dtype=np.float32), np.clip(0.5 - sd_sh / (2.8 * SS), 0.0, 1.0) * 0.16)

    sd0 = sd_rrect(xx, yy, cx, cy, hw, hh, rad)
    vy = np.clip((yy - (cy - hh)) / (2.0 * hh), 0.0, 1.0)

    # Crisp stone-gold outer rim
    rim_c = hex_rgb("CFC6B4") * (1.0 - vy)[..., None] + hex_rgb("ACA18C") * vy[..., None]
    canvas = over(canvas, rim_c, aa_cov(sd0, 1.2))
    # Pure highlight bevel
    canvas = over(canvas, hex_rgb("FFFFFF"), aa_cov(sd0 + 2.0 * SS, 1.2))
    # Clean warm ivory face (#FBF9F4 -> #F2EDE2)
    face_c = hex_rgb("FCFBF7") * (1.0 - vy)[..., None] + hex_rgb("F2EDE2") * vy[..., None]
    canvas = over(canvas, face_c, aa_cov(sd0 + 3.8 * SS, 1.2))

    out = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8))
    return out.resize((w_out, h_out), Image.Resampling.LANCZOS)


def build_tag_red() -> Image.Image:
    """156x60 Razor-sharp Crimson-Gold Swallowtail Ribbon (`ui/tag_red.png`) for '出战中'."""
    w_out, h_out, SS = 156, 60, 4
    W, H = w_out * SS, h_out * SS
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)

    def poly(inset: float = 0.0):
        i = inset * SS
        return [
            (6 * SS + i, 10 * SS + i),
            (W - 10 * SS - i * 1.2, 10 * SS + i),
            (W - 26 * SS - i * 0.8, H * 0.5),
            (W - 10 * SS - i * 1.2, H - 10 * SS - i),
            (6 * SS + i, H - 10 * SS - i),
        ]

    sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).polygon([(x, y + 2.5 * SS) for x, y in poly(-0.5)], fill=(20, 6, 6, 125))
    sh = sh.filter(ImageFilter.GaussianBlur(2.0 * SS))
    im.alpha_composite(sh)

    dr.polygon(poly(0.0), fill=hex_rgba("5C120E", 255))
    dr.polygon(poly(1.8), fill=hex_rgba("FFD984", 255))
    dr.polygon(poly(3.8), fill=hex_rgba("E84838", 255))
    # Glossy top half band
    top_band = [
        (10 * SS, 14 * SS),
        (W - 16 * SS, 14 * SS),
        (W - 26 * SS, H * 0.48),
        (10 * SS, H * 0.48),
    ]
    dr.polygon(top_band, fill=(255, 130, 110, 90))
    # Left gold mast bar
    dr.rectangle([6 * SS, 8 * SS, 12 * SS, H - 8 * SS], fill=hex_rgba("FFE28A", 255), outline=hex_rgba("5C120E", 240))

    return im.resize((w_out, h_out), Image.Resampling.LANCZOS)


def main():
    print("Generating unified quality cards (240x288)...")
    for k in ["grey", "blue", "purple", "orange", "red", "lock"]:
        im = render_quality_box(240, 288, k, corner_r=22.0, border_w=9.5 if THEMES[k]["tier"] >= 2 else 8.0, pad_px=4.0, is_card=True)
        im.save(os.path.join(OUT_DIR, f"card_{k}.png"))

    print("Generating unified quality slots (176x176)...")
    for k in ["grey", "blue", "purple", "orange", "red", "wood"]:
        im = render_quality_box(176, 176, k, corner_r=22.0, border_w=8.5 if THEMES[k]["tier"] >= 2 else 7.2, pad_px=3.5, is_card=False)
        im.save(os.path.join(OUT_DIR, f"slot_{k}.png"))

    print("Generating sculpted equipment cards with socket docks (200x172)...")
    for k in ["grey", "blue", "purple", "orange", "red"]:
        im = render_quality_box(200, 172, k, corner_r=20.0, border_w=8.0 if THEMES[k]["tier"] >= 2 else 6.8, pad_px=3.5, is_card=False, socket_dock_h=34.0)
        im.save(os.path.join(OUT_DIR, f"eqcard_{k}.png"))

    print("Generating upgraded container frames (dark, power_crest, panel, row, tag_red)...")
    build_dark_drawer().save(os.path.join(OUT_DIR, "dark.png"))
    build_power_crest().save(os.path.join(OUT_DIR, "power_crest.png"))
    build_panel_modal().save(os.path.join(OUT_DIR, "panel.png"))
    build_row_card().save(os.path.join(OUT_DIR, "row.png"))
    build_tag_red().save(os.path.join(OUT_DIR, "tag_red.png"))

    # Build a visual contact sheet in /tmp/c2_quality_sheet.jpg to inspect immediately!
    sheet = Image.new("RGB", (1620, 760), (26, 42, 58))
    for i, k in enumerate(["grey", "blue", "purple", "orange", "red", "lock"]):
        c_im = Image.open(os.path.join(OUT_DIR, f"card_{k}.png"))
        bg = Image.new("RGBA", c_im.size, (26, 42, 58, 255))
        bg.alpha_composite(c_im)
        sheet.paste(bg.convert("RGB"), (20 + i * 265, 24))

    for i, k in enumerate(["grey", "blue", "purple", "orange", "red", "wood"]):
        s_im = Image.open(os.path.join(OUT_DIR, f"slot_{k}.png"))
        bg = Image.new("RGBA", s_im.size, (242, 238, 229, 255))
        bg.alpha_composite(s_im)
        sheet.paste(bg.convert("RGB"), (36 + i * 265, 344))

    for i, k in enumerate(["grey", "blue", "purple", "orange", "red"]):
        e_im = Image.open(os.path.join(OUT_DIR, f"eqcard_{k}.png"))
        bg = Image.new("RGBA", e_im.size, (186, 214, 228, 255))
        bg.alpha_composite(e_im)
        sheet.paste(bg.convert("RGB"), (26 + i * 265, 556))

    pc = Image.open(os.path.join(OUT_DIR, "power_crest.png"))
    tr = Image.open(os.path.join(OUT_DIR, "tag_red.png"))
    bg_pc = Image.new("RGBA", pc.size, (26, 42, 58, 255))
    bg_pc.alpha_composite(pc)
    sheet.paste(bg_pc.resize((250, 58)).convert("RGB"), (1350, 566))
    bg_tr = Image.new("RGBA", tr.size, (26, 42, 58, 255))
    bg_tr.alpha_composite(tr)
    sheet.paste(bg_tr.convert("RGB"), (1360, 646))

    sheet.save("/tmp/c2_quality_sheet.jpg", quality=92)
    print("Done! Contact sheet saved to /tmp/c2_quality_sheet.jpg")


if __name__ == "__main__":
    main()
