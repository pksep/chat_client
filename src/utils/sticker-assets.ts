import { getConfig } from '../services/useConfig';

export const getStickerApiBaseUrl = (): string => {
  const configured = import.meta.env?.VITE_STICKER_API_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const api = getConfig().CHAT_API_DOMAIN?.replace(/\/+$/, '');
  return api ? `${api}/stickers` : '/stickers';
};

export const buildStickerAssetUrl = (path: string): string => {
  const configured = import.meta.env?.VITE_STICKER_ASSET_BASE_URL?.trim();
  const base =
    configured?.replace(/\/+$/, '') || `${getStickerApiBaseUrl()}/assets`;
  return `${base}/${path}`;
};
