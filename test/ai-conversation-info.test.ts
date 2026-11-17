import { afterAll, beforeEach, expect, mock, test } from 'bun:test';

const requests: Array<{ url: string; input: RequestInit }> = [];
let response: Response;
mock.module('../src/composables/useLogin', () => ({
  getAuthToken: (): string => 'current-user'
}));
mock.module('../src/composables/useAuth', () => ({
  getStoredChatAccessToken: (): null => null
}));
mock.module('../src/services/useConfig', () => ({
  getConfig: (): { CHAT_MASTRA_URL: string } => ({
    CHAT_MASTRA_URL: 'http://localhost:4111/api/'
  })
}));
mock.module('../src/composables/useChatAccess', () => ({
  fetchWithAiAccess: async (
    url: string,
    input: RequestInit
  ): Promise<Response> => {
    requests.push({ url, input });

    return response.clone();
  }
}));

const { fetchAiConversationInfo, updateAiConversationInfo } = await import(
  '../src/services/aiConversationInfo'
);
const { createAiAttachmentSource } = await import(
  '../src/services/aiConversationAttachments'
);
const info = {
  threadId: '65386e9-4638-4c15-8167-b8c05ff4023a',
  ownerId: crypto.randomUUID(),
  organizationId: 'company',
  title: 'Мои задачи',
  muted: false,
  generation: 2,
  deleted: false as const
};

beforeEach((): void => {
  requests.length = 0;
  response = Response.json(info);
});
afterAll((): void => {
  mock.restore();
});

test('проверяет источник пересылки и отправляет текущую авторизацию', async (): Promise<void> => {
  const expected = {
    threadId: info.threadId,
    ownerId: info.ownerId,
    organizationId: info.organizationId
  };
  expect(await fetchAiConversationInfo(info.threadId, expected)).toEqual(info);
  const url = new URL(requests[0].url);
  expect(url.pathname).toBe(`/conversations/${info.threadId}/info`);
  expect(url.searchParams.get('ownerId')).toBe(info.ownerId);
  expect(new Headers(requests[0].input.headers).get('Authorization')).toBe(
    'Bearer current-user'
  );
  expect(requests[0].input.cache).toBe('no-store');
});

test('отказ владельца не подменяет пустой успешной историей', async (): Promise<void> => {
  response = Response.json({ message: 'Недоступно' }, { status: 404 });
  await expect(fetchAiConversationInfo(info.threadId)).rejects.toThrow(
    'только владельцу'
  );
});

test('переименование сохраняет ожидаемое поколение и не очищает сообщения', async (): Promise<void> => {
  await updateAiConversationInfo(info.threadId, {
    generation: 2,
    title: 'Другое название'
  });
  expect(JSON.parse(String(requests[0].input.body))).toEqual({
    generation: 2,
    title: 'Другое название'
  });
});

test('галерея читает сохранённые входящие и исходящие вложения с продолжением страницы', async (): Promise<void> => {
  const attachmentId = crypto.randomUUID();
  const messageId = crypto.randomUUID();
  response = Response.json({
    protocol: 1,
    generation: 2,
    nextCursor: 30,
    tasks: [],
    incompleteMessages: [],
    messages: [
      {
        id: messageId,
        requestId: 'request',
        role: 'user',
        content: 'Фото',
        timestamp: Date.now(),
        attachments: [
          {
            attachmentId,
            contentHash: 'a'.repeat(64),
            name: 'photo.png',
            contentType: 'image/png',
            size: 12
          }
        ],
        outputAttachments: [
          {
            id: crypto.randomUUID(),
            name: 'report.pdf',
            size: 10,
            contentType: 'application/pdf',
            path: 'report.pdf'
          }
        ],
        pendingToolApprovals: []
      }
    ]
  });
  const source = createAiAttachmentSource(info);
  const media = await source.load('media', null);
  expect(media.items).toHaveLength(1);
  expect(media.items[0].media.path).toBe(`ai-input/${attachmentId}`);
  expect(media.items[0].media.thumbnailPath).toBe(
    `ai-input/${attachmentId}/preview`
  );
  expect(media.nextCursor).toBe('30');
  const files = await source.load('files', '30');
  expect(files.items).toHaveLength(1);
  expect(files.items[0].media.originName).toBe('report.pdf');
  expect(new URL(requests[1].url).searchParams.get('after')).toBe('30');
  expect(new URL(requests[1].url).searchParams.get('generation')).toBe('2');
});

test('неполная или сменившаяся история не выдаётся за полный набор файлов', async (): Promise<void> => {
  response = Response.json({
    protocol: 1,
    generation: 3,
    messages: [],
    nextCursor: null,
    tasks: [],
    incompleteMessages: []
  });
  await expect(
    createAiAttachmentSource(info).load('media', null)
  ).rejects.toThrow();
  response = Response.json({
    protocol: 1,
    generation: 2,
    messages: [],
    nextCursor: null,
    tasks: [],
    incompleteMessages: [{ id: 'lost', requestId: 'request' }]
  });
  await expect(
    createAiAttachmentSource(info).load('files', null)
  ).rejects.toThrow();
});
