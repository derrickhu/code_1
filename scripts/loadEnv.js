/**
 * 本地脚本配置加载器（CDN 上传等）。
 *
 * 读取顺序：
 *   1. scripts/.cdn_secret
 *   2. 当前进程环境变量（优先级最高）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, '..');

function readEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return out;
}

export function loadEnv() {
  const secretFile = path.join(__dirname, '.cdn_secret');
  return {
    ...readEnvFile(secretFile),
    ...process.env,
  };
}

export function loadUploadEnv() {
  const env = loadEnv();
  return {
    cloudBucket: env.CDN_CLOUD_BUCKET || '',
    tencentSecretId: env.TENCENTCLOUD_SECRET_ID || '',
    tencentSecretKey: env.TENCENTCLOUD_SECRET_KEY || '',
    tencentRegion: env.TENCENTCLOUD_REGION || '',
    cdnBaseUrl: env.CDN_BASE_URL || '',
  };
}
