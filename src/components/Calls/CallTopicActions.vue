<template>
  <section
    v-if="callTopicMeta"
    class="call-topic-actions"
    :data-testid="`${props.dataTestid}-Container`"
  >
    <button
      type="button"
      class="call-topic-actions__button"
      :disabled="isActionPending || !canUseTranscriptActions"
      @click="handleSendSummary"
    >
      <span
        class="call-topic-actions__icon call-topic-actions__icon--file-text"
        aria-hidden="true"
      />
      <span>Сделать краткое содержание</span>
    </button>
    <button
      type="button"
      class="call-topic-actions__button"
      :disabled="isActionPending || !canUseTranscriptActions"
      @click="handleDownloadTranscript"
    >
      <span
        class="call-topic-actions__icon call-topic-actions__icon--download"
        aria-hidden="true"
      />
      <span>Скачать транскрибацию звонка</span>
    </button>
    <button
      type="button"
      class="call-topic-actions__button"
      disabled
      @click="handleDownloadVideo"
    >
      <span
        class="call-topic-actions__icon call-topic-actions__icon--download"
        aria-hidden="true"
      />
      <span>Скачать видео-запись</span>
    </button>
    <button
      type="button"
      class="call-topic-actions__button"
      :disabled="isActionPending || !canUseTranscriptActions"
      @click="handleSendActionList"
    >
      <span
        class="call-topic-actions__icon call-topic-actions__icon--list"
        aria-hidden="true"
      />
      <span>Список действий по звонку</span>
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ITopic } from '../interfaces/interfaces';
import {
  downloadCallRecording,
  downloadCallTranscript,
  loadLatestCallSummary,
  sendCallSummaryPromptToChat,
  sendGeneratedCallActionListToChat,
  sendGeneratedCallSummaryBriefToChat,
  type CallSummaryDto,
  withCallSummaryTyping
} from '../../services/useCallSummaries';
import { showErrorNotification } from '../../composables/useNotifications';
import { parseCallTopicDescription } from '../../utils/call-topic';

const props = withDefaults(
  defineProps<{
    topic: ITopic;
    dataTestid?: string;
  }>(),
  {
    dataTestid: 'CallTopicActions'
  }
);

const summary = ref<CallSummaryDto | null>(null);
const isActionPending = ref(false);
let summaryLoadToken = 0;

interface SummaryActionContext {
  topicId: string;
  roomId: string | null;
}

const callTopicMeta = computed(() =>
  parseCallTopicDescription(props.topic.group?.description)
);

const canUseTranscriptActions = computed(() =>
  Boolean(summary.value?.transcript || summary.value?.hasTranscript)
);

const hydrateSummary = async (): Promise<void> => {
  const token = ++summaryLoadToken;
  const roomId = callTopicMeta.value?.roomId || null;
  const topicId = props.topic.id;
  summary.value = null;

  if (!topicId || !roomId) {
    return;
  }

  const latestSummary = await loadLatestCallSummary(topicId, roomId);
  if (token === summaryLoadToken) {
    summary.value = latestSummary;
  }
};

const getSummaryActionContext = (): SummaryActionContext => ({
  topicId: props.topic.id,
  roomId: callTopicMeta.value?.roomId || null
});

const isSummaryForContext = (
  readySummary: CallSummaryDto,
  context: SummaryActionContext
): boolean =>
  context.roomId
    ? readySummary.roomId === context.roomId
    : readySummary.topicId === context.topicId;

const ensureReadySummary = async (
  context: SummaryActionContext,
  options: { requireTranscript?: boolean } = {}
): Promise<CallSummaryDto | null> => {
  if (
    summary.value &&
    isSummaryForContext(summary.value, context) &&
    (!options.requireTranscript || summary.value.transcript)
  ) {
    return summary.value;
  }

  const latestSummary = await loadLatestCallSummary(
    context.topicId,
    context.roomId
  );
  if (latestSummary && isSummaryForContext(latestSummary, context)) {
    summary.value = latestSummary;
  }
  return latestSummary;
};

const runSummaryAction = async (
  action: (
    readySummary: CallSummaryDto,
    context: SummaryActionContext
  ) => Promise<boolean>
): Promise<void> => {
  if (isActionPending.value) {
    return;
  }

  const context = getSummaryActionContext();
  isActionPending.value = true;
  try {
    const readySummary = await ensureReadySummary(context);
    if (!readySummary || !isSummaryForContext(readySummary, context)) {
      showErrorNotification('Запись звонка не найдена');
      return;
    }

    await action(readySummary, context);
  } finally {
    isActionPending.value = false;
  }
};

const handleSendSummary = (): void => {
  void runSummaryAction(async (readySummary, context) => {
    if (!readySummary.transcript && !readySummary.hasTranscript) {
      showErrorNotification('Краткое содержание ещё не готово');
      return false;
    }

    const promptSent = await sendCallSummaryPromptToChat(
      context.topicId,
      'Сделать краткое содержание'
    );
    if (!promptSent) {
      showErrorNotification('Не удалось отправить запрос Звонилке');
      return false;
    }

    return withCallSummaryTyping(context.topicId, () =>
      sendGeneratedCallSummaryBriefToChat(readySummary, context.topicId)
    );
  });
};

const handleDownloadTranscript = (): void => {
  void runSummaryAction(async (readySummary, context) => {
    const summaryWithTranscript = readySummary.transcript
      ? readySummary
      : await ensureReadySummary(context, { requireTranscript: true });

    if (
      !summaryWithTranscript?.transcript ||
      !isSummaryForContext(summaryWithTranscript, context)
    ) {
      showErrorNotification('Транскрибация ещё не готова');
      return false;
    }

    return downloadCallTranscript(summaryWithTranscript);
  });
};

const handleDownloadVideo = (): void => {
  void runSummaryAction(async readySummary => {
    if (!readySummary.videoAvailable) {
      showErrorNotification('Видео-запись для этого звонка недоступна');
      return false;
    }

    return downloadCallRecording(readySummary);
  });
};

const handleSendActionList = (): void => {
  void runSummaryAction(async (readySummary, context) => {
    if (!readySummary.transcript && !readySummary.hasTranscript) {
      showErrorNotification('Список действий ещё не готов');
      return false;
    }

    const promptSent = await sendCallSummaryPromptToChat(
      context.topicId,
      'Список действий по звонку'
    );
    if (!promptSent) {
      showErrorNotification('Не удалось отправить запрос Звонилке');
      return false;
    }

    return withCallSummaryTyping(context.topicId, () =>
      sendGeneratedCallActionListToChat(readySummary, context.topicId)
    );
  });
};

watch(
  () => [props.topic.id, props.topic.group?.description],
  () => {
    void hydrateSummary();
  },
  { immediate: true }
);
</script>

<style scoped>
.call-topic-actions {
  grid-row: 3;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 8px 15px 6px;
  border-top: 0;
  background: transparent;
  overflow-x: auto;
  scrollbar-width: none;
}

.call-topic-actions::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.call-topic-actions__button {
  min-height: 30px;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 10px;
  padding: 7px 8px;
  border: 1px solid #9cbeff;
  border-radius: 5px;
  background: var(--white);
  color: #1c2635;
  font: inherit;
  font-family: 'Inter Variable', sans-serif;
  font-size: 14px;
  font-weight: 400;
  line-height: 100%;
  letter-spacing: 0;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    border-color 0.12s ease,
    color 0.12s ease;
}

.call-topic-actions__button:hover:not(:disabled) {
  border-color: #9cbeff;
  background: #ffffff;
}

.call-topic-actions__button:active:not(:disabled) {
  border-color: #9cbeff;
  background: #548cf6;
  color: var(--white);
}

.call-topic-actions__button:focus-visible {
  outline: 1px solid #5b9cff;
  outline-offset: 2px;
}

.call-topic-actions__button:disabled {
  border-color: #e7e7e7;
  background: #f5f5f5;
  color: #757d8a;
  cursor: not-allowed;
  opacity: 1;
}

.call-topic-actions__icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  flex: 0 0 16px;
  align-items: center;
  justify-content: center;
  background-color: currentColor;
}

.call-topic-actions__icon--file-text {
  -webkit-mask: url('../../assets/call-topic-file-text.svg') center / 16px 16px
    no-repeat;
  mask: url('../../assets/call-topic-file-text.svg') center / 16px 16px
    no-repeat;
}

.call-topic-actions__icon--download {
  -webkit-mask: url('../../assets/call-topic-download.svg') center / 16px 16px
    no-repeat;
  mask: url('../../assets/call-topic-download.svg') center / 16px 16px no-repeat;
}

.call-topic-actions__icon--list {
  -webkit-mask: url('../../assets/call-topic-list.svg') center / 16px 16px
    no-repeat;
  mask: url('../../assets/call-topic-list.svg') center / 16px 16px no-repeat;
}

@media screen and (width <= 768px) {
  .call-topic-actions {
    display: flex;
    flex-wrap: nowrap;
    justify-content: flex-start;
    align-items: center;
    gap: 6px;
    padding: 8px 16px 4px;
    overflow-x: auto;
  }

  .call-topic-actions__button {
    width: max-content;
    max-width: none;
    justify-content: flex-start;
  }
}
</style>
