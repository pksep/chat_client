import { expect, mock, test } from 'bun:test';
import { createNativePushRegistrationRetry } from '../src/services/native-push-registration-retry';

function fixture() {
  let enabled = true;
  const timers = new Map<unknown, { callback: () => void; delay: number }>();
  const register = mock(async (_provider: string, _token: string) => false);
  const retry = createNativePushRegistrationRetry({
    enabled: () => enabled,
    register,
    schedule(callback, delay) {
      const key = {};
      timers.set(key, { callback, delay });
      return key;
    },
    cancel: timer => timers.delete(timer)
  });
  return {
    retry,
    timers,
    register,
    disable: () => {
      enabled = false;
      retry.clear();
    }
  };
}

test('обе регистрации после потери сети повторяются при восстановлении без дубликатов', async () => {
  const f = fixture();
  await Promise.all([
    f.retry.register('firebase', 'fcm'),
    f.retry.register('rustore', 'ru')
  ]);
  expect(f.register).toHaveBeenCalledTimes(2);
  expect([...f.timers.values()][0].delay).toBe(2000);
  f.register.mockResolvedValue(true);
  await Promise.all([f.retry.retryNow(), f.retry.retryNow()]);
  expect(f.register).toHaveBeenCalledTimes(4);
  expect(f.timers.size).toBe(0);
  await f.retry.register('firebase', 'fcm');
  await f.retry.retryNow();
  expect(f.register).toHaveBeenCalledTimes(4);
});

test('без события online не теряет повтор и ограничивает задержку минутой', async () => {
  const f = fixture();
  await f.retry.register('firebase', 'fcm');
  const delays: number[] = [];
  for (let i = 0; i < 9; i++) {
    const [key, task] = [...f.timers][0];
    f.timers.delete(key);
    delays.push(task.delay);
    task.callback();
    await f.retry.retryNow();
  }
  expect(delays.slice(0, 3)).toEqual([2000, 4000, 8000]);
  expect(delays.at(-1)).toBe(60_000);
  f.disable();
});

test('выход отменяет очередь, а поздний ответ не блокирует регистрацию нового сеанса', async () => {
  const f = fixture();
  let finish!: (success: boolean) => void;
  f.register.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const old = f.retry.register('firebase', 'old');
  await Promise.resolve();
  f.retry.clear();
  f.register.mockResolvedValue(true);
  await f.retry.register('firebase', 'new');
  finish(false);
  await old;
  await f.retry.retryNow();
  expect(f.register).toHaveBeenCalledTimes(2);
  expect(f.timers.size).toBe(0);
  f.disable();
  await f.retry.register('rustore', 'unused');
  expect(f.register).toHaveBeenCalledTimes(2);
});

test('ошибка старого токена не возвращает его после ротации', async () => {
  const f = fixture();
  let finish!: (success: boolean) => void;
  f.register.mockImplementationOnce(
    () =>
      new Promise(resolve => {
        finish = resolve;
      })
  );
  const old = f.retry.register('firebase', 'old');
  await Promise.resolve();
  f.register.mockResolvedValue(true);
  await f.retry.register('firebase', 'new');
  finish(false);
  await old;
  await f.retry.retryNow();
  expect(f.register).toHaveBeenCalledTimes(2);
  expect(f.timers.size).toBe(0);
});

test('очистка до отправки запроса не регистрирует токен предыдущего сеанса', async () => {
  const f = fixture();
  const old = f.retry.register('firebase', 'old');
  f.retry.clear();
  f.register.mockResolvedValue(true);
  await f.retry.register('firebase', 'new');
  await old;
  expect(f.register).toHaveBeenCalledTimes(1);
  expect(f.register).toHaveBeenCalledWith('firebase', 'new');
  expect(f.timers.size).toBe(0);
});
