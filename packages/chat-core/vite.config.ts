import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  build: {
    outDir: 'build',
    lib: {
      entry: [resolve(__dirname, 'src/index.ts')],
      name: 'ChatContainer',
      formats: ['es'],
      fileName: 'chat-container'
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        globals: {
          vue: 'Vue'
        }
      }
    }
  },
  plugins: [
    vue(),
    dts({
      insertTypesEntry: true
    })
  ]
});
