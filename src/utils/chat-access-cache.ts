import type { ChatAccessValues } from '../types/chat-access';

const cacheKey = (userId: string, apiBase: string): string =>
  `chat_menu_access:${encodeURIComponent(apiBase.replace(/\/+$/, ''))}:${encodeURIComponent(userId)}`;

export function readChatAccess(
  userId?: string,
  apiBase?: string
): ChatAccessValues | null {
  if (!userId || !apiBase) return null;
  try {
    const values = JSON.parse(
      localStorage.getItem(cacheKey(userId, apiBase)) || 'null'
    );
    return typeof values?.client === 'boolean' &&
      typeof values?.ai === 'boolean'
      ? { client: values.client, ai: values.ai }
      : null;
  } catch {
    return null;
  }
}

export function saveChatAccess(
  userId: string,
  apiBase: string,
  values: ChatAccessValues
): void {
  try {
    localStorage.setItem(cacheKey(userId, apiBase), JSON.stringify(values));
  } catch {
    // Недоступное хранилище не мешает обновить меню в текущей сессии.
  }
}
