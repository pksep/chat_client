import { expect, mock, test } from 'bun:test';
const syncActiveCalls = mock(
  async (_calls: unknown[], _replace: boolean) => {}
);
mock.module('../src/services/useLiveKit', () => ({ syncActiveCalls }));
const { syncServerActiveCalls } = await import('../src/services/useCalls');
const { activeGroupCalls, ACTIVE_CALL_SESSION_STORAGE_KEY } = await import(
  '../src/services/useCallState'
);

test('SDK звонков нужен для серверного, локального и сохранённого звонка; пустая синхронизация его не вызывает', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: { getItem: (key: string) => storage.get(key) ?? null }
    }
  });
  try {
    await syncServerActiveCalls([]);
    expect(syncActiveCalls).toHaveBeenCalledTimes(0);
    const calls = [{ roomId: 'room', topicId: 'topic', callType: 'livekit' }];
    await syncServerActiveCalls(calls);
    expect(syncActiveCalls).toHaveBeenLastCalledWith(calls, true);
    activeGroupCalls.value = { topic: { topicId: 'topic', roomId: 'room' } };
    await syncServerActiveCalls([]);
    expect(syncActiveCalls).toHaveBeenCalledTimes(2);
    activeGroupCalls.value = {};
    storage.set(ACTIVE_CALL_SESSION_STORAGE_KEY, '{"roomId":"room"}');
    await syncServerActiveCalls([]);
    expect(syncActiveCalls).toHaveBeenCalledTimes(3);
  } finally {
    activeGroupCalls.value = {};
    if (original) Object.defineProperty(globalThis, 'window', original);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
