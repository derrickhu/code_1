import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STAGES, getStage } from '@/balance/stages';
import { battlePreloadImages, stageBossArt } from '@/config/assetPreload';
import { bossArtId, enemyArtPath } from '@/core/TextureLoader';

const root = join(__dirname, '..', '..', '..');

/** 每章收尾那关 */
function bossStage(chapter: number) {
  return STAGES.find((s) => s.chapter === chapter && s.index === 5)!;
}

describe('大个子专属立绘', () => {
  it('配到的每张图都在 assets 里', () => {
    const all = new Set<string>();
    for (const s of STAGES) for (const id of stageBossArt(s)) all.add(id);
    expect(all.size).toBeGreaterThanOrEqual(11);
    for (const id of all) expect(existsSync(join(root, 'assets', enemyArtPath(id))), id).toBe(true);
  });

  it('前 8 章每章一只，不重样', () => {
    const seen = [1, 2, 3, 4, 5, 6, 7, 8].map((c) => {
      const s = bossStage(c);
      const last = s.waves[s.waves.length - 1]!.groups.find((g) => g.boss)!;
      return bossArtId(last.enemy, c);
    });
    expect(new Set(seen).size).toBe(8);
  });

  it('有大个子的关会预拉它的图', () => {
    const s = bossStage(4);
    const paths = battlePreloadImages(s.id, []);
    for (const id of stageBossArt(s)) expect(paths).toContain(enemyArtPath(id));
    // 教学关那只小灰大个子也有正经造型
    expect(stageBossArt(getStage(1))).toEqual(['boss_grey']);
  });

  it('每种当过大个子的怪都有专属造型', () => {
    for (const s of STAGES) {
      for (const w of s.waves) {
        for (const g of w.groups) if (g.boss) expect(bossArtId(g.enemy, s.chapter), `${s.id} ${g.enemy}`).not.toBeNull();
      }
    }
    expect(bossArtId('spring', 3)).toBeNull();
  });
});
