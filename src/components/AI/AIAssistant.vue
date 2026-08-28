<template>
  <section class="ai-assistant" data-testid="AI-Assistant">
    <div ref="scrollRef" class="ai-assistant__scroll">
      <div
        v-if="activeView === 'chat' && !activeSession"
        class="ai-assistant__empty"
      >
        <span class="ai-assistant__hero-icon">
          <AiSparkleIcon />
        </span>
        <h1>Чем вам помочь сегодня?</h1>
        <div class="ai-assistant__suggestions">
          <button
            type="button"
            class="ai-assistant__suggestion ai-assistant__suggestion--voice"
            @click="isVoiceModeOpen = true"
          >
            <VoiceMessageIcon />
            Голосовой режим
          </button>
          <button
            type="button"
            class="ai-assistant__suggestion ai-assistant__suggestion--tasks"
            @click="handleSuggestion('tasks')"
          >
            <TasksSuggestionIcon />
            Мои задачи на сегодня
          </button>
          <button
            type="button"
            class="ai-assistant__suggestion ai-assistant__suggestion--summary"
            @click="handleSuggestion('summary')"
          >
            <ChatSummaryIcon />
            Сводка по чатам за сегодня
          </button>
        </div>
      </div>

      <div v-else-if="activeView === 'tasks'" class="ai-assistant__tasks">
        <span class="ai-assistant__tasks-icon">
          <AiSparkleIcon />
        </span>
        <h1>Автоматизированные задачи</h1>
        <div class="ai-assistant__automation-list">
          <button type="button" @click="handleAutomationClick('daily')">
            <span>＋</span>
            <span>
              <strong>Ежедневная сводка в 8:00</strong>
              <small>Начните день с мониторинга календаря, задач и писем</small>
            </span>
          </button>
          <button type="button" @click="handleAutomationClick('weekly')">
            <span>＋</span>
            <span>
              <strong>Еженедельный обзор в пятницу вечером</strong>
              <small>Отчет о проделанной работе за неделю</small>
            </span>
          </button>
        </div>
      </div>

      <div v-else class="ai-assistant__conversation">
        <time class="ai-assistant__date">{{ conversationDate }}</time>
        <article
          v-for="message in activeSession?.messages || []"
          :key="message.id"
          :class="[
            'ai-assistant__message',
            `ai-assistant__message--${message.role}`
          ]"
        >
          <div class="ai-assistant__message-content">
            <p>{{ message.text }}</p>
            <time>{{ message.time }}</time>
            <Icon
              v-if="message.role === 'user'"
              class="ai-assistant__read"
              :name="IconNameEnum.delivered"
              aria-label="Прочитано"
            />
          </div>
          <div v-if="message.showApproval" class="ai-assistant__approval">
            <template v-if="!message.approvalState">
              <button
                type="button"
                class="ai-assistant__approval-reject"
                @click="updateApproval(message.id, 'rejected')"
              >
                Отменить
              </button>
              <button
                type="button"
                class="ai-assistant__approval-confirm"
                @click="updateApproval(message.id, 'approved')"
              >
                Подтвердить
              </button>
            </template>
            <span v-else>
              {{
                message.approvalState === 'approved'
                  ? 'Действие подтверждено'
                  : 'Действие отклонено'
              }}
            </span>
          </div>
        </article>
        <div v-if="isThinking" class="ai-assistant__thinking">
          Думает <span>•••</span>
        </div>
      </div>
    </div>

    <div
      :class="[
        'chat__input emoji-font-host ai-assistant__composer',
        {
          'ai-assistant__composer--tasks': activeView === 'tasks',
          'ai-assistant__composer--thinking': isThinking
        }
      ]"
    >
      <div v-if="isPermissionMenuOpen" class="ai-assistant__permission-menu">
        <button type="button" @click="selectPermission('automatic')">
          <span>✓</span>
          <span>
            <strong>Автоматический режим</strong>
            <small
              >Обычные действия выполняются сразу, критические потребуют
              подтверждения</small
            >
          </span>
        </button>
        <button type="button" @click="selectPermission('ask')">
          <span>☝</span>
          <span>
            <strong>Подтверждать каждое действие</strong>
            <small>Любое изменение потребует вашего подтверждения</small>
          </span>
        </button>
      </div>

      <div class="ai-assistant__editor">
        <ContentEditor
          v-model="draft"
          :active-attach-file="false"
          :disable-send-on-enter="isThinking"
          @unmount-send="handleSend"
        >
          <template #mobile-trailing-action>
            <Button
              :type="ButtonTypeEnum.ghost"
              :size="SizesEnum.small"
              class="toolbar-button mobile-buttons ai-assistant__permission-trigger ai-assistant__permission-trigger--mobile"
              :aria-label="permissionLabel"
              :title="permissionLabel"
              @click.stop="isPermissionMenuOpen = !isPermissionMenuOpen"
            >
              <PermissionHandIcon />
            </Button>
            <Button
              :type="ButtonTypeEnum.ghost"
              :size="SizesEnum.small"
              class="toolbar-button mobile-buttons ai-assistant__voice-trigger ai-assistant__voice-trigger--mobile"
              aria-label="Голосовой режим"
              title="Голосовой режим"
              @click.stop="isVoiceModeOpen = true"
            >
              <VoiceMessageIcon />
            </Button>
          </template>

          <template #desktop-left-action>
            <Button
              :type="ButtonTypeEnum.ghost"
              :size="SizesEnum.small"
              class="toolbar-button ai-assistant__permission-trigger ai-assistant__permission-trigger--desktop"
              :title="permissionLabel"
              @click.stop="isPermissionMenuOpen = !isPermissionMenuOpen"
            >
              <PermissionHandIcon />
              <span>{{ permissionLabel }}</span>
            </Button>
          </template>

          <template #desktop-right-action>
            <Button
              :type="ButtonTypeEnum.ghost"
              :size="SizesEnum.small"
              class="toolbar-button ai-assistant__voice-trigger ai-assistant__voice-trigger--desktop"
              aria-label="Голосовой режим"
              title="Голосовой режим"
              @click.stop="isVoiceModeOpen = true"
            >
              <VoiceMessageIcon />
            </Button>
          </template>
        </ContentEditor>
      </div>
    </div>

    <div
      v-if="isVoiceModeOpen"
      class="ai-assistant__voice-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Голосовой режим"
    >
      <div class="ai-assistant__voice-orb" aria-hidden="true">
        <span></span>
        <i></i>
      </div>
      <div class="ai-assistant__voice-actions">
        <button
          type="button"
          :class="{ 'ai-assistant__voice-mic--muted': isVoiceMuted }"
          :aria-label="
            isVoiceMuted ? 'Включить микрофон' : 'Выключить микрофон'
          "
          @click="isVoiceMuted = !isVoiceMuted"
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <rect x="7" y="3" width="6" height="9" rx="3" />
            <path d="M5 9.5a5 5 0 0 0 10 0M10 14.5V17" />
          </svg>
        </button>
        <button
          type="button"
          class="ai-assistant__voice-close"
          aria-label="Закрыть голосовой режим"
          @click="isVoiceModeOpen = false"
        >
          <Icon :name="IconNameEnum.crossLarge" />
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  ContentEditor,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import AiSparkleIcon from './AiSparkleIcon.vue';
import VoiceMessageIcon from './VoiceMessageIcon.vue';
import ChatSummaryIcon from './ChatSummaryIcon.vue';
import TasksSuggestionIcon from './TasksSuggestionIcon.vue';
import PermissionHandIcon from './PermissionHandIcon.vue';
import { useAiAssistant } from '../../composables/useAiAssistant';
import { navigateToAI, useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { stripHtml } from '../../utils/stripHtml';

interface IContentEditorSendPayload {
  content?: string;
  files?: FileList;
  mediaFiles?: FileList;
}

const {
  sessions,
  activeView,
  activeSessionId,
  activeSession,
  isThinking,
  isVoiceModeOpen,
  permissionMode,
  startNewSession,
  selectSession,
  sendMessage,
  sendSuggestedPrompt,
  startNewTask,
  updateApproval,
  clearAll
} = useAiAssistant();

const route = useUrlWatcher();
const draft = ref('');
const scrollRef = ref<HTMLElement | null>(null);
const isVoiceMuted = ref(false);
const isPermissionMenuOpen = ref(false);
const permissionLabel = computed(() =>
  permissionMode.value === 'ask'
    ? 'Подтверждать каждое действие'
    : 'Автоматический режим'
);
const conversationDate = computed(() =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long'
  }).format(new Date())
);

const scrollToBottom = async (): Promise<void> => {
  await nextTick();
  if (scrollRef.value) {
    scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
  }
};

const handleSend = (payload?: IContentEditorSendPayload): void => {
  const value = stripHtml(payload?.content ?? draft.value);

  if (!value) return;
  void sendMessage(value);
  draft.value = '';
  void scrollToBottom();
};

const handleSuggestion = (prompt: 'summary' | 'tasks'): void => {
  sendSuggestedPrompt(prompt);
  void scrollToBottom();
};

const handleAutomationClick = (kind: 'daily' | 'weekly'): void => {
  startNewTask();
  void sendMessage(
    kind === 'daily'
      ? 'Настрой ежедневную сводку в 8:00'
      : 'Настрой еженедельный обзор в пятницу вечером'
  );
  void scrollToBottom();
};

const selectPermission = (mode: 'ask' | 'automatic'): void => {
  permissionMode.value = mode;
  isPermissionMenuOpen.value = false;
};

watch(
  () => [route.value.type, route.value.id] as const,
  ([routeType, sessionId]) => {
    if (routeType !== RouteTypes.AI || !sessionId) return;

    if (sessions.value.some(session => session.id === sessionId)) {
      selectSession(sessionId);
      return;
    }

    startNewSession();
    navigateToAI();
  },
  { immediate: true }
);

watch([activeSessionId, activeView], ([sessionId, view]) => {
  if (route.value.type !== RouteTypes.AI) return;
  navigateToAI(view === 'chat' ? sessionId : null);
});

watch(
  [
    () => activeSession.value?.messages.length || 0,
    isThinking,
    () => activeSession.value?.id,
    activeView
  ],
  () => void scrollToBottom()
);

defineExpose({
  handleClear: clearAll
});
</script>
