interface DatabaseSchema {
  version: number;
  stores: Record<string, string | string[]>;
}

const schemas: Record<string, DatabaseSchema> = {
  'chat-offline-state-db': {
    version: 2,
    stores: { entities: 'cacheKey' }
  },
  'chat-sync-shadow-db': {
    version: 3,
    stores: {
      eventLog: 'id',
      topicSnapshots: 'cacheKey',
      topicPreviews: 'cacheKey',
      readStates: 'cacheKey',
      syncMeta: 'key'
    }
  },
  'chat-topic-messages-db': {
    version: 6,
    stores: {
      topicMessages: 'cacheKey',
      pinnedMessages: 'cacheKey',
      pendingUploads: 'cacheKey',
      pendingUploadMeta: 'cacheKey',
      pendingUploadChunks: ['cacheKey', 'chunkIndex']
    }
  }
};

const connections = new Map<string, Promise<IDBDatabase | null>>();

export const openChatDatabase = (name: string): Promise<IDBDatabase | null> => {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  const existing = connections.get(name);
  if (existing) return existing;
  const schema = schemas[name];
  if (!schema) return Promise.reject(new Error('Неизвестная база кеша чата'));

  const connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, schema.version);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const [storeName, keyPath] of Object.entries(schema.stores)) {
        if (db.objectStoreNames.contains(storeName)) continue;
        const store = db.createObjectStore(storeName, { keyPath });
        if (storeName === 'pendingUploadChunks') {
          store.createIndex('cacheKey', 'cacheKey', { unique: false });
        }
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const clear = () => {
        if (connections.get(name) === connection) connections.delete(name);
      };
      db.onversionchange = () => {
        db.close();
        clear();
      };
      db.onclose = clear;
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
  connections.set(name, connection);
  void connection.catch(() => {
    if (connections.get(name) === connection) connections.delete(name);
  });
  return connection;
};

export const prepareChatDatabases = (): void => {
  if (
    localStorage.getItem('chat.indexeddb.reset.done') !==
    'chat-client-indexeddb-reset-2026-04-29-v1'
  )
    return;
  // Открываем те же соединения до импорта Vue, не читая историю и вложения.
  // Схемы общие с сервисами: первый запуск и обновление проходят обычную миграцию.
  void Promise.allSettled(Object.keys(schemas).map(openChatDatabase)).then(
    () => {
      performance.mark('chat-startup:databases-ready');
    }
  );
};
