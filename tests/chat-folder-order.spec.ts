import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  sortChatFolders,
  moveChatFolder
} from '../src/utils/chat-folder-order';
import type { ChatFolder } from '../src/services/useChatSDK/chat-folder';

const folder = (
  id: string,
  createdAt: string,
  position?: number
): ChatFolder => ({
  id,
  createdAt,
  position,
  updatedAt: createdAt,
  name: id,
  icon: 'folder',
  topicIds: []
});

describe('Порядок папок', () => {
  it('сортирует по сохранённой позиции, а не по дате создания', () => {
    const folders = [
      folder('old', '2026-09-29', 1),
      folder('new', '2026-10-02', 0)
    ];
    assert.deepEqual(
      sortChatFolders(folders).map(item => item.id),
      ['new', 'old']
    );
    assert.equal(folders[0].id, 'old');
  });

  it('сохраняет прежний порядок, если сервер ещё не возвращает позиции', () => {
    assert.deepEqual(
      sortChatFolders([
        folder('b', '2026-09-29'),
        folder('a', '2026-09-29'),
        folder('c', '2026-10-02')
      ]).map(item => item.id),
      ['a', 'b', 'c']
    );
  });

  it('переносит в начало, конец и на соседнее место без потери элементов', () => {
    const ids = ['a', 'b', 'c', 'd'];
    assert.deepEqual(moveChatFolder(ids, 'd', 'a'), ['d', 'a', 'b', 'c']);
    assert.deepEqual(moveChatFolder(ids, 'a', 'd'), ['b', 'c', 'd', 'a']);
    assert.deepEqual(moveChatFolder(ids, 'b', 'c'), ['a', 'c', 'b', 'd']);
    assert.deepEqual(ids, ['a', 'b', 'c', 'd']);
  });

  it('не добавляет служебные кнопки или неизвестные папки', () => {
    for (const [from, to] of [
      ['all', 'a'],
      ['a', 'settings'],
      ['a', 'a']
    ])
      assert.deepEqual(moveChatFolder(['a', 'b'], from, to), ['a', 'b']);
  });
});
