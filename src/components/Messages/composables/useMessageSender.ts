import {
  getCurrentScope,
  nextTick,
  onScopeDispose,
  watch,
  type Ref
} from 'vue';
import {
  getChatSDK,
  sendMessageChat,
  uploadFile
} from '../../../services/useChat';
import {
  outgoingSendGate,
  outgoingSendKey
} from '../../../utils/outgoing-send-gate';
import { useManagerInquiries } from '../../../composables/useManagerInquiries';
import {
  managerSendError,
  selectedManagerRoute,
  uploadManagerFile,
  managerUploadId
} from '../../../composables/useManagerRoutes';
import { generateUUID } from '../../../utils/generateUUID';
import { stripHtml } from '../../../utils/stripHtml';
import { showErrorNotification } from '../../../composables/useNotifications';
import {
  changeFileLoadingStatus,
  changeFileUploadPercent,
  addMessageToLocal,
  cancelDelayedOutgoingMessage,
  scheduleDelayedOutgoingMessage,
  registerPendingOutgoingForwardBatch,
  changeFileUploadErrorStatus,
  changeMessageStatusLocally,
  editMessageFromLocal,
  flushPendingMessagePersists,
  getFullMessagesByTopicId,
  getTopicIdsWithMessages,
  getPendingUploadFile,
  getPendingUploadMessageMeta,
  registerPendingUploadFile,
  registerPendingUploadMessage,
  setUploadedFileData,
  setFileUploadPendingStatus,
  setLocalMediaPreviewData
} from '../../../services/useMessages';
import { MediaType, MediaTypeType } from '@pksep/zod-shared-chat';
import type { IMessage, IMedia } from '../../interfaces/interfaces';
import { RouteTypes } from '../../../composables/navigation/useUrlRouting';
import {
  calculatePreviewDimensions,
  getFileDimensions,
  getVideoThumbnail,
  type MediaDimensions,
  VIDEO_FALLBACK_THUMBNAIL
} from '../../../utils/mediaPreview';
import { MessageStatus } from '../../../services/useChatSDK/types';
import { getHasWebsocketConnection } from '../../../services/useChat';
import {
  createMessageExWithQuote,
  parseMessageEx
} from '../../../utils/messageReplyQuote';
import {
  createTelemetryTraceId,
  getFileTelemetryPayload,
  getTelemetryErrorPayload,
  recordTelemetryEvent
} from '../../../services/useTelemetry';
import { getConfig } from '../../../services/useConfig';
import { getSelectedTopic } from '../../../composables/useTopics';
import {
  type CallTopicPromptPlaceholderKind,
  loadLatestCallSummary,
  sendCallTopicPromptPlaceholderToChat,
  sendGeneratedCallActionListToChat,
  sendGeneratedCallPromptResponseToChat,
  sendGeneratedCallSummaryBriefToChat,
  withCallSummaryTyping
} from '../../../services/useCallSummaries';
import {
  isCallTopic,
  parseCallTopicDescription
} from '../../../utils/call-topic';
import { stageAiAttachments } from '../../../services/aiAttachments';
import { startMessageUploadStatus } from '../../../services/message-upload-status';
import { getMessageUploadKind } from '../../../utils/message-upload-activity';
import { buildForwardMessageSendPlan } from '../../../utils/forward-message-send-plan';
import { getUploadFileSizeError } from '../../../services/useChatSDK/multipart-upload';
import { createStickerMessage } from '../../../utils/stickers';
import { isIosWeb } from '../../../utils/ios-pwa-viewport';
import { prepareKeyboardSticker } from '../../../utils/sticker-animation';
import {
  canUseNativeMessageUpload,
  getNativeMessageUpload,
  normalizeNativeUploadMessage,
  sendNativeMessageUpload,
  retryNativeMessageUpload
} from '../../../services/native-message-upload';

const MAX_HTML_LENGTH = 4000;
const FORWARD_TEXT_SEND_DELAY_MS = 250;
const TEXT_WAIT_INDICATOR_DELAY_MS = 150;
const MAX_MEDIA_ATTACHMENTS_PER_MESSAGE = 10;
const MAX_FILE_ATTACHMENTS_PER_MESSAGE = 10;
const MESSAGE_MAX_RETRY_AGE_MS = 15 * 60 * 1000;
const MESSAGE_UPLOAD_MAX_RETRY_AGE_MS = 2 * 60 * 60 * 1000;
const MESSAGE_AUTO_RETRY_WINDOW_MS = 180000;
const MESSAGE_AUTO_RETRY_INITIAL_DELAY_MS = 1000;
const MESSAGE_AUTO_RETRY_MAX_DELAY_MS = 5000;
const BACKGROUND_UPLOAD_RETRY_SUPPRESS_MS = 15000;
const VIDEO_INITIAL_PREVIEW_DIMENSIONS = {
  width: 640,
  height: 360
};

const VIDEO_LOCAL_THUMBNAIL_TIMEOUT_MS = 3000;
const CALL_TOPIC_SUMMARY_COMMAND = 'сделать краткое содержание';
const CALL_TOPIC_ACTIONS_COMMAND = 'список действий по звонку';

/** Экранирует имя вложения перед показом в HTML-сообщении чата. */
const escapeAiAttachmentName = (value: string): string =>
  value.replace(/[&<>"']/g, character => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return entities[character];
  });

const isCallTopicAutoPromptEnabled = () =>
  getConfig().CHAT_CALL_TOPIC_AUTO_PROMPT_ENABLED?.trim().toLowerCase() ===
  'true';

const normalizeCallTopicCommandText = (value: string) =>
  value.replace(/\s+/g, ' ').trim().toLowerCase();

const getCallTopicButtonAction = (
  value: string
): 'brief' | 'actions' | null => {
  const normalized = normalizeCallTopicCommandText(value);

  if (normalized === CALL_TOPIC_SUMMARY_COMMAND) {
    return 'brief';
  }

  if (normalized === CALL_TOPIC_ACTIONS_COMMAND) {
    return 'actions';
  }

  return null;
};

type PendingMessageRetryState = {
  attempt: number;
  startedAt: number;
};

const pendingMessageRetryTimers = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
const pendingMessageRetryStates = new Map<string, PendingMessageRetryState>();
const activePendingMessageRetries = new Set<string>();
const backgroundInterruptedUploadMessages = new Set<string>();
const activeUploadRequests = new Map<string, Promise<boolean>>();
const activeNativeUploadMessages = new Set<string>();
let arePendingMessageRetryListenersBound = false;
let lastDocumentHiddenAt = 0;

const getPendingMessageRetryKey = (
  topicId: string,
  messageId: string
): string => `${topicId}:${messageId}`;

const getPendingUploadRequestKey = (
  topicId: string,
  messageId: string,
  fileId: string
): string => `${topicId}:${messageId}:${fileId}`;

const wasDocumentRecentlyHidden = (): boolean => {
  if (typeof document === 'undefined') {
    return false;
  }

  return (
    document.hidden ||
    Date.now() - lastDocumentHiddenAt <= BACKGROUND_UPLOAD_RETRY_SUPPRESS_MS
  );
};

const markBackgroundInterruptedUpload = (
  topicId: string,
  messageId: string
): void => {
  backgroundInterruptedUploadMessages.add(
    getPendingMessageRetryKey(topicId, messageId)
  );
};

const clearBackgroundInterruptedUpload = (
  topicId: string,
  messageId: string
): void => {
  backgroundInterruptedUploadMessages.delete(
    getPendingMessageRetryKey(topicId, messageId)
  );
};

const isBackgroundInterruptedUpload = (
  topicId: string,
  messageId: string
): boolean =>
  backgroundInterruptedUploadMessages.has(
    getPendingMessageRetryKey(topicId, messageId)
  );

const parsePendingMessageRetryKey = (
  key: string
): { topicId: string; messageId: string } | null => {
  const separatorIndex = key.indexOf(':');

  if (separatorIndex <= 0 || separatorIndex === key.length - 1) {
    return null;
  }

  return {
    topicId: key.slice(0, separatorIndex),
    messageId: key.slice(separatorIndex + 1)
  };
};

const createMessageEx = (
  payload: Record<string, unknown>,
  existingEx?: unknown
): string => createMessageExWithQuote(payload, existingEx);

const createReplyQuoteEx = (
  replyMessage?: IMessage | null
): Record<string, unknown> => {
  const replyQuoteText = replyMessage?.replyQuoteText;

  if (!replyQuoteText) {
    return {};
  }

  return {
    replyQuoteText,
    ...(typeof replyMessage.replyQuoteOccurrenceIndex === 'number'
      ? { replyQuoteOccurrenceIndex: replyMessage.replyQuoteOccurrenceIndex }
      : {})
  };
};

export function splitHtmlByLength(
  html: string,
  maxLength = MAX_HTML_LENGTH
): string[] {
  const blocks = html.split(/(?=<p|<div|<br|<ul|<ol|<li)/i);
  const parts: string[] = [];

  let current = '';

  for (const block of blocks) {
    if ((current + block).length > maxLength) {
      if (current) parts.push(current);
      current = block;
    } else {
      current += block;
    }
  }

  if (current) parts.push(current);

  return parts;
}

const normalizeMessageHtml = (html: string): string => {
  if (!html) {
    return '';
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  const isMediaElement = (node: ChildNode | null): boolean =>
    node instanceof HTMLElement &&
    ['IMG', 'VIDEO', 'AUDIO', 'IFRAME', 'CANVAS', 'SVG'].includes(node.tagName);

  const isWhitespaceText = (node: ChildNode | null): boolean =>
    node?.nodeType === Node.TEXT_NODE &&
    !(node.textContent || '').replace(/\u00a0/g, ' ').trim();

  const isEmptyBlock = (node: ChildNode | null): node is HTMLElement => {
    if (!(node instanceof HTMLElement)) {
      return false;
    }

    if (!['P', 'DIV'].includes(node.tagName)) {
      return false;
    }

    const text = (node.textContent || '').replace(/\u00a0/g, ' ').trim();
    const hasMedia = !!node.querySelector(
      'img, video, audio, iframe, canvas, svg'
    );

    return !text && !hasMedia;
  };

  const trimLeadingNodes = (parent: ParentNode): void => {
    while (parent.firstChild) {
      const node = parent.firstChild;

      if (isWhitespaceText(node) || node instanceof HTMLBRElement) {
        node.remove();
        continue;
      }

      if (node instanceof HTMLElement && !isMediaElement(node)) {
        trimLeadingNodes(node);

        if (isEmptyBlock(node)) {
          node.remove();
          continue;
        }
      }

      break;
    }
  };

  const trimTrailingNodes = (parent: ParentNode): void => {
    while (parent.lastChild) {
      const node = parent.lastChild;

      if (isWhitespaceText(node) || node instanceof HTMLBRElement) {
        node.remove();
        continue;
      }

      if (node instanceof HTMLElement && !isMediaElement(node)) {
        trimTrailingNodes(node);

        if (isEmptyBlock(node)) {
          node.remove();
          continue;
        }
      }

      break;
    }
  };

  trimLeadingNodes(template.content);
  trimTrailingNodes(template.content);

  while (isEmptyBlock(template.content.firstElementChild)) {
    template.content.firstElementChild?.remove();
  }

  while (isEmptyBlock(template.content.lastElementChild)) {
    template.content.lastElementChild?.remove();
  }

  return template.innerHTML.trim();
};

export function getMediaType(file: File, isMedia: boolean): MediaTypeType {
  if (!isMedia) return MediaType.File;
  if (file.type.startsWith('image/')) return MediaType.Image;
  if (file.type.startsWith('video/')) return MediaType.Video;
  return MediaType.File;
}

interface IHandleSendPayload {
  taggedUserIds?: string[];
  content?: string;
  files?: FileList;
  mediaFiles?: FileList;
}

interface IQueuedFilePayload {
  file: File;
  isMedia: boolean;
}

interface IAttachChunkOptions {
  keyboardSticker?: boolean;
  keyboardStickerDurationMs?: number;
  managerReplyRouteId?: string;
  topicId?: string;
  isMedia?: boolean;
  text?: string | null;
  fillSharedPreview?: boolean;
  taggedUserIds?: string[];
  replyMessage?: IMessage | null;
  replyMessageId?: string;
  forwardMessageIds?: string[];
}

export function useMessageSender(
  route: Ref<{ id: string; type: string }>,
  inputText: Ref<string>,
  state: {
    aiMessages: any[];
    editMessage: IMessage | null;
    replyMessage: IMessage | null;
    forwardMessages: IMessage[];
    hideUnreadMarker: boolean;
  },
  authUser: Ref<any>,
  mastraResult: Ref<any>,
  scrollToBottom: () => void,
  clearSellectedMessage: () => void,
  onMessageSubmitted?: (topicId: string) => void
) {
  const sendCallTopicPromptResponse = async (
    topicId: string,
    prompt: string
  ): Promise<boolean> => {
    const topic = getSelectedTopic(topicId);
    const callTopicMeta = parseCallTopicDescription(topic?.group?.description);

    if (!topic || !isCallTopic(topic) || !callTopicMeta?.roomId) {
      return false;
    }

    const readySummary = await loadLatestCallSummary(
      topicId,
      callTopicMeta.roomId
    );

    if (!readySummary || readySummary.roomId !== callTopicMeta.roomId) {
      showErrorNotification('Запись звонка не найдена');
      return false;
    }

    if (!readySummary.transcript && !readySummary.hasTranscript) {
      showErrorNotification('Транскрибация ещё не готова');
      return false;
    }

    return withCallSummaryTyping(topicId, () =>
      sendGeneratedCallPromptResponseToChat(readySummary, topicId, prompt)
    );
  };

  const sendCallTopicButtonActionResponse = async (
    topicId: string,
    action: 'brief' | 'actions'
  ): Promise<boolean> => {
    const topic = getSelectedTopic(topicId);
    const callTopicMeta = parseCallTopicDescription(topic?.group?.description);

    if (!topic || !isCallTopic(topic) || !callTopicMeta?.roomId) {
      return false;
    }

    const readySummary = await loadLatestCallSummary(
      topicId,
      callTopicMeta.roomId
    );

    if (!readySummary || readySummary.roomId !== callTopicMeta.roomId) {
      showErrorNotification('Запись звонка не найдена');
      return false;
    }

    if (!readySummary.transcript && !readySummary.hasTranscript) {
      showErrorNotification(
        action === 'brief'
          ? 'Краткое содержание ещё не готово'
          : 'Список действий ещё не готов'
      );
      return false;
    }

    return withCallSummaryTyping(topicId, () =>
      action === 'brief'
        ? sendGeneratedCallSummaryBriefToChat(readySummary, topicId)
        : sendGeneratedCallActionListToChat(readySummary, topicId)
    );
  };

  const getCallTopicPromptPlaceholderKind = async (
    topicId: string
  ): Promise<CallTopicPromptPlaceholderKind> => {
    const topic = getSelectedTopic(topicId);
    const callTopicMeta = parseCallTopicDescription(topic?.group?.description);

    if (!topic || !isCallTopic(topic) || !callTopicMeta?.roomId) {
      return 'not-recorded';
    }

    const summary = await loadLatestCallSummary(topicId, callTopicMeta.roomId);

    return summary?.roomId === callTopicMeta.roomId
      ? 'choose-actions'
      : 'not-recorded';
  };

  const sendCallTopicPromptPlaceholder = async (
    topicId: string
  ): Promise<boolean> =>
    withCallSummaryTyping(topicId, async () =>
      sendCallTopicPromptPlaceholderToChat(
        topicId,
        await getCallTopicPromptPlaceholderKind(topicId)
      )
    );

  const waitForPreviewMetrics = async (media?: IMedia): Promise<void> => {
    if (
      !media ||
      media.type === MediaType.File ||
      media.type === MediaType.Video
    ) {
      return;
    }

    const timeoutMs = 3000;
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (media.ex?.previewWidth && media.ex?.previewHeight) {
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };

  const getMessageById = (
    topicId: string,
    messageId: string
  ): IMessage | undefined =>
    getFullMessagesByTopicId(topicId).find(message => message.id === messageId);

  const getMessageCreatedAtMs = (message?: IMessage | null): number | null => {
    if (!message?.createdAt) {
      return null;
    }

    const createdAtMs = new Date(message.createdAt).getTime();

    return Number.isFinite(createdAtMs) ? createdAtMs : null;
  };

  const isMessageRetryExpired = (message?: IMessage | null): boolean => {
    // Сохранённый текст без подтверждения ждёт сеть, а не истекает по возрасту.
    if (message?.status === MessageStatus.Wait && !message.media?.length) {
      return false;
    }
    const createdAtMs = getMessageCreatedAtMs(message);

    if (createdAtMs === null) {
      return false;
    }

    const maxRetryAgeMs = message?.media?.some(
      media => media.isLoading || media.uploadError || !media.path
    )
      ? MESSAGE_UPLOAD_MAX_RETRY_AGE_MS
      : MESSAGE_MAX_RETRY_AGE_MS;

    return Date.now() - createdAtMs >= maxRetryAgeMs;
  };

  const getMessageAutoRetryWindowMs = (message?: IMessage | null): number =>
    message?.media?.some(
      media => media.isLoading || media.uploadError || !media.path
    )
      ? MESSAGE_UPLOAD_MAX_RETRY_AGE_MS
      : MESSAGE_AUTO_RETRY_WINDOW_MS;

  const isAutoRetryCandidate = (message?: IMessage | null): boolean =>
    Boolean(
      message &&
        (message.status === MessageStatus.Wait ||
          message.status === MessageStatus.NotDelivered) &&
        !isMessageRetryExpired(message)
    );

  const canAutoRetryMessage = (message?: IMessage | null): boolean => {
    if (message?.id && activeNativeUploadMessages.has(message.id)) return false;
    if (!isAutoRetryCandidate(message)) {
      return false;
    }

    if (
      message?.topicId &&
      message.id &&
      isBackgroundInterruptedUpload(message.topicId, message.id)
    ) {
      return false;
    }

    if (!message?.media?.length) {
      return true;
    }

    return (
      parseMessageEx(message.ex)?.nativeUpload === true ||
      message.media.every(media => !media.isLoading || media.uploadError)
    );
  };

  const clearPendingMessageAutoRetry = (
    topicId: string,
    messageId: string
  ): void => {
    const retryKey = getPendingMessageRetryKey(topicId, messageId);
    const timeoutId = pendingMessageRetryTimers.get(retryKey);

    if (timeoutId) {
      clearTimeout(timeoutId);
      pendingMessageRetryTimers.delete(retryKey);
    }

    pendingMessageRetryStates.delete(retryKey);
  };

  const isSendAvailable = (): boolean => getHasWebsocketConnection();

  const buildMediaPayload = (media: IMedia): IMedia =>
    ({
      path: media.path,
      thumbnailPath: media.thumbnailPath,
      originName: media.originName,
      size: media.size,
      type: media.type,
      ex: media.ex
    }) as IMedia;

  const trySendPendingTextMessage = async (
    topicId: string,
    messageId: string,
    options?: { markNotDeliveredOnFailure?: boolean }
  ): Promise<boolean> => {
    const message = getMessageById(topicId, messageId);

    if (!message) {
      return false;
    }

    const messageMeta = await getPendingUploadMessageMeta(topicId, messageId);
    const canSend = isSendAvailable();

    changeMessageStatusLocally(topicId, messageId, MessageStatus.Wait);

    if (!canSend) {
      if (options?.markNotDeliveredOnFailure !== false) {
        changeMessageStatusLocally(
          topicId,
          messageId,
          MessageStatus.NotDelivered
        );
      }

      return false;
    }

    if (messageMeta?.forwardMessageIds?.length) {
      for (const forwardMessageId of messageMeta.forwardMessageIds) {
        const didSend = await sendMessageChat({
          topicId,
          text: message.text || '',
          replyMessageId: messageMeta.replyMessageId || message.replyMessageId,
          forwardMessageId,
          taggedUserIds: message.taggedUserIds,
          ex: message.ex || JSON.stringify({ clientId: messageId })
        });

        if (!didSend) {
          if (options?.markNotDeliveredOnFailure !== false) {
            changeMessageStatusLocally(
              topicId,
              messageId,
              MessageStatus.NotDelivered
            );
          }

          return false;
        }
      }

      return true;
    }

    const didSend = await sendMessageChat({
      topicId,
      text: message.text || '',
      replyMessageId: messageMeta?.replyMessageId || message.replyMessageId,
      taggedUserIds: message.taggedUserIds,
      ex: message.ex || JSON.stringify({ clientId: messageId })
    });

    if (!didSend && options?.markNotDeliveredOnFailure !== false) {
      changeMessageStatusLocally(
        topicId,
        messageId,
        MessageStatus.NotDelivered
      );
    }

    return didSend;
  };

  const trySendPendingUploadMessage = async (
    topicId: string,
    messageId: string,
    options?: { markNotDeliveredOnFailure?: boolean }
  ): Promise<boolean> => {
    const message = getMessageById(topicId, messageId);

    if (!message?.media?.length) {
      return false;
    }

    const hasPendingFiles = message.media.some(
      media => media.isLoading || media.uploadError || !media.path
    );

    if (hasPendingFiles) {
      if (options?.markNotDeliveredOnFailure !== false) {
        changeMessageStatusLocally(
          topicId,
          messageId,
          MessageStatus.NotDelivered
        );
      }

      return false;
    }

    const messageMeta = await getPendingUploadMessageMeta(topicId, messageId);
    const medias = message.media.map(buildMediaPayload);
    const canSend = isSendAvailable();

    changeMessageStatusLocally(topicId, messageId, MessageStatus.Wait);

    if (!canSend) {
      if (options?.markNotDeliveredOnFailure !== false) {
        changeMessageStatusLocally(
          topicId,
          messageId,
          MessageStatus.NotDelivered
        );
      }

      return false;
    }

    if (messageMeta?.forwardMessageIds?.length) {
      for (const forwardMessageId of messageMeta.forwardMessageIds) {
        const didSend = await sendMessageChat({
          topicId,
          text: message.text || '',
          medias,
          taggedUserIds: message.taggedUserIds,
          ex: createMessageEx({ clientId: messageId }, message.ex),
          replyMessageId: messageMeta.replyMessageId,
          forwardMessageId
        });

        if (!didSend) {
          if (options?.markNotDeliveredOnFailure !== false) {
            changeMessageStatusLocally(
              topicId,
              messageId,
              MessageStatus.NotDelivered
            );
          }

          return false;
        }
      }
    } else {
      const didSend = await sendMessageChat({
        topicId,
        text: message.text || '',
        medias,
        taggedUserIds: message.taggedUserIds,
        ex: createMessageEx({ clientId: messageId }, message.ex),
        replyMessageId: messageMeta?.replyMessageId
      });

      if (!didSend) {
        if (options?.markNotDeliveredOnFailure !== false) {
          changeMessageStatusLocally(
            topicId,
            messageId,
            MessageStatus.NotDelivered
          );
        }

        return false;
      }
    }

    await nextTick();
    scrollToBottom();
    return true;
  };

  const tryRecoverPendingMediaUploads = async (
    topicId: string,
    messageId: string,
    options?: {
      markNotDeliveredOnFailure?: boolean;
      suppressErrorNotification?: boolean;
    }
  ): Promise<boolean> => {
    const message = getMessageById(topicId, messageId);

    if (!message?.media?.length) {
      return false;
    }

    const retryableMedia = message.media.filter(
      media => media.uploadError || !media.path
    );

    if (retryableMedia.length === 0) {
      return true;
    }

    let hasUploadError = false;

    for (const media of retryableMedia) {
      setFileUploadPendingStatus(topicId, messageId, media.id);
      const payload = await getPendingUploadFile(
        topicId,
        messageId,
        media.id,
        () => changeFileUploadPercent(topicId, messageId, media.id, null)
      );

      if (!payload) {
        hasUploadError = true;
        changeFileUploadErrorStatus(topicId, messageId, media.id, true);
        continue;
      }

      const isUploaded = await uploadMessageFile(
        topicId,
        messageId,
        media.id,
        payload,
        options
      );

      if (!isUploaded) {
        hasUploadError = true;
      }
    }

    return !hasUploadError;
  };

  const trySendPendingMessage = async (
    topicId: string,
    messageId: string,
    options?: { markNotDeliveredOnFailure?: boolean }
  ): Promise<boolean> => {
    const message = getMessageById(topicId, messageId);

    if (!message) {
      return true;
    }

    if (!isAutoRetryCandidate(message)) {
      return true;
    }

    if (parseMessageEx(message.ex)?.nativeUpload === true) {
      if (activeNativeUploadMessages.has(messageId)) return false;
      const native = await getNativeMessageUpload(messageId);
      if (native.status === 'completed' && native.message) {
        addMessageToLocal(
          topicId,
          normalizeNativeUploadMessage(native.message)
        );
        return true;
      }
      // Не запускаем параллельную отправку из WebView после перезапуска приложения.
      if (native.status === 'queued' || native.status === 'uploading') {
        changeMessageStatusLocally(topicId, messageId, MessageStatus.Wait);
        return false;
      }
      if (native.status === 'failed' || native.status === 'cancelled') {
        changeMessageStatusLocally(
          topicId,
          messageId,
          MessageStatus.NotDelivered
        );
        return false;
      }
      const attachments = await Promise.all(
        message.media.map(media =>
          getPendingUploadFile(topicId, messageId, media.id)
        )
      );
      if (attachments.some(file => !file)) return false;
      activeNativeUploadMessages.add(messageId);
      try {
        const sent = await sendNativeMessageUpload(
          message,
          attachments as IQueuedFilePayload[],
          (index, percent) =>
            changeFileUploadPercent(
              topicId,
              messageId,
              message.media[index].id,
              percent
            )
        );
        addMessageToLocal(topicId, sent);
        return true;
      } catch {
        return false;
      } finally {
        activeNativeUploadMessages.delete(messageId);
      }
    }

    if (message.media?.length) {
      const uploadsRecovered = await tryRecoverPendingMediaUploads(
        topicId,
        messageId,
        {
          markNotDeliveredOnFailure: options?.markNotDeliveredOnFailure,
          suppressErrorNotification:
            options?.markNotDeliveredOnFailure === false
        }
      );

      if (!uploadsRecovered) {
        return false;
      }

      return trySendPendingUploadMessage(topicId, messageId, options);
    }

    return trySendPendingTextMessage(topicId, messageId, options);
  };

  const getNextRetryDelayMs = (attempt: number): number =>
    Math.min(
      MESSAGE_AUTO_RETRY_MAX_DELAY_MS,
      MESSAGE_AUTO_RETRY_INITIAL_DELAY_MS + attempt * 2000
    );

  const scheduleAllPendingMessageAutoRetries = (options?: {
    immediate?: boolean;
    expedite?: boolean;
    reset?: boolean;
  }): void => {
    getTopicIdsWithMessages().forEach(topicId => {
      schedulePendingMessageAutoRetriesForTopic(topicId, options);
    });

    Array.from(pendingMessageRetryStates.keys()).forEach(key => {
      const parsedKey = parsePendingMessageRetryKey(key);

      if (!parsedKey) {
        pendingMessageRetryStates.delete(key);
        return;
      }

      schedulePendingMessageAutoRetry(parsedKey.topicId, parsedKey.messageId, {
        immediate: options?.immediate,
        reset: options?.reset,
        preserveExisting: !options?.expedite
      });
    });
  };

  const schedulePendingMessageAutoRetry = (
    topicId: string,
    messageId: string,
    options?: {
      immediate?: boolean;
      reset?: boolean;
      preserveExisting?: boolean;
    }
  ): void => {
    const message = getMessageById(topicId, messageId);

    if (isMessageRetryExpired(message)) {
      if (message?.status === MessageStatus.Wait) {
        changeMessageStatusLocally(
          topicId,
          messageId,
          MessageStatus.NotDelivered
        );
      }

      clearPendingMessageAutoRetry(topicId, messageId);
      return;
    }

    if (!isAutoRetryCandidate(message)) {
      clearPendingMessageAutoRetry(topicId, messageId);
      return;
    }

    const retryKey = getPendingMessageRetryKey(topicId, messageId);
    const existingTimeout = pendingMessageRetryTimers.get(retryKey);

    // Проверка восстановленной очереди не сокращает паузу после сетевой ошибки.
    if (
      options?.preserveExisting &&
      !options.reset &&
      (existingTimeout || activePendingMessageRetries.has(retryKey))
    )
      return;

    if (existingTimeout) {
      clearTimeout(existingTimeout);
      pendingMessageRetryTimers.delete(retryKey);
    }

    const retryState =
      !options?.reset && pendingMessageRetryStates.get(retryKey)
        ? pendingMessageRetryStates.get(retryKey)!
        : {
            attempt: 0,
            startedAt: Date.now()
          };

    pendingMessageRetryStates.set(retryKey, retryState);

    if (
      isSendAvailable() &&
      Date.now() - retryState.startedAt >= getMessageAutoRetryWindowMs(message)
    ) {
      changeMessageStatusLocally(
        topicId,
        messageId,
        MessageStatus.NotDelivered
      );
      clearPendingMessageAutoRetry(topicId, messageId);
      return;
    }

    const retryDelayMs = options?.immediate
      ? 0
      : getNextRetryDelayMs(retryState.attempt);
    const delayMs = Math.max(
      retryDelayMs,
      outgoingSendGate.delay(
        outgoingSendKey(authUser.value?.id || '', topicId, messageId)
      )
    );

    const timeoutId = setTimeout(async () => {
      pendingMessageRetryTimers.delete(retryKey);

      const currentMessage = getMessageById(topicId, messageId);

      if (isMessageRetryExpired(currentMessage)) {
        if (currentMessage?.status === MessageStatus.Wait) {
          changeMessageStatusLocally(
            topicId,
            messageId,
            MessageStatus.NotDelivered
          );
        }

        clearPendingMessageAutoRetry(topicId, messageId);
        return;
      }

      if (!isAutoRetryCandidate(currentMessage)) {
        clearPendingMessageAutoRetry(topicId, messageId);
        return;
      }

      if (
        isSendAvailable() &&
        Date.now() - retryState.startedAt >=
          getMessageAutoRetryWindowMs(currentMessage)
      ) {
        changeMessageStatusLocally(
          topicId,
          messageId,
          MessageStatus.NotDelivered
        );
        clearPendingMessageAutoRetry(topicId, messageId);
        return;
      }

      if (activePendingMessageRetries.has(retryKey)) {
        const retryAfterActiveRequest = setTimeout(() => {
          pendingMessageRetryTimers.delete(retryKey);
          schedulePendingMessageAutoRetry(topicId, messageId, {
            immediate: true
          });
        }, 1000);
        pendingMessageRetryTimers.set(retryKey, retryAfterActiveRequest);
        return;
      }

      activePendingMessageRetries.add(retryKey);
      let didSend = false;

      try {
        didSend = await trySendPendingMessage(topicId, messageId, {
          markNotDeliveredOnFailure: false
        });
      } finally {
        activePendingMessageRetries.delete(retryKey);
      }

      if (didSend) {
        // Отправка в сокет ещё не подтверждение. При потере echo повторяем
        // после ожидания, пока сервер не заменит временное сообщение.
        schedulePendingMessageAutoRetry(topicId, messageId);
        return;
      }

      const nextRetryState = pendingMessageRetryStates.get(retryKey);

      if (!nextRetryState) {
        return;
      }

      nextRetryState.attempt += 1;
      pendingMessageRetryStates.set(retryKey, nextRetryState);
      schedulePendingMessageAutoRetry(topicId, messageId);
    }, delayMs);

    pendingMessageRetryTimers.set(retryKey, timeoutId);
  };

  if (!arePendingMessageRetryListenersBound && typeof window !== 'undefined') {
    const triggerRetry = (reset = false) => {
      if (isIosWeb() && !document.hidden) {
        backgroundInterruptedUploadMessages.clear();
      }
      scheduleAllPendingMessageAutoRetries({
        immediate: true,
        expedite: true,
        reset
      });
    };

    window.addEventListener('online', () => triggerRetry(true));
    window.addEventListener('focus', () => triggerRetry());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        lastDocumentHiddenAt = Date.now();
        return;
      }

      if (!document.hidden) {
        triggerRetry(true);
      }
    });

    arePendingMessageRetryListenersBound = true;
  }

  const schedulePendingMessageAutoRetriesForTopic = (
    topicId?: string,
    options?: { immediate?: boolean; expedite?: boolean; reset?: boolean }
  ): void => {
    if (!topicId) {
      return;
    }

    getFullMessagesByTopicId(topicId).forEach(message => {
      if (!message.id || !canAutoRetryMessage(message)) {
        return;
      }

      schedulePendingMessageAutoRetry(topicId, message.id, {
        immediate: options?.immediate,
        reset: options?.reset,
        preserveExisting: !options?.expedite
      });
    });
  };

  let pendingUploadRestoreProbeTimer: ReturnType<typeof setTimeout> | null =
    null;

  const startPendingUploadRestoreProbe = (topicId?: string): void => {
    if (pendingUploadRestoreProbeTimer) {
      clearTimeout(pendingUploadRestoreProbeTimer);
      pendingUploadRestoreProbeTimer = null;
    }

    if (!topicId) {
      return;
    }

    let attemptsRemaining = 30;
    const probe = (): void => {
      schedulePendingMessageAutoRetriesForTopic(topicId, { immediate: true });
      attemptsRemaining -= 1;

      if (attemptsRemaining > 0 && route.value.id === topicId) {
        pendingUploadRestoreProbeTimer = setTimeout(probe, 1000);
      } else {
        pendingUploadRestoreProbeTimer = null;
      }
    };

    pendingUploadRestoreProbeTimer = setTimeout(probe, 0);
  };

  if (getCurrentScope()) {
    onScopeDispose(() => {
      if (pendingUploadRestoreProbeTimer) {
        clearTimeout(pendingUploadRestoreProbeTimer);
        pendingUploadRestoreProbeTimer = null;
      }
    });
  }

  watch(
    () => route.value.id,
    nextTopicId => {
      schedulePendingMessageAutoRetriesForTopic(nextTopicId);
      startPendingUploadRestoreProbe(nextTopicId);
    },
    { immediate: true }
  );

  watch(
    () => {
      const topicId = route.value.id;

      if (!topicId) {
        return '';
      }

      return getFullMessagesByTopicId(topicId)
        .filter(message => message.id && canAutoRetryMessage(message))
        .map(message => message.id)
        .join(':');
    },
    pendingMessageIds => {
      if (!pendingMessageIds) {
        return;
      }

      schedulePendingMessageAutoRetriesForTopic(route.value.id, {
        immediate: true
      });
    },
    { immediate: true }
  );

  watch(
    () => getHasWebsocketConnection(),
    isConnected => {
      if (!isConnected) {
        return;
      }

      scheduleAllPendingMessageAutoRetries({
        immediate: true,
        expedite: true,
        reset: true
      });
    }
  );

  const uploadMessageFile = async (
    topicId: string,
    messageId: string,
    fileId: string,
    payload: { file: File; isMedia: boolean },
    options?: {
      markNotDeliveredOnFailure?: boolean;
      suppressErrorNotification?: boolean;
    }
  ): Promise<boolean> => {
    const requestKey = getPendingUploadRequestKey(topicId, messageId, fileId);
    const existingRequest = activeUploadRequests.get(requestKey);

    if (existingRequest) {
      return existingRequest;
    }

    const message = getMessageById(topicId, messageId);
    const currentMedia = message?.media?.find(media => media.id === fileId);

    if (!currentMedia) {
      return false;
    }

    const uploadTraceId = createTelemetryTraceId('upload');
    const uploadStartedAt = Date.now();
    const uploadTelemetryPayload = {
      ...getFileTelemetryPayload(payload.file),
      topicId,
      messageId,
      fileId,
      isMedia: payload.isMedia,
      mediaType: currentMedia.type
    };

    const request = (async (): Promise<boolean> => {
      const stopUploadStatus = startMessageUploadStatus(
        topicId,
        getMessageUploadKind(payload.file, payload.isMedia)
      );
      recordTelemetryEvent({
        category: 'upload',
        name: 'upload.message_file.start',
        traceId: uploadTraceId,
        entityType: 'message',
        entityId: messageId,
        payload: uploadTelemetryPayload
      });

      changeMessageStatusLocally(topicId, messageId, MessageStatus.Wait);
      setFileUploadPendingStatus(topicId, messageId, fileId);
      clearBackgroundInterruptedUpload(topicId, messageId);

      try {
        await waitForPreviewMetrics(currentMedia);
        const inquiry = useManagerInquiries().byTopic.value.get(topicId);
        const upload = async () => {
          if (inquiry) {
            const target = parseMessageEx(message?.ex)?.managerReplyRouteId;
            if (typeof target !== 'string')
              throw new Error(
                'Не удалось определить канал последнего сообщения клиента'
              );
            const path = await uploadManagerFile(
              topicId,
              target,
              await managerUploadId(messageId, fileId),
              payload.file
            );
            changeFileUploadPercent(topicId, messageId, fileId, 100);
            return {
              file: payload.file,
              path,
              thumbnailPath: path,
              ex: currentMedia.ex
            };
          }
          return uploadFile(
            payload.file,
            currentMedia.ex,
            percent => {
              changeFileUploadPercent(topicId, messageId, fileId, percent);
            },
            payload.isMedia,
            {
              traceId: uploadTraceId,
              topicId,
              messageId,
              fileId,
              source: 'message_attachment'
            }
          );
        };
        const { file, path, thumbnailPath, ex } = await upload();

        changeFileLoadingStatus(topicId, messageId, fileId);
        setUploadedFileData(topicId, messageId, fileId, {
          path,
          thumbnailPath,
          originName: file.name,
          size: file.size,
          type: getMediaType(payload.file, payload.isMedia),
          ex
        });

        recordTelemetryEvent({
          category: 'upload',
          name: 'upload.message_file.success',
          traceId: uploadTraceId,
          entityType: 'message',
          entityId: messageId,
          payload: {
            ...uploadTelemetryPayload,
            path,
            thumbnailPath,
            elapsedMs: Date.now() - uploadStartedAt
          }
        });

        return true;
      } catch (error: any) {
        if (
          payload.isMedia &&
          (isIosWeb() ? document.hidden : wasDocumentRecentlyHidden())
        ) {
          markBackgroundInterruptedUpload(topicId, messageId);
        }

        changeFileUploadErrorStatus(topicId, messageId, fileId, true);
        if (options?.markNotDeliveredOnFailure !== false) {
          changeMessageStatusLocally(
            topicId,
            messageId,
            MessageStatus.NotDelivered
          );
        }
        if (!options?.suppressErrorNotification) {
          showErrorNotification(error.message || 'Failed to upload file');
        }
        recordTelemetryEvent({
          category: 'upload',
          name: 'upload.message_file.failed',
          level: 'error',
          traceId: uploadTraceId,
          entityType: 'message',
          entityId: messageId,
          payload: {
            ...uploadTelemetryPayload,
            elapsedMs: Date.now() - uploadStartedAt,
            ...getTelemetryErrorPayload(error)
          }
        });
        return false;
      } finally {
        stopUploadStatus();
        activeUploadRequests.delete(requestKey);
      }
    })();

    activeUploadRequests.set(requestKey, request);
    return request;
  };

  const queuePendingTextMessage = (params: {
    topicId: string;
    text: string;
    replyMessageId?: string;
    replyMessage?: IMessage | null;
    forwardMessageIds?: string[];
    taggedUserIds?: string[];
    ex?: string;
  }): void => {
    const parsedEx = parseMessageEx(params.ex);
    const clientId =
      typeof parsedEx.clientId === 'string'
        ? parsedEx.clientId
        : generateUUID();
    const ex = createMessageEx(
      {
        clientId,
        ...(typeof parsedEx.forwardBatchId === 'string'
          ? { forwardBatchId: parsedEx.forwardBatchId }
          : {}),
        ...(typeof parsedEx.forwardBatchOrder === 'number'
          ? { forwardBatchOrder: parsedEx.forwardBatchOrder }
          : {})
      },
      params.ex
    );

    addMessageToLocal(params.topicId, {
      id: clientId,
      status: MessageStatus.Wait,
      createdAt: new Date(),
      deletedAt: null,
      updatedAt: null,
      isEdit: false,
      isPin: false,
      isSystem: false,
      replyMessageId: params.replyMessageId,
      replyMessage: params.replyMessage ?? state.replyMessage,
      senderUserId: authUser.value.id,
      senderUser: authUser.value,
      text: params.text,
      topicId: params.topicId,
      taggedUserIds: params.taggedUserIds,
      media: [],
      ex
    });

    void registerPendingUploadMessage(params.topicId, clientId, {
      replyMessageId: params.replyMessageId,
      forwardMessageIds: params.forwardMessageIds || []
    });

    schedulePendingMessageAutoRetry(params.topicId, clientId, { reset: true });
  };

  const buildAttachmentPreviewEx = (
    dimensions: { width?: number; height?: number },
    count: number,
    index: number,
    fillSharedPreview?: boolean
  ) => {
    const preview = calculatePreviewDimensions(dimensions, count, index);

    return fillSharedPreview
      ? {
          ...preview,
          fillPreview: true
        }
      : preview;
  };

  const hydrateLocalVideoPreview = (
    topicId: string,
    messageId: string,
    fileId: string,
    file: File
  ): void => {
    const sdk = getChatSDK();
    const userId = authUser.value.id;
    void getVideoThumbnail(file)
      .then(thumbnail => {
        if (
          !thumbnail ||
          getChatSDK() !== sdk ||
          authUser.value?.id !== userId ||
          !getMessageById(topicId, messageId)
        ) {
          return;
        }

        setLocalMediaPreviewData(topicId, messageId, fileId, {
          localThumbnailPath: thumbnail
        });
      })
      .catch(error => {
        console.warn(
          '[ChatSDK] Failed to create local video thumbnail:',
          error
        );
      });
  };

  const buildLocalVideoPreview = async (
    file: File,
    count: number,
    index: number,
    fillSharedPreview?: boolean
  ): Promise<Pick<IMedia, 'localThumbnailPath' | 'ex'>> => {
    const dimensionsPromise: Promise<MediaDimensions> = getFileDimensions(
      file
    ).catch(error => {
      console.warn('[ChatSDK] Failed to read local video dimensions:', error);
      return {};
    });
    const thumbnailPromise = getVideoThumbnail(file, {
      timeoutMs: VIDEO_LOCAL_THUMBNAIL_TIMEOUT_MS
    }).catch(error => {
      console.warn('[ChatSDK] Failed to create local video thumbnail:', error);
      return null;
    });
    const [dimensions, thumbnail] = await Promise.all([
      dimensionsPromise,
      thumbnailPromise
    ]);
    const previewSource =
      dimensions.width && dimensions.height
        ? dimensions
        : VIDEO_INITIAL_PREVIEW_DIMENSIONS;

    return {
      localThumbnailPath: thumbnail || VIDEO_FALLBACK_THUMBNAIL,
      ex: buildAttachmentPreviewEx(
        previewSource,
        count,
        index,
        fillSharedPreview
      )
    };
  };

  const handleSendSticker = async (
    stickerId: Parameters<typeof createStickerMessage>[0]
  ): Promise<void> => {
    const content = createStickerMessage(stickerId);
    const topicId = route.value.id;
    if (
      !content ||
      !topicId ||
      state.editMessage ||
      route.value.type === RouteTypes.AI
    )
      return;
    if (useManagerInquiries().byTopic.value.has(topicId)) return;

    const replyMessage = state.replyMessage;
    const clientId = generateUUID();
    queuePendingTextMessage({
      topicId,
      text: content.text,
      replyMessageId: replyMessage?.id,
      replyMessage,
      ex: createMessageEx({
        clientId,
        ...content.metadata,
        ...createReplyQuoteEx(replyMessage)
      })
    });
    clearPendingMessageAutoRetry(topicId, clientId);
    if (state.replyMessage === replyMessage) state.replyMessage = null;
    onMessageSubmitted?.(topicId);
    state.hideUnreadMarker = true;
    await nextTick();
    scrollToBottom();

    try {
      const didSend = await trySendPendingTextMessage(topicId, clientId, {
        markNotDeliveredOnFailure: false
      });
      if (!didSend)
        schedulePendingMessageAutoRetry(topicId, clientId, { reset: true });
    } catch {
      schedulePendingMessageAutoRetry(topicId, clientId, { reset: true });
    }
  };

  const handleSend = async (
    payload?: string[] | IHandleSendPayload
  ): Promise<void> => {
    const sendPayload = Array.isArray(payload)
      ? { taggedUserIds: payload }
      : payload ?? {};
    const rawText = sendPayload.content ?? inputText.value;
    const normalizedText = normalizeMessageHtml(rawText);
    const taggedUserIds = sendPayload.taggedUserIds;
    const attachedFiles = sendPayload.files
      ? Array.from(sendPayload.files).map(file => ({ file, isMedia: false }))
      : [];
    const attachedMediaFiles = sendPayload.mediaFiles
      ? Array.from(sendPayload.mediaFiles).map(file => ({
          file,
          isMedia: true
        }))
      : [];
    const queuedFiles = [...attachedMediaFiles, ...attachedFiles];
    const topicId = route.value.id;
    const routeType = route.value?.type;
    const replyMessageId = state.replyMessage?.id;
    const managerReplyRouteId = selectedManagerRoute(topicId)?.id;
    const replyQuoteEx = {
      ...createReplyQuoteEx(state.replyMessage),
      ...(managerReplyRouteId ? { managerReplyRouteId } : {})
    };
    const forwardMessages = state.forwardMessages;
    const hasForwardMessages = forwardMessages.length > 0;
    const hasMultipleForwardMessages = forwardMessages.length > 1;
    const hasAttachments = queuedFiles.length > 0;

    const isTextEmpty = stripHtml(normalizedText).length === 0;

    if (isTextEmpty && !hasForwardMessages && !hasAttachments) return;

    const channelError = managerSendError(
      topicId,
      queuedFiles.map(item => item.file)
    );
    if (channelError) {
      showErrorNotification(channelError);
      return;
    }
    if (
      useManagerInquiries().byTopic.value.has(topicId) &&
      (hasForwardMessages || state.editMessage)
    ) {
      showErrorNotification(
        'Внешние каналы принимают новые сообщения и вложения. Пересылка и редактирование недоступны'
      );
      return;
    }
    inputText.value = '';

    const textToSend = isTextEmpty ? '' : normalizedText;

    if (state.editMessage) {
      await sendMessageChat({
        messageId: state.editMessage.id,
        topicId,
        text: textToSend
      });
      state.editMessage = null;
      return;
    }

    const parts = textToSend ? splitHtmlByLength(textToSend) : [];
    const needsForwardBatch =
      hasMultipleForwardMessages || (hasForwardMessages && parts.length > 0);
    const forwardBatchId = needsForwardBatch ? generateUUID() : null;
    const callTopicPromptText = stripHtml(textToSend)
      .replace(/\u00a0/g, ' ')
      .trim();
    const callTopicButtonAction = getCallTopicButtonAction(callTopicPromptText);
    const shouldHandleCallTopicPrompt =
      routeType === RouteTypes.CALL &&
      !!callTopicPromptText &&
      !hasAttachments &&
      !hasForwardMessages &&
      !replyMessageId;
    const shouldRunCallTopicButtonAction =
      shouldHandleCallTopicPrompt && !!callTopicButtonAction;
    const shouldRequestCallTopicPromptResponse =
      shouldHandleCallTopicPrompt &&
      !callTopicButtonAction &&
      isCallTopicAutoPromptEnabled();
    const shouldSendCallTopicPromptPlaceholder =
      shouldHandleCallTopicPrompt &&
      !callTopicButtonAction &&
      !isCallTopicAutoPromptEnabled();

    /* ================= AI ROUTE ================= */
    if (routeType === RouteTypes.AI) {
      let aiAttachments = [];
      try {
        aiAttachments = await stageAiAttachments(
          queuedFiles.map(payload => payload.file)
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Не удалось подготовить вложение для AI';
        state.aiMessages = [
          ...state.aiMessages,
          {
            role: 'assistant' as 'user' | 'assistant',
            content: message,
            timestamp: Date.now()
          }
        ];
        showErrorNotification(message);
        return;
      }

      const aiParts =
        parts.length > 0
          ? parts
          : [
              'Я прикрепил файл. Уточни, к какой сущности ERP его нужно прикрепить.'
            ];
      const attachmentSummary = aiAttachments.length
        ? `Прикреплено: ${aiAttachments
            .map(attachment => `«${escapeAiAttachmentName(attachment.name)}»`)
            .join(', ')}`
        : '';

      for (const [index, part] of aiParts.entries()) {
        const visiblePart =
          index === 0 && attachmentSummary
            ? `${part}\n\n${attachmentSummary}`
            : part;
        const userMessage = {
          role: 'user' as 'user' | 'assistant',
          content: visiblePart,
          timestamp: Date.now()
        };

        state.aiMessages = [...state.aiMessages, userMessage];
        await nextTick();

        if (mastraResult.value?.sendMessage) {
          try {
            await mastraResult.value.sendMessage(
              visiblePart,
              undefined,
              undefined,
              index === 0 ? aiAttachments : []
            );
          } catch (error) {
            console.warn('Mastra failed to send message:', error);
            break;
          }
        } else {
          const assistantMessage = {
            role: 'assistant' as 'user' | 'assistant',
            content: 'Mastra is currently unavailable. Please try again later.',
            timestamp: Date.now()
          };

          state.aiMessages = [...state.aiMessages, assistantMessage];
          await nextTick();
          scrollToBottom();

          console.warn('Mastra is not available, message added locally only');
          break;
        }
      }

      state.hideUnreadMarker = true;
      return;
    }

    /* ================= NORMAL CHAT ================= */
    if (!topicId) {
      recordTelemetryEvent({
        category: 'chat',
        name: 'chat.message_send.failed',
        level: 'error',
        entityType: 'message',
        payload: {
          reason: 'missing_topic',
          routeType
        }
      });
      console.error('[ChatSDK] Cannot send message: no topic provided');
      return;
    }

    const chatSendTraceId = createTelemetryTraceId('message');
    const chatSendStartedAt = Date.now();
    let sentMessageCount = 0;
    let queuedMessageCount = 0;

    recordTelemetryEvent({
      category: 'chat',
      name: 'chat.message_send.start',
      traceId: chatSendTraceId,
      entityType: 'message',
      payload: {
        topicId,
        routeType,
        textLength: stripHtml(textToSend).length,
        partCount: parts.length,
        hasAttachments,
        attachmentCount: queuedFiles.length,
        mediaCount: queuedFiles.filter(file => file.isMedia).length,
        forwardCount: forwardMessages.length,
        hasReply: Boolean(replyMessageId),
        taggedUserCount: taggedUserIds?.length || 0
      }
    });

    try {
      if (hasAttachments) {
        recordTelemetryEvent({
          category: 'chat',
          name: 'chat.message_send.delegated_to_upload',
          traceId: chatSendTraceId,
          entityType: 'message',
          payload: {
            topicId,
            attachmentCount: queuedFiles.length,
            mediaCount: queuedFiles.filter(file => file.isMedia).length,
            elapsedMs: Date.now() - chatSendStartedAt
          }
        });
        await handleQueuedAttachmentFiles(queuedFiles, {
          topicId,
          managerReplyRouteId,
          text: textToSend || null,
          taggedUserIds,
          replyMessage: state.replyMessage,
          replyMessageId,
          forwardMessageIds: forwardMessages.map(message => message.id)
        });
        return;
      }

      onMessageSubmitted?.(topicId);
      if (parts.length === 0 && hasForwardMessages) {
        for (const [index, forwardMessage] of forwardMessages.entries()) {
          const ex = createMessageEx(
            {
              clientId: generateUUID(),
              ...replyQuoteEx,
              ...(forwardBatchId
                ? {
                    forwardBatchId,
                    forwardBatchOrder: index
                  }
                : {})
            },
            undefined
          );

          const didSend = await sendMessageChat({
            topicId,
            text: '',
            replyMessageId,
            forwardMessageId: forwardMessage.id,
            ex
          });

          if (!didSend) {
            queuedMessageCount += 1;
            queuePendingTextMessage({
              topicId,
              text: '',
              replyMessageId,
              forwardMessageIds: [forwardMessage.id],
              ex
            });
          } else {
            sentMessageCount += 1;
          }
        }
      }

      if (hasForwardMessages && parts.length > 0) {
        const sendPlan = buildForwardMessageSendPlan(
          forwardMessages.map(message => message.id),
          parts
        );

        registerPendingOutgoingForwardBatch(
          topicId,
          sendPlan.map(item => ({
            forwardBatchId: forwardBatchId as string,
            forwardBatchOrder: item.forwardBatchOrder
          }))
        );

        for (const item of sendPlan) {
          if (
            item.kind === 'text' &&
            item.forwardBatchOrder === forwardMessages.length
          ) {
            await new Promise(resolve =>
              setTimeout(resolve, FORWARD_TEXT_SEND_DELAY_MS)
            );
          }

          const ex = createMessageEx({
            clientId: generateUUID(),
            ...replyQuoteEx,
            forwardBatchId: forwardBatchId as string,
            forwardBatchOrder: item.forwardBatchOrder
          });

          const didSend = await sendMessageChat({
            topicId,
            text: item.text,
            replyMessageId,
            forwardMessageId: item.forwardMessageId,
            taggedUserIds: item.kind === 'text' ? taggedUserIds : undefined,
            ex
          });

          if (!didSend) {
            queuedMessageCount += 1;
            queuePendingTextMessage({
              topicId,
              text: item.text,
              replyMessageId,
              forwardMessageIds: item.forwardMessageId
                ? [item.forwardMessageId]
                : [],
              taggedUserIds: item.kind === 'text' ? taggedUserIds : undefined,
              ex
            });
          } else {
            sentMessageCount += 1;
          }
        }

        state.hideUnreadMarker = true;

        await nextTick();
        scrollToBottom();
        clearSellectedMessage();
        return;
      }

      for (const part of parts) {
        const clientId = useManagerInquiries().byTopic.value.has(topicId)
          ? crypto.randomUUID()
          : generateUUID();
        const ex = createMessageEx({
          clientId,
          ...replyQuoteEx
        });
        const localMessage: IMessage = {
          id: clientId,
          status: MessageStatus.Wait,
          createdAt: new Date(),
          deletedAt: null,
          updatedAt: null,
          isEdit: false,
          isPin: false,
          isSystem: false,
          replyMessageId,
          replyMessage: state.replyMessage,
          senderUserId: authUser.value.id,
          senderUser: authUser.value,
          text: part,
          topicId,
          taggedUserIds,
          media: [],
          ex
        };

        void registerPendingUploadMessage(topicId, clientId, {
          replyMessageId,
          forwardMessageIds: []
        });

        const canSend = isSendAvailable();

        if (!canSend) {
          queuedMessageCount += 1;
          addMessageToLocal(topicId, localMessage);
          schedulePendingMessageAutoRetry(topicId, clientId, { reset: true });
          continue;
        }

        scheduleDelayedOutgoingMessage(
          topicId,
          localMessage,
          TEXT_WAIT_INDICATOR_DELAY_MS
        );

        const didSend = await sendMessageChat({
          topicId,
          text: part,
          replyMessageId,
          taggedUserIds,
          ex
        });

        if (!didSend) {
          queuedMessageCount += 1;
          cancelDelayedOutgoingMessage(topicId, clientId);
          addMessageToLocal(topicId, {
            ...localMessage,
            status: MessageStatus.Wait
          });
          schedulePendingMessageAutoRetry(topicId, clientId, { reset: true });
        } else {
          sentMessageCount += 1;
        }
      }
      state.hideUnreadMarker = true;

      await nextTick();
      scrollToBottom();

      if (
        (shouldRunCallTopicButtonAction ||
          shouldRequestCallTopicPromptResponse ||
          shouldSendCallTopicPromptPlaceholder) &&
        sentMessageCount > 0 &&
        queuedMessageCount === 0
      ) {
        if (shouldRunCallTopicButtonAction && callTopicButtonAction) {
          await sendCallTopicButtonActionResponse(
            topicId,
            callTopicButtonAction
          );
        } else if (shouldRequestCallTopicPromptResponse) {
          await sendCallTopicPromptResponse(topicId, callTopicPromptText);
        } else {
          await sendCallTopicPromptPlaceholder(topicId);
        }
        await nextTick();
        scrollToBottom();
      }

      recordTelemetryEvent({
        category: 'chat',
        name:
          queuedMessageCount > 0
            ? 'chat.message_send.queued_retry'
            : 'chat.message_send.success',
        level: queuedMessageCount > 0 ? 'warn' : 'info',
        traceId: chatSendTraceId,
        entityType: 'message',
        payload: {
          topicId,
          sentMessageCount,
          queuedMessageCount,
          elapsedMs: Date.now() - chatSendStartedAt
        }
      });
    } catch (error: any) {
      recordTelemetryEvent({
        category: 'chat',
        name: 'chat.message_send.failed',
        level: 'error',
        traceId: chatSendTraceId,
        entityType: 'message',
        payload: {
          topicId,
          sentMessageCount,
          queuedMessageCount,
          elapsedMs: Date.now() - chatSendStartedAt,
          ...getTelemetryErrorPayload(error)
        }
      });
      console.error('[ChatSDK] Failed to send message:', error);
    }

    clearSellectedMessage();
  };

  const handleAttachFileChunk = async (
    files: FileList | IQueuedFilePayload[],
    options?: IAttachChunkOptions
  ) => {
    const filePayloads = Array.isArray(files)
      ? files
      : Array.from(files).map(file => ({
          file,
          isMedia: options?.isMedia ?? false
        }));

    if (!filePayloads.length) return;

    const fileSizeError = filePayloads
      .map(({ file }) => getUploadFileSizeError(file))
      .find((error): error is string => Boolean(error));

    if (fileSizeError) {
      showErrorNotification(fileSizeError);
      return;
    }

    const topicId = options?.topicId ?? route.value.id;
    const channelError = managerSendError(
      topicId,
      filePayloads.map(item => item.file)
    );
    if (channelError) {
      showErrorNotification(channelError);
      return;
    }
    const managerReplyRouteId =
      options?.managerReplyRouteId ?? selectedManagerRoute(topicId)?.id;
    const replyMessage = options?.replyMessage ?? state.replyMessage;
    const replyMessageId = options?.replyMessageId ?? state.replyMessage?.id;
    const replyQuoteEx = {
      ...createReplyQuoteEx(replyMessage),
      ...(managerReplyRouteId ? { managerReplyRouteId } : {})
    };
    const forwardMessageIds =
      options?.forwardMessageIds ??
      state.forwardMessages.map(message => message.id);

    if (!topicId) {
      console.error('[ChatSDK] Cannot attach file: no topic provided');
      return;
    }

    const clientId = useManagerInquiries().byTopic.value.has(topicId)
      ? crypto.randomUUID()
      : generateUUID();
    const messageTraceId = createTelemetryTraceId('attachment');
    const sdk = getChatSDK();
    const sendingUser = authUser.value;
    const isCurrent = () =>
      getChatSDK() === sdk && authUser.value?.id === sendingUser.id;
    const nativeUploadDecision =
      !managerReplyRouteId &&
      !forwardMessageIds.length &&
      filePayloads.some(({ file }) => file.type.startsWith('video/'))
        ? canUseNativeMessageUpload()
        : Promise.resolve(false);
    const videoPreviews = new Map<
      string,
      Promise<Pick<IMedia, 'localThumbnailPath' | 'ex'>>
    >();

    const localMedia: IMedia[] = await Promise.all(
      filePayloads.map(async ({ file, isMedia }, i) => {
        const type = getMediaType(file, isMedia);
        const localPath =
          type === MediaType.File ? '' : URL.createObjectURL(file);
        const baseMedia = {
          localPath,
          path: '',
          originName: file.name,
          size: file.size,
          id: i + '',
          createdAt: null,
          deletedAt: null,
          updatedAt: null,
          messageId: clientId,
          type,
          isLoading: true,
          uploadPercent: 0
        };

        if (type === MediaType.File) {
          return {
            ...baseMedia,
            ex: {}
          };
        }

        if (type === MediaType.Video) {
          videoPreviews.set(
            String(i),
            buildLocalVideoPreview(
              file,
              filePayloads.length,
              i,
              options?.fillSharedPreview === true
            )
          );

          return {
            ...baseMedia,
            localThumbnailPath: VIDEO_FALLBACK_THUMBNAIL,
            ex: buildAttachmentPreviewEx(
              VIDEO_INITIAL_PREVIEW_DIMENSIONS,
              filePayloads.length,
              i,
              options?.fillSharedPreview === true
            )
          };
        }

        const dimensions = await getFileDimensions(file);

        return {
          ...baseMedia,
          ex: buildAttachmentPreviewEx(
            dimensions,
            filePayloads.length,
            i,
            options?.fillSharedPreview === true
          )
        };
      })
    );
    if (!isCurrent()) return;

    const newMessage: IMessage = {
      id: clientId,
      status: MessageStatus.Wait,
      createdAt: new Date(),
      deletedAt: null,
      updatedAt: null,
      isEdit: false,
      isPin: false,
      isSystem: false,
      replyMessageId,
      replyMessage,
      senderUserId: sendingUser.id,
      senderUser: sendingUser,
      text: options?.text || null,
      topicId,
      taggedUserIds: options?.taggedUserIds,
      media: localMedia,
      ex: createMessageEx({
        clientId,
        ...(options?.keyboardSticker
          ? {
              kind: 'sticker',
              sticker: {
                pack: 'keyboard',
                version: 1,
                durationMs: options.keyboardStickerDurationMs || 0
              }
            }
          : {}),
        ...replyQuoteEx
      })
    };

    addMessageToLocal(newMessage.topicId, newMessage);
    onMessageSubmitted?.(topicId);
    void nextTick().then(() => {
      if (isCurrent() && route.value.id === topicId) scrollToBottom();
    });
    const pendingUploadMessagePersistence = registerPendingUploadMessage(
      newMessage.topicId,
      clientId,
      {
        replyMessageId,
        forwardMessageIds,
        message: newMessage
      }
    );

    recordTelemetryEvent({
      category: 'upload',
      name: 'upload.message.created',
      traceId: messageTraceId,
      entityType: 'message',
      entityId: clientId,
      payload: {
        topicId: newMessage.topicId,
        messageId: clientId,
        fileCount: filePayloads.length,
        totalBytes: filePayloads.reduce(
          (sum, payload) => sum + payload.file.size,
          0
        ),
        mediaCount: filePayloads.filter(payload => payload.isMedia).length,
        videoCount: filePayloads.filter(payload =>
          payload.file.type.startsWith('video/')
        ).length
      }
    });

    const pendingUploadFileHandoffs = new Map<string, Promise<void>>();

    filePayloads.forEach(({ file, isMedia }, index) => {
      const fileId = index.toString();

      const persistencePromise = registerPendingUploadFile(
        newMessage.topicId,
        clientId,
        fileId,
        { file, isMedia },
        () =>
          changeFileUploadPercent(newMessage.topicId, clientId, fileId, null)
      );
      pendingUploadFileHandoffs.set(fileId, persistencePromise);
    });

    const videoPreviewsReady = Promise.all(
      Array.from(videoPreviews, async ([fileId, previewPromise]) => {
        const preview = await previewPromise;
        if (!isCurrent() || !getMessageById(topicId, clientId)) return;
        setLocalMediaPreviewData(topicId, clientId, fileId, preview);
        if (preview.localThumbnailPath === VIDEO_FALLBACK_THUMBNAIL) {
          hydrateLocalVideoPreview(
            topicId,
            clientId,
            fileId,
            filePayloads[Number(fileId)].file
          );
        }
      })
    );

    const pendingUploadMessageStatePromise = Promise.all([
      pendingUploadMessagePersistence,
      flushPendingMessagePersists()
    ]);
    const pendingUploadPersistencePromise = Promise.allSettled([
      pendingUploadMessageStatePromise,
      ...pendingUploadFileHandoffs.values()
    ]);

    // Сообщение и файлы сохраняются до сетевого выбора способа отправки.
    const [useNativeUpload] = await Promise.all([
      nativeUploadDecision,
      pendingUploadMessageStatePromise,
      videoPreviewsReady
    ]);
    const pendingMessage = getMessageById(topicId, clientId);
    if (!isCurrent() || !pendingMessage) return;

    if (useNativeUpload) {
      activeNativeUploadMessages.add(clientId);
      try {
        const nativeMessage = {
          ...pendingMessage,
          ex: createMessageEx({ nativeUpload: true }, pendingMessage.ex)
        };
        editMessageFromLocal(topicId, nativeMessage);
        await registerPendingUploadMessage(topicId, clientId, {
          replyMessageId,
          forwardMessageIds,
          message: nativeMessage
        });
        await flushPendingMessagePersists();
        await pendingUploadPersistencePromise;
        const readyMessage = getMessageById(topicId, clientId);
        if (!isCurrent() || !readyMessage) return;
        const sent = await sendNativeMessageUpload(
          readyMessage,
          filePayloads,
          (index, percent) =>
            changeFileUploadPercent(topicId, clientId, String(index), percent)
        );
        if (isCurrent() && getMessageById(topicId, clientId)) {
          addMessageToLocal(topicId, sent);
        }
      } catch (error: any) {
        if (!isCurrent() || !getMessageById(topicId, clientId)) return;
        changeMessageStatusLocally(
          topicId,
          clientId,
          MessageStatus.NotDelivered
        );
        showErrorNotification(error?.message || 'Не удалось отправить видео');
        schedulePendingMessageAutoRetry(topicId, clientId, { reset: true });
      } finally {
        activeNativeUploadMessages.delete(clientId);
      }
      if (isCurrent() && route.value.id === topicId) state.replyMessage = null;
      return;
    }

    let hasUploadError = false;
    for (const [i, payload] of filePayloads.entries()) {
      const fileId = i.toString();

      try {
        await pendingUploadFileHandoffs.get(fileId);
      } catch (error: any) {
        hasUploadError = true;
        changeFileUploadErrorStatus(newMessage.topicId, clientId, fileId, true);
        showErrorNotification(
          error?.message || 'Failed to prepare file for resumable upload'
        );
        continue;
      }

      const isUploaded = await uploadMessageFile(
        newMessage.topicId,
        clientId,
        fileId,
        payload,
        {
          markNotDeliveredOnFailure: false
        }
      );

      if (!isUploaded) {
        hasUploadError = true;
      }
    }

    if (hasUploadError) {
      await pendingUploadPersistencePromise;
      recordTelemetryEvent({
        category: 'upload',
        name: 'upload.message.waiting_retry',
        level: 'warn',
        traceId: messageTraceId,
        entityType: 'message',
        entityId: clientId,
        payload: {
          topicId: newMessage.topicId,
          messageId: clientId,
          reason: 'upload_error'
        }
      });
      schedulePendingMessageAutoRetry(newMessage.topicId, clientId, {
        reset: true
      });
    } else {
      const messageSendStartedAt = Date.now();
      recordTelemetryEvent({
        category: 'upload',
        name: 'upload.message_send.start',
        traceId: messageTraceId,
        entityType: 'message',
        entityId: clientId,
        payload: {
          topicId: newMessage.topicId,
          messageId: clientId,
          fileCount: filePayloads.length
        }
      });

      const didSend = await trySendPendingUploadMessage(
        newMessage.topicId,
        clientId,
        {
          markNotDeliveredOnFailure: false
        }
      );

      if (!didSend) {
        recordTelemetryEvent({
          category: 'upload',
          name: 'upload.message_send.failed',
          level: 'error',
          traceId: messageTraceId,
          entityType: 'message',
          entityId: clientId,
          payload: {
            topicId: newMessage.topicId,
            messageId: clientId,
            elapsedMs: Date.now() - messageSendStartedAt
          }
        });
        schedulePendingMessageAutoRetry(newMessage.topicId, clientId, {
          reset: true
        });
      } else {
        recordTelemetryEvent({
          category: 'upload',
          name: 'upload.message_send.success',
          traceId: messageTraceId,
          entityType: 'message',
          entityId: clientId,
          payload: {
            topicId: newMessage.topicId,
            messageId: clientId,
            elapsedMs: Date.now() - messageSendStartedAt
          }
        });
      }
    }

    state.replyMessage = null;
  };

  const splitQueuedAttachmentBatches = (
    filePayloads: IQueuedFilePayload[]
  ): IQueuedFilePayload[][] => {
    const mediaPayloads = filePayloads.filter(payload => payload.isMedia);
    const attachmentPayloads = filePayloads.filter(payload => !payload.isMedia);
    const batches: IQueuedFilePayload[][] = [];

    for (
      let index = 0;
      index < mediaPayloads.length;
      index += MAX_MEDIA_ATTACHMENTS_PER_MESSAGE
    ) {
      batches.push(
        mediaPayloads.slice(index, index + MAX_MEDIA_ATTACHMENTS_PER_MESSAGE)
      );
    }

    for (
      let index = 0;
      index < attachmentPayloads.length;
      index += MAX_FILE_ATTACHMENTS_PER_MESSAGE
    ) {
      batches.push(
        attachmentPayloads.slice(
          index,
          index + MAX_FILE_ATTACHMENTS_PER_MESSAGE
        )
      );
    }

    return batches;
  };

  const handleQueuedAttachmentFiles = async (
    filePayloads: IQueuedFilePayload[],
    options?: IAttachChunkOptions
  ): Promise<void> => {
    if (!filePayloads.length) {
      return;
    }

    const batches = splitQueuedAttachmentBatches(filePayloads);

    for (const [index, batch] of batches.entries()) {
      await handleAttachFileChunk(batch, {
        ...options,
        text: index === 0 ? options?.text || null : null,
        taggedUserIds: index === 0 ? options?.taggedUserIds : undefined
      });
    }

    state.hideUnreadMarker = true;
    await nextTick();
    scrollToBottom();
    clearSellectedMessage();
  };

  const isMediaShareFile = (file: File): boolean =>
    file.type.startsWith('image/') || file.type.startsWith('video/');

  const handleSendKeyboardMedia = async (file: File): Promise<void> => {
    if (
      !route.value.id ||
      state.editMessage ||
      route.value.type === RouteTypes.AI ||
      useManagerInquiries().byTopic.value.has(route.value.id) ||
      !['image/gif', 'image/webp', 'image/png', 'image/jpeg'].includes(
        file.type
      )
    )
      return;
    const prepared = await prepareKeyboardSticker(file);
    await handleQueuedAttachmentFiles(
      [{ file: prepared.file, isMedia: true }],
      {
        keyboardSticker: true,
        keyboardStickerDurationMs: prepared.durationMs,
        text: 'Стикер',
        forwardMessageIds: []
      }
    );
  };

  const handleAttachSharedFiles = async (
    files: File[],
    text?: string | null,
    topicId?: string
  ): Promise<void> => {
    if (!files.length) {
      return;
    }

    await handleQueuedAttachmentFiles(
      files.map(file => ({
        file,
        isMedia: isMediaShareFile(file)
      })),
      {
        topicId: topicId || route.value.id,
        text: text || null,
        fillSharedPreview: true,
        replyMessage: null,
        replyMessageId: undefined,
        forwardMessageIds: []
      }
    );
  };

  const handleAttachFile = async (files: FileList, isMedia = false) => {
    if (!files.length) return;

    const CHUNK_SIZE = 10;
    const filesArray = Array.from(files);
    const topicId = route.value.id;

    for (let i = 0; i < filesArray.length; i += CHUNK_SIZE) {
      const chunk = filesArray.slice(i, i + CHUNK_SIZE);

      const chunkFileList = {
        length: chunk.length,
        item: (index: number) => chunk[index],
        ...chunk
      } as any as FileList;

      handleAttachFileChunk(chunkFileList, { topicId, isMedia });
    }
  };

  const handleRetryMessage = async (messageId?: string): Promise<void> => {
    const topicId = route.value.id;

    if (!topicId || !messageId) {
      return;
    }

    clearBackgroundInterruptedUpload(topicId, messageId);

    const message = getMessageById(topicId, messageId);

    if (message && parseMessageEx(message.ex)?.nativeUpload === true) {
      const native = await getNativeMessageUpload(messageId);
      if (native.status === 'failed') await retryNativeMessageUpload(messageId);
      await trySendPendingMessage(topicId, messageId);
      schedulePendingMessageAutoRetry(topicId, messageId, { reset: true });
      return;
    }

    if (!message?.media?.length) {
      if (!message?.text) {
        const messageMeta = await getPendingUploadMessageMeta(
          topicId,
          messageId
        );

        if (!messageMeta?.forwardMessageIds?.length) {
          return;
        }
      }

      const canSend = isSendAvailable();

      changeMessageStatusLocally(topicId, messageId, MessageStatus.Wait);

      if (!canSend) {
        schedulePendingMessageAutoRetry(topicId, messageId, { reset: true });
        return;
      }

      const didSend = await trySendPendingTextMessage(topicId, messageId, {
        markNotDeliveredOnFailure: false
      });

      if (!didSend) {
        schedulePendingMessageAutoRetry(topicId, messageId, { reset: true });
      }

      return;
    }

    const failedMedia = message.media.filter(media => media.uploadError);

    if (failedMedia.length === 0) {
      const didSend = await trySendPendingUploadMessage(topicId, messageId, {
        markNotDeliveredOnFailure: false
      });

      if (!didSend) {
        schedulePendingMessageAutoRetry(topicId, messageId, { reset: true });
      }

      return;
    }

    let hasUploadError = false;

    for (const media of failedMedia) {
      const payload = await getPendingUploadFile(
        topicId,
        messageId,
        media.id,
        () => changeFileUploadPercent(topicId, messageId, media.id, null)
      );

      if (!payload) {
        hasUploadError = true;
        changeFileUploadErrorStatus(topicId, messageId, media.id, true);
        continue;
      }

      const isUploaded = await uploadMessageFile(
        topicId,
        messageId,
        media.id,
        payload,
        {
          markNotDeliveredOnFailure: false
        }
      );

      if (!isUploaded) {
        hasUploadError = true;
      }
    }

    if (!hasUploadError) {
      const didSend = await trySendPendingUploadMessage(topicId, messageId, {
        markNotDeliveredOnFailure: false
      });

      if (!didSend) {
        schedulePendingMessageAutoRetry(topicId, messageId, { reset: true });
      }
    } else {
      schedulePendingMessageAutoRetry(topicId, messageId, { reset: true });
    }
  };

  return {
    handleSend,
    handleSendSticker,
    handleSendKeyboardMedia,
    handleAttachFile,
    handleAttachSharedFiles,
    handleRetryMessage
  };
}
