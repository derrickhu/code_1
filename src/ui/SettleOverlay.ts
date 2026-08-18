import * as PIXI from 'pixi.js';
import { bindPointerTap } from '@/minigame';
import type { RunMemory } from '@/core/RunMemory';
import type { RunState } from '@/game/BattleEngine';
import { GOLD, goldBtn, plate } from '@/ui/paint';

function text(size: number, color = 0xffffff, bold = false): PIXI.Text {
  return new PIXI.Text('', {
    fontFamily: 'sans-serif',
    fontSize: size,
    fontWeight: bold ? 'bold' : 'normal',
    fill: color,
  });
}

export class SettleOverlay extends PIXI.Container {
  private readonly _onReplay: () => void;

  constructor(onReplay: () => void) {
    super();
    this._onReplay = onReplay;
    this.visible = false;
    this.eventMode = 'static';
  }

  show(state: RunState, memory: RunMemory, height: number): void {
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.visible = true;

    const dim = new PIXI.Graphics();
    dim.beginFill(0x05060c, 0.82).drawRect(0, 0, 750, height).endFill();
    const panelW = 620;
    const panelH = 520;
    const px = (750 - panelW) / 2;
    const py = height * 0.18;
    plate(dim, px, py, panelW, panelH, 22, 0.92);
    this.addChild(dim);

    const won = state.phase === 'won';
    const title = text(40, won ? GOLD : 0xff8a8a, true);
    title.anchor.set(0.5);
    title.position.set(375, py + 56);
    title.text = won ? '守住了' : `被突破 · 第 ${state.wave} 波`;
    this.addChild(title);

    const names = state.roster.map((h) => `${h.def.name} Lv${h.level}`).join('  ');
    const body = text(24, 0xd7dcee);
    body.anchor.set(0.5, 0);
    body.position.set(375, py + 120);
    body.style.wordWrap = true;
    body.style.wordWrapWidth = 540;
    body.style.align = 'center';
    const rate = state.stats.hits > 0
      ? Math.round((state.stats.counterHits / state.stats.hits) * 100)
      : 0;
    body.text = [
      names || '没有英雄',
      `克制命中 ${state.stats.counterHits} 次（占 ${rate}%）`,
      `漏怪 ${state.stats.leaks} 次`,
      memory.highestWave > 0 ? `历史最高第 ${memory.highestWave} 波` : '',
    ].filter(Boolean).join('\n\n');
    this.addChild(body);

    const btn = new PIXI.Container();
    btn.eventMode = 'static';
    const bg = new PIXI.Graphics();
    goldBtn(bg, -150, -44, 300, 88);
    const label = text(32, GOLD, true);
    label.anchor.set(0.5);
    label.text = '再来一局';
    btn.addChild(bg, label);
    btn.position.set(375, py + panelH - 70);
    this.addChild(btn);
    bindPointerTap(btn, () => this._onReplay());
  }

  hide(): void {
    this.visible = false;
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
  }
}
