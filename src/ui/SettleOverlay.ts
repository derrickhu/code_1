import * as PIXI from 'pixi.js';
import { bindPointerTap } from '@/minigame';
import type { RunMemory } from '@/core/RunMemory';
import type { LoseReason, RunState } from '@/game/BattleEngine';
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
  private readonly _onDouble: () => Promise<boolean>;
  private readonly _onJunkyard: () => Promise<boolean>;
  private readonly _onYard: () => void;
  private _busy = false;

  constructor(
    onReplay: () => void,
    onDouble: () => Promise<boolean>,
    onJunkyard: () => Promise<boolean>,
    onYard: () => void,
  ) {
    super();
    this._onReplay = onReplay;
    this._onDouble = onDouble;
    this._onJunkyard = onJunkyard;
    this._onYard = onYard;
    this.visible = false;
    this.eventMode = 'static';
  }

  show(
    state: RunState,
    memory: RunMemory,
    height: number,
    opts: {
      scrap: number;
      earned: number;
      spent: number;
      canDouble: boolean;
      canJunkyard: boolean;
      loseReason?: LoseReason;
      nextMove?: string;
      yardScrap?: number;
      yardIn?: number;
      yardGoal?: string;
    },
  ): void {
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.visible = true;
    this._busy = false;

    const dim = new PIXI.Graphics();
    dim.beginFill(0x05060c, 0.82).drawRect(0, 0, 750, height).endFill();
    const panelW = 620;
    const panelH = (opts.canDouble ? 700 : 640) + (opts.nextMove ? 28 : 0) + (opts.canJunkyard ? 52 : 0);
    const px = (750 - panelW) / 2;
    const py = height * 0.14;
    plate(dim, px, py, panelW, panelH, 22, 0.92);
    this.addChild(dim);

    const won = state.phase === 'won';
    const title = text(36, won ? GOLD : 0xff8a8a, true);
    title.anchor.set(0.5);
    title.position.set(375, py + 52);
    title.text = won
      ? '整挺好'
      : opts.loseReason === 'timeout'
        ? `这波推不动 · 第 ${state.wave} 波`
        : `这套配崩了 · 第 ${state.wave} 波`;
    this.addChild(title);

    const roster = [...state.team].sort((a, b) => a.slot - b.slot);
    const core = [...state.team].sort((a, b) => {
      if (b.mods.length !== a.mods.length) return b.mods.length - a.mods.length;
      return a.slot - b.slot;
    })[0];
    const coreMod = core?.mods[core.mods.length - 1];
    if (core && core.mods.length > 0) {
      const why = text(20, GOLD, true);
      why.anchor.set(0.5);
      why.position.set(375, py + 88);
      why.text = `本局靠${core.def.name}的${coreMod?.name ?? '那套'}`;
      this.addChild(why);
    }

    if (opts.nextMove) {
      const tip = text(18, 0xfff4c4, true);
      tip.anchor.set(0.5);
      tip.position.set(375, py + (core && core.mods.length > 0 ? 114 : 90));
      tip.text = opts.nextMove;
      this.addChild(tip);
    }

    const rowH = 78;
    const listY = py + (core && core.mods.length > 0 ? 118 : 100) + (opts.nextMove ? 28 : 0);

    roster.forEach((h, i) => {
      const y = listY + i * rowH;
      const face = heroTex(h.def.id);
      if (face?.baseTexture.valid && face.width > 1) {
        const g = new PIXI.Graphics();
        fillContain(g, face, px + 66, y + 64, 62, 66);
        this.addChild(g);
      }

      const name = text(22, 0xffffff, true);
      name.position.set(px + 108, y + 6);
      name.text = h.def.name;
      this.addChild(name);

      const line = text(17, h.mods.length > 0 ? GOLD : 0x8a90a8);
      line.position.set(px + 108, y + 36);
      line.style.wordWrap = true;
      line.style.wordWrapWidth = 244;
      line.text = h.mods.length > 0 ? h.mods.map((m) => m.name).join('、') : '一件没改过';
      this.addChild(line);

      const cell = 40;
      const x0 = px + panelW - 28 - h.mods.length * cell;
      h.mods.forEach((m, k) => {
        const t = modTex(m.id);
        if (!t?.baseTexture.valid || t.width <= 1) return;
        const g = new PIXI.Graphics();
        fillContain(g, t, x0 + k * cell + cell / 2, y + 58, cell - 8, cell - 8);
        this.addChild(g);
      });
    });

    const scrapY = listY + roster.length * rowH + 6;
    const scrapLine = text(22, 0xfff4c4, true);
    scrapLine.anchor.set(0.5, 0);
    scrapLine.position.set(375, scrapY);
    scrapLine.name = 'scrap-line';
    scrapLine.text = opts.yardIn
      ? `进废品堆 +${opts.yardIn} · 村里现有 ${opts.yardScrap ?? 0}`
      : `本局攒了 ${opts.earned} · 花了 ${opts.spent} · 剩 ${opts.scrap}`;
    this.addChild(scrapLine);

    const foot = text(18, 0xd7dcee);
    foot.anchor.set(0.5, 0);
    foot.position.set(375, scrapY + 32);
    foot.style.align = 'center';
    foot.text = [
      roster.length > 0 ? `一局改了 ${state.stats.installs} 件` : '一个人都没叫',
      memory.highestWave > 0 ? `历史最高第 ${memory.highestWave} 波` : '',
      opts.yardGoal ?? '',
    ].filter(Boolean).join(' · ');
    this.addChild(foot);

    let extra = 0;
    if (opts.canJunkyard) {
      const yard = new PIXI.Container();
      yard.eventMode = 'static';
      const yl = text(18, GOLD, true);
      yl.anchor.set(0.5);
      yl.text = '看一段，下局翻一件池外破烂';
      yard.addChild(yl);
      yard.position.set(375, scrapY + 64);
      this.addChild(yard);
      extra = 36;
      bindPointerTap(yard, async () => {
        if (this._busy) return;
        this._busy = true;
        const ok = await this._onJunkyard();
        this._busy = false;
        if (!ok) return;
        yl.text = '下局三选一必出一件池外破烂';
        yard.eventMode = 'none';
      });
    }

    let btnY = scrapY + 96 + extra;
    if (opts.canDouble) {
      const doubled = opts.scrap * 2;
      const dub = new PIXI.Container();
      dub.eventMode = 'static';
      dub.name = 'double-btn';
      const dbg = new PIXI.Graphics();
      goldBtn(dbg, -170, -40, 340, 80);
      const dl = text(24, GOLD, true);
      dl.anchor.set(0.5);
      dl.text = `看完下局带 ${doubled} 废品`;
      dub.addChild(dbg, dl);
      dub.position.set(375, scrapY + 96 + extra);
      this.addChild(dub);
      bindPointerTap(dub, async () => {
        if (this._busy) return;
        this._busy = true;
        const ok = await this._onDouble();
        this._busy = false;
        if (!ok) return;
        scrapLine.text = `下局开场带 ${doubled} 废品 · 废品堆还在`;
        dub.visible = false;
      });
      btnY = scrapY + 186 + extra;
    }

    const shop = new PIXI.Container();
    shop.eventMode = 'static';
    const ybg = new PIXI.Graphics();
    goldBtn(ybg, -150, -36, 300, 72);
    const sl = text(24, GOLD, true);
    sl.anchor.set(0.5);
    sl.text = '回村子';
    shop.addChild(ybg, sl);
    shop.position.set(375, btnY);
    this.addChild(shop);
    bindPointerTap(shop, () => this._onYard());

    const replay = new PIXI.Container();
    replay.eventMode = 'static';
    const bg = new PIXI.Graphics();
    goldBtn(bg, -150, -36, 300, 72);
    const label = text(24, GOLD, true);
    label.anchor.set(0.5);
    label.text = '再来一局';
    replay.addChild(bg, label);
    replay.position.set(375, btnY + 84);
    this.addChild(replay);
    bindPointerTap(replay, () => this._onReplay());
  }

  hide(): void {
    this.visible = false;
    this._busy = false;
    this.removeChildren().forEach((c) => c.destroy({ children: true }));
  }
}
