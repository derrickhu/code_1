import { describe, expect, it, beforeEach } from 'vitest';
import { recentEvents, resetAnalytics, track } from '@/core/Analytics';

describe('切片埋点', () => {
  beforeEach(() => {
    resetAnalytics();
  });

  it('这一版要回答的问题都埋到了', () => {
    track('run_start', { stage_id: 3, village_lv: 4, squad: ['tiezhu'], lanes: [1] });
    track('place_change', { stage_id: 3, placed: 4, lanes: [0, 1, 1, 2] });
    track('stall_shot', { target: 'tv', rebounds: 0, village_lv: 4, left: 7 });
    track('call_villager', { got: 'dianju', is_new: true, roster: 8 });
    track('evolve', { id: 'tiezhu', to: 2, village_lv: 4 });
    track('ad_show', { placement: 'revive', stage_id: 3 });
    track('ad_close', { placement: 'revive', stage_id: 3, completed: true });
    track('run_end', { stage_id: 3, won: false, stars: 0, leaked: 3, lose_reason: 'leak' });

    const names = recentEvents().map((e) => e.name);
    expect(names).toEqual([
      'run_start',
      'place_change',
      'stall_shot',
      'call_villager',
      'evolve',
      'ad_show',
      'ad_close',
      'run_end',
    ]);
    expect(recentEvents()[0]?.payload.squad).toEqual(['tiezhu']);
  });

  /*
   * 败因必须进埋点。这一版的失败有两种（漏怪 / 超时），
   * 而超时是玩家读不懂的失败 —— 线上占比要是压不住 §8.1 那条（≤10%），
   * 只能靠这个字段发现。
   */
  it('结算带得上败因', () => {
    track('run_end', { stage_id: 12, won: false, stars: 0, leaked: 0, lose_reason: 'timeout' });
    expect(recentEvents()[0]?.payload.lose_reason).toBe('timeout');
  });
});
