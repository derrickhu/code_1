/**
 * 右上角「转发 / 朋友圈」。
 *
 * game.js 里的 share-bootstrap.js 会在 bundle 之前先注册一次，
 * 否则真机体验版有时右上角点了没反应。这里再盖一层，换成同一套文案并记经分。
 */
import { analytics, EVENT_NAMES } from '@/analytics';
import { buildSharePayload, type SharePayload } from '@/config/ShareConfig';
import { Platform } from '@/core/PlatformService';

declare const GameGlobal: {
  __sharePayloadFn?: (source: string, mode: 'friend' | 'timeline') => SharePayload;
};

function trackShare(mode: 'friend' | 'timeline', payload: SharePayload, source: string): void {
  analytics.track(mode === 'timeline' ? EVENT_NAMES.SHARE_TIMELINE : EVENT_NAMES.SHARE_APP_MESSAGE, {
    entry_point: source,
    title: payload.title,
    image_url: payload.imageUrl,
    query: payload.query,
  });
}

/** 游戏入口调一次。非小游戏环境直接跳过。 */
export function configureShareMenu(): void {
  if (!Platform.isMinigame) return;

  GameGlobal.__sharePayloadFn = (source, mode) => buildSharePayload(source, mode);

  const menus = Platform.isWechat
    ? ['shareAppMessage', 'shareTimeline']
    : ['shareAppMessage'];

  Platform.showShareMenu({
    withShareTicket: true,
    menus,
  });

  Platform.onShareAppMessage(() => {
    const payload = buildSharePayload('menu', 'friend');
    trackShare('friend', payload, 'menu');
    return payload;
  });

  if (!Platform.isWechat) return;
  Platform.onShareTimeline(() => {
    const payload = buildSharePayload('menu', 'timeline');
    trackShare('timeline', payload, 'menu');
    return payload;
  });
}
