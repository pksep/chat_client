import { afterEach, beforeEach, expect, mock, test } from 'bun:test';
import { setConfig } from '../src/services/useConfig';
import { setAuthToken } from '../src/composables/useLogin';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

mock.module('../src/services/usePushNotifications', () => ({
  cleanupPushNotificationsOnLogout: async () => undefined
}));

const globalNames = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'fetch',
  'BroadcastChannel'
] as const;
let originalGlobals: Map<string, PropertyDescriptor | undefined>;
beforeEach(() => {
  originalGlobals = new Map(
    globalNames.map(name => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name)
    ])
  );
  Object.defineProperty(globalThis, 'BroadcastChannel', {
    configurable: true,
    value: undefined
  });
});
afterEach(() => {
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
  mock.restore();
});

for (const intent of ['manual_user', 'auth_inactive'] as const) {
  test(`${intent}: передаёт намерение выхода и связывает его с телеметрией`, async () => {
    const storage = new MemoryStorage();
    for (const name of ['localStorage', 'sessionStorage']) {
      Object.defineProperty(globalThis, name, {
        configurable: true,
        value: new MemoryStorage()
      });
    }
    let cookie = '';
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        hasFocus: () => true,
        visibilityState: 'visible',
        addEventListener: () => undefined,
        get cookie() {
          return cookie;
        },
        set cookie(value: string) {
          cookie = value.split(';')[0];
        }
      }
    });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { onLine: true }
    });
    const location = {
      href: 'http://chat.test/',
      origin: 'http://chat.test',
      replace: mock(() => undefined)
    };
    const fakeWindow = {
      location,
      localStorage: storage,
      addEventListener: () => undefined
    } as any;
    fakeWindow.top = fakeWindow;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: fakeWindow
    });
    setConfig({
      CHAT_API_DOMAIN: 'http://chat.test/api',
      CHAT_ERP_URL: 'http://erp.test'
    });
    // Новая загрузка страницы имеет собственный флаг завершения сессии.
    const modulePath = `../src/composables/useAuth.ts?logout-test=${intent}`;
    const auth = await import(modulePath);
    const requests: { url: string; body: any }[] = [];
    globalThis.fetch = mock(
      async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({
          url: String(url),
          body: init?.body ? JSON.parse(String(init.body)) : undefined
        });
        return Response.json({ ok: true });
      }
    ) as typeof fetch;
    setAuthToken('test-secret-token', 900);
    auth.saveChatAuthSession({
      token: 'test-secret-token',
      user: { id: 'user-1' },
      source: 'legacy'
    });
    const end =
      intent === 'manual_user'
        ? auth.logoutChatSession
        : auth.handleConfirmedInactiveSession;
    await Promise.all([end(), end()]);
    const logout = requests.filter(r => r.url.endsWith('/auth/logout'));
    expect(logout).toHaveLength(1);
    expect(logout[0].body).toEqual({
      clientIntent: intent,
      clientAttemptId: expect.stringMatching(/^logout-/)
    });
    expect(JSON.stringify(logout[0].body)).not.toContain('test-secret-token');
    const events = requests
      .filter(r => r.url.endsWith('/telemetry/events'))
      .flatMap(r => r.body.events);
    expect(events).toContainEqual(
      expect.objectContaining({
        name: 'auth.session.end_requested',
        traceId: logout[0].body.clientAttemptId,
        payload: {
          clientIntent: intent,
          clientAttemptId: logout[0].body.clientAttemptId,
          logoutOnServer: true
        }
      })
    );
    expect(location.replace).toHaveBeenCalledTimes(1);
  });
}
