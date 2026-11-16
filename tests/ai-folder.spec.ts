import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aiFolderItemKey,
  automationFolderItem,
  folderContainsAiItem,
  parseAiFolderItemKey
} from '../src/utils/ai-folder';
import type { ChatFolder } from '../src/services/useChatSDK/chat-folder';
import { useChatListSelection } from '../src/composables/useChatListSelection';
import {
  readChatFolders,
  saveChatFolders
} from '../src/utils/chat-folder-cache';

const folder: ChatFolder = {
  id: 'ai-folder',
  name: 'ИИ',
  scope: 'ai',
  icon: 'robot',
  topicIds: [],
  aiItems: [{ type: 'session', id: 'Case:001' }],
  createdAt: '2026-11-16T00:00:00Z',
  updatedAt: '2026-11-16T00:00:00Z'
};

describe('Личные папки ИИ', () => {
  it('не меняет выбранную папку или фильтр чатов и клиентов', () => {
    const chats = useChatListSelection('chats');
    const clients = useChatListSelection('clients');
    const ai = useChatListSelection('ai');
    chats.selectFilter('unread');
    clients.activeFolderId.value = 'client-folder';
    ai.activeFolderId.value = 'ai-folder';
    assert.equal(chats.selectedFilter.value, 'unread');
    assert.equal(clients.activeFolderId.value, 'client-folder');
    assert.equal(ai.activeFolderId.value, 'ai-folder');
  });
  it('сохраняет непрозрачный ID, регистр и тип ссылки', () => {
    const item = { type: 'session' as const, id: 'Case:001' };
    assert.deepEqual(parseAiFolderItemKey(aiFolderItemKey(item)), item);
    assert.equal(folderContainsAiItem(folder, item), true);
    assert.equal(
      folderContainsAiItem(folder, { type: 'automation', id: item.id }),
      false
    );
    assert.throws(() => parseAiFolderItemKey('session:../foreign'));
  });

  it('сохраняет связь с папкой при превращении черновика в автоматизацию', () => {
    assert.equal(
      folderContainsAiItem(
        folder,
        automationFolderItem({ id: 'new-automation-id', sessionId: 'Case:001' })
      ),
      true
    );
    assert.deepEqual(automationFolderItem({ id: 'task-without-session' }), {
      type: 'automation',
      id: 'task-without-session'
    });
  });

  it('восстанавливает папки ИИ только для владельца и организации, отклоняет испорченный кеш', () => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string): string | null => values.get(key) ?? null,
        setItem: (key: string, value: string): void => {
          values.set(key, value);
        }
      }
    });
    saveChatFolders('owner', 'http://organization/api', [folder]);
    assert.deepEqual(readChatFolders('owner', 'http://organization/api'), [
      folder
    ]);
    assert.deepEqual(readChatFolders('another', 'http://organization/api'), []);
    assert.deepEqual(readChatFolders('owner', 'http://another/api'), []);
    for (const key of values.keys())
      values.set(key, JSON.stringify([{ ...folder, aiItems: 'broken' }]));
    assert.deepEqual(readChatFolders('owner', 'http://organization/api'), []);
  });
});
