/**
 * 右上角转发。图片必须是包内静态路径。
 * 体验版 / 正式版不吃 wxfile:// 临时图，网络图又卡合法域名。
 * 文案和 runtime/share-bootstrap.js 里的默认值保持同一句，bundle 起来之前也能转。
 */

export const SHARE_IMAGE = 'images/share/share_default.jpg';

export const SHARE_TITLES = {
  appMessage: '外星人打到村口了，来守这一口',
  timeline: '村口大战外星人',
} as const;

export interface SharePayload {
  title: string;
  imageUrl: string;
  query: string;
}

export function buildShareQuery(source: string): string {
  return `from=share&source=${encodeURIComponent(source)}`;
}

export function buildSharePayload(source: string, mode: 'friend' | 'timeline' = 'friend'): SharePayload {
  return {
    title: mode === 'timeline' ? SHARE_TITLES.timeline : SHARE_TITLES.appMessage,
    imageUrl: SHARE_IMAGE,
    query: buildShareQuery(source),
  };
}
