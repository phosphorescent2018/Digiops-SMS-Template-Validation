import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: 51731 },
  build: { outDir: 'dist', assetsInlineLimit: 0 }
});
