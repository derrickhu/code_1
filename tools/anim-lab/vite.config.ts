import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(here, '../..');

export default defineConfig({
  root: here,
  publicDir: path.resolve(rootDir, 'assets'),
  resolve: {
    alias: { '@': path.resolve(rootDir, 'src') },
    dedupe: ['pixi.js'],
  },
  server: {
    port: 5184,
    host: '127.0.0.1',
    strictPort: true,
    open: true,
  },
});
