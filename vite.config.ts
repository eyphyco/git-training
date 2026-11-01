/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';

/** オフライン対応：ビルドした全ファイルを最初に保存する service worker（pwa/sw.js）を dist/sw.js に書き出す */
function pwaPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'git-training-pwa',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    writeBundle() {
      const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && f !== 'index.html')
        .sort();
      // 中身が変わればファイル名のハッシュか index.html が変わるので、その2つから版を決める
      const version = createHash('sha256').update(files.join('\n')).update(readFileSync(join(outDir, 'index.html'))).digest('hex').slice(0, 12);
      const sw = readFileSync('pwa/sw.js', 'utf8').replace('__VERSION__', version).replace('__FILES__', JSON.stringify(['./', ...files]));
      writeFileSync(join(outDir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  // 相対パスにしておくと GitHub Pages のリポジトリ名に依存しない（ルーティングは hash）
  base: './',
  plugins: [react(), tailwindcss(), pwaPlugin()],
  // エディタ（Monaco）は使うときだけ読み込む別チャンクなので、大きくても警告しない
  build: { chunkSizeWarningLimit: 3000 },
  test: {
    // content/ に教材を足しても import.meta.glob の結果が古いまま残るため、変換キャッシュを使わない
    fsModuleCache: false,
    include: ['src/**/*.test.ts', 'content/**/*.test.ts'],
    coverage: {
      include: ['src/engine/**'],
      exclude: ['src/engine/**/*.test.ts'],
      thresholds: { lines: 80 },
    },
  },
});
