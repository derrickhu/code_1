/**
 * 游戏运行时会请求的资源路径（相对小游戏根，如 images/hero/x.png）。
 *
 * 上传 / 组装共用：只把这里出现的文件拷进 build、同步到 CDN。
 * 磁盘上多出来的原图、废图不进包也不上传。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC = path.join(rootDir, 'src');
const ASSETS = path.join(rootDir, 'assets');

function read(rel) {
  return fs.readFileSync(path.join(rootDir, rel), 'utf8');
}

function quotedStrings(text) {
  return [...text.matchAll(/'((?:images|audio|subpackages)\/[A-Za-z0-9_./-]+\.(?:png|jpg|jpeg|webp|mp3))'/g)]
    .map((m) => m[1]);
}

function exportedString(text, name) {
  const m = text.match(new RegExp(`export const ${name}\\s*=\\s*'([^']+)'`));
  return m?.[1] ?? '';
}

function constStringArray(text, name) {
  const m = text.match(new RegExp(`export const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) return [];
  return [...m[1].matchAll(/'([A-Za-z0-9_]+)'/g)].map((x) => x[1]);
}

function objectStringValues(text, key) {
  const re = new RegExp(`${key}:\\s*'([A-Za-z0-9_]+)'`, 'g');
  return [...text.matchAll(re)].map((m) => m[1]);
}

function walkTs(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (name === '__tests__' || name === 'node_modules') continue;
    const st = fs.statSync(full);
    if (st.isDirectory()) walkTs(full, out);
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

function walkFiles(dir, prefix, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    if (name === '.DS_Store' || name === 'Thumbs.db') continue;
    const full = path.join(dir, name);
    const remote = prefix ? `${prefix}/${name}` : name;
    const st = fs.statSync(full);
    if (st.isDirectory()) walkFiles(full, remote, out);
    else out.push({ local: full, remote, size: st.size });
  }
  return out;
}

/** 从表和源码字面量收集运行时路径 */
export function collectUsedAssetPaths() {
  const set = new Set();
  const add = (p) => {
    if (p) set.add(p.replace(/^\/+/, ''));
  };

  const villagers = read('src/balance/villagers.ts');
  const villagerIds = constStringArray(villagers, 'LEGACY_IDS');
  const villagerBlock = villagers.match(/export const VILLAGERS[\s\S]*?^];/m)?.[0] ?? villagers;
  for (const id of objectStringValues(villagerBlock, 'id')) villagerIds.push(id);
  const uniqueVillagers = [...new Set(villagerIds)];

  const stages = read('src/balance/stages.ts');
  const enemyBlock = stages.match(/export const ENEMIES[\s\S]*?^];/m)?.[0] ?? '';
  const enemyIds = [...new Set(objectStringValues(enemyBlock, 'id'))];

  const loader = read('src/core/TextureLoader.ts');
  const artMap = {};
  for (const m of loader.matchAll(/^\s*([a-z0-9_]+):\s*'([a-z0-9_]+)',?\s*$/gm)) {
    artMap[m[1]] = m[2];
  }
  const uiFiles = constStringArray(loader, 'UI_FILES');
  const gripIds = constStringArray(loader, 'HERO_GRIP_IDS');
  const vfxFiles = constStringArray(loader, 'VFX_FILES');
  const projFiles = constStringArray(loader, 'PROJ_FILES');
  const homePack = read('src/config/HomePack.ts');
  const homeUi = new Set(constStringArray(homePack, 'HOME_UI_NAMES'));
  const homeArt = new Set(constStringArray(homePack, 'HOME_ART_UI_NAMES'));
  const homeRoot = exportedString(homePack, 'HOME_PACK_ROOT') || 'subpackages/pkg-home';
  const homeArtRoot = exportedString(homePack, 'HOME_ART_PACK_ROOT') || 'subpackages/pkg-home-art';

  const gear = read('src/balance/gear.ts');
  const starterWeps = constStringArray(gear, 'STARTER_WEP_IDS');
  const wearIds = [
    ...objectStringValues(gear, 'head'),
    ...objectStringValues(gear, 'back'),
    ...objectStringValues(gear, 'body'),
  ];

  for (const id of uniqueVillagers) {
    add(`images/hero/${id}.png`);
    for (const s of [1, 2, 3]) add(`images/hero/${id}_evo${s}.png`);
    for (let i = 0; i < 4; i += 1) {
      add(`images/anim/${id}_idle_${i}.png`);
      add(`images/anim/${id}_atk_${i}.png`);
    }
  }
  for (const id of constStringArray(villagers, 'LEGACY_IDS')) {
    add(`images/hero/${id}_atk.png`);
  }
  for (const id of gripIds) add(`images/hero/${id}_grip.png`);

  for (const id of enemyIds) {
    const art = artMap[id] ?? id;
    add(`images/enemy/${art}.png`);
    for (let i = 0; i < 4; i += 1) {
      add(`images/anim/${art}_walk_${i}.png`);
      add(`images/anim/${art}_atk_${i}.png`);
    }
    add(`images/anim/${art}_idle_0.png`);
    add(`images/anim/${art}_idle_1.png`);
  }

  for (const n of uiFiles) {
    if (homeArt.has(n)) add(`${homeArtRoot}/images/ui/${n}.png`);
    else if (homeUi.has(n)) add(`${homeRoot}/images/ui/${n}.png`);
    else add(`images/ui/${n}.png`);
  }
  for (const n of vfxFiles) add(`images/vfx/${n}.png`);
  for (const n of projFiles) add(`images/proj/${n}.png`);
  for (const id of starterWeps) add(`images/wep/${id}.png`);
  for (const id of new Set(wearIds)) add(`images/mod/${id}.png`);

  const sfx = read('src/core/SfxPlayer.ts');
  const bgm = read('src/core/BgmPlayer.ts');
  const flip = read('src/fx/Flipbook.ts');
  for (const p of [
    ...quotedStrings(loader),
    ...quotedStrings(gear),
    ...quotedStrings(sfx),
    ...quotedStrings(bgm),
    ...quotedStrings(flip),
  ]) add(p);

  for (const spec of [...flip.matchAll(/file:\s*'([a-z0-9_]+)'/g)]) {
    add(`images/vfx/${spec[1]}.png`);
  }

  for (const full of walkTs(SRC)) {
    for (const p of quotedStrings(fs.readFileSync(full, 'utf8'))) add(p);
  }

  return [...set].sort();
}

export function listDiskAssets() {
  return [
    ...walkFiles(path.join(ASSETS, 'images'), 'images'),
    ...walkFiles(path.join(ASSETS, 'audio'), 'audio'),
  ];
}

export function usedPathToDiskRemote(used) {
  const m = used.match(/^subpackages\/[^/]+\/(.+)$/);
  return m ? m[1] : used;
}

export function classifyAssets() {
  const used = new Set(collectUsedAssetPaths());
  const disk = listDiskAssets();
  const diskRemotes = new Set(disk.map((f) => f.remote));
  const usedDisk = new Set([...used].map(usedPathToDiskRemote));
  const unused = disk.filter((f) => !usedDisk.has(f.remote)).sort((a, b) => a.remote.localeCompare(b.remote));
  const missing = [...used]
    .filter((p) => !diskRemotes.has(usedPathToDiskRemote(p)))
    .sort();
  return { used: [...used], disk, unused, missing };
}

export function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export { rootDir, ASSETS };
