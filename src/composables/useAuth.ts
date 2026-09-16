import type {
  IChatContainerConfig,
  IUser
} from '../components/interfaces/interfaces';
import { ref, Ref } from 'vue';
import { setAuthToken } from './useLogin';
import { getConfig } from '../services/useConfig';
import { configureCustomBackgroundSync } from '../services/useCustomBackgroundSync';

type AuthUser = IUser;

export const authedUser: Ref<AuthUser | null> = ref(null);
export const CHAT_AUTH_SESSION_KEY = 'chat_auth_session';
export const ERP_BOOTSTRAP_TOKEN_KEY = 'erp_bootstrap_token';
const SKIP_STARTUP_SHELL_ON_AUTH_REDIRECT_KEY =
  'chat_skip_startup_shell_on_auth_redirect';

interface AuthResponse {
  token: string;
  accessToken?: string;
  user?: AuthUser;
  erpToken?: string;
  expireTimeSeconds?: number;
}

interface DirectAuthCredentials {
  identifier: string;
  password: string;
}

interface StoredChatAuthSession {
  token: string;
  user?: AuthUser;
}

interface StoredBootstrapErpSession {
  accessToken: string;
}

const getAccessTokenFromResponse = (data: Record<string, unknown>): string => {
  const accessTokenCandidate = data.accessToken;
  if (typeof accessTokenCandidate === 'string' && accessTokenCandidate) {
    return accessTokenCandidate;
  }

  const tokenCandidate = data.token;
  if (typeof tokenCandidate === 'string' && tokenCandidate) {
    return tokenCandidate;
  }

  return '';
};

const normalizeAuthResponse = (data: Record<string, unknown>): AuthResponse => {
  const accessToken = getAccessTokenFromResponse(data);
  const expireTimeSeconds =
    typeof data.expireTimeSeconds === 'number' ? data.expireTimeSeconds : 0;

  if (accessToken) {
    setAuthToken(accessToken, expireTimeSeconds);
  }

  const explicitErpToken =
    typeof data.erpToken === 'string' ? data.erpToken : undefined;
  const legacyErpTokenCandidate =
    typeof data.accessToken === 'string' ? data.accessToken : undefined;
  const erpToken =
    explicitErpToken ||
    (typeof data.token === 'string' &&
    legacyErpTokenCandidate &&
    legacyErpTokenCandidate !== accessToken
      ? legacyErpTokenCandidate
      : undefined);

  return {
    token: accessToken,
    accessToken,
    user: data.user as AuthUser | undefined,
    erpToken,
    expireTimeSeconds
  };
};

const isLoopbackUrl = (value?: string): boolean => {
  const url = value?.trim();

  if (!url) {
    return false;
  }

  try {
    const hostname = new URL(url).hostname;

    return ['localhost', '127.0.0.1', '[::1]', '::1'].includes(hostname);
  } catch {
    return false;
  }
};

const getCredentialsLoginUrl = (config: IChatContainerConfig): string => {
  const chatApi = config.CHAT_API_DOMAIN?.trim();

  if (chatApi && isLoopbackUrl(chatApi)) {
    return `${chatApi.replace(/\/+$/, '')}/auth/credentials-login`;
  }

  const authApi = config.CHAT_AUTH_API?.trim();

  if (!authApi) {
    throw new Error('Chat auth API is not configured');
  }

  return `${authApi.replace(/\/+$/, '')}/chat/credentials-login`;
};

export const useAuth = async (erpToken: string): Promise<AuthResponse> => {
  const config = getConfig();
  const response = await fetch(`${config.CHAT_AUTH_API}/chat/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ erpToken })
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || 'ERP token login failed');
  }

  return normalizeAuthResponse(data);
};

export const loginWithCredentials = async (
  credentials: DirectAuthCredentials
): Promise<AuthResponse> => {
  const config = getConfig();
  const response = await fetch(getCredentialsLoginUrl(config), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(credentials)
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Credentials login failed');
  }

  const authResponse = normalizeAuthResponse(data);

  return isLoopbackUrl(config.CHAT_API_DOMAIN)
    ? { ...authResponse, erpToken: undefined }
    : authResponse;
};

export const saveChatAuthSession = (
  session: StoredChatAuthSession,
  persist = true
): void => {
  const storage = persist ? localStorage : sessionStorage;
  const secondaryStorage = persist ? sessionStorage : localStorage;

  secondaryStorage.removeItem(CHAT_AUTH_SESSION_KEY);
  storage.setItem(CHAT_AUTH_SESSION_KEY, JSON.stringify(session));
};

export const getChatAuthSession = (): StoredChatAuthSession | null => {
  const raw =
    localStorage.getItem(CHAT_AUTH_SESSION_KEY) ||
    sessionStorage.getItem(CHAT_AUTH_SESSION_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as StoredChatAuthSession;
  } catch (error) {
    console.error('Failed to parse chat auth session', error);
    return null;
  }
};

export const getStoredChatAccessToken = (): string | null => {
  return getChatAuthSession()?.token || null;
};

export const isStoredChatSessionPersistent = (): boolean => {
  return (
    !!localStorage.getItem(CHAT_AUTH_SESSION_KEY) ||
    !!localStorage.getItem(ERP_BOOTSTRAP_TOKEN_KEY)
  );
};

export const clearChatAuthSession = (): void => {
  configureCustomBackgroundSync(null);
  localStorage.removeItem(CHAT_AUTH_SESSION_KEY);
  sessionStorage.removeItem(CHAT_AUTH_SESSION_KEY);
  void import('../services/useChatBackgroundSync')
    .then(({ clearAnyChatBackgroundSyncSession }) =>
      clearAnyChatBackgroundSyncSession()
    )
    .catch(error => {
      console.warn('Failed to clear chat background sync session:', error);
    });
};

export const saveBootstrapErpSession = (
  session: StoredBootstrapErpSession,
  persist = true
): void => {
  const storage = persist ? localStorage : sessionStorage;
  const secondaryStorage = persist ? sessionStorage : localStorage;

  secondaryStorage.removeItem(ERP_BOOTSTRAP_TOKEN_KEY);
  storage.setItem(ERP_BOOTSTRAP_TOKEN_KEY, session.accessToken);
};

export const getStoredBootstrapErpAccessToken = (): string | null => {
  return (
    localStorage.getItem(ERP_BOOTSTRAP_TOKEN_KEY) ||
    sessionStorage.getItem(ERP_BOOTSTRAP_TOKEN_KEY)
  );
};

export const clearBootstrapErpSession = (): void => {
  localStorage.removeItem(ERP_BOOTSTRAP_TOKEN_KEY);
  sessionStorage.removeItem(ERP_BOOTSTRAP_TOKEN_KEY);
};

export const clearErpAuthSession = (): void => {
  clearChatAuthSession();
  localStorage.removeItem(ERP_BOOTSTRAP_TOKEN_KEY);
  sessionStorage.removeItem(ERP_BOOTSTRAP_TOKEN_KEY);
};

const skipStartupShellOnNextAuthScreen = (): void => {
  try {
    sessionStorage.setItem(SKIP_STARTUP_SHELL_ON_AUTH_REDIRECT_KEY, '1');
  } catch (error) {
    console.warn('Failed to store auth redirect startup flag:', error);
  }
};

export const consumeAuthRedirectStartupShellSkip = (): boolean => {
  try {
    const shouldSkip =
      sessionStorage.getItem(SKIP_STARTUP_SHELL_ON_AUTH_REDIRECT_KEY) === '1';

    if (shouldSkip) {
      sessionStorage.removeItem(SKIP_STARTUP_SHELL_ON_AUTH_REDIRECT_KEY);
    }

    return shouldSkip;
  } catch (error) {
    console.warn('Failed to read auth redirect startup flag:', error);
    return false;
  }
};

export const redirectToAuthorization = (): void => {
  clearErpAuthSession();
  authedUser.value = null;
  skipStartupShellOnNextAuthScreen();
  window.location.replace(window.location.origin);
};

export const ensureAuthorizedResponse = (response: Response): Response => {
  if (response.status === 401) {
    redirectToAuthorization();
  }

  return response;
};

export const fetchWithAuthRedirect = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const response = await fetch(input, init);
  return ensureAuthorizedResponse(response);
};

const getAuthErrorStatus = (error: unknown): number | null => {
  if (typeof error !== 'object' || !error) {
    return null;
  }

  const candidate = error as {
    status?: number;
    response?: { status?: number };
    cause?: { status?: number; response?: { status?: number } };
  };

  return (
    candidate.status ??
    candidate.response?.status ??
    candidate.cause?.status ??
    candidate.cause?.response?.status ??
    null
  );
};

export const isAuthError = (error: unknown): boolean => {
  const status = getAuthErrorStatus(error);

  if (status === 401 || status === 403) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  return (
    message.includes('401') ||
    message.includes('403') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('jwt expired')
  );
};

export const tryRefreshErpSession = async (): Promise<AuthResponse | null> => {
  return null;
};

export const withErpRefreshOnAuthError = async <T>(
  operation: () => Promise<T>
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (isAuthError(error)) {
      redirectToAuthorization();
    }

    throw error;
  }
};

export const fetchAuthUser = async (): Promise<AuthUser | null> => {
  return authedUser.value;
};

export const setAuthUser = (user: AuthUser | null) => {
  if (!user || (authedUser.value?.id && authedUser.value.id !== user.id)) {
    configureCustomBackgroundSync(null);
  }
  authedUser.value = user;
};

export const getAuthUser = () => authedUser.value;

const updateStoredChatSessionUser = (user: AuthUser | null): void => {
  const localSessionRaw = localStorage.getItem(CHAT_AUTH_SESSION_KEY);
  const sessionStorageRaw = sessionStorage.getItem(CHAT_AUTH_SESSION_KEY);
  const storage = localSessionRaw
    ? localStorage
    : sessionStorageRaw
      ? sessionStorage
      : null;

  if (!storage) {
    return;
  }

  try {
    const rawSession = storage.getItem(CHAT_AUTH_SESSION_KEY);

    if (!rawSession) {
      return;
    }

    const parsedSession = JSON.parse(rawSession) as StoredChatAuthSession;
    storage.setItem(
      CHAT_AUTH_SESSION_KEY,
      JSON.stringify({
        ...parsedSession,
        user: user || undefined
      })
    );
  } catch (error) {
    console.error('Failed to update chat auth session user', error);
  }
};

export const mergeAuthUser = (
  patch: Partial<AuthUser> | null | undefined
): void => {
  if (!authedUser.value || !patch) {
    return;
  }

  const nextUser = {
    ...authedUser.value,
    ...patch
  } as AuthUser;

  authedUser.value = nextUser;
  updateStoredChatSessionUser(nextUser);
};
