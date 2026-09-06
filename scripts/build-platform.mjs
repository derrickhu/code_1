/**
 * 把一份内容树 + 一份 bundle 组装成各平台可直接用开发者工具打开的目录。
 *
 * 对齐 xiaochu2：源一份，build/<端> 是生成物。
 *
 *   内容树：runtime/（game.js / runtime.js / pixi-adapter）
 *           + assets/（images / audio）
 *   平台差：platform/<wechat|douyin>/game.json 与 project.config.json
 *   产出：  build/<wechat|douyin>/
 *
 *   CLI：node scripts/build-platform.mjs [wechat|douyin|all] [--full]
 *   仅 `vite build --watch` 会在插件里组装；一次性 `vite build` 不组装，
 *   留给 npm script 在 vite 之后跑本脚本。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  copyFileIfStale,
  createMirrorStats,
  isRealDir,
  lstatOrNull,
  mirrorDir,
} from './lib/mirror-tree.mjs';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RUNTIME_DIR = path.join(rootDir, 'runtime');
export const ASSETS_DIR = path.join(rootDir, 'assets');
export const PLATFORM_DIR = path.join(rootDir, 'platform');
export const BUILD_DIR = path.join(rootDir, 'build');
export const BUNDLE_DIR = path.join(rootDir, '.bundle');

export const PLATFORMS = ['wechat', 'douyin'];

const KEEP = new Set(['project.private.config.json']);
const SKIP_SHARED = new Set([
  'game-bundle.js',
  'index.html',
  'game.json',
  'project.config.json',
  'project.private.config.json',
]);

/** runtime 镜像时不要动资源目录 */
const SKIP_FROM_RUNTIME = new Set([...SKIP_SHARED, 'images', 'audio']);

function fail(msg) {
  throw new Error(`[build-platform] ${msg}`);
}

function cleanStale(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    if (KEEP.has(entry) || entry.startsWith('.') || entry.endsWith('.zip')) continue;
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

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

function contentLooksCopied(out) {
  const adapterOk = !fs.existsSync(path.join(RUNTIME_DIR, 'pixi-adapter'))
    || isRealDir(path.join(out, 'pixi-adapter'));
  const imagesOk = !fs.existsSync(path.join(ASSETS_DIR, 'images'))
    || isRealDir(path.join(out, 'images'));
  const leftoverLink = ['images', 'audio', 'pixi-adapter', 'game.js', 'runtime.js']
    .some((name) => {
      const st = lstatOrNull(path.join(out, name));
      return Boolean(st && st.isSymbolicLink());
    });
  return adapterOk && imagesOk && !leftoverLink;
}

function formatStats(stats) {
  return `+${stats.copied} ~${stats.skipped} -${stats.pruned}`
    + (stats.repaired ? ` !${stats.repaired}` : '');
}

const RELOAD_TICK_RE = /\n;\/\* code1-reload \d+ \*\/\n$/;

/** 小游戏工具通常只因 js/json 变化自动编译；只换图时轻碰 game.js 让模拟器自己起来。 */
function pokeSimulator(out, stats) {
  if (stats.copied === 0 && stats.pruned === 0 && stats.repaired === 0) return;
  const gameJs = path.join(out, 'game.js');
  if (!fs.existsSync(gameJs)) return;
  const prev = fs.readFileSync(gameJs, 'utf8');
  const next = `${prev.replace(RELOAD_TICK_RE, '')}\n;/* code1-reload ${Date.now()} */\n`;
  if (next !== prev) fs.writeFileSync(gameJs, next);
}

export function assemble(platform, { quiet = false, bundleDir, full = false } = {}) {
  if (!PLATFORMS.includes(platform)) fail(`未知平台 ${platform}`);
  const platformSrc = path.join(PLATFORM_DIR, platform);
  if (!fs.existsSync(platformSrc)) fail(`缺少平台配置目录 platform/${platform}`);

  const resolvedBundleDir = bundleDir || BUNDLE_DIR;
  const bundle = path.join(resolvedBundleDir, 'game-bundle.js');
  if (!fs.existsSync(bundle)) {
    fail(`找不到 ${path.relative(rootDir, bundle)}，请先跑 vite build`);
  }
  if (!fs.existsSync(RUNTIME_DIR)) fail('缺少 runtime/ 内容树');

  const out = path.join(BUILD_DIR, platform);
  const outConfig = path.join(out, 'project.config.json');
  const configSrc = path.join(platformSrc, 'project.config.json');
  let inherited = null;
  let config = null;
  if (fs.existsSync(configSrc)) {
    const fresh = JSON.parse(fs.readFileSync(configSrc, 'utf8'));
    ({ config, inherited } = inheritAppid(outConfig, fresh));
  }

  const stats = createMirrorStats();
  fs.mkdirSync(out, { recursive: true });
  if (full || !contentLooksCopied(out)) {
    cleanStale(out);
  }

  mirrorDir(RUNTIME_DIR, out, { skip: SKIP_FROM_RUNTIME, stats });
  if (fs.existsSync(ASSETS_DIR)) {
    for (const name of fs.readdirSync(ASSETS_DIR)) {
      if (name.startsWith('.') || SKIP_SHARED.has(name)) continue;
      const src = path.join(ASSETS_DIR, name);
      if (!fs.statSync(src).isDirectory()) {
        copyFileIfStale(src, path.join(out, name), stats);
        continue;
      }
      mirrorDir(src, path.join(out, name), { stats });
    }
  }
  copyFileIfStale(bundle, path.join(out, 'game-bundle.js'), stats);
  mirrorDir(platformSrc, out, {
    skip: new Set(['project.config.json']),
    prune: false,
    stats,
  });
  if (config) {
    const rendered = `${JSON.stringify(config, null, 2)}\n`;
    const prev = fs.existsSync(outConfig) ? fs.readFileSync(outConfig, 'utf8') : '';
    if (prev !== rendered) fs.writeFileSync(outConfig, rendered, 'utf8');
  }
  pokeSimulator(out, stats);

  if (!quiet) {
    const size = (fs.statSync(bundle).size / 1024).toFixed(0);
    const appidNote = config?.appid
      ? `appid ${config.appid}${inherited ? '（沿用工具里填的，建议同步回 platform/）' : ''}`
      : '无 project.config 或 appid 未填';
    console.log(
      `[build-platform] ${platform} → build/${platform}/ (bundle ${size}KB, ${formatStats(stats)}, ${appidNote})`,
    );
  }
  return stats;
}

export function assembleAll(target = 'all', opts) {
  const targets = target === 'all' ? PLATFORMS : [target];
  const all = createMirrorStats();
  for (const p of targets) {
    if (!PLATFORMS.includes(p)) fail(`未知平台 ${p}，可选：${PLATFORMS.join(' / ')} / all`);
    const one = assemble(p, opts);
    all.copied += one.copied;
    all.skipped += one.skipped;
    all.pruned += one.pruned;
    all.repaired += one.repaired;
  }
  return all;
}

function shouldIgnoreWatchName(filename) {
  if (!filename) return false;
  const base = String(filename).split(/[\\/]/).pop() || '';
  if (!base) return false;
  if (base.startsWith('.')) return true;
  return base === 'game-bundle.js'
    || base === 'index.html'
    || base === '.DS_Store'
    || base.endsWith('.code1-tmp');
}

/**
 * 只听 runtime/、assets/、platform/，不听 build/。
 * 改图不会触发 Vite 重打 JS；由调用方排队跑增量 assemble。
 */
export function watchContentTrees(onChange, { debounceMs = 250 } = {}) {
  let timer = null;
  const kick = (_event, filename) => {
    if (shouldIgnoreWatchName(filename)) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, debounceMs);
  };
  const watchers = [];
  const opts = { recursive: true };
  if (fs.existsSync(RUNTIME_DIR)) watchers.push(fs.watch(RUNTIME_DIR, opts, kick));
  if (fs.existsSync(ASSETS_DIR)) watchers.push(fs.watch(ASSETS_DIR, opts, kick));
  if (fs.existsSync(PLATFORM_DIR)) watchers.push(fs.watch(PLATFORM_DIR, opts, kick));
  return () => {
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const full = args.includes('--full');
    const target = args.find((a) => a !== '--full') ?? process.env.CODE1_PLATFORM ?? 'all';
    assembleAll(target, { full });
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
