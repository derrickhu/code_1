import { describe, expect, it } from 'vitest';
import { waitAskLabel } from '@/ui/waitAsk';

describe('等他的按钮', () => {
  it('还没等谁，按钮是就等他', () => {
    expect(waitAskLabel('', 'dianju')).toBe('就等他');
  });

  it('已经在等他，按钮是不等了', () => {
    expect(waitAskLabel('dianju', 'dianju')).toBe('不等了');
  });

  it('在等别人，按钮是改等他', () => {
    expect(waitAskLabel('dianju', 'shazhu')).toBe('改等他');
  });
});
