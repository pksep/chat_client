import assert from 'node:assert/strict';
import {
  processMastraEventStream,
  getMastraToolError
} from '../src/services/mastraEventStream';

const encoder = new TextEncoder();
const events: string[] = [];
await processMastraEventStream(
  new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"tool-error"}\r'));
        controller.enqueue(
          encoder.encode(
            '\n\r\ndata: {"type":"text-delta","payload":{"text":"Готово"}}\n\ndata: {"type":"finish"}'
          )
        );
        controller.close();
      }
    })
  ),
  event => {
    events.push(event.type || '');
  }
);
assert.deepEqual(events, ['tool-error', 'text-delta', 'finish']);

for (const expected of [
  new Error('terminal stream error'),
  new SyntaxError('callback failure')
]) {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"error"}\n\n'));
      },
      cancel() {
        cancelled = true;
      }
    })
  );
  await assert.rejects(
    processMastraEventStream(response, () => {
      throw expected;
    }),
    error => error === expected
  );
  assert.equal(cancelled, true);
  assert.equal(response.body?.locked, false);
}
console.log(
  'Поток: промежуточные события, EOF и закрытие после терминальной ошибки проверены.'
);

for (const result of [
  { isError: true, code: 'TOOL_RESULT_TOO_LARGE' },
  { result: { isError: true, code: 'TOOL_CALL_LIMIT_REACHED' } },
  { output: { success: false, message: 'Не хватает параметров.' } },
  { structuredContent: { success: false } },
  { status: 'failed', error: { message: 'Ошибка записи.' } },
  { content: [{ type: 'text', text: JSON.stringify({ success: false }) }] }
]) {
  assert.ok(getMastraToolError({ type: 'tool-result', payload: { result } }));
}
for (const result of [
  { success: true },
  {
    data: [{ status: 'failed', error: 'Запись в отчёте, а не ошибка запроса' }]
  },
  { content: [{ type: 'text', text: 'Ошибок нет' }] }
]) {
  assert.equal(
    getMastraToolError({ type: 'tool-result', payload: { result } }),
    null
  );
}
let malformedCancelled = false;
const malformed = new Response(
  new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {broken}\n\n'));
    },
    cancel() {
      malformedCancelled = true;
    }
  })
);
await assert.rejects(
  processMastraEventStream(malformed, () => {}),
  /Не удалось прочитать часть ответа/
);
assert.equal(malformedCancelled, true);
assert.equal(malformed.body?.locked, false);

// Завершённое сообщение не принимает следующие события даже из того же сетевого пакета.
for (const terminal of ['finish', 'tool-call-approval']) {
  let cancelled = false;
  const seen: string[] = [];
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: terminal })}\n\ndata: {"type":"text-delta","payload":{"text":"Поздний ответ"}}\n\n`
          )
        );
      },
      cancel() {
        cancelled = true;
      }
    })
  );
  await processMastraEventStream(response, event => {
    seen.push(event.type!);
    if (event.type === terminal) return false;
  });
  assert.deepEqual(seen, [terminal]);
  assert.equal(cancelled, true);
  assert.equal(response.body?.locked, false);
}

for (const alreadyAborted of [false, true]) {
  const abort = new AbortController();
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      cancel() {
        cancelled = true;
      }
    })
  );
  if (alreadyAborted) abort.abort();
  const reading = processMastraEventStream(
    response,
    () => {
      assert.fail('Отменённый ответ не должен изменять историю');
    },
    abort.signal
  );
  abort.abort();
  await assert.rejects(
    reading,
    error => error instanceof Error && error.name === 'AbortError'
  );
  assert.equal(cancelled, true);
  assert.equal(response.body?.locked, false);
}
console.log(
  'Поток: остановка на подтверждении/завершении и отмена зависшего чтения проверены.'
);
