/**
 * 战斗场景。
 *
 * 渲染层不含任何战斗规则，只读 BattleEngine 的状态。规则改动一律回 BattleEngine。
 * 贴图缺失时退回色块，不挡玩。
 *
 * 画面的两条硬规矩（docs/00-体验目标.md 反目标第二、五条）：
 *
 * 1. **上方大片空场不画任何格子。** 那是舞台，外星人走进来才开打。
 *    一旦在空场上铺格子或画防线，第一眼就会被认成塔防。
 * 2. **场上只有三个人，脸要认得出。** 所以名字、当前定位、身上的破烂都常驻显示。
 */

import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import type { Scene } from '@/core/SceneManager';
import { bindPointerTap } from '@/minigame';
import {
  MELEE_REACH,
  REAR_POS,
  SPAWN_DIST,
  TICK_MS,
  TEAM_SIZE,
  slotPos,
} from '@/balance/combat';
import { getWave } from '@/balance/enemies';
import { getHero } from '@/balance/heroes';
import { abilityTag, getMod } from '@/balance/mods';
import type { PickOption } from '@/balance/picker';
import { ModDock } from '@/ui/ModDock';
import { SettleOverlay } from '@/ui/SettleOverlay';
import { CombatFx } from '@/fx/CombatFx';
import { addCoverPortrait, bgTex, enemyTex, fillContain, fillCover, heroTex, modTex, preloadBattleArt, watchArt } from '@/core/TextureLoader';
import { playSfx } from '@/core/SfxPlayer';
import { saveRun } from '@/core/RunMemory';
import { GOLD, hpBar, plate, rangeArea, shieldMark, stance } from '@/ui/paint';
import {
  applyPick,
  createRun,
  heroReach,
  installMod,
  installTargets,
  swapSlots,
  teamInOrder,
  tick,
  type EnemyUnit,
  type HeroUnit,
  type RunState,
} from '@/game/BattleEngine';

/** 村民一人一色，暖色系。外星人用冷色，两边一眼分得开 */
const VILLAGER_COLOR: Readonly<Record<string, number>> = {
  tiezhu: 0xc4703a,
  dachui: 0xd9a13b,
  laoli: 0xb4553f,
  erjiu: 0xa8823f,
  sanshen: 0xd4736b,
  laoyanqiang: 0x8f7a4a,
};

const ALIEN_COLOR: Readonly<Record<string, number>> = {
  grey: 0x9fb6c9,
  cube: 0x7d6bd4,
  canister: 0x5a8fa8,
  saucer: 0xa050c0,
};

/**
 * 队列的横向错位。逻辑上是一条线，画面上让三个人稍微错开站，
 * 看着像一小队人而不是排队买菜。
 */
const QUEUE_X = [375, 288, 462] as const;

function villagerColor(id: string): number {
  return VILLAGER_COLOR[id] ?? GOLD;
}

function alienColor(id: string): number {
  return ALIEN_COLOR[id] ?? 0x9fb6c9;
}

function heroH(h: HeroUnit): number {
  if (h.def.hp >= 1000) return 90;
  if (h.def.hp >= 700) return 82;
  return 76;
}

function enemyH(e: EnemyUnit): number {
  if (e.proto.isBoss) return 100;
  if (e.proto.id === 'canister') return 82;
  if (e.proto.id === 'grey') return 58;
  return 70;
}

/** 外星人横向散开，别叠成一根柱子。同一只怪每帧必须落在同一条道上 */
function alienLaneX(id: number): number {
  const spread = (id * 137) % 5;
  return 258 + spread * 58;
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
  private readonly _nameLayer = new PIXI.Container();
  private readonly _hudPlate = new PIXI.Graphics();
  private readonly _hud = new PIXI.Container();
  private readonly _pick = new PIXI.Container();
  private readonly _dock = new ModDock((id) => this._tapHero(id));
  private readonly _settle = new SettleOverlay(() => this.onEnter());
  private readonly _fx = new CombatFx();
  private readonly _heroHits: PIXI.Container[] = [];
  private readonly _guide = label(26, 0xffd66b, true);

  private readonly _waveText = label(34, 0xffffff, true);
  private readonly _hintText = label(24, 0xffd66b);
  private readonly _installPlate = new PIXI.Graphics();
  private readonly _installTitle = label(28, 0xfff4c4, true);
  private readonly _installDesc = label(20, 0xd7dcee);
  private readonly _inspectPlate = new PIXI.Graphics();
  private readonly _inspectTitle = label(22, 0xffffff, true);
  private readonly _inspectDesc = label(18, 0xd7dcee);

  private _pickIdle = 0;
  private _guideLife = 0;
  private _settled = false;
  private _selected: string | null = null;

  private readonly _hitFlash = new Map<number, number>();
  private readonly _hurtFlash = new Map<string, number>();
  private readonly _lunge = new Map<string, { dx: number; dy: number; life: number }>();
  private readonly _lastEnemyXY = new Map<number, { x: number; y: number }>();
  private readonly _rangeHint = label(18, GOLD, true);

  /**
   * 布局按实际屏幕算，不能写死 1334。
   * 设计稿是 750×1334，但 Game 按宽度等比缩放，长屏机型的可用高度会明显更大。
   */
  private _lay = {
    top: 96,
    fieldTop: 200,
    fieldBottom: 1010,
    height: 1334,
    pxPerCell: 90,
  };

  constructor() {
    this.container.addChild(this._field);
    this.container.addChild(this._nameLayer);
    this.container.addChild(this._fx.layer);
    this.container.addChild(this._hud);
    this.container.addChild(this._dock);
    this.container.addChild(this._pick);
    this.container.addChild(this._settle);
    this._rangeHint.anchor.set(0.5);
    this._rangeHint.visible = false;
    this.container.addChild(this._rangeHint);
    this._computeLayout();
    this._buildHeroHits();
    this._buildHud();
    watchArt(() => {
      if (this._state.phase === 'picking') this._renderPickCards();
    });
  }

  onEnter(): void {
    preloadBattleArt();
    this._computeLayout();
    this._applyHudLayout();
    this._settle.hide();
    this._fx.reset();
    this._state = createRun(Date.now() >>> 0);
    this._clearSelect();
    this._accMs = 0;
    this._hitFlash.clear();
    this._hurtFlash.clear();
    this._lunge.clear();
    this._lastEnemyXY.clear();
    this._rangeHint.visible = false;
    this._pickIdle = 0;
    this._guideLife = 0;
    this._settled = false;
    this._guide.visible = false;
    this._renderPickCards();
  }

  private _showTeam(): boolean {
    return this._state.team.length > 0 && this._state.phase !== 'picking';
  }

  /** 只有战斗与间隙里才能调队列。装配阶段点人是装破烂，不是换位 */
  private _canReorder(): boolean {
    const p = this._state.phase;
    return this._state.team.length > 1 && (p === 'fighting' || p === 'gap');
  }

  private _clearSelect(): void {
    this._selected = null;
    this._accMs = 0;
    this._dock.refresh(this._state, null);
  }

  /**
   * 点一个人。装配阶段是「装给他」，其余时候是选中／换队列位置。
   *
   * 这两件事共用同一个手势，是因为它们是同一个决策的两面：
   * 装了什么决定他该站哪儿。
   */
  private _tapHero(heroId: string): void {
    const s = this._state;
    if (s.phase === 'installing') {
      const mod = s.pendingMod;
      const target = s.team.find((h) => h.def.id === heroId);
      if (!mod || !target) return;
      playSfx('ui_tap', 0);
      const modName = mod.name;
      const becomes = mod.becomes;
      if (!installMod(s, heroId)) return;
      this._clearSelect();
      this._accMs = 0;
      this._say(`${target.def.name}装上了${modName}：${becomes}`);
      return;
    }

    if (!this._canReorder()) return;
    playSfx('ui_tap', 0);
    if (!this._selected) {
      this._selected = heroId;
      return;
    }
    if (this._selected === heroId) {
      this._clearSelect();
      return;
    }
    const a = s.team.find((h) => h.def.id === this._selected);
    const b = s.team.find((h) => h.def.id === heroId);
    if (a && b) {
      swapSlots(s, a.slot, b.slot);
      const head = teamInOrder(s)[0];
      if (head) this._say(`${head.def.name}站队首，他先挨刀`);
    }
    this._clearSelect();
  }

  private _say(msg: string): void {
    this._guide.text = msg;
    this._guide.visible = true;
    this._guideLife = 2.8;
  }

  private _computeLayout(): void {
    const height = Math.max(1334, Game.logicHeight || 1334);
    const top = Math.max(Game.safeTop, 96);
    const fieldTop = top + 104;
    // 底部留给改装条与安全区，其余全部给战场
    const fieldBottom = height - 176 - Game.safeBottom;
    // 整条坐标轴（队尾缓冲 → 出场点）线性铺满战场高度。
    // 队列只占下面三格，上面六格全是空场 —— 空场是舞台，不是浪费。
    const span = SPAWN_DIST - (REAR_POS - MELEE_REACH);
    this._lay = {
      top,
      fieldTop,
      fieldBottom,
      height,
      pxPerCell: (fieldBottom - fieldTop) / span,
    };
  }

  /** 战场坐标 → 屏幕 Y。坐标越大越靠上（越靠外星人来的方向） */
  private _posToY(pos: number): number {
    const min = REAR_POS - MELEE_REACH;
    const clamped = Math.max(min, Math.min(SPAWN_DIST, pos));
    return this._lay.fieldBottom - (clamped - min) * this._lay.pxPerCell;
  }

  private _slotY(slot: number): number {
    return this._posToY(slotPos(slot));
  }

  private _slotX(slot: number): number {
    return QUEUE_X[slot] ?? 375;
  }

  update(dt: number): void {
    const s = this._state;

    // 点中人时战斗停住：换位是想清楚的决定，但不弹窗打断看戏
    if (this._selected) {
      this._drawField();
      this._updateHud();
      return;
    }

    if (s.phase === 'picking') {
      if (this._pick.children.length === 0) this._renderPickCards();
      if (s.team.length === 0) {
        this._pickIdle += dt;
        if (this._pickIdle >= 3) this._highlightFirstCard();
      }
    } else if (s.phase === 'installing') {
      // 等玩家点人，战斗不动。这一步就是主体验，不设自动兜底
      this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));
    } else if (s.phase === 'fighting' || s.phase === 'gap') {
      // 按固定步长推进，与批量回归完全一致：掉帧只会让画面变慢，不会改变战斗结果
      this._accMs += dt * 1000;
      let guard = 0;
      while (this._accMs >= TICK_MS && guard++ < 8) {
        this._accMs -= TICK_MS;
        this._rememberUnits();
        tick(s);
        this._consumeEvents();
        // 经 tick 后 phase 可能已变，这里必须重新读状态
        const phase = this._state.phase;
        if (phase === 'picking') {
          this._renderPickCards();
          break;
        }
        if (phase === 'won' || phase === 'lost') {
          this._showSettle();
          break;
        }
      }
    }

    for (const [id, ms] of this._hitFlash) {
      const left = ms - dt * 1000;
      if (left <= 0) this._hitFlash.delete(id);
      else this._hitFlash.set(id, left);
    }
    for (const [id, ms] of this._hurtFlash) {
      const left = ms - dt * 1000;
      if (left <= 0) this._hurtFlash.delete(id);
      else this._hurtFlash.set(id, left);
    }
    for (const [id, l] of this._lunge) {
      l.life -= dt;
      if (l.life <= 0) this._lunge.delete(id);
    }

    if (this._guideLife > 0) {
      this._guideLife -= dt;
      this._guide.visible = this._guideLife > 0;
    }

    this._fx.update(dt);
    this._drawField();
    this._updateHud();
  }

  private _heroXY(heroId: string): { x: number; y: number } | undefined {
    const h = this._state.team.find((x) => x.def.id === heroId);
    if (!h) return undefined;
    return { x: this._slotX(h.slot), y: this._slotY(h.slot) - heroH(h) * 0.45 };
  }

  private _enemyXY(id: number): { x: number; y: number } | undefined {
    const e = this._state.enemies.find((x) => x.id === id);
    if (e) return { x: alienLaneX(e.id), y: this._posToY(e.dist) - enemyH(e) * 0.45 };
    return this._lastEnemyXY.get(id);
  }

  private _rememberUnits(): void {
    this._lastEnemyXY.clear();
    for (const e of this._state.enemies) {
      this._lastEnemyXY.set(e.id, {
        x: alienLaneX(e.id),
        y: this._posToY(e.dist) - enemyH(e) * 0.45,
      });
    }
  }

  private _consumeEvents(): void {
    for (const ev of this._state.events) {
      if (ev.kind === 'hit') {
        this._hitFlash.set(ev.enemyId, 120);
        const attacker = this._state.team.find((h) => h.def.id === ev.heroId);
        if (attacker && attacker.stats.range <= 1) {
          this._lunge.set(ev.heroId, { dx: 0, dy: -8, life: 0.1 });
        }
      }
      if (ev.kind === 'enemyHit') this._hurtFlash.set(ev.heroId, 140);

      const withHero = ev.kind === 'hit' || ev.kind === 'skill' || ev.kind === 'heroDown'
        || ev.kind === 'enemyHit' || ev.kind === 'heroRevive' || ev.kind === 'install';
      const hero = withHero ? this._heroXY(ev.heroId) : undefined;
      const enemy = ev.kind === 'hit' || ev.kind === 'enemyDown' || ev.kind === 'enemyHit'
        ? this._enemyXY(ev.enemyId)
        : undefined;
      const attacker = ev.kind === 'hit' || ev.kind === 'skill'
        ? this._state.team.find((h) => h.def.id === ev.heroId)
        : undefined;
      const color = attacker ? villagerColor(attacker.def.id) : 0xffffff;
      const target = ev.kind === 'skill' && ev.targetId ? this._heroXY(ev.targetId) : undefined;
      const melee = attacker ? attacker.stats.range <= 1 : false;
      this._fx.consume(ev, {
        hx: hero?.x,
        hy: hero?.y,
        ex: enemy?.x,
        ey: enemy?.y,
        tx: target?.x,
        ty: target?.y,
        color,
        melee,
        orb: attacker ? !!attacker.stats.splash : false,
        reachY: attacker ? this._posToY(heroReach(attacker)) : undefined,
        meleeR: attacker && melee
          ? Math.max(56, Math.abs((hero?.y ?? 0) - this._posToY(heroReach(attacker))) + 10)
          : undefined,
        baseY: this._lay.fieldBottom,
        slowed: ev.kind === 'hit' && !!attacker?.stats.slowOnHit,
      });
    }
    this._state.events.length = 0;
  }

  private _showSettle(): void {
    if (this._settled) return;
    this._settled = true;
    const mem = saveRun(
      this._state.wave,
      this._state.team.map((h) => h.def.id),
    );
    playSfx(this._state.phase === 'won' ? 'win' : 'lose', 0);
    this._settle.show(this._state, mem, this._lay.height);
  }

  private _highlightFirstCard(): void {
    const card = this._pick.children.find((c) => c.name === 'pick-card-0');
    if (!card || (card as PIXI.Container).children.some((c) => c.name === 'idle-glow')) return;
    const glow = new PIXI.Graphics();
    glow.name = 'idle-glow';
    glow.lineStyle(5, GOLD, 0.95).drawRoundedRect(-6, -6, 222, 356, 20);
    (card as PIXI.Container).addChild(glow);
  }

  // ── HUD ───────────────────────────────────────────────

  private _buildHud(): void {
    this._guide.anchor.set(0.5);
    this._guide.visible = false;
    this._guide.style.wordWrap = true;
    this._guide.style.wordWrapWidth = 660;
    this._guide.style.align = 'center';
    this._guide.style.stroke = 0x2a160c;
    this._guide.style.strokeThickness = 5;

    for (const t of [this._installTitle, this._installDesc, this._inspectTitle, this._inspectDesc]) {
      t.anchor.set(0.5, 0);
      t.style.wordWrap = true;
      t.style.wordWrapWidth = 640;
      t.style.align = 'center';
      t.visible = false;
    }
    this._installPlate.visible = false;
    this._inspectPlate.visible = false;

    this._hud.addChild(
      this._hudPlate,
      this._waveText,
      this._hintText,
      this._installPlate,
      this._installTitle,
      this._installDesc,
      this._inspectPlate,
      this._inspectTitle,
      this._inspectDesc,
      this._guide,
    );
    this._applyHudLayout();
  }

  /** 三个人各一块点击区，钉在队列位置上 */
  private _buildHeroHits(): void {
    for (let slot = 0; slot < TEAM_SIZE; slot += 1) {
      const hit = new PIXI.Container();
      hit.eventMode = 'static';
      const g = new PIXI.Graphics();
      g.beginFill(0xffffff, 0.001).drawRoundedRect(-58, -96, 116, 108, 14).endFill();
      hit.addChild(g);
      bindPointerTap(hit, () => {
        const h = this._state.team.find((x) => x.slot === slot);
        if (h) this._tapHero(h.def.id);
      });
      hit.name = `queue:${slot}`;
      this._heroHits.push(hit);
      this.container.addChild(hit);
    }
  }

  private _applyHudLayout(): void {
    const { top, fieldBottom } = this._lay;
    this._waveText.position.set(44, top + 6);
    this._hintText.position.set(44, top + 44);
    this._dock.place(fieldBottom + 16);
    this._guide.position.set(375, fieldBottom - 40);
    this._installTitle.position.set(375, top + 96);
    this._installDesc.position.set(375, top + 132);
    this._inspectTitle.position.set(375, top + 96);
    this._inspectDesc.position.set(375, top + 124);
    this._layoutHeroHits();
  }

  private _layoutHeroHits(): void {
    for (let slot = 0; slot < TEAM_SIZE; slot += 1) {
      this._heroHits[slot]?.position.set(this._slotX(slot), this._slotY(slot));
    }
  }

  private _updateHud(): void {
    const s = this._state;
    const opening = s.phase === 'picking' && s.team.length === 0;
    this._waveText.visible = !opening;
    this._hintText.visible = !opening;
    this._waveText.text = `第 ${s.wave} 波`;

    if (s.phase === 'won' || s.phase === 'lost') {
      this._hintText.text = '';
      if (this._selected) this._clearSelect();
    } else {
      this._hintText.text = s.wave >= 1 ? getWave(s.wave).hint : '';
    }

    for (const hit of this._heroHits) {
      hit.visible = this._showTeam();
    }

    this._hudPlate.clear();
    if (!opening) {
      const { top } = this._lay;
      plate(this._hudPlate, 24, top - 8, 320, 86);
    }
    this._showInstall();
    this._showInspect();
    if (this._selected) this._guide.visible = false;
    this._dock.refresh(s, this._selected);
  }

  /** 装配阶段顶部横幅：这件破烂是什么、装上之后会变成什么 */
  private _showInstall(): void {
    const s = this._state;
    const on = s.phase === 'installing' && !!s.pendingMod;
    this._installPlate.visible = on;
    this._installTitle.visible = on;
    this._installDesc.visible = on;
    this._installPlate.clear();
    if (!on || !s.pendingMod) return;
    const { top } = this._lay;
    plate(this._installPlate, 40, top + 86, 670, 92, 16, 0.9);
    this._installTitle.text = s.pendingMod.name;
    this._installDesc.text = `${s.pendingMod.desc} —— ${s.pendingMod.becomes}`;
  }

  private _showInspect(): void {
    const hero = this._selected
      ? this._state.team.find((h) => h.def.id === this._selected)
      : undefined;
    const on = !!hero && this._state.phase !== 'installing';
    this._inspectPlate.visible = on;
    this._inspectTitle.visible = on;
    this._inspectDesc.visible = on;
    this._inspectPlate.clear();
    if (!hero || !on) return;
    const { top } = this._lay;
    plate(this._inspectPlate, 40, top + 86, 670, 84, 16, 0.88);
    this._inspectTitle.text = `${hero.def.name} · ${hero.def.skillName}（${abilityTag(hero.def.skill)}）`;
    this._inspectDesc.text = hero.mods.length > 0
      ? `身上：${hero.mods.map((m) => m.name).join('、')}`
      : '还没改过他';
  }

  // ── 战场 ──────────────────────────────────────────────

  private _drawField(): void {
    const g = this._field;
    g.clear();
    const { fieldTop, fieldBottom } = this._lay;

    const bg = bgTex();
    if (bg && bg.baseTexture.valid && bg.width > 1) {
      fillCover(g, bg, 0, 0, 750, this._lay.height);
    } else {
      g.beginFill(0x141726).drawRect(0, fieldTop - 20, 750, fieldBottom - fieldTop + 40).endFill();
    }

    // 顶底轻压，字不糊进画里
    g.beginFill(0x2a160c, 0.22).drawRect(0, 0, 750, this._lay.top + 96).endFill();
    g.beginFill(0x2a160c, 0.18).drawRect(0, fieldBottom - 8, 750, this._lay.height - fieldBottom + 8).endFill();

    // 有人倒下时全屏红闪一下。警报挂在倒人身上，不挂底线 —— 底线已经没有了
    if (this._fx.downPulse > 0) {
      g.beginFill(0x8c2b3a, this._fx.downPulse * 0.5).drawRect(0, 0, 750, this._lay.height).endFill();
    }

    if (this._showTeam()) {
      const installing = this._state.phase === 'installing';
      const canTake = new Set(installTargets(this._state).map((h) => h.def.id));
      for (const h of teamInOrder(this._state)) {
        const x = this._slotX(h.slot);
        const y = this._slotY(h.slot);
        stance(g, x, y, villagerColor(h.def.id), true);
        // 装配阶段把能装的人圈出来，这一步的可点范围必须没有歧义
        if (installing && canTake.has(h.def.id)) {
          const pulse = 0.55 + Math.abs(Math.sin(this._state.totalMs / 200)) * 0.35;
          g.lineStyle(4, 0x9be08a, pulse).drawEllipse(x, y + 8, 52, 16).lineStyle(0);
        } else if (h.slot === 0) {
          g.lineStyle(2, GOLD, 0.4).drawEllipse(x, y + 8, 48, 14).lineStyle(0);
        }
      }
    }

    if (this._fx.landPulse > 0) {
      g.beginFill(GOLD, this._fx.landPulse * 1.1).drawEllipse(375, this._slotY(0) + 8, 90, 22).endFill();
    }

    this._drawSelectedRange(g);

    // 先画后排再画前排，前面的人压在后面的人身上
    for (const h of [...teamInOrder(this._state)].reverse()) this._drawHero(g, h);
    for (const e of this._state.enemies) this._drawEnemy(g, e);
    this._drawHeroNames();
  }

  private _drawSelectedRange(g: PIXI.Graphics): void {
    const hero = this._selected
      ? this._state.team.find((h) => h.def.id === this._selected)
      : undefined;
    if (!hero) {
      this._rangeHint.visible = false;
      return;
    }
    const x = this._slotX(hero.slot);
    const feet = this._slotY(hero.slot);
    const reachY = this._posToY(heroReach(hero));
    const melee = hero.stats.range <= 1;
    rangeArea(g, x, feet, reachY, villagerColor(hero.def.id), melee);
    this._rangeHint.text = melee ? '只能贴脸打' : `打得到 ${hero.stats.range} 格外`;
    const forward = Math.abs(feet - reachY);
    this._rangeHint.position.set(x, melee ? feet - Math.max(52, forward * 0.9) - 20 : reachY);
    this._rangeHint.visible = true;
  }

  private _drawHeroNames(): void {
    const live = new Set<string>();
    for (const h of teamInOrder(this._state)) {
      live.add(h.def.id);
      live.add(`${h.def.id}:tag`);
      let name = this._nameLayer.children.find((c) => c.name === h.def.id) as PIXI.Text | undefined;
      if (!name) {
        name = label(16, 0xffffff, true);
        name.name = h.def.id;
        name.anchor.set(0.5, 1);
        name.style.stroke = 0x0b0f18;
        name.style.strokeThickness = 4;
        this._nameLayer.addChild(name);
      }
      let tag = this._nameLayer.children.find((c) => c.name === `${h.def.id}:tag`) as PIXI.Text | undefined;
      if (!tag) {
        tag = label(13, GOLD, true);
        tag.name = `${h.def.id}:tag`;
        tag.anchor.set(0.5, 1);
        tag.style.stroke = 0x0b0f18;
        tag.style.strokeThickness = 3;
        this._nameLayer.addChild(tag);
      }
      const x = this._slotX(h.slot);
      const top = this._slotY(h.slot) - heroH(h) - 2;
      name.text = h.mods.length > 0 ? `${h.def.name} +${h.mods.length}` : h.def.name;
      name.tint = h.alive ? 0xffffff : 0x6b7394;
      name.position.set(x, top - 16);
      // 标签说的是「现在在干什么」，改装件可能已经把起手定位改掉了
      tag.text = h.mods.length > 0
        ? (h.mods[h.mods.length - 1]?.name ?? abilityTag(h.def.skill))
        : abilityTag(h.def.skill);
      tag.tint = h.alive ? 0xffd66b : 0x6b7394;
      tag.position.set(x, top);
    }
    for (const c of [...this._nameLayer.children]) {
      if (!c.name || !live.has(c.name)) c.destroy();
    }
  }

  private _drawHero(g: PIXI.Graphics, h: HeroUnit): void {
    const lunge = this._lunge.get(h.def.id);
    const x = this._slotX(h.slot) + (lunge ? lunge.dx : 0);
    const feet = this._slotY(h.slot) + (lunge ? lunge.dy : 0);
    const color = villagerColor(h.def.id);
    const size = heroH(h);
    const spr = heroTex(h.def.id);
    const hurt = this._hurtFlash.has(h.def.id);

    if (!h.alive) {
      g.beginFill(0x000000, 0.4).drawEllipse(x, feet + 8, 34, 10).endFill();
      if (spr && spr.baseTexture.valid && spr.width > 1) {
        fillContain(g, spr, x, feet, size + 8, size);
        g.beginFill(0x0b0f18, 0.58).drawEllipse(x, feet - size * 0.45, size * 0.42, size * 0.5).endFill();
      } else {
        g.beginFill(0x4b5568, 0.55).drawRoundedRect(x - 28, feet - size, 56, size, 10).endFill();
      }
      return;
    }

    if (this._selected === h.def.id) {
      g.lineStyle(3, GOLD, 0.95).drawEllipse(x, feet + 8, 48, 14).lineStyle(0);
    }

    if (spr && spr.baseTexture.valid && spr.width > 1) {
      fillContain(g, spr, x, feet, size + 8, size);
      if (hurt) g.beginFill(0xffffff, 0.32).drawEllipse(x, feet - size * 0.45, size * 0.4, size * 0.5).endFill();
    } else {
      g.beginFill(hurt ? 0xffffff : color, hurt ? 0.95 : 0.9).drawRoundedRect(x - 28, feet - size, 56, size, 10).endFill();
    }

    // 身上装了几件破烂，就在肩上挂几个小方块。改造要看得见
    for (let i = 0; i < h.mods.length; i += 1) {
      g.beginFill(GOLD, 0.9);
      g.drawRoundedRect(x + 22, feet - size * 0.85 + i * 16, 13, 13, 3);
      g.endFill();
    }

    // 越挨越猛：层数直接画成小竖条，玩家才知道高压锅在起作用
    if (h.stats.ragePerHit > 0 && h.rageStacks > 0) {
      for (let i = 0; i < h.rageStacks; i += 1) {
        g.beginFill(0xff7a3a, 0.95);
        g.drawRect(x - 34 - 0, feet - 18 - i * 6, 8, 4);
        g.endFill();
      }
    }

    hpBar(g, x, feet + 6, 52, h.hp / Math.max(1, h.maxHp), 0x4ade80);
    if (h.shield > 0) {
      shieldMark(g, x - 36, feet + 17);
      hpBar(g, x, feet + 14, 52, Math.min(1, h.shield / Math.max(1, h.maxHp)), 0x7dd3fc);
    }
  }

  private _drawEnemy(g: PIXI.Graphics, e: EnemyUnit): void {
    const size = enemyH(e);
    const x = alienLaneX(e.id);
    const feet = this._posToY(e.dist);
    const color = alienColor(e.proto.id);
    const flashing = this._hitFlash.has(e.id);
    const spr = enemyTex(e.proto.id);

    stance(g, x, feet, color, true);
    if (spr && spr.baseTexture.valid && spr.width > 1) {
      fillContain(g, spr, x, feet, size + 10, size);
      if (flashing) g.beginFill(0xffffff, 0.35).drawEllipse(x, feet - size * 0.45, size * 0.4, size * 0.5).endFill();
    } else {
      g.beginFill(flashing ? 0xffffff : color, flashing ? 0.95 : 0.85);
      g.drawRoundedRect(x - size / 2, feet - size, size, size, 8);
      g.endFill();
    }
    if (e.slowMs > 0) {
      g.lineStyle(2.2, 0x86efac, 0.75);
      g.drawEllipse(x, feet - size * 0.4, size * 0.42, size * 0.28);
      g.lineStyle(0);
      g.beginFill(0x4ade80, 0.55);
      g.drawCircle(x + size * 0.38, feet - size * 0.72, 5);
      g.endFill();
    }

    hpBar(g, x, feet + 14, Math.max(48, size * 0.7), e.hp / Math.max(1, e.maxHp), 0xff6b6b);
  }

  // ── 三选一 ────────────────────────────────────────────

  private _renderPickCards(): void {
    this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));

    const s = this._state;
    if (s.phase !== 'picking' || s.pendingOptions.length === 0) return;

    const opening = s.team.length === 0;
    const dim = new PIXI.Graphics();
    dim.beginFill(0x2a160c, opening ? 0.38 : 0.55).drawRect(0, 0, 750, this._lay.height).endFill();
    this._pick.addChild(dim);

    const isMod = s.pendingOptions[0]?.kind === 'mod';
    const titleY = this._lay.fieldTop + (this._lay.fieldBottom - this._lay.fieldTop) * (opening ? 0.14 : 0.16);

    const title = label(36, 0xfff4c4, true);
    title.style.stroke = '#2a160c';
    title.style.strokeThickness = 6;
    title.anchor.set(0.5);
    title.position.set(375, titleY);
    title.text = opening ? '叫谁来' : isMod ? '废品站今天有这些' : '又来一个帮手';
    this._pick.addChild(title);

    const sub = label(24, 0xfff1a8, true);
    sub.style.stroke = '#2a160c';
    sub.style.strokeThickness = 4;
    sub.anchor.set(0.5);
    sub.position.set(375, titleY + 44);
    sub.text = opening
      ? '点一个就开打，他自己会动手'
      : isMod
        ? '挑一件，下一步决定装给谁'
        : '挑一个人加进队里';
    this._pick.addChild(sub);

    const cardW = 218;
    const cardH = 368;
    const gap = 12;
    const totalW = s.pendingOptions.length * cardW + (s.pendingOptions.length - 1) * gap;
    const startX = (750 - totalW) / 2;

    s.pendingOptions.forEach((opt, i) => {
      const card = this._buildCard(opt, cardW, cardH);
      card.name = `pick-card-${i}`;
      card.position.set(startX + i * (cardW + gap), titleY + 84);
      this._pick.addChild(card);
      bindPointerTap(card, () => this._choose(opt));
    });
  }

  private _buildCard(opt: PickOption, w: number, h: number): PIXI.Container {
    const card = new PIXI.Container();
    card.eventMode = 'static';

    const info = this._describe(opt);
    const faceH = 214;
    const bg = new PIXI.Graphics();
    bg.beginFill(0x1a0e08, 0.35).drawRoundedRect(4, 8, w, h, 22).endFill();
    bg.beginFill(0xfff6df).drawRoundedRect(0, 0, w, h, 20).endFill();
    bg.beginFill(info.color, 0.18).drawRoundedRect(8, 8, w - 16, faceH - 10, 16).endFill();
    bg.lineStyle(6, info.color, 1).drawRoundedRect(3, 3, w - 6, h - 6, 18).lineStyle(0);
    card.addChild(bg);

    // 人用 cover 撑满卡面才有气势；破烂是个物件，缺一块就认不出，所以居中完整放
    const portrait = opt.kind === 'recruit' ? heroTex(opt.heroId) : modTex(opt.modId);
    const drawable = portrait?.baseTexture.valid && portrait.width > 1 ? portrait : null;
    if (drawable && opt.kind === 'recruit') {
      addCoverPortrait(card, drawable, 10, 10, w - 20, faceH - 16, 14);
    } else if (drawable) {
      const g = new PIXI.Graphics();
      fillContain(g, drawable, w / 2, faceH - 22, w - 56, faceH - 52);
      card.addChild(g);
    } else {
      const swatch = new PIXI.Graphics();
      swatch.beginFill(info.color, 0.9).drawRoundedRect(w / 2 - 40, 56, 80, 80, 18).endFill();
      card.addChild(swatch);
    }

    const name = label(26, 0x2a160c, true);
    name.anchor.set(0.5);
    name.position.set(w / 2, faceH + 20);
    name.style.wordWrap = true;
    name.style.wordWrapWidth = w - 20;
    name.style.align = 'center';
    name.text = info.title;
    card.addChild(name);

    const sub = label(17, 0x8a5a2b);
    sub.anchor.set(0.5);
    sub.position.set(w / 2, faceH + 50);
    sub.text = info.subtitle;
    card.addChild(sub);

    const desc = label(17, 0x3d2a1c);
    desc.anchor.set(0.5, 0);
    desc.position.set(w / 2, faceH + 74);
    desc.style.wordWrap = true;
    desc.style.wordWrapWidth = w - 28;
    desc.style.align = 'center';
    desc.text = info.desc;
    card.addChild(desc);

    // 「装上会变成什么」是改装件卡的重点，必须比效果数值更显眼
    if (info.becomes) {
      const tag = label(16, 0x2a160c, true);
      tag.anchor.set(0.5);
      tag.position.set(w / 2, h - 26);
      tag.style.wordWrap = true;
      tag.style.wordWrapWidth = w - 24;
      tag.style.align = 'center';
      tag.text = info.becomes;
      const tagBg = new PIXI.Graphics();
      tagBg.beginFill(GOLD, 0.9).drawRoundedRect(10, h - 46, w - 20, 40, 12).endFill();
      card.addChild(tagBg, tag);
    }

    return card;
  }

  private _describe(opt: PickOption): {
    title: string;
    subtitle: string;
    desc: string;
    color: number;
    becomes?: string;
  } {
    if (opt.kind === 'mod') {
      const m = getMod(opt.modId);
      const kindName = m.kind === 'pivot' ? '改打法'
        : m.kind === 'output' ? '更能打'
          : m.kind === 'tanky' ? '更能挨' : '帮全队';
      return { title: m.name, subtitle: kindName, desc: m.desc, color: GOLD, becomes: m.becomes };
    }
    const def = getHero(opt.heroId);
    return {
      title: def.name,
      subtitle: `${def.range <= 1 ? '贴脸打' : `射程 ${def.range} 格`} · ${abilityTag(def.skill)}`,
      desc: `${def.skillName}：${def.skillDesc}`,
      color: villagerColor(def.id),
      becomes: def.flavor,
    };
  }

  private _choose(opt: PickOption): void {
    const opening = this._state.team.length === 0;
    playSfx('ui_tap', 0);
    applyPick(this._state, opt);
    this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._accMs = 0;
    this._pickIdle = 0;
    if (opening) {
      this._fx.markLand();
      this._say('外星人下来了，撑过 15 波');
    }
  }
}
