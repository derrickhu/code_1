/**
 * 局内绝活的几块界面：底部绝活栏、倍速 / 自动两颗圆钮、放招横切条、布阵时的绝活卡。
 * 只画不算：劲头、能不能放全问 BattleEngine。点击走场景的设计坐标，不靠 Pixi hitTest。
 */
import * as PIXI from 'pixi.js';
import { ENERGY_MAX, ROLE_SKILL_TAG, SKILL_STAR_POW, chargeMul, skillOf, skillPow } from '@/balance/skills';
import { evoNameOf, type VillagerDef } from '@/balance/villagers';
import { heroTex, uiTex } from '@/core/TextureLoader';
import type { Fighter } from '@/game/BattleEngine';
import { GOLD, fillSprite, ironSlab, painted } from '@/ui/paint';

const CREAM = 0xfff4c4;
const DIM = 0x8a7a66;

/** 开打后底下这一条的高度。战场底线让出这么多 */
export const SKILL_TRAY_H = 92;
const SLOTS = 5;
const SLOT_R = 30;
/** 两头各让出一颗圆钮（自动 / 倍速）的位置 */
const SLOT_GAP = 112;
/** 圆钮在绝活栏里的横坐标：左自动、右倍速 */
export const TRAY_AUTO_X = 60;
export const TRAY_SPEED_X = 690;
export const TRAY_BTN_R = 30;

/** 圆钮和头像共用的那条中线 */
export function trayRowY(top: number): number {
  return top + 38;
}

/** 头像：立绘只露上半身，圈在一个圆里 */
function portrait(parent: PIXI.Container, def: VillagerDef, evo: number, r: number, dim: boolean): void {
  const tex = heroTex(def.id, evo);
  const bg = new PIXI.Graphics();
  bg.beginFill(dim ? 0x241a12 : 0x4a3220).drawCircle(0, 0, r).endFill();
  parent.addChild(bg);
  if (!tex?.baseTexture.valid || tex.width <= 1) return;
  const spr = new PIXI.Sprite(tex);
  spr.anchor.set(0.5, 0.16);
  const s = (r * 3.1) / tex.height;
  spr.scale.set(s);
  spr.position.set(0, -r * 0.92);
  if (dim) spr.tint = 0x777066;
  const mask = new PIXI.Graphics();
  mask.beginFill(0xffffff).drawCircle(0, 0, r - 2).endFill();
  spr.mask = mask;
  parent.addChild(spr, mask);
}

export class SkillTray extends PIXI.Container {
  private _top = 0;
  private _uids: (string | null)[] = [];
  private readonly _bg = new PIXI.Container();
  private readonly _slots = new PIXI.Container();
  private _sig = '';

  constructor() {
    super();
    this.eventMode = 'none';
    this.addChild(this._bg, this._slots);
  }

  place(top: number): void {
    this._top = top;
    this._bg.removeChildren().forEach((c) => c.destroy({ children: true }));
    const h = SKILL_TRAY_H;
    if (!fillSprite(this._bg, uiTex('rust_panel'), 375, top + h / 2, 736, h)) {
      const g = new PIXI.Graphics();
      ironSlab(g, 7, top, 736, h, 12);
      this._bg.addChild(g);
    }
    this._sig = '';
  }

  private _slotX(i: number): number {
    return 375 + (i - (SLOTS - 1) / 2) * SLOT_GAP;
  }

  private _slotY(): number {
    return trayRowY(this._top);
  }

  /**
   * 攒得最多的五个人。满了的亮金圈、会跳；没满的画一圈进度。
   * 位置按上场顺序排，不按劲头排 —— 按劲头排头像会一直换位，手指追不上。
   */
  sync(team: readonly Fighter[], pulse: number): void {
    const alive = team.filter((f) => f.alive);
    const pick = [...alive].sort((a, b) => b.energy - a.energy).slice(0, SLOTS);
    const shown = alive.filter((f) => pick.includes(f));
    this._uids = Array.from({ length: SLOTS }, (_, i) => shown[i]?.uid ?? null);

    const sig = shown.map((f) => `${f.uid}:${Math.floor((f.energy / ENERGY_MAX) * 20)}`).join('|');
    const ready = shown.some((f) => f.energy >= ENERGY_MAX);
    if (sig === this._sig && !ready) return;
    this._sig = sig;
    this._slots.removeChildren().forEach((c) => c.destroy({ children: true }));

    for (let i = 0; i < SLOTS; i += 1) {
      const f = shown[i];
      const box = new PIXI.Container();
      box.position.set(this._slotX(i), this._slotY());
      this._slots.addChild(box);
      const ring = new PIXI.Graphics();
      if (!f) {
        ring.beginFill(0x140e0a, 0.8).drawCircle(0, 0, SLOT_R).endFill();
        ring.lineStyle(3, 0x3a2a1c, 1).drawCircle(0, 0, SLOT_R);
        box.addChild(ring);
        continue;
      }
      const full = f.energy >= ENERGY_MAX;
      portrait(box, f.def, f.evoStage, SLOT_R, !full);
      const frac = Math.min(1, f.energy / ENERGY_MAX);
      ring.lineStyle(5, 0x2a1c12, 1).drawCircle(0, 0, SLOT_R + 2);
      if (full) {
        const glow = 0.6 + 0.4 * pulse;
        ring.lineStyle(6, GOLD, glow).drawCircle(0, 0, SLOT_R + 3);
        ring.lineStyle(2, 0xffe08a, glow).drawCircle(0, 0, SLOT_R + 9);
        box.scale.set(1 + 0.06 * pulse);
      } else if (frac > 0) {
        ring.lineStyle(5, 0xd9a441, 0.95);
        ring.arc(0, 0, SLOT_R + 2, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
      }
      box.addChild(ring);
      const name = painted(14, full ? 0xffe08a : DIM, '#1a1008', 3);
      name.anchor.set(0.5, 0);
      name.position.set(0, SLOT_R + 4);
      name.text = skillOf(f.def).name;
      box.addChild(name);
    }
  }

  /** 点到哪个头像。空槽返回 null */
  hit(x: number, y: number): string | null {
    const cy = this._slotY();
    for (let i = 0; i < SLOTS; i += 1) {
      const uid = this._uids[i];
      if (!uid) continue;
      const dx = x - this._slotX(i);
      const dy = y - cy;
      if (dx * dx + dy * dy <= (SLOT_R + 18) * (SLOT_R + 18)) return uid;
    }
    return null;
  }

  get top(): number {
    return this._top;
  }
}

/** 倍速、自动这种圆铁钮。lit 亮金边，dot 是那颗小灯 */
export function roundBtn(text: string, lit: boolean, dot?: number): PIXI.Container {
  const box = new PIXI.Container();
  box.eventMode = 'none';
  const r = TRAY_BTN_R;
  const g = new PIXI.Graphics();
  g.beginFill(0x2a1a10, 0.94).drawCircle(0, 0, r).endFill();
  g.lineStyle(4, lit ? GOLD : 0x5a4030, 1).drawCircle(0, 0, r);
  g.lineStyle(1.5, 0x1a0c06, 0.8).drawCircle(0, 0, r - 5);
  box.addChild(g);
  const t = painted(text.length > 1 ? 18 : 22, lit ? 0xffe08a : CREAM, '#1a1008', 3);
  t.anchor.set(0.5);
  t.position.set(0, dot !== undefined ? -4 : 0);
  t.text = text;
  box.addChild(t);
  if (dot !== undefined) {
    const d = new PIXI.Graphics();
    d.beginFill(dot).drawCircle(0, 14, 4).endFill();
    d.lineStyle(1, 0x1a0c06, 0.9).drawCircle(0, 14, 4);
    box.addChild(d);
  }
  return box;
}

/**
 * 放招的横切条。自动、手动都出：压暗半屏、斜着一条破布幅、人从条里探出来喊一句。
 * 战斗不停：引擎照走，这条只是盖在上面的演出，按真实时间跑。
 * 上一条还没念完又有人放，先排队，不把正在看的那条盖掉。
 */
export class SkillCutIn extends PIXI.Container {
  private _life = 0;
  private _max = 0;
  private readonly _body = new PIXI.Container();
  private readonly _queue: { f: Fighter; viewH: number; fast: boolean }[] = [];

  constructor() {
    super();
    this.eventMode = 'none';
    this.visible = false;
    this.addChild(this._body);
  }

  /** 换关、重开时清掉还没播的 */
  reset(): void {
    this._queue.length = 0;
    this._life = 0;
    this.visible = false;
  }

  show(f: Fighter, viewH: number, fast: boolean): void {
    if (this.visible && this._life > this._max * 0.35) {
      this._queue.push({ f, viewH, fast });
      if (this._queue.length > 3) this._queue.shift();
      return;
    }
    this._play(f, viewH, fast);
  }

  private _play(f: Fighter, viewH: number, fast: boolean): void {
    this._body.removeChildren().forEach((c) => c.destroy({ children: true }));
    const sk = skillOf(f.def);
    const y = Math.round(viewH * 0.3);
    const shade = new PIXI.Graphics();
    shade.beginFill(0x000000, 0.34).drawRect(0, 0, 750, viewH).endFill();
    this._body.addChild(shade);

    const band = new PIXI.Graphics();
    band.beginFill(0x3a2414, 0.95)
      .drawPolygon([0, y + 40, 750, y - 20, 750, y + 130, 0, y + 190]).endFill();
    band.beginFill(0xd9b77a, 0.95).drawPolygon([0, y + 30, 750, y - 30, 750, y - 20, 0, y + 40]).endFill();
    band.beginFill(0xd9b77a, 0.95).drawPolygon([0, y + 190, 750, y + 130, 750, y + 140, 0, y + 200]).endFill();
    this._body.addChild(band);

    const tex = heroTex(f.def.id, f.evoStage);
    if (tex?.baseTexture.valid && tex.width > 1) {
      const spr = new PIXI.Sprite(tex);
      spr.anchor.set(0.5, 1);
      const h = 300;
      spr.scale.set(h / tex.height);
      spr.position.set(180, y + 196);
      this._body.addChild(spr);
    }

    const name = painted(54, 0xffe08a, '#1a1008', 7);
    name.anchor.set(0.5);
    name.position.set(490, y + 58);
    name.text = sk.name;
    this._body.addChild(name);

    const cry = painted(26, CREAM, '#1a1008', 4);
    cry.anchor.set(0.5);
    cry.position.set(490, y + 118);
    cry.text = `「${sk.cry}」`;
    this._body.addChild(cry);

    this._max = fast ? 0.5 : 0.75;
    this._life = this._max;
    this.visible = true;
    this._pose();
  }

  update(dt: number): void {
    if (!this.visible) return;
    this._life -= dt;
    if (this._life <= 0) {
      const next = this._queue.shift();
      if (next) this._play(next.f, next.viewH, next.fast);
      else this.visible = false;
      return;
    }
    this._pose();
  }

  private _pose(): void {
    const t = 1 - this._life / this._max;
    const slide = Math.min(1, t / 0.18);
    this._body.x = (1 - slide) * -260;
    this._body.alpha = t > 0.75 ? Math.max(0, (1 - t) / 0.25) : 1;
  }
}

/** 布阵时点一个人，旁边弹这张卡：这招叫什么、干什么、怎么攒、三阶多什么 */
export function skillCard(def: VillagerDef, evo: number, stars: number): PIXI.Container {
  const box = new PIXI.Container();
  box.eventMode = 'none';
  const sk = skillOf(def);
  const w = 330;
  const inner = w - 40;
  const rows: { text: string; size: number; color: number }[] = [
    { text: `${def.name} · ${evoNameOf(def, evo)}`, size: 21, color: 0xffe08a },
    { text: `${'★'.repeat(stars)}${'☆'.repeat(Math.max(0, 5 - stars))}`, size: 18, color: GOLD },
    { text: `绝活「${sk.name}」 ${ROLE_SKILL_TAG[def.role]}`, size: 22, color: 0xffe08a },
    { text: sk.line, size: 17, color: CREAM },
    {
      text: `威力 ×${(skillPow(evo) * (1 + SKILL_STAR_POW * stars)).toFixed(2)}  攒劲快 ${Math.round((chargeMul(stars) - 1) * 100)}%`,
      size: 16,
      color: CREAM,
    },
    { text: '劲头：一直在攒，出手、挨打攒得更快；星越多威力越大、攒得越快', size: 15, color: DIM },
    evo >= 3
      ? { text: sk.up.replace('三阶：', '已换三阶：'), size: 16, color: 0x86efac }
      : { text: `${sk.up}（还没到）`, size: 16, color: DIM },
  ];
  const texts = rows.map((r) => {
    const t = painted(r.size, r.color, '#1a1008', 3);
    t.style.wordWrap = true;
    t.style.breakWords = true;
    t.style.wordWrapWidth = inner;
    t.text = r.text;
    return t;
  });
  const h = 36 + texts.reduce((a, t) => a + t.height + 6, 0);
  if (!fillSprite(box, uiTex('rust_panel'), w / 2, h / 2, w, h)) {
    const g = new PIXI.Graphics();
    ironSlab(g, 0, 0, w, h, 12);
    box.addChild(g);
  }
  let y = 18;
  for (const t of texts) {
    t.position.set(20, y);
    box.addChild(t);
    y += t.height + 6;
  }
  return box;
}
