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
      showMaximumFileSizeToCacheInBytesWarning: true,
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globIgnores: [
          '**/assets/ui-kit-*.js',
          '**/call-background/**',
          '**/emoji/**',
          '**/release/**',
          '**/video/**'
        ],
        runtimeCaching: [
          {
            urlPattern: /\/emoji\/noto\/fonts\/.*\.(?:ttf|woff2?)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'emoji-fonts',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60 * 24 * 365
              }
            }
          },
          {
            urlPattern: /\/emoji\/noto\/png\/128\/.*\.png$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'emoji-images',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 1200,
                maxAgeSeconds: 60 * 60 * 24 * 90
              }
            }
          },
          {
            urlPattern: /\/(?:call-background|video)\/.*\.(?:gif|png|jpe?g|webp|webm)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'call-media-assets',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 40,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ],
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
    }) as PluginOption
    // Оставили на случай тестирования
    // basicSsl({
    //   name: 'SEP:Chat'
    // })
  ];

  const plugins: PluginOption[] = [vuePlugin, ...appPlugins];
  const getManualChunk = (id: string): string | undefined => {
    const normalizedId = id.replace(/\\/g, '/');

    if (
      normalizedId.includes('/src/services/useLiveKit') ||
      normalizedId.includes('/src/services/useCalls') ||
      normalizedId.includes('/src/services/useCallKit') ||
      normalizedId.includes('/src/services/callBackground') ||
      normalizedId.includes('/src/services/mediapipe') ||
      normalizedId.includes('/src/components/CallModal/')
    ) {
      return 'calls';
    }

    if (normalizedId.includes('/src/services/useMastra')) {
      return 'ai-mastra';
    }

    if (!normalizedId.includes('/node_modules/')) {
      return undefined;
    }

    if (
      normalizedId.includes('/livekit-client/') ||
      normalizedId.includes('/@livekit/track-processors/')
    ) {
      return 'calls-livekit';
    }

    if (normalizedId.includes('/@mediapipe/')) {
      return 'calls-mediapipe';
    }

    if (
      normalizedId.includes('/@mastra/') ||
      normalizedId.includes('/@ai-sdk/')
    ) {
      return 'ai-mastra';
    }

    if (normalizedId.includes('/@pksep/yui/')) {
      return 'ui-kit';
    }

    if (
      normalizedId.includes('/socket.io-client/') ||
      normalizedId.includes('/engine.io-client/') ||
      normalizedId.includes('/@pksep/reqi/')
    ) {
      return 'chat-transport';
    }

    if (
      normalizedId.includes('/vue/') ||
      normalizedId.includes('/@vue/')
    ) {
      return 'vue-vendor';
    }

    return 'vendor';
  };

  return {
    define: {
      __APP_VERSION__: JSON.stringify(
        process.env.npm_package_version || version
      )
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      watch: {
        ignored: [
          '**/.git/**',
          '**/.idea/**',
          '**/.codex-remote-attachments/**',
          '**/android/**',
          '**/ios/**',
          '**/build/**',
          '**/dev-dist/**',
          '**/src-tauri/target/**',
          '**/src-tauri/gen/**'
        ]
      }
    },
    build: {
      outDir: 'build',
      sourcemap: mode !== 'production',
      rollupOptions: {
        output: {
          manualChunks: getManualChunk
        }
      }
    },
    optimizeDeps: {
      entries: ['index.html']
    },
    plugins
  };
});
