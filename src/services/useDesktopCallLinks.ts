import { Capacitor } from '@capacitor/core';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ref } from 'vue';
import {
  buildDesktopGroupCallInviteUrl,
  buildAndroidGroupCallInviteUrl,
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
export const callInviteApplicationDownloadUrl =
  typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent)
    ? 'https://pksep.github.io/sep-chat-ui/android/'
    : 'https://github.com/pksep/chat_client/releases/latest';

const canonicalInvite = (value: string): string | null => {
  const invite = parseGroupCallInviteUrl(value, { allowTrustedOrigin: true });
  return invite ? buildPublicGroupCallInviteUrl(invite) : null;
};

export const presentBrowserCallInviteChoice = (value: string): boolean => {
  if (!isWebBrowser()) return false;
  const publicUrl = canonicalInvite(value);
  if (!publicUrl) return false;
  const appUrl = /Android/i.test(navigator.userAgent)
    ? buildAndroidGroupCallInviteUrl(publicUrl)
    : buildDesktopGroupCallInviteUrl(publicUrl);
  if (!appUrl) return false;
  pendingPublicInvite.value = publicUrl;
  pendingDesktopCallInvite.value = appUrl;
  return true;
};

const clearChoice = () => {
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
    !canonicalInvite(url.href)
  ) {
    clearChoice();
    return;
  }
  presentBrowserCallInviteChoice(url.href);
};

if (isWebBrowser()) {
  // До подключения SDK: веб-звонок не начинается раньше выбора пользователя.
  syncBrowserInvite();
  window.addEventListener('popstate', syncBrowserInvite);
  window.addEventListener('hashchange', syncBrowserInvite);
}

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
  if (!isTauri()) return Promise.resolve();
  if (initialization) return initialization;

  initialization = (async () => {
    const { handleAppUrlOpen } = await import('./useCallKit');
    const handleUrl = async (value: string): Promise<void> => {
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
