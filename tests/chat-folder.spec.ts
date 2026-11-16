import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Reqi } from '@pksep/reqi';
import type { Socket } from 'socket.io-client';
import {
  ChatFolderApi,
  chatFolderIcons,
  type ChatFolder
} from '../src/services/useChatSDK/chat-folder';
import { ChatWS } from '../src/services/useChatSDK/ws';

const folder: ChatFolder = {
  id: 'folder-1',
  name: 'Работа',
  icon: 'briefcase',
  topicIds: ['topic-1'],
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z'
};

const apiWithAck = (handle: (command: string, payload: any) => unknown) => {
  const ws = new ChatWS({
    connected: true,
    emit(command: string, raw: string, ack: (response: unknown) => void) {
      ack(handle(command, JSON.parse(raw)));
    }
  } as unknown as Socket);
  return new ChatFolderApi({} as Reqi, ws);
};

describe('API папок чатов', () => {
  it('передаёт одну ссылку ИИ с подтверждением без замены содержимого папки', async () => {
    const commands: { command: string; payload: unknown }[] = [];
    const api = apiWithAck((command, payload) => {
      commands.push({ command, payload });
      return { success: true, data: folder };
    });
    await api.setChatFolderAiItem(
      folder.id,
      { type: 'session', id: 'opaque-id' },
      true
    );
    assert.deepEqual(commands, [
      {
        command: 'setChatFolderAiItem',
        payload: {
          folderId: folder.id,
          item: { type: 'session', id: 'opaque-id' },
          included: true
        }
      }
    ]);
  });
  it('передаёт создание, изменение, порядок и удаление через сокет с подтверждением', async () => {
    const commands: { command: string; payload: unknown }[] = [];
    const api = apiWithAck((command, payload) => {
      commands.push({ command, payload });
      return {
        success: true,
        data: command === 'reorderChatFolders' ? [folder] : folder
      };
    });
    assert.deepEqual(
      await api.createChatFolder({
        name: folder.name,
        icon: folder.icon,
        scope: 'clients',
        topicIds: ['topic-1']
      }),
      folder
    );
    assert.deepEqual(
      await api.updateChatFolder(folder.id, { icon: 'star' }),
      folder
    );
    assert.deepEqual(await api.reorderChatFolders('clients', [folder.id]), [
      folder
    ]);
    await api.deleteChatFolder(folder.id);
    assert.deepEqual(commands, [
      {
        command: 'createChatFolder',
        payload: {
          name: folder.name,
          icon: folder.icon,
          scope: 'clients',
          topicIds: ['topic-1']
        }
      },
      {
        command: 'updateChatFolder',
        payload: { folderId: folder.id, icon: 'star' }
      },
      {
        command: 'reorderChatFolders',
        payload: { scope: 'clients', folderIds: [folder.id] }
      },
      { command: 'deleteChatFolder', payload: { folderId: folder.id } }
    ]);
  });

  it('изменяет одну связь вместо замены полного списка чатов', async () => {
    const api = apiWithAck((command, payload) => {
      assert.equal(command, 'setChatFolderTopic');
      assert.deepEqual(payload, {
        folderId: folder.id,
        topicId: 'topic-2',
        included: true
      });
      return {
        success: true,
        data: { ...folder, topicIds: ['topic-1', 'topic-2'] }
      };
    });
    assert.deepEqual(
      (await api.setChatFolderTopic(folder.id, 'topic-2', true)).topicIds,
      ['topic-1', 'topic-2']
    );
  });

  it('синхронизирует список через сокет после переподключения', async () => {
    const api = apiWithAck((command, payload) => {
      assert.equal(command, 'getChatFolders');
      assert.deepEqual(payload, {});
      return { success: true, data: [folder] };
    });
    assert.deepEqual(await api.syncChatFolders(), [folder]);
  });

  it('возвращает серверную ошибку форме и отклоняет некорректный ack', async () => {
    await assert.rejects(
      apiWithAck(() => ({
        success: false,
        error: 'Нет доступа к топику'
      })).setChatFolderTopic(folder.id, 'topic-2', true),
      /Нет доступа к топику/
    );
    await assert.rejects(
      apiWithAck(() => undefined).createChatFolder({ name: 'Новая' }),
      /Не удалось изменить папки/
    );
  });

  it('не считает отключённый сокет успешным сохранением', async () => {
    const api = new ChatFolderApi({} as Reqi, new ChatWS());
    await assert.rejects(api.deleteChatFolder(folder.id), /not connected/);
  });

  it('содержит 21 уникальную иконку в порядке макета', () => {
    assert.equal(chatFolderIcons.length, 21);
    assert.equal(new Set(chatFolderIcons).size, 21);
    assert.equal(chatFolderIcons[0], 'folder');
    assert.equal(chatFolderIcons.at(-1), 'home');
  });
});
