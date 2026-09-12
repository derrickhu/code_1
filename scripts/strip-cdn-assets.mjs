#!/usr/bin/env node
/**
 * 从 build/<端>/ 剔除已上 CDN 的大资源，供开发者工具上传瘦包。
 * 不碰 assets/ 真源。恢复请 npm run cdn:restore（assemble --keep-cdn）。
 *
 *   node scripts/strip-cdn-assets.mjs
 *   node scripts/strip-cdn-assets.mjs --dry-run
 */
import { stripCdnFromBuilds } from './lib/strip-cdn.mjs';

stripCdnFromBuilds({ dryRun: process.argv.includes('--dry-run') });
if (!process.argv.includes('--dry-run')) {
  console.log('已写入 build/.cdn_stripped');
  console.log('恢复本地预览: npm run cdn:restore');
}
