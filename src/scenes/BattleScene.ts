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
} from '@/balance/combat';
import { getWave } from '@/balance/enemies';
import { resolveAttackFx, resolveEnemyFx } from '@/balance/fx';
import { getHero } from '@/balance/heroes';
import { abilityTag, getMod } from '@/balance/mods';
import type { PickOption } from '@/balance/picker';
import { DOCK_GAP, DOCK_H, ModDock } from '@/ui/ModDock';
import { SettleOverlay } from '@/ui/SettleOverlay';
import { CombatFx } from '@/fx/CombatFx';
import { motionFor, UnitActor } from '@/fx/UnitActor';
import { addFitPortrait, bgTex, fillContain, fillCover, heroTex, modTex, preloadBattleArt, watchArt } from '@/core/TextureLoader';
import { playSfx } from '@/core/SfxPlayer';
import { saveRun } from '@/core/RunMemory';
import { GOLD, homeTerrace, hpBar, plate, queuePad, rangeArea, shieldMark } from '@/ui/paint';
import {
  applyPick,
  createRun,
  heroReach,
  heroAt,
  installMod,
  installTargets,
  isRosterPicking,
  placeInSlot,
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

/** 小队中轴。前排在中，后排左右错开，贴在底栏上，像一队人守在自家门口。 */
const SQUAD_X = 375;
const BACK_DX = 96;
const BACK_DY = 62;

const SLOT_NAME = ['前排', '左后', '右后'] as const;

const PICK_CARD_W = 218;
const PICK_CARD_H = 400;
/** 开局 6 人一屏，两排三张，比波间三选一更扁 */
const ROSTER_CARD_W = 216;
const ROSTER_CARD_H = 278;

function villagerColor(id: string): number {
  return VILLAGER_COLOR[id] ?? GOLD;
}

function heroH(h: HeroUnit): number {
  if (h.def.hp >= 1000) return 102;
  if (h.def.hp >= 700) return 94;
  return 88;
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
  return 300 + spread * 38;
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
  private readonly _unitLayer = new PIXI.Container();
  private readonly _heroActors = new Map<string, UnitActor>();
  private readonly _enemyActors = new Map<number, UnitActor>();
  private readonly _nameLayer = new PIXI.Container();
  private readonly _hudPlate = new PIXI.Graphics();
  private readonly _hud = new PIXI.Container();
  private readonly _pick = new PIXI.Container();
  private readonly _dock = new ModDock((slot) => this._tapSlot(slot));
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
  private _gapTold = 0;
  private _settled = false;
  private _selected: string | null = null;

  private readonly _hitFlash = new Map<number, number>();
  private readonly _hurtFlash = new Map<string, number>();
  private readonly _lastEnemyXY = new Map<number, { x: number; y: number }>();
  /** 上一逻辑帧的距离，用来在 100ms 步长之间把走路插成滑步 */
  private readonly _prevDist = new Map<number, number>();
  private readonly _enemyKind = new Map<number, string>();
  private readonly _rangeHint = label(18, GOLD, true);

  /**
   * 布局按实际屏幕算，不能写死 1334。
   * 设计稿是 750×1334，但 Game 按宽度等比缩放，长屏机型的可用高度会明显更大。
   */
  private _lay = {
    top: 96,
    fieldTop: 200,
    fieldBottom: 1010,
    /** 前排脚底。钉在底栏上方，不跟坐标轴均分 */
    frontY: 930,
    height: 1334,
    pxPerCell: 90,
  };

  constructor() {
    this.container.addChild(this._field);
    this.container.addChild(this._unitLayer);
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
      for (const [id, a] of this._heroActors) a.bindHero(id);
      for (const e of this._state.enemies) this._enemyActors.get(e.id)?.bindEnemy(e.proto.id);
    });
  }

  onEnter(): void {
    preloadBattleArt();
    this._computeLayout();
    this._applyHudLayout();
    this._settle.hide();
    this._fx.reset();
    this._clearActors();
    this._state = createRun(Date.now() >>> 0);
    this._clearSelect();
    this._accMs = 0;
    this._hitFlash.clear();
    this._hurtFlash.clear();
    this._lastEnemyXY.clear();
    this._prevDist.clear();
    this._enemyKind.clear();
    this._rangeHint.visible = false;
    this._pickIdle = 0;
    this._guideLife = 0;
    this._gapTold = 0;
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
    return this._state.team.length > 0 && (p === 'fighting' || p === 'gap');
  }

  private _clearSelect(): void {
    this._selected = null;
    this._accMs = 0;
    this._dock.refresh(this._state, null);
  }

  /**
   * 点一个站位。装配阶段是「装给这格的人」，其余时候是选中／换到那一格。
   * 空位也能点：人少的时候可以把人往后撤，不用非跟谁换。
   */
  private _tapSlot(slot: number): void {
    const s = this._state;
    const occupant = heroAt(s, slot);
    if (s.phase === 'installing') {
      if (!occupant) return;
      const mod = s.pendingMod;
      if (!mod) return;
      playSfx('ui_tap', 0);
      const modName = mod.name;
      const becomes = mod.becomes;
      if (!installMod(s, occupant.def.id)) return;
      const dest = this._heroXY(occupant.def.id);
      this._fx.flyMod(375, this._dock.y + 40, dest?.x ?? this._slotX(slot), dest?.y ?? this._slotY(slot), modTex(mod.id));
      this._clearSelect();
      this._accMs = 0;
      this._say(`${occupant.def.name}装上了${modName}：${becomes}`);
      return;
    }

    if (!this._canReorder()) return;
    playSfx('ui_tap', 0);
    if (!this._selected) {
      if (occupant) this._selected = occupant.def.id;
      return;
    }
    if (occupant?.def.id === this._selected) {
      this._clearSelect();
      return;
    }
    const mover = s.team.find((h) => h.def.id === this._selected);
    if (mover && placeInSlot(s, mover.def.id, slot)) {
      this._say(`${mover.def.name}站到${SLOT_NAME[slot] ?? '那个位置'}`);
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
    // 底栏先钉死，战场下沿贴着栏，小队坐在栏上。多出来的高度全给外星人走路。
    const fieldBottom = height - Game.safeBottom - DOCK_H - DOCK_GAP;
    const frontY = fieldBottom - 16 - BACK_DY;
    this._lay = {
      top,
      fieldTop,
      fieldBottom,
      frontY,
      height,
      pxPerCell: Math.max(1, (frontY - fieldTop) / SPAWN_DIST),
    };
  }

  /**
   * 战场坐标 → 屏幕 Y。坐标越大越靠上（越靠外星人来的方向）。
   * 对打线钉在底栏上方；上路（0→出场点）拉满空场。队尾只留薄薄一条，
   * 够表现「推过去了」，不要在人脚下空出半屏土。
   */
  private _posToY(pos: number): number {
    const min = REAR_POS - MELEE_REACH;
    const { frontY, fieldBottom, pxPerCell } = this._lay;
    if (pos >= 0) {
      const t = Math.min(SPAWN_DIST, pos);
      return frontY - t * pxPerCell;
    }
    const depth = Math.min(0, Math.max(min, pos));
    const home = fieldBottom - frontY;
    return frontY + (depth / min) * home;
  }

  private _slotY(slot: number): number {
    return slot <= 0 ? this._lay.frontY : this._lay.frontY + BACK_DY;
  }

  private _slotX(slot: number): number {
    if (slot === 1) return SQUAD_X - BACK_DX;
    if (slot === 2) return SQUAD_X + BACK_DX;
    return SQUAD_X;
  }

  update(dt: number): void {
    const s = this._state;

    // 点中人时战斗停住：换位是想清楚的决定，但不弹窗打断看戏
    if (this._selected) {
      this._drawField();
      this._tickActors(dt);
      this._updateHud();
      return;
    }

    if (this._fx.hitStop > 0) {
      this._fx.hitStop = Math.max(0, this._fx.hitStop - dt);
      this._fx.update(dt);
      this._drawField();
      this._tickActors(dt);
      this._updateHud();
      return;
    }

    if (s.phase === 'picking') {
      if (this._pick.children.length === 0) this._renderPickCards();
      if (isRosterPicking(s) && s.team.length === 0) {
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
        if (phase === 'gap' && this._gapTold !== this._state.wave) {
          this._gapTold = this._state.wave;
          this._say(`第 ${this._state.wave} 波 · ${getWave(this._state.wave).hint}`);
        }
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
    if (this._guideLife > 0) {
      this._guideLife -= dt;
      this._guide.visible = this._guideLife > 0;
    }

    this._fx.update(dt);
    this._drawField();
    this._tickActors(dt);
    this._updateHud();
  }

  private _heroXY(heroId: string): { x: number; y: number } | undefined {
    const h = this._state.team.find((x) => x.def.id === heroId);
    if (!h) return undefined;
    return { x: this._slotX(h.slot), y: this._slotY(h.slot) - heroH(h) * 0.45 };
  }

  private _visualDist(e: EnemyUnit): number {
    const prev = this._prevDist.get(e.id);
    if (prev === undefined) return e.dist;
    const u = Math.max(0, Math.min(1, this._accMs / TICK_MS));
    return prev + (e.dist - prev) * u;
  }

  private _enemyXY(id: number): { x: number; y: number } | undefined {
    const e = this._state.enemies.find((x) => x.id === id);
    if (e) return { x: alienLaneX(e.id), y: this._posToY(this._visualDist(e)) - enemyH(e) * 0.45 };
    return this._lastEnemyXY.get(id);
  }

  private _rememberUnits(): void {
    this._lastEnemyXY.clear();
    this._prevDist.clear();
    for (const e of this._state.enemies) {
      this._prevDist.set(e.id, e.dist);
      this._enemyKind.set(e.id, e.proto.id);
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
        if (attacker) {
          const actor = this._heroActors.get(ev.heroId);
          const enemy = this._enemyXY(ev.enemyId);
          if (actor && enemy) {
            actor.playAttack(enemy.x, enemy.y, motionFor(resolveAttackFx(attacker.def, attacker.mods)));
          }
        }
      }
      if (ev.kind === 'enemyHit') {
        this._hurtFlash.set(ev.heroId, 140);
        this._heroActors.get(ev.heroId)?.flash(140);
        this._enemyActors.get(ev.enemyId)?.playAttack(
          this._heroXY(ev.heroId)?.x ?? 375,
          this._heroXY(ev.heroId)?.y ?? this._lay.frontY,
          'lunge',
        );
      }
      if (ev.kind === 'hit') this._enemyActors.get(ev.enemyId)?.flash(120);

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
        fx: attacker ? resolveAttackFx(attacker.def, attacker.mods) : undefined,
        enemyFx: ev.kind === 'enemyHit' || ev.kind === 'enemyDown'
          ? resolveEnemyFx(
            this._enemyKind.get(ev.enemyId)
              ?? this._state.enemies.find((e) => e.id === ev.enemyId)?.proto.id
              ?? 'grey',
          )
          : undefined,
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
    const card = this._pick.children.find((c) => c.name === 'pick-card-0') as PIXI.Container | undefined;
    if (!card || card.children.some((c) => c.name === 'idle-glow')) return;
    const glow = new PIXI.Graphics();
    glow.name = 'idle-glow';
    const roster = isRosterPicking(this._state);
    const w = roster ? ROSTER_CARD_W : PICK_CARD_W;
    const h = roster ? ROSTER_CARD_H : PICK_CARD_H;
    // 贴着卡边画，不能再往左上偏——旧尺寸 + (-6,-6) 会让第一张看起来没对齐
    glow.lineStyle(5, GOLD, 0.95).drawRoundedRect(1, 1, w - 2, h - 2, 19);
    card.addChild(glow);
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
      g.beginFill(0xffffff, 0.001).drawRoundedRect(-64, -110, 128, 124, 14).endFill();
      hit.addChild(g);
      bindPointerTap(hit, () => this._tapSlot(slot));
      hit.name = `queue:${slot}`;
      this._heroHits.push(hit);
      this.container.addChild(hit);
    }
  }

  private _applyHudLayout(): void {
    const { top, fieldBottom } = this._lay;
    this._waveText.position.set(44, top + 6);
    this._hintText.position.set(44, top + 44);
    this._dock.place(fieldBottom + DOCK_GAP);
    this._guide.position.set(375, this._lay.frontY - 118);
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
    const opening = isRosterPicking(s);
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
    this._inspectTitle.text = `${hero.def.name} · ${SLOT_NAME[hero.slot]}`;
    this._inspectDesc.text = '再点前排 / 左后 / 右后换过去';
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
      homeTerrace(g, SQUAD_X, this._lay.frontY, this._lay.frontY + BACK_DY);
    }
    this._drawQueuePads(g);

    if (this._fx.landPulse > 0) {
      g.beginFill(GOLD, this._fx.landPulse * 1.1).drawEllipse(SQUAD_X, this._slotY(0) + 8, 90, 22).endFill();
    }

    this._drawSelectedRange(g);

    // 先画后排再画前排，前面的人压在后面的人身上
    for (const h of [...teamInOrder(this._state)].reverse()) this._drawHero(g, h);
    for (const e of this._state.enemies) this._drawEnemy(g, e);
    this._drawHeroNames();
  }

  private _clearActors(): void {
    for (const a of this._heroActors.values()) a.destroy();
    for (const a of this._enemyActors.values()) a.destroy();
    this._heroActors.clear();
    this._enemyActors.clear();
    this._unitLayer.removeChildren();
  }

  private _syncActors(): void {
    const liveH = new Set<string>();
    if (this._showTeam()) {
      for (const h of this._state.team) {
        liveH.add(h.def.id);
        let a = this._heroActors.get(h.def.id);
        if (!a) {
          a = new UnitActor();
          a.bindHero(h.def.id);
          this._heroActors.set(h.def.id, a);
          this._unitLayer.addChild(a.view);
        }
        a.place(this._slotX(h.slot), this._slotY(h.slot), heroH(h));
        a.setDead(!h.alive);
        a.view.zIndex = 20 - h.slot;
      }
    }
    for (const [id, a] of [...this._heroActors]) {
      if (liveH.has(id)) continue;
      a.destroy();
      this._heroActors.delete(id);
    }

    const liveE = new Set<number>();
    for (const e of this._state.enemies) {
      liveE.add(e.id);
      let a = this._enemyActors.get(e.id);
      if (!a) {
        a = new UnitActor();
        a.bindEnemy(e.proto.id);
        this._enemyActors.set(e.id, a);
        this._unitLayer.addChild(a.view);
      }
      a.place(alienLaneX(e.id), this._posToY(this._visualDist(e)), enemyH(e));
      a.walkBob = this._state.phase === 'fighting';
      a.view.zIndex = Math.round(e.dist * 10);
    }
    for (const [id, a] of [...this._enemyActors]) {
      if (liveE.has(id)) continue;
      a.destroy();
      this._enemyActors.delete(id);
    }
    this._unitLayer.sortableChildren = true;
  }

  private _tickActors(dt: number): void {
    this._syncActors();
    this._aimActors();
    for (const a of this._heroActors.values()) a.update(dt);
    for (const a of this._enemyActors.values()) a.update(dt);
  }

  /** 待机看向最近威胁，出手方向才跟战场轴对上 */
  private _aimActors(): void {
    const foes = this._state.enemies;
    for (const h of this._state.team) {
      const actor = this._heroActors.get(h.def.id);
      if (!actor || foes.length === 0) continue;
      let best = foes[0];
      let bestD = Infinity;
      const hx = this._slotX(h.slot);
      for (const e of foes) {
        const d = Math.abs(alienLaneX(e.id) - hx) + e.dist * 8;
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      actor.faceToward(alienLaneX(best.id));
    }
    for (const e of foes) {
      const actor = this._enemyActors.get(e.id);
      if (!actor) continue;
      const live = this._state.team.filter((h) => h.alive);
      if (live.length === 0) continue;
      let best = live[0];
      let bestD = Infinity;
      const ex = alienLaneX(e.id);
      for (const h of live) {
        const d = Math.abs(this._slotX(h.slot) - ex);
        if (d < bestD) {
          bestD = d;
          best = h;
        }
      }
      actor.faceToward(this._slotX(best.slot));
    }
  }

  private _drawQueuePads(g: PIXI.Graphics): void {
    const show = this._showTeam();
    for (let slot = 0; slot < TEAM_SIZE; slot += 1) {
      const name = `pad:${slot}`;
      let tag = this._nameLayer.children.find((c) => c.name === name) as PIXI.Text | undefined;
      if (!tag) {
        tag = label(14, GOLD, true);
        tag.name = name;
        tag.anchor.set(0.5, 0);
        tag.style.stroke = 0x2a160c;
        tag.style.strokeThickness = 3;
        this._nameLayer.addChild(tag);
      }
      tag.visible = show;
      if (!show) continue;

      const x = this._slotX(slot);
      const y = this._slotY(slot);
      const occ = heroAt(this._state, slot);
      const selected = this._selected
        ? this._state.team.find((h) => h.def.id === this._selected)
        : undefined;
      const installing = this._state.phase === 'installing';
      const canTake = installing && occ
        ? installTargets(this._state).some((h) => h.def.id === occ.def.id)
        : false;
      const moving = !!selected && this._canReorder() && selected.slot !== slot;
      queuePad(g, x, y, {
        empty: !occ,
        hot: canTake || moving,
        front: slot === 0 && !moving && !installing,
      });
      tag.text = SLOT_NAME[slot];
      if (slot === 1) tag.position.set(x - 54, y - 6);
      else if (slot === 2) tag.position.set(x + 54, y - 6);
      else tag.position.set(x, y + 20);
    }
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
      if (!c.name || c.name.startsWith('pad:')) continue;
      if (!live.has(c.name)) c.destroy();
    }
  }

  private _drawHero(g: PIXI.Graphics, h: HeroUnit): void {
    const x = this._slotX(h.slot);
    const feet = this._slotY(h.slot);
    const size = heroH(h);

    if (!h.alive) {
      g.beginFill(0x000000, 0.4).drawEllipse(x, feet + 8, 34, 10).endFill();
      return;
    }

    if (this._selected === h.def.id) {
      g.lineStyle(3, GOLD, 0.95).drawEllipse(x, feet + 8, 48, 14).lineStyle(0);
    }

    // 破烂挂在身上：看得见「他变成了什么」，不是三个金点
    const hang = [
      { dx: 30, dy: -size * 0.55 },
      { dx: -32, dy: -size * 0.38 },
      { dx: 8, dy: -size * 0.92 },
    ];
    for (let i = 0; i < h.mods.length; i += 1) {
      const p = hang[i];
      if (!p) continue;
      const mx = x + p.dx;
      const my = feet + p.dy;
      g.beginFill(0xfff4c4, 0.95).drawRoundedRect(mx - 13, my - 13, 26, 26, 6).endFill();
      const t = modTex(h.mods[i]!.id);
      if (t?.baseTexture.valid && t.width > 1) fillContain(g, t, mx, my + 10, 22, 22);
      else g.beginFill(GOLD, 0.9).drawRoundedRect(mx - 10, my - 10, 20, 20, 4).endFill();
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
    const feet = this._posToY(this._visualDist(e));
    const flashing = this._hitFlash.has(e.id);
    if (flashing) g.beginFill(0xffffff, 0.2).drawEllipse(x, feet - size * 0.2, size * 0.35, 12).endFill();
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

    const roster = isRosterPicking(s);
    const dim = new PIXI.Graphics();
    dim.beginFill(0x2a160c, roster ? 0.38 : 0.55).drawRect(0, 0, 750, this._lay.height).endFill();
    this._pick.addChild(dim);

    const titleY = this._lay.fieldTop + (roster ? 8 : (this._lay.fieldBottom - this._lay.fieldTop) * 0.16);

    const title = label(roster ? 32 : 36, 0xfff4c4, true);
    title.style.stroke = '#2a160c';
    title.style.strokeThickness = 6;
    title.anchor.set(0.5);
    title.position.set(375, titleY);
    title.text = roster ? '叫三个人来' : '废品站今天有这些';
    this._pick.addChild(title);

    const names = s.team.map((h) => h.def.name);
    const left = TEAM_SIZE - s.team.length;
    const sub = label(roster ? 22 : 24, 0xfff1a8, true);
    sub.style.stroke = '#2a160c';
    sub.style.strokeThickness = 4;
    sub.anchor.set(0.5);
    sub.position.set(375, titleY + (roster ? 38 : 44));
    sub.text = roster
      ? names.length === 0
        ? '点满三个就开打，点错再点一下取消'
        : `已叫${names.join('、')} · 还差 ${left} 个`
      : '挑一件，下一步决定装给谁';
    this._pick.addChild(sub);

    if (roster) {
      const cardW = ROSTER_CARD_W;
      const cardH = ROSTER_CARD_H;
      const gapX = 12;
      const gapY = 10;
      const cols = 3;
      const totalW = cols * cardW + (cols - 1) * gapX;
      const startX = (750 - totalW) / 2;
      const startY = titleY + 68;
      s.pendingOptions.forEach((opt, i) => {
        const picked = opt.kind === 'recruit'
          ? s.team.findIndex((h) => h.def.id === opt.heroId)
          : -1;
        const card = this._buildCard(opt, cardW, cardH, picked >= 0 ? picked : undefined);
        card.name = `pick-card-${i}`;
        const col = i % cols;
        const row = Math.floor(i / cols);
        card.position.set(startX + col * (cardW + gapX), startY + row * (cardH + gapY));
        this._pick.addChild(card);
        bindPointerTap(card, () => this._choose(opt));
      });
      return;
    }

    const cardW = PICK_CARD_W;
    const cardH = PICK_CARD_H;
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

  private _buildCard(opt: PickOption, w: number, h: number, picked?: number): PIXI.Container {
    const card = new PIXI.Container();
    card.eventMode = 'static';

    const info = this._describe(opt);
    // 立绘、正文、底条各占一段，正文再长也只在自己那一段里换行，不许压到金条或卡边
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

    // 「装上会变成什么」是改装件卡的重点，必须比效果数值更显眼
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
      subtitle: `${def.job} · ${def.range <= 1 ? '贴脸' : `射程 ${def.range}`} · ${abilityTag(def.skill)}`,
      desc: def.skillDesc,
      color: villagerColor(def.id),
      becomes: def.eats,
    };
  }

  private _choose(opt: PickOption): void {
    const roster = isRosterPicking(this._state);
    playSfx('ui_tap', 0);
    applyPick(this._state, opt);
    this._accMs = 0;
    this._pickIdle = 0;
    if (isRosterPicking(this._state)) {
      this._renderPickCards();
      return;
    }
    this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (roster && this._state.phase === 'fighting') {
      this._fx.markLand();
      this._say('外星人下来了，撑过 15 波');
    }
  }
}
