<template>
  <section class="calls-page" :data-testid="`${props.dataTestid}-Container`">
    <CallsHeader
      class="calls-page__header"
      :total-count="callHistory.length"
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

      <div v-else-if="filteredCalls.length" class="calls-page__list">
        <button
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

          <span class="calls-page__info" aria-hidden="true">
            <MessageCallInfoIcon />
          </span>
        </button>
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

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Search } from '@pksep/yui';
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
  type CallMessageKind
} from '../../utils/parseCallMessage';
import {
  hydrateCallHistoryCache,
  useCallHistoryStore
} from '../../services/useCallHistory';
import CallsHeader from './CallsHeader.vue';
import { useUserInfoModal } from '../../composables/useUserInfoModal';

interface CallHistoryItem {
  messageId: string;
  topicId: string;
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
  }>(),
  {
    dataTestid: 'CallsPage'
  }
);

const searchValue = ref('');
const authUserId = computed(() => getAuthUser()?.id || '');
const { getSelectedTopic } = useTopics();
const { rawCallHistory, callHistoryState } = useCallHistoryStore();
const state = callHistoryState;
const { openUserInfo } = useUserInfoModal();

const buildCallItem = (
  serverCall: ServerCallHistoryItem
): CallHistoryItem | null => {
  const topic = getSelectedTopic(serverCall.topicId);
  const parsedCall = parseCallMessage(serverCall.text || '', {
    messageEx: serverCall.ex,
    authUserId: authUserId.value,
    isMeSender: serverCall.senderUserId === authUserId.value
  });

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

onMounted(() => {
  void hydrateCallHistoryCache();
});
</script>
