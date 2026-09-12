/**
 * 弹弓摊亮奖层。对标爪机揭幕 / 抽卡停格：压暗、卡面、奖章、扫光。
 * 经济不在这里，只负责「看起来像拿到了东西」。
 */
import * as PIXI from 'pixi.js';
import {
  prizeAccent, prizeBanner, prizeSub, prizeTitle, prizeTier,
  type PrizeChip, type PrizeTier, type ShotResult,
} from '@/balance/stall';
import { TweenManager, Ease } from '@/core/TweenManager';
import { uiTex, type UiName } from '@/core/TextureLoader';
import { fitSprite, painted } from '@/ui/paint';
import { safeDestroy } from '@/utils/safeDestroy';

const CHIP_ICON: Readonly<Partial<Record<string, UiName>>> = {
  scrap: 'icon_scrap',
  parts: 'icon_parts',
  credits: 'icon_credits',
};

export function makeVeil(height: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.beginFill(0x0a0604, 0.62).drawRect(0, 0, 750, Math.max(1400, height)).endFill();
  g.eventMode = 'none';
  g.alpha = 0;
  return g;
}

export function paintRays(color: number, radius: number, n: number): PIXI.Graphics {
  const g = new PIXI.Graphics();
  g.blendMode = PIXI.BLEND_MODES.ADD;
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = a0 + Math.PI / n * 0.42;
    g.beginFill(color, i % 2 === 0 ? 0.22 : 0.12);
    g.moveTo(0, 0);
    g.lineTo(Math.cos(a0) * radius, Math.sin(a0) * radius);
    g.lineTo(Math.cos(a1) * radius, Math.sin(a1) * radius);
    g.closePath();
    g.endFill();
  }
  return g;
}

export function shineSweep(parent: PIXI.Container, w: number, h: number): void {
  const bar = new PIXI.Graphics();
  bar.beginFill(0xffffff, 0.28).drawRoundedRect(-14, -h / 2, 28, h, 10).endFill();
  bar.blendMode = PIXI.BLEND_MODES.ADD;
  bar.x = -w / 2 - 20;
  bar.eventMode = 'none';
  parent.addChild(bar);
  TweenManager.to({
    target: bar,
    props: { x: w / 2 + 20 },
    duration: 0.42,
    delay: 0.1,
    ease: Ease.easeOutCubic,
    onComplete: () => safeDestroy(bar),
  });
}

export function paintMedal(root: PIXI.Container, chip: PrizeChip, tint: number): void {
  const glow = new PIXI.Graphics();
  glow.beginFill(tint, 0.4).drawCircle(0, -8, 30).endFill();
  glow.blendMode = PIXI.BLEND_MODES.ADD;
  root.addChild(glow);

  const coin = new PIXI.Graphics();
  coin.beginFill(0x1a1008, 0.92).drawCircle(0, -8, 22).endFill();
  coin.lineStyle(2.6, tint, 1).drawCircle(0, -8, 20);
  coin.lineStyle(1, 0xfff4c4, 0.45).drawCircle(0, -8, 15);
  coin.lineStyle(0);
  coin.beginFill(tint, 0.16).drawCircle(0, -8, 14).endFill();
  root.addChild(coin);

  const icon = CHIP_ICON[chip.kind];
  if (!fitSprite(root, icon ? uiTex(icon) : null, 0, -8, 26, 26)) {
    const dot = new PIXI.Graphics();
    dot.beginFill(tint).drawCircle(0, -8, 8).endFill();
    root.addChild(dot);
  }

  const t = painted(16, tint, '#1a1008', 3);
  t.anchor.set(0.5, 0);
  t.position.set(0, 16);
  t.text = `+${chip.amount}`;
  root.addChild(t);
}

export function playPrizeCard(
  parent: PIXI.Container,
  result: ShotResult,
  cy: number,
): PIXI.Container {
  const tier = prizeTier(result.gain);
  const accent = prizeAccent(tier);
  const jackpot = tier === 'jackpot';
  const root = new PIXI.Container();
  root.position.set(375, cy);
  root.eventMode = 'none';

  const rays = paintRays(accent, jackpot ? 240 : 180, jackpot ? 18 : 12);
  rays.alpha = jackpot ? 0.7 : 0.5;
  root.addChild(rays);
  TweenManager.to({
    target: rays,
    props: { rotation: 1.05 },
    duration: 1.35,
    ease: Ease.linear,
  });

  const w = jackpot ? 500 : 390;
  const h = jackpot ? 228 : 176;
  const plate = new PIXI.Graphics();
  plate.beginFill(accent, 0.2).drawRoundedRect(-w / 2 - 10, -h / 2 - 10, w + 20, h + 20, 24).endFill();
  plate.beginFill(0x120c08, 0.94).drawRoundedRect(-w / 2, -h / 2, w, h, 18).endFill();
  plate.lineStyle(3, accent, 0.95).drawRoundedRect(-w / 2, -h / 2, w, h, 18);
  plate.lineStyle(1.2, 0xfff4c4, 0.4).drawRoundedRect(-w / 2 + 7, -h / 2 + 7, w - 14, h - 14, 14);
  plate.lineStyle(0);
  root.addChild(plate);

  const title = painted(18, accent, '#1a1008', 3);
  title.anchor.set(0.5);
  title.position.set(0, -h / 2 + 30);
  title.text = prizeTitle(result) ?? '';
  root.addChild(title);

  const iconName: UiName = result.gain.credits > 0 ? 'icon_credits' : 'icon_parts';
  if (!fitSprite(root, uiTex(iconName), 0, -6, jackpot ? 78 : 64, jackpot ? 78 : 64)) {
    const orb = new PIXI.Graphics();
    orb.beginFill(accent, 0.85).drawCircle(0, -6, 28).endFill();
    root.addChild(orb);
  }

  const amt = painted(jackpot ? 46 : 34, accent, '#1a1008', 6);
  amt.anchor.set(0.5);
  amt.position.set(0, 52);
  const n = Math.round(result.gain.credits > 0 ? result.gain.credits : result.gain.parts);
  amt.text = `+${n}`;
  root.addChild(amt);

  const sub = prizeSub(result);
  if (sub) {
    const s = painted(16, 0xf0e6c0, '#1a1008', 3);
    s.anchor.set(0.5);
    s.position.set(0, h / 2 - 26);
    s.text = sub;
    root.addChild(s);
  } else if (prizeBanner(result)) {
    const s = painted(16, 0xf0e6c0, '#1a1008', 3);
    s.anchor.set(0.5);
    s.position.set(0, h / 2 - 26);
    s.text = prizeBanner(result)!;
    root.addChild(s);
  }

  shineSweep(root, w, h);
  parent.addChild(root);
  root.scale.set(0.32);
  root.alpha = 0;
  const hold = { s: 0.32, a: 0 };
  TweenManager.to({
    target: hold,
    props: { s: 1, a: 1 },
    duration: 0.28,
    ease: Ease.easeOutBack,
    onUpdate: () => {
      root.scale.set(hold.s);
      root.alpha = hold.a;
    },
    onComplete: () => {
      TweenManager.to({
        target: hold,
        props: { a: 0, s: 1.06 },
        duration: 0.24,
        delay: jackpot ? 0.48 : 0.32,
        onUpdate: () => {
          root.alpha = hold.a;
          root.scale.set(hold.s);
        },
        onComplete: () => safeDestroy(root, { children: true }),
      });
    },
  });
  return root;
}

export function drawBand(g: PIXI.Graphics, dy: number, max: number): void {
  g.clear();
  if (dy <= 0) return;
  const t = Math.max(0, Math.min(1, dy / max));
  g.lineStyle(3.2 + t * 1.4, 0x5a3828, 0.95);
  g.moveTo(-34, -20);
  g.quadraticCurveTo(0, 12 + t * 10, 34, -20);
  g.lineStyle(2, 0xc4a070, 0.35);
  g.moveTo(-34, -20);
  g.quadraticCurveTo(0, 10 + t * 8, 34, -20);
  g.lineStyle(0);
}

export function ghostDot(parent: PIXI.Container, x: number, y: number, tint: number): void {
  const g = new PIXI.Graphics();
  g.beginFill(tint, 0.55).drawCircle(0, 0, 7).endFill();
  g.blendMode = PIXI.BLEND_MODES.ADD;
  g.position.set(x, y);
  g.eventMode = 'none';
  parent.addChild(g);
  const hold = { a: 0.55, s: 1 };
  TweenManager.to({
    target: hold,
    props: { a: 0, s: 0.3 },
    duration: 0.2,
    ease: Ease.easeOutQuad,
    onUpdate: () => {
      g.alpha = hold.a;
      g.scale.set(hold.s);
    },
    onComplete: () => safeDestroy(g),
  });
}

export function chipTint(kind: PrizeChip['kind']): number {
  if (kind === 'credits') return 0xffe08a;
  if (kind === 'parts') return 0x7ec8ff;
  if (kind === 'scrap') return 0xe8a05a;
  return 0x9be08a;
}

export function needsCard(tier: PrizeTier): boolean {
  return tier === 'rare' || tier === 'jackpot';
}
