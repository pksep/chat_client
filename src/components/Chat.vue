<template>
  <section
    :class="['chat', { 'chat--mobile-route': isMobile }]"
    :data-testid="`${props.dataTestid}-Chat-Container`"
  >
    <template v-if="isMobile">
      <div
        :class="[
          'chat__mobile-list-layer',
          { 'chat__mobile-list-layer--hidden': route.id }
        ]"
        :aria-hidden="route.id ? 'true' : 'false'"
      >
        <ContactListMobile
          :transition-class="!route.id ? mobileTransitionName : ''"
          :data-testid="`${props.dataTestid}-Chat-ContactListMobile`"
        />
      </div>
      <div
        v-if="route.id"
        :key="mobileRouteKey"
        :class="[
          'chat__mobile-route-view chat__mobile-route-view--messages',
          mobileTransitionName,
          {
            'chat__mobile-route-view--content-deferred':
              !isMobileMessageContentReady
          }
        ]"
        @animationend="handleMobileRouteAnimationEnd"
      >
        <PinnedMessages
          v-if="isMobileMessageListMounted"
          v-show="isMobileMessageContentReady"
          @unmount-set-selected-message="scrollToMessage"
        />
        <MessageList
          v-if="isMobileMessageListMounted"
          ref="messageListRef"
          :defer-content-render="!isMobileMessageContentReady"
          :suppress-initial-skeleton="!currentMobileTopicUsesSkeleton"
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
        />
        <div
          v-else
          class="chat__mobile-instant-shell"
          aria-hidden="true"
          :data-testid="`${props.dataTestid}-Chat-MobileInstantShell`"
        >
          <div
            :class="[
              'chat__message-wrapper',
              'chat__message-wrapper--content-deferred'
            ]"
          >
            <div
              :class="[
                'chat__message-skeleton',
                {
                  'chat__message-skeleton--group':
                    route.type === RouteTypes.GROUP
                }
              ]"
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
            </div>
          </div>
          <div class="chat__mobile-instant-input">
            <span class="chat__mobile-instant-input-action" />
            <span class="chat__mobile-instant-input-field" />
            <span class="chat__mobile-instant-input-send" />
          </div>
        </div>
      </div>
      <ShareSelectionOverlay />
    </template>

    <template v-else>
      <PinnedMessages
        v-if="route.id"
        @unmount-set-selected-message="scrollToMessage"
      />
      <MessageList
        v-if="route.id"
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
      />
      <div class="chat__unselected-topic" v-else>
        <img src="/images/messages.svg" alt="messages" />
        <p>Выберите чат</p>
      </div>
    </template>
  </section>
</template>

<script lang="ts" setup>
import {
  computed,
  nextTick,
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
import { IMessage } from './interfaces/interfaces';
import ShareSelectionOverlay from './ShareSelectionOverlay.vue';
import {
  consumePendingSearchNavigation,
  getPendingSearchNavigation
} from '../composables/useMessageSearch';
import { hasKnownTopicMessagesState } from '../services/useMessages';

export interface IChatProps extends IMessageListProps {
  dataTestid?: string;
}

const props = withDefaults(defineProps<IChatProps>(), {
  dataTestid: 'Chat'
});

const authUser = computed(() => getAuthUser());

const { state: isMobile } = useResizeState(MAX_W_MD);

const messageListRef = useTemplateRef<any>('messageListRef');

const route = useUrlWatcher();
const mobileTransitionName = ref('');
const isMobileMessageListMounted = ref(!isMobile.value);
const isMobileMessageContentReady = ref(!isMobile.value);
const currentMobileTopicUsesSkeleton = ref(false);
const mobileRouteKey = computed(() =>
  route.value.id
    ? `topic:${route.value.type}:${route.value.id}`
    : `list:${route.value.type || 'default'}`
);
const MOBILE_ROUTE_CONTENT_DELAY_MS = 220;
const OPENED_MOBILE_TOPIC_IDS_KEY = 'openedMobileTopicIds';

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
let mobileRouteListMountFrameId: number | null = null;
let mobileRouteContentToken = 0;

const scrollToMessage = (message: IMessage) => {
  messageListRef.value?.scrollToMessage(message);
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

const clearMobileMessageListMountSchedule = (): void => {
  if (mobileRouteListMountFrameId !== null) {
    window.cancelAnimationFrame(mobileRouteListMountFrameId);
    mobileRouteListMountFrameId = null;
  }
};

const shouldShowFirstOpenSkeleton = (topicId: string): boolean => {
  if (!topicId || route.value.type === RouteTypes.AI) {
    return false;
  }

  return !hasKnownTopicMessagesState(topicId);
};

const rememberOpenedMobileTopic = (topicId: string): void => {
  if (!topicId || openedMobileTopicIds.has(topicId)) {
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
  if (token !== mobileRouteContentToken || !isMobile.value || !route.value.id) {
    return;
  }

  clearMobileRouteContentSchedule();
  mobileRouteContentFrameId = window.requestAnimationFrame(() => {
    mobileRouteContentFrameId = window.requestAnimationFrame(() => {
      mobileRouteContentFrameId = null;

      if (
        token === mobileRouteContentToken &&
        isMobile.value &&
        route.value.id
      ) {
        isMobileMessageContentReady.value = true;
      }
    });
  });
};

const mountMobileMessageListAfterFirstPaint = (
  topicId: string,
  token: number
): void => {
  clearMobileMessageListMountSchedule();
  mobileRouteListMountFrameId = window.requestAnimationFrame(() => {
    mobileRouteListMountFrameId = null;

    if (
      token !== mobileRouteContentToken ||
      !isMobile.value ||
      route.value.id !== topicId
    ) {
      return;
    }

    isMobileMessageListMounted.value = true;
    syncMobileMessageContentState(topicId);
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
  clearMobileMessageListMountSchedule();
  clearMobileRouteContentSchedule();

  const token = ++mobileRouteContentToken;
  isMobileMessageListMounted.value = false;
  isMobileMessageContentReady.value = !shouldShowSkeleton;
  mountMobileMessageListAfterFirstPaint(topicId, token);
};

const handleMobileRouteAnimationEnd = (event: AnimationEvent): void => {
  if (event.target !== event.currentTarget || !route.value.id) {
    return;
  }

  revealMobileMessageContent(mobileRouteContentToken);
};

const scrollToPendingSearchMessage = async () => {
  if (
    !route.value.id ||
    getPendingSearchNavigation()?.topicId !== route.value.id
  ) {
    return;
  }

  await nextTick();

  const pendingResult = consumePendingSearchNavigation(route.value.id);

  if (!pendingResult) {
    return;
  }

  messageListRef.value?.scrollToMessage(pendingResult.message);
};

watch(
  [
    () => route.value.id,
    () => messageListRef.value,
    () => isMobileMessageContentReady.value,
    () => getPendingSearchNavigation()?.id
  ],
  () => {
    void scrollToPendingSearchMessage();
  },
  { immediate: true }
);

watch(
  () => route.value.id,
  (topicId, previousTopicId) => {
    if (!isMobile.value) {
      clearMobileMessageListMountSchedule();
      clearMobileRouteContentSchedule();
      isMobileMessageListMounted.value = true;
      isMobileMessageContentReady.value = true;
      currentMobileTopicUsesSkeleton.value = false;
      return;
    }

    mobileTransitionName.value =
      !topicId && previousTopicId
        ? 'chat-mobile-route-back'
        : 'chat-mobile-route-forward';

    if (!topicId) {
      clearMobileMessageListMountSchedule();
      syncMobileMessageContentState(topicId);
      isMobileMessageListMounted.value = false;
      currentMobileTopicUsesSkeleton.value = false;
      return;
    }

    prepareMobileMessageRoute(topicId);
  }
);

watch(
  isMobile,
  mobile => {
    if (!mobile) {
      clearMobileMessageListMountSchedule();
      clearMobileRouteContentSchedule();
      isMobileMessageListMounted.value = true;
      isMobileMessageContentReady.value = true;
      currentMobileTopicUsesSkeleton.value = false;
      return;
    }

    if (route.value.id) {
      prepareMobileMessageRoute(route.value.id);
      return;
    }

    syncMobileMessageContentState(route.value.id);
    isMobileMessageListMounted.value = false;
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  clearMobileMessageListMountSchedule();
  clearMobileRouteContentSchedule();
});

defineExpose({
  handleClear: () => messageListRef.value?.handleClear()
});
</script>
