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
 * 构建后替换 bundle 中 ShaderSystem 的 systemCheck 等方法体。
 * @pixi/unsafe-eval 的 selfInstall 副作用可能被 tree-shaking 移除，
 * 且 @pixi/core 可能在 bundle 里出现多个副本。做法沿用 xiaochu2。
 */
function pixiUnsafeEvalPlugin(): Plugin {
  return {
    name: 'pixi-unsafe-eval-patch',
    writeBundle(options) {
      const outDir = options.dir || BUNDLE_DIR;
      const bundlePath = path.resolve(outDir, 'game-bundle.js');
      if (!fs.existsSync(bundlePath)) return;
      const code = fs.readFileSync(bundlePath, 'utf8');
      const replacements: Array<[RegExp, string, string]> = [
        [
          /systemCheck\(\)\{if\(!\w+\(\)\)throw new Error\("Current environment does not allow unsafe-eval[^}]*\}/g,
          'systemCheck(){}',
          'systemCheck',
        ],
        [
          /Function\("binder","return function \("\+\w+\(\w+,","\)\+"\)\{ return binder\.apply\(this,arguments\); \}"\)/g,
          '(function(binder){return function(){return binder.apply(this,arguments)}})',
          'bind-Function',
        ],
        [
          /new Function\("param1","param2","param3","return param1\[param2\] === param3;"\)\(\{a:"b"\},"a","b"\)===!0/g,
          '!1',
          'unsafeEvalSupported',
        ],
      ];
      let patched = code;
      const applied: string[] = [];
      for (const [re, to, name] of replacements) {
        const next = patched.replace(re, to);
        if (next !== patched) applied.push(name);
        patched = next;
      }
      if (patched !== code) {
        fs.writeFileSync(bundlePath, patched, 'utf8');
        console.log(`[pixi-unsafe-eval-patch] Patched ${applied.join(', ')}`);
      }
    },
  };
}

/**
 * 只在 `vite build --watch` 里组装。一次性 build 由 npm script 在 vite 之后跑 CLI，
 * 避免 writeBundle 先拷、随后又整目录删掉。
 *
 * 改 TS：writeBundle → 增量 assemble。
 * 改 runtime/assets/platform：目录监听 → 只 assemble，不重打 JS。
 */
function assemblePlatformsPlugin(): Plugin {
  let stopWatch: (() => void) | undefined;
  let queue: Promise<void> = Promise.resolve();

  const target = () => process.env.CODE1_PLATFORM ?? 'all';

  const enqueue = (reason: string) => {
    queue = queue
      .then(async () => {
        const { assembleAll } = await import('./scripts/build-platform.mjs');
        console.log(`[build-platform] watch assemble (${reason})`);
        assembleAll(target());
      })
      .catch((err: unknown) => {
        console.error('[build-platform]', err instanceof Error ? err.message : err);
      });
    return queue;
  };

  return {
    name: 'assemble-platforms',
    async buildStart() {
      if (!this.meta.watchMode || stopWatch) return;
      const { watchContentTrees } = await import('./scripts/build-platform.mjs');
      stopWatch = watchContentTrees(() => {
        void enqueue('assets');
      });
    },
    async writeBundle() {
      if (!this.meta.watchMode) return;
      await enqueue('bundle');
    },
    closeWatcher() {
      stopWatch?.();
      stopWatch = undefined;
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
