import { openChatDatabase } from './chat-startup-databases';
import { getChatAuthSession } from './stored-chat-session';

interface PreparedRecord {
  token: string;
  userId: string;
  startedAt: number;
  result: Promise<unknown>;
  revision: number;
}
const prepared = new Map<string, PreparedRecord>();
let revision = 0;
const recordKey = (database: string, store: string, key: string) =>
  JSON.stringify([database, store, key]);

export const discardStartupTopicRecords = (): void => {
  revision++;
  prepared.clear();
};

export const takeStartupTopicRecord = <T>(
  database: string,
  store: string,
  key: string
): Promise<T> | undefined => {
  const id = recordKey(database, store, key);
  const record = prepared.get(id);
  prepared.delete(id);
  if (!record) return;
  const session = getChatAuthSession();
  const age = performance.now() - record.startedAt;
  if (
    age < 0 ||
    age > 10000 ||
    session?.token !== record.token ||
    session?.user?.id !== record.userId
  )
    return;
  return record.result.then(value => {
    const current = getChatAuthSession();
    if (
      record.revision !== revision ||
      current?.token !== record.token ||
      current?.user?.id !== record.userId
    ) {
      throw new Error('Стартовая запись кеша устарела');
    }
    return value as T;
  });
};

export const prepareStartupTopicRecords = async (
  topicId: string
): Promise<void> => {
  discardStartupTopicRecords();
  const session = getChatAuthSession();
  const userId = session?.user?.id;
  if (
    !topicId ||
    !session?.token ||
    !userId ||
    localStorage.getItem('chat.indexeddb.reset.done') !==
      'chat-client-indexeddb-reset-2026-04-29-v1'
  )
    return;
  const startedAt = performance.now();
  const read = (
    database: string,
    store: string,
    key: string,
    range?: IDBKeyRange
  ) => {
    const result = openChatDatabase(database).then(db => {
      if (!db) throw new Error('База стартового кеша недоступна');
      return new Promise<unknown>((resolve, reject) => {
        const transaction = db.transaction(store, 'readonly');
        const records = transaction.objectStore(store);
        const request = range ? records.getAll(range) : records.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    });
    const id = recordKey(database, store, key);
    const record = {
      token: session.token,
      userId,
      startedAt,
      result,
      revision
    };
    prepared.set(id, record);
    void result.catch(() => {
      if (prepared.get(id) === record) prepared.delete(id);
    });
  };
  const key = `${userId}:${topicId}`;
  // Только локальные изменения выбранной переписки: история и файлы остаются отложенными.
  read(
    'chat-topic-messages-db',
    'pendingUploadMeta',
    key,
    IDBKeyRange.bound(`${key}:`, `${key};`, false, true)
  );
  if (localStorage.getItem('chat.shadowSync.enabled') !== 'false') {
    read('chat-sync-shadow-db', 'readStates', key);
    read(
      'chat-sync-shadow-db',
      'syncMeta',
      `${userId}:deletedMessages:${topicId}`
    );
    read('chat-sync-shadow-db', 'syncMeta', `${userId}:ranges:${topicId}`);
  }
  await Promise.allSettled([...prepared.values()].map(record => record.result));
  performance.mark('chat-startup:topic-records-ready');
};
