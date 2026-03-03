<template>
  <div
    class="chat__message-bubble"
    :data-testid="`${props.dataTestid}-MessageList-UserMessagesContainer`"
  >
    <template v-for="(message, index) in props.messages" :key="message.id">
      <div
        class="chat__message-unread_messages_start"
        ref="unreadMessageStartRef"
        v-if="
          !props.hideUnreadMarker &&
          !!props.messages[index - 1] &&
          !message.isSystem &&
          !props.messages[index - 1].isSystem &&
          message.senderUserId !== props.authUserId &&
          !message.isReadByMe &&
          props.messages[index - 1].isReadByMe
        "
      >
        Непрочитанные сообщения
      </div>
      <div
        :key="message.id"
        class="top-element"
        v-if="isNewDate(index) || message.isSystem"
        :data-message-id="isNewDate(index) ? null : message.id"
      >
        <div
          v-if="isNewDate(index)"
          class="date-divider"
          :data-testid="`${props.dataTestid}-MessageList-DateDividerUser${index + 1}`"
        >
          <span
            :data-testid="`${props.dataTestid}-MessageList-DateLabelUser${index + 1}`"
          >
            {{ formatDay(message.createdAt) }}
          </span>
        </div>

        <div
          v-if="message.isSystem"
          class="system-message"
          :data-testid="`${props.dataTestid}-MessageList-SystemMessageUser${index + 1}`"
        >
          <span
            class="system-message-text"
            :data-testid="`${props.dataTestid}-MessageList-SystemLabelUser${index + 1}`"
          >
            {{ message.text }}
          </span>
        </div>
      </div>

      <MessageBubble
        :key="message.id"
        v-if="!message.isSystem"
        :class="
          messageChat(
            props.user?.id === message.senderUserId ? 'user' : 'assistant'
          )
        "
        v-bind="getBubbleProps(message, index)"
        :data-message-id="message.id"
        @unmount-edit-message-id="$emit('setEditMessage', $event)"
        @unmount-reply-message-id="$emit('setReplyMessage', $event)"
        @unmount-forward-message="$emit('setForwardMessage', $event)"
        @unmount-navigate-message-id="
          $emit('scrollToMessage', message.replyMessage)
        "
      />
    </template>
  </div>
</template>

<script lang="ts" setup>
import { useTemplateRef } from 'vue';
import MessageBubble from './MessageBubble.vue';
import { formatDay, formatTime } from '../../composables/useTime';
import { MessageStatus } from '../../services/useChatSDK/types';
import type { IMessage } from '../interfaces/interfaces';

interface Props {
  dataTestid: string;
  messages: IMessage[];
  user?: any;
  authUserId?: string;
  hideUnreadMarker?: boolean;
}

const props = defineProps<Props>();

defineEmits([
  'setEditMessage',
  'setReplyMessage',
  'setForwardMessage',
  'scrollToMessage'
]);

const unreadMessageStartRef = useTemplateRef<HTMLDivElement[]>(
  'unreadMessageStartRef'
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

const getBubbleProps = (message: IMessage, index: number) => ({
  message: message.text || '',
  media: message.media,
  isMeSender: props.user?.id === message.senderUserId,
  time: formatTime(new Date(message.createdAt)),
  sender: message.senderUser?.initials || '',
  avatar: message.senderUser?.avatarUrl || '',
  isRead: message.status === MessageStatus.Read,
  isEdit: message.isEdit,
  isPin: message.isPin,
  messageStatus: message.status,
  topicId: message.topicId,
  dataTestid: `${props.dataTestid}-MessageList-MessageBubbleUser${index + 1}`,
  messageId: message.id,
  replyMessage: message.replyMessage,
  forwardUser: message.forwardUser,
  reactions: message.reactions
});

defineExpose({
  unreadMessageStartRef
});
</script>
