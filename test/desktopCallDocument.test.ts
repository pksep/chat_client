import { expect, test } from 'bun:test';
import { waitForDesktopCallDocument } from '../src/services/desktop-call-document';
import type { CallRenderWindow } from '../src/components/Desktop/call-window-context';

test('ждёт конечный документ вместо временного about:blank WebKit', async () => {
  const temporary = { body: {}, readyState: 'complete', URL: 'about:blank' };
  const final = {
    body: {},
    readyState: 'complete',
    URL: 'about:blank#sep-chat-call'
  };
  const host = { document: temporary, closed: false };
  setTimeout(() => {
    host.document = final;
  }, 30);
  expect(
    await waitForDesktopCallDocument(
      host as unknown as CallRenderWindow,
      new AbortController().signal
    )
  ).toBe(final as any);
});

test('закрытие и отмена не продолжают монтирование окна', async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(
    waitForDesktopCallDocument(
      { closed: false } as CallRenderWindow,
      abort.signal
    )
  ).rejects.toMatchObject({ name: 'AbortError' });
  await expect(
    waitForDesktopCallDocument(
      { closed: true } as CallRenderWindow,
      new AbortController().signal
    )
  ).rejects.toThrow('Окно звонка закрыто');
});

test('не монтирует в недогруженный конечный документ', async () => {
  const host = {
    document: {
      body: {},
      readyState: 'loading',
      URL: 'about:blank#sep-chat-call'
    },
    closed: false
  };
  await expect(
    waitForDesktopCallDocument(
      host as unknown as CallRenderWindow,
      new AbortController().signal,
      30
    )
  ).rejects.toThrow('Окно звонка не подготовилось');
});

test('ожидает доступ к документу при временном SecurityError другого WebView', async () => {
  let reads = 0;
  const final = {
    body: {},
    readyState: 'complete',
    URL: 'about:blank#sep-chat-call'
  };
  const host = {
    closed: false,
    get document() {
      if (++reads < 3) throw { name: 'SecurityError' };
      return final;
    }
  };
  expect(
    await waitForDesktopCallDocument(
      host as unknown as CallRenderWindow,
      new AbortController().signal
    )
  ).toBe(final as any);
});
