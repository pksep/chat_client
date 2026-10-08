import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import * as vue from 'vue';
import ts from 'typescript';
import type { ChatAccessValues } from '../src/types/chat-access';
import { parseUserEx } from '../src/utils/parseUserEx';

interface AccessState {
  access: Readonly<vue.Ref<Readonly<ChatAccessValues>>>;
  ready: Readonly<vue.Ref<boolean>>;
  settled: Readonly<vue.Ref<boolean>>;
}

interface AccessModule {
  useChatAccess(): AccessState;
  refreshChatAccess(): Promise<void>;
  requireAiAccess(): Promise<void>;
  fetchWithAiAccess(input: RequestInfo | URL): Promise<Response>;
}

interface ProbeUser {
  id: string;
  ex?: { erpRoleId?: number; erpRole?: string; isDeletedBot?: boolean };
}

type Request = (signal: AbortSignal) => Promise<Response>;

const scopes = new Set<vue.EffectScope>();
const source = readFileSync(
  new URL('../src/composables/useChatAccess.ts', import.meta.url),
  'utf8'
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022
  }
}).outputText;

function response(
  userId = 'actor-a',
  effective: ChatAccessValues = { client: true, ai: true }
): Response {
  return Response.json({ userId, effective });
}

function fixture(): {
  module: AccessModule;
  state: AccessState;
  user: vue.Ref<ProbeUser | null>;
  config: vue.Ref<{ CHAT_API_DOMAIN: string }>;
  signals: AbortSignal[];
  setToken(value: string | null): void;
  setRequest(value: Request): void;
} {
  const user = vue.ref<ProbeUser | null>({ id: 'actor-a' });
  const config = vue.ref({ CHAT_API_DOMAIN: 'https://synthetic.invalid/api' });
  let token: string | null = 'synthetic-session-a';
  let request: Request = async (): Promise<Response> => response();
  const signals: AbortSignal[] = [];
  const exported: AccessModule = {} as AccessModule;
  const dependencies: Record<string, object> = {
    vue,
    './useAuth': {
      authedUser: user,
      getStoredChatAccessToken: (): string | null => token,
      fetchWithAuthRedirect: (
        _url: string,
        init: { signal: AbortSignal }
      ): Promise<Response> => request(init.signal)
    },
    './useLogin': { getAuthToken: (): string | null => token },
    '../services/useConfig': {
      getConfig: (): { CHAT_API_DOMAIN: string } => config.value
    },
    '../utils/parseUserEx': { parseUserEx },
    '../utils/menu-layout-cache': {
      readMenuLayout: (): null => null,
      saveMenuLayout: (): void => {}
    }
  };
  const scope = vue.effectScope();
  scopes.add(scope);

  scope.run(() => {
    const load = (name: string): object => {
      const dependency = dependencies[name];

      if (!dependency) throw new Error(`Неизвестная зависимость: ${name}`);

      return dependency;
    };

    const fetch = async (
      _input: RequestInfo | URL,
      init: RequestInit
    ): Promise<Response> => {
      signals.push(init.signal!);

      return new Response('Синтетический ответ');
    };

    new Function('require', 'exports', 'fetch', compiled)(
      load,
      exported,
      fetch
    );
  });

  return {
    module: exported,
    state: exported.useChatAccess(),
    user,
    config,
    signals,
    setToken: (value: string | null): void => {
      token = value;
    },
    setRequest: (value: Request): void => {
      request = value;
    }
  };
}

afterEach((): void => {
  for (const scope of scopes) scope.stop();
  scopes.clear();
});

describe('стабильное меню без выдачи непроверенных прав', (): void => {
  for (const status of [429, 500, 502, 503]) {
    test(`HTTP ${status} сохраняет меню, но не подтверждает новые действия`, async (): Promise<void> => {
      const probe = fixture();
      await probe.module.refreshChatAccess();
      probe.setRequest(
        async (): Promise<Response> => new Response('', { status })
      );
      await probe.module.refreshChatAccess();

      expect(probe.state.access.value).toEqual({ client: true, ai: true });
      expect(probe.state.ready.value).toBe(false);
      expect(probe.state.settled.value).toBe(true);
      await expect(probe.module.requireAiAccess()).rejects.toThrow(
        'Не удалось проверить доступ'
      );

      probe.setRequest(async (): Promise<Response> => response());
      await probe.module.refreshChatAccess();
      expect(probe.state.ready.value).toBe(true);
      expect(probe.state.access.value).toEqual({ client: true, ai: true });
    });
  }

  for (const error of [
    new TypeError('Синтетический сетевой сбой'),
    new DOMException('Синтетический таймаут', 'AbortError')
  ]) {
    test(`${error.name} не скрывает уже разрешённые разделы`, async (): Promise<void> => {
      const probe = fixture();
      await probe.module.refreshChatAccess();
      probe.setRequest(async (): Promise<Response> => {
        throw error;
      });
      await probe.module.refreshChatAccess();

      expect(probe.state.access.value).toEqual({ client: true, ai: true });
      expect(probe.state.ready.value).toBe(false);
    });
  }

  for (const body of [
    null,
    {},
    { userId: 'actor-b', effective: { client: true, ai: true } }
  ]) {
    test(`неверный ответ ${JSON.stringify(body)} не изменяет меню и не выдаёт право`, async (): Promise<void> => {
      const probe = fixture();
      await probe.module.refreshChatAccess();
      probe.setRequest(async (): Promise<Response> => Response.json(body));
      await probe.module.refreshChatAccess();

      expect(probe.state.access.value).toEqual({ client: true, ai: true });
      expect(probe.state.ready.value).toBe(false);
      await expect(probe.module.requireAiAccess()).rejects.toThrow(
        'Не удалось проверить доступ'
      );
    });
  }

  test('первая неудачная проверка не выдаёт ни одного разрешения', async (): Promise<void> => {
    const probe = fixture();
    probe.setRequest(
      async (): Promise<Response> => new Response('', { status: 503 })
    );
    await probe.module.refreshChatAccess();

    expect(probe.state.access.value).toEqual({ client: false, ai: false });
    expect(probe.state.ready.value).toBe(false);
    expect(probe.state.settled.value).toBe(true);
  });

  for (const status of [401, 403]) {
    test(`подтверждённый HTTP ${status} закрывает оба раздела`, async (): Promise<void> => {
      const probe = fixture();
      await probe.module.refreshChatAccess();
      probe.setRequest(
        async (): Promise<Response> => new Response('', { status })
      );
      await probe.module.refreshChatAccess();

      expect(probe.state.access.value).toEqual({ client: false, ai: false });
      expect(probe.state.ready.value).toBe(true);
    });
  }

  test('подтверждённый отзыв после сбоя применяется немедленно', async (): Promise<void> => {
    const probe = fixture();
    await probe.module.refreshChatAccess();
    probe.setRequest(
      async (): Promise<Response> => new Response('', { status: 503 })
    );
    await probe.module.refreshChatAccess();
    probe.setRequest(
      async (): Promise<Response> =>
        response('actor-a', { client: false, ai: false })
    );
    await probe.module.refreshChatAccess();

    expect(probe.state.access.value).toEqual({ client: false, ai: false });
    expect(probe.state.ready.value).toBe(true);
    await expect(probe.module.requireAiAccess()).rejects.toThrow('Нет доступа');
  });

  test('отзыв одного разрешения не изменяет второе', async (): Promise<void> => {
    const probe = fixture();
    await probe.module.refreshChatAccess();
    probe.setRequest(
      async (): Promise<Response> =>
        response('actor-a', { client: false, ai: true })
    );
    await probe.module.refreshChatAccess();

    expect(probe.state.access.value).toEqual({ client: false, ai: true });
    await probe.module.requireAiAccess();
  });

  test('обновление роли того же пользователя не скрывает меню', async (): Promise<void> => {
    const probe = fixture();
    await probe.module.refreshChatAccess();
    probe.user.value = {
      id: 'actor-a',
      ex: { erpRoleId: 7, erpRole: 'Менеджер' }
    };

    expect(probe.state.access.value).toEqual({ client: true, ai: true });
    expect(probe.state.settled.value).toBe(true);
    expect(probe.state.ready.value).toBe(false);
  });

  test('удалённый профиль сразу теряет отображаемые права', async (): Promise<void> => {
    const probe = fixture();
    await probe.module.refreshChatAccess();
    probe.user.value = { id: 'actor-a', ex: { isDeletedBot: true } };

    expect(probe.state.access.value).toEqual({ client: false, ai: false });
  });

  for (const change of ['user', 'api', 'logout', 'token'] as const) {
    test(`смена ${change} не наследует ранее подтверждённые права`, async (): Promise<void> => {
      const probe = fixture();
      await probe.module.refreshChatAccess();

      if (change === 'user') probe.user.value = { id: 'actor-b' };
      if (change === 'api')
        probe.config.value = { CHAT_API_DOMAIN: 'https://other.invalid/api' };
      if (change === 'logout') probe.user.value = null;
      if (change === 'token') probe.setToken('synthetic-session-b');

      probe.setRequest(
        async (): Promise<Response> => new Response('', { status: 503 })
      );
      await probe.module.refreshChatAccess();

      expect(probe.state.access.value).toEqual({ client: false, ai: false });
      expect(probe.state.ready.value).toBe(false);
    });
  }

  test('позднее разрешение предыдущего аккаунта не применяется', async (): Promise<void> => {
    const probe = fixture();
    let release!: (value: Response) => void;
    probe.setRequest(
      (): Promise<Response> =>
        new Promise(resolve => {
          release = resolve;
        })
    );
    const pending = probe.module.refreshChatAccess();
    probe.user.value = { id: 'actor-b' };
    release(response());
    await pending;

    expect(probe.state.access.value).toEqual({ client: false, ai: false });
    expect(probe.state.ready.value).toBe(false);
  });

  test('новое AI-действие не наследует права другой сессии того же пользователя', async (): Promise<void> => {
    const probe = fixture();
    await probe.module.refreshChatAccess();
    probe.setToken('synthetic-session-b');
    probe.setRequest(
      async (): Promise<Response> => new Response('', { status: 503 })
    );

    await expect(probe.module.requireAiAccess()).rejects.toThrow(
      'Не удалось проверить доступ'
    );
    expect(probe.state.access.value).toEqual({ client: false, ai: false });
  });

  test('поздний ответ прежнего токена не выдаёт доступ новой сессии', async (): Promise<void> => {
    const probe = fixture();
    let release!: (value: Response) => void;
    probe.setRequest(
      (): Promise<Response> =>
        new Promise(resolve => {
          release = resolve;
        })
    );
    const pending = probe.module.refreshChatAccess();
    probe.setToken('synthetic-session-b');
    probe.setRequest(
      async (): Promise<Response> =>
        response('actor-a', { client: false, ai: false })
    );
    await probe.module.refreshChatAccess();
    release(response());
    await pending;

    expect(probe.state.access.value).toEqual({ client: false, ai: false });
    expect(probe.state.ready.value).toBe(true);
  });

  test('неверный JSON не скрывает меню и не разрешает AI-запрос', async (): Promise<void> => {
    const probe = fixture();
    await probe.module.refreshChatAccess();
    probe.setRequest(
      async (): Promise<Response> =>
        new Response('{', { headers: { 'Content-Type': 'application/json' } })
    );
    await probe.module.refreshChatAccess();

    expect(probe.state.access.value).toEqual({ client: true, ai: true });
    await expect(
      probe.module.fetchWithAiAccess('https://unused.invalid')
    ).rejects.toThrow('Не удалось проверить доступ');
    expect(probe.signals).toHaveLength(0);
  });

  test('сбой проверки не прерывает начатый AI-поток; настоящий отзыв прерывает', async (): Promise<void> => {
    const probe = fixture();
    await probe.module.refreshChatAccess();
    await probe.module.fetchWithAiAccess('https://unused.invalid');
    const signal = probe.signals[0];
    probe.setRequest(
      async (): Promise<Response> => new Response('', { status: 503 })
    );
    await probe.module.refreshChatAccess();

    expect(signal.aborted).toBe(false);

    probe.setRequest(
      async (): Promise<Response> =>
        response('actor-a', { client: true, ai: false })
    );
    await probe.module.refreshChatAccess();

    expect(signal.aborted).toBe(true);
    expect(probe.state.access.value.client).toBe(true);
  });
});
