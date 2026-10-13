import {
  ConfigEnv,
  defineConfig,
  loadEnv,
  type PluginOption,
  type UserConfig
} from 'vite';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
// import basicSsl from '@vitejs/plugin-basic-ssl';
import { version } from './package.json';
import { externalizeUiKitPdfWorker } from './scripts/externalize-ui-kit-pdf-worker';
import { preloadStartupModules } from './scripts/preload-startup-modules';
import { inlineStartupTheme } from './scripts/inline-startup-theme';
import { externalizeInlineFonts } from './scripts/externalize-inline-fonts';
import { lazyUiKitPdfRuntime } from './scripts/lazy-ui-kit-pdf-runtime';
import { lazyUiKitEmojiRuntime } from './scripts/lazy-ui-kit-emoji-runtime';
import { lazyUiKitEditorRuntime } from './scripts/lazy-ui-kit-editor-runtime';
import { lazyUiKitSliderRuntime } from './scripts/lazy-ui-kit-slider-runtime';

const BUILD_OUT_DIR = 'build';
const PUBLIC_BUILD_ENTRIES = new Set([
  'audio',
  'call-background',
  'emoji',
  'images',
  'release',
  'service-worker.js',
  'video',
  'web-update.json'
]);

const cleanGeneratedBuildOutputPlugin = (): PluginOption => ({
  name: 'clean-generated-build-output',
  apply: 'build',
  enforce: 'pre',
  buildStart() {
    const outDir = resolve(process.cwd(), BUILD_OUT_DIR);

    if (!existsSync(outDir)) {
      return;
    }

    for (const entryName of readdirSync(outDir)) {
      if (PUBLIC_BUILD_ENTRIES.has(entryName)) {
        continue;
      }

      rmSync(resolve(outDir, entryName), {
        force: true,
        recursive: true,
        maxRetries: 3,
        retryDelay: 100
      });
    }
  }
});

const removeEmbeddedReleaseApkPlugin = (): PluginOption => ({
  name: 'remove-embedded-release-apk',
  apply: 'build',
  closeBundle() {
    const releaseApkPath = resolve(
      process.cwd(),
      BUILD_OUT_DIR,
      'release',
      'android',
      'app.apk'
    );

    if (!existsSync(releaseApkPath)) {
      return;
    }

    rmSync(releaseApkPath, {
      force: true,
      maxRetries: 3,
      retryDelay: 100
    });
  }
});

const removeExternalizedPublicDirectoryPlugin = (
  name: string,
  directoryName: string,
  enabled: boolean
): PluginOption => ({
  name,
  apply: 'build',
  closeBundle() {
    if (!enabled) {
      return;
    }

    const directoryPath = resolve(process.cwd(), BUILD_OUT_DIR, directoryName);

    if (!existsSync(directoryPath)) {
      return;
    }

    rmSync(directoryPath, {
      force: true,
      recursive: true,
      maxRetries: 3,
      retryDelay: 100
    });
  }
});

export default defineConfig(({ mode }: ConfigEnv): UserConfig => {
  const env = loadEnv(mode, process.cwd(), '');
  const hasExternalEmojiAssetBase = Boolean(
    env.VITE_EMOJI_ASSET_BASE_URL?.trim()
  );
  const hasExternalCallBackgroundAssetBase = Boolean(
    env.VITE_CALL_BACKGROUND_ASSET_BASE_URL?.trim()
  );
  const hasExternalReactionVideoAssetBase = Boolean(
    env.VITE_REACTION_VIDEO_ASSET_BASE_URL?.trim()
  );
  const vuePlugin = vue({
    template: {
      compilerOptions: {
        isCustomElement: (tag: string): boolean => tag.includes('-')
      }
    }
  }) as PluginOption;

  const appPlugins: PluginOption[] = [
    externalizeInlineFonts(),
    inlineStartupTheme(),
    preloadStartupModules(),
    VitePWA({
      injectRegister: false,
      registerType: 'autoUpdate',
      showMaximumFileSizeToCacheInBytesWarning: true,
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globIgnores: [
          '**/assets/pdf-worker-*.js',
          '**/assets/ui-kit-*.js',
          '**/assets/_chat-ui-emoji-runtime-*.js',
          '**/assets/_chat-ui-editor-runtime-*.js',
          '**/assets/_chat-ui-slider-runtime-*.js',
          '**/assets/ai-*.js',
          '**/assets/AI*.js',
          '**/assets/TasksSuggestionIcon-*.js',
          '**/assets/useMastra-*.js',
          '**/assets/calls-*.js',
          '**/assets/Call*.js',
          '**/assets/Call*.css',
          '**/assets/callBackground*.js',
          '**/assets/useCall*.js',
          '**/assets/useLiveKit-*.js',
          '**/assets/MenuProfilePanel-*.js',
          '**/call-background/**',
          '**/emoji/**',
          '**/stickers/**',
          '**/release/**',
          '**/video/**'
        ],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/pdf-worker-[^/]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdf-worker',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          },
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
            urlPattern:
              /\/(?:call-background|video)\/.*\.(?:gif|png|jpe?g|webp|webm|wasm|js|tflite)$/i,
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
          },
          {
            urlPattern:
              /\/assets\/(?:ai|tasksSuggestionIcon|call|useCall|useLiveKit|useMastra|menuProfilePanel|_chat-ui-emoji-runtime|_chat-ui-editor-runtime)[^/]*\.(?:js|css)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'optional-feature-chunks',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 30,
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
            src: 'images/pwa-64x64.png?v=20260909-dark',
            sizes: '64x64',
            type: 'image/png'
          },
          {
            src: 'images/pwa-192x192.png?v=20260909-dark',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'images/pwa-512x512.png?v=20260909-dark',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'images/maskable-icon-512x512.png?v=20260909-dark',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        screenshots: []
      },
      devOptions: {
        enabled: mode !== 'development',
        type: 'module',
        navigateFallback: 'index.html'
      }
    }) as PluginOption
    // Оставили на случай тестирования
    // basicSsl({
    //   name: 'SEP:Chat'
    // })
  ];

  const plugins: PluginOption[] = [
    externalizeUiKitPdfWorker(),
    lazyUiKitPdfRuntime(),
    lazyUiKitEmojiRuntime(),
    lazyUiKitEditorRuntime(),
    lazyUiKitSliderRuntime(),
    cleanGeneratedBuildOutputPlugin(),
    vuePlugin,
    ...appPlugins,
    removeExternalizedPublicDirectoryPlugin(
      'remove-externalized-emoji-assets',
      'emoji',
      hasExternalEmojiAssetBase
    ),
    removeExternalizedPublicDirectoryPlugin(
      'remove-externalized-call-background-assets',
      'call-background',
      hasExternalCallBackgroundAssetBase
    ),
    removeExternalizedPublicDirectoryPlugin(
      'remove-externalized-reaction-video-assets',
      'video',
      hasExternalReactionVideoAssetBase
    ),
    removeEmbeddedReleaseApkPlugin()
  ];
  const getManualChunk = (id: string): string | undefined => {
    const normalizedId = id.replace(/\\/g, '/');

    // Общий helper иначе попадает в vendor и заставляет ранний native-startup
    // выполнить все его библиотеки до чтения notification intent.
    if (normalizedId.includes('vite/preload-helper')) return 'startup-preload';

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

    if (normalizedId.includes('/vue/') || normalizedId.includes('/@vue/')) {
      return 'vue-vendor';
    }

    // Общий vendor объединял также зависимости отложенных экранов с запуском.
    // Rollup сохраняет их рядом с теми экранами, которые действительно их используют.
    return undefined;
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
    resolve: {
      dedupe: ['vue'],
      alias: {
        '@pksep/yui/styles': resolve(
          process.cwd(),
          'node_modules/@pksep/yui/dist/style.css'
        )
      }
    },
    build: {
      target: 'chrome80',
      outDir: BUILD_OUT_DIR,
      emptyOutDir: false,
      sourcemap: mode !== 'production',
      rollupOptions: {
        output: {
          onlyExplicitManualChunks: true,
          manualChunks: getManualChunk
        }
      }
    },
    optimizeDeps: {
      // Словарь орфографии загружается worker по пути относительно модуля UI.
      exclude: ['@pksep/yui'],
      entries: ['index.html']
    },
    plugins
  };
});
