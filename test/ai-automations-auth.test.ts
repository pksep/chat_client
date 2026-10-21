import { afterAll, beforeEach, expect, mock, test } from 'bun:test';

let cookie: string | null = null;
let stored: string | null = null;
const requests: Array<{ url: string; authorization: string | null }> = [];

mock.module('../src/composables/useLogin', () => ({
  getAuthToken: () => cookie
}));
mock.module('../src/composables/useAuth', () => ({
  getStoredChatAccessToken: () => stored
}));
mock.module('../src/services/useConfig', () => ({
  getConfig: () => ({ CHAT_MASTRA_URL: 'http://localhost:4111/api/' })
}));
mock.module('../src/composables/useChatAccess', () => ({
  fetchWithAiAccess: async (url: string, init: RequestInit) => {
    requests.push({
      url,
      authorization: new Headers(init.headers).get('Authorization')
    });
    return Response.json({ automations: [] });
  }
}));

const { fetchAiAutomations } = await import('../src/services/aiAutomations');
beforeEach(() => {
  cookie = null;
  stored = null;
  requests.length = 0;
});
afterAll(() => mock.restore());

test('загружает расписания из сохранённой сессии до восстановления cookie', async () => {
  stored = 'restored-session';
  expect(await fetchAiAutomations()).toEqual([]);
  expect(requests).toEqual([
    {
      url: 'http://localhost:4111/automations',
      authorization: 'Bearer restored-session'
    }
  ]);
});

test('текущий cookie имеет приоритет над сохранённым токеном', async () => {
  cookie = 'current-session';
  stored = 'old-session';
  await fetchAiAutomations();
  expect(requests[0].authorization).toBe('Bearer current-session');
});

test('без сессии не выполняет запрос и сохраняет прежний список', async () => {
  expect(await fetchAiAutomations()).toBeNull();
  expect(requests).toHaveLength(0);
});
