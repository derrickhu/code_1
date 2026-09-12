import { describe, expect, it } from 'vitest';
import {
  BATTLE_FX_IMAGES,
  DEFERRED_PRELOAD_IMAGES,
  MAIN_PRELOAD_IMAGES,
  battlePreloadImages,
  defaultHomePeople,
  stallPreloadImages,
  stageEnemyIds,
  villageArtDump,
  villageHomeImages,
} from '@/config/assetPreload';
import { ENEMIES, getStage } from '@/balance/stages';
import { TARGETS } from '@/balance/stall';
import { VILLAGERS } from '@/balance/villagers';
import { LOADING_SPLASH, LOADING_TITLE, enemyArtId, uiPath } from '@/core/TextureLoader';

const VILLAGER_IDS = new Set(VILLAGERS.map((v) => v.id));

function heroIdsIn(paths: readonly string[]): string[] {
  const ids = new Set<string>();
  for (const p of paths) {
    const m = p.match(/^images\/(?:hero|anim)\/([a-z0-9]+)/);
    if (m?.[1] && VILLAGER_IDS.has(m[1])) ids.add(m[1]);
  }
  return [...ids].sort();
}

describe('首屏预加载预算', () => {
  it('启动只等包内插画和标题，不拉 CDN 图，也不带分包路径', () => {
    expect([...MAIN_PRELOAD_IMAGES]).toEqual([LOADING_SPLASH, LOADING_TITLE]);
    for (const p of MAIN_PRELOAD_IMAGES) {
      expect(p.startsWith('images/boot/')).toBe(true);
      expect(p.startsWith('subpackages/')).toBe(false);
    }
  });

  it('首屏不含英雄立绘、动画、敌人、特效', () => {
    const leaked = MAIN_PRELOAD_IMAGES.filter((p) =>
      /images\/(hero|anim|enemy|vfx|proj|mod|wep|fx|bg|ui)\//.test(p),
    );
    expect(leaked).toEqual([]);
  });

  it('延后集与首屏集不重叠', () => {
    const dup = DEFERRED_PRELOAD_IMAGES.filter((p) => MAIN_PRELOAD_IMAGES.includes(p));
    expect(dup).toEqual([]);
  });

  it('延后集只补村口壳，不含全村民动画', () => {
    const leaked = DEFERRED_PRELOAD_IMAGES.filter((p) =>
      p.startsWith('images/hero/') || p.startsWith('images/anim/') || p.startsWith('images/enemy/'),
    );
    expect(leaked).toEqual([]);
    expect(DEFERRED_PRELOAD_IMAGES.every((p) => p.startsWith('subpackages/pkg-home'))).toBe(true);
  });

  it('村口第一眼只拉场上的人，不把全集塞进 Loading', () => {
    const home = villageHomeImages(defaultHomePeople());
    const dump = villageArtDump();
    expect(home.length).toBeGreaterThan(10);
    expect(home.length).toBeLessThan(dump.length / 2);
    expect(dump.length).toBeGreaterThan(150);

    const homeHeroes = heroIdsIn(home);
    expect(homeHeroes).toEqual(['dachui', 'laoyanqiang', 'tiezhu']);
    expect(homeHeroes).not.toContain('guogai');
    expect(home.some((p) => p.includes('_evo2') || p.includes('_evo3'))).toBe(false);
  });

  it('战斗只拉本局上场的人和本关敌人，不拉全表', () => {
    const stage = getStage(1);
    const battle = battlePreloadImages(1, [
      { id: 'tiezhu', evo: 1, lane: 'stand' },
    ]);
    const battleHeroes = heroIdsIn(battle);
    expect(battleHeroes).toEqual(['tiezhu']);
    for (const v of VILLAGERS) {
      if (v.id === 'tiezhu') continue;
      expect(battleHeroes, v.id).not.toContain(v.id);
    }

    const neededArt = new Set(stageEnemyIds(stage).map(enemyArtId));
    for (const e of ENEMIES) {
      const art = enemyArtId(e.id);
      const present = battle.some((p) => p === `images/enemy/${art}.png` || p.includes(`/anim/${art}_`));
      expect(present, e.id).toBe(neededArt.has(art));
    }

    const fxLeak = BATTLE_FX_IMAGES.filter((p) => battle.includes(p));
    expect(fxLeak).toEqual([]);
  });

  it('弹弓摊货架靶图都在预载名单里，走统一 uiPath', () => {
    const paths = stallPreloadImages();
    const names = ['stall_cans', 'stall_bottles', 'stall_tv', 'stall_crate', 'stall_basin', 'stall_horn', 'stall_sling'] as const;
    for (const name of names) {
      expect(paths, name).toContain(uiPath(name));
    }
    expect(TARGETS.map((t) => t.id)).toEqual(['cans', 'bottles', 'tv', 'crate', 'basin', 'horn']);
  });
});
