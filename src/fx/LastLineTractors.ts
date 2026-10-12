import * as PIXI from 'pixi.js';

import { LANE_COUNT, LANE_W, laneScreenX } from '@/balance/combat';
import { uiTex } from '@/core/TextureLoader';

/** 停着的车高按人身高算，比人略大一圈才像台车 */
const PARK_H_MUL = 1.05;
/** 停在这一路靠右，把路中间让给人和怪 */
const PARK_SIDE = 0.3;
/** 从底线开到门口多久，真实秒。太快看不清是车，太慢挡着后面的怪 */
const DRIVE_S = 0.75;
const FADE_S = 0.2;
const DUST_N = 6;

interface Run {
  sprite: PIXI.Sprite;
  lane: number;
  t: number;
  fromY: number;
  toY: number;
}

/**
 * 底线上一路一台拖拉机（引擎 state.lastLine）。
 * 停着的三台常驻，只切 visible；发动时另起一台开上去，开完就拆。
 */
export class LastLineTractors {
  readonly layer = new PIXI.Container();
  private readonly _parked: PIXI.Sprite[] = [];
  private readonly _dust = new PIXI.Graphics();
  private _runs: Run[] = [];

  constructor() {
    this.layer.eventMode = 'none';
    for (let i = 0; i < LANE_COUNT; i += 1) {
      const s = new PIXI.Sprite(PIXI.Texture.EMPTY);
      s.anchor.set(0.5, 1);
      s.visible = false;
      this._parked.push(s);
      this.layer.addChild(s);
    }
    this.layer.addChild(this._dust);
  }

  /** 每帧对一次：哪一路还有车、底线在哪、人多高 */
  sync(ready: readonly boolean[], goalY: number, unitH: number, show: boolean): void {
    const tex = tractorTex();
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      const s = this._parked[lane]!;
      s.visible = show && !!tex && !!ready[lane] && !this._runs.some((r) => r.lane === lane);
      if (!s.visible || !tex) continue;
      if (s.texture !== tex) s.texture = tex;
      fitH(s, unitH * PARK_H_MUL);
      s.position.set(laneScreenX(lane) + LANE_W * PARK_SIDE, goalY + 6);
      s.alpha = 0.92;
    }
  }

  /** 这一路的车发动，沿路开到门口 */
  fire(lane: number, goalY: number, spawnY: number, unitH: number): void {
    const tex = tractorTex();
    if (!tex) return;
    const s = new PIXI.Sprite(tex);
    s.anchor.set(0.5, 1);
    fitH(s, unitH * PARK_H_MUL * 1.15);
    s.position.set(laneScreenX(lane), goalY + 6);
    this.layer.addChildAt(s, this._parked.length);
    this._runs.push({ sprite: s, lane, t: 0, fromY: goalY + 6, toY: spawnY - 10 });
  }

  update(dt: number): void {
    const g = this._dust;
    g.clear();
    if (!this._runs.length) return;
    const keep: Run[] = [];
    for (const r of this._runs) {
      r.t += dt;
      const k = Math.min(1, r.t / DRIVE_S);
      const ease = k * k * (3 - 2 * k);
      const y = r.fromY + (r.toY - r.fromY) * ease;
      const x = laneScreenX(r.lane) + Math.sin(r.t * 40) * 1.5;
      r.sprite.position.set(x, y);
      // 越往门口越小，像开远了
      const far = 1 - 0.3 * ease;
      r.sprite.scale.set(baseScale(r.sprite) * far);
      const left = DRIVE_S + FADE_S - r.t;
      r.sprite.alpha = Math.max(0, Math.min(1, left / FADE_S));
      for (let i = 0; i < DUST_N; i += 1) {
        const back = (i + 1) * 22;
        const dy = Math.min(r.fromY, y + back);
        const a = 0.28 * (1 - i / DUST_N) * r.sprite.alpha;
        const rad = 10 + i * 4;
        g.beginFill(0xc8a77a, a).drawEllipse(x + (i % 2 ? 14 : -14), dy, rad, rad * 0.6).endFill();
      }
      if (r.t < DRIVE_S + FADE_S) keep.push(r);
      else r.sprite.destroy();
    }
    this._runs = keep;
  }

  reset(): void {
    for (const r of this._runs) r.sprite.destroy();
    this._runs = [];
    this._dust.clear();
    for (const s of this._parked) s.visible = false;
  }
}

function tractorTex(): PIXI.Texture | null {
  const t = uiTex('lastline_tractor') ?? uiTex('boost_tractor');
  return t && t.width > 1 ? t : null;
}

const BASE = new WeakMap<PIXI.Sprite, number>();

function fitH(s: PIXI.Sprite, h: number): void {
  const k = h / Math.max(1, s.texture.height);
  BASE.set(s, k);
  s.scale.set(k);
}

function baseScale(s: PIXI.Sprite): number {
  return BASE.get(s) ?? s.scale.y;
}
