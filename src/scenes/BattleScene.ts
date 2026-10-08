/**
 * 战斗场景：3 路 × 4 格的分路自动塔防。
 *
 * 渲染层不含任何战斗规则，只读 BattleEngine 的状态。规则改动一律回引擎。
 * 点人看射程只填 `@/game/reach` 给的多边形，这里不算距离。
 * 贴图缺失时退回色块，不挡玩。
 *
 * 画面的三条硬规矩（docs/00-体验目标.md §4.4 / 反目标）：
 *
 * 1. **土路就是棋盘，人是棋子。** 视觉 3×10，只有下 4 行能站；
 *    格子不画成垫子。平时只留脚底影，拎起人才把空位亮出来。逻辑仍是 3×4。
 * 2. **底线必须画出来，而且要画得像一条线。** 漏怪是唯一的判负条件，
 *    玩家得随时看得见「再漏几个就完了」。
 * 3. **不给「推荐阵容一键上」。** §4.4 明确列为不做 —— 它会把主体验的决策整个替掉。
 *    开局铺的是**玩家上一关自己的排法**（存档里的 layout），不是算出来的最优解；
 *    只有全新存档才用一次 autoPlace 兜底，免得新手第一眼看到空棋盘。
 */

import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { BgmPlayer } from '@/core/BgmPlayer';
import { GMManager } from '@/core/GMManager';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { bindPointerTap } from '@/minigame';
import { getTouchCanvas } from '@/utils/touchCanvas';
import {
  CELL_COUNT, FIELD_W, FIELD_X, GOAL_POS, LANE_COUNT, LANE_W, LEAK_ALLOW, SLOW_MUL, TICK_MS,
  battleFieldLay, cellPos, fieldEnemyH, fieldFightUnitH, hitDeployCell,
  laneScreenX, posScreenY,
} from '@/balance/combat';
import { getStage, stageEnemyCount } from '@/balance/stages';
import {
  OPENING_CALL_ID, chapter1CraftStep, needOpeningCall, villageGateOpen, winFooter, type CraftStep,
} from '@/balance/opening';
import { LOSE_AD_PELLETS, LOSE_AD_SCRAP, SETTLE_AD_PELLETS } from '@/balance/stall';
import { resolveAttackFx, resolveEnemyFx, resolveFxSkin } from '@/balance/fx';
import { LANE_NAME, evoKindOf, getVillager, jobOf, statsOf } from '@/balance/villagers';
import {
  BENCH_FOOTER_H, BENCH_H, BenchDock, LANE_TINT, benchFooterTop, type BenchItem,
} from '@/ui/BenchDock';
import { LeaveAskOverlay } from '@/ui/LeaveAskOverlay';
import { ReviveOverlay } from '@/ui/ReviveOverlay';
import { SettleOverlay } from '@/ui/SettleOverlay';
import { CallReveal } from '@/ui/CallReveal';
import { CombatFx, type SkillMark } from '@/fx/CombatFx';
import { VisualVitals } from '@/fx/VisualVitals';
import { motionForSkin, UnitActor } from '@/fx/UnitActor';
import {
  BATTLE_FX_IMAGES, battleFaceImages, battlePreloadImages, heroStillArt, type HeroArtNeed,
} from '@/config/assetPreload';
import { ensureAssets } from '@/core/ensureAssets';
import { bgTex, fillCover, heroTex, uiTex, watchArt, type UiName } from '@/core/TextureLoader';
import { playSfx } from '@/core/SfxPlayer';
import { track } from '@/core/Analytics';
import {
  grantLoot, capOf, loadMemory, openingCall, progressOf, saveLayout, settleStage,
  type RunMemory, type Slot,
} from '@/core/RunMemory';
import { craftOf, evoOf, starsOf, villageMul, yieldMul } from '@/balance/village';
import { Platform } from '@/core/PlatformService';
import { rewardedAdUnitId } from '@/config/rewardedAds';
import {
  adCanShow, adMarkRunStart, adRecord, adRemaining,
} from '@/core/AdDay';
import { formationGrid, hitFormationCell } from '@/ui/fieldName';
import { battleHudLay, type BattleHudLay } from '@/ui/lintel';
import { numGlyphs, paintFrac, paintGlyphs } from '@/ui/glyphs';
import {
  GOLD, fillSprite, fitSprite, goldBtn, hpBar, ironSlab, label, painted, reachPoly,
} from '@/ui/paint';
import {
  autoPlace, battleClockMs, castSkill, createBattle, fieldHeroBinds, foeHaltPos, foesAlive, gmWin,
  bumpFor, placeAt, placedOf, removeAt, skillAllies, skillReady, skillTargets,
  countedLeaks, reviveAfterLeak, reviveCanContinue, startFight, tick,
  type BattleState, type Candidate, type Fighter, type Foe, type Placement,
} from '@/game/BattleEngine';
import { marchLerp, marchStep } from '@/game/march';
import { canReach, reachOriginY, reachScreenPoly } from '@/game/reach';
import { ENERGY_MAX, skillAt, skillOf, type SkillDef } from '@/balance/skills';
import { PersistService } from '@/core/PersistService';
import {
  SKILL_TRAY_H, SkillCutIn, SkillTray, TRAY_AUTO_X, TRAY_BTN_R, TRAY_SPEED_X,
  roundBtn, skillCard, trayRowY,
} from '@/ui/battleSkillUi';

const SPEED_KEY = 'battle_speed';
/** 开局三件事各教一次，教过就记下，重打不再教 */
const GUIDE_SKILL_KEY = 'guide_skill';
const GUIDE_SWAP_KEY = 'guide_swap';
/** 开打时补到的图最多隔多久重搭一次画面 */
const ART_FLUSH_FIGHT_S = 0.4;
/** 第一招等多久没点就替他放。战斗照常走，不放慢 */
const SKILL_GUIDE_WAIT_S = 6;
/** 1-1 第一招教谁。连射整条路都挨，一下能带走一串，最容易看懂 */
const GUIDE_SKILL_ID = 'laoyanqiang';
/** 开打多久、路上至少几只怪，才叫玩家点第一招 */
const SKILL_GUIDE_FROM_MS = 1500;
const SKILL_GUIDE_CROWD = 3;
/** 等到这会儿还凑不齐，打得着一只也叫 */
const SKILL_GUIDE_LATE_MS = 4000;
/** 开打后第几秒报一次还在不在。冷启动要看清人是在哪一秒走的 */
const PULSE_SECS = [5, 10, 15, 20, 30] as const;

let battleHide: (() => void) | null = null;

/** 切到后台时如果还在打，记一笔。点「撤」才会自己打 run_leave */
export function notifyBattleHide(): void {
  battleHide?.();
}
const AUTO_KEY = 'battle_auto';
/** 怪走过这条就算快漏了，那一路底线开始闪 */
const LEAK_WARN_POS = GOAL_POS - 0.9;

/**
 * 开打已经收进坞底，底线直接贴坞顶。
 * 热区仍按设计坐标矩形算，不靠 Pixi hitTest。
 */
const START_STRIP = 0;

/** 坞里先横滑再决定是不是拎人，小于这个不算手势 */
const PLACE_SLOP = 10;
/** 往上拖出这么多，或者拖出坞顶，才算拎起来 */
const PLACE_LIFT = 18;

type PlaceHand =
  | { mode: 'bench'; id: string; ox: number; oy: number; x: number; y: number }
  | { mode: 'scroll'; lastX: number }
  | {
    /** 场上按下还没挪：松手点看射程，挪过阈值才拎起来换位 */
    mode: 'press';
    id: string;
    origin: { lane: number; cell: number };
    ox: number;
    oy: number;
    x: number;
    y: number;
  }
  | {
    mode: 'drag';
    id: string;
    from: 'bench' | 'field';
    origin: { lane: number; cell: number } | null;
    x: number;
    y: number;
  }
  | { mode: 'btn'; which: 'start' | 'back' };

export class BattleScene implements Scene {
  readonly name = 'battle';
  readonly container = new PIXI.Container();

  private _state: BattleState = createBattle(getStage(1), [], 3);
  private _mem: RunMemory = loadMemory();
  private _accMs = 0;

  private readonly _field = new PIXI.Graphics();
  /** 战场层：人、怪、特效都裁在匾牌下沿以下，打进锈铁板里的弹和影子都不画 */
  private readonly _arena = new PIXI.Container();
  private readonly _arenaMask = new PIXI.Graphics();
  private readonly _unitLayer = new PIXI.Container();
  private readonly _villagerActors = new Map<string, UnitActor>();
  private readonly _foeActors = new Map<number, UnitActor>();
  private readonly _nameLayer = new PIXI.Container();
  private readonly _hudChrome = new PIXI.Container();
  private readonly _hudPlate = new PIXI.Graphics();
  private readonly _hudArt = new PIXI.Container();
  private readonly _hud = new PIXI.Container();
  private readonly _bench = new BenchDock();
  private readonly _ghost = new PIXI.Container();
  private _hand: PlaceHand | null = null;
  private _ptrId: number | null = null;

  private readonly _settle = new SettleOverlay(
    () => this._restart(this._state.stage.id),
    () => this._doubleSettle(),
    () => SceneManager.switchTo('village'),
    () => this._nextOnRoad(),
    () => this._runOpeningCall(() => this._nextOnRoad()),
  );
  private readonly _reveal = new CallReveal();
  private readonly _revive = new ReviveOverlay(
    () => { void this._acceptRevive(); },
    () => this._giveUpRevive(),
  );
  private readonly _leaveAsk = new LeaveAskOverlay(
    () => this._stayInBattle(),
    () => this._leaveBattle(),
  );
  private readonly _fx = new CombatFx();
  private readonly _vitals = new VisualVitals();

  private readonly _stageName = painted(36, GOLD, '#1a1008', 5);
  private readonly _hintText = painted(18, GOLD, '#1a1008', 3);
  private readonly _hudBits = new PIXI.Container();
  private readonly _timeBar = new PIXI.Graphics();
  private readonly _guide = label(26, 0xffd66b, true);
  private _startBtn: PIXI.Container | null = null;
  /** 布阵坞底「回路上」。开打后坞收起来，改走顶栏「撤」 */
  private _backBtn: PIXI.Container | null = null;
  /** 开打后钉在门楣左边。点下去先问一句，不直接走 */
  private _leaveBtn: PIXI.Container | null = null;
  private _gmSkip: PIXI.Container | null = null;
  /** 布阵条按钮不走 Pixi hitTest：真机上底下那一截 toLocal 经常对不上 */
  private _stripDetach: (() => void) | null = null;

  private _guideLife = 0;
  /** 1-1 那句留到第一波走完，不被 2.4 秒掐掉 */
  private _guideHold = false;
  /** 1-1 落地后自动开打的倒计时，0 表示不在等 */
  private _autoStartLeft = 0;
  /** 1-1 开打时底线亮一下 */
  private _lineFlash = 0;
  /** PULSE_SECS 报到第几个了 */
  private _pulseIdx = 0;
  private _hideNoted = false;
  /** 1-1 第一招：wait 等劲头满，on 放慢等玩家点 */
  private _skillGuide: 'off' | 'wait' | 'on' = 'off';
  private _skillGuideLeft = 0;
  private _skillGuideUid = '';
  /** 布阵时等玩家把这个人拖上路。1-2 是弹弓叔，1-3 是刚喊来的人 */
  private _placeGuide: { id: string; key: string; say: string; nudged: boolean } | null = null;
  /**
   * 点人看射程。Clash / 王国保卫战都是点选不暂停。
   * 布阵阶段是村民 id，开打后是 Fighter.uid —— 两套人表不是同一份。
   */
  private _inspectUid: string | null = null;
  private _settled = false;
  private _waveTold = 0;
  private _startedAt = 0;

  /** 上一逻辑帧的轴坐标，用来在 100ms 步长之间把走路插成滑步 */
  private readonly _prevPos = new Map<number, number>();
  /** 画面上这一刻站在轴上哪 */
  private readonly _shownPos = new Map<number, number>();
  /** 引擎里已经倒了、画面上弹还没落到身上的怪，接着走到挨那一下 */
  private readonly _ghostPos = new Map<number, number>();
  private readonly _hurtFlash = new Map<string, number>();
  private readonly _lastFoeXY = new Map<number, { x: number; y: number; feetY: number; h: number }>();

  /** 开打后底下那条：绝活头像 + 倍速 / 自动 */
  private readonly _tray = new SkillTray();
  private readonly _cutIn = new SkillCutIn();
  private _speedBtn: PIXI.Container | null = null;
  private _autoBtn: PIXI.Container | null = null;
  private _speed = PersistService.readRaw(SPEED_KEY) === '2' ? 2 : 1;
  private _auto = PersistService.readRaw(AUTO_KEY) !== '0';
  private _pulseT = 0;
  /** 本局放过绝活的人。自动放只在头一回出横切条，满屏横条会把战场盖掉 */
  private readonly _castSeen = new Set<string>();
  /** 绝活砸下去那一顿还剩多久，真实时间。只停战斗推进，演出照走 */
  private _skillFreeze = 0;
  private _artDirty = false;
  private _artCool = 0;
  /** 哪几路快漏了 → 还要闪多久。和提示的限频分开记 */
  private readonly _dangerLane = new Map<number, number>();
  private readonly _dangerSaidAt = new Map<number, number>();
  /** 布阵时点开的那张绝活卡 */
  private _card: PIXI.Container | null = null;

  /**
   * 布局按 logicHeight 算，不能用 designHeight。
   * designHeight 是写死的 1334；真机按宽度等比缩放，长屏可用高会到 1600+。
   * 用 1334 排的话，坞和底线停在屏幕中下部，底下那截露出渲染器底色 0x1a1126。
   */
  private _lay = {
    /** 门楣下沿。土路从这儿切开，不再钻进锈铁板后面 */
    top: 0,
    /** 敌人出场那条线（轴上的 pos 0） */
    spawnY: 250,
    /** 底线（轴上的 GOAL_POS）。敌人走过这里就是漏怪 */
    goalY: 1000,
    height: 1334,
    chrome: battleHudLay(0, 1334) as BattleHudLay,
  };
  /** 开打后的格高定的身高。布阵也用这个，人不会开战突然变大 */
  private _unitH = 78;

  constructor() {
    this.container.addChild(this._field);
    this._arena.addChild(this._unitLayer);
    this._arena.addChild(this._nameLayer);
    this._arena.addChild(this._fx.layer);
    this._arena.addChild(this._arenaMask);
    this._arena.mask = this._arenaMask;
    this.container.addChild(this._arena);
    this.container.addChild(this._hud);
    this._computeLayout();
    this._tray.visible = false;
    this.container.addChild(this._tray);
    this.container.addChild(this._bench);
    this._ghost.eventMode = 'none';
    this._ghost.visible = false;
    this.container.addChild(this._ghost);
    this.container.addChild(this._cutIn);
    this.container.addChild(this._revive);
    this.container.addChild(this._settle);
    this.container.addChild(this._reveal);
    this._reveal.close();
    this.container.addChild(this._leaveAsk);
    this._buildHud();
    watchArt(() => {
      this._artDirty = true;
    });
  }

  /**
   * 图一张张到，每张都叫一次。整屏重搭一帧只做一回，开打时再隔开一点，
   * 不然首局 CDN 补图那几秒每到一张就顿一下。
   */
  private _flushArt(realDt: number): void {
    this._artCool = Math.max(0, this._artCool - realDt);
    if (!this._artDirty || this._artCool > 0) return;
    this._artDirty = false;
    if (this._state.phase === 'fighting') this._artCool = ART_FLUSH_FIGHT_S;
    this._rebuildStripBtns();
    this._rebuildLeaveBtn();
    this._bench.paintChrome();
    this._bench.invalidate();
    this._renderBench();
    this._applyHudLayout();
    this._syncPhaseUi();
    if (this._hand?.mode === 'drag') {
      this._paintGhost(this._hand.id);
      this._raiseGhost();
    }
    this._rebindFieldArt();
    for (const e of this._state.foes) this._foeActors.get(e.id)?.bindEnemy(e.def.id);
  }

  /* ---------------- 生命周期 ---------------- */

  onEnter(data?: unknown): void {
    this._computeLayout();
    this._applyHudLayout();
    this._settle.hide();
    this._revive.hide();
    this._reveal.close();
    this._leaveAsk.hide();
    this._fx.reset();
    this._fx.setFoeLocator((id) => {
      const p = this._lastFoeXY.get(id);
      return p ? { x: p.x, y: p.y - p.h * 0.5 } : undefined;
    });
    this._clearActors();

    this._mem = loadMemory();
    const stageId = data && typeof data === 'object' && 'stageId' in data
      ? (data as { stageId: number }).stageId
      : this._mem.stageId;
    const stage = getStage(stageId);
    this._placeGuide = this._placeGuideFor(stage.id, this._mem);
    if (stage.id === 2 && this._mem.callCount === 0) {
      // 打完这关就要喊人，揭晓牌上的立绘先拉
      void ensureAssets(heroStillArt({ id: OPENING_CALL_ID, evo: 1 })).catch(() => { /* 牌子会等图 */ });
    }

    const bench = this._benchOf(this._mem);
    const heroes: HeroArtNeed[] = bench.map((c) => ({
      id: c.villager.id,
      evo: c.evoStage,
      lane: c.villager.lane,
    }));
    void ensureAssets(battleFaceImages(heroes))
      .catch((e) => {
        console.warn('[Battle] 上场立绘预热失败', e);
      })
      .then(() => {
        void ensureAssets(battlePreloadImages(stageId, heroes)).catch((e) => {
          console.warn('[Battle] 本局预热失败', e);
        });
        void ensureAssets(BATTLE_FX_IMAGES).catch(() => { /* tex() 缺图时战斗特效降级 */ });
      });
    // 人比格子少就按人数算，开局两个人顶板写 2/2，不留一格空着让人以为缺了谁
    const cap = Math.min(capOf(this._mem), Math.max(1, bench.length));
    this._state = createBattle(
      stage,
      bench,
      cap,
      villageMul(this._mem.villageLv),
      this._presetOf(this._mem, bench, stage, cap),
    );

    this._accMs = 0;
    this._settled = false;
    this._waveTold = 0;
    this._startedAt = 0;
    this._guideLife = 0;
    this._guideHold = false;
    this._autoStartLeft = stage.id === 1 ? 0.45 : 0;
    this._lineFlash = 0;
    this._pulseIdx = 0;
    this._hideNoted = false;
    this._skillGuide = 'off';
    this._skillGuideLeft = 0;
    this._guide.visible = false;
    this._prevPos.clear();
    this._shownPos.clear();
    this._ghostPos.clear();
    this._hurtFlash.clear();
    this._lastFoeXY.clear();
    this._vitals.reset();
    this._clearHand();
    this._inspectUid = null;
    this._closeCard();
    this._dangerLane.clear();
    this._dangerSaidAt.clear();
    this._cutIn.reset();
    this._castSeen.clear();
    this._skillFreeze = 0;
    this._state.autoSkill = this._auto;

    this._renderBench();
    this._syncPhaseUi();
    this._bindPlaceInput();
    this._mountGmSkip();
    GMManager.registerInstantClear(() => this._gmWin());
    BgmPlayer.play('battle');
    battleHide = () => this._noteHide();
    this._sayOpening(stage.chapter, stage.index, stage.pitch, stage.label, stage.name, stage.mainLane);
    if (this._placeGuide) this._bench.select(this._placeGuide.id);
    // 1-2 打完没点喊人就走了的，进 1-3 先把这一嗓子补上，再回来布阵
    if (stage.id === 3 && needOpeningCall(this._mem.stageTop, this._mem.callCount, this._mem.roster)) {
      this._runOpeningCall(() => this._restart(3));
    }
  }

  /**
   * 只有 1-3 要等玩家拖人。1-2 打完才喊来三婶，第三格是空的，
   * 她没上路之前开打键不放行。1-1、1-2 两个人默认都在场上。
   */
  private _placeGuideFor(stageId: number, mem: RunMemory): BattleScene['_placeGuide'] {
    if (
      stageId === 3
      && !PersistService.readRaw(GUIDE_SWAP_KEY)
      && mem.roster.includes(OPENING_CALL_ID)
      && !mem.layout.some((s) => s.id === OPENING_CALL_ID)
    ) {
      const name = getVillager(OPENING_CALL_ID).name;
      return { id: OPENING_CALL_ID, key: GUIDE_SWAP_KEY, say: `${name}来了，把她拖上路再开打`, nudged: false };
    }
    return null;
  }

  onExit(): void {
    battleHide = null;
    GMManager.unregisterInstantClear();
    this._gmSkip?.destroy({ children: true });
    this._gmSkip = null;
    this._stripDetach?.();
    this._stripDetach = null;
    this._leaveAsk.hide();
    this._closeCard();
    this._bench.destroyDock();
    BgmPlayer.stop();
  }

  /** 手上所有人，按入伙顺序。已经站上格子的也留着，灰掉就行，位置别跳 */
  private _benchOf(mem: RunMemory): Candidate[] {
    const p = progressOf(mem);
    const out: Candidate[] = [];
    for (const id of mem.roster) {
      // loadMemory 已经滤过非法 id，这里再兜一道：坏档不该白屏
      try {
        out.push({
          villager: getVillager(id),
          evoStage: evoOf(p, id),
          stars: starsOf(p, id),
          craft: craftOf(p, id),
        });
      } catch { /* 认不出的 id 直接跳过 */ }
    }
    return out;
  }

  /**
   * 开局铺哪一套阵。
   *
   * 优先用**玩家上一关自己的排法**：那是「记住上次」，不是「推荐阵容」。
   * 只有全新存档（layout 空）才用一次 autoPlace ——
   * 新手第一眼不该是十二个空格子加一句「请布阵」，那撞「十秒可懂」。
   */
  private _presetOf(
    mem: RunMemory,
    bench: readonly Candidate[],
    stage: ReturnType<typeof getStage>,
    cap: number,
  ): Placement[] {
    return this._presetBase(mem, bench, stage, cap);
  }

  private _presetBase(
    mem: RunMemory,
    bench: readonly Candidate[],
    stage: ReturnType<typeof getStage>,
    cap: number,
  ): Placement[] {
    if (mem.layout.length === 0) return autoPlace(bench, stage, cap);
    const byId = new Map(bench.map((c) => [c.villager.id, c]));
    const out: Placement[] = [];
    for (const s of mem.layout) {
      const c = byId.get(s.id);
      if (!c || out.length >= cap) continue;
      out.push({
        villager: c.villager, lane: s.lane, cell: s.cell,
        evoStage: c.evoStage, stars: c.stars, craft: c.craft,
      });
    }
    // 上次排的人这一关一个都用不上（换了存档、或者名单被清）时才兜底
    return out.length > 0 ? out : autoPlace(bench, stage, cap);
  }

  /* ---------------- 布阵 ---------------- */

  private _placing(): boolean {
    return this._state.phase === 'placing';
  }

  private _renderBench(): void {
    const items: BenchItem[] = this._state.bench.map((c) => ({
      id: c.villager.id,
      evoStage: c.evoStage,
      stars: c.stars,
      craft: c.craft,
      placed: placedOf(this._state, c.villager.id) !== undefined,
    }));
    this._bench.renderList(items);
  }

  private _draggingId(): string | null {
    return this._hand?.mode === 'drag' ? this._hand.id : null;
  }

  private _clearHand(): void {
    this._hand = null;
    this._ptrId = null;
    this._ghost.visible = false;
    this._ghost.removeChildren().forEach((c) => c.destroy());
    this._bench.select(null);
  }

  /** 只跟按下的那根手指，第二根松手不能把人放下去 */
  private _fingerOf(e: Event): { id: number; x: number; y: number } | null {
    const ratio = Game.designWidth / Game.screenWidth;
    const ev = e as {
      changedTouches?: Array<{ identifier: number; clientX: number; clientY: number }>;
      touches?: Array<{ identifier: number; clientX: number; clientY: number }>;
      pointerId?: number;
      clientX?: number;
      clientY?: number;
    };
    if (ev.changedTouches || ev.touches) {
      const moving = e.type === 'touchmove' ? ev.touches : ev.changedTouches;
      const list = moving && moving.length > 0 ? moving : ev.touches;
      if (!list || list.length === 0) return null;
      let t = list[0]!;
      if (this._ptrId != null) {
        let hit: typeof t | undefined;
        for (let i = 0; i < list.length; i += 1) {
          if (list[i]!.identifier === this._ptrId) hit = list[i];
        }
        if (!hit && ev.touches) {
          for (let i = 0; i < ev.touches.length; i += 1) {
            if (ev.touches[i]!.identifier === this._ptrId) hit = ev.touches[i];
          }
        }
        if (!hit) return null;
        t = hit;
      }
      return { id: t.identifier, x: t.clientX * ratio, y: t.clientY * ratio };
    }
    const id = ev.pointerId ?? 0;
    if (this._ptrId != null && id !== this._ptrId) return null;
    return { id, x: (ev.clientX ?? 0) * ratio, y: (ev.clientY ?? 0) * ratio };
  }

  private _raiseGhost(): void {
    this.container.addChild(this._ghost);
    this.container.addChild(this._revive);
    this.container.addChild(this._settle);
    this.container.addChild(this._leaveAsk);
  }

  private _chromeBusy(): boolean {
    return this._settle.visible || this._revive.visible || this._leaveAsk.visible || this._reveal.visible;
  }

  private _paintGhost(id: string): void {
    this._ghost.removeChildren().forEach((c) => c.destroy());
    const cand = this._state.bench.find((c) => c.villager.id === id);
    const v = getVillager(id);
    const h = this._unitH * 1.18;
    const spr = fitSprite(this._ghost, heroTex(v.id, cand?.evoStage ?? 1), 0, 0, h, h);
    if (spr) {
      spr.alpha = 0.96;
    } else {
      const g = new PIXI.Graphics();
      g.beginFill(LANE_TINT[v.lane], 0.88).drawRoundedRect(-h / 2, -h / 2, h, h, 10).endFill();
      this._ghost.addChild(g);
    }
    this._ghost.visible = true;
  }

  private _moveGhost(x: number, y: number): void {
    this._ghost.position.set(x, y);
  }

  private _beginDrag(
    id: string,
    from: 'bench' | 'field',
    origin: { lane: number; cell: number } | null,
    x: number,
    y: number,
  ): void {
    this._hand = { mode: 'drag', id, from, origin, x, y };
    this._bench.select(id);
    this._paintGhost(id);
    this._moveGhost(x, y);
    this._raiseGhost();
    playSfx('ui_tap', 0);
  }

  private _tryPlace(id: string, lane: number, cell: number): void {
    const mine = placedOf(this._state, id);
    if (mine && mine.lane === lane && mine.cell === cell) return;
    let benched = '';
    const guided = !!this._placeGuide;
    if (!placeAt(this._state, id, lane, cell)) {
      // 满员还往空格拖：换下离这格最近的那个，不让玩家先撤再拖
      const out = !mine && this._state.placed.length >= this._state.cap
        ? bumpFor(this._state, lane, cell)
        : undefined;
      if (!out || !removeAt(this._state, out.lane, out.cell) || !placeAt(this._state, id, lane, cell)) {
        if (out && !placedOf(this._state, out.villager.id)) placeAt(this._state, out.villager.id, out.lane, out.cell);
        Platform.showToast('放不下');
        return;
      }
      benched = out.villager.name;
    }
    playSfx('install_on', 0);
    this._afterPlaceChange();
    if (benched && !guided) this._say(`换下了${benched}`, 2);
  }

  private _onPlaceDown(e: Event): void {
    if (this._chromeBusy()) return;
    if (this._state.phase === 'fighting') {
      this._onFightTap(e);
      return;
    }
    if (!this._placing() || this._hand || this._ptrId != null) return;
    const p = this._fingerOf(e);
    if (!p) return;
    const strip = this._hitStrip(p.x, p.y);
    if (strip) {
      this._ptrId = p.id;
      this._hand = { mode: 'btn', which: strip };
      return;
    }
    const unit = this._hitUnit(p.x, p.y);
    if (unit) {
      const sitting = this._state.placed.find((x) => x.lane === unit.lane && x.cell === unit.cell);
      if (sitting) {
        this._ptrId = p.id;
        this._hand = {
          mode: 'press',
          id: sitting.villager.id,
          origin: unit,
          ox: p.x,
          oy: p.y,
          x: p.x,
          y: p.y,
        };
        this._bench.select(sitting.villager.id);
      }
      return;
    }
    const card = this._bench.cardAt(p.x, p.y);
    if (card) {
      this._ptrId = p.id;
      this._hand = { mode: 'bench', id: card, ox: p.x, oy: p.y, x: p.x, y: p.y };
      this._bench.select(card);
      return;
    }
    if (this._inspectUid) {
      this._inspectUid = null;
      this._bench.select(null);
      this._drawField();
      this._drawUnits();
    }
  }

  private _onPlaceMove(e: Event): void {
    if (!this._hand || !this._placing()) return;
    const p = this._fingerOf(e);
    if (!p) return;
    const hand = this._hand;
    if (hand.mode === 'btn') return;
    if (hand.mode === 'press') {
      hand.x = p.x;
      hand.y = p.y;
      const dx = p.x - hand.ox;
      const dy = p.y - hand.oy;
      if (Math.abs(dx) <= PLACE_SLOP && Math.abs(dy) <= PLACE_SLOP) return;
      this._beginDrag(hand.id, 'field', hand.origin, p.x, p.y);
      this._inspectUid = null;
      this._say('拖到另一格换位 · 拖回底下撤下');
      if (e.cancelable) e.preventDefault();
      return;
    }
    if (hand.mode === 'scroll') {
      this._bench.scrollBy(p.x - hand.lastX);
      hand.lastX = p.x;
      if (e.cancelable) e.preventDefault();
      return;
    }
    if (hand.mode === 'bench') {
      hand.x = p.x;
      hand.y = p.y;
      const dx = p.x - hand.ox;
      const dy = p.y - hand.oy;
      if (Math.abs(dx) <= PLACE_SLOP && Math.abs(dy) <= PLACE_SLOP) return;
      const leftTray = !this._bench.inTray(p.x, p.y);
      if (dy < -PLACE_LIFT || (leftTray && Math.abs(dy) >= Math.abs(dx))) {
        const on = placedOf(this._state, hand.id);
        this._beginDrag(hand.id, on ? 'field' : 'bench', on ? { lane: on.lane, cell: on.cell } : null, p.x, p.y);
        this._say(on ? '拖到另一格换位 · 拖回底下撤下' : '松手放到路上');
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (Math.abs(dx) > PLACE_SLOP && Math.abs(dx) >= Math.abs(dy)) {
        this._hand = { mode: 'scroll', lastX: p.x };
        this._bench.select(null);
        this._bench.scrollBy(dx);
        if (e.cancelable) e.preventDefault();
      }
      return;
    }
    hand.x = p.x;
    hand.y = p.y;
    this._moveGhost(p.x, p.y);
    if (e.cancelable) e.preventDefault();
  }

  private _onPlaceUp(e: Event): void {
    if (!this._hand) return;
    const p = this._fingerOf(e);
    if (!p) return;
    const hand = this._hand;
    this._hand = null;
    this._ptrId = null;
    this._ghost.visible = false;
    this._ghost.removeChildren().forEach((c) => c.destroy());

    if (hand.mode === 'btn') {
      this._bench.select(null);
      if (!this._placing() || this._chromeBusy()) return;
      if (this._hitStrip(p.x, p.y) !== hand.which) return;
      if (hand.which === 'start') this._beginFight();
      else if (this._state.stage.id !== 1) this._askLeave();
      return;
    }
    if (hand.mode === 'scroll') {
      this._bench.select(null);
      return;
    }
    if (hand.mode === 'press') {
      this._toggleInspect(hand.id);
      if (!this._inspectUid) this._bench.select(null);
      this._drawField();
      this._drawUnits();
      return;
    }
    if (hand.mode === 'bench') {
      const on = placedOf(this._state, hand.id);
      if (on) {
        removeAt(this._state, on.lane, on.cell);
        playSfx('ui_tap', 0);
        this._afterPlaceChange();
        return;
      }
      this._bench.select(null);
      return;
    }

    const cell = this._hitPlaceCell(p.x, p.y)
      ?? this._hitPlaceCell(hand.x, hand.y);
    if (cell) {
      this._tryPlace(hand.id, cell.lane, cell.cell);
      this._bench.select(null);
      return;
    }
    if (hand.from === 'field' && hand.origin && this._bench.inTray(p.x, p.y)) {
      removeAt(this._state, hand.origin.lane, hand.origin.cell);
      playSfx('ui_tap', 0);
      this._afterPlaceChange();
      return;
    }
    this._bench.select(null);
    this._drawField();
    this._drawUnits();
  }

  private _onPlaceCancel(): void {
    if (!this._hand) return;
    this._clearHand();
    this._drawField();
    this._drawUnits();
  }

  private _afterPlaceChange(): void {
    // 「玩家到底会不会重排」是这一版最关键的未知，所以每一笔都记
    track('place_change', {
      stage_id: this._state.stage.id,
      placed: this._state.placed.length,
      lanes: this._state.placed.map((p) => p.lane),
    });
    if (this._inspectUid && !placedOf(this._state, this._inspectUid)) {
      this._inspectUid = null;
    }
    const guide = this._placeGuide;
    if (guide && placedOf(this._state, guide.id)) {
      this._placeGuide = null;
      PersistService.writeRaw(guide.key, '1');
      this._say('站好了，点开打', 3);
    }
    this._renderBench();
    this._drawField();
    this._drawUnits();
    this._updateHud();
  }

  private _beginFight(): void {
    console.log('[battle-tap] beginFight', {
      phase: this._state.phase,
      placed: this._state.placed.length,
    });
    if (!this._placing()) {
      console.warn('[battle-tap] beginFight 被挡：不在布阵阶段', this._state.phase);
      return;
    }
    if (this._state.placed.length === 0) {
      console.warn('[battle-tap] beginFight 被挡：场上没人');
      Platform.showToast('先放几个人上去');
      return;
    }
    const guide = this._placeGuide;
    if (guide && !placedOf(this._state, guide.id)) {
      // 新来的人没上路就不开打。点开打只把这句话再说一遍
      this._sayHeld(guide.say);
      this._bench.select(guide.id);
      playSfx('ui_tap', 0);
      return;
    }
    // 记下这一次的排法。下一关直接铺上，玩家不用每关从零摆
    saveLayout(this._state.placed.map((p): Slot => ({
      id: p.villager.id, lane: p.lane, cell: p.cell,
    })));
    try {
      startFight(this._state);
    } catch (err) {
      console.error('[battle-tap] startFight 抛了', err);
      return;
    }
    console.log('[battle-tap] 已开打', this._state.phase, '上场', this._state.team.length);
    this._placeGuide = null;
    this._inspectUid = null;
    this._startedAt = Date.now();
    if (this._state.stage.id === 1 && !PersistService.readRaw(GUIDE_SKILL_KEY)) {
      const who = this._state.team.find((f) => f.def.id === GUIDE_SKILL_ID) ?? this._state.team[0];
      if (who) {
        who.energy = ENERGY_MAX;
        this._state.autoSkill = false;
        this._skillGuide = 'wait';
        this._skillGuideUid = who.uid;
      }
    }
    adMarkRunStart();
    // 打着的时候先把广告拉好，复活和结算一点就能播
    Platform.preloadRewardedVideo(rewardedAdUnitId('revive', Platform.name));
    Platform.preloadRewardedVideo(rewardedAdUnitId('settleDouble', Platform.name));
    track('run_start', {
      stage_id: this._state.stage.id,
      village_lv: this._mem.villageLv,
      squad: this._state.team.map((f) => f.def.id),
      lanes: this._state.team.map((f) => f.lane),
    });
    this._syncPhaseUi();
    this._fx.markLand(laneScreenX(1), this._lay.goalY);
    const stage = this._state.stage;
    if (stage.id === 1) {
      this._sayHeld('别让它们从这条路走到底');
      this._lineFlash = 1.6;
    } else if (stage.chapter === 1) {
      this._say(stage.pitch, 4);
    } else {
      this._say(this._auto ? '开打 · 绝活自动放，也能点底下头像' : '开打 · 头像亮了就点，放绝活');
    }
  }

  /** 布阵和开打两套 UI 的开关集中在这儿，别散到各处去 */
  private _syncPhaseUi(): void {
    this._computeLayout();
    const placing = this._placing();
    if (!placing) this._clearHand();
    if (this._state.phase !== 'placing' && this._state.phase !== 'fighting') {
      this._inspectUid = null;
    }
    const opening = this._state.stage.id === 1 && placing;
    this._bench.visible = placing && !opening;
    if (!placing) this._closeCard();
    const fighting = this._state.phase === 'fighting';
    this._tray.visible = fighting;
    if (this._speedBtn) this._speedBtn.visible = fighting;
    if (this._autoBtn) this._autoBtn.visible = fighting;
    if (this._startBtn) {
      this._startBtn.visible = placing && !opening;
      if (placing && !opening) this.container.addChild(this._startBtn);
    }
    if (this._backBtn) {
      this._backBtn.visible = placing && !opening;
      if (placing && !opening) this.container.addChild(this._backBtn);
    }
    this._syncLeaveBtn();
    this._drawField();
    this._drawUnits();
    this._updateHud();
  }

  /* ---------------- 主循环 ---------------- */

  update(realDt: number): void {
    this._flushArt(realDt);
    if (this._lineFlash > 0) this._lineFlash = Math.max(0, this._lineFlash - realDt);
    if (this._autoStartLeft > 0) {
      this._autoStartLeft = Math.max(0, this._autoStartLeft - realDt);
      if (this._autoStartLeft === 0 && this._placing() && this._state.stage.id === 1) {
        this._beginFight();
      }
    }
    const pulseAt = PULSE_SECS[this._pulseIdx];
    if (
      this._state.phase === 'fighting'
      && pulseAt !== undefined
      && this._startedAt > 0
      && Date.now() - this._startedAt >= pulseAt * 1000
    ) {
      this._pulseIdx += 1;
      track('run_pulse', {
        stage_id: this._state.stage.id,
        sec: pulseAt,
        wave: this._state.wave,
        play_ms: Date.now() - this._startedAt,
      });
    }
    this._cutIn.update(realDt);
    if (this._chromeBusy()) {
      this._fx.update(realDt);
      return;
    }
    this._tickSkillGuide(realDt);
    // 倍速只快战斗本身。横切条、提示按真实时间走，快进时照样念得完
    const dt = this._state.phase === 'fighting' ? realDt * this._speed : realDt;
    this._pulseT += realDt;

    // 顿帧只给受击那一下留残影，不许冻整条行军。
    // 分路塔防里每秒十几下，冻世界就是「走下来一会停顿一下」。
    if (this._fx.hitStop > 0) {
      this._fx.hitStop = Math.max(0, this._fx.hitStop - dt);
    }

    const frozen = this._skillFreeze > 0;
    this._skillFreeze = Math.max(0, this._skillFreeze - realDt);
    if (this._state.phase === 'fighting' && !frozen) {
      this._accMs += dt * 1000;
      while (this._accMs >= TICK_MS && this._state.phase === 'fighting' && this._skillFreeze <= 0) {
        this._accMs -= TICK_MS;
        for (const e of this._state.foes) {
          if (e.alive) this._prevPos.set(e.id, e.pos);
        }
        this._state.events.length = 0;
        tick(this._state);
        this._consumeEvents();
      }
    }

    if (!frozen) this._walkGhosts(dt);
    this._fx.update(dt);
    const sh = this._fx.shakePx;
    this._arena.position.set(sh > 0 ? (Math.random() - 0.5) * 2 * sh : 0, sh > 0 ? (Math.random() - 0.5) * 2 * sh : 0);
    this._tickFlash(dt);
    this._tickGuide(realDt);
    this._tickDanger(realDt);
    if (this._tray.visible) this._tray.sync(this._state.team, 0.5 + 0.5 * Math.sin(this._pulseT * 7));
    this._drawField();
    this._drawUnits(this._accMs / TICK_MS);
    this._updateHud();

    for (const a of this._villagerActors.values()) a.update(dt);
    for (const a of this._foeActors.values()) a.update(dt);

    if ((this._state.phase === 'won' || this._state.phase === 'lost') && !this._fx.busy()) {
      this._endRun();
    }
  }

  /**
   * 引擎出手那一刻就结算，打死的怪在画面上还要等弹飞过来。
   * 这段时间钉在原地就是「走着走着突然停一下」，所以照它原来的走法接着走，
   * 挨着人就停、被钉住就不动，等那一下落上去再倒。
   */
  private _walkGhosts(dt: number): void {
    for (const e of this._state.foes) {
      if (e.alive || !this._fx.holdingEnemy(e.id) || this._foeActors.get(e.id)?.dead) {
        this._ghostPos.delete(e.id);
        continue;
      }
      const from = this._ghostPos.get(e.id) ?? this._shownPos.get(e.id) ?? e.pos;
      if (e.stunMs > 0) {
        this._ghostPos.set(e.id, from);
        continue;
      }
      const halt = foeHaltPos(e, this._state.team);
      let pos = marchStep(from, e.spd, dt, e.slowMs > 0 ? SLOW_MUL : 1);
      if (halt !== undefined) pos = from >= halt ? from : Math.min(pos, halt);
      this._ghostPos.set(e.id, Math.min(pos, GOAL_POS));
    }
  }

  /**
   * 1-1 第一招留给玩家点：劲头一满挂一句话，等他点底下的头像。
   * 不放慢、不盖遮罩、不画手指，头像本来就在亮。等太久就替他放。
   */
  private _tickSkillGuide(realDt: number): void {
    if (this._skillGuide === 'off' || this._state.phase !== 'fighting') return;
    if (this._skillGuide === 'wait') {
      const ready = this._state.team.find((f) => f.uid === this._skillGuideUid && skillReady(f))
        ?? this._state.team.find((f) => skillReady(f));
      if (!ready) return;
      // 等路上来一串再叫他点：第一招必须打得着、最好一下带走几只
      const n = skillTargets(this._state, ready.uid);
      const t = this._state.elapsedMs;
      if (!(t >= SKILL_GUIDE_FROM_MS && n >= SKILL_GUIDE_CROWD) && !(t >= SKILL_GUIDE_LATE_MS && n > 0)) return;
      this._skillGuide = 'on';
      this._skillGuideLeft = SKILL_GUIDE_WAIT_S;
      this._sayHeld(`${ready.def.name}攒满劲了！点底下他的头像`);
      playSfx('ui_tap', 0);
      return;
    }
    this._skillGuideLeft -= realDt;
    if (this._skillGuideLeft > 0) return;
    const ready = this._state.team.find((f) => skillReady(f));
    if (ready) {
      this._state.events.length = 0;
      if (castSkill(this._state, ready.uid)) this._consumeEvents();
      this._state.events.length = 0;
    }
    this._endSkillGuide(false);
  }

  private _endSkillGuide(byHand: boolean): void {
    if (this._skillGuide === 'off') return;
    this._skillGuide = 'off';
    PersistService.writeRaw(GUIDE_SKILL_KEY, '1');
    this._state.autoSkill = this._auto;
    this._say(byHand ? '打得好！以后攒满了会自己放' : '攒满了会自己放，也能点头像抢先放', 3);
  }

  /** 没人拦、又快走到底线的怪：那一路底线闪红，隔几秒念一句 */
  private _tickDanger(dt: number): void {
    for (const [lane, v] of this._dangerLane) {
      if (v - dt <= 0) this._dangerLane.delete(lane);
      else this._dangerLane.set(lane, v - dt);
    }
    if (this._state.phase !== 'fighting') return;
    const now = this._pulseT;
    for (const e of this._state.foes) {
      if (!e.alive || e.pos < LEAK_WARN_POS) continue;
      if (foeHaltPos(e, this._state.team) !== undefined) continue;
      this._dangerLane.set(e.lane, 0.6);
      if (now - (this._dangerSaidAt.get(e.lane) ?? -99) < 4) continue;
      this._dangerSaidAt.set(e.lane, now);
      this._say(`${'左中右'[e.lane] ?? '中'}路要漏了！`);
    }
  }

  private _tickFlash(dt: number): void {
    for (const [k, v] of this._hurtFlash) {
      const n = v - dt;
      if (n <= 0) this._hurtFlash.delete(k);
      else this._hurtFlash.set(k, n);
    }
  }

  /* ---------------- 事件 → 特效 ---------------- */

  private _consumeEvents(): void {
    const cast = new Map<string, {
      id: string;
      x: number;
      y: number;
      hits: SkillMark[];
      aids: { x: number; y: number; guard: boolean; haste: boolean; heal: boolean }[];
    }>();
    this._consumeEventList(cast);
    for (const c of cast.values()) {
      this._fx.playSkill(c.id, c.x, c.y, c.hits, c.aids);
      if (c.hits.length > 0) this._skillFreeze = Math.max(this._skillFreeze, 0.06);
    }
  }

  private _consumeEventList(
    cast: Map<string, {
      id: string;
      x: number;
      y: number;
      hits: SkillMark[];
      aids: { x: number; y: number; guard: boolean; haste: boolean; heal: boolean }[];
    }>,
  ): void {
    for (const ev of this._state.events) {
      if (ev.kind === 'waveStart') {
        if (ev.wave > this._waveTold) {
          this._waveTold = ev.wave;
          if (this._guideHold && ev.wave >= 2 && this._skillGuide !== 'on') {
            this._guideHold = false;
            this._guideLife = 0.6;
          }
          playSfx('wave_in', 0);
          if (ev.wave >= this._state.stage.waves.length) {
            BgmPlayer.play('battle_hot');
          }
        }
        continue;
      }

      if (ev.kind === 'hit') {
        const f = this._state.team.find((x) => x.uid === ev.uid);
        const e = this._state.foes.find((x) => x.id === ev.foeId);
        if (!f) continue;
        const hp = this._villagerXY(f);
        const ep = e ? this._foeXY(e) : this._lastFoeXY.get(ev.foeId);
        if (!ep) continue;
        const fx = resolveAttackFx(f.def, f.evoStage);
        const skin = resolveFxSkin(f.def, f.evoStage);
        this._vitals.seed(`e${ev.foeId}`, e?.maxHp ?? ev.damage, 0);
        this._actorFor(f).playAttack(ep.x, ep.y, motionForSkin(skin, fx));
        this._fx.consume(ev, {
          hx: hp.x, hy: hp.y - hp.h * 0.5,
          ex: ep.x, ey: ep.y - ep.h * 0.5,
          color: LANE_TINT[f.def.lane],
          fx,
          skin,
          melee: f.range <= 1,
          enemyId: ev.foeId,
          slowed: evoKindOf(f.def, f.evoStage) === 'slowHard' && !ev.killed,
          onLand: () => {
            this._foeActors.get(ev.foeId)?.flash(140);
            this._vitals.landEnemy(`e${ev.foeId}`, ev.damage);
          },
        });
        continue;
      }

      if (ev.kind === 'foeHit') {
        const e = this._state.foes.find((x) => x.id === ev.foeId);
        const f = this._state.team.find((x) => x.uid === ev.uid);
        if (!f) continue;
        const ep = e ? this._foeXY(e) : this._lastFoeXY.get(ev.foeId);
        if (!ep) continue;
        const hp = this._villagerXY(f);
        this._actorFor(f).faceToward(ep.x);
        // 站住的怪是在出手，得看得出它在打，不然像卡在路中间
        this._foeActors.get(ev.foeId)?.playAttack(hp.x, hp.y, 'lunge');
        this._fx.consume(ev, {
          ex: ep.x, ey: ep.y - ep.h * 0.5,
          hx: hp.x, hy: hp.y - hp.h * 0.5,
          enemyFx: resolveEnemyFx(e?.def.id ?? ''),
          heroId: f.uid,
          onLand: () => {
            this._hurtFlash.set(f.uid, 0.14);
            this._vitals.landHero(f.uid, ev.damage, 0);
          },
        });
        continue;
      }

      if (ev.kind === 'heal') {
        const f = this._state.team.find((x) => x.uid === ev.uid);
        const t = this._state.team.find((x) => x.uid === ev.targetUid);
        if (!f || !t) continue;
        const tp = this._villagerXY(t);
        this._vitals.healHero(t.uid, ev.amount, t.maxHp);
        this._fx.consume(ev, { tx: tp.x, ty: tp.y - tp.h * 0.5 });
        continue;
      }

      if (ev.kind === 'foeDown') {
        const p = this._lastFoeXY.get(ev.foeId);
        if (!p) continue;
        // 倒下等最后一发落地。现在就淡出 / 抽血条，石子会打在空位上。
        this._fx.consume(ev, {
          ex: p.x, ey: p.y - p.h * 0.5, enemyId: ev.foeId,
          onLand: () => this._foeActors.get(ev.foeId)?.killOff(),
        });
        continue;
      }

      if (ev.kind === 'villagerDown') {
        const f = this._state.team.find((x) => x.uid === ev.uid);
        if (!f) continue;
        const p = this._villagerXY(f);
        this._fx.consume(ev, { hx: p.x, hy: p.y - p.h * 0.5, heroId: f.uid });
        this._actorFor(f).setDead(true);
        this._vitals.drop(f.uid);
        continue;
      }

      if (ev.kind === 'villagerUp') {
        const f = this._state.team.find((x) => x.uid === ev.uid);
        if (!f) continue;
        const p = this._villagerXY(f);
        this._actorFor(f).setDead(false);
        this._vitals.seed(f.uid, f.hp, 0, true);
        this._fx.consume(ev, { hx: p.x, hy: p.y - p.h * 0.5, heroId: f.uid });
        continue;
      }

      if (ev.kind === 'burst') {
        const f = this._state.team.find((x) => x.uid === ev.uid);
        if (!f) continue;
        const p = this._villagerXY(f);
        this._fx.consume(ev, { hx: p.x, hy: p.y - p.h * 0.5, heroId: f.uid });
        continue;
      }

      if (ev.kind === 'skill') {
        const f = this._state.team.find((x) => x.uid === ev.uid);
        if (!f) continue;
        const p = this._villagerXY(f);
        const sk = skillAt(f.def, f.evoStage);
        this._actorFor(f).flash(180);
        const aids = (sk.guard || sk.haste || sk.heal)
          ? skillAllies(this._state, f, sk).map((t) => {
            const tp = this._villagerXY(t);
            return {
              x: tp.x, y: tp.y - tp.h * 0.35,
              guard: !!sk.guard, haste: !!sk.haste, heal: !!sk.heal,
            };
          })
          : [];
        cast.set(f.uid, { id: f.def.id, x: p.x, y: p.y - p.h * 0.45, hits: [], aids });
        if (ev.manual || !this._castSeen.has(f.uid)) {
          this._cutIn.show(f, this._lay.height, this._speed > 1);
          this.container.addChild(this._cutIn);
          this.container.addChild(this._leaveAsk);
        }
        this._castSeen.add(f.uid);
        continue;
      }

      if (ev.kind === 'skillHit') {
        const e = this._state.foes.find((x) => x.id === ev.foeId);
        const ep = e ? this._foeXY(e) : this._lastFoeXY.get(ev.foeId);
        const bag = cast.get(ev.uid);
        if (!ep || !bag) continue;
        this._vitals.seed(`e${ev.foeId}`, e?.maxHp ?? ev.damage, 0);
        // 掉血、倒下都等这一招真落到身上，不抢在钢珠前头
        this._fx.holdFoe(ev.foeId);
        bag.hits.push({
          foeId: ev.foeId,
          x: ep.x,
          y: ep.y - ep.h * 0.5,
          damage: ev.damage,
          killed: ev.killed,
          stun: ev.stun,
          push: ev.push,
          slow: ev.slow,
          land: () => {
            this._foeActors.get(ev.foeId)?.flash(180);
            this._vitals.landEnemy(`e${ev.foeId}`, ev.damage);
            this._fx.landFoe(ev.foeId);
          },
        });
        continue;
      }

      if (ev.kind === 'bossIn') {
        this._say(`大个子来了！${'左中右'[ev.lane] ?? '中'}路顶住`);
        this._fx.floatText('大个子来了！', laneScreenX(ev.lane), this._lay.spawnY + 40, 0xff7a5a, 30);
        playSfx('enemy_beam', 0);
        continue;
      }

      if (ev.kind === 'leak') {
        // 漏怪的反馈钉在那条路的底线上，玩家才知道是哪一路漏的
        this._fx.consume(ev, { hx: laneScreenX(ev.lane), hy: this._lay.goalY });
        this._foeActors.get(ev.foeId)?.killOff();
        this._say(`${'左中右'[ev.lane] ?? '中'}路漏了一个`);
      }
    }
  }

  /* ---------------- 坐标 ---------------- */

  private _computeLayout(): void {
    const height = Game.logicHeight;
    const chrome = battleHudLay(Game.safeTop, height, Game.safeHeaderCenterY);
    const { spawnY, goalY } = battleFieldLay({
      chromeBottom: chrome.barBottom,
      height,
      placing: this._state.phase === 'placing',
      safeBottom: Game.safeBottom,
      benchH: BENCH_H + START_STRIP,
    });
    this._lay = { top: chrome.barBottom, spawnY, goalY, height, chrome };
    this._unitH = fieldFightUnitH({
      chromeBottom: chrome.barBottom,
      height,
      safeBottom: Game.safeBottom,
      benchH: BENCH_H + START_STRIP,
    });
    this._arenaMask.clear();
    // 战场从牌下沿起。怪和弹都不许画进锈铁里。
    this._arenaMask.beginFill(0xffffff).drawRect(0, chrome.barBottom, 750, height - chrome.barBottom).endFill();
  }

  private _villagerXY(f: Fighter): { x: number; y: number; h: number } {
    const h = this._unitH;
    return {
      x: laneScreenX(f.lane),
      y: reachOriginY(f.pos, this._lay.spawnY, this._lay.goalY),
      h,
    };
  }

  private _standY(cell: number): number {
    if (this._placing()) return this._formationFeet(cell);
    return reachOriginY(cellPos(cell), this._lay.spawnY, this._lay.goalY);
  }

  /** 编队四格。排距够放下居中的名字，开打后改回战斗投影 */
  private _formationFeet(cell: number): number {
    const grid = formationGrid({
      unitH: this._unitH,
      top: this._lay.spawnY + 12,
      bottom: this._lay.goalY - 8,
    });
    return grid.feetY[cell] ?? reachOriginY(cellPos(cell), this._lay.spawnY, this._lay.goalY);
  }

  private _hitPlaceCell(x: number, y: number): { lane: number; cell: number } | null {
    if (!this._placing()) return hitDeployCell(x, y, this._lay.spawnY, this._lay.goalY);
    const grid = formationGrid({
      unitH: this._unitH,
      top: this._lay.spawnY + 12,
      bottom: this._lay.goalY - 8,
    });
    return hitFormationCell(x, y, grid.feetY, this._unitH);
  }

  private _foeXY(e: Foe, frac = 0): { x: number; y: number; feetY: number; h: number } {
    const prev = this._prevPos.get(e.id) ?? e.pos;
    const pos = marchLerp(prev, e.pos, frac);
    this._shownPos.set(e.id, pos);
    return this._foeAt(e, pos);
  }

  private _foeAt(e: Foe, pos: number): { x: number; y: number; feetY: number; h: number } {
    const y = posScreenY(pos, this._lay.spawnY, this._lay.goalY);
    // 同一路上的怪按 id 微微错开，不然一队铁罐会叠成一个
    const x = laneScreenX(e.lane) + (((e.id * 37) % 5) - 2) * 8;
    const h = fieldEnemyH(e.def.id, this._unitH) * (e.boss ? 1.6 : 1);
    const p = { x: e.boss ? laneScreenX(e.lane) : x, y, feetY: y, h };
    this._lastFoeXY.set(e.id, p);
    return p;
  }

  /* ---------------- 画战场 ---------------- */

  private _drawField(): void {
    const g = this._field;
    g.clear();

    const { spawnY, goalY } = this._lay;
    const load = this._laneLoad();
    const seam = this._lay.top;

    // 顶板背后不透土路。锈铁是村口门楣，路从板底下切开另起
    g.beginFill(0x140e0a).drawRect(0, 0, 750, seam).endFill();
    const bg = bgTex();
    const roadH = this._lay.height - seam;
    if (bg && bg.baseTexture.valid && bg.width > 1 && roadH > 0) {
      fillCover(g, bg, 0, seam, 750, roadH, 1);
    } else if (roadH > 0) {
      g.beginFill(0x2a2018).drawRect(0, seam, 750, roadH).endFill();
    }
    this._drawVillageMouth(g, seam);

    const placing = this._placing();
    const picked = this._draggingId();
    const hover = this._hand?.mode === 'drag'
      ? this._hitPlaceCell(this._hand.x, this._hand.y)
      : null;
    if (placing) {
      for (let lane = 0; lane < LANE_COUNT; lane += 1) {
        if (load[lane]! > 0) {
          g.beginFill(0x8b2e1f, 0.22)
            .drawRoundedRect(FIELD_X + lane * LANE_W + 28, spawnY + 2, LANE_W - 56, 5, 2)
            .endFill();
        }
      }
      for (let cell = 0; cell < CELL_COUNT; cell += 1) {
        for (let lane = 0; lane < LANE_COUNT; lane += 1) {
          const cx = laneScreenX(lane);
          const feetY = this._standY(cell);
          const sitting = this._state.placed.find((p) => p.lane === lane && p.cell === cell);
          const over = hover?.lane === lane && hover?.cell === cell;
          if (sitting) {
            this._stampFeet(g, cx, feetY, sitting.villager.id === picked || (over && picked !== sitting.villager.id));
          } else if (picked) {
            this._dropRing(g, cx, feetY, over);
          }
        }
      }
    }

    // 开打后坞收掉，底线要看得见。布阵时沙袋就是门槛，别再横一条红杠
    if (!placing) {
      g.beginFill(0x8b2e1f, 0.92).drawRect(FIELD_X, goalY - 3, FIELD_W, 6).endFill();
      if (this._lineFlash > 0) {
        const a = 0.35 + 0.5 * (this._lineFlash / 1.6);
        g.beginFill(0xffe08a, a).drawRect(FIELD_X, goalY - 8, FIELD_W, 16).endFill();
      }
      const blink = 0.45 + 0.45 * Math.sin(this._pulseT * 14);
      for (const lane of this._dangerLane.keys()) {
        const x0 = FIELD_X + lane * LANE_W;
        g.beginFill(0xff3a2a, blink).drawRect(x0 + 6, goalY - 5, LANE_W - 12, 10).endFill();
        g.beginFill(0xff3a2a, blink * 0.25).drawRect(x0 + 6, goalY - 60, LANE_W - 12, 55).endFill();
      }
    }
    this._drawInspect(g);
    this._drawThreshold(g, goalY, this._lay.height, placing);
  }

  /**
   * 开打点人：地上画出真实覆盖，战斗不停。
   * 再点同一人收起，点别人换看，点空地关掉。
   */
  private _onFightTap(e: Event): void {
    const p = this._fingerOf(e);
    if (!p) return;
    if (this._inRect(p, this._leaveRect())) {
      this._askLeave();
      return;
    }
    if (this._tray.visible && p.y >= this._tray.top - 10) {
      const btn = this._hitTrayBtn(p);
      if (btn === 'speed') this._toggleSpeed();
      else if (btn === 'auto') this._toggleAuto();
      else {
        const uid = this._tray.hit(p.x, p.y);
        if (uid) {
          // 上一步 tick 的事件已经演过了，清掉再放，不然会重演一遍
          this._state.events.length = 0;
          if (castSkill(this._state, uid)) {
            this._consumeEvents();
            this._endSkillGuide(true);
          } else {
            this._say(`${skillOf(this._state.team.find((f) => f.uid === uid)!.def).name}还没攒满`);
          }
          this._state.events.length = 0;
        }
      }
      return;
    }
    const hit = this._hitFighter(p.x, p.y);
    this._toggleInspect(hit?.uid ?? null);
  }

  /** 点开看的时候名字后面挂上射程格数 */
  private _reachTag(name: string, range: number): string {
    return `${name} ${range}格`;
  }

  /** 点同一人收起，点别人换看，传空关掉 */
  private _toggleInspect(uid: string | null): void {
    if (!uid) {
      this._inspectUid = null;
      return;
    }
    this._inspectUid = this._inspectUid === uid ? null : uid;
    if (!this._inspectUid) return;
    playSfx('ui_tap', 0);
    this._sayPanel(uid);
  }

  /**
   * 布阵时点开一个人，就把他的面板念出来。
   *
   * 局内原本一处都看不见养成结果 —— 打完一关不知道自己比上一关强在哪，
   * 局外那条线也就白攒了。村子乘数单写一截，因为那是全员共享的那一层，
   * 不写的话玩家只会把数字记在这个人头上。
   */
  private _sayPanel(uid: string): void {
    if (!this._placing()) return;
    const p = this._state.placed.find((x) => x.villager.id === uid);
    if (!p) return;
    const s = statsOf(p.villager, p.evoStage, p.stars, this._state.villageMul, p.craft);
    const star = p.stars > 0 ? `★${p.stars}` : '';
    const heal = jobOf(p.villager.role) === 'heal';
    const boost = this._state.villageMul > 1
      ? ` · 含村子 +${Math.round((this._state.villageMul - 1) * 100)}%`
      : '';
    this._say(
      `${p.villager.name} Lv.${p.craft}${star} · ${heal ? '修' : '打'}${s.atk} 抗${s.hp}`
      + ` · ${s.range}格 ${(s.interval / 1000).toFixed(1)}秒${boost}`,
    );
  }

  private _hitFighter(x: number, y: number): Fighter | null {
    const h = this._unitH;
    let best: { f: Fighter; d: number } | null = null;
    for (const f of this._state.team) {
      if (!f.alive) continue;
      const ux = laneScreenX(f.lane);
      const uy = reachOriginY(f.pos, this._lay.spawnY, this._lay.goalY);
      if (Math.abs(x - ux) > LANE_W * 0.42) continue;
      if (y < uy - h - 20 || y > uy + 24) continue;
      const d = Math.abs(x - ux) + Math.abs(y - (uy - h * 0.45));
      if (!best || d < best.d) best = { f, d };
    }
    return best?.f ?? null;
  }

  /**
   * 点人看射程的数据。布阵按格子现算，开打后读场上那个人。
   * 地上那片只走 reachScreenPoly。人和怪的脚底都落在 reachOriginY。
   */
  private _inspectReach(): {
    lane: number;
    cell: number;
    pos: number;
    range: number;
    def: Fighter['def'];
    feet: { x: number; y: number };
    fighter: Fighter | null;
  } | null {
    if (!this._inspectUid) return null;
    if (this._placing()) {
      const p = this._state.placed.find((x) => x.villager.id === this._inspectUid);
      if (!p) {
        this._inspectUid = null;
        return null;
      }
      const s = statsOf(p.villager, p.evoStage, p.stars, this._state.villageMul, p.craft);
      return {
        lane: p.lane,
        cell: p.cell,
        pos: cellPos(p.cell),
        range: s.range,
        def: p.villager,
        feet: {
          x: laneScreenX(p.lane),
          y: this._standY(p.cell),
        },
        fighter: null,
      };
    }
    if (this._state.phase !== 'fighting') return null;
    const f = this._state.team.find((x) => x.uid === this._inspectUid);
    if (!f?.alive) {
      this._inspectUid = null;
      return null;
    }
    return {
      lane: f.lane,
      cell: f.cell,
      pos: f.pos,
      range: f.range,
      def: f.def,
      feet: this._villagerXY(f),
      fighter: f,
    };
  }

  /** 地上那片 = reachScreenPoly。开打后能出手的怪再点一层脚底，仍问 canReach。 */
  private _drawInspect(g: PIXI.Graphics): void {
    const sub = this._inspectReach();
    if (!sub) return;
    const { spawnY, goalY } = this._lay;
    const pulse = 0.82 + 0.18 * Math.sin(Date.now() / 210);
    const color = LANE_TINT[sub.def.lane];
    const poly = reachScreenPoly(sub, spawnY, goalY);
    const dy = sub.feet.y - reachOriginY(sub.pos, spawnY, goalY);
    reachPoly(g, dy === 0 ? poly : poly.map((p) => ({ x: p.x, y: p.y + dy })), color, pulse);
    this._stampFeet(g, sub.feet.x, sub.feet.y, true);
    const f = sub.fighter;
    if (!f) return;
    for (const e of this._state.foes) {
      if (!e.alive || !canReach(f, e)) continue;
      const p = this._lastFoeXY.get(e.id);
      if (!p) continue;
      g.beginFill(color, 0.22 * pulse).drawEllipse(p.x, p.feetY + 4, 22, 8).endFill();
      g.lineStyle(2, 0xfff4c4, 0.55 * pulse).drawEllipse(p.x, p.feetY + 4, 20, 7).lineStyle(0);
    }
  }

  /** 牌下沿就是村口。路从这儿起，怪也从这儿下面露头 */
  private _drawVillageMouth(g: PIXI.Graphics, seam: number): void {
    g.beginFill(0x2a1810, 0.92).drawRect(0, seam, 750, 3).endFill();
    g.beginFill(0x6a4a28, 0.55).drawRect(0, seam + 3, 750, 2).endFill();
    g.beginFill(0xc4a06a, 0.28).drawRect(FIELD_X + 18, seam + 2, FIELD_W - 36, 2).endFill();
  }

  /** 人站在土上：一小团接触影。选中再加细金环，不要铺整格 */
  private _stampFeet(g: PIXI.Graphics, cx: number, feetY: number, hot: boolean): void {
    const s = this._unitH / 36;
    const y = feetY + 5 * s;
    g.beginFill(0x1a1008, 0.1).drawEllipse(cx, y + 1, 26 * s, 9 * s).endFill();
    g.beginFill(0x1a1008, 0.2).drawEllipse(cx, y, 18 * s, 6.5 * s).endFill();
    g.beginFill(0x0a0806, 0.26).drawEllipse(cx, y - 0.5, 11 * s, 4 * s).endFill();
    if (!hot) return;
    g.beginFill(GOLD, 0.1).drawEllipse(cx, y, 28 * s, 11 * s).endFill();
    g.lineStyle(2.2, GOLD, 0.95).drawEllipse(cx, y, 26 * s, 10 * s).lineStyle(0);
    g.lineStyle(1.1, 0xffe08a, 0.72).drawEllipse(cx, y, 19 * s, 7 * s).lineStyle(0);
  }

  /** 手里拎着人才画。空位是细环，不是黄垫；手指底下那格加粗 */
  private _dropRing(g: PIXI.Graphics, cx: number, feetY: number, hot = false): void {
    const s = this._unitH / 36;
    const y = feetY + 5 * s;
    if (hot) {
      g.beginFill(GOLD, 0.14).drawEllipse(cx, y, 28 * s, 11 * s).endFill();
      g.lineStyle(2.4, GOLD, 0.95).drawEllipse(cx, y, 26 * s, 10 * s).lineStyle(0);
      g.lineStyle(1.1, 0xffe08a, 0.72).drawEllipse(cx, y, 18 * s, 7 * s).lineStyle(0);
      return;
    }
    g.beginFill(GOLD, 0.05).drawEllipse(cx, y, 22 * s, 8 * s).endFill();
    g.lineStyle(1.5, GOLD, 0.4).drawEllipse(cx, y, 21 * s, 8 * s).lineStyle(0);
    g.lineStyle(0.8, 0xffe08a, 0.28).drawEllipse(cx, y, 14 * s, 5 * s).lineStyle(0);
  }

  /** 把贴图铺进一块矩形。没图就让调用方画色块 */
  private _blitTex(
    g: PIXI.Graphics,
    tex: PIXI.Texture | null,
    x: number,
    y: number,
    w: number,
    h: number,
    alpha = 1,
  ): boolean {
    if (!tex?.baseTexture.valid || tex.width <= 1) return false;
    const m = new PIXI.Matrix();
    m.scale(w / tex.width, h / tex.height);
    m.translate(x, y);
    g.beginTextureFill({ texture: tex, matrix: m, alpha });
    g.drawRoundedRect(x, y, w, h, 10);
    g.endFill();
    return true;
  }

  /** 底线下面的沙袋门槛。开打后坞不在，靠这块把底下填住 */
  private _drawThreshold(
    g: PIXI.Graphics,
    goalY: number,
    height: number,
    placing: boolean,
  ): void {
    if (!placing) {
      g.beginFill(0x5a3c24, 0.42).drawRect(0, goalY + 4, 750, Math.max(0, height - goalY - 4)).endFill();
    }
    const bagY = goalY - 6;
    if (this._blitTex(g, uiTex('sandbag'), 15, bagY, 720, 54, 1)) return;
    const bags = placing
      ? [130, 250, 375, 500, 620]
      : [70, 150, 230, 320, 430, 520, 600, 680];
    for (const x of bags) {
      g.beginFill(0xc4a46a, 0.9).drawEllipse(x, goalY + 22, 34, 13).endFill();
      g.lineStyle(1.5, 0x5a3c1e, 0.45).drawEllipse(x, goalY + 22, 34, 13).lineStyle(0);
    }
  }

  private _laneLoad(): number[] {
    const load = new Array<number>(LANE_COUNT).fill(0);
    for (const w of this._state.stage.waves) {
      for (const grp of w.groups) load[grp.lane % LANE_COUNT]! += grp.count;
    }
    return load;
  }

  /** 先认人再认格。人小，点在立绘上要比点在格线上优先 */
  private _hitUnit(x: number, y: number): { lane: number; cell: number } | null {
    const h = this._unitH;
    let best: { lane: number; cell: number; d: number } | null = null;
    for (const p of this._state.placed) {
      const ux = laneScreenX(p.lane);
      const uy = this._standY(p.cell);
      if (Math.abs(x - ux) > LANE_W * 0.42) continue;
      if (y < uy - h - 20 || y > uy + 24) continue;
      const d = Math.abs(x - ux) + Math.abs(y - (uy - h * 0.45));
      if (!best || d < best.d) best = { lane: p.lane, cell: p.cell, d };
    }
    return best;
  }

  private _rebindFieldArt(): void {
    for (const b of fieldHeroBinds(this._state)) {
      this._villagerActors.get(b.uid)?.bindHero(b.id, b.lane, b.evo);
    }
  }

  /* ---------------- 画单位 ---------------- */

  private _actorFor(f: Fighter): UnitActor {
    let a = this._villagerActors.get(f.uid);
    if (!a) {
      a = new UnitActor();
      a.bindHero(f.def.id, f.def.lane, f.evoStage);
      this._unitLayer.addChild(a.view);
      this._villagerActors.set(f.uid, a);
    }
    return a;
  }

  private _drawUnits(frac = 0): void {
    this._nameLayer.removeChildren().forEach((c) => c.destroy({ children: true }));

    // 布阵阶段画的是 placed（还没变成 Fighter），开打后画 team
    if (this._placing()) {
      this._syncCard();
      for (const p of this._state.placed) {
        const h = this._unitH;
        const x = laneScreenX(p.lane);
        const y = this._standY(p.cell);
        const uid = `pre:${p.villager.id}`;
        let a = this._villagerActors.get(uid);
        if (!a) {
          a = new UnitActor();
          a.bindHero(p.villager.id, p.villager.lane, p.evoStage);
          this._unitLayer.addChild(a.view);
          this._villagerActors.set(uid, a);
        }
        a.equip(p.evoStage);
        a.place(x, y, h);
        const lifting = this._draggingId() === p.villager.id;
        a.view.alpha = lifting ? 0.32 : 1;
        a.holdPulse = lifting;
        const looking = this._inspectUid === p.villager.id;
        const s = looking
          ? statsOf(p.villager, p.evoStage, p.stars, this._state.villageMul, p.craft)
          : null;
        this._tag(
          s ? this._reachTag(p.villager.name, s.range) : p.villager.name,
          x,
          y,
          lifting || looking ? GOLD : LANE_TINT[p.villager.lane],
        );
      }
      this._reapActors(new Set(this._state.placed.map((p) => `pre:${p.villager.id}`)));
      return;
    }

    const live = new Set<string>();
    for (const f of this._state.team) {
      live.add(f.uid);
      const p = this._villagerXY(f);
      const a = this._actorFor(f);
      this._vitals.seed(f.uid, f.maxHp, 0);
      a.place(p.x, p.y, p.h);
      a.holdPulse = this._hurtFlash.has(f.uid);
      if (!f.alive) continue;
      this._hpTag(f, p.x, p.y, p.h);
    }
    this._reapActors(live);

    for (const e of this._state.foes) {
      const held = !e.alive && this._fx.holdingEnemy(e.id);
      if (!e.alive && !held) continue;
      let a = this._foeActors.get(e.id);
      if (!a) {
        a = new UnitActor();
        a.bindEnemy(e.def.id);
        this._unitLayer.addChild(a.view);
        this._foeActors.set(e.id, a);
      }
      this._vitals.seed(`e${e.id}`, e.maxHp, 0);
      if (e.alive) {
        const p = this._foeXY(e, frac);
        const haltAt = foeHaltPos(e, this._state.team);
        a.walkBob = e.stunMs <= 0 && (haltAt === undefined || e.pos < haltAt - 0.02);
        a.dazed = e.stunMs > 0;
        a.place(p.x, p.feetY, p.h);
        this._foeHp(e, p.x, p.feetY, p.h);
      } else {
        const ghost = this._ghostPos.get(e.id);
        if (ghost !== undefined) {
          this._lastFoeXY.set(e.id, this._foeAt(e, ghost));
          const haltAt = foeHaltPos(e, this._state.team);
          a.walkBob = e.stunMs <= 0 && (haltAt === undefined || ghost < haltAt - 0.02);
          a.dazed = e.stunMs > 0;
        }
        const pose = this._lastFoeXY.get(e.id);
        if (pose) {
          a.place(pose.x, pose.feetY, pose.h);
          this._foeHp(e, pose.x, pose.feetY, pose.h);
        }
      }
    }
    for (const [id, a] of [...this._foeActors]) {
      if (this._state.foes.some((e) => e.id === id && e.alive)) continue;
      // 还有弹体在飞向它就先留着摆在原地，否则「打到一个已经消失的东西」
      if (this._fx.holdingEnemy(id)) {
        const pose = this._lastFoeXY.get(id);
        if (pose) a.place(pose.x, pose.feetY, pose.h);
        continue;
      }
      a.destroy();
      this._foeActors.delete(id);
      this._prevPos.delete(id);
      this._shownPos.delete(id);
      this._ghostPos.delete(id);
      this._vitals.drop(`e${id}`);
    }

    // 深度排序：靠底线的画在上面，前后关系才对
    this._unitLayer.children.sort((a, b) => a.y - b.y);
  }

  /**
   * 布阵时点开谁，就在他对面那半边弹绝活卡。
   * 卡摆在另一侧，不挡他自己那一路的射程格。
   */
  private _syncCard(): void {
    const uid = this._draggingId() ? null : this._inspectUid;
    const p = uid ? this._state.placed.find((x) => x.villager.id === uid) : undefined;
    if (!p) {
      this._closeCard();
      return;
    }
    if (this._card?.name === p.villager.id) return;
    this._closeCard();
    const card = skillCard(p.villager, p.evoStage, p.stars);
    card.name = p.villager.id;
    const x = p.lane === 0 ? 750 - 16 - card.width : 16;
    const benchTop = this._lay.height - Game.safeBottom - BENCH_H;
    const y = Math.max(this._lay.top + 70, Math.min(benchTop - card.height - 12, this._standY(p.cell) - card.height - 40));
    card.position.set(x, y);
    this.container.addChildAt(card, this.container.getChildIndex(this._bench));
    this._card = card;
  }

  private _closeCard(): void {
    this._card?.destroy({ children: true });
    this._card = null;
  }

  private _reapActors(live: ReadonlySet<string>): void {
    for (const [uid, a] of [...this._villagerActors]) {
      if (live.has(uid)) continue;
      a.destroy();
      this._villagerActors.delete(uid);
    }
  }

  private _tag(name: string, x: number, feetY: number, tint: number): void {
    const t = label(14, 0xfff4c4, true);
    t.anchor.set(0.5);
    t.text = name;
    const w = Math.max(64, t.width + 18);
    const plate = new PIXI.Graphics();
    plate.beginFill(0x14100c, 0.78).drawRoundedRect(x - w / 2, feetY + 4, w, 20, 5).endFill();
    plate.lineStyle(1, tint, 0.35).drawRoundedRect(x - w / 2, feetY + 4, w, 20, 5).lineStyle(0);
    this._nameLayer.addChild(plate);
    t.position.set(x, feetY + 14);
    this._nameLayer.addChild(t);
  }

  /** 村民名字 + 血条。名字常驻是硬约束：场上得认得出脸（反目标第二条） */
  private _hpTag(f: Fighter, x: number, feetY: number, h: number): void {
    const g = new PIXI.Graphics();
    // 条走观战层的血，不走引擎的血：弹体还在飞的时候不许先掉
    const shown = this._vitals.shown(f.uid, { hp: f.hp, extra: 0 });
    const barW = Math.max(40, Math.round(h * 0.56));
    hpBar(g, x, feetY - h - 10, barW, shown.hp / f.maxHp, 0x86efac, 4);
    // 劲头条贴在血条下面。满了变金、跳一跳，手动模式下就是「该点我了」
    const full = skillReady(f);
    const ey = feetY - h - 4;
    g.beginFill(0x000000, 0.55).drawRect(x - barW / 2, ey, barW, 3).endFill();
    const glow = full ? 0.7 + 0.3 * Math.sin(this._pulseT * 9) : 0.9;
    g.beginFill(full ? 0xffe08a : 0xd9a441, glow)
      .drawRect(x - barW / 2, ey, barW * Math.min(1, f.energy / ENERGY_MAX), 3).endFill();
    if (full && !this._auto) {
      g.lineStyle(2, GOLD, glow).drawCircle(x, feetY - h - 26, 9).lineStyle(0);
      g.beginFill(GOLD, glow).drawCircle(x, feetY - h - 26, 4).endFill();
    }
    if (f.guardMs > 0) {
      g.lineStyle(5, 0x9ecbff, 0.95).drawEllipse(x, feetY - h * 0.48, h * 0.42, h * 0.62).lineStyle(0);
    }
    if (f.hasteMs > 0) {
      const bx = x + barW / 2 + 8;
      g.beginFill(0xffe08a, 0.95).drawPolygon([
        bx, feetY - h * 0.62,
        bx + 14, feetY - h * 0.48,
        bx, feetY - h * 0.34,
      ]).endFill();
      g.beginFill(0xffd66b, 0.95).drawPolygon([
        bx + 12, feetY - h * 0.62,
        bx + 26, feetY - h * 0.48,
        bx + 12, feetY - h * 0.34,
      ]).endFill();
    }
    this._nameLayer.addChild(g);
    if (f.guardMs > 0) this._pin('护住', x, feetY - h - 28, 0x9ecbff);
    if (f.hasteMs > 0) this._pin('手快', x + (f.guardMs > 0 ? 36 : 0), feetY - h - (f.guardMs > 0 ? 46 : 28), 0xffe08a);
    const t = label(13, f.alive ? 0xfff4c4 : 0x8a8a92, true);
    t.anchor.set(0.5);
    t.position.set(x, feetY + 6);
    t.text = this._inspectUid === f.uid
      ? this._reachTag(f.def.name, f.range)
      : f.def.name;
    this._nameLayer.addChild(t);
  }

  /** 绝活留下的字。钉住、护住这些要停在人身上，不能闪一下就没了 */
  private _pin(text: string, x: number, y: number, fill: number): void {
    const t = painted(20, fill, '#1a1008', 4);
    t.anchor.set(0.5, 1);
    t.position.set(x, y);
    t.text = text;
    this._nameLayer.addChild(t);
  }

  private _foeHp(e: Foe, x: number, feetY: number, h: number): void {
    const g = new PIXI.Graphics();
    const shown = this._vitals.shown(`e${e.id}`, { hp: e.alive ? e.maxHp : 0, extra: 0 });
    const w = e.boss ? Math.max(96, Math.round(h * 0.8)) : Math.max(32, Math.round(h * 0.5));
    hpBar(g, x, feetY - h - 8, w, shown.hp / e.maxHp, e.boss ? 0xff5a3a : 0xff8a6a, e.boss ? 8 : 4);
    if (e.alive && e.stunMs > 0) {
      g.lineStyle(4, 0xffe08a, 0.95).drawEllipse(x, feetY + 2, h * 0.46, 8).lineStyle(0);
      g.lineStyle(2, 0xfff6d0, 0.7).drawEllipse(x, feetY + 2, h * 0.28, 4).lineStyle(0);
    } else if (e.alive && e.slowMs > 0) {
      g.lineStyle(3, 0x86efac, 0.9).drawEllipse(x, feetY + 2, h * 0.4, 6).lineStyle(0);
    }
    this._nameLayer.addChild(g);
    if (e.alive && e.stunMs > 0) this._pin('钉住', x, feetY - h - (e.boss ? 40 : 28), 0xffe08a);
    else if (e.alive && e.slowMs > 0) this._pin('减速', x, feetY - h - (e.boss ? 40 : 28), 0x86efac);
    if (e.boss && e.alive) {
      const t = painted(16, 0xffb09a, '#1a1008', 3);
      t.anchor.set(0.5, 1);
      t.position.set(x, feetY - h - 14);
      t.text = '大个子';
      this._nameLayer.addChild(t);
    }
  }

  private _clearActors(): void {
    for (const a of this._villagerActors.values()) a.destroy();
    for (const a of this._foeActors.values()) a.destroy();
    this._villagerActors.clear();
    this._foeActors.clear();
    this._nameLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  /* ---------------- HUD ---------------- */

  private _buildHud(): void {
    this._hud.addChild(this._hudChrome);
    this._hudChrome.addChild(this._hudPlate);
    this._hudChrome.addChild(this._hudArt);
    this._stageName.anchor.set(0.5);
    this._hintText.anchor.set(0.5);
    this._hud.addChild(this._hudBits);
    this._hud.addChild(this._stageName);
    this._hud.addChild(this._hintText);
    this._hud.addChild(this._timeBar);
    this._guide.anchor.set(0.5);
    this._guide.visible = false;
    this._hud.addChild(this._guide);

    this._rebuildStripBtns();
    this._rebuildLeaveBtn();
    this._paintHudChrome();
    this._applyHudLayout();
  }

  private _rebuildStripBtns(): void {
    this._startBtn?.destroy({ children: true });
    this._backBtn?.destroy({ children: true });
    this._startBtn = this._makeStripBtn(560, 62, '开打', 'fight_btn', 30, 0x2a160c);
    this._backBtn = this._makeStripBtn(108, 56, '回路上', 'rust_btn', 18, 0xfff4c4);
    this.container.addChild(this._backBtn);
    this.container.addChild(this._startBtn);
  }

  private _makeStripBtn(
    w: number,
    h: number,
    text: string,
    art: 'fight_btn' | 'rust_btn' | 'settle_btn',
    size: number,
    ink: number,
  ): PIXI.Container {
    const box = new PIXI.Container();
    // 只负责画。点击走 _bindPlaceInput 的设计坐标矩形，不靠 Pixi hitTest
    box.eventMode = 'none';
    box.interactiveChildren = false;
    if (!fillSprite(box, uiTex(art), 0, 0, w, h) && !fitSprite(box, uiTex(art), 0, 0, w, h)) {
      const g = new PIXI.Graphics();
      if (art === 'fight_btn') goldBtn(g, -w / 2, -h / 2, w, h);
      else ironSlab(g, -w / 2, -h / 2, w, h, 10);
      box.addChild(g);
    }
    const t = label(size, ink, true);
    t.anchor.set(0.5);
    t.text = text;
    box.addChild(t);
    return box;
  }

  private _stripRect(which: 'back' | 'start'): { x: number; y: number; w: number; h: number } {
    const footer = benchFooterTop(this._lay.height - Game.safeBottom - BENCH_H);
    // 热区比牌子大一圈，手指不用钉在字上
    if (which === 'back') return { x: 12, y: footer + 4, w: 124, h: BENCH_FOOTER_H - 6 };
    return { x: 136, y: footer + 2, w: 602, h: BENCH_FOOTER_H - 4 };
  }

  private _inRect(
    p: { x: number; y: number },
    r: { x: number; y: number; w: number; h: number },
  ): boolean {
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  private _hitStrip(x: number, y: number): 'back' | 'start' | null {
    if (this._inRect({ x, y }, this._stripRect('start'))) return 'start';
    if (this._inRect({ x, y }, this._stripRect('back'))) return 'back';
    return null;
  }

  /**
   * 布阵手势不走 Pixi。
   *
   * 按下拎人、拖着影子、松手落格 —— 坐标一律用 canvas 设计坐标，
   * 底下那一截若再经 toLocal，真机经常和肉眼看到的牌子错开。
   */
  private _bindPlaceInput(): void {
    this._stripDetach?.();
    const canvas = getTouchCanvas();
    const onDown = (e: Event): void => this._onPlaceDown(e);
    const onMove = (e: Event): void => this._onPlaceMove(e);
    const onUp = (e: Event): void => this._onPlaceUp(e);
    const onCancel = (): void => this._onPlaceCancel();
    if (Platform.isMinigame) {
      canvas.addEventListener('touchstart', onDown, { passive: true });
      canvas.addEventListener('touchmove', onMove, { passive: false });
      canvas.addEventListener('touchend', onUp);
      canvas.addEventListener('touchcancel', onCancel);
      this._stripDetach = () => {
        canvas.removeEventListener('touchstart', onDown);
        canvas.removeEventListener('touchmove', onMove);
        canvas.removeEventListener('touchend', onUp);
        canvas.removeEventListener('touchcancel', onCancel);
      };
    } else {
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onCancel);
      this._stripDetach = () => {
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onCancel);
      };
    }
  }

  /**
   * 钉在左上角，跟微信/抖音「收起」胶囊同一条水平中线。
   * 高度跟着胶囊走，不要再压进锈铁门楣的左边框。
   */
  private _leaveBtnLay(): { cx: number; cy: number; w: number; h: number } {
    const capH = Math.max(32, Game.safeCapsuleBottom - Game.safeCapsuleTop);
    const h = capH;
    const w = Math.round(h * 2.05);
    // 再往右让开左边铁框和铆钉，别贴在门楣左缘
    const pad = 72;
    return { cx: pad + w / 2, cy: Game.safeHeaderCenterY, w, h };
  }

  /** 热区按设计坐标算。开打后点人走同一条 canvas 手势，不能再靠 Pixi hitTest */
  private _leaveRect(): { x: number; y: number; w: number; h: number } {
    const { cx, cy, w, h } = this._leaveBtnLay();
    return { x: cx - w / 2 - 14, y: cy - h / 2 - 14, w: w + 28, h: h + 28 };
  }

  private _rebuildLeaveBtn(): void {
    this._leaveBtn?.destroy({ children: true });
    const { w, h } = this._leaveBtnLay();
    const box = this._makeStripBtn(w, h, '撤', 'rust_btn', Math.max(16, Math.round(h * 0.48)), 0xfff4c4);
    box.eventMode = 'none';
    box.interactiveChildren = false;
    this.container.addChild(box);
    this._leaveBtn = box;
  }

  private _syncLeaveBtn(): void {
    if (!this._leaveBtn) return;
    const show = !this._placing()
      && this._state.phase === 'fighting'
      && !this._settle.visible
      && !this._revive.visible
      && !this._leaveAsk.visible
      && !this._settled;
    this._leaveBtn.visible = show;
    if (show) this.container.addChild(this._leaveBtn);
    this.container.addChild(this._leaveAsk);
  }

  private _askLeave(): void {
    if (this._settled || this._chromeBusy()) return;
    if (!this._placing() && this._state.phase !== 'fighting') return;
    this._clearHand();
    this._leaveAsk.show(this._lay.height, !this._placing());
    this._syncLeaveBtn();
    this.container.addChild(this._leaveAsk);
  }

  private _stayInBattle(): void {
    this._leaveAsk.hide();
    this._syncLeaveBtn();
  }

  /**
   * 布阵离开不算弃关：排法先存下来，再进来直接铺上。
   * 开打后再走：这局不算赢也不走结算，避免中途退出变成「算了不打还拿败场奖励」。
   */
  private _leaveBattle(): void {
    const placing = this._placing();
    if (placing && this._state.placed.length > 0) {
      saveLayout(this._state.placed.map((p): Slot => ({
        id: p.villager.id, lane: p.lane, cell: p.cell,
      })));
    }
    this._hideNoted = true;
    track('run_leave', {
      stage_id: this._state.stage.id,
      fighting: !placing,
      leaked: countedLeaks(this._state),
      wave: this._state.wave,
      play_ms: this._startedAt > 0 ? Date.now() - this._startedAt : 0,
    });
    this._leaveAsk.hide();
    SceneManager.switchTo('road');
  }

  /** 过关后先走到下一坑，再弹出布阵，不要直接重开一局 */
  private _nextOnRoad(): void {
    const from = this._state.stage.id;
    SceneManager.switchTo('road', { walkFrom: from, walkTo: from + 1 });
  }

  private _paintHudChrome(): void {
    this._hudPlate.clear();
    this._hudArt.removeChildren().forEach((c) => c.destroy());
    const { titleH } = this._lay.chrome;
    if (!fillSprite(this._hudArt, uiTex('battle_lintel'), 375, titleH / 2, 750, titleH)) {
      ironSlab(this._hudPlate, 0, 0, 750, titleH, 0);
    }
  }

  private _applyHudLayout(): void {
    this._computeLayout();
    this._paintHudChrome();
    const chrome = this._lay.chrome;
    this._stageName.style.fontSize = chrome.titleGlyphH;
    this._stageName.position.set(chrome.title.cx, chrome.title.cy);
    this._hintText.position.set(375, chrome.hintY);
    this._guide.position.set(375, this._lay.spawnY + 28);
    const benchY = this._lay.height - Game.safeBottom - BENCH_H;
    this._bench.place(benchY);
    const footer = benchFooterTop(benchY);
    if (this._backBtn) {
      this._backBtn.position.set(70, footer + BENCH_FOOTER_H / 2);
      this.container.addChild(this._backBtn);
    }
    if (this._startBtn) {
      this._startBtn.position.set(437, footer + BENCH_FOOTER_H / 2);
      this.container.addChild(this._startBtn);
    }
    if (this._leaveBtn) {
      const lay = this._leaveBtnLay();
      this._leaveBtn.position.set(lay.cx, lay.cy);
      this.container.addChild(this._leaveBtn);
    }
    this._tray.place(this._trayTop());
    this._rebuildTrayBtns();
    this._syncLeaveBtn();
    this._updateHud();
  }

  /** 绝活栏顶。按开打后的底线算，布阵时这条不显示 */
  private _trayTop(): number {
    return this._lay.height - Game.safeBottom - SKILL_TRAY_H;
  }

  private _rebuildTrayBtns(): void {
    this._speedBtn?.destroy({ children: true });
    this._autoBtn?.destroy({ children: true });
    const cy = trayRowY(this._trayTop());
    this._speedBtn = roundBtn(`×${this._speed}`, this._speed > 1);
    this._speedBtn.position.set(TRAY_SPEED_X, cy);
    this._autoBtn = roundBtn('自动', this._auto, this._auto ? 0x86efac : 0x5a4030);
    this._autoBtn.position.set(TRAY_AUTO_X, cy);
    const fighting = this._state.phase === 'fighting';
    this._speedBtn.visible = fighting;
    this._autoBtn.visible = fighting;
    this.container.addChildAt(this._speedBtn, this.container.getChildIndex(this._tray) + 1);
    this.container.addChildAt(this._autoBtn, this.container.getChildIndex(this._tray) + 1);
  }

  private _hitTrayBtn(p: { x: number; y: number }): 'speed' | 'auto' | null {
    const cy = trayRowY(this._trayTop());
    const r = TRAY_BTN_R + 16;
    const near = (cx: number): boolean => (p.x - cx) ** 2 + (p.y - cy) ** 2 <= r * r;
    if (near(TRAY_SPEED_X)) return 'speed';
    if (near(TRAY_AUTO_X)) return 'auto';
    return null;
  }

  private _toggleSpeed(): void {
    this._speed = this._speed > 1 ? 1 : 2;
    PersistService.writeRaw(SPEED_KEY, String(this._speed));
    playSfx('ui_tap', 0);
    this._rebuildTrayBtns();
  }

  /** 自动关掉以后劲头照攒，满了在栏里亮着等玩家点 */
  private _toggleAuto(): void {
    this._auto = !this._auto;
    this._state.autoSkill = this._auto;
    PersistService.writeRaw(AUTO_KEY, this._auto ? '1' : '0');
    playSfx('ui_tap', 0);
    this._say(this._auto ? '绝活自动放' : '绝活手动放：头像亮了就点');
    this._rebuildTrayBtns();
  }

  private _clearHudBits(): void {
    this._hudBits.removeChildren().forEach((c) => c.destroy({ children: true }));
  }

  /** 关卡号走漆字，关卡名没有贴图就手写。 */
  private _drawHudTitle(): boolean {
    const chrome = this._lay.chrome;
    const { label, name } = this._state.stage;
    const m = /^(\d+)-(\d+)$/.exec(label);
    if (!m) return false;
    const left = numGlyphs(Number(m[1]));
    const right = numGlyphs(Number(m[2]));
    const names = [...left, ...right];
    const texs = names.map((n) => uiTex(n));
    if (texs.some((t) => !t?.baseTexture.valid || t.width <= 1)) return false;
    const h = chrome.titleGlyphH;
    const gap = 5;
    const dashW = h * 0.28;
    const ws = texs.map((t) => (t!.width / t!.height) * h);
    const leftW = ws.slice(0, left.length).reduce((s, w) => s + w, 0)
      + gap * Math.max(0, left.length - 1);
    const rightW = ws.slice(left.length).reduce((s, w) => s + w, 0)
      + gap * Math.max(0, right.length - 1);
    const nm = painted(Math.round(h * 0.78), GOLD, '#1a1008', 4);
    nm.anchor.set(0.5);
    nm.text = name;
    const total = leftW + dashW + rightW + gap * 3 + nm.width;
    let x = chrome.title.cx - total / 2;
    const cy = chrome.title.cy;
    texs.slice(0, left.length).forEach((t, i) => {
      fitSprite(this._hudBits, t, x + ws[i]! / 2, cy, ws[i]!, h);
      x += ws[i]! + gap;
    });
    const dash = painted(Math.round(h * 0.7), GOLD, '#1a1008', 3);
    dash.anchor.set(0.5);
    dash.position.set(x + dashW / 2, cy);
    dash.text = '-';
    this._hudBits.addChild(dash);
    x += dashW + gap;
    texs.slice(left.length).forEach((t, i) => {
      const w = ws[left.length + i]!;
      fitSprite(this._hudBits, t, x + w / 2, cy, w, h);
      x += w + gap;
    });
    nm.position.set(x + gap + nm.width / 2, cy);
    this._hudBits.addChild(nm);
    return true;
  }

  private _drawHudStamps(): void {
    const chrome = this._lay.chrome;
    const s = this._state;
    const placing = this._placing();
    const cells: readonly {
      label: UiName;
      fallback: string;
      kind: 'frac' | 'zhi' | 'num';
      a: number;
      b?: number;
    }[] = placing
      ? [
        { label: 'paint_shangchang', fallback: '上场', kind: 'frac', a: s.placed.length, b: s.cap },
        { label: 'paint_lai', fallback: '来', kind: 'zhi', a: stageEnemyCount(s.stage) },
        { label: 'paint_bo', fallback: '波', kind: 'num', a: s.stage.waves.length },
      ]
      : [
        { label: 'paint_di', fallback: '第', kind: 'frac', a: Math.max(1, s.wave), b: s.stage.waves.length },
        { label: 'paint_lou', fallback: '漏', kind: 'frac', a: s.leaked, b: LEAK_ALLOW },
        { label: 'paint_changshang', fallback: '场上', kind: 'num', a: foesAlive(s) },
      ];
    const { w: sw, h: sh, y: sy, cxs } = chrome.stamp;
    cells.forEach((cell, i) => {
      const box = new PIXI.Container();
      box.eventMode = 'none';
      box.position.set(cxs[i] ?? 375, sy);
      this._hudBits.addChild(box);
      if (!fillSprite(box, uiTex('rust_stamp'), 0, 0, sw, sh)) {
        const g = new PIXI.Graphics();
        ironSlab(g, -sw / 2, -sh / 2, sw, sh, 9);
        box.addChild(g);
      }
      const nameY = -sh * 0.18;
      const numY = sh * 0.22;
      const nameH = Math.round(sh * 0.34);
      const numH = Math.round(sh * 0.38);
      if (!paintGlyphs(box, [cell.label], 0, nameY, nameH, 2)) {
        const t = painted(Math.round(nameH), GOLD, '#1a1008', 3);
        t.anchor.set(0.5);
        t.position.set(0, nameY);
        t.text = cell.fallback;
        box.addChild(t);
      }
      let ok = false;
      if (cell.kind === 'frac') ok = paintFrac(box, cell.a, cell.b ?? 0, 0, numY, numH);
      else if (cell.kind === 'zhi') {
        ok = paintGlyphs(box, [...numGlyphs(cell.a), 'paint_zhi'], 0, numY, numH, 2);
      } else {
        ok = paintGlyphs(box, numGlyphs(cell.a), 0, numY, numH, 2);
      }
      if (!ok) {
        const t = painted(Math.round(numH * 0.9), GOLD, '#1a1008', 3);
        t.anchor.set(0.5);
        t.position.set(0, numY);
        if (cell.kind === 'frac') t.text = `${cell.a}/${cell.b ?? 0}`;
        else if (cell.kind === 'zhi') t.text = `${cell.a}只`;
        else t.text = String(cell.a);
        box.addChild(t);
      }
    });
  }

  private _drawHudHint(): boolean {
    if (!this._placing()) return true;
    const chrome = this._lay.chrome;
    const lane = LANE_NAME[this._state.stage.mainLane] ?? '';
    const h = 18;
    const menlu = uiTex('paint_menlu');
    const name = painted(16, GOLD, '#1a1008', 3);
    name.anchor.set(0.5);
    name.text = lane;
    if (!menlu?.baseTexture.valid || menlu.width <= 1) return false;
    const w = (menlu.width / menlu.height) * h;
    const total = w + 8 + name.width;
    const x0 = 375 - total / 2;
    fitSprite(this._hudBits, menlu, x0 + w / 2, chrome.hintY, w, h);
    name.position.set(x0 + w + 8 + name.width / 2, chrome.hintY);
    this._hudBits.addChild(name);
    return true;
  }

  private _updateHud(): void {
    this._syncLeaveBtn();
    const s = this._state;
    const chrome = this._lay.chrome;
    this._clearHudBits();
    this._stageName.text = `${s.stage.label} ${s.stage.name}`;
    this._stageName.visible = !this._drawHudTitle();
    this._drawHudStamps();

    if (this._placing()) {
      this._hintText.text = `敌方门路：${LANE_NAME[s.stage.mainLane]}`;
      this._hintText.visible = !this._drawHudHint();
      this._timeBar.clear();
      return;
    }

    this._hintText.visible = false;
    // 超时只是兜底，细线贴在顶板下沿，不占一块经验槽
    const frac = Math.min(1, battleClockMs(s) / s.stage.timeLimitMs);
    this._timeBar.clear();
    const y = chrome.barBottom - 8;
    this._timeBar.beginFill(0x000000, 0.35)
      .drawRoundedRect(90, y, 570, 4, 2).endFill();
    this._timeBar.beginFill(frac > 0.85 ? 0xff7a5a : GOLD, 0.9)
      .drawRoundedRect(90, y, 570 * (1 - frac), 4, 2).endFill();
  }

  private _say(msg: string, life = 2.4): void {
    this._guideHold = false;
    this._guide.text = msg;
    this._guide.visible = true;
    this._guide.alpha = 1;
    this._guideLife = life;
  }

  /** 留到第一波走完。中途有更急的话（要漏了）会用 _say 把它换掉 */
  private _sayHeld(msg: string): void {
    this._guideHold = true;
    this._guide.text = msg;
    this._guide.visible = true;
    this._guide.alpha = 1;
    this._guideLife = 1;
  }

  private _sayOpening(
    chapter: number,
    index: number,
    pitch: string,
    label: string,
    name: string,
    mainLane: keyof typeof LANE_NAME,
  ): void {
    if (chapter === 1 && index === 1) {
      this._sayHeld('别让它们从这条路走到底');
      return;
    }
    if (this._placeGuide) {
      this._sayHeld(this._placeGuide.say);
      return;
    }
    if (chapter === 1 && index === 2) {
      this._say('想换位就拖一拖', 4);
      return;
    }
    if (chapter === 1 && index === 5 && this._craftStep() === 'stall') {
      this._sayHeld('这关要先升手艺。回村打摊，破电视出零件');
      return;
    }
    if (chapter === 1 && index === 5 && this._craftStep() === 'craft') {
      this._sayHeld('这关要先升手艺。回村点人，升一级');
      return;
    }
    if (chapter === 1 && index >= 4 && this._craftStillGreen() && villageGateOpen(this._mem.stageTop)) {
      this._say('打不过就回村，弹子和手艺都能变强', 4);
      return;
    }
    if (chapter === 1) {
      this._say(pitch, 4);
      return;
    }
    this._say(`${label} ${name} · 来的是「${LANE_NAME[mainLane]}」 · 把人拖上路`);
  }

  private _noteHide(): void {
    if (this._hideNoted || this._settled || this._state.phase !== 'fighting') return;
    this._hideNoted = true;
    track('run_leave', {
      stage_id: this._state.stage.id,
      fighting: true,
      leaked: countedLeaks(this._state),
      wave: this._state.wave,
      play_ms: this._startedAt > 0 ? Date.now() - this._startedAt : 0,
      reason: 'hide',
    });
  }

  private _tickGuide(dt: number): void {
    if (!this._guide.visible) return;
    if (this._guideHold) {
      this._guide.alpha = 1;
      return;
    }
    this._guideLife -= dt;
    if (this._guideLife <= 0) this._guide.visible = false;
    else this._guide.alpha = Math.min(1, this._guideLife / 0.5);
  }

  /* ---------------- 结束 / 广告 ---------------- */

  private _endRun(): void {
    if (this._settled || this._revive.visible) return;
    const s = this._state;

    /*
     * 复活广告只卖「漏了那一下重来」。
     *
     * 超时不卖：那是「清不完」，站起来再打还是清不完，卖了等于骗。
     * §4.4 也据此要求漏怪必须是失败局的多数 —— 模拟器实测超时占 0~10%，
     * 要是哪天涨到三成以上，先回去看曲线，不是在这儿放宽条件。
     */
    if (s.phase === 'lost' && reviveCanContinue(s) && adCanShow('revive')) {
      this._leaveAsk.hide();
      this._syncLeaveBtn();
      this._revive.show(s.team, s.leaked, adRemaining('revive'), this._lay.height);
      track('ad_offer', { placement: 'revive', stage_id: s.stage.id });
      return;
    }
    this._openSettle();
  }

  private async _watchAd(placement: 'revive' | 'settleDouble' | 'loseBonus'): Promise<boolean> {
    track('ad_show', { placement, stage_id: this._state.stage.id });
    const ok = await Platform.showRewardedVideo(rewardedAdUnitId(placement, Platform.name));
    track('ad_close', {
      placement, stage_id: this._state.stage.id, completed: ok, result: Platform.lastAdResult,
    });
    if (!ok && Platform.lastAdResult === 'error') Platform.showToast('广告没拉到，稍后再试');
    return ok;
  }

  private async _acceptRevive(): Promise<void> {
    const ok = await this._watchAd('revive');
    if (!ok) {
      // 广告没看完就留在弹窗上。直接掉进结算会让人以为「点了没反应」
      this._revive.unlock();
      if (Platform.lastAdResult === 'closed') Platform.showToast('没看完，挡不住');
      return;
    }
    adRecord('revive');
    if (!reviveAfterLeak(this._state)) {
      this._revive.hide();
      this._openSettle();
      return;
    }
    this._vitals.reset();
    for (const f of this._state.team) {
      this._vitals.seed(f.uid, f.hp, 0, true);
      // 倒下时立绘被藏起来。续命不发 villagerUp，不在这里扶，人就只剩名字
      if (f.alive) this._actorFor(f).setDead(false);
    }
    for (const e of this._state.foes) {
      if (e.alive) this._vitals.seed(`e${e.id}`, e.hp, 0, true);
    }
    this._revive.hide();
    this._syncLeaveBtn();
    this._consumeEvents();
    this._updateHud();
    playSfx('get_up', 0);
    this._say('缓过来了，接着挡');
  }

  private _giveUpRevive(): void {
    this._revive.hide();
    this._openSettle();
  }

  private _settleGot: { pellets: number; scrap: number } = { pellets: 0, scrap: 0 };
  private _settleAd: { pellets: number; scrap: number } = { pellets: 0, scrap: 0 };

  private _openSettle(): void {
    if (this._settled) return;
    this._settled = true;
    this._leaveAsk.hide();
    this._syncLeaveBtn();
    const s = this._state;
    const won = s.phase === 'won';

    const res = settleStage(s.stage.id, won, s.stars);
    this._mem = res.mem;
    this._settleGot = { pellets: res.pellets, scrap: res.scrap };
    const ch1 = s.stage.chapter === 1;
    const footer = won
      ? winFooter(s.stage.chapter, s.stage.index, {
        needCall: needOpeningCall(this._mem.stageTop, this._mem.callCount, this._mem.roster),
        craftReady: this._craftStep() === 'craft',
      })
      : undefined;
    const back = res.joined ? `${getVillager(res.joined).name}听说村口守住了，回来了\n` : '';
    const gift = res.parts > 0
      ? `${back}外星人身上拆下 ${res.parts} 个零件，够升一级手艺`
      : footer === 'call' ? '村里听见动静，有人想来帮忙' : (back.trim() || undefined);

    track('run_end', {
      stage_id: s.stage.id,
      won,
      stars: s.stars,
      leaked: countedLeaks(s),
      lose_reason: s.loseReason ?? '',
      elapsed_ms: s.elapsedMs,
      play_ms: this._startedAt > 0 ? Date.now() - this._startedAt : 0,
    });
    playSfx(won ? 'win' : 'lose', 0);

    const next = won ? getStage(s.stage.id + 1) : undefined;
    // 开局三关不摆广告：新人点进去看完视频，多半就不回来了
    const opening = ch1 && s.stage.index <= 3;
    const placement = won ? 'settleDouble' : 'loseBonus';
    const canDouble = won
      ? !(opening && res.first) && adCanShow('settleDouble')
      : !opening && adCanShow('loseBonus');
    const k = yieldMul(this._mem.villageLv);
    this._settleAd = won
      ? { pellets: res.pellets > 0 ? res.pellets : SETTLE_AD_PELLETS, scrap: res.scrap }
      : { pellets: LOSE_AD_PELLETS, scrap: Math.round(LOSE_AD_SCRAP * k) };
    if (canDouble) {
      track('ad_offer', { placement, stage_id: s.stage.id });
      Platform.preloadRewardedVideo(rewardedAdUnitId(placement, Platform.name));
    }
    this._settle.show(s, this._mem, this._lay.height, {
      earned: res.scrap,
      scrap: this._mem.scrap,
      pellets: res.pellets,
      loseReason: won ? undefined : s.loseReason,
      identity: won ? this._winLine() : undefined,
      nextMove: won ? undefined : this._loseHint(),
      nextStageLabel: next && next.id !== s.stage.id ? next.label : undefined,
      canDouble,
      adPellets: this._settleAd.pellets,
      adScrap: this._settleAd.scrap,
      footer,
      guideHome: !won && ch1 && s.stage.index === 5 && this._craftStep() !== 'done',
      gift,
      pace: ch1 && s.stage.index <= 3 ? 0.55 : 1,
      autoNextSec: won && res.first && ch1 && footer === 'push' ? 3 : undefined,
    });
  }

  /**
   * 不花工分的那一嗓子（见 opening.OPENING_CALL_ID）。喇叭声、揭晓牌和村里喊人是同一套，
   * 点「好」之后再走 then。已经喊过就直接走 then。
   */
  private _runOpeningCall(then: () => void): void {
    const res = openingCall();
    if (!res) {
      then();
      return;
    }
    this._mem = res.mem;
    track('call_villager', {
      got: res.got, is_new: true, roster: res.mem.roster.length, free: true,
    });
    void ensureAssets(heroStillArt({ id: res.got, evo: 1 })).catch(() => { /* 牌子会等图 */ });
    BgmPlayer.duck(true);
    playSfx('shout', 0);
    this.container.addChild(this._reveal);
    this._reveal.open({
      got: res.got,
      isNew: true,
      rosterN: res.mem.roster.length,
      progress: progressOf(res.mem),
      height: this._lay.height,
      onDone: () => {
        BgmPlayer.duck(false);
        then();
      },
    });
  }

  /** 赢了那一句。说的是「这一关是怎么过的」，不是伤害统计 */
  private _winLine(): string {
    const s = this._state;
    const leaked = countedLeaks(s);
    const fallen = s.team.filter((f) => !f.alive).length;
    const wiped = s.team.length > 0 && fallen === s.team.length;
    if (wiped) return leaked > 0 ? `人倒光了，漏了 ${leaked} 个` : '人倒光了，线倒是没断';
    if (s.stars === 3) return '一个没漏，清得也快';
    if (leaked > 0) return `漏了 ${leaked} 个，还是顶住了`;
    return fallen > 0 ? `倒了 ${fallen} 个，线没断` : '清干净了，就是慢了点';
  }

  /** 三个人都还是手艺 1，回村那句才有用 */
  private _craftStillGreen(): boolean {
    return this._mem.roster.every((id) => (this._mem.craft[id] ?? 1) <= 1);
  }

  /** 1-5 没过时，下一手是打摊还是点人 */
  private _craftStep(): CraftStep {
    const maxCraft = this._mem.roster.reduce((m, id) => Math.max(m, this._mem.craft[id] ?? 1), 1);
    return chapter1CraftStep(
      this._mem.stageTop,
      (this._mem.stageStars[5] ?? 0) > 0,
      maxCraft,
      this._mem.parts,
    );
  }

  /**
   * 输了给的下一手。**必须指向布阵或养成，不许说「再试一次」。**
   *
   * §4.4 的聪明感时刻要求玩家卡关后想的是「换人 / 换站位 / 喂大主力」，
   * 而不是「回去刷村庄等级」。这句话是唯一能推他一把的地方。
   */
  private _loseHint(): string {
    const s = this._state;
    if (s.stage.chapter === 1 && s.stage.index === 5 && this._craftStep() !== 'done') {
      return this._craftStep() === 'craft'
        ? '这关手艺 1 打不过\n回村点人，升一级再来'
        : '这关手艺 1 打不过\n回村打摊，破电视拿零件';
    }
    if (s.loseReason === 'wipe') {
      return villageGateOpen(this._mem.stageTop)
        ? '人倒光了。回村打弹子、升手艺再来'
        : '人倒光了，换个站法再挡一次';
    }
    if (s.loseReason === 'timeout') {
      return '挡住了但清不完，换两个「打」上来';
    }
    // 哪一路漏得最多就点那一路：失败原因必须落到具体一路上
    const byLane = new Array<number>(LANE_COUNT).fill(0);
    for (const w of s.stage.waves) {
      for (const g of w.groups) byLane[g.lane % LANE_COUNT]! += g.count;
    }
    const mine = new Array<number>(LANE_COUNT).fill(0);
    for (const f of s.team) mine[f.lane]! += 1;
    let worst = -1;
    let worstRatio = -1;
    for (let l = 0; l < LANE_COUNT; l += 1) {
      if (byLane[l]! <= 0) continue;
      const ratio = byLane[l]! / (mine[l]! + 1);
      if (ratio > worstRatio) { worstRatio = ratio; worst = l; }
    }
    if (worst < 0) return '换个排法试试';
    const name = '左中右'[worst] ?? '中';
    return mine[worst]! === 0
      ? `${name}路一个人都没有，先补上`
      : `${name}路人太少，加厚一格`;
  }

  /** 赢了是「这关再拿一份」，输了是补给。数额在开结算时就定好，按钮上写的就是给的 */
  private async _doubleSettle(): Promise<boolean> {
    const placement = this._state.phase === 'won' ? 'settleDouble' : 'loseBonus';
    if (!adCanShow(placement)) return false;
    const ok = await this._watchAd(placement);
    if (!ok) return false;
    adRecord(placement);
    const add = this._settleAd;
    this._mem = grantLoot(add);
    this._settleGot.pellets += add.pellets;
    this._settleGot.scrap += add.scrap;
    return true;
  }

  private _restart(stageId: number): void {
    SceneManager.switchTo('battle', { stageId });
  }

  /* ---------------- GM ---------------- */

  private _gmWin(): string {
    if (this._state.phase !== 'fighting') return '还没开打';
    gmWin(this._state);
    return `${this._state.stage.label} 判赢`;
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
    t.text = '直接过关';
    box.addChild(g, t);
    box.position.set(
      Math.min(734, Math.max(Game.contentRightX(8), 700)) - w,
      this._lay.chrome.barBottom + 8,
    );
    bindPointerTap(box, () => Platform.showToast(this._gmWin(), 'none'));
    this.container.addChildAt(box, this.container.getChildIndex(this._settle));
    this._gmSkip = box;
    this.container.addChild(this._leaveAsk);
  }
}
