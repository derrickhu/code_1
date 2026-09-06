import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyFileIfStale, createMirrorStats, mirrorDir } from './mirror-tree.mjs';

const temps = [];

function tmpDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-tree-'));
  temps.push(dir);
  return dir;
}

function writeFile(p, data, mtimeMs) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
  if (mtimeMs != null) {
    const d = new Date(mtimeMs);
    fs.utimesSync(p, d, d);
  }
}

function inode(p) {
  return fs.statSync(p).ino;
}

afterEach(() => {
  while (temps.length) {
    fs.rmSync(temps.pop(), { recursive: true, force: true });
  }
});

describe('mirrorDir', () => {
  it('同大小且 mtime 接近则跳过', () => {
    const root = tmpDir();
    const src = path.join(root, 'src');
    const dest = path.join(root, 'dest');
    const t = Date.now() - 10_000;
    writeFile(path.join(src, 'a.png'), 'hello', t);
    writeFile(path.join(dest, 'a.png'), 'hello', t);
    const stats = mirrorDir(src, dest);
    expect(stats.copied).toBe(0);
    expect(stats.skipped).toBe(1);
    expect(fs.readFileSync(path.join(dest, 'a.png'), 'utf8')).toBe('hello');
  });

  it('源更新后即使 dest 较新也会覆盖', () => {
    const root = tmpDir();
    const src = path.join(root, 'src');
    const dest = path.join(root, 'dest');
    writeFile(path.join(dest, 'a.png'), 'OLDIMG', Date.now() - 60_000);
    writeFile(path.join(src, 'a.png'), 'NEWIMG', Date.now());
    const stats = mirrorDir(src, dest);
    expect(stats.copied).toBe(1);
    expect(fs.readFileSync(path.join(dest, 'a.png'), 'utf8')).toBe('NEWIMG');
  });

  it('拷完不把 dest mtime 拨回源文件的旧时间', () => {
    const root = tmpDir();
    const src = path.join(root, 'src');
    const dest = path.join(root, 'dest');
    const old = Date.now() - 86_400_000;
    writeFile(path.join(src, 'a.png'), 'hello', old);
    mirrorDir(src, dest);
    expect(fs.statSync(path.join(dest, 'a.png')).mtimeMs).toBeGreaterThan(old + 1000);
  });

  it('删掉源里没有的 dest 文件', () => {
    const root = tmpDir();
    const src = path.join(root, 'src');
    const dest = path.join(root, 'dest');
    writeFile(path.join(src, 'keep.png'), 'k');
    writeFile(path.join(dest, 'keep.png'), 'k');
    writeFile(path.join(dest, 'gone.png'), 'g');
    const stats = mirrorDir(src, dest);
    expect(fs.existsSync(path.join(dest, 'gone.png'))).toBe(false);
    expect(stats.pruned).toBeGreaterThanOrEqual(1);
  });

  it('留下开发者工具的 project.private.config.json', () => {
    const root = tmpDir();
    const src = path.join(root, 'src');
    const dest = path.join(root, 'dest');
    writeFile(path.join(src, 'a.png'), 'a');
    writeFile(path.join(dest, 'project.private.config.json'), '{"keep":true}');
    mirrorDir(src, dest);
    expect(fs.readFileSync(path.join(dest, 'project.private.config.json'), 'utf8')).toContain('keep');
  });

  it('dest 软链拆掉，写成普通文件且 inode 不同', () => {
    const root = tmpDir();
    const src = path.join(root, 'src');
    const dest = path.join(root, 'dest');
    writeFile(path.join(src, 'a.png'), 'real');
    fs.mkdirSync(dest, { recursive: true });
    fs.symlinkSync(path.join(src, 'a.png'), path.join(dest, 'a.png'));
    const stats = mirrorDir(src, dest);
    expect(stats.repaired).toBeGreaterThanOrEqual(1);
    const destFile = path.join(dest, 'a.png');
    expect(fs.lstatSync(destFile).isSymbolicLink()).toBe(false);
    expect(inode(destFile)).not.toBe(inode(path.join(src, 'a.png')));
    expect(fs.readFileSync(destFile, 'utf8')).toBe('real');
  });

  it('dest 硬链拆掉，避免改 dest 写穿真源', () => {
    const root = tmpDir();
    const src = path.join(root, 'src');
    const dest = path.join(root, 'dest');
    writeFile(path.join(src, 'a.png'), 'linked');
    fs.mkdirSync(dest, { recursive: true });
    fs.linkSync(path.join(src, 'a.png'), path.join(dest, 'a.png'));
    expect(inode(path.join(dest, 'a.png'))).toBe(inode(path.join(src, 'a.png')));
    mirrorDir(src, dest);
    const destFile = path.join(dest, 'a.png');
    expect(inode(destFile)).not.toBe(inode(path.join(src, 'a.png')));
    fs.writeFileSync(destFile, 'changed-dest');
    expect(fs.readFileSync(path.join(src, 'a.png'), 'utf8')).toBe('linked');
  });

  it('文件变成目录时先删再建', () => {
    const root = tmpDir();
    const src = path.join(root, 'src');
    const dest = path.join(root, 'dest');
    writeFile(path.join(src, 'nested', 'b.png'), 'b');
    writeFile(path.join(dest, 'nested'), 'i-am-a-file');
    mirrorDir(src, dest);
    expect(fs.statSync(path.join(dest, 'nested')).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(dest, 'nested', 'b.png'), 'utf8')).toBe('b');
  });

  it('prune:false 不删 dest 里多出来的项', () => {
    const root = tmpDir();
    const src = path.join(root, 'src');
    const dest = path.join(root, 'dest');
    writeFile(path.join(src, 'game.json'), '{}');
    writeFile(path.join(dest, 'images', 'a.png'), 'img');
    writeFile(path.join(dest, 'game.json'), '{}\n');
    mirrorDir(src, dest, { prune: false });
    expect(fs.existsSync(path.join(dest, 'images', 'a.png'))).toBe(true);
  });
});

describe('copyFileIfStale', () => {
  it('bundle 变了会覆盖', () => {
    const root = tmpDir();
    const src = path.join(root, 'bundle.js');
    const dest = path.join(root, 'out.js');
    writeFile(src, 'v1', Date.now() - 5000);
    writeFile(dest, 'v1', Date.now() - 5000);
    const skip = createMirrorStats();
    copyFileIfStale(src, dest, skip);
    expect(skip.skipped).toBe(1);
    writeFile(src, 'v2', Date.now());
    const copy = createMirrorStats();
    copyFileIfStale(src, dest, copy);
    expect(copy.copied).toBe(1);
    expect(fs.readFileSync(dest, 'utf8')).toBe('v2');
  });
});
