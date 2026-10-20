import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

interface EventInput {
  origin: string;
  source: object;
  data: Record<string, unknown>;
}

interface Inquiry {
  id: string;
  name: string;
  contacts: { name: string; phone: string; email: string };
  erp_contact_id: number | null;
}

interface Flow {
  openErpContact(inquiry: Inquiry): Promise<unknown>;
  receiveContact(event: EventInput): Promise<void>;
}

const compiled = ts.transpileModule(
  readFileSync(
    new URL('../src/composables/useErpContact.ts', import.meta.url),
    'utf8'
  ),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS
    }
  }
).outputText;

function fixture(linked = true): {
  flow: Flow;
  open(): Promise<void>;
  saved(overrides?: Partial<EventInput>): Promise<void>;
  actor: { value: { id: string } };
  posted: Array<Record<string, unknown>>;
  calls: Array<{ path: string; body: Record<string, unknown> }>;
  state: {
    states: string[];
    reads: number;
    refreshes: number;
    changeActorOnRead: boolean;
  };
} {
  const actor = { value: { id: 'operator' } };
  const posted: Array<Record<string, unknown>> = [];
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  const state = {
    states: ['pending', 'completed'],
    reads: 0,
    refreshes: 0,
    changeActorOnRead: false
  };
  const inquiry: Inquiry = {
    id: 'inquiry',
    name: 'Клиент Telegram',
    contacts: { name: 'Клиент Telegram', phone: '', email: '' },
    erp_contact_id: linked ? 15 : null
  };
  let requestId = '';
  let operationId = '';
  const popup = {
    closed: false,
    close(): void {
      this.closed = true;
    },
    location: {
      replace(url: string): void {
        requestId = new URL(url).searchParams.get('managerContact') || '';
      }
    },
    postMessage(message: Record<string, unknown>): void {
      posted.push(message);
    }
  };
  const modules: Record<string, unknown> = {
    './useAuth': { authedUser: actor },
    '../services/useConfig': {
      getConfig: (): { CHAT_ERP_URL: string } => ({
        CHAT_ERP_URL: 'https://erp.test/'
      })
    },
    './useManagerInquiries': {
      managerRequest: async (
        path: string,
        body: Record<string, unknown>
      ): Promise<unknown> => {
        if (path.endsWith('/candidates')) return [];
        calls.push({ path, body });
        operationId = String(body.operationId);
        return { id: operationId };
      },
      loadInquiry: async (): Promise<unknown> => {
        state.reads++;
        if (state.changeActorOnRead) actor.value.id = 'other';
        const status = state.states.shift() || 'pending';
        return {
          inquiry: { ...inquiry, erp_contact_id: 15 },
          erpOperations: [{ id: operationId, state: status }]
        };
      },
      refreshManagerInquiries: async (): Promise<void> => {
        state.refreshes++;
      }
    }
  };
  const flow = new Function(
    'require',
    'exports',
    'window',
    'setInterval',
    'clearInterval',
    'setTimeout',
    `${compiled}\nreturn { openErpContact, receiveContact };`
  )(
    (name: string): unknown => {
      if (!(name in modules)) throw new Error(name);
      return modules[name];
    },
    {},
    {
      open: (): typeof popup => popup,
      addEventListener: (): void => {},
      location: { origin: 'https://chat.test' }
    },
    (): number => 1,
    (): void => {},
    (callback: () => void): number => {
      callback();
      return 1;
    }
  ) as Flow;

  return {
    flow,
    actor,
    posted,
    calls,
    state,
    open: async (): Promise<void> => {
      await flow.openErpContact(inquiry);
    },
    saved: async (overrides = {}): Promise<void> => {
      await flow.receiveContact({
        origin: 'https://erp.test',
        source: popup,
        data: { type: 'sep:manager-contact:saved', requestId, contactId: 15 },
        ...overrides
      });
    }
  };
}

for (const linked of [false, true]) {
  test(`сохранение ${linked ? 'связанного' : 'нового'} контакта ждёт обновления, не только наличия ID`, async (): Promise<void> => {
    const context = fixture(linked);
    await context.open();
    await context.saved();
    expect(context.calls).toHaveLength(1);
    expect(context.calls[0].path).toBe('inquiries/inquiry/erp/sync');
    expect(context.state.reads).toBe(2);
    expect(context.state.refreshes).toBe(1);
    expect(context.posted.at(-1)?.type).toBe('sep:manager-contact:linked');
  });
}

test('ошибка операции не превращается в успех из-за прежнего ID контакта', async (): Promise<void> => {
  const context = fixture();
  context.state.states = ['failed'];
  await context.open();
  await context.saved();
  expect(context.posted.at(-1)?.type).toBe('sep:manager-contact:link-error');
  expect(context.state.refreshes).toBe(0);
});

test('чужая вкладка и адрес не могут обновить реквизиты', async (): Promise<void> => {
  const context = fixture();
  await context.open();
  await context.saved({ origin: 'https://other.test' });
  await context.saved({ source: {} });
  expect(context.calls).toHaveLength(0);
  await context.saved();
  expect(context.calls).toHaveLength(1);
});

test('смена аккаунта во время чтения не подтверждает привязку от другого сотрудника', async (): Promise<void> => {
  const context = fixture();
  context.state.changeActorOnRead = true;
  await context.open();
  await context.saved();
  expect(context.state.refreshes).toBe(0);
  expect(context.posted).toHaveLength(0);
});

test('повтор события сохранения не создаёт вторую операцию', async (): Promise<void> => {
  const context = fixture();
  await context.open();
  await Promise.all([context.saved(), context.saved()]);
  expect(context.calls).toHaveLength(1);
});

test('долгая синхронизация не выдаётся за завершённую', async (): Promise<void> => {
  const context = fixture();
  context.state.states = [];
  await context.open();
  await context.saved();
  expect(context.state.reads).toBe(20);
  expect(context.posted.at(-1)?.type).toBe('sep:manager-contact:link-error');
});
