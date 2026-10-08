import { expect, test } from 'bun:test';
import { createNetworkReachabilityCheck } from '../src/services/network-reachability';

const deferred = () => {
  let resolve!: (reachable: boolean) => void;
  const promise = new Promise<boolean>(done => {
    resolve = done;
  });
  return { promise, resolve };
};

test('зависшая проверка завершается по таймауту и отменяет запрос', async () => {
  const results: boolean[] = [];
  let signal!: AbortSignal;
  const check = createNetworkReachabilityCheck({
    isEnabled: () => true,
    timeoutMs: 20,
    probe: async currentSignal => {
      signal = currentSignal;
      return new Promise<boolean>(() => {});
    },
    onResult: reachable => results.push(reachable)
  });
  await check.check();
  expect(signal.aborted).toBe(true);
  expect(results).toEqual([false]);
});

test('перекрывающиеся проверки не создают параллельные запросы', async () => {
  const gate = deferred();
  let requests = 0;
  const results: boolean[] = [];
  const check = createNetworkReachabilityCheck({
    isEnabled: () => true,
    timeoutMs: 1000,
    probe: () => {
      requests++;
      return gate.promise;
    },
    onResult: reachable => results.push(reachable)
  });
  const first = check.check();
  await Promise.all(Array.from({ length: 100 }, () => check.check()));
  expect(requests).toBe(1);
  gate.resolve(true);
  await first;
  expect(results).toEqual([true]);
});

test('результат старой сети не перезаписывает состояние нового соединения', async () => {
  const firstGate = deferred();
  const results: boolean[] = [];
  let requests = 0;
  const check = createNetworkReachabilityCheck({
    isEnabled: () => true,
    timeoutMs: 1000,
    probe: () => (++requests === 1 ? firstGate.promise : Promise.resolve(true)),
    onResult: reachable => results.push(reachable)
  });
  const first = check.check();
  await Promise.resolve();
  check.invalidate();
  await check.check();
  firstGate.resolve(false);
  await first;
  expect(results).toEqual([true]);
});

test('скрытая вкладка не проверяет сеть и игнорирует незавершённый результат', async () => {
  const gate = deferred();
  const results: boolean[] = [];
  let enabled = false;
  let requests = 0;
  const check = createNetworkReachabilityCheck({
    isEnabled: () => enabled,
    timeoutMs: 1000,
    probe: () => {
      requests++;
      return gate.promise;
    },
    onResult: reachable => results.push(reachable)
  });
  await check.check();
  expect(requests).toBe(0);
  enabled = true;
  const first = check.check();
  await Promise.resolve();
  enabled = false;
  gate.resolve(false);
  await first;
  expect(results).toEqual([]);
});
