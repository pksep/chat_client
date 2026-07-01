<template>
  <div
    ref="listRootRef"
    class="chat__message-bubble"
    :data-testid="`${props.dataTestid}-MessageList-UserMessagesContainer`"
  >
    <div
      v-if="isVirtualized && topSpacerHeight > 0"
      class="message-list-virtual-spacer"
      :style="{ height: `${topSpacerHeight}px` }"
      aria-hidden="true"
    ></div>

    <template v-for="{ item } in windowedRenderItems" :key="item.key">
      <div
        class="message-list-virtual-item"
        :data-virtual-item-key="item.key"
        :ref="element => setVirtualItemRef(element, item.key)"
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
            :data-date-divider-label="formatDay(item.message.createdAt)"
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
              v-emoji
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
              @unmount-navigate-message-id="$emit('scrollToMessage', $event)"
            />
          </div>
        </div>
      </div>
    </template>

    <div
      v-if="isVirtualized && bottomSpacerHeight > 0"
      class="message-list-virtual-spacer"
      :style="{ height: `${bottomSpacerHeight}px` }"
      aria-hidden="true"
    ></div>
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
const listRootRef = ref<HTMLElement | null>(null);
const viewportTop = ref(0);
const viewportHeight = ref(0);
const measuredItemHeights = ref<Record<string, number>>({});
const virtualItemElements = new Map<string, HTMLElement>();
let virtualItemResizeObserver: ResizeObserver | null = null;
let viewportResizeObserver: ResizeObserver | null = null;
let scrollParent: HTMLElement | null = null;
let virtualViewportRafId = 0;

const VIRTUALIZATION_ITEM_THRESHOLD = 140;
const VIRTUAL_OVERSCAN_PX = 1800;
const VIRTUAL_DEFAULT_ITEM_HEIGHT_PX = 68;
const VIRTUAL_ITEM_GAP_PX = 5;

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
  setupVirtualWindowObservers();
  void scheduleQuotedSystemMessageOverflowSync();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncQuotedSystemMessageOverflowState);
  cleanupVirtualWindowObservers();
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

const estimateRenderItemHeight = (item: RenderItem): number => {
  if (item.kind === 'date') {
    return 34;
  }

  if (item.kind === 'unread') {
    return 38;
  }

  if (item.kind === 'system') {
    return 42;
  }

  return Math.max(
    VIRTUAL_DEFAULT_ITEM_HEIGHT_PX,
    item.messages.length * VIRTUAL_DEFAULT_ITEM_HEIGHT_PX
  );
};

const renderItemHeights = computed(() =>
  renderItems.value.map(
    item =>
      measuredItemHeights.value[item.key] || estimateRenderItemHeight(item)
  )
);

const renderItemOffsets = computed(() => {
  const offsets = [0];
  let total = 0;

  renderItemHeights.value.forEach((height, index) => {
    total += height;
    if (index < renderItemHeights.value.length - 1) {
      total += VIRTUAL_ITEM_GAP_PX;
    }
    offsets.push(total);
  });

  return offsets;
});

const totalRenderItemsHeight = computed(() => {
  const offsets = renderItemOffsets.value;
  return offsets[offsets.length - 1] || 0;
});

const isVirtualized = computed(
  () => renderItems.value.length > VIRTUALIZATION_ITEM_THRESHOLD
);

const findStartIndex = (offsets: number[], top: number): number => {
  let low = 0;
  let high = Math.max(0, offsets.length - 2);

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (offsets[mid + 1] < top) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

const findEndIndex = (offsets: number[], bottom: number): number => {
  let low = 0;
  let high = Math.max(0, offsets.length - 1);

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (offsets[mid] <= bottom) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return Math.min(offsets.length - 1, Math.max(1, low));
};

const virtualRange = computed(() => {
  if (!isVirtualized.value) {
    return {
      start: 0,
      end: renderItems.value.length
    };
  }

  const offsets = renderItemOffsets.value;
  const windowTop = Math.max(0, viewportTop.value - VIRTUAL_OVERSCAN_PX);
  const windowBottom = Math.min(
    totalRenderItemsHeight.value,
    viewportTop.value + viewportHeight.value + VIRTUAL_OVERSCAN_PX
  );
  const start = findStartIndex(offsets, windowTop);
  const end = Math.max(start + 1, findEndIndex(offsets, windowBottom));

  return {
    start,
    end: Math.min(renderItems.value.length, end)
  };
});

const windowedRenderItems = computed(() => {
  const { start, end } = virtualRange.value;
  return renderItems.value.slice(start, end).map(item => ({
    item
  }));
});

const topSpacerHeight = computed(() =>
  isVirtualized.value
    ? Math.max(
        0,
        (renderItemOffsets.value[virtualRange.value.start] || 0) -
          VIRTUAL_ITEM_GAP_PX
      )
    : 0
);

const bottomSpacerHeight = computed(() => {
  if (!isVirtualized.value) {
    return 0;
  }

  return Math.max(
    0,
    totalRenderItemsHeight.value -
      (renderItemOffsets.value[virtualRange.value.end] || 0)
  );
});

const getScrollParent = (): HTMLElement | null =>
  listRootRef.value?.parentElement || null;

const syncVirtualViewport = (): void => {
  const root = listRootRef.value;
  const parent = getScrollParent();

  if (!root || !parent) {
    viewportTop.value = 0;
    viewportHeight.value = 0;
    return;
  }

  const rootRect = root.getBoundingClientRect();
  const parentRect = parent.getBoundingClientRect();

  viewportTop.value = Math.max(
    0,
    Math.min(totalRenderItemsHeight.value, parentRect.top - rootRect.top)
  );
  viewportHeight.value = parent.clientHeight || parentRect.height;
};

const scheduleVirtualViewportSync = (): void => {
  if (virtualViewportRafId) {
    return;
  }

  virtualViewportRafId = requestAnimationFrame(() => {
    virtualViewportRafId = 0;
    syncVirtualViewport();
  });
};

const setupVirtualItemResizeObserver = (): void => {
  if (!('ResizeObserver' in window)) {
    return;
  }

  virtualItemResizeObserver = new ResizeObserver(entries => {
    let nextHeights: Record<string, number> | null = null;

    entries.forEach(entry => {
      const element = entry.target as HTMLElement;
      const key = element.dataset.virtualItemKey;
      const height = Math.round(entry.contentRect.height);

      if (!key || height <= 0) {
        return;
      }

      if (measuredItemHeights.value[key] === height) {
        return;
      }

      nextHeights ||= { ...measuredItemHeights.value };
      nextHeights[key] = height;
    });

    if (nextHeights) {
      measuredItemHeights.value = nextHeights;
      scheduleVirtualViewportSync();
    }
  });
};

const setupVirtualWindowObservers = (): void => {
  scrollParent = getScrollParent();
  setupVirtualItemResizeObserver();

  scrollParent?.addEventListener('scroll', scheduleVirtualViewportSync, {
    passive: true
  });
  window.addEventListener('resize', scheduleVirtualViewportSync);

  if ('ResizeObserver' in window && scrollParent) {
    viewportResizeObserver = new ResizeObserver(scheduleVirtualViewportSync);
    viewportResizeObserver.observe(scrollParent);
  }

  void nextTick(() => {
    syncVirtualViewport();
  });
};

const cleanupVirtualWindowObservers = (): void => {
  scrollParent?.removeEventListener('scroll', scheduleVirtualViewportSync);
  window.removeEventListener('resize', scheduleVirtualViewportSync);
  scrollParent = null;

  if (virtualViewportRafId) {
    cancelAnimationFrame(virtualViewportRafId);
    virtualViewportRafId = 0;
  }

  virtualItemResizeObserver?.disconnect();
  virtualItemResizeObserver = null;
  viewportResizeObserver?.disconnect();
  viewportResizeObserver = null;
  virtualItemElements.clear();
};

const setVirtualItemRef = (element: unknown, key: string): void => {
  const previousElement = virtualItemElements.get(key);

  if (previousElement) {
    virtualItemResizeObserver?.unobserve(previousElement);
    virtualItemElements.delete(key);
  }

  if (!(element instanceof HTMLElement)) {
    return;
  }

  virtualItemElements.set(key, element);
  virtualItemResizeObserver?.observe(element);
};

const getRenderItemIndexByMessageId = (messageId: string): number =>
  renderItems.value.findIndex(item => {
    if ('message' in item && item.message.id === messageId) {
      return true;
    }

    if (item.kind === 'group') {
      return item.messages.some(message => message.id === messageId);
    }

    return false;
  });

const ensureMessageRendered = async (messageId: string): Promise<boolean> => {
  if (!isVirtualized.value) {
    return true;
  }

  const itemIndex = getRenderItemIndexByMessageId(messageId);
  const parent = getScrollParent();

  if (itemIndex < 0 || !parent) {
    return false;
  }

  const offsets = renderItemOffsets.value;
  const itemTop = offsets[itemIndex] || 0;
  const itemHeight = renderItemHeights.value[itemIndex] || 0;
  const maxScroll = Math.max(0, parent.scrollHeight - parent.clientHeight);
  const targetTop = Math.max(
    0,
    itemTop - Math.max(0, (parent.clientHeight - itemHeight) / 2)
  );

  parent.scrollTop = targetTop - maxScroll;
  syncVirtualViewport();

  await nextTick();
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  syncVirtualViewport();

  return true;
};

watch(
  () => renderItems.value.map(item => item.key),
  keys => {
    const keySet = new Set(keys);
    const nextHeights = Object.fromEntries(
      Object.entries(measuredItemHeights.value).filter(([key]) =>
        keySet.has(key)
      )
    );

    if (
      Object.keys(nextHeights).length !==
      Object.keys(measuredItemHeights.value).length
    ) {
      measuredItemHeights.value = nextHeights;
    }

    void nextTick(() => {
      syncVirtualViewport();
    });
  },
  { immediate: true }
);

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
  unreadMessageStartRef,
  ensureMessageRendered
});
</script>

<style scoped>
.message-list-virtual-item {
  display: flow-root;
  flex: 0 0 auto;
}

.message-list-virtual-spacer {
  flex: 0 0 auto;
  min-height: 0;
  pointer-events: none;
}

.message-list-virtual-item > .top-element:has(.date-divider) {
  display: flex;
  justify-content: center;
  pointer-events: none;
  padding-bottom: 10px;
}

.message-list-virtual-item > .top-element:has(.date-divider) .date-divider {
  margin-inline: auto;
}

.message-group__avatar--interactive {
  cursor: pointer;
}

@media (max-width: 768px) {
  .message-list-virtual-item > .top-element > .date-divider {
    margin-top: 5px;
  }
}
</style>
