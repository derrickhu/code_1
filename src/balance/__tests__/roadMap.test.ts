import { describe, expect, it } from 'vitest';

import {
  ROAD_PATH, clampRoadChapter, formatRoadPathSnippet, homeRoadBrief, lastClearedStage,
  parseRoadEnter, roadChapterLine, roadCoverFit, roadMaxChapter, roadNodeAt, roadNodeKind,
  roadScreenToUv, roadStandStage, roadUvToScreen, roadWalkPlan, roadWalkUv, type RoadMem,
} from '@/balance/roadMap';
import { chapterTitle, getStage, stagesOfChapter } from '@/balance/stages';

function mem(partial: Partial<RoadMem> = {}): RoadMem {
  return {
    stageId: 1,
    stageTop: 1,
    stageStars: {},
    ...partial,
  };
}

describe('章节路径', () => {
  it('一章 5 个节点，章名跟关卡表对得上', () => {
    expect(ROAD_PATH).toHaveLength(5);
    for (let i = 1; i < ROAD_PATH.length; i += 1) {
      expect(ROAD_PATH[i]!.y).toBeLessThan(ROAD_PATH[i - 1]!.y);
    }
    expect(ROAD_PATH[0]!.x).toBeGreaterThan(0.48);
    expect(ROAD_PATH[1]!.x).toBeLessThan(0.42);
    expect(ROAD_PATH[2]!.x).toBeGreaterThan(0.62);
    expect(ROAD_PATH[3]!.x).toBeLessThan(0.48);
    expect(ROAD_PATH[4]!.x).toBeGreaterThan(0.54);
    const ch1 = stagesOfChapter(1);
    expect(ch1).toHaveLength(5);
    expect(ch1.map((s) => s.label)).toEqual(['1-1', '1-2', '1-3', '1-4', '1-5']);
    expect(chapterTitle(1)).toBe('村口');
    expect(chapterTitle(4)).toBe('飞碟');
    expect(roadChapterLine(1)).toBe('1-1');
    expect(roadChapterLine(7)).toBe('2-2');
  });

  it('节点三态：当前关可打，过了的亮着，没打到的锁着', () => {
    const m = mem({ stageId: 3, stageTop: 3, stageStars: { 1: 3, 2: 2 } });
    expect(roadNodeKind(1, m)).toBe('cleared');
    expect(roadNodeKind(2, m)).toBe('cleared');
    expect(roadNodeKind(3, m)).toBe('active');
    expect(roadNodeKind(4, m)).toBe('locked');
  });

  it('路上的人站在当前关；回看已通的章站在章尾', () => {
    const m = mem({ stageId: 7, stageTop: 7 });
    expect(roadStandStage(2, m).label).toBe('2-2');
    expect(roadStandStage(1, m).label).toBe('1-5');
    expect(roadMaxChapter(7)).toBe(2);
    expect(clampRoadChapter(9, 7)).toBe(2);
    expect(clampRoadChapter(0, 7)).toBe(1);
  });

  it('同章走路从这一关到下一关，跨章从屏外走上新章第 1 关', () => {
    const same = roadWalkPlan(1, 2);
    expect(same).toEqual({ chapter: 1, fromIndex: 0, toIndex: 1, enterId: 2 });
    const cross = roadWalkPlan(5, 6);
    expect(cross).toEqual({ chapter: 2, fromIndex: null, toIndex: 0, enterId: 6 });
    expect(roadWalkPlan(2, 2)).toBeUndefined();
    const mid = roadWalkUv(0, 1, 0.5);
    expect(mid.x).toBeCloseTo((ROAD_PATH[0]!.x + ROAD_PATH[1]!.x) / 2);
    expect(mid.y).toBeCloseTo((ROAD_PATH[0]!.y + ROAD_PATH[1]!.y) / 2);
  });

  it('主界面只报最近通关，不拿来切关', () => {
    expect(homeRoadBrief(mem())).toEqual({ title: '1-1', sub: '还没出过村' });
    expect(lastClearedStage(mem())).toBeUndefined();
    const after = mem({ stageId: 4, stageTop: 4, stageStars: { 1: 2, 3: 3 } });
    expect(lastClearedStage(after)?.label).toBe('1-3');
    expect(homeRoadBrief(after)).toEqual({ title: '1-3 ★★★', sub: '下一关 1-4' });
  });

  it('cover 之后节点仍落在屏内', () => {
    for (const [w, h] of [[750, 1334], [750, 1624]] as const) {
      const fit = roadCoverFit(w, h);
      expect(fit.scale).toBeGreaterThan(0);
      for (let i = 0; i < ROAD_PATH.length; i += 1) {
        const p = roadNodeAt(i, w, h);
        expect(p.x).toBeGreaterThan(40);
        expect(p.x).toBeLessThan(w - 40);
        expect(p.y).toBeGreaterThan(40);
        expect(p.y).toBeLessThan(h - 40);
        const q = roadUvToScreen(ROAD_PATH[i]!, w, h);
        expect(q).toEqual(p);
      }
    }
  });

  it('屏上坐标能反推回底图 UV', () => {
    for (const [w, h] of [[750, 1334], [750, 1624]] as const) {
      for (const uv of ROAD_PATH) {
        const p = roadUvToScreen(uv, w, h);
        const back = roadScreenToUv(p, w, h);
        expect(back.x).toBeCloseTo(uv.x, 5);
        expect(back.y).toBeCloseTo(uv.y, 5);
      }
    }
    const snippet = formatRoadPathSnippet(ROAD_PATH);
    expect(snippet).toContain('export const ROAD_PATH');
    expect(snippet).toContain('{ x: 0.5515, y: 0.8557 }');
  });

  it('进路参数只认整数关卡 id', () => {
    expect(parseRoadEnter(undefined)).toEqual({});
    expect(parseRoadEnter({ walkFrom: 3, walkTo: 4, chapter: 1 })).toEqual({
      chapter: 1, walkFrom: 3, walkTo: 4,
    });
    expect(parseRoadEnter({ walkFrom: 'x' }).walkFrom).toBeUndefined();
  });
});
