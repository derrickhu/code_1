/**
 * 观战配方。战斗引擎只报「这一下是 slash / bolt」，
 * 颜色、拖尾、落点全在这里。加新破烂只改表，不动 CombatFx。
 *
 * 色跟村里的实物走：电锯锈橙、鞭炮火、水管青，不抄成仙侠霓虹。
 * 城主要的是分层（核 + 闪 + 带 + 屑），不是换一套色。
 */
import type { AttackFx, EnemyFx } from '@/balance/fx';
import { fxFamilyOf } from '@/balance/fx';
import type { VfxKit } from '@/fx/VfxKit';

export type ShotBody = 'none' | 'bolt' | 'orb' | 'blast';

export interface FxLook {
  tint: number;
  /** 近战当场打完，不飞弹 */
  instant?: boolean;
  /** 抡起来再砸 */
  delay?: number;
  /** 鼓风机 / 音响走侧弧 */
  curve?: boolean;
  /** 弹弓那种抛物线，石子先抬再落 */
  loft?: number;
  /** 贯穿光柱。电线才有，弹弓没有 */
  beam?: boolean;
  speed?: number;
  ribbon?: boolean;
  ribbonW?: number;
  body?: ShotBody;
  muzzle?: string;
  /** 飞出去的实物剪影。有这个就不走光团 */
  proj?: string;
  /** 飞弹像素大小 */
  projPx?: number;
  /** 飞的时候转，菜刀 / 锅 / 碟 */
  spin?: number;
  /** 实物弹：不炸星爆、不喷能量带。弹弓 / 水管走这条 */
  dry?: boolean;
  swing?: boolean;
  plates: readonly { name: string; tint?: number; s0: number; s1: number; life: number; vr?: number; sy0?: number; sy1?: number }[];
  ring?: boolean;
  spray: { n: number; kind: 'glow' | 'spark' | 'streak'; speed: number; tint?: number; gy?: number; spread?: number };
  hitStop: readonly [number, number];
  buzz?: 'medium' | 'heavy';
}

const ATTACK: Readonly<Record<AttackFx, FxLook>> = {
  slash: {
    tint: 0xd8c8b0,
    instant: true,
    swing: true,
    dry: true,
    speed: 460,
    loft: 16,
    body: 'none',
    plates: [
      { name: 'slash', tint: 0xe8e0d4, s0: 0.2, s1: 0.36, life: 0.1, vr: 8 },
    ],
    spray: { n: 5, kind: 'spark', speed: 90, tint: 0xb4553f, gy: 70, spread: 0.85 },
    hitStop: [0.03, 0.06],
  },
  saw: {
    tint: 0xff9a40,
    instant: true,
    muzzle: 'saw',
    plates: [
      { name: 'saw', tint: 0xffb070, s0: 0.3, s1: 0.58, life: 0.2, vr: 20 },
      { name: 'slash', tint: 0xffc078, s0: 0.22, s1: 0.4, life: 0.12, vr: 8 },
    ],
    spray: { n: 14, kind: 'spark', speed: 260, tint: 0xffc078 },
    hitStop: [0.055, 0.085],
    buzz: 'medium',
  },
  smash: {
    tint: 0xffe066,
    instant: true,
    swing: true,
    plates: [
      { name: 'smash', tint: 0xffe08a, s0: 0.28, s1: 0.55, life: 0.18 },
      { name: 'flash', s0: 0.16, s1: 0.34, life: 0.1 },
    ],
    ring: true,
    spray: { n: 16, kind: 'spark', speed: 280, tint: 0xffe08a, gy: 40 },
    hitStop: [0.065, 0.095],
    buzz: 'heavy',
  },
  poke: {
    tint: 0x9bb8c4,
    speed: 480,
    dry: true,
    body: 'none',
    plates: [
      { name: 'poke', tint: 0xc7e0ea, s0: 0.2, s1: 0.36, life: 0.1, sy0: 0.14, sy1: 0.2 },
    ],
    spray: { n: 4, kind: 'spark', speed: 90, tint: 0xd6c4a8, gy: 50, spread: 0.8 },
    hitStop: [0.024, 0.05],
  },
  bolt: {
    tint: 0x6a8aaa,
    speed: 460,
    dry: true,
    body: 'none',
    plates: [{ name: 'slash', tint: 0xc5d4dc, s0: 0.16, s1: 0.28, life: 0.08, sy0: 0.1, sy1: 0.14 }],
    spray: { n: 4, kind: 'spark', speed: 90, tint: 0x8ab0c0 },
    hitStop: [0.028, 0.055],
  },
  orb: {
    tint: 0xc084fc,
    speed: 380,
    curve: true,
    body: 'none',
    muzzle: 'orb',
    plates: [{ name: 'orb', tint: 0xc084fc, s0: 0.2, s1: 0.38, life: 0.14 }],
    spray: { n: 7, kind: 'glow', speed: 110, tint: 0xe9d5ff, gy: -10 },
    hitStop: [0.036, 0.07],
  },
  wind: {
    tint: 0x86efac,
    speed: 400,
    curve: true,
    body: 'none',
    muzzle: 'wind',
    plates: [{ name: 'wind', tint: 0xc7f0ff, s0: 0.2, s1: 0.4, life: 0.16, vr: 6 }],
    spray: { n: 6, kind: 'streak', speed: 120, tint: 0x86efac, gy: -20 },
    hitStop: [0.036, 0.068],
  },
  blast: {
    tint: 0xff6a2a,
    speed: 400,
    body: 'none',
    plates: [
      { name: 'blast', tint: 0xff8a3a, s0: 0.24, s1: 0.48, life: 0.16 },
      { name: 'fire', tint: 0xfff4c4, s0: 0.14, s1: 0.3, life: 0.12 },
    ],
    spray: { n: 12, kind: 'spark', speed: 220, tint: 0xffb070, gy: 20 },
    hitStop: [0.055, 0.09],
    buzz: 'heavy',
  },
  pierce: {
    tint: 0xc9a227,
    speed: 520,
    dry: true,
    body: 'none',
    loft: 10,
    plates: [{ name: 'spark', tint: 0xe8c84a, s0: 0.12, s1: 0.22, life: 0.08 }],
    spray: { n: 6, kind: 'spark', speed: 80, tint: 0xe8c84a, spread: 0.7 },
    hitStop: [0.028, 0.05],
  },
  sniper: {
    tint: 0xc4b59a,
    speed: 500,
    loft: 36,
    dry: true,
    body: 'none',
    plates: [{ name: 'flash', tint: 0xe8d4b0, s0: 0.1, s1: 0.2, life: 0.07 }],
    spray: { n: 5, kind: 'glow', speed: 55, tint: 0xc4b59a, gy: 90 },
    hitStop: [0.018, 0.04],
  },
};

const ENEMY: Readonly<Record<EnemyFx, FxLook>> = {
  claw: {
    tint: 0xff5a4a,
    speed: 360,
    ribbon: true,
    ribbonW: 0.42,
    body: 'bolt',
    plates: [{ name: 'claw', tint: 0xff6b5a, s0: 0.24, s1: 0.44, life: 0.12 }],
    spray: { n: 8, kind: 'spark', speed: 180, tint: 0xff6b5a },
    hitStop: [0.03, 0.05],
  },
  bash: {
    tint: 0xd0d8e4,
    speed: 340,
    plates: [{ name: 'smash', tint: 0xcbd5e1, s0: 0.22, s1: 0.44, life: 0.14 }],
    ring: true,
    spray: { n: 9, kind: 'glow', speed: 140, tint: 0xe2e8f0, gy: 50 },
    hitStop: [0.045, 0.06],
    buzz: 'medium',
  },
  spark: {
    tint: 0xff8a30,
    speed: 400,
    ribbon: true,
    ribbonW: 0.48,
    body: 'bolt',
    plates: [{ name: 'bolt', tint: 0xfb923c, s0: 0.22, s1: 0.4, life: 0.12 }],
    spray: { n: 11, kind: 'spark', speed: 220, tint: 0xfdba74 },
    hitStop: [0.032, 0.05],
  },
  beam: {
    tint: 0xc060ff,
    speed: 480,
    beam: true,
    ribbon: true,
    ribbonW: 0.4,
    body: 'bolt',
    plates: [{ name: 'beam', tint: 0xc084fc, s0: 0.24, s1: 0.46, life: 0.14 }],
    spray: { n: 10, kind: 'glow', speed: 170, tint: 0xe9d5ff },
    hitStop: [0.05, 0.07],
  },
};

const SKIN: Readonly<Record<string, Partial<FxLook>>> = {
  tiezhu: { tint: 0xc4b8a0, instant: true, dry: true, swing: true, proj: undefined },
  dachui: { tint: 0xc9a46a, instant: true, dry: true, swing: true, ring: false },
  laoli: { tint: 0xd8c8b0, dry: true, proj: 'cleaver', projPx: 52, spin: 14, loft: 16 },
  erjiu: { tint: 0x6a8aaa, dry: true, proj: 'needle', projPx: 40, loft: 8 },
  sanshen: { tint: 0xa78b5a, dry: true, curve: true, proj: 'disc', projPx: 56, spin: 10 },
  laoyanqiang: { tint: 0xc4b59a, dry: true, loft: 36, proj: 'pebble', projPx: 36 },
  pipe: { tint: 0x8aa0aa, dry: true, proj: 'pipe', projPx: 48 },
  weight: { tint: 0x5c5346, dry: true, swing: true, loft: 22, proj: 'weight', projPx: 44, spin: 8, ring: false },
  blower: { tint: 0x7a9e7e, dry: true, curve: true, proj: 'leaf', projPx: 36 },
  wire: {
    tint: 0xc9a227, dry: true, beam: false, ribbon: false, loft: 10,
    proj: 'wire', projPx: 42,
    plates: [{ name: 'spark', tint: 0xe8c84a, s0: 0.1, s1: 0.18, life: 0.07 }],
    spray: { n: 5, kind: 'spark', speed: 70, tint: 0xe8c84a, spread: 0.6 },
  },
  chainsaw: { tint: 0xcc6b2a, instant: true, dry: false, muzzle: 'saw' },
  firecracker: { tint: 0xe85a2a, dry: false, proj: 'cracker', projPx: 34 },
  pot: { tint: 0xb87333, dry: true, swing: true, loft: 20, proj: 'pot', projPx: 48, spin: 9, ring: false },
  speaker: { tint: 0x7c6a4a, dry: true, curve: true, proj: 'disc', projPx: 54, spin: 9 },
  sickle: { tint: 0x8a9a4a, dry: true, loft: 14, proj: 'sickle', projPx: 48, spin: 12 },
  foam: {
    tint: 0xe8e8e0, dry: true, curve: true, proj: 'foam', projPx: 40,
    plates: [{ name: 'glow', tint: 0xf4f4ee, s0: 0.16, s1: 0.3, life: 0.12 }],
    spray: { n: 8, kind: 'glow', speed: 60, tint: 0xf4f4ee, gy: -10 },
  },
  sack: { tint: 0xa89060, dry: true, loft: 24, proj: 'sack', projPx: 44, spin: 6 },
  shovel: { tint: 0x8b7355, dry: true, proj: 'shovel', projPx: 50, loft: 12 },
  battery: {
    tint: 0x3d6b4f, dry: true, proj: 'battery', projPx: 40,
    plates: [{ name: 'spark', tint: 0x86efac, s0: 0.1, s1: 0.2, life: 0.08 }],
    spray: { n: 4, kind: 'spark', speed: 70, tint: 0x86efac },
  },
  slingshot: { tint: 0xb8a078, dry: true, loft: 36, proj: 'pebble', projPx: 36, beam: false, ribbon: false },
  stool: { tint: 0x8b5a2b, dry: true, loft: 20, proj: 'stool', projPx: 46, spin: 8, ring: false },
  chili: {
    tint: 0xc43c2a, dry: true, loft: 18, proj: 'chili', projPx: 32,
    plates: [{ name: 'glow', tint: 0xe07040, s0: 0.14, s1: 0.26, life: 0.1 }],
    spray: { n: 8, kind: 'spark', speed: 70, tint: 0xc43c2a, gy: -20 },
  },
  fridge: { tint: 0x9aa8b0, dry: true, loft: 10, proj: 'fridge', projPx: 56, speed: 320, ring: false },
  gascan: { tint: 0xe07020, proj: 'gascan', projPx: 42, loft: 14 },
  thermos: { tint: 0xc45c4c, dry: true, loft: 20, proj: 'thermos', projPx: 40, spin: 7 },
  bell: {
    tint: 0xe8c84a, dry: true, loft: 16, proj: 'bell', projPx: 36, spin: 11,
    plates: [{ name: 'flash', tint: 0xffe08a, s0: 0.12, s1: 0.22, life: 0.08 }],
    spray: { n: 5, kind: 'spark', speed: 60, tint: 0xe8c84a },
  },
  longsaw: { tint: 0xe07030, instant: true },
  doorcannon: { tint: 0xd4b45a, dry: true, swing: true, ring: false },
  windcrack: { tint: 0xff7a3a, proj: 'cracker', projPx: 36, loft: 18 },
  beatrack: { tint: 0x9a7a40, dry: true, beam: false, proj: 'disc', projPx: 48, spin: 10 },
  coldwind: { tint: 0xc8d8d0, dry: true, curve: true, proj: 'foam', projPx: 40 },
  harvest: { tint: 0x6a8a3a, dry: true, beam: false, proj: 'sickle', projPx: 48, spin: 12, loft: 12 },
};

export const ATTACK_FX: readonly AttackFx[] = [
  'slash', 'saw', 'smash', 'poke', 'bolt', 'orb', 'wind', 'blast', 'pierce', 'sniper',
];

export const FX_SKINS: readonly string[] = Object.keys(SKIN);

export const ENEMY_FX: readonly EnemyFx[] = ['claw', 'bash', 'spark', 'beam'];

export function attackLook(fx: AttackFx): FxLook {
  return ATTACK[fx];
}

export function skinLook(skin: string): FxLook {
  const base = ATTACK[fxFamilyOf(skin)] ?? ATTACK.slash;
  const over = SKIN[skin];
  if (!over) return base;
  return {
    ...base,
    ...over,
    plates: over.plates ?? base.plates,
    spray: over.spray ?? base.spray,
  };
}

export function enemyLook(fx: EnemyFx): FxLook {
  return ENEMY[fx];
}

export function playMuzzle(kit: VfxKit, look: FxLook, x: number, y: number, ang: number): void {
  if (look.dry) {
    kit.spray(x, y, {
      n: look.swing ? 3 : 3,
      tint: look.swing ? 0xb4553f : look.tint,
      kind: look.swing ? 'spark' : 'glow',
      speed: 40,
      life: 0.1,
      gy: 30,
      dir: ang,
      spread: 0.6,
      scale: 0.16,
    });
    return;
  }
  if (look.muzzle && look.muzzle !== 'orb' && look.muzzle !== 'blast') {
    kit.plate(look.muzzle, x, y, {
      tint: look.tint,
      rot: ang,
      s0: 0.16,
      s1: 0.3,
      life: 0.08,
      a0: 0.7,
    });
  }
  kit.spray(x, y, { n: 4, tint: look.tint, kind: 'spark', speed: 90, life: 0.12, dir: ang, spread: 0.7, scale: 0.18 });
  if (look.swing) {
    kit.arc(x, y - 8, x + Math.cos(ang) * 40, y + Math.sin(ang) * 40, look.tint);
  }
}

/** 贴脸才当场炸。远程哪怕配方写了 instant，也要飞过去再爆 */
export function shouldFly(look: FxLook, melee: boolean): boolean {
  if (melee && look.instant) return false;
  return true;
}

/** 飞弹在路上的时间。近了也要让人看见东西飞过去，再炸 */
export function shotFlight(look: FxLook, dist: number, melee = false): number {
  if (!shouldFly(look, melee)) return 0;
  const speed = look.speed ?? 380;
  const minFly = look.loft || look.curve ? 0.28 : 0.22;
  return Math.min(0.62, Math.max(minFly, dist / speed));
}

export function playImpact(kit: VfxKit, look: FxLook, x: number, y: number, crit: boolean): number {
  const scale = crit ? 1.12 : 1;
  if (look.dry) {
    if (!look.swing) kit.puff(x, y, look.tint, crit ? 0.28 : 0.18);
  } else {
    kit.burst(x, y, look.tint, 0.55 * scale);
  }
  for (const p of look.plates) {
    kit.plate(p.name, x, y, {
      tint: p.tint ?? look.tint,
      s0: p.s0 * scale,
      s1: p.s1 * scale,
      sy0: p.sy0 !== undefined ? p.sy0 * scale : undefined,
      sy1: p.sy1 !== undefined ? p.sy1 * scale : undefined,
      life: p.life,
      vr: p.vr,
      a0: 0.88,
    });
  }
  if (look.ring) kit.ring(x, y, look.tint, 0.16);
  kit.spray(x, y, {
    n: Math.round(look.spray.n * 0.65 * scale),
    kind: look.spray.kind,
    speed: look.spray.speed * 0.7 * scale,
    tint: look.spray.tint ?? look.tint,
    gy: look.spray.gy,
    spread: look.spray.spread,
    scale: 0.22,
  });
  if (crit && !look.dry) {
    kit.plate('flash', x, y, { tint: 0xffe066, s0: 0.22, s1: 0.42, life: 0.12 });
    kit.spray(x, y, { n: 5, tint: 0xffe066, kind: 'spark', speed: 180, life: 0.16, scale: 0.2 });
  }
  return look.hitStop[crit ? 1 : 0];
}
