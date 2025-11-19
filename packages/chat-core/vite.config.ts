import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import dts from 'vite-plugin-dts';

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const baseMode = env.VITE_BASE_MODE || 'lib';

  return {
    build: {
      outDir: 'build',
      sourcemap: true,
      ...(baseMode === 'lib'
        ? {
            lib: {
              entry: [resolve(__dirname, 'src/index.ts')],
              name: 'ChatContainer',
              formats: ['es'],
              fileName: 'chat-container'
            },
            rollupOptions: {
              external: ['vue', '@pksep/yui', '@openim/wasm-client-sdk'],
              output: {
                globals: {
                  vue: 'Vue',
                  '@pksep/yui': '@pksep/yui',
                  '@openim/wasm-client-sdk': '@openim/wasm-client-sdk'
                }
              }
            }
          }
        : {})
    },
    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: tag => tag.includes('-')
          }
        }
      }),
      ...(baseMode === 'lib'
        ? [
            dts({
              include: ['src/index.ts', 'src/vite-env.d.ts'],
              insertTypesEntry: true
            })
          ]
        : []),
      ...(baseMode === 'app'
        ? [
            VitePWA({
              registerType: 'autoUpdate',
              workbox: {
                maximumFileSizeToCacheInBytes: 50 * 1024 * 1024 // 50MB
              },
              mode: env.MODE === 'dev' ? 'development' : 'production',
              manifest: {
                name: 'sep-chat',
                short_name: 'SepChat',
                description: 'Chatting application',
                icons: [
                  {
                    src: 'pwa-64x64.png',
                    sizes: '64x64',
                    type: 'image/png'
                  },
                  {
                    src: 'pwa-192x192.png',
                    sizes: '192x192',
                    type: 'image/png'
                  },
                  {
                    src: 'pwa-512x512.png',
                    sizes: '512x512',
                    type: 'image/png'
                  },
                  {
                    src: 'maskable-icon-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'maskable'
                  }
                ],
                screenshots: [
                  {
                    src: 'desktop-test.png',
                    sizes: '889x900',
                    form_factor: 'wide',
                    label: 'Desktop view showing chat'
                  }
                ]
              },
              devOptions: {
                enabled: true,
                type: 'module',
                navigateFallback: 'index.html'
              }
            })
          ]
        : [])
    ]
  };
});
