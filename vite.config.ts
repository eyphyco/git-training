/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // 相対パスにしておくと GitHub Pages のリポジトリ名に依存しない（ルーティングは hash）
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    include: ['src/**/*.test.ts', 'content/**/*.test.ts'],
    coverage: {
      include: ['src/engine/**'],
      exclude: ['src/engine/**/*.test.ts'],
      thresholds: { lines: 80 },
    },
  },
});
