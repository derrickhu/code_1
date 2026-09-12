import { describe, expect, it, vi } from 'vitest';

import { safeDestroy } from '@/utils/safeDestroy';

describe('safeDestroy', () => {
  it('destroyed 的不再调 destroy', () => {
    const destroy = vi.fn();
    safeDestroy({ destroyed: true, destroy } as { destroyed: boolean });
    expect(destroy).not.toHaveBeenCalled();
  });

  it('二次 destroy 抛错也不往外冒', () => {
    const obj = {
      destroyed: false,
      destroy() {
        if (this.destroyed) throw new Error("Cannot read properties of null (reading 'refCount')");
        this.destroyed = true;
      },
    };
    safeDestroy(obj);
    safeDestroy(obj);
    expect(obj.destroyed).toBe(true);
  });
});
