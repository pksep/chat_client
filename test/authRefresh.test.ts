import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test
} from 'bun:test';
import { setConfig } from '../src/services/useConfig';
import {
  clearChatAuthSession,
  getChatAuthSession,
  saveChatAuthSession,
  tryRefreshErpSession,
  withAuthResponseRefresh,
  setAuthUser,
  getAuthUser,
  loginWithQrToken
} from '../src/composables/useAuth';
import {
  getAuthToken,
  setAuthToken,
  useLogout
} from '../src/composables/useLogin';

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

const sharedToken = (
  suffix: string,
  timing: { iat?: number; exp?: number } = {}
): string => {
  const now = Math.floor(Date.now() / 1000);
  return [
    encodeJwtPart({ alg: 'RS256', typ: 'JWT', kid: 'test-key' }),
    encodeJwtPart({
      sub: 'user-1',
      iat: now,
      exp: now + 900,
      ...timing,
      suffix
    }),
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

  for (const activeUser of [true, false]) {
    test(`обновление сохраняет аватар в профиле и сессии, профиль загружен: ${activeUser}`, async () => {
      const oldToken = sharedToken('avatar-old');
      const nextToken = sharedToken('avatar-new');
      const knownUser = { ...user, avatarUrl: 'profile-photo.webp' };
      setAuthUser(activeUser ? knownUser : null);
      setAuthToken(oldToken, 900);
      saveChatAuthSession(
        { token: oldToken, user: knownUser, source: 'chat_credentials' },
        true
      );
      const { avatarUrl: _avatar, ...partialUser } = user;
      globalThis.fetch = mock(async () =>
        Response.json({ token: nextToken, user: partialUser })
      ) as typeof fetch;
      await tryRefreshErpSession();
      expect(getAuthUser()?.avatarUrl).toBe(knownUser.avatarUrl);
      expect(getChatAuthSession()?.user?.avatarUrl).toBe(knownUser.avatarUrl);
    });
  }

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
    globalThis.fetch = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url === 'http://erp.test/api/auth/refresh') {
          expect(init?.method).toBe('POST');
          expect(init?.credentials).toBe('include');
          return Response.json({ ok: true, token: newToken });
        }
        if (url === 'http://chat.test/api/auth/session') {
          expect(new Headers(init?.headers).get('Authorization')).toBe(
            `Bearer ${newToken}`
          );
          return Response.json(user);
        }
        throw new Error(`Unexpected request: ${url}`);
      }
    ) as typeof fetch;

    await expect(tryRefreshErpSession()).resolves.toMatchObject({
      token: newToken,
      source: 'erp_bootstrap'
    });
    expect(requestedUrls).toEqual([
      'http://erp.test/api/auth/refresh',
      'http://chat.test/api/auth/session'
    ]);
    expect(getChatAuthSession()?.token).toBe(newToken);
  });

  test('пограничный ERP-токен обновляется при опережении часов браузера', async () => {
    const serverNow = Math.floor(Date.now() / 1000);
    const oldToken = sharedToken('erp-expiring', {
      iat: serverNow - 899,
      exp: serverNow + 1
    });
    const newToken = sharedToken('erp-rotated', {
      iat: serverNow,
      exp: serverNow + 900
    });
    spyOn(Date, 'now').mockReturnValue((serverNow + 6) * 1000);
    setAuthToken(oldToken, 1);
    saveChatAuthSession({ token: oldToken, user, source: 'erp_bootstrap' });

    const requestedUrls: string[] = [];
    globalThis.fetch = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        requestedUrls.push(url);
        if (url === 'http://erp.test/api/auth/session') {
          return Response.json({ ok: true, token: oldToken });
        }
        if (url === 'http://erp.test/api/auth/refresh') {
          expect(init?.method).toBe('POST');
          return Response.json({ ok: true, token: newToken });
        }
        if (url === 'http://chat.test/api/auth/session') {
          return new Headers(init?.headers).get('Authorization') ===
            `Bearer ${newToken}`
            ? Response.json(user)
            : new Response(null, { status: 401 });
        }
        throw new Error(`Unexpected request: ${url}`);
      }
    ) as typeof fetch;

    await expect(tryRefreshErpSession()).resolves.toMatchObject({
      token: newToken,
      source: 'erp_bootstrap'
    });
    expect(requestedUrls).toEqual([
      'http://erp.test/api/auth/refresh',
      'http://chat.test/api/auth/session'
    ]);
    expect(getAuthToken()).toBe(newToken);
    expect(getChatAuthSession()?.token).toBe(newToken);
  });

  for (const source of [
    'erp_bootstrap',
    'unknown_shared',
    'chat_qr'
  ] as const) {
    test(`${source}: продление запланировано до истечения с учётом часов браузера`, () => {
      const serverNow = Math.floor(Date.now() / 1000);
      const token = sharedToken(`proactive-${source}`, {
        iat: serverNow,
        exp: serverNow + 900
      });
      spyOn(Date, 'now').mockReturnValue((serverNow + 6) * 1000);
      const timers = spyOn(globalThis, 'setTimeout');

      setAuthToken(token, 894);
      saveChatAuthSession({ token, user, source });

      expect(timers.mock.calls.at(-1)?.[1]).toBe(834_000);
    });
  }

  test('QR получает новую сессию без преждевременного изменения текущего аккаунта', async () => {
    const oldToken = sharedToken('previous-account');
    const qrToken = sharedToken('computer');
    const phoneToken = sharedToken('phone');
    setAuthToken(oldToken, 900);
    saveChatAuthSession({ token: oldToken, user, source: 'chat_credentials' });
    globalThis.fetch = mock(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe('http://chat.test/api/auth/qr-login');
        expect(init?.method).toBe('POST');
        expect(init?.credentials).toBe('include');
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          `Bearer ${qrToken}`
        );
        return Response.json({
          token: phoneToken,
          expireTimeSeconds: 900,
          user
        });
      }
    ) as typeof fetch;
    const phone = await loginWithQrToken(qrToken);
    expect(phone).toMatchObject({ token: phoneToken, source: 'chat_qr', user });
    expect(phone.erpToken).toBeUndefined();
    expect(getChatAuthSession()?.token).toBe(oldToken);
    expect(getAuthToken()).toBe(oldToken);
    setAuthToken(phone.token, 900);
    saveChatAuthSession(phone);
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('http://chat.test/api/auth/refresh');
      return Response.json({ token: sharedToken('phone-renewed'), user });
    }) as typeof fetch;
    await expect(tryRefreshErpSession()).resolves.toMatchObject({
      source: 'chat_qr'
    });
  });

  for (const status of [401, 503]) {
    test(`отказ QR ${status} сохраняет прежний аккаунт и не использует ERP refresh`, async () => {
      const previous = sharedToken('previous');
      setAuthToken(previous, 900);
      saveChatAuthSession({
        token: previous,
        user,
        source: 'chat_credentials'
      });
      const fetchMock = mock(async () => Response.json({}, { status }));
      globalThis.fetch = fetchMock as typeof fetch;
      await expect(
        loginWithQrToken(sharedToken('rejected-qr'))
      ).rejects.toMatchObject({ status });
      expect(getChatAuthSession()?.token).toBe(previous);
      expect(getAuthToken()).toBe(previous);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  }

  test('параллельные ERP-запросы обновляют сессию один раз', async () => {
    const oldToken = sharedToken('concurrent-erp-old');
    const newToken = sharedToken('concurrent-erp-new');
    setAuthToken(oldToken, 900);
    saveChatAuthSession({ token: oldToken, user, source: 'erp_bootstrap' });
    const requestedUrls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === 'http://erp.test/api/auth/refresh') {
        return Response.json({ ok: true, token: newToken });
      }
      if (url === 'http://chat.test/api/auth/session') {
        return Response.json(user);
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    const refreshed = await Promise.all(
      Array.from({ length: 20 }, () => tryRefreshErpSession())
    );

    expect(requestedUrls).toEqual([
      'http://erp.test/api/auth/refresh',
      'http://chat.test/api/auth/session'
    ]);
    expect(refreshed.every(result => result?.token === newToken)).toBe(true);
  });

  test('старая общая сессия без chat-cookie обновляется через ERP', async () => {
    const oldToken = sharedToken('unknown-old');
    const newToken = sharedToken('unknown-new');
    setAuthToken(oldToken, 900);
    saveChatAuthSession({ token: oldToken, user, source: 'unknown_shared' });
    const requestedUrls: string[] = [];
    globalThis.fetch = mock(async (input: RequestInfo | URL) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === 'http://chat.test/api/auth/refresh') {
        return Response.json({ code: 'CHAT_REFRESH_MISSING' }, { status: 401 });
      }
      if (url === 'http://erp.test/api/auth/refresh') {
        return Response.json({ ok: true, token: newToken });
      }
      if (url === 'http://chat.test/api/auth/session') {
        return Response.json(user);
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as typeof fetch;

    await expect(tryRefreshErpSession()).resolves.toMatchObject({
      token: newToken,
      source: 'unknown_shared'
    });
    expect(requestedUrls).toEqual([
      'http://chat.test/api/auth/refresh',
      'http://erp.test/api/auth/refresh',
      'http://chat.test/api/auth/session'
    ]);
  });

  test('401 от ERP refresh подтверждает недействительность сессии', async () => {
    const token = sharedToken('erp-revoked');
    setAuthToken(token, 900);
    saveChatAuthSession({ token, user, source: 'erp_bootstrap' });
    const fetchMock = mock(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('http://erp.test/api/auth/refresh');
      return new Response(null, { status: 401 });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(tryRefreshErpSession()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  for (const failure of ['503', 'timeout'] as const) {
    test(`ошибка ERP ${failure} сохраняет сессию и разрешает повтор`, async () => {
      const oldToken = sharedToken(`erp-${failure}-old`);
      const newToken = sharedToken(`erp-${failure}-new`);
      setAuthToken(oldToken, 900);
      saveChatAuthSession({ token: oldToken, user, source: 'erp_bootstrap' });
      globalThis.fetch = mock(async () => {
        if (failure === 'timeout') {
          throw new DOMException('Сервер не ответил вовремя', 'TimeoutError');
        }
        return Response.json({ code: 'AUTH_UNAVAILABLE' }, { status: 503 });
      }) as typeof fetch;

      await expect(tryRefreshErpSession()).rejects.toMatchObject(
        failure === 'timeout' ? { name: 'TimeoutError' } : { status: 503 }
      );
      expect(getAuthToken()).toBe(oldToken);
      expect(getChatAuthSession()?.token).toBe(oldToken);

      globalThis.fetch = mock(async (input: RequestInfo | URL) =>
        Response.json(
          String(input) === 'http://erp.test/api/auth/refresh'
            ? { ok: true, token: newToken }
            : user
        )
      ) as typeof fetch;
      await expect(tryRefreshErpSession()).resolves.toMatchObject({
        token: newToken
      });
    });
  }

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
      if (url === 'http://erp.test/api/auth/refresh') {
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

  test('незавершённый ответ refresh освобождает очередь и разрешает повтор без выхода', async () => {
    const oldToken = sharedToken('stalled-body');
    const newToken = sharedToken('recovered-body');
    setAuthToken(oldToken, 900);
    saveChatAuthSession(
      { token: oldToken, user, source: 'chat_credentials' },
      true
    );
    let body!: ReadableStreamDefaultController<Uint8Array>;
    const fetchMock = mock(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              body = controller;
            }
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )
    );
    globalThis.fetch = fetchMock as typeof fetch;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const attempts = Array.from({ length: 20 }, () => tryRefreshErpSession());
      const bounded = Promise.race([
        Promise.all(attempts),
        new Promise((_, reject) => {
          deadline = setTimeout(
            () =>
              reject(new Error('Обновление сессии осталось заблокированным')),
            5500
          );
        })
      ]);
      await expect(bounded).rejects.toMatchObject({ name: 'TimeoutError' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(getChatAuthSession()?.token).toBe(oldToken);
      expect(getAuthToken()).toBe(oldToken);
      globalThis.fetch = mock(async () =>
        Response.json({ token: newToken, user })
      ) as typeof fetch;
      await expect(tryRefreshErpSession()).resolves.toMatchObject({
        token: newToken
      });
    } finally {
      clearTimeout(deadline);
      body?.close();
    }
  }, 6500);

  test('незавершённая проверка ERP-токена не блокирует последующий refresh', async () => {
    const oldToken = sharedToken('erp-stalled-validation');
    const newToken = sharedToken('erp-recovered-validation');
    setAuthToken(oldToken, 900);
    saveChatAuthSession(
      { token: oldToken, user, source: 'erp_bootstrap' },
      true
    );
    let body!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          body = controller;
        }
      })
    );
    globalThis.fetch = mock(async (input: RequestInfo | URL) =>
      String(input).startsWith('http://erp.test/')
        ? Response.json({ token: newToken })
        : response
    ) as typeof fetch;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await expect(
        Promise.race([
          tryRefreshErpSession(),
          new Promise((_, reject) => {
            deadline = setTimeout(
              () =>
                reject(new Error('Проверка токена осталась заблокированной')),
              5500
            );
          })
        ])
      ).rejects.toMatchObject({ name: 'TimeoutError' });
      expect(getChatAuthSession()?.token).toBe(oldToken);
      globalThis.fetch = mock(async (input: RequestInfo | URL) =>
        Response.json(
          String(input).startsWith('http://erp.test/')
            ? { token: newToken }
            : user
        )
      ) as typeof fetch;
      await expect(tryRefreshErpSession()).resolves.toMatchObject({
        token: newToken
      });
    } finally {
      clearTimeout(deadline);
      body.close();
    }
  }, 6500);
});
