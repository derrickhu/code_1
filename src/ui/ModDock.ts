/**
 * 底部队伍栏：三个固定槽位，头像 + 名字 + 定位 + 三格改装。
 * 改装要看得见，所以常驻；装配阶段点槽位就是装给谁。
 * 不写「队首挨刀」这类说明——站位和金边已经说清楚了。
 */
import * as PIXI from 'pixi.js';
import { installForecast } from '@/balance/forecast';
import { MOD_SLOTS_PER_HERO, SLOT_NAME, SLOT_VIEW_ORDER, TEAM_SIZE } from '@/balance/combat';
import type { ModDef } from '@/balance/mods';
import { abilityTag } from '@/balance/mods';
import { fillContain, heroTex, modTex } from '@/core/TextureLoader';
import { canInstallOn, heroAt, type HeroUnit, type RunState } from '@/game/BattleEngine';
import { bindPointerTap } from '@/minigame';
import { GOLD } from '@/ui/paint';

const DOCK_X = 16;
const DOCK_W = 718;
/** 底栏高度。战场下沿按它来钉，小队贴在栏上，不要中间空一截土 */
export const DOCK_H = 118;
/** 阵地脚底到栏顶的缝，刚好能看见垫，连成一块 */
export const DOCK_GAP = 8;
const SLOT_GAP = 8;
const SLOT_PAD = 8;
const SLOT_W = (DOCK_W - SLOT_PAD * 2 - SLOT_GAP * (TEAM_SIZE - 1)) / TEAM_SIZE;
const SLOT_H = 102;
const FACE = 76;
const MOD = 30;
/** 底栏从左到右对齐场上三角：左后、前排、右后 */

function text(size: number, color = 0xffffff, bold = false): PIXI.Text {
  return new PIXI.Text('', {
    fontFamily: 'sans-serif',
    fontSize: size,
    fontWeight: bold ? 'bold' : 'normal',
    fill: color,
  });
}

export class ModDock extends PIXI.Container {
  private readonly _onTap: (slot: number) => void;
  private readonly _onStrip: (slot: number, modIndex: number) => void;
  private _sig = '';

  constructor(onTap: (slot: number) => void, onStrip: (slot: number, modIndex: number) => void) {
    super();
    this._onTap = onTap;
    this._onStrip = onStrip;
    this.visible = false;
    this.eventMode = 'static';
  }

  place(y: number): void {
    this.position.set(0, y);
  }

  /** 能焊的那几格轻轻喘，玩家才知道该点下面，不是再等一张弹层 */
  pulse(): void {
    const a = 0.35 + (Math.sin(Date.now() / 180) + 1) * 0.28;
    for (const child of this.children) {
      const glow = child instanceof PIXI.Container
        ? child.children.find((c) => c.name === 'breathe')
        : undefined;
      if (glow) glow.alpha = a;
    }
  }

  refresh(state: RunState, selected: string | null): void {
    const show = state.team.length > 0 && state.phase !== 'picking';
    const sig = show
      ? `${state.phase}|${state.pendingMod?.id ?? ''}|${selected ?? ''}|${state.team.map((h) =>
        `${h.def.id}:${h.slot}:${h.alive ? 1 : 0}:${h.mods.map((m) => m.id).join(',')}`).join(';')}`
      : '';
    if (sig === this._sig) {
      this.visible = show;
      return;
    }
    this._sig = sig;
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.visible = show;
    if (!this.visible) return;

    const installing = state.phase === 'installing';
    const pending = installing ? state.pendingMod : undefined;
    const plate = new PIXI.Graphics();
    plate.beginFill(0x14110c, installing ? 0.94 : 0.82).drawRoundedRect(DOCK_X, 0, DOCK_W, DOCK_H, 16).endFill();
    plate.lineStyle(installing ? 3 : 1.5, GOLD, installing ? 0.7 : 0.35)
      .drawRoundedRect(DOCK_X, 0, DOCK_W, DOCK_H, 16)
      .lineStyle(0);
    this.addChild(plate);

    SLOT_VIEW_ORDER.forEach((slotIndex, i) => {
      const hero = heroAt(state, slotIndex) ?? null;
      const canTake = !!pending && !!hero && canInstallOn(hero);
      const card = this._slot(hero, slotIndex, selected === hero?.def.id, pending, canTake);
      card.position.set(DOCK_X + SLOT_PAD + i * (SLOT_W + SLOT_GAP), 8);
      this.addChild(card);
      if (hero && (!installing || canTake)) {
        bindPointerTap(card, () => this._onTap(slotIndex));
      } else if (!hero && !installing) {
        bindPointerTap(card, () => this._onTap(slotIndex));
      }
    });
  }

  private _slot(
    h: HeroUnit | null,
    order: number,
    picked: boolean,
    pending: ModDef | undefined,
    canTake: boolean,
  ): PIXI.Container {
    const box = new PIXI.Container();
    box.eventMode = 'static';
    const installing = !!pending;
    const dim = !h || (installing && !canTake);
    const live = !!h?.alive;
    const forecast = h && pending && canTake ? installForecast(h, pending) : undefined;
    const edge = !h
      ? 0x3a3428
      : picked
        ? GOLD
        : canTake
          ? 0x9be08a
          : 0x3a3428;

    const bg = new PIXI.Graphics();
    bg.beginFill(h ? 0x1c1610 : 0x12100c, dim ? 0.45 : 0.94)
      .drawRoundedRect(0, 0, SLOT_W, SLOT_H, 12)
      .endFill();
    bg.lineStyle(picked ? 5 : canTake ? 3.5 : 1.5, edge, dim ? 0.3 : 0.95)
      .drawRoundedRect(0, 0, SLOT_W, SLOT_H, 12)
      .lineStyle(0);
    box.addChild(bg);

    if (canTake) {
      const glow = new PIXI.Graphics();
      glow.name = 'breathe';
      glow.lineStyle(4, 0x9be08a, 1).drawRoundedRect(2, 2, SLOT_W - 4, SLOT_H - 4, 11).lineStyle(0);
      glow.alpha = 0.55;
      box.addChild(glow);
    }

    if (!h) {
      const empty = text(16, 0x5a5244);
      empty.anchor.set(0.5);
      empty.position.set(SLOT_W / 2, SLOT_H / 2);
      empty.text = SLOT_NAME[order];
      box.addChild(empty);
      return box;
    }

    const faceX = 10;
    const faceY = (SLOT_H - FACE) / 2;
    const faceBg = new PIXI.Graphics();
    faceBg.beginFill(0x0c0a08, 0.9).drawRoundedRect(faceX, faceY, FACE, FACE, 10).endFill();
    box.addChild(faceBg);

    const spr = heroTex(h.def.id);
    if (spr?.baseTexture.valid && spr.width > 1) {
      const g = new PIXI.Graphics();
      fillContain(g, spr, faceX + FACE / 2, faceY + FACE - 3, FACE - 6, FACE - 8);
      g.alpha = dim || !live ? 0.45 : 1;
      box.addChild(g);
    }

    const badge = new PIXI.Graphics();
    badge.beginFill(order === 0 ? GOLD : 0x3a3428, 0.95).drawRoundedRect(faceX - 2, faceY - 2, 22, 18, 6).endFill();
    box.addChild(badge);
    const no = text(13, order === 0 ? 0x2a160c : 0xd7c9a8, true);
    no.anchor.set(0.5);
    no.position.set(faceX + 9, faceY + 7);
    no.text = String(order + 1);
    box.addChild(no);

    const nameX = faceX + FACE + 10;

    const name = text(20, live ? 0xffffff : 0x6b7394, true);
    name.position.set(nameX, 10);
    name.text = h.def.name;
    name.alpha = dim ? 0.5 : 1;
    box.addChild(name);

    const role = text(16, canTake
      ? (forecast?.fit === 'waste' ? 0x8a90a8 : forecast?.fit === 'good' ? 0x9be08a : GOLD)
      : GOLD);
    role.position.set(nameX, 36);
    role.text = canTake && forecast
      ? forecast.tag
      : h.stats.range <= 1 ? `贴脸 · ${abilityTag(h.def.skill)}` : `射程 ${h.stats.range}`;
    role.alpha = dim ? 0.5 : 1;
    box.addChild(role);

    const slotX = nameX;
    const slotY = SLOT_H - 12 - MOD;
    for (let i = 0; i < MOD_SLOTS_PER_HERO; i += 1) {
      const mod = h.mods[i];
      const x = slotX + i * (MOD + 6);
      const emptyHot = canTake && !mod && i === h.mods.length;
      const frame = new PIXI.Graphics();
      frame.beginFill(emptyHot ? 0x3d5a28 : mod ? 0x3d3320 : 0x2a2418, dim ? 0.4 : 0.95)
        .drawRoundedRect(x, slotY, MOD, MOD, 5)
        .endFill();
      if (mod) frame.lineStyle(1.5, GOLD, dim ? 0.4 : 0.95).drawRoundedRect(x, slotY, MOD, MOD, 5);
      else if (emptyHot) frame.lineStyle(1.5, 0x9be08a, 0.95).drawRoundedRect(x, slotY, MOD, MOD, 5);
      box.addChild(frame);

      const t = mod ? modTex(mod.id) : emptyHot && pending ? modTex(pending.id) : null;
      if (t?.baseTexture.valid && t.width > 1) {
        const icon = new PIXI.Graphics();
        fillContain(icon, t, x + MOD / 2, slotY + MOD - 2, MOD - 6, MOD - 6);
        icon.alpha = emptyHot ? 0.85 : dim ? 0.4 : 1;
        box.addChild(icon);
      }
      // 装件时整张卡都是「焊给他」，不要再在小图标上挂拆件，免得点偏
      if (mod && !installing) {
        const hit = new PIXI.Container();
        hit.eventMode = 'static';
        const pad = new PIXI.Graphics();
        pad.beginFill(0xffffff, 0.001).drawRoundedRect(x - 2, slotY - 2, MOD + 4, MOD + 4, 5).endFill();
        hit.addChild(pad);
        bindPointerTap(hit, () => this._onStrip(order, i));
        box.addChild(hit);
      }
    }

    return box;
  }
}
