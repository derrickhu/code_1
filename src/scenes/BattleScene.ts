/**
 * 战斗场景：3 路 × 4 格的分路自动塔防。
 *
 * 渲染层不含任何战斗规则，只读 BattleEngine 的状态。规则改动一律回引擎。
 * 贴图缺失时退回色块，不挡玩。
 *
 * 画面的三条硬规矩（docs/00-体验目标.md §4.4 / 反目标）：
 *
 * 1. **格子只在自家那 12 格上画，上方空场不画。** 空场是舞台，敌人走进来才开打。
 *    上一版这条是「一个格子都不许画」（怕被认成塔防），本版承认塔防定位，
 *    格子成了主决策的载体 —— 但空场那条留着，它管的是「战斗有没有舞台感」。
 * 2. **底线必须画出来，而且要画得像一条线。** 漏怪是唯一的判负条件，
 *    玩家得随时看得见「再漏几个就完了」。上一版刻意没有底线血条，
 *    因为那会让人第一眼认成塔防；这一版反过来，看不见底线才是 bug。
 * 3. **不给「推荐阵容一键上」。** §4.4 明确列为不做 —— 它会把主体验的决策整个替掉。
 *    开局铺的是**玩家上一关自己的排法**（存档里的 layout），不是算出来的最优解；
 *    只有全新存档才用一次 autoPlace 兜底，免得新手第一眼看到 12 个空格子。
 */

import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import { BgmPlayer } from '@/core/BgmPlayer';
import { GMManager } from '@/core/GMManager';
import { SceneManager, type Scene } from '@/core/SceneManager';
import { bindPointerTap } from '@/minigame';
import {
  CELL_COUNT, GOAL_POS, LANE_COUNT, LANE_W, LEAK_ALLOW, TICK_MS,
  cellHitBox, cellPos, cellScreenH, cellScreenY, laneScreenX,
  posScreenY, villagerSpriteH,
} from '@/balance/combat';
import { getStage, stageEnemyCount } from '@/balance/stages';
import { resolveAttackFx, resolveEnemyFx, resolveFxSkin } from '@/balance/fx';
import { LANE_NAME, ROLE_NAME, getVillager, statsOf } from '@/balance/villagers';
import { BENCH_GAP, BENCH_H, BenchDock, LANE_TINT, type BenchItem } from '@/ui/BenchDock';
import { ReviveOverlay } from '@/ui/ReviveOverlay';
import { SettleOverlay } from '@/ui/SettleOverlay';
import { CombatFx } from '@/fx/CombatFx';
import { VisualVitals } from '@/fx/VisualVitals';
import { motionFor, UnitActor } from '@/fx/UnitActor';
import { bgTex, fillCover, preloadBattleArt, uiTex, watchArt } from '@/core/TextureLoader';
import { playSfx } from '@/core/SfxPlayer';
import { track } from '@/core/Analytics';
import {
  addScrap, capOf, loadMemory, progressOf, saveLayout, settleStage,
  type RunMemory, type Slot,
} from '@/core/RunMemory';
import { evoOf, starsOf, villageMul } from '@/balance/village';
import { Platform } from '@/core/PlatformService';
import {
  adCanShow, adMarkRunStart, adRecord, adRemaining, type AdPlacement,
} from '@/core/AdDay';
import { GOLD, fitSprite, hpBar, label, plate, queuePad, rangeArea } from '@/ui/paint';
import {
  autoPlace, createBattle, foesAlive, gmWin, placeAt, placedOf, removeAt,
  reviveAfterLeak, startFight, tick,
  type BattleState, type Candidate, type Fighter, type Foe, type Placement,
} from '@/game/BattleEngine';

/** 局内顶栏：安全区下的内容高度（关卡一行 + 波次/漏怪一行 + 底推进） */
const HUD_PLATE_H = 104;

function enemyH(e: Foe): number {
  if (e.def.id === 'armor') return 96;
  if (e.def.id === 'canister') return 82;
  if (e.def.id === 'grunt') return 58;
  if (e.def.id === 'saucer') return 66;
  return 70;
}

/**
 * 同一路上的两个人横向错开一点，别叠成一根柱子。
 *
 * 只错开 ±18px：错太多会跑到隔壁路上去，「哪一路要崩」就看不出来了。
 */
function jitterX(lane: number, cell: number): number {
  return laneScreenX(lane) + ((cell % 2 === 0 ? -1 : 1) * 18);
}

export class BattleScene implements Scene {
  readonly name = 'battle';
  readonly container = new PIXI.Container();

  private _state: BattleState = createBattle(getStage(1), [], 3);
  private _mem: RunMemory = loadMemory();
  private _accMs = 0;

  private readonly _field = new PIXI.Graphics();
  private readonly _unitLayer = new PIXI.Container();
  private readonly _villagerActors = new Map<string, UnitActor>();
  private readonly _foeActors = new Map<number, UnitActor>();
  private readonly _nameLayer = new PIXI.Container();
  private readonly _hudChrome = new PIXI.Container();
  private readonly _hudPlate = new PIXI.Graphics();
  private readonly _hud = new PIXI.Container();
  /** 布阵阶段的格子热区。开打后关掉 */
  private readonly _cellHits: PIXI.Container[] = [];
  private readonly _bench = new BenchDock((id) => this._tapBench(id));

  private readonly _settle = new SettleOverlay(
    () => this._restart(this._state.stage.id),
    () => this._doubleSettle(),
    () => SceneManager.switchTo('village'),
    () => this._restart(this._state.stage.id + 1),
  );
  private readonly _revive = new ReviveOverlay(
    () => { void this._acceptRevive(); },
    () => this._giveUpRevive(),
  );
  private readonly _fx = new CombatFx();
  private readonly _vitals = new VisualVitals();

  private readonly _stageName = label(24, GOLD, true);
  private readonly _waveText = label(34, 0xfff4c4, true);
  private readonly _leakText = label(26, 0xff9a8a, true);
  private readonly _hintText = label(17, GOLD, true);
  private readonly _timeBar = new PIXI.Graphics();
  private readonly _guide = label(26, 0xffd66b, true);
  private _startBtn: PIXI.Container | null = null;
  private _gmSkip: PIXI.Container | null = null;

  private _guideLife = 0;
  private _settled = false;
  private _waveTold = 0;
  private _startedAt = 0;

  /** 上一逻辑帧的轴坐标，用来在 100ms 步长之间把走路插成滑步 */
  private readonly _prevPos = new Map<number, number>();
  private readonly _hitFlash = new Map<number, number>();
  private readonly _hurtFlash = new Map<string, number>();
  private readonly _lastFoeXY = new Map<number, { x: number; y: number; feetY: number; h: number }>();

  /**
   * 布局按实际屏幕算，不能写死 1334。
   * 设计稿是 750×1334，但 Game 按宽度等比缩放，长屏机型的可用高度会明显更大。
   */
  private _lay = {
    top: 96,
    /** 敌人出场那条线（轴上的 pos 0） */
    spawnY: 250,
    /** 底线（轴上的 GOAL_POS）。敌人走过这里就是漏怪 */
    goalY: 1000,
    height: 1334,
  };

  constructor() {
    this.container.addChild(this._field);
    this.container.addChild(this._unitLayer);
    this.container.addChild(this._nameLayer);
    this.container.addChild(this._fx.layer);
    this.container.addChild(this._hud);
    this._computeLayout();
    this._buildCellHits();
    this.container.addChild(this._bench);
    this.container.addChild(this._revive);
    this.container.addChild(this._settle);
    this._buildHud();
    watchArt(() => {
      this._paintHudChrome();
      for (const [uid, a] of this._villagerActors) {
        const f = this._state.team.find((x) => x.uid === uid);
        if (f) a.bindHero(f.def.id, f.def.lane, f.evoStage);
      }
      for (const e of this._state.foes) this._foeActors.get(e.id)?.bindEnemy(e.def.id);
    });
  }

  /* ---------------- 生命周期 ---------------- */

  onEnter(data?: unknown): void {
    preloadBattleArt();
    this._computeLayout();
    this._applyHudLayout();
    this._settle.hide();
    this._revive.hide();
    this._fx.reset();
    this._clearActors();

    this._mem = loadMemory();
    const stageId = data && typeof data === 'object' && 'stageId' in data
      ? (data as { stageId: number }).stageId
      : this._mem.stageId;
    const stage = getStage(stageId);

    const bench = this._benchOf(this._mem);
    const cap = capOf(this._mem);
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
    this._guide.visible = false;
    this._prevPos.clear();
    this._hitFlash.clear();
    this._hurtFlash.clear();
    this._lastFoeXY.clear();
    this._vitals.reset();
    this._bench.select(null);

    this._renderBench();
    this._syncPhaseUi();
    this._mountGmSkip();
    GMManager.registerInstantClear(() => this._gmWin());
    BgmPlayer.play('battle');
    // 开战前那一屏要说清「这一关敌人是什么门路」。§4.4：给提示，不给答案
    this._say(`${stage.label} ${stage.name} · 来的是「${LANE_NAME[stage.mainLane]}」`);
  }

  onExit(): void {
    GMManager.unregisterInstantClear();
    this._gmSkip?.destroy({ children: true });
    this._gmSkip = null;
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
        out.push({ villager: getVillager(id), evoStage: evoOf(p, id), stars: starsOf(p, id) });
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
    if (mem.layout.length === 0) return autoPlace(bench, stage, cap);
    const byId = new Map(bench.map((c) => [c.villager.id, c]));
    const out: Placement[] = [];
    for (const s of mem.layout) {
      const c = byId.get(s.id);
      if (!c || out.length >= cap) continue;
      out.push({
        villager: c.villager, lane: s.lane, cell: s.cell,
        evoStage: c.evoStage, stars: c.stars,
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
      placed: placedOf(this._state, c.villager.id) !== undefined,
    }));
    this._bench.renderList(items);
  }

  private _tapBench(id: string): void {
    if (!this._placing()) return;
    const on = placedOf(this._state, id);
    if (on) {
      // 已经在场上：点一下撤下来。省掉一个「撤下」按钮
      removeAt(this._state, on.lane, on.cell);
      this._bench.select(null);
      playSfx('ui_tap', 0);
      this._afterPlaceChange();
      return;
    }
    this._bench.select(this._bench.selected === id ? null : id);
    playSfx('ui_tap', 0);
    this._renderBench();
  }

  private _tapCell(lane: number, cell: number): void {
    if (!this._placing()) return;
    const sitting = this._state.placed.find((p) => p.lane === lane && p.cell === cell);
    const picked = this._bench.selected;

    if (!picked) {
      // 没选人时点格子 = 把这一格的人撤下来
      if (sitting && removeAt(this._state, lane, cell)) {
        playSfx('ui_tap', 0);
        this._afterPlaceChange();
      }
      return;
    }

    if (!placeAt(this._state, picked, lane, cell)) {
      Platform.showToast(
        this._state.placed.length >= this._state.cap
          ? `这一关只能上 ${this._state.cap} 个，先撤一个`
          : '放不下',
      );
      return;
    }
    this._bench.select(null);
    playSfx('install_on', 0);
    this._afterPlaceChange();
  }

  private _afterPlaceChange(): void {
    // 「玩家到底会不会重排」是这一版最关键的未知，所以每一笔都记
    track('place_change', {
      stage_id: this._state.stage.id,
      placed: this._state.placed.length,
      lanes: this._state.placed.map((p) => p.lane),
    });
    this._renderBench();
    this._drawField();
    this._drawUnits();
    this._updateHud();
  }

  private _beginFight(): void {
    if (!this._placing()) return;
    if (this._state.placed.length === 0) {
      Platform.showToast('先放几个人上去');
      return;
    }
    // 记下这一次的排法。下一关直接铺上，玩家不用每关从零摆
    saveLayout(this._state.placed.map((p): Slot => ({
      id: p.villager.id, lane: p.lane, cell: p.cell,
    })));
    startFight(this._state);
    this._startedAt = Date.now();
    adMarkRunStart();
    track('run_start', {
      stage_id: this._state.stage.id,
      village_lv: this._mem.villageLv,
      squad: this._state.team.map((f) => f.def.id),
      lanes: this._state.team.map((f) => f.lane),
    });
    this._syncPhaseUi();
    this._fx.markLand(laneScreenX(1), this._lay.goalY);
    playSfx('hero_land', 0);
    this._say('开打');
  }

  /** 布阵和开打两套 UI 的开关集中在这儿，别散到各处去 */
  private _syncPhaseUi(): void {
    const placing = this._placing();
    this._bench.visible = placing;
    if (this._startBtn) this._startBtn.visible = placing;
    for (const hit of this._cellHits) hit.eventMode = placing ? 'static' : 'none';
    this._drawField();
    this._drawUnits();
    this._updateHud();
  }

  /* ---------------- 主循环 ---------------- */

  update(dt: number): void {
    if (this._settle.visible || this._revive.visible) {
      this._fx.update(dt);
      return;
    }

    if (this._state.phase === 'fighting') {
      this._accMs += dt * 1000;
      while (this._accMs >= TICK_MS && this._state.phase === 'fighting') {
        this._accMs -= TICK_MS;
        for (const e of this._state.foes) {
          if (e.alive) this._prevPos.set(e.id, e.pos);
        }
        this._state.events.length = 0;
        tick(this._state);
        this._consumeEvents();
      }
    }

    this._fx.update(dt);
    this._tickFlash(dt);
    this._tickGuide(dt);
    this._drawField();
    this._drawUnits(this._accMs / TICK_MS);
    this._updateHud();

    for (const a of this._villagerActors.values()) a.update(dt);
    for (const a of this._foeActors.values()) a.update(dt);

    if (this._state.phase === 'won' || this._state.phase === 'lost') this._endRun();
  }

  private _tickFlash(dt: number): void {
    for (const [k, v] of this._hitFlash) {
      const n = v - dt;
      if (n <= 0) this._hitFlash.delete(k);
      else this._hitFlash.set(k, n);
    }
    for (const [k, v] of this._hurtFlash) {
      const n = v - dt;
      if (n <= 0) this._hurtFlash.delete(k);
      else this._hurtFlash.set(k, n);
    }
  }

  /* ---------------- 事件 → 特效 ---------------- */

  private _consumeEvents(): void {
    for (const ev of this._state.events) {
      if (ev.kind === 'waveStart') {
        if (ev.wave > this._waveTold) {
          this._waveTold = ev.wave;
          playSfx('wave_in', 0);
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
        this._actorFor(f).playAttack(ep.x, ep.y, motionFor(fx));
        this._fx.consume(ev, {
          hx: hp.x, hy: hp.y - hp.h * 0.5,
          ex: ep.x, ey: ep.y - ep.h * 0.5,
          color: LANE_TINT[f.def.lane],
          fx,
          skin: resolveFxSkin(f.def, f.evoStage),
          melee: f.range <= 1,
          enemyId: ev.foeId,
          slowed: f.def.role === 'block' && !ev.killed,
          onLand: () => {
            this._hitFlash.set(ev.foeId, 0.12);
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
        this._fx.releaseEnemy(ev.foeId);
        this._fx.consume(ev, { ex: p.x, ey: p.y - p.h * 0.5, enemyId: ev.foeId });
        this._foeActors.get(ev.foeId)?.killOff();
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
    const height = Game.designHeight;
    const top = Math.max(Game.safeTop, 24);
    const benchTop = height - Game.safeBottom - BENCH_H;
    const goalY = benchTop - BENCH_GAP;
    // 空场至少给 GOAL_POS 的三成高：舞台被压掉就看不出「走进来」这件事
    const spawnY = Math.max(top + HUD_PLATE_H + 40, goalY - (goalY - top) * 0.94);
    this._lay = { top, spawnY, goalY, height };
  }

  private _villagerXY(f: Fighter): { x: number; y: number; h: number } {
    return {
      x: jitterX(f.lane, f.cell),
      y: cellScreenY(f.cell, this._lay.spawnY, this._lay.goalY),
      h: villagerSpriteH(f.maxHp),
    };
  }

  private _foeXY(e: Foe, frac = 0): { x: number; y: number; feetY: number; h: number } {
    const prev = this._prevPos.get(e.id) ?? e.pos;
    const pos = prev + (e.pos - prev) * Math.max(0, Math.min(1, frac));
    const y = posScreenY(pos, this._lay.spawnY, this._lay.goalY);
    // 同一路上的怪按 id 微微错开，不然一队铁罐会叠成一个
    const x = laneScreenX(e.lane) + (((e.id * 37) % 5) - 2) * 14;
    const p = { x, y, feetY: y, h: enemyH(e) };
    this._lastFoeXY.set(e.id, p);
    return p;
  }

  /* ---------------- 画战场 ---------------- */

  private _drawField(): void {
    const g = this._field;
    g.clear();

    const { spawnY, goalY } = this._lay;
    const cellH = cellScreenH(spawnY, goalY);
    const load = this._laneLoad();

    // 背景。贴图没到就铺一层土色，别露出黑底
    const bg = bgTex();
    if (bg && bg.baseTexture.valid && bg.width > 1) {
      fillCover(g, bg, 0, 0, 750, this._lay.height);
    } else {
      g.beginFill(0x2a2018).drawRect(0, 0, 750, this._lay.height).endFill();
    }
    // 顶底轻压一层，HUD 的字不糊进画里
    g.beginFill(0x2a160c, 0.14).drawRect(0, 0, 750, spawnY - 12).endFill();

    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      const cx = laneScreenX(lane);
      const x0 = cx - LANE_W / 2;

      // 路的分隔。淡一点，别把格子画成棋盘
      if (lane > 0) {
        g.lineStyle(2, 0x000000, 0.16)
          .moveTo(x0, spawnY).lineTo(x0, goalY).lineStyle(0);
      }

      // 这一路要来多少只。开战前必须看得见，这是布阵的主要依据
      if (load[lane]! > 0) {
        g.beginFill(0x8b2e1f, this._placing() ? 0.14 : 0.07)
          .drawRect(x0 + 4, spawnY, LANE_W - 8, 10).endFill();
      }

      // 自家那 4 格
      for (let cell = 0; cell < CELL_COUNT; cell += 1) {
        const cy = cellScreenY(cell, spawnY, goalY);
        const taken = this._state.placed.some((p) => p.lane === lane && p.cell === cell);
        if (this._placing()) {
          g.lineStyle(2, taken ? GOLD : 0x6a6a72, taken ? 0.8 : 0.45)
            .drawRoundedRect(x0 + 10, cy - cellH * 0.78, LANE_W - 20, cellH * 0.86, 8)
            .lineStyle(0);
        } else if (taken) {
          queuePad(g, jitterX(lane, cell), cy, { empty: false, hot: false, front: cell === 0 });
        }
      }
    }

    /*
     * 布阵阶段给每个人画一层「够得到哪儿」。
     *
     * §8.1 记着那个 bug：上一版战场比射程长得多，后两格的人打不到任何东西，
     * 而屏幕上完全看不出来 —— 上场人数从 3 涨到 8 几乎没换来输出。
     * 现在射程和格距是对齐的，但玩家凭什么信？画出来，让他自己看见。
     */
    if (this._placing()) {
      for (const p of this._state.placed) {
        const st = statsOf(p.villager, p.evoStage, p.stars, this._state.villageMul);
        const cy = cellScreenY(p.cell, spawnY, goalY);
        const reachY = posScreenY(Math.max(0, cellPos(p.cell) - st.range), spawnY, goalY);
        rangeArea(g, jitterX(p.lane, p.cell), cy, reachY, LANE_TINT[p.villager.lane], st.range <= 1);
      }
    }

    // 底线。漏怪判负，所以这条线必须是画面上最实的一条
    g.lineStyle(6, 0x8b2e1f, 0.9).moveTo(30, goalY).lineTo(720, goalY).lineStyle(0);
    g.beginFill(0x8b2e1f, 0.1).drawRect(30, goalY, 690, 14).endFill();
  }

  private _laneLoad(): number[] {
    const load = new Array<number>(LANE_COUNT).fill(0);
    for (const w of this._state.stage.waves) {
      for (const grp of w.groups) load[grp.lane % LANE_COUNT]! += grp.count;
    }
    return load;
  }

  private _buildCellHits(): void {
    for (const hit of this._cellHits) hit.destroy();
    this._cellHits.length = 0;
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      for (let cell = 0; cell < CELL_COUNT; cell += 1) {
        const box = new PIXI.Container();
        box.eventMode = 'none';
        this._cellHits.push(box);
        this.container.addChild(box);
        bindPointerTap(box, () => this._tapCell(lane, cell));
      }
    }
    this._placeCellHits();
  }

  private _placeCellHits(): void {
    const { spawnY, goalY } = this._lay;
    const ch = cellScreenH(spawnY, goalY);
    const box = cellHitBox(LANE_W, ch);
    let i = 0;
    for (let lane = 0; lane < LANE_COUNT; lane += 1) {
      for (let cell = 0; cell < CELL_COUNT; cell += 1) {
        const hit = this._cellHits[i]!;
        i += 1;
        hit.position.set(laneScreenX(lane), cellScreenY(cell, spawnY, goalY));
        hit.hitArea = new PIXI.Rectangle(box.x, box.y, box.w, box.h);
      }
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
      for (const p of this._state.placed) {
        const x = jitterX(p.lane, p.cell);
        const y = cellScreenY(p.cell, this._lay.spawnY, this._lay.goalY);
        const uid = `pre:${p.villager.id}`;
        let a = this._villagerActors.get(uid);
        if (!a) {
          a = new UnitActor();
          a.bindHero(p.villager.id, p.villager.lane, p.evoStage);
          this._unitLayer.addChild(a.view);
          this._villagerActors.set(uid, a);
        }
        a.equip(p.evoStage);
        a.place(x, y, villagerSpriteH(2000));
        this._tag(p.villager.name, `${ROLE_NAME[p.villager.role]}`, x, y, LANE_TINT[p.villager.lane]);
      }
      this._reapActors(new Set(this._state.placed.map((p) => `pre:${p.villager.id}`)));
      return;
    }

    const live = new Set<string>();
    for (const f of this._state.team) {
      live.add(f.uid);
      const p = this._villagerXY(f);
      const a = this._actorFor(f);
      this._vitals.seed(f.uid, f.hp, 0);
      a.place(p.x, p.y, p.h);
      a.holdPulse = this._hurtFlash.has(f.uid);
      if (!f.alive) continue;
      this._hpTag(f, p.x, p.y, p.h);
    }
    this._reapActors(live);

    for (const e of this._state.foes) {
      if (!e.alive) continue;
      let a = this._foeActors.get(e.id);
      if (!a) {
        a = new UnitActor();
        a.bindEnemy(e.def.id);
        a.walkBob = true;
        this._unitLayer.addChild(a.view);
        this._foeActors.set(e.id, a);
      }
      this._vitals.seed(`e${e.id}`, e.hp, 0);
      const p = this._foeXY(e, frac);
      a.place(p.x, p.feetY, p.h);
      a.holdPulse = this._hitFlash.has(e.id);
      this._foeHp(e, p.x, p.feetY, p.h);
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
      this._vitals.drop(`e${id}`);
    }

    // 深度排序：靠底线的画在上面，前后关系才对
    this._unitLayer.children.sort((a, b) => a.y - b.y);
  }

  private _reapActors(live: ReadonlySet<string>): void {
    for (const [uid, a] of [...this._villagerActors]) {
      if (live.has(uid)) continue;
      a.destroy();
      this._villagerActors.delete(uid);
    }
  }

  private _tag(name: string, role: string, x: number, feetY: number, tint: number): void {
    const t = label(16, 0xfff4c4, true);
    t.anchor.set(0.5);
    t.position.set(x, feetY + 6);
    t.text = name;
    this._nameLayer.addChild(t);
    const r = label(13, tint, true);
    r.anchor.set(0.5);
    r.position.set(x, feetY + 24);
    r.text = role;
    this._nameLayer.addChild(r);
  }

  /** 村民名字 + 血条。名字常驻是硬约束：场上得认得出脸（反目标第二条） */
  private _hpTag(f: Fighter, x: number, feetY: number, h: number): void {
    const g = new PIXI.Graphics();
    // 条走观战层的血，不走引擎的血：弹体还在飞的时候不许先掉
    const shown = this._vitals.shown(f.uid, { hp: f.hp, extra: 0 });
    hpBar(g, x, feetY - h - 14, 68, shown.hp / f.maxHp, 0x86efac);
    this._nameLayer.addChild(g);
    const t = label(15, f.alive ? 0xfff4c4 : 0x8a8a92, true);
    t.anchor.set(0.5);
    t.position.set(x, feetY + 8);
    t.text = f.def.name;
    this._nameLayer.addChild(t);
  }

  private _foeHp(e: Foe, x: number, feetY: number, h: number): void {
    const g = new PIXI.Graphics();
    const shown = this._vitals.shown(`e${e.id}`, { hp: e.hp, extra: 0 });
    hpBar(g, x, feetY - h - 12, 56, shown.hp / e.maxHp, 0xff8a6a);
    if (e.slowMs > 0) {
      g.beginFill(0x86efac, 0.8).drawCircle(x + 36, feetY - h - 9, 4).endFill();
    }
    this._nameLayer.addChild(g);
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
    for (const t of [this._stageName, this._waveText, this._leakText, this._hintText]) {
      this._hud.addChild(t);
    }
    this._hud.addChild(this._timeBar);
    this._guide.anchor.set(0.5);
    this._guide.visible = false;
    this._hud.addChild(this._guide);

    this._startBtn = this._makeStartBtn();
    this.container.addChild(this._startBtn);

    this._paintHudChrome();
    this._applyHudLayout();
  }

  private _makeStartBtn(): PIXI.Container {
    const w = 300;
    const h = 88;
    const box = new PIXI.Container();
    box.eventMode = 'static';
    box.interactiveChildren = false;
    box.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
    if (!fitSprite(box, uiTex('settle_btn'), 0, 0, w, h)) {
      const g = new PIXI.Graphics();
      g.beginFill(0xc9a46a).drawRoundedRect(-w / 2, -h / 2, w, h, 12).endFill();
      box.addChild(g);
    }
    const t = label(28, 0x2a160c, true);
    t.anchor.set(0.5);
    t.text = '开打';
    box.addChild(t);
    bindPointerTap(box, () => this._beginFight());
    return box;
  }

  private _paintHudChrome(): void {
    this._hudPlate.clear();
    plate(this._hudPlate, 16, this._lay.top, 718, HUD_PLATE_H, 14);
  }

  private _applyHudLayout(): void {
    const top = this._lay.top;
    this._paintHudChrome();
    this._stageName.anchor.set(0, 0.5);
    this._stageName.position.set(36, top + 26);
    this._waveText.anchor.set(1, 0.5);
    this._waveText.position.set(714, top + 28);
    this._leakText.anchor.set(0, 0.5);
    this._leakText.position.set(36, top + 62);
    this._hintText.anchor.set(1, 0.5);
    this._hintText.position.set(714, top + 64);
    this._guide.position.set(375, this._lay.spawnY - 34);
    this._bench.place(this._lay.height - Game.safeBottom - BENCH_H);
    if (this._startBtn) {
      this._startBtn.position.set(375, this._lay.goalY - 56);
    }
    this._placeCellHits();
  }

  private _updateHud(): void {
    const s = this._state;
    this._stageName.text = `${s.stage.label} ${s.stage.name}`;

    if (this._placing()) {
      this._waveText.text = `上场 ${s.placed.length}/${s.cap}`;
      this._leakText.text = `来 ${stageEnemyCount(s.stage)} 只 · ${s.stage.waves.length} 波`;
      // 布阵阶段的提示是「敌人什么门路」，不是「你该放谁」
      this._hintText.text = `敌方门路：${LANE_NAME[s.stage.mainLane]}`;
      this._timeBar.clear();
      return;
    }

    this._waveText.text = `第 ${Math.max(1, s.wave)}/${s.stage.waves.length} 波`;
    this._leakText.text = `漏 ${s.leaked}/${LEAK_ALLOW}`;
    this._hintText.text = `场上 ${foesAlive(s)} 只`;

    // 时间条。超时只是兜底，所以它画得细，不抢底线那条的注意力
    const frac = Math.min(1, s.elapsedMs / s.stage.timeLimitMs);
    this._timeBar.clear();
    this._timeBar.beginFill(0x000000, 0.35)
      .drawRoundedRect(36, this._lay.top + HUD_PLATE_H - 14, 678, 6, 3).endFill();
    this._timeBar.beginFill(frac > 0.85 ? 0xff7a5a : GOLD, 0.9)
      .drawRoundedRect(36, this._lay.top + HUD_PLATE_H - 14, 678 * (1 - frac), 6, 3).endFill();
  }

  private _say(msg: string): void {
    this._guide.text = msg;
    this._guide.visible = true;
    this._guideLife = 2.4;
  }

  private _tickGuide(dt: number): void {
    if (!this._guide.visible) return;
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
    if (s.phase === 'lost' && s.loseReason === 'leak' && adCanShow('revive')) {
      this._revive.show(s.team, s.leaked, adRemaining('revive'), this._lay.height);
      playSfx('lose', 0);
      return;
    }
    this._openSettle();
  }

  private async _watchAd(placement: AdPlacement): Promise<boolean> {
    track('ad_show', { placement, stage_id: this._state.stage.id });
    const ok = await Platform.showRewardedVideo();
    track('ad_close', { placement, stage_id: this._state.stage.id, completed: ok });
    return ok;
  }

  private async _acceptRevive(): Promise<void> {
    const ok = await this._watchAd('revive');
    if (!ok) {
      // 广告没看完就留在弹窗上。直接掉进结算会让人以为「点了没反应」
      this._revive.unlock();
      Platform.showToast('没看完，挡不住');
      return;
    }
    adRecord('revive');
    reviveAfterLeak(this._state);
    this._revive.hide();
    this._consumeEvents();
    this._updateHud();
    this._say('缓过来了，接着挡');
  }

  private _giveUpRevive(): void {
    this._revive.hide();
    this._openSettle();
  }

  private _settleGot: { pellets: number; scrap: number } = { pellets: 0, scrap: 0 };

  private _openSettle(): void {
    if (this._settled) return;
    this._settled = true;
    const s = this._state;
    const won = s.phase === 'won';

    const res = settleStage(s.stage.id, won, s.stars);
    this._mem = res.mem;
    this._settleGot = { pellets: res.pellets, scrap: res.scrap };

    track('run_end', {
      stage_id: s.stage.id,
      won,
      stars: s.stars,
      leaked: s.leaked,
      lose_reason: s.loseReason ?? '',
      elapsed_ms: s.elapsedMs,
      play_ms: this._startedAt > 0 ? Date.now() - this._startedAt : 0,
    });
    playSfx(won ? 'win' : 'lose', 0);

    const next = won ? getStage(s.stage.id + 1) : undefined;
    this._settle.show(s, this._mem, this._lay.height, {
      earned: res.scrap,
      scrap: this._mem.scrap,
      pellets: res.pellets,
      loseReason: won ? undefined : s.loseReason,
      identity: won ? this._winLine() : undefined,
      nextMove: won ? undefined : this._loseHint(),
      nextStageLabel: next && next.id !== s.stage.id ? next.label : undefined,
      canDouble: adCanShow('settleDouble'),
    });
  }

  /** 赢了那一句。说的是「这一关是怎么过的」，不是伤害统计 */
  private _winLine(): string {
    const s = this._state;
    if (s.stars === 3) return '一个没漏，清得也快';
    if (s.leaked > 0) return `漏了 ${s.leaked} 个，还是顶住了`;
    const fallen = s.team.filter((f) => !f.alive).length;
    return fallen > 0 ? `倒了 ${fallen} 个，线没断` : '清干净了，就是慢了点';
  }

  /**
   * 输了给的下一手。**必须指向布阵或养成，不许说「再试一次」。**
   *
   * §4.4 的聪明感时刻要求玩家卡关后想的是「换人 / 换站位 / 喂大主力」，
   * 而不是「回去刷村庄等级」。这句话是唯一能推他一把的地方。
   */
  private _loseHint(): string {
    const s = this._state;
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

  private async _doubleSettle(): Promise<boolean> {
    if (!adCanShow('settleDouble')) return false;
    const ok = await this._watchAd('settleDouble');
    if (!ok) return false;
    adRecord('settleDouble');
    // 翻倍补的是差额：settleStage 已经把基础那一份记进去了
    const total = Math.max(16, this._settleGot.scrap * 2);
    this._mem = addScrap(total - this._settleGot.scrap);
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
      this._lay.top + HUD_PLATE_H + 8,
    );
    bindPointerTap(box, () => Platform.showToast(this._gmWin(), 'none'));
    this.container.addChildAt(box, this.container.getChildIndex(this._settle));
    this._gmSkip = box;
  }
}
