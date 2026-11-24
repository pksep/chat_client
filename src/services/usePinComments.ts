import { computed, watch } from 'vue';
import { authedUser } from '../composables/useAuth';
import {
  getChatSDK,
  getHasBrowserNetwork,
  getHasWebsocketConnection
} from './useChat';
import { getConfig } from './useConfig';
import { createPinComments } from './pin-comments';
import { loadPinComments, savePinComments } from './pin-comments-cache';
import {
  editMessageFromLocal,
  fetchPinnedMessagesForTopic,
  getClientMessageById,
  getPinnedMessagesByTopicId,
  isDeletedMessageForTopic,
  savePinnedMessagesToLocal
} from './useMessages';
import type { IMessage } from '../components/interfaces/interfaces';

export const pinComments = createPinComments({
  session: () => {
    const ownerId = authedUser.value?.id;
    const sdk = getChatSDK();
    return ownerId && sdk
      ? {
          ownerId,
          key: `${getConfig().CHAT_API_DOMAIN}:${ownerId}`,
          generation: sdk
        }
      : null;
  },
  authorName: () => authedUser.value?.initials || '',
  isDeleted: (topicId, messageId) =>
    isDeletedMessageForTopic(topicId, { id: messageId, topicId } as IMessage),
  resolveMessage: async (topicId, messageId) => {
    const messages = await getChatSDK().getAroundMessage(messageId);
    return messages.find(
      message => message.id === messageId && message.topicId === topicId
    ) as IMessage | undefined;
  },
  load: loadPinComments,
  save: savePinComments,
  list: topicId => getChatSDK().getPinComments(topicId),
  send: (topicId, command) =>
    getChatSDK().sendPinCommentCommand(topicId, command),
  message: (topicId, messageId) => {
    const original = getClientMessageById(topicId, messageId);
    const pinned = getPinnedMessagesByTopicId(topicId).find(
      message => message.id === messageId
    );
    return pinned ? { ...original, ...pinned } : original;
  },
  applyMessage: message => {
    const original = getClientMessageById(message.topicId, message.id);
    if (
      original &&
      new Date(original.updatedAt).getTime() >
        new Date(message.updatedAt).getTime()
    ) {
      message = {
        ...message,
        ...original,
        isPin: message.isPin,
        isPinnedForAll: message.isPinnedForAll,
        isPinnedForMe: message.isPinnedForMe,
        isPinnedOnlyMe: message.isPinnedOnlyMe
      };
    }
    editMessageFromLocal(message.topicId, message);
    const existing = getPinnedMessagesByTopicId(message.topicId).filter(
      value => value.id !== message.id
    );
    savePinnedMessagesToLocal(
      message.topicId,
      message.isPin || message.isPinnedForMe ? [...existing, message] : existing
    );
  },
  refreshPins: topicId => fetchPinnedMessagesForTopic(topicId),
  connected: () => getHasBrowserNetwork() && !!getChatSDK()
});

watch(
  () => authedUser.value?.id,
  () => pinComments.reset(),
  { flush: 'sync' }
);

export const usePinComments = (getTopicId: () => string, load = true) => {
  const state = computed(() => {
    // Подписка на владельца не позволяет удержать ref предыдущего аккаунта.
    void authedUser.value?.id;
    void pinComments.sessionVersion.value;
    return pinComments.state(getTopicId()).value;
  });
  if (load)
    watch(
      [
        getTopicId,
        () => authedUser.value?.id,
        () => pinComments.sessionVersion.value
      ],
      ([topicId]) => {
        if (topicId)
          void pinComments
            .hydrate(topicId)
            .then(() => pinComments.refresh(topicId))
            .then(() => pinComments.flush(topicId));
      },
      { immediate: true }
    );
  if (load)
    watch(
      () => getHasWebsocketConnection(),
      connected => {
        if (connected && getTopicId())
          void pinComments
            .refresh(getTopicId())
            .then(() => pinComments.flush(getTopicId()));
      }
    );
  return { state, pinComments };
};
