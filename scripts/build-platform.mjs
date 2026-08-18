/**
 * 把一份 bundle 组装成各平台可直接用开发者工具打开的目录。
 *
 *   CLI：node scripts/build-platform.mjs [wechat|douyin|all]
 *   构建流程里由 vite.config.ts 的插件在 writeBundle 后自动调用，
 *   因此 `npm run dev` 的 watch 也会实时同步到平台目录。
 *
 * 产出结构（build/<platform>/ 就是开发者工具要打开的目录）：
 *   game.js  runtime.js  pixi-adapter/   ← 来自 runtime/，两端完全相同
 *   game-bundle.js                       ← 来自 .bundle/，两端完全相同
 *   game.json  project.config.json       ← 来自 platform/<platform>/，两端不同
 *
 * 这样拆的理由：游戏内容只有一份，平台差异全部收敛到 platform/ 下的两个 json。
 * xiaochu2 的做法是共用一个 minigame 目录，微信工具开根目录、抖音工具开子目录，
 * 两份 project.config.json 分散在两处，game.json 里还要同时写 subPackages 与
 * subpackages 去兼容两端 —— 那套结构每加一个平台差异都得再绕一次。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUNDLE_DIR = path.join(rootDir, '.bundle');
const RUNTIME_DIR = path.join(rootDir, 'runtime');
const PLATFORM_DIR = path.join(rootDir, 'platform');
const BUILD_DIR = path.join(rootDir, 'build');

export const PLATFORMS = ['wechat', 'douyin'];

/**
 * 重建时必须留下的东西：开发者工具自己生成的本地文件。
 * 删掉它们会让工具每次重新问你要哪个 appid、丢掉本地编译设置。
 */
const KEEP = new Set(['project.private.config.json']);

function fail(msg) {
  throw new Error(`[build-platform] ${msg}`);
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    // .DS_Store 一类会被开发者工具当成待上传文件
    if (entry.name.startsWith('.')) continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

/** 清掉旧产物但保留工具本地文件与缓存目录（. 开头） */
function cleanStale(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    if (KEEP.has(entry) || entry.startsWith('.')) continue;
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

/**
 * 取回已填好的 appid。
 *
 * appid 的真源是 platform/<platform>/project.config.json，但人往往是在开发者工具里
 * 顺手填的 —— 那会写进产物目录，而产物每次构建都会被重写。这里把它捞回来，
 * 免得每次 build 之后都要在工具里重新选一遍。
 */
function inheritAppid(outConfigPath, freshConfig) {
  if (freshConfig.appid) return { config: freshConfig, inherited: null };
  if (!fs.existsSync(outConfigPath)) return { config: freshConfig, inherited: null };
  try {
    const prev = JSON.parse(fs.readFileSync(outConfigPath, 'utf8'));
    if (!prev.appid) return { config: freshConfig, inherited: null };
    return { config: { ...freshConfig, appid: prev.appid }, inherited: prev.appid };
  } catch {
    return { config: freshConfig, inherited: null };
  }
}

export function assemble(platform, { quiet = false } = {}) {
  const platformSrc = path.join(PLATFORM_DIR, platform);
  if (!fs.existsSync(platformSrc)) fail(`缺少平台配置目录 platform/${platform}`);

  const bundle = path.join(BUNDLE_DIR, 'game-bundle.js');
  if (!fs.existsSync(bundle)) fail('找不到 .bundle/game-bundle.js，请先跑 vite build');

  const out = path.join(BUILD_DIR, platform);
  const outConfig = path.join(out, 'project.config.json');

  const fresh = JSON.parse(
    fs.readFileSync(path.join(platformSrc, 'project.config.json'), 'utf8'),
  );
  const { config, inherited } = inheritAppid(outConfig, fresh);

  fs.mkdirSync(out, { recursive: true });
  cleanStale(out);

  copyDir(RUNTIME_DIR, out);
  fs.copyFileSync(bundle, path.join(out, 'game-bundle.js'));
  const assetsDir = path.join(rootDir, 'assets');
  if (fs.existsSync(assetsDir)) copyDir(assetsDir, out);
  copyDir(platformSrc, out);
  fs.writeFileSync(outConfig, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  if (!quiet) {
    const size = (fs.statSync(bundle).size / 1024).toFixed(0);
    const appidNote = config.appid
      ? `appid ${config.appid}${inherited ? '（沿用工具里填的，建议同步回 platform/）' : ''}`
      : 'appid 未填，工具内会提示选择';
    console.log(`[build-platform] ${platform} → build/${platform}/ (bundle ${size}KB, ${appidNote})`);
  }
}

export function assembleAll(target = 'all', opts) {
  const targets = target === 'all' ? PLATFORMS : [target];
  for (const p of targets) {
    if (!PLATFORMS.includes(p)) fail(`未知平台 ${p}，可选：${PLATFORMS.join(' / ')} / all`);
    assemble(p, opts);
  }
}

// 直接用 node 跑时才执行 CLI；被 vite 插件 import 时不执行
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    assembleAll(process.argv[2] ?? 'all');
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
