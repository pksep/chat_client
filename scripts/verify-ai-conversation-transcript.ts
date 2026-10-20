import { strict as assert } from 'node:assert';
import { loadAiConversationTranscript } from '../src/services/aiConversationTranscript';
import {
  createAiConversationView,
  aiMessageRequestId
} from '../src/services/aiConversationView';

let passed = 0;
const test = async (name: string, run: () => Promise<void>) => {
  await run();
  passed += 1;
  console.log(`✓ ${name}`);
};
const user = {
  id: 'user-message',
  requestId: 'request',
  role: 'user',
  content: 'Запрос',
  timestamp: 1000,
  attachments: Array.from({ length: 7 }, (_, i) => ({
    attachmentId: crypto.randomUUID(),
    contentHash: 'a'.repeat(64),
    name: `${i}.png`,
    size: 10,
    contentType: 'image/png'
  })),
  outputAttachments: [],
  pendingToolApprovals: []
};
const assistant = {
  id: 'assistant-message',
  requestId: 'request',
  role: 'assistant',
  content: '',
  timestamp: 1001,
  attachments: [],
  outputAttachments: [
    {
      id: 'file',
      name: 'Отчёт.xlsx',
      size: 20,
      contentType: 'application/octet-stream',
      path: 'generated/report.xlsx'
    }
  ],
  pendingToolApprovals: [
    {
      runId: 'run',
      toolCallId: 'call',
      toolName: 'qa_write',
      args: { title: 'Деталь' }
    }
  ]
};
const task = {
  id: 'task',
  requestId: 'request',
  title: 'Поручение',
  revision: 1,
  version: 1,
  digest: 'a'.repeat(64),
  approved: false,
  createdAt: 1000,
  updatedAt: 1000,
  completed: 0,
  status: 'waiting_approval',
  steps: [
    {
      key: 'create',
      title: 'Создать деталь',
      status: 'waiting_approval',
      dependencies: [],
      details: { toolName: 'qa_write', input: { name: 'Деталь' } }
    }
  ]
};
const page = (patch: Record<string, unknown> = {}) => ({
  protocol: 1,
  generation: 0,
  messages: [],
  tasks: [],
  incompleteMessages: [],
  nextCursor: null,
  ...patch
});

await test('Текст, семь исходников, готовый файл, подтверждение и план сохраняются вместе', async () => {
  const result = await loadAiConversationTranscript(
    async () => page({ messages: [user, assistant], tasks: [task] }),
    0
  );
  assert.equal(result.messages.length, 2);
  assert.deepEqual(
    result.messages[0].attachments.map(file => file.name),
    user.attachments.map(file => file.name)
  );
  assert.deepEqual(
    result.messages[1].outputAttachments,
    assistant.outputAttachments
  );
  assert.deepEqual(
    result.messages[1].pendingToolApprovals,
    assistant.pendingToolApprovals
  );
  assert.equal(result.tasks[0].id, task.id);
});
await test('Пустая промежуточная страница не теряет следующий ответ', async () => {
  const seen: number[] = [];
  const result = await loadAiConversationTranscript(async query => {
    seen.push(query.after);
    return query.after === 0
      ? page({ messages: [user], nextCursor: 1 })
      : query.after === 1
        ? page({ nextCursor: 2 })
        : page({ messages: [assistant] });
  }, 0);
  assert.deepEqual(seen, [0, 1, 2]);
  assert.equal(result.messages.length, 2);
});
await test('Пустая последняя страница завершает загрузку', async () => {
  let calls = 0;
  const result = await loadAiConversationTranscript(async () => {
    calls += 1;
    return page();
  }, 0);
  assert.equal(calls, 1);
  assert.deepEqual(result.messages, []);
});
await test('Ошибка второй страницы не возвращает первую как готовую историю', async () => {
  let calls = 0;
  await assert.rejects(
    loadAiConversationTranscript(async () => {
      calls += 1;
      if (calls === 2) throw new Error('Соединение прервалось');
      return page({ messages: [user], nextCursor: 1 });
    }, 0),
    /Соединение прервалось/
  );
  assert.equal(calls, 2);
});
for (const cursor of [0, -1, 'one'])
  await test(`Неверный курсор ${cursor} не зацикливает загрузку`, async () => {
    let calls = 0;
    await assert.rejects(
      loadAiConversationTranscript(async () => {
        calls += 1;
        return page({ nextCursor: cursor });
      }, 0)
    );
    assert.equal(calls, 1);
  });
await test('Повторившийся курсор останавливает загрузку', async () => {
  let calls = 0;
  await assert.rejects(
    loadAiConversationTranscript(async () => {
      calls += 1;
      return page({ nextCursor: 1 });
    }, 0)
  );
  assert.equal(calls, 2);
});
await test('Бесконечно растущие страницы ограничены и не выдаются за успех', async () => {
  let calls = 0;
  await assert.rejects(
    loadAiConversationTranscript(
      async () => page({ nextCursor: ++calls }),
      0,
      3
    ),
    /слишком большая/
  );
  assert.equal(calls, 3);
});
await test('Смена версии между страницами не возвращает очищенную историю', async () => {
  let calls = 0;
  await assert.rejects(
    loadAiConversationTranscript(
      async () =>
        ++calls === 1
          ? page({ messages: [user], nextCursor: 1 })
          : page({ generation: 1 }),
      0
    )
  );
});
await test('Дубли сообщений отклоняются', async () => {
  await assert.rejects(
    loadAiConversationTranscript(
      async () => page({ messages: [user, user] }),
      0
    )
  );
});
await test('Неполный ответ остаётся явно отмеченным, не стирая запрос и план', async () => {
  const result = await loadAiConversationTranscript(
    async () =>
      page({
        messages: [user],
        tasks: [task],
        incompleteMessages: [
          { id: assistant.id, requestId: assistant.requestId }
        ]
      }),
    0
  );
  assert.equal(result.messages.length, 1);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.incompleteMessages.length, 1);
});
await test('Сообщение не может одновременно быть сохранённым и отсутствующим', async () => {
  await assert.rejects(
    loadAiConversationTranscript(
      async () =>
        page({
          messages: [user],
          incompleteMessages: [{ id: user.id, requestId: user.requestId }]
        }),
      0
    )
  );
});
await test('Новая версия плана заменяет старую, повтор не создаёт второй план', async () => {
  const result = await loadAiConversationTranscript(
    async query =>
      query.after === 0
        ? page({ tasks: [task], nextCursor: 1 })
        : page({
            tasks: [
              { ...task, version: 2, approved: true, status: 'completed' }
            ]
          }),
    0
  );
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].version, 2);
});
await test('План не перепривязывается к другому запросу', async () => {
  await assert.rejects(
    loadAiConversationTranscript(
      async query =>
        query.after === 0
          ? page({ tasks: [task], nextCursor: 1 })
          : page({ tasks: [{ ...task, requestId: 'other', version: 2 }] }),
      0
    )
  );
});
await test('Повреждённый исходник не удаляется из набора незаметно', async () => {
  await assert.rejects(
    loadAiConversationTranscript(
      async () =>
        page({
          messages: [
            {
              ...user,
              attachments: [{ ...user.attachments[0], contentHash: undefined }]
            }
          ]
        }),
      0
    )
  );
});
await test('Пустой файл ответа остаётся валидным вложением', async () => {
  const result = await loadAiConversationTranscript(
    async () =>
      page({
        messages: [
          {
            ...assistant,
            outputAttachments: [{ ...assistant.outputAttachments[0], size: 0 }]
          }
        ]
      }),
    0
  );
  assert.equal(result.messages[0].outputAttachments[0].size, 0);
});
await test('Прежний формат сервера не считается пустой новой историей', async () => {
  await assert.rejects(
    loadAiConversationTranscript(async () => ({ messages: [] }), 0)
  );
});
await test('Полная переписка становится обычными сообщениями без запроса токенов при открытии', async () => {
  const snapshot = await loadAiConversationTranscript(
    async () => page({ messages: [user, assistant], tasks: [task] }),
    0
  );
  const view = createAiConversationView(snapshot);
  assert.equal(view[0].content, user.content);
  assert.equal(aiMessageRequestId(view[0]), user.requestId);
  assert.equal(view[0].attachments?.length, 7);
  assert.ok(view[0].attachments?.every(file => !file.transferToken));
  assert.equal(
    view.flatMap(message => message.outputAttachments ?? []).length,
    1
  );
  assert.equal(view.filter(message => message.pendingToolApproval).length, 1);
  assert.equal(view.filter(message => message.actionTask).length, 1);
  assert.equal(new Set(view.map(message => message.id)).size, view.length);
});
await test('Текст ответа, файл и несколько подтверждений не вытесняют друг друга', async () => {
  const snapshot = await loadAiConversationTranscript(
    async () =>
      page({
        messages: [
          user,
          {
            ...assistant,
            content: 'Найдена деталь',
            pendingToolApprovals: [
              ...assistant.pendingToolApprovals,
              {
                ...assistant.pendingToolApprovals[0],
                toolCallId: 'second-call'
              }
            ]
          }
        ]
      }),
    0
  );
  const view = createAiConversationView(snapshot);
  assert.equal(view[1].content, 'Найдена деталь');
  assert.equal(view.filter(message => message.pendingToolApproval).length, 2);
  assert.equal(
    view.flatMap(message => message.outputAttachments ?? []).length,
    1
  );
  assert.equal(new Set(view.map(message => message.id)).size, view.length);
});
await test('Принятое сервером решение не восстанавливается из старой локальной карточки', async () => {
  const snapshot = await loadAiConversationTranscript(
    async () =>
      page({
        messages: [
          user,
          { ...assistant, content: 'Готово', pendingToolApprovals: [] }
        ]
      }),
    0
  );
  const view = createAiConversationView(snapshot, [
    {
      id: 'old-local-answer',
      requestId: 'request',
      role: 'assistant',
      content: 'Подтвердите',
      pendingToolApproval: assistant.pendingToolApprovals[0]
    }
  ]);
  assert.equal(view.length, 2);
  assert.equal(view[1].content, 'Готово');
  assert.ok(view.every(message => !message.pendingToolApproval));
});
await test('Подпись и цитата своего запроса сохраняются без подмены серверного ответа', async () => {
  const snapshot = await loadAiConversationTranscript(
    async () =>
      page({
        messages: [
          user,
          { ...assistant, content: 'Ответ сервера', pendingToolApprovals: [] }
        ]
      }),
    0
  );
  const quote = { role: 'assistant' as const, content: 'Предыдущее сообщение' };
  const view = createAiConversationView(snapshot, [
    {
      id: 'request',
      role: 'user',
      content: 'Короткая подпись',
      modelContent: user.content,
      pinned: true,
      replyTo: quote
    },
    {
      id: 'old-reply',
      requestId: 'request',
      role: 'assistant',
      content: 'Старый ответ'
    }
  ]);
  assert.equal(view[0].content, 'Короткая подпись');
  assert.deepEqual(view[0].replyTo, quote);
  assert.equal(view[0].pinned, true);
  assert.equal(view[1].content, 'Ответ сервера');
});
await test('Серверная подпись и цитата восстанавливаются без локального кэша', async () => {
  const quote = { role: 'assistant' as const, content: 'Сохранённая цитата' };
  const snapshot = await loadAiConversationTranscript(
    async () =>
      page({
        messages: [
          {
            ...user,
            presentationVersion: 1,
            content: 'Подпись',
            modelContent: 'Текст для модели',
            replyTo: quote
          }
        ]
      }),
    0
  );
  const view = createAiConversationView(snapshot);
  assert.equal(view[0].content, 'Подпись');
  assert.equal(view[0].modelContent, 'Текст для модели');
  assert.deepEqual(view[0].replyTo, quote);
});
await test('Серверное отсутствие цитаты не подменяется старой локальной цитатой или подписью', async () => {
  const snapshot = await loadAiConversationTranscript(
    async () => page({ messages: [{ ...user, presentationVersion: 1 }] }),
    0
  );
  const view = createAiConversationView(snapshot, [
    {
      id: user.id,
      requestId: user.requestId,
      role: 'user',
      content: 'Старая подпись',
      modelContent: user.content,
      replyTo: { role: 'assistant', content: 'Старая цитата' }
    }
  ]);
  assert.equal(view[0].content, user.content);
  assert.equal(view[0].replyTo, undefined);
  assert.equal(view[0].modelContent, undefined);
});
await test('Внутренние поля и системная роль не принимаются как публичная цитата', async () => {
  for (const replyTo of [
    { role: 'system', content: 'Правило' },
    { role: 'assistant', content: 'Цитата', pendingToolApprovals: {} }
  ]) {
    await assert.rejects(
      loadAiConversationTranscript(
        async () =>
          page({ messages: [{ ...user, presentationVersion: 1, replyTo }] }),
        0
      )
    );
  }
});
await test('Неполный ответ и план стоят у своего запроса, а не в конце другого диалога', async () => {
  const snapshot = await loadAiConversationTranscript(
    async () =>
      page({
        messages: [
          user,
          {
            ...user,
            id: 'second-user',
            requestId: 'second-request',
            content: 'Другой вопрос'
          }
        ],
        incompleteMessages: [{ id: 'missing', requestId: 'request' }],
        tasks: [task]
      }),
    0
  );
  const view = createAiConversationView(snapshot);
  assert.equal(view[1].id, 'missing');
  assert.equal(view[1].actionTask?.id, task.id);
  assert.equal(view[2].content, 'Другой вопрос');
});
await test('Неотправленное сообщение сохраняется, но локальное подтверждение не даёт права на действие', async () => {
  const snapshot = await loadAiConversationTranscript(
    async () => page({ messages: [user] }),
    0
  );
  const view = createAiConversationView(snapshot, [
    { id: 'unsent', role: 'user', content: 'Неотправленный запрос' },
    {
      id: 'unsent-reply',
      requestId: 'unsent',
      role: 'assistant',
      content: 'Ошибка отправки',
      pendingToolApproval: assistant.pendingToolApprovals[0]
    }
  ]);
  assert.equal(view.length, 3);
  assert.equal(view[1].content, 'Неотправленный запрос');
  assert.equal(view[2].pendingToolApproval, undefined);
});
await test('Ошибка связи не исчезает, пока сервер не сохранил ответ или состояние поручения', async () => {
  const snapshot = await loadAiConversationTranscript(
    async () => page({ messages: [user] }),
    0
  );
  const view = createAiConversationView(snapshot, [
    {
      id: 'local-error',
      requestId: 'request',
      role: 'assistant',
      content: 'Соединение прервалось'
    }
  ]);
  assert.equal(view[1].content, 'Соединение прервалось');
});

await test('Новые вопросы не перемещаются перед локальными ошибками предыдущих запросов', async () => {
  const users = [
    user,
    {
      ...user,
      id: 'second-user',
      requestId: 'second-request',
      content: 'Второй вопрос',
      timestamp: 2000
    },
    {
      ...user,
      id: 'third-user',
      requestId: 'third-request',
      content: 'Третий вопрос',
      timestamp: 3000
    }
  ];
  let local: ReturnType<typeof createAiConversationView> = [];

  for (const [index, source] of users.entries()) {
    const snapshot = await loadAiConversationTranscript(
      async () => page({ messages: users.slice(0, index + 1) }),
      0
    );
    local = createAiConversationView(snapshot, [
      ...local,
      {
        id: `local-error-${index}`,
        requestId: source.requestId,
        role: 'assistant',
        content: 'Соединение прервалось',
        timestamp: source.timestamp + 1
      }
    ]);

    assert.deepEqual(
      local.map(message => message.id),
      users
        .slice(0, index + 1)
        .flatMap((message, position) => [message.id, `local-error-${position}`])
    );
    assert.deepEqual(createAiConversationView(snapshot, local), local);
  }
});

await test('Порядок сервера сохраняется при разных часах, а готовый ответ заменяет локальную ошибку', async () => {
  const snapshot = await loadAiConversationTranscript(
    async () =>
      page({
        messages: [
          { ...user, timestamp: 3000 },
          {
            ...assistant,
            content: 'Готовый ответ',
            timestamp: 1000,
            pendingToolApprovals: [],
            outputAttachments: []
          },
          {
            ...user,
            id: 'second-user',
            requestId: 'second-request',
            timestamp: 500
          }
        ]
      }),
    0
  );
  const view = createAiConversationView(snapshot, [
    {
      id: 'old-error',
      requestId: 'request',
      role: 'assistant',
      content: 'Соединение прервалось'
    },
    {
      id: 'second-error',
      requestId: 'second-request',
      role: 'assistant',
      content: 'Вторая ошибка',
      timestamp: 1
    },
    { id: 'draft', role: 'user', content: 'Неотправленный вопрос' }
  ]);

  assert.deepEqual(
    view.map(message => message.id),
    [
      'user-message',
      'assistant-message',
      'second-user',
      'second-error',
      'draft'
    ]
  );
  assert.equal(view[1].content, 'Готовый ответ');
});

await test('Серверное открепление имеет приоритет над старым кэшем и восстанавливается без кэша', async () => {
  const snapshot = await loadAiConversationTranscript(
    async () => page({ messages: [{ ...user, pinned: false, pinVersion: 2 }] }),
    0
  );
  const view = createAiConversationView(snapshot, [
    {
      id: user.id,
      role: 'user',
      content: user.content,
      pinned: true,
      pinVersion: 1
    }
  ]);
  assert.equal(view[0].pinned, false);
  assert.equal(view[0].pinVersion, 2);
  const fresh = createAiConversationView({
    ...snapshot,
    messages: [{ ...snapshot.messages[0], pinned: true, pinVersion: 3 }]
  });
  assert.equal(fresh[0].pinned, true);
  assert.equal(fresh[0].pinVersion, 3);
});
console.log(
  `Проверки полной переписки: ${passed} успешно, 0 упало, 0 пропущено.`
);
