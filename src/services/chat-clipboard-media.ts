import { MediaType } from '@pksep/zod-shared-chat';
import { getAuthToken } from '../composables/useLogin';
import { getStoredChatAccessToken } from '../composables/useAuth';
import { getConfig } from './useConfig';
import {
  getCopiedMediaUrl,
  MAX_CHAT_CLIPBOARD_BYTES,
  MAX_CHAT_CLIPBOARD_PIXELS,
  supportsChatClipboardFiles,
  type ChatClipboardContent,
  type PreparedChatClipboardMedia
} from '../utils/chat-clipboard';

export const loadChatClipboardMedia = async (
  content: Exclude<ChatClipboardContent, { kind: 'sticker' }>,
  signal: AbortSignal
): Promise<Blob> => {
  if (content.media.size > MAX_CHAT_CLIPBOARD_BYTES)
    throw new Error('Вложение слишком большое для копирования');
  const url = getCopiedMediaUrl(content.media);
  const api = getConfig().CHAT_API_DOMAIN;
  const isApiFile =
    api &&
    new URL(url, window.location.href).origin ===
      new URL(api, window.location.href).origin;
  const token = isApiFile && (getAuthToken() || getStoredChatAccessToken());
  const response = await fetch(url, {
    signal,
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    redirect: token ? 'error' : 'follow'
  });
  if (!response.ok)
    throw new Error('Не удалось загрузить скопированное вложение');
  if (
    Number(response.headers.get('content-length')) > MAX_CHAT_CLIPBOARD_BYTES
  ) {
    await response.body?.cancel();
    throw new Error('Вложение слишком большое для копирования');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Не удалось загрузить скопированное вложение');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    let chunk = await reader.read();
    while (!chunk.done) {
      const value = chunk.value;
      size += value.byteLength;
      if (size > MAX_CHAT_CLIPBOARD_BYTES) {
        await reader.cancel();
        throw new Error('Вложение слишком большое для копирования');
      }
      chunks.push(new Uint8Array(value));
      chunk = await reader.read();
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error('Вложение пустое');
  return new Blob(chunks, {
    type: (response.headers.get('content-type') || 'application/octet-stream')
      .split(';')[0]
      .trim()
  });
};

export const prepareChatClipboardMedia = async (
  content: Exclude<ChatClipboardContent, { kind: 'sticker' }>,
  signal: AbortSignal
): Promise<PreparedChatClipboardMedia> => {
  const original = await loadChatClipboardMedia(content, signal);
  if (content.media.type !== MediaType.Image) {
    if (!supportsChatClipboardFiles())
      throw new Error('Браузер не поддерживает копирование файлов');
    return { original };
  }
  const bitmap = await createImageBitmap(original);
  try {
    if (bitmap.width * bitmap.height > MAX_CHAT_CLIPBOARD_PIXELS)
      throw new Error('Изображение слишком большое для копирования');
    let image = original;
    if (original.type !== 'image/png') {
      // Системный буфер браузера принимает изображения только в PNG.
      // Для вставки в чат отдельно сохраняются исходные байты без конвертации.
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Не удалось скопировать изображение');
      context.drawImage(bitmap, 0, 0);
      image = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          blob =>
            blob
              ? resolve(blob)
              : reject(new Error('Не удалось скопировать изображение')),
          'image/png'
        )
      );
    }
    if (image.size > MAX_CHAT_CLIPBOARD_BYTES)
      throw new Error('Изображение слишком большое для копирования');
    return { original, image };
  } finally {
    bitmap.close();
  }
};
