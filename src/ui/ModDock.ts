/**
 * 底部改装条：按队列顺序列出三个人，以及各自身上装了什么破烂。
 *
 * 存在的理由是主体验目标的第三个可检验点——**改造要看得见**。
 * 战场上的小人只能表达「他变了」，说不清「他装了哪三件」，
 * 所以这条必须常驻，而不是做成需要点开的面板。
 *
 * 装配阶段（phase === 'installing'）它同时是操作面：能装的人亮起来，点谁就装给谁。
 */
import * as PIXI from 'pixi.js';
import { MOD_SLOTS_PER_HERO } from '@/balance/combat';
import { abilityTag } from '@/balance/mods';
import { fillContain, modTex } from '@/core/TextureLoader';
import { canInstallOn, teamInOrder, type HeroUnit, type RunState } from '@/game/BattleEngine';
import { bindPointerTap } from '@/minigame';
import { GOLD, plate } from '@/ui/paint';

const CARD_W = 222;
const CARD_H = 116;
const GAP = 10;
const DOCK_H = 132;

function text(size: number, color = 0xffffff, bold = false): PIXI.Text {
  return new PIXI.Text('', {
    fontFamily: 'sans-serif',
    fontSize: size,
    fontWeight: bold ? 'bold' : 'normal',
    fill: color,
  });
}

export class ModDock extends PIXI.Container {
  private readonly _onTap: (heroId: string) => void;

  constructor(onTap: (heroId: string) => void) {
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
    const team = teamInOrder(state);
    this.visible = team.length > 0 && state.phase !== 'picking';
    if (!this.visible) return;

    const installing = state.phase === 'installing';
    const g = new PIXI.Graphics();
    plate(g, 12, 0, 726, DOCK_H, 16, installing ? 0.92 : 0.8);
    this.addChild(g);

    const cap = text(18, installing ? GOLD : 0xb8a888, installing);
    cap.position.set(26, 8);
    cap.text = installing
      ? `装给谁？（每人最多 ${MOD_SLOTS_PER_HERO} 件）`
      : selected
        ? '点另一个人换队列位置 · 再点自己取消'
        : '队列从上到下 · 队首替后面的人挨刀';
    this.addChild(cap);

    const totalW = team.length * CARD_W + (team.length - 1) * GAP;
    const startX = (750 - totalW) / 2;
    team.forEach((h, i) => {
      const canTake = canInstallOn(h);
      const card = this._card(h, i, selected === h.def.id, installing, canTake);
      card.position.set(startX + i * (CARD_W + GAP), 30);
      this.addChild(card);
      if (!installing || canTake) {
        bindPointerTap(card, () => this._onTap(h.def.id));
      }
    });
  }

  private _card(
    h: HeroUnit,
    order: number,
    picked: boolean,
    installing: boolean,
    canTake: boolean,
  ): PIXI.Container {
    const box = new PIXI.Container();
    box.eventMode = 'static';
    // 装配阶段把装不下的人压暗：可选项一眼看得出来，省掉一次无效点击
    const dim = installing && !canTake;
    const edge = picked ? GOLD : installing && canTake ? 0x9be08a : 0x3a3428;

    const bg = new PIXI.Graphics();
    bg.beginFill(0x1c1610, dim ? 0.5 : 0.92).drawRoundedRect(0, 0, CARD_W, CARD_H, 12).endFill();
    bg.lineStyle(picked || (installing && canTake) ? 3 : 1.5, edge, dim ? 0.35 : 0.95)
      .drawRoundedRect(0, 0, CARD_W, CARD_H, 12)
      .lineStyle(0);
    box.addChild(bg);

    const seat = text(15, order === 0 ? GOLD : 0x8a8270, true);
    seat.position.set(10, 8);
    seat.text = order === 0 ? '队首' : `第 ${order + 1}`;
    seat.alpha = dim ? 0.5 : 1;
    box.addChild(seat);

    const name = text(21, h.alive ? 0xffffff : 0x6b7394, true);
    name.position.set(64, 5);
    name.text = h.def.name;
    name.alpha = dim ? 0.5 : 1;
    box.addChild(name);

    const tags = text(15, 0xd7c9a8);
    tags.position.set(10, 34);
    tags.style.wordWrap = true;
    tags.style.wordWrapWidth = CARD_W - 20;
    tags.style.lineHeight = 20;
    tags.text = h.mods.length > 0
      ? h.mods.map((m) => m.name).join('、')
      : `${h.def.skillName}（还没改过）`;
    tags.alpha = dim ? 0.5 : 1;
    box.addChild(tags);

    // 当前实际在干什么：改装件可能已经把起手定位改掉了，这里说的是「现在」
    const now = text(13, GOLD);
    now.position.set(10, CARD_H - 22);
    now.text = h.stats.range <= 1 ? `贴脸打 · ${abilityTag(h.def.skill)}` : `射程 ${h.stats.range} 格`;
    now.alpha = dim ? 0.5 : 1;
    box.addChild(now);

    // 改装格：空格看得出还能装几件，已装的直接摆那件破烂的图。
    // 名字列表说不清「他身上挂了什么」，认物件比认文字快得多。
    const slot = 26;
    const inner = slot - 4;
    const slotsX = CARD_W - 8 - MOD_SLOTS_PER_HERO * slot;
    for (let i = 0; i < MOD_SLOTS_PER_HERO; i += 1) {
      const mod = h.mods[i];
      const x = slotsX + i * slot;
      const frame = new PIXI.Graphics();
      frame
        .beginFill(mod ? 0x3d3320 : 0x2a2418, dim ? 0.4 : 0.9)
        .drawRoundedRect(x, 8, inner, inner, 4)
        .endFill();
      if (mod) frame.lineStyle(1.5, GOLD, dim ? 0.4 : 0.95).drawRoundedRect(x, 8, inner, inner, 4);
      box.addChild(frame);

      const t = mod ? modTex(mod.id) : null;
      if (t?.baseTexture.valid && t.width > 1) {
        const icon = new PIXI.Graphics();
        fillContain(icon, t, x + inner / 2, 8 + inner - 2, inner - 4, inner - 4);
        icon.alpha = dim ? 0.4 : 1;
        box.addChild(icon);
      }
    }

    return box;
  }
}
