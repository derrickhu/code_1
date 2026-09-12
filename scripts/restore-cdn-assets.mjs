#!/usr/bin/env node
/**
 * 从 assets/ 重新组装 build/，恢复被 cdn:strip 删掉的本地文件。
 */
import fs from 'fs';
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { STRIP_MARKER } from './cdn_scan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

console.log('=== 恢复 CDN 本地资源（重新 assemble）===');
const r = spawnSync(process.execPath, [path.join(__dirname, 'build-platform.mjs'), '--keep-cdn'], {
  cwd: PROJECT_ROOT,
  stdio: 'inherit',
});
if ((r.status || 0) !== 0) {
  console.error('assemble 失败');
  process.exit(r.status || 1);
}
try { fs.unlinkSync(STRIP_MARKER); } catch { /* ignore */ }
console.log('已恢复 build/wechat 与 build/douyin');
