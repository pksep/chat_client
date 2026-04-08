import {
  ConfigEnv,
  defineConfig,
  type PluginOption,
  type UserConfig
} from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { version } from './package.json';

export default defineConfig(({ mode }: ConfigEnv): UserConfig => {
  const vuePlugin = vue({
    template: {
      compilerOptions: {
        isCustomElement: (tag: string): boolean => tag.includes('-')
      }
    }
  }) as PluginOption;

  const appPlugins: PluginOption[] = [
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024 // 50MB
        ,
        skipWaiting: true
      },
      mode: mode === 'development' ? 'development' : 'production',
      manifest: {
        name: 'SEP:Chat',
        short_name: 'SEP:Chat',
        display: 'standalone',
        description: 'Chatting application',
        theme_color: '#ffffff',
        background_color: '#ffffff',
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
    }) as PluginOption,
    // Оставили на случай тестирования
    basicSsl({
      name: 'SEP:Chat'
    })
  ];

  const plugins: PluginOption[] = [vuePlugin, ...appPlugins];

  return {
    define: {
      __APP_VERSION__: JSON.stringify(
        process.env.npm_package_version || version
      )
    },
    server: {
      host: '0.0.0.0',
      port: 5173
    },
    build: {
      outDir: 'build',
      sourcemap: mode !== 'production'
    },
    plugins
  };
});
