#!/usr/bin/env node
/**
 * 村口大战外星人 CDN 资源增量上传（腾讯云 COS / CloudBase）
 *
 * 配置源：src/config/CdnConfig.ts（filePrefix 必须以 gameKey 开头，如 petTower/assets_cdn）
 * 本地密钥：scripts/.cdn_secret（已 gitignore）
 *
 * 用法：
 *   npm run cdn:upload -- --dry-run
 *   npm run cdn:upload
 *   npm run cdn:upload -- --force
 *   npm run cdn:upload -- --prune
 *   npm run cdn:upload -- --only subpackages/pkg-audio/bgm
 *
 * --only 用于「本地资源不全，但要上传某个新增目录」的场景（例如新拆出 bgm/ 目录）。
 * 此时目录级残缺护栏按定义必然触发，故在该范围外一律不比对、不上传、不删除。
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { PROJECT_ROOT, loadUploadEnv } from './loadEnv.js';
import {
  loadCdnConfig,
  scanLocalCdnFiles,
  preflightUpload,
  MANIFEST_LOCAL,
} from './cdn_scan.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');
const PRUNE = process.argv.includes('--prune');
const CONCURRENCY = Number(process.env.CDN_UPLOAD_CONCURRENCY || 5);

function fatalArg(msg) {
  console.error(`CDN 上传失败: ${msg}`);
  process.exit(1);
}

/** --only <远端路径前缀>：把本次上传限定在该前缀内 */
const ONLY_PREFIX = (() => {
  const i = process.argv.indexOf('--only');
  if (i < 0) return '';
  const v = process.argv[i + 1];
  if (!v || v.startsWith('--')) {
    fatalArg('--only 需要一个远端路径前缀，如 --only subpackages/pkg-audio/bgm');
  }
  return v.replace(/^\/+|\/+$/g, '');
})();

if (ONLY_PREFIX && PRUNE) {
  // prune 要以本地为权威全集，而 --only 的前提正是本地不全
  fatalArg('--only 不能与 --prune 同用（prune 需要全集视角，会误删范围外的云端文件）');
}

const inOnlyScope = (remotePath) => !ONLY_PREFIX
  || remotePath === ONLY_PREFIX
  || remotePath.startsWith(`${ONLY_PREFIX}/`);

const cfg = loadCdnConfig();
const env = loadUploadEnv();
const BUCKET = env.cloudBucket || cfg.cloudBucket;
const SECRET_ID = env.tencentSecretId;
const SECRET_KEY = env.tencentSecretKey;
const CDN_BASE_URL = (env.cdnBaseUrl || cfg.baseUrl || '').replace(/\/+$/, '');
const CDN_FILE_PREFIX = cfg.filePrefix;

let REGION = env.tencentRegion || '';

function sha1Hex(input) {
  return crypto.createHash('sha1').update(input).digest('hex');
}

function hmacSha1Hex(key, input) {
  return crypto.createHmac('sha1', key).update(input).digest('hex');
}

function encodePathname(p) {
  return p.split('/').map(seg => encodeURIComponent(seg)).join('/');
}

function requestRaw({ method = 'GET', hostname, path: reqPath = '/', headers = {}, body = null, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const data = body === null || body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    const req = https.request({
      hostname,
      path: reqPath,
      method,
      headers: {
        ...headers,
        ...(data ? { 'Content-Length': data.length } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`request timeout after ${timeoutMs}ms: ${hostname}${reqPath}`));
    });
    if (data) req.write(data);
    req.end();
  });
}

function cosAuth({ method, host, uri, query = '' }) {
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now - 60};${now + 3600}`;
  const signKey = hmacSha1Hex(SECRET_KEY, keyTime);
  const headerList = 'host';
  const httpString = `${method.toLowerCase()}\n${uri}\n${query}\nhost=${host}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`;
  const signature = hmacSha1Hex(signKey, stringToSign);
  return [
    'q-sign-algorithm=sha1',
    `q-ak=${SECRET_ID}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerList}`,
    'q-url-param-list=',
    `q-signature=${signature}`,
  ].join('&');
}

async function inferRegion() {
  if (REGION) return REGION;
  const host = 'service.cos.myqcloud.com';
  const uri = '/';
  const authorization = cosAuth({ method: 'GET', host, uri });
  const res = await requestRaw({
    method: 'GET',
    hostname: host,
    path: uri,
    headers: { Host: host, Authorization: authorization },
  });
  const text = res.body.toString('utf-8');
  const bucketPattern = new RegExp(`<Name>${BUCKET.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</Name>[\\s\\S]*?<Location>([^<]+)</Location>`);
  const m = text.match(bucketPattern);
  if (!m) {
    throw new Error(`无法自动识别 bucket 地域，请在 scripts/.cdn_secret 增加 TENCENTCLOUD_REGION。COS 返回 ${res.statusCode}: ${text.slice(0, 300)}`);
  }
  REGION = m[1].trim();
  return REGION;
}

function cosHost() {
  return `${BUCKET}.cos.${REGION}.myqcloud.com`;
}

async function cosRequest(method, objectPath, body = null, headers = {}) {
  const host = cosHost();
  const uri = `/${encodePathname(objectPath)}`;
  const authorization = cosAuth({ method, host, uri });
  return requestRaw({
    method,
    hostname: host,
    path: uri,
    headers: {
      Host: host,
      Authorization: authorization,
      ...headers,
    },
    body,
  });
}

async function putObject(objectPath, localPath, contentType = 'application/octet-stream', extraHeaders = {}) {
  const body = fs.readFileSync(localPath);
  const res = await cosRequest('PUT', objectPath, body, {
    'Content-Type': contentType,
    ...extraHeaders,
  });
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`PUT ${objectPath} 返回 ${res.statusCode}: ${res.body.toString('utf-8').slice(0, 300)}`);
  }
}

async function deleteObject(objectPath) {
  const res = await cosRequest('DELETE', objectPath);
  if (![200, 204, 404].includes(res.statusCode)) {
    throw new Error(`DELETE ${objectPath} 返回 ${res.statusCode}: ${res.body.toString('utf-8').slice(0, 300)}`);
  }
}

async function fetchRemoteManifest() {
  if (!CDN_BASE_URL) return null;
  const url = new URL(`${CDN_BASE_URL}/${CDN_FILE_PREFIX}/manifest.json`);
  try {
    const res = await requestRaw({ method: 'GET', hostname: url.hostname, path: url.pathname + url.search });
    if (res.statusCode !== 200) return null;
    const parsed = JSON.parse(res.body.toString('utf-8'));
    return parsed && parsed.files ? parsed : null;
  } catch (_) {
    return null;
  }
}

function contentTypeByExt(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.json') return 'application/json';
  return 'application/octet-stream';
}

async function runWithConcurrency(tasks, concurrency) {
  let done = 0;
  let failed = 0;
  const executing = new Set();
  const results = [];
  for (const task of tasks) {
    const p = task().then(() => { done++; }, () => { failed++; });
    results.push(p);
    executing.add(p);
    p.finally(() => executing.delete(p));
    if (executing.size >= concurrency) await Promise.race(executing);
  }
  await Promise.allSettled(results);
  return { done, failed };
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

async function main() {
  console.log('=== 村口大战外星人 CDN 资源上传（腾讯云 COS / CloudBase）===');
  console.log('bucket:', BUCKET);
  console.log('CDN:', CDN_BASE_URL || '(未配置)');
  console.log('云目录:', CDN_FILE_PREFIX);
  console.log('模式:', FORCE ? '强制全量' : DRY_RUN ? 'dry-run' : '增量');
  console.log('删除远端旧文件:', PRUNE ? '开启 (--prune)' : '关闭（默认保留，兼容旧客户端）');
  console.log('');

  if (!cfg.enabled) throw new Error('CDN_CONFIG.enabled=false，已停止上传');
  if (!CDN_FILE_PREFIX || !String(CDN_FILE_PREFIX).includes('/')) {
    throw new Error('CdnConfig.filePrefix 必须是 `{gameKey}/assets_cdn` 形式（当前缺少 gameKey 前缀）');
  }
  if (!BUCKET) throw new Error('缺少 CDN_CLOUD_BUCKET / CdnConfig.cloudBucket');

  const scanned = scanLocalCdnFiles(cfg);
  const allFiles = scanned.allFiles.filter((f) => inOnlyScope(f.remote));
  const localManifest = Object.fromEntries(
    Object.entries(scanned.localManifest).filter(([rp]) => inOnlyScope(rp)),
  );
  console.log(ONLY_PREFIX
    ? `磁盘扫描: ${allFiles.length} 个文件（限定 --only ${ONLY_PREFIX}，全量为 ${scanned.allFiles.length}）`
    : `磁盘扫描: ${allFiles.length} 个文件（cdnDirs 全量）`);

  if (!SECRET_ID || !SECRET_KEY) {
    // 无密钥也先跑本地护栏（dry-run / 配置检查）
    try {
      const { warnings } = preflightUpload({
        cfg, allFiles, localManifest, remoteFiles: {}, allowPrune: PRUNE,
        onlyPrefix: ONLY_PREFIX,
      });
      for (const w of warnings) console.warn(w);
    } catch (e) {
      if (DRY_RUN) {
        console.warn('preflight:', e.message || e);
        return;
      }
      throw e;
    }
    if (DRY_RUN) {
      console.log('dry-run: 未配置腾讯云 SecretId/SecretKey，跳过远端对比。');
      return;
    }
    throw new Error('缺少 TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY');
  }

  const region = await inferRegion();
  console.log('region:', region);

  const remoteManifest = FORCE ? null : await fetchRemoteManifest();
  const oldFiles = remoteManifest?.files || {};
  const oldVersion = Number(remoteManifest?.version || 0);
  console.log(remoteManifest
    ? `云端 manifest: v${oldVersion}, ${Object.keys(oldFiles).length} 个文件`
    : '云端无 manifest，将全量对齐');

  const { warnings, expected } = preflightUpload({
    cfg, allFiles, localManifest, remoteFiles: oldFiles, allowPrune: PRUNE,
    onlyPrefix: ONLY_PREFIX,
  });
  for (const w of warnings) console.warn(w);
  console.log(`代码期望 CDN 路径: ${expected.length}（已与磁盘交叉校验）`);

  const toUpload = [];
  const toDelete = [];
  let skipped = 0;
  for (const [rp, info] of Object.entries(localManifest)) {
    if (!FORCE && oldFiles[rp]?.hash === info.hash) skipped++;
    else toUpload.push(rp);
  }
  if (PRUNE) {
    for (const rp of Object.keys(oldFiles)) {
      if (!localManifest[rp]) toDelete.push(rp);
    }
  }

  console.log(`新增/更新: ${toUpload.length}`);
  console.log(`删除: ${toDelete.length}`);
  console.log(`跳过: ${skipped}`);
  if (toUpload.length > 0) {
    console.log('待上传:');
    for (const rp of [...toUpload].sort()) console.log(`  + ${rp} (${formatSize(localManifest[rp]?.size || 0)})`);
  }
  if (toDelete.length > 0) {
    console.log('待删除:');
    for (const rp of [...toDelete].sort()) console.log(`  - ${rp}`);
  }
  if (DRY_RUN) {
    console.log('dry-run 完成，未上传/删除任何文件。');
    return;
  }
  if (toUpload.length === 0 && toDelete.length === 0) {
    // 仍刷新本地 manifest 缓存，避免开发机清单落后云端
    if (remoteManifest) {
      fs.writeFileSync(MANIFEST_LOCAL, JSON.stringify(remoteManifest, null, 2), 'utf-8');
    }
    console.log('无变更，已是最新。');
    return;
  }

  const tasks = toUpload.map(rp => {
    const fileInfo = allFiles.find(f => f.remote === rp);
    return async () => {
      try {
        await putObject(`${CDN_FILE_PREFIX}/${rp}`, fileInfo.local, contentTypeByExt(fileInfo.local));
        console.log(`  [+] ${rp}`);
      } catch (e) {
        console.error(`  [x] ${rp}: ${e.message}`);
        throw e;
      }
    };
  });

  console.log(`开始上传 ${toUpload.length} 个文件，并发 ${CONCURRENCY}...`);
  const { done: uploaded, failed } = await runWithConcurrency(tasks, CONCURRENCY);
  if (failed > 0) throw new Error(`有 ${failed} 个文件上传失败，manifest 未更新`);

  if (toDelete.length > 0) {
    console.log(`删除远端多余文件 ${toDelete.length} 个...`);
    for (const rp of toDelete) await deleteObject(`${CDN_FILE_PREFIX}/${rp}`);
  }

  /**
   * 合并清单：默认保留远端已有条目，再用本地扫描覆盖。
   * 禁止在 cdn:strip 后用残缺本地扫描整表覆写（曾把 476→15，导致真机立绘全挂）。
   * --prune 时才以本地为权威全集。
   */
  const mergedFiles = PRUNE
    ? { ...localManifest }
    : { ...oldFiles, ...localManifest };
  const newManifest = {
    version: oldVersion + 1,
    updated: new Date().toISOString(),
    filePrefix: CDN_FILE_PREFIX,
    files: mergedFiles,
  };
  const tmpManifest = path.join(__dirname, '_tmp_cdn_manifest.json');
  fs.writeFileSync(tmpManifest, JSON.stringify(newManifest, null, 2), 'utf-8');
  try {
    // manifest 必须禁边缘缓存，否则 strip 后残缺清单会长时间毒害真机
    await putObject(`${CDN_FILE_PREFIX}/manifest.json`, tmpManifest, 'application/json', {
      'Cache-Control': 'no-cache, max-age=0, must-revalidate',
    });
  } finally {
    try { fs.unlinkSync(tmpManifest); } catch (_) {}
  }
  fs.writeFileSync(MANIFEST_LOCAL, JSON.stringify(newManifest, null, 2), 'utf-8');

  console.log('');
  console.log('=== CDN 同步完成 ===');
  console.log(`上传成功: ${uploaded}`);
  console.log(`删除: ${toDelete.length}`);
  console.log(`manifest: v${newManifest.version}`);
}

main().catch((e) => {
  console.error('CDN 上传失败:', e.message || e);
  process.exit(1);
});

