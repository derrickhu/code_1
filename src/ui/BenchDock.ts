/**
 * 替补底栏。编队在战场上完成，这里只露出还没上场的人。
 * 不是弹层：不挡战场、不要求先按「调整阵容」。
 */
import * as PIXI from 'pixi.js';
import { getCounterMult, type Element } from '@/balance/counters';
import {
  benchOf,
  upcomingWaveElement,
  type HeroUnit,
  type RunState,
} from '@/game/BattleEngine';
import { bindPointerTap } from '@/minigame';
import { addCoverPortrait, heroTex } from '@/core/TextureLoader';
import { skillTag } from '@/balance/heroes';
import { GOLD, plate } from '@/ui/paint';

const CHIP = 72;
const GAP = 12;
const DOCK_H = 108;

function text(size: number, color = 0xffffff, bold = false): PIXI.Text {
  return new PIXI.Text('', {
    fontFamily: 'sans-serif',
    fontSize: size,
    fontWeight: bold ? 'bold' : 'normal',
    fill: color,
  });
}

export class BenchDock extends PIXI.Container {
  private readonly _onPick: (heroId: string) => void;
  private readonly _onWithdraw: () => void;

  constructor(onPick: (heroId: string) => void, onWithdraw: () => void) {
    super();
    this._onPick = onPick;
    this._onWithdraw = onWithdraw;
    this.visible = false;
    this.eventMode = 'static';
  }

  place(y: number): void {
    this.position.set(0, y);
  }

  refresh(state: RunState, selected: string | null): void {
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    const bench = benchOf(state);
    const picked = selected ? state.roster.find((h) => h.def.id === selected) : undefined;
    const onField = picked ? state.deployed.includes(picked) : false;
    const show = bench.length > 0 || !!selected;
    this.visible = show;
    if (!show) return;

    const g = new PIXI.Graphics();
    plate(g, 24, 0, 702, DOCK_H, 16, 0.82);
    this.addChild(g);

    const upcoming = upcomingWaveElement(state.wave);
    const cap = text(18, 0xb8a888);
    cap.position.set(40, 10);
    cap.text = selected
      ? (onField ? '点空位换位 · 点替补换上' : '点场上位置换上')
      : `替补 ${bench.length}`;
    this.addChild(cap);

    if (onField && state.deployed.length > 1) {
      const btn = new PIXI.Container();
      btn.eventMode = 'static';
      const bg = new PIXI.Graphics();
      bg.beginFill(0x3a2018).drawRoundedRect(0, 0, 88, 32, 10).endFill();
      bg.lineStyle(1.5, 0xff8a8a, 0.8).drawRoundedRect(0, 0, 88, 32, 10).lineStyle(0);
      const t = text(18, 0xff8a8a, true);
      t.anchor.set(0.5);
      t.position.set(44, 16);
      t.text = '撤下';
      btn.addChild(bg, t);
      btn.position.set(614, 8);
      this.addChild(btn);
      bindPointerTap(btn, () => this._onWithdraw());
    }

    bench.forEach((hero, i) => {
      const chip = this._chip(hero, upcoming, selected === hero.def.id);
      chip.position.set(40 + i * (CHIP + GAP), 28);
      this.addChild(chip);
      bindPointerTap(chip, () => this._onPick(hero.def.id));
    });
  }

  private _chip(hero: HeroUnit, upcoming: Element | undefined, picked: boolean): PIXI.Container {
    const box = new PIXI.Container();
    box.eventMode = 'static';
    const counters = upcoming ? getCounterMult(hero.def.element, upcoming) > 1 : false;
    const edge = picked ? GOLD : counters ? 0x5ecf7b : 0x3a3428;
    const bg = new PIXI.Graphics();
    bg.beginFill(0x14161f).drawRoundedRect(0, 0, CHIP, CHIP, 12).endFill();
    bg.lineStyle(picked ? 3 : 2, edge, 0.95).drawRoundedRect(0, 0, CHIP, CHIP, 12).lineStyle(0);
    box.addChild(bg);
    const portrait = heroTex(hero.def.id);
    if (portrait && portrait.baseTexture.valid && portrait.width > 1) {
      addCoverPortrait(box, portrait, 4, 4, CHIP - 8, CHIP - 8, 10);
    }
    if (counters) {
      const tag = text(14, 0x0b0f18, true);
      tag.anchor.set(0.5);
      tag.position.set(CHIP - 14, 12);
      tag.text = '克';
      const tagBg = new PIXI.Graphics();
      tagBg.beginFill(0x5ecf7b).drawRoundedRect(CHIP - 28, 2, 26, 20, 8).endFill();
      box.addChild(tagBg, tag);
    }
    const skill = text(12, GOLD, true);
    skill.anchor.set(0.5);
    skill.position.set(CHIP / 2, CHIP - 10);
    skill.text = skillTag(hero.def.skill);
    const skillBg = new PIXI.Graphics();
    skillBg.beginFill(0x0b0f18, 0.72).drawRoundedRect(8, CHIP - 20, CHIP - 16, 16, 6).endFill();
    box.addChild(skillBg, skill);
    return box;
  }
}
