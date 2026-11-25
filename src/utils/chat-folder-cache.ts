import {
  chatFolderIcons,
  type ChatFolder
} from '../services/useChatSDK/chat-folder';

const cacheKey = (userId: string, apiBase: string): string =>
  `chat_folders:${encodeURIComponent(apiBase.replace(/\/+$/, ''))}:${encodeURIComponent(userId)}`;

const isFolder = (value: unknown): value is ChatFolder => {
  if (!value || typeof value !== 'object') return false;
  const folder = value as ChatFolder;
  return (
    typeof folder.id === 'string' &&
    !!folder.id &&
    typeof folder.name === 'string' &&
    chatFolderIcons.includes(folder.icon) &&
    (folder.scope === undefined ||
      folder.scope === 'chats' ||
      folder.scope === 'clients' ||
      folder.scope === 'ai') &&
    (folder.isSystem === undefined || typeof folder.isSystem === 'boolean') &&
    (folder.position === undefined ||
      (typeof folder.position === 'number' &&
        Number.isFinite(folder.position))) &&
    Array.isArray(folder.topicIds) &&
    (folder.aiItems === undefined ||
      (Array.isArray(folder.aiItems) &&
        folder.aiItems.every(
          item =>
            item &&
            (item.type === 'session' || item.type === 'automation') &&
            typeof item.id === 'string' &&
            /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(item.id)
        ))) &&
    folder.topicIds.every(id => typeof id === 'string') &&
    typeof folder.createdAt === 'string' &&
    Number.isFinite(Date.parse(folder.createdAt)) &&
    typeof folder.updatedAt === 'string' &&
    Number.isFinite(Date.parse(folder.updatedAt))
  );
};

export function readChatFolders(
  userId?: string,
  apiBase?: string
): ChatFolder[] {
  if (!userId || !apiBase) return [];
  try {
    const values: unknown = JSON.parse(
      localStorage.getItem(cacheKey(userId, apiBase)) || 'null'
    );
    return Array.isArray(values) &&
      values.every(isFolder) &&
      new Set(values.map(folder => folder.id)).size === values.length
      ? values
      : [];
  } catch {
    return [];
  }
}

export function saveChatFolders(
  userId: string,
  apiBase: string,
  folders: readonly ChatFolder[]
): void {
  try {
    localStorage.setItem(cacheKey(userId, apiBase), JSON.stringify(folders));
  } catch {
    // Папки остаются доступны в памяти, если локальное хранилище заполнено.
  }
}
