/**
 * CDN 本地扫描 / 代码期望路径（upload / assemble 共用）
 *
 * 只收游戏内用到的文件：磁盘废图不进清单、不上传。
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import vm from 'vm';
import { fileURLToPath } from 'url';
import { PROJECT_ROOT } from './loadEnv.js';
import { classifyAssets, collectUsedAssetPaths } from './lib/used-assets.mjs';

export { collectUsedAssetPaths };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ASSETS_ROOT = path.join(PROJECT_ROOT, 'assets');
export const STRIP_MARKER = path.join(PROJECT_ROOT, 'build', '.cdn_stripped');
export const MANIFEST_LOCAL = path.join(__dirname, '.cdn_manifest.json');

export function loadCdnConfig() {
  const file = path.join(PROJECT_ROOT, 'src', 'config', 'CdnConfig.ts');
  const text = fs.readFileSync(file, 'utf-8');
  const m = text.match(/export const CDN_CONFIG[^=]*=\s*({[\s\S]*?});/);
  if (!m) throw new Error(`无法解析 CDN_CONFIG: ${file}`);
  return vm.runInNewContext(`(${m[1]})`, {});
}

export function normalizeLogical(p) {
  return String(p || '').replace(/^\/+/, '').replace(/^(?:minigame|assets)\//, '');
}

export function isCdnLogicalPath(cfg, p) {
  const n = normalizeLogical(p);
  if (n.startsWith('subpackages/')) return false;
  if ((cfg.bundledFiles || []).includes(n)) return false;
  for (const dir of cfg.bundledDirs || []) {
    if (n === dir || n.startsWith(`${dir}/`)) return false;
  }
  const prefixes = cfg.cdnPrefixes || [];
  if (prefixes.length) {
    return prefixes.some((pre) => n === pre || n.startsWith(pre));
  }
  return (cfg.cdnDirs || []).some((d) => n === d || n.startsWith(`${d}/`));
}

export function md5File8(filePath) {
  return crypto.createHash('md5').update(fs.readFileSync(filePath)).digest('hex').slice(0, 8);
}

function walkDir(dir, remotePrefix, ignore) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const item of fs.readdirSync(dir)) {
    if (ignore.has(item)) continue;
    const full = path.join(dir, item);
    const remote = remotePrefix ? `${remotePrefix}/${item}` : item;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) out.push(...walkDir(full, remote, ignore));
    else out.push({ local: full, remote, size: stat.size });
  }
  return out;
}

/** 扫描 assets 下 CDN 目录，只留「游戏用到 ∩ CDN 前缀」 */
export function scanLocalCdnFiles(cfg) {
  const ignore = new Set(cfg.ignoreFiles || ['game.js', '.DS_Store', 'Thumbs.db']);
  const used = new Set(collectUsedAssetPaths());
  const raw = [];
  for (const dir of cfg.cdnDirs || []) {
    raw.push(...walkDir(path.join(ASSETS_ROOT, dir), dir, ignore));
  }
  const allFiles = raw.filter((f) => used.has(f.remote) && isCdnLogicalPath(cfg, f.remote));
  const localManifest = {};
  for (const f of allFiles) {
    localManifest[f.remote] = { hash: md5File8(f.local), size: f.size };
  }
  return { allFiles, localManifest, ignore, used };
}

export function collectExpectedCdnPaths(cfg) {
  return collectUsedAssetPaths()
    .filter((p) => isCdnLogicalPath(cfg, p))
    .sort();
}

/**
 * 微信自动预览按「源码体积」卡 4MB，几百条 type:file 经常不生效。
 * 目录级 ignore 才靠得住；bundled 文件所在目录整夹跳过，改逐文件忽略。
 */
export function packIgnoreEntries(cfg) {
  const bundled = new Set(cfg.bundledFiles || []);
  const folders = new Set();
  const files = [];

  for (const pre of cfg.cdnPrefixes || []) {
    if (!pre.endsWith('/')) continue;
    const folder = pre.slice(0, -1);
    const hasBundled = [...bundled].some((p) => p === folder || p.startsWith(`${folder}/`));
    if (!hasBundled) folders.add(folder);
  }

  for (const p of collectExpectedCdnPaths(cfg)) {
    if (bundled.has(p)) continue;
    const covered = [...folders].some((f) => p === f || p.startsWith(`${f}/`));
    if (!covered) files.push(p);
  }

  return [
    ...[...folders].sort().map((value) => ({ type: 'folder', value })),
    ...files.sort().map((value) => ({ type: 'file', value })),
  ];
}

export function unusedAssetReport() {
  return classifyAssets();
}

export function preflightUpload({
  cfg, allFiles, localManifest, remoteFiles = {}, allowPrune = false, onlyPrefix = '',
}) {
  const warnings = [];
  const inScope = (p) => !onlyPrefix || p === onlyPrefix || p.startsWith(`${onlyPrefix}/`);
  const classified = classifyAssets();
  if (classified.unused.length > 0) {
    const bytes = classified.unused.reduce((n, f) => n + f.size, 0);
    warnings.push(
      `磁盘有 ${classified.unused.length} 个文件游戏未引用，已跳过同步（${(bytes / 1048576).toFixed(2)} MB）`,
    );
    for (const f of classified.unused.slice(0, 8)) {
      warnings.push(`  skip ${f.remote}`);
    }
    if (classified.unused.length > 8) {
      warnings.push(`  ... 另有 ${classified.unused.length - 8} 个`);
    }
  }

  const expected = collectExpectedCdnPaths(cfg).filter(inScope);
  const missingLocal = expected.filter((p) => !localManifest[p]);
  const missingBoth = missingLocal.filter((p) => !remoteFiles[p]);

  if (missingLocal.length > 0) {
    const onlyRemote = missingLocal.length - missingBoth.length;
    warnings.push(
      `代码期望 CDN 路径: 本地缺 ${missingLocal.length}`
      + (onlyRemote ? `（其中 ${onlyRemote} 云端已有）` : '')
      + (missingBoth.length ? `；${missingBoth.length} 两端皆无` : ''),
    );
    for (const p of missingLocal.slice(0, 8)) {
      warnings.push(`  ${remoteFiles[p] ? '~' : '!'} ${p}`);
    }
  }

  if (missingBoth.length >= 20) {
    throw new Error(
      `有 ${missingBoth.length} 条代码期望路径在本地与云端都不存在，已中止。`,
    );
  }

  void allowPrune;
  void allFiles;
  return { warnings, missingLocal, missingBoth, expected };
}
