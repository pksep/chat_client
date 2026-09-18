<template>
  <div
    ref="listRootRef"
    class="chat__message-bubble"
    :data-testid="`${props.dataTestid}-MessageList-UserMessagesContainer`"
  >
    <slot name="before" />

    <div
      v-for="item in renderItems"
      :key="item.key"
      v-memo="getRenderItemMemo(item)"
      class="message-list-render-item"
      :data-render-item-key="item.key"
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
          :data-date-divider-label="getCachedMessageDay(item.message)"
          :data-testid="`${props.dataTestid}-MessageList-DateDividerUser${item.index + 1}`"
        >
          <span
            :data-testid="`${props.dataTestid}-MessageList-DateLabelUser${item.index + 1}`"
          >
            {{ getCachedMessageDay(item.message) }}
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
        <div
          v-if="shouldReserveGroupAvatarForItem(item)"
          :class="[
            'message-group__avatar-slot',
            {
              'message-group__avatar-slot--sticky':
                shouldRenderGroupAvatarForItem(item)
            }
          ]"
          :aria-hidden="!shouldRenderGroupAvatarForItem(item) || undefined"
        >
          <CachedAvatar
            v-if="shouldRenderGroupAvatarForItem(item)"
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
            :defer-offscreen="isMobile"
            @click.stop="openUserInfo(item.messages[0].senderUser)"
          />
        </div>

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

    <slot name="after" />
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
import { TopicType } from '../../services/useChatSDK/types';
import type {
  IMessage,
  IMessageViewportSnapshot
} from '../interfaces/interfaces';
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
import { getPinnedMessagesByTopicId } from '../../services/useMessages';
import { isUnreadTrackableMessage } from '../../utils/messageTracking';
import { useUserInfoModal } from '../../composables/useUserInfoModal';
import { getSelectedTopic } from '../../composables/useTopics';
import { isCallTopic, isCallTopicDefaultMessage } from '../../utils/call-topic';
import {
  getLatestReadOutgoingMessageIndex,
  shouldDisplayMessageAsRead
} from '../../utils/messageReadStatus';
import {
  managerMessageChannel,
  type ManagerMessageChannel
} from '../../utils/managerMessageChannel';
import { useManagerInquiries } from '../../composables/useManagerInquiries';
import { channelLabel } from '../../composables/useManagerRoutes';

interface Props {
  dataTestid: string;
  messages: IMessage[];
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

interface VisibleMessageCandidate {
  index: number;
  messageId: string;
  relativeTop: number;
  height: number;
  visiblePixels: number;
}

interface IndexedMessageElement {
  element: HTMLElement;
  messageId: string;
}

const props = defineProps<Props>();
const messageElementIdentity = computed(() =>
  props.messages.map(message => message.id).join('\u001f')
);
const systemMessageLayoutIdentity = computed(() =>
  props.messages
    .filter(message => message.isSystem)
    .map(message => `${message.id}:${message.text || ''}`)
    .join('\u001f')
);
const route = useUrlWatcher();
const { state: isMobile } = useResizeState(MAX_W_MD);
const quotedOverflowMessageIds = ref<Set<string>>(new Set());
const { openUserInfo, canOpenUserInfo } = useUserInfoModal();
const { byTopic: managerInquiriesByTopic } = useManagerInquiries();
const listRootRef = ref<HTMLElement | null>(null);
const messageElementsById = new Map<string, HTMLElement>();
let indexedMessageElements: IndexedMessageElement[] = [];
let messageElementsSyncRafId = 0;
let contentReadyRafId = 0;
let contentReadyToken = 0;

const MAX_MESSAGES_PER_RENDER_GROUP = 15;
const FORMAT_CACHE_LIMIT = 2000;

const formattedTimeCache = new Map<number, string>();
const formattedDayCache = new Map<number, string>();
const parsedCallMessageCache = new WeakMap<
  IMessage,
  {
    authUserId?: string;
    value: ReturnType<typeof parseCallMessage>;
  }
>();

const rememberCachedFormat = (
  cache: Map<number, string>,
  timestamp: number,
  value: string
): string => {
  if (cache.size >= FORMAT_CACHE_LIMIT && !cache.has(timestamp)) {
    const oldestKey = cache.keys().next().value;

    if (typeof oldestKey === 'number') {
      cache.delete(oldestKey);
    }
  }

  cache.set(timestamp, value);
  return value;
};

const getMessageTimestamp = (message?: Pick<IMessage, 'createdAt'>): number => {
  const createdAt = message?.createdAt;
  const timestamp =
    createdAt instanceof Date
      ? createdAt.getTime()
      : new Date(createdAt || 0).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const getCachedMessageTime = (message: IMessage): string => {
  const timestamp = getMessageTimestamp(message);
  const cached = formattedTimeCache.get(timestamp);

  if (cached !== undefined) {
    return cached;
  }

  return rememberCachedFormat(
    formattedTimeCache,
    timestamp,
    formatTime(new Date(timestamp))
  );
};

const getCachedMessageDay = (message: Pick<IMessage, 'createdAt'>): string => {
  const timestamp = getMessageTimestamp(message);
  const cached = formattedDayCache.get(timestamp);

  if (cached !== undefined) {
    return cached;
  }

  return rememberCachedFormat(
    formattedDayCache,
    timestamp,
    formatDay(new Date(timestamp))
  );
};

const emit = defineEmits([
  'setEditMessage',
  'setReplyMessage',
  'setForwardMessage',
  'retryMessage',
  'scrollToMessage',
  'contentReady'
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
const isDialogMessage = (message?: IMessage): boolean => {
  if (!message?.topicId) {
    return route.value.type === RouteTypes.DIALOGS;
  }

  const topic = getSelectedTopic(message.topicId);
  return topic
    ? topic.type === TopicType.DM
    : message.topicId === route.value.id &&
        route.value.type === RouteTypes.DIALOGS;
};

const isCallTopicMessage = (message?: IMessage): boolean => {
  if (!message?.topicId) {
    return route.value.type === RouteTypes.CALL;
  }

  const topic = getSelectedTopic(message.topicId);
  return topic
    ? isCallTopic(topic)
    : message.topicId === route.value.id &&
        route.value.type === RouteTypes.CALL;
};

const isDialogStyleMessage = (message?: IMessage): boolean =>
  isDialogMessage(message) || isCallTopicMessage(message);

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

const cancelContentReadyEmit = (): void => {
  contentReadyToken += 1;

  if (contentReadyRafId) {
    cancelAnimationFrame(contentReadyRafId);
    contentReadyRafId = 0;
  }
};

const scheduleContentReadyEmit = async (): Promise<void> => {
  const token = ++contentReadyToken;

  if (contentReadyRafId) {
    cancelAnimationFrame(contentReadyRafId);
    contentReadyRafId = 0;
  }

  if (!visibleMessages.value.length || !renderItems.value.length) {
    return;
  }

  await nextTick();

  if (token !== contentReadyToken) {
    return;
  }

  contentReadyRafId = requestAnimationFrame(() => {
    contentReadyRafId = 0;

    if (
      token !== contentReadyToken ||
      !visibleMessages.value.length ||
      !listRootRef.value?.querySelector('[data-render-item-key]')
    ) {
      return;
    }

    emit('contentReady', {
      topicId: visibleMessages.value[0]?.topicId || route.value.id,
      messageCount: visibleMessages.value.length
    });
  });
};

watch(
  [systemMessageLayoutIdentity, isMobile],
  () => {
    void scheduleQuotedSystemMessageOverflowSync();
  },
  { immediate: true }
);

onMounted(() => {
  window.addEventListener('resize', syncQuotedSystemMessageOverflowState);
  void scheduleQuotedSystemMessageOverflowSync();
  void scheduleMessageElementsSync();
  void scheduleContentReadyEmit();
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', syncQuotedSystemMessageOverflowState);
  cancelContentReadyEmit();
  cleanupMessageElementObserver();
  invalidateVisibleMessageSnapshot();
});

const isNewDate = (index: number) => {
  if (index === 0) return true;

  const currentMsg = visibleMessages.value[index];
  const prevMsg = visibleMessages.value[index - 1];
  const currentDay = getCachedMessageDay(currentMsg);
  const prevDay = getCachedMessageDay(prevMsg);
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

const getParsedCallMessage = (message?: IMessage) => {
  if (!message) {
    return null;
  }

  const cached = parsedCallMessageCache.get(message);
  if (cached?.authUserId === props.authUserId) {
    return cached.value;
  }

  const value = parseCallMessage(message.text || '', {
    messageEx: message.ex,
    isMeSender: props.authUserId === message.senderUserId,
    authUserId: props.authUserId
  });

  parsedCallMessageCache.set(message, {
    authUserId: props.authUserId,
    value
  });
  return value;
};

const visibleMessages = computed(() => props.messages);
const pinnedMessageIdsByTopic = computed(() => {
  const topicIds = new Set(
    visibleMessages.value.map(message => message.topicId).filter(Boolean)
  );
  const pinnedIds = new Map<string, Set<string>>();

  topicIds.forEach(topicId => {
    pinnedIds.set(
      topicId,
      new Set(getPinnedMessagesByTopicId(topicId).map(message => message.id))
    );
  });

  return pinnedIds;
});

const isMessagePinned = (message: IMessage): boolean =>
  Boolean(message.isPin) ||
  Boolean(pinnedMessageIdsByTopic.value.get(message.topicId)?.has(message.id));

const resolveMessageIsMeSender = (message?: IMessage) =>
  isCallTopicDefaultMessage(message)
    ? false
    : getParsedCallMessage(message)?.isOutgoing ??
      props.authUserId === message?.senderUserId;

const latestReadOutgoingMessageIndex = computed(() =>
  getLatestReadOutgoingMessageIndex(
    visibleMessages.value,
    resolveMessageIsMeSender
  )
);

const getRenderItemMemo = (item: RenderItem): unknown[] => {
  const memo: unknown[] = [item.kind, props.authUserId, isMobile.value];

  if (item.kind !== 'group') {
    memo.push(item.message);
    return memo;
  }

  memo.push(latestReadOutgoingMessageIndex.value);

  item.messages.forEach(message => {
    memo.push(
      message,
      isDialogStyleMessage(message),
      isMessagePinned(message),
      isSelectionMode(message.topicId),
      isSelected(message.id)
    );
  });

  return memo;
};

const shouldRenderGroupAvatar = (message?: IMessage): boolean => {
  if (!message) {
    return false;
  }

  if (isCallTopicDefaultMessage(message)) {
    return false;
  }

  if (!message.isSystem) {
    return true;
  }

  return getParsedCallMessage(message)?.isOutgoing === false;
};

const shouldRenderGroupAvatarForItem = (
  item: Extract<RenderItem, { kind: 'group' }>
): boolean => shouldReserveGroupAvatarForItem(item);

const shouldReserveGroupAvatarForItem = (
  item: Extract<RenderItem, { kind: 'group' }>
): boolean => {
  const firstMessage = item.messages[0];

  return (
    !item.isMeSender &&
    !isDialogStyleMessage(firstMessage) &&
    shouldRenderGroupAvatar(firstMessage)
  );
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

  if (
    isCallTopicDefaultMessage(currentMessage) ||
    isCallTopicDefaultMessage(nextMessage)
  ) {
    return false;
  }

  const hasReferenceMeta = (message: IMessage) =>
    Boolean(message.forwardUser || message.replyMessage);

  if (hasReferenceMeta(currentMessage) || hasReferenceMeta(nextMessage)) {
    return false;
  }

  if (
    managerMessageChannel(currentMessage.ex) !==
    managerMessageChannel(nextMessage.ex)
  ) {
    return false;
  }

  return (
    currentMessage.senderUserId === nextMessage.senderUserId &&
    getCachedMessageDay(currentMessage) === getCachedMessageDay(nextMessage)
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
      groupMessages.length < MAX_MESSAGES_PER_RENDER_GROUP &&
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

watch(
  [
    () => route.value.id,
    () => visibleMessages.value.length,
    () => renderItems.value.length
  ],
  () => {
    void scheduleContentReadyEmit();
  },
  { immediate: true }
);

const getScrollParent = (): HTMLElement | null =>
  listRootRef.value?.parentElement || null;

const messageIndexById = computed(
  () =>
    new Map(
      visibleMessages.value
        .map((message, index) => [message.id, index] as const)
        .filter(([messageId]) => !!messageId)
    )
);
let cachedVisibleMessageSnapshot: IMessageViewportSnapshot | null | undefined;
let visibleMessageSnapshotRafId = 0;

const invalidateVisibleMessageSnapshot = (): void => {
  cachedVisibleMessageSnapshot = undefined;

  if (visibleMessageSnapshotRafId) {
    cancelAnimationFrame(visibleMessageSnapshotRafId);
    visibleMessageSnapshotRafId = 0;
  }
};

const cleanupMessageElementObserver = (): void => {
  if (messageElementsSyncRafId) {
    cancelAnimationFrame(messageElementsSyncRafId);
    messageElementsSyncRafId = 0;
  }

  messageElementsById.clear();
  indexedMessageElements = [];
};

const syncMessageElements = (): void => {
  const root = listRootRef.value;
  if (!root) {
    cleanupMessageElementObserver();
    return;
  }
  const nextMessageElementsById = new Map<string, HTMLElement>();

  root.querySelectorAll<HTMLElement>('[data-message-id]').forEach(element => {
    const messageId = element.dataset.messageId;

    if (!messageId) {
      return;
    }

    if (!nextMessageElementsById.has(messageId)) {
      nextMessageElementsById.set(messageId, element);
    }
  });

  messageElementsById.clear();
  nextMessageElementsById.forEach((element, messageId) => {
    messageElementsById.set(messageId, element);
  });
  indexedMessageElements = visibleMessages.value
    .map(message => {
      const element = messageElementsById.get(message.id);

      return element
        ? {
            element,
            messageId: message.id
          }
        : null;
    })
    .filter(
      (entry): entry is IndexedMessageElement =>
        !!entry && root.contains(entry.element)
    );
};

const scheduleMessageElementsSync = async (): Promise<void> => {
  await nextTick();

  if (messageElementsSyncRafId) {
    return;
  }

  messageElementsSyncRafId = requestAnimationFrame(() => {
    messageElementsSyncRafId = 0;
    syncMessageElements();
  });
};

const getVisibleMessageCandidates = (): VisibleMessageCandidate[] => {
  const root = listRootRef.value;
  const parent = getScrollParent();

  if (!root || !parent) {
    return [];
  }

  const parentRect = parent.getBoundingClientRect();
  const currentMessageIndexById = messageIndexById.value;
  let low = 0;
  let high = indexedMessageElements.length - 1;
  let firstPotentiallyVisibleIndex = indexedMessageElements.length;

  // Message positions are monotonic. A binary search avoids the old fast-fling
  // fallback that synchronously measured every rendered message in one frame.
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const rect = indexedMessageElements[middle].element.getBoundingClientRect();

    if (rect.bottom > parentRect.top) {
      firstPotentiallyVisibleIndex = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }

  const candidates: VisibleMessageCandidate[] = [];

  for (
    let position = Math.max(0, firstPotentiallyVisibleIndex - 1);
    position < indexedMessageElements.length;
    position += 1
  ) {
    const { element, messageId } = indexedMessageElements[position];
    const index = currentMessageIndexById.get(messageId);

    if (index === undefined || !root.contains(element)) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (rect.top >= parentRect.bottom) {
      break;
    }

    const visibleTop = Math.max(rect.top, parentRect.top);
    const visibleBottom = Math.min(rect.bottom, parentRect.bottom);
    const visiblePixels = visibleBottom - visibleTop;

    if (
      visiblePixels <= 0 ||
      rect.right <= parentRect.left ||
      rect.left >= parentRect.right
    ) {
      continue;
    }

    candidates.push({
      index,
      messageId,
      relativeTop: rect.top - parentRect.top,
      height: rect.height,
      visiblePixels
    });
  }

  return candidates.sort((left, right) => left.index - right.index);
};

const getVisibleMessageSnapshot = (): IMessageViewportSnapshot | null => {
  if (cachedVisibleMessageSnapshot !== undefined) {
    return cachedVisibleMessageSnapshot;
  }

  const candidates = getVisibleMessageCandidates();

  if (candidates.length === 0) {
    cachedVisibleMessageSnapshot = null;
  } else {
    const anchor =
      candidates
        .filter(candidate => candidate.relativeTop >= -candidate.height * 0.75)
        .sort(
          (left, right) =>
            Math.abs(left.relativeTop) - Math.abs(right.relativeTop)
        )[0] || candidates[0];

    cachedVisibleMessageSnapshot = {
      anchorMessageId: anchor.messageId,
      anchorRelativeTop: anchor.relativeTop,
      firstVisibleIndex: candidates[0].index,
      lastVisibleIndex: candidates[candidates.length - 1].index,
      visibleMessageIds: candidates.map(candidate => candidate.messageId)
    };
  }

  visibleMessageSnapshotRafId = requestAnimationFrame(() => {
    visibleMessageSnapshotRafId = 0;
    cachedVisibleMessageSnapshot = undefined;
  });

  return cachedVisibleMessageSnapshot;
};

const getRenderedMessageElementsInIndexRange = (
  startIndex: number,
  endIndex: number
): HTMLElement[] => {
  const root = listRootRef.value;

  if (!root || endIndex < startIndex) {
    return [];
  }

  return visibleMessages.value
    .slice(startIndex, endIndex + 1)
    .map(message => messageElementsById.get(message.id))
    .filter(
      (element): element is HTMLElement => !!element && root.contains(element)
    );
};

const ensureMessageRendered = (messageId: string): Promise<boolean> =>
  Promise.resolve(messageIndexById.value.has(messageId));

const getMessageSenderRole = (message: IMessage): string => {
  if (isCallTopicDefaultMessage(message)) {
    return '';
  }

  const inquiry = managerInquiriesByTopic.value.get(message.topicId);
  const channel: ManagerMessageChannel | '' =
    inquiry?.guest_user_id === message.senderUserId
      ? managerMessageChannel(message.ex)
      : '';

  return channel
    ? channelLabel(channel)
    : parseUserEx(message.senderUser?.ex)?.erpRole || '';
};

watch(
  messageElementIdentity,
  () => {
    invalidateVisibleMessageSnapshot();
    void scheduleMessageElementsSync();
  },
  { flush: 'sync' }
);

const getBubbleProps = (message: IMessage, index: number) => ({
  message: message.text || '',
  media: message.media,
  isMeSender: resolveMessageIsMeSender(message),
  isDialog: isDialogStyleMessage(message),
  isMobile: isMobile.value,
  parsedCallMessage: getParsedCallMessage(message),
  time: getCachedMessageTime(message),
  sender: isCallTopicDefaultMessage(message)
    ? ''
    : message.senderUser?.initials || '',
  senderUser: isCallTopicDefaultMessage(message)
    ? undefined
    : message.senderUser,
  senderRole: getMessageSenderRole(message),
  avatar: isCallTopicDefaultMessage(message)
    ? ''
    : message.senderUser?.avatarUrl || '',
  isRead: shouldDisplayMessageAsRead(
    message,
    index,
    latestReadOutgoingMessageIndex.value,
    resolveMessageIsMeSender
  ),
  isEdit: message.isEdit,
  isPin: isMessagePinned(message),
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
  ensureMessageRendered,
  getVisibleMessageSnapshot,
  getRenderedMessageElementsInIndexRange
});
</script>

<style scoped>
.message-list-render-item {
  display: flow-root;
  flex: 0 0 auto;
  contain: layout style;
}

.message-list-render-item > .top-element:has(.date-divider) {
  display: flex;
  justify-content: center;
  pointer-events: none;
  padding-bottom: 10px;
}

.message-list-render-item > .top-element:has(.date-divider) .date-divider {
  margin-inline: auto;
}

.message-group__avatar--interactive {
  cursor: pointer;
}

@media (max-width: 768px) {
  .message-list-render-item > .top-element > .date-divider {
    margin-top: 5px;
  }
}
</style>
