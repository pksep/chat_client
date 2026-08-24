<template>
  <div
    v-if="callTopicMeta"
    class="call-topic-default-message"
    :data-testid="`${props.dataTestid}-Container`"
  >
    <div class="top-element">
      <div class="date-divider">
        <span>{{ dividerLabel }}</span>
      </div>
    </div>

    <article class="call-topic-default-message__bubble">
      <p class="call-topic-default-message__title">{{ titleText }}</p>
      <p>{{ statusText }}</p>
      <p v-if="hasRecording">Вы можете выбрать доступное действие из меню.</p>
      <time class="call-topic-default-message__time">{{ timeLabel }}</time>
    </article>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ITopic } from '../interfaces/interfaces';
import { formatDay, formatTime } from '../../composables/useTime';
import {
  loadLatestCallSummary,
  type CallSummaryDto
} from '../../services/useCallSummaries';
import { useCallBot } from '../../services/useCallBot';
import { TopicType } from '../../services/useChatSDK/types';
import { parseCallTopicDescription } from '../../utils/call-topic';

const props = withDefaults(
  defineProps<{
    topic: ITopic;
    dataTestid?: string;
  }>(),
  {
    dataTestid: 'CallTopicDefaultMessage'
  }
);

const { selectedCall } = useCallBot();
const summary = ref<CallSummaryDto | null>(null);
const isLoadingSummary = ref(false);
let summaryLoadToken = 0;

const callTopicMeta = computed(() =>
  parseCallTopicDescription(props.topic.group?.description)
);
const selectedCallForTopic = computed(() =>
  selectedCall.value?.topicId === props.topic.id ? selectedCall.value : null
);
const summaryDate = computed(() => {
  const selectedCreatedAt = selectedCallForTopic.value?.createdAt;
  if (typeof selectedCreatedAt === 'number' && selectedCreatedAt > 0) {
    return new Date(selectedCreatedAt);
  }

  if (summary.value?.createdAt) {
    return new Date(summary.value.createdAt);
  }

  return new Date();
});
const dividerLabel = computed(
  () =>
    selectedCallForTopic.value?.fullDateLabel || formatDay(summaryDate.value)
);
const timeLabel = computed(
  () => selectedCallForTopic.value?.timeLabel || formatTime(summaryDate.value)
);
const targetLabel = computed(() => {
  const call = selectedCallForTopic.value;
  if (!call?.displayName) {
    return '';
  }

  return call.sourceTopicType === TopicType.Group
    ? ` в группе ${call.displayName}`
    : ` с ${call.displayName}`;
});
const titleText = computed(
  () => `Информация о звонке от ${dividerLabel.value}${targetLabel.value}.`
);
const hasRecording = computed(
  () =>
    !!summary.value &&
    (summary.value.status !== 'FAILED' ||
      summary.value.videoStatus !== 'FAILED')
);
const statusText = computed(() => {
  if (isLoadingSummary.value && !summary.value) {
    return 'Проверяем данные звонка...';
  }

  return hasRecording.value
    ? 'Запись звонка найдена.'
    : 'Запись звонка не найдена.';
});

const hydrateSummary = async (): Promise<void> => {
  const token = ++summaryLoadToken;
  const roomId = callTopicMeta.value?.roomId || null;
  summary.value = null;

  if (!props.topic.id || !roomId) {
    return;
  }

  isLoadingSummary.value = true;
  try {
    const latestSummary = await loadLatestCallSummary(props.topic.id, roomId);
    if (token === summaryLoadToken) {
      summary.value = latestSummary;
    }
  } finally {
    if (token === summaryLoadToken) {
      isLoadingSummary.value = false;
    }
  }
};

watch(
  () => [
    props.topic.id,
    props.topic.group?.description,
    selectedCall.value?.messageId
  ],
  () => {
    void hydrateSummary();
  },
  { immediate: true }
);
</script>

<style scoped>
.call-topic-default-message {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
}

.call-topic-default-message > .top-element {
  width: 100%;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.call-topic-default-message__bubble {
  position: relative;
  width: min(365px, calc(100% - 20px));
  box-sizing: border-box;
  margin: 0;
  padding: 12px 54px 18px 12px;
  border-radius: 8px;
  background: var(--white);

  font-size: 13px;
  line-height: 16px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
}

.call-topic-default-message__bubble p {
  margin: 0 0 8px;
}

.call-topic-default-message__bubble p:last-of-type {
  margin-bottom: 0;
}

.call-topic-default-message__title {
  font-weight: 700;
}

.call-topic-default-message__time {
  position: absolute;
  right: 12px;
  bottom: 6px;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 13px;
}

@media screen and (width <= 768px) {
  .call-topic-default-message__bubble {
    width: min(320px, calc(100% - 8px));
    font-size: 12px;
    line-height: 15px;
  }
}
</style>
