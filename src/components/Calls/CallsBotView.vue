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
      <BotAvatar class="calls-bot__avatar" :size="28" :is-online="false" />
      <div class="calls-bot__header-copy">
        <h3 class="calls-bot__title">Звонилка</h3>
        <p class="calls-bot__subtitle">@zvonilka</p>
      </div>
    </header>

    <div v-if="selectedCall" class="calls-bot__body">
      <div class="calls-bot__date">{{ selectedCall.fullDateLabel }}</div>

      <article class="calls-bot__message">
        <p class="calls-bot__message-title">
          {{ callInfoTitle }}
        </p>
        <p>{{ recordingStatusText }}</p>
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
          :disabled="isActionPending || !summary?.summary"
          @click="handleSendSummary"
        >
          <span class="calls-bot__action-icon" aria-hidden="true">☰</span>
          <span>Сделать краткое содержание</span>
        </button>
        <button
          type="button"
          class="calls-bot__action"
          :disabled="isActionPending || !summary?.summary"
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
          :disabled="isActionPending || !summary?.summary"
          @click="handleDownloadActionList"
        >
          <span class="calls-bot__action-icon" aria-hidden="true">☰</span>
          <span>Список действий по звонку</span>
        </button>
      </div>

      <div v-if="visibleChatMessages.length" class="calls-bot__conversation">
        <div
          v-for="message in visibleChatMessages"
          :key="message.id"
          :class="[
            'calls-bot__chat-message',
            { 'calls-bot__chat-message--outgoing': message.isOutgoing }
          ]"
        >
          <span
            v-if="message.senderName && !message.isOutgoing"
            class="calls-bot__chat-sender"
          >
            {{ message.senderName }}
          </span>
          <span v-html="message.text" />
        </div>
      </div>
    </div>

    <div v-else class="calls-bot__empty">
      <BotAvatar :size="48" :is-online="false" />
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
        :allow-select-user="true"
        @send="handleComposerSend"
        @attach-file="handleAttachFile"
      />
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BotAvatar from '../UI/BotAvatar.vue';
import MessageListInput from '../Messages/MessageListInput.vue';
import {
  downloadCallRecording,
  downloadCallSummary,
  loadLatestCallSummary,
  sendCallSummaryToChat,
  type CallSummaryDto
} from '../../services/useCallSummaries';
import { useCallBot } from '../../services/useCallBot';
import { showErrorNotification } from '../../composables/useNotifications';
import { TopicType } from '../../services/useChatSDK/types';
import { getAuthUser } from '../../composables/useAuth';
import { sendMessageChat } from '../../services/useChat';
import { getMessagesByTopicId } from '../../services/useMessages';
import { stripHtml } from '../../utils/stripHtml';

interface ComposerSendPayload {
  content?: string;
  taggedUserIds?: string[];
}

interface CallsBotChatMessage {
  id: string;
  text: string;
  senderName: string;
  isOutgoing: boolean;
  createdAt: number;
}

const CALL_GENERATED_MESSAGE_PREFIXES = [
  'Расшифровка звонка',
  'Конспект звонка',
  'Суммари звонка',
  'Краткое содержание звонка',
  'Итоги -',
  'Звонок завершен'
];

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
const composerText = ref('');
const optimisticMessages = ref<CallsBotChatMessage[]>([]);
let summaryLoadToken = 0;

const authUserId = computed(() => getAuthUser()?.id || '');

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

      return !CALL_GENERATED_MESSAGE_PREFIXES.some(prefix =>
        plainText.startsWith(prefix)
      );
    })
    .slice(-3)
    .map(message => ({
      id: message.id,
      text: message.text || '',
      senderName: message.senderUser?.initials || '',
      isOutgoing: message.senderUserId === authUserId.value,
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

const callInfoTitle = computed(() => {
  if (!selectedCall.value) {
    return '';
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

const recordingStatusText = computed(() => {
  if (isLoadingSummary.value && !summary.value) {
    return 'Проверяем запись звонка...';
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

const ensureReadySummary = async (): Promise<CallSummaryDto | null> => {
  const call = selectedCall.value;

  if (!call?.topicId) {
    return null;
  }

  if (summary.value?.summary || summary.value?.videoAvailable) {
    return summary.value;
  }

  const latestSummary = await loadLatestCallSummary(call.topicId, call.roomId);
  summary.value = latestSummary;
  return latestSummary;
};

const runSummaryAction = async (
  action: (readySummary: CallSummaryDto) => Promise<boolean>
): Promise<void> => {
  if (isActionPending.value) {
    return;
  }

  isActionPending.value = true;
  try {
    const readySummary = await ensureReadySummary();
    if (!readySummary) {
      showErrorNotification('Запись звонка не найдена');
      return;
    }

    await action(readySummary);
  } finally {
    isActionPending.value = false;
  }
};

const handleSendSummary = (): void => {
  void runSummaryAction(async readySummary => {
    if (!readySummary.summary) {
      showErrorNotification('Краткое содержание ещё не готово');
      return false;
    }

    return sendCallSummaryToChat(readySummary);
  });
};

const handleDownloadTranscript = (): void => {
  void runSummaryAction(async readySummary => {
    if (!readySummary.summary) {
      showErrorNotification('Транскрибация ещё не готова');
      return false;
    }

    return downloadCallSummary(readySummary);
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

const extractActionList = (summaryText: string): string => {
  const normalizedLines = summaryText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const actionHeaderIndex = normalizedLines.findIndex(line =>
    /действия|договор[её]нности|задачи|action/i.test(line)
  );

  if (actionHeaderIndex >= 0) {
    return normalizedLines
      .slice(actionHeaderIndex)
      .filter(line => !/^суммари$/i.test(line))
      .join('\n');
  }

  return normalizedLines
    .filter(line =>
      /нужно|надо|давай|сдела|добав|исправ|провер|залить|депло|запусти|решили/i.test(
        line
      )
    )
    .join('\n');
};

const downloadTextFile = (filename: string, content: string): void => {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const handleDownloadActionList = (): void => {
  void runSummaryAction(async readySummary => {
    if (!readySummary.summary) {
      showErrorNotification('Список действий ещё не готов');
      return false;
    }

    const actionList = extractActionList(readySummary.summary);
    if (!actionList.trim()) {
      showErrorNotification('В суммари нет отдельного списка действий');
      return false;
    }

    const createdAt = new Date(readySummary.createdAt);
    const date = Number.isNaN(createdAt.getTime())
      ? new Date().toISOString().slice(0, 10)
      : createdAt.toISOString().slice(0, 10);

    downloadTextFile(`Действия-по-звонку-${date}.txt`, `${actionList}\n`);
    return true;
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
      senderName: getAuthUser()?.initials || '',
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
  () => selectedCall.value?.messageId,
  () => {
    void hydrateSummary();
    composerText.value = '';
  },
  { immediate: true }
);
</script>
