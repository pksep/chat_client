import { getAuthToken } from '../composables/useLogin';
import {
  getStoredChatAccessToken,
  withAuthResponseRefresh
} from '../composables/useAuth';
import {
  getStickerApiBaseUrl,
  buildStickerAssetUrl
} from '../utils/sticker-assets';
import {
  registerCatalogStickers,
  getCatalogSticker,
  getStickerReference,
  type CatalogSticker
} from '../utils/stickers';

export interface StickerPack {
  id: string;
  label: string;
  count: number;
  previewPath: string;
  messagePreviewPath?: string;
  thumbnail?: {
    path: string;
    format: 'webp' | 'webm' | 'tgs' | 'png' | 'jpg';
    width: number;
    height: number;
  };
}
export interface StickerReference {
  id: string;
  pack: string;
  version: number;
}
export interface StickerPage {
  items: CatalogSticker[];
  nextCursor: string | null;
  total: number;
  revision: string;
}

const preparedPages = new Map<
  string,
  { time: number; promise: Promise<StickerPage>; revision?: string }
>();
const catalogRevisions = new Map<string, string>();
const preparationTtl = 60000;
const firstPageKey = (
  base: string,
  pack: string,
  excludedPacks: string[] = []
) => `${base}:${JSON.stringify([pack, [...new Set(excludedPacks)].sort()])}`;

export class StickerPageExpiredError extends Error {
  constructor() {
    super('Не удалось загрузить стикеры');
  }
}

const request = async <T>(
  path: string,
  signal?: AbortSignal,
  references?: StickerReference[],
  base = getStickerApiBaseUrl()
): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(abort, 8000);
    let retryable = true;
    try {
      const response = await withAuthResponseRefresh(() => {
        controller.signal.throwIfAborted();
        const token = getAuthToken() || getStoredChatAccessToken();
        return fetch(`${base}${path}`, {
          signal: controller.signal,
          method: references ? 'POST' : 'GET',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(references ? { 'Content-Type': 'application/json' } : {})
          },
          body: references ? JSON.stringify({ references }) : undefined
        });
      });
      retryable =
        response.status >= 500 || [408, 429].includes(response.status);
      if (!response.ok) {
        if (response.status === 400) {
          const body = await response.json().catch(() => undefined);
          if (body?.message === 'Страница каталога устарела')
            throw new StickerPageExpiredError();
        }
        throw new Error('Не удалось загрузить стикеры');
      }
      return await response.json();
    } catch (reason) {
      signal?.throwIfAborted();
      if (!retryable || attempt >= 2) {
        if (reason instanceof StickerPageExpiredError) throw reason;
        throw new Error('Не удалось загрузить стикеры');
      }
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abort);
    }
    await new Promise<void>((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer);
        reject(signal?.reason);
      };
      const timer = setTimeout(
        () => {
          signal?.removeEventListener('abort', cancel);
          resolve();
        },
        300 * (attempt + 1)
      );
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  }
};
export const loadStickerPacks = async (signal?: AbortSignal) => {
  const base = getStickerApiBaseUrl();
  const result = await request<{ packs: StickerPack[]; revision?: string }>(
    '/packs',
    signal,
    undefined,
    base
  );
  if (result.revision) catalogRevisions.set(base, result.revision);
  return result;
};

export const prepareStickerPicker = (pack?: string) => {
  if (!pack || pack === 'keyboard' || document.hidden) return;
  const base = getStickerApiBaseUrl();
  const key = firstPageKey(base, pack);
  const previous = preparedPages.get(key);
  if (previous && Date.now() - previous.time < preparationTtl) return;
  const entry = {
    time: Date.now(),
    promise: null as unknown as Promise<StickerPage>,
    revision: undefined as string | undefined
  };
  entry.promise = request<StickerPage>(
    `?${new URLSearchParams({ pack, limit: '48', q: '' })}`,
    undefined,
    undefined,
    base
  ).then(page => {
    entry.revision = page.revision;
    if (base !== getStickerApiBaseUrl()) return page;
    registerCatalogStickers(page.items);
    const animated = page.items.filter(item => item.format === 'tgs');
    if (animated.length) {
      void (async () => {
        const [{ prepareStickerPreviews }, { loadTgsAnimation }] =
          await Promise.all([
            import('../utils/sticker-preview-player'),
            import('../utils/tgs-animation')
          ]);
        if (base !== getStickerApiBaseUrl()) return;
        prepareStickerPreviews();
        for (const sticker of animated.slice(0, 5))
          void loadTgsAnimation(buildStickerAssetUrl(sticker.path)).catch(
            () => undefined
          );
      })().catch(() => undefined);
    }
    return page;
  });
  preparedPages.set(key, entry);
  while (preparedPages.size > 4)
    preparedPages.delete(preparedPages.keys().next().value!);
  void entry.promise.catch(() => {
    if (preparedPages.get(key) === entry) preparedPages.delete(key);
  });
};
export const loadStickerPage = async (
  pack: string,
  query: string,
  cursor?: string,
  signal?: AbortSignal,
  excludedPacks: string[] = []
) => {
  const params = new URLSearchParams({ limit: '48', q: query });
  if (pack) params.set('pack', pack);
  if (cursor) params.set('cursor', cursor);
  if (excludedPacks.length) params.set('excludePacks', excludedPacks.join(','));
  const base = getStickerApiBaseUrl();
  const key = firstPageKey(base, pack, excludedPacks);
  const prepared =
    !query && !cursor && pack && !excludedPacks.includes(pack)
      ? preparedPages.get(key)
      : undefined;
  let page: StickerPage | undefined;
  if (prepared && Date.now() - prepared.time < preparationTtl) {
    page = await prepared.promise.catch(() => undefined);
    const revision = catalogRevisions.get(base);
    if (revision && page?.revision !== revision) page = undefined;
    signal?.throwIfAborted();
  }
  try {
    page ||= await request<StickerPage>(`?${params}`, signal, undefined, base);
  } catch (reason) {
    if (reason instanceof StickerPageExpiredError) {
      // Курсоры всех наборов зависят от общей версии каталога.
      for (const preparedKey of preparedPages.keys())
        if (preparedKey.startsWith(`${base}:`))
          preparedPages.delete(preparedKey);
      catalogRevisions.delete(base);
    }
    throw reason;
  }
  if (!query && !cursor && pack && !excludedPacks.includes(pack)) {
    preparedPages.set(key, {
      time: Date.now(),
      promise: Promise.resolve(page),
      revision: page.revision
    });
    while (preparedPages.size > 4)
      preparedPages.delete(preparedPages.keys().next().value!);
  }
  if (base === getStickerApiBaseUrl()) registerCatalogStickers(page.items);
  return page;
};

// Старый ключ сохраняем, чтобы не потерять недавние стикеры пользователей.
const recentKey = 'sep-chat:local-stickers:recent:v1';
export const getRecentStickerReferences = (): StickerReference[] => {
  try {
    const value = JSON.parse(localStorage.getItem(recentKey) || '[]');
    return Array.isArray(value)
      ? value
          .filter(
            item =>
              item &&
              typeof item.id === 'string' &&
              typeof item.pack === 'string' &&
              Number.isInteger(item.version)
          )
          .slice(0, 40)
      : [];
  } catch {
    return [];
  }
};
export const rememberSticker = (sticker: CatalogSticker) => {
  const reference = {
    id: sticker.id,
    pack: sticker.pack,
    version: sticker.version
  };
  try {
    localStorage.setItem(
      recentKey,
      JSON.stringify(
        [
          reference,
          ...getRecentStickerReferences().filter(
            item => item.id !== reference.id || item.pack !== reference.pack
          )
        ].slice(0, 40)
      )
    );
  } catch {
    /* Недавние необязательны для отправки. */
  }
};
export const loadRecentStickers = async (signal?: AbortSignal) => {
  const references = getRecentStickerReferences();
  if (!references.length) return [];
  return loadStickerReferences(references, signal);
};
export const loadStickerReferences = async (
  references: StickerReference[],
  signal?: AbortSignal
) => {
  const result = await request<{ items: CatalogSticker[] }>(
    '/resolve',
    signal,
    references
  );
  registerCatalogStickers(result.items);
  return result.items;
};

type PendingReference = {
  reference: StickerReference;
  base: string;
  resolve: () => void;
  promise: Promise<void>;
};
const pendingReferences = new Map<string, PendingReference>();
let metadataTimer: ReturnType<typeof setTimeout> | undefined;
const metadataQueue: string[] = [];
const flushMetadataQueue = () => {
  metadataTimer = undefined;
  const queued = metadataQueue.splice(0);
  const byBase = new Map<string, string[]>();
  for (const key of queued) {
    const { base } = pendingReferences.get(key)!;
    if (!byBase.has(base)) byBase.set(base, []);
    byBase.get(base)!.push(key);
  }
  for (const [base, keys] of byBase) {
    for (let offset = 0; offset < keys.length; offset += 100) {
      const batch = keys.slice(offset, offset + 100);
      void (async () => {
        try {
          if (base === getStickerApiBaseUrl())
            await loadStickerReferences(
              batch.map(key => pendingReferences.get(key)!.reference)
            );
        } catch {
          // Отсутствующий набор не мешает показать сообщение без номера стикера.
        } finally {
          for (const key of batch) {
            pendingReferences.get(key)?.resolve();
            pendingReferences.delete(key);
          }
        }
      })();
    }
  }
};

// Старые сообщения не содержат эмодзи: получаем их одним запросом для нескольких чатов.
export const ensureStickerMessageMetadata = (
  messageEx: unknown
): Promise<void> => {
  const reference = getStickerReference(messageEx);
  if (!reference || getCatalogSticker(reference)) return Promise.resolve();
  const base = getStickerApiBaseUrl();
  const key = `${base}:${reference.pack}:${reference.id}:${reference.version}`;
  const pending = pendingReferences.get(key);
  if (pending) return pending.promise;
  let resolve!: () => void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  pendingReferences.set(key, { reference, base, promise, resolve });
  metadataQueue.push(key);
  metadataTimer ??= setTimeout(flushMetadataQueue, 0);
  return promise;
};
