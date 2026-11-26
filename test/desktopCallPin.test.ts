import { expect, test } from 'bun:test';
import { setDesktopCallPinned } from '../src/services/desktop-call-pin';

test('ждёт асинхронное подтверждение оконного менеджера', async () => {
  let applied = false;
  let completed = false;
  const operation = setDesktopCallPinned(
    {
      setAlwaysOnTop: async enabled => {
        setTimeout(() => {
          applied = enabled;
        }, 50);
      },
      isAlwaysOnTop: async () => applied
    },
    true
  ).then(() => {
    completed = true;
  });
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(completed).toBe(false);
  await operation;
  expect(applied).toBe(true);
});

test('отказ IPC не считается успешным закреплением', async () => {
  await expect(
    setDesktopCallPinned(
      {
        setAlwaysOnTop: async () => {
          throw new Error('отказ');
        },
        isAlwaysOnTop: async () => false
      },
      true
    )
  ).rejects.toThrow('отказ');
});
