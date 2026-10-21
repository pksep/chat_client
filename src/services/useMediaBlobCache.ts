import { getConfig } from './useConfig';
import { getAuthToken, subscribeAuthToken } from '../composables/useLogin';
import { readonly, shallowReactive, shallowRef } from 'vue';
import { getStoredChatAccessToken } from '../composables/useAuth';
import {
  buildBrowserCompatibleImageUrl,
  isHeicMediaPath
} from '../utils/media-format';
import { createMediaObjectUrl } from '../utils/media-object-url';
import {
  buildMediaObjectUrl,
  MEDIA_CACHE_VERSION,
  withMediaCacheVersion
} from '../utils/media-url';

export const isInquiryFile = (path: string): boolean =>
  /^manager-private\/[0-9a-f-]{36}$/i.test(path);
const inquiryObjectUrls = shallowReactive(new Map<string, string>());
const pendingInquiryRequests = new Map<string, Promise<string | null>>();
let inquiryScope = '';
const inquiryRevision = shallowRef(0);
export const inquiryMediaRevision = readonly(inquiryRevision);

const clearInquiryObjectUrls = (): void => {
  inquiryRevision.value++;
  inquiryObjectUrls.forEach(url => URL.revokeObjectURL(url));
  inquiryObjectUrls.clear();
  pendingInquiryRequests.clear();
  inquiryScope = '';
};

const getInquiryScope = (): string => {
  const token = getAuthToken() || getStoredChatAccessToken();
  const base = getConfig().CHAT_API_DOMAIN?.replace(/\/+$/, '');
  const scope = token && base ? `${base}\0${token}` : '';

  if (scope !== inquiryScope) {
    clearInquiryObjectUrls();
    inquiryScope = scope;
  }

  return scope;
};

const unsubscribeInquiryAuth = subscribeAuthToken(token => {
  if (token) getInquiryScope();
  else clearInquiryObjectUrls();
});

if (import.meta.hot) {
  import.meta.hot.dispose((): void => {
    unsubscribeInquiryAuth();
    clearInquiryObjectUrls();
  });
}

// Файлы обращений проверяются сервером при каждом открытии и не попадают в общий кеш браузера.
const loadInquiryFile = (path: string): Promise<string | null> => {
  const scope = getInquiryScope();
  if (!scope) return Promise.resolve(null);
  const revision = inquiryRevision.value;

  const pending = pendingInquiryRequests.get(path);
  if (pending) return pending;

  const token = getAuthToken() || getStoredChatAccessToken();
  const base = getConfig().CHAT_API_DOMAIN.replace(/\/+$/, '');
  const request = (async (): Promise<string | null> => {
    try {
      const response = await fetch(`${base}/media/object/${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(60000)
      });

      if (scope !== getInquiryScope() || revision !== inquiryRevision.value) {
        await response.body?.cancel();
        return null;
      }

      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) {
          const previous = inquiryObjectUrls.get(path);
          if (previous) URL.revokeObjectURL(previous);
          inquiryObjectUrls.delete(path);
        }
        return null;
      }

      // Содержимое по ID неизменно. Повторная проверка доступа не должна
      // отзывать URL, который уже используют сообщение и просмотрщик.
      const previous = inquiryObjectUrls.get(path);
      if (previous) {
        await response.body?.cancel();
        return previous;
      }

      const blob = await response.blob();
      if (scope !== getInquiryScope() || revision !== inquiryRevision.value)
        return null;

      const objectUrl = URL.createObjectURL(blob);
      inquiryObjectUrls.set(path, objectUrl);
      return objectUrl;
    } finally {
      if (pendingInquiryRequests.get(path) === request) {
        pendingInquiryRequests.delete(path);
      }
    }
  })();

  pendingInquiryRequests.set(path, request);
  return request;
};

const DB_NAME = 'chat-media-blob-cache-db';
const DB_VERSION = 3;
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

const getMediaCacheKey = (path: string): string =>
  `${MEDIA_CACHE_VERSION}:${path}`;

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
      } else {
        // The media endpoint URL changed after repairing corrupted encrypted
        // objects. Old blobs must not be reused after this one-time upgrade.
        request.transaction?.objectStore(MEDIA_BLOB_STORE).clear();
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

const deleteRecord = async (key: string): Promise<void> => {
  const db = await openDb();

  if (!db) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MEDIA_BLOB_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_BLOB_STORE);
    const request = store.delete(key);

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
    await deleteRecord(record.key);

    const cacheKey = getMediaCacheKey(record.path);
    const cachedObjectUrl = objectUrlCache.get(cacheKey);
    if (cachedObjectUrl) {
      URL.revokeObjectURL(cachedObjectUrl);
      objectUrlCache.delete(cacheKey);
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
    return buildBrowserCompatibleImageUrl(withMediaCacheVersion(path));
  }

  const cdnBase = config.CHAT_PATH_TO_FILE_CDN.replace(/\/+$/, '');

  if (path.startsWith('/')) {
    try {
      const resolvedCdn = new URL(cdnBase, window.location.href);
      return buildBrowserCompatibleImageUrl(
        withMediaCacheVersion(new URL(path, resolvedCdn.origin).toString())
      );
    } catch {
      return path;
    }
  }

  return buildBrowserCompatibleImageUrl(buildMediaObjectUrl(cdnBase, path));
};

export const readResponseBlobWithinLimit = async (
  response: Response,
  maxBytes: number
): Promise<Blob | null> => {
  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader
    ? Number(contentLengthHeader)
    : Number.NaN;

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }

  if (!response.body) {
    const blob = await response.blob();
    return blob.size <= maxBytes ? blob : null;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      receivedBytes += value.byteLength;

      if (receivedBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return new Blob(chunks, {
    type: response.headers.get('content-type') || 'application/octet-stream'
  });
};

export const getCachedMediaObjectUrl = (
  path?: string | null
): string | null => {
  if (!path) {
    return null;
  }

  if (isInquiryFile(path)) {
    return getInquiryScope() ? inquiryObjectUrls.get(path) || null : null;
  }

  return objectUrlCache.get(getMediaCacheKey(path)) || null;
};

export const loadCachedMediaObjectUrl = async (
  path?: string | null
): Promise<string | null> => {
  if (!path || typeof window === 'undefined') return null;

  if (isInquiryFile(path)) return null;

  const cacheKey = getMediaCacheKey(path);
  const cachedObjectUrl = objectUrlCache.get(cacheKey);
  if (cachedObjectUrl) return cachedObjectUrl;

  const pendingRead = pendingCachedMediaReads.get(cacheKey);
  if (pendingRead) return pendingRead;

  const read = (async () => {
    try {
      const existingRecord = await getRecord(cacheKey);
      if (!existingRecord?.blob) return null;
      // Старые версии кешировали HEIC, который WebView не умеет показывать.
      if (isHeicMediaPath(path) && existingRecord.blob.type !== 'image/webp') {
        return null;
      }

      const objectUrl = await createMediaObjectUrl(existingRecord.blob);
      objectUrlCache.set(cacheKey, objectUrl);
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
      pendingCachedMediaReads.delete(cacheKey);
    }
  })();

  pendingCachedMediaReads.set(cacheKey, read);
  return read;
};

export const ensureMediaObjectUrl = async (
  path?: string | null
): Promise<string | null> => {
  if (!path || typeof window === 'undefined') {
    return null;
  }
  if (isInquiryFile(path)) {
    try {
      return await loadInquiryFile(path);
    } catch {
      return null;
    }
  }

  const cacheKey = getMediaCacheKey(path);
  const cachedObjectUrl = objectUrlCache.get(cacheKey);
  if (cachedObjectUrl) {
    return cachedObjectUrl;
  }

  const pendingRequest = pendingMediaRequests.get(cacheKey);
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

      const blob = await readResponseBlobWithinLimit(
        response,
        MAX_CACHE_ITEM_BYTES
      );

      if (!blob) {
        objectUrlCache.set(cacheKey, sourceUrl);
        return sourceUrl;
      }

      const now = new Date().toISOString();
      const objectUrl = await createMediaObjectUrl(blob);

      objectUrlCache.set(cacheKey, objectUrl);

      void putRecord({
        key: cacheKey,
        path,
        blob,
        mimeType: blob.type || 'application/octet-stream',
        size: blob.size || 0,
        createdAt: now,
        accessedAt: now
      })
        .then(() => ensureCacheWithinLimit())
        .catch(error => {
          // Ошибка квоты/хранилища Safari не отменяет уже загруженное изображение.
          console.warn('Failed to persist loaded media:', error);
        });

      return objectUrl;
    } catch (error) {
      console.warn('Failed to ensure media object URL:', error);
      return null;
    } finally {
      pendingMediaRequests.delete(cacheKey);
    }
  })();

  pendingMediaRequests.set(cacheKey, request);
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
