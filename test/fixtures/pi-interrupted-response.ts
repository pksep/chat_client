import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

// Подмена действует только в дочернем процессе теста.
let call = 0;
let failedOverAfterWrite = false;

async function gateway(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const request = new Request(input, init);
  if (request.url === 'https://codex-lb.pksep.ru/v1/models') {
    return Response.json({ data: [{ id: 'gpt-6.2-sol' }] });
  }

  if (request.url !== 'https://codex-lb.pksep.ru/v1/responses') {
    throw new Error('Неожиданный запрос в тесте');
  }

  const body = await request.json();
  if (
    JSON.stringify(body).includes('Ты переводчик коротких публичных пояснений')
  ) {
    const inputText = JSON.stringify(body.input);
    if (
      !inputText.includes('Preparing cat SVG paths') ||
      !inputText.includes('Implementing path conversion') ||
      inputText.includes('PRIVATE_TEST_MARKER') ||
      inputText.includes('Нарисуйте котика') ||
      body.tools?.length
    ) {
      throw new Error('В запрос перевода переданы неверные данные.');
    }
    const message = {
      id: 'msg_translation',
      role: 'assistant',
      type: 'message',
      content: [
        {
          type: 'output_text',
          text: JSON.stringify([
            'Готовлю SVG-контуры кота',
            'Реализую преобразование контуров'
          ]),
          annotations: []
        }
      ]
    };
    const events = [
      {
        type: 'response.output_item.added',
        output_index: 0,
        item: { ...message, content: [] }
      },
      { type: 'response.output_item.done', output_index: 0, item: message },
      {
        type: 'response.completed',
        response: {
          id: 'resp_translation',
          status: 'completed',
          output: [message]
        }
      }
    ];

    return new Response(
      events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''),
      {
        headers: { 'content-type': 'text/event-stream' }
      }
    );
  }

  appendFileSync(
    join(process.env.SEP_CHAT_PI_DATA_DIR!, 'requests.jsonl'),
    JSON.stringify({
      session: request.headers.get('session-id'),
      cache: body.prompt_cache_key,
      previousResponse: body.previous_response_id,
      effort: body.reasoning?.effort,
      results: body.input.filter(
        (item: { type: string }) => item.type === 'function_call_output'
      ).length
    }) + '\n'
  );

  call++;
  const tool = {
    id: call === 6 ? 'fc_attach' : 'fc_1',
    call_id: call === 6 ? 'call_attach' : 'call_1',
    type: 'function_call',
    name: call === 6 ? 'share_file' : 'write',
    arguments: ''
  };
  const args = JSON.stringify({
    path: 'kotik.svg',
    ...(call === 6
      ? {}
      : { content: '<svg xmlns="http://www.w3.org/2000/svg"/>' })
  });
  const message = {
    id: 'msg_1',
    role: 'assistant',
    type: 'message',
    content: [
      {
        type: 'output_text',
        text: call === 5 ? 'Да, `./kotik.svg`.' : 'Готово.',
        annotations: []
      }
    ]
  };
  const events: object[] = [];

  if (call === 2) {
    const reasoning = {
      type: 'reasoning',
      id: 'rs_1',
      content: [{ type: 'reasoning_text', text: 'PRIVATE_TEST_MARKER' }],
      encrypted_content: 'PRIVATE_TEST_MARKER',
      summary: [{ type: 'summary_text', text: 'Проверяю формат рисунка.' }]
    };
    events.push({
      type: 'response.output_item.added',
      output_index: 2,
      item: { ...reasoning, summary: [] }
    });
    events.push(
      {
        type: 'response.reasoning_text.delta',
        item_id: reasoning.id,
        output_index: 2,
        content_index: 0,
        delta: 'PRIVATE_TEST_MARKER'
      },
      {
        type: 'response.reasoning_summary_text.delta',
        item_id: reasoning.id,
        output_index: 2,
        summary_index: 0,
        delta: 'Проверяю формат'
      },
      {
        type: 'response.reasoning_summary_text.done',
        item_id: reasoning.id,
        output_index: 2,
        summary_index: 0,
        text: reasoning.summary[0].text
      }
    );
    events.push({
      type: 'response.output_item.done',
      output_index: 2,
      item: reasoning
    });
  }

  if (call === 2 || call === 4) {
    const note = {
      ...message,
      id: 'msg_note',
      phase: 'commentary',
      content: [
        {
          type: 'output_text',
          text:
            call === 2 ? 'Сохраню рисунок в проекте.' : 'Проверка закончена.',
          annotations: []
        }
      ]
    };
    events.push({
      type: 'response.output_item.added',
      output_index: 1,
      item: { ...note, content: [] }
    });
    events.push({
      type: 'response.output_item.done',
      output_index: 1,
      item: note
    });
  }

  if (call <= 2 || call === 6) {
    events.push({
      type: 'response.output_item.added',
      output_index: 0,
      item: tool
    });
    events.push({
      type: 'response.function_call_arguments.delta',
      output_index: 0,
      delta: call === 1 ? args.slice(0, -10) : args
    });
  }

  if (call === 3 && !failedOverAfterWrite) {
    failedOverAfterWrite = true;
    call--;
    events.push({
      type: 'response.failed',
      response: {
        status: 'failed',
        error: { code: 'preferred_account_unavailable', message: 'Preferred account is not available' }
      }
    });
  } else if (call === 1 || call === 3) {
    events.push({
      type: 'error',
      code: 'stream_incomplete',
      message: 'upstream websocket closed before response.completed'
    });
  } else {
    const toolTurn = call === 2 || call === 6;
    const item = toolTurn ? { ...tool, arguments: args } : message;
    if (!toolTurn)
      events.push({
        type: 'response.output_item.added',
        output_index: 0,
        item: { ...message, content: [] }
      });
    events.push({ type: 'response.output_item.done', output_index: 0, item });
    events.push({
      type: 'response.completed',
      response: { id: 'resp_' + call, status: 'completed', output: [item] }
    });
  }

  return new Response(
    events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''),
    {
      headers: { 'content-type': 'text/event-stream' }
    }
  );
}

globalThis.fetch = Object.assign(gateway, {
  preconnect: globalThis.fetch.preconnect
});
