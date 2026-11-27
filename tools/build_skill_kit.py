"""好汉四技能体系专属高清美术图标与战场触发特效贴图生成器（4x 超采样，对标《永远的蔚蓝星球》）。

输出到 Assets/Resources/Art/：
  一、技能图标套件（160x160，六边形框内饱满通透、轮廓锐利、色彩分层鲜明）：
    sk_trait_crit.png     特性·鹰眸锋芒（青玉鎏金十字破阵锐芒，暴击/首目标必暴）
    sk_trait_exec.png     特性·斩将裂刃（寒钢裂甲弯刃 + 赤红斩杀寒芒，斩杀/猎禽/破马）
    sk_trait_elem.png     特性·玄灵双旋（赤青阴阳元素流火涡纹，灼烧/减速/雷链/易伤）
    sk_trait_tactic.png   特性·军师羽扇（青翠鎏金八卦羽扇徽，相邻加持/奇门/百搭/神算）

    sk_sig_merge.png      绝技·双星合璧（紫金双环交辉融星印，参与合成即刻触发）
    sk_sig_legion.png     绝技·聚义军阵（紫晶鎏金三枚并肩帅印星徽，同名人数/总星级共鸣）
    sk_sig_crown.png      绝技·魁首战冠（紫金天罡虎头王冠，最高星/登场爆发）
    sk_sig_bastion.png    绝技·怒战守城（紫焰镶金城垛战盾，城墙掉血反击/近身怒战）
    sk_sig_combo.png      绝技·三连破极（三道递进紫电鎏金飞刃，每第N击质变/破势）
    sk_sig_seal.png       绝技·追魂咒印（幽紫寒晶锁链破绽印，状态追伤/定身爆破）

    sk_aoyi_arrow.png     奥义·万矢裂空（煌金三矢齐发贯日纹章，射手专属奥义）
    sk_aoyi_blade.png     奥义·狂澜裂地（赤金双弧交错破阵斩纹，战士专属奥义）
    sk_aoyi_fire.png      奥义·焚天星陨（赤橙鎏金日冕火核爆纹，炮手专属奥义）
    sk_aoyi_spell.png     奥义·天罡法轮（苍青鎏金八芒太极法轮，法师专属奥义）
    sk_aoyi_bind.png      奥义·奇门天罗（霁蓝鎏金八卦锁阵罗盘，控制专属奥义）
    sk_aoyi_aid.png       奥义·八方聚义（暖金翡翠双翼帅印圣辉，辅助专属奥义）

  二、战场绝技/奥义触发特效贴图（256x256）：
    fx_sig_crest.png      绝技触发脚下/胸前瞬发紫金六芒阵冠纹（清晰描边，亮石板不发白）
    fx_aoyi_seal.png      奥义释放脚下煌金八角天罡战印（双环刻度 + 八芒锋刺）

用法：python3 tools/build_skill_kit.py
"""
import os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "Assets/Resources/Art")
SS = 4


def rgb(h: str) -> np.ndarray:
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32)


def mix(dst: np.ndarray, col: np.ndarray, m: np.ndarray) -> np.ndarray:
    m = np.clip(m, 0.0, 1.0)[:, :, None]
    return dst * (1.0 - m) + col[None, None, :] * m


def aa(sdf: np.ndarray, w: float = 1.4) -> np.ndarray:
    return np.clip(0.5 - sdf / max(1e-4, w * SS), 0.0, 1.0)


def ring_mask(sdf: np.ndarray, half_t: float, w: float = 1.3) -> np.ndarray:
    return aa(np.abs(sdf) - half_t * SS, w)


def grid(n: int = 160):
    w = h = n * SS
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    cx = cy = (w - 1) * 0.5
    ux = (x - cx) / (w * 0.5)
    uy = (y - cy) / (h * 0.5)
    r = np.hypot(ux, uy)
    ang = np.arctan2(uy, ux)
    return x, y, cx, cy, ux, uy, r, ang, n


def sdf_seg(ux, uy, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    l2 = vx * vx + vy * vy + 1e-6
    t = np.clip(((ux - ax) * vx + (uy - ay) * vy) / l2, 0.0, 1.0)
    return np.hypot(ux - (ax + t * vx), uy - (ay + t * vy))


def uaa(sdf_u: np.ndarray, n: int = 160, px: float = 1.4) -> np.ndarray:
    return np.clip(0.5 - sdf_u * (n * 0.5) / max(0.2, px), 0.0, 1.0)


def save_icon(col: np.ndarray, alpha: np.ndarray, name: str, n: int = 160):
    out = np.zeros(alpha.shape + (4,), dtype=np.uint8)
    out[:, :, :3] = np.clip(np.round(col), 0, 255).astype(np.uint8)
    out[:, :, 3] = np.clip(np.round(alpha * 255.0), 0, 255).astype(np.uint8)
    im = Image.fromarray(out).resize((n, n), Image.Resampling.LANCZOS)
    dst = os.path.join(OUT, name)
    im.save(dst, optimize=True)
    print(f"wrote {name} {im.size}")


def base_medallion(ux, uy, r, c_bg_top, c_bg_bot, c_rim_dark, c_rim_hi):
    """饱满圆章底衬（直径占画幅 88%，让六边形框内色彩浓厚不空洞）。"""
    disc = uaa(r - 0.84)
    halo = np.exp(-((np.maximum(0.0, r - 0.72) / 0.16) ** 2)) * 0.55
    grad = np.clip((uy + 0.85) / 1.7, 0.0, 1.0)
    col = c_bg_top[None, None, :] * (1.0 - grad[:, :, None]) + c_bg_bot[None, None, :] * grad[:, :, None]
    rim_out = uaa(np.abs(r - 0.82) - 0.032)
    rim_in = uaa(np.abs(r - 0.75) - 0.014)
    col = mix(col, c_rim_dark, rim_out)
    col = mix(col, c_rim_hi, rim_in * np.clip(0.75 - uy * 0.6, 0.15, 1.0))
    alpha = np.maximum(disc, halo)
    return col, alpha, disc


def emblem_stroke_and_fill(col, alpha, sdf_u, c_dark, c_mid, c_hi, uy, stroke_u=0.045):
    m_out = uaa(sdf_u - stroke_u)
    m_in = uaa(sdf_u)
    m_core = uaa(sdf_u + stroke_u * 0.65)
    shine = np.clip(0.65 - uy * 0.7, 0.0, 1.0)
    col = mix(col, c_dark, m_out)
    col = mix(col, c_mid, m_in)
    col = mix(col, c_hi, m_in * shine * 0.75 + m_core * 0.55)
    alpha = np.maximum(alpha, m_out)
    return col, alpha


# -------------------- 1. 特性图标（青翠鎏金系） --------------------

def build_traits():
    _, _, _, _, ux, uy, r, ang, n = grid(160)

    # 1) sk_trait_crit：鹰眸十字锐芒 + 中心琥珀瞄准星核
    col, alpha, _ = base_medallion(ux, uy, r, rgb("0E4A46"), rgb("072628"), rgb("062022"), rgb("5CF2D6"))
    d_ring = np.abs(r - 0.44) - 0.038
    d_star_h = np.abs(uy) + np.abs(ux) * 0.22 - 0.155
    d_star_v = np.abs(ux) + np.abs(uy) * 0.22 - 0.155
    d_star = np.minimum(np.maximum(d_star_h, np.abs(ux) - 0.68), np.maximum(d_star_v, np.abs(uy) - 0.68))
    d_diag = np.minimum(
        np.abs(ux - uy) * 0.707 + np.abs(ux + uy) * 0.16 - 0.095,
        np.abs(ux + uy) * 0.707 + np.abs(ux - uy) * 0.16 - 0.095,
    )
    d_diag = np.maximum(d_diag, r - 0.48)
    sdf = np.minimum.reduce([d_ring, d_star, d_diag])
    col, alpha = emblem_stroke_and_fill(col, alpha, sdf, rgb("062524"), rgb("42E8C4"), rgb("E8FFF8"), uy)
    col, alpha = emblem_stroke_and_fill(col, alpha, r - 0.14, rgb("4A2406"), rgb("FFB838"), rgb("FFF8D6"), uy, 0.035)
    save_icon(col, alpha, "sk_trait_crit.png")

    # 2) sk_trait_exec：斩将裂甲双刃（弯月寒刃 + 赤金破甲裂纹）
    col, alpha, _ = base_medallion(ux, uy, r, rgb("124648"), rgb("092228"), rgb("061B20"), rgb("64ECD8"))
    d_c1 = np.hypot(ux + 0.06, uy - 0.02) - 0.56
    d_c2 = np.hypot(ux - 0.18, uy + 0.10) - 0.52
    blade = np.maximum(d_c1, -d_c2)
    slash = sdf_seg(ux, uy, -0.48, 0.46, 0.48, -0.46) - 0.065
    col, alpha = emblem_stroke_and_fill(col, alpha, blade, rgb("072226"), rgb("56F0D2"), rgb("F2FFFC"), uy)
    col, alpha = emblem_stroke_and_fill(col, alpha, slash, rgb("4A1208"), rgb("FF6E3A"), rgb("FFF0B8"), uy, 0.04)
    save_icon(col, alpha, "sk_trait_exec.png")

    # 3) sk_trait_elem：玄灵双旋涡流（冰青与赤焰双鱼旋臂）
    col, alpha, _ = base_medallion(ux, uy, r, rgb("10444A"), rgb("072028"), rgb("051820"), rgb("6AF0E0"))
    swirl_a = ang + r * 3.6
    arm1 = np.abs(np.angle(np.exp(1j * swirl_a))) * np.maximum(0.18, r) - 0.12
    arm1 = np.maximum(arm1, np.maximum(r - 0.64, 0.10 - r))
    arm2 = np.abs(np.angle(np.exp(1j * (swirl_a + np.pi)))) * np.maximum(0.18, r) - 0.12
    arm2 = np.maximum(arm2, np.maximum(r - 0.64, 0.10 - r))
    col, alpha = emblem_stroke_and_fill(col, alpha, arm1, rgb("06242C"), rgb("44DFEE"), rgb("E8FFFF"), uy, 0.04)
    col, alpha = emblem_stroke_and_fill(col, alpha, arm2, rgb("4A1806"), rgb("FF8B34"), rgb("FFF2C2"), uy, 0.04)
    col, alpha = emblem_stroke_and_fill(col, alpha, r - 0.13, rgb("08282A"), rgb("FFE27A"), rgb("FFFFFF"), uy, 0.03)
    save_icon(col, alpha, "sk_trait_elem.png")

    # 4) sk_trait_tactic：军师羽扇八卦章（展开三羽扇面 + 金柄）
    col, alpha, _ = base_medallion(ux, uy, r, rgb("0F4C44"), rgb("082624"), rgb("051C1A"), rgb("68F4D0"))
    fan_r = np.hypot(ux, uy - 0.22)
    fan_a = np.arctan2(uy - 0.22, ux)
    in_sector = np.maximum(np.abs(fan_a + np.pi * 0.5) - 0.88, np.maximum(fan_r - 0.72, 0.14 - fan_r))
    scallop = fan_r - (0.68 + 0.045 * np.cos((fan_a + np.pi * 0.5) * 7.0))
    fan = np.maximum(in_sector, scallop)
    handle = sdf_seg(ux, uy, 0.0, 0.16, 0.0, 0.58) - 0.055
    col, alpha = emblem_stroke_and_fill(col, alpha, handle, rgb("3E2006"), rgb("E8A432"), rgb("FFF0A8"), uy, 0.035)
    col, alpha = emblem_stroke_and_fill(col, alpha, fan, rgb("072824"), rgb("54ECC8"), rgb("F2FFFA"), uy, 0.042)
    col, alpha = emblem_stroke_and_fill(col, alpha, np.hypot(ux, uy - 0.06) - 0.12, rgb("3E2006"), rgb("FFD24C"), rgb("FFFBE0"), uy, 0.03)
    save_icon(col, alpha, "sk_trait_tactic.png")


# -------------------- 2. 绝技图标（天罡紫金系 10 级质变） --------------------

def build_sigs():
    _, _, _, _, ux, uy, r, ang, n = grid(160)
    bg_t, bg_b, rim_d, rim_h = rgb("3B1C6E"), rgb("1A0B36"), rgb("14072A"), rgb("D49BFF")

    # 1) sk_sig_merge：双星合璧（左右双金环交融迸发中心四芒耀星）
    col, alpha, _ = base_medallion(ux, uy, r, bg_t, bg_b, rim_d, rim_h)
    r_left = np.abs(np.hypot(ux + 0.20, uy + 0.04) - 0.34) - 0.048
    r_right = np.abs(np.hypot(ux - 0.20, uy - 0.04) - 0.34) - 0.048
    star = np.minimum(
        np.maximum(np.abs(ux) + np.abs(uy) * 0.28 - 0.12, np.abs(uy) - 0.44),
        np.maximum(np.abs(uy) + np.abs(ux) * 0.28 - 0.12, np.abs(ux) - 0.44),
    )
    col, alpha = emblem_stroke_and_fill(col, alpha, np.minimum(r_left, r_right), rgb("220A42"), rgb("B978FF"), rgb("F6E8FF"), uy, 0.038)
    col, alpha = emblem_stroke_and_fill(col, alpha, star, rgb("462006"), rgb("FFD046"), rgb("FFFDF0"), uy, 0.038)
    save_icon(col, alpha, "sk_sig_merge.png")

    # 2) sk_sig_legion：聚义军阵（三枚品字并立天罡菱晶徽）
    col, alpha, _ = base_medallion(ux, uy, r, bg_t, bg_b, rim_d, rim_h)
    d_left = np.abs(ux + 0.32) * 1.25 + np.abs(uy - 0.08) * 0.95 - 0.28
    d_right = np.abs(ux - 0.32) * 1.25 + np.abs(uy - 0.08) * 0.95 - 0.28
    d_main = np.abs(ux) * 1.15 + np.abs(uy + 0.06) * 0.85 - 0.38
    col, alpha = emblem_stroke_and_fill(col, alpha, np.minimum(d_left, d_right), rgb("220A44"), rgb("AE6EFF"), rgb("F0DCFF"), uy, 0.038)
    col, alpha = emblem_stroke_and_fill(col, alpha, d_main, rgb("441E06"), rgb("FFC840"), rgb("FFFBE8"), uy, 0.044)
    save_icon(col, alpha, "sk_sig_legion.png")

    # 3) sk_sig_crown：魁首战冠（三尖黄金王者战冠 + 紫晶冠心）
    col, alpha, _ = base_medallion(ux, uy, r, bg_t, bg_b, rim_d, rim_h)
    base_box = np.maximum(np.abs(ux) - 0.48, np.abs(uy - 0.22) - 0.11)
    p_mid = np.maximum(np.abs(ux) * 1.5 + (uy + 0.02) * 0.55 - 0.26, np.maximum(uy - 0.20, -0.46 - uy))
    p_side = np.maximum((np.abs(ux) - 0.34) * 1.6 + (uy - 0.02) * 0.65 - 0.20, np.maximum(uy - 0.22, -0.34 - uy))
    crown = np.minimum.reduce([base_box, p_mid, p_side])
    col, alpha = emblem_stroke_and_fill(col, alpha, crown, rgb("421C06"), rgb("FFC83C"), rgb("FFFBE6"), uy, 0.045)
    gem = np.abs(ux) * 1.2 + np.abs(uy - 0.10) - 0.13
    col, alpha = emblem_stroke_and_fill(col, alpha, gem, rgb("240846"), rgb("D474FF"), rgb("FFF0FF"), uy, 0.028)
    save_icon(col, alpha, "sk_sig_crown.png")

    # 4) sk_sig_bastion：怒战守城（镶金紫晶战盾 + 破盾怒焰）
    col, alpha, _ = base_medallion(ux, uy, r, bg_t, bg_b, rim_d, rim_h)
    sh_w = 0.46 - 0.26 * np.clip((uy + 0.10) / 0.62, 0.0, 1.0) ** 1.5
    shield = np.maximum(np.abs(ux) - sh_w, np.maximum(uy - 0.52, -0.44 - uy))
    bolt = np.minimum(sdf_seg(ux, uy, 0.08, -0.32, -0.10, 0.02), sdf_seg(ux, uy, -0.10, 0.02, 0.10, 0.02))
    bolt = np.minimum(bolt, sdf_seg(ux, uy, 0.10, 0.02, -0.08, 0.36)) - 0.055
    col, alpha = emblem_stroke_and_fill(col, alpha, shield, rgb("220842"), rgb("9C5CFF"), rgb("EAD4FF"), uy, 0.048)
    col, alpha = emblem_stroke_and_fill(col, alpha, bolt, rgb("481A04"), rgb("FFD044"), rgb("FFFFF0"), uy, 0.034)
    save_icon(col, alpha, "sk_sig_bastion.png")

    # 5) sk_sig_combo：三连破极（三道由小到大破空鎏金紫电飞刃）
    col, alpha, _ = base_medallion(ux, uy, r, bg_t, bg_b, rim_d, rim_h)
    s1 = sdf_seg(ux, uy, -0.46, 0.16, -0.06, -0.24) - 0.048
    s2 = sdf_seg(ux, uy, -0.24, 0.30, 0.22, -0.16) - 0.058
    s3 = sdf_seg(ux, uy, -0.02, 0.44, 0.48, -0.06) - 0.072
    col, alpha = emblem_stroke_and_fill(col, alpha, np.minimum(s1, s2), rgb("240A46"), rgb("B874FF"), rgb("F4E4FF"), uy, 0.036)
    col, alpha = emblem_stroke_and_fill(col, alpha, s3, rgb("481E04"), rgb("FFCA3E"), rgb("FFFCE8"), uy, 0.042)
    save_icon(col, alpha, "sk_sig_combo.png")

    # 6) sk_sig_seal：追魂咒印（四向锁魂钩环 + 中央赤金破绽菱印）
    col, alpha, _ = base_medallion(ux, uy, r, bg_t, bg_b, rim_d, rim_h)
    outer_r = np.abs(r - 0.48) - 0.040
    spokes = np.minimum(
        np.maximum(np.abs(ux) - 0.048, np.abs(np.abs(uy) - 0.48) - 0.14),
        np.maximum(np.abs(uy) - 0.048, np.abs(np.abs(ux) - 0.48) - 0.14),
    )
    core_d = np.abs(ux) + np.abs(uy) - 0.26
    col, alpha = emblem_stroke_and_fill(col, alpha, np.minimum(outer_r, spokes), rgb("220844"), rgb("B26CFF"), rgb("F2E0FF"), uy, 0.036)
    col, alpha = emblem_stroke_and_fill(col, alpha, core_d, rgb("4A1608"), rgb("FF9E38"), rgb("FFF4C8"), uy, 0.040)
    save_icon(col, alpha, "sk_sig_seal.png")


# -------------------- 3. 奥义图标（煌金赤焰系 5 级终结技） --------------------

def build_aoyi():
    _, _, _, _, ux, uy, r, ang, n = grid(160)
    bg_t, bg_b, rim_d, rim_h = rgb("6E2E0A"), rgb("341204"), rgb("260B02"), rgb("FFE27A")

    # 1) sk_aoyi_arrow：万矢裂空（扇形三支煌金神箭齐射朝上）
    col, alpha, _ = base_medallion(ux, uy, r, bg_t, bg_b, rim_d, rim_h)
    s_mid = sdf_seg(ux, uy, 0.0, 0.48, 0.0, -0.46) - 0.052
    head_m = np.maximum(np.abs(ux) * 1.4 + (uy + 0.26) * 0.7 - 0.20, np.maximum(uy + 0.20, -0.58 - uy))
    s_l = sdf_seg(ux, uy, -0.14, 0.44, -0.42, -0.26) - 0.042
    s_r = sdf_seg(ux, uy, 0.14, 0.44, 0.42, -0.26) - 0.042
    col, alpha = emblem_stroke_and_fill(col, alpha, np.minimum(s_l, s_r), rgb("381404"), rgb("FFA432"), rgb("FFF0B8"), uy, 0.036)
    col, alpha = emblem_stroke_and_fill(col, alpha, np.minimum(s_mid, head_m), rgb("421804"), rgb("FFD84A"), rgb("FFFFF4"), uy, 0.044)
    save_icon(col, alpha, "sk_aoyi_arrow.png")

    # 2) sk_aoyi_blade：狂澜裂地（双道交叉霸气新月金刀罡）
    col, alpha, _ = base_medallion(ux, uy, r, bg_t, bg_b, rim_d, rim_h)
    c1 = np.maximum(np.hypot(ux + 0.06, uy + 0.04) - 0.58, -(np.hypot(ux - 0.14, uy - 0.14) - 0.54))
    c2 = np.maximum(np.hypot(ux - 0.06, uy + 0.04) - 0.58, -(np.hypot(ux + 0.14, uy - 0.14) - 0.54))
    col, alpha = emblem_stroke_and_fill(col, alpha, c2, rgb("3E1204"), rgb("FF8428"), rgb("FFEAB0"), uy, 0.038)
    col, alpha = emblem_stroke_and_fill(col, alpha, c1, rgb("461A04"), rgb("FFD648"), rgb("FFFFF2"), uy, 0.042)
    save_icon(col, alpha, "sk_aoyi_blade.png")

    # 3) sk_aoyi_fire：焚天星陨（八芒爆裂日冕 + 炽白熔岩核）
    col, alpha, _ = base_medallion(ux, uy, r, bg_t, bg_b, rim_d, rim_h)
    burst_r = 0.52 + 0.14 * np.cos(8.0 * ang)
    burst = r - burst_r
    col, alpha = emblem_stroke_and_fill(col, alpha, burst, rgb("421004"), rgb("FF7A22"), rgb("FFE48E"), uy, 0.044)
    col, alpha = emblem_stroke_and_fill(col, alpha, r - 0.25, rgb("4A1C04"), rgb("FFD84C"), rgb("FFFFFF"), uy, 0.036)
    save_icon(col, alpha, "sk_aoyi_fire.png")

    # 4) sk_aoyi_spell：天罡法轮（双环八芒星阵轮）
    col, alpha, _ = base_medallion(ux, uy, r, bg_t, bg_b, rim_d, rim_h)
    wheel = np.abs(r - 0.50) - 0.042
    rays = np.minimum(
        np.maximum(np.abs(ux) + np.abs(uy) * 0.20 - 0.11, np.abs(uy) - 0.64),
        np.maximum(np.abs(uy) + np.abs(ux) * 0.20 - 0.11, np.abs(ux) - 0.64),
    )
    col, alpha = emblem_stroke_and_fill(col, alpha, wheel, rgb("381404"), rgb("FF9E30"), rgb("FFF0B8"), uy, 0.036)
    col, alpha = emblem_stroke_and_fill(col, alpha, rays, rgb("441A04"), rgb("FFDA4E"), rgb("FFFFF4"), uy, 0.040)
    save_icon(col, alpha, "sk_aoyi_spell.png")

    # 5) sk_aoyi_bind：奇门天罗（交错双菱阵盘 + 中心锁印）
    col, alpha, _ = base_medallion(ux, uy, r, bg_t, bg_b, rim_d, rim_h)
    sq1 = np.abs(np.maximum(np.abs(ux), np.abs(uy)) - 0.40) - 0.040
    rx = (ux + uy) * 0.7071
    ry = (ux - uy) * 0.7071
    sq2 = np.abs(np.maximum(np.abs(rx), np.abs(ry)) - 0.40) - 0.040
    col, alpha = emblem_stroke_and_fill(col, alpha, sq2, rgb("381404"), rgb("FF982E"), rgb("FFEBB4"), uy, 0.034)
    col, alpha = emblem_stroke_and_fill(col, alpha, sq1, rgb("441A04"), rgb("FFD64A"), rgb("FFFFF0"), uy, 0.038)
    col, alpha = emblem_stroke_and_fill(col, alpha, np.abs(ux) + np.abs(uy) - 0.18, rgb("103848"), rgb("5CE8FF"), rgb("F2FFFF"), uy, 0.032)
    save_icon(col, alpha, "sk_aoyi_bind.png")

    # 6) sk_aoyi_aid：八方聚义（展翼金鹏圣徽 + 中心帅星）
    col, alpha, _ = base_medallion(ux, uy, r, bg_t, bg_b, rim_d, rim_h)
    ax = np.abs(ux)
    wing = np.maximum(np.abs(uy - (-0.08 + (ax - 0.25) * 0.45)) - (0.16 - ax * 0.14), np.maximum(ax - 0.66, 0.14 - ax))
    gem = ax * 1.15 + np.abs(uy) * 0.9 - 0.26
    col, alpha = emblem_stroke_and_fill(col, alpha, wing, rgb("3A1604"), rgb("FFA834"), rgb("FFF2BE"), uy, 0.040)
    col, alpha = emblem_stroke_and_fill(col, alpha, gem, rgb("461E04"), rgb("FFE056"), rgb("FFFFFF"), uy, 0.042)
    save_icon(col, alpha, "sk_aoyi_aid.png")


# -------------------- 4. 战场绝技/奥义地面战印贴图（256x256） --------------------

def build_battle_seals():
    _, _, _, _, ux, uy, r, ang, n = grid(256)

    # 1) fx_sig_crest.png：绝技触发脚下紫金六芒阵印（高对比描边，亮石板上清晰显眼）
    r_out = uaa(np.abs(r - 0.80) - 0.030, 256)
    r_in = uaa(np.abs(r - 0.62) - 0.020, 256)
    pts6 = (np.maximum(0.0, np.cos(6.0 * ang)) ** 14) * uaa(np.abs(r - 0.71) - 0.08, 256)
    star6 = (np.abs(np.cos(3.0 * ang)) ** 10) * uaa(r - 0.60, 256) * uaa(0.16 - r, 256)
    core = uaa(r - 0.18, 256)
    disc = uaa(r - 0.82, 256) * 0.28
    shape = np.clip(np.maximum.reduce([r_out, r_in, pts6, star6, core]), 0.0, 1.0)
    rim = np.clip(uaa(np.abs(r - 0.80) - 0.052, 256) - r_out, 0.0, 1.0)

    col = np.zeros(r.shape + (3,), dtype=np.float32)
    col = mix(col, rgb("2A0A52"), disc + rim)
    col = mix(col, rgb("B86CFF"), shape)
    col = mix(col, rgb("FFE898"), pts6 * 0.85 + core)
    alpha = np.clip(np.maximum.reduce([disc, rim * 0.85, shape * 0.95]), 0.0, 1.0)
    save_icon(col, alpha, "fx_sig_crest.png", 256)

    # 2) fx_aoyi_seal.png：奥义释放脚下煌金八角天罡战印
    r_out = uaa(np.abs(r - 0.84) - 0.034, 256)
    r_mid = uaa(np.abs(r - 0.66) - 0.024, 256)
    pts8 = (np.maximum(0.0, np.cos(8.0 * ang)) ** 16) * uaa(np.abs(r - 0.76) - 0.11, 256)
    rays8 = (np.abs(np.cos(4.0 * ang)) ** 14) * uaa(r - 0.64, 256)
    disc = uaa(r - 0.86, 256) * 0.32
    rim = np.clip(uaa(np.abs(r - 0.84) - 0.058, 256) - r_out, 0.0, 1.0)
    shape = np.clip(np.maximum.reduce([r_out, r_mid, pts8, rays8]), 0.0, 1.0)

    col = np.zeros(r.shape + (3,), dtype=np.float32)
    col = mix(col, rgb("521A04"), disc + rim)
    col = mix(col, rgb("FF9A28"), shape)
    col = mix(col, rgb("FFF4B8"), pts8 + uaa(r - 0.22, 256))
    alpha = np.clip(np.maximum.reduce([disc, rim * 0.88, shape * 0.96]), 0.0, 1.0)
    save_icon(col, alpha, "fx_aoyi_seal.png", 256)


if __name__ == "__main__":
    build_traits()
    build_sigs()
    build_aoyi()
    build_battle_seals()
