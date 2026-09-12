/**
 * 从 build/<端>/ 剔除已上 CDN 的文件。不碰 assets/ 真源。
 */
import fs from 'fs';
import path from 'path';
import { loadCdnConfig, scanLocalCdnFiles, STRIP_MARKER } from '../cdn_scan.mjs';

const BUILD = path.join(path.dirname(STRIP_MARKER));
const PLATFORMS = ['wechat', 'douyin'];

export function fmtMb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)}MB`;
}

function pruneEmptyDirs(dir) {
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
  for (const name of fs.readdirSync(dir)) {
    if (name === '.DS_Store' || name === 'Thumbs.db') {
      fs.unlinkSync(path.join(dir, name));
      continue;
    }
    pruneEmptyDirs(path.join(dir, name));
  }
  if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
}

export function stripCdnFromDir(root, remotes, { dryRun = false } = {}) {
  let removedBytes = 0;
  let removedCount = 0;
  for (const remote of remotes) {
    const full = path.join(root, remote);
    if (!fs.existsSync(full)) continue;
    removedBytes += fs.statSync(full).size;
    removedCount += 1;
    if (!dryRun) fs.unlinkSync(full);
  }
  if (!dryRun) {
    pruneEmptyDirs(path.join(root, 'images'));
    pruneEmptyDirs(path.join(root, 'audio'));
  }
  return { removedCount, removedBytes };
}

export function dirSize(p) {
  if (!fs.existsSync(p)) return 0;
  const st = fs.statSync(p);
  if (st.isFile()) return st.size;
  let n = 0;
  for (const name of fs.readdirSync(p)) {
    if (name === '.DS_Store' || name === 'Thumbs.db') continue;
    n += dirSize(path.join(p, name));
  }
  return n;
}

export function stripCdnFromBuilds({ dryRun = false, platforms = PLATFORMS } = {}) {
  const cfg = loadCdnConfig();
  const { allFiles } = scanLocalCdnFiles(cfg);
  const remotes = allFiles.map((f) => f.remote);
  const results = [];

  console.log(`=== CDN 瘦包${dryRun ? '（dry-run）' : ''} ===`);
  console.log(`将从 build/<端>/ 去掉 ${remotes.length} 个已同步文件`);

  let removedBytes = 0;
  let removedCount = 0;
  for (const platform of platforms) {
    const root = path.join(BUILD, platform);
    if (!fs.existsSync(root)) {
      console.log(`  skip (missing) build/${platform}/`);
      continue;
    }
    const before = dirSize(root);
    const one = stripCdnFromDir(root, remotes, { dryRun });
    removedBytes += one.removedBytes;
    removedCount += one.removedCount;
    const after = dryRun ? before - one.removedBytes : dirSize(root);
    console.log(`  build/${platform}/ ${fmtMb(before)} → ${fmtMb(after)}`);
    results.push({ platform, ...one, after });
  }

  console.log(`删除: ${removedCount} 文件 / ${fmtMb(removedBytes)}`);
  if (!dryRun) {
    fs.mkdirSync(BUILD, { recursive: true });
    fs.writeFileSync(
      STRIP_MARKER,
      `${new Date().toISOString()}\nremoved=${removedCount}\n`,
      'utf-8',
    );
  }
  return { removedCount, removedBytes, results };
}
