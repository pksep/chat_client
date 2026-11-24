import { Capacitor } from '@capacitor/core';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ref } from 'vue';
import { desktopBrowserPlatform } from '../utils/desktop-app-downloads';
import {
  APP_CLIENT_PARAM,
  buildChatAppUrl,
  parseDesktopChatAppUrl
} from '../utils/chat-app-link';
import { launchNativeApp } from '../utils/native-app-launch';
import {
  buildDesktopGroupCallInviteUrl,
  buildPublicGroupCallInviteUrl,
  CALL_BROWSER_CHOICE_PARAM,
  parseDesktopGroupCallInviteUrl,
  parseGroupCallInviteUrl
} from '../utils/groupCallInviteUrl';

const isWebBrowser = (): boolean =>
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  !isTauri() &&
  !Capacitor.isNativePlatform();

// Поля приглашения живут в памяти/текущем URL и не пишутся в хранилища или логи.
export const pendingDesktopCallInvite = ref<string | null>(null);
const pendingPublicInvite = ref<string | null>(null);
let cancelBrowserLaunch: (() => void) | undefined;
const supportsAppHandoff = (): boolean =>
  isWebBrowser() &&
  (/Android/i.test(navigator.userAgent) ||
    desktopBrowserPlatform(navigator) !== 'mobile');

const canonicalInvite = (value: string): string | null => {
  const invite = parseGroupCallInviteUrl(value, { allowTrustedOrigin: true });
  return invite ? buildPublicGroupCallInviteUrl(invite) : null;
};

export const presentBrowserCallInviteChoice = (value: string): boolean => {
  if (!supportsAppHandoff()) return false;
  const publicUrl = canonicalInvite(value);
  if (!publicUrl) return false;
  if (pendingPublicInvite.value === publicUrl) return true;
  cancelBrowserLaunch?.();
  const appUrl = buildChatAppUrl(
    publicUrl,
    /Android/i.test(navigator.userAgent)
  );
  pendingPublicInvite.value = publicUrl;
  pendingDesktopCallInvite.value = appUrl;
  cancelBrowserLaunch = launchNativeApp(appUrl, {
    onFallback: () => {
      if (pendingPublicInvite.value === publicUrl)
        void continueCallInviteInBrowser();
    }
  });
  return true;
};

const clearChoice = () => {
  cancelBrowserLaunch?.();
  cancelBrowserLaunch = undefined;
  pendingPublicInvite.value = null;
  pendingDesktopCallInvite.value = null;
};

const updateInviteLocation = (publicUrl: string, browser: boolean) => {
  const invite = parseGroupCallInviteUrl(publicUrl, {
    allowTrustedOrigin: true
  });
  if (!invite) return;
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set('callRoom', invite.roomId);
  currentUrl.searchParams.set('callInvite', invite.inviteToken);
  currentUrl.searchParams.delete('organization');
  if (invite.organization)
    currentUrl.searchParams.set('organization', invite.organization);
  currentUrl.searchParams.delete('callAppFallback');
  currentUrl.searchParams.delete(CALL_BROWSER_CHOICE_PARAM);
  if (browser) currentUrl.searchParams.set(CALL_BROWSER_CHOICE_PARAM, 'web');
  window.history.replaceState(window.history.state, '', currentUrl);
};

const syncBrowserInvite = () => {
  if (!isWebBrowser()) return;
  const url = new URL(window.location.href);
  if (
    url.searchParams.get(CALL_BROWSER_CHOICE_PARAM) === 'web' ||
    url.searchParams.get(APP_CLIENT_PARAM) === 'web' ||
    !canonicalInvite(url.href)
  ) {
    clearChoice();
    return;
  }
  presentBrowserCallInviteChoice(url.href);
};

if (isWebBrowser()) {
  // До подключения SDK: пока открыт системный запрос, веб не дублирует звонок.
  syncBrowserInvite();
  window.addEventListener('popstate', syncBrowserInvite);
  window.addEventListener('hashchange', syncBrowserInvite);
  import.meta.hot?.dispose(() => {
    window.removeEventListener('popstate', syncBrowserInvite);
    window.removeEventListener('hashchange', syncBrowserInvite);
    clearChoice();
  });
}

/** Предлагаем установленный клиент при обычном входе, один раз за вкладку. */
export const initBrowserAppLinks = (): void => {
  if (!supportsAppHandoff()) return;
  const url = new URL(window.location.href);
  if (canonicalInvite(url.href)) return;
  if (
    url.searchParams.get(APP_CLIENT_PARAM) === 'web' ||
    url.searchParams.get(CALL_BROWSER_CHOICE_PARAM) === 'web' ||
    url.searchParams.has('installIOS') ||
    new URLSearchParams(url.hash.slice(1)).has('qr')
  )
    return;
  const explicit = url.searchParams.get(APP_CLIENT_PARAM) === 'app';
  // Авторизация через редирект не запускает второй системный запрос.
  if (url.searchParams.has('token') && !explicit) return;
  try {
    if (
      !explicit &&
      sessionStorage.getItem('chat.app-handoff.attempted') === '1'
    )
      return;
    sessionStorage.setItem('chat.app-handoff.attempted', '1');
  } catch {
    // Недоступное хранилище не мешает остаться в вебе.
  }
  cancelBrowserLaunch?.();
  cancelBrowserLaunch = launchNativeApp(
    buildChatAppUrl(url.href, /Android/i.test(navigator.userAgent))
  );
  // Не переносим решение этой вкладки в ссылку, которую могут скопировать другим.
  if (explicit) {
    url.searchParams.delete(APP_CLIENT_PARAM);
    window.history.replaceState(window.history.state, '', url);
  }
};

export const continueCallInviteInBrowser = async (): Promise<void> => {
  const selected = pendingPublicInvite.value;
  if (!selected) return;
  updateInviteLocation(selected, true);
  clearChoice();
  const { getChatSDK } = await import('./useChat');
  if (
    getChatSDK()?.isConnected() &&
    !pendingDesktopCallInvite.value &&
    canonicalInvite(window.location.href) === selected
  ) {
    const { restoreInvitedGroupCallFromUrl } = await import('./useCalls');
    if (
      pendingDesktopCallInvite.value ||
      canonicalInvite(window.location.href) !== selected
    )
      return;
    await restoreInvitedGroupCallFromUrl();
  }
};

let initialization: Promise<void> | null = null;

export const initDesktopCallLinks = (): Promise<void> => {
  if (!isTauri()) {
    initBrowserAppLinks();
    return Promise.resolve();
  }
  if (initialization) return initialization;

  initialization = (async () => {
    const { handleAppUrlOpen } = await import('./useCallKit');
    const handleUrl = async (value: string): Promise<void> => {
      const target = parseDesktopChatAppUrl(value);
      if (target) {
        const source = new URL(value);
        // Простое «Открыть» возвращает окно, сохраняя текущую переписку.
        if (
          !source.searchParams.has('path') &&
          !source.searchParams.has('organization')
        )
          return;
        const currentUrl = new URL(window.location.href);
        const organization = target.searchParams.get('organization');
        if (
          organization &&
          currentUrl.searchParams.get('organization') !== organization
        ) {
          const next = new URL(
            target.pathname + target.search,
            currentUrl.origin
          );
          window.location.assign(next.href);
          return;
        }
        if (source.searchParams.has('path')) {
          currentUrl.pathname = target.pathname;
          for (const key of [
            'callRoom',
            'callInvite',
            'callClient',
            'callAppFallback',
            APP_CLIENT_PARAM
          ])
            currentUrl.searchParams.delete(key);
        }
        window.history.replaceState(window.history.state, '', currentUrl);
        window.dispatchEvent(new PopStateEvent('popstate'));
        return;
      }
      const publicUrl = parseDesktopGroupCallInviteUrl(value);
      if (!publicUrl) return;
      const invite = parseGroupCallInviteUrl(publicUrl, {
        allowTrustedOrigin: true
      });
      if (!invite) return;

      updateInviteLocation(publicUrl, false);
      await handleAppUrlOpen({ url: publicUrl });
    };

    // Сначала слушатель, затем launch URL: ссылка не теряется во время запуска.
    await listen<string[]>('deep-link://new-url', event => {
      for (const url of event.payload) {
        void handleUrl(url).catch(error =>
          console.warn('Не удалось открыть ссылку на звонок:', error)
        );
      }
    });
    const urls = await invoke<string[] | null>('desktop_get_open_urls');
    if (Array.isArray(urls) && urls.length) {
      for (const url of urls) await handleUrl(url);
    } else {
      const link = buildDesktopGroupCallInviteUrl(window.location.href);
      if (link) await handleUrl(link);
    }
  })().catch(error => {
    initialization = null;
    console.warn('Не удалось настроить открытие ссылок СЭП Чат:', error);
  });
  return initialization;
};
