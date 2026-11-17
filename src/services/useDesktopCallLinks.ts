import { Capacitor } from '@capacitor/core';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { ref } from 'vue';
import {
  buildDesktopGroupCallInviteUrl,
  parseDesktopGroupCallInviteUrl,
  parseGroupCallInviteUrl
} from '../utils/groupCallInviteUrl';

const isDesktopBrowser = (): boolean =>
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  !isTauri() &&
  !Capacitor.isNativePlatform() &&
  !/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
  !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Выбор приложения доступен до авторизации, в том числе при вводе ссылки вручную.
export const pendingDesktopCallInvite = ref<string | null>(
  isDesktopBrowser()
    ? buildDesktopGroupCallInviteUrl(window.location.href)
    : null
);

export const continueCallInviteInBrowser = async (): Promise<void> => {
  pendingDesktopCallInvite.value = null;
  const { getChatSDK } = await import('./useChat');
  if (getChatSDK()?.isConnected()) {
    const { restoreInvitedGroupCallFromUrl } = await import('./useCalls');
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

      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.set('callRoom', invite.roomId);
      currentUrl.searchParams.set('callInvite', invite.inviteToken);
      if (invite.organization)
        currentUrl.searchParams.set('organization', invite.organization);
      window.history.replaceState(window.history.state, '', currentUrl);
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
    console.warn('Не удалось настроить открытие ссылок SEP Chat:', error);
  });
  return initialization;
};
