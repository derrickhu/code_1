/**
 * 村子：出村开打、弹弓摊、村民（进化 / 星级 / 图鉴）。
 *
 * 只有四个页面，刻意做窄。上一版的村子有七页（编队 / 图鉴 / 废品站 / 门路 /
 * 随身 / 组合），改装件下线之后其中五页失去了对象；更要紧的是**它们互相不产生关系**，
 * 玩家在里面点半天不知道自己在决定什么。§4.3 的口径是「局外只解决一件事：
 * 让手上的人变多、变强」，所以这一版只留：
 *
 * - `home`  出村 + 村庄等级 + 四种资源。**它必须一眼能出村**，这是主循环的入口。
 * - `stall` 弹弓摊。弹子的唯一去处，也是村庄经验/零件/工分的唯一来源。
 * - `folks` 村民。已入伙的能喂进化，没见过的暗着 —— 图鉴和养成是同一页，
 *           因为「我还差谁」和「我该喂谁」是同一个决策。
 * - `one`   单个村民的三阶详情。进化前要看得见「喂完他会变成什么样」（§4.1）。
 *
 * 资源条常驻在每一页顶上。四种货币里有三种是进化和喊人的门槛，
 * 藏起来会让玩家在摊子上打了十发也不知道自己离下一阶还差多少。
 */
import * as PIXI from 'pixi.js';
import { EventBus } from '@/core/EventBus';
import { Game } from '@/core/Game';
import { BgmPlayer } from '@/core/BgmPlayer';
import { GMManager } from '@/core/GMManager';
import type { Scene } from '@/core/SceneManager';
import { SceneManager } from '@/core/SceneManager';
import { bindPointerTap } from '@/minigame';
import { UnitActor } from '@/fx/UnitActor';
import { LANE_TINT } from '@/ui/BenchDock';
import {
  CALL_COST, EVO_COST, SQUAD_CAP_MAX, nextCapLv, nextEvoCost, nextVillageCost,
  squadCap, villageCumExp, villageMul,
} from '@/balance/village';
import {
  LANE_NAME, ROLE_NAME, STAR_MAX, VILLAGERS, getVillager, type VillagerDef,
} from '@/balance/villagers';
import {
  PELLET_AD, TARGETS, TARGET_UNLOCK_LV, pelletCap, pelletRegenMin,
} from '@/balance/stall';
import { LAST_STAGE_ID, getStage } from '@/balance/stages';
import { adCanShow, adRecord } from '@/core/AdDay';
import { Platform } from '@/core/PlatformService';
import { track } from '@/core/Analytics';
import {
  buyEvo, callVillager, capOf, claimAdPellets, loadMemory, progressOf,
  settlePellets, setStageId, shootStall, stallAdLeft, stallPityLeft, totalStars,
  type RunMemory,
} from '@/core/RunMemory';
import { evoOf, starsOf } from '@/balance/village';
import { playSfx } from '@/core/SfxPlayer';
import {
  fillCover, heroTex, preloadVillageArt, uiTex, villageBgTex, watchArt, yardBgTex,
} from '@/core/TextureLoader';
import {
  GOLD, copperRust, expBar, fitSprite, goldBtn, ironSlab, label,
  nailCluster, nailRow, plate,
} from '@/ui/paint';

const CREAM = 0xfff4c4;
const INK = 0x2a160c;
const MUTED = 0x8a8a92;

type Page = 'home' | 'stall' | 'folks' | 'one';
const PAGES: readonly Page[] = ['home', 'stall', 'folks', 'one'];

/** 顶上资源条的高度。四种货币一行放得下，别换行 */
const BAR_H = 58;

function stars(n: number): string {
  return n > 0 ? `★${n}` : '';
}

function evoName(v: VillagerDef, stage: number): string {
  return v.evo[Math.max(0, Math.min(2, stage - 1))]!.name;
}

export class VillageScene implements Scene {
  readonly name = 'village';
  readonly container = new PIXI.Container();

  private readonly _layers = {} as Record<Page, PIXI.Container>;
  private _page: Page = 'home';
  private _mem: RunMemory = loadMemory();
  /** `one` 页看的是谁 */
  private _focus = '';
  private _adBusy = false;
  private _actors: UnitActor[] = [];
  /** 摊子上一发打中了什么。留着显示，别打完就没了 */
  private _lastShot = '';
  private _artTimer: ReturnType<typeof setTimeout> | 0 = 0;

  constructor() {
    for (const p of PAGES) {
      const layer = new PIXI.Container();
      layer.visible = false;
      this.container.addChild(layer);
      this._layers[p] = layer;
    }
    EventBus.on('home:refresh', () => {
      if (SceneManager.current?.name !== 'village') return;
      this._mem = loadMemory();
      this._render();
    });
    watchArt(() => {
      if (this._artTimer) clearTimeout(this._artTimer);
      this._artTimer = setTimeout(() => {
        this._artTimer = 0;
        if (SceneManager.current?.name === 'village') this._render();
      }, 220);
    });
  }

  onEnter(): void {
    preloadVillageArt();
    // 进村先把离线攒的弹子结算掉，玩家一眼看见「有多少发可以打」
    this._mem = settlePellets();
    this._page = 'home';
    this._adBusy = false;
    this._lastShot = '';
    BgmPlayer.play('home');
    this._render();
  }

  onExit(): void {
    if (this._artTimer) clearTimeout(this._artTimer);
    this._artTimer = 0;
    this._clearActors();
    BgmPlayer.stop();
  }

  update(dt: number): void {
    for (const a of this._actors) a.update(dt);
  }

  private _height(): number {
    return Game.designHeight;
  }

  private _clearActors(): void {
    for (const a of this._actors) a.destroy();
    this._actors = [];
  }

  private _open(page: Page): void {
    this._page = page;
    playSfx('ui_tap', 0);
    this._render();
  }

  /* ---------------- 渲染总入口 ---------------- */

  private _render(): void {
    this._clearActors();
    for (const p of PAGES) {
      const layer = this._layers[p];
      layer.visible = p === this._page;
      if (p !== this._page) continue;
      layer.removeChildren().forEach((c) => c.destroy({ children: true }));
    }
    const layer = this._layers[this._page];
    if (this._page === 'home') this._renderHome(layer);
    if (this._page === 'stall') this._renderStall(layer);
    if (this._page === 'folks') this._renderFolks(layer);
    if (this._page === 'one') this._renderOne(layer);
  }

  /* ---------------- 公共零件 ---------------- */

  private _backdrop(layer: PIXI.Container, art = villageBgTex()): void {
    const g = new PIXI.Graphics();
    const h = this._height();
    if (art && art.baseTexture.valid && art.width > 1) {
      fillCover(g, art, 0, 0, 750, h);
      g.beginFill(0x0c0a08, 0.22).drawRect(0, 0, 750, h).endFill();
    } else {
      g.beginFill(0x2a2018).drawRect(0, 0, 750, h).endFill();
    }
    layer.addChild(g);
  }

  /**
   * 顶上的村庄等级 + 四种资源。
   *
   * 四种货币一个都不许省。§5 定死只有这四种，代价就是它们**全都要常驻可见** ——
   * 零件卡进化、工分卡喊人，看不见就没法计划。
   */
  private _bar(layer: PIXI.Container): number {
    const top = Math.max(Game.safeTop, 20);
    const g = new PIXI.Graphics();
    // 资源条用锈铁板 + 一排钉子。§1 的硬约束：村里的东西都是捡来的破烂，
    // 不许出现干净的 UI 面板
    ironSlab(g, 16, top, 718, BAR_H * 2 + 10, 14);
    nailRow(g, 16, top + 8, 718, 6);
    layer.addChild(g);

    const lv = this._mem.villageLv;
    const lvTx = label(26, GOLD, true);
    lvTx.position.set(36, top + 14);
    lvTx.text = `村子 ${lv} 级`;
    layer.addChild(lvTx);

    const mulTx = label(17, CREAM, true);
    mulTx.position.set(36, top + 44);
    mulTx.text = `全村 +${Math.round((villageMul(lv) - 1) * 100)}% · 上场 ${squadCap(lv)} 人`;
    layer.addChild(mulTx);

    // 经验条。下一级要多少必须写出来，否则摊子上打十发不知道进度
    const need = nextVillageCost(lv);
    const bar = new PIXI.Graphics();
    if (need === undefined) {
      expBar(bar, 380, top + 20, 330, 1, true);
      const t = label(16, CREAM, true);
      t.anchor.set(1, 0);
      t.position.set(710, top + 38);
      t.text = '村子满级了';
      layer.addChild(t);
    } else {
      const base = villageCumExp(lv);
      const into = this._mem.villageExp - base;
      expBar(bar, 380, top + 20, 330, into / need, false);
      const t = label(16, CREAM, true);
      t.anchor.set(1, 0);
      t.position.set(710, top + 38);
      const capLv = nextCapLv(lv);
      t.text = capLv
        ? `${Math.max(0, Math.round(into))}/${need} · ${capLv} 级多上一人`
        : `${Math.max(0, Math.round(into))}/${need} · 已能上 ${SQUAD_CAP_MAX} 人`;
      layer.addChild(t);
    }
    layer.addChild(bar);

    const row = top + BAR_H + 16;
    const cells: readonly [string, number, number][] = [
      ['废铁', this._mem.scrap, 0xc4b8a0],
      ['零件', this._mem.parts, 0x6a8aaa],
      ['工分', this._mem.credits, 0xd9a13b],
      ['弹子', this._mem.pellets, 0xb4553f],
    ];
    cells.forEach(([name, val, tint], i) => {
      const cx = 36 + 176 * i + 80;
      const t = label(15, MUTED, true);
      t.anchor.set(0.5, 0);
      t.position.set(cx, row);
      t.text = name;
      layer.addChild(t);
      const v = label(26, tint, true);
      v.anchor.set(0.5, 0);
      v.position.set(cx, row + 18);
      v.text = `${Math.floor(val)}`;
      layer.addChild(v);
    });

    return top + BAR_H * 2 + 10;
  }

  private _btn(
    layer: PIXI.Container,
    cx: number,
    cy: number,
    w: number,
    h: number,
    text: string,
    onTap: () => void,
    opts: { sub?: string; enabled?: boolean; art?: 'settle_btn' | 'play_plate' } = {},
  ): PIXI.Container {
    const on = opts.enabled !== false;
    const box = new PIXI.Container();
    box.eventMode = on ? 'static' : 'none';
    box.interactiveChildren = false;
    box.position.set(cx, cy);
    box.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);

    if (!opts.art || !fitSprite(box, uiTex(opts.art), 0, 0, w, h)) {
      const g = new PIXI.Graphics();
      goldBtn(g, -w / 2, -h / 2, w, h);
      box.addChild(g);
    }
    const t = label(opts.sub ? 26 : 28, on ? CREAM : MUTED, true);
    t.anchor.set(0.5);
    t.position.set(0, opts.sub ? -12 : 0);
    t.text = text;
    box.addChild(t);
    if (opts.sub) {
      const s = label(16, on ? GOLD : MUTED, true);
      s.anchor.set(0.5);
      s.position.set(0, 16);
      s.text = opts.sub;
      box.addChild(s);
    }
    box.alpha = on ? 1 : 0.55;
    if (on) bindPointerTap(box, onTap);
    layer.addChild(box);
    return box;
  }

  private _back(layer: PIXI.Container, to: Page = 'home'): void {
    const y = this._height() - Game.safeBottom - 52;
    this._btn(layer, 375, y, 260, 76, '回村口', () => this._open(to));
  }

  /* ---------------- 主页 ---------------- */

  private _renderHome(layer: PIXI.Container): void {
    this._backdrop(layer);
    const top = this._bar(layer);
    const h = this._height();
    const mem = this._mem;
    const stage = getStage(mem.stageId);

    // 下一关。**出村必须是主页最大的那一笔** —— 村子是准备的地方，打是主体验
    const plaque = new PIXI.Graphics();
    plate(plaque, 40, top + 24, 670, 200, 16);
    layer.addChild(plaque);

    const st = label(30, GOLD, true);
    st.anchor.set(0.5, 0);
    st.position.set(375, top + 44);
    st.text = `${stage.label} ${stage.name}`;
    layer.addChild(st);

    const pitch = label(19, CREAM, true);
    pitch.anchor.set(0.5, 0);
    pitch.position.set(375, top + 84);
    pitch.text = stage.pitch;
    layer.addChild(pitch);

    // 敌方门路开战前就写明。§4.4：给信息，不给答案
    const lane = label(18, LANE_TINT[stage.mainLane], true);
    lane.anchor.set(0.5, 0);
    lane.position.set(375, top + 114);
    lane.text = `来的是「${LANE_NAME[stage.mainLane]}」· ${stage.waves.length} 波`;
    layer.addChild(lane);

    const prog = label(17, MUTED, true);
    prog.anchor.set(0.5, 0);
    prog.position.set(375, top + 146);
    prog.text = `打到 ${mem.stageTop}/${LAST_STAGE_ID} 关 · 累计 ${totalStars(mem)} 星`;
    layer.addChild(prog);

    // 挑关。只在打过的范围里选，不给跳关
    if (mem.stageTop > 1) {
      this._btn(layer, 160, top + 254, 200, 66, '上一关', () => {
        this._mem = setStageId(Math.max(1, mem.stageId - 1));
        this._render();
      }, { enabled: mem.stageId > 1 });
      this._btn(layer, 590, top + 254, 200, 66, '下一关', () => {
        this._mem = setStageId(Math.min(mem.stageTop, mem.stageId + 1));
        this._render();
      }, { enabled: mem.stageId < mem.stageTop });
    }

    this._btn(layer, 375, top + 254, 220, 84, '出村', () => {
      SceneManager.switchTo('battle', { stageId: mem.stageId });
    }, { art: 'play_plate' });

    // 两个门。弹子有富余时摊子那扇门喘一下，否则新手会攒着不打
    const doorY = h - Game.safeBottom - 220;
    this._door(layer, 210, doorY, '弹弓摊', `${mem.pellets} 发`, 'stall');
    this._door(layer, 540, doorY, '村民', `${mem.roster.length}/${VILLAGERS.length} 人`, 'folks');

    // 村口站两个人。谁站这儿：阶数最高的那两个，那是玩家的成果
    const front = [...mem.roster]
      .sort((a, b) => evoOf(progressOf(mem), b) - evoOf(progressOf(mem), a))
      .slice(0, 2);
    front.forEach((id, i) => {
      const v = getVillager(id);
      const a = new UnitActor();
      a.bindHero(v.id, v.lane, evoOf(progressOf(mem), id));
      a.place(i === 0 ? 176 : 574, doorY - 46, 132);
      layer.addChild(a.view);
      this._actors.push(a);
    });

    if (GMManager.isEnabled) {
      this._btn(layer, 640, top + 336, 180, 56, 'GM 送资源', () => {
        EventBus.emit('gm:open');
      });
    }
  }

  private _door(
    layer: PIXI.Container,
    cx: number,
    cy: number,
    title: string,
    sub: string,
    to: Page,
  ): void {
    const w = 280;
    const h = 132;
    const box = new PIXI.Container();
    box.eventMode = 'static';
    box.interactiveChildren = false;
    box.position.set(cx, cy);
    box.hitArea = new PIXI.Rectangle(-w / 2, -h / 2, w, h);
    const g = new PIXI.Graphics();
    ironSlab(g, -w / 2, -h / 2, w, h, 14);
    nailCluster(g, 0, h / 2 - 14, 5, 3);
    box.addChild(g);
    const t = label(30, GOLD, true);
    t.anchor.set(0.5);
    t.position.set(0, -18);
    t.text = title;
    box.addChild(t);
    const s = label(19, CREAM, true);
    s.anchor.set(0.5);
    s.position.set(0, 22);
    s.text = sub;
    box.addChild(s);
    bindPointerTap(box, () => this._open(to));
    layer.addChild(box);
  }

  /* ---------------- 弹弓摊 ---------------- */

  private _renderStall(layer: PIXI.Container): void {
    this._backdrop(layer, yardBgTex() ?? villageBgTex());
    const top = this._bar(layer);
    const mem = this._mem;
    const cap = pelletCap(mem.villageLv);

    const g = new PIXI.Graphics();
    ironSlab(g, 40, top + 20, 670, 132, 16);
    copperRust(g, 48, top + 28, 654, 116);
    layer.addChild(g);

    const title = label(30, GOLD, true);
    title.anchor.set(0.5, 0);
    title.position.set(375, top + 36);
    title.text = `手上 ${mem.pellets}/${cap} 发`;
    layer.addChild(title);

    const regen = label(18, CREAM, true);
    regen.anchor.set(0.5, 0);
    regen.position.set(375, top + 76);
    regen.text = mem.pellets >= cap
      ? '满了，快去打几发'
      : `${pelletRegenMin(mem.villageLv)} 分钟回一发`;
    layer.addChild(regen);

    // 工分保底要写出来。工分是喊人的唯一门槛，看不见还差几发会以为它不出
    const pity = label(17, 0xd9a13b, true);
    pity.anchor.set(0.5, 0);
    pity.position.set(375, top + 108);
    pity.text = `再 ${stallPityLeft(mem)} 发必出 1 工分`;
    layer.addChild(pity);

    // 靶面。哪个靶给什么必须明摆着，玩家才知道自己在打什么
    const listY = top + 176;
    TARGETS.forEach((t, i) => {
      const open = mem.villageLv >= (targetLv(t.id));
      const y = listY + i * 62;
      const row = new PIXI.Graphics();
      plate(row, 40, y, 670, 54, 10);
      layer.addChild(row);

      const nm = label(21, open ? CREAM : MUTED, true);
      nm.position.set(62, y + 14);
      nm.text = open ? t.name : '??? 未挂上墙';
      layer.addChild(nm);

      const gain = label(18, open ? GOLD : MUTED, true);
      gain.anchor.set(1, 0);
      gain.position.set(688, y + 16);
      gain.text = open ? gainLine(t) : `${targetLv(t.id)} 级挂上`;
      layer.addChild(gain);
    });

    if (this._lastShot) {
      const shot = label(22, 0x9be08a, true);
      shot.anchor.set(0.5, 0);
      shot.position.set(375, listY + TARGETS.length * 62 + 8);
      shot.text = this._lastShot;
      layer.addChild(shot);
    }

    const btnY = this._height() - Game.safeBottom - 148;
    this._btn(layer, 240, btnY, 300, 92, '打一发', () => this._shoot(), {
      sub: mem.pellets > 0 ? `剩 ${mem.pellets} 发` : '没弹子了',
      enabled: mem.pellets > 0,
      art: 'settle_btn',
    });

    const adLeft = stallAdLeft();
    this._btn(layer, 540, btnY, 260, 92, '看一段', () => { void this._adPellets(); }, {
      sub: adLeft > 0 ? `+${PELLET_AD} 发 · 今天还剩 ${adLeft} 次` : '今天看完了',
      enabled: adLeft > 0 && !this._adBusy,
    });

    this._back(layer);
  }

  private _shoot(): void {
    const res = shootStall();
    if (!res) {
      Platform.showToast('没弹子了，等等或者看一段');
      return;
    }
    this._mem = res.mem;
    const { hit, gain, rebounds } = res.result;
    const parts: string[] = [];
    if (gain.exp > 0) parts.push(`村子经验 +${Math.round(gain.exp)}`);
    if (gain.scrap > 0) parts.push(`废铁 +${Math.round(gain.scrap)}`);
    if (gain.parts > 0) parts.push(`零件 +${Math.round(gain.parts)}`);
    if (gain.credits > 0) parts.push(`工分 +${Math.round(gain.credits)}`);
    this._lastShot = `打中${hit.name}${rebounds > 0 ? ` ·连 ${rebounds} 下` : ''} → ${parts.join(' ')}`;
    track('stall_shot', {
      target: hit.id, rebounds, village_lv: this._mem.villageLv, left: this._mem.pellets,
    });
    playSfx(rebounds > 0 ? 'kill_pop' : 'install_on', 0);
    this._render();
  }

  private async _adPellets(): Promise<void> {
    if (this._adBusy) return;
    this._adBusy = true;
    try {
      track('ad_show', { placement: 'stallPellets' });
      const ok = await Platform.showRewardedVideo();
      track('ad_close', { placement: 'stallPellets', completed: ok });
      if (!ok) {
        Platform.showToast('没看完，没给弹子');
        return;
      }
      const mem = claimAdPellets();
      if (!mem) {
        Platform.showToast('今天的次数用完了');
        return;
      }
      this._mem = mem;
      Platform.showToast(`弹子 +${PELLET_AD}`, 'success');
    } finally {
      this._adBusy = false;
      this._render();
    }
  }

  /* ---------------- 村民 ---------------- */

  private _renderFolks(layer: PIXI.Container): void {
    this._backdrop(layer);
    const top = this._bar(layer);
    const mem = this._mem;
    const p = progressOf(mem);
    const owned = new Set(mem.roster);
    const seen = new Set(mem.seenIds);

    const head = label(22, CREAM, true);
    head.anchor.set(0.5, 0);
    head.position.set(375, top + 18);
    head.text = `入伙 ${mem.roster.length}/${VILLAGERS.length} · 这一关能上 ${capOf(mem)} 个`;
    layer.addChild(head);

    // 喊人。工分不够时按钮灰着但留在原位，玩家才知道工分是拿来干这个的
    const enough = mem.credits >= CALL_COST;
    this._btn(layer, 375, top + 72, 400, 76, '喊一嗓子', () => this._call(), {
      sub: `${CALL_COST} 工分 · 手上 ${mem.credits}`,
      enabled: enough,
      art: 'settle_btn',
    });

    // 五列按门路分。克制是主决策，所以名单按门路排，不按入伙顺序
    const gridTop = top + 126;
    const cols = 4;
    const cw = 170;
    const chh = 118;
    VILLAGERS.forEach((v, i) => {
      const x = 44 + (i % cols) * cw;
      const y = gridTop + Math.floor(i / cols) * chh;
      const has = owned.has(v.id);
      const known = has || seen.has(v.id);

      const box = new PIXI.Container();
      box.eventMode = has ? 'static' : 'none';
      box.interactiveChildren = false;
      box.position.set(x, y);
      box.hitArea = new PIXI.Rectangle(0, 0, cw - 12, chh - 12);

      const g = new PIXI.Graphics();
      plate(g, 0, 0, cw - 12, chh - 12, 10);
      g.beginFill(LANE_TINT[v.lane], has ? 0.42 : 0.12)
        .drawRoundedRect(0, 0, cw - 12, 5, 3).endFill();
      box.addChild(g);

      const face = fitSprite(box, heroTex(v.id), (cw - 12) / 2, 40, 58, 58);
      if (face && !has) face.tint = 0x4a4a52;

      const nm = label(18, has ? CREAM : MUTED, true);
      nm.anchor.set(0.5, 0);
      nm.position.set((cw - 12) / 2, 72);
      nm.text = known ? v.name : '???';
      box.addChild(nm);

      const tag = label(14, has ? LANE_TINT[v.lane] : MUTED, true);
      tag.anchor.set(0.5, 0);
      tag.position.set((cw - 12) / 2, 94);
      tag.text = has
        ? `${'一二三'[evoOf(p, v.id) - 1]}阶 ${stars(starsOf(p, v.id))}`.trim()
        : known ? `${LANE_NAME[v.lane]}·${ROLE_NAME[v.role]}` : '还没见过';
      box.addChild(tag);

      if (has) {
        bindPointerTap(box, () => {
          this._focus = v.id;
          this._open('one');
        });
      } else {
        box.alpha = 0.5;
      }
      layer.addChild(box);
    });

    this._back(layer);
  }

  private _call(): void {
    const res = callVillager();
    if (!res) {
      Platform.showToast(`还差 ${CALL_COST - this._mem.credits} 工分`);
      return;
    }
    this._mem = res.mem;
    const v = getVillager(res.got);
    track('call_villager', {
      got: res.got, is_new: res.isNew, roster: this._mem.roster.length,
    });
    if (res.isNew) {
      playSfx('win', 0);
      Platform.showToast(`${v.name} 入伙了 · ${v.job}`, 'success');
    } else {
      const to = res.starTo ? getVillager(res.starTo).name : '';
      playSfx('install_on', 0);
      Platform.showToast(to ? `又来一个${v.name}，${to} 多一颗星` : `又来一个${v.name}，折了废铁`);
    }
    this._render();
  }

  /* ---------------- 单个村民 ---------------- */

  private _renderOne(layer: PIXI.Container): void {
    this._backdrop(layer);
    const top = this._bar(layer);
    const mem = this._mem;
    const p = progressOf(mem);
    let v: VillagerDef;
    try {
      v = getVillager(this._focus);
    } catch {
      this._open('folks');
      return;
    }
    const stage = evoOf(p, v.id);
    const star = starsOf(p, v.id);

    const g = new PIXI.Graphics();
    ironSlab(g, 40, top + 20, 670, 148, 16);
    layer.addChild(g);

    const nm = label(34, GOLD, true);
    nm.anchor.set(0.5, 0);
    nm.position.set(375, top + 34);
    nm.text = `${v.name} · ${evoName(v, stage)}`;
    layer.addChild(nm);

    const tag = label(20, LANE_TINT[v.lane], true);
    tag.anchor.set(0.5, 0);
    tag.position.set(375, top + 78);
    tag.text = `${LANE_NAME[v.lane]} · ${ROLE_NAME[v.role]} · ${'一二三'[stage - 1]}阶 ${stars(star)}`.trim();
    layer.addChild(tag);

    // 「别人替不了的活」。§6 要求每个人都能回答这一句，进化页是它最该出现的地方
    const job = label(18, CREAM, true);
    job.anchor.set(0.5, 0);
    job.position.set(375, top + 110);
    job.text = v.job;
    layer.addChild(job);

    const star2 = label(16, star >= STAR_MAX ? 0x9be08a : MUTED, true);
    star2.anchor.set(0.5, 0);
    star2.position.set(375, top + 138);
    star2.text = star >= STAR_MAX
      ? '星满了，再喊到他只折废铁'
      : `喊到重的会给他加星（每星 +8%，最多 ★${STAR_MAX}）`;
    layer.addChild(star2);

    /*
     * 三阶并排站。**进化前必须看得见「喂完他会变成什么样」**（§4.1）。
     *
     * 一排三个立绘用的是真的 UnitActor，穿戴和手上的家伙都按那一阶取 ——
     * 这样这一屏和局内看到的是同一个人，不是宣传图。
     */
    const rowY = top + 380;
    for (let s = 1; s <= 3; s += 1) {
      const cx = 150 + (s - 1) * 225;
      const on = s <= stage;

      const card = new PIXI.Graphics();
      plate(card, cx - 104, top + 190, 208, 268, 12);
      if (s === stage) {
        card.lineStyle(3, GOLD, 0.9).drawRoundedRect(cx - 104, top + 190, 208, 268, 12);
      }
      layer.addChild(card);

      const a = new UnitActor();
      a.bindHero(v.id, v.lane, s);
      a.place(cx, rowY, 148);
      a.view.alpha = on ? 1 : 0.42;
      layer.addChild(a.view);
      this._actors.push(a);

      const sn = label(19, on ? CREAM : MUTED, true);
      sn.anchor.set(0.5, 0);
      sn.position.set(cx, top + 200);
      sn.text = `${'一二三'[s - 1]}阶 ${evoName(v, s)}`;
      layer.addChild(sn);

      // 这一阶身上多了什么、打法怎么变。数值不写在这儿：进化改的是形态和打法
      const pitch = label(15, on ? GOLD : MUTED, true);
      pitch.anchor.set(0.5, 0);
      pitch.position.set(cx, rowY + 14);
      pitch.style.wordWrap = true;
      pitch.style.wordWrapWidth = 188;
      pitch.style.align = 'center';
      pitch.text = v.evo[s - 1]!.pitch;
      layer.addChild(pitch);
    }

    const cost = nextEvoCost(stage);
    const btnY = this._height() - Game.safeBottom - 150;
    if (!cost) {
      const done = label(24, 0x9be08a, true);
      done.anchor.set(0.5);
      done.position.set(375, btnY);
      done.text = '已经喂到三阶了';
      layer.addChild(done);
    } else {
      const can = mem.scrap >= cost.scrap && mem.parts >= cost.parts;
      this._btn(layer, 375, btnY, 420, 92, `喂到${'一二三'[stage]}阶`, () => this._evolve(v.id), {
        sub: `${cost.scrap} 废铁 + ${cost.parts} 零件${can ? '' : '（不够）'}`,
        enabled: can,
        art: 'settle_btn',
      });
      if (!can) {
        // 缺什么就说去哪儿弄。§4.4 的下一手必须指向具体动作，不许只说「资源不足」
        const lack = label(17, MUTED, true);
        lack.anchor.set(0.5, 0);
        lack.position.set(375, btnY + 56);
        lack.text = mem.parts < cost.parts
          ? '零件只有摊子的破电视出，去打几发'
          : '废铁主要靠通关结算，去推一关';
        layer.addChild(lack);
      }
    }

    this._back(layer, 'folks');
  }

  private _evolve(id: string): void {
    const mem = buyEvo(id);
    if (!mem) {
      Platform.showToast('材料不够');
      return;
    }
    this._mem = mem;
    const v = getVillager(id);
    const now = evoOf(progressOf(mem), id);
    track('evolve', { id, to: now, village_lv: mem.villageLv });
    playSfx('win', 0);
    Platform.showToast(`${v.name} → ${evoName(v, now)}`, 'success');
    this._render();
  }
}

/** 靶子的解锁等级。表里没写的默认一开始就挂在墙上 */
function targetLv(id: string): number {
  return TARGET_UNLOCK_LV[id] ?? 1;
}

/** 靶面那一行收益 */
function gainLine(t: (typeof TARGETS)[number]): string {
  const out: string[] = [];
  if (t.exp > 0) out.push(`经验 ${t.exp}`);
  if (t.scrap > 0) out.push(`废铁 ${t.scrap}`);
  if (t.parts > 0) out.push(`零件 ${t.parts}`);
  if (t.credits > 0) out.push(`工分 ${t.credits}`);
  if (t.rebound) out.push('免费再来一发');
  return out.join(' · ');
}
