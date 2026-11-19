#!/usr/bin/env node
/**
 * 村口大战外星人：把微信导出的资源传到云存储。
 * StreamingAssets（图包 art/、曲子 Music/）→ cunkou/StreamingAssets
 * 首包 {md5}.webgl.data.unityweb.bin.txt → cunkou/ 根上，和 game.js 的 DATA_CDN 拼在一起。
 * 做法照搬 xiaochu2/scripts/upload_cdn.js：COS 签名 PUT，按远端 manifest.json 里的 sha1 比对只传变了的文件。
 *
 *   node tools/upload_cdn.mjs --dry-run   只列出要传什么
 *   node tools/upload_cdn.mjs             增量上传
 *   node tools/upload_cdn.mjs --force     全量重传
 *   node tools/upload_cdn.mjs --prune     顺带删掉远端本地已没有的文件（默认保留，老版本客户端还要用）
 *
 * 密钥：tools/.cdn_secret（已 gitignore），没有就读 xiaochu2/scripts/.cdn_secret（同一个云开发环境共用一对）。
 *   TENCENTCLOUD_SECRET_ID=...
 *   TENCENTCLOUD_SECRET_KEY=...
 *   TENCENTCLOUD_REGION=ap-shanghai   （可选，不填自动查）
 */
import fs from 'fs';
import path from 'path';
import https from 'https';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL = path.join(ROOT, 'wechat-minigame', 'webgl', 'StreamingAssets');
const WEBGL = path.join(ROOT, 'wechat-minigame', 'webgl');
const BUCKET = '726f-rosa-env-d7grf78r5dbd37323-1414200063';
const BASE_URL = `https://${BUCKET}.tcb.qcloud.la`;
const PREFIX = 'cunkou/StreamingAssets';
const DATA_PREFIX = 'cunkou';
const FORCE = process.argv.includes('--force');
const DRY_RUN = process.argv.includes('--dry-run');
const PRUNE = process.argv.includes('--prune');
const CONCURRENCY = Number(process.env.CDN_UPLOAD_CONCURRENCY || 5);

function readEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return out;
}

function loadSecret() {
  const own = path.join(ROOT, 'tools', '.cdn_secret');
  const shared = path.join(ROOT, '..', 'xiaochu2', 'scripts', '.cdn_secret');
  const file = fs.existsSync(own) ? own : shared;
  const env = { ...readEnvFile(file), ...process.env };
  return { id: env.TENCENTCLOUD_SECRET_ID || '', key: env.TENCENTCLOUD_SECRET_KEY || '', region: env.TENCENTCLOUD_REGION || 'ap-shanghai', file };
}

const secret = loadSecret();
let REGION = secret.region;

const sha1Hex = (s) => crypto.createHash('sha1').update(s).digest('hex');
const hmacSha1Hex = (k, s) => crypto.createHmac('sha1', k).update(s).digest('hex');
const encodePathname = (p) => p.split('/').map(encodeURIComponent).join('/');

function requestOnce({ method = 'GET', hostname, path: reqPath = '/', headers = {}, body = null, timeoutMs = 60000 }) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    const req = https.request({ hostname, path: reqPath, method, headers: { ...headers, ...(data ? { 'Content-Length': data.length } : {}) } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout ${hostname}${reqPath}`)));
    if (data) req.write(data);
    req.end();
  });
}

async function request(opts) {
  let lastErr;
  for (let i = 0; i < 4; i++) {
    try {
      return await requestOnce(opts);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

function cosAuth(method, host, uri) {
  const now = Math.floor(Date.now() / 1000);
  const keyTime = `${now - 60};${now + 3600}`;
  const signKey = hmacSha1Hex(secret.key, keyTime);
  const httpString = `${method.toLowerCase()}\n${uri}\n\nhost=${host}\n`;
  const signature = hmacSha1Hex(signKey, `sha1\n${keyTime}\n${sha1Hex(httpString)}\n`);
  return ['q-sign-algorithm=sha1', `q-ak=${secret.id}`, `q-sign-time=${keyTime}`, `q-key-time=${keyTime}`,
    'q-header-list=host', 'q-url-param-list=', `q-signature=${signature}`].join('&');
}

async function inferRegion() {
  if (REGION) return REGION;
  const host = 'service.cos.myqcloud.com';
  const res = await request({ hostname: host, path: '/', headers: { Host: host, Authorization: cosAuth('GET', host, '/') } });
  const text = res.body.toString('utf-8');
  const m = text.match(new RegExp(`<Name>${BUCKET}</Name>[\\s\\S]*?<Location>([^<]+)</Location>`));
  if (!m) throw new Error(`查不到 bucket 地域，请在 .cdn_secret 里加 TENCENTCLOUD_REGION。COS 返回 ${res.statusCode}: ${text.slice(0, 200)}`);
  return (REGION = m[1].trim());
}

async function cos(method, objectPath, body = null, headers = {}, timeoutMs = 60000) {
  const host = `${BUCKET}.cos.${REGION}.myqcloud.com`;
  const uri = `/${encodePathname(objectPath)}`;
  const res = await request({ method, hostname: host, path: uri, headers: { Host: host, Authorization: cosAuth(method, host, uri), ...headers }, body, timeoutMs });
  if (res.statusCode < 200 || (res.statusCode >= 300 && !(method === 'DELETE' && res.statusCode === 404)))
    throw new Error(`${method} ${objectPath} 返回 ${res.statusCode}: ${res.body.toString('utf-8').slice(0, 200)}`);
}

function contentType(file) {
  const ext = path.extname(file).toLowerCase();
  return ext === '.mp3' ? 'audio/mpeg' : ext === '.json' ? 'application/json' : 'application/octet-stream';
}

function scan() {
  const files = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (!e.name.startsWith('.') && !e.name.endsWith('.meta') && !e.name.endsWith('.manifest')) {
        const buf = fs.readFileSync(full);
        files[path.relative(LOCAL, full).split(path.sep).join('/')] = { hash: sha1Hex(buf), size: buf.length, local: full };
      }
    }
  };
  walk(LOCAL);
  return files;
}

async function remoteManifest() {
  const url = new URL(`${BASE_URL}/${PREFIX}/manifest.json?t=${Date.now()}`);
  try {
    const res = await request({ hostname: url.hostname, path: url.pathname + url.search });
    if (res.statusCode !== 200) return null;
    const m = JSON.parse(res.body.toString('utf-8'));
    return m && m.files ? m : null;
  } catch (_) {
    return null;
  }
}

async function pool(tasks, n) {
  let failed = 0;
  const running = new Set();
  for (const t of tasks) {
    const p = t().catch(() => { failed++; });
    running.add(p);
    p.finally(() => running.delete(p));
    if (running.size >= n) await Promise.race(running);
  }
  await Promise.allSettled([...running]);
  return failed;
}

const mb = (b) => `${(b / 1048576).toFixed(2)} MB`;

function scanDataPacks() {
  if (!fs.existsSync(WEBGL)) return [];
  return fs.readdirSync(WEBGL)
    .filter((name) => /\.webgl\.data\.unityweb\.bin\.(txt|br)$/.test(name))
    .map((name) => {
      const local = path.join(WEBGL, name);
      const buf = fs.readFileSync(local);
      return { name, local, hash: sha1Hex(buf), size: buf.length };
    });
}

async function dataManifest() {
  const url = new URL(`${BASE_URL}/${DATA_PREFIX}/datapack-manifest.json?t=${Date.now()}`);
  try {
    const res = await request({ hostname: url.hostname, path: url.pathname + url.search });
    if (res.statusCode !== 200) return null;
    const m = JSON.parse(res.body.toString('utf-8'));
    return m && m.files ? m : null;
  } catch (_) {
    return null;
  }
}

async function main() {
  if (!fs.existsSync(LOCAL)) throw new Error(`没有 ${LOCAL}，先导出微信小游戏`);
  const local = scan();
  const total = Object.values(local).reduce((a, f) => a + f.size, 0);
  console.log(`图包曲子 ${Object.keys(local).length} 个文件，共 ${mb(total)}  →  ${BASE_URL}/${PREFIX}/`);
  const remote = FORCE ? null : await remoteManifest();
  const old = remote?.files || {};
  console.log(remote ? `云端清单 v${remote.version}，${Object.keys(old).length} 个文件` : '云端没有图包清单，全量上传');

  const up = Object.keys(local).filter((rp) => FORCE || old[rp]?.hash !== local[rp].hash).sort();
  const del = PRUNE ? Object.keys(old).filter((rp) => !local[rp]).sort() : [];
  const upBytes = up.reduce((a, rp) => a + local[rp].size, 0);
  console.log(`图包要上传 ${up.length} 个（${mb(upBytes)}），删除 ${del.length} 个，跳过 ${Object.keys(local).length - up.length} 个`);
  for (const rp of up) console.log(`  + ${rp} (${mb(local[rp].size)})`);
  for (const rp of del) console.log(`  - ${rp}`);

  const packs = scanDataPacks();
  if (packs.length === 0) throw new Error(`没有 ${WEBGL}/*.webgl.data.unityweb.bin.txt，先导出微信小游戏`);
  const packRemote = FORCE ? null : await dataManifest();
  const packOld = packRemote?.files || {};
  const packUp = packs.filter((f) => FORCE || packOld[f.name]?.hash !== f.hash);
  console.log(`首包 ${packs.length} 个，要上传 ${packUp.length} 个 → ${BASE_URL}/${DATA_PREFIX}/`);
  for (const f of packs) console.log(`  ${packUp.includes(f) ? '+' : '='} ${f.name} (${mb(f.size)})`);

  if (DRY_RUN) return console.log('dry-run：没有上传任何文件。');
  if (!secret.id || !secret.key) throw new Error(`缺 TENCENTCLOUD_SECRET_ID / KEY（读的是 ${secret.file}）`);
  if (up.length === 0 && del.length === 0 && packUp.length === 0) return console.log('已是最新。');

  console.log('region:', await inferRegion());
  const failed = await pool(up.map((rp) => async () => {
    try {
      await cos('PUT', `${PREFIX}/${rp}`, fs.readFileSync(local[rp].local), { 'Content-Type': contentType(rp) });
      console.log(`  [+] ${rp}`);
    } catch (e) {
      console.error(`  [x] ${rp}: ${e.message}`);
      throw e;
    }
  }), CONCURRENCY);
  if (failed) throw new Error(`${failed} 个图包上传失败，清单没更新，重跑即可续传`);
  for (const rp of del) await cos('DELETE', `${PREFIX}/${rp}`);

  if (up.length || del.length) {
    const files = PRUNE ? {} : { ...old };
    for (const [rp, f] of Object.entries(local)) files[rp] = { hash: f.hash, size: f.size };
    const manifest = { version: Number(remote?.version || 0) + 1, updated: new Date().toISOString(), files };
    // 清单名含 json，微信插件不会缓存它；CDN 边缘也不许缓存，否则会拿到旧清单。
    await cos('PUT', `${PREFIX}/manifest.json`, JSON.stringify(manifest, null, 1), {
      'Content-Type': 'application/json', 'Cache-Control': 'no-cache, max-age=0, must-revalidate',
    });
    console.log(`图包完成：上传 ${up.length} 个，清单 v${manifest.version}`);
  }

  let packFailed = 0;
  for (const f of packUp) {
    try {
      await cos('PUT', `${DATA_PREFIX}/${f.name}`, fs.readFileSync(f.local), {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000',
      }, 300000);
      console.log(`  [+] ${f.name}`);
    } catch (e) {
      packFailed++;
      console.error(`  [x] ${f.name}: ${e.message}`);
    }
  }
  if (packFailed) throw new Error(`${packFailed} 个首包上传失败，重跑即可续传`);
  if (packUp.length) {
    const files = { ...packOld };
    for (const f of packs) files[f.name] = { hash: f.hash, size: f.size };
    await cos('PUT', `${DATA_PREFIX}/datapack-manifest.json`, JSON.stringify({
      version: Number(packRemote?.version || 0) + 1, updated: new Date().toISOString(), files,
    }, null, 1), {
      'Content-Type': 'application/json', 'Cache-Control': 'no-cache, max-age=0, must-revalidate',
    });
  }
  for (const f of packs) console.log(`首包地址 ${BASE_URL}/${DATA_PREFIX}/${f.name}`);
}

main().catch((e) => {
  console.error('CDN 上传失败:', e.message || e);
  process.exit(1);
});
