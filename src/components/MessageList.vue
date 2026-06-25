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
    <Transition name="chat-floating-date" mode="out-in">
      <div
        v-if="floatingDateDividerLabel"
        :key="floatingDateDividerLabel"
        :class="[
          'chat__floating-date-divider',
          { 'chat__floating-date-divider--hidden': isFloatingDateDividerHidden }
        ]"
        :data-testid="`${props.dataTestid}-MessageList-FloatingDateDivider`"
      >
        <div class="date-divider">
          <span>{{ floatingDateDividerLabel }}</span>
        </div>
      </div>
    </Transition>
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
    <Transition name="chat-floating-date" mode="out-in">
      <div
        v-if="floatingDateDividerLabel"
        :key="floatingDateDividerLabel"
        :class="[
          'chat__floating-date-divider',
          { 'chat__floating-date-divider--hidden': isFloatingDateDividerHidden }
        ]"
        :data-testid="`${props.dataTestid}-MessageList-FloatingDateDivider`"
      >
        <div class="date-divider">
          <span>{{ floatingDateDividerLabel }}</span>
        </div>
      </div>
    </Transition>
    <section
      v-if="props.showUpdateBanner"
      ref="updateBannerRef"
      :class="[
        'chat-update-banner',
        {
          'chat-update-banner--dragging': isUpdateBannerDragging,
          'chat-update-banner--dismissing': isUpdateBannerDismissing
        }
      ]"
      :style="updateBannerSwipeStyle"
      :data-testid="`${props.dataTestid}-MessageList-UpdateBanner`"
      @pointerdown="handleUpdateBannerPointerDown"
      @pointermove="handleUpdateBannerPointerMove"
      @pointerup="handleUpdateBannerPointerUp"
      @pointercancel="handleUpdateBannerPointerCancel"
      @touchstart.stop
      @touchend.stop
    >
      <svg
        class="chat-update-banner__download-icon"
        width="44"
        height="44"
        viewBox="0 0 44 44"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect width="44" height="44" rx="22" fill="var(--border-blue)" />
        <path
          d="M30 25L30 28.3333C30 28.7754 29.8127 29.1993 29.4793 29.5118C29.1459 29.8244 28.6937 30 28.2222 30L15.7778 30C15.3063 30 14.8541 29.8244 14.5207 29.5118C14.1873 29.1993 14 28.7754 14 28.3333L14 25"
          stroke="var(--white)"
          stroke-width="1.375"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M17.8346 19.832L22.0013 23.9987L26.168 19.832"
          stroke="var(--white)"
          stroke-width="1.375"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M22 24L22 14"
          stroke="var(--white)"
          stroke-width="1.375"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>

      <div class="chat-update-banner__content">
        <p class="chat-update-banner__title">
          Доступна новая версия <span>приложения</span>
        </p>
        <p
          v-if="
            !props.updateProgress && props.updateActionLabel !== 'Перезапустить'
          "
          class="chat-update-banner__description"
        >
          Обновите приложение, чтобы получить новые функции<span>
            и улучшения</span
          >
        </p>
        <p
          v-else-if="props.updateActionLabel !== 'Перезапустить'"
          class="chat-update-banner__description"
        >
          Пожалуйста, не закрывайте приложение
        </p>
        <p v-else class="chat-update-banner__description">
          Для начала работы перезапустите приложение
        </p>
      </div>
      <Button
        :class="[
          'chat-update-banner__action',
          {
            'chat-update-banner__action--progress':
              props.updateProgress !== undefined
          }
        ]"
        :data-testid="`${props.dataTestid}-MessageList-UpdateBannerInstallButton`"
        :disabled="props.isUpdateActionDisabled"
        @click="props.onUpdateClick?.()"
      >
        <template v-if="props.updateProgress !== undefined">
          <span class="chat-update-banner__action-progress-label">
            {{ props.updateActionLabel }}
          </span>
          <span class="chat-update-banner__action-progress" aria-hidden="true">
            <FileIcon
              :is-me-sender="false"
              :is-loaded="false"
              :percent="props.updateProgress"
              background-color="var(--grey2)"
            />
          </span>
        </template>
        <template v-else>{{ props.updateActionLabel }}</template>
      </Button>
      <button
        v-if="!isMobile"
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
      v-if="isShowScrollToBottomButton || showUnreadReactionScrollButton"
      :class="[
        'chat__message-bubble__scroll-indicators',
        {
          'chat__message-bubble__scroll-indicators--with-count':
            showUnreadCountOnScrollButton
        }
      ]"
    >
      <button
        v-if="showUnreadReactionScrollButton"
        type="button"
        class="chat__message-bubble__arrow-down chat__message-bubble__arrow-down--reaction"
        :aria-label="'Перейти к новой реакции'"
        @click="handleUnreadReactionClick"
      >
        <ReactionHeartIcon
          variant="outline"
          class="chat__message-bubble__reaction-indicator"
        />
        <span class="contact-list__notification">1</span>
      </button>
      <button
        v-if="isShowScrollToBottomButton"
        type="button"
        class="chat__message-bubble__arrow-down"
        :aria-label="'Перейти к новым сообщениям'"
        @click="handleArrowDownClick"
      >
        <Icon :name="IconNameEnum.arrowDown" />
        <span
          v-if="showUnreadCountOnScrollButton"
          :class="{
            'contact-list__notification': true,
            'contact-list__notification--muted': activeTopic?.info?.isMute
          }"
        >
          {{ visibleTopicUnreadCount }}
        </span>
      </button>
    </div>
  </div>

  <SelectedMessagesContent
    v-if="isSelectionMode"
    :data-testid="`${props.dataTestid}-SelectedMessages`"
  />
  <MessageListInput
    v-if="!isDefaultRoute && !isSelectionMode && !isMobileTopicSearchMode"
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
import ReactionHeartIcon from './UI/ReactionHeartIcon.vue';
import FileIcon from './UI/FileIcon.vue';
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
  clearTopicUnreadReaction,
  getSelectedTopic,
  getTopicUnreadReactionMessageId,
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
import {
  getCanSendReadReceipts,
  markTopicReactionSeenChat,
  setSuspendIncomingMergeForTopic
} from '../services/useChat';
import {
  getIsAppActivelyVisible,
  subscribeToAppVisibilityChanges
} from '../services/useAppVisibility';
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
import {
  getTopicUnreadBadgeCount,
  hasTopicUnreadIndicator
} from '../utils/topicUnreadBadge';
import { isUnreadTrackableMessage } from '../utils/messageTracking';
import { isMobileTopicSearchActive } from '../composables/useMessageSearch';
import {
  normalizeReplyQuoteOccurrenceIndex,
  normalizeReplyQuoteText
} from '../utils/messageReplyQuote';
import {
  clearPendingTopicReactionJump,
  getIsTopicMessageVisible,
  pendingTopicReactionJump
} from '../services/useTopicViewportState';

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
const updateBannerRef = useTemplateRef<HTMLElement>('updateBannerRef');

const route = useUrlWatcher();
const { state: isMobile } = useResizeState(MAX_W_MD);

const { onTouchStart, onTouchEnd } = useMessageSwipe(route);

const UPDATE_BANNER_SWIPE_DURATION_MS = 240;
const UPDATE_BANNER_SWIPE_MIN_DISTANCE_PX = 24;
const UPDATE_BANNER_SWIPE_VELOCITY_PX_PER_MS = 0.55;
const updateBannerOffsetX = ref(0);
const isUpdateBannerDragging = ref(false);
const isUpdateBannerDismissing = ref(false);
let updateBannerPointerId: number | null = null;
let updateBannerSwipeStartX = 0;
let updateBannerSwipeStartTime = 0;
let updateBannerDismissTimeoutId: number | null = null;

const updateBannerSwipeStyle = computed(() => {
  if (!isMobile.value) {
    return undefined;
  }

  const bannerWidth = updateBannerRef.value?.offsetWidth || window.innerWidth;
  const swipeProgress = Math.min(
    Math.abs(updateBannerOffsetX.value) / bannerWidth,
    1
  );

  return {
    transform: `translate3d(${updateBannerOffsetX.value}px, 0, 0)`,
    opacity: String(1 - swipeProgress * 0.85)
  };
});

const resetUpdateBannerSwipe = () => {
  updateBannerPointerId = null;
  isUpdateBannerDragging.value = false;
  updateBannerOffsetX.value = 0;
};

const handleUpdateBannerPointerDown = (event: PointerEvent) => {
  if (
    !isMobile.value ||
    !event.isPrimary ||
    event.button !== 0 ||
    (event.target as HTMLElement).closest('button')
  ) {
    return;
  }

  updateBannerPointerId = event.pointerId;
  updateBannerSwipeStartX = event.clientX;
  updateBannerSwipeStartTime = performance.now();
  isUpdateBannerDragging.value = true;
  updateBannerRef.value?.setPointerCapture(event.pointerId);
};

const handleUpdateBannerPointerMove = (event: PointerEvent) => {
  if (event.pointerId !== updateBannerPointerId) {
    return;
  }

  const bannerWidth = updateBannerRef.value?.offsetWidth || window.innerWidth;
  const offsetX = event.clientX - updateBannerSwipeStartX;
  const maxOffsetX = bannerWidth * 1.1;

  updateBannerOffsetX.value = Math.max(
    -maxOffsetX,
    Math.min(offsetX, maxOffsetX)
  );
};

const dismissUpdateBannerWithAnimation = (direction: number) => {
  const bannerWidth = updateBannerRef.value?.offsetWidth || window.innerWidth;

  updateBannerPointerId = null;
  isUpdateBannerDragging.value = false;
  isUpdateBannerDismissing.value = true;
  updateBannerOffsetX.value = direction * (bannerWidth + 32);

  updateBannerDismissTimeoutId = window.setTimeout(() => {
    props.onDismissUpdateBanner?.();
    isUpdateBannerDismissing.value = false;
    updateBannerOffsetX.value = 0;
    updateBannerDismissTimeoutId = null;
  }, UPDATE_BANNER_SWIPE_DURATION_MS);
};

const handleUpdateBannerPointerUp = (event: PointerEvent) => {
  if (event.pointerId !== updateBannerPointerId) {
    return;
  }

  const offsetX = updateBannerOffsetX.value;
  const bannerWidth = updateBannerRef.value?.offsetWidth || window.innerWidth;
  const swipeDuration = Math.max(
    performance.now() - updateBannerSwipeStartTime,
    1
  );
  const swipeVelocity = Math.abs(offsetX) / swipeDuration;
  const hasEnoughDistance = Math.abs(offsetX) >= bannerWidth * 0.28;
  const hasEnoughVelocity =
    Math.abs(offsetX) >= UPDATE_BANNER_SWIPE_MIN_DISTANCE_PX &&
    swipeVelocity >= UPDATE_BANNER_SWIPE_VELOCITY_PX_PER_MS;

  if (hasEnoughDistance || hasEnoughVelocity) {
    dismissUpdateBannerWithAnimation(Math.sign(offsetX) || 1);
    return;
  }

  resetUpdateBannerSwipe();
};

const handleUpdateBannerPointerCancel = (event: PointerEvent) => {
  if (event.pointerId === updateBannerPointerId) {
    resetUpdateBannerSwipe();
  }
};

const getLocalStorageInputText = computed(() => {
  const inputsJson = JSON.parse(localStorage.getItem('inputs') || '{}');
  return inputsJson[route.value.id] || '';
});

const inputText = ref(getLocalStorageInputText.value);
const floatingDateDividerLabel = ref('');
const isFloatingDateDividerHidden = ref(false);
let chatVisibilityObserver: ResizeObserver | null = null;
let removeAppVisibilityListener: (() => void) | null = null;
let floatingDateDividerRafId = 0;
const FLOATING_DATE_LABEL_HEIGHT_PX = 50;
const FLOATING_DATE_HIDE_GAP_PX = 50;
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
const isMobileTopicSearchMode = computed(
  () => isMobile.value && isMobileTopicSearchActive.value
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
const hasVisibleTopicUnreadIndicator = computed(
  () =>
    canClearlyShowUnreadCount.value &&
    hasTopicUnreadIndicator(activeTopic.value || undefined, authUser.value?.id)
);
const unreadReactionMessageId = computed(() => {
  if (!activeTopic.value?.hasUnreadReaction || !route.value.id) {
    return null;
  }

  return getTopicUnreadReactionMessageId(route.value.id);
});
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

const syncFloatingDateDivider = (): void => {
  const container = chatWrapperRef.value;

  if (!container) {
    floatingDateDividerLabel.value = '';
    isFloatingDateDividerHidden.value = false;
    return;
  }

  const dateDividers = Array.from(
    container.querySelectorAll<HTMLElement>('[data-date-divider-label]')
  );

  if (!dateDividers.length) {
    floatingDateDividerLabel.value = '';
    isFloatingDateDividerHidden.value = false;
    return;
  }

  const containerRect = container.getBoundingClientRect();
  const stickyTop = containerRect.top + 6;
  const measuredDividers = dateDividers.map(element => ({
    element,
    rect: element.getBoundingClientRect()
  }));

  isFloatingDateDividerHidden.value = measuredDividers.some(({ rect }) => {
    const isInFloatingZone =
      rect.bottom >= stickyTop &&
      rect.top <=
        stickyTop + FLOATING_DATE_LABEL_HEIGHT_PX + FLOATING_DATE_HIDE_GAP_PX;

    return isInFloatingZone;
  });

  const passedDividers = measuredDividers
    .filter(({ rect }) => rect.top <= stickyTop)
    .sort((left, right) => right.rect.top - left.rect.top);

  const fallbackDivider = !floatingDateDividerLabel.value
    ? measuredDividers
        .filter(({ rect }) => rect.top > stickyTop)
        .sort((left, right) => left.rect.top - right.rect.top)[0]?.element
    : null;
  const activeDivider = passedDividers[0]?.element || fallbackDivider;

  if (!activeDivider && floatingDateDividerLabel.value) {
    return;
  }

  floatingDateDividerLabel.value =
    activeDivider?.dataset.dateDividerLabel || floatingDateDividerLabel.value;
};

const scheduleFloatingDateDividerSync = (): void => {
  if (floatingDateDividerRafId) {
    cancelAnimationFrame(floatingDateDividerRafId);
  }

  floatingDateDividerRafId = requestAnimationFrame(() => {
    floatingDateDividerRafId = 0;
    syncFloatingDateDivider();
  });
};

const {
  isShowScrollToBottomButton,
  viewportRevision,
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

const showUnreadCountOnScrollButton = computed(
  () =>
    hasVisibleTopicUnreadIndicator.value && visibleTopicUnreadCount.value > 0
);
const showUnreadReactionScrollButton = computed(() => {
  viewportRevision.value;

  const messageId = unreadReactionMessageId.value;

  return !!messageId && !getIsTopicMessageVisible(route.value.id, messageId);
});

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

type ScrollToMessageObjectPayload = {
  message?: IMessage | null;
  quoteText?: string;
  quoteOccurrenceIndex?: number;
};

type ScrollToMessagePayload = IMessage | ScrollToMessageObjectPayload;

const isScrollToMessageObjectPayload = (
  payload: ScrollToMessagePayload
): payload is ScrollToMessageObjectPayload =>
  Object.prototype.hasOwnProperty.call(payload, 'message');

const getScrollTargetMessage = (
  payload: ScrollToMessagePayload
): IMessage | null =>
  isScrollToMessageObjectPayload(payload) ? payload.message || null : payload;

const getScrollTargetQuoteText = (payload: ScrollToMessagePayload): string =>
  normalizeReplyQuoteText(
    isScrollToMessageObjectPayload(payload)
      ? payload.quoteText || payload.message?.replyQuoteText
      : payload.replyQuoteText
  );

const getScrollTargetQuoteOccurrenceIndex = (
  payload: ScrollToMessagePayload
): number | undefined =>
  normalizeReplyQuoteOccurrenceIndex(
    isScrollToMessageObjectPayload(payload)
      ? payload.quoteOccurrenceIndex ??
          payload.message?.replyQuoteOccurrenceIndex
      : payload.replyQuoteOccurrenceIndex
  );

const quoteHighlightClassName = 'message-quote-highlight';
const messageHighlightDurationMs = 3400;
let messageHighlightTimeoutId: number | null = null;

const cleanupQuoteHighlights = (): void => {
  const marks = chatWrapperRef.value?.querySelectorAll(
    `mark.${quoteHighlightClassName}`
  );

  marks?.forEach(mark => {
    const parent = mark.parentNode;

    while (mark.firstChild) {
      parent?.insertBefore(mark.firstChild, mark);
    }

    mark.remove();
    parent?.normalize();
  });
};

const escapeCssValue = (value: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&');

const getTextNodes = (root: HTMLElement): Text[] => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let currentNode = walker.nextNode();

  while (currentNode) {
    if (currentNode.textContent?.trim()) {
      nodes.push(currentNode as Text);
    }

    currentNode = walker.nextNode();
  }

  return nodes;
};

const buildNormalizedTextMap = (
  text: string
): { normalizedText: string; rawIndexByNormalizedIndex: number[] } => {
  let normalizedText = '';
  let pendingWhitespaceIndex: number | null = null;
  const rawIndexByNormalizedIndex: number[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (/\s/.test(char)) {
      if (normalizedText) {
        pendingWhitespaceIndex ??= index;
      }

      continue;
    }

    if (pendingWhitespaceIndex !== null) {
      normalizedText += ' ';
      rawIndexByNormalizedIndex.push(pendingWhitespaceIndex);
      pendingWhitespaceIndex = null;
    }

    normalizedText += char;
    rawIndexByNormalizedIndex.push(index);
  }

  return {
    normalizedText,
    rawIndexByNormalizedIndex
  };
};

const getRangeBoundary = (
  nodes: Text[],
  rawOffset: number
): { node: Text; offset: number } | null => {
  let traversedLength = 0;

  for (const node of nodes) {
    const nodeLength = node.textContent?.length || 0;
    const nextTraversedLength = traversedLength + nodeLength;

    if (rawOffset <= nextTraversedLength) {
      return {
        node,
        offset: Math.max(0, rawOffset - traversedLength)
      };
    }

    traversedLength = nextTraversedLength;
  }

  const lastNode = nodes[nodes.length - 1];

  return lastNode
    ? {
        node: lastNode,
        offset: lastNode.textContent?.length || 0
      }
    : null;
};

const findNormalizedQuoteStartIndex = (
  normalizedText: string,
  normalizedQuoteText: string,
  occurrenceIndex?: number
): number => {
  const fallbackIndex = normalizedText.indexOf(normalizedQuoteText);
  const targetOccurrenceIndex = occurrenceIndex ?? 0;

  if (targetOccurrenceIndex <= 0 || fallbackIndex < 0) {
    return fallbackIndex;
  }

  let currentOccurrenceIndex = 0;
  let fromIndex = 0;
  let startIndex = normalizedText.indexOf(normalizedQuoteText, fromIndex);

  while (startIndex >= 0) {
    if (currentOccurrenceIndex === targetOccurrenceIndex) {
      return startIndex;
    }

    currentOccurrenceIndex += 1;
    fromIndex = startIndex + normalizedQuoteText.length;
    startIndex = normalizedText.indexOf(normalizedQuoteText, fromIndex);
  }

  return fallbackIndex;
};

const highlightMessageQuote = (
  messageId: string,
  quoteText: string,
  occurrenceIndex?: number
): boolean => {
  cleanupQuoteHighlights();

  if (!quoteText || !chatWrapperRef.value) {
    return false;
  }

  const messageElement = chatWrapperRef.value.querySelector<HTMLElement>(
    `.message[data-message-id="${escapeCssValue(messageId)}"]`
  );

  if (!messageElement) {
    return false;
  }

  const contentElement =
    messageElement.querySelector<HTMLElement>('.message-content__html') ||
    messageElement.querySelector<HTMLElement>('.message-call__title');

  if (!contentElement) {
    return false;
  }

  const textNodes = getTextNodes(contentElement);
  const rawText = textNodes.map(node => node.textContent || '').join('');
  const { normalizedText, rawIndexByNormalizedIndex } =
    buildNormalizedTextMap(rawText);
  const normalizedQuoteText = normalizeReplyQuoteText(quoteText);
  const normalizedStartIndex = findNormalizedQuoteStartIndex(
    normalizedText,
    normalizedQuoteText,
    occurrenceIndex
  );

  if (normalizedStartIndex < 0) {
    return false;
  }

  const normalizedEndIndex =
    normalizedStartIndex + normalizedQuoteText.length - 1;
  const rawStart = rawIndexByNormalizedIndex[normalizedStartIndex];
  const rawEnd = rawIndexByNormalizedIndex[normalizedEndIndex] + 1;
  const startBoundary = getRangeBoundary(textNodes, rawStart);
  const endBoundary = getRangeBoundary(textNodes, rawEnd);

  if (!startBoundary || !endBoundary) {
    return false;
  }

  const range = document.createRange();
  range.setStart(startBoundary.node, startBoundary.offset);
  range.setEnd(endBoundary.node, endBoundary.offset);

  const highlightMark = document.createElement('mark');
  highlightMark.className = quoteHighlightClassName;

  highlightMark.append(range.extractContents());
  range.insertNode(highlightMark);
  highlightMark.scrollIntoView({
    block: 'center',
    behavior: 'smooth'
  });

  window.setTimeout(() => {
    const parent = highlightMark.parentNode;

    while (highlightMark.firstChild) {
      parent?.insertBefore(highlightMark.firstChild, highlightMark);
    }

    highlightMark.remove();
    parent?.normalize();
  }, messageHighlightDurationMs);

  return true;
};

const highlightWholeMessage = (messageId: string): void => {
  const wrapperElement = chatWrapperRef.value;
  const messageElement = wrapperElement?.querySelector<HTMLElement>(
    `.message[data-message-id="${escapeCssValue(messageId)}"]`
  );

  if (!wrapperElement || !messageElement) {
    return;
  }

  if (messageHighlightTimeoutId !== null) {
    window.clearTimeout(messageHighlightTimeoutId);
    messageHighlightTimeoutId = null;
  }

  wrapperElement
    .querySelectorAll<HTMLElement>('.message.highlighted')
    .forEach(element => {
      element.classList.remove('highlighted');
    });

  messageElement.classList.add('highlighted');

  messageHighlightTimeoutId = window.setTimeout(() => {
    messageElement.classList.remove('highlighted');
    messageHighlightTimeoutId = null;
  }, messageHighlightDurationMs);
};

const jumpToMessageWithHighlight = async (
  messageId: string,
  quoteText: string,
  quoteOccurrenceIndex?: number
): Promise<boolean> => {
  const didJump = await scrollAnchor.jumpToMessage(messageId, {
    block: 'center',
    behavior: 'smooth'
  });

  if (!didJump) {
    return false;
  }

  highlightWholeMessage(messageId);
  highlightMessageQuote(messageId, quoteText, quoteOccurrenceIndex);

  return true;
};

const navigateToMessageId = async (
  messageId: string,
  quoteText = '',
  quoteOccurrenceIndex?: number
): Promise<boolean> => {
  const didJump = await jumpToMessageWithHighlight(
    messageId,
    quoteText,
    quoteOccurrenceIndex
  );

  if (didJump) {
    return true;
  }

  const memoryMessages = await hydrateMessageContextFromMemory(
    route.value.id,
    messageId
  );

  if (memoryMessages.some(m => m.id === messageId)) {
    const didMemoryJump = await jumpToMessageWithHighlight(
      messageId,
      quoteText,
      quoteOccurrenceIndex
    );

    if (didMemoryJump) {
      return true;
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
    const didShadowJump = await jumpToMessageWithHighlight(
      messageId,
      quoteText,
      quoteOccurrenceIndex
    );

    if (didShadowJump) {
      return true;
    }
  }

  resetScrollState();
  scrollAnchor.prepareJumpMutation();
  const messages = await fetchAroundMessage(messageId);

  if (!messages.some(m => m.id === messageId)) {
    return false;
  }

  await nextTick();
  return jumpToMessageWithHighlight(messageId, quoteText, quoteOccurrenceIndex);
};

const handleScrollToMessage = async (payload: ScrollToMessagePayload) => {
  const message = getScrollTargetMessage(payload);

  if (!message || message.topicId !== route.value.id) {
    return;
  }

  await navigateToMessageId(
    message.id,
    getScrollTargetQuoteText(payload),
    getScrollTargetQuoteOccurrenceIndex(payload)
  );
};

const handleArrowDownClick = async (): Promise<void> => {
  if (showUnreadCountOnScrollButton.value) {
    await handleScrollToButton();
    return;
  }

  await handleScrollToButton();
};

const handleUnreadReactionClick = async (): Promise<void> => {
  const messageId = unreadReactionMessageId.value;

  if (!messageId) {
    return;
  }

  const didNavigate = await navigateToMessageId(messageId);

  if (didNavigate) {
    clearTopicUnreadReaction(route.value.id);
    void markTopicReactionSeenChat({ topicId: route.value.id });
  }
};

watch(
  [pendingTopicReactionJump, () => route.value.id],
  async ([pendingJump, topicId]) => {
    if (!pendingJump || pendingJump.topicId !== topicId) {
      return;
    }

    await nextTick();
    const didNavigate = await navigateToMessageId(pendingJump.messageId);

    if (!didNavigate) {
      return;
    }

    clearTopicUnreadReaction(topicId);
    void markTopicReactionSeenChat({ topicId });
    clearPendingTopicReactionJump(topicId, pendingJump.messageId);
  },
  { immediate: true }
);

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
    !getCanSendReadReceipts() ||
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

  if (!getIsAppActivelyVisible()) {
    return;
  }

  if (state.unreadMarkerMessageId && !state.hideUnreadMarker) {
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
  scheduleFloatingDateDividerSync();
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
  window.addEventListener('resize', scheduleFloatingDateDividerSync);

  if (props.contact?.id) {
    state.isLoadingMore = false;
    isLoadingInitialMessages.value = true;

    await nextTick();
    requestAnimationFrame(() => {
      if (chatWrapperRef?.value) {
        scrollState.shouldAutoScroll = true;
        scrollState.isInitialLoad = true;
        setupIntersectionObserver();
        scheduleFloatingDateDividerSync();
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
  window.removeEventListener('resize', scheduleFloatingDateDividerSync);

  if (updateBannerDismissTimeoutId !== null) {
    window.clearTimeout(updateBannerDismissTimeoutId);
  }

  if (floatingDateDividerRafId) {
    cancelAnimationFrame(floatingDateDividerRafId);
    floatingDateDividerRafId = 0;
  }

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
    scheduleFloatingDateDividerSync();
  }
);

watch(
  [
    () => route.value.id,
    () => state.messages.length,
    () => state.aiMessages.length
  ],
  async () => {
    await nextTick();
    scheduleFloatingDateDividerSync();
  },
  { immediate: true }
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

const isMediaPreviewOpen = (): boolean =>
  !!document.querySelector('.slider-modal');

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

  if (e.key === 'Escape' && !isMediaPreviewOpen()) {
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

  removeAppVisibilityListener = subscribeToAppVisibilityChanges(() => {
    if (getCanSendReadReceipts()) {
      refreshUnreadMarkerState();
    }
  });
});

onUnmounted(() => {
  if (route.value?.id) {
    setSuspendIncomingMergeForTopic(route.value.id, false);
  }

  if (messageHighlightTimeoutId !== null) {
    window.clearTimeout(messageHighlightTimeoutId);
    messageHighlightTimeoutId = null;
  }

  window.removeEventListener('keydown', handleWindowKeydown, true);
  window.removeEventListener('focus', handleWindowFocusRefresh);
  document.removeEventListener(
    'visibilitychange',
    handleVisibilityChangeRefresh
  );
  removeAppVisibilityListener?.();
  removeAppVisibilityListener = null;
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
