<template>
  <section
    :class="[
      'chat',
      {
        'chat--mobile-route': isMobile,
        'chat--call-topic-route': route.type === RouteTypes.CALL,
        'chat--ai-route': route.type === RouteTypes.AI
      }
    ]"
    :data-testid="`${props.dataTestid}-Chat-Container`"
  >
    <div
      v-if="isAiRoute || isAiVoiceCallActive"
      v-show="isAiRoute"
      style="display: contents"
    >
      <AIAssistant ref="aiAssistantRef" />
    </div>

    <template v-if="!isAiRoute && isMobile">
      <div
        :class="[
          'chat__mobile-list-layer',
          { 'chat__mobile-list-layer--hidden': hasActiveChatRoute }
        ]"
        :aria-hidden="hasActiveChatRoute ? 'true' : 'false'"
      >
        <ContactListMobile
          :transition-class="!hasActiveChatRoute ? mobileTransitionName : ''"
          :data-testid="`${props.dataTestid}-Chat-ContactListMobile`"
        />
      </div>
      <div
        v-if="hasActiveChatRoute"
        :class="[
          'chat__mobile-route-view chat__mobile-route-view--messages',
          mobileTransitionName,
          {
            'chat__mobile-route-view--call': route.type === RouteTypes.CALL,
            'chat__mobile-route-view--content-deferred':
              !isMobileMessageContentReady
          }
        ]"
        @animationend="handleMobileRouteAnimationEnd"
      >
        <PinnedMessages
          v-if="shouldShowPinnedMessages"
          :topic-id="pinnedMessagesTopicId"
          :viewport-snapshot="messageViewportSnapshot"
          @unmount-set-selected-message="scrollToMessage"
        />
        <MessageList
          v-if="isMobileMessageListMounted"
          ref="messageListRef"
          :defer-content-render="false"
          :baseUrl="props.baseUrl"
          :contact="props.contact"
          :user="authUser"
          :show-update-banner="props.showUpdateBanner"
          :update-action-label="props.updateActionLabel"
          :update-progress="props.updateProgress"
          :is-update-action-disabled="props.isUpdateActionDisabled"
          :on-update-click="props.onUpdateClick"
          :on-dismiss-update-banner="props.onDismissUpdateBanner"
          :data-testid="`${props.dataTestid}-Chat-MessageList`"
          @viewport-snapshot-change="handleViewportSnapshotChange"
          @rendered-topic-change="handleRenderedTopicChange"
        />
      </div>
      <ShareSelectionOverlay />
    </template>

    <template v-if="!isAiRoute && !isMobile">
      <PinnedMessages
        v-if="shouldShowPinnedMessages"
        :topic-id="pinnedMessagesTopicId"
        :viewport-snapshot="messageViewportSnapshot"
        @unmount-set-selected-message="scrollToMessage"
      />
      <MessageList
        v-if="hasActiveChatRoute"
        ref="messageListRef"
        :baseUrl="props.baseUrl"
        :contact="props.contact"
        :user="authUser"
        :show-update-banner="props.showUpdateBanner"
        :update-action-label="props.updateActionLabel"
        :update-progress="props.updateProgress"
        :is-update-action-disabled="props.isUpdateActionDisabled"
        :on-update-click="props.onUpdateClick"
        :on-dismiss-update-banner="props.onDismissUpdateBanner"
        :data-testid="`${props.dataTestid}-Chat-MessageList`"
        @viewport-snapshot-change="handleViewportSnapshotChange"
        @rendered-topic-change="handleRenderedTopicChange"
      />
      <div class="chat__unselected-topic" v-else>
        <UnselectedTopicIcon />
        <p>Выберите чат</p>
      </div>
    </template>
  </section>
</template>

<script lang="ts" setup>
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  ref,
  useTemplateRef,
  watch
} from 'vue';
import { useResizeState } from '../composables/useResizeState';
import MessageList from './MessageList.vue';
import ContactListMobile from './ContactList/MobileList.vue';
import type { IMessageListProps } from './interfaces/message-list';
import { MAX_W_MD } from '../utils/constants';
import { useUrlWatcher } from '../composables/navigation';
import { RouteTypes } from '../composables/navigation/useUrlRouting';
import { getAuthUser } from '../composables/useAuth';
import PinnedMessages from './Messages/PinnedMessages.vue';
import type {
  IMessage,
  IMessageRenderedTopicState,
  IMessageViewportSnapshot
} from './interfaces/interfaces';
import ShareSelectionOverlay from './ShareSelectionOverlay.vue';
import {
  fetchPinnedMessagesForTopic,
  hasKnownTopicMessagesState
} from '../services/useMessages';
import { useAiAssistant } from '../composables/useAiAssistant';
import UnselectedTopicIcon from './UI/Icons/UnselectedTopicIcon.vue';

const AIAssistant = defineAsyncComponent(() => import('./AI/AIAssistant.vue'));

export interface IChatProps extends IMessageListProps {
  dataTestid?: string;
}

const props = withDefaults(defineProps<IChatProps>(), {
  dataTestid: 'Chat'
});
const emit = defineEmits<{
  (e: 'rendered-topic-change', payload: IMessageRenderedTopicState): void;
}>();

const authUser = computed(() => getAuthUser());

const { state: isMobile } = useResizeState(MAX_W_MD);

const messageListRef = useTemplateRef<any>('messageListRef');
const aiAssistantRef = useTemplateRef<any>('aiAssistantRef');

const route = useUrlWatcher();
const { isVoiceModeOpen: isAiVoiceCallActive } = useAiAssistant();
const activeChatRouteKey = computed(() =>
  route.value.type === RouteTypes.AI ? RouteTypes.AI : route.value.id
);
const hasActiveChatRoute = computed(() => !!activeChatRouteKey.value);
const isAiRoute = computed(() => route.value.type === RouteTypes.AI);
const mobileTransitionName = ref('');
const isMobileMessageListMounted = ref(!isMobile.value);
const isMobileMessageContentReady = ref(!isMobile.value);
const currentMobileTopicUsesSkeleton = ref(false);
const messageViewportSnapshot = ref<IMessageViewportSnapshot | null>(null);
const renderedMessageTopic = ref<IMessageRenderedTopicState>({
  topicId: null,
  routeTopicId: null,
  messageCount: 0,
  isCurrent: false,
  isReady: false
});
const pinnedMessagesTopicId = computed(
  () => renderedMessageTopic.value.topicId
);
const shouldShowPinnedMessages = computed(
  () =>
    !!route.value.id &&
    !!pinnedMessagesTopicId.value &&
    renderedMessageTopic.value.messageCount > 0
);
const MOBILE_ROUTE_CONTENT_DELAY_MS = 220;
const OPENED_MOBILE_TOPIC_IDS_KEY = 'openedMobileTopicIds';
type MessageScrollBehavior = 'auto' | 'instant' | 'smooth';

const loadOpenedMobileTopicIds = (): Set<string> => {
  try {
    const rawValue = localStorage.getItem(OPENED_MOBILE_TOPIC_IDS_KEY);
    const ids = rawValue ? JSON.parse(rawValue) : [];

    return new Set(Array.isArray(ids) ? ids.filter(Boolean) : []);
  } catch {
    return new Set();
  }
};

const openedMobileTopicIds = loadOpenedMobileTopicIds();
let mobileRouteContentTimerId: number | null = null;
let mobileRouteContentFrameId: number | null = null;
let mobileRouteContentToken = 0;

type ScrollToMessagePayload =
  | IMessage
  | {
      message?: IMessage | null;
      quoteText?: string;
      quoteOccurrenceIndex?: number;
      allowOptimisticTarget?: boolean;
      scrollBehavior?: MessageScrollBehavior;
    };

const scrollToMessage = (payload: ScrollToMessagePayload) => {
  messageListRef.value?.scrollToMessage(payload);
};

const handleViewportSnapshotChange = (
  snapshot: IMessageViewportSnapshot | null
): void => {
  messageViewportSnapshot.value = snapshot;
};

const handleRenderedTopicChange = (
  payload: IMessageRenderedTopicState
): void => {
  const previousTopicId = renderedMessageTopic.value.topicId;

  renderedMessageTopic.value = payload;
  emit('rendered-topic-change', payload);

  if (!payload.topicId || payload.topicId !== previousTopicId) {
    messageViewportSnapshot.value = null;
  }
};

const clearMobileRouteContentSchedule = (): void => {
  if (mobileRouteContentTimerId !== null) {
    window.clearTimeout(mobileRouteContentTimerId);
    mobileRouteContentTimerId = null;
  }

  if (mobileRouteContentFrameId !== null) {
    window.cancelAnimationFrame(mobileRouteContentFrameId);
    mobileRouteContentFrameId = null;
  }
};

const shouldShowFirstOpenSkeleton = (topicId: string): boolean => {
  if (
    !topicId ||
    route.value.type === RouteTypes.AI ||
    route.value.type === RouteTypes.CALL
  ) {
    return false;
  }

  return !hasKnownTopicMessagesState(topicId);
};

const rememberOpenedMobileTopic = (topicId: string): void => {
  if (
    !topicId ||
    route.value.type === RouteTypes.AI ||
    openedMobileTopicIds.has(topicId)
  ) {
    return;
  }

  openedMobileTopicIds.add(topicId);

  try {
    localStorage.setItem(
      OPENED_MOBILE_TOPIC_IDS_KEY,
      JSON.stringify([...openedMobileTopicIds])
    );
  } catch {
    // Local storage can be unavailable in restricted webviews.
  }
};

const revealMobileMessageContent = (token: number): void => {
  if (
    token !== mobileRouteContentToken ||
    !isMobile.value ||
    !hasActiveChatRoute.value
  ) {
    return;
  }

  clearMobileRouteContentSchedule();
  mobileRouteContentFrameId = window.requestAnimationFrame(() => {
    mobileRouteContentFrameId = window.requestAnimationFrame(() => {
      mobileRouteContentFrameId = null;

      if (
        token === mobileRouteContentToken &&
        isMobile.value &&
        hasActiveChatRoute.value
      ) {
        isMobileMessageContentReady.value = true;
      }
    });
  });
};

const scheduleMobileMessageContentReveal = (): void => {
  const token = ++mobileRouteContentToken;

  clearMobileRouteContentSchedule();
  isMobileMessageContentReady.value = false;
  mobileRouteContentTimerId = window.setTimeout(() => {
    mobileRouteContentTimerId = null;
    revealMobileMessageContent(token);
  }, MOBILE_ROUTE_CONTENT_DELAY_MS);
};

const syncMobileMessageContentState = (topicId?: string): void => {
  if (!topicId) {
    clearMobileRouteContentSchedule();
    ++mobileRouteContentToken;
    isMobileMessageContentReady.value = false;
    currentMobileTopicUsesSkeleton.value = false;
    return;
  }

  if (!currentMobileTopicUsesSkeleton.value) {
    clearMobileRouteContentSchedule();
    ++mobileRouteContentToken;
    isMobileMessageContentReady.value = true;
    return;
  }

  if (hasKnownTopicMessagesState(topicId)) {
    clearMobileRouteContentSchedule();
    ++mobileRouteContentToken;
    isMobileMessageContentReady.value = true;
    return;
  }

  scheduleMobileMessageContentReveal();
};

const prepareMobileMessageRoute = (topicId: string): void => {
  const shouldShowSkeleton = shouldShowFirstOpenSkeleton(topicId);

  currentMobileTopicUsesSkeleton.value = shouldShowSkeleton;
  rememberOpenedMobileTopic(topicId);
  clearMobileRouteContentSchedule();

  ++mobileRouteContentToken;
  isMobileMessageListMounted.value = true;
  isMobileMessageContentReady.value = true;
};

const handleMobileRouteAnimationEnd = (event: AnimationEvent): void => {
  if (event.target !== event.currentTarget || !hasActiveChatRoute.value) {
    return;
  }

  // The transition class carries `will-change: transform, opacity`. Keeping
  // it after the 220 ms entrance animation promotes the whole chat route to a
  // permanent compositor layer. Android WebView then has to raster a large
  // scrolling descendant inside that layer and can show the wallpaper while
  // the message tiles catch up during a fast fling.
  mobileTransitionName.value = '';
  revealMobileMessageContent(mobileRouteContentToken);
};

watch(
  [() => route.value.id, isMobile],
  ([topicId, mobile]) => {
    if (mobile && topicId) {
      void fetchPinnedMessagesForTopic(topicId);
    }
  },
  { immediate: true }
);

watch(activeChatRouteKey, (topicId, previousTopicId) => {
  if (!topicId || !renderedMessageTopic.value.topicId) {
    messageViewportSnapshot.value = null;
  }

  if (!isMobile.value) {
    clearMobileRouteContentSchedule();
    isMobileMessageListMounted.value = true;
    isMobileMessageContentReady.value = true;
    currentMobileTopicUsesSkeleton.value = false;
    return;
  }

  mobileTransitionName.value =
    topicId && route.value.type === RouteTypes.CALL
      ? ''
      : !topicId && previousTopicId
        ? 'chat-mobile-route-back'
        : 'chat-mobile-route-forward';

  if (!topicId) {
    syncMobileMessageContentState(topicId);
    isMobileMessageListMounted.value = false;
    currentMobileTopicUsesSkeleton.value = false;
    return;
  }

  prepareMobileMessageRoute(topicId);
});

watch(
  isMobile,
  mobile => {
    if (!mobile) {
      clearMobileRouteContentSchedule();
      isMobileMessageListMounted.value = true;
      isMobileMessageContentReady.value = true;
      currentMobileTopicUsesSkeleton.value = false;
      return;
    }

    if (activeChatRouteKey.value) {
      prepareMobileMessageRoute(activeChatRouteKey.value);
      return;
    }

    syncMobileMessageContentState(activeChatRouteKey.value || undefined);
    isMobileMessageListMounted.value = false;
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  clearMobileRouteContentSchedule();
});

defineExpose({
  handleClear: () =>
    isAiRoute.value
      ? aiAssistantRef.value?.handleClear()
      : messageListRef.value?.handleClear(),
  focusComposer: () => {
    if (isAiRoute.value) {
      aiAssistantRef.value?.focusComposer();
    }
  }
});
</script>
