import * as PIXI from 'pixi.js';
import { bindPointerTap } from '@/minigame';
import type { RunMemory } from '@/core/RunMemory';
import type { RunState } from '@/game/BattleEngine';
import { fillContain, heroTex, modTex } from '@/core/TextureLoader';
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
    const panelH = 560;
    const px = (750 - panelW) / 2;
    const py = height * 0.18;
    plate(dim, px, py, panelW, panelH, 22, 0.92);
    this.addChild(dim);

    const won = state.phase === 'won';
    const title = text(40, won ? GOLD : 0xff8a8a, true);
    title.anchor.set(0.5);
    title.position.set(375, py + 56);
    title.text = won ? '整挺好' : `这套配崩了 · 第 ${state.wave} 波`;
    this.addChild(title);

    // 结算必须能回答「本局是靠谁加哪件破烂打过来的」（体验目标 §8 验收第一条）。
    // 所以这里是三行「人 + 他身上挂的东西」，而不是一堆战斗统计数字。
    const roster = [...state.team].sort((a, b) => a.slot - b.slot);
    const core = [...state.team].sort((a, b) => {
      if (b.mods.length !== a.mods.length) return b.mods.length - a.mods.length;
      return a.slot - b.slot;
    })[0];
    const coreMod = core?.mods[core.mods.length - 1];
    if (core && core.mods.length > 0) {
      const why = text(20, GOLD, true);
      why.anchor.set(0.5);
      why.position.set(375, py + 92);
      why.text = `本局靠${core.def.name}的${coreMod?.name ?? '那套'}`;
      this.addChild(why);
    }

    const rowH = 84;
    const listY = py + (core && core.mods.length > 0 ? 128 : 104);

    roster.forEach((h, i) => {
      const y = listY + i * rowH;
      const face = heroTex(h.def.id);
      if (face?.baseTexture.valid && face.width > 1) {
        const g = new PIXI.Graphics();
        fillContain(g, face, px + 66, y + 70, 68, 72);
        this.addChild(g);
      }

      const name = text(24, 0xffffff, true);
      name.position.set(px + 112, y + 8);
      name.text = h.def.name;
      this.addChild(name);

      const line = text(18, h.mods.length > 0 ? GOLD : 0x8a90a8);
      line.position.set(px + 112, y + 40);
      line.style.wordWrap = true;
      line.style.wordWrapWidth = 244;
      line.text = h.mods.length > 0 ? h.mods.map((m) => m.name).join('、') : '一件没改过';
      this.addChild(line);

      // 挂在右侧的实物图标：文字说得清装了什么，图才说得清「他成了个什么东西」
      const cell = 42;
      const x0 = px + panelW - 28 - h.mods.length * cell;
      h.mods.forEach((m, k) => {
        const t = modTex(m.id);
        if (!t?.baseTexture.valid || t.width <= 1) return;
        const g = new PIXI.Graphics();
        fillContain(g, t, x0 + k * cell + cell / 2, y + 62, cell - 8, cell - 8);
        this.addChild(g);
      });
    });

    const foot = text(21, 0xd7dcee);
    foot.anchor.set(0.5, 0);
    foot.position.set(375, listY + roster.length * rowH + 8);
    foot.style.align = 'center';
    foot.style.lineHeight = 30;
    foot.text = [
      roster.length > 0 ? `一局改了 ${state.stats.installs} 件` : '一个人都没叫',
      memory.highestWave > 0 ? `历史最高第 ${memory.highestWave} 波` : '',
    ].filter(Boolean).join('\n');
    this.addChild(foot);

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
