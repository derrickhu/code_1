/**
 * 村子升级的那一块牌。出现在刚打出经验的弹弓摊上，点一下或停一会就收。
 */
import * as PIXI from 'pixi.js';
import { villageRiseLines, type VillageRise } from '@/balance/villageRise';
import { TweenManager, Ease } from '@/core/TweenManager';
import { uiTex } from '@/core/TextureLoader';
import { fillSprite, painted } from '@/ui/paint';
import { bindPointerTap } from '@/utils/bindPointerTap';
import { safeDestroy } from '@/utils/safeDestroy';

const CREAM = 0xfff4c4;

export function mountVillageRise(
  parent: PIXI.Container,
  rise: VillageRise,
  viewH: number,
  done: () => void,
): void {
  const root = new PIXI.Container();
  root.eventMode = 'static';
  root.hitArea = new PIXI.Rectangle(0, 0, 750, viewH);
  parent.addChild(root);

  const lines = villageRiseLines(rise);
  const w = 560;
  const h = 78 + lines.length * 32;
  const cx = 375;
  const cy = Math.round(viewH * 0.42);

  const plate = new PIXI.Container();
  plate.position.set(cx, cy);
  root.addChild(plate);
  if (!fillSprite(plate, uiTex('rust_panel'), 0, 0, w, h)) {
    const g = new PIXI.Graphics();
    g.beginFill(0x2a1c12, 0.94).drawRoundedRect(-w / 2, -h / 2, w, h, 12).endFill();
    plate.addChild(g);
  }

  const title = painted(28, 0xffe08a, '#1a1008', 4);
  title.anchor.set(0.5, 0);
  title.position.set(0, -h / 2 + 18);
  title.text = `村子 ${rise.to} 级`;
  plate.addChild(title);

  lines.forEach((text, i) => {
    const row = painted(18, CREAM, '#1a1008', 3);
    row.anchor.set(0.5, 0);
    row.position.set(0, -h / 2 + 62 + i * 32);
    row.text = text;
    plate.addChild(row);
  });

  plate.scale.set(0.86);
  TweenManager.to({
    target: plate.scale,
    props: { x: 1, y: 1 },
    duration: 0.28,
    ease: Ease.easeOutBack,
  });

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    TweenManager.cancelTarget(hold);
    safeDestroy(root, { children: true });
    done();
  };
  bindPointerTap(root, () => close(), { silent: true });

  const hold = { t: 0 };
  TweenManager.to({
    target: hold,
    props: { t: 1 },
    duration: 2.6,
    onComplete: () => {
      if (!root.destroyed) close();
    },
  });
}
