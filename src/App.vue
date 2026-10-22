<template>
  <ChatContainerRoot
    v-if="config && !isCredentialsStep"
    :config="config"
    @ready="handleChatContentReady"
  />

  <AuthorizationScreen
    v-else-if="!isBootstrapping"
    v-model:url="serverUrl"
    v-model:identifier="identifierValue"
    v-model:password="passwordValue"
    v-model:remember-account="rememberAccount"
    :error-message="errorMessage"
    :is-loading="isLoading"
    :organizations="organizationUrls"
    :selected-organization="selectedOrganization"
    :is-adding-new-organization="isAddingNewOrganization"
    :is-credentials-step="isCredentialsStep"
    :auth-with-login="authWithLogin"
    @select-organization="selectOrganization"
    @add-organization="startAddOrganization"
    @remove-organization="removeOrganization"
    @submit="loadRemoteConfig"
    @submit-credentials="submitCredentialsLogin"
    @back="returnToOrganizationStep"
    @qr-auth-success="handleQrAuthSuccess"
    @ready="handleAuthorizationReady"
  />

  <IosInstallPromptModal
    v-if="isIosInstallPromptOpen"
    :open="isIosInstallPromptOpen"
    data-testid="App"
    @close="closeIosInstallHelp"
  />

  <NotificationStack />
</template>
<script lang="ts" setup>
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref
} from 'vue';
import { Capacitor } from '@capacitor/core';
import NotificationStack from './components/UI/NotificationStack.vue';
import { IChatContainerConfig } from './components/interfaces/interfaces';
import ChatContainerRoot from './ChatContainerRoot.vue';
import { useIosInstallPrompt } from './composables/useIosInstallPrompt';
import { areChatConfigsEqual, setConfig } from './services/useConfig';
import {
  clearErpAuthSession,
  consumeAuthRedirectStartupShellSkip,
  getChatAuthSession,
  getStoredBootstrapErpAccessToken,
  loginWithCredentials,
  saveBootstrapErpSession,
  saveChatAuthSession
} from './composables/useAuth';
import { fetchUsersForAuth, getUsersList } from './composables/useUsers';
import { initShareIntentHandling } from './services/useShareIntent';
import { initTelemetryLocation } from './services/useTelemetryLocation';
import {
  dispatchNativeStartupReady,
  NOTIFICATION_TOPIC_SHELL_READY_EVENT
} from './utils/nativeStartup';
import { useThemeStore } from './stores/theme';
import { withNetworkTimeout } from './utils/network-timeout';
import { isBotUser } from './utils/bot';
import {
  prepareMessageExperience,
  prepareMessageListAfterPaint
} from './utils/load-message-list';

const AuthorizationScreen = defineAsyncComponent(
  () => import('./components/AuthorizationScreen.vue')
);
const IosInstallPromptModal = defineAsyncComponent(
  () => import('./components/Menu/IosInstallPromptModal.vue')
);

const ORGANIZATIONS_KEY = 'chat_runtime_organizations';
const LAST_ORGANIZATION_KEY = 'chat_runtime_last_organization';
const URL_PROTOCOL_REGEXP = /^[a-z][a-z\d+\-.]*:\/\//i;

interface IStoredOrganization {
  url: string;
  config: IChatContainerConfig;
}

const getStoredOrganizations = (): IStoredOrganization[] => {
  const rawOrganizations = JSON.parse(
    localStorage.getItem(ORGANIZATIONS_KEY) || '[]'
  ) as Array<IStoredOrganization | string>;

  return rawOrganizations.filter((item): item is IStoredOrganization => {
    return typeof item !== 'string' && typeof item?.url === 'string';
  });
};
const themeStore = useThemeStore();
themeStore.initTheme();

// В Android оба модуля читаются из локального APK. Начинаем их разбор под
// нативным логотипом, пока параллельно восстанавливаются сессия и свежие темы.
// Тогда первое открытие переписки сразу получает историю и готовый редактор.
if (
  Capacitor.isNativePlatform() &&
  getChatAuthSession()?.token &&
  /^\/(?:dialogs|group|favorites)\//.test(window.location.pathname)
) {
  void prepareMessageExperience().catch(() => undefined);
}

const shouldSkipStartupShell = consumeAuthRedirectStartupShellSkip();
const startupShellElement = document.getElementById('startup-shell');

if (shouldSkipStartupShell) {
  startupShellElement?.remove();
}

const config = ref<IChatContainerConfig | null>(null);
const authWithLogin = computed(
  () => config.value?.CHAT_AUTH_WITH_LOGIN !== 'false'
);
const errorMessage = ref('');
const isLoading = ref(false);
const isBootstrapping = ref(!shouldSkipStartupShell);
const isStartupShellVisible = ref(
  !shouldSkipStartupShell && Boolean(startupShellElement)
);
const isChatContentReady = ref(false);
let isAuthorizationReady = false;
const identifierValue = ref('');
const passwordValue = ref('');
const rememberAccount = ref(true);
const organizations = ref<IStoredOrganization[]>(getStoredOrganizations());
const organizationUrls = computed(() =>
  organizations.value.map(item => item.url)
);
const selectedOrganization = ref(
  localStorage.getItem(LAST_ORGANIZATION_KEY) || ''
);
const isAddingNewOrganization = ref(!organizations.value.length);
const serverUrl = ref(selectedOrganization.value);
const isCredentialsStep = ref(false);
const {
  isOpen: isIosInstallPromptOpen,
  closeInstallHelp: closeIosInstallHelp
} = useIosInstallPrompt();

const waitForAnimationFrame = () =>
  new Promise<void>(resolve => {
    requestAnimationFrame(() => resolve());
  });

const wait = (durationMs: number) =>
  new Promise<void>(resolve => {
    window.setTimeout(resolve, durationMs);
  });

const STARTUP_SHELL_LEAVE_MS = 200;
let isStartupShellHideScheduled = false;
let startupShellHideToken = 0;
let isNativeStartupReadyDispatched = false;

const dispatchNativeStartupReadyOnce = () => {
  if (isNativeStartupReadyDispatched) {
    return;
  }

  isNativeStartupReadyDispatched = true;
  dispatchNativeStartupReady();
  void initTelemetryLocation();
};

const removeStartupShell = () => {
  startupShellElement?.remove();
  performance.mark('chat-startup:shell-removed');
  document.documentElement.classList.remove('startup-shell-topic-route');
  isStartupShellVisible.value = false;
  dispatchNativeStartupReadyOnce();
};

const hideStartupShellAfterMainPaint = async () => {
  const hideToken = ++startupShellHideToken;

  await nextTick();
  await waitForAnimationFrame();
  if (hideToken !== startupShellHideToken) return;
  // Настоящий интерфейс уже готов к этому кадру; fade на Android держал
  // поверх него ещё один скелетон и конкурировал с отложенной загрузкой.
  if (Capacitor.getPlatform() === 'android') {
    removeStartupShell();
    return;
  }
  await waitForAnimationFrame();

  if (hideToken !== startupShellHideToken) {
    return;
  }

  startupShellElement?.classList.add('startup-shell--leaving');
  isStartupShellVisible.value = false;
  await wait(STARTUP_SHELL_LEAVE_MS);

  if (hideToken !== startupShellHideToken) {
    return;
  }

  removeStartupShell();
};

const requestStartupShellHide = () => {
  if (!isStartupShellVisible.value || isStartupShellHideScheduled) {
    return;
  }

  isStartupShellHideScheduled = true;
  void hideStartupShellAfterMainPaint();
};

const handleNotificationTopicShellReady = () => {
  if (!startupShellElement?.isConnected) {
    dispatchNativeStartupReadyOnce();
    return;
  }

  // MessageList dispatches this event from requestAnimationFrame only after
  // the real topic header, message layer and composer exist.
  // Removing the static shell in the same frame avoids covering the real
  // header and composer with a second, full-screen skeleton during the fade.
  startupShellHideToken += 1;
  isStartupShellHideScheduled = true;
  removeStartupShell();
};

window.addEventListener(
  NOTIFICATION_TOPIC_SHELL_READY_EVENT,
  handleNotificationTopicShellReady
);

const handleChatContentReady = () => {
  isChatContentReady.value = true;
  void nextTick(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        performance.mark('chat-startup:content-painted');
        prepareMessageListAfterPaint();
      });
    });
  });

  if (!isBootstrapping.value) {
    requestStartupShellHide();
  }
};

const handleAuthorizationReady = () => {
  isAuthorizationReady = true;
  requestStartupShellHide();
};

const finishBootstrapping = () => {
  isBootstrapping.value = false;

  if (!isStartupShellVisible.value) {
    if (!isStartupShellHideScheduled) {
      dispatchNativeStartupReadyOnce();
    }

    return;
  }

  if (config.value && !isCredentialsStep.value) {
    if (isChatContentReady.value) {
      requestStartupShellHide();
    }

    return;
  }

  if (isAuthorizationReady) requestStartupShellHide();
};

const parseRuntimeConfig = (
  rawConfig: string
): Partial<IChatContainerConfig> => {
  const envMap = rawConfig
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .reduce<Record<string, string>>((acc, line) => {
      const separatorIndex = line.indexOf('=');

      if (separatorIndex === -1) {
        return acc;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();

      acc[key] = value;
      return acc;
    }, {});

  return {
    CHAT_AUTH_WITH_LOGIN: envMap.VITE_AUTH_WITH_LOGIN,
    CHAT_MASTRA_URL: envMap.VITE_MASTRA_URL,
    CHAT_API_DOMAIN: envMap.VITE_CHAT_API_DOMAIN,
    CHAT_WS_DOMAIN: envMap.VITE_CHAT_WS_DOMAIN,
    CHAT_ERP_URL: envMap.VITE_ERP_URL,
    CHAT_PATH_TO_FILE_CDN: envMap.VITE_PATH_TO_FILE_CDN,
    CHAT_LIVEKIT_URL: envMap.VITE_LIVEKIT_URL,
    CHAT_BOT_GATEWAY: envMap.VITE_BOT_GATEWAY_URL,
    CHAT_CALL_TOPIC_AUTO_PROMPT_ENABLED:
      envMap.VITE_CALL_TOPIC_AUTO_PROMPT_ENABLED,
    CHAT_MULTIPART_UPLOAD_CONCURRENCY: envMap.VITE_MULTIPART_UPLOAD_CONCURRENCY
  };
};

const normalizeServerUrl = (value: string) => {
  const trimmedUrl = value.trim().replace(/\/+$/, '');

  if (!trimmedUrl) {
    return '';
  }

  if (URL_PROTOCOL_REGEXP.test(trimmedUrl)) {
    return trimmedUrl;
  }

  const host = /[.:/]/.test(trimmedUrl) ? trimmedUrl : `${trimmedUrl}.pksep.ru`;

  // Локальная разработка: localhost/127.* обслуживаются по http (нет TLS),
  // иначе клиент форсит https и получает ERR_SSL_PROTOCOL_ERROR.
  const protocol = /^(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|$)/.test(host)
    ? 'http'
    : 'https';

  return `${protocol}://${host}`;
};

const getRuntimeConfigUrl = (baseUrl: string) =>
  `${normalizeServerUrl(baseUrl)}/config`;

const applyConfig = (resolvedConfig: IChatContainerConfig) => {
  if (areChatConfigsEqual(config.value, resolvedConfig)) {
    setConfig(config.value || resolvedConfig);
    return;
  }

  config.value = resolvedConfig;
  setConfig(resolvedConfig);
};

const preloadAuthUsers = async () => {
  if (!authWithLogin.value) return;
  try {
    await fetchUsersForAuth();
  } catch (error) {
    console.error('Failed to preload users for auth:', error);
  }
};

const getUrlErpToken = () => {
  const url = new URL(window.location.href);

  return url.searchParams.get('token')?.split('?token')[0] || '';
};

const getUrlOrganization = () => {
  const url = new URL(window.location.href);
  const organization = url.searchParams.get('organization') || '';

  return organization ? normalizeServerUrl(organization) : '';
};

const hasBootstrapToken = () =>
  !!getUrlErpToken() || !!getStoredBootstrapErpAccessToken();
const hasChatSession = () => !!getChatAuthSession();
const shouldLoadFreshConfigBeforeChat = () =>
  hasBootstrapToken() || hasChatSession();
const shouldUseStoredConfigImmediately = (
  fallbackConfig?: IChatContainerConfig
) => !!fallbackConfig && shouldLoadFreshConfigBeforeChat();

const refreshRemoteConfigInBackground = (
  url: string,
  fallbackConfig: IChatContainerConfig
) => {
  void loadRemoteConfig({
    url,
    fallbackConfig
  });
};

const openStoredConfig = (
  url: string,
  fallbackConfig: IChatContainerConfig
) => {
  const normalizedUrl = normalizeServerUrl(url);

  serverUrl.value = normalizedUrl;
  setLastOrganization(normalizedUrl);
  isAddingNewOrganization.value = false;
  applyConfig(fallbackConfig);
  openCredentialsStepIfNeeded();
};

const openCredentialsStepIfNeeded = () => {
  if (hasBootstrapToken() || hasChatSession()) {
    isCredentialsStep.value = false;
    return;
  }

  isCredentialsStep.value = true;
  void preloadAuthUsers();
};

const saveOrganizations = (items: IStoredOrganization[]) => {
  organizations.value = items;
  localStorage.setItem(ORGANIZATIONS_KEY, JSON.stringify(items));
};

const setLastOrganization = (url: string) => {
  selectedOrganization.value = url;
  localStorage.setItem(LAST_ORGANIZATION_KEY, url);
};

const clearLastOrganization = () => {
  selectedOrganization.value = '';
  localStorage.removeItem(LAST_ORGANIZATION_KEY);
};

const getOrganizationByUrl = (url: string) => {
  const normalizedUrl = normalizeServerUrl(url);

  return organizations.value.find(
    item => normalizeServerUrl(item.url) === normalizedUrl
  );
};

const upsertOrganization = (url: string, nextConfig: IChatContainerConfig) => {
  const normalizedUrl = normalizeServerUrl(url);
  const nextOrganizations = [
    {
      url: normalizedUrl,
      config: nextConfig
    },
    ...organizations.value.filter(
      item => normalizeServerUrl(item.url) !== normalizedUrl
    )
  ];

  saveOrganizations(nextOrganizations);
};

const selectOrganization = (url: string) => {
  const organization = getOrganizationByUrl(url);
  const normalizedUrl = normalizeServerUrl(url);

  if (!organization) {
    return;
  }

  setLastOrganization(normalizedUrl);
  serverUrl.value = normalizedUrl;
  isAddingNewOrganization.value = false;

  if (shouldLoadFreshConfigBeforeChat()) {
    if (shouldUseStoredConfigImmediately(organization.config)) {
      openStoredConfig(normalizedUrl, organization.config);
      refreshRemoteConfigInBackground(normalizedUrl, organization.config);
      return;
    }

    void loadRemoteConfig({
      url: normalizedUrl,
      fallbackConfig: organization.config
    });
    return;
  }

  void loadRemoteConfig({
    url: normalizedUrl,
    fallbackConfig: organization.config
  });
};

const startAddOrganization = () => {
  serverUrl.value = '';
  isAddingNewOrganization.value = true;
  isCredentialsStep.value = false;
  errorMessage.value = '';
};

const returnToOrganizationStep = () => {
  clearLastOrganization();
  isCredentialsStep.value = false;
  config.value = null;
  errorMessage.value = '';
  passwordValue.value = '';
};

const handleQrAuthSuccess = (payload: {
  token: string;
  organization?: string;
}) => {
  if (!payload.token) {
    return;
  }

  saveBootstrapErpSession({ accessToken: payload.token }, true);
  errorMessage.value = '';
  isCredentialsStep.value = false;

  const scannedOrganization = payload.organization
    ? normalizeServerUrl(payload.organization)
    : '';

  if (!scannedOrganization) {
    return;
  }

  const storedOrganization = organizations.value.find(
    item => normalizeServerUrl(item.url) === scannedOrganization
  );

  serverUrl.value = scannedOrganization;
  isAddingNewOrganization.value = false;

  if (storedOrganization) {
    if (shouldLoadFreshConfigBeforeChat()) {
      if (shouldUseStoredConfigImmediately(storedOrganization.config)) {
        openStoredConfig(scannedOrganization, storedOrganization.config);
        refreshRemoteConfigInBackground(
          scannedOrganization,
          storedOrganization.config
        );
        return;
      }

      void loadRemoteConfig({
        url: scannedOrganization,
        fallbackConfig: storedOrganization.config
      });
      return;
    }

    applyConfig(storedOrganization.config);
    void loadRemoteConfig({
      url: scannedOrganization,
      fallbackConfig: storedOrganization.config
    });
    return;
  }

  void loadRemoteConfig({
    url: scannedOrganization
  });
};

const removeOrganization = (url: string) => {
  const normalizedUrl = normalizeServerUrl(url);
  const nextOrganizations = organizations.value.filter(
    item => normalizeServerUrl(item.url) !== normalizedUrl
  );

  saveOrganizations(nextOrganizations);

  if (normalizeServerUrl(selectedOrganization.value) === normalizedUrl) {
    clearLastOrganization();
    startAddOrganization();
  }

  if (!nextOrganizations.length) {
    startAddOrganization();
  }
};

const loadRemoteConfig = async (options?: {
  url?: string;
  fallbackConfig?: IChatContainerConfig;
}) => {
  const normalizedUrl = normalizeServerUrl(options?.url ?? serverUrl.value);

  if (!normalizedUrl) {
    return;
  }

  serverUrl.value = normalizedUrl;
  isLoading.value = true;

  try {
    const runtimeConfig = await withNetworkTimeout(async signal => {
      const response = await fetch(getRuntimeConfigUrl(normalizedUrl), {
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load runtime config: ${response.status}`);
      }

      return parseRuntimeConfig(await response.text());
    });
    const resolvedConfig = runtimeConfig as IChatContainerConfig;
    serverUrl.value = normalizedUrl;
    setLastOrganization(normalizedUrl);
    isAddingNewOrganization.value = false;
    upsertOrganization(normalizedUrl, resolvedConfig);
    applyConfig(resolvedConfig);
    openCredentialsStepIfNeeded();
  } catch (error) {
    console.error(error);

    if (options?.fallbackConfig) {
      serverUrl.value = normalizedUrl;
      setLastOrganization(normalizedUrl);
      isAddingNewOrganization.value = false;
      applyConfig(options.fallbackConfig);
      openCredentialsStepIfNeeded();
    }
  } finally {
    isLoading.value = false;
  }
};

const submitCredentialsLogin = async () => {
  if (!identifierValue.value.trim() || !passwordValue.value.trim()) {
    errorMessage.value = 'Введите логин и пароль.';
    return;
  }

  isLoading.value = true;
  errorMessage.value = '';

  try {
    const identifier = identifierValue.value.trim();
    let tabel = identifier;
    if (authWithLogin.value) {
      const users = getUsersList().filter(user => !isBotUser(user));
      const matchingUsers = users.filter(
        user => user.initials?.trim() === identifier
      );
      // В списке показаны инициалы, но авторизация принимает табельный номер.
      if (
        !users.some(user => user.nickname === identifier) &&
        matchingUsers.length === 1
      ) {
        tabel = matchingUsers[0].nickname;
      }
    }

    const authData = await loginWithCredentials({
      identifier: tabel,
      password: passwordValue.value.trim()
    });

    if (!authData.token) {
      throw new Error('Chat token missing in credentials response');
    }

    saveChatAuthSession(
      {
        token: authData.token,
        user: authData.user,
        source: authData.source
      },
      rememberAccount.value
    );

    if (authData.erpToken) {
      saveBootstrapErpSession(
        {
          accessToken: authData.erpToken
        },
        rememberAccount.value
      );
    }

    if (!rememberAccount.value) {
      identifierValue.value = '';
    }

    isCredentialsStep.value = false;
  } catch (error) {
    console.error(error);
    clearErpAuthSession();
    errorMessage.value = 'Не удалось войти по логину.';
  } finally {
    isLoading.value = false;
  }
};

onMounted(async () => {
  void initShareIntentHandling();
  localStorage.removeItem('chat_runtime_config_url');

  try {
    const urlOrganization = getUrlOrganization();

    if (urlOrganization) {
      const storedOrganization = organizations.value.find(
        item => normalizeServerUrl(item.url) === urlOrganization
      );

      serverUrl.value = urlOrganization;
      isAddingNewOrganization.value = false;

      if (storedOrganization) {
        if (shouldLoadFreshConfigBeforeChat()) {
          if (shouldUseStoredConfigImmediately(storedOrganization.config)) {
            openStoredConfig(urlOrganization, storedOrganization.config);
            refreshRemoteConfigInBackground(
              urlOrganization,
              storedOrganization.config
            );
            return;
          }

          await loadRemoteConfig({
            url: urlOrganization,
            fallbackConfig: storedOrganization.config
          });
          return;
        }

        await loadRemoteConfig({
          url: urlOrganization,
          fallbackConfig: storedOrganization.config
        });
        return;
      }

      await loadRemoteConfig({
        url: urlOrganization
      });
      return;
    }

    const normalizedSelectedOrganization = normalizeServerUrl(
      selectedOrganization.value
    );
    const lastOrganization = organizations.value.find(
      item => normalizeServerUrl(item.url) === normalizedSelectedOrganization
    );

    if (lastOrganization) {
      const normalizedLastOrganization = normalizeServerUrl(
        lastOrganization.url
      );

      serverUrl.value = normalizedLastOrganization;
      isAddingNewOrganization.value = false;

      if (shouldLoadFreshConfigBeforeChat()) {
        if (shouldUseStoredConfigImmediately(lastOrganization.config)) {
          openStoredConfig(normalizedLastOrganization, lastOrganization.config);
          refreshRemoteConfigInBackground(
            normalizedLastOrganization,
            lastOrganization.config
          );
          return;
        }

        await loadRemoteConfig({
          url: normalizedLastOrganization,
          fallbackConfig: lastOrganization.config
        });
        return;
      }

      await loadRemoteConfig({
        url: normalizedLastOrganization,
        fallbackConfig: lastOrganization.config
      });
      return;
    }

    clearLastOrganization();

    if (!organizations.value.length) {
      startAddOrganization();
    }
  } finally {
    finishBootstrapping();
  }
});

onBeforeUnmount(() => {
  window.removeEventListener(
    NOTIFICATION_TOPIC_SHELL_READY_EVENT,
    handleNotificationTopicShellReady
  );
});
</script>

<style scoped>
.app-startup-shell {
  position: fixed;
  inset: 0;
  z-index: 2600;
  display: grid;
  grid-template-columns: 345px minmax(0, 1fr);
  height: 100dvh;
  min-height: 100dvh;
  background: #f8f9fd;
  color: #111827;
  font-family:
    Inter,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    'Segoe UI',
    sans-serif;
  overflow: hidden;
  pointer-events: auto;
  transform: translateZ(0);
}

.app-startup-shell-fade-leave-active {
  transition:
    opacity 180ms ease,
    visibility 180ms ease;
}

.app-startup-shell-fade-leave-to {
  opacity: 0;
  visibility: hidden;
}

.app-startup-shell__content {
  display: grid;
  grid-template-rows: auto auto auto auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  padding: 20px 10px 0;
  border-right: 0.5px solid #e5e7eb;
  background: #ffffff;
  box-sizing: border-box;
}

.app-startup-shell__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
  padding: 0 16px 10px;
}

.app-startup-shell__title {
  width: 104px;
  height: 24px;
  border-radius: 6px;
}

.app-startup-shell__create {
  width: 22px;
  height: 22px;
  border-radius: 50%;
}

.app-startup-shell__divider {
  height: 1px;
  margin: 0 10px 10px;
  background: #eef1f5;
}

.app-startup-shell__search {
  height: 40px;
  margin: 0 10px 10px;
  border-radius: 8px;
  background: #f5f7fb;
}

.app-startup-shell__filters {
  display: flex;
  gap: 5px;
  min-height: 43px;
  padding: 0 10px 10px;
  box-sizing: border-box;
}

.app-startup-shell__chip {
  width: 70px;
  height: 33px;
  border: 1px solid #d9e5ff;
  border-radius: 15px;
  background: #eef4ff;
  box-sizing: border-box;
}

.app-startup-shell__chip:nth-child(2) {
  width: 58px;
  border-color: #e5e7eb;
  background: #ffffff;
}

.app-startup-shell__chip:nth-child(3) {
  width: 96px;
  border-color: #e5e7eb;
  background: #ffffff;
}

.app-startup-shell__chip:nth-child(4) {
  width: 64px;
  border-color: #e5e7eb;
  background: #ffffff;
}

.app-startup-shell__list {
  min-height: 0;
  overflow: hidden;
}

.app-startup-shell__row {
  display: grid;
  grid-template-columns: 50px minmax(0, 1fr);
  column-gap: 10px;
  align-items: center;
  min-height: 60px;
  padding: 0 10px;
  box-sizing: border-box;
}

.app-startup-shell__title,
.app-startup-shell__create,
.app-startup-shell__avatar,
.app-startup-shell__line,
.app-startup-shell__subline,
.app-startup-shell__nav-item,
.app-startup-shell__header-avatar,
.app-startup-shell__header-line,
.app-startup-shell__header-subline,
.app-startup-shell__header-action,
.app-startup-shell__message-avatar,
.app-startup-shell__message-bubble,
.app-startup-shell__composer-text,
.app-startup-shell__composer-toolbar-button {
  background: linear-gradient(90deg, #eef2f7, #f8fafc, #eef2f7);
  background-size: 180% 100%;
  animation: app-startup-pulse 1.2s ease-in-out infinite;
}

.app-startup-shell__avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
}

.app-startup-shell__line {
  width: 78%;
  height: 14px;
  margin-bottom: 9px;
  border-radius: 6px;
}

.app-startup-shell__subline {
  width: 54%;
  height: 12px;
  border-radius: 6px;
}

.app-startup-shell__navigation {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  align-items: center;
  gap: 12px;
  height: 58px;
  margin: 0 -10px;
  padding: 10px 28px;
  border-top: 1px solid #eef3ff;
  border-radius: 15px 15px 0 0;
  box-shadow: 0 0 22px rgb(0 0 0 / 7%);
  box-sizing: border-box;
}

.app-startup-shell__nav-item {
  width: 38px;
  height: 38px;
  justify-self: center;
  border-radius: 50%;
}

.app-startup-shell__main {
  display: grid;
  grid-template-rows: 60px minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
}

.app-startup-shell__header {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 7px 16px;
  border-bottom: 0.5px solid #e5e7eb;
  background: #ffffff;
  box-sizing: border-box;
}

.app-startup-shell__header-avatar {
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
}

.app-startup-shell__header-profile {
  flex: 1;
  min-width: 0;
}

.app-startup-shell__header-line {
  width: 150px;
  height: 14px;
  margin-bottom: 6px;
  border-radius: 5px;
}

.app-startup-shell__header-subline {
  width: 92px;
  height: 10px;
  border-radius: 5px;
}

.app-startup-shell__header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.app-startup-shell__header-action {
  width: 24px;
  height: 24px;
  border-radius: 50%;
}

.app-startup-shell__messages {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 12px;
  min-height: 0;
  padding: 22px 18px 16px;
  overflow: hidden;
  box-sizing: border-box;
}

.app-startup-shell__message-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  width: 100%;
}

.app-startup-shell__message-row--outgoing {
  justify-content: flex-end;
}

.app-startup-shell__message-avatar {
  flex: 0 0 35px;
  width: 35px;
  height: 35px;
  border-radius: 50%;
}

.app-startup-shell__message-bubble {
  width: min(42%, 320px);
  height: 42px;
  border-radius: 18px 18px 18px 6px;
}

.app-startup-shell__message-row--outgoing .app-startup-shell__message-bubble {
  width: min(36%, 280px);
  border-radius: 18px 18px 6px 18px;
  background-color: #e9f0ff;
}

.app-startup-shell__message-bubble--short {
  width: min(28%, 210px);
}

.app-startup-shell__message-bubble--wide {
  width: min(52%, 390px);
  height: 54px;
}

.app-startup-shell__composer {
  padding: 0 10px 15px 15px;
  box-sizing: border-box;
}

.app-startup-shell__composer-editor {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-height: 105px;
  border: 0.5px solid #dce1e8;
  border-radius: 20px;
  background: #ffffff;
  box-sizing: border-box;
}

.app-startup-shell__composer-text {
  width: min(36%, 260px);
  height: 14px;
  margin: 20px 16px;
  border-radius: 5px;
}

.app-startup-shell__composer-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  margin: 0 16px 16px;
}

.app-startup-shell__composer-toolbar-button {
  width: 30px;
  height: 30px;
  border-radius: 7px;
}

.app-startup-shell__composer-toolbar-button:last-child {
  margin-left: auto;
  background-color: #e2eaff;
}

@media screen and (width <= 768px) {
  .app-startup-shell {
    grid-template-columns: minmax(0, 1fr);
    height: 100dvh;
  }

  .app-startup-shell__content {
    display: grid;
    grid-template-rows: auto auto auto auto minmax(0, 1fr) auto;
    min-height: 100dvh;
    padding: 10px 0 0;
    border-right: 0;
    background: #ffffff;
  }

  .app-startup-shell__toolbar {
    display: flex;
    min-height: 24px;
    padding: 0 16px 10px;
  }

  .app-startup-shell__title {
    width: 58px;
    height: 24px;
    margin: 0;
    border-radius: 6px;
  }

  .app-startup-shell__main {
    display: none;
  }

  .app-startup-shell__divider {
    margin: 0 0 10px;
  }

  .app-startup-shell__search {
    height: 40px;
    margin: 0 16px 10px;
    border-radius: 8px;
  }

  .app-startup-shell__filters {
    gap: 5px;
    min-height: 43px;
    margin: 0;
    padding: 0 16px 10px;
  }

  .app-startup-shell__chip {
    width: 50px;
    height: 33px;
    border-radius: 15px;
  }

  .app-startup-shell__chip:nth-child(2) {
    width: 60px;
  }

  .app-startup-shell__chip:nth-child(3) {
    width: 78px;
  }

  .app-startup-shell__chip:nth-child(4) {
    width: 62px;
  }

  .app-startup-shell__row {
    grid-template-columns: 60px minmax(0, 1fr);
    column-gap: 10px;
    height: 82px;
    padding: 0 16px;
  }

  .app-startup-shell__row > div:last-child {
    display: grid;
    align-content: center;
    height: 100%;
    border-bottom: 1px solid #f5f7fb;
    box-sizing: border-box;
  }

  .app-startup-shell__avatar {
    width: 60px;
    height: 60px;
  }

  .app-startup-shell__line {
    height: 20px;
    margin-bottom: 12px;
  }

  .app-startup-shell__subline {
    width: 92%;
    height: 18px;
  }

  .app-startup-shell__navigation {
    height: calc(58px + env(safe-area-inset-bottom, 0px));
    margin: 0;
    padding: 10px 18px calc(10px + env(safe-area-inset-bottom, 0px));
  }
}

@keyframes app-startup-pulse {
  0% {
    background-position: 100% 0;
  }

  100% {
    background-position: -80% 0;
  }
}
</style>
