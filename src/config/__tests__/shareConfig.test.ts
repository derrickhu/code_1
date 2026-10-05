import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSharePayload, SHARE_IMAGE, SHARE_TITLES } from '@/config/ShareConfig';

describe('转发文案', () => {
  it('好友和朋友圈各一句，图走包内', () => {
    const friend = buildSharePayload('menu', 'friend');
    const timeline = buildSharePayload('menu', 'timeline');
    expect(friend.title).toBe(SHARE_TITLES.appMessage);
    expect(timeline.title).toBe(SHARE_TITLES.timeline);
    expect(friend.imageUrl).toBe(SHARE_IMAGE);
    expect(timeline.imageUrl).toBe(SHARE_IMAGE);
    expect(friend.query).toBe('from=share&source=menu');
  });

  it('bundle 起来之前的默认句和配置一致', () => {
    const boot = fs.readFileSync(path.resolve('runtime/share-bootstrap.js'), 'utf8');
    expect(boot).toContain(SHARE_TITLES.appMessage);
    expect(boot).toContain(SHARE_TITLES.timeline);
    expect(boot).toContain(SHARE_IMAGE);
  });
});
