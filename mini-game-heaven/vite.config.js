import { defineConfig } from 'vite';

// Vite (vanilla JS) — Playino · PlayHouse 거실 레슨
// public/ 의 firmware/asset 정적 서빙, src/ 가 앱 루트.
export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
