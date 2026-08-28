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
import { BgmPlayer } from '@/core/BgmPlayer';
import { GMManager } from '@/core/GMManager';
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
  STAGE_MS,
  JAM_MS,
  DOWN_RECOVER_MS,
  heroSpriteH,
  slotHitBox,
  slotScreenX,
  slotScreenY,
  slotTagPos,
} from '@/balance/combat';
import { comboOf } from '@/balance/combos';
import { installForecast } from '@/balance/forecast';
import { REROLL_COST, STRIP_COST } from '@/balance/rewards';
import { waveHeadline } from '@/balance/enemies';
import { LAST_STAGE_ID, getStage, stageBeatMs, stageBeats, stageLocalWave } from '@/balance/stages';
import { resolveAttackFx, resolveEnemyFx, resolveFxSkin } from '@/balance/fx';
import { DEFAULT_SQUAD } from '@/balance/heroes';
import { abilityTag, getMod } from '@/balance/mods';
import { type PickOption } from '@/balance/picker';
import { DOCK_GAP, DOCK_H, ModDock } from '@/ui/ModDock';
import { ReviveOverlay } from '@/ui/ReviveOverlay';
import { SettleOverlay } from '@/ui/SettleOverlay';
import { CombatFx } from '@/fx/CombatFx';
import { motionFor, UnitActor } from '@/fx/UnitActor';
import { bgTex, fillCover, modTex, preloadBattleArt, watchArt } from '@/core/TextureLoader';
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
import {
  goalLine,
  nextYardGoal,
  pickFrom,
  pickNeed,
  resolveRunGrowth,
  startScrapBonus,
  yardDeposit,
} from '@/balance/yard';
import { Platform } from '@/core/PlatformService';
import {
  adCanShow,
  adIsFirstRunToday,
  adMarkRunStart,
  adRecord,
  adRemaining,
  type AdPlacement,
} from '@/core/AdDay';
import {
  GOLD,
  expBar,
  goldBtn,
  hpBar,
  label,
  plate,
  queuePad,
  rangeArea,
  shieldMark,
  villagerColor,
} from '@/ui/paint';
import { buildPickCard } from '@/ui/PickCard';
import {
  applyPick,
  canInstallOn,
  claimJunkyard,
  claimOpeningGift,
  createRun,
  gmSkipWave,
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
  type PetUnit,
  type RunState,
} from '@/game/BattleEngine';

const PICK_CARD_W = 218;
const PICK_CARD_H = 400;
/** 开局 6 人一屏，两排三张，比波间三选一更扁 */
const ROSTER_CARD_W = 216;
const ROSTER_CARD_H = 278;

function heroH(h: HeroUnit): number {
  return heroSpriteH(h.def.hp);
}

function enemyH(e: EnemyUnit): number {
  const base = e.proto.isBoss ? 100
    : e.proto.id === 'canister' ? 82
    : e.proto.id === 'grey' ? 58
    : 70;
  // 碎块画小一号，不然砸开方块兵之后满屏一样大的方块，玩家分不出哪个是刚裂出来的
  return e.isShard ? Math.round(base * 0.62) : base;
}

/** 外星人横向散开，别叠成一根柱子。同一只怪每帧必须落在同一条道上 */
function alienLaneX(id: number): number {
  const spread = (id * 137) % 5;
  return 300 + spread * 38;
}

/** 小东西散在自家人左右，别跟外星人那几条道对齐，一眼分得清哪边是自己的 */
function petLaneX(id: number): number {
  return SQUAD_X + (((id * 71) % 3) - 1) * 52;
}

/**
 * 小东西一律比村民矮一截（村民 88 起）。
 * 这不是美术偏好，是「看戏要认得出脸」那条硬约束：
 * 画得一样大就会被当成第四个村民，上场 3 人这件事立刻糊掉。
 */
function petH(p: PetUnit): number {
  return p.proto.id === 'chicken' ? 34 : p.proto.id === 'dog' ? 44 : 56;
}

/** 小东西统一色系：一眼看出是自家的，又跟村民各自的颜色区分开 */
const PET_TINT: Readonly<Record<string, number>> = {
  dog: 0xb98a4e,
  chicken: 0xe8dcc0,
  militia: 0xa9744f,
};

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
    () => this._restartStage(this._state.stageId),
    () => this._doubleSettle(),
    () => this._settleJunkyard(),
    () => SceneManager.switchTo('village'),
    () => this._restartStage(this._state.stageId + 1),
  );
  private readonly _revive = new ReviveOverlay(
    () => { void this._acceptRevive(); },
    () => this._giveUpRevive(),
  );
  private readonly _fx = new CombatFx();
  private readonly _heroHits: PIXI.Container[] = [];
  private readonly _guide = label(26, 0xffd66b, true);

  private readonly _waveText = label(28, 0xffffff, true);
  private readonly _scrapText = label(20, GOLD, true);
  private readonly _hintText = label(16, GOLD, true);
  private readonly _expBar = new PIXI.Graphics();
  private readonly _expText = label(16, 0xffd66b, true);
  private readonly _installPlate = new PIXI.Graphics();
  private readonly _installTitle = label(28, 0xfff4c4, true);
  private readonly _installDesc = label(20, 0xd7dcee);
  private readonly _inspectPlate = new PIXI.Graphics();
  private readonly _inspectTitle = label(22, 0xffffff, true);
  private readonly _inspectDesc = label(18, 0xd7dcee);

  private _pickIdle = 0;
  private _guideLife = 0;
  /** 已经播报过第几个刻度。刻度不再切 phase，靠这个去重 */
  private _stageTold = 0;
  private _settled = false;
  private _baseScrap = 0;
  private _selected: string | null = null;
  private _pickShownKey = '';
  private _runStarted = false;
  private _openClock = 0;
  private _openingHintSaid = false;
  private _cardPulsed = false;
  private _offerBusy = false;
  private _pickArtTimer: ReturnType<typeof setTimeout> | 0 = 0;
  private _gmSkip: PIXI.Container | null = null;

  private readonly _hitFlash = new Map<number, number>();
  private readonly _hurtFlash = new Map<string, number>();
  private readonly _lastEnemyXY = new Map<number, { x: number; y: number }>();
  /** 上一逻辑帧的距离，用来在 100ms 步长之间把走路插成滑步 */
  private readonly _prevDist = new Map<number, number>();
  /** 小东西的那一份。它们的 id 和外星人是两套编号，表也得分开 */
  private readonly _prevPetDist = new Map<number, number>();
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
    this.container.addChild(this._pick);
    this._rangeHint.anchor.set(0.5);
    this._rangeHint.visible = false;
    this.container.addChild(this._rangeHint);
    this._computeLayout();
    this._buildHeroHits();
    // 底栏压在选牌层和场上热区上面：装件时没有挡屏卡，必须直接点得中下面的人
    this.container.addChild(this._dock);
    this.container.addChild(this._revive);
    this.container.addChild(this._settle);
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
      undefined,
      heroes,
      consumeNextGift(),
      mem.ladderLv,
      (data && typeof data === 'object' && 'stageId' in data
        ? (data as { stageId: number }).stageId
        : mem.stageId),
      resolveRunGrowth(mem.growth),
      mem.modStars,
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
    this._stageTold = 0;
    this._settled = false;
    this._baseScrap = 0;
    this._pickShownKey = '';
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
    this._mountGmSkip();
    GMManager.registerInstantClear(() => this._gmSkipWave());
    this._syncBattleBgm();
  }

  onExit(): void {
    GMManager.unregisterInstantClear();
    this._gmSkip?.destroy({ children: true });
    this._gmSkip = null;
    this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._pick.eventMode = 'none';
    BgmPlayer.stop();
  }

  private _showTeam(): boolean {
    return this._state.team.length > 0 && this._state.phase !== 'picking';
  }

  /** 打着的时候才能调队列。装配阶段点人是装破烂，不是换位 */
  private _canReorder(): boolean {
    return this._state.team.length > 0 && this._state.phase === 'fighting';
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
      if (!installMod(s, occupant.def.id)) return;
      this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));
      const dest = this._heroXY(occupant.def.id);
      this._fx.flyMod(375, this._dock.y + 40, dest?.x ?? this._slotX(slot), dest?.y ?? this._slotY(slot), modTex(mod.id));
      this._consumeEvents();
      this._clearSelect();
      this._accMs = 0;
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
    this._say(`拆了${hero.def.name}的${piece.name}`);
    this._dock.refresh(this._state, this._selected);
    this._updateHud();
  }

  private _reroll(): void {
    if (this._state.freeRerollsLeft <= 0 && this._state.scrap < REROLL_COST) {
      this._say(`重抽要 ${REROLL_COST} 废品`);
      return;
    }
    if (!rerollMods(this._state)) return;
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
    // 底栏先钉死。小队抬高一点，别贴着人物面板。多出来的高度全给外星人走路。
    const fieldBottom = height - Game.safeBottom - DOCK_H - DOCK_GAP;
    const frontY = fieldBottom - 64 - BACK_DY;
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
      this._dock.pulse();
      return;
    }

    if (this._fx.hitStop > 0) {
      this._fx.hitStop = Math.max(0, this._fx.hitStop - dt);
      this._fx.update(dt);
      this._drawField();
      this._tickActors(dt);
      this._updateHud();
      this._dock.pulse();
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
      // 选完破烂就收掉挡屏卡：点下面的人焊上去。中间再铺一层人卡，
      // 等于把「装给谁」从场上和底栏挪到一张陌生的弹层上，点不到也看不清战场。
      if (this._pick.children.length > 0) {
        this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));
      }
      this._pick.eventMode = 'none';
    } else if (this._pick.children.length > 0) {
      this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));
    }
    if (s.phase === 'fighting') {
      // 按固定步长推进，与批量回归完全一致：掉帧只会让画面变慢，不会改变战斗结果
      this._accMs += dt * 1000;
      let guard = 0;
      while (this._accMs >= TICK_MS && guard++ < 8) {
        this._accMs -= TICK_MS;
        this._rememberUnits();
        const waveBefore = s.wave;
        tick(s);
        this._consumeEvents();
        // 经 tick 后 phase 可能已变，这里必须重新读状态
        const phase = this._state.phase;
        // 刻度推进不再切 phase（战场不断），所以要盯 wave 本身变没变
        if (this._state.wave !== waveBefore) {
          track('wave_clear', {
            wave: waveBefore,
            duration_ms: STAGE_MS,
            alive_count: s.team.filter((h) => h.alive).length,
          });
        }
        if (this._stageTold !== this._state.wave) {
          this._stageTold = this._state.wave;
          this._syncBattleBgm();
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
    this._dock.pulse();
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
    // 小东西的 id 和外星人各自从 1 开始，绝不能共用一张表，否则两边会互相顶掉
    this._prevPetDist.clear();
    for (const p of this._state.pets) this._prevPetDist.set(p.id, p.dist);
  }

  private _consumeEvents(): void {
    for (const ev of this._state.events) {
      if (ev.kind === 'hit') {
        // 狗咬的那一下也记在主人名下（归因要落在「装给谁」），
        // 但不能让主人跟着凭空挥一刀 —— 伤害数字照飘，动作归狗
        const attacker = ev.byPet
          ? undefined
          : this._state.team.find((h) => h.def.id === ev.heroId);
        if (attacker && !ev.aoe) {
          const actor = this._heroActors.get(ev.heroId);
          const enemy = this._enemyXY(ev.enemyId);
          if (actor && enemy) {
            actor.playAttack(enemy.x, enemy.y, motionFor(resolveAttackFx(attacker.def, attacker.mods)));
          }
        }
      }
      if (ev.kind === 'enemyHit') {
        this._enemyActors.get(ev.enemyId)?.playAttack(
          this._heroXY(ev.heroId)?.x ?? 375,
          this._heroXY(ev.heroId)?.y ?? this._lay.frontY,
          'lunge',
        );
      }
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
        || ev.kind === 'enemyHit' || ev.kind === 'heroRevive' || ev.kind === 'install'
        || ev.kind === 'petSummon';
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
        skin: attacker ? resolveFxSkin(attacker.def, attacker.mods) : undefined,
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
        byPet: ev.kind === 'hit' ? !!ev.byPet : undefined,
        onLand: ev.kind === 'hit'
          ? () => {
            this._hitFlash.set(ev.enemyId, 120);
            this._enemyActors.get(ev.enemyId)?.flash(120);
          }
          : ev.kind === 'enemyHit'
            ? () => {
              this._hurtFlash.set(ev.heroId, 140);
              this._heroActors.get(ev.heroId)?.flash(140);
            }
            : undefined,
      });
    }
    this._state.events.length = 0;
  }

  private _gmSkipWave(): string {
    if (this._settled || this._revive.visible) return '战斗已结束';
    const from = this._state.wave;
    const msg = gmSkipWave(this._state);
    this._consumeEvents();
    if (this._pick.children.length > 0 && this._state.phase !== 'picking') {
      this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));
    }
    this._updateHud();
    if (this._state.phase === 'won' || this._state.phase === 'lost') {
      this._endRun();
      return msg;
    }
    if (this._state.wave !== from) {
      this._stageTold = this._state.wave;
    }
    this._syncBattleBgm();
    return msg;
  }

  /** 第 5 章起整关加压；前四章过半再切。 */
  private _syncBattleBgm(): void {
    const camp = getStage(this._state.stageId);
    if (camp.chapter >= 5) {
      BgmPlayer.play('battle_hot');
      return;
    }
    const local = stageLocalWave(camp, this._state.wave);
    const half = Math.floor(stageBeats(camp) / 2);
    BgmPlayer.play(local > half ? 'battle_hot' : 'battle');
  }

  private _mountGmSkip(): void {
    this._gmSkip?.destroy({ children: true });
    this._gmSkip = null;
    if (!GMManager.isEnabled) return;
    const w = 148;
    const h = 48;
    const box = new PIXI.Container();
    box.eventMode = 'static';
    box.hitArea = new PIXI.Rectangle(0, 0, w, h);
    const g = new PIXI.Graphics();
    g.beginFill(0xc81e3c, 0.9).drawRoundedRect(0, 0, w, h, 10).endFill();
    g.lineStyle(1.5, 0xff6688, 1).drawRoundedRect(0, 0, w, h, 10);
    const t = label(18, 0xffffff, true);
    t.anchor.set(0.5);
    t.position.set(w / 2, h / 2);
    t.text = '跳过本波';
    box.addChild(g, t);
    const pos = this._gmSkipPos(w);
    box.position.set(pos.x, pos.y);
    bindPointerTap(box, () => {
      Platform.showToast(this._gmSkipWave(), 'none');
    });
    this.container.addChildAt(box, this.container.getChildIndex(this._settle));
    this._gmSkip = box;
  }

  private _syncGmSkip(): void {
    if (this._gmSkip) this._gmSkip.visible = !this._settled && !this._revive.visible;
  }

  /** 进度条和经验条下面、贴右边，别盖住顶上那条推进。 */
  private _gmSkipPos(w: number): { x: number; y: number } {
    const right = Math.min(734, Math.max(Game.contentRightX(8), 700));
    return {
      x: right - w,
      y: this._lay.top + 80,
    };
  }

  private _endRun(): void {
    if (this._settled || this._revive.visible) return;
    const s = this._state;
    if (s.phase === 'lost' && s.loseReason === 'wipe' && s.freeRevivesLeft > 0) {
      s.freeRevivesLeft -= 1;
      if (reviveAfterWipe(s)) {
        this._consumeEvents();
        this._say('村里给的一口气，这套还在');
        return;
      }
    }
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
    // 回执只飘一个短名。长句叠在人头和底栏上，谁也看不清
    return combo?.name ?? piece.name;
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
    const combos = this._state.team
      .map((h) => comboOf(h.mods.map((m) => m.id))?.id)
      .filter((id): id is string => !!id);
    saveRun(
      this._state.wave,
      this._state.team.map((h) => h.def.id),
      {
        cleared: this._state.phase === 'won',
        ladderLv: this._state.ladderLv,
        stageId: this._state.stageId,
        combos,
      },
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
      yardGoal: goalLine(nextYardGoal(mem.yardScrap, mem.growth, mem.modStars)),
      nextStageLabel: this._nextStageLabel(),
    });
  }

  private _nextStageLabel(): string | undefined {
    if (this._state.phase !== 'won') return undefined;
    const nextId = this._state.stageId + 1;
    if (nextId > LAST_STAGE_ID) return undefined;
    return getStage(nextId).label;
  }

  private _restartStage(stageId: number): void {
    if (stageId > LAST_STAGE_ID) {
      SceneManager.switchTo('village');
      return;
    }
    this.onEnter({
      heroIds: this._state.team.map((h) => h.def.id),
      stageId,
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
    for (const t of [this._waveText, this._scrapText, this._hintText, this._expText]) {
      t.style.stroke = 0x2a160c;
      t.style.strokeThickness = 4;
    }

    this._hud.addChild(
      this._hudPlate,
      this._waveText,
      this._scrapText,
      this._hintText,
      this._expBar,
      this._expText,
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

  /** 三个人各一块点击区。跟村里同一套热区，互不重叠，前排才点得到。 */
  private _buildHeroHits(): void {
    for (const slot of [1, 2, 0]) {
      const hit = new PIXI.Container();
      hit.eventMode = 'static';
      const box = slotHitBox(slot);
      hit.hitArea = new PIXI.Rectangle(box.x, box.y, box.w, box.h);
      bindPointerTap(hit, () => this._tapSlot(slot));
      hit.name = `queue:${slot}`;
      this._heroHits[slot] = hit;
      this.container.addChild(hit);
    }
  }

  private _applyHudLayout(): void {
    const { top, fieldBottom } = this._lay;
    this._waveText.position.set(28, top + 6);
    this._hintText.position.set(160, top + 14);
    this._scrapText.anchor.set(1, 0);
    this._scrapText.position.set(722, top + 10);
    this._expText.anchor.set(1, 0.5);
    this._expText.position.set(722, top + 54);
    this._dock.place(fieldBottom + DOCK_GAP);
    if (this._gmSkip) {
      const pos = this._gmSkipPos(148);
      this._gmSkip.position.set(pos.x, pos.y);
    }
    this._guide.position.set(375, this._lay.frontY - 118);
    this._installTitle.position.set(375, top + 86);
    this._installDesc.position.set(375, top + 120);
    this._inspectTitle.position.set(375, top + 86);
    this._inspectDesc.position.set(375, top + 114);
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
    const camp = getStage(s.stageId);
    this._waveText.text = `${stageLocalWave(camp, s.wave)} / ${stageBeats(camp)}`;
    this._scrapText.text = `${s.scrap}`;
    this._hintText.position.set(28 + this._waveText.width + 16, this._lay.top + 14);

    if (s.phase === 'won' || s.phase === 'lost') {
      this._hintText.text = '';
      if (this._selected) this._clearSelect();
    } else if (s.phase === 'fighting' && s.jamMs > JAM_MS * 0.35) {
      this._hintText.text = '拥堵';
      this._hintText.tint = 0xff6b4a;
    } else {
      this._hintText.text = s.wave >= 1 ? waveHeadline(s.wave) : '';
      this._hintText.tint = GOLD;
    }

    for (const hit of this._heroHits) {
      hit.visible = this._showTeam();
    }

    this._hudPlate.clear();
    this._expBar.clear();
    this._expText.visible = !opening;
    if (!opening) {
      const { top } = this._lay;
      this._drawPush(top - 8);
      this._drawExp(top + 48);
      if (this._hintText.text) {
        const x = this._hintText.x - 8;
        const y = this._hintText.y - 3;
        const w = this._hintText.width + 16;
        const g = this._hudPlate;
        const warn = this._hintText.text === '拥堵';
        g.beginFill(0x000000, 0.4).drawRoundedRect(x, y, w, 26, 8).endFill();
        g.lineStyle(1.2, warn ? 0xff6b4a : GOLD, 0.55).drawRoundedRect(x, y, w, 26, 8).lineStyle(0);
      }
    }
    this._showInstall();
    this._showInspect();
    if (this._selected) this._guide.visible = false;
    this._dock.refresh(s, this._selected);
    this._syncGmSkip();
  }

  /**
   * 整局推进条。
   *
   * 战场不再一波一波断开，所以得有个东西告诉玩家「这条路走到哪了」。
   * 它走满就是打完 —— 中间不会归零，这正是和从前波次号的区别。
   */
  private _drawPush(y: number): void {
    const beat = stageBeatMs(getStage(this._state.stageId), STAGE_MS);
    const span = Math.max(1, this._state.streamEndMs || this._state.lastWave * beat);
    const p = Math.max(0, Math.min(1, this._state.totalMs / span));
    const g = this._hudPlate;
    g.beginFill(0x000000, 0.45).drawRect(0, y, 750, 4).endFill();
    if (p > 0) {
      g.beginFill(GOLD, 0.9).drawRect(0, y, Math.max(2, 750 * p), 4).endFill();
    }
  }

  /**
   * 「还差多久捡下一件破烂」。
   *
   * 这条是杀敌唯一的即时回报：怪掉的经验在这里攒，攒满就当场发牌。
   * 波次号只说明打到哪了，这条才说明再撑一会儿能得到什么。
   */
  private _drawExp(y: number): void {
    const s = this._state;
    const need = pickNeed(s.level, s.growth.expPct);
    if (need === undefined) {
      this._expText.text = '满级';
      expBar(this._expBar, 28, y, 620, 1, true);
      return;
    }
    const from = pickFrom(s.level, s.growth.expPct);
    const span = Math.max(1, need - from);
    this._expText.text = `${Math.max(0, Math.round(s.exp - from))}/${span}`;
    expBar(this._expBar, 28, y, 620, (s.exp - from) / span, false);
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
    plate(this._installPlate, 40, top + 76, 670, 80, 16, 0.9);
    this._installTitle.text = s.pendingMod.name;
    this._installDesc.text = '点下面的人';
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
    plate(this._inspectPlate, 40, top + 76, 670, 84, 16, 0.88);
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
    g.beginFill(0x2a160c, 0.28).drawRect(0, 0, 750, this._lay.top + 64).endFill();
    g.beginFill(0x2a160c, 0.18).drawRect(0, fieldBottom - 8, 750, this._lay.height - fieldBottom + 8).endFill();

    // 有人倒下时全屏红闪一下。警报挂在倒人身上，不挂底线 —— 底线已经没有了
    if (this._fx.downPulse > 0) {
      g.beginFill(0x8c2b3a, this._fx.downPulse * 0.5).drawRect(0, 0, 750, this._lay.height).endFill();
    }

    this._drawQueuePads(g);

    if (this._fx.landPulse > 0) {
      g.beginFill(GOLD, this._fx.landPulse * 1.1).drawEllipse(SQUAD_X, this._slotY(0) + 8, 90, 22).endFill();
    }

    this._drawSelectedRange(g);

    // 先画后排再画前排，前面的人压在后面的人身上
    for (const h of [...teamInOrder(this._state)].reverse()) this._drawHero(g, h);
    for (const p of this._state.pets) this._drawPet(g, p);
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
        const picked = this._selected === h.def.id;
        a.holdPulse = picked;
        a.view.alpha = this._selected && !picked && h.alive ? 0.58 : 1;
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
      const mark = !occ || canTake || moving;
      if (mark) {
        queuePad(g, x, y, {
          empty: !occ,
          hot: canTake || moving,
          front: false,
        });
      }
      tag.visible = show && mark;
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
      const picked = this._selected === h.def.id;
      name.tint = !h.alive ? 0x6b7394 : picked ? GOLD : 0xffffff;
      name.scale.set(picked ? 1.12 : 1);
      name.position.set(x, top - 16);
      // 装配时只标值 / 能用 / 浪费。长句叠在人头上谁也看不清
      if (this._state.phase === 'installing' && this._state.pendingMod && canInstallOn(h)) {
        const forecast = installForecast(h, this._state.pendingMod);
        tag.text = forecast.tag;
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
      // 躺着的人会自己爬起来，得让人看见还差多久。不画这条，玩家会以为
      // 这人废了，跟着做出「反正没救了」的错判 —— 而实际上等他起来就行
      const back = 1 - Math.max(0, Math.min(1, h.downMs / DOWN_RECOVER_MS));
      hpBar(g, x, feet + 6, 52, back, GOLD);
      return;
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

    // 壳。不画出来的话，玩家只会觉得这怪莫名其妙打不动
    if (e.shell > 0) {
      g.lineStyle(2.6, 0xcbd5e1, 0.9);
      g.drawRoundedRect(x - size * 0.44, feet - size * 0.92, size * 0.88, size * 0.86, 6);
      g.lineStyle(0);
    }

    // 扑上来的那一段给几道速度线，让「突然加速」看得见
    const rush = e.proto.rush;
    if (rush && e.dist <= rush.withinDist) {
      g.lineStyle(2, 0xfca5a5, 0.55);
      for (let i = 0; i < 3; i += 1) {
        const lx = x - size * 0.3 + i * size * 0.3;
        g.moveTo(lx, feet - size * 1.15);
        g.lineTo(lx, feet - size * 0.95);
      }
      g.lineStyle(0);
    }

    const barW = Math.max(48, size * 0.7);
    hpBar(g, x, feet + 14, barW, e.hp / Math.max(1, e.maxHp), 0xff6b6b);
    if (e.shell > 0 && e.proto.shell) {
      hpBar(g, x, feet + 6, barW, e.shell / Math.max(1, e.proto.shell.hp), 0xcbd5e1);
    }
  }

  /**
   * 小东西。用 Graphics 直接画，不走 UnitActor：
   * 它们没有名字、不能点、不该有村民那套挑人高亮，共用一套演出反而会
   * 让玩家以为能点它们。三种剪影必须一眼分得开 —— 狗横着、鸡圆的、乡亲站着。
   */
  private _drawPet(g: PIXI.Graphics, p: PetUnit): void {
    const size = petH(p);
    const x = petLaneX(p.id);
    const feet = this._posToY(this._visualPetDist(p));
    const tint = PET_TINT[p.proto.id] ?? 0xb98a4e;

    g.beginFill(0x2a160c, 0.18);
    g.drawEllipse(x, feet + 2, size * 0.34, size * 0.12);
    g.endFill();

    g.beginFill(tint);
    if (p.proto.id === 'dog') {
      // 横着的身子加一条翘尾巴：跑在最前面那个一定是狗
      g.drawRoundedRect(x - size * 0.42, feet - size * 0.62, size * 0.84, size * 0.44, 7);
      g.drawCircle(x + size * 0.42, feet - size * 0.72, size * 0.2);
      g.endFill();
      g.beginFill(tint);
      g.drawPolygon([
        x + size * 0.34, feet - size * 0.86,
        x + size * 0.5, feet - size * 1.02,
        x + size * 0.5, feet - size * 0.8,
      ]);
      g.endFill();
      g.lineStyle(3, tint, 1);
      g.moveTo(x - size * 0.42, feet - size * 0.56);
      g.lineTo(x - size * 0.66, feet - size * 0.82);
      g.lineStyle(0);
    } else if (p.proto.id === 'chicken') {
      g.drawEllipse(x, feet - size * 0.4, size * 0.36, size * 0.32);
      g.drawCircle(x + size * 0.24, feet - size * 0.72, size * 0.2);
      g.endFill();
      g.beginFill(0xef4444);
      g.drawCircle(x + size * 0.28, feet - size * 0.9, size * 0.08);
      g.endFill();
      g.beginFill(0xf59e0b);
      g.drawPolygon([
        x + size * 0.42, feet - size * 0.74,
        x + size * 0.6, feet - size * 0.68,
        x + size * 0.42, feet - size * 0.62,
      ]);
      g.endFill();
    } else {
      g.drawRoundedRect(x - size * 0.22, feet - size * 0.66, size * 0.44, size * 0.66, 6);
      g.drawCircle(x, feet - size * 0.8, size * 0.2);
      g.endFill();
      // 手里那根棍子，说明他是来帮着打的
      g.lineStyle(3.4, 0x8b5a2b, 1);
      g.moveTo(x + size * 0.26, feet - size * 0.16);
      g.lineTo(x + size * 0.34, feet - size * 0.92);
      g.lineStyle(0);
    }

    hpBar(g, x, feet + 12, Math.max(30, size * 0.8), p.hp / Math.max(1, p.maxHp), 0xfbbf24);
  }

  /** 跟外星人一样在两帧之间插值，不然小东西会一格一格地跳 */
  private _visualPetDist(p: PetUnit): number {
    const prev = this._prevPetDist.get(p.id);
    if (prev === undefined) return p.dist;
    const u = Math.max(0, Math.min(1, this._accMs / TICK_MS));
    return prev + (p.dist - prev) * u;
  }

  // ── 三选一 ────────────────────────────────────────────

  private _refreshPickArt(): void {
    if (this._pickArtTimer) clearTimeout(this._pickArtTimer);
    this._pickArtTimer = setTimeout(() => {
      this._pickArtTimer = 0;
      if (this._state.phase === 'picking') this._renderPickCards();
    }, 220);
  }

  private _renderPickCards(): void {
    this._pick.eventMode = 'static';
    this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));

    const s = this._state;
    if (s.phase !== 'picking' || s.pendingOptions.length === 0) return;

    const roster = isRosterPicking(s);
    if (!roster) {
      // key 带上 level：同一波现在可能连升两级发两次牌
      const key = `${s.level}:${s.wave}:${s.pendingOptions.map((o) => (o.kind === 'mod' ? o.modId : o.heroId)).join(',')}`;
      if (this._pickShownKey !== key) {
        this._pickShownKey = key;
        track('pick_show', {
          wave: s.wave,
          level: s.level,
          // 场上还有怪就说明这张牌是打到一半发的，日后要看这类打断能不能接受
          mid_fight: s.enemies.length > 0,
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
    // 牌是攒够经验当场发的，可能发在一波打到一半时，
    // 所以标题说的是「为什么现在发牌」，而不是「下一波是什么」
    title.text = roster ? '叫三个人来' : '攒够了，挑一件';
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
      : `废品 ${s.scrap}`;
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
        const card = buildPickCard(opt, cardW, cardH, s.team, picked >= 0 ? picked : undefined, s.modStars);
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
      const card = buildPickCard(opt, cardW, cardH, s.team, undefined, s.modStars);
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
    if (s.freeRerollsLeft <= 0 && s.scrap < REROLL_COST) rbg.alpha = 0.45;
    const rl = label(20, GOLD, true);
    rl.anchor.set(0.5);
    rl.text = s.freeRerollsLeft > 0
      ? `白翻一次 · 还剩 ${s.freeRerollsLeft}`
      : `花 ${REROLL_COST} 废品换一批`;
    reroll.addChild(rbg, rl);
    reroll.position.set(375, titleY + 84 + cardH + 40);
    this._pick.addChild(reroll);
    bindPointerTap(reroll, () => this._reroll());
  }

  private _choose(opt: PickOption): void {
    const roster = isRosterPicking(this._state);
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
      this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));
      this._guide.visible = false;
      this._guideLife = 0;
      if (roster) this._lockOpening();
      return;
    }
    this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));
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
      this._say(`白送的${this._state.pendingMod.name}，点下面一个人`);
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
