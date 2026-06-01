<template>
  <div
    class="chat__message-wrapper"
    ref="chatWrapperRef"
    v-if="isAiRoute"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
    :data-testid="`${props.dataTestid}-MessageList-AIMessagesWrapper`"
  >
    <MessageListAIItems
      :messages="state.aiMessages"
      :data-testid="props.dataTestid"
    />
  </div>

  <div
    class="chat__message-wrapper"
    v-if="state.messages.length && !isAiRoute"
    ref="chatWrapperRef"
    @vue:mounted="scrollToBottom"
    @scroll="handleScroll"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
    :data-testid="`${props.dataTestid}-MessageList-UserMessagesWrapper`"
  >
    <MessageListUserItems
      ref="messageListUserItemsRef"
      :messages="state.messages"
      :user="props.user"
      :auth-user-id="authUser?.id"
      :hide-unread-marker="state.hideUnreadMarker"
      :unread-marker-message-id="state.unreadMarkerMessageId"
      :data-testid="props.dataTestid"
      @set-edit-message="handleSetEditMessage"
      @set-reply-message="handleSetReplyMessage"
      @set-forward-message="handleSetForwardMessage"
      @retry-message="handleRetryMessage"
      @scroll-to-message="handleScrollToMessage"
    />
    <section
      v-if="props.showUpdateBanner"
      class="chat-update-banner"
      :data-testid="`${props.dataTestid}-MessageList-UpdateBanner`"
    >
      <svg
        class="chat-update-banner__download-icon"
        width="44"
        height="44"
        viewBox="0 0 44 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="44" height="44" rx="22" fill="#77A6FF" />
        <path
          d="M30 25L30 28.3333C30 28.7754 29.8127 29.1993 29.4793 29.5118C29.1459 29.8244 28.6937 30 28.2222 30L15.7778 30C15.3063 30 14.8541 29.8244 14.5207 29.5118C14.1873 29.1993 14 28.7754 14 28.3333L14 25"
          stroke="white"
          stroke-width="1.375"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M17.8346 19.832L22.0013 23.9987L26.168 19.832"
          stroke="white"
          stroke-width="1.375"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M22 24L22 14"
          stroke="white"
          stroke-width="1.375"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>

      <div class="chat-update-banner__content">
        <p class="chat-update-banner__title">
          Доступна новая версия <span>приложения</span>
        </p>
        <p class="chat-update-banner__description">
          Обновите приложение, чтобы получить новые функции и улучшения
        </p>
      </div>
      <Button
        class="chat-update-banner__action"
        :data-testid="`${props.dataTestid}-MessageList-UpdateBannerInstallButton`"
        :disabled="props.isUpdateActionDisabled"
        @click="props.onUpdateClick?.()"
      >
        {{ props.updateActionLabel }}
      </Button>
      <button
        type="button"
        class="chat-update-banner__close"
        :data-testid="`${props.dataTestid}-MessageList-UpdateBannerCloseButton`"
        aria-label="Закрыть уведомление об обновлении"
        @click="props.onDismissUpdateBanner?.()"
      >
        <Icon :name="IconNameEnum.crossLarge" />
      </button>
    </section>
    <div
      class="chat__message-bubble__arrow-down"
      v-if="isShowScrollToBottomButton"
      @click="handleScrollToButton"
    >
      <Icon :name="IconNameEnum.arrowDown" />
      <span
        v-if="
          visibleTopicUnreadCount > 0 &&
          activeTopic?.lastMessage?.senderUserId !== authUser?.id
        "
        :class="{
          'contact-list__notification': true,
          'contact-list__notification--muted': activeTopic?.info?.isMute
        }"
      >
        {{ visibleTopicUnreadCount }}
      </span>
    </div>
  </div>

  <SelectedMessagesContent
    v-if="isSelectionMode"
    :data-testid="`${props.dataTestid}-SelectedMessages`"
  />
  <MessageListInput
    v-if="!isDefaultRoute && !isSelectionMode"
    :key="`${route.type}:${route.id || 'default'}`"
    v-model="inputText"
    ref="messageListInputRef"
    :edit-message="state.editMessage"
    :reply-message="state.replyMessage"
    :forward-messages="state.forwardMessages"
    :data-testid="props.dataTestid"
    @send="handleSend"
    @attach-file="handleAttachFile"
    @clear-edit="handleSetEditMessage(null)"
    @clear-reply="handleSetReplyMessage(null)"
    @clear-forward="handleSetForwardMessage(null)"
    @scroll-to-message="handleScrollToMessage"
  />

  <PushNotification
    v-if="!!state.errorMessage"
    class="mobile-auth-container__error"
    title="Ошибка"
    :push-key="Math.random()"
    :description="state.errorMessage"
    :type="MessageTypeEnum.error"
    @close="() => (state.errorMessage = '')"
  />
</template>

<script lang="ts" setup>
import {
  ref,
  reactive,
  watch,
  useTemplateRef,
  nextTick,
  onUnmounted,
  onMounted,
  computed
} from 'vue';
import MessageListAIItems from './Messages/MessageListAIItems.vue';
import MessageListUserItems from './Messages/MessageListUserItems.vue';
import MessageListInput from './Messages/MessageListInput.vue';
import {
  MessageTypeEnum,
  PushNotification,
  Icon,
  IconNameEnum,
  Button
} from '@pksep/yui';
import type { IMessageListProps } from './interfaces/message-list';
import type { AIMessage } from '../types/messages';
import { useUrlWatcher } from '../composables/navigation';
import {
  navigateToDefault,
  RouteTypes
} from '../composables/navigation/useUrlRouting';
import {
  getSelectedTopic,
  resetTopicUnreadState
} from '../composables/useTopics';
import {
  clearSelectedMessages,
  isMessageSelectionModeForTopic
} from '../composables/useSelectedMessages';
import {
  fetchAroundMessage,
  fetchMessagesForTopic,
  fetchPinnedMessagesForTopic,
  getFullMessagesByTopicId,
  getMessagesByTopicId,
  hydrateMessageContextFromShadow,
  hydrateMessagesFromCache,
  mergeMessagesForTopic,
  suppressNotificationSoundForTopic,
  suspendLocalOwnReadStatus
} from '../services/useMessages';
import { setSuspendIncomingMergeForTopic } from '../services/useChat';
import { getAuthUser } from '../composables/useAuth';
import { IMessage } from './interfaces/interfaces';

import { useMessageSwipe } from './Messages/composables/useMessageSwipe';
import { useMessageScroll } from './Messages/composables/useMessageScroll';
import { useMessageSender } from './Messages/composables/useMessageSender';
import { useMessageMastra } from './Messages/composables/useMessageMastra';
import { useMessageActions } from './Messages/composables/useMessageActions';
import { Capacitor } from '@capacitor/core';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_MD } from '../utils/constants';
import SelectedMessagesContent from './Header/SelectedMessagesContent.vue';
import {
  consumePendingForwardMessages,
  usePendingForwardMessages
} from '../composables/useForwardMessages';
import { ensureMediaObjectUrl } from '../services/useMediaBlobCache';
import { isGroupCallInviteUrl } from '../utils/groupCallInviteUrl';
import { getTopicUnreadBadgeCount } from '../utils/topicUnreadBadge';
import { isUnreadTrackableMessage } from '../utils/messageTracking';

export interface IMessageListExtendedProps extends IMessageListProps {
  dataTestid?: string;
}

const props = withDefaults(defineProps<IMessageListExtendedProps>(), {
  dataTestid: 'MessageList'
});
const TOPIC_SWITCH_AUTO_READ_GRACE_MS = 1200;
const TOPIC_SWITCH_HISTORY_FETCH_GRACE_MS = 1200;
const TOPIC_SWITCH_MEDIA_PREWARM_LIMIT = 12;

const chatWrapperRef = useTemplateRef('chatWrapperRef');
const messageListUserItemsRef = useTemplateRef<any>('messageListUserItemsRef');
const messageListInputRef = useTemplateRef<any>('messageListInputRef');

const route = useUrlWatcher();
const { state: isMobile } = useResizeState(MAX_W_MD);

const { onTouchStart, onTouchEnd } = useMessageSwipe(route);

const getLocalStorageInputText = computed(() => {
  const inputsJson = JSON.parse(localStorage.getItem('inputs') || '{}');
  return inputsJson[route.value.id] || '';
});

const inputText = ref(getLocalStorageInputText.value);
let chatVisibilityObserver: ResizeObserver | null = null;
const unreadMarkerMessageIdsByTopic = reactive<Record<string, string | null>>(
  {}
);
const seenUnreadMarkerStateByTopic = reactive<
  Record<string, { markerId: string; unreadCount: number }>
>({});
const { pendingForwardMessages, pendingForwardTopicId } =
  usePendingForwardMessages();

const isAiRoute = computed(() => route.value?.type === RouteTypes.AI);
const isDefaultRoute = computed(() => route.value?.type === RouteTypes.DEFAULT);
const authUser = computed(() => getAuthUser());
const isSelectionMode = computed(() =>
  isMessageSelectionModeForTopic(route.value.id)
);
const activeTopic = computed(() =>
  route.value.id ? getSelectedTopic(route.value.id) : null
);
const topicUnreadCount = computed(() =>
  getTopicUnreadBadgeCount(activeTopic.value || undefined, authUser.value?.id)
);
const isViewingBottom = computed(
  () =>
    !!route.value?.id &&
    route.value.type !== RouteTypes.AI &&
    scrollAnchor.viewportMode.value === 'live'
);
const canClearlyShowUnreadCount = computed(
  () =>
    !!route.value?.id &&
    route.value.type !== RouteTypes.AI &&
    !!chatWrapperRef.value &&
    scrollAnchor.viewportMode.value !== 'live'
);
const visibleTopicUnreadCount = computed(() =>
  canClearlyShowUnreadCount.value ? topicUnreadCount.value : 0
);
const renderedTopicId = ref(route.value.id || '');
let activeTopicSwitchToken = 0;

const state = reactive({
  messages: computed(() => getMessagesByTopicId(renderedTopicId.value)),
  chatId: null as string | null,
  isLoadingMore: false,
  aiMessages: [] as AIMessage[],
  editMessage: null as IMessage | null,
  replyMessage: null as IMessage | null,
  forwardMessages: [] as IMessage[],
  errorMessage: '',
  hideUnreadMarker: false,
  unreadMarkerMessageId: null as string | null
});

const {
  isShowScrollToBottomButton,
  isLoadingInitialMessages,
  scrollState,
  handleScroll: handleMessageScroll,
  scrollToBottom,
  handleScrollToButton,
  setupIntersectionObserver,
  flushVisibleUnreadMessages,
  markAllVisibleAsRead,
  intersectionObserver,
  scrollMarkReadTimeout,
  resetScrollState,
  suspendAutoRead,
  suspendHistoryFetch,
  setReadReceiptsEnabled,
  scrollAnchor
} = useMessageScroll(
  chatWrapperRef,
  messageListUserItemsRef,
  route,
  state,
  props
);

const {
  mastraResult,
  initializeMastra,
  handleMastraMounted,
  handleMastraUnmounted,
  clearAiMessages
} = useMessageMastra(route, state, props);

initializeMastra();

watch([() => state.chatId, () => props.baseUrl], () => {
  initializeMastra();
});

const {
  clearSellectedMessage,
  handleSetEditMessage,
  handleSetReplyMessage,
  handleSetForwardMessage
} = useMessageActions(state, inputText, messageListInputRef);

const applyPendingForwardMessages = () => {
  if (
    !route.value?.id ||
    pendingForwardTopicId.value !== route.value.id ||
    pendingForwardMessages.value.length === 0
  ) {
    return;
  }

  state.replyMessage = null;
  state.editMessage = null;
  state.forwardMessages = consumePendingForwardMessages(route.value.id);
  nextTick(() => {
    messageListInputRef.value?.focus();
  });
};

const warmVisibleTopicMedia = async (topicId: string) => {
  const visibleMessages = getMessagesByTopicId(topicId);
  const mediaPaths = new Set<string>();

  for (const message of visibleMessages) {
    for (const media of message.media || []) {
      const preferredPath = media.thumbnailPath || media.path;

      if (!preferredPath || mediaPaths.has(preferredPath)) {
        continue;
      }

      mediaPaths.add(preferredPath);

      if (mediaPaths.size >= TOPIC_SWITCH_MEDIA_PREWARM_LIMIT) {
        break;
      }
    }

    if (mediaPaths.size >= TOPIC_SWITCH_MEDIA_PREWARM_LIMIT) {
      break;
    }
  }

  if (mediaPaths.size === 0) {
    return;
  }

  await Promise.allSettled(
    [...mediaPaths].map(path => ensureMediaObjectUrl(path))
  );
};

const refreshUnreadMarkerState = () => {
  if (!route.value?.id) {
    state.unreadMarkerMessageId = null;
    state.hideUnreadMarker = true;
    return;
  }

  const firstUnreadMessageId = getFirstUnreadMessageId();
  const unreadCount = getCurrentTopicUnreadCount();
  const seenState = seenUnreadMarkerStateByTopic[route.value.id];

  if (
    firstUnreadMessageId &&
    seenState &&
    seenState.markerId === firstUnreadMessageId &&
    unreadCount <= seenState.unreadCount
  ) {
    state.unreadMarkerMessageId = null;
    state.hideUnreadMarker = true;
    return;
  }

  if (
    state.unreadMarkerMessageId &&
    firstUnreadMessageId &&
    state.unreadMarkerMessageId !== firstUnreadMessageId &&
    unreadCount > 0
  ) {
    state.hideUnreadMarker = false;
    return;
  }

  unreadMarkerMessageIdsByTopic[route.value.id] = firstUnreadMessageId;
  state.unreadMarkerMessageId = firstUnreadMessageId;
  state.hideUnreadMarker = !firstUnreadMessageId;
};

const applyUnreadMarkerStateForTopic = (topicId: string) => {
  const markerMessageId = unreadMarkerMessageIdsByTopic[topicId] || null;

  state.unreadMarkerMessageId = markerMessageId;
  state.hideUnreadMarker = !markerMessageId;
};

const handleWindowFocusRefresh = () => {
  refreshUnreadMarkerState();
};

const handleVisibilityChangeRefresh = () => {
  if (document.visibilityState === 'visible') {
    refreshUnreadMarkerState();
  }
};

const hydrateMessageContextFromMemory = async (
  topicId: string,
  messageId: string
): Promise<IMessage[]> => {
  const fullMessages = getFullMessagesByTopicId(topicId);

  if (!fullMessages.length) {
    return [];
  }

  const targetIndex = fullMessages.findIndex(
    message => message.id === messageId
  );

  if (targetIndex < 0) {
    return [];
  }

  const beforeLimit = 40;
  const afterLimit = 40;
  const startIndex = Math.max(0, targetIndex - beforeLimit);
  const endIndex = Math.min(fullMessages.length, targetIndex + afterLimit + 1);
  const contextMessages = fullMessages.slice(startIndex, endIndex);

  scrollAnchor.prepareJumpMutation();
  mergeMessagesForTopic(topicId, contextMessages, 'replace', {
    syncLastMessage: false,
    windowMode: 'around-anchor',
    anchorMessageId: messageId
  });

  await nextTick();
  return contextMessages;
};

const handleScrollToMessage = async (message: IMessage) => {
  if (message.topicId !== route.value.id) return;

  const messageId = message.id;
  const didJump = await scrollAnchor.jumpToMessage(messageId, {
    block: 'center',
    behavior: 'smooth',
    highlightClassName: 'highlighted',
    highlightDurationMs: 1400
  });

  if (didJump) {
    return;
  }

  const memoryMessages = await hydrateMessageContextFromMemory(
    route.value.id,
    messageId
  );

  if (memoryMessages.some(m => m.id === messageId)) {
    const didMemoryJump = await scrollAnchor.jumpToMessage(messageId, {
      block: 'center',
      behavior: 'smooth',
      highlightClassName: 'highlighted',
      highlightDurationMs: 1400
    });

    if (didMemoryJump) {
      return;
    }
  }

  scrollAnchor.prepareJumpMutation();
  const shadowMessages = await hydrateMessageContextFromShadow(
    route.value.id,
    messageId,
    authUser.value?.id
  );

  if (shadowMessages.some(m => m.id === messageId)) {
    await nextTick();
    const didShadowJump = await scrollAnchor.jumpToMessage(messageId, {
      block: 'center',
      behavior: 'smooth',
      highlightClassName: 'highlighted',
      highlightDurationMs: 1400
    });

    if (didShadowJump) {
      return;
    }
  }

  resetScrollState();
  scrollAnchor.prepareJumpMutation();
  const messages = await fetchAroundMessage(messageId);

  if (!messages.some(m => m.id === messageId)) {
    return;
  }

  await nextTick();
  await scrollAnchor.jumpToMessage(messageId, {
    block: 'center',
    behavior: 'smooth',
    highlightClassName: 'highlighted',
    highlightDurationMs: 1400
  });
};

const shouldResetUnreadForCurrentTopic = (): boolean => {
  const lastMessage = state.messages.at(-1);
  const currentUserId = authUser.value?.id;
  const topicUnreadCount = route.value?.id
    ? getTopicUnreadBadgeCount(
        getSelectedTopic(route.value.id),
        authUser.value?.id
      )
    : 0;

  if (topicUnreadCount > 0) {
    return false;
  }

  if (!lastMessage || !currentUserId) {
    return true;
  }

  if (lastMessage.senderUserId === currentUserId) {
    return true;
  }

  return !!lastMessage.isReadByMe;
};

const getFirstUnreadMessageId = (): string | null => {
  const currentUserId = authUser.value?.id;

  if (!currentUserId) {
    return null;
  }

  const firstUnreadMessage = state.messages.find(
    message =>
      isUnreadTrackableMessage(message) &&
      message.senderUserId !== currentUserId &&
      message.isReadByMe !== true
  );

  return firstUnreadMessage?.id || null;
};

const getCurrentTopicUnreadCount = (): number => {
  return visibleTopicUnreadCount.value || 0;
};

const rememberCurrentUnreadMarkerState = (topicId: string) => {
  if (!state.unreadMarkerMessageId) {
    return;
  }

  seenUnreadMarkerStateByTopic[topicId] = {
    markerId: state.unreadMarkerMessageId,
    unreadCount: getCurrentTopicUnreadCount()
  };
};

const hideUnreadMarkerIfPassed = (): void => {
  if (
    !route.value?.id ||
    !state.unreadMarkerMessageId ||
    state.hideUnreadMarker ||
    !chatWrapperRef.value
  ) {
    return;
  }

  const markerElement = chatWrapperRef.value.querySelector(
    `[data-message-id="${state.unreadMarkerMessageId}"]`
  );

  if (!(markerElement instanceof HTMLElement)) {
    return;
  }

  const containerRect = chatWrapperRef.value.getBoundingClientRect();
  const markerRect = markerElement.getBoundingClientRect();

  if (markerRect.bottom <= containerRect.top + 8) {
    rememberCurrentUnreadMarkerState(route.value.id);
    state.hideUnreadMarker = true;
  }
};

const resetUnreadIfViewingBottom = (): void => {
  if (!route.value?.id || !chatWrapperRef.value) {
    return;
  }

  if (!isViewingBottom.value) {
    return;
  }

  if (topicUnreadCount.value > 0) {
    resetTopicUnreadState(route.value.id);
    void markAllVisibleAsRead();
  }

  unreadMarkerMessageIdsByTopic[route.value.id] = null;
  delete seenUnreadMarkerStateByTopic[route.value.id];
  state.unreadMarkerMessageId = null;
  state.hideUnreadMarker = true;
};

const syncVisibleUnreadAfterAutoScroll = (): void => {
  if (!route.value?.id || route.value?.type === RouteTypes.AI) {
    return;
  }

  nextTick(() => {
    requestAnimationFrame(() => {
      flushVisibleUnreadMessages();
      resetUnreadIfViewingBottom();
    });
  });
};

const handleScroll = async (): Promise<void> => {
  await handleMessageScroll();
  hideUnreadMarkerIfPassed();
  resetUnreadIfViewingBottom();
};

const { handleSend, handleAttachFile, handleRetryMessage } = useMessageSender(
  route,
  inputText,
  state,
  authUser,
  mastraResult,
  scrollToBottom,
  clearSellectedMessage
);

onMounted(async () => {
  handleMastraMounted();

  if (props.contact?.id) {
    state.isLoadingMore = false;
    isLoadingInitialMessages.value = true;

    await nextTick();
    requestAnimationFrame(() => {
      if (chatWrapperRef?.value) {
        scrollState.shouldAutoScroll = true;
        scrollState.isInitialLoad = true;
        setupIntersectionObserver();
      }
    });
  }

  if ('ResizeObserver' in window) {
    chatVisibilityObserver = new ResizeObserver(() => {
      syncVisibleUnreadAfterAutoScroll();
    });

    nextTick(() => {
      if (chatWrapperRef.value) {
        chatVisibilityObserver?.observe(chatWrapperRef.value);
      }
    });
  }
});

onUnmounted(() => {
  if (scrollMarkReadTimeout) {
    clearTimeout(scrollMarkReadTimeout);
  }
  if (intersectionObserver) {
    intersectionObserver.disconnect();
  }
  if (chatVisibilityObserver) {
    chatVisibilityObserver.disconnect();
    chatVisibilityObserver = null;
  }
  handleMastraUnmounted();
});

watch(
  () => chatWrapperRef.value,
  wrapper => {
    if (!chatVisibilityObserver || !wrapper) {
      return;
    }

    chatVisibilityObserver.disconnect();
    chatVisibilityObserver.observe(wrapper);
    syncVisibleUnreadAfterAutoScroll();
  }
);

watch(
  [() => route.value?.id, () => route.value?.type],
  async ([topicId]) => {
    if (!topicId) return;
    const topicSwitchToken = ++activeTopicSwitchToken;
    const isStaleTopicSwitch = () =>
      topicSwitchToken !== activeTopicSwitchToken ||
      route.value?.id !== topicId;
    suppressNotificationSoundForTopic(topicId, TOPIC_SWITCH_AUTO_READ_GRACE_MS);
    state.hideUnreadMarker = true;
    state.unreadMarkerMessageId = null;
    isLoadingInitialMessages.value = true;
    resetScrollState();
    setReadReceiptsEnabled(false);
    suspendAutoRead(TOPIC_SWITCH_AUTO_READ_GRACE_MS);
    suspendLocalOwnReadStatus(topicId, TOPIC_SWITCH_AUTO_READ_GRACE_MS);
    suspendHistoryFetch(TOPIC_SWITCH_HISTORY_FETCH_GRACE_MS);
    applyUnreadMarkerStateForTopic(topicId);

    const topicUnreadCount = getTopicUnreadBadgeCount(
      getSelectedTopic(topicId),
      authUser.value?.id
    );
    const initialMessagesLimit = Math.max(100, topicUnreadCount + 20);

    state.replyMessage = null;
    state.editMessage = null;
    state.forwardMessages = [];

    clearSelectedMessages();

    const existingVisibleMessages = getMessagesByTopicId(topicId);
    const existingFullMessages = getFullMessagesByTopicId(topicId);
    const hasInstantCachedMessages =
      existingVisibleMessages.length > 0 || existingFullMessages.length > 0;

    renderedTopicId.value = hasInstantCachedMessages ? topicId : '';

    const hydratedMessages = await hydrateMessagesFromCache(topicId);

    if (isStaleTopicSwitch()) {
      return;
    }

    if (
      hydratedMessages.length > 0 ||
      getMessagesByTopicId(topicId).length > 0
    ) {
      await warmVisibleTopicMedia(topicId);

      if (isStaleTopicSwitch()) {
        return;
      }

      renderedTopicId.value = topicId;
      await nextTick();

      if (isStaleTopicSwitch()) {
        return;
      }

      scrollToBottom({
        preferUnreadMarker: false,
        smooth: false
      });
    }

    void fetchPinnedMessagesForTopic(topicId);
    void fetchMessagesForTopic(topicId, {
      limit: initialMessagesLimit,
      forceRefresh: true,
      forceNetwork: navigator.onLine
    });
    renderedTopicId.value = topicId;
    await nextTick();

    if (isStaleTopicSwitch()) {
      return;
    }

    refreshUnreadMarkerState();

    if (state.unreadMarkerMessageId) {
      suspendAutoRead(TOPIC_SWITCH_AUTO_READ_GRACE_MS);
      suspendLocalOwnReadStatus(topicId, TOPIC_SWITCH_AUTO_READ_GRACE_MS);
    }

    if (shouldResetUnreadForCurrentTopic()) {
      resetTopicUnreadState(topicId);
      unreadMarkerMessageIdsByTopic[topicId] = null;
      delete seenUnreadMarkerStateByTopic[topicId];
      applyUnreadMarkerStateForTopic(topicId);
    }

    const consumedForwardMessages = consumePendingForwardMessages(topicId);

    if (consumedForwardMessages.length > 0) {
      state.forwardMessages = consumedForwardMessages;
    }

    inputText.value = getLocalStorageInputText.value;

    await nextTick();

    if (isStaleTopicSwitch()) {
      return;
    }

    scrollToBottom({
      preferUnreadMarker: false,
      smooth: false
    });
    scrollAnchor.initialize();
    isLoadingInitialMessages.value = false;
    rememberCurrentUnreadMarkerState(topicId);
    setReadReceiptsEnabled(true);
    setupIntersectionObserver();
    syncVisibleUnreadAfterAutoScroll();
  },
  { immediate: true }
);

watch(
  [
    () => route.value?.id,
    () => route.value?.type,
    () => scrollAnchor.viewportMode.value
  ],
  ([topicId, routeType, viewportMode], [previousTopicId]) => {
    if (previousTopicId && previousTopicId !== topicId) {
      setSuspendIncomingMergeForTopic(previousTopicId, false);
    }

    if (!topicId || routeType === RouteTypes.AI) {
      return;
    }

    setSuspendIncomingMergeForTopic(topicId, viewportMode !== 'live');
  },
  { immediate: true }
);

watch(
  [() => route.value.id, pendingForwardTopicId, pendingForwardMessages],
  () => {
    applyPendingForwardMessages();
  },
  { deep: true }
);

const updateLocalStorageInputText = () => {
  const inputsJson = JSON.parse(localStorage.getItem('inputs') || '{}');
  if (inputsJson) {
    inputsJson[route.value.id] = inputText.value;
  }

  localStorage.setItem('inputs', JSON.stringify(inputsJson));
};

const isEditableElement = (element: EventTarget | null) => {
  if (!(element instanceof HTMLElement)) return false;

  return Boolean(
    element.closest('input, textarea, select') ||
      element.isContentEditable ||
      element.closest('[contenteditable="true"]')
  );
};

const isEditableEventTarget = (e: Event) => {
  return e.composedPath().some(target => isEditableElement(target));
};

const focusMessageInput = () => {
  messageListInputRef.value?.focus();
};

const insertTextToMessageInput = (text: string) => {
  messageListInputRef.value?.insertText?.(text);
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const tryBuildAnchor = (value: string) => {
  const trimmedValue = value.trim();

  if (!trimmedValue) return null;

  try {
    const url = new URL(trimmedValue);

    if (!['http:', 'https:'].includes(url.protocol)) {
      return null;
    }

    const safeUrl = escapeHtml(url.toString());
    const safeText = escapeHtml(trimmedValue);
    const linkAttributes = isGroupCallInviteUrl(url)
      ? ''
      : ' target="_blank" rel="noopener noreferrer"';

    return `<a href="${safeUrl}"${linkAttributes}>${safeText}</a> `;
  } catch {
    return null;
  }
};

const pasteTextToMessageInput = async () => {
  const clipboardText = await navigator.clipboard.readText();

  if (!clipboardText) return;

  const anchorHtml = tryBuildAnchor(clipboardText);

  insertTextToMessageInput(anchorHtml);
};

const handleWindowKeydown = async (e: KeyboardEvent) => {
  const hasModifierKey = e.ctrlKey || e.metaKey || e.altKey;
  const shortcutCode = e.code.toLowerCase();
  const isModifierShortcut = e.ctrlKey || e.metaKey;
  const isPasteShortcut =
    isModifierShortcut &&
    (shortcutCode === 'keyv' || e.key.toLowerCase() === 'v');
  const isPrintableKey = e.key.length === 1 && !hasModifierKey;
  const shouldFocusMessageInput =
    !Capacitor.isNativePlatform() &&
    !isSelectionMode.value &&
    (!hasModifierKey || isPasteShortcut) &&
    !isEditableEventTarget(e);

  if (shouldFocusMessageInput) {
    if (isPrintableKey || isPasteShortcut) {
      e.preventDefault();
    }

    focusMessageInput();

    if (isPrintableKey) {
      insertTextToMessageInput(e.key);
    }

    if (isPasteShortcut) {
      try {
        await pasteTextToMessageInput();
      } catch (error) {
        console.error('Failed to paste into message input:', error);
      }
    }
  }

  if (e.key === 'Escape' && isSelectionMode.value) {
    clearSelectedMessages();
    return;
  }

  if (e.key === 'Escape') {
    navigateToDefault();
  }
};

onMounted(() => {
  if (!isMobile.value) {
    focusMessageInput();
  }

  window.addEventListener('keydown', handleWindowKeydown, true);
  window.addEventListener('focus', handleWindowFocusRefresh);
  document.addEventListener('visibilitychange', handleVisibilityChangeRefresh);
});

onUnmounted(() => {
  if (route.value?.id) {
    setSuspendIncomingMergeForTopic(route.value.id, false);
  }

  window.removeEventListener('keydown', handleWindowKeydown, true);
  window.removeEventListener('focus', handleWindowFocusRefresh);
  document.removeEventListener(
    'visibilitychange',
    handleVisibilityChangeRefresh
  );
});

watch(
  () => inputText.value,
  () => {
    updateLocalStorageInputText();
  }
);

watch(
  () => state.messages.map(message => message.id),
  () => {
    nextTick(() => {
      syncVisibleUnreadAfterAutoScroll();
      hideUnreadMarkerIfPassed();
      resetUnreadIfViewingBottom();
    });
  }
);

watch(
  [
    () => topicUnreadCount.value,
    () =>
      state.messages.map(
        message => `${message.id}:${message.isReadByMe === true ? '1' : '0'}`
      )
  ],
  () => {
    nextTick(() => {
      refreshUnreadMarkerState();
      hideUnreadMarkerIfPassed();
      resetUnreadIfViewingBottom();
    });
  },
  { deep: true }
);

defineExpose({
  handleClear: clearAiMessages,
  scrollToMessage: handleScrollToMessage
});
</script>
