import { describe, expect, it } from 'vitest';
import {
  isCdnLogicalPath,
  loadCdnConfig,
  packIgnoreEntries,
  scanLocalCdnFiles,
} from '../cdn_scan.mjs';
import { classifyAssets, collectUsedAssetPaths } from './used-assets.mjs';

const GONE = [
  'audio/sfx_manifest.json',
  'images/bg_battle_wide.jpg',
  'images/fx_forearm.png',
  'images/fx_hand_grip.png',
  'images/mod_battery.png',
  'images/mod_bell.png',
  'images/mod_chili.png',
  'images/mod_foam.png',
  'images/mod_fridge.png',
  'images/mod_gascan.png',
  'images/mod_holler.png',
  'images/mod_sack.png',
  'images/mod_shovel.png',
  'images/mod_sickle.png',
  'images/mod_stool.png',
  'images/fx/hammer.png',
  'images/wep/wrench.png',
  'images/wep/cleaver.png',
  'images/wep/driver.png',
  'images/wep/radio.png',
  'images/wep/sling.png',
  'images/mod/helmet.png',
  'images/mod/pipe.png',
  'images/mod/chainsaw.png',
  'images/mod/weight.png',
  'images/mod/pot.png',
  'images/mod/speaker.png',
  'images/mod/blower.png',
  'images/mod/firecracker.png',
  'images/mod/wire.png',
  'images/mod/quilt.png',
  'images/mod/steelplate.png',
  'images/mod/pressurecooker.png',
  'images/mod/slingshot.png',
  'images/mod/dogleash.png',
  'images/mod/chickenfeed.png',
  'images/mod/thermos.png',
  'images/hero/dachui_grip.png',
  'images/hero/erjiu_grip.png',
  'images/hero/laoli_grip.png',
  'images/hero/laoyanqiang_grip.png',
  'images/hero/sanshen_grip.png',
];

describe('游戏内用到的资源', () => {
  it('旧废图已从磁盘和 used 名单去掉', () => {
    const used = new Set(collectUsedAssetPaths());
    const disk = new Set(classifyAssets().disk.map((f) => f.remote));
    for (const p of GONE) {
      expect(used.has(p), p).toBe(false);
      expect(disk.has(p), p).toBe(false);
    }
  });

  it('磁盘没有闲置资源', () => {
    const { unused } = classifyAssets();
    expect(unused.map((f) => f.remote)).toEqual([]);
  });

  it('used 名单不包含磁盘上没有的图', () => {
    const { missing } = classifyAssets();
    expect(missing).toEqual([]);
  });

  it('CDN 扫描只收游戏用到的文件', () => {
    const cfg = loadCdnConfig();
    const { allFiles } = scanLocalCdnFiles(cfg);
    expect(allFiles.length).toBeGreaterThan(100);
    expect(allFiles.every((f) => isCdnLogicalPath(cfg, f.remote))).toBe(true);
    expect(allFiles.some((f) => f.remote === 'images/hero/dachui_evo1.png')).toBe(true);
  });

  it('首屏与短音效不走 CDN', () => {
    const cfg = loadCdnConfig();
    expect(isCdnLogicalPath(cfg, 'images/boot/loading_splash.jpg')).toBe(false);
    expect(isCdnLogicalPath(cfg, 'images/boot/title_logo.png')).toBe(false);
    expect(isCdnLogicalPath(cfg, 'audio/ui_tap.mp3')).toBe(false);
    expect(isCdnLogicalPath(cfg, 'audio/hit.mp3')).toBe(false);
  });

  it('立绘 / 动画 / BGM 走 CDN', () => {
    const cfg = loadCdnConfig();
    expect(isCdnLogicalPath(cfg, 'images/hero/dachui_evo2.png')).toBe(true);
    expect(isCdnLogicalPath(cfg, 'images/anim/dachui_idle_0.png')).toBe(true);
    expect(isCdnLogicalPath(cfg, 'audio/bgm_village.mp3')).toBe(true);
  });

  it('村口壳进分包名单，不进 CDN 扫描', () => {
    const cfg = loadCdnConfig();
    const used = new Set(collectUsedAssetPaths());
    const { allFiles } = scanLocalCdnFiles(cfg);
    const remotes = new Set(allFiles.map((f) => f.remote));
    expect(used.has('subpackages/pkg-home/images/bg/village_home.jpg')).toBe(true);
    expect(used.has('subpackages/pkg-home/images/ui/top_lintel.png')).toBe(true);
    expect(used.has('subpackages/pkg-home-art/images/ui/rust_gate.png')).toBe(true);
    expect(used.has('images/bg/village_home.jpg')).toBe(false);
    expect(isCdnLogicalPath(cfg, 'subpackages/pkg-home/images/bg/village_home.jpg')).toBe(false);
    expect(remotes.has('images/bg/village_home.jpg')).toBe(false);
    expect(remotes.has('images/ui/top_lintel.png')).toBe(false);
    expect(remotes.has('images/ui/settle_stamp.png')).toBe(true);
    expect(remotes.has('images/bg/road.jpg')).toBe(true);
    expect(isCdnLogicalPath(cfg, 'images/bg/road.jpg')).toBe(true);
  });

  it('packOptions.ignore 按目录排除 CDN，首屏留包内', () => {
    const entries = packIgnoreEntries(loadCdnConfig());
    const ignore = new Set(entries.map((e) => e.value));
    expect(entries.some((e) => e.type === 'folder' && e.value === 'images/hero')).toBe(true);
    expect(entries.some((e) => e.type === 'folder' && e.value === 'images/anim')).toBe(true);
    expect(entries.some((e) => e.type === 'folder' && e.value === 'images/ui')).toBe(true);
    expect(entries.some((e) => e.type === 'folder' && e.value === 'images/bg')).toBe(true);
    expect(ignore.has('images/boot')).toBe(false);
    expect(ignore.has('images/boot/loading_splash.jpg')).toBe(false);
    expect(ignore.has('images/boot/title_logo.png')).toBe(false);
    expect(ignore.has('audio/bgm_village.mp3')).toBe(true);
  });
});
