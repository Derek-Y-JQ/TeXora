import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  root: 'src',
  publicDir: false,
  server: { port: 5273, strictPort: true },
  worker: { format: 'es' },
  resolve: {
    alias: [
      { find: /^monaco-editor\/esm\//, replacement: resolve(__dirname, 'node_modules/monaco-editor/esm') + '/' }
    ]
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'chrome128',
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      input: { index: resolve(__dirname, 'src/index.html') },
      output: {
        manualChunks(id) {
          if (id.includes('monaco-editor')) return 'monaco';
          return undefined;
        }
      }
    }
  }
});
