import { beforeEach, expect, test } from 'bun:test';
import { readChatAccess, saveChatAccess } from '../src/utils/chat-access-cache';
import {
  readChatFolders,
  saveChatFolders
} from '../src/utils/chat-folder-cache';
import type { ChatFolder } from '../src/services/useChatSDK/chat-folder';

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  }
});
beforeEach(() => values.clear());
const folder: ChatFolder = {
  id: 'work',
  name: 'Работа',
  icon: 'star',
  scope: 'clients',
  position: 2,
  topicIds: ['topic-a'],
  createdAt: '2026-10-26T00:00:00Z',
  updatedAt: '2026-10-26T00:00:00Z'
};

test('точные пункты меню и папки изолированы по пользователю и серверу', () => {
  saveChatAccess('a', 'https://one.invalid/api/', { client: false, ai: true });
  saveChatFolders('a', 'https://one.invalid/api/', [folder]);
  expect(readChatAccess('a', 'https://one.invalid/api')).toEqual({
    client: false,
    ai: true
  });
  expect(readChatFolders('a', 'https://one.invalid/api')).toEqual([folder]);
  for (const [user, base] of [
    ['b', 'https://one.invalid/api'],
    ['a', 'https://two.invalid/api']
  ]) {
    expect(readChatAccess(user, base)).toBeNull();
    expect(readChatFolders(user, base)).toEqual([]);
  }
  saveChatAccess('b', 'https://two.invalid/api', { client: true, ai: false });
  expect(readChatAccess('a', 'https://one.invalid/api')).toEqual({
    client: false,
    ai: true
  });
});

test('отзыв доступа и удаление папок заменяют старый снимок', () => {
  saveChatAccess('a', 'server', { client: true, ai: true });
  saveChatFolders('a', 'server', [folder]);
  saveChatAccess('a', 'server', { client: false, ai: false });
  saveChatFolders('a', 'server', []);
  expect(readChatAccess('a', 'server')).toEqual({ client: false, ai: false });
  expect(readChatFolders('a', 'server')).toEqual([]);
});

test('повреждённый снимок не выдаёт пункты меню и не ломает папки', () => {
  saveChatAccess('a', 'server', { client: true, ai: false });
  saveChatFolders('a', 'server', [folder]);
  const accessKey = [...values.keys()].find(key =>
    key.startsWith('chat_menu_access:')
  )!;
  const foldersKey = [...values.keys()].find(key =>
    key.startsWith('chat_folders:')
  )!;
  for (const invalid of ['{', '{}', '{"client":"true","ai":false}']) {
    values.set(accessKey, invalid);
    expect(readChatAccess('a', 'server')).toBeNull();
  }
  for (const invalid of [
    null,
    {},
    [{ ...folder, icon: 'invalid' }],
    [{ ...folder, topicIds: [5] }],
    [{ ...folder, scope: 'other' }],
    [{ ...folder, updatedAt: 'bad' }],
    [folder, folder]
  ]) {
    values.set(foldersKey, JSON.stringify(invalid));
    expect(readChatFolders('a', 'server')).toEqual([]);
  }
});
