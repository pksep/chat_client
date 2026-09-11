import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    dedupe: ['vue'],
    alias: {
      '@': resolve(import.meta.dirname, 'src'),
      src: resolve(import.meta.dirname, 'src')
    }
  },
  server: { host: '127.0.0.1', port: 4313, strictPort: true }
});
