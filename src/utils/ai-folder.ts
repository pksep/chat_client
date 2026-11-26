import type {
  AiFolderItem,
  ChatFolder
} from '../services/useChatSDK/chat-folder';

export function aiFolderItemKey(item: AiFolderItem): string {
  return `${item.type}:${item.id}`;
}

export function parseAiFolderItemKey(key: string): AiFolderItem {
  const separator = key.indexOf(':');
  const type = key.slice(0, separator);
  const id = key.slice(separator + 1);
  if (
    (type !== 'session' && type !== 'automation') ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id)
  ) {
    throw new Error('Некорректный элемент папки ИИ');
  }

  return { type, id };
}

export function folderContainsAiItem(
  folder: ChatFolder,
  item: AiFolderItem
): boolean {
  return (folder.aiItems ?? []).some(
    member => member.type === item.type && member.id === item.id
  );
}

export function automationFolderItem(task: {
  id: string;
  sessionId?: string;
}): AiFolderItem {
  return task.sessionId
    ? { type: 'session', id: task.sessionId }
    : { type: 'automation', id: task.id };
}
