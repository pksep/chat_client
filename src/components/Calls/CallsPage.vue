<template>
  <section
    :class="['calls-page', { 'calls-page--collapse': props.isCollapse }]"
    :data-testid="`${props.dataTestid}-Container`"
  >
    <CallsHeader
      class="calls-page__header"
      :total-count="state.totalItems || callHistory.length"
      :data-testid="`${props.dataTestid}-Header`"
    />

    <div class="calls-page__content">
      <div class="calls-page__search-shell">
        <MenuSearch
          class="calls-page__search"
          :model-value="searchValue"
          :data-testid="`${props.dataTestid}-Search`"
          @update:model-value="value => (searchValue = value)"
        />
      </div>

      <div
        v-if="state.isLoading && !callHistory.length"
        class="menu-panel menu-panel--centered calls-page__empty"
      >
        <h3 class="menu-panel__title">Звонки</h3>
        <p class="menu-panel__description">История звонков загружается...</p>
      </div>

      <div
        v-else-if="filteredCalls.length"
        v-menu-list-press
        ref="callListRef"
        class="calls-page__list"
        @scroll="handleListScroll"
      >
        <template v-for="call in filteredCalls" :key="call.messageId">
          <div
            :class="[
              'calls-page__item menu-list-row',
              {
                'calls-page__item--active': isActiveRouteCall(call),
                'menu-list-row--active': isActiveRouteCall(call)
              }
            ]"
            role="button"
            tabindex="0"
            :data-testid="`${props.dataTestid}-Item-${call.messageId}`"
            @pointerenter="event => handleCompactCallEnter(call, event)"
            @pointerleave="scheduleCompactCallClose"
            @click="openCallBot(call)"
            @keydown.enter.prevent="openCallBot(call)"
            @keydown.space.prevent="openCallBot(call)"
          >
            <CachedAvatar
              class="calls-page__avatar"
              :path="call.avatarUrl"
              :initials="call.avatarInitials"
              is-icon
              @click.stop="handleOpenCallUserInfo(call)"
            />

            <div class="calls-page__body">
              <div class="calls-page__row">
                <h4 class="calls-page__name">{{ call.displayName }}</h4>
                <span class="calls-page__date">{{ call.dateLabel }}</span>
              </div>

              <div class="calls-page__details">
                <MessageCallTypeIcon :kind="call.kind" />
                <div class="calls-page__meta">
                  <span
                    :class="[
                      'calls-page__status',
                      `calls-page__status--${call.kind}`
                    ]"
                  >
                    {{ call.title }}
                  </span>
                  <span
                    :class="[
                      'calls-page__time',
                      { 'calls-page__time--missed': call.kind === 'missed' }
                    ]"
                  >
                    {{ call.detailLabel
                    }}<span v-if="call.noAnswer" class="calls-page__no-answer">
                      (нет ответа)</span
                    >
                  </span>
                </div>
              </div>
            </div>

            <span class="calls-page__info" aria-hidden="true">
              <MessageCallInfoIcon />
            </span>
          </div>

          <div class="calls-page__delimetr menu-list-divider"></div>
        </template>

        <div v-if="state.isLoadingMore" class="calls-page__loading-more">
          {{ loadingMoreLabel }}
        </div>
      </div>

      <div
        v-else-if="searchValue.trim()"
        class="calls-page__search-empty"
        :data-testid="`${props.dataTestid}-SearchEmpty`"
      >
        <p class="calls-page__search-empty-title">Ничего не найдено</p>
        <svg
          width="84"
          height="84"
          viewBox="0 0 84 84"
          fill="none"
          class="calls-page__search-empty-icon"
          aria-hidden="true"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M40.3971 70.8724C57.2303 70.8724 70.8763 57.2264 70.8763 40.3932C70.8763 23.5601 57.2303 9.91406 40.3971 9.91406C23.564 9.91406 9.91797 23.5601 9.91797 40.3932C9.91797 57.2264 23.564 70.8724 40.3971 70.8724Z"
            stroke="currentColor"
            stroke-width="4.8125"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M74.0846 74.0807L67.668 67.6641"
            stroke="currentColor"
            stroke-width="4.8125"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle cx="25.5" cy="35.3359" r="3.5" fill="currentColor" />
          <circle cx="55.168" cy="35.3359" r="3.5" fill="currentColor" />
          <line
            x1="27.086"
            y1="46.9141"
            x2="53.586"
            y2="46.9148"
            stroke="currentColor"
            stroke-width="3.5"
            stroke-linecap="round"
          />
        </svg>
      </div>

      <div v-else class="calls-page__empty-history">
        Здесь будет история звонков
      </div>
    </div>
  </section>

  <Teleport to="body">
    <div
      v-if="compactHoverCall"
      ref="compactCallPopoverRef"
      :class="[
        'contact-list__compact-popover',
        'calls-page__compact-popover',
        {
          'calls-page__compact-popover--active':
            isActiveRouteCall(compactHoverCall)
        }
      ]"
      :style="compactCallPopoverStyle"
      role="button"
      tabindex="0"
      :aria-label="`Открыть звонок ${compactHoverCall.displayName}`"
      :data-testid="`${props.dataTestid}-CompactPopover`"
      @pointerenter="cancelCompactCallClose"
      @pointerleave="scheduleCompactCallClose"
      @click="handleCompactCallClick"
      @keydown.enter.prevent="handleCompactCallClick"
      @keydown.space.prevent="handleCompactCallClick"
    >
      <div class="calls-page__compact-popover-content">
        <h4 class="calls-page__compact-name">
          {{ compactHoverCall.displayName }}
        </h4>
        <div class="calls-page__compact-meta">
          <span class="calls-page__compact-status">
            {{ compactHoverCall.title }}
          </span>
          <span class="calls-page__compact-date">
            {{ compactHoverCall.dateLabel }}
          </span>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts">
let savedCallsScrollTop = 0;
</script>

<script setup lang="ts">
import MenuSearch from '../UI/MenuSearch.vue';
import { vMenuListPress } from '../../directives/menu-list-press';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue';
import CachedAvatar from '../UI/CachedAvatar.vue';
import MessageCallInfoIcon from '../Messages/MessageCallInfoIcon.vue';
import MessageCallTypeIcon from '../Messages/MessageCallTypeIcon.vue';
import { formatTime } from '../../composables/useTime';
import { navigateToCall, useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { useTopics } from '../../composables/useTopics';
import { getAuthUser } from '../../composables/useAuth';
import { TopicType } from '../../services/useChatSDK/types';
import type { CallHistoryItem as ServerCallHistoryItem } from '../../services/useChatSDK/types';
import {
  parseCallMessage,
  parseCallMessageEx,
  type CallMessageKind
} from '../../utils/parseCallMessage';
import {
  bootstrapCallHistory,
  hydrateCallHistoryCache,
  loadMoreCallHistory,
  useCallHistoryStore
} from '../../services/useCallHistory';
import CallsHeader from './CallsHeader.vue';
import { useUserInfoModal } from '../../composables/useUserInfoModal';
import {
  selectCallForBot,
  useCallBot,
  type CallBotCallSummaryBrief
} from '../../services/useCallBot';
import { showErrorNotification } from '../../composables/useNotifications';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import { useCallUnreadState } from '../../services/useCallUnreadState';

interface CallHistoryItem {
  messageId: string;
  topicId: string;
  sourceTopicId?: string | null;
  callTopicId?: string | null;
  roomId?: string | null;
  topicType: TopicType;
  sourceTopicType: TopicType;
  displayName: string;
  avatarUrl?: string | null;
  avatarInitials: string;
  dateLabel: string;
  fullDateLabel: string;
  title: string;
  duration: string | null;
  detailLabel: string;
  kind: CallMessageKind;
  noAnswer: boolean;
  timeLabel: string;
  createdAt: number;
  callSummary?: CallBotCallSummaryBrief | null;
}

const props = withDefaults(
  defineProps<{
    dataTestid?: string;
    isActive?: boolean;
    autoSelectFirst?: boolean;
    isCollapse?: boolean;
  }>(),
  {
    dataTestid: 'CallsPage',
    isActive: true,
    autoSelectFirst: false,
    isCollapse: false
  }
);

const searchValue = ref('');
const callListRef = ref<HTMLElement | null>(null);
const compactHoverCall = ref<CallHistoryItem | null>(null);
const compactCallPopoverRef = ref<HTMLElement | null>(null);
const compactCallPopoverPosition = ref({ left: 0, top: 0 });
const compactCallPopoverStyle = computed(() => ({
  left: `${compactCallPopoverPosition.value.left}px`,
  top: `${compactCallPopoverPosition.value.top}px`
}));
const loadingMoreLabel = 'Загружаем ещё звонки...';
const authUserId = computed(() => getAuthUser()?.id || '');
const { state: isMobile } = useResizeState(MAX_W_MD);
const { markCallsSeen } = useCallUnreadState();
const { getSelectedTopic } = useTopics();
const { rawCallHistory, callHistoryState } = useCallHistoryStore();
const { selectedCall } = useCallBot();
const state = callHistoryState;
const route = useUrlWatcher();
const { openUserInfo } = useUserInfoModal();
const SCROLL_LOAD_MORE_OFFSET = 160;
const CALLS_SCROLL_RESTORE_MAX_FRAMES = 8;
let callsScrollRestoreFrameId: number | null = null;
let callsScrollRestoreAttempts = 0;
let pendingCallsScrollTop: number | null = null;
let isRestoringCallsScroll = false;
let compactCallCloseTimer: number | null = null;

const buildCallItem = (
  serverCall: ServerCallHistoryItem
): CallHistoryItem | null => {
  const sourceTopicId = Object.prototype.hasOwnProperty.call(
    serverCall,
    'sourceTopicId'
  )
    ? serverCall.sourceTopicId || null
    : serverCall.topicId;
  const callTopicId = serverCall.callTopicId || null;
  const topic = sourceTopicId ? getSelectedTopic(sourceTopicId) : null;
  const callTopic = callTopicId ? getSelectedTopic(callTopicId) : null;
  const parsedCall = parseCallMessage(serverCall.text || '', {
    messageEx: serverCall.ex,
    authUserId: authUserId.value,
    isMeSender: serverCall.senderUserId === authUserId.value
  });
  const parsedEx = parseCallMessageEx(serverCall.ex);

  if (!parsedCall) {
    return null;
  }

  const createdAt = new Date(serverCall.createdAt);
  const dateLabel = createdAt.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit'
  });
  const displayName =
    topic?.name ||
    topic?.group?.title ||
    topic?.user?.initials ||
    serverCall.topicName ||
    'Звонок';
  const avatarUrl =
    topic?.avatarUrl ||
    topic?.group?.avatarUrl ||
    topic?.user?.avatarUrl ||
    serverCall.topicAvatarUrl ||
    '';

  return {
    messageId: serverCall.id,
    topicId: callTopicId || sourceTopicId || serverCall.topicId,
    sourceTopicId,
    callTopicId,
    roomId: serverCall.roomId || parsedEx?.call?.roomId || null,
    topicType:
      (serverCall.callTopicType as TopicType) ||
      (callTopic?.type as TopicType) ||
      (topic?.type as TopicType) ||
      (serverCall.topicType as TopicType),
    sourceTopicType:
      (topic?.type as TopicType) || (serverCall.topicType as TopicType),
    displayName,
    avatarUrl,
    avatarInitials: displayName,
    dateLabel: createdAt.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit'
    }),
    fullDateLabel: createdAt.toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long'
    }),
    title: parsedCall.title,
    duration: parsedCall.duration,
    detailLabel: parsedCall.duration
      ? `${formatTime(createdAt)} (${parsedCall.duration})`
      : formatTime(createdAt),
    kind: parsedCall.kind,
    noAnswer: parsedCall.noAnswer,
    timeLabel: formatTime(createdAt),
    createdAt: createdAt.getTime(),
    callSummary: serverCall.callSummary || null
  };
};

const callHistory = computed<CallHistoryItem[]>(() =>
  rawCallHistory.value
    .map(buildCallItem)
    .filter((call): call is CallHistoryItem => !!call)
    .sort((left, right) => right.createdAt - left.createdAt)
);

const filteredCalls = computed(() => {
  const normalizedQuery = searchValue.value.trim().toLowerCase();

  if (!normalizedQuery) {
    return callHistory.value;
  }

  return callHistory.value.filter(call =>
    [call.displayName, call.title, call.duration || ''].some(value =>
      value.toLowerCase().includes(normalizedQuery)
    )
  );
});

const isActiveRouteCall = (call: CallHistoryItem): boolean =>
  route.value.type === RouteTypes.CALL &&
  !!route.value.id &&
  call.callTopicId === route.value.id;

const getCallTopicSelection = (call: CallHistoryItem): CallHistoryItem => ({
  ...call,
  topicId: call.callTopicId || call.topicId,
  topicType: TopicType.Group
});

const selectCallTopic = (call: CallHistoryItem): void => {
  selectCallForBot(getCallTopicSelection(call));
};

const openCallBot = (call: CallHistoryItem): void => {
  if (!call.callTopicId) {
    showErrorNotification(
      'Чат звонка ещё создаётся. Обновите историю звонков и попробуйте снова.'
    );
    void bootstrapCallHistory(undefined, { force: true });
    return;
  }

  selectCallTopic(call);
  navigateToCall(call.callTopicId);
};

const cancelCompactCallClose = (): void => {
  if (compactCallCloseTimer === null) return;

  window.clearTimeout(compactCallCloseTimer);
  compactCallCloseTimer = null;
};

const closeCompactCallPopover = (): void => {
  cancelCompactCallClose();
  compactHoverCall.value = null;
};

const scheduleCompactCallClose = (): void => {
  cancelCompactCallClose();
  compactCallCloseTimer = window.setTimeout(() => {
    compactCallCloseTimer = null;
    compactHoverCall.value = null;
  }, 120);
};

const getCompactCallPopoverTop = (
  anchorTop: number,
  popoverHeight: number
): number => {
  const viewportPadding = 10;
  const maximumTop = Math.max(
    viewportPadding,
    window.innerHeight - popoverHeight - viewportPadding
  );

  return Math.min(Math.max(anchorTop, viewportPadding), maximumTop);
};

const handleCompactCallEnter = (
  call: CallHistoryItem,
  event: PointerEvent
): void => {
  if (!props.isCollapse || isMobile.value) return;

  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) return;

  cancelCompactCallClose();
  const targetRect = target.getBoundingClientRect();
  const menuRect = target.closest('.menu')?.getBoundingClientRect();

  compactCallPopoverPosition.value = {
    left: (menuRect?.right ?? targetRect.right) + 10,
    top: getCompactCallPopoverTop(targetRect.top, targetRect.height)
  };
  compactHoverCall.value = call;

  void nextTick(() => {
    if (compactHoverCall.value?.messageId !== call.messageId) return;

    const popoverHeight =
      compactCallPopoverRef.value?.getBoundingClientRect().height ||
      targetRect.height;
    compactCallPopoverPosition.value = {
      ...compactCallPopoverPosition.value,
      top: getCompactCallPopoverTop(targetRect.top, popoverHeight)
    };
  });
};

const handleCompactCallClick = (): void => {
  const call = compactHoverCall.value;
  if (!call) return;

  markCallsSeen(call.createdAt, authUserId.value || undefined);
  closeCompactCallPopover();
  openCallBot(call);
};

const selectRouteCallIfNeeded = (): boolean => {
  if (route.value.type !== RouteTypes.CALL || !route.value.id) {
    return false;
  }

  const routeCall = callHistory.value.find(
    call =>
      call.callTopicId === route.value.id || call.topicId === route.value.id
  );

  if (!routeCall) {
    return false;
  }

  if (selectedCall.value?.topicId !== route.value.id) {
    selectCallTopic(routeCall);
  }

  return true;
};

const selectDefaultCallIfNeeded = (): void => {
  if (
    !props.isActive ||
    !props.autoSelectFirst ||
    route.value.type === RouteTypes.CALL ||
    !filteredCalls.value.length
  ) {
    return;
  }

  const selectedId = selectedCall.value?.messageId;
  const selectedStillVisible =
    !!selectedId &&
    filteredCalls.value.some(call => call.messageId === selectedId);

  if (!selectedStillVisible) {
    openCallBot(filteredCalls.value[0]);
  }
};

const handleOpenCallUserInfo = (call: CallHistoryItem): void => {
  if (call.sourceTopicType !== TopicType.DM) {
    return;
  }

  const topic = getSelectedTopic(call.sourceTopicId || call.topicId);
  if (!topic?.user) {
    return;
  }

  openUserInfo(topic.user, topic);
};

const maybeLoadMoreCalls = async (): Promise<void> => {
  if (
    !props.isActive ||
    !state.hasMore ||
    state.isLoadingMore ||
    (state.isLoading && !callHistory.value.length)
  ) {
    return;
  }

  await loadMoreCallHistory();
};

const saveCallsScrollPosition = (): void => {
  if (isRestoringCallsScroll || !callListRef.value) {
    return;
  }

  savedCallsScrollTop = callListRef.value.scrollTop;
};

const clearCallsScrollRestoreSchedule = (): void => {
  if (callsScrollRestoreFrameId !== null) {
    window.cancelAnimationFrame(callsScrollRestoreFrameId);
    callsScrollRestoreFrameId = null;
  }
};

const finishCallsScrollRestore = (): void => {
  clearCallsScrollRestoreSchedule();
  isRestoringCallsScroll = false;
  pendingCallsScrollTop = null;
  callsScrollRestoreAttempts = 0;
};

const applyCallsScrollRestore = (): boolean => {
  const element = callListRef.value;
  const targetTop = pendingCallsScrollTop ?? savedCallsScrollTop;

  if (!props.isActive || !element) {
    return true;
  }

  const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
  const nextScrollTop = Math.min(targetTop, maxScrollTop);

  if (Math.abs(element.scrollTop - nextScrollTop) > 1) {
    element.scrollTop = nextScrollTop;
  }

  return targetTop <= 0 || Math.abs(element.scrollTop - targetTop) <= 1;
};

const scheduleCallsScrollRestorePass = (): void => {
  if (callsScrollRestoreFrameId !== null) {
    return;
  }

  callsScrollRestoreFrameId = window.requestAnimationFrame(() => {
    callsScrollRestoreFrameId = null;

    if (!isRestoringCallsScroll) {
      return;
    }

    callsScrollRestoreAttempts += 1;

    if (
      applyCallsScrollRestore() ||
      callsScrollRestoreAttempts >= CALLS_SCROLL_RESTORE_MAX_FRAMES
    ) {
      finishCallsScrollRestore();
      return;
    }

    scheduleCallsScrollRestorePass();
  });
};

const restoreCallsScrollPosition = (): void => {
  if (!props.isActive) {
    return;
  }

  pendingCallsScrollTop = savedCallsScrollTop;
  isRestoringCallsScroll = true;
  callsScrollRestoreAttempts = 0;
  clearCallsScrollRestoreSchedule();

  if (applyCallsScrollRestore()) {
    finishCallsScrollRestore();
    return;
  }

  void nextTick(() => {
    if (!isRestoringCallsScroll) {
      return;
    }

    if (applyCallsScrollRestore()) {
      finishCallsScrollRestore();
      return;
    }

    scheduleCallsScrollRestorePass();
  });
};

const handleListScroll = (): void => {
  const listElement = callListRef.value;

  closeCompactCallPopover();
  saveCallsScrollPosition();

  if (!listElement || !state.hasMore || state.isLoadingMore) {
    return;
  }

  const remainingScrollDistance =
    listElement.scrollHeight - listElement.scrollTop - listElement.clientHeight;

  if (remainingScrollDistance <= SCROLL_LOAD_MORE_OFFSET) {
    void maybeLoadMoreCalls();
  }
};

const ensureCallHistoryReady = async (): Promise<void> => {
  if (!props.isActive) {
    return;
  }

  void hydrateCallHistoryCache();
  await bootstrapCallHistory();
  if (!selectRouteCallIfNeeded()) {
    selectDefaultCallIfNeeded();
  }
};

onMounted(() => {
  void hydrateCallHistoryCache();

  if (props.isActive) {
    void ensureCallHistoryReady();
    restoreCallsScrollPosition();
  }
});

onBeforeUnmount(() => {
  closeCompactCallPopover();
  saveCallsScrollPosition();
  finishCallsScrollRestore();
});

watch(
  () => props.isCollapse,
  isCollapse => {
    if (!isCollapse) closeCompactCallPopover();
  }
);

watch(
  () => props.isActive,
  (isActive, wasActive) => {
    if (wasActive) {
      saveCallsScrollPosition();
    }

    if (isActive) {
      void ensureCallHistoryReady();
      restoreCallsScrollPosition();
      selectDefaultCallIfNeeded();
    }
  },
  { immediate: false }
);

watch(
  () => filteredCalls.value.length,
  () => {
    restoreCallsScrollPosition();
    if (!selectRouteCallIfNeeded()) {
      selectDefaultCallIfNeeded();
    }
  }
);

watch(
  () => [route.value.type, route.value.id, callHistory.value.length],
  () => {
    selectRouteCallIfNeeded();
  },
  { immediate: true }
);
</script>

<style lang="css">
.calls-page__content,
.calls-page__list {
  display: flex;
  flex-direction: column;
}

.calls-page__content {
  gap: 10px;
}

.calls-page__list {
  gap: 0;
}

.calls-page__delimetr {
  height: 0.35px;
  width: 100%;
  flex-shrink: 0;
  background-color: var(--border-table);
  align-self: flex-end;
}

.calls-page__delimetr:last-child {
  display: none;
}
</style>
