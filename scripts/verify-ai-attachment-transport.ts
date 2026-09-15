import assert from 'node:assert/strict';
import { fetchAiAttachmentResponse } from '../src/services/aiAttachmentTransport';

const originalFetch = globalThis.fetch;
const originalTimeout = AbortSignal.timeout;
let calls = 0;
const url = 'https://qa.invalid/media/ai-attachments/upload-target';
try {
  globalThis.fetch = (async () => {
    calls++;
    throw new TypeError(
      'Failed to fetch https://internal.invalid Bearer secret'
    );
  }) as typeof fetch;
  await assert.rejects(fetchAiAttachmentResponse(url, { method: 'POST' }), {
    message:
      'Не удалось связаться с сервером файлов. Проверьте соединение и повторите отправку.'
  });
  assert.equal(calls, 1, 'Сетевая ошибка не вызывает автоматического повтора');

  const cancelled = new AbortController();
  cancelled.abort();
  await assert.rejects(
    fetchAiAttachmentResponse(url, { signal: cancelled.signal }),
    {
      message: 'Подготовка вложений отменена.'
    }
  );

  const timedOut = new AbortController();
  timedOut.abort(new DOMException('Timeout', 'TimeoutError'));
  AbortSignal.timeout = () => timedOut.signal;
  await assert.rejects(fetchAiAttachmentResponse(url, {}), {
    message:
      'Сервер файлов не ответил вовремя. Попробуйте отправить сообщение позже.'
  });
  AbortSignal.timeout = originalTimeout;

  for (const status of [200, 401, 413, 503]) {
    const expected = new Response('{}', { status });
    globalThis.fetch = (async (actualUrl, init) => {
      assert.equal(actualUrl, url);
      assert.equal(init?.method, 'POST');
      assert.equal(init?.body, '{"attachmentIds":[]}');
      assert.equal(
        (init?.headers as Record<string, string>).Authorization,
        'Bearer qa-only'
      );
      assert.ok(init?.signal);
      return expected;
    }) as typeof fetch;
    assert.equal(
      await fetchAiAttachmentResponse(url, {
        method: 'POST',
        body: '{"attachmentIds":[]}',
        headers: { Authorization: 'Bearer qa-only' }
      }),
      expected,
      'HTTP-ответ передаётся штатной проверке авторизации/ошибки'
    );
  }
  console.log(
    'AI attachment transport: 7 проверок успешно, 0 падений, 0 пропусков.'
  );
} finally {
  globalThis.fetch = originalFetch;
  AbortSignal.timeout = originalTimeout;
}
