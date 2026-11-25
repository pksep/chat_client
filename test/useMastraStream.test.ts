import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test
} from 'bun:test';
import { AI_STREAM_TIMEOUT_MS } from '../src/services/mastraStreamLifecycle';
import { ref } from 'vue';

type StreamFactory = (signal: AbortSignal) => Response | Promise<Response>;

let streamFactory: StreamFactory = () => {
  throw new Error('Stream factory is not configured');
};
let sdkSignal: AbortSignal | undefined;
const savedHistories: Array<Array<Record<string, unknown>>> = [];
const runtimes: Array<{ dispose: () => void }> = [];

const saveChatMessages = mock(
  async (_chatId: string, history: Array<Record<string, unknown>>) => {
    savedHistories.push(JSON.parse(JSON.stringify(history)));
  }
);

mock.module('../src/services/useChatDb', () => ({
  saveMessages: saveChatMessages,
  getChatHistorySnapshot: async () => ({
    messages: [],
    conversationGeneration: 0,
    conversationProtocol: 0
  })
}));

mock.module('../src/services/useConfig', () => ({
  getConfig: () => ({ CHAT_MASTRA_URL: 'https://mastra.test' })
}));

mock.module('../src/composables/useLogin', () => ({
  getAuthToken: () => 'test-token'
}));

mock.module('../src/composables/useAuth', () => ({
  getAuthUser: () => ({ id: 'test-user' }),
  getChatAuthSession: () => null,
  getStoredChatAccessToken: () => null,
  withAuthResponseRefresh: (request: () => Promise<Response>) => request(),
  ensureAuthorizedResponse: (response: Response) => response
}));

const access = ref({ ai: true, client: false });
mock.module('../src/composables/useChatAccess', () => ({
  requireAiAccess: async () => undefined,
  fetchWithAiAccess: (...args: Parameters<typeof fetch>) => fetch(...args),
  useChatAccess: () => ({ access })
}));

mock.module('../src/composables/useNotifications', () => ({
  showErrorNotification: () => undefined
}));

mock.module('../src/services/aiConversationHistory', () => ({
  fetchAiConversationState: async () => ({
    deleted: false,
    generation: 0,
    protocol: 0
  }),
  initializeAiConversation: async () => ({
    deleted: false,
    generation: 0,
    protocol: 0
  }),
  fetchAiConversationTranscript: async () => ({ messages: [] }),
  setAiConversationMessagePin: async () => undefined,
  mutateAiConversation: async () => undefined,
  resetAiConversation: async () => undefined
}));

mock.module('../src/services/aiActionTasks', () => ({
  actionTaskFromEvent: () => null,
  actionTaskSummary: () => '',
  controlAiActionTask: async (
    _baseUrl: string,
    _chatId: string,
    task: unknown
  ) => task,
  fetchAiActionTasks: async () => []
}));

mock.module('@mastra/client-js', () => ({
  RequestContext: class {
    set() {}
  },
  MastraClient: class {
    private readonly signal: AbortSignal;

    constructor(options: { abortSignal: AbortSignal }) {
      this.signal = options.abortSignal;
      sdkSignal = options.abortSignal;
    }

    getAgent() {
      return {
        stream: async () => streamFactory(this.signal)
      };
    }
  }
}));

const { useMastra } = await import('../src/services/useMastra');

const delay = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

const waitFor = async (
  condition: () => boolean,
  timeoutMilliseconds = 1000
) => {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!condition()) {
    if (Date.now() >= deadline)
      throw new Error('Timed out waiting for test condition');
    await delay(1);
  }
};

const createControlledStream = () => {
  const encoder = new TextEncoder();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  let cancelReason: unknown;
  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(streamController) {
        controller = streamController;
      },
      cancel(reason) {
        cancelled = true;
        cancelReason = reason;
      }
    }),
    { headers: { 'Content-Type': 'text/event-stream' } }
  );

  return {
    response,
    push: (event: Record<string, unknown>) => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
    },
    close: () => controller.close(),
    wasCancelled: () => cancelled,
    cancelReason: () => cancelReason
  };
};

const createRuntime = () => {
  const runtime = useMastra({
    agentId: 'test-agent',
    baseUrl: 'https://mastra.test'
  });
  runtimes.push(runtime);
  return runtime;
};

const shortenStreamTimeout = (milliseconds: number) => {
  const realSetTimeout = globalThis.setTimeout.bind(globalThis);
  return spyOn(globalThis, 'setTimeout').mockImplementation(((
    callback: TimerHandler,
    delayMilliseconds?: number,
    ...args: unknown[]
  ) =>
    realSetTimeout(
      callback,
      delayMilliseconds === AI_STREAM_TIMEOUT_MS
        ? milliseconds
        : delayMilliseconds,
      ...args
    )) as typeof setTimeout);
};

beforeEach(() => {
  savedHistories.length = 0;
  sdkSignal = undefined;
  streamFactory = () => {
    throw new Error('Stream factory is not configured');
  };
});

afterEach(() => {
  while (runtimes.length) runtimes.pop()?.dispose();
});

describe('useMastra stream lifecycle', () => {
  test('кнопка подтверждения сохраняет голосовой контекст и озвучивает результат', async (): Promise<void> => {
    const stream = createControlledStream();
    const request = spyOn(globalThis, 'fetch').mockResolvedValue(
      stream.response
    );
    const runtime = createRuntime();
    runtime.pendingApproval.value = {
      runId: 'run',
      toolCallId: 'tool',
      toolName: 'create',
      args: {}
    };
    const text = mock((_text: string): void => {});
    try {
      const approving = runtime.resolveToolApproval(
        'approve',
        undefined,
        undefined,
        undefined,
        {
          interactionMode: 'voice',
          onText: text,
          onReset: (): void => {}
        }
      );
      await waitFor(() => request.mock.calls.length === 1);
      const body = JSON.parse(String(request.mock.calls[0][1]?.body));
      expect(body.requestContext.interactionMode).toBe('voice');
      expect(body.requestContext.approvalMode).toBe('strict');
      expect(body.toolCallId).toBe('tool');
      stream.push({ type: 'text-delta', payload: { text: 'Сборка создана.' } });
      stream.push({ type: 'finish' });
      stream.close();
      await expect(approving).resolves.toMatchObject({
        accepted: true,
        responseText: 'Сборка создана.'
      });
      expect(text.mock.calls).toEqual([['Сборка создана.']]);
    } finally {
      request.mockRestore();
    }
  });

  test('сохраняет ответ, даже если обработчик озвучки выбросил ошибку', async (): Promise<void> => {
    streamFactory = () =>
      new Response(
        'data: {"type":"text-delta","payload":{"text":"Ответ сохранён."}}\n\n' +
          'data: {"type":"finish"}\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } }
      );
    const runtime = createRuntime();
    const result = await runtime.sendMessage(
      'Ответь',
      undefined,
      undefined,
      [],
      undefined,
      undefined,
      undefined,
      {
        interactionMode: 'voice',
        onText: (): void => {
          throw new Error('Audio unavailable');
        },
        onReset: (): void => {
          throw new Error('Audio unavailable');
        }
      }
    );

    expect(result).toMatchObject({
      accepted: true,
      responseText: 'Ответ сохранён.'
    });
    expect(savedHistories.at(-1)?.at(-1)?.content).toBe('Ответ сохранён.');
  });

  test('передаёт голосу только публичный текст до завершения ответа', async (): Promise<void> => {
    const stream = createControlledStream();
    streamFactory = () => stream.response;
    const runtime = createRuntime();
    const text = mock((_value: string): void => {});
    const sending = runtime.sendMessage(
      'Найди задачу',
      undefined,
      undefined,
      [],
      undefined,
      undefined,
      undefined,
      {
        interactionMode: 'voice',
        onText: text,
        onReset: (): void => {}
      }
    );
    await waitFor(() => Boolean(sdkSignal));
    stream.push({
      type: 'reasoning-delta',
      payload: { text: 'internal reasoning' }
    });
    stream.push({
      type: 'tool-result',
      payload: { result: 'private payload' }
    });
    stream.push({ type: 'text-delta', payload: { text: 'Нашёл задачу. ' } });
    await waitFor(() => text.mock.calls.length === 1);
    expect(text.mock.calls[0]).toEqual(['Нашёл задачу. ']);
    expect(sdkSignal?.aborted).toBe(false);
    stream.push({ type: 'finish' });
    stream.close();
    await expect(sending).resolves.toMatchObject({ accepted: true });
  });

  test('голосовое да не вызывает подтверждение операции', async (): Promise<void> => {
    const stream = createControlledStream();
    streamFactory = () => stream.response;
    const runtime = createRuntime();
    runtime.pendingApproval.value = {
      runId: 'run',
      toolCallId: 'tool',
      toolName: 'create',
      args: {}
    };
    const sending = runtime.sendMessage(
      'да',
      undefined,
      undefined,
      [],
      undefined,
      undefined,
      undefined,
      {
        interactionMode: 'voice',
        onText: (): void => {},
        onReset: (): void => {}
      }
    );
    await expect(sending).resolves.toMatchObject({
      accepted: true,
      responseText:
        'Сейчас ожидается решение по действию. Выберите «Подтвердить» или «Отменить» на карточке.'
    });
    expect(sdkSignal).toBeUndefined();
  });

  test('буферизует текст, сохраняет его с debounce и не пишет loading-placeholder', async () => {
    const stream = createControlledStream();
    streamFactory = () => stream.response;
    const runtime = createRuntime();
    let finishCalls = 0;
    const sending = runtime.sendMessage('Привет', () => {
      finishCalls += 1;
    });

    await waitFor(() => Boolean(sdkSignal));
    expect(finishCalls).toBe(0);
    const savesBeforeText = savedHistories.length;
    expect(
      savedHistories.every(history =>
        history.every(
          message =>
            message.loading !== true &&
            !(
              message.role === 'assistant' &&
              String(message.content || '').length === 0
            )
        )
      )
    ).toBe(true);

    stream.push({ type: 'text-delta', payload: { text: 'О' } });
    stream.push({ type: 'text-delta', payload: { text: 'т' } });
    stream.push({ type: 'text-delta', payload: { text: 'вет' } });

    await waitFor(
      () =>
        runtime.messages.value.find(message => message.role === 'assistant')
          ?.content === 'Ответ'
    );
    expect(savedHistories).toHaveLength(savesBeforeText);
    await waitFor(() => savedHistories.length === savesBeforeText + 1);

    stream.push({ type: 'finish' });
    stream.close();
    const result = await sending;

    expect(result).toEqual({ accepted: true, responseText: 'Ответ' });
    expect(finishCalls).toBe(1);
    expect(stream.wasCancelled()).toBe(false);
    expect(savedHistories.at(-1)?.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'Ответ',
      loading: false
    });
  });

  test('не вызывает onFinish при отмене до получения stream', async () => {
    const externalController = new AbortController();
    let requestStarted = false;
    streamFactory = signal => {
      requestStarted = true;
      return new Promise((_resolve, reject) => {
        const rejectWithReason = () => reject(signal.reason);
        if (signal.aborted) rejectWithReason();
        else signal.addEventListener('abort', rejectWithReason, { once: true });
      });
    };
    const runtime = createRuntime();
    let finishCalls = 0;
    const sending = runtime.sendMessage(
      'Отмени запрос',
      () => {
        finishCalls += 1;
      },
      externalController.signal
    );

    await waitFor(() => requestStarted && Boolean(sdkSignal));
    const reason = new DOMException('Отменено пользователем', 'AbortError');
    externalController.abort(reason);
    const result = await sending;

    expect(result).toEqual({ accepted: true, responseText: null });
    expect(sdkSignal).not.toBe(externalController.signal);
    expect(sdkSignal?.aborted).toBe(true);
    expect(sdkSignal?.reason).toBe(reason);
    expect(finishCalls).toBe(0);
    expect(runtime.messages.value.at(-1)?.loading).toBe(false);
  });

  test('отменяет чтение stream тем же controller и вызывает onFinish после cancel', async () => {
    const stream = createControlledStream();
    const externalController = new AbortController();
    streamFactory = () => stream.response;
    const runtime = createRuntime();
    let finishCalls = 0;
    let wasCancelledAtFinish = false;
    const sending = runtime.sendMessage(
      'Отмени ответ',
      () => {
        finishCalls += 1;
        wasCancelledAtFinish = stream.wasCancelled();
      },
      externalController.signal
    );

    await waitFor(() => Boolean(sdkSignal));
    const reason = new DOMException('Отменено пользователем', 'AbortError');
    externalController.abort(reason);
    const result = await sending;

    expect(result).toEqual({ accepted: true, responseText: null });
    expect(sdkSignal?.reason).toBe(reason);
    expect(stream.wasCancelled()).toBe(true);
    expect(wasCancelledAtFinish).toBe(true);
    expect(finishCalls).toBe(1);
    expect(runtime.messages.value.at(-1)?.loading).toBe(false);
  });

  test('прерывает зависший stream по timeout и завершает callback после cancel', async () => {
    const timeoutSpy = shortenStreamTimeout(10);
    const stream = createControlledStream();
    streamFactory = () => stream.response;
    const runtime = createRuntime();
    let finishCalls = 0;
    let wasCancelledAtFinish = false;

    try {
      const result = await runtime.sendMessage('Жди ответ', () => {
        finishCalls += 1;
        wasCancelledAtFinish = stream.wasCancelled();
      });

      expect(result).toEqual({ accepted: true, responseText: null });
      expect(sdkSignal?.aborted).toBe(true);
      expect(sdkSignal?.reason).toMatchObject({ name: 'TimeoutError' });
      expect(stream.wasCancelled()).toBe(true);
      expect(wasCancelledAtFinish).toBe(true);
      expect(finishCalls).toBe(1);
      expect(runtime.messages.value.at(-1)?.loading).toBe(false);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  test('очищает production timeout после штатного завершения stream', async () => {
    const timeoutSpy = shortenStreamTimeout(15);
    streamFactory = () =>
      new Response(
        'data: {"type":"text-delta","payload":{"text":"Готово"}}\n\n' +
          'data: {"type":"finish"}\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } }
      );
    const runtime = createRuntime();

    try {
      const result = await runtime.sendMessage('Ответь');
      expect(result.responseText).toBe('Готово');
      expect(sdkSignal?.aborted).toBe(false);
      await delay(30);
      expect(sdkSignal?.aborted).toBe(false);
    } finally {
      timeoutSpy.mockRestore();
    }
  });
});
