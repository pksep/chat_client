const DB_NAME = 'chat-topic-messages-db';
const DB_VERSION = 7;
const PENDING_UPLOAD_STORE_NAME = 'pendingUploads';
const PENDING_UPLOAD_CHUNKS_STORE_NAME = 'pendingUploadChunks';
const PENDING_UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;
const PENDING_UPLOAD_OPFS_WRITE_CHUNK_SIZE = 4 * 1024 * 1024;
const PENDING_UPLOAD_OPFS_WRITE_YIELD_MS = 0;
const PENDING_UPLOAD_PERSIST_POLL_MS = 25;
const PENDING_UPLOADS_OPFS_DIRECTORY = 'pending-uploads';
const activeSaves = new Map();
let dbPromise = null;

const getPendingUploadOpfsFileName = cacheKey => {
  let first = 2166136261;
  let second = 2246822519;

  for (let index = 0; index < cacheKey.length; index += 1) {
    const code = cacheKey.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }

  return `pending-${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0)
    .toString(16)
    .padStart(8, '0')}`;
};

const getPendingUploadsOpfsDirectory = async create => {
  if (!navigator.storage?.getDirectory) {
    return null;
  }

  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(PENDING_UPLOADS_OPFS_DIRECTORY, {
      create
    });
  } catch {
    return null;
  }
};

const deleteOpfsFile = async cacheKey => {
  const directory = await getPendingUploadsOpfsDirectory(false);

  if (!directory) {
    return;
  }

  await directory
    .removeEntry(getPendingUploadOpfsFileName(cacheKey))
    .catch(() => undefined);
};

const openDb = () => {
  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      const stores = [
        ['topicMessages', { keyPath: 'cacheKey' }],
        ['pinnedMessages', { keyPath: 'cacheKey' }],
        ['pinCommentTopics', { keyPath: 'cacheKey' }],
        [PENDING_UPLOAD_STORE_NAME, { keyPath: 'cacheKey' }],
        ['pendingUploadMeta', { keyPath: 'cacheKey' }]
      ];

      stores.forEach(([name, options]) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, options);
        }
      });

      if (!db.objectStoreNames.contains(PENDING_UPLOAD_CHUNKS_STORE_NAME)) {
        const store = db.createObjectStore(PENDING_UPLOAD_CHUNKS_STORE_NAME, {
          keyPath: ['cacheKey', 'chunkIndex']
        });
        store.createIndex('cacheKey', 'cacheKey', { unique: false });
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
};

const waitForTransaction = tx =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

const deleteChunks = async cacheKey => {
  const db = await openDb();
  const tx = db.transaction(PENDING_UPLOAD_CHUNKS_STORE_NAME, 'readwrite');
  const store = tx.objectStore(PENDING_UPLOAD_CHUNKS_STORE_NAME);
  const request = store
    .index('cacheKey')
    .openKeyCursor(IDBKeyRange.only(cacheKey));

  request.onsuccess = () => {
    const cursor = request.result;

    if (!cursor) {
      return;
    }

    store.delete(cursor.primaryKey);
    cursor.continue();
  };

  await waitForTransaction(tx);
};

const deleteMetadata = async cacheKey => {
  const db = await openDb();
  const tx = db.transaction(PENDING_UPLOAD_STORE_NAME, 'readwrite');
  tx.objectStore(PENDING_UPLOAD_STORE_NAME).delete(cacheKey);
  await waitForTransaction(tx);
};

const clearPendingUpload = cacheKey =>
  Promise.all([
    deleteMetadata(cacheKey),
    deleteChunks(cacheKey),
    deleteOpfsFile(cacheKey)
  ]);

const notify = (state, payload) => {
  state.ports.forEach(port => {
    try {
      port.postMessage(payload);
    } catch {
      state.ports.delete(port);
    }
  });
};

const yieldToActiveUpload = () =>
  new Promise(resolve =>
    setTimeout(resolve, PENDING_UPLOAD_OPFS_WRITE_YIELD_MS)
  );

const waitForForegroundUpload = async state => {
  while (!state.cancelled) {
    if (state.persistRequested) {
      return true;
    }

    await new Promise(resolve =>
      setTimeout(resolve, PENDING_UPLOAD_PERSIST_POLL_MS)
    );
  }

  return false;
};

const persistFileInIndexedDbChunks = async (payload, file, state) => {
  const chunkCount = Math.ceil(file.size / PENDING_UPLOAD_CHUNK_SIZE);

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    if (state.cancelled) {
      await clearPendingUpload(payload.cacheKey);
      return false;
    }

    const start = chunkIndex * PENDING_UPLOAD_CHUNK_SIZE;
    // Читаем байты до открытия IDB-транзакции: Blob камеры ненадёжен в WebKit.
    const data = await file
      .slice(start, Math.min(file.size, start + PENDING_UPLOAD_CHUNK_SIZE))
      .arrayBuffer();
    const db = await openDb();
    const tx = db.transaction(PENDING_UPLOAD_CHUNKS_STORE_NAME, 'readwrite');
    tx.objectStore(PENDING_UPLOAD_CHUNKS_STORE_NAME).put({
      cacheKey: payload.cacheKey,
      chunkIndex,
      data
    });
    await waitForTransaction(tx);

    state.progress = Math.round(((chunkIndex + 1) / chunkCount) * 100);
    notify(state, { type: 'progress', progress: state.progress });
  }

  if (state.cancelled) {
    await clearPendingUpload(payload.cacheKey);
    return false;
  }

  const db = await openDb();
  const tx = db.transaction(PENDING_UPLOAD_STORE_NAME, 'readwrite');
  tx.objectStore(PENDING_UPLOAD_STORE_NAME).put({
    ...payload,
    file: undefined,
    originName: file.name || payload.originName,
    contentType: file.type || payload.contentType,
    lastModified: file.lastModified || payload.lastModified,
    fileSize: file.size,
    chunkCount,
    updatedAt: new Date().toISOString()
  });
  await waitForTransaction(tx);
  return true;
};

const persistFileInOpfs = async (payload, file, state) => {
  const directory = await getPendingUploadsOpfsDirectory(true);

  if (!directory) {
    return null;
  }

  const opfsFileName = getPendingUploadOpfsFileName(payload.cacheKey);
  const handle = await directory.getFileHandle(opfsFileName, { create: true });
  // В старых WebKit OPFS доступен без createWritable: используем IDB.
  if (typeof handle.createWritable !== 'function') {
    await deleteOpfsFile(payload.cacheKey);
    return null;
  }
  const writable = await handle.createWritable();

  try {
    for (
      let start = 0;
      start < file.size;
      start += PENDING_UPLOAD_OPFS_WRITE_CHUNK_SIZE
    ) {
      if (state.cancelled) {
        await writable.abort();
        await deleteOpfsFile(payload.cacheKey);
        return false;
      }

      const end = Math.min(
        file.size,
        start + PENDING_UPLOAD_OPFS_WRITE_CHUNK_SIZE
      );
      await writable.write({
        type: 'write',
        position: start,
        data: file.slice(start, end)
      });
      state.progress = Math.round((end / file.size) * 100);
      notify(state, { type: 'progress', progress: state.progress });
      await yieldToActiveUpload();
    }

    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    await deleteOpfsFile(payload.cacheKey);
    throw error;
  }

  if (state.cancelled) {
    await deleteOpfsFile(payload.cacheKey);
    return false;
  }

  const db = await openDb();
  const tx = db.transaction(PENDING_UPLOAD_STORE_NAME, 'readwrite');
  tx.objectStore(PENDING_UPLOAD_STORE_NAME).put({
    ...payload,
    file: undefined,
    opfsFileName,
    originName: file.name || payload.originName,
    contentType: file.type || payload.contentType,
    lastModified: file.lastModified || payload.lastModified,
    fileSize: file.size,
    chunkCount: undefined,
    updatedAt: new Date().toISOString()
  });
  await waitForTransaction(tx);
  return true;
};

const persistFile = async (payload, state) => {
  const file = payload.file;

  if (!(file instanceof Blob)) {
    throw new Error('Pending upload file is missing');
  }

  await clearPendingUpload(payload.cacheKey);

  // Complete the durable copy before the foreground multipart request starts.
  // This prevents simultaneous reads of the same File and guarantees that a
  // refreshed page can resume from OPFS at any server-side part boundary.
  if (!(await waitForForegroundUpload(state))) {
    await clearPendingUpload(payload.cacheKey);
    return false;
  }

  const savedInOpfs = await persistFileInOpfs(payload, file, state);
  return savedInOpfs ?? persistFileInIndexedDbChunks(payload, file, state);
};

const startSave = (payload, clientId) => {
  const existing = activeSaves.get(payload.cacheKey);

  if (existing) {
    if (clientId) {
      existing.clientIds.add(clientId);
    }

    return existing;
  }

  const state = {
    progress: 1,
    cancelled: false,
    persistRequested: false,
    payload,
    clientIds: new Set(clientId ? [clientId] : []),
    ports: new Set(),
    promise: null
  };
  state.promise = persistFile(payload, state)
    .then(saved => {
      notify(state, { type: 'done', active: saved === true, saved });
    })
    .catch(error => {
      notify(state, {
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    })
    .finally(() => {
      activeSaves.delete(payload.cacheKey);
      state.ports.forEach(port => port.close());
      state.ports.clear();
    });
  activeSaves.set(payload.cacheKey, state);
  return state;
};

const handleSave = event => {
  const payload = event.data?.payload;
  const port = event.ports?.[0];

  if (!payload?.cacheKey || !port) {
    return;
  }

  const state = startSave(payload, event.source?.id);
  port.postMessage({ type: 'accepted' });
  port.close();
  event.waitUntil(state.promise);
};

const findActiveSave = data => {
  const exact = activeSaves.get(data?.cacheKey);

  if (exact) {
    return exact;
  }

  if (!data?.topicId || !data?.messageId || data?.fileId === undefined) {
    return undefined;
  }

  return Array.from(activeSaves.values()).find(
    state =>
      state.payload.topicId === data.topicId &&
      state.payload.messageId === data.messageId &&
      state.payload.fileId === data.fileId
  );
};

const waitForActiveSave = (event, state, port) => {
  if (event.source?.id) {
    state.clientIds.add(event.source.id);
  }

  state.persistRequested = true;
  state.ports.add(port);
  port.postMessage({ type: 'progress', progress: state.progress });
  event.waitUntil(state.promise);
};

const handlePersist = event => {
  const cacheKey = event.data?.cacheKey;
  const port = event.ports?.[0];

  if (!cacheKey || !port) {
    return;
  }

  const state = findActiveSave(event.data);

  if (!state) {
    port.postMessage({ type: 'done', active: false });
    port.close();
    return;
  }

  waitForActiveSave(event, state, port);
};

const handleWait = event => {
  const cacheKey = event.data?.cacheKey;
  const port = event.ports?.[0];

  if (!cacheKey || !port) {
    return;
  }

  const state = findActiveSave(event.data);

  if (!state) {
    port.postMessage({ type: 'done', active: false });
    port.close();
    return;
  }

  waitForActiveSave(event, state, port);
};

const handleCancel = event => {
  const cacheKey = event.data?.cacheKey;
  const port = event.ports?.[0];

  if (!cacheKey || !port) {
    return;
  }

  const state = findActiveSave(event.data);

  if (!state) {
    port.postMessage({ type: 'done', active: false });
    port.close();
    return;
  }

  state.cancelled = true;
  port.postMessage({ type: 'accepted' });
  port.close();
};

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('message', event => {
  if (event.data?.type === 'PENDING_UPLOAD_SAVE') {
    handleSave(event);
  } else if (event.data?.type === 'PENDING_UPLOAD_PERSIST') {
    handlePersist(event);
  } else if (event.data?.type === 'PENDING_UPLOAD_WAIT') {
    handleWait(event);
  } else if (event.data?.type === 'PENDING_UPLOAD_CANCEL') {
    handleCancel(event);
  }
});
