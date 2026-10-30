const DB_NAME = 'chat-topic-messages-db';
const DB_VERSION = 6;
const PENDING_UPLOADS_STORE_NAME = 'pendingUploads';
const PENDING_UPLOAD_CHUNKS_STORE_NAME = 'pendingUploadChunks';
const PENDING_UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;
const PENDING_UPLOAD_OPFS_WRITE_CHUNK_SIZE = 4 * 1024 * 1024;
const PENDING_UPLOAD_OPFS_WRITE_YIELD_MS = 0;
const PENDING_UPLOADS_OPFS_DIRECTORY = 'pending-uploads';

interface PendingUploadPayload {
  cacheKey: string;
  topicId: string;
  messageId: string;
  fileId: string;
  file?: File;
  fileBytes?: ArrayBuffer;
  opfsFileName?: string;
  originName?: string;
  contentType?: string;
  lastModified?: number;
  fileSize?: number;
  chunkCount?: number;
  isMedia: boolean;
  updatedAt: string;
}

interface PendingUploadChunk {
  cacheKey: string;
  chunkIndex: number;
  data: Blob | ArrayBuffer;
}

type PendingUploadWorkerRequest =
  | {
      id: number;
      action: 'save';
      payload: unknown;
    }
  | {
      id: number;
      action: 'load' | 'delete';
      payload: { cacheKey: string };
    };

type PendingUploadWorkerResponse = {
  id: number;
  result?: unknown;
  error?: string;
  progress?: number;
};

let workerDbPromise: Promise<IDBDatabase> | null = null;

type StorageManagerWithDirectory = StorageManager & {
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
};

const getPendingUploadOpfsFileName = (cacheKey: string): string => {
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

const getPendingUploadsOpfsDirectory = async (
  create: boolean
): Promise<FileSystemDirectoryHandle | null> => {
  const storage = navigator.storage as StorageManagerWithDirectory | undefined;

  if (!storage?.getDirectory) {
    return null;
  }

  try {
    const root = await storage.getDirectory();
    return await root.getDirectoryHandle(PENDING_UPLOADS_OPFS_DIRECTORY, {
      create
    });
  } catch {
    return null;
  }
};

const deletePendingUploadFileFromOpfs = async (
  cacheKey: string
): Promise<void> => {
  const directory = await getPendingUploadsOpfsDirectory(false);

  if (!directory) {
    return;
  }

  await directory
    .removeEntry(getPendingUploadOpfsFileName(cacheKey))
    .catch(() => undefined);
};

const openWorkerDb = (): Promise<IDBDatabase> => {
  if (workerDbPromise) {
    return workerDbPromise;
  }

  workerDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(PENDING_UPLOADS_STORE_NAME)) {
        db.createObjectStore(PENDING_UPLOADS_STORE_NAME, {
          keyPath: 'cacheKey'
        });
      }

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
        workerDbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });

  return workerDbPromise;
};

const waitForTransaction = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

const deleteChunks = async (cacheKey: string): Promise<void> => {
  const db = await openWorkerDb();
  const tx = db.transaction(PENDING_UPLOAD_CHUNKS_STORE_NAME, 'readwrite');
  const index = tx
    .objectStore(PENDING_UPLOAD_CHUNKS_STORE_NAME)
    .index('cacheKey');
  const request = index.openKeyCursor(IDBKeyRange.only(cacheKey));

  request.onsuccess = () => {
    const cursor = request.result;

    if (!cursor) {
      return;
    }

    tx.objectStore(PENDING_UPLOAD_CHUNKS_STORE_NAME).delete(cursor.primaryKey);
    cursor.continue();
  };

  await waitForTransaction(tx);
};

const savePendingUpload = async (
  id: number,
  payload: PendingUploadPayload
): Promise<void> => {
  const file = payload.file;

  if (!file) {
    throw new Error('Pending upload file is missing');
  }

  await Promise.all([
    runTransaction('readwrite', store => store.delete(payload.cacheKey)),
    deleteChunks(payload.cacheKey),
    deletePendingUploadFileFromOpfs(payload.cacheKey)
  ]);

  const directory = await getPendingUploadsOpfsDirectory(true);
  const opfsFileName = getPendingUploadOpfsFileName(payload.cacheKey);
  const handle = directory
    ? await directory.getFileHandle(opfsFileName, { create: true })
    : null;

  // В старых WebKit OPFS доступен без createWritable: сохраняем частями в IDB.
  if (handle && typeof handle.createWritable === 'function') {
    const writable = await handle.createWritable();

    try {
      for (
        let start = 0;
        start < file.size;
        start += PENDING_UPLOAD_OPFS_WRITE_CHUNK_SIZE
      ) {
        const end = Math.min(
          file.size,
          start + PENDING_UPLOAD_OPFS_WRITE_CHUNK_SIZE
        );
        await writable.write({
          type: 'write',
          position: start,
          data: file.slice(start, end)
        });
        self.postMessage({
          id,
          progress: Math.round((end / file.size) * 100)
        } satisfies PendingUploadWorkerResponse);
        await new Promise<void>(resolve =>
          setTimeout(resolve, PENDING_UPLOAD_OPFS_WRITE_YIELD_MS)
        );
      }

      await writable.close();
    } catch (error) {
      await writable.abort().catch(() => undefined);
      await deletePendingUploadFileFromOpfs(payload.cacheKey);
      throw error;
    }

    await runTransaction('readwrite', store =>
      store.put({
        ...payload,
        file: undefined,
        opfsFileName,
        originName: file.name,
        contentType: file.type,
        lastModified: file.lastModified,
        fileSize: file.size,
        chunkCount: undefined
      })
    );
    return;
  }

  if (handle) await deletePendingUploadFileFromOpfs(payload.cacheKey);

  const chunkCount = Math.ceil(file.size / PENDING_UPLOAD_CHUNK_SIZE);

  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const start = chunkIndex * PENDING_UPLOAD_CHUNK_SIZE;
    const chunk: PendingUploadChunk = {
      cacheKey: payload.cacheKey,
      chunkIndex,
      // WebKit может прервать IDB-транзакцию с Blob временного файла камеры.
      data: await file
        .slice(start, Math.min(file.size, start + PENDING_UPLOAD_CHUNK_SIZE))
        .arrayBuffer()
    };
    const db = await openWorkerDb();
    const tx = db.transaction(PENDING_UPLOAD_CHUNKS_STORE_NAME, 'readwrite');
    tx.objectStore(PENDING_UPLOAD_CHUNKS_STORE_NAME).put(chunk);
    await waitForTransaction(tx);

    self.postMessage({
      id,
      progress: Math.round(((chunkIndex + 1) / chunkCount) * 100)
    } satisfies PendingUploadWorkerResponse);
  }

  const metadata: PendingUploadPayload = {
    ...payload,
    file: undefined,
    originName: file.name,
    contentType: file.type,
    lastModified: file.lastModified,
    fileSize: file.size,
    chunkCount
  };
  await runTransaction('readwrite', store => store.put(metadata));
};

const loadChunks = async (
  metadata: PendingUploadPayload
): Promise<File | null> => {
  if (!metadata.chunkCount || !metadata.originName) {
    return null;
  }

  const db = await openWorkerDb();
  const tx = db.transaction(PENDING_UPLOAD_CHUNKS_STORE_NAME, 'readonly');
  const store = tx.objectStore(PENDING_UPLOAD_CHUNKS_STORE_NAME);
  const range = IDBKeyRange.bound(
    [metadata.cacheKey, 0],
    [metadata.cacheKey, metadata.chunkCount - 1]
  );
  const request = store.getAll(range);
  const chunks = (await new Promise<PendingUploadChunk[]>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as PendingUploadChunk[]);
    request.onerror = () => reject(request.error);
  })) as PendingUploadChunk[];

  await waitForTransaction(tx);

  if (chunks.length !== metadata.chunkCount) {
    return null;
  }

  chunks.sort((left, right) => left.chunkIndex - right.chunkIndex);
  return new File(
    chunks.map(chunk => chunk.data),
    metadata.originName,
    {
      type: metadata.contentType,
      lastModified: metadata.lastModified
    }
  );
};

const loadPendingUpload = async (
  cacheKey: string
): Promise<PendingUploadPayload | undefined> => {
  const metadata = (await runTransaction('readonly', store =>
    store.get(cacheKey)
  )) as PendingUploadPayload | undefined;

  if (!metadata || metadata.file || metadata.fileBytes) {
    return metadata;
  }

  if (metadata.opfsFileName) {
    return metadata;
  }

  const file = await loadChunks(metadata);
  return file ? { ...metadata, file } : undefined;
};

const deletePendingUpload = async (cacheKey: string): Promise<void> => {
  await Promise.all([
    runTransaction('readwrite', store => store.delete(cacheKey)),
    deleteChunks(cacheKey),
    deletePendingUploadFileFromOpfs(cacheKey)
  ]);
};

const runTransaction = async (
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest
): Promise<unknown> => {
  const db = await openWorkerDb();

  return await new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_UPLOADS_STORE_NAME, mode);
    const request = operation(tx.objectStore(PENDING_UPLOADS_STORE_NAME));
    let result: unknown;

    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
};

self.addEventListener(
  'message',
  async (event: MessageEvent<PendingUploadWorkerRequest>) => {
    const { id, action, payload } = event.data;
    const response: PendingUploadWorkerResponse = { id };

    try {
      if (action === 'save') {
        await savePendingUpload(id, payload as PendingUploadPayload);
      } else if (action === 'load') {
        response.result = await loadPendingUpload(payload.cacheKey);
      } else {
        await deletePendingUpload(payload.cacheKey);
      }
    } catch (error) {
      response.error =
        error instanceof Error ? error.message : 'Pending upload worker failed';
    }

    self.postMessage(response);
  }
);

export {};
