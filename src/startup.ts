declare global {
  interface Window {
    __chatNativeStartupCleanup?: Promise<void>;
  }
}

const startupUrl = new URL(window.location.href);
const startupPathParts = startupUrl.pathname.split('/').filter(Boolean);
const startupRouteType = startupPathParts[0];
const hasStartupTopicRoute =
  ((startupRouteType === 'dialogs' || startupRouteType === 'group') &&
    Boolean(startupPathParts[1])) ||
  Boolean(
    startupUrl.searchParams.get('dialogs') ||
      startupUrl.searchParams.get('group')
  );

if (hasStartupTopicRoute) {
  document.documentElement.classList.add('startup-shell-topic-route');
}

window.__chatNativeStartupCleanup = (async () => {
  const logoAssetVersion = '20260731';
  const logoAssetVersionKey = 'chat.logo.assets.version';
  const capacitor = (
    window as typeof window & {
      Capacitor?: {
        isNativePlatform?: () => boolean;
        getPlatform?: () => string;
      };
    }
  ).Capacitor;
  const isAndroidNative =
    Boolean(capacitor?.isNativePlatform?.()) &&
    capacitor?.getPlatform?.() === 'android';

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

  await Promise.allSettled(tasks);
  window.localStorage?.setItem(logoAssetVersionKey, logoAssetVersion);
})();

export {};
