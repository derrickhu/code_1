/**
 * 战斗场景。
 *
 * 渲染层不含任何战斗规则，只读 BattleEngine 的状态。规则改动一律回 BattleEngine。
 * 贴图缺失时退回色块，不挡玩。
 */

import * as PIXI from 'pixi.js';
import { Game } from '@/core/Game';
import type { Scene } from '@/core/SceneManager';
import { bindPointerTap } from '@/minigame';
import { BOARD_RANKS, PLAYER_ROWS, RANK, SLOTS_PER_ROW, SPAWN_DIST, TICK_MS } from '@/balance/combat';
import { ELEMENT_NAMES, getCounterMult, type Element } from '@/balance/counters';
import { getWave } from '@/balance/enemies';
import { ROLE_NAMES, getHero, isMeleeRole, skillTag } from '@/balance/heroes';
import { getTeamBuff, type PickOption } from '@/balance/picker';
import { BenchDock } from '@/ui/BenchDock';
import { SettleOverlay } from '@/ui/SettleOverlay';
import { CombatFx } from '@/fx/CombatFx';
import { addCoverPortrait, bgTex, enemyTex, fillContain, fillScaled, heroTex, preloadBattleArt, watchArt } from '@/core/TextureLoader';
import { playSfx } from '@/core/SfxPlayer';
import { saveRun } from '@/core/RunMemory';
import { GOLD, hpBar, plate, rangeArea, shieldMark, stance } from '@/ui/paint';
import {
  applyPick,
  assignSlot,
  benchHero,
  benchOf,
  createRun,
  heroAt,
  heroReach,
  tick,
  upcomingWaveElement,
  type DeployOptions,
  type EnemyUnit,
  type HeroUnit,
  type Row,
  type RunState,
} from '@/game/BattleEngine';

/** 玩家自己选牌，上场则沿用「优先克制」的默认规则 */
const DEPLOY: DeployOptions = { preferCounter: true, shuffle: false };

const ELEMENT_COLOR: Readonly<Record<Element, number>> = {
  flame: 0xff6b4a,
  vine: 0x5ecf7b,
  tide: 0x4aa3ff,
};

const COL_X = [190, 375, 560] as const;
const SLOT_W = 118;
const SLOT_H = 86;

/** 三路与三列对齐，换列才看得到「挡住这一路」 */
const LANE_X = COL_X;

function heroH(h: HeroUnit): number {
  if (h.def.role === 'guard') return 86;
  if (h.def.role === 'splash') return 80;
  return 74;
}

function enemyH(e: EnemyUnit): number {
  if (e.proto.isBoss) return 96;
  if (e.proto.id === 'brute') return 80;
  if (e.proto.id === 'runner') return 56;
  return 70;
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
  private readonly _slotLayer = new PIXI.Container();
  private readonly _nameLayer = new PIXI.Container();
  private readonly _hudPlate = new PIXI.Graphics();
  private readonly _hud = new PIXI.Container();
  private readonly _pick = new PIXI.Container();
  private readonly _bench = new BenchDock(
    (id) => this._tapBench(id),
    () => this._withdrawSelected(),
  );
  private readonly _settle = new SettleOverlay(() => this.onEnter());
  private readonly _fx = new CombatFx();
  private readonly _frontLabel = label(15, 0xb8a888);
  private readonly _midLabel = label(15, 0xb8a888);
  private readonly _backLabel = label(15, 0xb8a888);
  private readonly _enemyLabel = label(15, 0xb8a888);
  private readonly _slotHits: PIXI.Container[] = [];
  private readonly _guide = label(26, 0xffd66b, true);
  private readonly _inspectPlate = new PIXI.Graphics();
  private readonly _inspectTitle = label(22, 0xffffff, true);
  private readonly _inspectDesc = label(18, 0xd7dcee);
  private readonly _inspectHint = label(16, GOLD);

  private readonly _waveText = label(34, 0xffffff, true);
  private readonly _hintText = label(24, 0xffd66b);
  private readonly _baseText = label(30, 0xff7a7a, true);
  private readonly _rosterText = label(20, 0x9aa4bf);

  private _pickIdle = 0;
  private _guideLife = 0;
  private _settled = false;
  private _selected: string | null = null;

  /** 敌人被命中后的短暂高亮，让「正在被集火」看得出来 */
  private readonly _hitFlash = new Map<number, number>();
  /** 英雄挨打闪光 */
  private readonly _hurtFlash = new Map<string, number>();
  /** 近战出手时往目标方向短冲一下 */
  private readonly _lunge = new Map<string, { dx: number; dy: number; life: number }>();
  private readonly _lastEnemyXY = new Map<number, { x: number; y: number }>();
  /** 漩涡拉回：怪从旧点滑到新点，避免瞬移像自己往后飘 */
  private readonly _drag = new Map<number, { x0: number; y0: number; x1: number; y1: number; life: number; max: number }>();
  private readonly _rangeHint = label(18, GOLD, true);

  /**
   * 布局按实际屏幕算，不能写死 1334。
   * 设计稿是 750×1334，但 Game 按宽度等比缩放，长屏机型的可用高度（logicHeight）
   * 会明显大于 1334 —— 照 1334 排版就会在底部空出一整条，看着像半屏。
   */
  private _lay = {
    top: 96,
    fieldTop: 200,
    fieldBottom: 1010,
    fieldH: 810,
    height: 1334,
    rankYs: [960, 860, 760, 660, 560, 460],
  };

  constructor() {
    this.container.addChild(this._field);
    this.container.addChild(this._slotLayer);
    this.container.addChild(this._nameLayer);
    this.container.addChild(this._fx.layer);
    this.container.addChild(this._hud);
    this.container.addChild(this._bench);
    this.container.addChild(this._pick);
    this.container.addChild(this._settle);
    this._rangeHint.anchor.set(0.5);
    this._rangeHint.visible = false;
    this.container.addChild(this._rangeHint);
    this._computeLayout();
    this._buildSlotHits();
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
    this._drag.clear();
    this._rangeHint.visible = false;
    this._pickIdle = 0;
    this._guideLife = 0;
    this._settled = false;
    this._guide.visible = false;
    this._renderPickCards();
  }

  /** 开局还没人，空格子画出来只会让人以为要先编队 */
  private _showFormation(): boolean {
    return this._state.roster.length > 0 && this._state.phase !== 'picking';
  }

  private _canEdit(): boolean {
    const p = this._state.phase;
    return this._state.roster.length > 0
      && p !== 'picking'
      && p !== 'won'
      && p !== 'lost';
  }

  private _clearSelect(): void {
    this._selected = null;
    this._accMs = 0;
    this._bench.refresh(this._state, null);
  }

  private _tapSlot(row: Row, slot: number): void {
    if (!this._canEdit()) return;
    const occupant = heroAt(this._state, row, slot);
    playSfx('ui_tap', 0);
    if (!this._selected) {
      if (occupant) this._selected = occupant.def.id;
      return;
    }
    if (occupant?.def.id === this._selected) {
      this._clearSelect();
      return;
    }
    const prev = this._state.roster.find((h) => h.def.id === this._selected);
    const onField = prev ? this._state.deployed.includes(prev) : false;
    const fromRow = onField ? prev?.row : undefined;
    const fromSlot = onField ? prev?.slot : undefined;
    assignSlot(this._state, this._selected, row, slot);
    this._clearSelect();
    if (fromRow && fromRow !== row) {
      const msg = row === 'front'
        ? '挪到前排挡刀，敌人会先打他'
        : row === 'mid'
          ? '挪到中排'
          : '挪到后排，前面替他挡刀';
      this._say(msg);
    } else if (fromSlot !== undefined && fromSlot !== slot) {
      this._say(slot === 0 ? '挪到左路' : slot === 2 ? '挪到右路' : '挪到中路');
    }
  }

  private _tapBench(heroId: string): void {
    if (!this._canEdit()) return;
    playSfx('ui_tap', 0);
    if (!this._selected) {
      this._selected = heroId;
      return;
    }
    const selected = this._state.roster.find((h) => h.def.id === this._selected);
    const onField = selected ? this._state.deployed.includes(selected) : false;
    if (selected && onField) {
      assignSlot(this._state, heroId, selected.row, selected.slot);
      this._clearSelect();
      return;
    }
    this._selected = heroId;
  }

  private _say(msg: string): void {
    this._guide.text = msg;
    this._guide.visible = true;
    this._guideLife = 2.4;
  }

  private _withdrawSelected(): void {
    if (!this._selected || this._state.deployed.length <= 1) return;
    const hero = this._state.roster.find((h) => h.def.id === this._selected);
    if (!hero || !this._state.deployed.includes(hero)) return;
    playSfx('ui_tap', 0);
    benchHero(this._state, hero.def.id);
    this._clearSelect();
  }

  private _computeLayout(): void {
    const height = Math.max(1334, Game.logicHeight || 1334);
    const top = Math.max(Game.safeTop, 96);
    const fieldTop = top + 104;
    // 底部留给上场阵容条与安全区，其余全部给战场
    const fieldBottom = height - 150 - Game.safeBottom;
    // 两排钉在底线上方，Y 是脚底。人站在地上，格子不再当头像框。
    const rankGap = (fieldBottom - fieldTop - 16) / (BOARD_RANKS - 1);
    const rankYs = Array.from({ length: BOARD_RANKS }, (_, i) => fieldBottom - 20 - i * rankGap);
    this._lay = {
      top,
      fieldTop,
      fieldBottom,
      fieldH: fieldBottom - fieldTop,
      height,
      rankYs,
    };
  }

  private _rankY(rank: number): number {
    const ys = this._lay.rankYs;
    const i = Math.max(0, Math.min(ys.length - 1, rank));
    return ys[i] ?? 800;
  }

  private _rowY(row: 'front' | 'mid' | 'back'): number {
    return this._rankY(RANK[row]);
  }

  /** 敌人所在排 → 屏幕 Y，在两排之间插值，走格看得见。 */
  private _distToY(dist: number): number {
    const d = Math.max(0, Math.min(SPAWN_DIST, dist));
    const lo = Math.floor(d);
    const hi = Math.ceil(d);
    if (lo === hi) return this._rankY(lo);
    const t = d - lo;
    return this._rankY(lo) + (this._rankY(hi) - this._rankY(lo)) * t;
  }

  update(dt: number): void {
    const s = this._state;

    // 点中英雄时战斗停住：换位是想清楚的决定，但不弹窗打断看戏
    if (this._selected) {
      this._drawField();
      this._updateHud();
      return;
    }

    if (s.phase === 'picking') {
      if (this._selected) this._clearSelect();
      if (this._pick.children.length === 0) this._renderPickCards();
      if (s.roster.length === 0) {
        this._pickIdle += dt;
        if (this._pickIdle >= 3) this._highlightFirstCard();
      }
    } else if (s.phase === 'fighting' || s.phase === 'gap') {
      // 按固定步长推进，与批量回归完全一致：掉帧只会让画面变慢，不会改变战斗结果
      this._accMs += dt * 1000;
      let guard = 0;
      while (this._accMs >= TICK_MS && guard++ < 8) {
        this._accMs -= TICK_MS;
        this._rememberUnits();
        tick(s, DEPLOY);
        this._consumeEvents();
        // 经 tick 后 phase 可能已变，这里必须重新读状态而不是复用上面收窄过的判断
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
    for (const [id, d] of this._drag) {
      d.life -= dt;
      if (d.life <= 0) this._drag.delete(id);
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
    const h = this._state.deployed.find((x) => x.def.id === heroId)
      ?? this._state.roster.find((x) => x.def.id === heroId);
    if (!h) return undefined;
    return { x: COL_X[h.slot] ?? 375, y: this._rowY(h.row) - heroH(h) * 0.45 };
  }

  private _enemyXY(id: number): { x: number; y: number } | undefined {
    const e = this._state.enemies.find((x) => x.id === id);
    if (e) return { x: LANE_X[e.lane] ?? 375, y: this._distToY(e.dist) - enemyH(e) * 0.45 };
    return this._lastEnemyXY.get(id);
  }

  private _rememberUnits(): void {
    this._lastEnemyXY.clear();
    for (const e of this._state.enemies) {
      this._lastEnemyXY.set(e.id, {
        x: LANE_X[e.lane] ?? 375,
        y: this._distToY(e.dist) - enemyH(e) * 0.45,
      });
    }
  }

  private _consumeEvents(): void {
    for (const ev of this._state.events) {
      if (ev.kind === 'hit') {
        this._hitFlash.set(ev.enemyId, 120);
        const attacker = this._state.deployed.find((h) => h.def.id === ev.heroId);
        if (attacker && isMeleeRole(attacker.def.role)) {
          this._lunge.set(ev.heroId, { dx: 0, dy: -8, life: 0.1 });
        }
      }
      if (ev.kind === 'enemyHit') this._hurtFlash.set(ev.heroId, 140);
      const hero = ev.kind === 'hit' || ev.kind === 'skill' || ev.kind === 'heroDown' || ev.kind === 'enemyHit'
        ? this._heroXY(ev.heroId)
        : undefined;
      const enemy = ev.kind === 'hit' || ev.kind === 'enemyDown' || ev.kind === 'leak' || ev.kind === 'enemyHit'
        ? this._enemyXY(ev.enemyId)
        : undefined;
      const attacker = ev.kind === 'hit' || ev.kind === 'skill'
        ? this._state.deployed.find((h) => h.def.id === ev.heroId)
        : undefined;
      const color = attacker ? ELEMENT_COLOR[attacker.def.element] : 0xffffff;
      const target = ev.kind === 'skill' && ev.targetId ? this._heroXY(ev.targetId) : undefined;
      const pulled = ev.kind === 'skill' && ev.pulledIds
        ? ev.pulledIds.flatMap((id) => {
          const from = this._lastEnemyXY.get(id);
          const to = this._enemyXY(id);
          if (!from || !to) return [];
          this._drag.set(id, { x0: from.x, y0: from.y, x1: to.x, y1: to.y, life: 0.38, max: 0.38 });
          return [{ x0: from.x, y0: from.y, x1: to.x, y1: to.y }];
        })
        : undefined;
      this._fx.consume(ev, {
        hx: hero?.x,
        hy: hero?.y,
        ex: enemy?.x,
        ey: enemy?.y,
        tx: target?.x,
        ty: target?.y,
        color,
        role: attacker?.def.role,
        reachY: attacker ? this._distToY(heroReach(attacker)) : undefined,
        meleeR: attacker && isMeleeRole(attacker.def.role)
          ? Math.max(56, Math.abs((hero?.y ?? 0) - this._distToY(heroReach(attacker))) + 10)
          : undefined,
        baseY: this._lay.fieldBottom,
        pulled,
        slowed: ev.kind === 'hit' && attacker?.def.skill.kind === 'slowOnHit',
      });
    }
    this._state.events.length = 0;
  }

  private _showSettle(): void {
    if (this._settled) return;
    this._settled = true;
    const mem = saveRun(
      this._state.wave,
      this._state.roster.map((h) => h.def.id),
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
    this._baseText.anchor.set(1, 0);
    this._guide.anchor.set(0.5);
    this._guide.visible = false;

    this._inspectTitle.anchor.set(0.5, 0);
    this._inspectDesc.anchor.set(0.5, 0);
    this._inspectHint.anchor.set(0.5, 0);
    this._inspectDesc.style.wordWrap = true;
    this._inspectDesc.style.wordWrapWidth = 640;
    this._inspectDesc.style.align = 'center';
    this._inspectPlate.visible = false;
    this._inspectTitle.visible = false;
    this._inspectDesc.visible = false;
    this._inspectHint.visible = false;

    this._hud.addChild(
      this._hudPlate,
      this._waveText,
      this._hintText,
      this._baseText,
      this._rosterText,
      this._guide,
      this._inspectPlate,
      this._inspectTitle,
      this._inspectDesc,
      this._inspectHint,
    );
    this._applyHudLayout();
  }

  private _buildSlotHits(): void {
    this._frontLabel.text = '前';
    this._midLabel.text = '中';
    this._backLabel.text = '后';
    this._enemyLabel.text = '敌';
    this._slotLayer.addChild(this._frontLabel, this._midLabel, this._backLabel, this._enemyLabel);

    for (const row of PLAYER_ROWS) {
      for (let slot = 0; slot < SLOTS_PER_ROW; slot += 1) {
        const hit = new PIXI.Container();
        hit.eventMode = 'static';
        const g = new PIXI.Graphics();
        g.beginFill(0xffffff, 0.001).drawRoundedRect(-SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 14).endFill();
        hit.addChild(g);
        bindPointerTap(hit, () => this._tapSlot(row, slot), {
          guard: () => this._canEdit(),
        });
        hit.name = `${row}:${slot}`;
        this._slotHits.push(hit);
        this._slotLayer.addChild(hit);
      }
    }
  }

  private _applyHudLayout(): void {
    const { top, fieldBottom } = this._lay;
    this._waveText.position.set(44, top + 6);
    this._hintText.position.set(44, top + 44);
    this._baseText.position.set(706, top + 14);
    this._rosterText.position.set(44, fieldBottom + 28);
    this._bench.place(fieldBottom + 8);
    this._layoutSlots();
    this._guide.position.set(375, fieldBottom - 48);
    this._inspectTitle.position.set(375, top + 92);
    this._inspectDesc.position.set(375, top + 118);
    this._inspectHint.position.set(375, top + 148);
  }

  private _updateHud(): void {
    const s = this._state;
    const opening = s.phase === 'picking' && s.roster.length === 0;
    this._waveText.visible = !opening;
    this._hintText.visible = !opening;
    this._baseText.visible = !opening;
    this._rosterText.visible = !opening;
    this._waveText.text = `第 ${s.wave} 波`;
    this._baseText.text = `底线 ${s.baseHp} / ${s.maxBaseHp}`;

    if (s.phase === 'won' || s.phase === 'lost') {
      this._hintText.text = '';
      if (this._selected) this._clearSelect();
    } else {
      this._hintText.text = s.wave >= 1 ? getWave(s.wave).hint : '';
    }

    const owned = s.roster.length;
    const benchN = owned - s.deployed.length;
    const dockOn = this._bench.visible;
    this._rosterText.visible = !opening && !dockOn;
    this._rosterText.text =
      owned === 0
        ? ''
        : `上场 ${s.deployed.length} / 拥有 ${owned}` + (benchN > 0 ? ` · 点英雄换位` : '');

    this._hudPlate.clear();
    if (!opening) {
      const { top, fieldBottom } = this._lay;
      plate(this._hudPlate, 24, top - 8, 292, 86);
      plate(this._hudPlate, 488, top - 8, 238, 56);
      if (!dockOn) plate(this._hudPlate, 24, fieldBottom + 12, 360, 48, 12, 0.7);
    }
    this._showInspect();
    if (this._selected) {
      this._guide.visible = false;
    } else if (this._guideLife <= 0) {
      this._guide.visible = false;
    }
    this._bench.refresh(s, this._selected);
  }

  private _showInspect(): void {
    const hero = this._selected
      ? this._state.roster.find((h) => h.def.id === this._selected)
      : undefined;
    const on = !!hero && this._canEdit();
    this._inspectPlate.visible = on;
    this._inspectTitle.visible = on;
    this._inspectDesc.visible = on;
    this._inspectHint.visible = on;
    this._inspectPlate.clear();
    if (!hero || !on) return;
    const { top } = this._lay;
    plate(this._inspectPlate, 40, top + 82, 670, 88, 16, 0.88);
    this._inspectTitle.text = `${hero.def.name}  ·  ${hero.def.skillName}（${skillTag(hero.def.skill)}）`;
    this._inspectDesc.text = hero.def.skillDesc;
    this._inspectHint.text = this._state.deployed.includes(hero)
      ? '点空位换列 · 再点自己取消'
      : '点场上格子换上';
  }

  // ── 战场 ──────────────────────────────────────────────

  private _layoutSlots(): void {
    this._frontLabel.position.set(22, this._rowY('front') - 8);
    this._midLabel.position.set(22, this._rowY('mid') - 8);
    this._backLabel.position.set(22, this._rowY('back') - 8);
    this._enemyLabel.position.set(22, this._rankY(4) - 8);
    let i = 0;
    for (const row of PLAYER_ROWS) {
      const y = this._rowY(row);
      for (let slot = 0; slot < SLOTS_PER_ROW; slot += 1) {
        this._slotHits[i]?.position.set(COL_X[slot] ?? 375, y - 40);
        i += 1;
      }
    }
  }

  private _drawField(): void {
    const g = this._field;
    g.clear();
    const { fieldTop, fieldBottom } = this._lay;

    const bg = bgTex();
    if (bg && bg.baseTexture.valid && bg.width > 1) {
      fillScaled(g, bg, 0, 0, 750, this._lay.height);
    } else {
      g.beginFill(0x141726).drawRect(0, fieldTop - 20, 750, fieldBottom - fieldTop + 40).endFill();
    }

    // 顶底轻压，字不糊进画里，但别把糖果战场压成黑幕
    g.beginFill(0x2a160c, 0.22).drawRect(0, 0, 750, this._lay.top + 96).endFill();
    g.beginFill(0x2a160c, 0.18).drawRect(0, fieldBottom - 8, 750, this._lay.height - fieldBottom + 8).endFill();

    const showFormation = this._showFormation();
    this._slotLayer.visible = showFormation;
    if (!showFormation) this._rangeHint.visible = false;
    if (showFormation) {
      const cellH = Math.max(72, (this._lay.rankYs[0]! - this._lay.rankYs[1]!) * 0.92);
      for (let rank = 0; rank < BOARD_RANKS; rank += 1) {
        const y = this._rankY(rank);
        const mine = rank <= RANK.front;
        for (const x of COL_X) {
          g.beginFill(mine ? 0xffffff : 0x000000, mine ? 0.05 : 0.12);
          g.drawRoundedRect(x - 56, y - cellH + 10, 112, cellH, 10);
          g.endFill();
        }
      }
      const clashY = (this._rankY(RANK.front) + this._rankY(RANK.front + 1)) / 2;
      g.lineStyle(2, GOLD, 0.45).moveTo(88, clashY).lineTo(662, clashY).lineStyle(0);
      for (const row of PLAYER_ROWS) {
        const y = this._rowY(row);
        for (let slot = 0; slot < SLOTS_PER_ROW; slot += 1) {
          const x = COL_X[slot] ?? 375;
          const hero = this._state.deployed.find((h) => h.row === row && h.slot === slot);
          const waiting = !!this._selected && !hero;
          stance(g, x, y, hero ? ELEMENT_COLOR[hero.def.element] : GOLD, !!hero || waiting);
          if (waiting) {
            g.lineStyle(2, GOLD, 0.7).drawEllipse(x, y + 8, 46, 14).lineStyle(0);
          }
        }
      }
    }

    const approaching = this._state.enemies.some((e) => e.dist < RANK.front);
    const danger = this._state.baseHp <= 3 || this._fx.leakPulse > 0 || approaching;
    g.beginFill(danger ? 0x8c2b3a : 0x1a1520, danger ? 0.9 : 0.55).drawRect(0, fieldBottom, 750, 6).endFill();
    g.beginFill(danger ? 0xff6b6b : GOLD, danger ? 0.55 : 0.35).drawRect(0, fieldBottom, 750, 2).endFill();
    if (approaching && this._fx.leakPulse <= 0) {
      const pulse = 0.25 + Math.abs(Math.sin(this._state.totalMs / 180)) * 0.3;
      g.beginFill(0xff6b6b, pulse * 0.35).drawRect(0, fieldBottom - 10, 750, 16).endFill();
    }
    if (this._fx.landPulse > 0) {
      g.beginFill(GOLD, this._fx.landPulse * 1.1).drawEllipse(375, this._rowY('front') + 8, 90, 22).endFill();
    }

    this._drawSelectedRange(g);

    const byRow = [...this._state.deployed].sort((a, b) => RANK[a.row] - RANK[b.row]);
    for (const h of byRow) this._drawHero(g, h);
    for (const e of this._state.enemies) this._drawEnemy(g, e);
    this._drawHeroNames();
  }

  private _drawSelectedRange(g: PIXI.Graphics): void {
    const hero = this._selected
      ? this._state.deployed.find((h) => h.def.id === this._selected)
      : undefined;
    if (!hero) {
      this._rangeHint.visible = false;
      return;
    }
    const x = COL_X[hero.slot] ?? 375;
    const feet = this._rowY(hero.row);
    const reachY = this._distToY(heroReach(hero));
    const melee = isMeleeRole(hero.def.role);
    rangeArea(g, x, feet, reachY, ELEMENT_COLOR[hero.def.element], melee);
    this._rangeHint.text = melee ? '近战范围' : '远程范围';
    const forward = Math.abs(feet - reachY);
    this._rangeHint.position.set(x, melee ? feet - Math.max(52, forward * 0.9) - 20 : reachY);
    this._rangeHint.visible = true;
  }

  private _drawHeroNames(): void {
    const live = new Set<string>();
    const byRow = [...this._state.deployed].sort((a, b) => RANK[a.row] - RANK[b.row]);
    for (const h of byRow) {
      live.add(h.def.id);
      live.add(`${h.def.id}:tag`);
      let name = this._nameLayer.children.find((c) => c.name === h.def.id) as PIXI.Text | undefined;
      if (!name) {
        name = label(15, 0xffffff, true);
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
      const top = this._rowY(h.row) - heroH(h) - 2;
      name.text = h.level > 1 ? `${h.def.name} ${h.level}` : h.def.name;
      name.tint = h.alive ? 0xffffff : 0x6b7394;
      name.position.set(COL_X[h.slot] ?? 375, top - 16);
      tag.text = skillTag(h.def.skill);
      tag.tint = h.alive ? 0xffd66b : 0x6b7394;
      tag.position.set(COL_X[h.slot] ?? 375, top);
    }
    for (const c of [...this._nameLayer.children]) {
      if (!c.name || !live.has(c.name)) c.destroy();
    }
  }

  private _drawHero(g: PIXI.Graphics, h: HeroUnit): void {
    const lunge = this._lunge.get(h.def.id);
    const x = (COL_X[h.slot] ?? 375) + (lunge ? lunge.dx : 0);
    const feet = this._rowY(h.row) + (lunge ? lunge.dy : 0);
    const color = ELEMENT_COLOR[h.def.element];
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

    hpBar(g, x, feet + 6, 52, h.hp / Math.max(1, h.maxHp), 0x4ade80);
    if (h.shield > 0) {
      shieldMark(g, x - 36, feet + 17);
      hpBar(g, x, feet + 14, 52, Math.min(1, h.shield / Math.max(1, h.maxHp)), 0x7dd3fc);
    }
  }

  private _drawEnemy(g: PIXI.Graphics, e: EnemyUnit): void {
    const size = enemyH(e);
    const drag = this._drag.get(e.id);
    let x = LANE_X[e.lane] ?? 375;
    let feet = this._distToY(e.dist);
    if (drag) {
      const t = 1 - Math.max(0, drag.life) / drag.max;
      const u = 1 - (1 - t) * (1 - t);
      x = drag.x0 + (drag.x1 - drag.x0) * u;
      feet = drag.y0 + (drag.y1 - drag.y0) * u + size * 0.45;
    }
    const color = ELEMENT_COLOR[e.element];
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
    if (this._isSlowed(e)) {
      g.lineStyle(2.2, 0x86efac, 0.75);
      g.drawEllipse(x, feet - size * 0.4, size * 0.42, size * 0.28);
      g.lineStyle(0);
      g.beginFill(0x4ade80, 0.55);
      g.drawCircle(x + size * 0.38, feet - size * 0.72, 5);
      g.endFill();
    }

    const rel = this._counterRelation(e.element);
    if (rel !== 'flat') {
      const chip = rel === 'up' ? 0x5ecf7b : 0xff5f5f;
      const ay = feet - size - 2;
      g.beginFill(chip, 0.95);
      if (rel === 'up') {
        g.moveTo(x, ay - 8);
        g.lineTo(x - 9, ay + 6);
        g.lineTo(x + 9, ay + 6);
      } else {
        g.moveTo(x, ay + 8);
        g.lineTo(x - 9, ay - 6);
        g.lineTo(x + 9, ay - 6);
      }
      g.closePath();
      g.endFill();
    }

    hpBar(g, x, feet + 14, Math.max(48, size * 0.7), e.hp / Math.max(1, e.maxHp), 0xff6b6b);
  }

  private _isSlowed(e: EnemyUnit): boolean {
    if (e.slowMs > 0 || e.slowPct > 0) return true;
    return this._state.deployed.some((h) => (
      h.alive && h.def.skill.kind === 'slowAura' && e.dist <= heroReach(h)
    ));
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

  // ── 三选一 ────────────────────────────────────────────

  private _renderPickCards(): void {
    this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));

    const s = this._state;
    if (s.phase !== 'picking' || s.pendingOptions.length === 0) return;

    const opening = s.roster.length === 0;
    const dim = new PIXI.Graphics();
    dim.beginFill(0x2a160c, opening ? 0.38 : 0.55).drawRect(0, 0, 750, this._lay.height).endFill();
    this._pick.addChild(dim);

    const el = upcomingWaveElement(s.wave);
    const titleY = this._lay.fieldTop + this._lay.fieldH * (opening ? 0.16 : 0.18);

    const title = label(36, 0xfff4c4, true);
    title.style.stroke = '#2a160c';
    title.style.strokeThickness = 6;
    title.anchor.set(0.5);
    title.position.set(375, titleY);
    title.text = opening ? '选一个英雄' : (el ? `第 ${s.wave} 波 · ${ELEMENT_NAMES[el]}系来袭` : `第 ${s.wave} 波`);
    this._pick.addChild(title);

    const sub = label(24, 0xfff1a8, true);
    sub.style.stroke = '#2a160c';
    sub.style.strokeThickness = 4;
    sub.anchor.set(0.5);
    sub.position.set(375, titleY + 44);
    sub.text = opening ? '点一张即可开打，他们会在格子上自己打' : '选一张继续';
    this._pick.addChild(sub);

    const cardW = 218;
    const cardH = 368;
    const gap = 12;
    const totalW = s.pendingOptions.length * cardW + (s.pendingOptions.length - 1) * gap;
    const startX = (750 - totalW) / 2;

    s.pendingOptions.forEach((opt, i) => {
      const card = this._buildCard(opt, cardW, cardH, el);
      card.name = `pick-card-${i}`;
      card.position.set(startX + i * (cardW + gap), titleY + 84);
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
    const faceH = 214;
    const bg = new PIXI.Graphics();
    bg.beginFill(0x1a0e08, 0.35).drawRoundedRect(4, 8, w, h, 22).endFill();
    bg.beginFill(0xfff6df).drawRoundedRect(0, 0, w, h, 20).endFill();
    bg.beginFill(info.color, 0.18).drawRoundedRect(8, 8, w - 16, faceH - 10, 16).endFill();
    bg.lineStyle(6, info.color, 1).drawRoundedRect(3, 3, w - 6, h - 6, 18).lineStyle(0);
    card.addChild(bg);

    const portrait = opt.kind !== 'buff' ? heroTex(opt.heroId) : null;
    if (portrait && portrait.baseTexture.valid && portrait.width > 1) {
      addCoverPortrait(card, portrait, 10, 10, w - 20, faceH - 16, 14);
    } else {
      const swatch = new PIXI.Graphics();
      swatch.beginFill(info.color, 0.9).drawRoundedRect(w / 2 - 40, 56, 80, 80, 18).endFill();
      card.addChild(swatch);
    }

    const name = label(26, 0x2a160c, true);
    name.anchor.set(0.5);
    name.position.set(w / 2, faceH + 20);
    name.text = info.title;
    card.addChild(name);

    const sub = label(17, 0x8a5a2b);
    sub.anchor.set(0.5);
    sub.position.set(w / 2, faceH + 46);
    sub.text = info.subtitle;
    card.addChild(sub);

    const desc = label(17, 0x3d2a1c);
    desc.anchor.set(0.5, 0);
    desc.position.set(w / 2, faceH + 72);
    desc.style.wordWrap = true;
    desc.style.wordWrapWidth = w - 28;
    desc.style.align = 'center';
    desc.text = info.desc;
    card.addChild(desc);

    // 「这张能克这波」必须在卡上直接说出来，不能指望玩家自己记三系环
    if (info.element && upcoming && getCounterMult(info.element, upcoming) > 1) {
      const tag = label(18, 0x0b0f18, true);
      tag.anchor.set(0.5);
      tag.position.set(w / 2, h - 22);
      tag.text = '克制这一波';
      const tagBg = new PIXI.Graphics();
      tagBg.beginFill(0x5ecf7b).drawRoundedRect(w / 2 - 72, h - 38, 144, 30, 14).endFill();
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
      subtitle: `${ELEMENT_NAMES[def.element]}系 · ${ROLE_NAMES[def.role]} · ${skillTag(def.skill)}`,
      color: ELEMENT_COLOR[def.element],
      element: def.element,
    };
    if (opt.kind === 'levelUp') {
      const cur = this._state.roster.find((x) => x.def.id === opt.heroId);
      const lv = cur ? cur.level : 1;
      return { ...base, subtitle: `升级 · Lv${lv} → Lv${lv + 1} · ${def.skillName}`, desc: def.skillDesc };
    }
    return { ...base, desc: def.skillDesc };
  }

  private _choose(opt: PickOption): void {
    const opening = this._state.roster.length === 0;
    playSfx('ui_tap', 0);
    applyPick(this._state, opt, DEPLOY);
    this._pick.removeChildren().forEach((c) => c.destroy({ children: true }));
    this._accMs = 0;
    this._pickIdle = 0;
    if (opening) {
      this._fx.markLand();
      this._guide.text = '守住底线，撑过 15 波';
      this._guide.visible = true;
      this._guideLife = 3.2;
    }
  }
}
