import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Reqi } from '@pksep/reqi';
import {
  ChatFolderApi,
  chatFolderIcons,
  type ChatFolder
} from '../src/services/useChatSDK/chat-folder';

const folder: ChatFolder = {
  id: 'folder-1',
  name: 'Работа',
  icon: 'briefcase',
  topicIds: ['topic-1'],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z'
};

describe('API папок чатов', () => {
  it('передаёт имя, выбранную иконку и чаты при создании', async () => {
    const payload = {
      name: folder.name,
      icon: folder.icon,
      topicIds: [...folder.topicIds]
    };
    const api = new ChatFolderApi({
      post: async (path, body, options) => {
        assert.equal(path, '/chat-folders');
        assert.deepEqual(body, payload);
        assert.deepEqual(options, { parsed: false });
        return Response.json(folder);
      }
    } as unknown as Reqi);

    assert.deepEqual(await api.createChatFolder(payload), folder);
  });

  it('изменяет только переданные поля, не сбрасывая остальные', async () => {
    const api = new ChatFolderApi({
      patch: async (path, body) => {
        assert.equal(path, '/chat-folders/folder-1');
        assert.deepEqual(body, { icon: 'star' });
        return Response.json({ ...folder, icon: 'star' });
      }
    } as unknown as Reqi);

    assert.deepEqual(await api.updateChatFolder(folder.id, { icon: 'star' }), {
      ...folder,
      icon: 'star'
    });
  });

  it('передаёт раздел клиентской папки и сохраняет его в ответе', async () => {
    const payload = {
      name: 'Клиенты',
      scope: 'clients' as const,
      topicIds: ['client-topic']
    };
    const clientFolder = { ...folder, ...payload };
    const api = new ChatFolderApi({
      post: async (path, body) => {
        assert.equal(path, '/chat-folders');
        assert.deepEqual(body, payload);
        return Response.json(clientFolder);
      }
    } as unknown as Reqi);
    assert.deepEqual(await api.createChatFolder(payload), clientFolder);
  });

  it('удаляет папку без попытки разобрать пустой ответ 204', async () => {
    const api = new ChatFolderApi({
      delete: async (path, options) => {
        assert.equal(path, '/chat-folders/folder-1');
        assert.deepEqual(options, { parsed: false });
        return new Response(null, { status: 204 });
      }
    } as unknown as Reqi);

    await api.deleteChatFolder(folder.id);
  });

  it('не скрывает ошибку сохранения от формы', async () => {
    const error = new Error('Не удалось сохранить папку');
    const api = new ChatFolderApi({
      patch: async () => {
        throw error;
      }
    } as unknown as Reqi);

    await assert.rejects(
      api.updateChatFolder(folder.id, { name: 'Новое' }),
      error
    );
  });

  it('содержит 21 уникальную иконку в порядке макета', () => {
    assert.equal(chatFolderIcons.length, 21);
    assert.equal(new Set(chatFolderIcons).size, 21);
    assert.equal(chatFolderIcons[0], 'folder');
    assert.equal(chatFolderIcons.at(-1), 'home');
  });

  it('сохраняет порядок и раздел одним запросом', async () => {
    const folders = [{ ...folder, position: 0 }];
    const api = new ChatFolderApi({
      patch: async (path, body, options) => {
        assert.equal(path, '/chat-folders/reorder');
        assert.deepEqual(body, { scope: 'clients', folderIds: [folder.id] });
        assert.deepEqual(options, { parsed: false });
        return Response.json(folders);
      }
    } as unknown as Reqi);
    assert.deepEqual(
      await api.reorderChatFolders('clients', [folder.id]),
      folders
    );
  });
});
