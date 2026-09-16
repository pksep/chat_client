import assert from 'node:assert/strict';
import { mock } from 'bun:test';
import type { AIMessage } from '../src/types/messages';
import type { AiHistoryMutation } from '../src/services/aiConversationHistory';
import type { AiConversationPage } from '../src/services/aiConversationTranscript';

// Проверяется настоящий useMastra и разбор потока; подменены только внешние границы.
const histories = new Map<string, AIMessage[]>();
const historyGenerations = new Map<string, number>();
const historyProtocols = new Map<string, 0 | 1>();
const serverGenerations = new Map<
  string,
  { generation: number; deleted: boolean; protocol?: 0 | 1 }
>();
const streamRequests: Array<(signal?: AbortSignal) => Promise<Response>> = [];
const modelRequests: Array<{
  messages: unknown;
  requestContext: Map<string, unknown>;
}> = [];
let taskRead: () => Promise<unknown> = async () => [];
let refreshFiles: (files: unknown[]) => Promise<unknown[]> = async files =>
  files;
let beforeReset: () => Promise<void> = async () => {};
let afterReset: () => Promise<void> = async () => {};
const resetCalls: Array<{
  id: string;
  action: string;
  generation: number;
  operationId: string;
}> = [];
const resetReceipts = new Map<
  string,
  { generation: number; deleted: boolean }
>();
const notifications: string[] = [];
let afterSnapshotRead: (id: string) => Promise<void> = async () => {};
let beforeSnapshotRead: () => void = () => {};
let beforeConversationStateRead: () => void = () => {};
let beforeHistorySave: (id: string, messages: AIMessage[]) => void = () => {};
let mutateHistory: (
  id: string,
  input: AiHistoryMutation
) => Promise<any> = async () => {
  throw new Error('Непредусмотренное изменение переписки');
};
let savePin: (
  id: string,
  input: {
    generation: number;
    id: string;
    pinned: boolean;
    expectedVersion: number;
  }
) => Promise<any> = async () => {
  throw new Error('Непредусмотренное изменение закрепления');
};
let transcriptRead: (
  id: string,
  generation: number,
  signal?: AbortSignal
) => Promise<any> = async () => {
  throw new Error('Непредусмотренное чтение новой переписки');
};
mock.module('../src/services/useChatDb', () => ({
  getChatHistorySnapshot: async (id: string) => {
    beforeSnapshotRead();
    const snapshot = {
      messages: structuredClone(histories.get(id) ?? []),
      conversationGeneration: historyGenerations.get(id),
      conversationProtocol: historyProtocols.get(id)
    };
    await afterSnapshotRead(id);
    return snapshot;
  },
  saveMessages: async (
    id: string,
    messages: AIMessage[],
    generation?: number,
    protocol?: 0 | 1
  ) => {
    beforeHistorySave(id, messages);
    if (
      generation !== undefined &&
      (historyGenerations.get(id) ?? 0) > generation
    )
      throw new Error('Не удалось сохранить историю чата.');
    histories.set(id, JSON.parse(JSON.stringify(messages)));
    if (generation !== undefined) historyGenerations.set(id, generation);
    if (protocol !== undefined) historyProtocols.set(id, protocol);
  }
}));
mock.module('../src/services/aiConversationHistory', () => ({
  mutateAiConversation: (_: string, id: string, input: AiHistoryMutation) =>
    mutateHistory(id, input),
  setAiConversationMessagePin: (
    _: string,
    id: string,
    input: Parameters<typeof savePin>[1]
  ) => savePin(id, input),
  fetchAiConversationTranscript: (
    _: string,
    id: string,
    generation: number,
    signal?: AbortSignal
  ) => transcriptRead(id, generation, signal),
  fetchAiConversationState: async (_: string, id: string) => {
    beforeConversationStateRead();
    return serverGenerations.get(id) ?? { generation: 0, deleted: false };
  },
  resetAiConversation: async (
    _: string,
    id: string,
    action: string,
    request: { generation: number; operationId: string }
  ) => {
    resetCalls.push({ id, action, ...request });
    await beforeReset();
    const key = `${id}:${request.operationId}`;
    const receipt = resetReceipts.get(key);
    if (receipt) return receipt;
    assert.equal(
      serverGenerations.get(id)?.generation ?? 0,
      request.generation
    );
    const next = {
      generation: request.generation + 1,
      deleted: action === 'delete'
    };
    serverGenerations.set(id, next);
    resetReceipts.set(key, next);
    await afterReset();
    return next;
  }
}));
mock.module('../src/services/useConfig', () => ({
  getConfig: () => ({ CHAT_MASTRA_URL: 'http://127.0.0.1:4111' })
}));
mock.module('../src/composables/useLogin', () => ({
  getAuthToken: () => 'local-test'
}));
mock.module('../src/composables/useAuth', () => ({
  getStoredChatAccessToken: () => null,
  getAuthUser: () => ({ id: 'local-test-user' }),
  getChatAuthSession: () => null
}));
mock.module('../src/composables/useNotifications', () => ({
  showErrorNotification: (message: string) => notifications.push(message)
}));
mock.module('../src/services/aiAttachments', () => ({
  refreshAiAttachments: (files: unknown[]) => refreshFiles(files)
}));
mock.module('@mastra/client-js', () => ({
  RequestContext: Map,
  MastraClient: class {
    constructor(private options: { abortSignal?: AbortSignal }) {}
    getAgent() {
      return {
        stream: (
          messages: unknown,
          options: { requestContext: Map<string, unknown> }
        ) => {
          modelRequests.push({
            messages,
            requestContext: options.requestContext
          });
          const request = streamRequests.shift();
          assert.ok(request, 'Непредусмотренный повтор запроса к модели');
          return request(this.options.abortSignal);
        }
      };
    }
  }
}));
const nativeFetch = globalThis.fetch;
let approvalFetch: ((init: RequestInit) => Promise<Response>) | undefined;
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  if (url.endsWith('/approve-tool-call')) {
    assert.ok(approvalFetch, 'Непредусмотренное подтверждение');
    return approvalFetch(init!);
  }
  const tasks = await taskRead();
  return Response.json({ tasks });
}) as typeof fetch;

const { useMastra } = await import('../src/services/useMastra');
type Runtime = ReturnType<typeof useMastra>;
const runtimes: Runtime[] = [];
const nextTick = () => new Promise(resolve => setTimeout(resolve, 0));
const until = async (condition: () => boolean) => {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await nextTick();
  }
  assert.fail('Не наступило ожидаемое состояние');
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((ok, no) => {
    resolve = ok;
    reject = no;
  });
  return { resolve, reject, promise };
};
const create = async (initial: AIMessage[] = [], protocol?: 1) => {
  const id = crypto.randomUUID();
  histories.set(id, initial);
  if (protocol === 1) {
    historyProtocols.set(id, 1);
    serverGenerations.set(id, { generation: 0, deleted: false, protocol });
  }
  const runtime = useMastra({ chatId: id, agentId: 'generalAgent' });
  runtimes.push(runtime);
  await until(() => !runtime.isInitializing.value);
  await nextTick();
  return { runtime, id };
};
const channel = () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
      cancel() {
        cancelled = true;
      }
    })
  );
  return {
    response,
    get cancelled() {
      return cancelled;
    },
    emit(...events: unknown[]) {
      controller.enqueue(
        new TextEncoder().encode(
          events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
        )
      );
    }
  };
};
const text = (value: string) => ({
  type: 'text-delta',
  payload: { text: value }
});
const finish = { type: 'finish' };
const oldMessage: AIMessage = {
  id: 'old-answer',
  role: 'assistant',
  content: 'Старое сообщение'
};

try {
  // Изменение индекса во время потока не теряет ответ и не портит соседнее сообщение.
  {
    const { runtime, id } = await create([oldMessage]);
    const source = channel();
    streamRequests.push(async () => source.response);
    const sending = runtime.sendMessage('Новый вопрос');
    await until(() => streamRequests.length === 0);
    await runtime.deleteMessages([0]);
    source.emit(text('Новый ответ'), finish, text('Лишний ответ'));
    await sending;
    assert.deepEqual(
      runtime.messages.value.map(message => message.content),
      ['Новый вопрос', 'Новый ответ']
    );
    assert.equal(source.cancelled, true);
    assert.deepEqual(
      histories.get(id)?.map(message => message.content),
      ['Новый вопрос', 'Новый ответ']
    );
    runtime.dispose();
  }
  // Старый HTTP-запрос намеренно игнорирует AbortSignal: ни ответ, ни ошибка не меняют новый чат.
  for (const fail of [false, true]) {
    const { runtime, id } = await create();
    const old = deferred<Response>();
    let signal: AbortSignal | undefined;
    streamRequests.push(async value => {
      signal = value;
      return old.promise;
    });
    const first = runtime.sendMessage('Старый вопрос');
    await until(() => Boolean(signal));
    await runtime.clearMessages();
    assert.equal(signal?.aborted, true);
    const fresh = channel();
    streamRequests.push(async () => fresh.response);
    const second = runtime.sendMessage('Новый вопрос');
    await until(() => streamRequests.length === 0);
    const late = channel();
    if (fail) old.reject(new Error('Запоздавшая ошибка'));
    else old.resolve(late.response);
    assert.deepEqual(await first, { accepted: true, responseText: null });
    assert.equal(runtime.lastError.value, null);
    assert.equal(runtime.messages.value[1].loading, true);
    if (!fail) assert.equal(late.cancelled, true);
    fresh.emit(text('Ответ на новый вопрос'), finish);
    await second;
    assert.deepEqual(
      histories.get(id)?.map(message => message.content),
      ['Новый вопрос', 'Ответ на новый вопрос']
    );
    runtime.dispose();
  }
  // Очистка уже открытого, зависшего потока освобождает reader и не сохраняет ошибку отмены.
  {
    const { runtime, id } = await create();
    const source = channel();
    streamRequests.push(async () => source.response);
    const sending = runtime.sendMessage('Вопрос');
    await until(() => source.response.body!.locked);
    source.emit(text('Частичный ответ'));
    await until(() => runtime.messages.value[1]?.content === 'Частичный ответ');
    await runtime.clearMessages();
    assert.deepEqual(await sending, { accepted: true, responseText: null });
    assert.equal(source.cancelled, true);
    assert.equal(source.response.body?.locked, false);
    assert.deepEqual(histories.get(id), []);
    assert.equal(runtime.lastError.value, null);
    runtime.dispose();
  }
  // После удаления исходного вопроса продолжение не привязывается к оставшемуся ответу.
  {
    const { runtime } = await create();
    const old = deferred<Response>();
    streamRequests.push(async () => old.promise);
    const sending = runtime.sendMessage('Удаляемый вопрос');
    await until(() => streamRequests.length === 0);
    await runtime.deleteMessages([0]);
    old.reject(new Error('Запоздавшая ошибка'));
    await sending;
    assert.equal(runtime.lastError.value, null);
    assert.equal(runtime.messages.value[0].content, '');
    assert.equal(runtime.messages.value[0].loading, false);
    runtime.dispose();
  }
  // Чат удалён раньше ответа начальной синхронизации планов: фон не восстанавливает его.
  {
    const tasks = deferred<unknown>();
    taskRead = () => tasks.promise;
    const { runtime, id } = await create();
    runtime.dispose();
    await runtime.clearMessages();
    tasks.reject(new Error('Поздняя ошибка чтения планов'));
    await nextTick();
    assert.deepEqual(histories.get(id), []);
    assert.equal(runtime.lastError.value, null);
    taskRead = async () => [];
  }
  // Подготовка файлов завершилась после очистки: не отправлять старое поручение вообще.
  {
    const files = deferred<unknown[]>();
    refreshFiles = () => files.promise;
    const { runtime, id } = await create();
    const attachment = {
      name: 'test.txt',
      size: 1,
      contentType: 'text/plain',
      transferToken: 'token',
      expiresAt: Date.now() + 60_000
    };
    const sending = runtime.sendMessage('Прочитай файл', undefined, undefined, [
      attachment
    ]);
    await until(
      () => runtime.preparationStatus.value === 'Проверяю доступ к вложениям'
    );
    await runtime.clearMessages();
    files.resolve([attachment]);
    await sending;
    assert.deepEqual(histories.get(id), []);
    assert.equal(runtime.lastError.value, null);
    runtime.dispose();
    refreshFiles = async value => value;
  }
  // Подтверждение терминально: поздний текст в том же пакете не портит карточку.
  {
    const { runtime } = await create();
    const source = channel();
    streamRequests.push(async () => source.response);
    const sending = runtime.sendMessage('Создай доску');
    await until(() => streamRequests.length === 0);
    source.emit(
      {
        type: 'tool-call-approval',
        runId: 'run',
        payload: {
          toolCallId: 'tool-call',
          toolName: 'board_actions_boards_create',
          args: { title: 'Основная' }
        }
      },
      text('Лишний текст'),
      finish
    );
    await sending;
    assert.equal(runtime.pendingApproval.value?.toolCallId, 'tool-call');
    assert.equal(
      runtime.messages.value[1].content.includes('Лишний текст'),
      false
    );
    assert.equal(source.cancelled, true);
    runtime.dispose();
  }
  // Одновременная отправка не создаёт два запуска до завершения первого сохранения.
  {
    const { runtime } = await create();
    const source = channel();
    streamRequests.push(async () => source.response);
    const first = runtime.sendMessage('Первый вопрос');
    await runtime.sendMessage('Повторный клик');
    await until(() => streamRequests.length === 0);
    source.emit(text('Ответ'), finish);
    await first;
    assert.deepEqual(
      runtime.messages.value.map(message => message.content),
      ['Первый вопрос', 'Ответ']
    );
    runtime.dispose();
  }
  // Редактирование создаёт новый ответ; завершение старого не сбрасывает его состояние.
  {
    const { runtime, id } = await create();
    const old = deferred<Response>();
    streamRequests.push(async () => old.promise);
    const first = runtime.sendMessage('Исходный вопрос');
    await until(() => streamRequests.length === 0);
    const source = channel();
    streamRequests.push(async () => source.response);
    const editing = runtime.editMessageAndResend(0, 'Исправленный вопрос');
    await until(() => streamRequests.length === 0);
    old.reject(new Error('Ошибка прежнего ответа'));
    await first;
    assert.equal(runtime.messages.value[1].loading, true);
    assert.equal(runtime.lastError.value, null);
    source.emit(text('Исправленный ответ'), finish);
    await editing;
    assert.deepEqual(
      histories.get(id)?.map(message => message.content),
      ['Исправленный вопрос', 'Исправленный ответ']
    );
    runtime.dispose();
  }
  assert.deepEqual(
    notifications,
    [],
    'Устаревшая ошибка не должна показывать уведомление'
  );
  // Недоступный сервер не стирает видимую историю; повтор использует прежнюю команду очистки.
  {
    const { runtime, id } = await create([oldMessage]);
    beforeReset = async () => {
      throw new Error('Сервер недоступен');
    };
    await assert.rejects(runtime.clearMessages(), /Сервер недоступен/);
    assert.equal(histories.get(id)?.[0].content, oldMessage.content);
    assert.equal(runtime.messages.value[0].content, oldMessage.content);
    const failed = resetCalls.at(-1)!;
    beforeReset = async () => {};
    await runtime.clearMessages();
    assert.equal(resetCalls.at(-1)!.operationId, failed.operationId);
    assert.equal(historyGenerations.get(id), 1);
    assert.deepEqual(histories.get(id), []);
    runtime.dispose();
  }
  // Потерян только ответ: сервер не выполняет очистку второй раз.
  {
    const { runtime, id } = await create([oldMessage]);
    afterReset = async () => {
      throw new Error('Ответ потерян');
    };
    await assert.rejects(runtime.clearMessages(), /Ответ потерян/);
    assert.equal(serverGenerations.get(id)?.generation, 1);
    assert.equal(runtime.messages.value[0].content, oldMessage.content);
    const failed = resetCalls.at(-1)!;
    afterReset = async () => {};
    await runtime.clearMessages();
    assert.equal(resetCalls.at(-1)!.operationId, failed.operationId);
    assert.equal(serverGenerations.get(id)?.generation, 1);
    assert.deepEqual(histories.get(id), []);
    runtime.dispose();
  }
  // Очистка с другого устройства обнаруживается перед отправкой: старые сообщения не уходят модели.
  {
    const { runtime, id } = await create([oldMessage]);
    serverGenerations.set(id, { generation: 1, deleted: false });
    const source = channel();
    streamRequests.push(async () => source.response);
    const sending = runtime.sendMessage('Новый вопрос');
    await until(() => streamRequests.length === 0);
    assert.deepEqual(
      runtime.messages.value.map(message => message.content),
      ['Новый вопрос', '']
    );
    source.emit(text('Новый ответ'), finish);
    await sending;
    assert.equal(historyGenerations.get(id), 1);
    runtime.dispose();
  }
  // Очистка между чтением снимка и его применением не присваивает старым сообщениям новую версию.
  {
    afterSnapshotRead = async id => {
      histories.set(id, []);
      historyGenerations.set(id, 1);
      serverGenerations.set(id, { generation: 1, deleted: false });
    };
    const { runtime, id } = await create([oldMessage]);
    afterSnapshotRead = async () => {};
    assert.equal(runtime.messages.value.length, 0);
    assert.deepEqual(histories.get(id), []);
    assert.equal(historyGenerations.get(id), 1);
    runtime.dispose();
  }
  // Неудачное удаление не уничтожает runtime; подтверждённое удаление не восстанавливается после открытия.
  {
    const { runtime, id } = await create([oldMessage]);
    beforeReset = async () => {
      throw new Error('Удаление не подтверждено');
    };
    await assert.rejects(
      runtime.deleteConversation(),
      /Удаление не подтверждено/
    );
    assert.equal(runtime.messages.value[0].content, oldMessage.content);
    beforeReset = async () => {};
    await runtime.deleteConversation();
    assert.equal(serverGenerations.get(id)?.deleted, true);
    histories.set(id, [oldMessage]); // Остаток в старом окне, до получения серверного состояния.
    const reopened = useMastra({ chatId: id, agentId: 'generalAgent' });
    runtimes.push(reopened);
    await until(() => !reopened.isInitializing.value);
    assert.equal(reopened.messages.value.length, 0);
    await reopened.sendMessage('Продолжай');
    assert.match(notifications.at(-1) ?? '', /чат уже удалён/);
    assert.equal(streamRequests.length, 0);
    reopened.dispose();
  }
  // Дополнительный вопрос между карточкой и подтверждением не меняет владельца approval.
  {
    const { runtime } = await create([
      { id: 'original-question', role: 'user', content: 'Настрой сводку' },
      {
        id: 'approval-card',
        requestId: 'original-question',
        role: 'assistant',
        content: 'Подтвердите сводку',
        pendingToolApproval: {
          runId: 'run',
          toolCallId: 'tool',
          toolName: 'automation_schedule_create',
          args: {}
        }
      },
      { id: 'later-question', role: 'user', content: 'А что за сводка?' }
    ]);
    let approvalRequest: any;
    approvalFetch = async init => {
      approvalRequest = JSON.parse(init.body as string);
      return new Response(
        'data: {"type":"text-delta","payload":{"text":"Сводка настроена"}}\n\ndata: {"type":"finish"}\n\n'
      );
    };
    await runtime.resolveToolApproval('approve');
    assert.equal(approvalRequest.requestContext.requestId, 'original-question');
    assert.equal(runtime.messages.value.at(-1)?.requestId, 'original-question');
    assert.equal(runtime.messages.value.at(-1)?.content, 'Сводка настроена');
    runtime.dispose();
  }
  // Устаревшее подтверждение создаёт новый проверочный ход, а не переиспользует ID исходной записи.
  {
    const { runtime, id } = await create([
      {
        id: 'original-request',
        role: 'user',
        content: 'Назначь ответственного'
      },
      {
        id: 'stale-card',
        requestId: 'original-request',
        role: 'assistant',
        content: 'Назначить?',
        pendingToolApproval: {
          runId: 'old-run',
          toolCallId: 'old-tool',
          toolName: 'erp_entity_editor_update',
          args: {}
        }
      }
    ]);
    approvalFetch = async () =>
      Response.json(
        {
          code: 'AI_APPROVAL_STALE',
          userMessage: 'Прежнее подтверждение больше не действует.'
        },
        { status: 409 }
      );
    const source = channel();
    streamRequests.push(async () => source.response);
    const resolving = runtime.resolveToolApproval('approve');
    await until(() => streamRequests.length === 0);
    const recovery = modelRequests.at(-1)!;
    const recoveryId = recovery.requestContext.get('requestId');
    assert.ok(
      typeof recoveryId === 'string' && recoveryId !== 'original-request'
    );
    assert.equal(recovery.requestContext.get('approvalMode'), 'strict');
    assert.equal(runtime.messages.value.at(-1)?.requestId, recoveryId);
    assert.equal(histories.get(id)?.at(-1)?.requestId, recoveryId);
    assert.match(
      JSON.stringify(recovery.messages),
      /Сначала проверь фактический результат/
    );
    source.emit(text('Проверка завершена'), finish);
    await resolving;
    assert.equal(histories.get(id)?.at(-1)?.requestId, recoveryId);
    runtime.dispose();
  }
  // Ошибка локального чтения не превращается в пустую историю; следующая отправка повторяет чтение.
  {
    beforeSnapshotRead = () => {
      throw new Error('Тестовый отказ чтения истории');
    };
    const { runtime, id } = await create([oldMessage]);
    assert.match(
      runtime.lastError.value ?? '',
      /Не удалось загрузить историю чата/
    );
    await runtime.sendMessage('Вопрос при ошибке чтения');
    assert.deepEqual(histories.get(id), [oldMessage]);
    assert.equal(streamRequests.length, 0);
    beforeSnapshotRead = () => {};
    const source = channel();
    streamRequests.push(async () => source.response);
    const sending = runtime.sendMessage('Повторный вопрос');
    await until(() => streamRequests.length === 0);
    source.emit(text('Ответ после восстановления чтения'), finish);
    await sending;
    assert.deepEqual(
      histories.get(id)?.map(message => message.content),
      [
        oldMessage.content,
        'Повторный вопрос',
        'Ответ после восстановления чтения'
      ]
    );
    assert.equal(runtime.lastError.value, null);
    runtime.dispose();
  }
  // Старый формат без версии считается версией 0, а не разрешением перезаписать любую новую историю.
  {
    beforeConversationStateRead = () => {
      throw new Error('Тестовый отказ чтения серверной версии');
    };
    const { runtime, id } = await create([oldMessage]);
    historyGenerations.set(id, 1);
    histories.set(id, []);
    serverGenerations.set(id, { generation: 1, deleted: false });
    await assert.rejects(
      runtime.sendMessage('Вопрос из старой вкладки'),
      /Не удалось сохранить историю чата/
    );
    assert.deepEqual(histories.get(id), []);
    assert.equal(historyGenerations.get(id), 1);
    assert.equal(streamRequests.length, 0);
    beforeConversationStateRead = () => {};
    const source = channel();
    streamRequests.push(async () => source.response);
    const sending = runtime.sendMessage('Вопрос после очистки');
    await until(() => streamRequests.length === 0);
    source.emit(text('Новый ответ'), finish);
    await sending;
    assert.deepEqual(
      histories.get(id)?.map(message => message.content),
      ['Вопрос после очистки', 'Новый ответ']
    );
    runtime.dispose();
  }
  const storedFiles = Array.from({ length: 7 }, (_, i) => ({
    attachmentId: crypto.randomUUID(),
    contentHash: 'a'.repeat(64),
    name: `${i}.png`,
    size: 10,
    contentType: 'image/png'
  }));
  const originalSnapshot = {
    protocol: 1,
    generation: 0,
    tasks: [],
    incompleteMessages: [],
    messages: [
      {
        id: 'native-user',
        requestId: 'original-request',
        role: 'user',
        content: 'Ранее отправленный вопрос',
        timestamp: 1000,
        attachments: storedFiles,
        outputAttachments: [],
        pendingToolApprovals: []
      },
      {
        id: 'native-answer',
        requestId: 'original-request',
        role: 'assistant',
        content: 'Сохранённый ответ',
        timestamp: 1001,
        attachments: [],
        outputAttachments: [],
        pendingToolApprovals: []
      }
    ]
  };
  // Серверная переписка восстанавливается без локального снимка; отправляется только один новый ход.
  {
    const snapshot = structuredClone(originalSnapshot);
    transcriptRead = async () => structuredClone(snapshot);
    let refreshes = 0;
    refreshFiles = async files => {
      refreshes++;
      return files.map(file => ({
        ...(file as object),
        transferToken: 'new-'.repeat(20),
        expiresAt: Date.now() + 600_000
      }));
    };
    const { runtime, id } = await create([], 1);
    assert.equal(runtime.messages.value.length, 2);
    assert.equal(refreshes, 0);
    assert.equal(runtime.messages.value[0].attachments?.length, 7);
    assert.equal(historyProtocols.get(id), 1);
    const source = channel();
    streamRequests.push(async () => source.response);
    const sending = runtime.sendMessage('Новый вопрос');
    await until(() => streamRequests.length === 0);
    const sent = modelRequests.at(-1)!;
    assert.deepEqual(sent.messages, [
      { role: 'user', content: 'Новый вопрос' }
    ]);
    assert.equal(sent.requestContext.get('conversationProtocol'), 1);
    const requestId = sent.requestContext.get('requestId') as string;
    assert.notEqual(requestId, 'native-user');
    assert.equal(refreshes, 1);
    assert.equal((sent.requestContext.get('attachments') as any[]).length, 7);
    snapshot.messages.push(
      {
        ...snapshot.messages[0],
        id: 'native-user-new',
        requestId,
        content: 'Новый вопрос',
        timestamp: 2000
      },
      {
        ...snapshot.messages[1],
        id: 'native-answer-new',
        requestId,
        content: 'Новый ответ',
        timestamp: 2001
      }
    );
    source.emit(text('Новый ответ'), finish);
    await sending;
    assert.deepEqual(
      runtime.messages.value.map(message => message.id),
      snapshot.messages.map(message => message.id)
    );
    runtime.dispose();
    histories.delete(id);
    historyProtocols.delete(id);
    historyGenerations.delete(id);
    const reopened = useMastra({ chatId: id, agentId: 'generalAgent' });
    runtimes.push(reopened);
    await until(() => !reopened.isInitializing.value);
    assert.equal(reopened.messages.value.length, 4);
    assert.equal(reopened.messages.value.at(-1)?.content, 'Новый ответ');
    reopened.dispose();
  }
  // Отказ чтения не стирает кэш и не разрешает запрос на основе неполной истории.
  {
    transcriptRead = async () => {
      throw new Error('Не удалось загрузить серверную переписку');
    };
    const { runtime, id } = await create([oldMessage], 1);
    const before = modelRequests.length;
    await runtime.sendMessage('Не отправлять при отказе истории');
    assert.equal(modelRequests.length, before);
    assert.deepEqual(histories.get(id), [oldMessage]);
    assert.equal(runtime.pendingApproval.value, null);
    runtime.dispose();
  }
  // Новая серверная версия не стирает старую переписку, пока не прочитан весь снимок.
  for (const [localProtocol, nextGeneration] of [
    [0, 0],
    [0, 1],
    [1, 1]
  ] as const) {
    const id = crypto.randomUUID();
    histories.set(id, [oldMessage]);
    historyGenerations.set(id, 0);
    historyProtocols.set(id, localProtocol);
    serverGenerations.set(id, {
      generation: nextGeneration,
      deleted: false,
      protocol: 1
    });
    transcriptRead = async () => {
      throw new Error('Новая история временно недоступна');
    };
    const runtime = useMastra({ chatId: id, agentId: 'generalAgent' });
    runtimes.push(runtime);
    await until(() => !runtime.isInitializing.value);
    assert.deepEqual(
      histories.get(id),
      [oldMessage],
      'Отказ загрузки не затирает локальный снимок'
    );
    assert.equal(runtime.messages.value[0]?.content, oldMessage.content);
    assert.equal(historyGenerations.get(id), 0);
    assert.equal(historyProtocols.get(id), localProtocol);
    const before = modelRequests.length;
    let acceptedCalls = 0;
    const rejected = await runtime.sendMessage(
      'Не отправлять прежний снимок после перехода',
      undefined,
      undefined,
      [],
      undefined,
      undefined,
      () => acceptedCalls++
    );
    assert.deepEqual(rejected, { accepted: false, responseText: null });
    assert.equal(acceptedCalls, 0);
    assert.equal(modelRequests.length, before);
    assert.deepEqual(histories.get(id), [oldMessage]);
    if (localProtocol === 0) {
      await assert.rejects(() => runtime.deleteMessages([0]));
      await assert.rejects(() => runtime.toggleMessagePin(0));
      assert.deepEqual(histories.get(id), [oldMessage]);
    }
    // Запоздалый ответ старого сервера не возвращает уже обнаруженный новый формат к локальному.
    serverGenerations.set(id, {
      generation: nextGeneration,
      deleted: false,
      protocol: 0
    });
    await runtime.sendMessage('Не отправлять при противоречащей версии');
    assert.equal(modelRequests.length, before);
    assert.deepEqual(histories.get(id), [oldMessage]);
    serverGenerations.set(id, {
      generation: nextGeneration,
      deleted: false,
      protocol: 1
    });
    // Повтор читает фактическую новую переписку, без добавления старого локального ответа.
    const recovered = {
      ...structuredClone(originalSnapshot),
      generation: nextGeneration
    };
    transcriptRead = async () => structuredClone(recovered);
    const source = channel();
    streamRequests.push(async () => source.response);
    const sending = runtime.sendMessage(
      'Продолжить после восстановления',
      undefined,
      undefined,
      [],
      undefined,
      undefined,
      () => acceptedCalls++
    );
    await until(() => modelRequests.length > before);
    assert.equal(
      acceptedCalls,
      1,
      'Редактор получает принятие до завершения ответа'
    );
    assert.deepEqual(modelRequests.at(-1)!.messages, [
      { role: 'user', content: 'Продолжить после восстановления' }
    ]);
    assert.equal(
      modelRequests.at(-1)!.requestContext.get('conversationGeneration'),
      nextGeneration
    );
    assert.equal(historyProtocols.get(id), 1);
    assert.ok(
      !runtime.messages.value.some(
        message => message.content === oldMessage.content
      )
    );
    source.emit(text('Ответ после восстановления'), finish);
    assert.deepEqual(await sending, {
      accepted: true,
      responseText: 'Ответ после восстановления'
    });
    runtime.dispose();
  }
  // Сервер не может молча понизить уже известный формат той же версии.
  {
    transcriptRead = async () => structuredClone(originalSnapshot);
    const { runtime, id } = await create([], 1);
    serverGenerations.set(id, { generation: 0, deleted: false, protocol: 0 });
    const before = modelRequests.length;
    await runtime.sendMessage('Не отправлять в старый формат');
    assert.equal(modelRequests.length, before);
    assert.equal(runtime.messages.value.length, 2);
    assert.equal(historyProtocols.get(id), 1);
    runtime.dispose();
  }
  // Очистка во время чтения не возвращает старую страницу и не отправляет начатый до очистки вопрос.
  {
    transcriptRead = async () => structuredClone(originalSnapshot);
    const { runtime, id } = await create([], 1);
    const held = deferred<any>();
    let reading = false;
    transcriptRead = async () => {
      reading = true;
      return held.promise;
    };
    const before = modelRequests.length;
    const sending = runtime.sendMessage('Вопрос до очистки');
    await until(() => reading);
    await runtime.clearMessages();
    held.resolve(structuredClone(originalSnapshot));
    await sending;
    assert.equal(modelRequests.length, before);
    assert.equal(runtime.messages.value.length, 0);
    assert.deepEqual(histories.get(id), []);
    runtime.dispose();
  }
  // Закрытие диалога во время начальной загрузки не применяет запоздалый серверный снимок.
  {
    const id = crypto.randomUUID();
    serverGenerations.set(id, { generation: 0, deleted: false, protocol: 1 });
    const held = deferred<any>();
    let reading = false;
    transcriptRead = async () => {
      reading = true;
      return held.promise;
    };
    const runtime = useMastra({ chatId: id, agentId: 'generalAgent' });
    runtimes.push(runtime);
    await until(() => reading);
    runtime.dispose();
    held.resolve(structuredClone(originalSnapshot));
    await until(() => !runtime.isInitializing.value);
    assert.equal(runtime.messages.value.length, 0);
    assert.equal(
      histories.has(id),
      false,
      'Закрытый чат не создаёт пустой кэш до получения истории'
    );
  }
  // Закрепление меняется только после серверного ответа; отказ не подменяется локальным успехом.
  {
    transcriptRead = async () => ({
      ...structuredClone(originalSnapshot),
      messages: originalSnapshot.messages.map(message => ({
        ...message,
        pinned: false,
        pinVersion: 0
      }))
    });
    const { runtime, id } = await create([], 1);
    const saved = deferred<any>();
    savePin = async (chatId, input) => {
      assert.equal(chatId, id);
      assert.deepEqual(input, {
        generation: 0,
        id: 'native-answer',
        pinned: true,
        expectedVersion: 0
      });
      return saved.promise;
    };
    const pinning = runtime.toggleMessagePin(1);
    assert.equal(runtime.messages.value[1].pinned, false);
    saved.resolve({ id: 'native-answer', pinned: true, pinVersion: 1 });
    await pinning;
    assert.equal(runtime.messages.value[1].pinned, true);
    assert.equal(histories.get(id)?.[1].pinVersion, 1);
    savePin = async () => {
      throw new Error('Тестовый конфликт закрепления');
    };
    await assert.rejects(runtime.toggleMessagePin(1), /конфликт закрепления/);
    assert.equal(runtime.messages.value[1].pinned, true);
    runtime.dispose();
  }
  // Подтверждение закрепления, пришедшее после очистки, не возвращает сообщение.
  {
    transcriptRead = async () => ({
      ...structuredClone(originalSnapshot),
      messages: originalSnapshot.messages.map(message => ({
        ...message,
        pinned: false,
        pinVersion: 0
      }))
    });
    const { runtime, id } = await create([], 1);
    const saved = deferred<any>();
    savePin = async () => saved.promise;
    const pinning = runtime.toggleMessagePin(1);
    await runtime.clearMessages();
    saved.resolve({ id: 'native-answer', pinned: true, pinVersion: 1 });
    await pinning;
    assert.equal(runtime.messages.value.length, 0);
    assert.deepEqual(histories.get(id), []);
    runtime.dispose();
  }
  // Отказ финального чтения прежнего ответа не показывает ошибку в уже очищенном диалоге.
  {
    transcriptRead = async () => structuredClone(originalSnapshot);
    const { runtime } = await create([], 1);
    const source = channel();
    streamRequests.push(async () => source.response);
    const sending = runtime.sendMessage('Проверка позднего чтения');
    await until(() => streamRequests.length === 0);
    const held = deferred<any>();
    let reading = false;
    transcriptRead = async () => {
      reading = true;
      return held.promise;
    };
    source.emit(text('Ответ до очистки'), finish);
    await until(() => reading);
    await runtime.clearMessages();
    held.reject(new Error('Запоздалый отказ чтения'));
    await sending;
    assert.equal(runtime.lastError.value, null);
    assert.equal(runtime.messages.value.length, 0);
    runtime.dispose();
  }
  // Удаление сохраняет вложения оставшегося вопроса и восстанавливается без локального кэша.
  {
    let snapshot = structuredClone(originalSnapshot);
    transcriptRead = async () => structuredClone(snapshot);
    const { runtime, id } = await create([], 1);
    mutateHistory = async (chatId, input) => {
      assert.equal(chatId, id);
      assert.equal(input.generation, 0);
      assert.equal(input.action, 'delete');
      assert.deepEqual(input.messageIds, ['native-answer']);
      snapshot = {
        ...snapshot,
        generation: 1,
        messages: [{ ...snapshot.messages[0], id: 'copied-user' }]
      };
      const state = { generation: 1, deleted: false, protocol: 1 as const };
      serverGenerations.set(id, state);
      return state;
    };
    await runtime.deleteMessages([1]);
    assert.equal(runtime.messages.value.length, 1);
    assert.equal(runtime.messages.value[0].id, 'copied-user');
    assert.equal(runtime.messages.value[0].attachments?.length, 7);
    assert.equal(historyGenerations.get(id), 1);
    runtime.dispose();
    histories.delete(id);
    const reopened = useMastra({ chatId: id, agentId: 'generalAgent' });
    runtimes.push(reopened);
    await until(() => !reopened.isInitializing.value);
    assert.equal(reopened.messages.value.length, 1);
    assert.equal(reopened.messages.value[0].attachments?.length, 7);
    reopened.dispose();
  }
  // Отказ записи не удаляет сообщения ни с экрана, ни из кэша.
  {
    transcriptRead = async () => structuredClone(originalSnapshot);
    const { runtime, id } = await create([], 1);
    const before = JSON.stringify(runtime.messages.value);
    mutateHistory = async () => {
      throw new Error('Тестовый отказ изменения');
    };
    await assert.rejects(runtime.deleteMessages([1]), /отказ изменения/);
    assert.equal(JSON.stringify(runtime.messages.value), before);
    assert.equal(JSON.stringify(histories.get(id)), before);
    assert.equal(historyGenerations.get(id), 0);
    runtime.dispose();
  }
  // Потеря ответа или новой страницы сохраняет экран; ручной повтор использует ту же операцию.
  for (const failure of ['write-response', 'read-response']) {
    transcriptRead = async () => structuredClone(originalSnapshot);
    const { runtime, id } = await create([], 1);
    const before = JSON.stringify(runtime.messages.value);
    const operations: AiHistoryMutation[] = [];
    const state = { generation: 1, deleted: false, protocol: 1 as const };
    mutateHistory = async (_, input) => {
      operations.push(structuredClone(input));
      serverGenerations.set(id, state);
      if (operations.length === 1 && failure === 'write-response')
        throw new Error('Потерян ответ записи');
      return state;
    };
    transcriptRead = async () => {
      throw new Error('Потерян ответ чтения');
    };
    await assert.rejects(runtime.deleteMessages([1]), /Потерян ответ/);
    assert.equal(JSON.stringify(runtime.messages.value), before);
    assert.equal(historyGenerations.get(id), 0);
    transcriptRead = async () => ({
      ...structuredClone(originalSnapshot),
      generation: 1,
      messages: [originalSnapshot.messages[0]]
    });
    await runtime.deleteMessages([1]);
    assert.deepEqual(operations[1], operations[0]);
    assert.equal(runtime.messages.value.length, 1);
    assert.equal(historyGenerations.get(id), 1);
    runtime.dispose();
  }
  // Ни поздний успех, ни поздняя ошибка удаления не меняют уже очищенный чат.
  for (const fail of [false, true]) {
    transcriptRead = async () => structuredClone(originalSnapshot);
    const { runtime, id } = await create([], 1);
    const held = deferred<any>();
    mutateHistory = async () => held.promise;
    const deleting = runtime.deleteMessages([1]);
    await runtime.clearMessages();
    if (fail) held.reject(new Error('Поздняя ошибка удаления'));
    else held.resolve({ generation: 1, deleted: false, protocol: 1 });
    await deleting;
    assert.equal(runtime.messages.value.length, 0);
    assert.deepEqual(histories.get(id), []);
    assert.equal(runtime.lastError.value, null);
    runtime.dispose();
  }
  // Исправленный вход отправляется один раз, со своим сохранённым ID и только выбранными файлами.
  for (const withFiles of [false, true]) {
    let snapshot = structuredClone(originalSnapshot);
    transcriptRead = async () => structuredClone(snapshot);
    const { runtime, id } = await create([], 1);
    const replacementFiles = withFiles
      ? storedFiles.slice(0, 2).map(file => ({
          ...file,
          transferToken: 'fresh-token'.repeat(6),
          expiresAt: Date.now() + 600_000
        }))
      : [];
    refreshFiles = async files => files;
    let operationId = '';
    mutateHistory = async (chatId, input) => {
      assert.equal(chatId, id);
      assert.equal(input.action, 'edit');
      if (input.action !== 'edit') throw new Error('Ожидалось редактирование');
      assert.equal(input.messageId, 'native-user');
      assert.equal(input.text, 'Исправленный вопрос');
      assert.equal(input.attachments.length, replacementFiles.length);
      assert.equal(
        runtime.messages.value[0].content,
        originalSnapshot.messages[0].content
      );
      operationId = input.operationId;
      snapshot = {
        ...snapshot,
        generation: 1,
        messages: [
          {
            ...snapshot.messages[0],
            id: 'edited-native',
            requestId: operationId,
            content: input.text,
            attachments: replacementFiles.map(file => ({
              attachmentId: file.attachmentId,
              contentHash: file.contentHash,
              name: file.name,
              size: file.size,
              contentType: file.contentType
            }))
          }
        ]
      };
      const state = { generation: 1, deleted: false, protocol: 1 as const };
      serverGenerations.set(id, state);
      return state;
    };
    const source = channel();
    streamRequests.push(async () => source.response);
    const before = modelRequests.length;
    const editing = runtime.editMessageAndResend(
      0,
      'Исправленный вопрос',
      replacementFiles
    );
    await until(() => modelRequests.length > before);
    assert.deepEqual(modelRequests.at(-1)?.messages, [
      { role: 'user', content: 'Исправленный вопрос' }
    ]);
    assert.equal(
      modelRequests.at(-1)?.requestContext.get('requestId'),
      operationId
    );
    assert.equal(
      modelRequests.at(-1)?.requestContext.get('conversationGeneration'),
      1
    );
    assert.equal(
      (modelRequests.at(-1)?.requestContext.get('attachments') as unknown[])
        .length,
      replacementFiles.length
    );
    snapshot.messages.push({
      ...originalSnapshot.messages[1],
      id: 'edited-answer',
      requestId: operationId,
      content: 'Новый ответ'
    });
    source.emit(text('Новый ответ'), finish);
    await editing;
    assert.equal(
      runtime.messages.value.filter(message => message.role === 'user').length,
      1
    );
    assert.equal(runtime.messages.value[0].content, 'Исправленный вопрос');
    assert.equal(runtime.historyBusy.value, false);
    assert.equal(modelRequests.length, before + 1);
    runtime.dispose();
  }
  // Отказ проверки файлов не сохраняет исправление и не запускает модель.
  {
    transcriptRead = async () => structuredClone(originalSnapshot);
    const { runtime, id } = await create([], 1);
    const before = JSON.stringify(runtime.messages.value),
      requests = modelRequests.length;
    refreshFiles = async () => {
      throw new Error('Файл уже недоступен');
    };
    mutateHistory = async () => {
      throw new Error('Изменение не должно отправляться');
    };
    await assert.rejects(
      runtime.editMessageAndResend(0, 'Исправление', [
        {
          ...storedFiles[0],
          transferToken: 'old-token'.repeat(8),
          expiresAt: Date.now() + 600_000
        }
      ]),
      /Файл уже недоступен/
    );
    assert.equal(JSON.stringify(runtime.messages.value), before);
    assert.equal(historyGenerations.get(id), 0);
    assert.equal(modelRequests.length, requests);
    assert.equal(runtime.historyBusy.value, false);
    runtime.dispose();
  }
  // Потерянное чтение после записи не запускает ИИ; повтор сохраняет ID операции и не удваивает вход.
  {
    transcriptRead = async () => structuredClone(originalSnapshot);
    const { runtime, id } = await create([], 1);
    const operations: AiHistoryMutation[] = [],
      before = modelRequests.length;
    mutateHistory = async (_, input) => {
      operations.push(structuredClone(input));
      serverGenerations.set(id, { generation: 1, deleted: false, protocol: 1 });
      return { generation: 1, deleted: false, protocol: 1 };
    };
    transcriptRead = async () => {
      throw new Error('Отказ чтения исправления');
    };
    await assert.rejects(
      runtime.editMessageAndResend(0, 'Новый вопрос'),
      /Отказ чтения/
    );
    assert.equal(
      runtime.messages.value[0].content,
      originalSnapshot.messages[0].content
    );
    assert.equal(modelRequests.length, before);
    transcriptRead = async () => ({
      ...structuredClone(originalSnapshot),
      generation: 1,
      messages: [
        {
          ...originalSnapshot.messages[0],
          id: 'edited-native',
          requestId: operations[0].operationId,
          content: 'Новый вопрос',
          attachments: []
        }
      ]
    });
    const source = channel();
    streamRequests.push(async () => source.response);
    const retry = runtime.editMessageAndResend(0, 'Новый вопрос');
    await until(() => modelRequests.length > before);
    source.emit(text('Ответ'), finish);
    await retry;
    assert.deepEqual(operations[1], operations[0]);
    assert.equal(modelRequests.length, before + 1);
    assert.equal(
      runtime.messages.value.filter(message => message.role === 'user').length,
      1
    );
    runtime.dispose();
  }
  // Ответ редактирования, пришедший после очистки, не возвращает вход и не запускает модель.
  for (const fail of [false, true]) {
    transcriptRead = async () => structuredClone(originalSnapshot);
    const { runtime, id } = await create([], 1);
    const held = deferred<any>(),
      before = modelRequests.length;
    mutateHistory = async () => held.promise;
    const editing = runtime.editMessageAndResend(0, 'Не вернуть после очистки');
    await runtime.clearMessages();
    if (fail) held.reject(new Error('Поздняя ошибка редактирования'));
    else held.resolve({ generation: 1, deleted: false, protocol: 1 });
    await editing;
    assert.equal(runtime.messages.value.length, 0);
    assert.deepEqual(histories.get(id), []);
    assert.equal(runtime.lastError.value, null);
    assert.equal(modelRequests.length, before);
    runtime.dispose();
  }
  // Подпись и цитата отправляются отдельно от модельного текста и восстанавливаются без кэша.
  {
    const snapshot: Omit<AiConversationPage, 'nextCursor'> = {
      ...structuredClone(originalSnapshot),
      messages: []
    };
    transcriptRead = async () => structuredClone(snapshot);
    const { runtime, id } = await create([], 1);
    const quote = {
      role: 'assistant' as const,
      content: 'Цитируемый фрагмент'
    };
    const source = channel();
    streamRequests.push(async () => source.response);
    const before = modelRequests.length;
    const sending = runtime.sendMessage(
      'Видимая подпись',
      undefined,
      undefined,
      [],
      quote,
      'Модельный текст пересылки'
    );
    await until(() => modelRequests.length > before);
    const sent = modelRequests.at(-1)!;
    assert.deepEqual(sent.messages, [
      { role: 'user', content: 'Модельный текст пересылки' }
    ]);
    assert.deepEqual(sent.requestContext.get('messagePresentation'), {
      displayText: 'Видимая подпись',
      replyTo: quote
    });
    const requestId = sent.requestContext.get('requestId') as string;
    snapshot.messages = [
      {
        ...originalSnapshot.messages[0],
        id: 'native-quoted-user',
        requestId,
        attachments: [],
        content: 'Видимая подпись',
        modelContent: 'Модельный текст пересылки',
        presentationVersion: 1,
        replyTo: quote
      },
      { ...originalSnapshot.messages[1], requestId, content: 'Ответ' }
    ];
    source.emit(text('Ответ'), finish);
    await sending;
    runtime.dispose();
    histories.delete(id);
    const reopened = useMastra({ chatId: id, agentId: 'generalAgent' });
    runtimes.push(reopened);
    await until(() => !reopened.isInitializing.value);
    assert.equal(reopened.messages.value[0].content, 'Видимая подпись');
    assert.equal(
      reopened.messages.value[0].modelContent,
      'Модельный текст пересылки'
    );
    assert.deepEqual({ ...reopened.messages.value[0].replyTo }, quote);
    reopened.dispose();
  }
  // Сохранение и удаление цитаты при редактировании не дублирует её внутри входа.
  for (const keepQuote of [true, false]) {
    const quote = { role: 'assistant' as const, content: 'Прежняя цитата' };
    let snapshot: Omit<AiConversationPage, 'nextCursor'> = {
      ...structuredClone(originalSnapshot),
      messages: [
        {
          ...originalSnapshot.messages[0],
          attachments: [],
          presentationVersion: 1,
          replyTo: quote
        }
      ]
    };
    transcriptRead = async () => structuredClone(snapshot);
    const { runtime, id } = await create([], 1);
    const presentation = {
      displayText: 'Исправление с цитатой',
      ...(keepQuote ? { replyTo: quote } : {})
    };
    mutateHistory = async (_, input) => {
      assert.equal(input.action, 'edit');
      if (input.action !== 'edit') throw new Error('Ожидалось редактирование');
      assert.equal(input.text, presentation.displayText);
      assert.deepEqual(input.messagePresentation, presentation);
      snapshot = {
        ...snapshot,
        generation: 1,
        messages: [
          {
            ...originalSnapshot.messages[0],
            id: 'edited-quote-user',
            requestId: input.operationId,
            content: input.text,
            attachments: [],
            presentationVersion: 1,
            ...(keepQuote ? { replyTo: quote } : {})
          }
        ]
      };
      const state = { generation: 1, deleted: false, protocol: 1 as const };
      serverGenerations.set(id, state);
      return state;
    };
    const source = channel();
    streamRequests.push(async () => source.response);
    const before = modelRequests.length;
    const editing = runtime.editMessageAndResend(
      0,
      presentation.displayText,
      [],
      keepQuote ? quote : undefined
    );
    await until(() => modelRequests.length > before);
    const sent = modelRequests.at(-1)!;
    assert.deepEqual(sent.messages, [
      { role: 'user', content: presentation.displayText }
    ]);
    assert.deepEqual(
      sent.requestContext.get('messagePresentation'),
      presentation
    );
    snapshot.messages.push({
      ...originalSnapshot.messages[1],
      requestId: snapshot.messages[0].requestId,
      content: 'Ответ'
    });
    source.emit(text('Ответ'), finish);
    await editing;
    assert.deepEqual(
      runtime.messages.value[0].replyTo
        ? { ...runtime.messages.value[0].replyTo }
        : undefined,
      keepQuote ? quote : undefined
    );
    runtime.dispose();
  }
  // Отказ первой записи не сохраняет тот же запрос обходным путём в finally.
  for (const persistent of [false, true]) {
    const { runtime, id } = await create([oldMessage]);
    const requests = modelRequests.length;
    const notices = notifications.length;
    let writes = 0;
    let accepted = 0;
    beforeHistorySave = (chatId, messages) => {
      if (chatId !== id || !messages.some(message => message.role === 'user'))
        return;
      writes++;
      if (persistent || writes === 1)
        throw new Error('Не удалось сохранить сообщение в браузере');
    };
    try {
      await assert.rejects(
        runtime.sendMessage(
          'Не сохранённый вопрос',
          undefined,
          undefined,
          [],
          undefined,
          undefined,
          () => accepted++
        ),
        /Не удалось сохранить сообщение в браузере/
      );
      assert.equal(accepted, 0);
      assert.equal(
        writes,
        1,
        'Не повторяем запись непринятого сообщения из обработчика завершения'
      );
      assert.equal(modelRequests.length, requests);
      assert.deepEqual(
        runtime.messages.value.map(message => message.content),
        [oldMessage.content]
      );
      assert.deepEqual(
        histories.get(id)?.map(message => message.content),
        [oldMessage.content]
      );
      assert.equal(
        runtime.lastError.value,
        'Не удалось сохранить сообщение в браузере'
      );
      assert.equal(
        notifications.length,
        notices,
        'Исключение обрабатывает отправитель; runtime не создаёт второе уведомление'
      );
    } finally {
      beforeHistorySave = () => {};
    }
    const source = channel();
    streamRequests.push(async () => source.response);
    const retry = runtime.sendMessage('Не сохранённый вопрос');
    await until(() => modelRequests.length > requests);
    source.emit(text('Ответ после восстановления записи'), finish);
    assert.deepEqual(await retry, {
      accepted: true,
      responseText: 'Ответ после восстановления записи'
    });
    assert.equal(
      runtime.messages.value.filter(message => message.role === 'user').length,
      1
    );
    assert.equal(modelRequests.length, requests + 1);
    runtime.dispose();
  }
  // Напоминание о подтверждении также не оставляет несохранённый вопрос в переписке.
  {
    const initial: AIMessage[] = [
      { id: 'approval-input', role: 'user', content: 'Настрой сводку' },
      {
        id: 'approval-answer',
        requestId: 'approval-input',
        role: 'assistant',
        content: 'Подтвердите сводку',
        pendingToolApproval: {
          runId: 'run',
          toolCallId: 'tool',
          toolName: 'automation_schedule_create',
          args: {}
        }
      }
    ];
    const { runtime, id } = await create(initial);
    const requests = modelRequests.length;
    let accepted = 0;
    beforeHistorySave = chatId => {
      if (chatId === id) throw new Error('Отказ записи напоминания');
    };
    try {
      await assert.rejects(
        runtime.sendMessage(
          'А что за сводка?',
          undefined,
          undefined,
          [],
          undefined,
          undefined,
          () => accepted++
        ),
        /Отказ записи напоминания/
      );
      assert.equal(accepted, 0);
      assert.deepEqual(
        runtime.messages.value.map(message => message.id),
        initial.map(message => message.id)
      );
      assert.deepEqual(
        histories.get(id)?.map(message => message.id),
        initial.map(message => message.id)
      );
      assert.equal(runtime.pendingApproval.value?.toolCallId, 'tool');
    } finally {
      beforeHistorySave = () => {};
    }
    const result = await runtime.sendMessage('А что за сводка?');
    assert.equal(result.accepted, true);
    assert.match(result.responseText ?? '', /ожидается решение/);
    assert.equal(
      runtime.messages.value.filter(
        message => message.content === 'А что за сводка?'
      ).length,
      1
    );
    assert.equal(modelRequests.length, requests);
    assert.equal(runtime.pendingApproval.value?.toolCallId, 'tool');
    runtime.dispose();
  }
  console.log(
    'История ИИ: 48 сценариев отмены, очистки, восстановления, отправки одного хода, подтверждения, закрепления, удаления, редактирования, цитирования и отказа записи прошли.'
  );
} finally {
  runtimes.forEach(runtime => runtime.dispose());
  globalThis.fetch = nativeFetch;
}
