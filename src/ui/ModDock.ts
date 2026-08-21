/**
 * 底部队伍栏：三个固定槽位，头像 + 名字 + 定位 + 三格改装。
 * 改装要看得见，所以常驻；装配阶段点槽位就是装给谁。
 * 不写「队首挨刀」这类说明——站位和金边已经说清楚了。
 */
import * as PIXI from 'pixi.js';
import { MOD_SLOTS_PER_HERO, TEAM_SIZE } from '@/balance/combat';
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
const DOCK_ORDER = [1, 0, 2] as const;
const SLOT_NAME = ['前排', '左后', '右后'] as const;

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

  constructor(onTap: (slot: number) => void) {
    super();
    this._onTap = onTap;
    this.visible = false;
    this.eventMode = 'static';
  }

  place(y: number): void {
    this.position.set(0, y);
  }

  refresh(state: RunState, selected: string | null): void {
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.visible = state.team.length > 0 && state.phase !== 'picking';
    if (!this.visible) return;

    const installing = state.phase === 'installing';
    const plate = new PIXI.Graphics();
    plate.beginFill(0x14110c, installing ? 0.92 : 0.82).drawRoundedRect(DOCK_X, 0, DOCK_W, DOCK_H, 16).endFill();
    plate.lineStyle(1.5, GOLD, 0.35).drawRoundedRect(DOCK_X, 0, DOCK_W, DOCK_H, 16).lineStyle(0);
    this.addChild(plate);

    DOCK_ORDER.forEach((slotIndex, i) => {
      const hero = heroAt(state, slotIndex) ?? null;
      const canTake = hero ? canInstallOn(hero) : false;
      const card = this._slot(hero, slotIndex, selected === hero?.def.id, installing, canTake);
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
    installing: boolean,
    canTake: boolean,
  ): PIXI.Container {
    const box = new PIXI.Container();
    box.eventMode = 'static';
    const dim = !h || (installing && !canTake);
    const live = !!h?.alive;
    const edge = !h
      ? 0x3a3428
      : picked
        ? GOLD
        : installing && canTake
          ? 0x9be08a
          : 0x3a3428;

    const bg = new PIXI.Graphics();
    bg.beginFill(h ? 0x1c1610 : 0x12100c, dim ? 0.45 : 0.94)
      .drawRoundedRect(0, 0, SLOT_W, SLOT_H, 12)
      .endFill();
    bg.lineStyle(picked || (installing && canTake) ? 3 : 1.5, edge, dim ? 0.3 : 0.9)
      .drawRoundedRect(0, 0, SLOT_W, SLOT_H, 12)
      .lineStyle(0);
    box.addChild(bg);

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

    const role = text(14, GOLD);
    role.position.set(nameX, 36);
    role.text = h.stats.range <= 1 ? `贴脸 · ${abilityTag(h.def.skill)}` : `射程 ${h.stats.range}`;
    role.alpha = dim ? 0.5 : 1;
    box.addChild(role);

    const slotX = nameX;
    const slotY = SLOT_H - 12 - MOD;
    for (let i = 0; i < MOD_SLOTS_PER_HERO; i += 1) {
      const mod = h.mods[i];
      const x = slotX + i * (MOD + 6);
      const frame = new PIXI.Graphics();
      frame.beginFill(mod ? 0x3d3320 : 0x2a2418, dim ? 0.4 : 0.95)
        .drawRoundedRect(x, slotY, MOD, MOD, 5)
        .endFill();
      if (mod) frame.lineStyle(1.5, GOLD, dim ? 0.4 : 0.95).drawRoundedRect(x, slotY, MOD, MOD, 5);
      box.addChild(frame);

      const t = mod ? modTex(mod.id) : null;
      if (t?.baseTexture.valid && t.width > 1) {
        const icon = new PIXI.Graphics();
        fillContain(icon, t, x + MOD / 2, slotY + MOD - 2, MOD - 6, MOD - 6);
        icon.alpha = dim ? 0.4 : 1;
        box.addChild(icon);
      }
    }

    return box;
  }
}
