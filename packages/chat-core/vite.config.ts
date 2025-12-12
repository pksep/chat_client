import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ConfigEnv,
  defineConfig,
  loadEnv,
  type PluginOption,
  type UserConfig
} from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import dts from 'vite-plugin-dts';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }: ConfigEnv): UserConfig => {
  const env = loadEnv(mode, process.cwd(), '');
  const baseMode = env.VITE_BASE_MODE || 'lib';

  const vuePlugin = vue({
    template: {
      compilerOptions: {
        isCustomElement: (tag: string): boolean => tag.includes('-')
      }
    }
  }) as PluginOption;

  const libPlugins: PluginOption[] =
    baseMode === 'lib'
      ? [
          dts({
            include: ['./scripts/copyOpenIM.ts', 'src/vite-env.d.ts'],
            insertTypesEntry: true
          }) as PluginOption,
          viteStaticCopy({
            targets: [
              {
                src: 'scripts/copyOpenIM.ts',
                dest: '.'
              }
            ]
          }) as PluginOption
        ]
      : [];

  const appPlugins: PluginOption[] =
    baseMode === 'app'
      ? [
          VitePWA({
            registerType: 'autoUpdate',
            workbox: {
              maximumFileSizeToCacheInBytes: 50 * 1024 * 1024 // 50MB
            },
            mode: mode === 'development' ? 'development' : 'production',
            manifest: {
              name: 'sep-chat',
              short_name: 'SepChat',
              description: 'Chatting application',
              icons: [
                {
                  src: 'images/pwa-64x64.png',
                  sizes: '64x64',
                  type: 'image/png'
                },
                {
                  src: 'images/pwa-192x192.png',
                  sizes: '192x192',
                  type: 'image/png'
                },
                {
                  src: 'images/pwa-512x512.png',
                  sizes: '512x512',
                  type: 'image/png'
                },
                {
                  src: 'images/maskable-icon-512x512.png',
                  sizes: '512x512',
                  type: 'image/png',
                  purpose: 'maskable'
                }
              ],
              screenshots: []
            },
            devOptions: {
              enabled: true,
              type: 'module',
              navigateFallback: 'index.html'
            }
          }) as PluginOption
        ]
      : [];

  const plugins: PluginOption[] = [vuePlugin, ...libPlugins, ...appPlugins];

  return {
    build: {
      outDir: baseMode === 'lib' ? 'build/lib' : 'build',
      sourcemap: baseMode !== 'lib' && mode === 'production',
      ...(baseMode === 'lib'
        ? {
            lib: {
              entry: resolve(__dirname, 'src/index.ts'),
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
    plugins
  };
});
