import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as vue from 'vue';
import ts from 'typescript';
import type { ManagerInquiry } from '../src/composables/useManagerInquiries';
import * as inquiryVisibility from '../src/utils/inquiry-message-visibility';

interface ManagerState {
  allowed: vue.ComputedRef<boolean>;
  resolved: vue.Ref<boolean>;
  inquiries: vue.Ref<ManagerInquiry[]>;
}

interface ManagerModule {
  useManagerInquiries(): ManagerState;
  refreshManagerInquiries(): Promise<void>;
  managerRequest<T>(path: string): Promise<T>;
}

type Request = (path: string) => Promise<Response>;

const scopes = new Set<vue.EffectScope>();
const compiled = ts.transpileModule(
  readFileSync(
    new URL('../src/composables/useManagerInquiries.ts', import.meta.url),
    'utf8'
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022
    }
  }
).outputText;

function fixture(clientAccess = true): {
  module: ManagerModule;
  state: ManagerState;
  user: vue.Ref<{ id: string }>;
  notices: string[];
  routeClears(): number;
  setRequest(value: Request): void;
  setToken(value: string): void;
  failures: Array<{ error: unknown; details: Record<string, unknown> }>;
} {
  const user = vue.ref({ id: 'synthetic-operator' });
  const access = vue.ref({ client: clientAccess, ai: false });
  const notices: string[] = [];
  const failures: Array<{
    error: unknown;
    details: Record<string, unknown>;
  }> = [];
  let clears = 0;
  let token = 'synthetic-session';
  let request: Request = async (path: string): Promise<Response> =>
    Response.json(path === 'access' ? { allowed: true } : []);
  const exported: ManagerModule = {} as ManagerModule;
  const dependencies: Record<string, object> = {
    vue,
    '../utils/inquiry-message-visibility': inquiryVisibility,
    '../services/error-notification-telemetry': {
      recordErrorRequest: (
        error: unknown,
        details: Record<string, unknown>
      ): void => {
        failures.push({ error, details });
      }
    },
    './useAuth': {
      authedUser: user,
      getStoredChatAccessToken: (): string => token,
      fetchWithAuthRedirect: (url: string): Promise<Response> =>
        request(url.split('/manager/')[1])
    },
    './useLogin': { getAuthToken: (): string => token },
    '../services/useConfig': {
      getConfig: (): { CHAT_API_DOMAIN: string } => ({
        CHAT_API_DOMAIN: 'https://synthetic.invalid/api'
      })
    },
    './useTopics': { getTopicList: (): [] => [] },
    './useManagerRoutes': {
      clearManagerRoutes: (): void => {
        clears++;
      }
    },
    './useNotifications': {
      showErrorNotification: (message: string): void => {
        notices.push(message);
      }
    },
    './useChatAccess': {
      useChatAccess: (): {
        access: vue.Ref<{ client: boolean; ai: boolean }>;
        ready: vue.Ref<boolean>;
      } => ({ access, ready: vue.ref(true) })
    }
  };
  const scope = vue.effectScope();
  scopes.add(scope);
  scope.run((): void => {
    const load = (name: string): object => {
      const dependency = dependencies[name];

      if (!dependency) throw new Error(`Неизвестная зависимость: ${name}`);

      return dependency;
    };

    new Function('require', 'exports', compiled)(load, exported);
  });

  return {
    module: exported,
    state: exported.useManagerInquiries(),
    user,
    notices,
    failures,
    routeClears: (): number => clears,
    setRequest: (value: Request): void => {
      request = value;
    },
    setToken: (value: string): void => {
      token = value;
    }
  };
}

afterEach((): void => {
  for (const scope of scopes) scope.stop();
  scopes.clear();
});

test('таймаут запроса сохраняет исходную ошибку и записывает диагностику', async () => {
  const probe = fixture();
  const error = new DOMException('signal timed out', 'TimeoutError');
  probe.setRequest(async () => {
    throw error;
  });

  await expect(probe.module.managerRequest('access')).rejects.toBe(error);
  expect(probe.failures).toEqual([
    {
      error,
      details: {
        source: 'managerRequest',
        url: 'https://synthetic.invalid/api/manager/access',
        method: 'GET',
        elapsedMs: expect.any(Number),
        timeoutMs: 20000,
        httpStatus: undefined,
        phase: 'request'
      }
    }
  ]);
});

test('ошибка HTTP записывает статус без изменения обработки доступа', async () => {
  const probe = fixture();
  probe.setRequest(async () => Response.json({}, { status: 503 }));

  await expect(probe.module.managerRequest('access')).rejects.toThrow(
    'Не удалось выполнить действие. Попробуйте ещё раз.'
  );
  expect(probe.failures).toHaveLength(1);
  expect(probe.failures[0].details).toMatchObject({
    httpStatus: 503,
    phase: 'http_status'
  });
  expect(probe.state.allowed.value).toBe(true);
});

describe('отказ на действие не закрывает доступный раздел клиентов', (): void => {
  for (const path of ['inquiries?page=1', 'managers']) {
    test(`403 ${path} при подтверждённом доступе сохраняет раздел`, async (): Promise<void> => {
      const probe = fixture();
      await probe.module.refreshManagerInquiries();
      probe.setRequest(async (target: string): Promise<Response> => {
        if (target === path) return new Response('', { status: 403 });

        return Response.json(target === 'access' ? { allowed: true } : []);
      });
      await probe.module.refreshManagerInquiries();

      expect(probe.state.allowed.value).toBe(true);
      expect(probe.state.resolved.value).toBe(true);
      expect(probe.routeClears()).toBe(0);
      expect(probe.notices).toEqual(['Нет доступа к этому действию']);
    });
  }

  test('недоступная повторная проверка не подменяется отзывом права', async (): Promise<void> => {
    const probe = fixture();
    await probe.module.refreshManagerInquiries();
    let checks = 0;
    probe.setRequest(async (path: string): Promise<Response> => {
      if (path === 'access' && ++checks === 1)
        return Response.json({ allowed: true });

      return new Response('', { status: path === 'access' ? 503 : 403 });
    });
    await probe.module.refreshManagerInquiries();

    expect(probe.state.allowed.value).toBe(true);
    expect(probe.routeClears()).toBe(0);
    expect(probe.notices).toEqual(['Нет доступа к этому действию']);
  });

  for (const revoked of ['false', '403'] as const) {
    test(`подтверждённый отзыв ${revoked} закрывает раздел`, async (): Promise<void> => {
      const probe = fixture();
      await probe.module.refreshManagerInquiries();
      let checks = 0;
      probe.setRequest(async (path: string): Promise<Response> => {
        if (path !== 'access') return new Response('', { status: 403 });
        if (++checks === 1) return Response.json({ allowed: true });

        return revoked === 'false'
          ? Response.json({ allowed: false })
          : new Response('', { status: 403 });
      });
      await probe.module.refreshManagerInquiries();

      expect(probe.state.allowed.value).toBe(false);
      expect(probe.state.resolved.value).toBe(true);
      expect(probe.routeClears()).toBeGreaterThan(0);
      expect(probe.notices).toEqual([]);
    });
  }

  test('403 самой проверки доступа закрывает раздел', async (): Promise<void> => {
    const probe = fixture();
    await probe.module.refreshManagerInquiries();
    probe.setRequest(
      async (): Promise<Response> => new Response('', { status: 403 })
    );
    await probe.module.refreshManagerInquiries();

    expect(probe.state.allowed.value).toBe(false);
    expect(probe.state.resolved.value).toBe(true);
    expect(probe.notices).toEqual([]);
  });

  test('первый отказ проверки не выдаёт права на клиентов', async (): Promise<void> => {
    const probe = fixture(false);
    probe.setRequest(
      async (): Promise<Response> => new Response('', { status: 503 })
    );
    await probe.module.refreshManagerInquiries();

    expect(probe.state.allowed.value).toBe(false);
    expect(probe.state.resolved.value).toBe(false);
  });

  test('сбой отдельной проверки сохраняет доступ из общего меню', async (): Promise<void> => {
    const probe = fixture();
    probe.setRequest(
      async (): Promise<Response> => new Response('', { status: 503 })
    );
    await probe.module.refreshManagerInquiries();
    expect(probe.state.allowed.value).toBe(true);
    expect(probe.state.resolved.value).toBe(false);
  });

  for (const context of ['user', 'token'] as const) {
    test(`поздний отказ старого ${context} не очищает новое состояние`, async (): Promise<void> => {
      const probe = fixture();
      await probe.module.refreshManagerInquiries();
      let release!: (value: Response) => void;
      let rechecks = 0;
      probe.setRequest((path: string): Promise<Response> => {
        if (path === 'access') {
          rechecks++;

          return Promise.resolve(Response.json({ allowed: false }));
        }

        return new Promise<Response>(resolve => {
          release = resolve;
        });
      });
      const pending = probe.module.managerRequest('inquiries/example');
      if (context === 'user') probe.user.value = { id: 'another-operator' };
      else probe.setToken('another-session');
      release(new Response('', { status: 403 }));
      await expect(pending).rejects.toThrow('Нет доступа к этому действию');

      expect(rechecks).toBe(0);
      expect(probe.routeClears()).toBe(0);
    });
  }
});
