import './polyfills/legacy-webview';
import { prepareChatDatabases } from './utils/chat-startup-databases';
import { prepareStartupTopicRecords } from './utils/startup-topic-records';
import type { PreparedStartupHistory } from './utils/startup-history';
import type { PreparedStartupReads } from './utils/prepared-startup-reads';
import { getChatAuthSession } from './utils/stored-chat-session';

declare global {
  interface Window {
    __chatNativeStartupCleanup?: Promise<void>;
    __chatNativeInitialNotificationTap?: Record<string, string>;
    __chatNativePreparedHistory?: Promise<PreparedStartupHistory | null>;
  }
}

type StartupNotificationPayload = Record<string, string>;

interface StartupNativePlugin {
  consumePendingNotificationTap?: () => Promise<StartupNotificationPayload>;
  reveal?: () => Promise<void>;
  prepareStartupHistory?: () => Promise<PreparedStartupHistory>;
  prepareStartupReads?: (options: {
    token: string;
  }) => Promise<PreparedStartupReads>;
}

interface StartupCapacitorBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, StartupNativePlugin | undefined>;
}

interface StartupWallpaperRecord {
  id: string;
  dataUrl: string;
}

const CHAT_WALLPAPER_STORAGE_KEY = 'chat_wallpaper_selection_v2';
const LEGACY_CHAT_WALLPAPER_STORAGE_KEY = 'chat_wallpaper_selection_v1';
const LEGACY_CHAT_WALLPAPER_CUSTOM_STORAGE_KEY =
  'chat_wallpaper_custom_data_v1';
const WALLPAPER_DB_NAME = 'chat-custom-wallpapers-db';
const WALLPAPER_DB_VERSION = 1;
const WALLPAPER_STORE_NAME = 'wallpapers';
const STARTUP_WALLPAPERS = {
  wallpaper1: {
    imageUrl: '/images/chat-wallpapers/wallpaper1-1.svg',
    size: '180px auto'
  },
  wallpaper2: {
    imageUrl: '/images/chat-wallpapers/wallpaper2.svg',
    size: '180px auto'
  },
  wallpaper3: {
    imageUrl: '/images/chat-wallpapers/wallpaper3.svg',
    size: '180px auto'
  }
} as const;

const preloadStartupWallpaper = async (imageUrl: string): Promise<void> => {
  if (!imageUrl) {
    return;
  }

  await new Promise<void>(resolve => {
    const image = new Image();
    let isSettled = false;
    const finish = () => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      window.clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = window.setTimeout(finish, 1500);

    image.onload = finish;
    image.onerror = finish;
    image.src = imageUrl;

    if (typeof image.decode === 'function') {
      void image.decode().then(finish, finish);
    }
  });
};

const setStartupWallpaper = async (
  messages: HTMLElement,
  imageUrl: string,
  repeat: string,
  size: string
): Promise<void> => {
  await preloadStartupWallpaper(imageUrl);
  messages.style.backgroundImage = `url("${imageUrl}")`;
  messages.style.backgroundPosition = 'center top';
  messages.style.backgroundRepeat = repeat;
  messages.style.backgroundSize = size;
};

const loadStartupCustomWallpaper = async (
  wallpaperId: string
): Promise<string> => {
  if (!window.indexedDB) {
    return '';
  }

  return await new Promise(resolve => {
    const request = window.indexedDB.open(
      WALLPAPER_DB_NAME,
      WALLPAPER_DB_VERSION
    );

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(WALLPAPER_STORE_NAME)) {
        database.createObjectStore(WALLPAPER_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onerror = () => resolve('');
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(
        WALLPAPER_STORE_NAME,
        'readonly'
      );
      const wallpaperRequest = transaction
        .objectStore(WALLPAPER_STORE_NAME)
        .get(wallpaperId);

      wallpaperRequest.onerror = () => resolve('');
      wallpaperRequest.onsuccess = () => {
        const wallpaper = wallpaperRequest.result as
          | StartupWallpaperRecord
          | undefined;
        resolve(
          typeof wallpaper?.dataUrl === 'string' ? wallpaper.dataUrl : ''
        );
      };
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => database.close();
    };
  });
};

const applyStartupTopicWallpaper = async (): Promise<void> => {
  const topicShell = document.querySelector<HTMLElement>(
    '.startup-shell__main'
  );

  if (!topicShell) {
    return;
  }

  const selectedWallpaperId =
    window.localStorage?.getItem(CHAT_WALLPAPER_STORAGE_KEY) ||
    window.localStorage?.getItem(LEGACY_CHAT_WALLPAPER_STORAGE_KEY) ||
    'none';

  if (selectedWallpaperId === 'none') {
    topicShell.style.backgroundImage = 'none';
    topicShell.style.backgroundRepeat = 'no-repeat';
    topicShell.style.backgroundSize = 'cover';
    return;
  }

  const preset =
    STARTUP_WALLPAPERS[selectedWallpaperId as keyof typeof STARTUP_WALLPAPERS];

  if (preset) {
    await setStartupWallpaper(
      topicShell,
      preset.imageUrl,
      'repeat',
      preset.size
    );
    return;
  }

  const cachedCustomWallpaper =
    window.localStorage?.getItem(LEGACY_CHAT_WALLPAPER_CUSTOM_STORAGE_KEY) ||
    '';
  const customWallpaper =
    cachedCustomWallpaper ||
    (await loadStartupCustomWallpaper(selectedWallpaperId));

  if (!customWallpaper) {
    return;
  }

  await setStartupWallpaper(topicShell, customWallpaper, 'no-repeat', 'cover');
};

const getPayloadText = (
  payload: StartupNotificationPayload,
  ...keys: string[]
): string => {
  for (const key of keys) {
    const value = payload[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
};

const getTopicTargetFromPayload = (
  payload: StartupNotificationPayload
): { topicId: string; routeType: 'dialogs' | 'group' } | null => {
  const directUrl = getPayloadText(payload, 'url', 'link');
  let urlTopicId = '';
  let urlRouteType: 'dialogs' | 'group' | null = null;

  if (directUrl) {
    try {
      const parsedUrl = new URL(directUrl, window.location.origin);
      const [routeType, topicId] = parsedUrl.pathname
        .split('/')
        .filter(Boolean);

      if ((routeType === 'dialogs' || routeType === 'group') && topicId) {
        urlTopicId = topicId;
        urlRouteType = routeType;
      }
    } catch {
      // The regular notification navigation will handle malformed URLs later.
    }
  }

  const topicId =
    getPayloadText(payload, 'topicId', 'chatId', 'dialogsId', 'groupId') ||
    urlTopicId;

  if (!topicId) {
    return null;
  }

  const topicType = getPayloadText(payload, 'topicType').toUpperCase();
  const routeType =
    topicType === 'GROUP' || getPayloadText(payload, 'groupId')
      ? 'group'
      : topicType === 'DM' || topicType === 'DIALOGS'
        ? 'dialogs'
        : urlRouteType || 'dialogs';

  return { topicId, routeType };
};

const applyStartupTopicShell = (
  payload: StartupNotificationPayload
): boolean => {
  if (getPayloadText(payload, 'type') === 'incoming_call') {
    return false;
  }

  const target = getTopicTargetFromPayload(payload);

  if (!target) {
    return false;
  }

  const targetUrl = new URL(
    `/${target.routeType}/${encodeURIComponent(target.topicId)}`,
    window.location.origin
  );

  if (window.location.href !== targetUrl.href) {
    window.history.replaceState({}, document.title, targetUrl.href);
  }

  document.documentElement.classList.add('startup-shell-topic-route');
  document
    .querySelector<HTMLElement>('.startup-shell__messages')
    ?.classList.toggle(
      'startup-shell__messages--group',
      target.routeType === 'group'
    );

  void applyStartupTopicWallpaper().catch(error => {
    console.warn('Не удалось подготовить фон стартового экрана:', error);
  });

  return true;
};

const startupUrl = new URL(window.location.href);
const startupPathParts = startupUrl.pathname.split('/').filter(Boolean);
const startupRouteType = startupPathParts[0];
const hasStartupTopicRoute =
  ((startupRouteType === 'dialogs' ||
    startupRouteType === 'group' ||
    startupRouteType === 'favorites') &&
    Boolean(startupPathParts[1])) ||
  Boolean(
    startupUrl.searchParams.get('dialogs') ||
      startupUrl.searchParams.get('group')
  );

if (hasStartupTopicRoute) {
  document.documentElement.classList.add('startup-shell-topic-route');
  document
    .querySelector<HTMLElement>('.startup-shell__messages')
    ?.classList.toggle(
      'startup-shell__messages--group',
      startupRouteType === 'group'
    );
}

window.__chatNativeStartupCleanup = (async () => {
  const logoAssetVersion = '20260908-1';
  const logoAssetVersionKey = 'chat.logo.assets.version';
  const capacitor = (
    window as typeof window & {
      Capacitor?: StartupCapacitorBridge;
    }
  ).Capacitor;
  const isAndroidNative =
    Boolean(capacitor?.isNativePlatform?.()) &&
    capacitor?.getPlatform?.() === 'android';

  if (hasStartupTopicRoute) {
    void applyStartupTopicWallpaper().catch(error => {
      console.warn('Не удалось подготовить фон стартового экрана:', error);
    });
  }

  if (isAndroidNative) {
    // Маршрут проходит очередь моста раньше больших пакетов данных.
    const notificationCheck = (async () =>
      capacitor?.Plugins?.NotificationTap?.consumePendingNotificationTap?.())();
    prepareChatDatabases();
    const session = getChatAuthSession();
    if (session?.token) {
      const result =
        capacitor?.Plugins?.ChatBackgroundSync?.prepareStartupReads?.({
          token: session.token
        });
      if (result) {
        // Передаём готовые ответы до загрузки Vue и фоновых native-плагинов.
        window.__chatNativePreparedReads = {
          token: session.token,
          result: result
            .then(value => {
              performance.mark('chat-startup:native-reads-prepared');
              return value;
            })
            .catch(() => null)
        };
      }
    }
    // Передаём готовый HTTP-ответ параллельно загрузке main; SDK проверит его
    // пользователя, сервер, маршрут и возраст перед применением.
    window.__chatNativePreparedHistory =
      capacitor?.Plugins?.ChatBackgroundSync?.prepareStartupHistory?.().catch(
        () => null
      );
    // WebView запрашивает favicon при каждом replaceState; иконку приложения задаёт Android.
    document
      .querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')
      .forEach(link => {
        link.href = 'data:,';
      });
    try {
      const pendingNotificationTap = await notificationCheck;

      // Пустой ответ тоже завершает проверку запуска: повторный native-вызов
      // перед монтированием Vue не нужен. Новые intent подберёт слушатель.
      if (pendingNotificationTap) {
        window.__chatNativeInitialNotificationTap = pendingNotificationTap;
      }

      if (
        pendingNotificationTap &&
        Object.values(pendingNotificationTap).some(
          value => value !== null && value !== undefined && value !== ''
        )
      ) {
        applyStartupTopicShell(pendingNotificationTap);
      }
    } catch (error) {
      console.warn('Failed to prepare notification startup shell:', error);
    }
    // Маршрут уже выбран; сеть обновляется за web-скелетоном, не за логотипом.
    void capacitor?.Plugins?.LaunchStartup?.reveal?.().catch(error => {
      console.warn('Не удалось показать стартовый экран:', error);
    });
    const topicRoute = /^\/(?:dialogs|group)\/([^/]+)/.exec(
      window.location.pathname
    );
    if (topicRoute) {
      try {
        void prepareStartupTopicRecords(
          decodeURIComponent(topicRoute[1])
        ).catch(() => undefined);
      } catch {
        // Некорректный маршрут не должен задерживать обычную обработку навигации.
      }
    }
  }

  const shouldResetLogoAssetCache =
    window.localStorage?.getItem(logoAssetVersionKey) !== logoAssetVersion;
  if (!isAndroidNative) {
    if (!shouldResetLogoAssetCache) {
      return;
    }

    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker
        .getRegistrations()
        .then(registrations =>
          Promise.allSettled(
            registrations.map(registration => registration.unregister())
          )
        );
    }

    if ('caches' in window) {
      await caches
        .keys()
        .then(cacheNames =>
          Promise.allSettled(
            cacheNames.map(cacheName => caches.delete(cacheName))
          )
        );
    }

    window.localStorage?.setItem(logoAssetVersionKey, logoAssetVersion);
    return;
  }

  const tasks: Promise<unknown>[] = [];

  if ('serviceWorker' in navigator) {
    tasks.push(
      navigator.serviceWorker
        .getRegistrations()
        .then(registrations =>
          Promise.allSettled(
            registrations.map(registration => registration.unregister())
          )
        )
    );
  }

  if ('caches' in window) {
    tasks.push(
      caches
        .keys()
        .then(cacheNames =>
          Promise.allSettled(
            cacheNames.map(cacheName => caches.delete(cacheName))
          )
        )
    );
  }

  // Service-worker/cache cleanup is housekeeping and must never delay mounting
  // the real topic UI behind the startup shell.
  void Promise.allSettled(tasks).then(() => {
    window.localStorage?.setItem(logoAssetVersionKey, logoAssetVersion);
  });
})();

export {};
