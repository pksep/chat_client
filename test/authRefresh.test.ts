import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { setConfig } from '../src/services/useConfig';
import {
  clearChatAuthSession,
  getChatAuthSession,
  saveChatAuthSession,
  tryRefreshErpSession,
  withAuthResponseRefresh
} from '../src/composables/useAuth';
import { getAuthToken, setAuthToken, useLogout } from '../src/composables/useLogin';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

const encodeJwtPart = (value: Record<string, unknown>): string =>
  btoa(JSON.stringify(value))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const sharedToken = (suffix: string): string => {
  const now = Math.floor(Date.now() / 1000);
  return [
    encodeJwtPart({ alg: 'RS256', typ: 'JWT', kid: 'test-key' }),
    encodeJwtPart({ sub: 'user-1', iat: now, exp: now + 900, suffix }),
    suffix
  ].join('.');
};

const user = {
  id: 'user-1',
  nickname: '0045',
  initials: 'Тест Т.Т.',
  avatarUrl: ''
} as any;

const localStorageMock = new MemoryStorage();
const sessionStorageMock = new MemoryStorage();
let cookies = new Map<string, string>();

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock
});
Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: sessionStorageMock
});
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    get cookie(): string {
      return [...cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    },
    set cookie(raw: string) {
      const [pair] = raw.split(';');
      const separator = pair.indexOf('=');
      const key = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (!value || /expires=Thu, 01 Jan 1970/i.test(raw)) cookies.delete(key);
      else cookies.set(key, value);
    }
  }
});
Object.defineProperty(globalThis, 'navigator', {
  configurable: true,
  value: {
    locks: {
      request: (_name: string, callback: () => Promise<unknown>) => callback()
    }
  }
});

describe('обновление общей сессии чата', () => {
  beforeEach(() => {
    localStorageMock.clear();
    sessionStorageMock.clear();
    cookies = new Map();
    setConfig({
      CHAT_API_DOMAIN: 'http://chat.test/api',
      CHAT_ERP_URL: 'http://erp.test'
    });
  });

  afterEach(() => {
    clearChatAuthSession();
    useLogout();
    mock.restore();
  });

  test('после 401 обновляет chat-owned токен и повторяет запрос один раз', async () => {
    const oldToken = sharedToken('old-chat');
    const newToken = sharedToken('new-chat');
    setAuthToken(oldToken, 900);
    saveChatAuthSession(
      { token: oldToken, user, source: 'chat_credentials' },
      true
    );

    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('http://chat.test/api/auth/refresh');
      return Response.json({
        token: newToken,
        accessToken: newToken,
        expireTimeSeconds: 900,
        user
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    let attempts = 0;
    const response = await withAuthResponseRefresh(async () => {
      attempts++;
      return new Response(null, { status: attempts === 1 ? 401 : 200 });
    });

    expect(response.status).toBe(200);
    expect(attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(getAuthToken()).toBe(newToken);
    expect(getChatAuthSession()).toMatchObject({
      token: newToken,
      source: 'chat_credentials',
      user: { id: user.id }
    });
  });

  test('ERP-вход обновляет токен через ERP и проверяет его в чате', async () => {
    const oldToken = sharedToken('old-erp');
    const newToken = sharedToken('new-erp');
    setAuthToken(oldToken, 900);
    saveChatAuthSession(
      { token: oldToken, user, source: 'erp_bootstrap' },
      true
    );

    const requestedUrls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === 'http://erp.test/api/auth/session') {
        return Response.json({ ok: true, token: newToken });
      }
      if (url === 'http://chat.test/api/auth/session') {
        return Response.json(user);
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    await expect(tryRefreshErpSession()).resolves.toMatchObject({
      token: newToken,
      source: 'erp_bootstrap'
    });
    expect(requestedUrls).toEqual([
      'http://erp.test/api/auth/session',
      'http://chat.test/api/auth/session'
    ]);
    expect(getChatAuthSession()?.token).toBe(newToken);
  });

  test('параллельные запросы используют один refresh и не создают гонку ротации', async () => {
    const oldToken = sharedToken('concurrent-old');
    const newToken = sharedToken('concurrent-new');
    setAuthToken(oldToken, 900);
    saveChatAuthSession(
      { token: oldToken, user, source: 'chat_credentials' },
      true
    );
    const fetchMock = mock(async () =>
      Response.json({
        token: newToken,
        accessToken: newToken,
        expireTimeSeconds: 900,
        user
      })
    );
    globalThis.fetch = fetchMock as typeof fetch;

    const refreshed = await Promise.all(
      Array.from({ length: 20 }, () => tryRefreshErpSession())
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshed.every(result => result?.token === newToken)).toBe(true);
    expect(getChatAuthSession()?.token).toBe(newToken);
  });

  test('повторная проверка того же ERP-токена не считается завершением сессии', async () => {
    const token = sharedToken('same-erp-token');
    setAuthToken(token, 900);
    saveChatAuthSession({ token, user, source: 'erp_bootstrap' }, true);

    let releaseRefresh: (() => void) | undefined;
    const refreshGate = new Promise<void>(resolve => {
      releaseRefresh = resolve;
    });
    let refreshRequests = 0;
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'http://erp.test/api/auth/session') {
        refreshRequests++;
        await refreshGate;
        return Response.json({ ok: true, token });
      }
      if (url === 'http://chat.test/api/auth/session') {
        return Response.json(user);
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    const firstRefresh = tryRefreshErpSession();
    saveChatAuthSession({ token, user, source: 'erp_bootstrap' }, true);
    releaseRefresh?.();

    await expect(firstRefresh).resolves.toMatchObject({ token });
    expect(refreshRequests).toBe(1);
    expect(getChatAuthSession()?.token).toBe(token);
  });

  test('503 не очищает и не заменяет текущую сессию', async () => {
    const oldToken = sharedToken('unavailable');
    setAuthToken(oldToken, 900);
    saveChatAuthSession(
      { token: oldToken, user, source: 'chat_credentials' },
      true
    );
    globalThis.fetch = mock(async () =>
      Response.json(
        { code: 'AUTH_UNAVAILABLE', message: 'temporarily unavailable' },
        { status: 503 }
      )
    ) as typeof fetch;

    await expect(tryRefreshErpSession()).rejects.toMatchObject({ status: 503 });
    expect(getAuthToken()).toBe(oldToken);
    expect(getChatAuthSession()?.token).toBe(oldToken);
  });
});
