/**
 * 战斗场景（色块占位版）
 *
 * 这一版刻意不上美术：先把**信息层次**摆对 —— 哪一波、来什么系、谁能克它、底线还剩多少。
 * 观战类玩法的成败在于「看得懂」，看不懂就只是一堆东西在动。等这套读得通了再换素材，
 * 换的是贴图，不是布局。
 *
 * 渲染层不含任何战斗规则，只读 BattleEngine 的状态。规则改动一律回 BattleEngine。
 */

import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import type { Scene } from '@/core/SceneManager';
import { bindPointerTap } from '@/minigame';
import { ROW_POS, SPAWN_DIST, TICK_MS } from '@/balance/combat';
import { ELEMENT_NAMES, getCounterMult, type Element } from '@/balance/counters';
import { getWave } from '@/balance/enemies';
import { ROLE_NAMES, getHero } from '@/balance/heroes';
import { getTeamBuff, type PickOption } from '@/balance/picker';
import {
  applyPick,
  createRun,
  heroAtk,
  tick,
  upcomingWaveElement,
  type DeployOptions,
  type EnemyUnit,
  type HeroUnit,
  type RunState,
} from '@/game/BattleEngine';

/** 玩家自己选牌，上场则沿用「优先克制」的默认规则 */
const DEPLOY: DeployOptions = { preferCounter: true, shuffle: false };

const ELEMENT_COLOR: Readonly<Record<Element, number>> = {
  flame: 0xff6b4a,
  vine: 0x5ecf7b,
  tide: 0x4aa3ff,
};

const FIELD_TOP = 250;
const FIELD_BOTTOM = 1010;
const COL_X = [190, 375, 560];

/** 敌人横向分 5 道，避免同一波全部重叠成一条线 */
const LANE_X = [150, 262, 375, 488, 600];

function distToY(dist: number): number {
  const t = 1 - Math.max(0, Math.min(SPAWN_DIST, dist)) / SPAWN_DIST;
  return FIELD_TOP + t * (FIELD_BOTTOM - FIELD_TOP);
}

function label(size: number, color = 0xffffff, bold = false): PIXI.Text {
  return new PIXI.Text('', {
    fontFamily: 'sans-serif',
    fontSize: size,
    fontWeight: bold ? 'bold' : 'normal',
    fill: color,
  });
}

export class BattleScene implements Scene {
  readonly name = 'battle';
  readonly container = new PIXI.Container();

  private _state: RunState = createRun(Date.now() >>> 0);
  private _accMs = 0;

  private readonly _field = new PIXI.Graphics();
  private readonly _hud = new PIXI.Container();
  private readonly _pick = new PIXI.Container();

  private readonly _waveText = label(34, 0xffffff, true);
  private readonly _hintText = label(24, 0xffd66b);
  private readonly _baseText = label(30, 0xff7a7a, true);
  private readonly _rosterText = label(20, 0x9aa4bf);
  private readonly _resultText = label(40, 0xffffff, true);

  /** 敌人被命中后的短暂高亮，让「正在被集火」看得出来 */
  private readonly _hitFlash = new Map<number, number>();

  constructor() {
    this.container.addChild(this._field);
    this.container.addChild(this._hud);
    this.container.addChild(this._pick);
    this._buildHud();
  }

  onEnter(): void {
    this._state = createRun(Date.now() >>> 0);
    this._accMs = 0;
    this._hitFlash.clear();
    this._resultText.visible = false;
    this._renderPickCards();
  }

  update(dt: number): void {
    const s = this._state;

    if (s.phase === 'picking') {
      if (this._pick.children.length === 0) this._renderPickCards();
    } else if (s.phase === 'fighting' || s.phase === 'gap') {
      // 按固定步长推进，与批量回归完全一致：掉帧只会让画面变慢，不会改变战斗结果
      this._accMs += dt * 1000;
      let guard = 0;
      while (this._accMs >= TICK_MS && guard++ < 8) {
        this._accMs -= TICK_MS;
        tick(s, DEPLOY);
        this._consumeEvents();
        // 经 tick 后 phase 可能已变，这里必须重新读状态而不是复用上面收窄过的判断
        const phase = this._state.phase;
        if (phase === 'picking') {
          this._renderPickCards();
          break;
        }
        if (phase === 'won' || phase === 'lost') break;
      }
    }

    for (const [id, ms] of this._hitFlash) {
      const left = ms - dt * 1000;
      if (left <= 0) this._hitFlash.delete(id);
      else this._hitFlash.set(id, left);
    }

    this._drawField();
    this._updateHud();
  }

  private _consumeEvents(): void {
    for (const ev of this._state.events) {
      if (ev.kind === 'hit') this._hitFlash.set(ev.enemyId, 120);
    }
    this._state.events.length = 0;
  }

  // ── HUD ───────────────────────────────────────────────

  private _buildHud(): void {
    const top = Math.max(Game.safeTop, 96);

    this._waveText.position.set(40, top);
    this._hintText.position.set(40, top + 44);
    this._baseText.anchor.set(1, 0);
    this._baseText.position.set(710, top);
    this._rosterText.position.set(40, FIELD_BOTTOM + 30);

    this._resultText.anchor.set(0.5);
    this._resultText.position.set(375, 620);
    this._resultText.visible = false;

    this._hud.addChild(
      this._waveText,
      this._hintText,
      this._baseText,
      this._rosterText,
      this._resultText,
    );
  }

  private _updateHud(): void {
    const s = this._state;
    this._waveText.text = `第 ${s.wave} 波`;
    this._baseText.text = `底线 ${s.baseHp} / ${s.maxBaseHp}`;

    if (s.phase === 'won') {
      this._hintText.text = '';
      this._resultText.text = '守住了';
      this._resultText.visible = true;
    } else if (s.phase === 'lost') {
      this._hintText.text = '';
      this._resultText.text = `被突破 · 第 ${s.wave} 波`;
      this._resultText.visible = true;
    } else {
      const el = upcomingWaveElement(s.wave);
      const hint = s.wave >= 1 ? getWave(s.wave).hint : '';
      this._hintText.text = el ? `${hint}（来袭：${ELEMENT_NAMES[el]}）` : hint;
      this._resultText.visible = false;
    }

    const owned = s.roster.length;
    const bench = owned - s.deployed.length;
    this._rosterText.text =
      owned === 0
        ? ''
        : `上场 ${s.deployed.length} / 拥有 ${owned}` + (bench > 0 ? ` · 替补 ${bench}` : '');
  }

  // ── 战场 ──────────────────────────────────────────────

  private _drawField(): void {
    const g = this._field;
    g.clear();

    // 战场底与底线。底线画成实心横条，被突破时的扣血才有明确的「位置感」
    g.beginFill(0x141726).drawRect(0, FIELD_TOP - 20, 750, FIELD_BOTTOM - FIELD_TOP + 40).endFill();
    g.beginFill(0x2a2f47).drawRect(0, FIELD_BOTTOM, 750, 6).endFill();

    for (const h of this._state.deployed) this._drawHero(g, h);
    for (const e of this._state.enemies) this._drawEnemy(g, e);
  }

  private _drawHero(g: PIXI.Graphics, h: HeroUnit): void {
    const x = COL_X[h.slot] ?? 375;
    const y = distToY(this._heroDist(h));
    const color = ELEMENT_COLOR[h.def.element];

    // 角色用形状区分，系别用颜色区分：不看文字也能一眼分出「谁是坦克、谁是同一系」
    const size = h.def.role === 'guard' ? 62 : h.def.role === 'splash' ? 56 : 46;
    if (!h.alive) {
      g.lineStyle(3, color, 0.35).drawRect(x - size / 2, y - size / 2, size, size);
      g.lineStyle(0);
      return;
    }

    g.beginFill(color, 0.9);
    if (h.def.role === 'support') g.drawCircle(x, y, size / 2);
    else g.drawRoundedRect(x - size / 2, y - size / 2, size, size, 10);
    g.endFill();

    if (h.level > 1) {
      g.lineStyle(3, 0xffd66b, 0.9).drawRoundedRect(
        x - size / 2 - 4, y - size / 2 - 4, size + 8, size + 8, 12,
      );
      g.lineStyle(0);
    }

    this._drawBar(g, x, y + size / 2 + 8, 56, h.hp / Math.max(1, h.maxHp), 0x4ade80);
    if (h.shield > 0) {
      this._drawBar(g, x, y + size / 2 + 16, 56, Math.min(1, h.shield / Math.max(1, h.maxHp)), 0x7dd3fc);
    }
  }

  /** 直接读 ROW_POS，避免画面站位和判定站位各写一份而错位 */
  private _heroDist(h: HeroUnit): number {
    return ROW_POS[h.row];
  }

  private _drawEnemy(g: PIXI.Graphics, e: EnemyUnit): void {
    const x = LANE_X[e.id % LANE_X.length] ?? 375;
    const y = distToY(e.dist);
    const color = ELEMENT_COLOR[e.element];
    const size = e.proto.isBoss ? 84 : e.proto.id === 'brute' ? 52 : e.proto.id === 'runner' ? 32 : 40;

    const flashing = this._hitFlash.has(e.id);
    g.beginFill(flashing ? 0xffffff : color, flashing ? 0.95 : 0.85);
    g.drawRoundedRect(x - size / 2, y - size / 2, size, size, 6);
    g.endFill();

    // 边框表示当前阵容与它的克制关系：绿=我方能克它，红=它克我方。
    // 常驻标记比飘字更能教会玩家「为什么要换人」
    const rel = this._counterRelation(e.element);
    if (rel !== 'flat') {
      g.lineStyle(4, rel === 'up' ? 0x5ecf7b : 0xff5f5f, 0.95);
      g.drawRoundedRect(x - size / 2 - 5, y - size / 2 - 5, size + 10, size + 10, 8);
      g.lineStyle(0);
    }

    this._drawBar(g, x, y + size / 2 + 7, size + 6, e.hp / Math.max(1, e.maxHp), 0xff6b6b);
  }

  /** 上场阵容里最强的克制关系 */
  private _counterRelation(enemyEl: Element): 'up' | 'down' | 'flat' {
    let best = 1;
    let worst = 1;
    for (const h of this._state.deployed) {
      if (!h.alive) continue;
      best = Math.max(best, getCounterMult(h.def.element, enemyEl));
      worst = Math.min(worst, getCounterMult(enemyEl, h.def.element) > 1 ? 0.5 : 1);
    }
    if (best > 1) return 'up';
    if (worst < 1) return 'down';
    return 'flat';
  }

  private _drawBar(
    g: PIXI.Graphics,
    cx: number,
    y: number,
    width: number,
    ratio: number,
    color: number,
  ): void {
    const w = Math.max(0, Math.min(1, ratio)) * width;
    g.beginFill(0x000000, 0.5).drawRect(cx - width / 2, y, width, 5).endFill();
    if (w > 0) g.beginFill(color, 0.95).drawRect(cx - width / 2, y, w, 5).endFill();
  }

  // ── 三选一 ────────────────────────────────────────────

  private _renderPickCards(): void {
    this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));

    const s = this._state;
    if (s.phase !== 'picking' || s.pendingOptions.length === 0) return;

    const dim = new PIXI.Graphics();
    dim.beginFill(0x05060c, 0.72).drawRect(0, 0, 750, 1334).endFill();
    this._pick.addChild(dim);

    const title = label(30, 0xffffff, true);
    title.anchor.set(0.5);
    title.position.set(375, 360);
    const el = upcomingWaveElement(s.wave);
    title.text = el
      ? `第 ${s.wave} 波来袭：${ELEMENT_NAMES[el]}系`
      : `第 ${s.wave} 波`;
    this._pick.addChild(title);

    const cardW = 200;
    const cardH = 280;
    const gap = 20;
    const totalW = s.pendingOptions.length * cardW + (s.pendingOptions.length - 1) * gap;
    const startX = (750 - totalW) / 2;

    s.pendingOptions.forEach((opt, i) => {
      const card = this._buildCard(opt, cardW, cardH, el);
      card.position.set(startX + i * (cardW + gap), 440);
      this._pick.addChild(card);
      bindPointerTap(card, () => this._choose(opt));
    });
  }

  private _buildCard(
    opt: PickOption,
    w: number,
    h: number,
    upcoming: Element | undefined,
  ): PIXI.Container {
    const card = new PIXI.Container();
    card.eventMode = 'static';

    const info = this._describe(opt);
    const bg = new PIXI.Graphics();
    bg.beginFill(0x1d2135).drawRoundedRect(0, 0, w, h, 16).endFill();
    bg.lineStyle(3, info.color, 0.9).drawRoundedRect(0, 0, w, h, 16);
    card.addChild(bg);

    const swatch = new PIXI.Graphics();
    swatch.beginFill(info.color, 0.9).drawRoundedRect(w / 2 - 40, 28, 80, 80, 12).endFill();
    card.addChild(swatch);

    const name = label(28, 0xffffff, true);
    name.anchor.set(0.5);
    name.position.set(w / 2, 140);
    name.text = info.title;
    card.addChild(name);

    const sub = label(20, 0x9aa4bf);
    sub.anchor.set(0.5);
    sub.position.set(w / 2, 176);
    sub.text = info.subtitle;
    card.addChild(sub);

    const desc = label(19, 0xd7dcee);
    desc.anchor.set(0.5, 0);
    desc.position.set(w / 2, 204);
    desc.style.wordWrap = true;
    desc.style.wordWrapWidth = w - 28;
    desc.style.align = 'center';
    desc.text = info.desc;
    card.addChild(desc);

    // 「这张能克这波」必须在卡上直接说出来，不能指望玩家自己记三系环
    if (info.element && upcoming && getCounterMult(info.element, upcoming) > 1) {
      const tag = label(20, 0x0b0f18, true);
      tag.anchor.set(0.5);
      tag.position.set(w / 2, h - 24);
      tag.text = '克制这一波';
      const tagBg = new PIXI.Graphics();
      tagBg.beginFill(0x5ecf7b).drawRoundedRect(w / 2 - 76, h - 40, 152, 32, 16).endFill();
      card.addChild(tagBg, tag);
    }

    return card;
  }

  private _describe(opt: PickOption): {
    title: string;
    subtitle: string;
    desc: string;
    color: number;
    element?: Element;
  } {
    if (opt.kind === 'buff') {
      const b = getTeamBuff(opt.buffId);
      return { title: b.name, subtitle: '阵型增益', desc: b.desc, color: 0xffd66b };
    }
    const def = getHero(opt.heroId);
    const base = {
      title: def.name,
      subtitle: `${ELEMENT_NAMES[def.element]}系 · ${ROLE_NAMES[def.role]}`,
      color: ELEMENT_COLOR[def.element],
      element: def.element,
    };
    if (opt.kind === 'levelUp') {
      const cur = this._state.roster.find((x) => x.def.id === opt.heroId);
      const lv = cur ? cur.level : 1;
      return { ...base, subtitle: `升级 · Lv${lv} → Lv${lv + 1}`, desc: def.skillName };
    }
    return { ...base, desc: def.skillName };
  }

  private _choose(opt: PickOption): void {
    applyPick(this._state, opt, DEPLOY);
    this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._accMs = 0;
  }
}

/** 供调试面板读取上场英雄面板值，避免渲染层各处重算 */
export function debugHeroAtk(h: HeroUnit, s: RunState): number {
  return heroAtk(h, s.buffs);
}
