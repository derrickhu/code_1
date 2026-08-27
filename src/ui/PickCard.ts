/**
 * 三选一的卡面。装给谁改成点底部栏上的人，不再单独铺人卡。
 *
 * 从 BattleScene 里拆出来的纯构建函数：给数据、还一个 Container，
 * 不读场景状态、不改引擎。战斗场景还要继续长（召唤物、敌人行为分化都要加表现），
 * 卡面这块基本定型了，先挪出去，别一起涨。
 *
 * 卡面的一条硬规矩：**「装上会变成什么」比效果数值更显眼**。
 * 玩家要的是「三婶装上高压锅会变成什么」，不是「攻击 +12%」。
 */

import * as PIXI from 'pixi.js';
import { SLOT_NAME } from '@/balance/combat';
import { comboTeaser, installForecast } from '@/balance/forecast';
import { getHero } from '@/balance/heroes';
import { abilityTag, getMod, masteredMod, starMarks, type ModDef } from '@/balance/mods';
import type { PickOption } from '@/balance/picker';
import type { HeroUnit } from '@/game/BattleEngine';
import { addFitPortrait, fillContain, heroTex, modTex } from '@/core/TextureLoader';
import { GOLD, label, villagerColor } from './paint';

export interface CardInfo {
  title: string;
  subtitle: string;
  desc: string;
  color: number;
  /** 装上/叫来之后会变成什么。卡面上最重的一行 */
  becomes?: string;
}

/** 一张牌该怎么说。team 只用来提示「和身上已有的破烂能凑出什么」 */
export function describePick(
  opt: PickOption,
  team: readonly HeroUnit[],
  stars: Readonly<Record<string, number>> = {},
): CardInfo {
  if (opt.kind === 'mod') {
    const m = masteredMod(getMod(opt.modId), stars[opt.modId] ?? 0);
    const kindName = m.kind === 'pivot' ? '改打法'
      : m.kind === 'output' ? '更能打'
        : m.kind === 'tanky' ? '更能挨' : '帮全队';
    const tease = comboTeaser(team, m.id);
    return {
      title: `${m.name}${starMarks(stars[opt.modId] ?? 0)}`,
      subtitle: kindName,
      desc: m.desc,
      color: GOLD,
      becomes: tease ? `${m.becomes} · ${tease}` : m.becomes,
    };
  }
  const def = getHero(opt.heroId);
  return {
    title: def.name,
    subtitle: `${def.job} · ${def.range <= 1 ? '贴脸' : `射程 ${def.range}`} · ${abilityTag(def.skill)}`,
    desc: def.skillDesc,
    color: villagerColor(def.id),
    becomes: def.eats,
  };
}

/**
 * 三选一的一张牌。
 *
 * 立绘、正文、底条各占一段，正文再长也只在自己那一段里换行，
 * 不许压到金条或卡边 —— 六个村民的技能说明长短差得多。
 */
export function buildPickCard(
  opt: PickOption,
  w: number,
  h: number,
  team: readonly HeroUnit[],
  picked?: number,
  stars: Readonly<Record<string, number>> = {},
): PIXI.Container {
  const card = new PIXI.Container();
  card.eventMode = 'static';

  const info = describePick(opt, team, stars);
  const compact = h < 340;
  const faceH = compact ? 142 : 208;
  const tagH = info.becomes ? (compact ? 44 : 54) : 0;
  const tagTop = h - 10 - tagH;
  const textTop = faceH + 8;
  const wrapW = w - 32;

  const bg = new PIXI.Graphics();
  bg.beginFill(0x1a0e08, 0.35).drawRoundedRect(4, 8, w, h, 22).endFill();
  bg.beginFill(0xfff6df).drawRoundedRect(0, 0, w, h, 20).endFill();
  bg.beginFill(info.color, 0.18).drawRoundedRect(8, 8, w - 16, faceH - 10, 16).endFill();
  bg.lineStyle(6, info.color, 1).drawRoundedRect(3, 3, w - 6, h - 6, 18).lineStyle(0);
  card.addChild(bg);

  // 人按整身放进框，不裁头；破烂是个物件，同样完整居中
  const portrait = opt.kind === 'recruit' ? heroTex(opt.heroId) : modTex(opt.modId);
  const drawable = portrait?.baseTexture.valid && portrait.width > 1 ? portrait : null;
  if (drawable && opt.kind === 'recruit') {
    addFitPortrait(card, drawable, 10, 10, w - 20, faceH - 16, 14);
  } else if (drawable) {
    const g = new PIXI.Graphics();
    fillContain(g, drawable, w / 2, faceH - 22, w - 56, faceH - 52);
    card.addChild(g);
  } else {
    const swatch = new PIXI.Graphics();
    swatch.beginFill(info.color, 0.9).drawRoundedRect(w / 2 - 40, 56, 80, 80, 18).endFill();
    card.addChild(swatch);
  }

  const name = label(compact ? 22 : 24, 0x2a160c, true);
  name.anchor.set(0.5, 0);
  name.position.set(w / 2, textTop);
  name.style.wordWrap = true;
  name.style.wordWrapWidth = wrapW;
  name.style.align = 'center';
  name.style.lineHeight = 28;
  name.text = info.title;
  card.addChild(name);

  const sub = label(compact ? 15 : 16, 0x8a5a2b);
  sub.anchor.set(0.5, 0);
  sub.position.set(w / 2, textTop + (compact ? 26 : 30));
  sub.style.wordWrap = true;
  sub.style.wordWrapWidth = wrapW;
  sub.style.align = 'center';
  sub.text = info.subtitle;
  card.addChild(sub);

  const desc = label(compact ? 15 : 16, 0x3d2a1c);
  desc.anchor.set(0.5, 0);
  desc.position.set(w / 2, textTop + (compact ? 46 : 52));
  desc.style.wordWrap = true;
  desc.style.wordWrapWidth = wrapW;
  desc.style.breakWords = true;
  desc.style.align = 'center';
  desc.style.lineHeight = 21;
  desc.text = info.desc;
  card.addChild(desc);

  // 正文最多铺到金条上方，多出来的直接裁掉，避免再画出卡
  const descTop = compact ? textTop + 46 : textTop + 52;
  const descClip = new PIXI.Graphics();
  descClip.beginFill(0xffffff).drawRect(12, descTop, w - 24, tagTop - (descTop + 4)).endFill();
  card.addChild(descClip);
  desc.mask = descClip;

  if (info.becomes) {
    const tagBg = new PIXI.Graphics();
    tagBg.beginFill(GOLD, 0.9).drawRoundedRect(10, tagTop, w - 20, tagH, 12).endFill();
    const tag = label(compact ? 14 : 15, 0x2a160c, true);
    tag.anchor.set(0.5);
    tag.position.set(w / 2, tagTop + tagH / 2);
    tag.style.wordWrap = true;
    tag.style.wordWrapWidth = w - 36;
    tag.style.breakWords = true;
    tag.style.align = 'center';
    tag.style.lineHeight = 20;
    tag.text = info.becomes;
    card.addChild(tagBg, tag);
  }

  if (picked !== undefined) {
    const ring = new PIXI.Graphics();
    ring.lineStyle(7, GOLD, 1).drawRoundedRect(2, 2, w - 4, h - 4, 18).lineStyle(0);
    card.addChild(ring);
    const badge = new PIXI.Graphics();
    badge.beginFill(GOLD).drawCircle(w - 22, 22, 16).endFill();
    const n = label(18, 0x2a160c, true);
    n.anchor.set(0.5);
    n.position.set(w - 22, 22);
    n.text = String(picked + 1);
    card.addChild(badge, n);
  }

  return card;
}

/**
 * 「焊给谁」的一张人卡。卡边颜色就是这件装他身上值不值：
 * 绿=正合适、灰=浪费、金=一般。三个人说法不一样，这一步才是主体验。
 */
export function buildInstallCard(
  h: HeroUnit,
  mod: ModDef,
  w: number,
  hgt: number,
): PIXI.Container {
  const card = new PIXI.Container();
  card.eventMode = 'static';
  const forecast = installForecast(h, mod);
  const edge = forecast.fit === 'waste' ? 0x8a90a8 : forecast.fit === 'good' ? 0x6fbf73 : GOLD;
  const faceH = 168;

  const bg = new PIXI.Graphics();
  bg.beginFill(0x1a0e08, 0.35).drawRoundedRect(4, 8, w, hgt, 22).endFill();
  bg.beginFill(0xfff6df).drawRoundedRect(0, 0, w, hgt, 20).endFill();
  bg.beginFill(edge, 0.18).drawRoundedRect(8, 8, w - 16, faceH - 10, 16).endFill();
  bg.lineStyle(6, edge, 1).drawRoundedRect(3, 3, w - 6, hgt - 6, 18).lineStyle(0);
  card.addChild(bg);

  const portrait = heroTex(h.def.id);
  const drawable = portrait?.baseTexture.valid && portrait.width > 1 ? portrait : null;
  if (drawable) {
    addFitPortrait(card, drawable, 10, 10, w - 20, faceH - 16, 14);
  } else {
    const swatch = new PIXI.Graphics();
    swatch.beginFill(villagerColor(h.def.id), 0.9).drawRoundedRect(w / 2 - 40, 40, 80, 80, 18).endFill();
    card.addChild(swatch);
  }

  const name = label(22, 0x2a160c, true);
  name.anchor.set(0.5, 0);
  name.position.set(w / 2, faceH + 6);
  name.text = `${h.def.name} · ${SLOT_NAME[h.slot] ?? ''}`;
  card.addChild(name);

  const tagBg = new PIXI.Graphics();
  tagBg.beginFill(edge, 0.92).drawRoundedRect(10, hgt - 78, w - 20, 64, 12).endFill();
  const tag = label(16, forecast.fit === 'good' ? 0x143018 : 0x2a160c, true);
  tag.anchor.set(0.5);
  tag.position.set(w / 2, hgt - 46);
  tag.style.wordWrap = true;
  tag.style.wordWrapWidth = w - 36;
  tag.style.breakWords = true;
  tag.style.align = 'center';
  tag.style.lineHeight = 22;
  tag.text = forecast.line;
  card.addChild(tagBg, tag);
  return card;
}
