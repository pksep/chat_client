const MAX_PREVIEW_AGE_MS = 5 * 60 * 1000;
const key = (apiUrl: string, userId: string) =>
  `chat-topic-preview-v1:${apiUrl.replace(/\/+$/, '')}:${userId}`;

export const clearTopicPreviewFreshness = (userId: string): void => {
  try {
    // Обычный кеш общий для серверов: новая запись отменяет прежние отметки.
    for (const cachedKey of Object.keys(localStorage))
      if (
        cachedKey.startsWith('chat-topic-preview-v1:') &&
        cachedKey.endsWith(`:${userId}`)
      )
        localStorage.removeItem(cachedKey);
  } catch {
    /* Кеш необязателен. */
  }
};

export const saveTopicPreviewFreshness = (
  apiUrl: string,
  userId: string,
  confirmedAt: number
): void => {
  if (!apiUrl || !userId || !confirmedAt) return;
  try {
    localStorage.setItem(key(apiUrl, userId), String(confirmedAt));
  } catch {
    // Без отметки свежести следующий запуск дождётся ответа сервера.
  }
};

export const hasRecentTopicPreview = (
  apiUrl: string,
  userId: string,
  now = Date.now()
): boolean => {
  if (!apiUrl || !userId) return false;
  try {
    const confirmedAt = Number(localStorage.getItem(key(apiUrl, userId)));
    return (
      confirmedAt > 0 &&
      confirmedAt <= now &&
      now - confirmedAt < MAX_PREVIEW_AGE_MS
    );
  } catch {
    return false;
  }
};
