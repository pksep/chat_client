<template>
  <ChatContainer v-if="config && !isCredentialsStep" :config="config" />

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
</template>
<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { IChatContainerConfig } from './components/interfaces/interfaces';
import ChatContainer from './ChatContainerRoot.vue';
import AuthorizationScreen from './components/AuthorizationScreen.vue';
import { setConfig } from './services/useConfig';
import {
  CHAT_AUTH_SESSION_KEY,
  loginWithCredentials
} from './composables/useAuth';

const ORGANIZATIONS_KEY = 'chat_runtime_organizations';
const LAST_ORGANIZATION_KEY = 'chat_runtime_last_organization';

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
    CHAT_AUTH_API: envMap.VITE_AUTH_API,
    CHAT_MASTRA_URL: envMap.VITE_MASTRA_URL,
    CHAT_API_DOMAIN: envMap.VITE_CHAT_API_DOMAIN,
    CHAT_WS_DOMAIN: envMap.VITE_CHAT_WS_DOMAIN,
    CHAT_ERP_URL: envMap.VITE_ERP_URL,
    CHAT_PATH_TO_FILE_CDN: envMap.VITE_PATH_TO_FILE_CDN,
    CHAT_LIVEKIT_URL: envMap.VITE_LIVEKIT_URL
  };
};

const normalizeServerUrl = (value: string) => value.trim().replace(/\/+$/, '');

const getRuntimeConfigUrl = (baseUrl: string) =>
  `${normalizeServerUrl(baseUrl)}/config`;

const applyConfig = (resolvedConfig: IChatContainerConfig) => {
  config.value = resolvedConfig;
  setConfig(resolvedConfig);
};

const getStoredErpToken = () =>
  localStorage.getItem('erp_token') || sessionStorage.getItem('erp_token');

const getUrlErpToken = () => {
  const url = new URL(window.location.href);

  return url.searchParams.get('token')?.split('?token')[0] || '';
};

const getUrlOrganization = () => {
  const url = new URL(window.location.href);
  const organization = url.searchParams.get('organization') || '';

  return organization ? normalizeServerUrl(organization) : '';
};

const saveErpToken = (token: string, persist: boolean) => {
  const storage = persist ? localStorage : sessionStorage;
  const secondaryStorage = persist ? sessionStorage : localStorage;

  secondaryStorage.removeItem('erp_token');
  storage.setItem('erp_token', token);
};

const hasLocalErpToken = () => !!getStoredErpToken();
const hasDirectChatSession = () =>
  !!localStorage.getItem(CHAT_AUTH_SESSION_KEY);

const openCredentialsStepIfNeeded = () => {
  if (hasLocalErpToken() || hasDirectChatSession()) {
    isCredentialsStep.value = false;
    return;
  }

  isCredentialsStep.value = true;
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

const getOrganizationByUrl = (url: string) =>
  organizations.value.find(item => item.url === url);

const upsertOrganization = (url: string, nextConfig: IChatContainerConfig) => {
  const nextOrganizations = [
    {
      url,
      config: nextConfig
    },
    ...organizations.value.filter(item => item.url !== url)
  ];

  saveOrganizations(nextOrganizations);
};

const selectOrganization = (url: string) => {
  const organization = getOrganizationByUrl(url);

  if (!organization) {
    return;
  }

  setLastOrganization(url);
  serverUrl.value = url;
  isAddingNewOrganization.value = false;
  applyConfig(organization.config);
  openCredentialsStepIfNeeded();
  void loadRemoteConfig({
    url,
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

  localStorage.setItem('erp_token', payload.token);
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
  const nextOrganizations = organizations.value.filter(
    item => item.url !== url
  );

  saveOrganizations(nextOrganizations);

  if (selectedOrganization.value === url) {
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

    if (!authData.erpToken) {
      throw new Error('ERP token missing in credentials response');
    }

    saveErpToken(authData.erpToken, rememberAccount.value);

    if (!rememberAccount.value) {
      identifierValue.value = '';
    }

    isCredentialsStep.value = false;
  } catch (error) {
    console.error(error);
    localStorage.removeItem('erp_token');
    sessionStorage.removeItem('erp_token');
    errorMessage.value = 'Не удалось войти по логину.';
  } finally {
    isLoading.value = false;
  }
};

onMounted(() => {
  localStorage.removeItem('chat_runtime_config_url');

  const urlErpToken = getUrlErpToken();
  const urlOrganization = getUrlOrganization();

  if (urlErpToken) {
    localStorage.setItem('erp_token', urlErpToken);
  }

  if (urlOrganization) {
    const storedOrganization = organizations.value.find(
      item => normalizeServerUrl(item.url) === urlOrganization
    );

    serverUrl.value = urlOrganization;
    isAddingNewOrganization.value = false;

    if (storedOrganization) {
      applyConfig(storedOrganization.config);
      openCredentialsStepIfNeeded();
      void loadRemoteConfig({
        url: urlOrganization,
        fallbackConfig: storedOrganization.config
      });
      return;
    }

    void loadRemoteConfig({
      url: urlOrganization
    });
    return;
  }

  const lastOrganization = organizations.value.find(
    item => item.url === selectedOrganization.value
  );

  if (lastOrganization) {
    serverUrl.value = lastOrganization.url;
    isAddingNewOrganization.value = false;
    applyConfig(lastOrganization.config);
    openCredentialsStepIfNeeded();
    void loadRemoteConfig({
      url: lastOrganization.url,
      fallbackConfig: lastOrganization.config
    });
    return;
  }

  clearLastOrganization();

  if (!organizations.value.length) {
    startAddOrganization();
  }
});
</script>
