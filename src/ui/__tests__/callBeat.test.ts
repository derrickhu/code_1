import { describe, expect, it } from 'vitest';
import { CALL_DUP_SCRAP } from '@/balance/village';
import { VILLAGERS } from '@/balance/villagers';
import { callBeat } from '@/ui/callBeat';

describe('callBeat', () => {
  it('新人写入伙，不写抽到、不上稀有度', () => {
    const beat = callBeat('dachui', true, undefined, 4);
    expect(beat.kind).toBe('join');
    expect(beat.title).toBe('王大锤入伙了');
    expect(beat.job).toContain('锤');
    expect(beat.sub).toBe(`4/${VILLAGERS.length} 人 · 从村道那边过来`);
    expect(beat.title).not.toMatch(/SSR|金|抽/);
  });

  it('喊重了是捎东西加星，不说碎片', () => {
    const beat = callBeat('dachui', false, 'tiezhu', 8);
    expect(beat.kind).toBe('star');
    expect(beat.title).toBe('又来一个王大锤');
    expect(beat.sub).toContain('铁柱');
    expect(beat.sub).toContain('星');
    expect(beat.sub).not.toMatch(/碎片|重复/);
  });

  it('星满了只折废铁', () => {
    const beat = callBeat('dachui', false, undefined, 20);
    expect(beat.kind).toBe('scrap');
    expect(beat.sub).toContain(String(CALL_DUP_SCRAP));
    expect(beat.sub).toContain('废铁');
  });
});
