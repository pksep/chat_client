import { expect, test, type Page } from '@playwright/test';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { randomUUID } from 'node:crypto';
import type {
  ChatFolder,
  ChatFolderChange
} from '../src/services/useChatSDK/chat-folder';

test.describe.configure({ mode: 'serial' });
let origin: string;
let io: Server;
const owners = new Map<string, ChatFolder[]>();
const commands: string[] = [];
let snapshotDelay = 0;
let ackDelay = 0;
let failNext = false;
let clock = Date.now();
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

test.beforeAll(async () => {
  const http = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', '*');
    if (request.method === 'OPTIONS') {
      response.end();
      return;
    }
    if (request.url?.startsWith('/chat-folders')) {
      const user =
        new URL(request.url, 'http://fixture').searchParams.get('user') ||
        [...owners.keys()][0];
      const snapshot = copy(owners.get(user) || []);
      setTimeout(() => {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(snapshot));
      }, snapshotDelay);
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end('[]');
  });
  io = new Server(http, { cors: { origin: '*' } });
  io.of('/chat').on('connection', socket => {
    const owner = socket.handshake.auth.userId;
    void socket.join(owner);
    owners.set(owner, owners.get(owner) || []);
    socket.onAny((command, raw, ack) => {
      if (
        typeof ack !== 'function' ||
        ![
          'getChatFolders',
          'createChatFolder',
          'updateChatFolder',
          'deleteChatFolder',
          'setChatFolderTopic',
          'reorderChatFolders'
        ].includes(command)
      )
        return;
      commands.push(command);
      const payload = JSON.parse(raw);
      const folders = owners.get(owner)!;
      if (command === 'getChatFolders') {
        ack({ success: true, data: copy(folders) });
        return;
      }
      if (failNext) {
        failNext = false;
        setTimeout(
          () => ack({ success: false, error: 'Ошибка сохранения' }),
          ackDelay
        );
        return;
      }
      let result: unknown;
      let change: ChatFolderChange;
      if (command === 'createChatFolder') {
        const timestamp = new Date(++clock).toISOString();
        const folder: ChatFolder = {
          id: randomUUID(),
          name: payload.name,
          icon: payload.icon || 'folder',
          scope: payload.scope || 'chats',
          position: folders.filter(
            item => item.scope === (payload.scope || 'chats')
          ).length,
          topicIds: payload.topicIds || [],
          createdAt: timestamp,
          updatedAt: timestamp
        };
        folders.push(folder);
        result = folder;
        change = { kind: 'upsert', folder };
      } else if (command === 'deleteChatFolder') {
        owners.set(
          owner,
          folders.filter(folder => folder.id !== payload.folderId)
        );
        change = { kind: 'delete', folderId: payload.folderId };
      } else if (command === 'reorderChatFolders') {
        result = payload.folderIds.map((id: string, position: number) => {
          const folder = folders.find(item => item.id === id)!;
          folder.position = position;
          folder.updatedAt = new Date(++clock).toISOString();
          return folder;
        });
        change = {
          kind: 'reorder',
          scope: payload.scope,
          folders: result as ChatFolder[]
        };
      } else {
        const folder = folders.find(item => item.id === payload.folderId)!;
        if (!folder) {
          ack({ success: false, error: 'Папка не найдена' });
          return;
        }
        if (command === 'setChatFolderTopic')
          folder.topicIds = payload.included
            ? [...new Set([...folder.topicIds, payload.topicId])]
            : folder.topicIds.filter(id => id !== payload.topicId);
        else {
          const { folderId, ...changes } = payload;
          Object.assign(folder, changes);
        }
        folder.updatedAt = new Date(++clock).toISOString();
        result = folder;
        change = { kind: 'upsert', folder };
      }
      io.of('/chat').to(owner).emit('chatFolderChanged', copy(change));
      const saved = result === undefined ? null : copy(result);
      setTimeout(() => ack({ success: true, data: saved }), ackDelay);
    });
  });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(http.address() as { port: number }).port}`;
});
test.afterAll(async () => {
  await new Promise<void>(resolve => io.close(() => resolve()));
});
test.beforeEach(() => {
  owners.clear();
  commands.length = 0;
  snapshotDelay = 0;
  ackDelay = 0;
  failNext = false;
});

const call = (page: Page, method: string, ...args: unknown[]) =>
  page.evaluate(
    ({ method, args }) => (window as any).folderHarness[method](...args),
    { method, args }
  );
const snapshot = (page: Page) =>
  call(page, 'snapshot') as Promise<{
    folders: ChatFolder[];
    selected: string | null;
    connected: boolean;
  }>;
async function open(page: Page, user: string) {
  await page.goto(
    `/e2e/fixtures/chat-folder-sync.html?server=${encodeURIComponent(origin)}&user=${user}`
  );
  await expect
    .poll(async () => {
      try {
        return (await snapshot(page)).connected;
      } catch {
        return false;
      }
    })
    .toBe(true);
  await expect
    .poll(() => commands.filter(command => command === 'getChatFolders').length)
    .toBeGreaterThan(0);
}
async function equalFolders(page: Page, folders: ChatFolder[]) {
  await expect
    .poll(async () => (await snapshot(page)).folders)
    .toEqual(folders);
}

test('Все операции сразу видны на втором устройстве, другие аккаунты изолированы', async ({
  page,
  context
}) => {
  const second = await context.newPage();
  const other = await context.newPage();
  await open(page, 'owner');
  await open(second, 'owner');
  await open(other, 'other');
  const work = (await call(page, 'create', 'Работа')) as ChatFolder;
  await equalFolders(second, [work]);
  const personal = (await call(second, 'create', 'Личное')) as ChatFolder;
  const client = (await call(
    page,
    'create',
    'Клиенты',
    'clients'
  )) as ChatFolder;
  await call(page, 'update', work.id, { name: 'Офис', icon: 'briefcase' });
  await Promise.all([
    call(page, 'add', work.id, 'topic-a'),
    call(second, 'add', work.id, 'topic-b')
  ]);
  await expect
    .poll(async () =>
      (await snapshot(second)).folders
        .find(folder => folder.id === work.id)
        ?.topicIds.slice()
        .sort()
    )
    .toEqual(['topic-a', 'topic-b']);
  await call(second, 'removeTopic', work.id, 'topic-a');
  await call(second, 'update', work.id, { topicIds: ['topic-c'] });
  await call(page, 'reorder', [personal.id, work.id]);
  await equalFolders(second, (await snapshot(page)).folders);
  expect((await snapshot(second)).folders.map(folder => folder.id)).toEqual([
    personal.id,
    work.id,
    client.id
  ]);
  await call(second, 'select', work.id);
  await call(page, 'remove', work.id);
  await expect.poll(async () => (await snapshot(second)).selected).toBeNull();
  await equalFolders(second, (await snapshot(page)).folders);
  await equalFolders(other, []);
  for (const command of [
    'createChatFolder',
    'updateChatFolder',
    'setChatFolderTopic',
    'reorderChatFolders',
    'deleteChatFolder'
  ])
    expect(commands).toContain(command);
});

test('Переподключение восстанавливает пропущенные изменения', async ({
  page,
  context
}) => {
  const second = await context.newPage();
  await open(page, 'owner');
  await open(second, 'owner');
  const folder = (await call(page, 'create', 'Работа')) as ChatFolder;
  await equalFolders(second, [folder]);
  await call(second, 'disconnect');
  await call(page, 'remove', folder.id);
  const replacement = (await call(page, 'create', 'Новая')) as ChatFolder;
  await call(second, 'connect');
  await equalFolders(second, [replacement]);
});

for (const remoteAction of ['reorder', 'rename'] as const) {
  test(`Поздний отказ перетаскивания сохраняет изменения другого устройства: ${remoteAction}`, async ({
    page,
    context
  }) => {
    const second = await context.newPage();
    await open(page, 'owner');
    await open(second, 'owner');
    const first = (await call(page, 'create', 'Первая')) as ChatFolder;
    const last = (await call(page, 'create', 'Вторая')) as ChatFolder;
    await equalFolders(second, (await snapshot(page)).folders);
    ackDelay = 500;
    failNext = true;
    const before = commands.filter(
      command => command === 'reorderChatFolders'
    ).length;
    const failedReorder = call(page, 'reorder', [last.id, first.id]);
    await expect
      .poll(
        () =>
          commands.filter(command => command === 'reorderChatFolders').length
      )
      .toBe(before + 1);
    const remoteUpdate =
      remoteAction === 'reorder'
        ? call(second, 'reorder', [last.id, first.id])
        : call(second, 'update', first.id, { name: 'Новое имя' });
    await Promise.all([failedReorder, remoteUpdate]);
    await equalFolders(page, (await snapshot(second)).folders);
    expect((await snapshot(page)).folders.map(folder => folder.id)).toEqual(
      remoteAction === 'reorder' ? [last.id, first.id] : [first.id, last.id]
    );
  });
}

test('Старый HTTP список и задержанный ack не возвращают удалённую папку', async ({
  page,
  context
}) => {
  const second = await context.newPage();
  await open(page, 'owner');
  await open(second, 'owner');
  const folder = (await call(page, 'create', 'Работа')) as ChatFolder;
  await equalFolders(second, [folder]);
  snapshotDelay = 500;
  const httpStarted = page.waitForRequest(request =>
    request.url().includes('/chat-folders')
  );
  const loading = call(page, 'load');
  await httpStarted;
  ackDelay = 500;
  const saving = call(page, 'update', folder.id, { name: 'Обновлено' });
  await expect
    .poll(async () => (await snapshot(second)).folders[0]?.name)
    .toBe('Обновлено');
  await call(second, 'remove', folder.id);
  await Promise.all([saving, loading]);
  await equalFolders(page, []);
});

test('Ошибка сохранения не меняет другие устройства, смена аккаунта отбрасывает старые события', async ({
  page,
  context
}) => {
  const second = await context.newPage();
  await open(page, 'owner');
  await open(second, 'owner');
  const folder = (await call(page, 'create', 'Работа')) as ChatFolder;
  await equalFolders(second, [folder]);
  failNext = true;
  const error = await call(page, 'update', folder.id, {
    name: 'Не сохранено'
  }).catch(error => error.message);
  expect(error).toContain('Ошибка сохранения');
  await equalFolders(second, [folder]);
  ackDelay = 500;
  const saving = call(page, 'update', folder.id, { name: 'Изменено' }).catch(
    error => error.message
  );
  await expect
    .poll(async () => (await snapshot(second)).folders[0]?.name)
    .toBe('Изменено');
  await call(page, 'switchUser');
  await saving;
  await call(second, 'update', folder.id, { icon: 'star' });
  await equalFolders(page, []);
});
