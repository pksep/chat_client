import { nextTick, watch, type Ref } from 'vue';
import { sendMessageChat, uploadFile } from '../../../services/useChat';
import { generateUUID } from '../../../utils/generateUUID';
import { fileToDataURL } from '../../../utils/fileToDataURL';
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
  VIDEO_FALLBACK_THUMBNAIL
} from '../../../utils/mediaPreview';
import { MessageStatus } from '../../../services/useChatSDK/types';
import { getHasWebsocketConnection } from '../../../services/useChat';
import {
  createMessageExWithQuote,
  parseMessageEx
} from '../../../utils/messageReplyQuote';

const MAX_HTML_LENGTH = 4000;
const FORWARD_TEXT_SEND_DELAY_MS = 250;
const TEXT_WAIT_INDICATOR_DELAY_MS = 150;
const MAX_MEDIA_ATTACHMENTS_PER_MESSAGE = 10;
const MAX_FILE_ATTACHMENTS_PER_MESSAGE = 10;
const MESSAGE_MAX_RETRY_AGE_MS = 15 * 60 * 1000;
const MESSAGE_AUTO_RETRY_WINDOW_MS = 180000;
const MESSAGE_AUTO_RETRY_INITIAL_DELAY_MS = 3000;
const MESSAGE_AUTO_RETRY_MAX_DELAY_MS = 15000;
const BACKGROUND_UPLOAD_RETRY_SUPPRESS_MS = 15000;
const VIDEO_INITIAL_PREVIEW_DIMENSIONS = {
  width: 640,
  height: 360
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
const backgroundInterruptedUploadMessages = new Set<string>();
const activeUploadRequests = new Map<string, Promise<boolean>>();
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
  clearSellectedMessage: () => void
) {
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
    const createdAtMs = getMessageCreatedAtMs(message);

    if (createdAtMs === null) {
      return false;
    }

    return Date.now() - createdAtMs >= MESSAGE_MAX_RETRY_AGE_MS;
  };

  const isAutoRetryCandidate = (message?: IMessage | null): boolean =>
    Boolean(
      message &&
        !isMessageRetryExpired(message) &&
        (message.status === MessageStatus.Wait ||
          message.status === MessageStatus.NotDelivered)
    );

  const canAutoRetryMessage = (message?: IMessage | null): boolean => {
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

    return message.media.every(media => !media.isLoading);
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

  const isSendAvailable = (): boolean =>
    getHasWebsocketConnection() && navigator.onLine;

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
      const payload = await getPendingUploadFile(topicId, messageId, media.id);

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
        immediate: options?.immediate
      });
    });
  };

  const schedulePendingMessageAutoRetry = (
    topicId: string,
    messageId: string,
    options?: { immediate?: boolean; reset?: boolean }
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

    if (Date.now() - retryState.startedAt >= MESSAGE_AUTO_RETRY_WINDOW_MS) {
      changeMessageStatusLocally(
        topicId,
        messageId,
        MessageStatus.NotDelivered
      );
      clearPendingMessageAutoRetry(topicId, messageId);
      return;
    }

    const delayMs = options?.immediate
      ? 0
      : getNextRetryDelayMs(retryState.attempt);

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

      if (Date.now() - retryState.startedAt >= MESSAGE_AUTO_RETRY_WINDOW_MS) {
        changeMessageStatusLocally(
          topicId,
          messageId,
          MessageStatus.NotDelivered
        );
        clearPendingMessageAutoRetry(topicId, messageId);
        return;
      }

      const didSend = await trySendPendingMessage(topicId, messageId, {
        markNotDeliveredOnFailure: false
      });

      if (didSend) {
        clearPendingMessageAutoRetry(topicId, messageId);
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
    const triggerRetry = () => {
      scheduleAllPendingMessageAutoRetries({ immediate: true });
    };

    window.addEventListener('online', triggerRetry);
    window.addEventListener('focus', triggerRetry);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        lastDocumentHiddenAt = Date.now();
        return;
      }

      if (!document.hidden) {
        triggerRetry();
      }
    });

    arePendingMessageRetryListenersBound = true;
  }

  const schedulePendingMessageAutoRetriesForTopic = (
    topicId?: string,
    options?: { immediate?: boolean }
  ): void => {
    if (!topicId) {
      return;
    }

    getFullMessagesByTopicId(topicId).forEach(message => {
      if (!message.id || !canAutoRetryMessage(message)) {
        return;
      }

      schedulePendingMessageAutoRetry(topicId, message.id, {
        immediate: options?.immediate
      });
    });
  };

  watch(
    () => route.value.id,
    nextTopicId => {
      schedulePendingMessageAutoRetriesForTopic(nextTopicId);
    },
    { immediate: true }
  );

  watch(
    () => getHasWebsocketConnection(),
    isConnected => {
      if (!isConnected) {
        return;
      }

      scheduleAllPendingMessageAutoRetries({ immediate: true });
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

    const request = (async (): Promise<boolean> => {
      changeMessageStatusLocally(topicId, messageId, MessageStatus.Wait);
      setFileUploadPendingStatus(topicId, messageId, fileId);
      clearBackgroundInterruptedUpload(topicId, messageId);

      try {
        await waitForPreviewMetrics(currentMedia);
        const { file, path, thumbnailPath, ex } = await uploadFile(
          payload.file,
          currentMedia.ex,
          percent => {
            changeFileUploadPercent(topicId, messageId, fileId, percent);
          },
          payload.isMedia
        );

        changeFileLoadingStatus(topicId, messageId, fileId);
        setUploadedFileData(topicId, messageId, fileId, {
          path,
          thumbnailPath,
          originName: file.name,
          size: file.size,
          type: getMediaType(payload.file, payload.isMedia),
          ex
        });

        return true;
      } catch (error: any) {
        if (payload.isMedia && wasDocumentRecentlyHidden()) {
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
        return false;
      } finally {
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

    registerPendingUploadMessage(params.topicId, clientId, {
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
    file: File,
    count: number,
    index: number,
    fillSharedPreview?: boolean
  ): void => {
    void getFileDimensions(file)
      .then(dimensions => {
        if (!dimensions.width || !dimensions.height) {
          return;
        }

        setLocalMediaPreviewData(topicId, messageId, fileId, {
          ex: buildAttachmentPreviewEx(
            dimensions,
            count,
            index,
            fillSharedPreview
          )
        });
      })
      .catch(error => {
        console.warn('[ChatSDK] Failed to read local video dimensions:', error);
      });

    void getVideoThumbnail(file)
      .then(thumbnail => {
        if (!thumbnail) {
          return;
        }

        setLocalMediaPreviewData(topicId, messageId, fileId, {
          localThumbnailPath: thumbnail
        });
      })
      .catch(error => {
        console.warn('[ChatSDK] Failed to create local video thumbnail:', error);
      });
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
    const replyQuoteEx = createReplyQuoteEx(state.replyMessage);
    const forwardMessages = state.forwardMessages;
    const hasForwardMessages = forwardMessages.length > 0;
    const hasMultipleForwardMessages = forwardMessages.length > 1;
    const forwardBatchId = hasMultipleForwardMessages ? generateUUID() : null;
    const hasAttachments = queuedFiles.length > 0;

    const isTextEmpty = stripHtml(normalizedText).length === 0;

    if (isTextEmpty && !hasForwardMessages && !hasAttachments) return;

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

    /* ================= AI ROUTE ================= */
    if (routeType === RouteTypes.AI) {
      for (const part of parts) {
        const userMessage = {
          role: 'user' as 'user' | 'assistant',
          content: part,
          timestamp: Date.now()
        };

        state.aiMessages = [...state.aiMessages, userMessage];
        await nextTick();

        if (mastraResult.value?.sendMessage) {
          try {
            await mastraResult.value.sendMessage(part);
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
      console.error('[ChatSDK] Cannot send message: no topic provided');
      return;
    }

    try {
      if (hasAttachments) {
        await handleQueuedAttachmentFiles(queuedFiles, {
          topicId,
          text: textToSend || null,
          taggedUserIds,
          replyMessage: state.replyMessage,
          replyMessageId,
          forwardMessageIds: forwardMessages.map(message => message.id)
        });
        return;
      }

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
            queuePendingTextMessage({
              topicId,
              text: '',
              replyMessageId,
              forwardMessageIds: [forwardMessage.id],
              ex
            });
          }
        }
      }

      if (hasMultipleForwardMessages && parts.length > 0) {
        registerPendingOutgoingForwardBatch(topicId, [
          ...forwardMessages.map((_, index) => ({
            forwardBatchId: forwardBatchId as string,
            forwardBatchOrder: index
          })),
          ...parts.map((_, index) => ({
            forwardBatchId: forwardBatchId as string,
            forwardBatchOrder: forwardMessages.length + index
          }))
        ]);

        for (const [index, forwardMessage] of forwardMessages.entries()) {
          const ex = createMessageEx({
            clientId: generateUUID(),
            ...replyQuoteEx,
            forwardBatchId: forwardBatchId as string,
            forwardBatchOrder: index
          });

          const didSend = await sendMessageChat({
            topicId,
            text: '',
            replyMessageId,
            forwardMessageId: forwardMessage.id,
            ex
          });

          if (!didSend) {
            queuePendingTextMessage({
              topicId,
              text: '',
              replyMessageId,
              forwardMessageIds: [forwardMessage.id],
              ex
            });
          }
        }

        await new Promise(resolve =>
          setTimeout(resolve, FORWARD_TEXT_SEND_DELAY_MS)
        );

        for (const [index, part] of parts.entries()) {
          const ex = createMessageEx({
            clientId: generateUUID(),
            ...replyQuoteEx,
            forwardBatchId: forwardBatchId as string,
            forwardBatchOrder: forwardMessages.length + index
          });

          const didSend = await sendMessageChat({
            topicId,
            text: part,
            replyMessageId,
            taggedUserIds,
            ex
          });

          if (!didSend) {
            queuePendingTextMessage({
              topicId,
              text: part,
              replyMessageId,
              taggedUserIds,
              ex
            });
          }
        }

        state.hideUnreadMarker = true;

        await nextTick();
        scrollToBottom();
        clearSellectedMessage();
        return;
      }

      for (const part of parts) {
        if (hasForwardMessages) {
          for (const forwardMessage of forwardMessages) {
            const ex = createMessageEx({
              clientId: generateUUID(),
              ...replyQuoteEx
            });
            const didSend = await sendMessageChat({
              topicId,
              text: part,
              replyMessageId,
              forwardMessageId: forwardMessage.id,
              taggedUserIds,
              ex
            });

            if (!didSend) {
              queuePendingTextMessage({
                topicId,
                text: part,
                replyMessageId,
                replyMessage: state.replyMessage,
                forwardMessageIds: [forwardMessage.id],
                taggedUserIds,
                ex
              });
            }
          }
          continue;
        }

        const clientId = generateUUID();
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

        registerPendingUploadMessage(topicId, clientId, {
          replyMessageId,
          forwardMessageIds: []
        });

        const canSend = isSendAvailable();

        if (!canSend) {
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
          cancelDelayedOutgoingMessage(topicId, clientId);
          addMessageToLocal(topicId, {
            ...localMessage,
            status: MessageStatus.Wait
          });
          schedulePendingMessageAutoRetry(topicId, clientId, { reset: true });
        }
      }
      state.hideUnreadMarker = true;

      await nextTick();
      scrollToBottom();
    } catch (error: any) {
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
    const topicId = options?.topicId ?? route.value.id;
    const replyMessage = options?.replyMessage ?? state.replyMessage;
    const replyMessageId = options?.replyMessageId ?? state.replyMessage?.id;
    const replyQuoteEx = createReplyQuoteEx(replyMessage);
    const forwardMessageIds =
      options?.forwardMessageIds ??
      state.forwardMessages.map(message => message.id);

    if (!topicId) {
      console.error('[ChatSDK] Cannot attach file: no topic provided');
      return;
    }

    const clientId = generateUUID();

    const localMedia: IMedia[] = await Promise.all(
      filePayloads.map(async ({ file, isMedia }, i) => {
        const type = getMediaType(file, isMedia);
        const localPath =
          type === MediaType.Video
            ? URL.createObjectURL(file)
            : await fileToDataURL(file);
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
          uploadPercent: null
        };

        if (type === MediaType.File) {
          return {
            ...baseMedia,
            ex: {}
          };
        }

        const dimensions = await getFileDimensions(file);

        return {
          ...baseMedia,
          localThumbnailPath:
            type === MediaType.Video
              ? (await getVideoThumbnail(file)) || VIDEO_FALLBACK_THUMBNAIL
              : undefined,
          ex:
            options?.fillSharedPreview === true
              ? {
                  ...calculatePreviewDimensions(
                    dimensions,
                    filePayloads.length,
                    i
                  ),
                  fillPreview: true
                }
              : calculatePreviewDimensions(dimensions, filePayloads.length, i)
        };
      })
    );

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
      senderUserId: authUser.value.id,
      senderUser: authUser.value,
      text: options?.text || null,
      topicId,
      taggedUserIds: options?.taggedUserIds,
      media: localMedia,
      ex: createMessageEx({
        clientId,
        ...replyQuoteEx
      })
    };

    addMessageToLocal(newMessage.topicId, newMessage);
    registerPendingUploadMessage(newMessage.topicId, clientId, {
      replyMessageId,
      forwardMessageIds
    });

    filePayloads.forEach(({ file, isMedia }, index) => {
      registerPendingUploadFile(
        newMessage.topicId,
        clientId,
        index.toString(),
        {
          file,
          isMedia
        }
      );
    });

    let hasUploadError = false;
    for (const [i, payload] of filePayloads.entries()) {
      const isUploaded = await uploadMessageFile(
        newMessage.topicId,
        clientId,
        i.toString(),
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
      schedulePendingMessageAutoRetry(newMessage.topicId, clientId, {
        reset: true
      });
    } else {
      const didSend = await trySendPendingUploadMessage(
        newMessage.topicId,
        clientId,
        {
          markNotDeliveredOnFailure: false
        }
      );

      if (!didSend) {
        schedulePendingMessageAutoRetry(newMessage.topicId, clientId, {
          reset: true
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
      const payload = await getPendingUploadFile(topicId, messageId, media.id);

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
    handleAttachFile,
    handleAttachSharedFiles,
    handleRetryMessage
  };
}
