<template>
  <div
    :class="[
      'chat__message-wrapper',
      'chat-scrollbar',
      {
        'chat__message-wrapper--content-deferred': shouldRenderAiMessageSkeleton
      }
    ]"
    ref="chatWrapperRef"
    v-if="isAiRoute"
    :style="chatMessageWrapperStyle"
    @pointerdown.capture="preserveMobileMessageInputFocus"
    @mousedown.capture="preserveMobileMessageInputFocus"
    @wheel.passive="handleFloatingDateDividerUserScroll"
    @touchmove.passive="handleFloatingDateDividerUserScroll"
    @touchstart="onTouchStart"
    @touchend="onTouchEnd"
    @scroll="handleAiScroll"
    @vue:mounted="scrollAiToBottom"
    :data-testid="`${props.dataTestid}-MessageList-AIMessagesWrapper`"
  >
    <MessageListAIItems
      v-if="!shouldRenderAiMessageSkeleton"
      :messages="state.aiMessages"
      :data-testid="props.dataTestid"
    />
    <div
      v-else
      :class="[
        'chat__message-skeleton',
        { 'chat__message-skeleton--group': route.type === RouteTypes.GROUP }
      ]"
      aria-hidden="true"
      :data-testid="`${props.dataTestid}-MessageList-Skeleton`"
    >
      <span
        class="chat__message-skeleton-row chat__message-skeleton-row--incoming"
      >
        <span class="chat__message-skeleton-avatar" />
        <span
          class="chat__message-skeleton-bubble chat__message-skeleton-bubble--incoming chat__message-skeleton-bubble--short"
        />
      </span>
      <span
        class="chat__message-skeleton-media chat__message-skeleton-media--outgoing"
      >
        <span class="chat__message-skeleton-media-icon" />
      </span>
      <span
        class="chat__message-skeleton-row chat__message-skeleton-row--incoming"
      >
        <span class="chat__message-skeleton-avatar" />
        <span
          class="chat__message-skeleton-bubble chat__message-skeleton-bubble--incoming"
        />
      </span>
      <span
        class="chat__message-skeleton-bubble chat__message-skeleton-bubble--outgoing chat__message-skeleton-bubble--wide"
      />
      <span
        class="chat__message-skeleton-row chat__message-skeleton-row--incoming"
      >
        <span class="chat__message-skeleton-avatar" />
        <span
          class="chat__message-skeleton-bubble chat__message-skeleton-bubble--incoming chat__message-skeleton-bubble--tiny"
        />
      </span>
      <span
        class="chat__message-skeleton-bubble chat__message-skeleton-bubble--outgoing"
      />
      <span
        class="chat__message-skeleton-row chat__message-skeleton-row--incoming"
      >
        <span class="chat__message-skeleton-avatar" />
        <span
          class="chat__message-skeleton-bubble chat__message-skeleton-bubble--incoming"
        />
      </span>
    </div>
    <Transition name="chat-floating-date" mode="out-in">
      <div
        v-if="!shouldRenderAiMessageSkeleton && shouldShowFloatingDateDivider"
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
    :class="[
      'chat__message-wrapper',
      'chat-scrollbar',
      {
        'chat__message-wrapper--content-deferred':
          shouldDeferUserMessageContentLayout,
        'chat__message-wrapper--bootstrap-scroll-locked':
          shouldLockUserMessageBootstrapScroll,
        'chat__message-wrapper--search-positioning':
          isSearchNavigationPositioning,
        'chat__message-wrapper--favorite': isFavoriteMessageTopic,
        'chat__message-wrapper--call-topic': isActiveCallTopic
      }
    ]"
    v-if="!isAiRoute && !isDefaultRoute"
    ref="chatWrapperRef"
    :style="chatMessageWrapperStyle"
    @vue:mounted="scrollToBottom"
    @pointerdown.capture="preserveMobileMessageInputFocus"
    @mousedown.capture="preserveMobileMessageInputFocus"
    @scroll="handleScroll"
    @wheel.passive="handleFloatingDateDividerUserScroll"
    @touchmove.passive="handleUserMessageTouchMove"
    @touchstart="handleUserMessageTouchStart"
    @touchend="handleUserMessageTouchEnd"
    @touchcancel="handleUserMessageTouchCancel"
    @scrollend="handleMessageScrollEnd"
    :data-testid="`${props.dataTestid}-MessageList-UserMessagesWrapper`"
  >
    <MessageListUserItems
      v-if="shouldMountUserMessageItems"
      :key="renderedTopicId"
      ref="messageListUserItemsRef"
      :class="{
        'chat__message-bubble--warming': shouldCoverUserMessagesWithSkeleton
      }"
      :messages="renderedUserMessages"
      :auth-user-id="authUserId"
      :hide-unread-marker="state.hideUnreadMarker"
      :unread-marker-message-id="state.unreadMarkerMessageId"
      :data-testid="props.dataTestid"
      @set-edit-message="handleSetEditMessage"
      @set-reply-message="handleSetReplyMessage"
      @set-forward-message="handleSetForwardMessage"
      @retry-message="handleRetryMessage"
      @scroll-to-message="handleScrollToMessage"
      @open-sticker-pack="messageListInputRef?.openStickerPack?.($event)"
      @content-ready="handleUserMessagesContentReady"
    >
      <template
        v-if="activeTopic && isActiveCallTopic && !hasCallTopicDefaultMessage"
        #before
      >
        <CallTopicDefaultMessage
          :topic="activeTopic"
          :data-testid="`${props.dataTestid}-CallTopicDefaultMessage`"
        />
      </template>
      <template #after>
        <CallTopicActions
          v-if="activeTopic && shouldShowInlineCallTopicActions"
          class="call-topic-actions--message-inline"
          :topic="activeTopic"
          :data-testid="`${props.dataTestid}-CallTopicActionsInline`"
        />
        <div
          v-if="isDeletedAccountTopic"
          class="top-element"
          :data-testid="`${props.dataTestid}-MessageList-DeletedAccountMessage`"
        >
          <div class="system-message chat__deleted-account-message">
            <span class="system-message-text"
              >Чат с этим пользователем недоступен</span
            >
          </div>
        </div>
      </template>
    </MessageListUserItems>
    <div
      v-if="shouldRenderEmptyUserMessageState"
      class="chat__message-empty-state"
      :data-testid="`${props.dataTestid}-MessageList-EmptyChat`"
    >
      <span>
        {{
          isFavoriteMessageTopic
            ? 'Здесь пока ничего нет...'
            : 'Сообщений пока нет'
        }}
      </span>
    </div>
    <Transition name="chat-floating-date" mode="out-in">
      <div
        v-if="!shouldRenderUserMessageSkeleton && shouldShowFloatingDateDivider"
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
    <Transition name="chat-pagination-loading">
      <div
        v-if="shouldShowOlderMessagesLoading"
        class="chat__pagination-loading chat__pagination-loading--top"
        :data-testid="`${props.dataTestid}-MessageList-OlderMessagesLoading`"
      >
        <span class="chat__pagination-loading-text">загрузка...</span>
      </div>
    </Transition>
    <Transition name="chat-pagination-loading">
      <div
        v-if="shouldShowNewerMessagesLoading"
        class="chat__pagination-loading chat__pagination-loading--bottom"
        :data-testid="`${props.dataTestid}-MessageList-NewerMessagesLoading`"
      >
        <span class="chat__pagination-loading-text">загрузка...</span>
      </div>
    </Transition>
  </div>

  <div
    v-if="shouldRenderUserMessageSkeleton"
    :class="[
      'chat__message-skeleton',
      'chat__message-skeleton--user',
      { 'chat__message-skeleton--group': route.type === RouteTypes.GROUP }
    ]"
    aria-hidden="true"
    :data-testid="`${props.dataTestid}-MessageList-Skeleton`"
  >
    <span
      class="chat__message-skeleton-row chat__message-skeleton-row--incoming"
    >
      <span class="chat__message-skeleton-avatar" />
      <span
        class="chat__message-skeleton-bubble chat__message-skeleton-bubble--incoming chat__message-skeleton-bubble--short"
      />
    </span>
    <span
      class="chat__message-skeleton-media chat__message-skeleton-media--outgoing"
    >
      <span class="chat__message-skeleton-media-icon" />
    </span>
    <span
      class="chat__message-skeleton-row chat__message-skeleton-row--incoming"
    >
      <span class="chat__message-skeleton-avatar" />
      <span
        class="chat__message-skeleton-bubble chat__message-skeleton-bubble--incoming"
      />
    </span>
    <template v-if="isMobile">
      <span
        class="chat__message-skeleton-bubble chat__message-skeleton-bubble--outgoing chat__message-skeleton-bubble--wide"
      />
      <span
        class="chat__message-skeleton-row chat__message-skeleton-row--incoming"
      >
        <span class="chat__message-skeleton-avatar" />
        <span
          class="chat__message-skeleton-bubble chat__message-skeleton-bubble--incoming chat__message-skeleton-bubble--tiny"
        />
      </span>
      <span
        class="chat__message-skeleton-bubble chat__message-skeleton-bubble--outgoing"
      />
      <span
        class="chat__message-skeleton-row chat__message-skeleton-row--incoming"
      >
        <span class="chat__message-skeleton-avatar" />
        <span
          class="chat__message-skeleton-bubble chat__message-skeleton-bubble--incoming"
        />
      </span>
    </template>
  </div>

  <div
    v-if="
      !isAiRoute &&
      !isDefaultRoute &&
      !shouldRenderUserMessageSkeleton &&
      (isShowScrollToBottomButton || showUnreadReactionScrollButton)
    "
    :class="[
      'chat__message-bubble__scroll-indicators',
      {
        'chat__message-bubble__scroll-indicators--with-count':
          showUnreadCountOnScrollButton
      }
    ]"
    :style="chatMessageWrapperStyle"
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

  <SelectedMessagesContent
    v-if="!shouldRenderUserMessageSkeleton && isSelectionMode"
    :data-testid="`${props.dataTestid}-SelectedMessages`"
    @height-change="handleSelectedMessagesHeightChange"
  />
  <CallTopicActions
    v-if="
      !shouldRenderUserMessageSkeleton &&
      !isSelectionMode &&
      activeTopic &&
      shouldShowDockedCallTopicActions
    "
    :topic="activeTopic"
    :data-testid="`${props.dataTestid}-CallTopicActions`"
  />
  <MessageListInput
    v-if="shouldRenderMessageComposer"
    :topic-id="activeTopic?.id"
    v-model="inputText"
    ref="messageListInputRef"
    :class="{
      'chat__input--after-call-actions': shouldShowDockedCallTopicActions
    }"
    :edit-message="state.editMessage"
    :reply-message="state.replyMessage"
    :forward-messages="activeForwardMessages"
    :show-call-topic-actions-toggle="shouldShowCallTopicActionsToggle"
    :is-call-topic-actions-open="isCallTopicActionsOpen"
    :data-testid="props.dataTestid"
    @send="handleSend"
    @send-sticker="handleSendSticker"
    @send-keyboard-media="handleSendKeyboardMedia"
    @attach-file="handleAttachFile"
    @clear-edit="handleSetEditMessage(null)"
    @clear-reply="handleSetReplyMessage(null)"
    @clear-forward="handleSetForwardMessage(null)"
    @scroll-to-message="handleScrollToMessage"
    @height-change="handleInputHeightChange"
    @ready="handleMessageComposerReady"
    @toggle-call-topic-actions="handleToggleCallTopicActions"
  />

  <PushNotification
    v-if="!shouldRenderUserMessageSkeleton && !!state.errorMessage"
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
import {
  MessageTypeEnum,
  PushNotification,
  Icon,
  IconNameEnum
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
  hasKnownTopicMessagesState,
  hydrateMessageContextFromShadow,
  hydrateMessagesFromCache,
  hydratePendingMessagesFromCache,
  hydrateMessagePreviewFromCache,
  MOBILE_NOTIFICATION_HISTORY_LIMIT,
  mergeMessagesForTopic,
  setVisibleMessagesLimitForTopic,
  suppressNotificationSoundForTopic,
  suspendLocalOwnReadStatus
} from '../services/useMessages';
import {
  consumeBufferedIncomingMessagesForTopic,
  getCanSendReadReceipts,
  getChatSDK,
  getHasBrowserNetwork,
  markTopicReactionSeenChat,
  setSuspendIncomingMergeForTopic
} from '../services/useChat';
import { isAnyCallModalVisible } from '../services/useCallState';
import {
  getIsAppActivelyVisible,
  subscribeToAppVisibilityChanges
} from '../services/useAppVisibility';
import { getAuthUser } from '../composables/useAuth';
import type {
  IMessage,
  IMessageRenderedTopicState,
  IMessageViewportSnapshot
} from './interfaces/interfaces';
import { TopicType } from '../services/useChatSDK/types';
import { formatDay } from '../composables/useTime';

import { useMessageSwipe } from './Messages/composables/useMessageSwipe';
import { useMessageScroll } from './Messages/composables/useMessageScroll';
import { useMessageSender } from './Messages/composables/useMessageSender';
import { useMessageMastra } from './Messages/composables/useMessageMastra';
import { useMessageActions } from './Messages/composables/useMessageActions';
import { Capacitor } from '@capacitor/core';
import { MediaType } from '@pksep/zod-shared-chat';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_MD } from '../utils/constants';
import { isIosWeb } from '../utils/ios-pwa-viewport';
import SelectedMessagesContent from './Header/SelectedMessagesContent.vue';
import CallTopicActions from './Calls/CallTopicActions.vue';
import CallTopicDefaultMessage from './Calls/CallTopicDefaultMessage.vue';
import { usePendingForwardMessages } from '../composables/useForwardMessages';
import { usePendingMessageDraft } from '../composables/useMessageDraftTransfer';
import { ensureMediaObjectUrl } from '../services/useMediaBlobCache';
import { isGroupCallInviteUrl } from '../utils/groupCallInviteUrl';
import {
  getTopicUnreadBadgeCount,
  hasTopicUnreadIndicator
} from '../utils/topicUnreadBadge';
import { isUnreadTrackableMessage } from '../utils/messageTracking';
import {
  consumePendingSearchNavigation,
  getPendingSearchNavigation
} from '../composables/useMessageSearch';
import {
  normalizeReplyQuoteOccurrenceIndex,
  normalizeReplyQuoteText
} from '../utils/messageReplyQuote';
import {
  clearPendingTopicReactionJump,
  getIsTopicMessageVisible,
  pendingTopicReactionJump
} from '../services/useTopicViewportState';
import { recordChatMessageListRenderMismatch } from '../services/useChatNavigationTelemetry';
import { isDeletedBotUser } from '../utils/bot';
import {
  filterFavoriteTopicSystemMessages,
  isFavoriteTopic
} from '../utils/favorite-topic';
import { isCallTopic, isCallTopicDefaultMessage } from '../utils/call-topic';
import {
  consumeNotificationTopicRefreshRequest,
  notificationTopicRefreshRequest
} from '../services/useNotificationNavigation';
import { getMessageReactionLayoutSignature } from '../utils/messageScroll';
import { dispatchNotificationTopicShellReady } from '../utils/nativeStartup';
import { resolveNotificationHistoryPaint } from '../utils/notification-paint';
import {
  needsNotificationMessageContext,
  mergeNotificationMessageSnapshots
} from '../utils/notificationMessages';

export interface IMessageListExtendedProps extends IMessageListProps {
  dataTestid?: string;
  deferContentRender?: boolean;
  suppressInitialSkeleton?: boolean;
}

const props = withDefaults(defineProps<IMessageListExtendedProps>(), {
  dataTestid: 'MessageList',
  deferContentRender: false,
  suppressInitialSkeleton: false
});
const emit = defineEmits<{
  (
    e: 'viewport-snapshot-change',
    snapshot: IMessageViewportSnapshot | null
  ): void;
  (e: 'rendered-topic-change', payload: IMessageRenderedTopicState): void;
}>();
const TOPIC_SWITCH_AUTO_READ_GRACE_MS = 1200;
const TOPIC_SWITCH_HISTORY_FETCH_GRACE_MS = 1200;
const TOPIC_SWITCH_BOOTSTRAP_MESSAGES_LIMIT = 48;
const TOPIC_SWITCH_SKELETON_DELAY_MS = 300;
const TOPIC_SWITCH_CACHE_MAX_AGE_MS = 15_000;
const TOPIC_SWITCH_EXPANDED_FETCH_DELAY_MS = 80;
const TOPIC_SWITCH_USER_SCROLL_INTENT_GRACE_MS = 2000;
const CURRENT_TOPIC_BOTTOM_THRESHOLD_PX = 120;
const TOPIC_SWITCH_MEDIA_PREWARM_LIMIT = 12;
const MOBILE_FAST_INITIAL_MESSAGES_LIMIT = 24;
const MOBILE_FAST_MAX_INITIAL_MESSAGES_LIMIT = 48;
const MOBILE_VISIBLE_EXPAND_DELAY_MS = 600;
const MOBILE_INITIAL_MESSAGES_LIMIT = 48;
const MOBILE_MAX_INITIAL_MESSAGES_LIMIT = 48;
const MOBILE_EXPANDED_MESSAGES_LIMIT = MOBILE_NOTIFICATION_HISTORY_LIMIT;
const MOBILE_MAX_VISIBLE_MESSAGES_LIMIT = MOBILE_NOTIFICATION_HISTORY_LIMIT;
const DESKTOP_INITIAL_MESSAGES_LIMIT = 100;

const chatWrapperRef = useTemplateRef('chatWrapperRef');
const messageListUserItemsRef = useTemplateRef<any>('messageListUserItemsRef');
const messageListInputRef = useTemplateRef<any>('messageListInputRef');

const route = useUrlWatcher();
const { state: isMobile } = useResizeState(MAX_W_MD);
const { state: isCompactMessageInput } = useResizeState(481, {
  inclusive: false
});
const isNativeAndroid =
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

const { onTouchStart, onTouchEnd } = useMessageSwipe(route);

const getLocalStorageInputText = computed(() => {
  const inputsJson = JSON.parse(localStorage.getItem('inputs') || '{}');
  return inputsJson[route.value.id] || '';
});

const inputText = ref(getLocalStorageInputText.value);
const bottomBarHeight = ref(0);
const messageInlineEndInset = ref(20);
const floatingDateDividerLabel = ref('');
const isFloatingDateDividerHidden = ref(false);
const isFloatingDateDividerActive = ref(false);
let chatVisibilityObserver: ResizeObserver | null = null;
let removeAppVisibilityListener: (() => void) | null = null;
let floatingDateDividerRafId = 0;
let postScrollUiSyncRafId = 0;
let pinnedViewportSnapshotRafId = 0;
let pinnedViewportSnapshotTimeoutId: number | null = null;
let lastPinnedViewportSnapshotAt = 0;
let floatingDateDividerHideTimeoutId: number | null = null;
let floatingDateDividerUserScrollIntentAt = 0;
let lastFloatingDateDividerScrollTop: number | null = null;
const FLOATING_DATE_VISIBLE_MS = 900;
const FLOATING_DATE_USER_SCROLL_GRACE_MS = 500;
const PINNED_VIEWPORT_SNAPSHOT_INTERVAL_MS = 80;
const unreadMarkerMessageIdsByTopic = reactive<Record<string, string | null>>(
  {}
);
let messageNavigationRevision = 0;
const { pendingForwardMessages, pendingForwardTopicId } =
  usePendingForwardMessages();
const { pendingDraftTopicId, pendingDraftText, consumePendingMessageDraft } =
  usePendingMessageDraft();

const isAiRoute = computed(() => route.value?.type === RouteTypes.AI);
const isDefaultRoute = computed(() => route.value?.type === RouteTypes.DEFAULT);
const chatMessageWrapperStyle = computed(() => ({
  '--chat-message-inline-end': `${messageInlineEndInset.value}px`,
  ...(bottomBarHeight.value > 0
    ? { '--chat-input-height': `${bottomBarHeight.value}px` }
    : {})
}));

const syncMessageInlineEndInset = (): void => {
  const wrapper = chatWrapperRef.value;
  if (!wrapper) {
    return;
  }

  const styles = window.getComputedStyle(wrapper);
  const paddingInlineEnd = Number.parseFloat(styles.paddingRight) || 0;
  const borderInlineWidth =
    (Number.parseFloat(styles.borderLeftWidth) || 0) +
    (Number.parseFloat(styles.borderRightWidth) || 0);
  const scrollbarWidth = Math.max(
    0,
    wrapper.offsetWidth - wrapper.clientWidth - borderInlineWidth
  );
  const nextInset = Math.max(0, Math.ceil(paddingInlineEnd + scrollbarWidth));

  if (messageInlineEndInset.value !== nextInset) {
    messageInlineEndInset.value = nextInset;
  }
};
const authUser = computed(() => getAuthUser());
const authUserId = computed(() =>
  authUser.value?.id === undefined || authUser.value?.id === null
    ? undefined
    : String(authUser.value.id)
);
const isSelectionMode = computed(() =>
  isMessageSelectionModeForTopic(route.value.id)
);
const activeTopic = computed(() =>
  route.value.id ? getSelectedTopic(route.value.id) : null
);
const isActiveCallTopic = computed(
  () => route.value.type === RouteTypes.CALL || isCallTopic(activeTopic.value)
);
const isCallTopicActionsOpen = ref(false);
const shouldShowCallTopicActionsToggle = computed(
  () => isCompactMessageInput.value && isActiveCallTopic.value
);
const shouldShowDockedCallTopicActions = computed(
  () => isActiveCallTopic.value && !isCompactMessageInput.value
);
const shouldShowInlineCallTopicActions = computed(
  () =>
    isActiveCallTopic.value &&
    isCompactMessageInput.value &&
    isCallTopicActionsOpen.value
);
const isFavoriteMessageTopic = computed(() =>
  isFavoriteTopic(activeTopic.value, authUserId.value)
);
const getRenderedTopicMessages = (
  topicId: string,
  messages: IMessage[]
): IMessage[] => {
  if (route.value.type === RouteTypes.FAVORITES && route.value.id === topicId) {
    return messages.filter(message => !message.isSystem);
  }

  return filterFavoriteTopicSystemMessages(
    getSelectedTopic(topicId),
    messages,
    authUserId.value
  );
};
const pendingInitialNotificationMessageId = ref('');
const isAwaitingNotificationHistory = ref(false);
const initialNotificationPositionReady = ref(true);
let initialNotificationPositionMessageId = '';
const renderedUserMessages = computed(() => {
  const topicId = route.value.id;

  if (
    !topicId ||
    renderedTopicId.value !== topicId ||
    isAwaitingNotificationHistory.value
  ) {
    return [];
  }

  const currentTopicMessages = state.messages.filter(
    message => !message.topicId || message.topicId === topicId
  );

  return getRenderedTopicMessages(topicId, currentTopicMessages);
});
const renderedLastUserMessageSignature = computed(() => {
  const lastMessage =
    renderedUserMessages.value[renderedUserMessages.value.length - 1];

  if (!lastMessage) {
    return '';
  }

  return [
    lastMessage.id || '',
    lastMessage.updatedAt || '',
    lastMessage.status || '',
    lastMessage.text || '',
    lastMessage.media?.length || 0,
    getMessageReactionLayoutSignature(lastMessage.reactions)
  ].join('\u001f');
});
const renderedUserReactionsSignature = computed(() => {
  const signatures: string[] = [];
  for (const message of renderedUserMessages.value) {
    if (message.reactions?.length) {
      signatures.push(
        `${message.id}:${getMessageReactionLayoutSignature(message.reactions)}`
      );
    }
  }
  return signatures.join('\u001e');
});
const hasCallTopicDefaultMessage = computed(() =>
  renderedUserMessages.value.some(isCallTopicDefaultMessage)
);
const isDeletedAccountTopic = computed(() => {
  const topic = activeTopic.value;

  return topic?.type === TopicType.DM && isDeletedBotUser(topic.user);
});
const shouldRenderMessageComposer = computed(
  () =>
    !isDefaultRoute.value &&
    !isSelectionMode.value &&
    !isDeletedAccountTopic.value
);
const topicUnreadCount = computed(() =>
  getTopicUnreadBadgeCount(activeTopic.value || undefined, authUser.value?.id)
);
const getCurrentTopicBottomDistance = (): number => {
  const container = chatWrapperRef.value;

  if (!container) {
    return 0;
  }

  const maxScroll = Math.max(
    0,
    container.scrollHeight - container.clientHeight
  );

  return Math.max(0, maxScroll - container.scrollTop);
};

const isCurrentTopicNearBottomNow = (): boolean =>
  getCurrentTopicBottomDistance() <= CURRENT_TOPIC_BOTTOM_THRESHOLD_PX;

const isViewingBottom = computed(
  () =>
    !!route.value?.id &&
    route.value.type !== RouteTypes.AI &&
    scrollAnchor.viewportMode.value === 'live' &&
    isCurrentTopicNearBottomNow()
);
const shouldShowFloatingDateDivider = computed(
  () =>
    !!floatingDateDividerLabel.value &&
    (isNativeAndroid || isFloatingDateDividerActive.value) &&
    !isFloatingDateDividerHidden.value
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
const isAwaitingUserMessagesPaint = ref(false);
const paintedUserMessageTopicId = ref('');
const readyComposerRouteKey = ref('');
const composerRouteKey = computed(
  () => `${route.value.type}:${route.value.id || 'default'}`
);
const isMessageComposerReady = computed(
  () =>
    !shouldRenderMessageComposer.value ||
    readyComposerRouteKey.value === composerRouteKey.value
);
watch(
  composerRouteKey,
  () => {
    readyComposerRouteKey.value = '';
  },
  { flush: 'sync' }
);
const handleMessageComposerReady = (): void => {
  readyComposerRouteKey.value = composerRouteKey.value;
};
const isInitialMessagesSkeletonVisible = ref(false);
const isBootstrapScrollLocked = ref(false);
const isSearchNavigationPositioning = ref(false);
const knownEmptyMessageTopicIds = ref<Set<string>>(new Set());
let activeTopicSwitchToken = 0;
let topicSwitchStartedAtMs = 0;
let topicSwitchUserScrollIntentAtMs = 0;
let bootstrapScrollLockToken = 0;
let bootstrapScrollLockReleaseFrameId = 0;
let searchNavigationPositioningReleaseFrameId = 0;
let renderMismatchTelemetryTimeout: ReturnType<typeof setTimeout> | null = null;
let initialMessagesSkeletonTimeoutId: number | null = null;
let initialMessagesSkeletonToken = 0;
let visibleMessagesExpansionTimeoutId: number | null = null;
let visibleMessagesExpansionFrameId: number | null = null;
let visibleMessagesExpansionAppliedToken = 0;
let activeTopicPreviewRefreshTimeoutId: number | null = null;
let activeTopicPreviewRefreshToken = 0;
let activeTopicPreviewRefreshRetryCount = 0;
let activeNotificationRefreshToken = 0;
let isForcedNotificationRefreshPending = false;
let pendingNotificationTopicShellId = '';
let notificationTopicShellReadyFrameId = 0;
let completedTopicSwitchToken = 0;
let isPendingSearchNavigationInProgress = false;
let isPendingSearchNavigationBootstrapInProgress = false;
const ACTIVE_TOPIC_PREVIEW_REFRESH_MAX_RETRIES = 20;

const setTopicMessagesKnownEmpty = (
  topicId: string,
  isKnownEmpty: boolean
): void => {
  if (!topicId) {
    return;
  }

  const isCurrentlyKnownEmpty = knownEmptyMessageTopicIds.value.has(topicId);
  if (isCurrentlyKnownEmpty === isKnownEmpty) {
    return;
  }

  const nextKnownEmptyTopicIds = new Set(knownEmptyMessageTopicIds.value);

  if (isKnownEmpty) {
    nextKnownEmptyTopicIds.add(topicId);
  } else {
    nextKnownEmptyTopicIds.delete(topicId);
  }

  knownEmptyMessageTopicIds.value = nextKnownEmptyTopicIds;
};

const isTopicMessagesKnownEmpty = (topicId?: string): boolean =>
  !!topicId && knownEmptyMessageTopicIds.value.has(topicId);

const waitForMessageListIdle = (): Promise<void> =>
  new Promise(resolve => {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => resolve(), { timeout: 1500 });
      return;
    }

    setTimeout(resolve, 0);
  });

const waitForExpandedTopicFetchDelay = (): Promise<void> =>
  new Promise(resolve => {
    window.setTimeout(() => {
      window.requestAnimationFrame(() => resolve());
    }, TOPIC_SWITCH_EXPANDED_FETCH_DELAY_MS);
  });

const isInsideTopicSwitchUserScrollWindow = (): boolean =>
  !!topicSwitchStartedAtMs &&
  performance.now() - topicSwitchStartedAtMs <=
    TOPIC_SWITCH_USER_SCROLL_INTENT_GRACE_MS;

const markTopicSwitchUserScrollIntent = (): void => {
  if (
    !route.value?.id ||
    route.value.type === RouteTypes.AI ||
    !isInsideTopicSwitchUserScrollWindow()
  ) {
    return;
  }

  topicSwitchUserScrollIntentAtMs = performance.now();
};

const hasTopicSwitchUserScrollIntent = (topicSwitchToken: number): boolean =>
  topicSwitchToken === activeTopicSwitchToken &&
  topicSwitchStartedAtMs > 0 &&
  topicSwitchUserScrollIntentAtMs >= topicSwitchStartedAtMs &&
  topicSwitchUserScrollIntentAtMs - topicSwitchStartedAtMs <=
    TOPIC_SWITCH_USER_SCROLL_INTENT_GRACE_MS;

const cancelBootstrapScrollLockRelease = (): void => {
  if (!bootstrapScrollLockReleaseFrameId) {
    return;
  }

  window.cancelAnimationFrame(bootstrapScrollLockReleaseFrameId);
  bootstrapScrollLockReleaseFrameId = 0;
};

const setBootstrapScrollLock = (
  topicSwitchToken: number,
  locked: boolean
): void => {
  cancelBootstrapScrollLockRelease();
  bootstrapScrollLockToken = locked ? topicSwitchToken : 0;
  isBootstrapScrollLocked.value = locked;
};

const releaseBootstrapScrollLock = (topicSwitchToken?: number): void => {
  if (
    topicSwitchToken !== undefined &&
    topicSwitchToken !== bootstrapScrollLockToken
  ) {
    return;
  }

  cancelBootstrapScrollLockRelease();
  bootstrapScrollLockToken = 0;
  isBootstrapScrollLocked.value = false;
};

const releaseBootstrapScrollLockAfterPaint = (
  topicSwitchToken: number
): void => {
  nextTick(() => {
    if (topicSwitchToken !== activeTopicSwitchToken) {
      return;
    }

    cancelBootstrapScrollLockRelease();
    bootstrapScrollLockReleaseFrameId = window.requestAnimationFrame(() => {
      bootstrapScrollLockReleaseFrameId = 0;
      releaseBootstrapScrollLock(topicSwitchToken);
    });
  });
};

const cancelSearchNavigationPositioningRelease = (): void => {
  if (!searchNavigationPositioningReleaseFrameId) {
    return;
  }

  window.cancelAnimationFrame(searchNavigationPositioningReleaseFrameId);
  searchNavigationPositioningReleaseFrameId = 0;
};

const releaseSearchNavigationPositioning = (): void => {
  cancelSearchNavigationPositioningRelease();
  isSearchNavigationPositioning.value = false;
};

const releaseSearchNavigationPositioningAfterPaint = (
  topicSwitchToken?: number
): void => {
  nextTick(() => {
    if (
      topicSwitchToken !== undefined &&
      topicSwitchToken !== activeTopicSwitchToken
    ) {
      return;
    }

    cancelSearchNavigationPositioningRelease();
    searchNavigationPositioningReleaseFrameId = window.requestAnimationFrame(
      () => {
        searchNavigationPositioningReleaseFrameId = 0;
        isSearchNavigationPositioning.value = false;
      }
    );
  });
};

const clearInitialMessagesSkeletonTimer = (): void => {
  if (initialMessagesSkeletonTimeoutId !== null) {
    window.clearTimeout(initialMessagesSkeletonTimeoutId);
    initialMessagesSkeletonTimeoutId = null;
  }
};

const cancelInitialMessagesSkeletonDelay = (): void => {
  initialMessagesSkeletonToken += 1;
  clearInitialMessagesSkeletonTimer();
};

const resetInitialMessagesSkeleton = (): void => {
  cancelInitialMessagesSkeletonDelay();
  isInitialMessagesSkeletonVisible.value = false;
};

const scheduleNotificationTopicShellReady = (topicId: string): void => {
  pendingNotificationTopicShellId = topicId;
  let positionedFrames = 0;

  if (notificationTopicShellReadyFrameId) {
    return;
  }

  const waitForWebTopicShell = (): void => {
    notificationTopicShellReadyFrameId = 0;

    if (pendingNotificationTopicShellId !== topicId) {
      const nextTopicId = pendingNotificationTopicShellId;

      if (nextTopicId) {
        scheduleNotificationTopicShellReady(nextTopicId);
      }

      return;
    }

    const startupShell = document.getElementById('startup-shell');

    if (!startupShell) {
      initialNotificationPositionReady.value = true;
      pendingNotificationTopicShellId = '';
      return;
    }

    if (route.value?.id !== topicId) {
      pendingNotificationTopicShellId = '';
      return;
    }

    const chatContainer = document.getElementById('chat-container-image');
    const topicHeader = chatContainer?.querySelector(
      '.chat__header .chat__header-profile'
    );
    const messageComposer = chatContainer?.querySelector('.chat__input');
    if (
      initialNotificationPositionMessageId &&
      !initialNotificationPositionReady.value
    ) {
      const target = chatWrapperRef.value?.querySelector<HTMLElement>(
        `[data-message-id="${CSS.escape(initialNotificationPositionMessageId)}"]`
      );
      const bounds = target?.getBoundingClientRect();
      const viewport = chatWrapperRef.value?.getBoundingClientRect();
      const bottom = Math.min(
        viewport?.bottom ?? innerHeight,
        messageComposer?.getBoundingClientRect().top ?? innerHeight
      );
      const positioned =
        bounds &&
        viewport &&
        bounds.height > 0 &&
        bounds.bottom > viewport.top &&
        bounds.top < bottom &&
        getComputedStyle(target!).visibility !== 'hidden';
      positionedFrames = positioned ? positionedFrames + 1 : 0;
      if (positionedFrames >= 2) initialNotificationPositionReady.value = true;
    }
    const isMessageLayerPaintable =
      renderedTopicId.value === topicId &&
      initialNotificationPositionReady.value &&
      !isAwaitingNotificationHistory.value &&
      !isLoadingInitialMessages.value &&
      !shouldRenderUserMessageSkeleton.value;
    const isWebTopicShellPaintable =
      activeTopic.value?.id === topicId &&
      isMessageLayerPaintable &&
      Boolean(chatWrapperRef.value) &&
      Boolean(chatContainer) &&
      Boolean(topicHeader) &&
      isMessageComposerReady.value &&
      (!shouldRenderMessageComposer.value || Boolean(messageComposer));

    if (!isWebTopicShellPaintable) {
      notificationTopicShellReadyFrameId =
        window.requestAnimationFrame(waitForWebTopicShell);
      return;
    }

    pendingNotificationTopicShellId = '';
    dispatchNotificationTopicShellReady();
  };

  nextTick(() => {
    if (
      pendingNotificationTopicShellId !== topicId ||
      notificationTopicShellReadyFrameId
    ) {
      return;
    }

    notificationTopicShellReadyFrameId =
      window.requestAnimationFrame(waitForWebTopicShell);
  });
};

const scheduleInitialMessagesSkeleton = (
  topicId: string,
  topicSwitchToken: number,
  delayMs = TOPIC_SWITCH_SKELETON_DELAY_MS
): void => {
  cancelInitialMessagesSkeletonDelay();
  isInitialMessagesSkeletonVisible.value = false;

  const skeletonToken = ++initialMessagesSkeletonToken;

  const showSkeleton = () => {
    initialMessagesSkeletonTimeoutId = null;

    const hasRenderedRequestedMessages =
      renderedTopicId.value === topicId &&
      renderedUserMessages.value.length > 0;

    if (
      skeletonToken !== initialMessagesSkeletonToken ||
      topicSwitchToken !== activeTopicSwitchToken ||
      route.value?.id !== topicId ||
      !isLoadingInitialMessages.value ||
      isTopicMessagesKnownEmpty(topicId) ||
      hasRenderedRequestedMessages
    ) {
      return;
    }

    isInitialMessagesSkeletonVisible.value = true;
  };
  if (delayMs <= 0) showSkeleton();
  else
    initialMessagesSkeletonTimeoutId = window.setTimeout(showSkeleton, delayMs);
};

const getTopicSwitchFetchLimits = (
  unreadCount: number
): { initialLimit: number; expandedLimit: number } => {
  const unreadWindowLimit = unreadCount + 20;
  const expandedLimit = isMobile.value
    ? Math.min(
        MOBILE_MAX_VISIBLE_MESSAGES_LIMIT,
        Math.max(MOBILE_EXPANDED_MESSAGES_LIMIT, unreadWindowLimit)
      )
    : Math.min(
        250,
        Math.max(DESKTOP_INITIAL_MESSAGES_LIMIT, unreadWindowLimit)
      );
  const initialLimit = TOPIC_SWITCH_BOOTSTRAP_MESSAGES_LIMIT;

  if (!isMobile.value) {
    return {
      initialLimit,
      expandedLimit
    };
  }

  return {
    initialLimit: Math.min(
      Math.max(MOBILE_INITIAL_MESSAGES_LIMIT, initialLimit),
      MOBILE_MAX_INITIAL_MESSAGES_LIMIT
    ),
    expandedLimit
  };
};

const getFastInitialMessagesLimit = (
  unreadCount: number,
  initialLimit: number
): number => {
  if (!isMobile.value) {
    return initialLimit;
  }

  const unreadAwareLimit =
    unreadCount > 0
      ? Math.min(MOBILE_FAST_MAX_INITIAL_MESSAGES_LIMIT, unreadCount + 8)
      : MOBILE_FAST_INITIAL_MESSAGES_LIMIT;

  // Первый кадр покрывает экран; остальная история уже загружается одним запросом.
  const viewportLimit = Math.min(
    MOBILE_FAST_MAX_INITIAL_MESSAGES_LIMIT,
    Math.ceil(window.innerHeight / 32) + 2
  );

  return Math.min(
    initialLimit,
    Math.max(
      MOBILE_FAST_INITIAL_MESSAGES_LIMIT,
      viewportLimit,
      unreadAwareLimit
    )
  );
};

const getMessageVersionTimestamp = (
  message?: Partial<IMessage> | null
): number => {
  if (!message) {
    return 0;
  }

  return Math.max(
    0,
    ...[message.updatedAt, message.deletedAt, message.createdAt]
      .map(value => (value ? new Date(value as string | Date).getTime() : 0))
      .filter(value => Number.isFinite(value))
  );
};

const getActiveTopicLastMessageFingerprint = computed(() => {
  const lastMessage = activeTopic.value?.lastMessage;

  if (!route.value?.id || !lastMessage?.id) {
    return `${route.value?.id || ''}:no-last-message`;
  }

  return [
    route.value.id,
    lastMessage.id,
    lastMessage.senderUserId || '',
    lastMessage.updatedAt || '',
    lastMessage.deletedAt || '',
    lastMessage.text || ''
  ].join(':');
});

const shouldRefreshActiveTopicFromPreview = (topicId: string): boolean => {
  const lastMessage = activeTopic.value?.lastMessage;

  if (
    !topicId ||
    route.value?.id !== topicId ||
    route.value?.type === RouteTypes.AI ||
    isLoadingInitialMessages.value ||
    activeTopicSwitchToken !== completedTopicSwitchToken ||
    !getHasBrowserNetwork() ||
    !lastMessage?.id
  ) {
    return false;
  }

  const fullMessages = getFullMessagesByTopicId(topicId);
  const visibleMessages = getMessagesByTopicId(topicId);
  const latestFullMessage = fullMessages.at(-1);
  const latestVisibleMessage = visibleMessages.at(-1);
  const matchingFullMessage = fullMessages.find(
    message => message.id === lastMessage.id
  );
  const matchingVisibleMessage = visibleMessages.find(
    message => message.id === lastMessage.id
  );

  if (!matchingFullMessage) {
    return true;
  }

  if (latestFullMessage?.id && latestFullMessage.id !== lastMessage.id) {
    return true;
  }

  if (
    latestVisibleMessage?.id &&
    scrollAnchor.viewportMode.value === 'live' &&
    latestVisibleMessage.id !== lastMessage.id
  ) {
    return true;
  }

  const previewVersion = getMessageVersionTimestamp(lastMessage);
  const localVersion = getMessageVersionTimestamp(matchingFullMessage);

  if (previewVersion > 0 && localVersion > 0 && localVersion < previewVersion) {
    return true;
  }

  if (
    typeof lastMessage.text === 'string' &&
    typeof matchingFullMessage.text === 'string' &&
    lastMessage.text !== matchingFullMessage.text
  ) {
    return true;
  }

  return (
    scrollAnchor.viewportMode.value === 'live' &&
    !!matchingFullMessage &&
    !matchingVisibleMessage
  );
};

const refreshActiveTopicFromPreview = async (
  topicId: string,
  reason: string
): Promise<void> => {
  if (!shouldRefreshActiveTopicFromPreview(topicId)) {
    return;
  }

  if (!getChatSDK()) {
    if (
      activeTopicPreviewRefreshRetryCount <
      ACTIVE_TOPIC_PREVIEW_REFRESH_MAX_RETRIES
    ) {
      activeTopicPreviewRefreshRetryCount += 1;
      activeTopicPreviewRefreshTimeoutId = window.setTimeout(() => {
        activeTopicPreviewRefreshTimeoutId = null;
        void refreshActiveTopicFromPreview(topicId, reason).catch(error => {
          console.warn('Failed to refresh active topic from preview:', error);
        });
      }, 250);
    }

    return;
  }

  resetActiveTopicPreviewRefreshRetries();
  const refreshToken = ++activeTopicPreviewRefreshToken;
  const unreadCount = getTopicUnreadBadgeCount(
    getSelectedTopic(topicId),
    authUser.value?.id
  );
  const { expandedLimit } = getTopicSwitchFetchLimits(unreadCount);
  const visibleLimit = expandedLimit;
  const shouldKeepBottomPosition = shouldKeepCurrentTopicBottomPosition();

  console.info('chat.active_topic_preview_refresh.started', {
    topicId,
    reason
  });

  const messages = await fetchMessagesForTopic(topicId, {
    limit: expandedLimit,
    forceRefresh: true,
    forceNetwork: true,
    allowStaleFallback: false,
    visibleLimit,
    updateVisible: false
  });

  if (
    refreshToken !== activeTopicPreviewRefreshToken ||
    route.value?.id !== topicId
  ) {
    return;
  }

  if (!messages.length) {
    console.info('chat.active_topic_preview_refresh.empty', {
      topicId,
      reason
    });
    return;
  }

  const shouldApplyVisibleRefresh =
    shouldKeepBottomPosition && shouldKeepCurrentTopicBottomPosition();

  if (shouldApplyVisibleRefresh) {
    setVisibleMessagesLimitForTopic(topicId, visibleLimit, {
      allowShrink: false
    });
  }

  renderedTopicId.value = topicId;
  await nextTick();

  if (
    refreshToken !== activeTopicPreviewRefreshToken ||
    route.value?.id !== topicId
  ) {
    return;
  }

  if (shouldApplyVisibleRefresh) {
    scrollToBottom({
      preferUnreadMarker: false,
      smooth: false
    });
  }

  setupIntersectionObserver();
  syncVisibleUnreadAfterAutoScroll();
  console.info('chat.active_topic_preview_refresh.completed', {
    topicId,
    reason,
    messageCount: messages.length
  });
};

interface NotificationTopicMessagesResult {
  messages: IMessage[];
  visibleLimit: number;
  isFresh: boolean;
}

const reconcileNotificationTopicMessages = async (
  topicId: string,
  limit: number,
  notificationMessageId?: string
): Promise<NotificationTopicMessagesResult> => {
  const residentMessagesBeforeFetch = [...getFullMessagesByTopicId(topicId)];
  let isFresh = false;
  const latestMessages = await fetchMessagesForTopic(topicId, {
    limit,
    newMessages: true,
    notificationMessageId,
    forceRefresh: true,
    forceNetwork: true,
    skipSave: true,
    allowStaleFallback: false,
    onNetworkApplied: () => {
      isFresh = true;
    },
    visibleLimit: limit,
    updateVisible: false
  });
  // Обычно уведомление уже входит в последнюю страницу. Старый контекст
  // не требует загрузки всех промежуточных страниц до показа чата.
  const notificationContext = needsNotificationMessageContext(
    notificationMessageId,
    latestMessages,
    residentMessagesBeforeFetch,
    getFullMessagesByTopicId(topicId)
  )
    ? fetchAroundMessage(notificationMessageId, topicId, {
        updateVisible: false,
        forceNetwork: true
      })
    : Promise.resolve([] as IMessage[]);
  const contextMessages = await notificationContext;

  // A topic can still be in history mode while the notification request is in
  // flight. Flush messages buffered by the WebSocket before choosing the
  // visible latest window, otherwise the first of two quick messages can stay
  // behind the skeleton until another scroll or refresh.
  setSuspendIncomingMergeForTopic(topicId, false);
  const bufferedMessages = consumeBufferedIncomingMessagesForTopic(topicId);
  const reconciledMessages = mergeNotificationMessageSnapshots(
    residentMessagesBeforeFetch,
    latestMessages,
    contextMessages,
    bufferedMessages,
    getFullMessagesByTopicId(topicId)
  );
  const visibleLimit = limit;

  if (reconciledMessages.length > 0) {
    mergeMessagesForTopic(topicId, reconciledMessages, 'replace', {
      syncLastMessage: false,
      windowMode: 'latest',
      visibleLimit,
      updateVisible: false
    });
  }

  return {
    messages: reconciledMessages,
    visibleLimit,
    isFresh
  };
};

const refreshActiveTopicFromNotification = async (
  topicId: string,
  forceScrollToBottom: boolean,
  notificationMessageId?: string
): Promise<void> => {
  if (!forceScrollToBottom && isForcedNotificationRefreshPending) {
    return;
  }

  const refreshToken = ++activeNotificationRefreshToken;

  if (forceScrollToBottom) {
    isForcedNotificationRefreshPending = true;
    const hasMessages = getMessagesByTopicId(topicId).length > 0;
    isLoadingInitialMessages.value = !hasMessages;
    renderedTopicId.value = hasMessages ? topicId : '';
    if (hasMessages) resetInitialMessagesSkeleton();
    else scheduleInitialMessagesSkeleton(topicId, activeTopicSwitchToken);
    scheduleNotificationTopicShellReady(topicId);
  }

  const unreadCount = getTopicUnreadBadgeCount(
    getSelectedTopic(topicId),
    authUser.value?.id
  );
  const { expandedLimit } = getTopicSwitchFetchLimits(unreadCount);
  if (forceScrollToBottom && getMessagesByTopicId(topicId).length > 0) {
    setVisibleMessagesLimitForTopic(topicId, expandedLimit, {
      allowShrink: true
    });
    void nextTick(() => {
      if (
        refreshToken === activeNotificationRefreshToken &&
        route.value?.id === topicId
      ) {
        scrollToBottom({ preferUnreadMarker: false, smooth: false });
      }
    });
  }
  try {
    const { visibleLimit, isFresh } = await reconcileNotificationTopicMessages(
      topicId,
      expandedLimit,
      notificationMessageId
    );

    if (
      refreshToken !== activeNotificationRefreshToken ||
      route.value?.id !== topicId
    ) {
      return;
    }

    const shouldApplyVisibleRefresh =
      forceScrollToBottom || isCurrentTopicNearBottomNow();

    if (shouldApplyVisibleRefresh) {
      setVisibleMessagesLimitForTopic(topicId, visibleLimit, {
        allowShrink: forceScrollToBottom
      });
    }

    renderedTopicId.value = topicId;

    if (forceScrollToBottom) {
      state.errorMessage = isFresh
        ? ''
        : 'Не удалось обновить сообщения. Показана сохранённая переписка.';
      resolveNotificationHistoryPaint(
        topicId,
        notificationMessageId || '',
        getRenderedTopicMessages(topicId, getMessagesByTopicId(topicId)).at(-1)
          ?.id || '',
        isFresh
      );
    }

    if (forceScrollToBottom) {
      isLoadingInitialMessages.value = false;
      resetInitialMessagesSkeleton();
    }

    await nextTick();

    if (
      refreshToken !== activeNotificationRefreshToken ||
      route.value?.id !== topicId
    ) {
      return;
    }

    if (shouldApplyVisibleRefresh) {
      scrollToBottom({
        preferUnreadMarker: false,
        smooth: false
      });
    }

    setupIntersectionObserver();
    syncVisibleUnreadAfterAutoScroll();
  } finally {
    if (refreshToken === activeNotificationRefreshToken) {
      isForcedNotificationRefreshPending = false;

      if (forceScrollToBottom && route.value?.id === topicId) {
        isLoadingInitialMessages.value = false;
        resetInitialMessagesSkeleton();
      }
    }
  }
};

const scheduleActiveTopicPreviewRefresh = (reason: string): void => {
  if (activeTopicPreviewRefreshTimeoutId !== null) {
    window.clearTimeout(activeTopicPreviewRefreshTimeoutId);
  }

  activeTopicPreviewRefreshTimeoutId = window.setTimeout(() => {
    activeTopicPreviewRefreshTimeoutId = null;
    const topicId = route.value?.id || '';

    void refreshActiveTopicFromPreview(topicId, reason).catch(error => {
      console.warn('Failed to refresh active topic from preview:', error);
    });
  }, 80);
};

const resetActiveTopicPreviewRefreshRetries = (): void => {
  activeTopicPreviewRefreshRetryCount = 0;
};

const clearVisibleMessagesExpansionSchedule = (): void => {
  if (visibleMessagesExpansionTimeoutId !== null) {
    window.clearTimeout(visibleMessagesExpansionTimeoutId);
    visibleMessagesExpansionTimeoutId = null;
  }

  if (visibleMessagesExpansionFrameId !== null) {
    window.cancelAnimationFrame(visibleMessagesExpansionFrameId);
    visibleMessagesExpansionFrameId = null;
  }
};

const scheduleVisibleMessagesExpansion = (
  topicId: string,
  visibleLimit: number,
  topicSwitchToken: number
): void => {
  if (!isMobile.value || !topicId) {
    return;
  }

  clearVisibleMessagesExpansionSchedule();
  visibleMessagesExpansionTimeoutId = window.setTimeout(() => {
    visibleMessagesExpansionTimeoutId = null;

    visibleMessagesExpansionFrameId = window.requestAnimationFrame(() => {
      visibleMessagesExpansionFrameId = null;

      if (
        topicSwitchToken !== activeTopicSwitchToken ||
        route.value?.id !== topicId ||
        hasTopicSwitchUserScrollIntent(topicSwitchToken)
      ) {
        return;
      }

      if (document.getElementById('startup-shell')) {
        scheduleVisibleMessagesExpansion(
          topicId,
          visibleLimit,
          topicSwitchToken
        );
        return;
      }

      const shouldPinToBottom =
        shouldKeepTopicSwitchBottomPosition(topicSwitchToken);
      const viewportMutation = scrollAnchor.beginViewportMutation('prepend', {
        forcePreserve: !shouldPinToBottom,
        forcePinBottom: shouldPinToBottom
      });
      setVisibleMessagesLimitForTopic(topicId, visibleLimit, {
        allowShrink: false
      });
      visibleMessagesExpansionAppliedToken = topicSwitchToken;

      nextTick(() => {
        if (
          topicSwitchToken !== activeTopicSwitchToken ||
          route.value?.id !== topicId
        ) {
          scrollAnchor.commitViewportMutation(viewportMutation.revision);
          return;
        }

        scrollAnchor.commitViewportMutation(viewportMutation.revision);
        setupIntersectionObserver();

        if (
          !shouldPinToBottom ||
          !shouldKeepTopicSwitchBottomPosition(topicSwitchToken)
        ) {
          return;
        }

        scrollToBottom({
          preferUnreadMarker: false,
          smooth: false
        });
        syncVisibleUnreadAfterAutoScroll();
      });
    });
  }, MOBILE_VISIBLE_EXPAND_DELAY_MS);
};

const scheduleExpandedTopicMessagesFetch = (
  topicId: string,
  limit: number,
  initialFetch: Promise<IMessage[]>,
  isStaleTopicSwitch: () => boolean,
  topicSwitchToken: number
): void => {
  void initialFetch
    .then(waitForExpandedTopicFetchDelay)
    .then(async () => {
      if (isStaleTopicSwitch()) {
        return;
      }

      if (document.visibilityState !== 'visible') {
        releaseBootstrapScrollLockAfterPaint(topicSwitchToken);
        return;
      }

      await fetchMessagesForTopic(topicId, {
        limit,
        maxAgeMs: TOPIC_SWITCH_CACHE_MAX_AGE_MS,
        forceRefresh: true,
        forceNetwork: getHasBrowserNetwork(),
        allowStaleFallback: !getHasBrowserNetwork(),
        visibleLimit: limit,
        updateVisible: false
      });

      if (isStaleTopicSwitch()) {
        return;
      }

      const shouldApplyExpandedWindow =
        isCurrentTopicNearBottomNow() &&
        shouldKeepTopicSwitchBottomPosition(topicSwitchToken);

      if (shouldApplyExpandedWindow) {
        setVisibleMessagesLimitForTopic(topicId, limit, {
          allowShrink: false
        });
        await nextTick();
        scrollToBottom({
          preferUnreadMarker: false,
          smooth: false
        });
      }

      releaseBootstrapScrollLockAfterPaint(topicSwitchToken);
    })
    .catch(error => {
      console.warn('Failed to fetch expanded topic messages:', error);

      if (!isStaleTopicSwitch()) {
        releaseBootstrapScrollLockAfterPaint(topicSwitchToken);
      }
    });
};

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

const isAiNearBottom = ref(true);

const scrollAiToBottom = (): void => {
  const container = chatWrapperRef.value;
  if (!container || !isAiRoute.value) {
    return;
  }

  container.scrollTop = Math.max(
    0,
    container.scrollHeight - container.clientHeight
  );
  isAiNearBottom.value = true;
};

const handleAiScroll = (): void => {
  const container = chatWrapperRef.value;
  if (!container || !isAiRoute.value) {
    return;
  }

  scrollAnchor.onScroll();
  const maxScroll = Math.max(
    0,
    container.scrollHeight - container.clientHeight
  );
  isAiNearBottom.value = maxScroll - container.scrollTop <= 120;
};

watch(
  () => state.aiMessages.length,
  () => {
    if (!isAiRoute.value || !isAiNearBottom.value) {
      return;
    }

    nextTick(() => requestAnimationFrame(scrollAiToBottom));
  },
  { flush: 'pre' }
);

watch(
  [() => renderedTopicId.value, () => renderedUserMessages.value.length],
  ([topicId, messageCount], [previousTopicId, previousMessageCount]) => {
    if (topicId && messageCount > 0) {
      setTopicMessagesKnownEmpty(topicId, false);
      return;
    }

    if (
      topicId &&
      topicId === route.value.id &&
      topicId === previousTopicId &&
      previousMessageCount > 0 &&
      isFavoriteMessageTopic.value &&
      !isLoadingInitialMessages.value
    ) {
      setTopicMessagesKnownEmpty(topicId, true);
      resetInitialMessagesSkeleton();
    }
  }
);

const syncFloatingDateDivider = (): void => {
  const container = chatWrapperRef.value;

  if (!container) {
    floatingDateDividerLabel.value = '';
    isFloatingDateDividerHidden.value = false;
    isFloatingDateDividerActive.value = false;
    return;
  }

  const isScrollable = container.scrollHeight > container.clientHeight + 1;
  const isFavoriteTopicAtStart =
    isFavoriteMessageTopic.value && container.scrollTop <= 1;

  if (
    isFavoriteTopicAtStart ||
    ((!isScrollable || isViewingBottom.value) && !isNativeAndroid)
  ) {
    floatingDateDividerLabel.value = '';
    isFloatingDateDividerHidden.value = false;
    isFloatingDateDividerActive.value = false;
    return;
  }

  const snapshot = messageListUserItemsRef.value?.getVisibleMessageSnapshot?.();
  const firstVisibleMessage = snapshot
    ? renderedUserMessages.value[snapshot.firstVisibleIndex]
    : undefined;

  if (!firstVisibleMessage) {
    floatingDateDividerLabel.value = '';
    isFloatingDateDividerHidden.value = false;
    isFloatingDateDividerActive.value = false;
    return;
  }

  const createdAt = firstVisibleMessage.createdAt;
  const createdDate =
    createdAt instanceof Date ? createdAt : new Date(createdAt || 0);

  floatingDateDividerLabel.value = formatDay(createdDate);
  isFloatingDateDividerHidden.value = false;
};

const scheduleFloatingDateDividerSync = (): void => {
  if (floatingDateDividerRafId) {
    return;
  }

  floatingDateDividerRafId = requestAnimationFrame(() => {
    floatingDateDividerRafId = 0;
    syncFloatingDateDivider();
  });
};

const hideFloatingDateDivider = (): void => {
  if (floatingDateDividerHideTimeoutId !== null) {
    window.clearTimeout(floatingDateDividerHideTimeoutId);
    floatingDateDividerHideTimeoutId = null;
  }

  floatingDateDividerLabel.value = '';
  isFloatingDateDividerActive.value = false;
};

const keepFloatingDateDividerVisibleBriefly = (): void => {
  isFloatingDateDividerActive.value = true;

  if (floatingDateDividerHideTimeoutId !== null) {
    window.clearTimeout(floatingDateDividerHideTimeoutId);
  }

  floatingDateDividerHideTimeoutId = window.setTimeout(() => {
    isFloatingDateDividerActive.value = false;
    floatingDateDividerHideTimeoutId = null;
  }, FLOATING_DATE_VISIBLE_MS);
};

const markFloatingDateDividerUserScrollIntent = (): boolean => {
  if (isBootstrapScrollLocked.value || isSearchNavigationPositioning.value) {
    return false;
  }

  markTopicSwitchUserScrollIntent();
  floatingDateDividerUserScrollIntentAt = performance.now();
  return true;
};

const handleFloatingDateDividerUserScroll = (): void => {
  if (!markFloatingDateDividerUserScrollIntent()) {
    return;
  }

  keepFloatingDateDividerVisibleBriefly();
  scheduleFloatingDateDividerSync();
};

const {
  isShowScrollToBottomButton,
  viewportRevision,
  isLoadingInitialMessages,
  isLoadingOlderMessages,
  isLoadingNewerMessages,
  scrollState,
  handleScroll: handleMessageScroll,
  handleTouchStart: handleMessageScrollTouchStart,
  handleTouchMove: handleMessageScrollTouchMove,
  handleTouchEnd: handleMessageScrollTouchEnd,
  handleTouchCancel: handleMessageScrollTouchCancel,
  handleScrollEnd: handleMessageScrollEnd,
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

const handleUserMessageTouchStart = (event: TouchEvent): void => {
  onTouchStart(event);
  markFloatingDateDividerUserScrollIntent();
  handleMessageScrollTouchStart(event);
};

const handleUserMessageTouchMove = (event: TouchEvent): void => {
  handleFloatingDateDividerUserScroll();
  handleMessageScrollTouchMove(event);
};

const handleUserMessageTouchEnd = (event: TouchEvent): void => {
  onTouchEnd(event);
  handleMessageScrollTouchEnd();
};

const handleUserMessageTouchCancel = (): void => {
  handleMessageScrollTouchCancel();
};

const shouldKeepTopicSwitchBottomPosition = (
  topicSwitchToken: number
): boolean =>
  scrollAnchor.viewportMode.value !== 'jump' &&
  (!state.unreadMarkerMessageId ||
    scrollAnchor.viewportMode.value === 'live') &&
  !hasTopicSwitchUserScrollIntent(topicSwitchToken) &&
  (completedTopicSwitchToken !== topicSwitchToken ||
    isCurrentTopicNearBottomNow());

const shouldKeepCurrentTopicBottomPosition = (): boolean =>
  scrollAnchor.viewportMode.value !== 'jump' &&
  (!state.unreadMarkerMessageId ||
    scrollAnchor.viewportMode.value === 'live') &&
  !hasTopicSwitchUserScrollIntent(activeTopicSwitchToken) &&
  isCurrentTopicNearBottomNow();

const hasVisibleUserMessages = computed(
  () => renderedUserMessages.value.length > 0
);
const isUserMessagesRoute = computed(
  () => !isAiRoute.value && !isDefaultRoute.value
);
const shouldProtectEmptyUserMessagesWithSkeleton = computed(
  () =>
    !!route.value.id &&
    route.value.type !== RouteTypes.CALL &&
    isUserMessagesRoute.value &&
    !isActiveCallTopic.value &&
    isInitialMessagesSkeletonVisible.value &&
    !hasVisibleUserMessages.value &&
    !isTopicMessagesKnownEmpty(route.value.id)
);
const shouldRenderAiMessageSkeleton = computed(() => props.deferContentRender);
const shouldShowDelayedInitialSkeleton = computed(
  () =>
    !hasVisibleUserMessages.value &&
    isInitialMessagesSkeletonVisible.value &&
    (isLoadingInitialMessages.value || isAwaitingUserMessagesPaint.value)
);
const shouldShowSearchNavigationSkeleton = computed(
  () => isUserMessagesRoute.value && isSearchNavigationPositioning.value
);
const shouldRenderUserMessageSkeleton = computed(
  () =>
    props.deferContentRender ||
    (!isActiveCallTopic.value &&
      (shouldShowSearchNavigationSkeleton.value ||
        shouldProtectEmptyUserMessagesWithSkeleton.value ||
        (isUserMessagesRoute.value && shouldShowDelayedInitialSkeleton.value)))
);
const shouldDeferUserMessageContentLayout = computed(
  () =>
    props.deferContentRender ||
    (!isActiveCallTopic.value &&
      (shouldProtectEmptyUserMessagesWithSkeleton.value ||
        (isUserMessagesRoute.value && shouldShowDelayedInitialSkeleton.value)))
);
const shouldLockUserMessageBootstrapScroll = computed(
  () =>
    isBootstrapScrollLocked.value &&
    isUserMessagesRoute.value &&
    !shouldRenderUserMessageSkeleton.value
);
const shouldMountUserMessageItems = computed(
  () => !props.deferContentRender && isUserMessagesRoute.value
);
const shouldCoverUserMessagesWithSkeleton = computed(
  () => shouldRenderUserMessageSkeleton.value && hasVisibleUserMessages.value
);
const shouldRenderEmptyUserMessageState = computed(
  () =>
    isUserMessagesRoute.value &&
    renderedTopicId.value === route.value.id &&
    !hasVisibleUserMessages.value &&
    !isActiveCallTopic.value &&
    isTopicMessagesKnownEmpty(route.value.id) &&
    !shouldRenderUserMessageSkeleton.value
);
const shouldShowOlderMessagesLoading = computed(
  () => !shouldRenderUserMessageSkeleton.value && isLoadingOlderMessages.value
);
const shouldShowNewerMessagesLoading = computed(
  () => !shouldRenderUserMessageSkeleton.value && isLoadingNewerMessages.value
);

const emitPinnedViewportSnapshot = (): void => {
  if (
    !isUserMessagesRoute.value ||
    shouldRenderUserMessageSkeleton.value ||
    !messageListUserItemsRef.value
  ) {
    emit('viewport-snapshot-change', null);
    return;
  }

  emit(
    'viewport-snapshot-change',
    messageListUserItemsRef.value.getVisibleMessageSnapshot?.() || null
  );
};

const schedulePinnedViewportSnapshotSync = (): void => {
  if (pinnedViewportSnapshotRafId || pinnedViewportSnapshotTimeoutId !== null) {
    return;
  }

  const scheduleFrame = (): void => {
    pinnedViewportSnapshotRafId = requestAnimationFrame(() => {
      pinnedViewportSnapshotRafId = 0;
      lastPinnedViewportSnapshotAt = performance.now();
      emitPinnedViewportSnapshot();
    });
  };
  const elapsed = performance.now() - lastPinnedViewportSnapshotAt;
  const delay = Math.max(0, PINNED_VIEWPORT_SNAPSHOT_INTERVAL_MS - elapsed);

  if (delay === 0) {
    scheduleFrame();
    return;
  }

  pinnedViewportSnapshotTimeoutId = window.setTimeout(() => {
    pinnedViewportSnapshotTimeoutId = null;
    scheduleFrame();
  }, delay);
};

const emitRenderedTopicState = (): void => {
  const topicId = renderedTopicId.value || null;
  const routeTopicId = route.value.id || null;
  const isCurrent = !!topicId && topicId === routeTopicId;
  const hasPaintedCurrentMessages =
    hasVisibleUserMessages.value &&
    paintedUserMessageTopicId.value === routeTopicId;

  emit('rendered-topic-change', {
    topicId,
    routeTopicId,
    messageCount: state.messages.length,
    isCurrent,
    isReady:
      isCurrent &&
      isMessageComposerReady.value &&
      initialNotificationPositionReady.value &&
      !isAwaitingNotificationHistory.value &&
      !shouldRenderUserMessageSkeleton.value &&
      (hasPaintedCurrentMessages || !isLoadingInitialMessages.value)
  });
};

const handleBottomBarHeightChange = (height: number): void => {
  const nextHeight = Math.max(0, Math.ceil(height));
  const shouldKeepBottomPinned =
    isUserMessagesRoute.value &&
    !shouldRenderUserMessageSkeleton.value &&
    shouldKeepCurrentTopicBottomPosition() &&
    (isViewingBottom.value || scrollAnchor.isNearBottom.value);

  if (bottomBarHeight.value === nextHeight) {
    return;
  }

  bottomBarHeight.value = nextHeight;

  if (!shouldKeepBottomPinned) {
    return;
  }

  nextTick(() => {
    requestAnimationFrame(() => {
      if (!isUserMessagesRoute.value || !chatWrapperRef.value) {
        return;
      }

      if (!shouldKeepCurrentTopicBottomPosition()) {
        return;
      }

      scrollToBottom({
        preferUnreadMarker: false,
        smooth: false
      });
      syncVisibleUnreadAfterAutoScroll();
    });
  });
};

const handleInputHeightChange = (height: number): void => {
  if (height === 0 && isSelectionMode.value) {
    return;
  }

  handleBottomBarHeightChange(height);
};

const handleToggleCallTopicActions = (): void => {
  const shouldOpen = !isCallTopicActionsOpen.value;
  isCallTopicActionsOpen.value = shouldOpen;

  if (!shouldOpen) {
    return;
  }

  nextTick(() => {
    requestAnimationFrame(() => {
      scrollToBottom({
        preferUnreadMarker: false,
        smooth: false
      });
    });
  });
};

const handleSelectedMessagesHeightChange = (height: number): void => {
  if (height === 0 && !isSelectionMode.value) {
    return;
  }

  handleBottomBarHeightChange(height);
};

watch(isDeletedAccountTopic, value => {
  if (value) {
    handleBottomBarHeightChange(0);
  }
});

const getTopicSwitchLatencyMs = (): number | undefined => {
  if (!topicSwitchStartedAtMs) {
    return undefined;
  }

  return Math.round(performance.now() - topicSwitchStartedAtMs);
};

const scheduleRenderMismatchTelemetry = (): void => {
  if (renderMismatchTelemetryTimeout) {
    clearTimeout(renderMismatchTelemetryTimeout);
    renderMismatchTelemetryTimeout = null;
  }

  const routeTopicId = route.value?.id || '';
  const routeType = route.value?.type || null;
  const currentRenderedTopicId = renderedTopicId.value;

  if (
    !routeTopicId ||
    routeType === RouteTypes.AI ||
    !currentRenderedTopicId ||
    currentRenderedTopicId === routeTopicId
  ) {
    return;
  }

  renderMismatchTelemetryTimeout = setTimeout(() => {
    renderMismatchTelemetryTimeout = null;

    if (
      route.value?.id !== routeTopicId ||
      renderedTopicId.value !== currentRenderedTopicId
    ) {
      return;
    }

    recordChatMessageListRenderMismatch({
      routeTopicId,
      routeType,
      renderedTopicId: currentRenderedTopicId,
      messageCount: state.messages.length,
      isLoadingInitialMessages: isLoadingInitialMessages.value,
      switchToken: activeTopicSwitchToken,
      latencyMs: getTopicSwitchLatencyMs()
    });
  }, 900);
};

const handleUserMessagesContentReady = (payload?: {
  topicId?: string;
  messageCount?: number;
}): void => {
  if (
    props.deferContentRender ||
    payload?.topicId !== route.value.id ||
    !payload?.messageCount
  ) {
    return;
  }

  paintedUserMessageTopicId.value = payload.topicId;

  if (
    !isAwaitingUserMessagesPaint.value &&
    !isInitialMessagesSkeletonVisible.value &&
    !isLoadingInitialMessages.value
  ) {
    return;
  }

  isAwaitingUserMessagesPaint.value = false;
  resetInitialMessagesSkeleton();

  nextTick(() => {
    if (route.value.id !== payload.topicId) {
      return;
    }

    if (shouldKeepCurrentTopicBottomPosition()) {
      scrollToBottom({
        preferUnreadMarker: false,
        smooth: false
      });
    }

    setupIntersectionObserver();
    scheduleFloatingDateDividerSync();
    syncVisibleUnreadAfterAutoScroll();
    void handlePendingSearchNavigation();
  });
};

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
  state.forwardMessages = [...pendingForwardMessages.value];
  nextTick(() => {
    messageListInputRef.value?.focus();
  });
};

/** Добавляет перенесённый внешний текст в редактор выбранного обычного чата. */
const applyPendingMessageDraft = (): void => {
  const transferredText = consumePendingMessageDraft(route.value?.id);
  if (!transferredText) return;

  state.replyMessage = null;
  state.editMessage = null;
  state.forwardMessages = [];
  inputText.value = inputText.value.trim()
    ? `${inputText.value}\n\n${transferredText}`
    : transferredText;
  nextTick(() => messageListInputRef.value?.focus());
};

const activeForwardMessages = computed(() => {
  if (state.forwardMessages.length > 0) {
    return state.forwardMessages;
  }

  return pendingForwardTopicId.value === route.value.id
    ? pendingForwardMessages.value
    : [];
});

const warmVisibleTopicMedia = async (topicId: string) => {
  const visibleMessages = getMessagesByTopicId(topicId);
  const mediaPaths = new Set<string>();

  for (const message of visibleMessages) {
    for (const media of message.media || []) {
      // Prewarming a generic file downloads its complete body. A history with
      // several large ZIP files can therefore saturate the browser connection
      // before a new multipart PUT is even opened. Only warm lightweight
      // visual sources; documents are fetched explicitly after a click.
      const preferredPath =
        media.thumbnailPath ||
        (media.type === MediaType.Image ? media.path : null);

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

const scheduleVisibleTopicMediaWarm = (
  topicId: string,
  isStaleTopicSwitch: () => boolean
): void => {
  window.requestAnimationFrame(() => {
    if (isStaleTopicSwitch()) {
      return;
    }

    void waitForMessageListIdle()
      .then(() => {
        if (!isStaleTopicSwitch()) {
          return warmVisibleTopicMedia(topicId);
        }
      })
      .catch(error => {
        console.warn('Failed to warm visible topic media:', error);
      });
  });
};

const refreshUnreadMarkerState = (force = false) => {
  if (isLoadingInitialMessages.value && !force) return;
  if (!route.value?.id) {
    state.unreadMarkerMessageId = null;
    state.hideUnreadMarker = true;
    return;
  }

  // Граница относится к текущему открытию чата и не сдвигается от read-receipt.
  const firstUnreadMessageId =
    unreadMarkerMessageIdsByTopic[route.value.id] || getFirstUnreadMessageId();
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
  allowOptimisticTarget?: boolean;
  scrollBehavior?: MessageScrollBehavior;
};

type MessageScrollBehavior = 'auto' | 'instant' | 'smooth';
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

const getScrollTargetAllowOptimisticTarget = (
  payload: ScrollToMessagePayload
): boolean =>
  isScrollToMessageObjectPayload(payload) &&
  payload.allowOptimisticTarget === true;

const getScrollTargetBehavior = (
  payload: ScrollToMessagePayload
): MessageScrollBehavior =>
  isScrollToMessageObjectPayload(payload)
    ? payload.scrollBehavior || 'smooth'
    : 'smooth';

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
  const container = chatWrapperRef.value;
  const containerRect = container.getBoundingClientRect();
  const highlightRect = highlightMark.getBoundingClientRect();
  const maxScroll = Math.max(
    0,
    container.scrollHeight - container.clientHeight
  );
  const targetScrollTop = Math.min(
    maxScroll,
    Math.max(
      0,
      container.scrollTop +
        highlightRect.top +
        highlightRect.height / 2 -
        (containerRect.top + containerRect.height / 2)
    )
  );

  container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });

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
  quoteOccurrenceIndex?: number,
  behavior: MessageScrollBehavior = 'smooth',
  isCurrent = () => true
): Promise<boolean> => {
  await messageListUserItemsRef.value?.ensureMessageRendered?.(messageId);

  if (!isCurrent()) return false;
  const didJump = await scrollAnchor.jumpToMessage(messageId, {
    block: 'center',
    behavior,
    isCurrent
  });

  if (!didJump || !isCurrent()) {
    return false;
  }

  highlightWholeMessage(messageId);
  highlightMessageQuote(messageId, quoteText, quoteOccurrenceIndex);

  return true;
};

const refreshAroundMessageAfterOptimisticJump = async (
  topicId: string,
  messageId: string,
  isCurrent: () => boolean
): Promise<void> => {
  const anchor = scrollAnchor.captureViewportAnchor(messageId);
  const mutation = scrollAnchor.beginViewportMutation('replace', {
    forcePreserve: true,
    preferredMessageId: messageId
  });
  const messages = await fetchAroundMessage(messageId, topicId, {
    updateVisible: false,
    forceNetwork: getHasBrowserNetwork()
  });

  if (!isCurrent()) return;

  if (route.value.id !== topicId) {
    scrollAnchor.commitViewportMutation(mutation.revision, {
      forceAnchor: anchor
    });
    return;
  }

  if (!messages?.some(message => message.id === messageId)) {
    scrollAnchor.commitViewportMutation(mutation.revision, {
      forceAnchor: anchor
    });
    return;
  }

  mergeMessagesForTopic(topicId, messages, 'replace', {
    syncLastMessage: false,
    windowMode: 'around-anchor',
    anchorMessageId: messageId,
    visibleMessages: messages
  });
  await nextTick();
  if (!isCurrent()) return;
  scrollAnchor.commitViewportMutation(mutation.revision, {
    forceAnchor: anchor
  });
  await messageListUserItemsRef.value?.ensureMessageRendered?.(messageId);
  await scrollAnchor.jumpToMessage(messageId, {
    block: 'center',
    behavior: 'auto',
    isCurrent
  });
  if (isCurrent()) highlightWholeMessage(messageId);
};

const jumpToOptimisticTarget = async (
  message: IMessage,
  quoteText: string,
  quoteOccurrenceIndex?: number,
  behavior: MessageScrollBehavior = 'smooth',
  isCurrent = () => true
): Promise<boolean> => {
  const topicId = route.value.id;

  if (!topicId || message.topicId !== topicId || !message.id) {
    return false;
  }

  scrollAnchor.prepareJumpMutation();
  mergeMessagesForTopic(topicId, [message], 'replace', {
    syncLastMessage: false,
    windowMode: 'around-anchor',
    anchorMessageId: message.id,
    skipPersist: true
  });

  await nextTick();

  const didJump = await jumpToMessageWithHighlight(
    message.id,
    quoteText,
    quoteOccurrenceIndex,
    behavior,
    isCurrent
  );

  if (didJump) {
    void refreshAroundMessageAfterOptimisticJump(
      topicId,
      message.id,
      isCurrent
    );
  }

  return didJump;
};

const navigateToMessageId = async (
  messageId: string,
  quoteText = '',
  quoteOccurrenceIndex?: number,
  optimisticMessage?: IMessage | null,
  behavior: MessageScrollBehavior = 'smooth'
): Promise<boolean> => {
  const topicId = route.value.id;
  const revision = ++messageNavigationRevision;
  const isCurrent = () =>
    route.value.id === topicId && revision === messageNavigationRevision;
  clearVisibleMessagesExpansionSchedule();
  scrollAnchor.prepareJumpMutation();

  const didJump = await jumpToMessageWithHighlight(
    messageId,
    quoteText,
    quoteOccurrenceIndex,
    behavior,
    isCurrent
  );

  if (!isCurrent()) return false;
  if (didJump) {
    void refreshAroundMessageAfterOptimisticJump(topicId, messageId, isCurrent);
    return true;
  }

  const memoryMessages = await hydrateMessageContextFromMemory(
    topicId,
    messageId
  );

  if (!isCurrent()) return false;
  if (memoryMessages.some(m => m.id === messageId)) {
    const didMemoryJump = await jumpToMessageWithHighlight(
      messageId,
      quoteText,
      quoteOccurrenceIndex,
      behavior,
      isCurrent
    );

    if (didMemoryJump) {
      void refreshAroundMessageAfterOptimisticJump(
        topicId,
        messageId,
        isCurrent
      );
      return true;
    }
  }

  if (!isCurrent()) return false;
  if (optimisticMessage) {
    const didOptimisticJump = await jumpToOptimisticTarget(
      optimisticMessage,
      quoteText,
      quoteOccurrenceIndex,
      behavior,
      isCurrent
    );

    if (didOptimisticJump) {
      return true;
    }
  }

  scrollAnchor.prepareJumpMutation();
  const shadowMessages = await hydrateMessageContextFromShadow(
    topicId,
    messageId,
    authUser.value?.id,
    { isCurrent }
  );

  if (!isCurrent()) return false;
  if (shadowMessages.some(m => m.id === messageId)) {
    await nextTick();
    const didShadowJump = await jumpToMessageWithHighlight(
      messageId,
      quoteText,
      quoteOccurrenceIndex,
      behavior,
      isCurrent
    );

    if (didShadowJump) {
      return true;
    }
  }

  if (!isCurrent()) return false;
  resetScrollState();
  scrollAnchor.prepareJumpMutation();
  const messages = await fetchAroundMessage(messageId, topicId, {
    updateVisible: false
  });
  if (!isCurrent()) return false;
  mergeMessagesForTopic(topicId, messages, 'replace', {
    syncLastMessage: false,
    windowMode: 'around-anchor',
    anchorMessageId: messageId,
    visibleMessages: messages
  });

  if (!messages.some(m => m.id === messageId)) {
    return false;
  }

  await nextTick();
  return jumpToMessageWithHighlight(
    messageId,
    quoteText,
    quoteOccurrenceIndex,
    behavior,
    isCurrent
  );
};

const handleScrollToMessage = async (
  payload: ScrollToMessagePayload
): Promise<boolean> => {
  const message = getScrollTargetMessage(payload);

  if (!message || message.topicId !== route.value.id) {
    return false;
  }

  suspendHistoryFetch(1800);

  return navigateToMessageId(
    message.id,
    getScrollTargetQuoteText(payload),
    getScrollTargetQuoteOccurrenceIndex(payload),
    getScrollTargetAllowOptimisticTarget(payload) ? message : null,
    getScrollTargetBehavior(payload)
  );
};

const handlePendingSearchNavigation = async (): Promise<void> => {
  const topicId = route.value.id;
  const pendingResult = getPendingSearchNavigation();

  if (
    !topicId ||
    !pendingResult ||
    pendingResult.topicId !== topicId ||
    isPendingSearchNavigationInProgress ||
    isLoadingInitialMessages.value ||
    props.deferContentRender ||
    (shouldRenderUserMessageSkeleton.value &&
      !shouldShowSearchNavigationSkeleton.value) ||
    !messageListUserItemsRef.value ||
    activeTopicSwitchToken !== completedTopicSwitchToken
  ) {
    return;
  }

  isPendingSearchNavigationInProgress = true;

  try {
    const didNavigate = await handleScrollToMessage({
      message: pendingResult.message,
      allowOptimisticTarget: true,
      scrollBehavior: 'auto'
    });

    if (didNavigate && getPendingSearchNavigation()?.id === pendingResult.id) {
      consumePendingSearchNavigation(topicId);
    }
  } finally {
    isPendingSearchNavigationInProgress = false;
  }
};

const hasVisibleSearchNavigationTarget = (
  topicId: string,
  messageId: string
): boolean =>
  getMessagesByTopicId(topicId).some(message => message.id === messageId);

const bootstrapPendingSearchNavigation = async (): Promise<void> => {
  const topicId = route.value.id;
  const pendingResult = getPendingSearchNavigation();
  const messageId = pendingResult?.message?.id || '';

  if (
    !topicId ||
    route.value.type === RouteTypes.AI ||
    !pendingResult ||
    pendingResult.topicId !== topicId ||
    !messageId ||
    props.deferContentRender ||
    isPendingSearchNavigationBootstrapInProgress
  ) {
    return;
  }

  if (hasVisibleSearchNavigationTarget(topicId, messageId)) {
    await nextTick();
    await handlePendingSearchNavigation();
    return;
  }

  if (
    isLoadingInitialMessages.value ||
    activeTopicSwitchToken !== completedTopicSwitchToken
  ) {
    return;
  }

  const bootstrapTopicSwitchToken = activeTopicSwitchToken;
  const isStalePendingSearchRoute = () =>
    route.value.id !== topicId ||
    bootstrapTopicSwitchToken !== activeTopicSwitchToken;
  const isStalePendingSearchBootstrap = () =>
    isStalePendingSearchRoute() ||
    getPendingSearchNavigation()?.id !== pendingResult.id;

  isPendingSearchNavigationBootstrapInProgress = true;
  isSearchNavigationPositioning.value = true;
  cancelSearchNavigationPositioningRelease();
  isLoadingInitialMessages.value = true;
  resetScrollState();
  suspendHistoryFetch(TOPIC_SWITCH_HISTORY_FETCH_GRACE_MS);

  try {
    await fetchAroundMessage(messageId, topicId, {
      updateVisible: true
    });

    if (isStalePendingSearchBootstrap()) {
      return;
    }

    renderedTopicId.value = topicId;
    isLoadingInitialMessages.value = false;
    resetInitialMessagesSkeleton();
    await nextTick();

    if (isStalePendingSearchBootstrap()) {
      return;
    }

    await handlePendingSearchNavigation();
  } finally {
    isPendingSearchNavigationBootstrapInProgress = false;

    if (!isStalePendingSearchRoute()) {
      isLoadingInitialMessages.value = false;
      resetInitialMessagesSkeleton();
      releaseSearchNavigationPositioningAfterPaint(bootstrapTopicSwitchToken);
    }
  }
};

const handleArrowDownClick = async (): Promise<void> => {
  const revision = ++messageNavigationRevision;
  await handleScrollToButton(() => revision === messageNavigationRevision);
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

const resetUnreadIfViewingBottom = (): void => {
  if (!route.value?.id || !chatWrapperRef.value) {
    return;
  }

  if (!getIsAppActivelyVisible()) {
    return;
  }

  const latestMessageId = getSelectedTopic(route.value.id)?.lastMessage?.id;
  if (!latestMessageId || state.messages.at(-1)?.id !== latestMessageId) {
    return;
  }

  if (!isViewingBottom.value) {
    return;
  }

  if (topicUnreadCount.value > 0) {
    resetTopicUnreadState(route.value.id);
    void markAllVisibleAsRead();
  }
};

const syncVisibleUnreadAfterAutoScroll = (): void => {
  if (!route.value?.id || route.value?.type === RouteTypes.AI) {
    return;
  }

  nextTick(() => {
    requestAnimationFrame(() => {
      flushVisibleUnreadMessages();
      resetUnreadIfViewingBottom();
      schedulePinnedViewportSnapshotSync();
    });
  });
};

const schedulePostScrollUiSync = (): void => {
  if (postScrollUiSyncRafId) {
    return;
  }

  postScrollUiSyncRafId = requestAnimationFrame(() => {
    postScrollUiSyncRafId = 0;

    const hasRecentUserScrollIntent =
      performance.now() - floatingDateDividerUserScrollIntentAt <=
      FLOATING_DATE_USER_SCROLL_GRACE_MS;

    if (isFloatingDateDividerActive.value || hasRecentUserScrollIntent) {
      keepFloatingDateDividerVisibleBriefly();
    }

    scheduleFloatingDateDividerSync();
    resetUnreadIfViewingBottom();
  });
};

const handleScroll = (): void => {
  const currentScrollTop = chatWrapperRef.value?.scrollTop ?? null;
  const hasMovedViewport =
    currentScrollTop !== null &&
    lastFloatingDateDividerScrollTop !== null &&
    Math.abs(currentScrollTop - lastFloatingDateDividerScrollTop) >= 1;

  lastFloatingDateDividerScrollTop = currentScrollTop;

  if (
    hasMovedViewport &&
    !isLoadingInitialMessages.value &&
    !isBootstrapScrollLocked.value &&
    !isSearchNavigationPositioning.value &&
    activeTopicSwitchToken === completedTopicSwitchToken &&
    !isViewingBottom.value
  ) {
    floatingDateDividerUserScrollIntentAt = performance.now();
    keepFloatingDateDividerVisibleBriefly();
  }

  void handleMessageScroll();
  schedulePostScrollUiSync();
  schedulePinnedViewportSnapshotSync();
};

const {
  handleSend: handleMessageSend,
  handleSendSticker,
  handleSendKeyboardMedia,
  handleAttachFile,
  handleRetryMessage
} = useMessageSender(
  route,
  inputText,
  state,
  authUser,
  mastraResult,
  scrollToBottom,
  clearSellectedMessage
);

const handleSend: typeof handleMessageSend = (...args) => {
  applyPendingForwardMessages();
  return handleMessageSend(...args);
};

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
      syncMessageInlineEndInset();
      syncVisibleUnreadAfterAutoScroll();
      schedulePinnedViewportSnapshotSync();
    });

    nextTick(() => {
      if (chatWrapperRef.value) {
        chatVisibilityObserver?.observe(chatWrapperRef.value);
        syncMessageInlineEndInset();
      }
    });
  }
});

onUnmounted(() => {
  window.removeEventListener('resize', scheduleFloatingDateDividerSync);
  releaseBootstrapScrollLock();
  releaseSearchNavigationPositioning();
  resetInitialMessagesSkeleton();
  clearVisibleMessagesExpansionSchedule();

  if (activeTopicPreviewRefreshTimeoutId !== null) {
    window.clearTimeout(activeTopicPreviewRefreshTimeoutId);
    activeTopicPreviewRefreshTimeoutId = null;
  }

  if (floatingDateDividerRafId) {
    cancelAnimationFrame(floatingDateDividerRafId);
    floatingDateDividerRafId = 0;
  }

  if (postScrollUiSyncRafId) {
    cancelAnimationFrame(postScrollUiSyncRafId);
    postScrollUiSyncRafId = 0;
  }

  if (pinnedViewportSnapshotRafId) {
    cancelAnimationFrame(pinnedViewportSnapshotRafId);
    pinnedViewportSnapshotRafId = 0;
  }

  if (pinnedViewportSnapshotTimeoutId !== null) {
    window.clearTimeout(pinnedViewportSnapshotTimeoutId);
    pinnedViewportSnapshotTimeoutId = null;
  }

  if (floatingDateDividerHideTimeoutId !== null) {
    window.clearTimeout(floatingDateDividerHideTimeoutId);
    floatingDateDividerHideTimeoutId = null;
  }

  if (renderMismatchTelemetryTimeout) {
    clearTimeout(renderMismatchTelemetryTimeout);
    renderMismatchTelemetryTimeout = null;
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
    syncMessageInlineEndInset();
    syncVisibleUnreadAfterAutoScroll();
    scheduleFloatingDateDividerSync();
  }
);

watch(
  [
    () => route.value.id,
    () => state.messages.length,
    () => state.aiMessages.length,
    () => props.deferContentRender
  ],
  async () => {
    if (props.deferContentRender) {
      return;
    }

    await nextTick();
    scheduleFloatingDateDividerSync();
  },
  { immediate: true }
);

watch([() => route.value.id, isActiveCallTopic, isCompactMessageInput], () => {
  isCallTopicActionsOpen.value = false;
});

watch(
  () => props.deferContentRender,
  async isDeferred => {
    if (isDeferred || !route.value.id) {
      return;
    }

    await nextTick();

    requestAnimationFrame(() => {
      if (props.deferContentRender || !chatWrapperRef.value) {
        return;
      }

      if (shouldKeepCurrentTopicBottomPosition()) {
        scrollToBottom({
          preferUnreadMarker: false,
          smooth: false
        });
      }

      setupIntersectionObserver();
      scheduleFloatingDateDividerSync();
      syncVisibleUnreadAfterAutoScroll();
      void handlePendingSearchNavigation();
    });
  }
);

watch(
  [
    () => route.value?.id,
    () => route.value?.type,
    () => notificationTopicRefreshRequest.value?.id || 0
  ],
  async (
    [topicId, routeType, notificationRefreshRequestId],
    [previousTopicId, previousRouteType, previousNotificationRefreshRequestId]
  ) => {
    const notificationRefreshRequest = notificationTopicRefreshRequest.value;
    const isOnlyUnrelatedNotificationRefresh =
      topicId === previousTopicId &&
      routeType === previousRouteType &&
      notificationRefreshRequestId !== previousNotificationRefreshRequestId &&
      notificationRefreshRequest?.topicId !== topicId;

    if (isOnlyUnrelatedNotificationRefresh) {
      return;
    }

    const isNotificationRefreshRequestForTopic =
      !!topicId &&
      notificationRefreshRequest?.id === notificationRefreshRequestId &&
      notificationRefreshRequest.topicId === topicId;
    const shouldScrollToBottomForNotification =
      (isNotificationRefreshRequestForTopic &&
        notificationRefreshRequest.scrollToBottom) ||
      (!!topicId &&
        !!document.getElementById('startup-shell') &&
        getHasBrowserNetwork());
    const notificationMessageId = isNotificationRefreshRequestForTopic
      ? notificationRefreshRequest.messageId
      : undefined;

    const isSameTopicNotificationRefresh =
      isNotificationRefreshRequestForTopic &&
      topicId === previousTopicId &&
      routeType === previousRouteType;

    if (isNotificationRefreshRequestForTopic) {
      consumeNotificationTopicRefreshRequest(
        topicId,
        notificationRefreshRequestId
      );
    }

    if (
      isSameTopicNotificationRefresh &&
      !isAwaitingNotificationHistory.value &&
      !isLoadingInitialMessages.value
    ) {
      await refreshActiveTopicFromNotification(
        topicId,
        shouldScrollToBottomForNotification,
        notificationMessageId
      );
      return;
    }

    pendingInitialNotificationMessageId.value = notificationMessageId || '';
    isAwaitingNotificationHistory.value = !!shouldScrollToBottomForNotification;
    initialNotificationPositionMessageId = '';
    initialNotificationPositionReady.value =
      !shouldScrollToBottomForNotification;
    activeNotificationRefreshToken += 1;
    isForcedNotificationRefreshPending = false;
    hideFloatingDateDivider();
    if (!topicId) {
      renderedTopicId.value = '';
      paintedUserMessageTopicId.value = '';
      isAwaitingUserMessagesPaint.value = false;
      isLoadingInitialMessages.value = false;
      releaseBootstrapScrollLock();
      releaseSearchNavigationPositioning();
      resetInitialMessagesSkeleton();
      return;
    }
    const topicSwitchToken = ++activeTopicSwitchToken;
    paintedUserMessageTopicId.value = '';
    lastFloatingDateDividerScrollTop = null;
    topicSwitchStartedAtMs = performance.now();
    topicSwitchUserScrollIntentAtMs = 0;
    const isStaleTopicSwitch = () =>
      topicSwitchToken !== activeTopicSwitchToken ||
      route.value?.id !== topicId;
    const hadRenderedDifferentTopicMessages =
      renderedTopicId.value !== topicId && state.messages.length > 0;
    if (routeType === RouteTypes.AI) {
      renderedTopicId.value = '';
    } else {
      renderedTopicId.value = topicId;
    }
    isAwaitingUserMessagesPaint.value =
      isMobile.value &&
      route.value?.type !== RouteTypes.AI &&
      !props.suppressInitialSkeleton &&
      !hasKnownTopicMessagesState(topicId);
    clearVisibleMessagesExpansionSchedule();
    visibleMessagesExpansionAppliedToken = 0;
    suppressNotificationSoundForTopic(topicId, TOPIC_SWITCH_AUTO_READ_GRACE_MS);
    state.errorMessage = '';
    messageNavigationRevision += 1;
    const initialNavigationRevision = messageNavigationRevision;
    unreadMarkerMessageIdsByTopic[topicId] = null;
    state.hideUnreadMarker = true;
    state.unreadMarkerMessageId = null;
    if (
      getMessagesByTopicId(topicId).length > 0 ||
      getSelectedTopic(topicId)?.lastMessage
    ) {
      setTopicMessagesKnownEmpty(topicId, false);
    }
    isLoadingInitialMessages.value = true;
    resetInitialMessagesSkeleton();
    if (routeType === RouteTypes.AI || isAwaitingUserMessagesPaint.value)
      scheduleInitialMessagesSkeleton(topicId, topicSwitchToken);
    if (shouldScrollToBottomForNotification)
      scheduleNotificationTopicShellReady(topicId);
    resetScrollState();
    if (hadRenderedDifferentTopicMessages) {
      scrollAnchor.setViewportMode('history', { pin: false });
    }
    setReadReceiptsEnabled(false);
    suspendAutoRead(TOPIC_SWITCH_AUTO_READ_GRACE_MS);
    suspendLocalOwnReadStatus(topicId, TOPIC_SWITCH_AUTO_READ_GRACE_MS);
    suspendHistoryFetch(TOPIC_SWITCH_HISTORY_FETCH_GRACE_MS);
    applyUnreadMarkerStateForTopic(topicId);

    const topicUnreadCount = getTopicUnreadBadgeCount(
      getSelectedTopic(topicId),
      authUser.value?.id
    );
    const { initialLimit: initialMessagesLimit, expandedLimit } =
      getTopicSwitchFetchLimits(topicUnreadCount);
    const fastInitialMessagesLimit = getFastInitialMessagesLimit(
      topicUnreadCount,
      initialMessagesLimit
    );
    // На мобильном одно чтение покрывает всё окно. При возврате в длинный
    // резидентный чат также обновляем окно целиком, сохраняя малый первый кадр.
    const initialNetworkMessagesLimit =
      isMobile.value ||
      getFullMessagesByTopicId(topicId).length >= expandedLimit
        ? expandedLimit
        : initialMessagesLimit;
    let notificationVisibleMessagesLimit = expandedLimit;
    let notificationHistoryIsFresh = false;
    const pendingSearchNavigationForTopic =
      routeType !== RouteTypes.AI &&
      getPendingSearchNavigation()?.topicId === topicId
        ? getPendingSearchNavigation()
        : null;
    const pendingSearchMessageId =
      pendingSearchNavigationForTopic?.message?.id || '';
    const shouldPositionToPendingSearch = !!pendingSearchMessageId;
    const bootstrapAnchorMessageId = pendingSearchMessageId;
    const shouldBootstrapAroundMessage = !!bootstrapAnchorMessageId;
    const shouldLockBootstrapScroll = false;

    setBootstrapScrollLock(topicSwitchToken, shouldLockBootstrapScroll);
    isSearchNavigationPositioning.value = shouldPositionToPendingSearch;
    if (shouldPositionToPendingSearch) {
      cancelSearchNavigationPositioningRelease();
    }

    state.replyMessage = null;
    state.editMessage = null;
    state.forwardMessages = [];
    inputText.value = getLocalStorageInputText.value;
    applyPendingForwardMessages();
    applyPendingMessageDraft();

    clearSelectedMessages();

    if (isMobile.value) {
      // This topic is not painted yet, so enforcing the mobile contract here
      // cannot move the user's current viewport. Later background/cache
      // updates remain non-shrinking while the topic is visible.
      setVisibleMessagesLimitForTopic(topicId, fastInitialMessagesLimit, {
        allowShrink: true
      });
    }

    if (!shouldScrollToBottomForNotification) {
      void fetchPinnedMessagesForTopic(topicId, {
        maxAgeMs: TOPIC_SWITCH_CACHE_MAX_AGE_MS
      });
    }

    const shouldHydrateBeforeInitialPaint = routeType !== RouteTypes.AI;
    const isFreshMobileStartup =
      isMobile.value &&
      shouldScrollToBottomForNotification &&
      !!document.getElementById('startup-shell') &&
      getHasBrowserNetwork();
    const hydrateInitialMessages = async (): Promise<IMessage[]> => {
      const hydrateFullHistory = () =>
        hydrateMessagesFromCache(topicId, undefined, {
          visibleLimit: fastInitialMessagesLimit,
          allowVisibleShrink: true
        });
      if (isFreshMobileStartup) {
        return hydratePendingMessagesFromCache(
          topicId,
          undefined,
          fastInitialMessagesLimit
        );
      }
      if (isMobile.value && shouldScrollToBottomForNotification) {
        const preview = await hydrateMessagePreviewFromCache(
          topicId,
          undefined,
          fastInitialMessagesLimit
        );
        if (preview.length) {
          void nextTick()
            .then(waitForExpandedTopicFetchDelay)
            .then(waitForMessageListIdle)
            .then(async () => {
              if (isStaleTopicSwitch()) return;
              // Фоновое восстановление не уменьшает уже открытое окно истории.
              await hydrateMessagesFromCache(topicId, undefined, {
                visibleLimit: fastInitialMessagesLimit
              });
            })
            .catch(error =>
              console.warn(
                'Не удалось восстановить историю после preview:',
                error
              )
            );
          return preview;
        }
      }
      return hydrateFullHistory();
    };
    const hydrationPromise = shouldHydrateBeforeInitialPaint
      ? hydrateInitialMessages()
      : Promise.resolve([]);
    let initialMessagesFetch: Promise<IMessage[]> | null = null;

    // Уведомление может быть из середины серии: первый кадр ждёт последнюю страницу.
    if (!shouldBootstrapAroundMessage) {
      initialMessagesFetch = shouldScrollToBottomForNotification
        ? reconcileNotificationTopicMessages(
            topicId,
            expandedLimit,
            notificationMessageId
          ).then(result => {
            notificationVisibleMessagesLimit = result.visibleLimit;
            notificationHistoryIsFresh = result.isFresh;
            return result.messages;
          })
        : fetchMessagesForTopic(topicId, {
            limit: initialNetworkMessagesLimit,
            maxAgeMs: TOPIC_SWITCH_CACHE_MAX_AGE_MS,
            forceRefresh: true,
            forceNetwork: getHasBrowserNetwork(),
            allowStaleFallback: !getHasBrowserNetwork(),
            visibleLimit: fastInitialMessagesLimit,
            updateVisible: false,
            revealIfEmpty: true
          });
    }

    const hydratedMessages = await hydrationPromise;

    if (isStaleTopicSwitch()) {
      return;
    }

    // Сначала выясняем, есть ли кеш: медленное чтение IndexedDB не должно
    // успевать включить скелетон поверх сохранённого чата.
    if (
      getMessagesByTopicId(topicId).length === 0 &&
      hydratedMessages.length === 0
    ) {
      scheduleInitialMessagesSkeleton(
        topicId,
        topicSwitchToken,
        Math.max(
          0,
          TOPIC_SWITCH_SKELETON_DELAY_MS -
            (performance.now() - topicSwitchStartedAtMs)
        )
      );
    }

    if (
      getRenderedTopicMessages(topicId, hydratedMessages).length > 0 ||
      getRenderedTopicMessages(topicId, getMessagesByTopicId(topicId)).length >
        0
    ) {
      setTopicMessagesKnownEmpty(topicId, false);
      resetInitialMessagesSkeleton();
      if (
        shouldScrollToBottomForNotification &&
        !isAwaitingNotificationHistory.value
      )
        isLoadingInitialMessages.value = false;
      setVisibleMessagesLimitForTopic(topicId, fastInitialMessagesLimit, {
        allowShrink:
          isMobile.value && !!pendingInitialNotificationMessageId.value
      });
      scheduleVisibleTopicMediaWarm(topicId, isStaleTopicSwitch);

      renderedTopicId.value = topicId;
      await nextTick();

      if (isStaleTopicSwitch()) {
        return;
      }

      if (
        !shouldBootstrapAroundMessage &&
        shouldKeepTopicSwitchBottomPosition(topicSwitchToken)
      ) {
        scrollToBottom({
          preferUnreadMarker: false,
          smooth: false
        });
      }

      if (
        !shouldBootstrapAroundMessage &&
        !pendingInitialNotificationMessageId.value
      ) {
        scheduleVisibleMessagesExpansion(
          topicId,
          expandedLimit,
          topicSwitchToken
        );
      }
    }

    if (shouldBootstrapAroundMessage) {
      initialMessagesFetch = fetchAroundMessage(
        bootstrapAnchorMessageId,
        topicId,
        {
          updateVisible: true
        }
      );
    }

    const initialMessages = (await initialMessagesFetch) || [];

    if (
      isFreshMobileStartup &&
      !notificationHistoryIsFresh &&
      !isStaleTopicSwitch()
    ) {
      await hydrateMessagesFromCache(topicId, undefined, {
        visibleLimit: fastInitialMessagesLimit,
        allowVisibleShrink: true
      });
    }

    if (isStaleTopicSwitch()) {
      return;
    }

    if (shouldScrollToBottomForNotification) {
      void fetchPinnedMessagesForTopic(topicId, {
        maxAgeMs: TOPIC_SWITCH_CACHE_MAX_AGE_MS
      });
    }

    cancelInitialMessagesSkeletonDelay();
    const shouldApplyInitialNetworkWindow =
      !shouldBootstrapAroundMessage &&
      (shouldScrollToBottomForNotification ||
        getMessagesByTopicId(topicId).length === 0 ||
        shouldKeepTopicSwitchBottomPosition(topicSwitchToken));

    if (shouldApplyInitialNetworkWindow) {
      // Быстрый ответ сети не должен до первого кадра разворачивать всю историю.
      const canKeepFastNotificationWindow =
        isMobile.value &&
        visibleMessagesExpansionAppliedToken !== topicSwitchToken;
      setVisibleMessagesLimitForTopic(
        topicId,
        shouldScrollToBottomForNotification
          ? canKeepFastNotificationWindow
            ? Math.min(
                notificationVisibleMessagesLimit,
                fastInitialMessagesLimit
              )
            : notificationVisibleMessagesLimit
          : fastInitialMessagesLimit,
        { allowShrink: !!shouldScrollToBottomForNotification }
      );
    }

    const initialUnreadMessage = initialMessages.find(
      message =>
        isUnreadTrackableMessage(message) &&
        message.senderUserId !== authUser.value?.id &&
        message.isReadByMe !== true
    );
    const shouldPositionToUnread =
      !shouldScrollToBottomForNotification &&
      !shouldBootstrapAroundMessage &&
      !hasTopicSwitchUserScrollIntent(topicSwitchToken) &&
      scrollAnchor.viewportMode.value !== 'jump' &&
      !!initialUnreadMessage;
    if (shouldPositionToUnread) {
      mergeMessagesForTopic(topicId, initialMessages, 'replace', {
        syncLastMessage: false,
        windowMode: 'around-anchor',
        anchorMessageId: initialUnreadMessage.id,
        visibleMessages: initialMessages,
        visibleLimit: Math.max(fastInitialMessagesLimit, 48)
      });
      unreadMarkerMessageIdsByTopic[topicId] = initialUnreadMessage.id;
    }

    // Если сообщение удалено или сеть недоступна, оставляем доступную историю.
    pendingInitialNotificationMessageId.value = '';
    isAwaitingNotificationHistory.value = false;
    const renderedResidentMessages = getRenderedTopicMessages(
      topicId,
      getMessagesByTopicId(topicId)
    );
    if (shouldScrollToBottomForNotification) {
      state.errorMessage = notificationHistoryIsFresh
        ? ''
        : 'Не удалось обновить сообщения. Показана сохранённая переписка.';
      initialNotificationPositionMessageId =
        renderedResidentMessages.at(-1)?.id || '';
      initialNotificationPositionReady.value =
        !initialNotificationPositionMessageId;
      resolveNotificationHistoryPaint(
        topicId,
        notificationMessageId || '',
        initialNotificationPositionMessageId,
        notificationHistoryIsFresh
      );
    }

    if (renderedResidentMessages.length === 0) {
      const topicHasKnownLastMessage = !!getSelectedTopic(topicId)?.lastMessage;
      setTopicMessagesKnownEmpty(
        topicId,
        getRenderedTopicMessages(topicId, initialMessages).length === 0 &&
          !topicHasKnownLastMessage
      );
      isAwaitingUserMessagesPaint.value = false;
      resetInitialMessagesSkeleton();
    } else {
      setTopicMessagesKnownEmpty(topicId, false);
    }

    renderedTopicId.value = topicId;
    await nextTick();

    if (isStaleTopicSwitch()) {
      return;
    }

    if (
      !shouldScrollToBottomForNotification &&
      !shouldBootstrapAroundMessage &&
      !isMobile.value &&
      expandedLimit > initialMessagesLimit
    ) {
      scheduleExpandedTopicMessagesFetch(
        topicId,
        expandedLimit,
        Promise.resolve(initialMessages),
        isStaleTopicSwitch,
        topicSwitchToken
      );
    } else {
      releaseBootstrapScrollLockAfterPaint(topicSwitchToken);
    }

    refreshUnreadMarkerState(true);

    if (state.unreadMarkerMessageId) {
      suspendAutoRead(TOPIC_SWITCH_AUTO_READ_GRACE_MS);
      suspendLocalOwnReadStatus(topicId, TOPIC_SWITCH_AUTO_READ_GRACE_MS);
    }

    if (shouldResetUnreadForCurrentTopic()) {
      resetTopicUnreadState(topicId);
    }

    applyPendingForwardMessages();

    await nextTick();

    if (isStaleTopicSwitch()) {
      return;
    }

    const shouldKeepInitialBottomPosition =
      !shouldPositionToPendingSearch &&
      (shouldScrollToBottomForNotification ||
        shouldKeepTopicSwitchBottomPosition(topicSwitchToken));

    if (shouldPositionToUnread) {
      await scrollToBottom({
        preferUnreadMarker: true,
        smooth: false,
        isCurrent: () =>
          initialNavigationRevision === messageNavigationRevision &&
          !isStaleTopicSwitch()
      });
    } else if (shouldKeepInitialBottomPosition) {
      await scrollToBottom({ preferUnreadMarker: false, smooth: false });
    }

    if (
      visibleMessagesExpansionAppliedToken === topicSwitchToken &&
      shouldKeepInitialBottomPosition
    ) {
      setVisibleMessagesLimitForTopic(topicId, initialMessagesLimit, {
        allowShrink: false
      });
      await nextTick();

      if (isStaleTopicSwitch()) {
        return;
      }

      if (shouldKeepTopicSwitchBottomPosition(topicSwitchToken)) {
        scrollToBottom({
          preferUnreadMarker: false,
          smooth: false
        });
      }
    } else if (shouldKeepInitialBottomPosition) {
      scheduleVisibleMessagesExpansion(
        topicId,
        shouldScrollToBottomForNotification
          ? notificationVisibleMessagesLimit
          : expandedLimit,
        topicSwitchToken
      );
    }

    scrollAnchor.initialize();
    isLoadingInitialMessages.value = false;
    resetInitialMessagesSkeleton();
    completedTopicSwitchToken = topicSwitchToken;
    lastFloatingDateDividerScrollTop = chatWrapperRef.value?.scrollTop ?? null;
    await handlePendingSearchNavigation();
    if (shouldPositionToPendingSearch) {
      releaseSearchNavigationPositioningAfterPaint(topicSwitchToken);
    }
    setReadReceiptsEnabled(true);
    setupIntersectionObserver();
    syncVisibleUnreadAfterAutoScroll();
  },
  { immediate: true }
);

watch(
  [
    () => route.value?.id,
    () => getPendingSearchNavigation()?.id,
    () => isLoadingInitialMessages.value
  ],
  () => {
    void bootstrapPendingSearchNavigation();
  },
  { flush: 'post' }
);

watch(
  [
    () => route.value?.id,
    () => route.value?.type,
    getActiveTopicLastMessageFingerprint
  ],
  ([topicId, routeType]) => {
    resetActiveTopicPreviewRefreshRetries();

    if (!topicId || routeType === RouteTypes.AI) {
      return;
    }

    scheduleActiveTopicPreviewRefresh('active-topic-last-message');
  },
  { immediate: true }
);

watch(
  [
    () => route.value?.id,
    () => route.value?.type,
    () => renderedTopicId.value,
    () => state.messages.length
  ],
  () => {
    scheduleRenderMismatchTelemetry();
  },
  { immediate: true }
);

watch(
  [() => route.value?.id, () => route.value?.type],
  ([topicId, routeType], [previousTopicId]) => {
    if (previousTopicId && previousTopicId !== topicId) {
      setSuspendIncomingMergeForTopic(previousTopicId, false);
    }

    if (!topicId || routeType === RouteTypes.AI) {
      return;
    }

    // Appending uses the scroll anchor to keep a reader's current position.
    // Do not hide new socket messages merely because the reader is viewing
    // history: otherwise they only appear after a later scroll interaction.
    setSuspendIncomingMergeForTopic(topicId, false);
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

watch([() => route.value.id, pendingDraftTopicId, pendingDraftText], () => {
  applyPendingMessageDraft();
});

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

const preserveMobileMessageInputFocus = (event: Event): void => {
  // Отмена touch pointerdown в WebKit может поглотить клик по скрепке и меню.
  if (
    isIosWeb() &&
    event instanceof PointerEvent &&
    event.pointerType === 'touch'
  )
    return;
  if (!isMobile.value || !event.cancelable || isEditableEventTarget(event)) {
    return;
  }

  const inputRoot = messageListInputRef.value?.getRootElement?.();
  const root = inputRoot?.getRootNode();
  const activeElement =
    root instanceof Document || root instanceof ShadowRoot
      ? root.activeElement
      : null;

  if (
    activeElement instanceof HTMLElement &&
    activeElement.isContentEditable &&
    inputRoot?.contains(activeElement)
  ) {
    // Сохраняем фокус до blur: повторный focus открывает клавиатуру после «Назад».
    event.preventDefault();
  }
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
  const input = messageListInputRef.value;
  const topicId = route.value.id;
  if (await input?.pasteCopiedContent?.()) return;
  const clipboardText = await navigator.clipboard.readText();

  if (
    !clipboardText ||
    input !== messageListInputRef.value ||
    topicId !== route.value.id
  )
    return;

  const anchorHtml = tryBuildAnchor(clipboardText);

  if (anchorHtml) insertTextToMessageInput(anchorHtml);
  else input?.insertPlainText?.(clipboardText);
};

const isMediaPreviewOpen = (): boolean =>
  !!document.querySelector('.slider-modal');

const handleWindowKeydown = async (e: KeyboardEvent) => {
  if (e.key === 'Escape' && isAnyCallModalVisible.value) {
    return;
  }

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
    !isDeletedAccountTopic.value &&
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
  if (!isMobile.value && !isDeletedAccountTopic.value) {
    focusMessageInput();
  }

  window.addEventListener('keydown', handleWindowKeydown, true);
  window.addEventListener('focus', handleWindowFocusRefresh);
  document.addEventListener('visibilitychange', handleVisibilityChangeRefresh);

  removeAppVisibilityListener = subscribeToAppVisibilityChanges(() => {
    if (getCanSendReadReceipts()) {
      refreshUnreadMarkerState();
    }
    // Историю при resume обновляет useChat с учётом соединения и времени
    // в фоне. Второй запрос отсюда обходил эти проверки и дублировал обновление.
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

  pendingNotificationTopicShellId = '';
  if (notificationTopicShellReadyFrameId) {
    window.cancelAnimationFrame(notificationTopicShellReadyFrameId);
    notificationTopicShellReadyFrameId = 0;
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
  () => state.messages.map(message => message.id).join('\u001f'),
  () => {
    nextTick(() => {
      syncVisibleUnreadAfterAutoScroll();
      resetUnreadIfViewingBottom();
      schedulePinnedViewportSnapshotSync();
    });
  }
);

watch(
  [
    () => route.value?.id || '',
    () => route.value?.type,
    () => renderedTopicId.value,
    () => renderedUserMessages.value.length,
    () => renderedLastUserMessageSignature.value,
    () => renderedUserReactionsSignature.value
  ],
  (
    [topicId, routeType, topicMessagesId, messageCount, , reactionsSignature],
    [
      previousTopicId,
      previousRouteType,
      previousTopicMessagesId,
      previousMessageCount,
      ,
      previousReactionsSignature
    ]
  ) => {
    const isSameRenderedTopic =
      !!topicId &&
      topicId === previousTopicId &&
      routeType === previousRouteType &&
      topicMessagesId === previousTopicMessagesId;
    const isReactionLayoutChange =
      messageCount === previousMessageCount &&
      reactionsSignature !== previousReactionsSignature;
    const shouldPinBottom =
      isSameRenderedTopic &&
      isUserMessagesRoute.value &&
      !shouldRenderUserMessageSkeleton.value &&
      (isReactionLayoutChange
        ? scrollAnchor.isAtBottom()
        : shouldKeepCurrentTopicBottomPosition());

    if (!shouldPinBottom) {
      return;
    }

    nextTick(() => {
      requestAnimationFrame(() => {
        if (
          route.value?.id !== topicId ||
          renderedTopicId.value !== topicMessagesId ||
          !isUserMessagesRoute.value ||
          shouldRenderUserMessageSkeleton.value ||
          !(isReactionLayoutChange
            ? scrollAnchor.viewportMode.value === 'live'
            : shouldKeepCurrentTopicBottomPosition()) ||
          !chatWrapperRef.value
        ) {
          return;
        }

        scrollToBottom({
          preferUnreadMarker: false,
          smooth: false
        });
        syncVisibleUnreadAfterAutoScroll();
        scheduleFloatingDateDividerSync();
      });
    });
  },
  { flush: 'pre' }
);

watch(
  [
    () => route.value?.id,
    () => renderedTopicId.value,
    () => state.messages.length,
    () => isLoadingInitialMessages.value,
    () => shouldRenderUserMessageSkeleton.value,
    () => paintedUserMessageTopicId.value,
    () => initialNotificationPositionReady.value,
    () => isAwaitingNotificationHistory.value,
    () => isMessageComposerReady.value
  ],
  () => {
    nextTick(emitRenderedTopicState);
  },
  { immediate: true }
);

watch(
  [
    () => route.value?.id,
    () => route.value?.type,
    () => shouldRenderUserMessageSkeleton.value,
    () => shouldMountUserMessageItems.value
  ],
  () => {
    if (!isUserMessagesRoute.value || shouldRenderUserMessageSkeleton.value) {
      emit('viewport-snapshot-change', null);
      return;
    }

    nextTick(() => {
      schedulePinnedViewportSnapshotSync();
    });
  },
  { immediate: true }
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
      resetUnreadIfViewingBottom();
    });
  }
);

defineExpose({
  handleClear: clearAiMessages,
  scrollToMessage: handleScrollToMessage
});
</script>

<style scoped>
.chat__deleted-account-message > .system-message-text {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 20px;
  min-height: 20px;
  padding: 0 10px;
  background: rgb(28 38 53 / 70%);
}
</style>
