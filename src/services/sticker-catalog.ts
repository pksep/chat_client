import { getAuthToken } from '../composables/useLogin';
import { getStoredChatAccessToken } from '../composables/useAuth';
import { getStickerApiBaseUrl } from '../utils/sticker-assets';
import {
  registerCatalogStickers,
  type CatalogSticker
} from '../utils/stickers';

export interface StickerPack {
  id: string;
  label: string;
  count: number;
  previewPath: string;
  messagePreviewPath?: string;
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

const request = async <T>(
  path: string,
  signal?: AbortSignal,
  references?: StickerReference[]
): Promise<T> => {
  const token = getAuthToken() || getStoredChatAccessToken();
  const response = await fetch(`${getStickerApiBaseUrl()}${path}`, {
    signal,
    method: references ? 'POST' : 'GET',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(references ? { 'Content-Type': 'application/json' } : {})
    },
    body: references ? JSON.stringify({ references }) : undefined
  });
  if (!response.ok) throw new Error('Не удалось загрузить стикеры');
  return response.json();
};
export const loadStickerPacks = (signal?: AbortSignal) =>
  request<{ packs: StickerPack[] }>('/packs', signal);
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
  const page = await request<StickerPage>(`?${params}`, signal);
  registerCatalogStickers(page.items);
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
  const result = await request<{ items: CatalogSticker[] }>(
    '/resolve',
    signal,
    references
  );
  registerCatalogStickers(result.items);
  return result.items;
};
