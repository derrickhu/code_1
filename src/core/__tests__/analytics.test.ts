import { describe, expect, it, beforeEach } from 'vitest';
import { recentEvents, resetAnalytics, track } from '@/core/Analytics';

describe('切片埋点', () => {
  beforeEach(() => {
    resetAnalytics();
  });

  it('文档要求的事件都能记下来', () => {
    track('run_start', { seed: 1, opening_heroes: ['tiezhu'] });
    track('pick_show', { wave: 2, options: ['pipe'], kinds: ['pivot'] });
    track('pick_choose', { wave: 2, mod_id: 'pipe', kind: 'pivot' });
    track('mod_install', { wave: 2, mod_id: 'pipe', target_hero: 'tiezhu', target_slot: 0, target_mod_count: 1 });
    track('queue_change', { wave: 2, order_before: ['tiezhu'], order_after: ['erjiu'] });
    track('hero_down', { wave: 2, hero_id: 'tiezhu', slot: 0 });
    track('wave_clear', { wave: 1, duration_ms: 8000, alive_count: 3 });
    track('ad_show', { placement: 'revive', wave: 9 });
    track('ad_close', { placement: 'revive', wave: 9, completed: true });
    track('run_end', { reached_wave: 9, cleared: false, duration_ms: 120000, installs: 3 });

    const names = recentEvents().map((e) => e.name);
    expect(names).toEqual([
      'run_start',
      'pick_show',
      'pick_choose',
      'mod_install',
      'queue_change',
      'hero_down',
      'wave_clear',
      'ad_show',
      'ad_close',
      'run_end',
    ]);
    expect(recentEvents()[0]?.payload.opening_heroes).toEqual(['tiezhu']);
  });
});
