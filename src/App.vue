<template>
  <ChatContainerRoot v-if="config && !isCredentialsStep" :config="config" />

  <Loading
    v-else-if="isBootstrapping"
    data-testid="App-Bootstrap"
    :message="''"
  />

  <AuthorizationScreen
    v-else
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
    @select-organization="selectOrganization"
    @add-organization="startAddOrganization"
    @remove-organization="removeOrganization"
    @submit="loadRemoteConfig"
    @submit-credentials="submitCredentialsLogin"
    @back="returnToOrganizationStep"
    @qr-auth-success="handleQrAuthSuccess"
  />

  <IosInstallPromptModal
    :open="isIosInstallPromptOpen"
    data-testid="App"
    @close="closeIosInstallHelp"
  />

  <PushNotification
    v-for="(notification, index) in notificationState.items"
    :key="notification.key"
    class="app-notification-stack__item"
    :style="getNotificationStyle(index)"
    :title="notification.title"
    :push-key="notification.key"
    :description="notification.description"
    :type="notification.type"
    @close="closeNotification(notification.key)"
  />
</template>
<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { PushNotification } from '@pksep/yui';
import { IChatContainerConfig } from './components/interfaces/interfaces';
import ChatContainerRoot from './ChatContainerRoot.vue';
import AuthorizationScreen from './components/AuthorizationScreen.vue';
import Loading from './components/Loading.vue';
import IosInstallPromptModal from './components/Menu/IosInstallPromptModal.vue';
import { useIosInstallPrompt } from './composables/useIosInstallPrompt';
import { areChatConfigsEqual, setConfig } from './services/useConfig';
import {
  clearErpAuthSession,
  getChatAuthSession,
  getStoredBootstrapErpAccessToken,
  loginWithCredentials,
  saveBootstrapErpSession,
  saveChatAuthSession,
  clearChatAuthSession
} from './composables/useAuth';
import { fetchUsersForAuth } from './composables/useUsers';
import { useNotifications } from './composables/useNotifications';
import { initShareIntentHandling } from './services/useShareIntent';

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

const config = ref<IChatContainerConfig | null>(null);
const errorMessage = ref('');
const isLoading = ref(false);
const isBootstrapping = ref(true);
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
const { state: notificationState, closeNotification } = useNotifications();
const {
  isOpen: isIosInstallPromptOpen,
  closeInstallHelp: closeIosInstallHelp
} = useIosInstallPrompt();

const getNotificationStyle = (index: number) => ({
  position: 'fixed',
  top: `${16 + index * 88}px`,
  right: '16px',
  left: 'auto',
  bottom: 'auto',
  margin: '0',
  zIndex: `${3000 - index}`
});

const finishBootstrapping = () => {
  isBootstrapping.value = false;
};

const parseRuntimeConfig = (
  rawConfig: string
): Partial<IChatContainerConfig> => {
  const botGatewayOverride = import.meta.env.VITE_BOT_GATEWAY_URL?.trim();
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
    CHAT_AUTH_API: envMap.VITE_AUTH_API,
    CHAT_MASTRA_URL: envMap.VITE_MASTRA_URL,
    CHAT_API_DOMAIN: envMap.VITE_CHAT_API_DOMAIN,
    CHAT_WS_DOMAIN: envMap.VITE_CHAT_WS_DOMAIN,
    CHAT_ERP_URL: envMap.VITE_ERP_URL,
    CHAT_PATH_TO_FILE_CDN: envMap.VITE_PATH_TO_FILE_CDN,
    CHAT_LIVEKIT_URL: envMap.VITE_LIVEKIT_URL,
    CHAT_BOT_GATEWAY: botGatewayOverride || envMap.VITE_BOT_GATEWAY_URL
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
    void loadRemoteConfig({
      url: normalizedUrl,
      fallbackConfig: organization.config
    });
    return;
  }

  applyConfig(organization.config);
  openCredentialsStepIfNeeded();
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
    const response = await fetch(getRuntimeConfigUrl(normalizedUrl));

    if (!response.ok) {
      throw new Error(`Failed to load runtime config: ${response.status}`);
    }

    const runtimeConfig = parseRuntimeConfig(await response.text());
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
      clearChatAuthSession();
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
    const authData = await loginWithCredentials({
      identifier: identifierValue.value.trim(),
      password: passwordValue.value.trim()
    });

    if (!authData.token) {
      throw new Error('Chat token missing in credentials response');
    }

    saveChatAuthSession(
      {
        token: authData.token,
        user: authData.user
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
          await loadRemoteConfig({
            url: urlOrganization,
            fallbackConfig: storedOrganization.config
          });
          return;
        }

        applyConfig(storedOrganization.config);
        openCredentialsStepIfNeeded();
        void loadRemoteConfig({
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
        await loadRemoteConfig({
          url: normalizedLastOrganization,
          fallbackConfig: lastOrganization.config
        });
        return;
      }

      applyConfig(lastOrganization.config);
      openCredentialsStepIfNeeded();
      void loadRemoteConfig({
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
</script>

<style scoped>
.app-notification-stack__item {
  pointer-events: auto;
}
</style>
