#!/usr/bin/env node
/**
 * 零外部依赖部署 CloudBase 云函数 cunkou-api（保留云端现有环境变量如 CUNKOU_JWT_SECRET / CUNKOU_WX_SECRET）。
 * 1) 在临时目录执行 npm install --omit=dev 并打包 zip
 * 2) 通过腾讯云 SCF TC3-HMAC-SHA256 接口查询命名空间并调用 UpdateFunctionCode
 * 3) 轮询等待函数状态恢复 Active，并验证线上 /cunkou-api/rank/list 路由返回 200（或 401 NO_TOKEN 而非 404）
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import https from 'https';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FN_NAME = 'cunkou-api';
const FN_DIR = path.join(ROOT, 'cloudfunctions', FN_NAME);
const ENV_ID = 'rosa-env-d7grf78r5dbd37323';
const GATEWAY_HOST = `${ENV_ID}.service.tcloudbase.com`;

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
  const candidates = [
    path.join(ROOT, 'tools', '.cdn_secret'),
    '/Users/rosa/rosa_games/code_1/tools/.cdn_secret',
    '/Users/rosa/rosa_games/srpg-rosa/scripts/.cdn_secret',
  ];
  for (const f of candidates) {
    if (fs.existsSync(f)) {
      const env = { ...readEnvFile(f), ...process.env };
      if (env.TENCENTCLOUD_SECRET_ID && env.TENCENTCLOUD_SECRET_KEY) {
        return {
          id: env.TENCENTCLOUD_SECRET_ID,
          key: env.TENCENTCLOUD_SECRET_KEY,
          region: env.TENCENTCLOUD_REGION || 'ap-shanghai',
        };
      }
    }
  }
  throw new Error('找不到包含 TENCENTCLOUD_SECRET_ID / KEY 的 .cdn_secret');
}

const secret = loadSecret();

const sha256Hex = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const hmacSha256 = (key, msg) => crypto.createHmac('sha256', key).update(msg).digest();

function httpsOnce({ hostname, path: reqPath = '/', method = 'POST', headers = {}, body = null, timeoutMs = 90000 }) {
  return new Promise((resolve, reject) => {
    const data = body == null ? null : Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    const req = https.request(
      {
        hostname,
        path: reqPath,
        method,
        headers: { ...headers, ...(data ? { 'Content-Length': data.length } : {}) },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ statusCode: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf-8') }));
      },
    );
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`timeout ${hostname}${reqPath}`)));
    if (data) req.write(data);
    req.end();
  });
}

async function httpsReq(opts) {
  let lastErr;
  for (let i = 0; i < 4; i++) {
    try {
      return await httpsOnce(opts);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 900 * (i + 1)));
    }
  }
  throw lastErr;
}

async function tc3Call(service, version, action, payloadObj, region = secret.region) {
  const host = `${service}.tencentcloudapi.com`;
  const payload = JSON.stringify(payloadObj || {});
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);

  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`;
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, sha256Hex(payload)].join('\n');

  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = ['TC3-HMAC-SHA256', String(timestamp), credentialScope, sha256Hex(canonicalRequest)].join('\n');

  const kDate = hmacSha256(`TC3${secret.key}`, date);
  const kService = hmacSha256(kDate, service);
  const kSigning = hmacSha256(kService, 'tc3_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization = `TC3-HMAC-SHA256 Credential=${secret.id}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const headers = {
    Authorization: authorization,
    'Content-Type': 'application/json; charset=utf-8',
    Host: host,
    'X-TC-Action': action,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': version,
    ...(region ? { 'X-TC-Region': region } : {}),
  };

  const res = await httpsReq({ hostname: host, path: '/', method: 'POST', headers, body: payload });
  const parsed = JSON.parse(res.body);
  if (parsed.Response && parsed.Response.Error) {
    const err = parsed.Response.Error;
    const e = new Error(`[${service}:${action}] ${err.Code}: ${err.Message}`);
    e.code = err.Code;
    throw e;
  }
  return parsed.Response;
}

function buildZipBase64() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cunkou-scf-'));
  const workDir = path.join(tmpRoot, FN_NAME);
  fs.cpSync(FN_DIR, workDir, {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      return base !== 'node_modules' && base !== '.env' && base !== 'config.env';
    },
  });
  console.log('[1/4] 安装云函数生产依赖...');
  execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
    cwd: workDir,
    stdio: 'inherit',
  });
  const zipPath = path.join(tmpRoot, `${FN_NAME}.zip`);
  execFileSync('zip', ['-rq', zipPath, '.'], { cwd: workDir, stdio: 'inherit' });
  const buf = fs.readFileSync(zipPath);
  console.log(`      打包完成: ${(buf.length / 1024 / 1024).toFixed(2)} MB`);
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  return buf.toString('base64');
}

async function ensureCollections() {
  for (const table of ['cunkou_rank', 'cunkou_tt_rank']) {
    try {
      await tc3Call('tcb', '2018-06-08', 'CreateTable', {
        EnvId: ENV_ID,
        TableName: table,
        PermissionInfo: 'ADMINONLY',
      });
      console.log(`      已创建集合 ${table}`);
    } catch (e) {
      if (String(e.code || '').includes('ResourceInUse') || String(e.message || '').includes('exist')) {
        console.log(`      集合已存在 ${table}`);
      } else {
        console.log(`      CreateTable(${table}) 跳过（由运行时 createCollection 兜底）: ${e.code || e.message}`);
      }
    }
  }
}

async function main() {
  console.log(`[0/4] 检查云端函数 ${FN_NAME} (namespace=${ENV_ID})...`);
  const info = await tc3Call('scf', '2018-04-16', 'GetFunction', {
    FunctionName: FN_NAME,
    Namespace: ENV_ID,
    ShowCode: 'FALSE',
  });
  console.log(`      当前状态: ${info.Status}, Runtime: ${info.Runtime}, Handler: ${info.Handler}`);

  await ensureCollections();

  const zipB64 = buildZipBase64();

  console.log('[2/4] 上传并更新云函数代码 (UpdateFunctionCode)...');
  await tc3Call('scf', '2018-04-16', 'UpdateFunctionCode', {
    FunctionName: FN_NAME,
    Namespace: ENV_ID,
    Handler: info.Handler || 'index.main',
    ZipFile: zipB64,
  });

  console.log('[3/4] 等待云函数更新生效...');
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const cur = await tc3Call('scf', '2018-04-16', 'GetFunction', {
      FunctionName: FN_NAME,
      Namespace: ENV_ID,
      ShowCode: 'FALSE',
    });
    console.log(`      poll #${i + 1}: Status=${cur.Status} LastUpdateStatus=${cur.LastUpdateStatus || '-'}`);
    if (cur.Status === 'Active' && (!cur.LastUpdateStatus || cur.LastUpdateStatus === 'Successful')) break;
    if (cur.Status === 'UpdateFailed' || cur.LastUpdateStatus === 'Failed') {
      throw new Error(`云函数更新失败: ${cur.StatusReasons || cur.StatusDesc}`);
    }
  }

  console.log('[4/4] 端到端验证线上排行榜接口...');
  const loginRes = await httpsReq({
    hostname: GATEWAY_HOST,
    path: '/cunkou-api/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ platform: 'anon', anonId: 'anon_smoke_verify_rank' }),
  });
  const loginJson = JSON.parse(loginRes.body);
  if (!loginJson.ok || !loginJson.data?.token) {
    throw new Error(`线上 /login 异常: ${loginRes.body}`);
  }
  const token = loginJson.data.token;

  // 只读验证 /rank/list（不向正式排行榜写入任何假测试数据！）
  for (const board of ['stage', 'power']) {
    const listRes = await httpsReq({
      hostname: GATEWAY_HOST,
      path: '/cunkou-api/rank/list',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ board }),
    });
    console.log(`      POST /cunkou-api/rank/list (${board}) -> HTTP ${listRes.statusCode}: ${listRes.body.slice(0, 180)}`);
    if (listRes.statusCode !== 200) throw new Error(`/rank/list (${board}) 失败: ${listRes.body}`);
  }
  console.log('✅ 云函数 cunkou-api 排行榜接口已全线就绪！');
}

main().catch((e) => {
  console.error('部署失败:', e);
  process.exit(1);
});
