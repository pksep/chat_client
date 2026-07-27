<template>
  <section class="calls-page" :data-testid="`${props.dataTestid}-Container`">
    <CallsHeader
      class="calls-page__header"
      :total-count="state.totalItems || callHistory.length"
      :data-testid="`${props.dataTestid}-Header`"
    />

    <div class="calls-page__content">
      <div class="calls-page__search-shell">
        <Search
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
        ref="callListRef"
        class="calls-page__list"
        @scroll="handleListScroll"
      >
        <div
          v-for="call in filteredCalls"
          :key="call.messageId"
          type="button"
          class="calls-page__item"
          :data-testid="`${props.dataTestid}-Item-${call.messageId}`"
          @click="openCallTopic(call)"
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
                  {{ call.detailLabel }}
                </span>
              </div>
            </div>
          </div>

          <div
            class="calls-page__actions"
            v-if="
              getCallSummaryForCall(call)?.summary ||
              getCallSummaryForCall(call)?.videoAvailable
            "
          >
            <button
              v-if="getCallSummaryForCall(call)?.summary"
              type="button"
              class="calls-page__action"
              title="Скачать расшифровку"
              aria-label="Скачать расшифровку"
              @click.stop="handleDownloadSummary(call)"
            >
              <Icon
                :name="IconNameEnum.fileText"
                :width="16"
                :height="16"
                aria-hidden="true"
              />
            </button>
            <button
              v-if="
                getCallSummaryForCall(call)?.summary ||
                getCallSummaryForCall(call)?.videoAvailable
              "
              type="button"
              class="calls-page__action"
              disabled
              title="Скачать видеозапись"
              aria-label="Скачать видеозапись"
              @click.stop="handleDownloadRecording(call)"
            >
              <Icon
                :name="IconNameEnum.image"
                :width="16"
                :height="16"
                aria-hidden="true"
              />
            </button>
            <button
              v-if="getCallSummaryForCall(call)?.summary"
              type="button"
              class="calls-page__action calls-page__action--send"
              title="Отправить расшифровку в чат"
              aria-label="Отправить расшифровку в чат"
              @click.stop="handleSendSummary(call)"
            >
              <Icon
                :name="IconNameEnum.planeRight"
                :width="16"
                :height="16"
                aria-hidden="true"
              />
              >↗
            </button>
          </div>
          <span
            class="calls-page__info"
            aria-hidden="true"
            @click.stop="openCallTopic(call)"
          >
            <MessageCallInfoIcon />
          </span>
        </div>

        <div v-if="state.isLoadingMore" class="calls-page__loading-more">
          {{ loadingMoreLabel }}
        </div>
      </div>

      <div v-else class="menu-panel menu-panel--centered calls-page__empty">
        <div class="menu-panel__illustration" aria-hidden="true">
          <svg viewBox="0 0 24 24" class="menu-panel__illustration-icon">
            <path
              d="M7.8 4.4c.6-.6 1.5-.7 2.1-.2l2.1 1.7c.6.5.8 1.4.4 2.1l-1 1.8a1 1 0 0 0 .1 1.1c1.1 1.6 2.5 3 4.1 4.1a1 1 0 0 0 1.1.1l1.8-1c.7-.4 1.6-.2 2.1.4l1.7 2.1c.5.6.4 1.5-.2 2.1l-1.1 1.1c-.9.9-2.2 1.3-3.4 1-2.8-.7-5.4-2.2-7.9-4.7S5.7 11 5 8.2c-.3-1.2.1-2.5 1-3.4l1.8-1.1Z"
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.8"
            />
          </svg>
        </div>
        <h3 class="menu-panel__title">
          {{ searchValue.trim() ? 'Ничего не найдено' : 'Звонков пока нет' }}
        </h3>
        <p class="menu-panel__description">
          {{
            searchValue.trim()
              ? 'Попробуйте изменить запрос.'
              : 'История завершённых звонков появится здесь.'
          }}
        </p>
      </div>
    </div>
  </section>
</template>

<script lang="ts">
let savedCallsScrollTop = 0;
</script>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue';
import { Icon, IconNameEnum, Search } from '@pksep/yui';
import CachedAvatar from '../UI/CachedAvatar.vue';
import MessageCallInfoIcon from '../Messages/MessageCallInfoIcon.vue';
import MessageCallTypeIcon from '../Messages/MessageCallTypeIcon.vue';
import { formatTime } from '../../composables/useTime';
import {
  navigateToDialogs,
  navigateToGroup
} from '../../composables/navigation';
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
  downloadCallRecording,
  downloadCallSummary,
  loadLatestCallSummary,
  sendCallSummaryToChat,
  type CallSummaryDto
} from '../../services/useCallSummaries';

interface CallHistoryItem {
  messageId: string;
  topicId: string;
  roomId?: string;
  topicType: TopicType;
  displayName: string;
  avatarUrl?: string;
  avatarInitials: string;
  dateLabel: string;
  title: string;
  duration: string | null;
  detailLabel: string;
  kind: CallMessageKind;
  timeLabel: string;
  createdAt: number;
}

const props = withDefaults(
  defineProps<{
    dataTestid?: string;
    isActive?: boolean;
  }>(),
  {
    dataTestid: 'CallsPage',
    isActive: true
  }
);

const searchValue = ref('');
const callListRef = ref<HTMLElement | null>(null);
const loadingMoreLabel =
  '\u0417\u0430\u0433\u0440\u0443\u0436\u0430\u0435\u043c \u0435\u0449\u0451 \u0437\u0432\u043e\u043d\u043a\u0438...';
const authUserId = computed(() => getAuthUser()?.id || '');
const { getSelectedTopic } = useTopics();
const { rawCallHistory, callHistoryState } = useCallHistoryStore();
const state = callHistoryState;
const { openUserInfo } = useUserInfoModal();
const callSummaries = ref<Record<string, CallSummaryDto | null>>({});
const SCROLL_LOAD_MORE_OFFSET = 160;
const CALLS_SCROLL_RESTORE_MAX_FRAMES = 8;
let callsScrollRestoreFrameId: number | null = null;
let callsScrollRestoreAttempts = 0;
let pendingCallsScrollTop: number | null = null;
let isRestoringCallsScroll = false;

const buildCallItem = (
  serverCall: ServerCallHistoryItem
): CallHistoryItem | null => {
  const topic = getSelectedTopic(serverCall.topicId);
  const parsedCall = parseCallMessage(serverCall.text || '', {
    messageEx: serverCall.ex,
    authUserId: authUserId.value,
    isMeSender: serverCall.senderUserId === authUserId.value
  });
  const parsedEx = parseCallMessageEx(serverCall.ex);

  if (!parsedCall) {
    return null;
  }

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
    topicId: serverCall.topicId,
    roomId: parsedEx?.call?.roomId,
    topicType:
      (topic?.type as TopicType) || (serverCall.topicType as TopicType),
    displayName,
    avatarUrl,
    avatarInitials: displayName,
    dateLabel: new Date(serverCall.createdAt).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit'
    }),
    title: parsedCall.title,
    duration: parsedCall.duration,
    detailLabel: parsedCall.duration
      ? `${formatTime(new Date(serverCall.createdAt))} (${parsedCall.duration})`
      : formatTime(new Date(serverCall.createdAt)),
    kind: parsedCall.kind,
    timeLabel: formatTime(new Date(serverCall.createdAt)),
    createdAt: new Date(serverCall.createdAt).getTime()
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

const refreshCallSummaries = async (): Promise<void> => {
  await Promise.all(
    callHistory.value.map(async call => {
      cacheCallSummaryForCall(
        call,
        await loadLatestCallSummary(call.topicId, call.roomId)
      );
    })
  );
};

const callSummaryKey = (call: CallHistoryItem): string =>
  call.roomId || call.topicId;

const cacheCallSummaryForCall = (
  call: CallHistoryItem,
  summary: CallSummaryDto | null
): void => {
  callSummaries.value[callSummaryKey(call)] = summary;
  callSummaries.value[call.topicId] = summary;
  if (call.roomId) {
    callSummaries.value[call.roomId] = summary;
  }
};

const getCallSummaryForCall = (call: CallHistoryItem): CallSummaryDto | null =>
  callSummaries.value[callSummaryKey(call)] ||
  callSummaries.value[call.topicId] ||
  (call.roomId ? callSummaries.value[call.roomId] : null) ||
  null;

const handleDownloadSummary = async (call: CallHistoryItem): Promise<void> => {
  const summary =
    getCallSummaryForCall(call) ||
    (await loadLatestCallSummary(call.topicId, call.roomId));
  if (summary) await downloadCallSummary(summary);
};

const handleDownloadRecording = async (
  call: CallHistoryItem
): Promise<void> => {
  const summary =
    getCallSummaryForCall(call) ||
    (await loadLatestCallSummary(call.topicId, call.roomId));
  if (summary) await downloadCallRecording(summary);
};

const handleSendSummary = async (call: CallHistoryItem): Promise<void> => {
  const summary =
    getCallSummaryForCall(call) ||
    (await loadLatestCallSummary(call.topicId, call.roomId));
  if (summary) await sendCallSummaryToChat(summary);
};

const openCallTopic = (call: CallHistoryItem): void => {
  if (call.topicType === TopicType.Group) {
    navigateToGroup(call.topicId);
    return;
  }

  navigateToDialogs(call.topicId);
};

const handleOpenCallUserInfo = (call: CallHistoryItem): void => {
  if (call.topicType !== TopicType.DM) {
    return;
  }

  const topic = getSelectedTopic(call.topicId);
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
};

onMounted(() => {
  void hydrateCallHistoryCache();

  if (props.isActive) {
    void ensureCallHistoryReady();
    void refreshCallSummaries();
    restoreCallsScrollPosition();
  }
});

onBeforeUnmount(() => {
  saveCallsScrollPosition();
  finishCallsScrollRestore();
});

watch(
  () => props.isActive,
  (isActive, wasActive) => {
    if (wasActive) {
      saveCallsScrollPosition();
    }

    if (isActive) {
      void ensureCallHistoryReady();
      void refreshCallSummaries();
      restoreCallsScrollPosition();
    }
  },
  { immediate: false }
);

watch(
  () => filteredCalls.value.length,
  () => {
    restoreCallsScrollPosition();
    void refreshCallSummaries();
  }
);
</script>
