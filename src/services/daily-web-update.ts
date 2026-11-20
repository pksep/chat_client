const RELOAD_ATTEMPT_KEY = 'chat_web_update_reload_attempt';
const RELOAD_QUERY = '_chat_update';
const UPDATE_DAY_KEY = 'chat_web_update_day';
const HTML_TIMEOUT_MS = 10_000;

const localDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export const clearAppShellCache = async (): Promise<void> => {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      registrations
        .filter(registration =>
          [
            registration.active,
            registration.waiting,
            registration.installing
          ].some(worker => {
            if (!worker) return false;
            const url = new URL(worker.scriptURL);
            return (
              url.origin === location.origin &&
              url.pathname.endsWith('/sw.js') &&
              location.href.startsWith(registration.scope)
            );
          })
        )
        .map(registration => registration.unregister())
    );
  }

  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(
      names
        .filter(name => name.startsWith('workbox-precache-'))
        .map(name => caches.delete(name))
    );
  }
};

export const createDailyWebUpdate = (options: {
  runningVersion: number;
  canReload: () => boolean;
  onReload: (version: number) => void;
}) => {
  const loadedDay = localDay(new Date());
  let checkedDay: string | null = null;
  let reloading = false;
  const saveDay = (day: string) => {
    checkedDay = day;
    try {
      localStorage.setItem(UPDATE_DAY_KEY, day);
    } catch {
      // Вкладка продолжает отслеживать день, даже если хранилище недоступно.
    }
  };
  const hasDayChanged = () => {
    if (checkedDay === null) {
      try {
        const storedDay = localStorage.getItem(UPDATE_DAY_KEY);
        if (storedDay && /^\d{4}-\d{2}-\d{2}$/.test(storedDay)) {
          checkedDay = storedDay;
        }
      } catch {
        // Используем дату открытия вкладки при запрете localStorage.
      }
      if (checkedDay === null) saveDay(loadedDay);
    }
    return localDay(new Date()) !== checkedDay;
  };

  const cleanReloadUrl = () => {
    const url = new URL(location.href);
    if (!url.searchParams.has(RELOAD_QUERY)) return;
    url.searchParams.delete(RELOAD_QUERY);
    history.replaceState(history.state, '', url);
  };

  const apply = async (version: number): Promise<void> => {
    if (!Number.isFinite(version) || version <= 0) return;
    const dayChanged = hasDayChanged();
    if (
      reloading ||
      version <= options.runningVersion ||
      !dayChanged ||
      !options.canReload()
    ) {
      return;
    }

    const attempt = `${localDay(new Date())}:${version}`;
    try {
      if (sessionStorage.getItem(RELOAD_ATTEMPT_KEY) === attempt) return;
    } catch {
      // Запрет sessionStorage не должен отключать обновление вкладки.
    }

    reloading = true;
    let navigationStarted = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HTML_TIMEOUT_MS);
    try {
      const url = new URL(location.href);
      url.searchParams.set(RELOAD_QUERY, `${version}-${Date.now()}`);
      // Проверяем доступность страницы перед удалением кэша оболочки.
      const response = await fetch(url, {
        cache: 'no-store',
        signal: controller.signal
      });
      if (
        !response.ok ||
        !response.headers.get('content-type')?.includes('text/html')
      ) {
        throw new Error('Не удалось загрузить новую версию веб-чата');
      }
      await response.text();
      if (!options.canReload()) return;
      await clearAppShellCache();
      if (!options.canReload()) return;

      try {
        sessionStorage.setItem(RELOAD_ATTEMPT_KEY, attempt);
      } catch {
        // Дата новой страницы также защищает от повторной перезагрузки.
      }
      options.onReload(version);
      saveDay(localDay(new Date()));
      location.replace(url);
      navigationStarted = true;
    } finally {
      clearTimeout(timeout);
      if (!navigationStarted) reloading = false;
    }
  };

  return { apply, hasDayChanged, cleanReloadUrl };
};
