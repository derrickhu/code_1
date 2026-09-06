/**
 * 把源目录镜像成普通文件树（给微信 / 抖音开发者工具用）。
 *
 * 规则（慎重）：
 * - 真源覆盖：dest 不是「同大小且不比源旧」的普通文件，就按源重写
 * - 拷完不回拨 dest mtime，方便开发者工具看见变化
 * - 禁止软链 / 硬链落在 dest：工具上传和误删都会出事
 * - 原子替换：先写临时文件再 rename，避免拷到一半被工具读到半截
 * - 类型变化（文件↔目录）先删再写
 * - prune 时删 dest 多出来的项，但留下工具私货和缓存
 */
import fs from 'node:fs';
import path from 'node:path';

const KEEP_ALWAYS = new Set(['project.private.config.json']);
const TMP_SUFFIX = '.code1-tmp';
const COPY_RETRIES = 4;
const RETRY_WAIT_MS = 40;
const CLONE = fs.constants.COPYFILE_FICLONE ?? 0;

export function createMirrorStats() {
  return { copied: 0, skipped: 0, pruned: 0, repaired: 0 };
}

export function lstatOrNull(p) {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

function sleepSync(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function sameInode(a, b) {
  return Boolean(a && b && a.dev === b.dev && a.ino === b.ino);
}

function isRetryable(err) {
  const code = err && typeof err === 'object' && 'code' in err ? err.code : '';
  return code === 'EBUSY' || code === 'EACCES' || code === 'EPERM' || code === 'EAGAIN';
}

function rm(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyFileOnce(src, dest, allowClone) {
  if (allowClone && CLONE) {
    try {
      fs.copyFileSync(src, dest, CLONE);
      return;
    } catch {
      // APFS 以外或 clone 失败，走普通拷贝
    }
  }
  fs.copyFileSync(src, dest);
}

function copyFileWithRetry(src, dest, allowClone) {
  let last = null;
  for (let i = 0; i < COPY_RETRIES; i++) {
    try {
      copyFileOnce(src, dest, allowClone);
      return;
    } catch (err) {
      last = err;
      if (!isRetryable(err) || i === COPY_RETRIES - 1) throw err;
      sleepSync(RETRY_WAIT_MS * (i + 1));
    }
  }
  throw last;
}

function isFreshRegularCopy(srcStat, destStat) {
  if (!destStat || destStat.isSymbolicLink() || !destStat.isFile()) return false;
  if (sameInode(srcStat, destStat)) return false;
  if (destStat.size !== srcStat.size) return false;
  return destStat.mtimeMs >= srcStat.mtimeMs;
}

function prepareDestForFile(dest, destStat, stats) {
  if (!destStat) return;
  if (destStat.isSymbolicLink() || destStat.isDirectory() || !destStat.isFile()) {
    rm(dest);
    stats.repaired += 1;
  }
}

function prepareDestForDir(dest, destStat, stats) {
  if (!destStat) return;
  if (destStat.isSymbolicLink() || !destStat.isDirectory()) {
    rm(dest);
    stats.repaired += 1;
  }
}

function cleanTmp(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith(TMP_SUFFIX)) rm(path.join(dir, name));
  }
}

function atomicCopyFile(src, dest, srcStat, stats) {
  const destStat = lstatOrNull(dest);
  if (isFreshRegularCopy(srcStat, destStat)) {
    stats.skipped += 1;
    return;
  }
  if (destStat && (destStat.isSymbolicLink() || sameInode(srcStat, destStat))) {
    stats.repaired += 1;
  }
  prepareDestForFile(dest, destStat, stats);

  const tmp = path.join(path.dirname(dest), `.${path.basename(dest)}${TMP_SUFFIX}`);
  rm(tmp);
  try {
    copyFileWithRetry(src, tmp, true);
    let tmpStat = fs.statSync(tmp);
    if (sameInode(srcStat, tmpStat)) {
      rm(tmp);
      copyFileWithRetry(src, tmp, false);
      tmpStat = fs.statSync(tmp);
      stats.repaired += 1;
    }
    if (sameInode(srcStat, tmpStat)) {
      throw new Error(`[mirror-tree] 拷贝仍与源同一 inode：${dest}`);
    }
    fs.renameSync(tmp, dest);
    stats.copied += 1;
  } catch (err) {
    rm(tmp);
    throw err;
  }
}

function followedStat(abs, dirent) {
  if (dirent.isSymbolicLink()) return fs.statSync(abs);
  return dirent;
}

/**
 * @param {string} from
 * @param {string} to
 * @param {{ skip?: Set<string>, prune?: boolean, stats?: ReturnType<typeof createMirrorStats> }} [opts]
 */
export function mirrorDir(from, to, opts = {}) {
  const skip = opts.skip ?? new Set();
  const prune = opts.prune !== false;
  const stats = opts.stats ?? createMirrorStats();

  const toStat = lstatOrNull(to);
  prepareDestForDir(to, toStat, stats);
  fs.mkdirSync(to, { recursive: true });
  cleanTmp(to);

  const keep = new Set();
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || skip.has(entry.name)) continue;
    keep.add(entry.name);
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    const kind = followedStat(src, entry);
    if (kind.isDirectory()) {
      mirrorDir(src, dest, { prune, stats });
      continue;
    }
    atomicCopyFile(src, dest, fs.statSync(src), stats);
  }

  if (!prune) return stats;
  for (const name of fs.readdirSync(to)) {
    if (name.endsWith(TMP_SUFFIX)) {
      rm(path.join(to, name));
      stats.pruned += 1;
      continue;
    }
    if (KEEP_ALWAYS.has(name) || name.startsWith('.') || name.endsWith('.zip')
      || keep.has(name) || skip.has(name)) {
      continue;
    }
    rm(path.join(to, name));
    stats.pruned += 1;
  }
  return stats;
}

export function copyFileIfStale(src, dest, stats = createMirrorStats()) {
  atomicCopyFile(src, dest, fs.statSync(src), stats);
  return stats;
}

export function isRealDir(p) {
  const st = lstatOrNull(p);
  return Boolean(st && st.isDirectory() && !st.isSymbolicLink());
}
