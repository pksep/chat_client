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
              <strong>Ежедневная сводка по задачам в 8:00</strong>
              <small
                >Активные, просроченные и запланированные на сегодня
                задачи</small
              >
            </span>
          </button>
          <button type="button" @click="handleAutomationClick('weekly')">
            <span>＋</span>
            <span>
              <strong>Еженедельный обзор задач в пятницу</strong>
              <small>Краткий итог по задачам доступных проектов</small>
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
            `ai-assistant__message--${message.role}`,
            {
              'ai-assistant__message--selection-active': isSelectionMode,
              'ai-assistant__message--selected': isMessageSelected(message.id)
            }
          ]"
          :data-message-id="message.id"
          @click="handleMessageSelectionClick(message, $event)"
          @contextmenu="handleMessageContextMenu(message, $event)"
        >
          <div
            :class="[
              'ai-assistant__message-selection',
              {
                'ai-assistant__message-selection--hidden': !isSelectionMode
              }
            ]"
          >
            <Checkbox
              v-if="isSelectionMode"
              :model-value="isMessageSelected(message.id)"
              :circular="CheckboxCircularEnum.circled"
              @update:model-value="toggleMessageSelection(message.id)"
              @click.stop
            />
          </div>
          <div class="ai-assistant__message-content">
            <div class="ai-assistant__message-body">
              <div v-if="message.replyTo" class="ai-assistant__message-reply">
                <strong>{{ getMessageAuthor(message.replyTo.role) }}</strong>
                <span>{{ message.replyTo.content }}</span>
              </div>
              <p>{{ message.text }}</p>
            </div>
            <PinIcon
              v-if="message.pinned"
              class="ai-assistant__message-pin"
              aria-label="Закреплено"
            />
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
          <Teleport v-if="isMessageContextOpen(message.id)" to="body">
            <AIMessageContextMenu
              :visible="isMessageContextOpen(message.id)"
              :position="messageContextPosition"
              :message="message"
              :selected-text="contextMessage?.selectedText"
              :selection-mode="isSelectionMode"
              :selected="isMessageSelected(message.id)"
              :can-delete-selection="canDeleteSelectedMessages"
              @close="closeMessageContextMenu(message.id)"
              @action="handleMessageAction($event, message)"
            />
          </Teleport>
        </article>
        <div v-if="isThinking" class="ai-assistant__thinking">
          Думает <span>•••</span>
        </div>
      </div>
    </div>

    <div
      v-if="isSelectionMode"
      class="selected-messages ai-assistant__selected-messages"
    >
      <div class="selected-messages-content">
        <Button
          v-if="canDeleteSelectedMessages"
          class="selected-messages-content__action selected-messages-content__action--danger"
          :type="ButtonTypeEnum.outline"
          :size="SizesEnum.small"
          @click="requestDeleteSelectedMessages"
        >
          <Icon :name="IconNameEnum.deleteSmall" :width="16" :height="16" />
          <span class="selected-messages-content__action__title">Удалить</span>
        </Button>
        <div class="selected-messages-content__title">
          Выбрано: {{ selectedMessages.length }}
        </div>
        <Button
          class="selected-messages-content__action"
          :type="ButtonTypeEnum.outline"
          :size="SizesEnum.small"
          @click="openSelectedMessagesForward"
        >
          <ForwardIcon :width="16" :height="16" />
          <span class="selected-messages-content__action__title"
            >Переслать</span
          >
        </Button>
        <Button
          class="selected-messages-content__action"
          :type="ButtonTypeEnum.outline"
          :size="SizesEnum.small"
          aria-label="Отменить выбор"
          @click="clearMessageSelection"
        >
          <Icon :name="IconNameEnum.crossLarge" />
        </Button>
      </div>
    </div>

    <div
      v-if="!isSelectionMode"
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
          <template v-if="editingMessage" #action>
            <div class="chat__input__action">
              <EditIcon />
              <div class="chat__input__action__blog">
                <h5>Редактирование</h5>
                <p>{{ editingMessage.text }}</p>
              </div>
              <Button
                :type="ButtonTypeEnum.ghost"
                :size="SizesEnum.little"
                @click="cancelMessageEdit"
              >
                <Icon :name="IconNameEnum.crossLarge" />
              </Button>
            </div>
          </template>
          <template v-else-if="replyMessage" #action>
            <div class="chat__input__action">
              <ReplyIcon />
              <div class="chat__input__action__blog">
                <h5>Ответ для {{ getMessageAuthor(replyMessage.role) }}</h5>
                <p>{{ replyMessage.text }}</p>
              </div>
              <Button
                :type="ButtonTypeEnum.ghost"
                :size="SizesEnum.little"
                @click="replyMessage = null"
              >
                <Icon :name="IconNameEnum.crossLarge" />
              </Button>
            </div>
          </template>
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

  <ForwardModal
    :open="forwardModalOpen"
    data-testid="AI-MessageForward"
    @unmount-close="closeForwardModal"
    @unmount-select-topic="handleForwardTopic"
  />

  <ConfirmModal
    :open="pendingDeleteMessageIds.length > 0"
    :title="
      pendingDeleteMessageIds.length > 1
        ? 'Удалить сообщения'
        : 'Удалить сообщение'
    "
    description="Удалить выбранные сообщения из истории AI-чата?"
    @unmount-close="pendingDeleteMessageIds = []"
    @unmount-confirm="confirmDeleteMessages"
  />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Checkbox,
  CheckboxCircularEnum,
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
import AIMessageContextMenu from './AIMessageContextMenu.vue';
import {
  type AiAssistantMessage,
  useAiAssistant
} from '../../composables/useAiAssistant';
import { navigateToAI, useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { useContextMenu } from '../../composables/useContextMenu';
import { openMessageDraft } from '../../composables/useMessageDraftTransfer';
import { showErrorNotification } from '../../composables/useNotifications';
import { stripHtml } from '../../utils/stripHtml';
import type { ITopic } from '../interfaces/interfaces';
import ForwardModal from '../Messages/ForwardModal.vue';
import ConfirmModal from '../UI/ConfirmModal.vue';
import EditIcon from '../UI/EditIcon.vue';
import ForwardIcon from '../UI/ForwardIcon.vue';
import PinIcon from '../UI/PinIcon.vue';
import ReplyIcon from '../UI/ReplyIcon.vue';

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
  toggleMessagePin,
  deleteMessages,
  editMessageAndResend,
  clearAll
} = useAiAssistant();

const route = useUrlWatcher();
const draft = ref('');
const scrollRef = ref<HTMLElement | null>(null);
const isVoiceMuted = ref(false);
const isPermissionMenuOpen = ref(false);
const contextMessage = ref<{
  message: AiAssistantMessage;
  selectedText: string;
} | null>(null);
const selectedMessageIds = ref<Set<string>>(new Set());
const replyMessage = ref<AiAssistantMessage | null>(null);
const editingMessage = ref<AiAssistantMessage | null>(null);
const forwardModalOpen = ref(false);
const forwardMessages = ref<AiAssistantMessage[]>([]);
const pendingDeleteMessageIds = ref<string[]>([]);
const {
  isOpen: messageContextOpen,
  position: messageContextPosition,
  openActivePopover: openMessageContextPopover,
  closeActivePopover: closeMessageContextPopover
} = useContextMenu();

type AIMessageMenuAction =
  | 'reply'
  | 'forward'
  | 'edit'
  | 'togglePin'
  | 'select'
  | 'delete'
  | 'forwardSelection'
  | 'cancelSelection'
  | 'deleteSelection';

const selectedMessages = computed(() =>
  (activeSession.value?.messages || []).filter(message =>
    selectedMessageIds.value.has(message.id)
  )
);
const isSelectionMode = computed(() => selectedMessages.value.length > 0);
const canDeleteSelectedMessages = computed(
  () =>
    selectedMessages.value.length > 0 &&
    selectedMessages.value.every(message => message.role === 'user')
);
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

/** Возвращает понятное имя автора для служебных подписей. */
const getMessageAuthor = (role: AiAssistantMessage['role']): string =>
  role === 'user' ? 'Вы' : 'СЭПи';

/** Проверяет, открыто ли контекстное меню конкретного AI-сообщения. */
const isMessageContextOpen = (messageId: string): boolean =>
  Boolean(messageContextOpen.value[`ai-message:${messageId}`]);

/** Закрывает контекстное меню AI-сообщения и очищает выбранный фрагмент. */
const closeMessageContextMenu = (messageId?: string): void => {
  closeMessageContextPopover(messageId ? `ai-message:${messageId}` : undefined);
  contextMessage.value = null;
};

/** Возвращает выделенный текст, только если он находится внутри сообщения. */
const getSelectedMessageText = (element: HTMLElement): string => {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return '';

  const range = selection.getRangeAt(0);
  if (
    !element.contains(range.startContainer) ||
    !element.contains(range.endContainer)
  ) {
    return '';
  }

  return selection.toString().trim();
};

/** Открывает меню сообщения и запоминает выделенный пользователем фрагмент. */
const handleMessageContextMenu = (
  message: AiAssistantMessage,
  event: MouseEvent
): void => {
  if (isSelectionMode.value && !isMessageSelected(message.id)) {
    event.preventDefault();
    return;
  }

  const element = event.currentTarget as HTMLElement;
  contextMessage.value = {
    message,
    selectedText: getSelectedMessageText(element)
  };
  openMessageContextPopover(`ai-message:${message.id}`, event);
};

/** Проверяет, выбрано ли сообщение в режиме групповых действий. */
const isMessageSelected = (messageId: string): boolean =>
  selectedMessageIds.value.has(messageId);

/** Добавляет или удаляет сообщение из текущего выбора. */
const toggleMessageSelection = (messageId: string): void => {
  const nextIds = new Set(selectedMessageIds.value);
  if (nextIds.has(messageId)) nextIds.delete(messageId);
  else nextIds.add(messageId);
  selectedMessageIds.value = nextIds;
};

/** Обрабатывает нажатие по сообщению, когда включён групповой выбор. */
const handleMessageSelectionClick = (
  message: AiAssistantMessage,
  event: MouseEvent
): void => {
  if (!isSelectionMode.value) return;
  const target = event.target;
  if (target instanceof Element && target.closest('button, a, input')) return;
  toggleMessageSelection(message.id);
};

/** Завершает режим группового выбора AI-сообщений. */
const clearMessageSelection = (): void => {
  selectedMessageIds.value = new Set();
};

/** Подготавливает ответ на сообщение или выделенный фрагмент. */
const startMessageReply = (message: AiAssistantMessage): void => {
  replyMessage.value = {
    ...message,
    text: contextMessage.value?.selectedText || message.text
  };
  editingMessage.value = null;
};

/** Переносит пользовательский запрос в редактор для изменения и повторного запуска. */
const startMessageEdit = (message: AiAssistantMessage): void => {
  if (message.role !== 'user') return;
  editingMessage.value = message;
  replyMessage.value = null;
  draft.value = message.text;
};

/** Отменяет редактирование AI-сообщения. */
const cancelMessageEdit = (): void => {
  editingMessage.value = null;
  draft.value = '';
};

/** Открывает выбор получателя для одного AI-сообщения. */
const openMessageForward = (message: AiAssistantMessage): void => {
  forwardMessages.value = [
    {
      ...message,
      text: contextMessage.value?.selectedText || message.text
    }
  ];
  forwardModalOpen.value = true;
};

/** Открывает выбор получателя для всех выбранных AI-сообщений. */
const openSelectedMessagesForward = (): void => {
  if (selectedMessages.value.length === 0) return;
  forwardMessages.value = [...selectedMessages.value];
  forwardModalOpen.value = true;
};

/** Закрывает выбор получателя и очищает подготовленную пересылку. */
const closeForwardModal = (): void => {
  forwardModalOpen.value = false;
  forwardMessages.value = [];
};

/** Формирует понятный текст пересылки без внутренних идентификаторов. */
const formatForwardDraft = (messages: AiAssistantMessage[]): string =>
  [
    'Переслано из ИИ-Ассистента',
    ...messages.map(
      message => `${getMessageAuthor(message.role)}:\n${message.text.trim()}`
    )
  ].join('\n\n');

/** Переносит выбранные AI-сообщения в редактор указанного обычного чата. */
const handleForwardTopic = (topic: ITopic): void => {
  if (forwardMessages.value.length === 0) return;
  openMessageDraft(topic, formatForwardDraft(forwardMessages.value));
  closeForwardModal();
  clearMessageSelection();
};

/** Запрашивает подтверждение удаления одного пользовательского сообщения. */
const requestDeleteMessage = (message: AiAssistantMessage): void => {
  if (message.role === 'user') pendingDeleteMessageIds.value = [message.id];
};

/** Запрашивает подтверждение удаления выбранных пользовательских сообщений. */
const requestDeleteSelectedMessages = (): void => {
  if (!canDeleteSelectedMessages.value) return;
  pendingDeleteMessageIds.value = selectedMessages.value.map(
    message => message.id
  );
};

/** Удаляет подтверждённые сообщения из локальной истории AI-чата. */
const confirmDeleteMessages = async (): Promise<void> => {
  const messageIds = [...pendingDeleteMessageIds.value];
  pendingDeleteMessageIds.value = [];
  try {
    await deleteMessages(messageIds);
    clearMessageSelection();
  } catch (error) {
    showErrorNotification(error);
  }
};

/** Выполняет выбранное пользователем действие контекстного меню. */
const handleMessageAction = async (
  action: AIMessageMenuAction,
  message: AiAssistantMessage
): Promise<void> => {
  try {
    if (action === 'reply') startMessageReply(message);
    else if (action === 'forward') openMessageForward(message);
    else if (action === 'edit') startMessageEdit(message);
    else if (action === 'togglePin') await toggleMessagePin(message.id);
    else if (action === 'select') toggleMessageSelection(message.id);
    else if (action === 'delete') requestDeleteMessage(message);
    else if (action === 'forwardSelection') openSelectedMessagesForward();
    else if (action === 'cancelSelection') clearMessageSelection();
    else if (action === 'deleteSelection') requestDeleteSelectedMessages();
  } catch (error) {
    showErrorNotification(error);
  }
};

const scrollToBottom = async (): Promise<void> => {
  await nextTick();
  if (scrollRef.value) {
    scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
  }
};

/** Отправляет новый запрос или повторно запускает отредактированный запрос. */
const handleSend = async (
  payload?: IContentEditorSendPayload
): Promise<void> => {
  const value = stripHtml(payload?.content ?? draft.value);

  if (!value) return;
  const replyTo = replyMessage.value
    ? {
        role: replyMessage.value.role,
        content: replyMessage.value.text
      }
    : undefined;
  const editedMessage = editingMessage.value;

  const request = editedMessage
    ? editMessageAndResend(editedMessage.id, value, replyTo)
    : sendMessage(value, replyTo);
  void request.catch(error => {
    showErrorNotification(error);
    if (editedMessage) {
      editingMessage.value = editedMessage;
      draft.value = value;
    }
  });
  draft.value = '';
  replyMessage.value = null;
  editingMessage.value = null;
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
      ? 'Настрой ежедневную сводку по активным, просроченным и запланированным на сегодня задачам доски в 8:00'
      : 'Настрой еженедельный обзор задач доступных проектов доски по пятницам в 18:00'
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

watch([() => activeSession.value?.id, activeView], () => {
  closeMessageContextMenu();
  clearMessageSelection();
  replyMessage.value = null;
  editingMessage.value = null;
  pendingDeleteMessageIds.value = [];
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
