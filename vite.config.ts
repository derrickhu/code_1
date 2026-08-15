import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  fs.readFileSync(path.resolve(rootDir, 'package.json'), 'utf8'),
) as { version: string };

/** bundle 产出目录。平台目录由 scripts/build-platform.mjs 从这里组装 */
export const BUNDLE_DIR = '.bundle';

/**
 * 构建后把 bundle 里 ShaderSystem 的 systemCheck 方法体清空，使其不再抛 unsafe-eval。
 *
 * @pixi/unsafe-eval 的 selfInstall 副作用可能被 tree-shaking 移除，且 @pixi/core
 * 可能在 bundle 里出现多个副本，prototype patch 只能覆盖其中一个。做法沿用 xiaochu2。
 */
function pixiUnsafeEvalPlugin(): Plugin {
  return {
    name: 'pixi-unsafe-eval-patch',
    writeBundle(options) {
      const outDir = options.dir || BUNDLE_DIR;
      const bundlePath = path.resolve(outDir, 'game-bundle.js');
      if (!fs.existsSync(bundlePath)) return;
      const code = fs.readFileSync(bundlePath, 'utf8');
      const re =
        /systemCheck\(\)\{if\(!\w+\(\)\)throw new Error\("Current environment does not allow unsafe-eval[^}]*\}/g;
      const patched = code.replace(re, 'systemCheck(){}');
      if (patched !== code) {
        fs.writeFileSync(bundlePath, patched, 'utf8');
        console.log('[pixi-unsafe-eval-patch] 已处理 systemCheck');
      }
    },
  };
}

/**
 * bundle 落地后立刻组装平台目录。
 *
 * 挂在构建流程里而不是让 npm script 串一条命令，是为了让 `vite build --watch` 也生效 ——
 * 否则 watch 只会刷新 .bundle/，开发者工具打开的 build/ 永远是旧的。
 * 用 CODE1_PLATFORM 指定只出某一端，默认两端都出。
 */
function assemblePlatformsPlugin(): Plugin {
  return {
    name: 'assemble-platforms',
    async writeBundle() {
      const { assembleAll } = await import('./scripts/build-platform.mjs');
      assembleAll(process.env.CODE1_PLATFORM ?? 'all');
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
    dedupe: ['@pixi/core', '@pixi/display', '@pixi/settings', '@pixi/constants', '@pixi/utils'],
  },
  publicDir: false,
  // 顺序有意义：先 patch 好 bundle，再复制进平台目录
  plugins: [pixiUnsafeEvalPlugin(), assemblePlatformsPlugin()],
  build: {
    outDir: BUNDLE_DIR,
    assetsInlineLimit: 0,
    lib: {
      entry: path.resolve(rootDir, 'src/main.ts'),
      formats: ['iife'],
      name: 'Code1',
      fileName: () => 'game-bundle.js',
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
    minify: 'esbuild',
    emptyOutDir: true,
  },
});
