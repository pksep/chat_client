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
            :class="[
              'system-message-text',
              {
                'system-message-text--quoted-overflow':
                  hasQuotedSystemMessage(item.message.text) &&
                  hasQuotedSystemMessageOverflow(item.message.id)
              }
            ]"
            ref="systemMessageTextRef"
            :data-message-id="item.message.id"
            :data-is-quoted="hasQuotedSystemMessage(item.message.text)"
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
            shouldRenderGroupAvatar(item.messages[0])
          "
          :class="[
            'message-group__avatar',
            {
              'message-group__avatar--interactive': canOpenUserInfo(
                item.messages[0].senderUser
              )
            }
          ]"
          :path="item.messages[0].senderUser?.avatarUrl || ''"
          :alt="item.messages[0].senderUser?.initials || ''"
          :initials="item.messages[0].senderUser?.initials || ''"
          @click.stop="openUserInfo(item.messages[0].senderUser)"
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
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useTemplateRef,
  watch
} from 'vue';
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
import { parseUserEx } from '../../utils/parseUserEx';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import { isMessagePinnedForMe } from '../../services/useMessages';
import { isUnreadTrackableMessage } from '../../utils/messageTracking';
import { useUserInfoModal } from '../../composables/useUserInfoModal';

interface Props {
  dataTestid: string;
  messages: IMessage[];
  user?: any;
  authUserId?: string;
  hideUnreadMarker?: boolean;
  unreadMarkerMessageId?: string | null;
}

type RenderItem =
  | { kind: 'unread'; key: string; message: IMessage }
  | { kind: 'date'; key: string; message: IMessage; index: number }
  | { kind: 'system'; key: string; message: IMessage; index: number }
  | {
      kind: 'group';
      key: string;
      messages: IMessage[];
      startIndex: number;
      isMeSender: boolean;
    };

const props = defineProps<Props>();
const route = useUrlWatcher();
const { state: isMobile } = useResizeState(MAX_W_MD);
const quotedOverflowMessageIds = ref<Set<string>>(new Set());
const { openUserInfo, canOpenUserInfo } = useUserInfoModal();

defineEmits([
  'setEditMessage',
  'setReplyMessage',
  'setForwardMessage',
  'retryMessage',
  'scrollToMessage'
]);

const hasQuotedSystemMessage = (text?: string): boolean =>
  Boolean(text?.includes('\u00ab') && text.trimEnd().endsWith('\u00bb'));

const hasQuotedSystemMessageOverflow = (messageId?: string): boolean =>
  Boolean(messageId && quotedOverflowMessageIds.value.has(messageId));

const unreadMessageStartRef = useTemplateRef<HTMLDivElement[]>(
  'unreadMessageStartRef'
);
const systemMessageTextRef = useTemplateRef<HTMLSpanElement[]>(
  'systemMessageTextRef'
);
const shouldShowGroupAvatar = computed(
  () => route.value.type !== RouteTypes.DIALOGS
);

const syncQuotedSystemMessageOverflowState = (): void => {
  const nextOverflowMessageIds = new Set<string>();

  if (isMobile.value) {
    for (const element of systemMessageTextRef.value || []) {
      const messageId = element.dataset.messageId;
      const isQuoted = element.dataset.isQuoted === 'true';

      if (
        messageId &&
        isQuoted &&
        element.scrollWidth > element.clientWidth + 1
      ) {
        nextOverflowMessageIds.add(messageId);
      }
    }
  }

  quotedOverflowMessageIds.value = nextOverflowMessageIds;
};

const scheduleQuotedSystemMessageOverflowSync = async (): Promise<void> => {
  await nextTick();
  syncQuotedSystemMessageOverflowState();
};

watch(
  () => [props.messages, isMobile.value],
  () => {
    void scheduleQuotedSystemMessageOverflowSync();
  },
  { deep: true, immediate: true }
);

onMounted(() => {
  window.addEventListener('resize', syncQuotedSystemMessageOverflowState);
  void scheduleQuotedSystemMessageOverflowSync();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncQuotedSystemMessageOverflowState);
});

const isNewDate = (index: number) => {
  if (index === 0) return true;

  const currentMsg = visibleMessages.value[index];
  const prevMsg = visibleMessages.value[index - 1];
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
  if (!message || !isUnreadTrackableMessage(message)) {
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
        isMeSender: props.authUserId === message.senderUserId,
        authUserId: props.authUserId
      })
    : null;

const shouldHideMessageFromChat = (message?: IMessage): boolean => {
  if (!message?.isSystem) {
    return false;
  }

  return false;

  // const parsedEx = parseCallMessageEx(message.ex);

  // return parsedEx?.type === 'call' && parsedEx.call?.event === 'start';
};

const visibleMessages = computed(() =>
  props.messages.filter(message => !shouldHideMessageFromChat(message))
);

const resolveMessageIsMeSender = (message?: IMessage) =>
  getParsedCallMessage(message)?.isOutgoing ??
  props.authUserId === message?.senderUserId;

const shouldRenderGroupAvatar = (message?: IMessage): boolean => {
  if (!message) {
    return false;
  }

  if (!message.isSystem) {
    return true;
  }

  return getParsedCallMessage(message)?.isOutgoing === false;
};

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

  for (let index = 0; index < visibleMessages.value.length; index += 1) {
    const message = visibleMessages.value[index];

    if (shouldShowUnreadMarker(message)) {
      items.push({
        kind: 'unread',
        key: `unread-${message.id || index}`,
        message
      });
    }

    if (isNewDate(index)) {
      items.push({
        kind: 'date',
        key: `date-${message.id || index}`,
        message,
        index
      });
    }

    if (message.isSystem && !getParsedCallMessage(message)) {
      items.push({
        kind: 'system',
        key: `system-${message.id || index}`,
        message,
        index
      });
      continue;
    }

    const groupMessages = [message];
    let endIndex = index;

    while (
      endIndex + 1 < visibleMessages.value.length &&
      isSameMessageGroup(
        visibleMessages.value[endIndex],
        visibleMessages.value[endIndex + 1]
      )
    ) {
      groupMessages.push(visibleMessages.value[endIndex + 1]);
      endIndex += 1;
    }

    items.push({
      kind: 'group',
      key: `group-${groupMessages[0]?.id || index}-${groupMessages[groupMessages.length - 1]?.id || endIndex}`,
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
  senderUser: message.senderUser,
  senderRole: parseUserEx(message.senderUser?.ex)?.erpRole || '',
  avatar: message.senderUser?.avatarUrl || '',
  isRead: message.status === MessageStatus.Read,
  isEdit: message.isEdit,
  isPin: isMessagePinnedForMe(message.topicId, message.id, message.isPin),
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
  continuesWithNext: isSameMessageGroup(
    message,
    visibleMessages.value[index + 1]
  ),
  continuesFromPrevious: isSameMessageGroup(
    visibleMessages.value[index - 1],
    message
  ),
  showAvatar: false
});

defineExpose({
  unreadMessageStartRef
});
</script>

<style scoped>
.message-group__avatar--interactive {
  cursor: pointer;
}
</style>
