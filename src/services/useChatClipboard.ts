import { MediaType } from '@pksep/zod-shared-chat';
import { showErrorNotification } from '../composables/useNotifications';
import { loadChatClipboardMedia } from './chat-clipboard-media';
import {
  CHAT_CLIPBOARD_CONTENT_TYPE,
  CHAT_CLIPBOARD_FILE_TYPE,
  MAX_CHAT_CLIPBOARD_BYTES,
  readChatClipboardContent,
  readChatClipboardJson,
  type ChatClipboardContent
} from '../utils/chat-clipboard';
import type { CopiedSticker } from '../utils/stickers';

const readClipboardAttachment = async (
  items: ClipboardItem[]
): Promise<{ content: ChatClipboardContent; original?: Blob } | null> => {
  for (const item of items) {
    let content: ChatClipboardContent | null = null;
    if (item.types.includes(CHAT_CLIPBOARD_CONTENT_TYPE))
      content = readChatClipboardJson(
        await (await item.getType(CHAT_CLIPBOARD_CONTENT_TYPE)).text()
      );
    if (!content && item.types.includes('text/html'))
      content = readChatClipboardContent(
        await (await item.getType('text/html')).text()
      );
    if (!content) continue;
    if (
      content.kind !== 'sticker' &&
      item.types.includes(CHAT_CLIPBOARD_FILE_TYPE)
    ) {
      const original = await item.getType(CHAT_CLIPBOARD_FILE_TYPE);
      if (!original.size || original.size > MAX_CHAT_CLIPBOARD_BYTES)
        throw new Error('Вложение слишком большое для вставки');
      return { content, original };
    }
    return { content };
  }
  return null;
};

export const bindChatClipboardPaste = (options: {
  getTargetElement: () => HTMLElement | null;
  getTopicId: () => string | undefined;
  canPasteSticker: () => boolean;
  canPasteMedia: () => boolean;
  onSticker: (sticker: CopiedSticker) => void;
  onKeyboardSticker: (file: File) => void;
  onMedia: (payload: { file: File; isMedia: boolean }) => void;
}): { dispose: () => void; pasteFromClipboard: () => Promise<boolean> } => {
  const requests = new Set<AbortController>();
  let disposed = false;
  const sendContent = (content: ChatClipboardContent, copiedBlob?: Blob) => {
    const root = options.getTargetElement();
    if (disposed || !root?.isConnected) return;
    const isSticker = content.kind !== 'media';
    if (!(isSticker ? options.canPasteSticker() : options.canPasteMedia())) {
      showErrorNotification(
        'В этом поле нельзя отправить скопированное вложение'
      );
      return;
    }
    if (content.kind === 'sticker') {
      options.onSticker(content.sticker);
      return;
    }
    const topicId = options.getTopicId();
    const controller = new AbortController();
    requests.add(controller);
    void (async () => {
      try {
        let blob = copiedBlob;
        if (!blob && navigator.clipboard?.read) {
          try {
            const copied = await readClipboardAttachment(
              await navigator.clipboard.read()
            );
            if (
              copied?.content.kind === content.kind &&
              copied.content.media.id === content.media.id &&
              copied.content.media.path === content.media.path
            )
              blob = copied.original;
          } catch {
            // При недоступном чтении буфера используется исходный файл сервера.
          }
        }
        if (!blob)
          blob = await loadChatClipboardMedia(content, controller.signal);
        if (
          disposed ||
          root !== options.getTargetElement() ||
          topicId !== options.getTopicId()
        )
          return;
        if (!(isSticker ? options.canPasteSticker() : options.canPasteMedia()))
          return;
        const file = new File([blob], content.media.originName || 'file', {
          type: content.media.mimeType || blob.type
        });
        if (content.kind === 'keyboard-sticker')
          options.onKeyboardSticker(file);
        else
          options.onMedia({
            file,
            isMedia: content.media.type !== MediaType.File
          });
      } catch (error) {
        if (!disposed && !controller.signal.aborted)
          showErrorNotification(
            error instanceof Error
              ? error.message
              : 'Не удалось вставить вложение'
          );
      } finally {
        requests.delete(controller);
      }
    })();
  };
  const handlePaste = (event: ClipboardEvent) => {
    const root = options.getTargetElement();
    if (
      event.defaultPrevented ||
      !root ||
      !event
        .composedPath()
        .some(
          target =>
            target instanceof Element &&
            root.contains(target) &&
            target.matches('.ProseMirror[contenteditable="true"]')
        )
    )
      return;
    const content = readChatClipboardContent(
      event.clipboardData?.getData('text/html') || ''
    );
    if (!content) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    sendContent(content);
  };
  const pasteFromClipboard = async (): Promise<boolean> => {
    const root = options.getTargetElement();
    const topicId = options.getTopicId();
    if (disposed || !root?.isConnected || !navigator.clipboard?.read)
      return false;
    try {
      const items = await navigator.clipboard.read();
      const copied = await readClipboardAttachment(items);
      if (copied) {
        if (
          !disposed &&
          root === options.getTargetElement() &&
          topicId === options.getTopicId()
        )
          sendContent(copied.content, copied.original);
        return true;
      }
    } catch {
      // Если чтение HTML недоступно, остаётся существующая вставка текста.
    }
    return false;
  };
  document.addEventListener('paste', handlePaste, true);
  const dispose = () => {
    disposed = true;
    document.removeEventListener('paste', handlePaste, true);
    for (const request of requests) request.abort();
    requests.clear();
  };
  return { dispose, pasteFromClipboard };
};
