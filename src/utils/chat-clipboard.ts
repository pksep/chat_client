import { MediaType } from '@pksep/zod-shared-chat';
import type { IMedia } from '../components/interfaces/interfaces';
import { getConfig } from '../services/useConfig';
import { buildMediaObjectUrl } from './media-url';
import { parseMessageEx } from './messageReplyQuote';
import { getMessageSticker, type CopiedSticker } from './stickers';

const clipboardAttribute = 'data-sep-chat-clipboard';
export const CHAT_CLIPBOARD_FILE_TYPE = 'web application/x-sep-chat-file';
export const CHAT_CLIPBOARD_CONTENT_TYPE =
  'web application/x-sep-chat-content+json';
export const MAX_CHAT_CLIPBOARD_BYTES = 20 * 1024 * 1024;
export const MAX_CHAT_CLIPBOARD_PIXELS = 16 * 1024 * 1024;
export type PreparedChatClipboardMedia = { original: Blob; image?: Blob };

const supportsClipboardType = (type: string): boolean => {
  try {
    return (
      !!navigator.clipboard?.write &&
      typeof ClipboardItem !== 'undefined' &&
      !!ClipboardItem.supports?.(type)
    );
  } catch {
    return false;
  }
};

export const supportsChatClipboardFiles = (): boolean =>
  supportsClipboardType(CHAT_CLIPBOARD_FILE_TYPE) &&
  supportsClipboardType(CHAT_CLIPBOARD_CONTENT_TYPE);

export const canCopyChatMedia = (media: IMedia): boolean => {
  const size = Number(media.size);
  return (
    Number.isFinite(size) &&
    size > 0 &&
    size <= MAX_CHAT_CLIPBOARD_BYTES &&
    (media.ex?.width || 0) * (media.ex?.height || 0) <=
      MAX_CHAT_CLIPBOARD_PIXELS &&
    (supportsChatClipboardFiles() ||
      (media.type === MediaType.Image && supportsClipboardType('image/png')))
  );
};
type CopiedMedia = Pick<
  IMedia,
  'id' | 'path' | 'originName' | 'size' | 'type'
> & {
  mimeType?: string;
};
export type ChatClipboardContent = {
  version: 1;
  backend: string;
} & (
  | { kind: 'sticker'; sticker: CopiedSticker }
  | { kind: 'media' | 'keyboard-sticker'; media: CopiedMedia }
);

const currentBackend = () =>
  new URL(
    getConfig().CHAT_API_DOMAIN || '/api',
    window.location.href
  ).href.replace(/\/+$/, '');

export const createChatClipboardContent = (
  messageEx: unknown,
  media: readonly IMedia[],
  selectedMedia?: IMedia
): ChatClipboardContent | null => {
  const common = { version: 1 as const, backend: currentBackend() };
  const sticker = getMessageSticker(messageEx, media);
  if (sticker) {
    const ex = parseMessageEx(messageEx);
    const reference = ex.sticker as CopiedSticker;
    if (reference.pack !== 'keyboard') {
      return {
        ...common,
        kind: 'sticker',
        sticker: {
          id: reference.id,
          pack: reference.pack,
          version: reference.version,
          ...(reference.asset ? { asset: reference.asset } : {}),
          label: sticker.label
        }
      };
    }
  }
  const file = sticker ? media[0] : selectedMedia;
  if (!file?.path) return null;
  return {
    ...common,
    kind: sticker ? 'keyboard-sticker' : 'media',
    media: {
      id: file.id,
      path: file.path,
      originName: file.originName,
      type: file.type,
      size: Number(file.size)
    }
  };
};

export const readChatClipboardContent = (
  html: string
): ChatClipboardContent | null => {
  if (!html || html.length > 100000) return null;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const markers = doc.querySelectorAll(`[${clipboardAttribute}]`);
    if (markers.length !== 1) return null;
    return readChatClipboardJson(
      decodeURIComponent(markers[0].getAttribute(clipboardAttribute) || '')
    );
  } catch {
    return null;
  }
};

export const readChatClipboardJson = (
  json: string
): ChatClipboardContent | null => {
  if (!json || json.length > 100000) return null;
  try {
    const content = JSON.parse(json) as ChatClipboardContent;
    if (content.version !== 1 || content.backend !== currentBackend())
      return null;
    if (content.kind === 'sticker') {
      const sticker = content.sticker;
      if (
        typeof sticker?.id !== 'string' ||
        typeof sticker.pack !== 'string' ||
        sticker.pack === 'keyboard' ||
        !Number.isInteger(sticker.version) ||
        sticker.version < 1 ||
        typeof sticker.label !== 'string' ||
        sticker.label.length > 500 ||
        !getMessageSticker({ kind: 'sticker', sticker })
      )
        return null;
      return content;
    }
    if (content.kind !== 'media' && content.kind !== 'keyboard-sticker')
      return null;
    const media = content.media;
    if (
      typeof media?.id !== 'string' ||
      typeof media.path !== 'string' ||
      !media.path ||
      media.path.length > 2048 ||
      /[\\:#?]|^\/|(?:^|\/)\.\.(?:\/|$)|%(?:2e|2f|5c)/i.test(media.path) ||
      typeof media.originName !== 'string' ||
      media.originName.length > 500 ||
      !Number.isFinite(media.size) ||
      media.size < 0 ||
      (media.mimeType !== undefined &&
        (typeof media.mimeType !== 'string' ||
          media.mimeType.length > 200 ||
          !/^[\w.+-]+\/[\w.+-]+$/.test(media.mimeType))) ||
      !Object.values<string>(MediaType).includes(media.type) ||
      (content.kind === 'keyboard-sticker' && media.type !== MediaType.Image)
    )
      return null;
    return content;
  } catch {
    return null;
  }
};

const createClipboardHtml = (
  content: ChatClipboardContent,
  sourceUrl: string,
  previewUrl?: string
): string => {
  const span = document.createElement('span');
  span.setAttribute(
    clipboardAttribute,
    encodeURIComponent(JSON.stringify(content))
  );
  const label =
    content.kind === 'sticker'
      ? content.sticker.label
      : content.media.originName;
  const link = document.createElement('span');
  if (previewUrl || content.kind === 'sticker') {
    const image = document.createElement('img');
    image.src = previewUrl || sourceUrl;
    image.alt = label;
    link.append(image);
  } else {
    link.textContent = label;
  }
  span.append(link);
  return span.outerHTML;
};

export const writeChatClipboardContent = async (
  content: ChatClipboardContent,
  sourceUrl: string,
  previewUrl?: string,
  prepared?: PreparedChatClipboardMedia | Promise<PreparedChatClipboardMedia>
): Promise<void> => {
  const label =
    content.kind === 'sticker'
      ? content.sticker.label
      : content.media.originName;
  const html = createClipboardHtml(content, sourceUrl, previewUrl);
  const preparation = prepared ? Promise.resolve(prepared) : undefined;
  const preparedContent = preparation?.then(data =>
    content.kind === 'sticker'
      ? content
      : {
          ...content,
          media: { ...content.media, mimeType: data.original.type || undefined }
        }
  );
  const types: Record<string, Blob | Promise<Blob>> = {
    'text/html': preparedContent
      ? preparedContent.then(
          value =>
            new Blob([createClipboardHtml(value, sourceUrl, previewUrl)], {
              type: 'text/html'
            })
        )
      : new Blob([html], { type: 'text/html' }),
    'text/plain': new Blob([label], { type: 'text/plain' })
  };
  if (supportsChatClipboardFiles()) {
    const jsonBlob = (value: ChatClipboardContent) =>
      new Blob([JSON.stringify(value)], {
        type: 'application/x-sep-chat-content+json'
      });
    types[CHAT_CLIPBOARD_CONTENT_TYPE] = preparedContent
      ? preparedContent.then(jsonBlob)
      : jsonBlob(content);
    if (preparation)
      types[CHAT_CLIPBOARD_FILE_TYPE] = preparation.then(
        data =>
          new Blob([data.original], { type: 'application/x-sep-chat-file' })
      );
  }
  if (
    preparation &&
    content.kind !== 'sticker' &&
    content.media.type === MediaType.Image &&
    supportsClipboardType('image/png')
  )
    types['image/png'] = preparation.then(data => {
      if (!data.image) throw new Error('Не удалось скопировать изображение');
      return data.image;
    });
  if (
    content.kind !== 'sticker' &&
    (!preparation || (!types['image/png'] && !supportsChatClipboardFiles()))
  )
    throw new Error('Браузер не поддерживает копирование этого вложения');
  if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
    for (const value of Object.values(types))
      if (value instanceof Promise) void value.catch(() => {});
    try {
      // write вызывается в момент клика; подготовка байтов остаётся внутри ClipboardItem.
      await navigator.clipboard.write([new ClipboardItem(types)]);
      return;
    } catch (error) {
      if (content.kind !== 'sticker') throw error;
      // Старые браузеры могут поддерживать только штатное событие copy.
    }
  }
  let copied = false;
  const handleCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.clipboardData.setData('text/html', html);
    event.clipboardData.setData('text/plain', label);
    event.preventDefault();
    copied = true;
  };
  document.addEventListener('copy', handleCopy, true);
  try {
    if (!document.execCommand('copy') || !copied)
      throw new Error('Не удалось скопировать вложение');
  } finally {
    document.removeEventListener('copy', handleCopy, true);
  }
};

export const getCopiedMediaUrl = (media: CopiedMedia): string =>
  buildMediaObjectUrl(getConfig().CHAT_PATH_TO_FILE_CDN, media.path);
