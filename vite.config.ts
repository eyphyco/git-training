/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // 相対パスにしておくと GitHub Pages のリポジトリ名に依存しない（ルーティングは hash）
  base: './',
  plugins: [react(), tailwindcss()],
  // エディタ（Monaco）は使うときだけ読み込む別チャンクなので、大きくても警告しない
  build: { chunkSizeWarningLimit: 3000 },
  test: {
    include: ['src/**/*.test.ts', 'content/**/*.test.ts'],
    coverage: {
      include: ['src/engine/**'],
      exclude: ['src/engine/**/*.test.ts'],
      thresholds: { lines: 80 },
    },
  },
});
