import { expect, test } from 'bun:test';
import { createReconnectRefreshCoordinator } from '../src/services/reconnect-refresh';

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
};

test('100 перекрывающихся resume/reconnect выполняют один полный refresh', async () => {
  const gate = deferred();
  const reasons: string[] = [];
  const refresh = createReconnectRefreshCoordinator<string>({
    run: async reason => {
      reasons.push(reason);
      await gate.promise;
    },
    shouldContinue: () => true,
    onError: error => {
      throw error;
    }
  });
  const first = refresh.request('native-resume');
  await Promise.resolve();
  for (let i = 0; i < 100; i++)
    expect(refresh.request('websocket-reconnect')).toBe(first);
  gate.resolve();
  await first;
  expect(reasons).toEqual(['native-resume']);
  await refresh.request('later-reconnect');
  expect(reasons).toEqual(['native-resume', 'later-reconnect']);
});

test('новый разрыв во время refresh сохраняет один повтор с последней причиной', async () => {
  const gate = deferred();
  const reasons: string[] = [];
  const refresh = createReconnectRefreshCoordinator<string>({
    run: async reason => {
      reasons.push(reason);
      await gate.promise;
    },
    shouldContinue: () => true,
    onError: error => {
      throw error;
    }
  });
  const first = refresh.request('resume');
  await Promise.resolve();
  refresh.invalidate();
  for (let i = 0; i < 100; i++) refresh.request('new-network');
  gate.resolve();
  await first;
  expect(reasons).toEqual(['resume', 'new-network']);
});

test('неудачный refresh не поглощает запрос повтора после восстановления HTTP', async () => {
  const gate = deferred();
  const reasons: string[] = [];
  const errors: unknown[] = [];
  const refresh = createReconnectRefreshCoordinator<string>({
    run: async reason => {
      reasons.push(reason);
      if (reasons.length === 1) await gate.promise;
    },
    shouldContinue: () => true,
    onError: error => {
      errors.push(error);
    }
  });
  const first = refresh.request('resume');
  await Promise.resolve();
  refresh.request('http-recovered');
  gate.reject(new Error('HTTP offline'));
  await first;
  expect(errors).toHaveLength(1);
  expect(reasons).toEqual(['resume', 'http-recovered']);
});

test('переход offline отменяет очередь, следующий online запускает новый refresh', async () => {
  const gate = deferred();
  let online = true;
  const reasons: string[] = [];
  const refresh = createReconnectRefreshCoordinator<string>({
    run: async reason => {
      reasons.push(reason);
      await gate.promise;
    },
    shouldContinue: () => online,
    onError: error => {
      throw error;
    }
  });
  const first = refresh.request('resume');
  await Promise.resolve();
  refresh.invalidate();
  refresh.request('network-change');
  online = false;
  gate.resolve();
  await first;
  expect(reasons).toEqual(['resume']);
  online = true;
  await refresh.request('online');
  expect(reasons).toEqual(['resume', 'online']);
});
