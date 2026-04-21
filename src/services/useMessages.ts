import { ref } from 'vue';
import { getChatSDK } from './useChat';
import { IMedia, IMessage } from '../components/interfaces/interfaces';
import { MessageStatus, Reaction } from './useChatSDK/types';
import {
  updateLocalTopicReadStatus,
  setTopicTaggedMe,
  syncTopicUnreadState,
  clearTopicReadPreview,
  useTopics
} from '../composables/useTopics';
import { isTopicMuted } from '../composables/useTopics';
import { useGroup } from '../composables/useGroup';
import { useUrlWatcher } from '../composables/navigation';
import { authedUser } from '../composables/useAuth';
import {
  loadCachedTopicMessages,
  saveCachedTopicMessages,
  savePendingUploadFile,
  loadPendingUploadFile,
  deletePendingUploadFile,
  savePendingUploadMeta,
  loadPendingUploadMeta,
  deletePendingUploadMeta
} from './useTopicMessagesCache';

const messagesStore = ref<Record<string, IMessage[]>>({});
const pinnedMessagesStore = ref<Record<string, IMessage[]>>({});
const persistTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
const pendingOutgoingForwardBatches = new Map<
  string,
  Array<{
    forwardBatchId: string;
    forwardBatchOrder: number;
  }>
>();
const pendingOutgoingForwardBatchTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
const pendingUploadFiles = new Map<
  string,
  Map<string, { file: File; isMedia: boolean }>
>();
const pendingUploadMeta = new Map<
  string,
  { replyMessageId?: string; forwardMessageIds: string[] }
>();
const delayedOutgoingMessages = new Map<
  string,
  { message: IMessage; timeoutId: ReturnType<typeof setTimeout> }
>();
const suspendedLocalOwnReadTimeouts = new Map<
  string,
  ReturnType<typeof setTimeout>
>();
const queuedLocalOwnReadIds = new Map<string, Set<string>>();

const route = useUrlWatcher();

const syncLocalLastMessage = (topicId: string, message?: IMessage): void => {
  const { updateLocalLastMessageTopic } = useTopics();
  const { updateLocalLastMessageGroup } = useGroup();

  updateLocalLastMessageTopic(topicId, message);
  updateLocalLastMessageGroup(topicId, message);
};

const schedulePersistMessages = (topicId: string): void => {
  if (!topicId) {
    return;
  }

  const existingTimeout = persistTimeouts.get(topicId);

  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const timeoutId = setTimeout(() => {
    persistTimeouts.delete(topicId);
    void saveCachedTopicMessages(topicId, messagesStore.value[topicId] || []);
  }, 150);

  persistTimeouts.set(topicId, timeoutId);
};

const schedulePendingOutgoingForwardBatchCleanup = (topicId: string): void => {
  const existingTimeout = pendingOutgoingForwardBatchTimeouts.get(topicId);

  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const timeoutId = setTimeout(() => {
    pendingOutgoingForwardBatches.delete(topicId);
    pendingOutgoingForwardBatchTimeouts.delete(topicId);
  }, 30000);

  pendingOutgoingForwardBatchTimeouts.set(topicId, timeoutId);
};

const parseMessageEx = (
  message: Pick<IMessage, 'ex'>
): Record<string, unknown> | null => {
  if (!message.ex) {
    return null;
  }

  try {
    return JSON.parse(message.ex);
  } catch {
    return null;
  }
};

const getMessageTimestamp = (message: IMessage): number => {
  return new Date(message.createdAt).getTime();
};

const compareMessages = (left: IMessage, right: IMessage): number => {
  const leftEx = parseMessageEx(left);
  const rightEx = parseMessageEx(right);
  const leftBatchId = leftEx?.forwardBatchId;
  const rightBatchId = rightEx?.forwardBatchId;

  if (
    typeof leftBatchId === 'string' &&
    leftBatchId === rightBatchId &&
    typeof leftEx?.forwardBatchOrder === 'number' &&
    typeof rightEx?.forwardBatchOrder === 'number'
  ) {
    return leftEx.forwardBatchOrder - rightEx.forwardBatchOrder;
  }

  const timeDiff = getMessageTimestamp(left) - getMessageTimestamp(right);

  if (timeDiff !== 0) {
    return timeDiff;
  }

  return 0;
};

const getPendingUploadKey = (topicId: string, messageId: string): string =>
  `${topicId}:${messageId}`;

const getDelayedOutgoingKey = (topicId: string, messageId: string): string =>
  `${topicId}:${messageId}`;

const hasClientId = (message: IMessage): boolean => {
  const parsedEx = parseMessageEx(message);
  return typeof parsedEx?.clientId === 'string' && parsedEx.clientId.length > 0;
};

const getClientId = (message: IMessage): string | null => {
  const parsedEx = parseMessageEx(message);
  return typeof parsedEx?.clientId === 'string' ? parsedEx.clientId : null;
};

const isPendingOutgoingMessage = (message: IMessage): boolean => {
  if (message.senderUserId !== authedUser.value?.id) {
    return false;
  }

  if (!hasClientId(message)) {
    return false;
  }

  return (
    message.status === MessageStatus.Wait ||
    message.status === MessageStatus.NotDelivered ||
    !!message.media?.some(media => media.uploadError || media.isLoading)
  );
};

const mergeWithPendingOutgoingMessages = (
  incomingMessages: IMessage[],
  existingMessages: IMessage[]
): IMessage[] => {
  const incomingIds = new Set(incomingMessages.map(message => message.id));
  const incomingClientIds = new Set(
    incomingMessages
      .map(message => getClientId(message))
      .filter((clientId): clientId is string => !!clientId)
  );
  const pendingMessages = existingMessages.filter(
    message =>
      isPendingOutgoingMessage(message) &&
      !incomingIds.has(message.id as string) &&
      !incomingClientIds.has(getClientId(message) || '')
  );

  return [...incomingMessages, ...pendingMessages];
};

const consumePendingOutgoingForwardBatchMeta = (
  topicId: string
): { forwardBatchId: string; forwardBatchOrder: number } | null => {
  const pendingBatch = pendingOutgoingForwardBatches.get(topicId);

  if (!pendingBatch || pendingBatch.length === 0) {
    return null;
  }

  const nextMeta = pendingBatch.shift() || null;

  if (pendingBatch.length === 0) {
    pendingOutgoingForwardBatches.delete(topicId);
    const timeoutId = pendingOutgoingForwardBatchTimeouts.get(topicId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      pendingOutgoingForwardBatchTimeouts.delete(topicId);
    }
  }

  return nextMeta;
};

export const registerPendingOutgoingForwardBatch = (
  topicId: string,
  items: Array<{
    forwardBatchId: string;
    forwardBatchOrder: number;
  }>
): void => {
  if (!topicId || items.length === 0) {
    return;
  }

  pendingOutgoingForwardBatches.set(topicId, [...items]);
  schedulePendingOutgoingForwardBatchCleanup(topicId);
};

export const fetchMessagesForTopic = async (
  topicId: string = route.value.id,
  opts?: {
    lastMessageId?: string;
    limit?: number;
    afterMessageId?: string;
    newMessages?: boolean;
    skipSave?: boolean;
  }
): Promise<IMessage[]> => {
  try {
    if (!topicId) return;
    const sdk = getChatSDK();
    if (!sdk) return;

    const messages = await sdk.getMessages(topicId, {
      limit: opts?.limit,
      lastMessageId: opts?.lastMessageId,
      afterMessageId: opts?.afterMessageId,
      newMessages: opts?.newMessages
    });

    if (!opts?.skipSave) {
      const existing = getMessagesByTopicId(topicId) || [];

      let combined = mergeWithPendingOutgoingMessages(messages, existing);

      if (opts?.lastMessageId) {
        combined = [...messages, ...existing];
      } else if (opts?.afterMessageId) {
        combined = [...existing, ...messages];
      }
      const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());

      saveMessagesToLocal(topicId, unique);
    }

    return messages;
  } catch (error) {
    console.warn('Failed to fetch message history:', error);
    return getMessagesByTopicId(topicId);
  }
};

export const fetchPinnedMessagesForTopic = async (
  topicId: string = route.value.id
): Promise<IMessage[]> => {
  try {
    if (!topicId) return;
    const sdk = getChatSDK();
    if (!sdk) return;
    const messages = await sdk.getPinnedMessages(topicId);

    savePinnedMessagesToLocal(topicId, messages);

    return messages;
  } catch (error) {
    console.warn('Failed to fetch pinned message history:', error);
    return getPinnedMessagesByTopicId(topicId);
  }
};

export const fetchAroundMessage = async (
  messageId: string,
  topicId: string = route.value.id
): Promise<IMessage[]> => {
  try {
    if (!messageId) return;
    const sdk = getChatSDK();
    if (!sdk) return;

    const messages = await sdk.getAroundMessage(messageId);
    saveMessagesToLocal(topicId, messages);

    return messages;
  } catch (error) {
    console.warn('Failed to fetch around message:', error);
    return [];
  }
};

export const addMessageToLocal = (topicId: string, message: IMessage): void => {
  const existingMessages = messagesStore.value[topicId] || [];

  const parsedEx = parseMessageEx(message);
  const clientId =
    typeof parsedEx?.clientId === 'string' ? parsedEx.clientId : null;
  const pendingOutgoingForwardBatchMeta =
    message.senderUserId === authedUser.value?.id &&
    !parsedEx?.forwardBatchId &&
    !clientId
      ? consumePendingOutgoingForwardBatchMeta(topicId)
      : null;
  const nextMessage =
    pendingOutgoingForwardBatchMeta && !clientId
      ? {
          ...message,
          ex: JSON.stringify({
            ...(parsedEx || {}),
            ...pendingOutgoingForwardBatchMeta
          })
        }
      : message;

  if (
    nextMessage.taggedUserIds?.includes(authedUser.value?.id) &&
    nextMessage.senderUserId !== authedUser.value?.id &&
    !nextMessage.isReadByMe
  ) {
    setTopicTaggedMe(topicId, true);
  }

  if (!clientId) {
    messagesStore.value[topicId] = [...existingMessages, nextMessage];
    schedulePersistMessages(topicId);
    syncTopicUnreadState(topicId);
    syncLocalLastMessage(topicId, nextMessage);
    return;
  }

  cancelDelayedOutgoingMessage(topicId, clientId);

  const lastMessage = existingMessages.at(-1);

  if (lastMessage?.id === clientId) {
    const media = existingMessages[existingMessages.length - 1].media;

    media.forEach((m, i) => {
      m.isLoading = null;
      m.path = message.media[i].path;
      m.thumbnailPath = message.media[i].thumbnailPath;
    });
    existingMessages[existingMessages.length - 1] = {
      ...nextMessage,
      media
    };
    schedulePersistMessages(topicId);
    clearPendingUploadMessage(topicId, clientId);
    syncTopicUnreadState(topicId);
    syncLocalLastMessage(
      topicId,
      existingMessages[existingMessages.length - 1]
    );

    return;
  }

  const filtered = existingMessages.filter(m => m.id !== clientId);

  messagesStore.value[topicId] = [...filtered, nextMessage];
  schedulePersistMessages(topicId);
  clearPendingUploadMessage(topicId, clientId);
  syncTopicUnreadState(topicId);
  syncLocalLastMessage(topicId, nextMessage);
};

export const scheduleDelayedOutgoingMessage = (
  topicId: string,
  message: IMessage,
  delayMs: number
): void => {
  if (!topicId || !message?.id) {
    return;
  }

  const key = getDelayedOutgoingKey(topicId, message.id);
  const existing = delayedOutgoingMessages.get(key);

  if (existing) {
    clearTimeout(existing.timeoutId);
  }

  const timeoutId = setTimeout(() => {
    delayedOutgoingMessages.delete(key);

    const alreadyExists = (messagesStore.value[topicId] || []).some(
      existingMessage => existingMessage.id === message.id
    );

    if (!alreadyExists) {
      addMessageToLocal(topicId, message);
    }
  }, delayMs);

  delayedOutgoingMessages.set(key, {
    message,
    timeoutId
  });
};

export const cancelDelayedOutgoingMessage = (
  topicId: string,
  messageId: string
): void => {
  const key = getDelayedOutgoingKey(topicId, messageId);
  const pending = delayedOutgoingMessages.get(key);

  if (!pending) {
    return;
  }

  clearTimeout(pending.timeoutId);
  delayedOutgoingMessages.delete(key);
};

export const deleteMessageFromLocal = (
  topicId: string,
  messageId: string
): void => {
  const existingMessages = messagesStore.value[topicId] || [];
  messagesStore.value[topicId] = existingMessages.filter(
    message => message.id !== messageId
  );
  schedulePersistMessages(topicId);
  syncTopicUnreadState(topicId);
  syncLocalLastMessage(topicId);

  clearPendingUploadMessage(topicId, messageId);
};

export const editMessageFromLocal = (
  topicId: string,
  message: IMessage
): void => {
  const existingMessages = messagesStore.value[topicId] || [];

  messagesStore.value[topicId] = existingMessages.map(msg => {
    let isEdit = msg.isEdit;
    if (msg.id === message.id) {
      if (message.isPin !== msg.isPin) {
        const pinnedMessages = getPinnedMessagesByTopicId(topicId);
        if (message.isPin) {
          savePinnedMessagesToLocal(topicId, [...pinnedMessages, message]);
        } else {
          savePinnedMessagesToLocal(
            topicId,
            pinnedMessages.filter(m => m.id !== message.id)
          );
        }
      } else {
        isEdit = true;
      }
      return { ...msg, text: message.text, isPin: message.isPin, isEdit };
    }
    return msg;
  });
  schedulePersistMessages(topicId);
  syncLocalLastMessage(topicId);
};

export const changeReactionFromLocal = (
  topicId: string,
  messageId: string,
  action: string,
  reaction?: Reaction,
  reactionId?: string
): void => {
  const existingMessages = messagesStore.value[topicId] || [];

  messagesStore.value[topicId] = existingMessages.map(msg => {
    if (msg.id === messageId) {
      if (action === 'removed') {
        msg.reactions = msg.reactions.filter(
          reaction => reaction.id !== reactionId
        );
      } else if (action === 'added') {
        msg.reactions = [...msg.reactions, reaction];
      } else if (action === 'updated') {
        msg.reactions = msg.reactions.map(r => {
          if (r.id !== reaction.id) {
            return r;
          }
          return reaction;
        });
      }
    }

    return msg;
  });
  schedulePersistMessages(topicId);
};

export const saveMessagesToLocal = (
  topicId: string,
  messages: IMessage[]
): void => {
  messagesStore.value[topicId] = messages;
  schedulePersistMessages(topicId);
  syncTopicUnreadState(topicId);
  syncLocalLastMessage(topicId);

  const isTagged = messages.some(
    m =>
      m.taggedUserIds?.includes(authedUser.value?.id) &&
      m.senderUserId !== authedUser.value?.id &&
      !m.isReadByMe
  );
  if (isTagged) {
    setTopicTaggedMe(topicId, true);
  }
};

export const getMessagesByTopicId = (topicId: string): IMessage[] => {
  const messages = messagesStore.value[topicId] || [];
  return [...messages].sort(compareMessages);
};

export const hydrateMessagesFromCache = async (
  topicId: string,
  userId?: string
): Promise<IMessage[]> => {
  if (!topicId) {
    return [];
  }

  if ((messagesStore.value[topicId] || []).length > 0) {
    return messagesStore.value[topicId];
  }

  const cachedMessages = await loadCachedTopicMessages(topicId, userId);

  if (cachedMessages.length > 0) {
    saveMessagesToLocal(topicId, cachedMessages);
  }

  return cachedMessages;
};

export const mergeMessagesForTopic = (
  topicId: string,
  messages: IMessage[],
  mode: 'replace' | 'prepend' | 'append' = 'replace'
): IMessage[] => {
  const existing = getMessagesByTopicId(topicId) || [];

  let combined = mergeWithPendingOutgoingMessages(messages, existing);

  if (mode === 'prepend') {
    combined = [...messages, ...existing];
  } else if (mode === 'append') {
    combined = [...existing, ...messages];
  }

  const unique = Array.from(new Map(combined.map(m => [m.id, m])).values());
  saveMessagesToLocal(topicId, unique);

  return unique;
};

export const savePinnedMessagesToLocal = (
  topicId: string,
  messages: IMessage[]
): void => {
  pinnedMessagesStore.value[topicId] = messages;
};

export const getPinnedMessagesByTopicId = (topicId: string): IMessage[] => {
  return pinnedMessagesStore.value[topicId] || [];
};

export const getGroupMessageWithPinned = (
  topicId: string,
  messages: IMessage[]
): void => {
  pinnedMessagesStore.value[topicId] = messages;
};

const applyLocalReadStatus = (
  topicId: string,
  messageIds: string[],
  userId: string
): void => {
  const existingMessages = messagesStore.value[topicId] || [];
  const isReadByCurrentUser = userId === authedUser.value.id;
  const updatedMessages = existingMessages.map(message => {
    if (messageIds.includes(message.id)) {
      return {
        ...message,
        status: MessageStatus.Read,
        isRead: true,
        isReadByMe: isReadByCurrentUser ? true : message.isReadByMe
      };
    }
    return message;
  });

  updateLocalTopicReadStatus(topicId, messageIds);
  messagesStore.value[topicId] = updatedMessages;
  schedulePersistMessages(topicId);
  clearTopicReadPreview(topicId, messageIds);
  syncTopicUnreadState(topicId);

  if (userId === authedUser.value.id) {
    // Re-evaluate taggedMe status for the topic
    const hasUnreadMentions = updatedMessages.some(
      m =>
        m.taggedUserIds?.includes(authedUser.value?.id) &&
        m.senderUserId !== authedUser.value?.id &&
        !m.isReadByMe &&
        !messageIds.includes(m.id)
    );
    if (!hasUnreadMentions) {
      setTopicTaggedMe(topicId, false);
    }
  }
};

export const flushDeferredLocalOwnReadStatus = (topicId: string): void => {
  const queuedIds = Array.from(queuedLocalOwnReadIds.get(topicId) || []);

  if (!queuedIds.length || !authedUser.value?.id) {
    queuedLocalOwnReadIds.delete(topicId);
    return;
  }

  queuedLocalOwnReadIds.delete(topicId);
  applyLocalReadStatus(topicId, queuedIds, authedUser.value.id);
};

export const suspendLocalOwnReadStatus = (
  topicId: string,
  durationMs: number
): void => {
  if (!topicId) {
    return;
  }

  const existingTimeout = suspendedLocalOwnReadTimeouts.get(topicId);

  if (existingTimeout) {
    clearTimeout(existingTimeout);
  }

  const timeoutId = setTimeout(
    () => {
      suspendedLocalOwnReadTimeouts.delete(topicId);
      flushDeferredLocalOwnReadStatus(topicId);
    },
    Math.max(0, durationMs)
  );

  suspendedLocalOwnReadTimeouts.set(topicId, timeoutId);
};

const isLocalOwnReadStatusSuspended = (topicId: string): boolean =>
  suspendedLocalOwnReadTimeouts.has(topicId);

export const changeLocalReadStatus = (
  topicId: string,
  messageIds: string[],
  userId: string
): void => {
  const isReadByCurrentUser = userId === authedUser.value?.id;

  if (isReadByCurrentUser && isLocalOwnReadStatusSuspended(topicId)) {
    const existingIds = queuedLocalOwnReadIds.get(topicId) || new Set<string>();
    messageIds.forEach(id => existingIds.add(id));
    queuedLocalOwnReadIds.set(topicId, existingIds);
    return;
  }

  applyLocalReadStatus(topicId, messageIds, userId);
};

export const changeFileLoadingStatus = (
  topicId: string,
  messageId: string,
  fileId: string
): void => {
  const existingMessages = messagesStore.value[topicId] || [];
  messagesStore.value[topicId] = existingMessages.map(message => {
    if (message.id !== messageId || !message.media) {
      return message;
    }

    return {
      ...message,
      media: message.media.map(media => {
        if (media.id !== fileId) {
          return media;
        }

        return {
          ...media,
          isLoading: false,
          uploadPercent: null
        };
      })
    };
  });

  schedulePersistMessages(topicId);
};

export const changeMessageStatusLocally = (
  topicId: string,
  messageId: string,
  status: MessageStatus
): void => {
  const existingMessages = messagesStore.value[topicId] || [];

  messagesStore.value[topicId] = existingMessages.map(message =>
    message.id === messageId ? { ...message, status } : message
  );

  schedulePersistMessages(topicId);
};

export const setFileUploadPendingStatus = (
  topicId: string,
  messageId: string,
  fileId: string
): void => {
  const existingMessages = messagesStore.value[topicId] || [];

  messagesStore.value[topicId] = existingMessages.map(message => {
    if (message.id !== messageId || !message.media) {
      return message;
    }

    return {
      ...message,
      media: message.media.map(media => {
        if (media.id !== fileId) {
          return media;
        }

        return {
          ...media,
          isLoading: true,
          uploadError: false,
          uploadPercent: null
        };
      })
    };
  });

  schedulePersistMessages(topicId);
};

export const changeFileUploadPercent = (
  topicId: string,
  messageId: string,
  fileId: string,
  percent: number | null
): void => {
  const existingMessages = messagesStore.value[topicId] || [];
  messagesStore.value[topicId] = existingMessages.map(message => {
    if (message.id !== messageId || !message.media) {
      return message;
    }

    return {
      ...message,
      media: message.media.map(media => {
        if (media.id !== fileId) {
          return media;
        }

        return {
          ...media,
          uploadPercent: percent
        };
      })
    };
  });

  schedulePersistMessages(topicId);
};

export const setUploadedFileData = (
  topicId: string,
  messageId: string,
  fileId: string,
  payload: Pick<
    IMedia,
    'path' | 'thumbnailPath' | 'originName' | 'size' | 'type' | 'ex'
  >
): void => {
  const existingMessages = messagesStore.value[topicId] || [];

  messagesStore.value[topicId] = existingMessages.map(message => {
    if (message.id !== messageId || !message.media) {
      return message;
    }

    return {
      ...message,
      media: message.media.map(media => {
        if (media.id !== fileId) {
          return media;
        }

        return {
          ...media,
          ...payload,
          isLoading: false,
          uploadError: false,
          uploadPercent: null
        };
      })
    };
  });

  schedulePersistMessages(topicId);
};

export const changeFileUploadErrorStatus = (
  topicId: string,
  messageId: string,
  fileId: string,
  uploadError: boolean
): void => {
  const existingMessages = messagesStore.value[topicId] || [];

  messagesStore.value[topicId] = existingMessages.map(message => {
    if (message.id !== messageId || !message.media) {
      return message;
    }

    return {
      ...message,
      media: message.media.map(media => {
        if (media.id !== fileId) {
          return media;
        }

        return {
          ...media,
          isLoading: false,
          uploadError,
          uploadPercent: null
        };
      })
    };
  });

  schedulePersistMessages(topicId);
};

export const deleteFileAfterLoading = (
  topicId: string,
  messageId: string,
  fileId: string
): void => {
  const existingMessages = messagesStore.value[topicId] || [];
  const message = existingMessages.find(message => message.id === messageId);
  if (!message?.media) {
    return;
  }

  message.media = message.media.filter(media => media.id !== fileId);
  schedulePersistMessages(topicId);
};

export const registerPendingUploadMessage = (
  topicId: string,
  messageId: string,
  meta: { replyMessageId?: string; forwardMessageIds?: string[] }
): void => {
  pendingUploadMeta.set(getPendingUploadKey(topicId, messageId), {
    replyMessageId: meta.replyMessageId,
    forwardMessageIds: meta.forwardMessageIds || []
  });
  void savePendingUploadMeta({
    topicId,
    messageId,
    replyMessageId: meta.replyMessageId,
    forwardMessageIds: meta.forwardMessageIds || []
  });
};

export const getPendingUploadMessageMeta = (
  topicId: string,
  messageId: string
): Promise<{ replyMessageId?: string; forwardMessageIds: string[] } | null> => {
  const key = getPendingUploadKey(topicId, messageId);
  const cached = pendingUploadMeta.get(key);

  if (cached) {
    return Promise.resolve(cached);
  }

  return loadPendingUploadMeta(topicId, messageId).then(meta => {
    if (meta) {
      pendingUploadMeta.set(key, meta);
    }

    return meta;
  });
};

export const registerPendingUploadFile = (
  topicId: string,
  messageId: string,
  fileId: string,
  payload: { file: File; isMedia: boolean }
): void => {
  const key = getPendingUploadKey(topicId, messageId);
  const messageFiles = pendingUploadFiles.get(key) || new Map();

  messageFiles.set(fileId, payload);
  pendingUploadFiles.set(key, messageFiles);
  void savePendingUploadFile({
    topicId,
    messageId,
    fileId,
    file: payload.file,
    isMedia: payload.isMedia
  });
};

export const getPendingUploadFile = (
  topicId: string,
  messageId: string,
  fileId: string
): Promise<{ file: File; isMedia: boolean } | null> => {
  const key = getPendingUploadKey(topicId, messageId);
  const cached = pendingUploadFiles.get(key)?.get(fileId) || null;

  if (cached) {
    return Promise.resolve(cached);
  }

  return loadPendingUploadFile(topicId, messageId, fileId).then(file => {
    if (!file) {
      return null;
    }

    const messageFiles = pendingUploadFiles.get(key) || new Map();
    messageFiles.set(fileId, file);
    pendingUploadFiles.set(key, messageFiles);

    return file;
  });
};

export const clearPendingUploadMessage = (
  topicId: string,
  messageId: string
): void => {
  const key = getPendingUploadKey(topicId, messageId);
  const messageFiles = pendingUploadFiles.get(key);

  if (messageFiles) {
    Array.from(messageFiles.keys()).forEach(fileId => {
      void deletePendingUploadFile(topicId, messageId, fileId);
    });
  }

  pendingUploadFiles.delete(key);
  pendingUploadMeta.delete(key);
  void deletePendingUploadMeta(topicId, messageId);
};

export const playNotificationSound = (topicId?: string): void => {
  const isHidden = document.hidden;

  if (topicId && isTopicMuted(topicId)) {
    return;
  }

  if (!isHidden && route.value.id === topicId) {
    return;
  }

  try {
    const audio = new Audio();
    audio.src = '/audio/new-message.mp3';
    audio.preload = 'auto';

    audio.addEventListener(
      'canplaythrough',
      () => {
        audio.play().catch(err => {
          console.warn('Failed to play notification sound:', err.message);
        });
      },
      { once: true }
    );

    audio.addEventListener(
      'error',
      e => {
        console.warn('Notification sound failed to load:', e);

        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification('New Message', {
            silent: false,
            requireInteraction: false
          });
        }
      },
      { once: true }
    );

    audio.load();
  } catch (err) {
    console.warn('Audio not supported in this browser');
  }
};
