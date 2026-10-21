import { expect, test } from 'bun:test';
import {
  createTelemetryTabs,
  TELEMETRY_TAB_KEY_PREFIX,
  TELEMETRY_TAB_STALE_MS
} from '../src/services/telemetry-tabs';

const createStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: index => Array.from(values.keys())[index] ?? null,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: key => {
      values.delete(key);
    },
    clear: () => values.clear()
  };
};

const createState = () => ({
  userId: 'user' as string | null,
  visibility: 'hidden',
  hasFocus: false,
  callRoomId: null as string | null,
  callState: 'none' as 'none' | 'active'
});

test('считает вкладки одного пользователя, включая скрытую вкладку со звонком', () => {
  const storage = createStorage();
  const firstState = createState();
  firstState.visibility = 'visible';
  const secondState = createState();
  secondState.callRoomId = 'livekit-call';
  secondState.callState = 'active';
  const first = createTelemetryTabs({
    pageInstanceId: 'first',
    getStorage: () => storage,
    getState: () => firstState
  });
  const second = createTelemetryTabs({
    pageInstanceId: 'second',
    getStorage: () => storage,
    getState: () => secondState
  });
  first.snapshot();
  second.snapshot();
  expect(first.snapshot()).toMatchObject({
    status: 'available',
    openTabCount: 2,
    staleTabCount: 0,
    visibleTabCount: 1,
    tabsWithCallCount: 1
  });
  expect(first.snapshot().tabs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        pageInstanceId: 'second',
        visibility: 'hidden',
        callRoomId: 'livekit-call'
      })
    ])
  );
  secondState.userId = 'other-user';
  second.snapshot();
  expect(first.snapshot().openTabCount).toBe(1);
  secondState.userId = null;
  expect(second.snapshot().status).toBe('unauthenticated');
  expect(storage.length).toBe(1);
});

test('закрытие, refresh и возврат из BFCache не удваивают счётчик', () => {
  const storage = createStorage();
  const createTab = (pageInstanceId: string) =>
    createTelemetryTabs({
      pageInstanceId,
      getStorage: () => storage,
      getState: createState
    });
  const first = createTab('first');
  const second = createTab('second');
  first.snapshot();
  second.snapshot();
  second.suspend();
  expect(first.snapshot().openTabCount).toBe(1);
  expect(second.snapshot().status).toBe('suspended');
  expect(first.snapshot().openTabCount).toBe(1);
  const refreshed = createTab('refreshed');
  expect(refreshed.snapshot().openTabCount).toBe(2);
  refreshed.suspend();
  second.resume();
  expect(second.snapshot().openTabCount).toBe(2);
  expect(storage.getItem(`${TELEMETRY_TAB_KEY_PREFIX}refreshed`)).toBeNull();
});

test('отделяет неподтверждённые вкладки после зависания и удаляет старые записи', () => {
  const storage = createStorage();
  let now = 1_000;
  const createTab = (pageInstanceId: string) =>
    createTelemetryTabs({
      pageInstanceId,
      getStorage: () => storage,
      getState: createState,
      now: () => now
    });
  const first = createTab('first');
  const frozen = createTab('frozen');
  frozen.snapshot();
  now += TELEMETRY_TAB_STALE_MS + 1;
  expect(first.snapshot()).toMatchObject({ openTabCount: 1, staleTabCount: 1 });
  expect(first.snapshot().tabs).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ pageInstanceId: 'frozen', presence: 'stale' })
    ])
  );
  frozen.snapshot();
  expect(first.snapshot()).toMatchObject({ openTabCount: 2, staleTabCount: 0 });
  now += 25 * 60 * 60 * 1000;
  expect(first.snapshot()).toMatchObject({ openTabCount: 1, staleTabCount: 0 });
  expect(storage.length).toBe(1);
});

test('недоступное хранилище даёт неизвестное число вкладок, а не ложную единицу', () => {
  const tabs = createTelemetryTabs({
    pageInstanceId: 'page',
    getState: createState,
    getStorage: () => {
      throw new Error('Доступ запрещён');
    }
  });
  expect(tabs.snapshot()).toMatchObject({
    status: 'storage-unavailable',
    openTabCount: null
  });
  expect(() => tabs.suspend()).not.toThrow();
});

test('общее число не обрезается вместе со списком вкладок в телеметрии', () => {
  const storage = createStorage();
  let lastTab!: ReturnType<typeof createTelemetryTabs>;
  for (let index = 0; index < 25; index++) {
    lastTab = createTelemetryTabs({
      pageInstanceId: `page-${index}`,
      getStorage: () => storage,
      getState: createState
    });
    lastTab.snapshot();
  }
  const snapshot = lastTab.snapshot();
  expect(snapshot.openTabCount).toBe(25);
  expect(snapshot.tabs?.length).toBe(20);
  expect(snapshot.omittedTabCount).toBe(5);
});
