import assert from 'node:assert/strict';
import { mock } from 'bun:test';

let cookie: string | null = null;
let stored: string | null = 'restored-session';
mock.module('../src/composables/useLogin', () => ({
  getAuthToken: () => cookie
}));
mock.module('../src/composables/useAuth', () => ({
  getStoredChatAccessToken: () => stored
}));
const nativeFetch = globalThis.fetch;
const requests: Array<{ url: string; token: string | null }> = [];
globalThis.fetch = (async (url: string, init: RequestInit) => {
  requests.push({ url, token: new Headers(init.headers).get('Authorization') });
  return Response.json(
    url.includes('/conversations/')
      ? { generation: 0, deleted: false }
      : { tasks: [] }
  );
}) as typeof fetch;
try {
  const { fetchAiConversationState } = await import(
    '../src/services/aiConversationHistory'
  );
  const { fetchAiActionTasks } = await import('../src/services/aiActionTasks');
  const read = () =>
    fetchAiConversationState('http://127.0.0.1:4111', 'qa-auth');
  await read();
  assert.equal(requests.at(-1)?.token, 'Bearer restored-session');
  await fetchAiActionTasks('http://127.0.0.1:4111', 'qa-auth');
  assert.equal(requests.at(-1)?.token, 'Bearer restored-session');
  cookie = 'active-cookie';
  await read();
  assert.equal(requests.at(-1)?.token, 'Bearer active-cookie');
  cookie = null;
  stored = null;
  await assert.rejects(read(), /Требуется авторизация/);
  assert.equal(requests.length, 3);
  console.log(
    'Авторизация истории: сохранённая сессия до cookie, текущий cookie и отсутствие сессии проверены.'
  );
} finally {
  globalThis.fetch = nativeFetch;
}
