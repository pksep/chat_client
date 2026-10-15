import type {
  IChatContainerConfig,
  IUser
} from '../components/interfaces/interfaces';
import { ref, Ref } from 'vue';
import { setAuthToken, useLogout } from './useLogin';
import { getConfig } from '../services/useConfig';
import { configureCustomBackgroundSync } from '../services/useCustomBackgroundSync';
import {
  CHAT_AUTH_SESSION_KEY,
  getChatAuthSession,
  type StoredChatAuthSession
} from '../utils/stored-chat-session';
import { buildGroupCallInviteAuthorizationUrl } from '../utils/groupCallInviteUrl';
import { withNetworkTimeout } from '../utils/network-timeout';
export {
  CHAT_AUTH_SESSION_KEY,
  getChatAuthSession
} from '../utils/stored-chat-session';

type AuthUser = IUser;

export const authedUser: Ref<AuthUser | null> = ref(null);
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

interface StoredBootstrapErpSession {
  accessToken: string;
}

const getAccessTokenFromResponse = (data: Record<string, unknown>): string => {
  const sharedAccessTokenCandidate = data.erpToken;
  if (
    typeof sharedAccessTokenCandidate === 'string' &&
    sharedAccessTokenCandidate
  ) {
    return sharedAccessTokenCandidate;
  }

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

const getCredentialsLoginUrl = (config: IChatContainerConfig): string => {
  const chatApi = config.CHAT_API_DOMAIN?.trim();

  if (chatApi) {
    return `${chatApi.replace(/\/+$/, '')}/auth/credentials-login`;
  }

  throw new Error('Chat API is not configured');
};

export const useAuth = async (erpToken: string): Promise<AuthResponse> => {
  const config = getConfig();
  return withNetworkTimeout(async signal => {
    const response = await fetch(`${config.CHAT_API_DOMAIN}/auth/session`, {
      method: 'GET',
      signal,
      headers: {
        Authorization: `Bearer ${erpToken}`
      }
    });
    const data = await response.json();

    if (!response.ok) {
      throw Object.assign(new Error(data?.error || 'ERP token login failed'), {
        status: response.status
      });
    }

    // Ответ, пришедший после таймаута, не должен менять выбранную сессию.
    if (signal.aborted) {
      throw new DOMException('Сервер не ответил вовремя', 'TimeoutError');
    }
    return normalizeAuthResponse({
      token: erpToken,
      accessToken: erpToken,
      erpToken,
      user: data
    });
  });
};

export const loginWithCredentials = async (
  credentials: DirectAuthCredentials
): Promise<AuthResponse> => {
  const config = getConfig();
  const response = await fetch(getCredentialsLoginUrl(config), {
    method: 'POST',
    credentials: 'include',
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

  return { ...authResponse, erpToken: undefined };
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
  const authorizationUrl = buildGroupCallInviteAuthorizationUrl(
    window.location.href
  );
  clearErpAuthSession();
  useLogout();
  authedUser.value = null;
  skipStartupShellOnNextAuthScreen();
  window.location.replace(authorizationUrl);
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
    data?: { status?: number };
    response?: { status?: number };
    cause?: {
      status?: number;
      data?: { status?: number };
      response?: { status?: number };
    };
  };

  return (
    candidate.status ??
    candidate.data?.status ??
    candidate.response?.status ??
    candidate.cause?.status ??
    candidate.cause?.data?.status ??
    candidate.cause?.response?.status ??
    null
  );
};

export const isAuthError = (error: unknown): boolean => {
  const status = getAuthErrorStatus(error);

  if (status === 401) {
    return true;
  }

  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  return (
    message.includes('401') ||
    message.includes('unauthorized') ||
    message.includes('jwt expired')
  );
};

let sessionRefreshPromise: Promise<AuthResponse | null> | null = null;

export const tryRefreshErpSession = (): Promise<AuthResponse | null> => {
  if (sessionRefreshPromise) {
    return sessionRefreshPromise;
  }

  sessionRefreshPromise = refreshErpSession().finally(() => {
    sessionRefreshPromise = null;
  });

  return sessionRefreshPromise;
};

export const logoutChatSession = async (): Promise<void> => {
  const config = getConfig();

  try {
    await fetch(`${config.CHAT_API_DOMAIN.replace(/\/+$/, '')}/auth/logout`, {
      method: 'POST',
      credentials: 'include'
    });
  } catch (error) {
    console.warn('Не удалось очистить refresh-сессию чата:', error);
  }
};

const refreshErpSession = async (): Promise<AuthResponse | null> => {
  const config = getConfig();

  try {
    const response = await fetch(
      `${config.CHAT_API_DOMAIN.replace(/\/+$/, '')}/auth/refresh`,
      {
        method: 'POST',
        credentials: 'include'
      }
    );

    if (response.status === 401) {
      return null;
    }

    const data = await response.json();

    if (!response.ok) {
      throw Object.assign(
        new Error(data?.message || 'Сервис авторизации временно недоступен'),
        { status: response.status }
      );
    }

    return normalizeAuthResponse(data);
  } catch (error) {
    if (isAuthError(error)) {
      return null;
    }

    throw error;
  }
};

export const withErpRefreshOnAuthError = async <T>(
  operation: () => Promise<T>
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (isAuthError(error)) {
      const refreshed = await tryRefreshErpSession();

      if (refreshed?.token) {
        return operation();
      }

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
