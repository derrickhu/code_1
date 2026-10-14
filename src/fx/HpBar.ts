/**
 * 头顶血条。每个单位一条常驻，不每帧重搭：
 * 嵌进去的深槽 + 渐变条 + 高光，掉血先白闪、后面拖一截亮黄慢慢缩，挨一下看得见掉了多少。
 */
import * as PIXI from 'pixi.js';
import { BAR_SLICE, primTex } from '@/fx/fxPrims';
import { painted } from '@/ui/paint';

export type BarKind = 'hero' | 'foe' | 'elite' | 'boss';

const FILL: Record<Exclude<BarKind, 'hero'>, number> = {
  foe: 0xe8453a,
  elite: 0xff8f2a,
  boss: 0xe0263e,
};
const CHIP = 0xffe7a8;
const ENERGY = 0xe8b440;
const ENERGY_FULL = 0xffe9a0;
/** 掉血后那截亮条停多久再缩 */
const CHIP_HOLD = 0.32;

function heroFill(r: number): number {
  return r > 0.55 ? 0x6fd64a : r > 0.28 ? 0xf2c43a : 0xe8453a;
}

function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const r = ar + (((b >> 16) & 255) - ar) * t;
  const g = ag + (((b >> 8) & 255) - ag) * t;
  const bl = ab + ((b & 255) - ab) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

interface Track {
  frame: PIXI.NineSlicePlane | PIXI.Graphics;
  chip: PIXI.Sprite;
  fill: PIXI.Sprite;
  gloss: PIXI.Sprite;
}

function track(parent: PIXI.Container, gold: boolean): Track {
  const ft = primTex(gold ? 'barFrameGold' : 'barFrame');
  const frame = ft
    ? new PIXI.NineSlicePlane(ft, BAR_SLICE, BAR_SLICE, BAR_SLICE, BAR_SLICE)
    : new PIXI.Graphics();
  const fillTex = primTex('barFill') ?? PIXI.Texture.WHITE;
  const chip = new PIXI.Sprite(fillTex);
  const fill = new PIXI.Sprite(fillTex);
  const gloss = new PIXI.Sprite(primTex('barGloss') ?? PIXI.Texture.EMPTY);
  chip.tint = CHIP;
  parent.addChild(frame, chip, fill, gloss);
  return { frame, chip, fill, gloss };
}

function placeTrack(t: Track, x: number, y: number, w: number, h: number, pad: number): void {
  if (t.frame instanceof PIXI.NineSlicePlane) {
    t.frame.position.set(x - pad, y - pad);
    t.frame.width = w + pad * 2;
    t.frame.height = h + pad * 2;
  } else {
    t.frame.clear().beginFill(0x140b08, 0.9).drawRoundedRect(x - pad, y - pad, w + pad * 2, h + pad * 2, h / 2 + pad).endFill();
  }
  for (const s of [t.chip, t.fill, t.gloss]) {
    s.position.set(x, y);
    s.height = h;
  }
}

export class HpBar {
  readonly view = new PIXI.Container();
  readonly kind: BarKind;
  /** 这一帧有没有人认领。场景每帧扫一遍，没人认领的回收 */
  stamp = 0;
  private readonly _hp: Track;
  private readonly _ticks = new PIXI.Graphics();
  private _en: Track | null = null;
  private _title: PIXI.Text | null = null;
  private _w = 0;
  private _h = 0;
  private _segs = 0;
  private _r = -1;
  private _chip = 1;
  private _hold = 0;
  private _hit = 0;
  private _t = Math.random() * 6;
  private _energyH = 0;

  constructor(kind: BarKind) {
    this.kind = kind;
    this.view.eventMode = 'none';
    this._hp = track(this.view, kind === 'boss');
    this.view.addChild(this._ticks);
    if (kind === 'hero') this._en = track(this.view, false);
  }

  /** 宽高变了才重排，九宫框跟着拉 */
  layout(w: number, h: number, energyH = 0, segs = 0): void {
    w = Math.round(w);
    if (w === this._w && h === this._h && segs === this._segs && energyH === this._energyH) return;
    this._w = w;
    this._h = h;
    this._segs = segs;
    this._energyH = energyH;
    const pad = this.kind === 'boss' ? 3 : 2;
    placeTrack(this._hp, 0, 0, w, h, pad);
    if (this._en) {
      this._en.frame.visible = energyH > 0;
      placeTrack(this._en, 0, h + pad + 2, w, energyH, 1.5);
    }
    this._ticks.clear();
    if (segs > 1) {
      this._ticks.beginFill(0x1a0c08, 0.55);
      for (let i = 1; i < segs; i += 1) this._ticks.drawRect(Math.round((w * i) / segs) - 0.5, 1, 1, h - 1);
      this._ticks.endFill();
    }
    if (this._title) this._title.position.set(w / 2, -pad - 1);
  }

  /** 大个子、小头目头顶那行字。只建一次 */
  title(text: string, fill: number): void {
    if (!this._title) {
      this._title = painted(this.kind === 'boss' ? 17 : 15, fill, '#1a1008', 4);
      this._title.anchor.set(0.5, 1);
      this.view.addChild(this._title);
      this._title.position.set(this._w / 2, -4);
    }
    if (this._title.text !== text) this._title.text = text;
  }

  /** 挨打白闪一下（掉血时自己也会闪） */
  hit(): void {
    this._hit = 1;
  }

  update(ratio: number, dt: number): void {
    const r = Math.max(0, Math.min(1, ratio));
    if (this._r < 0) {
      this._r = r;
      this._chip = r;
    }
    if (r < this._r - 0.001) {
      if (this._chip < this._r) this._chip = this._r;
      this._hold = CHIP_HOLD;
      this._hit = 1;
    }
    // 掉得快、回得慢一点，治疗看得见在涨
    this._r += (r - this._r) * Math.min(1, dt * (r < this._r ? 22 : 7));
    if (Math.abs(r - this._r) < 0.002) this._r = r;
    if (this._hold > 0) this._hold -= dt;
    else this._chip = Math.max(this._r, this._chip - dt * Math.max(0.5, (this._chip - this._r) * 3.2));
    if (this._chip < this._r) this._chip = this._r;
    this._hit = Math.max(0, this._hit - dt / 0.16);
    this._t += dt;

    const w = this._w;
    const fw = w * this._r;
    const base = this.kind === 'hero' ? heroFill(this._r) : FILL[this.kind];
    let tint = this._hit > 0 ? mix(base, 0xffffff, this._hit * 0.75) : base;
    if (this.kind === 'hero' && this._r <= 0.28 && this._r > 0) {
      tint = mix(tint, 0xffffff, (Math.sin(this._t * 10) * 0.5 + 0.5) * 0.35);
    }
    this._hp.fill.tint = tint;
    this._hp.fill.width = fw;
    this._hp.fill.visible = fw > 0.5;
    this._hp.gloss.width = fw;
    this._hp.gloss.visible = fw > 0.5;
    const cw = w * this._chip;
    this._hp.chip.width = cw;
    this._hp.chip.visible = cw - fw > 0.5;
    this._hp.chip.alpha = this._hold > 0 ? 1 : 0.85;
  }

  /** 劲头条：满了变亮、一闪一闪，就是「该点我了」 */
  energy(ratio: number, full: boolean): void {
    const en = this._en;
    if (!en || this._energyH <= 0) return;
    const r = Math.max(0, Math.min(1, ratio));
    const pulse = full ? Math.sin(this._t * 9) * 0.5 + 0.5 : 0;
    en.fill.tint = full ? mix(ENERGY_FULL, 0xffffff, pulse * 0.6) : ENERGY;
    en.fill.width = this._w * r;
    en.fill.visible = r > 0;
    en.gloss.width = this._w * r;
    en.gloss.visible = r > 0;
    en.chip.visible = false;
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}
