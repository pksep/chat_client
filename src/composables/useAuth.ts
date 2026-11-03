import type {
  IChatContainerConfig,
  IUser
} from '../components/interfaces/interfaces';
import { ref, Ref } from 'vue';
import { getAuthToken, setAuthToken, useLogout } from './useLogin';
import { getConfig } from '../services/useConfig';
import { configureCustomBackgroundSync } from '../services/useCustomBackgroundSync';
import {
  CHAT_AUTH_SESSION_KEY,
  getChatAuthSession,
  type ChatAuthSessionSource,
  type StoredChatAuthSession
} from '../utils/stored-chat-session';
import { buildGroupCallInviteAuthorizationUrl } from '../utils/groupCallInviteUrl';
import { withNetworkTimeout } from '../utils/network-timeout';
import { fetchAuthWithCookies } from '../utils/auth-http';
import { getAccessTokenFromResponse } from '../utils/auth-response-token';
import {
  recordTelemetryEvent,
  flushTelemetryEvents,
  createTelemetryTraceId
} from '../services/useTelemetry';
export {
  CHAT_AUTH_SESSION_KEY,
  getChatAuthSession
} from '../utils/stored-chat-session';

type AuthUser = IUser;

export const authedUser: Ref<AuthUser | null> = ref(null);
const preserveAuthAvatar = (
  user: AuthUser,
  previousUser: AuthUser | null | undefined = authedUser.value
): AuthUser =>
  user.id === previousUser?.id && user.avatarUrl === undefined
    ? { ...user, avatarUrl: previousUser.avatarUrl }
    : user;
export const ERP_BOOTSTRAP_TOKEN_KEY = 'erp_bootstrap_token';
const QR_BOOTSTRAP_SOURCE_KEY = 'chat_qr_bootstrap_source';
const SKIP_STARTUP_SHELL_ON_AUTH_REDIRECT_KEY =
  'chat_skip_startup_shell_on_auth_redirect';
const AUTH_REFRESH_LOCK_NAME = 'chat_auth_refresh';
const AUTH_REFRESH_CHANNEL_NAME = 'chat_auth_refresh_events';

let authSessionRevision = 0;
let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshBroadcastChannel: BroadcastChannel | null = null;
let sessionEndingPromise: Promise<void> | null = null;
let isEndingSession = false;

export interface AuthResponse {
  token: string;
  accessToken?: string;
  user?: AuthUser;
  erpToken?: string;
  expireTimeSeconds?: number;
  source?: ChatAuthSessionSource;
}

interface JwtTiming {
  exp?: number;
  iat?: number;
}

interface AuthHttpError extends Error {
  status: number;
  code?: string;
}

interface AuthErrorBody {
  message?: string | string[];
  error?: string;
  code?: string;
}

type AuthRefreshBroadcastMessage =
  | {
      type: 'refreshed';
      token: string;
      user?: AuthUser;
      source: ChatAuthSessionSource;
      expireTimeSeconds: number;
    }
  | { type: 'cleared'; userId?: string };

interface DirectAuthCredentials {
  identifier: string;
  password: string;
}

interface StoredBootstrapErpSession {
  accessToken: string;
  source?: 'qr';
}

const decodeJwtPart = <T>(token: string, index: number): T | null => {
  try {
    const part = token.split('.')[index];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(atob(`${normalized}${padding}`)) as T;
  } catch {
    return null;
  }
};

export const isSharedAccessToken = (token: string): boolean => {
  const header = decodeJwtPart<{ alg?: unknown; kid?: unknown }>(token, 0);
  return header?.alg === 'RS256' && typeof header.kid === 'string';
};

const getTokenTiming = (token: string): JwtTiming => {
  return decodeJwtPart<JwtTiming>(token, 1) || {};
};

export const isChatAccessTokenExpired = (
  token: string,
  minValidityMs = 0
): boolean => {
  const { exp } = getTokenTiming(token);
  return typeof exp === 'number' && exp * 1000 <= Date.now() + minValidityMs;
};

export const isChatSessionEnding = (): boolean => isEndingSession;

const getTokenExpiresInSeconds = (token: string): number => {
  const { exp } = getTokenTiming(token);
  return typeof exp === 'number'
    ? Math.max(1, Math.floor(exp - Date.now() / 1000))
    : 0;
};

const inferSessionSource = (
  session: StoredChatAuthSession | null
): ChatAuthSessionSource => {
  if (session?.source) return session.source;
  return session?.token && isSharedAccessToken(session.token)
    ? 'unknown_shared'
    : 'legacy';
};

const normalizeAuthResponse = (
  data: Record<string, unknown>,
  applyToken = true
): AuthResponse => {
  const accessToken = getAccessTokenFromResponse(data);
  const expireTimeSeconds =
    typeof data.expireTimeSeconds === 'number' ? data.expireTimeSeconds : 0;

  if (accessToken && applyToken) {
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
    expireTimeSeconds,
    source: data.source as ChatAuthSessionSource | undefined
  };
};

const getCredentialsLoginUrl = (config: IChatContainerConfig): string => {
  const chatApi = config.CHAT_API_DOMAIN?.trim();

  if (chatApi) {
    return `${chatApi.replace(/\/+$/, '')}/auth/credentials-login`;
  }

  throw new Error('Chat API is not configured');
};

const getRefreshBroadcastChannel = (): BroadcastChannel | null => {
  if (typeof BroadcastChannel === 'undefined') return null;

  if (!refreshBroadcastChannel) {
    refreshBroadcastChannel = new BroadcastChannel(AUTH_REFRESH_CHANNEL_NAME);
    refreshBroadcastChannel.addEventListener('message', event => {
      void handleAuthRefreshBroadcast(
        event.data as AuthRefreshBroadcastMessage
      );
    });
  }

  return refreshBroadcastChannel;
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
      user: data,
      expireTimeSeconds: getTokenExpiresInSeconds(erpToken),
      source: 'erp_bootstrap'
    });
  });
};

/** Получает собственную сессию устройства; refresh компьютера остаётся на компьютере. */
export const loginWithQrToken = async (
  token: string
): Promise<AuthResponse> => {
  if (!isSharedAccessToken(token)) return useAuth(token);

  const apiUrl = getConfig().CHAT_API_DOMAIN?.trim().replace(/\/+$/, '');
  if (!apiUrl) throw new Error('Не настроен адрес сервера чата');

  const response = await fetchAuthWithCookies(
    `${apiUrl}/auth/qr-login`,
    'POST',
    {},
    { Authorization: `Bearer ${token}` }
  );
  const data = await readAuthErrorBody(response);
  if (!response.ok) {
    throw createAuthHttpError(
      response.status,
      getAuthErrorMessage(data, 'Не удалось создать сессию QR-входа'),
      data.code
    );
  }

  const session = normalizeAuthResponse(
    { ...(data as Record<string, unknown>), source: 'chat_qr' },
    false
  );
  if (
    !session.token ||
    !isSharedAccessToken(session.token) ||
    isChatAccessTokenExpired(session.token) ||
    !session.user?.id
  ) {
    throw createAuthHttpError(
      503,
      'Сервер вернул некорректную сессию QR-входа',
      'AUTH_UNAVAILABLE'
    );
  }
  return { ...session, erpToken: undefined };
};

export const loginWithCredentials = async (
  credentials: DirectAuthCredentials
): Promise<AuthResponse> => {
  const config = getConfig();
  const response = await fetchAuthWithCookies(
    getCredentialsLoginUrl(config),
    'POST',
    { ...credentials }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.message || data?.error || 'Credentials login failed');
  }

  const authResponse = normalizeAuthResponse({
    ...data,
    source: isSharedAccessToken(getAccessTokenFromResponse(data))
      ? 'chat_credentials'
      : 'legacy'
  });

  return { ...authResponse, erpToken: undefined };
};

export const saveChatAuthSession = (
  session: StoredChatAuthSession,
  persist = true
): void => {
  const normalizedSession: StoredChatAuthSession = {
    ...session,
    source: session.source || inferSessionSource(session)
  };
  const storage = persist ? localStorage : sessionStorage;
  const secondaryStorage = persist ? sessionStorage : localStorage;

  authSessionRevision++;
  secondaryStorage.removeItem(CHAT_AUTH_SESSION_KEY);
  storage.setItem(CHAT_AUTH_SESSION_KEY, JSON.stringify(normalizedSession));
  scheduleSharedTokenRefresh(normalizedSession.token);
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

const clearLocalChatAuthSession = (broadcast: boolean): void => {
  const currentUserId = getChatAuthSession()?.user?.id || authedUser.value?.id;
  authSessionRevision++;
  if (proactiveRefreshTimer) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
  configureCustomBackgroundSync(null);
  localStorage.removeItem(CHAT_AUTH_SESSION_KEY);
  sessionStorage.removeItem(CHAT_AUTH_SESSION_KEY);
  if (broadcast) {
    getRefreshBroadcastChannel()?.postMessage({
      type: 'cleared',
      userId: currentUserId
    } satisfies AuthRefreshBroadcastMessage);
  }
  void import('../services/useChatBackgroundSync')
    .then(({ clearAnyChatBackgroundSyncSession }) =>
      clearAnyChatBackgroundSyncSession()
    )
    .catch(error => {
      console.warn('Failed to clear chat background sync session:', error);
    });
};

export const clearChatAuthSession = (): void => {
  clearLocalChatAuthSession(true);
};

export const saveBootstrapErpSession = (
  session: StoredBootstrapErpSession,
  persist = true
): void => {
  const storage = persist ? localStorage : sessionStorage;
  const secondaryStorage = persist ? sessionStorage : localStorage;

  secondaryStorage.removeItem(ERP_BOOTSTRAP_TOKEN_KEY);
  secondaryStorage.removeItem(QR_BOOTSTRAP_SOURCE_KEY);
  storage.setItem(ERP_BOOTSTRAP_TOKEN_KEY, session.accessToken);
  if (session.source === 'qr') storage.setItem(QR_BOOTSTRAP_SOURCE_KEY, '1');
  else storage.removeItem(QR_BOOTSTRAP_SOURCE_KEY);
};

export const isStoredBootstrapFromQr = (): boolean => {
  const storage = localStorage.getItem(ERP_BOOTSTRAP_TOKEN_KEY)
    ? localStorage
    : sessionStorage;
  return storage.getItem(QR_BOOTSTRAP_SOURCE_KEY) === '1';
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
  localStorage.removeItem(QR_BOOTSTRAP_SOURCE_KEY);
  sessionStorage.removeItem(QR_BOOTSTRAP_SOURCE_KEY);
};

export const clearErpAuthSession = (): void => {
  clearChatAuthSession();
  clearBootstrapErpSession();
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

const redirectToAuthorizationInternal = (broadcast: boolean): void => {
  const authorizationUrl = buildGroupCallInviteAuthorizationUrl(
    window.location.href
  );
  if (broadcast) {
    clearErpAuthSession();
  } else {
    clearLocalChatAuthSession(false);
    clearBootstrapErpSession();
  }
  useLogout();
  authedUser.value = null;
  skipStartupShellOnNextAuthScreen();
  window.location.replace(authorizationUrl);
};

const endChatSession = (
  logoutOnServer: boolean,
  broadcast: boolean,
  clientIntent:
    | 'manual_user'
    | 'auth_inactive'
    | 'remote_logout'
    | 'authorization_redirect'
): Promise<void> => {
  if (sessionEndingPromise) return sessionEndingPromise;

  const clientAttemptId = createTelemetryTraceId('logout');
  // Фиксируем намерение до отключения сокета и очистки авторизации.
  try {
    recordTelemetryEvent({
      category: 'lifecycle',
      name: 'auth.session.end_requested',
      traceId: clientAttemptId,
      payload: { clientIntent, clientAttemptId, logoutOnServer }
    });
    void flushTelemetryEvents();
  } catch {
    // Диагностика не должна мешать выходу.
  }
  isEndingSession = true;
  authSessionRevision++;
  if (proactiveRefreshTimer) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
  // Отключаем сокет сразу, сохраняя токен в хранилище для удаления push-подписки.
  useLogout();
  const pendingRefresh = sessionRefreshPromise;

  sessionEndingPromise = (async () => {
    try {
      const { cleanupPushNotificationsOnLogout } = await import(
        '../services/usePushNotifications'
      );
      await cleanupPushNotificationsOnLogout();
    } catch (error) {
      console.warn(
        'Не удалось полностью очистить уведомления при выходе:',
        error
      );
    }

    // Ротация cookie, начатая до выхода, должна завершиться до её отзыва.
    await pendingRefresh?.catch(() => undefined);
    if (logoutOnServer) {
      try {
        const response = await requestChatLogout(clientIntent, clientAttemptId);
        if (!response.ok) {
          console.warn(
            'Не удалось завершить серверную сессию чата:',
            response.status
          );
        }
      } catch (error) {
        console.warn('Не удалось завершить серверную сессию чата:', error);
      }
    }

    redirectToAuthorizationInternal(broadcast);
  })();

  return sessionEndingPromise;
};

export const redirectToAuthorization = (): Promise<void> => {
  return endChatSession(false, true, 'authorization_redirect');
};

const readAuthErrorBody = async (
  response: Response
): Promise<AuthErrorBody> => {
  try {
    return (await response.json()) as AuthErrorBody;
  } catch {
    return {};
  }
};

const getAuthErrorMessage = (body: AuthErrorBody, fallback: string): string => {
  if (Array.isArray(body.message)) {
    return body.message.filter(Boolean).join(', ') || fallback;
  }

  return body.message || body.error || fallback;
};

const createAuthHttpError = (
  status: number,
  message: string,
  code?: string
): AuthHttpError => Object.assign(new Error(message), { status, code });

const getAuthorizedRetryInit = (
  input: RequestInfo | URL,
  init?: RequestInit
): RequestInit => {
  const headers = new Headers(
    init?.headers || (input instanceof Request ? input.headers : undefined)
  );
  const token = getAuthToken() || getStoredChatAccessToken();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  } else {
    headers.delete('Authorization');
  }

  return { ...init, headers };
};

export const fetchWithAuthRedirect = async (
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> => {
  const retryInput = input instanceof Request ? input.clone() : input;
  const response = await fetch(input, init);

  if (response.status !== 401) {
    return response;
  }

  const refreshed = await tryRefreshErpSession();

  if (refreshed?.token) {
    const retryResponse = await fetch(
      retryInput,
      getAuthorizedRetryInit(retryInput, init)
    );

    if (retryResponse.status !== 401) {
      return retryResponse;
    }
  }

  await handleConfirmedInactiveSession();
  return response;
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
  if (isEndingSession) return Promise.resolve(null);
  if (sessionRefreshPromise) {
    return sessionRefreshPromise;
  }

  const initialToken = getAuthToken() || getStoredChatAccessToken();

  if (!initialToken || !isSharedAccessToken(initialToken)) {
    return Promise.resolve(null);
  }

  const refreshRevision = authSessionRevision;
  const runRefresh = (): Promise<AuthResponse | null> =>
    refreshSharedSession(initialToken, refreshRevision);
  const locks =
    typeof navigator === 'undefined'
      ? undefined
      : (
          navigator as Navigator & {
            locks?: {
              request<T>(name: string, callback: () => Promise<T>): Promise<T>;
            };
          }
        ).locks;

  sessionRefreshPromise = (
    locks ? locks.request(AUTH_REFRESH_LOCK_NAME, runRefresh) : runRefresh()
  ).finally(() => {
    sessionRefreshPromise = null;
  });

  return sessionRefreshPromise;
};

export const logoutChatSession = async (): Promise<void> => {
  await endChatSession(true, true, 'manual_user');
};

const requestChatLogout = (
  clientIntent: string,
  clientAttemptId: string
): Promise<Response> => {
  const config = getConfig();

  return fetchAuthWithCookies(
    `${config.CHAT_API_DOMAIN.replace(/\/+$/, '')}/auth/logout`,
    'POST',
    { clientIntent, clientAttemptId }
  );
};

const validateChatToken = async (token: string): Promise<AuthUser | null> => {
  const config = getConfig();
  return withNetworkTimeout(async signal => {
    const response = await fetch(
      `${config.CHAT_API_DOMAIN.replace(/\/+$/, '')}/auth/session`,
      {
        method: 'GET',
        signal,
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (response.status === 401) {
      return null;
    }

    if (!response.ok) {
      const body = await readAuthErrorBody(response);
      throw createAuthHttpError(
        response.status,
        getAuthErrorMessage(body, 'Сервис авторизации временно недоступен'),
        body.code
      );
    }

    return (await response.json()) as AuthUser;
  });
};

const verifySameUser = (user: AuthUser | undefined): boolean => {
  const expectedUserId =
    getChatAuthSession()?.user?.id || authedUser.value?.id || '';

  return !expectedUserId || !user?.id || user.id === expectedUserId;
};

const refreshThroughErp = async (
  source: ChatAuthSessionSource
): Promise<AuthResponse | null> => {
  const config = getConfig();
  const erpUrl = config.CHAT_ERP_URL?.trim();

  let erpRefreshUrl: URL | undefined;
  try {
    if (erpUrl) {
      erpRefreshUrl = new URL(`${erpUrl.replace(/\/+$/, '')}/api/auth/refresh`);
    }
  } catch {
    // Повторный запрос не исправит некорректный адрес в конфигурации.
  }

  if (
    !erpRefreshUrl ||
    (erpRefreshUrl.protocol !== 'https:' && erpRefreshUrl.protocol !== 'http:')
  ) {
    console.warn(
      'Адрес ERP для обновления сессии не настроен или некорректен, требуется повторная авторизация'
    );
    return null;
  }

  // Проверка ERP-сессии может вернуть JWT на границе истечения; обновляем явно.
  const response = await fetchAuthWithCookies(erpRefreshUrl.href, 'POST');

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const body = await readAuthErrorBody(response);
    throw createAuthHttpError(
      response.status,
      getAuthErrorMessage(body, 'Сервис авторизации временно недоступен'),
      body.code
    );
  }

  const data = (await response.json()) as { token?: unknown };
  const token = typeof data.token === 'string' ? data.token : '';

  if (!token) {
    throw createAuthHttpError(
      503,
      'ERP вернул некорректный ответ авторизации',
      'AUTH_UNAVAILABLE'
    );
  }

  const user = await validateChatToken(token);
  if (!user || !verifySameUser(user)) {
    return null;
  }

  return {
    token,
    accessToken: token,
    user,
    expireTimeSeconds: getTokenExpiresInSeconds(token),
    source
  };
};

const requestSharedRefresh = async (
  source: ChatAuthSessionSource
): Promise<AuthResponse | null> => {
  // ERP-сессия не должна обновляться через cookie от прежнего входа в чат.
  if (source === 'erp_bootstrap') return refreshThroughErp(source);

  const config = getConfig();
  const response = await fetchAuthWithCookies(
    `${config.CHAT_API_DOMAIN.replace(/\/+$/, '')}/auth/refresh`,
    'POST'
  );
  const body = await readAuthErrorBody(response);

  if (response.status === 401) {
    if (body.code === 'CHAT_REFRESH_MISSING' && source === 'unknown_shared') {
      return refreshThroughErp(source);
    }

    return null;
  }

  if (!response.ok) {
    throw createAuthHttpError(
      response.status,
      getAuthErrorMessage(body, 'Сервис авторизации временно недоступен'),
      body.code
    );
  }

  const authResponse = normalizeAuthResponse(
    {
      ...(body as Record<string, unknown>),
      source
    },
    false
  );

  if (!authResponse.token) {
    throw createAuthHttpError(
      503,
      'Сервис обновления сессии вернул некорректный ответ',
      'AUTH_UNAVAILABLE'
    );
  }

  if (!verifySameUser(authResponse.user)) {
    return null;
  }

  return authResponse;
};

const saveRefreshedBackgroundSession = (
  token: string,
  user?: AuthUser
): void => {
  const apiUrl = getConfig().CHAT_API_DOMAIN?.trim();
  if (!apiUrl) return;
  const revision = authSessionRevision;

  void import('../services/useChatBackgroundSync')
    .then(({ saveAnyChatBackgroundSyncSession }) => {
      if (isEndingSession || revision !== authSessionRevision) return;
      return saveAnyChatBackgroundSyncSession({
        token,
        userId: user?.id || authedUser.value?.id,
        apiUrl
      });
    })
    .catch(error => {
      console.warn('Не удалось обновить токен фоновой синхронизации:', error);
    });
};

const applyRefreshedSession = (
  authResponse: AuthResponse,
  refreshRevision: number,
  broadcast: boolean
): AuthResponse | null => {
  if (
    isEndingSession ||
    authSessionRevision !== refreshRevision ||
    !authResponse.token
  ) {
    return null;
  }

  const storedSession = getChatAuthSession();
  const source = authResponse.source || inferSessionSource(storedSession);
  const sourceUser =
    authResponse.user || storedSession?.user || authedUser.value || undefined;
  const user = sourceUser
    ? preserveAuthAvatar(sourceUser, authedUser.value || storedSession?.user)
    : undefined;
  const expireTimeSeconds =
    authResponse.expireTimeSeconds ||
    getTokenExpiresInSeconds(authResponse.token);
  const persist = !!localStorage.getItem(CHAT_AUTH_SESSION_KEY);
  const normalized: AuthResponse = {
    ...authResponse,
    accessToken: authResponse.token,
    user,
    source,
    expireTimeSeconds
  };

  setAuthToken(authResponse.token, expireTimeSeconds);
  if (user) setAuthUser(user);
  saveChatAuthSession({ token: authResponse.token, user, source }, persist);
  saveRefreshedBackgroundSession(authResponse.token, user);

  if (broadcast) {
    getRefreshBroadcastChannel()?.postMessage({
      type: 'refreshed',
      token: authResponse.token,
      user,
      source,
      expireTimeSeconds
    } satisfies AuthRefreshBroadcastMessage);
  }

  return normalized;
};

const refreshSharedSession = async (
  initialToken: string,
  refreshRevision: number
): Promise<AuthResponse | null> => {
  if (isEndingSession) return null;
  const currentToken = getAuthToken() || getStoredChatAccessToken();
  const storedSession = getChatAuthSession();
  const source = inferSessionSource(storedSession);

  if (
    currentToken &&
    (currentToken !== initialToken || authSessionRevision !== refreshRevision)
  ) {
    const user = await validateChatToken(currentToken);
    if (user && verifySameUser(user)) {
      if (currentToken === initialToken) {
        return {
          token: currentToken,
          accessToken: currentToken,
          user,
          source,
          expireTimeSeconds: getTokenExpiresInSeconds(currentToken)
        };
      }

      return applyRefreshedSession(
        {
          token: currentToken,
          accessToken: currentToken,
          user,
          source,
          expireTimeSeconds: getTokenExpiresInSeconds(currentToken)
        },
        authSessionRevision,
        false
      );
    }
  }

  if (isEndingSession || authSessionRevision !== refreshRevision) {
    return null;
  }

  const refreshed = await requestSharedRefresh(source);
  if (!refreshed) return null;

  const applied = applyRefreshedSession(refreshed, refreshRevision, true);
  if (applied) return applied;
  if (isEndingSession) return null;

  const latestToken = getAuthToken() || getStoredChatAccessToken();
  if (!latestToken) return null;
  const latestUser = await validateChatToken(latestToken);
  if (!latestUser || !verifySameUser(latestUser)) return null;

  return {
    token: latestToken,
    accessToken: latestToken,
    user: latestUser,
    source: inferSessionSource(getChatAuthSession()),
    expireTimeSeconds: getTokenExpiresInSeconds(latestToken)
  };
};

const handleAuthRefreshBroadcast = async (
  message: AuthRefreshBroadcastMessage
): Promise<void> => {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'cleared') {
    const currentUserId =
      getChatAuthSession()?.user?.id || authedUser.value?.id;
    if (message.userId && currentUserId && message.userId !== currentUserId) {
      return;
    }

    await endChatSession(false, false, 'remote_logout');
    return;
  }

  if (isEndingSession || !getChatAuthSession()?.token) return;
  if (!message.token || !isSharedAccessToken(message.token)) return;

  const expectedUserId = getChatAuthSession()?.user?.id || authedUser.value?.id;
  if (
    expectedUserId &&
    message.user?.id &&
    expectedUserId !== message.user.id
  ) {
    return;
  }

  const revision = authSessionRevision;
  applyRefreshedSession(
    {
      token: message.token,
      accessToken: message.token,
      user: message.user,
      source: message.source,
      expireTimeSeconds: message.expireTimeSeconds
    },
    revision,
    false
  );
};

const scheduleSharedTokenRefresh = (token: string): void => {
  if (proactiveRefreshTimer) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }

  if (!token || !isSharedAccessToken(token)) return;

  const { exp, iat } = getTokenTiming(token);
  if (typeof exp !== 'number') return;

  const lifetimeSeconds =
    typeof iat === 'number' && exp > iat ? exp - iat : 15 * 60;
  const leadSeconds =
    lifetimeSeconds <= 30
      ? Math.max(2, Math.min(3, lifetimeSeconds * 0.2))
      : Math.min(60, Math.max(10, lifetimeSeconds * 0.1));
  const delayMs = Math.max(250, (exp - Date.now() / 1000 - leadSeconds) * 1000);

  proactiveRefreshTimer = setTimeout(() => {
    proactiveRefreshTimer = null;
    if ((getAuthToken() || getStoredChatAccessToken()) !== token) return;

    void tryRefreshErpSession()
      .then(refreshed => {
        if (!refreshed) return handleConfirmedInactiveSession();
      })
      .catch(error => {
        console.warn(
          'Не удалось заранее обновить токен, сессия сохранена:',
          error
        );
        if ((getAuthToken() || getStoredChatAccessToken()) === token) {
          proactiveRefreshTimer = setTimeout(
            () => scheduleSharedTokenRefresh(token),
            5000
          );
        }
      });
  }, delayMs);
};

export const handleConfirmedInactiveSession = async (): Promise<void> => {
  await endChatSession(true, true, 'auth_inactive');
};

export const withAuthResponseRefresh = async (
  operation: () => Promise<Response>
): Promise<Response> => {
  const response = await operation();
  if (response.status !== 401) return response;

  const refreshed = await tryRefreshErpSession();
  if (refreshed?.token) {
    const retryResponse = await operation();
    if (retryResponse.status !== 401) return retryResponse;
  }

  await handleConfirmedInactiveSession();
  return response;
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
        try {
          return await operation();
        } catch (retryError) {
          if (!isAuthError(retryError)) throw retryError;
        }
      }

      await handleConfirmedInactiveSession();
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
  authedUser.value = user ? preserveAuthAvatar(user) : null;
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

  const nextUser = preserveAuthAvatar({
    ...authedUser.value,
    ...patch
  } as AuthUser);

  authedUser.value = nextUser;
  updateStoredChatSessionUser(nextUser);
};
