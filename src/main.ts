import { createApp } from 'vue';
import { Capacitor } from '@capacitor/core';
import { isTauri } from '@tauri-apps/api/core';
import App from './App.vue';
import './assets/chat-container.css';
import { installNotoEmojiFontFaces } from './composables/useEmojiStyle';
import { emojiDirective } from './directives/emoji';
import { registerNativeFileBridge } from './services/native-file-bridge';
import { initFastNativeNotificationNavigation } from './services/usePushNotifications';
import { LaunchStartup } from './services/launchStartup';
import { NATIVE_STARTUP_READY_EVENT } from './utils/nativeStartup';
import { createPinia } from 'pinia';

performance.mark('chat-startup:modules-ready');

const INDEXED_DB_RESET_EPOCH = 'chat-client-indexeddb-reset-2026-04-29-v1';
const INDEXED_DB_RESET_DONE_KEY = 'chat.indexeddb.reset.done';
const FONT_READY_TIMEOUT_MS = 1500;
const INDEXED_DB_NAMES = [
  'chat-sync-shadow-db',
  'chat-topic-messages-db',
  'chat-offline-state-db',
  'chat-media-blob-cache-db'
];
// chat-messages-db содержит пользовательскую историю ИИ и исходники поручений,
// а не восстанавливаемый кэш. Сброс кэшей не должен удалять сообщения и вложения.

const hasIndexedDb = () =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const isMacEnvironment = (): boolean => {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const navigatorWithUserAgentData = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
    };
  };

  return /mac/i.test(
    navigatorWithUserAgentData.userAgentData?.platform ||
      navigator.platform ||
      navigator.userAgent ||
      ''
  );
};

const applyRuntimeBodyClasses = (): void => {
  if (typeof document === 'undefined') {
    return;
  }

  if (isTauri()) {
    document.body.classList.add('chat-tauri-runtime');
  }

  if (isTauri() && isMacEnvironment()) {
    document.body.classList.add('chat-tauri-macos-runtime');
  }
};

const clearTauriServiceWorkers = async (): Promise<void> => {
  if (
    typeof window === 'undefined' ||
    !isTauri() ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations();

  await Promise.allSettled(
    registrations.map(async registration => {
      await registration.unregister();
    })
  );
};

const deleteIndexedDb = async (dbName: string): Promise<boolean> => {
  if (!hasIndexedDb()) {
    return true;
  }

  return new Promise(resolve => {
    const request = window.indexedDB.deleteDatabase(dbName);

    request.onsuccess = () => resolve(true);
    request.onerror = () => {
      console.warn(`Failed to delete IndexedDB database: ${dbName}`);
      resolve(false);
    };
    request.onblocked = () => {
      console.warn(`IndexedDB delete was blocked for database: ${dbName}`);
      resolve(false);
    };
  });
};

const runIndexedDbResetIfNeeded = async (): Promise<void> => {
  if (
    typeof window === 'undefined' ||
    !hasIndexedDb() ||
    !window.localStorage
  ) {
    return;
  }

  if (
    window.localStorage.getItem(INDEXED_DB_RESET_DONE_KEY) ===
    INDEXED_DB_RESET_EPOCH
  ) {
    return;
  }

  let allDeleted = true;

  for (const dbName of INDEXED_DB_NAMES) {
    const deleted = await deleteIndexedDb(dbName);

    if (!deleted) {
      allDeleted = false;
    }
  }

  if (allDeleted) {
    window.localStorage.setItem(
      INDEXED_DB_RESET_DONE_KEY,
      INDEXED_DB_RESET_EPOCH
    );
  }
};

const runAfterFirstPaint = (task: () => void): void => {
  requestAnimationFrame(() => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(task, { timeout: 1200 });
      return;
    }

    setTimeout(task, 0);
  });
};

const notifyNativeStartupReady = (): void => {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    return;
  }

  // App.vue dispatches this event only after the real content has rendered and
  // the web startup shell has been removed. Waiting for two more frames keeps
  // the native logo over an already ready WebView on cold Android launches.
  void LaunchStartup.ready().catch(() => undefined);
};

const waitForAppFontReady = async (): Promise<void> => {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return;
  }

  const fontReadyTasks = [
    document.fonts.load("400 16px 'Inter Variable'", 'Звонилка SEP'),
    document.fonts.load("600 16px 'Inter Variable'", 'Звонилка SEP'),
    document.fonts.load("700 16px 'Inter Variable'", 'Звонилка SEP')
  ];

  try {
    await Promise.race([
      Promise.all(fontReadyTasks),
      new Promise(resolve => {
        window.setTimeout(resolve, FONT_READY_TIMEOUT_MS);
      })
    ]);
  } catch {
    // Font loading can fail offline; the app should still mount.
  }
};

const runPostMountStartupTasks = (): void => {
  runAfterFirstPaint(() => {
    void waitForAppFontReady();
    void clearTauriServiceWorkers();
    void runIndexedDbResetIfNeeded();
  });
};

const mountApp = async (): Promise<void> => {
  // A cold notification tap must establish the topic route and the forced
  // latest-page request before Vue mounts. Otherwise cached messages can paint
  // for one frame and then be replaced by the topic skeleton.
  await initFastNativeNotificationNavigation();
  performance.mark('chat-startup:notification-ready');
  registerNativeFileBridge();
  applyRuntimeBodyClasses();
  installNotoEmojiFontFaces({
    preferSystemFont: Capacitor.getPlatform() === 'android'
  });

  const app = createApp(App);

  const piniaStore = createPinia();

  app.use(piniaStore);

  app.directive('on-click-outside', {
    beforeMount(el, binding) {
      const handler = (event: Event) => {
        const target = event.target as Node | null;

        if (!target || el === target || el.contains(target)) {
          return;
        }

        if (typeof binding.value === 'function') {
          binding.value(event);
        }
      };

      (
        el as HTMLElement & { __clickOutside__?: typeof handler }
      ).__clickOutside__ = handler;

      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler);
    },
    unmounted(el) {
      const handler = (
        el as HTMLElement & { __clickOutside__?: (event: Event) => void }
      ).__clickOutside__;

      if (!handler) {
        return;
      }

      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
      delete (el as HTMLElement & { __clickOutside__?: (event: Event) => void })
        .__clickOutside__;
    }
  });

  app.directive('emoji', emojiDirective);

  window.addEventListener(
    NATIVE_STARTUP_READY_EVENT,
    notifyNativeStartupReady,
    {
      once: true
    }
  );
  app.mount('#app');
  performance.mark('chat-startup:vue-mounted');
  runPostMountStartupTasks();
};

void mountApp();
