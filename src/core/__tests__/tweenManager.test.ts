import { describe, expect, it } from 'vitest';

import { TweenManager } from '@/core/TweenManager';

describe('TweenManager', () => {
  it('onComplete 抛错不打断后续补间', () => {
    const a = { x: 0 };
    const b = { x: 0 };
    TweenManager.to({
      target: a,
      props: { x: 1 },
      duration: 0.01,
      onComplete: () => {
        throw new Error("Cannot read properties of null (reading 'refCount')");
      },
    });
    TweenManager.to({
      target: b,
      props: { x: 1 },
      duration: 0.01,
    });
    expect(() => TweenManager.update(1)).not.toThrow();
    expect(b.x).toBe(1);
  });
});
