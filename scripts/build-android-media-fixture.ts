import { build } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';

await build({
  configFile: false,
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  plugins: [vue()],
  resolve: {
    alias: {
      '@pksep/yui/styles': resolve('node_modules/@pksep/yui/dist/style.css')
    }
  },
  build: {
    outDir: '../artifacts/android-media-fixture',
    emptyOutDir: false,
    lib: {
      entry: resolve('e2e/fixtures/android-media-harness.ts'),
      formats: ['es', 'iife'],
      name: '__mediaHarness',
      fileName: format =>
        format === 'es' ? 'media-harness.mjs' : 'media-harness.iife.js'
    },
    rollupOptions: { output: { inlineDynamicImports: true } }
  }
});
