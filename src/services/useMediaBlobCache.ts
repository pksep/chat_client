import { getConfig } from './useConfig';

const DB_NAME = 'chat-media-blob-cache-db';
const DB_VERSION = 2;
const MEDIA_BLOB_STORE = 'mediaBlobs';
const MAX_CACHE_BYTES = 200 * 1024 * 1024;
const MAX_CACHE_ITEM_BYTES = 64 * 1024 * 1024;
const ACCESSED_AT_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

interface CachedMediaBlobRecord {
  key: string;
  path: string;
  blob: Blob;
  mimeType: string;
  size: number;
  createdAt: string;
  accessedAt: string;
}

const objectUrlCache = new Map<string, string>();
const pendingMediaRequests = new Map<string, Promise<string | null>>();
const pendingCachedMediaReads = new Map<string, Promise<string | null>>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

const hasIndexedDb = () =>
  typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';

const openDb = async (): Promise<IDBDatabase | null> => {
  if (!hasIndexedDb()) {
    return null;
  }

  if (dbPromise) {
    return dbPromise;
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(MEDIA_BLOB_STORE)) {
        const mediaStore = db.createObjectStore(MEDIA_BLOB_STORE, {
          keyPath: 'key'
        });
        mediaStore.createIndex('accessedAt', 'accessedAt', { unique: false });
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

const shouldRefreshAccessedAt = (value?: string): boolean => {
  if (!value) {
    return true;
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return true;
  }

  return Date.now() - timestamp >= ACCESSED_AT_REFRESH_INTERVAL_MS;
};

const getRecord = async (
  path: string
): Promise<CachedMediaBlobRecord | null> => {
  const db = await openDb();

  if (!db) {
    return null;
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_BLOB_STORE, 'readonly');
    const store = tx.objectStore(MEDIA_BLOB_STORE);
    const request = store.get(path);

    request.onsuccess = () =>
      resolve((request.result as CachedMediaBlobRecord | undefined) || null);
    request.onerror = () => reject(request.error);
  });
};

const putRecord = async (record: CachedMediaBlobRecord): Promise<void> => {
  const db = await openDb();

  if (!db) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MEDIA_BLOB_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_BLOB_STORE);
    const request = store.put(record);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getAllRecords = async (): Promise<CachedMediaBlobRecord[]> => {
  const db = await openDb();

  if (!db) {
    return [];
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(MEDIA_BLOB_STORE, 'readonly');
    const store = tx.objectStore(MEDIA_BLOB_STORE);
    const request = store.getAll();

    request.onsuccess = () =>
      resolve((request.result as CachedMediaBlobRecord[] | undefined) || []);
    request.onerror = () => reject(request.error);
  });
};

const deleteRecord = async (path: string): Promise<void> => {
  const db = await openDb();

  if (!db) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MEDIA_BLOB_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_BLOB_STORE);
    const request = store.delete(path);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const ensureCacheWithinLimit = async (): Promise<void> => {
  const records = await getAllRecords();
  const totalSize = records.reduce(
    (sum, record) => sum + (record.size || 0),
    0
  );

  if (totalSize <= MAX_CACHE_BYTES) {
    return;
  }

  let bytesToFree = totalSize - MAX_CACHE_BYTES;
  const sortedByAccess = [...records].sort((left, right) =>
    left.accessedAt.localeCompare(right.accessedAt)
  );

  for (const record of sortedByAccess) {
    await deleteRecord(record.path);

    const cachedObjectUrl = objectUrlCache.get(record.path);
    if (cachedObjectUrl) {
      URL.revokeObjectURL(cachedObjectUrl);
      objectUrlCache.delete(record.path);
    }

    bytesToFree -= record.size || 0;

    if (bytesToFree <= 0) {
      break;
    }
  }
};

const buildMediaSourceUrl = (path: string): string => {
  const config = getConfig();
  if (/^(blob:|data:|file:\/\/|https?:\/\/)/i.test(path)) {
    return path;
  }

  const cdnBase = config.CHAT_PATH_TO_FILE_CDN.replace(/\/+$/, '');

  if (path.startsWith('/')) {
    try {
      const resolvedCdn = new URL(cdnBase, window.location.href);
      return new URL(path, resolvedCdn.origin).toString();
    } catch {
      return path;
    }
  }

  return `${cdnBase}/${path}`;
};

export const getCachedMediaObjectUrl = (
  path?: string | null
): string | null => {
  if (!path) {
    return null;
  }

  return objectUrlCache.get(path) || null;
};

export const loadCachedMediaObjectUrl = async (
  path?: string | null
): Promise<string | null> => {
  if (!path || typeof window === 'undefined') return null;

  const cachedObjectUrl = objectUrlCache.get(path);
  if (cachedObjectUrl) return cachedObjectUrl;

  const pendingRead = pendingCachedMediaReads.get(path);
  if (pendingRead) return pendingRead;

  const read = (async () => {
    try {
      const existingRecord = await getRecord(path);
      if (!existingRecord?.blob) return null;

      const objectUrl = URL.createObjectURL(existingRecord.blob);
      objectUrlCache.set(path, objectUrl);
      if (shouldRefreshAccessedAt(existingRecord.accessedAt)) {
        void putRecord({
          ...existingRecord,
          accessedAt: new Date().toISOString()
        });
      }
      return objectUrl;
    } catch (error) {
      console.warn('Failed to read cached media object URL:', error);
      return null;
    } finally {
      pendingCachedMediaReads.delete(path);
    }
  })();

  pendingCachedMediaReads.set(path, read);
  return read;
};

export const ensureMediaObjectUrl = async (
  path?: string | null
): Promise<string | null> => {
  if (!path || typeof window === 'undefined') {
    return null;
  }

  const cachedObjectUrl = objectUrlCache.get(path);
  if (cachedObjectUrl) {
    return cachedObjectUrl;
  }

  const pendingRequest = pendingMediaRequests.get(path);
  if (pendingRequest) {
    return pendingRequest;
  }

  const request = (async () => {
    try {
      const storedObjectUrl = await loadCachedMediaObjectUrl(path);
      if (storedObjectUrl) return storedObjectUrl;

      const sourceUrl = buildMediaSourceUrl(path);
      const response = await fetch(sourceUrl, {
        credentials: 'include'
      });

      if (!response.ok) {
        return null;
      }

      const contentLength = Number(response.headers.get('content-length'));

      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_CACHE_ITEM_BYTES
      ) {
        await response.body?.cancel().catch(() => undefined);
        objectUrlCache.set(path, sourceUrl);
        return sourceUrl;
      }

      const blob = await response.blob();

      if (blob.size > MAX_CACHE_ITEM_BYTES) {
        objectUrlCache.set(path, sourceUrl);
        return sourceUrl;
      }

      const now = new Date().toISOString();
      const objectUrl = URL.createObjectURL(blob);

      objectUrlCache.set(path, objectUrl);

      await putRecord({
        key: path,
        path,
        blob,
        mimeType: blob.type || 'application/octet-stream',
        size: blob.size || 0,
        createdAt: now,
        accessedAt: now
      });
      await ensureCacheWithinLimit();

      return objectUrl;
    } catch (error) {
      console.warn('Failed to ensure media object URL:', error);
      return null;
    } finally {
      pendingMediaRequests.delete(path);
    }
  })();

  pendingMediaRequests.set(path, request);
  return request;
};

export const prefetchMediaObjectUrl = (path?: string | null): void => {
  if (!path) {
    return;
  }

  void ensureMediaObjectUrl(path);
};

if (typeof window !== 'undefined') {
  // Remove oversized leftovers created by older clients. This is derived
  // browser cache only; messages and server objects remain untouched.
  void ensureCacheWithinLimit().catch(error => {
    console.warn('Failed to trim media blob cache:', error);
  });
}
