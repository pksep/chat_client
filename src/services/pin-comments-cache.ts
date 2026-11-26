import { openChatDatabase } from '../utils/chat-startup-databases';
import type { PinCommentSnapshot } from './pin-comments';

const storeName = 'pinCommentTopics';
export const loadPinComments = async (
  owner: string,
  topicId: string
): Promise<PinCommentSnapshot | null> => {
  const db = await openChatDatabase('chat-topic-messages-db');
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(storeName, 'readonly')
      .objectStore(storeName)
      .get(`${owner}:${topicId}`);
    request.onsuccess = () => resolve(request.result?.snapshot ?? null);
    request.onerror = () => reject(request.error);
  });
};
export const savePinComments = async (
  owner: string,
  topicId: string,
  snapshot: PinCommentSnapshot
): Promise<void> => {
  const db = await openChatDatabase('chat-topic-messages-db');
  if (!db) throw new Error('Хранилище очереди недоступно');
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction
      .objectStore(storeName)
      .put({ cacheKey: `${owner}:${topicId}`, snapshot });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Сохранение очереди отменено'));
  });
};
