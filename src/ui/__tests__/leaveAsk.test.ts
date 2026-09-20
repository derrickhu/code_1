import { describe, expect, it } from 'vitest';
import { leaveAskCopy } from '@/ui/LeaveAskOverlay';

describe('leaveAskCopy', () => {
  it('开打后再走要把这局不算说清楚', () => {
    const copy = leaveAskCopy(true);
    expect(copy.title).toBe('先撤？');
    expect(copy.body).toContain('这局不算');
    expect(copy.stay).toBe('接着打');
    expect(copy.leave).toBe('回路上');
  });

  it('布阵离开不算弃关，只问一句', () => {
    const copy = leaveAskCopy(false);
    expect(copy.title).toBe('回路上？');
    expect(copy.body).toContain('排法');
    expect(copy.stay).toBe('接着摆');
    expect(copy.leave).toBe('回路上');
  });
});
