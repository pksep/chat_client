<template>
  <div
    class="chat__message-bubble"
    :data-testid="`${props.dataTestid}-MessageList-UserMessagesContainer`"
  >
    <template
      v-for="(item, itemIndex) in renderItems"
      :key="`${item.kind}-${itemIndex}`"
    >
      <div
        v-if="item.kind === 'unread'"
        class="chat__message-unread_messages_start"
        ref="unreadMessageStartRef"
      >
        Непрочитанные сообщения
      </div>

      <div v-else-if="item.kind === 'date'" class="top-element">
        <div
          class="date-divider"
          :data-testid="`${props.dataTestid}-MessageList-DateDividerUser${item.index + 1}`"
        >
          <span
            :data-testid="`${props.dataTestid}-MessageList-DateLabelUser${item.index + 1}`"
          >
            {{ formatDay(item.message.createdAt) }}
          </span>
        </div>
      </div>

      <div
        v-else-if="item.kind === 'system'"
        class="top-element"
        :data-message-id="item.message.id"
      >
        <div
          class="system-message"
          :data-testid="`${props.dataTestid}-MessageList-SystemMessageUser${item.index + 1}`"
        >
          <span
            class="system-message-text"
            :data-testid="`${props.dataTestid}-MessageList-SystemLabelUser${item.index + 1}`"
          >
            {{ item.message.text }}
          </span>
        </div>
      </div>

      <div
        v-else
        class="message-group"
        :class="{ 'message-group--outgoing': item.isMeSender }"
      >
        <CachedAvatar
          v-if="
            !item.isMeSender &&
            shouldShowGroupAvatar &&
            !item.messages[0].isSystem
          "
          class="message-group__avatar"
          :path="item.messages[0].senderUser?.avatarUrl || ''"
          :alt="item.messages[0].senderUser?.initials || ''"
          :initials="item.messages[0].senderUser?.initials || ''"
        />

        <div class="message-group__messages">
          <MessageBubble
            v-for="(message, groupIndex) in item.messages"
            :key="message.id"
            :class="
              messageChat(
                resolveMessageIsMeSender(message) ? 'user' : 'assistant'
              )
            "
            v-bind="getBubbleProps(message, item.startIndex + groupIndex)"
            :data-message-id="message.id"
            @toggle-selection="toggleMessage(message)"
            @unmount-edit-message-id="$emit('setEditMessage', $event)"
            @unmount-reply-message-id="$emit('setReplyMessage', $event)"
            @unmount-forward-message="$emit('setForwardMessage', $event)"
            @unmount-retry-message-id="$emit('retryMessage', $event)"
            @unmount-navigate-message-id="
              $emit('scrollToMessage', message.replyMessage)
            "
          />
        </div>
      </div>
    </template>
  </div>
</template>

<script lang="ts" setup>
import { computed, useTemplateRef } from 'vue';
import MessageBubble from './MessageBubble.vue';
import CachedAvatar from '../UI/CachedAvatar.vue';
import { formatDay, formatTime } from '../../composables/useTime';
import { MessageStatus } from '../../services/useChatSDK/types';
import type { IMessage } from '../interfaces/interfaces';
import { useUrlWatcher } from '../../composables/navigation';
import {
  isMessageSelected,
  isMessageSelectionModeForTopic,
  toggleSelectedMessage
} from '../../composables/useSelectedMessages';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { parseCallMessage } from '../../utils/parseCallMessage';

interface Props {
  dataTestid: string;
  messages: IMessage[];
  user?: any;
  authUserId?: string;
  hideUnreadMarker?: boolean;
  unreadMarkerMessageId?: string | null;
}

type RenderItem =
  | { kind: 'unread'; message: IMessage }
  | { kind: 'date'; message: IMessage; index: number }
  | { kind: 'system'; message: IMessage; index: number }
  | {
      kind: 'group';
      messages: IMessage[];
      startIndex: number;
      isMeSender: boolean;
    };

const props = defineProps<Props>();
const route = useUrlWatcher();

defineEmits([
  'setEditMessage',
  'setReplyMessage',
  'setForwardMessage',
  'retryMessage',
  'scrollToMessage'
]);

const unreadMessageStartRef = useTemplateRef<HTMLDivElement[]>(
  'unreadMessageStartRef'
);
const shouldShowGroupAvatar = computed(
  () => route.value.type !== RouteTypes.DIALOGS
);

const isNewDate = (index: number) => {
  if (index === 0) return true;

  const currentMsg = props.messages[index];
  const prevMsg = props.messages[index - 1];
  const currentDay = formatDay(currentMsg.createdAt);
  const prevDay = formatDay(prevMsg.createdAt);
  return currentDay !== prevDay;
};

const messageChat = (role: string) => [
  'message__bubble',
  { message__other: role === 'user' }
];

const isSelectionMode = (topicId?: string) =>
  isMessageSelectionModeForTopic(topicId);

const isSelected = (messageId?: string) => isMessageSelected(messageId);

const toggleMessage = (message: IMessage) => {
  if (!isSelectionMode(message.topicId)) {
    return;
  }
  toggleSelectedMessage(message.topicId, message);
};

const isUnreadForCurrentUser = (message?: IMessage): boolean => {
  if (!message || message.isSystem) {
    return false;
  }

  return (
    message.senderUserId !== props.authUserId && message.isReadByMe !== true
  );
};

const shouldShowUnreadMarker = (message: IMessage): boolean => {
  if (
    props.hideUnreadMarker ||
    !props.unreadMarkerMessageId ||
    message.isSystem ||
    message.id !== props.unreadMarkerMessageId
  ) {
    return false;
  }

  return (
    isUnreadForCurrentUser(message) ||
    message.id === props.unreadMarkerMessageId
  );
};

const getParsedCallMessage = (message?: IMessage) =>
  message
    ? parseCallMessage(message.text || '', {
        messageEx: message.ex,
        isMeSender: props.user?.id === message.senderUserId,
        authUserId: props.authUserId
      })
    : null;

const resolveMessageIsMeSender = (message?: IMessage) =>
  getParsedCallMessage(message)?.isOutgoing ??
  props.user?.id === message?.senderUserId;

const isSameMessageGroup = (
  currentMessage?: IMessage,
  nextMessage?: IMessage
): boolean => {
  if (!currentMessage || !nextMessage) {
    return false;
  }

  if (currentMessage.isSystem || nextMessage.isSystem) {
    return false;
  }

  const hasReferenceMeta = (message: IMessage) =>
    Boolean(message.forwardUser || message.replyMessage);

  if (hasReferenceMeta(currentMessage) || hasReferenceMeta(nextMessage)) {
    return false;
  }

  return (
    currentMessage.senderUserId === nextMessage.senderUserId &&
    formatDay(currentMessage.createdAt) === formatDay(nextMessage.createdAt)
  );
};

const renderItems = computed<RenderItem[]>(() => {
  const items: RenderItem[] = [];

  for (let index = 0; index < props.messages.length; index += 1) {
    const message = props.messages[index];

    if (shouldShowUnreadMarker(message)) {
      items.push({ kind: 'unread', message });
    }

    if (isNewDate(index)) {
      items.push({ kind: 'date', message, index });
    }

    if (message.isSystem && !getParsedCallMessage(message)) {
      items.push({ kind: 'system', message, index });
      continue;
    }

    const groupMessages = [message];
    let endIndex = index;

    while (
      endIndex + 1 < props.messages.length &&
      isSameMessageGroup(props.messages[endIndex], props.messages[endIndex + 1])
    ) {
      groupMessages.push(props.messages[endIndex + 1]);
      endIndex += 1;
    }

    items.push({
      kind: 'group',
      messages: groupMessages,
      startIndex: index,
      isMeSender: resolveMessageIsMeSender(message)
    });

    index = endIndex;
  }

  return items;
});

const getBubbleProps = (message: IMessage, index: number) => ({
  message: message.text || '',
  media: message.media,
  isMeSender: resolveMessageIsMeSender(message),
  time: formatTime(new Date(message.createdAt)),
  sender: message.senderUser?.initials || '',
  avatar: message.senderUser?.avatarUrl || '',
  isRead: message.status === MessageStatus.Read,
  isEdit: message.isEdit,
  isPin: message.isPin,
  messageStatus: message.status,
  messageEx: message.ex,
  authUserId: props.authUserId,
  topicId: message.topicId,
  dataTestid: `${props.dataTestid}-MessageList-MessageBubbleUser${index + 1}`,
  messageId: message.id,
  replyMessage: message.replyMessage,
  forwardUser: message.forwardUser,
  reactions: message.reactions,
  isSelectionMode: isSelectionMode(message.topicId),
  isSelected: isSelected(message.id),
  selectionTestId: `${props.dataTestid}-MessageList-SelectMessage${index + 1}`,
  continuesWithNext: isSameMessageGroup(message, props.messages[index + 1]),
  continuesFromPrevious: isSameMessageGroup(props.messages[index - 1], message),
  showAvatar: false
});

defineExpose({
  unreadMessageStartRef
});
</script>
