/**
 * 星星宝箱的画法。路线图、结算、开箱弹窗共用一套贴图：
 * 锈铁板（rust_panel）打底，铁槽（bar_track）+ 漆条（bar_fill）走进度，
 * 锈铁星（star_on）记数，箱子是 star_chest / star_chest_open，开箱背后一圈 chest_rays。
 * 不许拿 Graphics 画框和光圈顶替 —— 那就是几块色块，放不出去。
 */
import * as PIXI from 'pixi.js';
import { CHEST_STARS, sumLoot, type ChestLoot, type ChestOpen } from '@/balance/starChest';
import { Game } from '@/core/Game';
import { playSfx } from '@/core/SfxPlayer';
import { uiTex, type UiName } from '@/core/TextureLoader';
import { Ease, TweenManager } from '@/core/TweenManager';
import { GOLD, fillSprite, fitSprite, painted } from '@/ui/paint';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { safeDestroy } from '@/utils/safeDestroy';

const CREAM = 0xfff4c4;
const FILL_TINT = 0xffc23a;
export const CHEST_FULL = CHEST_STARS[CHEST_STARS.length - 1]!;

export type ChestLook = 'open' | 'ready' | 'locked';

/** 一口箱子。没到的压暗，不另画锁 */
export function chestSprite(parent: PIXI.Container, look: ChestLook, w: number, h: number): PIXI.Container {
  const c = new PIXI.Container();
  parent.addChild(c);
  const spr = fitSprite(c, uiTex(look === 'open' ? 'star_chest_open' : 'star_chest'), 0, 0, w, h);
  if (spr && look === 'locked') spr.tint = 0x6e6660;
  return c;
}

/** 锈铁槽里的漆条。k 是 0..1 */
export class ChestBar extends PIXI.Container {
  private readonly _fill: PIXI.Sprite | null;
  private readonly _w: number;
  private readonly _inX: number;
  private readonly _inW: number;

  constructor(w: number, h: number) {
    super();
    this._w = w;
    fillSprite(this, uiTex('bar_track'), w / 2, 0, w, h);
    // bar_track 两头是铆钉铁角，槽只占中间八成
    this._inX = w * 0.1;
    this._inW = w - this._inX * 2;
    const tex = uiTex('bar_fill');
    if (tex?.baseTexture.valid && tex.width > 1) {
      const s = new PIXI.Sprite(tex);
      s.anchor.set(0, 0.5);
      s.position.set(this._inX, 0);
      s.height = h * 0.46;
      s.tint = FILL_TINT;
      this.addChild(s);
      this._fill = s;
    } else {
      this._fill = null;
    }
    this.set(0);
  }

  set(k: number): void {
    if (!this._fill) return;
    const v = Math.max(0, Math.min(1, k));
    this._fill.visible = v > 0;
    this._fill.width = Math.max(this._fill.height, this._inW * v);
  }

  /** 第 at 颗星落在条上的 x */
  xAt(stars: number): number {
    return this._inX + this._inW * Math.max(0, Math.min(1, stars / CHEST_FULL));
  }

  get barW(): number {
    return this._w;
  }
}

/** 锈铁星 + 「10/15」 */
export function starCount(parent: PIXI.Container, stars: number, size: number): PIXI.Container {
  const box = new PIXI.Container();
  fitSprite(box, uiTex('star_on'), -size * 0.5, 0, size, size);
  const t = painted(Math.round(size * 0.78), GOLD, '#1a1008', 5);
  t.anchor.set(0, 0.5);
  t.position.set(size * 0.12, 2);
  t.text = `${stars}/${CHEST_FULL}`;
  box.addChild(t);
  parent.addChild(box);
  return box;
}

const LOOT_ICON: readonly [keyof ChestLoot, UiName, string][] = [
  ['parts', 'icon_parts', '零件'],
  ['credits', 'icon_credits', '工分'],
  ['scrap', 'icon_scrap', '废铁'],
];

export interface LootChip {
  box: PIXI.Container;
  num: PIXI.Text;
  value: number;
}

/** 一排木牌：图标 + 数。宝箱里的东西用图说，不写一行字 */
export function lootChips(parent: PIXI.Container, loot: ChestLoot, chipW: number, chipH: number): LootChip[] {
  const items = LOOT_ICON.filter(([k]) => loot[k] > 0);
  const gap = 14;
  const total = items.length * chipW + (items.length - 1) * gap;
  return items.map(([k, icon, name], i) => {
    const chip = new PIXI.Container();
    chip.position.set(-total / 2 + chipW / 2 + i * (chipW + gap), 0);
    fillSprite(chip, uiTex('settle_chip'), 0, 0, chipW, chipH);
    fitSprite(chip, uiTex(icon), -chipW * 0.36, -chipH * 0.06, chipH * 0.95, chipH * 0.95);
    const n = painted(Math.round(chipH * 0.46), 0x3a1c08, '#fff1c8', 4);
    n.anchor.set(0.5, 0.5);
    n.position.set(chipW * 0.12, -chipH * 0.04);
    n.text = `+${loot[k]}`;
    chip.addChild(n);
    const tag = painted(Math.round(chipH * 0.26), CREAM, '#1a1008', 4);
    tag.anchor.set(0.5, 0);
    tag.position.set(0, chipH * 0.5);
    tag.text = name;
    chip.addChild(tag);
    parent.addChild(chip);
    return { box: chip, num: n, value: loot[k] };
  });
}

type OpenPhase = 'wait' | 'shake' | 'reveal' | 'collect';

const SHAKE_S = 0.6;
const CHIP_AT = 0.35;
const CHIP_GAP = 0.2;
const ROLL_S = 0.5;
const SPRAY_N = 18;
const GRAVITY = 1900;

interface Spark {
  spr: PIXI.Sprite;
  vx: number;
  vy: number;
  spin: number;
  life: number;
}

/**
 * 开箱要玩家亲手点：箱子在中间跳着等，点一下越抖越凶，
 * 白光一闪盖子崩开、东西往外喷，木牌一块块砸出来、数字往上滚，
 * 再点一下全飞进口袋。
 */
export function mountChestOpen(parent: PIXI.Container, viewH: number, chests: readonly ChestOpen[], done?: () => void): void {
  const loot = sumLoot(chests);
  const root = new PIXI.Container();
  root.eventMode = 'static';
  root.hitArea = new PIXI.Rectangle(0, 0, 750, viewH);
  parent.addChild(root);

  const dim = new PIXI.Graphics();
  dim.beginFill(0x07040a, 0.8).drawRect(0, 0, 750, viewH).endFill();
  root.addChild(dim);
  const stage = new PIXI.Container();
  root.addChild(stage);

  const cy = Math.round(viewH * 0.44);
  const rays = new PIXI.Container();
  rays.position.set(375, cy);
  const r1 = fitSprite(rays, uiTex('chest_rays'), 0, 0, 760, 760);
  const r2 = fitSprite(rays, uiTex('chest_rays'), 0, 0, 560, 560);
  if (r1) r1.blendMode = PIXI.BLEND_MODES.ADD;
  if (r2) {
    r2.blendMode = PIXI.BLEND_MODES.ADD;
    r2.alpha = 0.55;
  }
  rays.alpha = 0.3;
  rays.scale.set(0.55);
  stage.addChild(rays);

  const chest = new PIXI.Container();
  chest.position.set(375, cy + 10);
  const shut = fitSprite(chest, uiTex('star_chest'), 0, 0, 320, 290);
  const open = fitSprite(chest, uiTex('star_chest_open'), 0, 0, 340, 320);
  if (open) open.visible = false;
  stage.addChild(chest);

  const plaque = new PIXI.Container();
  plaque.position.set(375, cy - 280);
  fitSprite(plaque, uiTex('title_plaque'), 0, 0, 420, 300);
  const title = painted(44, 0x3a1c08, '#ffe9a8', 5);
  title.anchor.set(0.5);
  title.position.set(0, 38);
  title.text = chests.length > 1 ? `${chests.length} 个宝箱` : '星星宝箱';
  plaque.addChild(title);
  stage.addChild(plaque);

  const row = new PIXI.Container();
  row.position.set(375, cy + 220);
  stage.addChild(row);
  const chips = lootChips(row, loot, 210, 92);
  for (const c of chips) {
    c.box.scale.set(0);
    c.num.text = '+0';
  }

  const sparks: Spark[] = [];
  const sparkLayer = new PIXI.Container();
  stage.addChild(sparkLayer);

  const tip = painted(30, GOLD, '#1a1008', 5);
  tip.anchor.set(0.5);
  tip.position.set(375, cy + 220);
  tip.text = '点开它！';
  stage.addChild(tip);

  const flash = new PIXI.Graphics();
  flash.beginFill(0xfff6d8).drawRect(0, 0, 750, viewH).endFill();
  flash.alpha = 0;
  root.addChild(flash);

  plaque.y -= 220;
  TweenManager.to({ target: plaque, props: { y: cy - 280 }, duration: 0.44, ease: Ease.easeOutBack });
  chest.scale.set(0.3);
  TweenManager.to({ target: chest.scale, props: { x: 1, y: 1 }, duration: 0.4, ease: Ease.easeOutBack });

  let phase: OpenPhase = 'wait';
  let t = 0;
  let shakeHits = 0;
  let quake = 0;
  let popped = 0;

  const spray = (): void => {
    const icons: UiName[] = ['star_on'];
    for (const [k, icon] of LOOT_ICON) if (loot[k] > 0) icons.push(icon);
    for (let i = 0; i < SPRAY_N; i++) {
      const tex = uiTex(icons[i % icons.length]!);
      if (!tex?.baseTexture.valid) continue;
      const spr = new PIXI.Sprite(tex);
      spr.anchor.set(0.5);
      const size = 44 + Math.random() * 30;
      spr.scale.set(size / Math.max(tex.width, tex.height));
      spr.position.set(375 + (Math.random() - 0.5) * 80, cy - 30);
      sparkLayer.addChild(spr);
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 700 + Math.random() * 600;
      sparks.push({
        spr, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, spin: (Math.random() - 0.5) * 12, life: 1.1 + Math.random() * 0.4,
      });
    }
  };

  const burst = (): void => {
    phase = 'reveal';
    t = 0;
    chest.rotation = 0;
    if (shut) shut.visible = false;
    if (open) open.visible = true;
    chest.scale.set(1.45);
    TweenManager.to({ target: chest.scale, props: { x: 1, y: 1 }, duration: 0.4, ease: Ease.easeOutBack });
    rays.alpha = 1;
    rays.scale.set(0.2);
    TweenManager.to({ target: rays.scale, props: { x: 1, y: 1 }, duration: 0.5, ease: Ease.easeOutCubic });
    flash.alpha = 0.95;
    quake = 18;
    tip.visible = false;
    spray();
    playSfx('sk_burst', 0);
    playSfx('craft_up', 0);
  };

  const showAll = (): void => {
    for (const c of chips) {
      TweenManager.cancelTarget(c.box.scale);
      c.box.scale.set(1);
      c.num.text = `+${c.value}`;
    }
    popped = chips.length;
    t = Math.max(t, CHIP_AT + chips.length * CHIP_GAP + ROLL_S);
  };

  const close = (): void => {
    Game.ticker.remove(tick);
    for (const tg of [plaque, chest.scale, rays.scale, ...chips.map((c) => c.box.scale)]) TweenManager.cancelTarget(tg);
    safeDestroy(root, { children: true });
    done?.();
  };

  const collect = (): void => {
    phase = 'collect';
    t = 0;
    tip.visible = false;
    playSfx('get_up', 0);
  };

  function tick(): void {
    if (root.destroyed) {
      Game.ticker.remove(tick);
      return;
    }
    const dt = Math.min(0.05, Game.ticker.deltaMS / 1000);
    t += dt;
    rays.rotation += dt * (phase === 'wait' || phase === 'shake' ? 0.5 : 0.35);
    if (r2) r2.rotation -= dt * 0.9;
    if (flash.alpha > 0) flash.alpha = Math.max(0, flash.alpha - dt * 3.2);
    quake = Math.max(0, quake - dt * 50);
    stage.position.set((Math.random() - 0.5) * quake, (Math.random() - 0.5) * quake);

    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]!;
      p.life -= dt;
      p.vy += GRAVITY * dt;
      p.spr.x += p.vx * dt;
      p.spr.y += p.vy * dt;
      p.spr.rotation += p.spin * dt;
      p.spr.alpha = Math.min(1, p.life / 0.3);
      if (p.life <= 0) {
        p.spr.destroy();
        sparks.splice(i, 1);
      }
    }

    if (phase === 'wait') {
      const hop = Math.max(0, Math.sin(t * 5));
      chest.y = cy + 10 - hop * 26;
      chest.rotation = Math.sin(t * 18) * 0.05 * hop;
      tip.scale.set(1 + Math.sin(t * 6) * 0.08);
      return;
    }
    if (phase === 'shake') {
      const k = Math.min(1, t / SHAKE_S);
      chest.y = cy + 10;
      chest.rotation = Math.sin(t * 70) * (0.05 + 0.16 * k);
      chest.scale.set(1 + 0.16 * k, 1 + 0.16 * k - Math.abs(Math.sin(t * 35)) * 0.05 * k);
      rays.alpha = 0.3 + 0.5 * k;
      const due = Math.floor(t / (SHAKE_S / 3));
      if (due > shakeHits && shakeHits < 3) {
        shakeHits = due;
        quake = 4 + shakeHits * 3;
        playSfx('hit_smash', 0);
      }
      if (t >= SHAKE_S) burst();
      return;
    }
    if (phase === 'reveal') {
      while (popped < chips.length && t >= CHIP_AT + popped * CHIP_GAP) {
        const c = chips[popped]!;
        TweenManager.to({ target: c.box.scale, props: { x: 1, y: 1 }, duration: 0.3, ease: Ease.easeOutBack });
        playSfx('kill_pop', 0);
        popped++;
      }
      chips.forEach((c, i) => {
        const k = Math.max(0, Math.min(1, (t - CHIP_AT - i * CHIP_GAP) / ROLL_S));
        c.num.text = `+${Math.round(c.value * (1 - (1 - k) * (1 - k)))}`;
      });
      if (t >= CHIP_AT + chips.length * CHIP_GAP + ROLL_S && !tip.visible) {
        tip.text = '点一下，收下';
        tip.style.fontSize = 24;
        tip.position.set(375, cy + 350);
        tip.visible = true;
      }
      if (tip.visible) tip.alpha = 0.6 + Math.sin(t * 5) * 0.4;
      return;
    }
    // collect：木牌飞上去收进口袋，其余淡出
    const topY = Game.safeTop + 40 - row.y;
    chips.forEach((c, i) => {
      const k = Math.max(0, Math.min(1, (t - i * 0.08) / 0.42));
      const e = k * k;
      c.box.y = topY * e;
      c.box.scale.set(1 - 0.6 * e);
      c.box.alpha = 1 - e * 0.8;
    });
    const fade = Math.max(0, 1 - Math.max(0, t - 0.2) / 0.3);
    for (const d of [dim, rays, chest, plaque]) d.alpha = Math.min(d.alpha, fade);
    if (t >= 0.62) close();
  }
  Game.ticker.add(tick);

  bindPointerTap(root, () => {
    if (phase === 'wait') {
      TweenManager.cancelTarget(chest.scale);
      phase = 'shake';
      t = 0;
      tip.visible = false;
      playSfx('install_on', 0);
      return;
    }
    if (phase === 'shake') return;
    if (phase === 'reveal') {
      if (t < CHIP_AT + chips.length * CHIP_GAP + ROLL_S) showAll();
      else collect();
    }
  }, { silent: true });
}
