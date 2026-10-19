import { expect, test } from 'bun:test';
import { createSocketReconnectScheduler } from '../src/services/socket-reconnect';

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('отказ namespace повторяется один раз при перекрывающихся сигналах', async () => {
  let connects = 0;
  const attempts: number[] = [];
  const socket = { connected: false, active: false, connect: () => connects++ };
  const retry = createSocketReconnectScheduler({
    getSocket: () => socket,
    isEnabled: () => true,
    initialDelayMs: 20,
    onAttempt: (_, attempt) => attempts.push(attempt)
  });
  for (let i = 0; i < 100; i++) retry.schedule('503');
  await wait(40);
  expect(connects).toBe(1);
  expect(attempts).toEqual([1]);
  retry.reset();
});

test('повтор не конкурирует с уже работающим Manager', async () => {
  let connects = 0;
  const socket = { connected: false, active: false, connect: () => connects++ };
  const retry = createSocketReconnectScheduler({
    getSocket: () => socket,
    isEnabled: () => true,
    initialDelayMs: 10,
    onAttempt: () => {}
  });
  retry.schedule('503');
  socket.active = true;
  await wait(30);
  retry.schedule('poll');
  await wait(30);
  expect(connects).toBe(0);
  retry.reset();
});

test('выход, отмена и замена SDK отменяют отложенное подключение', async () => {
  for (const action of ['logout', 'cancel', 'replace'] as const) {
    let connects = 0;
    let enabled = true;
    let socket = { connected: false, active: false, connect: () => connects++ };
    const retry = createSocketReconnectScheduler({
      getSocket: () => socket,
      isEnabled: () => enabled,
      initialDelayMs: 10,
      onAttempt: () => {}
    });
    retry.schedule('503');
    if (action === 'logout') enabled = false;
    if (action === 'cancel') retry.reset();
    if (action === 'replace') socket = { ...socket };
    await wait(30);
    expect(connects).toBe(0);
    retry.reset();
  }
});

test('серия отказов увеличивает задержку до предела, успех сбрасывает серию', async () => {
  const attempts: number[] = [];
  const socket = { connected: false, active: false, connect: () => {} };
  const retry = createSocketReconnectScheduler({
    getSocket: () => socket,
    isEnabled: () => true,
    initialDelayMs: 15,
    maxDelayMs: 30,
    onAttempt: (_, attempt) => attempts.push(attempt)
  });
  retry.schedule('503');
  await wait(35);
  retry.schedule('503');
  await wait(20);
  expect(attempts).toEqual([1]);
  await wait(25);
  expect(attempts).toEqual([1, 2]);
  retry.reset();
  retry.schedule('503');
  await wait(35);
  expect(attempts).toEqual([1, 2, 1]);
  retry.reset();
});
