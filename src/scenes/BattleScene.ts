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
import { SceneManager, type Scene } from '@/core/SceneManager';
import { bindPointerTap } from '@/minigame';
import {
  BACK_DY,
  MELEE_REACH,
  REAR_POS,
  SLOT_NAME,
  SPAWN_DIST,
  SQUAD_X,
  TICK_MS,
  TEAM_SIZE,
  WAVE_TIMEOUT_MS,
  heroSpriteH,
  slotScreenX,
  slotScreenY,
  slotTagPos,
} from '@/balance/combat';
import { comboIfAdd, comboOf } from '@/balance/combos';
import { comboTeaser, installForecast } from '@/balance/forecast';
import { REROLL_COST, STRIP_COST } from '@/balance/rewards';
import { waveHeadline } from '@/balance/enemies';
import { resolveAttackFx, resolveEnemyFx } from '@/balance/fx';
import { DEFAULT_SQUAD, getHero } from '@/balance/heroes';
import { abilityTag, getMod } from '@/balance/mods';
import type { PickOption } from '@/balance/picker';
import { DOCK_GAP, DOCK_H, ModDock } from '@/ui/ModDock';
import { ReviveOverlay } from '@/ui/ReviveOverlay';
import { SettleOverlay } from '@/ui/SettleOverlay';
import { CombatFx } from '@/fx/CombatFx';
import { motionFor, UnitActor } from '@/fx/UnitActor';
import { addFitPortrait, bgTex, fillContain, fillCover, heroTex, modTex, preloadBattleArt, watchArt } from '@/core/TextureLoader';
import { playSfx } from '@/core/SfxPlayer';
import { track } from '@/core/Analytics';
import {
  bankToYard,
  consumeNextGift,
  consumeNextPin,
  consumeNextScrap,
  loadMemory,
  saveRun,
  saveSquad,
  stashNextPin,
  stashNextScrap,
} from '@/core/RunMemory';
import { goalLine, nextYardGoal, startScrapBonus, yardDeposit } from '@/balance/yard';
import { Platform } from '@/core/PlatformService';
import {
  adCanShow,
  adIsFirstRunToday,
  adMarkRunStart,
  adRecord,
  adRemaining,
  type AdPlacement,
} from '@/core/AdDay';
import { GOLD, goldBtn, homeTerrace, hpBar, plate, queuePad, rangeArea, shieldMark } from '@/ui/paint';
import {
  applyPick,
  canInstallOn,
  claimJunkyard,
  claimOpeningGift,
  createRun,
  heroReach,
  heroAt,
  installMod,
  installTargets,
  isRosterPicking,
  placeInSlot,
  rerollMods,
  reviveAfterWipe,
  stripMod,
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

const PICK_CARD_W = 218;
const PICK_CARD_H = 400;
/** 开局 6 人一屏，两排三张，比波间三选一更扁 */
const ROSTER_CARD_W = 216;
const ROSTER_CARD_H = 278;

function villagerColor(id: string): number {
  return VILLAGER_COLOR[id] ?? GOLD;
}

function heroH(h: HeroUnit): number {
  return heroSpriteH(h.def.hp);
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
  private readonly _dock = new ModDock(
    (slot) => this._tapSlot(slot),
    (slot, modIndex) => this._strip(slot, modIndex),
  );
  private readonly _settle = new SettleOverlay(
    () => this.onEnter({ heroIds: this._state.team.map((h) => h.def.id) }),
    () => this._doubleSettle(),
    () => this._settleJunkyard(),
    () => SceneManager.switchTo('village'),
  );
  private readonly _revive = new ReviveOverlay(
    () => { void this._acceptRevive(); },
    () => this._giveUpRevive(),
  );
  private readonly _fx = new CombatFx();
  private readonly _heroHits: PIXI.Container[] = [];
  private readonly _guide = label(26, 0xffd66b, true);

  private readonly _waveText = label(34, 0xffffff, true);
  private readonly _scrapText = label(22, GOLD, true);
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
  private _baseScrap = 0;
  private _selected: string | null = null;
  private _pickShownKey = '';
  private _installShownKey = '';
  private _runStarted = false;
  private _openClock = 0;
  private _openingHintSaid = false;
  private _cardPulsed = false;
  private _offerBusy = false;
  private _pickArtTimer: ReturnType<typeof setTimeout> | 0 = 0;

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
    this.container.addChild(this._revive);
    this.container.addChild(this._settle);
    this._rangeHint.anchor.set(0.5);
    this._rangeHint.visible = false;
    this.container.addChild(this._rangeHint);
    this._computeLayout();
    this._buildHeroHits();
    this._buildHud();
    watchArt(() => {
      // 贴图陆续到位时不要立刻拆掉卡：按下和抬起会落在两棵树上，点了没反应
      if (this._state.phase === 'picking') this._refreshPickArt();
      for (const [id, a] of this._heroActors) {
        const hero = this._state.team.find((h) => h.def.id === id);
        a.bindHero(id, hero?.mods.map((m) => m.id) ?? []);
      }
      for (const e of this._state.enemies) this._enemyActors.get(e.id)?.bindEnemy(e.proto.id);
    });
  }

  onEnter(data?: unknown): void {
    preloadBattleArt();
    this._computeLayout();
    this._applyHudLayout();
    this._settle.hide();
    this._revive.hide();
    this._fx.reset();
    this._clearActors();
    const mem = loadMemory();
    const asked = data && typeof data === 'object' && 'heroIds' in data
      ? (data as { heroIds: string[] }).heroIds
      : undefined;
    const squad = (asked?.length === TEAM_SIZE ? asked : mem.squadIds)
      .filter((id, i, all) => !!id && all.indexOf(id) === i)
      .slice(0, TEAM_SIZE);
    const heroes = squad.length === TEAM_SIZE ? squad : [...DEFAULT_SQUAD];
    saveSquad(heroes);
    const carry = consumeNextScrap();
    const bonus = startScrapBonus(mem.startScrapLv);
    const pocket = carry.amount + bonus;
    this._state = createRun(
      Date.now() >>> 0,
      pocket,
      carry.amount > 0 ? carry.source : 'free',
      consumeNextPin(),
      mem.unlockedMods,
      heroes,
      consumeNextGift(),
    );
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
    this._baseScrap = 0;
    this._pickShownKey = '';
    this._installShownKey = '';
    this._runStarted = false;
    this._openClock = 0;
    this._openingHintSaid = false;
    this._cardPulsed = false;
    this._offerBusy = false;
    if (this._pickArtTimer) {
      clearTimeout(this._pickArtTimer);
      this._pickArtTimer = 0;
    }
    this._guide.visible = false;
    if (this._state.phase === 'fighting') {
      this._runStarted = true;
      adMarkRunStart();
      track('run_start', {
        seed: this._state.seed,
        opening_heroes: this._state.team.map((h) => h.def.id),
      });
      this._fx.markLand(SQUAD_X, this._slotY(0));
    }
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
      const who = occupant.def.name;
      const combo = comboIfAdd(occupant.mods.map((m) => m.id), mod.id);
      const becomes = combo?.becomes ?? mod.becomes;
      if (!installMod(s, occupant.def.id)) return;
      this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));
      this._installShownKey = '';
      const dest = this._heroXY(occupant.def.id);
      this._fx.flyMod(375, this._dock.y + 40, dest?.x ?? this._slotX(slot), dest?.y ?? this._slotY(slot), modTex(mod.id));
      this._consumeEvents();
      this._clearSelect();
      this._accMs = 0;
      this._say(`${who}装上了${mod.name}：变成了${becomes}`);
      track('mod_install', {
        wave: s.wave,
        mod_id: mod.id,
        target_hero: occupant.def.id,
        target_slot: occupant.slot,
        target_mod_count: occupant.mods.length,
      });
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
    const before = teamInOrder(s).map((h) => h.def.id);
    if (mover && placeInSlot(s, mover.def.id, slot)) {
      this._say(`${mover.def.name}站到${SLOT_NAME[slot] ?? '那个位置'}`);
      track('queue_change', {
        wave: s.wave,
        order_before: before,
        order_after: teamInOrder(s).map((h) => h.def.id),
      });
    }
    this._clearSelect();
  }

  private _strip(slot: number, modIndex: number): void {
    const hero = heroAt(this._state, slot);
    if (!hero) return;
    const piece = hero.mods[modIndex];
    if (!piece) return;
    if (this._state.scrap < STRIP_COST) {
      this._say(`拆一件要 ${STRIP_COST} 废品`);
      return;
    }
    if (!stripMod(this._state, hero.def.id, modIndex)) return;
    playSfx('ui_tap', 0);
    this._say(`拆了${hero.def.name}的${piece.name}`);
    this._dock.refresh(this._state, this._selected);
    this._updateHud();
  }

  private _reroll(): void {
    if (this._state.scrap < REROLL_COST) {
      this._say(`重抽要 ${REROLL_COST} 废品`);
      return;
    }
    if (!rerollMods(this._state)) return;
    playSfx('ui_tap', 0);
    this._renderPickCards();
    this._updateHud();
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
    return slotScreenY(slot, this._lay.frontY);
  }

  private _slotX(slot: number): number {
    return slotScreenX(slot);
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

    if (!this._settled && !this._openingHintSaid) this._openClock += dt;
    if (this._runStarted && !this._openingHintSaid && this._openClock >= 8) {
      this._openingHintSaid = true;
      this._say('外星人下来了，撑过 15 波');
    }

    if (s.phase === 'picking') {
      if (this._pick.children.length === 0) this._renderPickCards();
      if (isRosterPicking(s) && s.team.length === 0) {
        if (this._openClock >= 1.5 && !this._cardPulsed) this._pulseRosterCards();
        if (this._openClock >= 3) this._highlightFirstCard();
      }
    } else if (s.phase === 'installing') {
      // 跟选牌一样铺在屏幕中间。只留场上三个人时，模拟器底部点不中
      this._renderInstallCards();
    } else if (this._pick.children.length > 0) {
      this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));
      this._installShownKey = '';
    }
    if (s.phase === 'fighting' || s.phase === 'gap') {
      // 按固定步长推进，与批量回归完全一致：掉帧只会让画面变慢，不会改变战斗结果
      this._accMs += dt * 1000;
      let guard = 0;
      while (this._accMs >= TICK_MS && guard++ < 8) {
        this._accMs -= TICK_MS;
        this._rememberUnits();
        const waveBefore = s.wave;
        const phaseBefore = s.phase;
        tick(s);
        this._consumeEvents();
        // 经 tick 后 phase 可能已变，这里必须重新读状态
        const phase = this._state.phase;
        if (phaseBefore === 'fighting'
          && (phase === 'gap' || phase === 'picking' || phase === 'won')) {
          track('wave_clear', {
            wave: waveBefore,
            duration_ms: s.waveElapsedMs,
            alive_count: s.team.filter((h) => h.alive).length,
          });
        }
        if (phase === 'gap' && this._gapTold !== this._state.wave) {
          this._gapTold = this._state.wave;
          this._say(`第 ${this._state.wave} 波 · ${waveHeadline(this._state.wave)}`);
        }
        if (phase === 'picking') {
          this._renderPickCards();
          break;
        }
        if (phase === 'won' || phase === 'lost') {
          this._endRun();
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
      if (ev.kind === 'install') {
        const who = this._state.team.find((h) => h.def.id === ev.heroId);
        const actor = this._heroActors.get(ev.heroId);
        if (who && actor) {
          actor.equip(who.mods.map((m) => m.id));
          const foe = this._state.enemies[0];
          const aim = foe ? this._enemyXY(foe.id) : { x: 520, y: this._lay.fieldTop + 180 };
          if (aim) actor.playAttack(aim.x, aim.y, motionFor(resolveAttackFx(who.def, who.mods)));
        }
      }
      if (ev.kind === 'heroDown') {
        const who = this._state.team.find((h) => h.def.id === ev.heroId);
        track('hero_down', {
          wave: this._state.wave,
          hero_id: ev.heroId,
          slot: who?.slot ?? -1,
        });
        if (who?.slot === 0 && this._state.team.some((h) => h.alive)) {
          this._say('队首倒了，点人换上去');
        }
      }

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
        installLine: ev.kind === 'install'
          ? this._installLine(ev.heroId, ev.modId)
          : undefined,
      });
    }
    this._state.events.length = 0;
  }

  private _endRun(): void {
    if (this._settled || this._revive.visible) return;
    const s = this._state;
    if (s.phase === 'lost' && s.loseReason === 'wipe' && adCanShow('revive')) {
      this._revive.show(s.wave, adRemaining('revive'), this._lay.height);
      playSfx('lose', 0);
      return;
    }
    this._openSettle();
  }

  private async _watchAd(placement: AdPlacement): Promise<boolean> {
    track('ad_show', { placement, wave: this._state.wave });
    const ok = await Platform.showRewardedVideo();
    track('ad_close', { placement, wave: this._state.wave, completed: ok });
    return ok;
  }

  private _installLine(heroId: string, modId: string): string {
    const who = this._state.team.find((h) => h.def.id === heroId);
    const piece = getMod(modId);
    const combo = who ? comboOf(who.mods.map((m) => m.id)) : undefined;
    const name = who?.def.name ?? '他';
    return `${name}装上了${piece.name}：变成了${combo?.becomes ?? piece.becomes}`;
  }

  private async _acceptRevive(): Promise<void> {
    const ok = await this._watchAd('revive');
    if (!ok) {
      this._revive.hide();
      this._openSettle();
      return;
    }
    adRecord('revive');
    if (!reviveAfterWipe(this._state)) {
      this._revive.hide();
      this._openSettle();
      return;
    }
    this._revive.hide();
    this._consumeEvents();
    this._say('又站起来了，这套还在');
  }

  private _giveUpRevive(): void {
    this._revive.hide();
    this._openSettle();
  }

  private async _doubleSettle(): Promise<boolean> {
    if (!adCanShow('settleDouble')) return false;
    const ok = await this._watchAd('settleDouble');
    if (!ok) return false;
    adRecord('settleDouble');
    stashNextScrap(Math.max(16, this._baseScrap * 2), 'ad');
    return true;
  }

  private _openSettle(): void {
    if (this._settled) return;
    this._settled = true;
    this._baseScrap = this._state.scrap;
    const deposited = yardDeposit(this._state.wave, this._baseScrap);
    saveRun(
      this._state.wave,
      this._state.team.map((h) => h.def.id),
    );
    const mem = bankToYard(deposited);
    track('run_end', {
      reached_wave: this._state.wave,
      cleared: this._state.phase === 'won',
      duration_ms: this._state.totalMs,
      team_with_mods: this._state.team.map((h) => ({
        id: h.def.id,
        slot: h.slot,
        mods: h.mods.map((m) => m.id),
      })),
      installs: this._state.stats.installs,
    });
    playSfx(this._state.phase === 'won' ? 'win' : 'lose', 0);
    this._settle.show(this._state, mem, this._lay.height, {
      scrap: this._baseScrap,
      earned: this._state.scrapEarned,
      spent: this._state.scrapSpent,
      canDouble: adCanShow('settleDouble'),
      canJunkyard: adCanShow('junkyard'),
      loseReason: this._state.loseReason,
      nextMove: this._state.phase === 'lost' ? loseNextMove(this._state) : '',
      yardScrap: mem.yardScrap,
      yardIn: deposited,
      yardGoal: goalLine(nextYardGoal(mem.yardScrap, mem.unlockedMods, mem.startScrapLv)),
    });
  }

  private async _settleJunkyard(): Promise<boolean> {
    if (!adCanShow('junkyard')) return false;
    const ok = await this._watchAd('junkyard');
    if (!ok) return false;
    adRecord('junkyard');
    const mod = claimJunkyard(this._state);
    if (!mod) return false;
    stashNextPin(mod.id);
    return true;
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
      this._scrapText,
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
      g.beginFill(0xffffff, 0.001).drawRoundedRect(-110, -230, 220, 260, 16).endFill();
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
    this._scrapText.position.set(220, top + 10);
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
    this._scrapText.visible = !opening;
    this._hintText.visible = !opening;
    this._waveText.text = `第 ${s.wave} 波`;
    this._scrapText.text = `废品 ${s.scrap}`;

    if (s.phase === 'won' || s.phase === 'lost') {
      this._hintText.text = '';
      if (this._selected) this._clearSelect();
    } else if (s.phase === 'fighting' && s.waveElapsedMs >= WAVE_TIMEOUT_MS - 20_000) {
      this._hintText.text = '再打不动这波就散了';
    } else {
      this._hintText.text = s.wave >= 1 ? waveHeadline(s.wave) : '';
    }

    for (const hit of this._heroHits) {
      // 装配时中间有大卡，场上热区会跟卡叠在一起点错人
      hit.visible = this._showTeam() && this._state.phase !== 'installing';
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
    this._installDesc.text = '点中间那个人焊上去';
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
          a.bindHero(h.def.id, h.mods.map((m) => m.id));
          this._heroActors.set(h.def.id, a);
          this._unitLayer.addChild(a.view);
        }
        a.equip(h.mods.map((m) => m.id));
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
      const tagAt = slotTagPos(slot, x, y);
      tag.position.set(tagAt.x, tagAt.y);
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
      // 装配时三人头顶各写一句：值、能用、浪费，不要只写「装他」
      if (this._state.phase === 'installing' && this._state.pendingMod && canInstallOn(h)) {
        const forecast = installForecast(h, this._state.pendingMod);
        tag.text = forecast.line;
        tag.tint = forecast.fit === 'waste' ? 0x8a90a8 : forecast.fit === 'good' ? 0x9be08a : GOLD;
      } else {
        const combo = comboOf(h.mods.map((m) => m.id));
        tag.text = combo
          ? combo.name
          : h.mods.length > 0
            ? (h.mods[h.mods.length - 1]?.name ?? abilityTag(h.def.skill))
            : abilityTag(h.def.skill);
        tag.tint = h.alive ? 0xffd66b : 0x6b7394;
      }
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
    if (this._state.phase === 'installing' && this._state.pendingMod && canInstallOn(h)) {
      g.lineStyle(3, GOLD, 0.9).drawEllipse(x, feet + 8, 52, 16).lineStyle(0);
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

  private _refreshPickArt(): void {
    if (this._pickArtTimer) clearTimeout(this._pickArtTimer);
    this._pickArtTimer = setTimeout(() => {
      this._pickArtTimer = 0;
      if (this._state.phase === 'picking') this._renderPickCards();
      if (this._state.phase === 'installing') {
        this._installShownKey = '';
        this._renderInstallCards();
      }
    }, 220);
  }

  /** 装配：三张大卡铺在屏幕中间，跟刚选破烂同一套点击 */
  private _renderInstallCards(): void {
    const s = this._state;
    if (s.phase !== 'installing' || !s.pendingMod) return;
    const key = `${s.pendingMod.id}:${s.team.map((h) => `${h.def.id}:${h.slot}`).join(',')}`;
    if (this._installShownKey === key && this._pick.children.length > 0) return;
    this._installShownKey = key;
    this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));

    const dim = new PIXI.Graphics();
    dim.beginFill(0x2a160c, 0.55).drawRect(0, 0, 750, this._lay.height).endFill();
    this._pick.addChild(dim);

    const titleY = this._lay.fieldTop + (this._lay.fieldBottom - this._lay.fieldTop) * 0.12;
    const title = label(34, 0xfff4c4, true);
    title.style.stroke = '#2a160c';
    title.style.strokeThickness = 6;
    title.anchor.set(0.5);
    title.position.set(375, titleY);
    title.text = `焊给谁 · ${s.pendingMod.name}`;
    this._pick.addChild(title);

    const sub = label(22, 0xfff1a8, true);
    sub.style.stroke = '#2a160c';
    sub.style.strokeThickness = 4;
    sub.anchor.set(0.5);
    sub.position.set(375, titleY + 40);
    sub.text = '三人说法不一样，点对的那个';
    this._pick.addChild(sub);

    const cardW = 218;
    const cardH = 320;
    const gap = 12;
    const targets = teamInOrder(s).filter(canInstallOn);
    const totalW = targets.length * cardW + Math.max(0, targets.length - 1) * gap;
    const startX = (750 - totalW) / 2;
    targets.forEach((h, i) => {
      const card = this._buildInstallCard(h, s.pendingMod!, cardW, cardH);
      card.name = `install-card-${h.def.id}`;
      card.position.set(startX + i * (cardW + gap), titleY + 72);
      this._pick.addChild(card);
      bindPointerTap(card, () => this._tapSlot(h.slot));
    });
  }

  private _buildInstallCard(
    h: HeroUnit,
    mod: NonNullable<RunState['pendingMod']>,
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

  private _renderPickCards(): void {
    this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));

    const s = this._state;
    if (s.phase !== 'picking' || s.pendingOptions.length === 0) return;

    const roster = isRosterPicking(s);
    if (!roster) {
      const key = `${s.wave}:${s.pendingOptions.map((o) => (o.kind === 'mod' ? o.modId : o.heroId)).join(',')}`;
      if (this._pickShownKey !== key) {
        this._pickShownKey = key;
        track('pick_show', {
          wave: s.wave,
          options: s.pendingOptions.map((o) => (o.kind === 'mod' ? o.modId : o.heroId)),
          kinds: s.pendingOptions.map((o) => (o.kind === 'mod' ? getMod(o.modId).kind : 'recruit')),
        });
      }
    }
    const dim = new PIXI.Graphics();
    dim.beginFill(0x2a160c, roster ? 0.38 : 0.55).drawRect(0, 0, 750, this._lay.height).endFill();
    this._pick.addChild(dim);

    const titleY = this._lay.fieldTop + (roster ? 8 : (this._lay.fieldBottom - this._lay.fieldTop) * 0.16);

    const title = label(roster ? 32 : 36, 0xfff4c4, true);
    title.style.stroke = '#2a160c';
    title.style.strokeThickness = 6;
    title.anchor.set(0.5);
    title.position.set(375, titleY);
    title.text = roster ? '叫三个人来' : `下一波：${waveHeadline(s.wave)}`;
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
        ? '点满三个先焊一件，点错再点一下取消'
        : `已叫${names.join('、')} · 还差 ${left} 个`
      : `废品 ${s.scrap} · 挑一件对付它`;
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
      this._renderSideOffers();
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

    const reroll = new PIXI.Container();
    reroll.eventMode = 'static';
    reroll.name = 'reroll-btn';
    const rbg = new PIXI.Graphics();
    goldBtn(rbg, -150, -28, 300, 56);
    if (s.scrap < REROLL_COST) rbg.alpha = 0.45;
    const rl = label(20, GOLD, true);
    rl.anchor.set(0.5);
    rl.text = `花 ${REROLL_COST} 废品换一批`;
    reroll.addChild(rbg, rl);
    reroll.position.set(375, titleY + 84 + cardH + 40);
    this._pick.addChild(reroll);
    bindPointerTap(reroll, () => this._reroll());
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
      const tease = comboTeaser(this._state.team, m.id);
      return {
        title: m.name,
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

  private _choose(opt: PickOption): void {
    const roster = isRosterPicking(this._state);
    playSfx('ui_tap', 0);
    if (opt.kind === 'mod') {
      track('pick_choose', {
        wave: this._state.wave,
        mod_id: opt.modId,
        kind: getMod(opt.modId).kind,
        options: this._state.pendingOptions.map((o) => (o.kind === 'mod' ? o.modId : '')),
      });
    }
    applyPick(this._state, opt);
    this._accMs = 0;
    this._pickIdle = 0;
    if (isRosterPicking(this._state)) {
      this._renderPickCards();
      return;
    }
    if (this._state.phase === 'installing') {
      this._renderInstallCards();
      if (roster) this._lockOpening();
      return;
    }
    this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._installShownKey = '';
    if (roster && this._state.team.length >= TEAM_SIZE) {
      this._lockOpening();
    }
  }

  private _lockOpening(): void {
    if (!this._runStarted) {
      this._runStarted = true;
      adMarkRunStart();
      track('run_start', {
        seed: this._state.seed,
        opening_heroes: this._state.team.map((h) => h.def.id),
      });
      this._fx.markLand(SQUAD_X, this._slotY(0));
    }
    if (this._state.phase === 'installing' && this._state.pendingMod) {
      this._renderInstallCards();
      this._say(`白送的${this._state.pendingMod.name}，点中间一个人`);
    } else if (this._state.phase === 'picking') {
      this._say('先焊一件再打第一波');
    }
  }

  private _pulseRosterCards(): void {
    this._cardPulsed = true;
    for (const child of this._pick.children) {
      if (!child.name?.startsWith('pick-card-')) continue;
      const card = child as PIXI.Container;
      if (card.children.some((c) => c.name === 'idle-pulse')) continue;
      const glow = new PIXI.Graphics();
      glow.name = 'idle-pulse';
      glow.lineStyle(3, GOLD, 0.55).drawRoundedRect(4, 4, ROSTER_CARD_W - 8, ROSTER_CARD_H - 8, 16);
      card.addChild(glow);
    }
  }

  private _offerChip(title: string, x: number, y: number, onTap: () => void): PIXI.Container {
    const chip = new PIXI.Container();
    chip.eventMode = 'static';
    const bg = new PIXI.Graphics();
    goldBtn(bg, -148, -22, 296, 44);
    const t = label(16, GOLD, true);
    t.anchor.set(0.5);
    t.text = title;
    chip.addChild(bg, t);
    chip.position.set(x, y);
    bindPointerTap(chip, onTap);
    return chip;
  }

  private _renderSideOffers(): void {
    if (!isRosterPicking(this._state)) return;
    const y = this._lay.height - 36 - 8;
    if (this._state.openingGift) {
      const note = label(16, GOLD, true);
      note.anchor.set(0.5);
      note.position.set(375, y - 48);
      note.text = `开局多带：${this._state.openingGift.name}`;
      this._pick.addChild(note);
    } else if (adCanShow('dailyGift') && adIsFirstRunToday()) {
      this._pick.addChild(this._offerChip('看一段，开局多带一件', 375, y - 48, () => {
        void this._claimDailyGift();
      }));
    }
    if (this._state.pinnedMods[0]) {
      const note = label(16, 0xfff4c4, true);
      note.anchor.set(0.5);
      note.position.set(375, y);
      note.text = `废品站：${this._state.pinnedMods[0].name}，下一手必出`;
      this._pick.addChild(note);
    } else if (adCanShow('junkyard')) {
      this._pick.addChild(this._offerChip('翻废品站，看一件池外破烂', 375, y, () => {
        void this._claimJunkyard();
      }));
    }
  }

  private async _claimDailyGift(): Promise<void> {
    if (this._offerBusy || !adCanShow('dailyGift') || !adIsFirstRunToday()) return;
    this._offerBusy = true;
    const ok = await this._watchAd('dailyGift');
    if (ok) {
      adRecord('dailyGift');
      const mod = claimOpeningGift(this._state);
      if (mod) this._say(`开局多带${mod.name}，点满三人再装`);
      this._renderPickCards();
    }
    this._offerBusy = false;
  }

  private async _claimJunkyard(): Promise<void> {
    if (this._offerBusy || !adCanShow('junkyard')) return;
    this._offerBusy = true;
    const ok = await this._watchAd('junkyard');
    if (ok) {
      adRecord('junkyard');
      const mod = claimJunkyard(this._state);
      if (mod) this._say(`翻到${mod.name}：${mod.becomes}。下一手必出`);
      this._renderPickCards();
    }
    this._offerBusy = false;
  }
}

function loseNextMove(state: RunState): string {
  if (state.stats.installs === 0) return '下次先捡破烂装身上，空着手打不过';
  if (state.stats.queueMoves === 0) return '下次把改猛的挪到前排，站位也是构筑';
  return '下次换个人装试试，别只靠重开碰运气';
}
