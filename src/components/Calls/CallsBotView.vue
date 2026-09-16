<template>
  <section class="calls-bot" :data-testid="`${props.dataTestid}-Container`">
    <header class="calls-bot__header">
      <button
        v-if="props.showBack"
        type="button"
        class="calls-bot__back"
        aria-label="Назад"
        @click="emit('back')"
      >
        ‹
      </button>
      <div class="calls-bot__header-copy">
        <h3 class="calls-bot__title">Звонилка</h3>
        <p
          :class="[
            'calls-bot__subtitle',
            { 'calls-bot__subtitle--typing': isPendingForSelectedCall }
          ]"
        >
          {{ callsBotSubtitle }}
        </p>
      </div>
    </header>

    <div v-if="selectedCall" class="calls-bot__body">
      <div class="calls-bot__date">{{ selectedCall.fullDateLabel }}</div>

      <article class="calls-bot__message">
        <p class="calls-bot__message-title">
          {{ callInfoTitle }}
        </p>
        <p v-if="recordingStatusText">{{ recordingStatusText }}</p>
        <p v-if="hasRecording">Вы можете выбрать доступное действие из меню.</p>
        <p v-else-if="!isLoadingSummary">
          Для этого звонка пока нет сохранённой записи у вашего пользователя.
        </p>
        <time class="calls-bot__message-time">{{
          selectedCall.timeLabel
        }}</time>
      </article>

      <div v-if="hasRecording" class="calls-bot__actions">
        <button
          type="button"
          class="calls-bot__action"
          :disabled="isActionPending || !canUseTranscriptActions"
          @click="handleSendSummary"
        >
          <span class="calls-bot__action-icon" aria-hidden="true">☰</span>
          <span>Сделать краткое содержание</span>
        </button>
        <button
          type="button"
          class="calls-bot__action"
          :disabled="isActionPending || !canUseTranscriptActions"
          @click="handleDownloadTranscript"
        >
          <span class="calls-bot__action-icon" aria-hidden="true">⇩</span>
          <span>Скачать транскрибацию звонка</span>
        </button>
        <button
          type="button"
          class="calls-bot__action"
          :disabled="isActionPending || !summary?.videoAvailable"
          @click="handleDownloadVideo"
        >
          <span class="calls-bot__action-icon" aria-hidden="true">⇩</span>
          <span>Скачать видео-запись</span>
        </button>
        <button
          type="button"
          class="calls-bot__action"
          :disabled="isActionPending || !canUseTranscriptActions"
          @click="handleSendActionList"
        >
          <span class="calls-bot__action-icon" aria-hidden="true">☰</span>
          <span>Список действий по звонку</span>
        </button>
      </div>

      <div
        v-if="safeVisibleChatMessages.length"
        class="calls-bot__conversation"
      >
        <div
          v-for="message in safeVisibleChatMessages"
          :key="message.id"
          :class="[
            'calls-bot__chat-message',
            { 'calls-bot__chat-message--outgoing': message.isOutgoing }
          ]"
        >
          <span v-html="message.text" />
        </div>
      </div>
    </div>

    <div v-else class="calls-bot__empty">
      <h3>Звонилка</h3>
      <p>
        Выберите звонок слева, чтобы посмотреть запись и доступные действия.
      </p>
    </div>

    <footer v-if="selectedCall" class="calls-bot__input">
      <MessageListInput
        v-model="composerText"
        class="calls-bot__message-input"
        :data-testid="`${props.dataTestid}-MessageInput`"
        :edit-message="null"
        :reply-message="null"
        :forward-messages="[]"
        :allow-empty-send="false"
        :allow-attach-file="true"
        :allow-select-user="false"
        @send="handleComposerSend"
        @attach-file="handleAttachFile"
      />
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MessageListInput from '../Messages/MessageListInput.vue';
import {
  downloadCallRecording,
  downloadCallTranscript,
  loadLatestCallSummary,
  sendCallSummaryPromptToChat,
  sendGeneratedCallActionListToChat,
  sendGeneratedCallPromptResponseToChat,
  sendGeneratedCallSummaryBriefToChat,
  type CallSummaryDto,
  withCallSummaryTyping
} from '../../services/useCallSummaries';
import { useCallBot } from '../../services/useCallBot';
import { showErrorNotification } from '../../composables/useNotifications';
import { TopicType } from '../../services/useChatSDK/types';
import { getAuthUser } from '../../composables/useAuth';
import { sendMessageChat } from '../../services/useChat';
import { getMessagesByTopicId } from '../../services/useMessages';
import { stripHtml } from '../../utils/stripHtml';
import { parseMessageEx } from '../../utils/messageReplyQuote';
import { isBotUser } from '../../utils/bot';
import { sanitizeMessageHtml } from '../../utils/sanitizeMessageHtml';

interface ComposerSendPayload {
  content?: string;
  taggedUserIds?: string[];
}

interface CallsBotChatMessage {
  id: string;
  text: string;
  isOutgoing: boolean;
  createdAt: number;
}

const props = withDefaults(
  defineProps<{
    dataTestid?: string;
    showBack?: boolean;
  }>(),
  {
    dataTestid: 'CallsBotView',
    showBack: false
  }
);
const emit = defineEmits<{
  (e: 'back'): void;
}>();

const { selectedCall } = useCallBot();
const summary = ref<CallSummaryDto | null>(null);
const isLoadingSummary = ref(false);
const isActionPending = ref(false);
const pendingActionMessageId = ref<string | null>(null);
const composerText = ref('');
const optimisticMessages = ref<CallsBotChatMessage[]>([]);
let summaryLoadToken = 0;

interface SummaryActionContext {
  topicId: string;
  roomId?: string | null;
  actionKey: string;
}

const authUserId = computed(() => getAuthUser()?.id || '');

const isCallBotResponse = (message: {
  ex?: unknown;
  senderUser?: unknown;
}): boolean =>
  parseMessageEx(message.ex).type === 'call-summary-bot-response' ||
  isBotUser(message.senderUser as Parameters<typeof isBotUser>[0]);

const isOutgoingChatMessage = (message: {
  ex?: unknown;
  senderUser?: unknown;
  senderUserId?: string | null;
}): boolean => {
  if (isCallBotResponse(message)) {
    return false;
  }

  return !!authUserId.value && message.senderUserId === authUserId.value;
};

const visibleChatMessages = computed<CallsBotChatMessage[]>(() => {
  const topicId = selectedCall.value?.topicId;
  if (!topicId) {
    return [];
  }

  const storedMessages = getMessagesByTopicId(topicId)
    .filter(message => {
      if (message.isSystem || !message.text) {
        return false;
      }

      const plainText = stripHtml(message.text)
        .replace(/\u00a0/g, ' ')
        .trim();

      return !!plainText;
    })
    .slice(-3)
    .map(message => ({
      id: message.id,
      text: message.text || '',
      isOutgoing: isOutgoingChatMessage(message),
      createdAt: new Date(message.createdAt || Date.now()).getTime()
    }));
  const optimisticForTopic = optimisticMessages.value.filter(message =>
    message.id.startsWith(`${topicId}:`)
  );
  const byId = new Map<string, CallsBotChatMessage>();

  [...storedMessages, ...optimisticForTopic]
    .sort((left, right) => left.createdAt - right.createdAt)
    .forEach(message => byId.set(message.id, message));

  return [...byId.values()].slice(-3);
});

const safeVisibleChatMessages = computed<CallsBotChatMessage[]>(() =>
  visibleChatMessages.value.map(message => ({
    ...message,
    text: sanitizeMessageHtml(message.text)
  }))
);

const callInfoTitle = computed(() => {
  if (!selectedCall.value) {
    return '';
  }

  if (!selectedCall.value.sourceTopicId) {
    return `Информация о звонке от ${selectedCall.value.fullDateLabel}.`;
  }

  const target =
    selectedCall.value.topicType === TopicType.Group
      ? `в группе ${selectedCall.value.displayName}`
      : `с ${selectedCall.value.displayName}`;

  return `Информация о звонке от ${selectedCall.value.fullDateLabel} ${target}.`;
});

const hasRecording = computed(
  () =>
    !!summary.value &&
    (summary.value.status !== 'FAILED' ||
      summary.value.videoStatus !== 'FAILED')
);

const canUseTranscriptActions = computed(() =>
  Boolean(summary.value?.transcript || summary.value?.hasTranscript)
);
const isPendingForSelectedCall = computed(
  () =>
    isActionPending.value &&
    !!selectedCall.value?.topicId &&
    pendingActionMessageId.value === selectedCall.value.topicId
);
const callsBotSubtitle = computed(() =>
  isPendingForSelectedCall.value ? 'печатает...' : '@zvonilka'
);
const recordingStatusText = computed(() => {
  if (isLoadingSummary.value && !summary.value) {
    return '';
  }

  if (!summary.value) {
    return 'Запись звонка не найдена.';
  }

  if (
    summary.value.status === 'PROCESSING' ||
    summary.value.videoStatus === 'PROCESSING' ||
    summary.value.status === 'RECORDING' ||
    summary.value.videoStatus === 'RECORDING' ||
    summary.value.status === 'STARTING' ||
    summary.value.videoStatus === 'STARTING'
  ) {
    return 'Запись звонка обрабатывается.';
  }

  return 'Запись звонка найдена.';
});

const hydrateSummary = async (): Promise<void> => {
  const call = selectedCall.value;
  const token = ++summaryLoadToken;

  summary.value = (call?.callSummary as CallSummaryDto | null) || null;

  if (!call?.topicId) {
    return;
  }

  isLoadingSummary.value = true;
  try {
    const latestSummary = await loadLatestCallSummary(
      call.topicId,
      call.roomId
    );
    if (token === summaryLoadToken) {
      summary.value = latestSummary;
    }
  } finally {
    if (token === summaryLoadToken) {
      isLoadingSummary.value = false;
    }
  }
};

const getSummaryActionContext = (): SummaryActionContext | null => {
  const call = selectedCall.value;

  if (!call?.topicId) {
    return null;
  }

  return {
    topicId: call.topicId,
    roomId: call.roomId,
    actionKey: call.topicId
  };
};

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
  if (!context) {
    showErrorNotification('Запись звонка не найдена');
    return;
  }

  isActionPending.value = true;
  pendingActionMessageId.value = context.actionKey;
  try {
    const readySummary = await ensureReadySummary(context);
    if (!readySummary || !isSummaryForContext(readySummary, context)) {
      showErrorNotification('Запись звонка не найдена');
      return;
    }

    await action(readySummary, context);
  } finally {
    isActionPending.value = false;
    pendingActionMessageId.value = null;
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

const handleComposerSend = (payload?: ComposerSendPayload): void => {
  void (async () => {
    const call = selectedCall.value;
    const content = payload?.content || composerText.value;
    const plainText = stripHtml(content)
      .replace(/\u00a0/g, ' ')
      .trim();

    if (!call?.topicId || !plainText) {
      return;
    }

    const optimisticId = `${call.topicId}:${Date.now()}`;
    optimisticMessages.value = optimisticMessages.value.concat({
      id: optimisticId,
      text: content,
      isOutgoing: true,
      createdAt: Date.now()
    });

    const sent = await sendMessageChat({
      topicId: call.topicId,
      text: content,
      taggedUserIds: payload?.taggedUserIds || []
    });

    if (sent) {
      optimisticMessages.value = optimisticMessages.value.filter(
        message => message.id !== optimisticId
      );
      composerText.value = '';
      void runSummaryAction(async (readySummary, context) => {
        if (!readySummary.transcript && !readySummary.hasTranscript) {
          showErrorNotification('Транскрибация ещё не готова');
          return false;
        }

        return withCallSummaryTyping(context.topicId, () =>
          sendGeneratedCallPromptResponseToChat(
            readySummary,
            context.topicId,
            plainText
          )
        );
      });
      return;
    }

    optimisticMessages.value = optimisticMessages.value.filter(
      message => message.id !== optimisticId
    );
    showErrorNotification('Не удалось отправить сообщение');
  })();
};

const handleAttachFile = (): void => {
  showErrorNotification('Вложения в разделе звонков пока недоступны');
};

watch(
  () => [
    selectedCall.value?.messageId,
    selectedCall.value?.topicId,
    selectedCall.value?.roomId
  ],
  () => {
    void hydrateSummary();
    composerText.value = '';
  },
  { immediate: true }
);
</script>
