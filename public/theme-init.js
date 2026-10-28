(() => {
  const storageKey = 'erp-theme-color-scheme';
  const darkThemeClass = 'theme-dark';
  const lightThemeClass = 'theme-light';
  let themeClass = lightThemeClass;

  try {
    const savedThemeClass = window.localStorage.getItem(storageKey);

    if (
      savedThemeClass === darkThemeClass ||
      savedThemeClass === lightThemeClass
    ) {
      themeClass = savedThemeClass;
    }
  } catch {
    // Keep the light default when storage is unavailable.
  }

  const rootElement = document.documentElement;
  const isDarkTheme = themeClass === darkThemeClass;

  rootElement.classList.remove(darkThemeClass, lightThemeClass);
  rootElement.classList.add(themeClass);
  rootElement.style.colorScheme = isDarkTheme ? 'dark' : 'light';

  const isIos =
    /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (
    isIos &&
    (navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches)
  ) {
    rootElement.classList.add('startup-shell-logo');
  }

  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDarkTheme ? '#262a38' : '#ffffff');

  // До первого кадра восстанавливаем только количество мест в меню.
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('token')) return;
    const session = JSON.parse(
      window.localStorage.getItem('chat_auth_session') ||
        window.sessionStorage.getItem('chat_auth_session') ||
        'null'
    );
    const layout = JSON.parse(
      window.localStorage.getItem('chat_menu_layout') || 'null'
    );
    const organizations = JSON.parse(
      window.localStorage.getItem('chat_runtime_organizations') || '[]'
    );
    const normalize = value => {
      if (typeof value !== 'string') return '';
      const url = value.trim().replace(/\/+$/, '');
      if (!url || /^[a-z][a-z\d+\-.]*:\/\//i.test(url)) return url;
      const host = /[.:/]/.test(url) ? url : `${url}.pksep.ru`;
      const protocol = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/.test(host)
        ? 'http'
        : 'https';
      return `${protocol}://${host}`;
    };
    const selected = normalize(
      params.get('organization') ||
        window.localStorage.getItem('chat_runtime_last_organization') ||
        ''
    );
    const organization = organizations.find(
      item => normalize(item?.url) === selected
    );
    const apiBase = organization?.config?.CHAT_API_DOMAIN;
    if (
      session?.token &&
      session.user?.id &&
      layout?.userId === session.user.id &&
      typeof apiBase === 'string' &&
      layout.apiBase === apiBase.replace(/\/+$/, '') &&
      [3, 4, 5].includes(layout.count)
    ) {
      rootElement.dataset.startupMenuCount = String(layout.count);
    }
  } catch {
    // Без подходящего кеша показываем нейтральный скелетон меню.
  }
})();
