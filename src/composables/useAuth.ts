import type { User } from '@pksep/zod-shared-chat';
import { ref, Ref } from 'vue';
import { setAuthToken } from './useLogin';
import { getConfig } from '../services/useConfig';

export const authedUser: Ref<User | null> = ref(null);
export const CHAT_AUTH_SESSION_KEY = 'chat_auth_session';
export const ERP_BOOTSTRAP_TOKEN_KEY = 'erp_bootstrap_token';

interface AuthResponse {
  token: string;
  user?: User;
  erpToken?: string;
  refreshToken?: string;
}

interface DirectAuthCredentials {
  identifier: string;
  password: string;
}

interface StoredChatAuthSession {
  token: string;
  refreshToken?: string;
  user?: User;
}

interface StoredBootstrapErpSession {
  accessToken: string;
}

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

  const token = data.token;
  const user = data.user;

  if (token) {
    setAuthToken(token, data.expireTimeSeconds || 0);
  }

  return {
    token,
    user,
    erpToken: data.erpToken ?? data.accessToken,
    refreshToken: data.refreshToken
  };
};

export const loginWithCredentials = async (
  credentials: DirectAuthCredentials
): Promise<AuthResponse> => {
  const config = getConfig();
  const response = await fetch(
    `${config.CHAT_AUTH_API}/chat/credentials-login`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(credentials)
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Credentials login failed');
  }

  if (data.token) {
    setAuthToken(data.token);
  }

  return {
    token: data.token,
    user: data.user,
    erpToken: data.erpToken ?? data.accessToken,
    refreshToken: data.refreshToken
  };
};

export const refreshErpSession = async (
  refreshToken: string
): Promise<AuthResponse> => {
  const config = getConfig();
  const response = await fetch(`${config.CHAT_AUTH_API}/chat/refresh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ refreshToken })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'ERP refresh failed');
  }

  if (data.token) {
    setAuthToken(data.token, data.expireTimeSeconds || 0);
  }

  return {
    token: data.token,
    user: data.user,
    erpToken: data.erpToken ?? data.accessToken,
    refreshToken: data.refreshToken ?? refreshToken
  };
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

export const getStoredChatRefreshToken = (): string | null => {
  return getChatAuthSession()?.refreshToken || null;
};

export const isStoredChatSessionPersistent = (): boolean => {
  return (
    !!localStorage.getItem(CHAT_AUTH_SESSION_KEY) ||
    !!localStorage.getItem(ERP_BOOTSTRAP_TOKEN_KEY)
  );
};

export const clearChatAuthSession = (): void => {
  localStorage.removeItem(CHAT_AUTH_SESSION_KEY);
  sessionStorage.removeItem(CHAT_AUTH_SESSION_KEY);
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

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes('401') ||
    message.includes('403') ||
    message.includes('unauthorized') ||
    message.includes('forbidden') ||
    message.includes('jwt expired')
  );
};

let erpRefreshPromise: Promise<AuthResponse | null> | null = null;

export const tryRefreshErpSession = async (): Promise<AuthResponse | null> => {
  const refreshToken = getStoredChatRefreshToken();

  if (!refreshToken) {
    return null;
  }

  if (erpRefreshPromise) {
    return erpRefreshPromise;
  }

  erpRefreshPromise = (async () => {
    try {
      const refreshed = await refreshErpSession(refreshToken);

      if (refreshed.token) {
        const storedChatSession = getChatAuthSession();

        saveChatAuthSession(
          {
            token: refreshed.token,
            refreshToken: refreshed.refreshToken,
            user: refreshed.user ?? storedChatSession?.user
          },
          isStoredChatSessionPersistent()
        );
      }

      if (refreshed.erpToken) {
        saveBootstrapErpSession(
          {
            accessToken: refreshed.erpToken
          },
          isStoredChatSessionPersistent()
        );
      }

      return refreshed;
    } catch (error) {
      console.error('Failed to refresh ERP session after auth error:', error);
      clearErpAuthSession();
      return null;
    } finally {
      erpRefreshPromise = null;
    }
  })();

  return erpRefreshPromise;
};

export const withErpRefreshOnAuthError = async <T>(
  operation: () => Promise<T>
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (!isAuthError(error)) {
      throw error;
    }

    const refreshed = await tryRefreshErpSession();

    if (!refreshed?.token) {
      throw error;
    }

    return operation();
  }
};

export const fetchAuthUser = async (): Promise<User | null> => {
  return authedUser.value;
};

export const setAuthUser = (user: User | null) => {
  authedUser.value = user;
};

export const getAuthUser = () => authedUser.value;
