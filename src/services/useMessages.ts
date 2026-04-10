import { ref } from 'vue';
import { getChatSDK } from './useChat';
import { IMessage } from '../components/interfaces/interfaces';
import { MessageStatus, Reaction } from './useChatSDK/types';
import {
  changeUnreadMessageCount,
  updateLocalTopicReadStatus,
  setTopicTaggedMe
} from '../composables/useTopics';
import { isTopicMuted } from '../composables/useTopics';
import { useUrlWatcher } from '../composables/navigation';
import { authedUser } from '../composables/useAuth';
import {
  loadCachedTopicMessages,
  saveCachedTopicMessages
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

const route = useUrlWatcher();

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

      let combined = messages;

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
  const clientId = parsedEx?.clientId;
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
    return;
  }

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

    return;
  }

  const filtered = existingMessages.filter(m => m.id !== clientId);

  messagesStore.value[topicId] = [...filtered, nextMessage];
  schedulePersistMessages(topicId);
};

export const deleteMessageFromLocal = (
  topicId: string,
  messageId: string
): void => {
  const existingMessages = messagesStore.value[topicId] || [];
  const deletedMessage = existingMessages.find(
    message => message.id === messageId
  );
  messagesStore.value[topicId] = existingMessages.filter(
    message => message.id !== messageId
  );
  schedulePersistMessages(topicId);

  if (
    deletedMessage.senderUser?.id !== authedUser.value?.id &&
    !deletedMessage.isReadByMe
  ) {
    changeUnreadMessageCount(-1, topicId);
  }
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

  let combined = messages;

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

export const changeLocalReadStatus = (
  topicId: string,
  messageIds: string[],
  userId: string
): void => {
  const existingMessages = messagesStore.value[topicId] || [];
  const updatedMessages = existingMessages.map(message => {
    if (messageIds.includes(message.id)) {
      return {
        ...message,
        status: MessageStatus.Read,
        isRead: true,
        isReadByMe: true
      };
    }
    return message;
  });

  updateLocalTopicReadStatus(topicId, messageIds);
  messagesStore.value[topicId] = updatedMessages;
  schedulePersistMessages(topicId);

  if (userId === authedUser.value.id) {
    changeUnreadMessageCount(-messageIds.length, topicId);

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
