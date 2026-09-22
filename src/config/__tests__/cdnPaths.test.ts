import { describe, expect, it } from 'vitest';
import { CDN_CONFIG } from '@/config/CdnConfig';
import { VILLAGE_HOME_BG, uiPath } from '@/core/TextureLoader';
import {
  CdnAssetService, isFileQuotaError, isMissingPathError, isWxTempPath,
  playableInnerAudioSrc, shouldPersistCdnPath, toInnerAudioSrc,
} from '@/core/CdnAssetService';

describe('CDN 路径分流', () => {
  it('配置前缀带 gameKey', () => {
    expect(CDN_CONFIG.filePrefix).toBe('cunkou/assets_cdn');
    expect(CDN_CONFIG.enabled).toBe(true);
  });

  it('首屏插画和标题留包内', () => {
    expect(CdnAssetService.isBundledPath('images/boot/loading_splash.jpg')).toBe(true);
    expect(CdnAssetService.isBundledPath('images/boot/title_logo.png')).toBe(true);
    expect(CdnAssetService.isCdnPath('images/boot/loading_splash.jpg')).toBe(false);
    expect(CdnAssetService.isCdnPath('images/boot/title_logo.png')).toBe(false);
  });

  it('立绘和 BGM 走 CDN，短音效不走', () => {
    expect(CdnAssetService.isCdnPath('images/hero/dachui_evo3.png')).toBe(true);
    expect(CdnAssetService.isCdnPath('images/anim/tiezhu_atk_1.png')).toBe(true);
    expect(CdnAssetService.isCdnPath('audio/bgm_battle.mp3')).toBe(true);
    expect(CdnAssetService.isCdnPath('audio/ui_tap.mp3')).toBe(false);
    expect(CdnAssetService.isCdnPath('audio/hit.mp3')).toBe(false);
  });

  it('能认出微信本地存储写满', () => {
    expect(isFileQuotaError(new Error('copyFileSync:fail the maximum size of the file storage limit is exceeded'))).toBe(true);
    expect(isFileQuotaError({ errMsg: 'writeFile:fail storage limit' })).toBe(true);
    expect(isFileQuotaError(new Error('downloadFile status=404'))).toBe(false);
  });

  it('能认出清空缓存后目录没了', () => {
    expect(isMissingPathError(new Error('copyFileSync:fail no such file or directory http://usr/cdn_cache_v2/images/ui/icon_scrap.png'))).toBe(true);
    expect(isMissingPathError({ errMsg: 'copyFileSync:fail the filePath is not exist' })).toBe(true);
    expect(isMissingPathError(new Error('copyFileSync:fail storage limit'))).toBe(false);
  });

  it('当前缓存根已换代，旧 v2 整包缓存会被丢掉', () => {
    expect(CDN_CONFIG.cacheRootName).toBe('cdn_cache_v3');
  });

  it('BGM 必须落本地缓存，临时路径不能给 InnerAudio', () => {
    expect(shouldPersistCdnPath('audio/bgm_village.mp3')).toBe(true);
    expect(shouldPersistCdnPath('images/ui/icon_scrap.png')).toBe(true);
    expect(isWxTempPath('http://tmp/AZrWJ5wULHMN222ef8560cc65d5c51e5209dae0fea02.mp3')).toBe(true);
    expect(isWxTempPath('http://usr/cdn_cache_v3/audio/bgm_village.mp3')).toBe(false);
  });

  it('模拟器 http://usr 不能改成 wxfile 给 InnerAudio，要走 HTTPS', () => {
    const cdn = 'https://cdn.example/cunkou/assets_cdn/audio/bgm_village.mp3';
    expect(playableInnerAudioSrc('http://usr/cdn_cache_v3/audio/bgm_village.mp3', cdn))
      .toBe(cdn);
    expect(playableInnerAudioSrc('wxfile://usr/cdn_cache_v3/audio/bgm_village.mp3', cdn, () => false))
      .toBe(cdn);
    expect(playableInnerAudioSrc('wxfile://usr/cdn_cache_v3/audio/bgm_village.mp3', cdn, () => true))
      .toBe('wxfile://usr/cdn_cache_v3/audio/bgm_village.mp3');
    expect(playableInnerAudioSrc(cdn, cdn)).toBe(cdn);
    expect(toInnerAudioSrc('http://usr/cdn_cache_v3/audio/bgm_battle.mp3'))
      .toBe('wxfile://usr/cdn_cache_v3/audio/bgm_battle.mp3');
  });

  it('非小游戏环境 resolve 仍回逻辑路径', () => {
    expect(CdnAssetService.resolveAsset('images/hero/dachui.png')).toBe('images/hero/dachui.png');
    expect(CdnAssetService.resolveAsset('images/boot/loading_splash.jpg')).toBe('images/boot/loading_splash.jpg');
  });

  it('村口壳走分包，不走 CDN；浏览器剥回 assets 路径', () => {
    expect(CdnAssetService.isBundledPath(VILLAGE_HOME_BG)).toBe(true);
    expect(CdnAssetService.isCdnPath(VILLAGE_HOME_BG)).toBe(false);
    expect(CdnAssetService.isBundledPath(uiPath('top_lintel'))).toBe(true);
    expect(CdnAssetService.isCdnPath(uiPath('top_lintel'))).toBe(false);
    expect(CdnAssetService.isBundledPath(uiPath('rust_gate'))).toBe(true);
    expect(CdnAssetService.isCdnPath('images/bg/battle.jpg')).toBe(true);
    expect(CdnAssetService.isBundledPath('images/bg/road.jpg')).toBe(false);
    expect(CdnAssetService.isCdnPath('images/bg/road.jpg')).toBe(true);
    expect(CdnAssetService.isCdnPath('images/ui/settle_stamp.png')).toBe(true);
    expect(CdnAssetService.resolveAsset(VILLAGE_HOME_BG)).toBe('images/bg/village_home.jpg');
    expect(CdnAssetService.resolveAsset(uiPath('rust_atlas'))).toBe('images/ui/rust_atlas.png');
  });
});
