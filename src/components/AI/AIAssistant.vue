<template>
  <section
    :class="[
      'ai-assistant',
      {
        'ai-assistant--has-pinned-message':
          activeView === 'chat' && !!currentPinnedMessage
      }
    ]"
    data-testid="AI-Assistant"
    @click.capture="handleExclusiveMenuClick"
    @pointerdown.capture="prepareEmojiDrag"
    @dragstart.capture="handleEmojiDragStart"
    @dragend.capture="handleEmojiDragEnd"
  >
    <PinnedMessageBanner
      v-if="activeView === 'chat' && currentPinnedMessage"
      class="ai-assistant__pinned-messages"
      :preview-text="currentPinnedMessagePreview"
      :preview-key="currentPinnedMessage.id"
      data-testid="AI-Assistant-PinnedMessage"
      @navigate="handlePinnedMessageClick"
      @request-unpin="openPinnedMessageUnpinModal"
    />

    <div
      ref="scrollRef"
      class="ai-assistant__scroll"
      @scroll.passive="handleScroll"
    >
      <div
        v-if="activeView === 'chat' && !activeSession"
        class="ai-assistant__empty"
      >
        <span class="ai-assistant__hero-icon">
          <AiAvatar />
        </span>
        <h1>Чем вам помочь сегодня?</h1>
        <div class="ai-assistant__suggestions">
          <button
            type="button"
            class="ai-assistant__suggestion ai-assistant__suggestion--voice"
            @click="openVoiceMode"
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
          <AiAvatar />
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
        <div
          v-for="message in activeSession?.messages || []"
          :key="message.id"
          :class="[
            'ai-assistant__message',
            `ai-assistant__message--${message.role}`,
            {
              'ai-assistant__message--selection-active': isSelectionMode,
              'ai-assistant__message--selected': isMessageSelected(message.id),
              highlighted: highlightedMessageId === message.id
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
          <MessageBubbleFiles
            v-if="message.outputAttachments?.length"
            class="ai-assistant__message-files"
            :message="message.text"
            :time="message.time"
            :is-pin="message.pinned"
            :is-me-sender="false"
            :is-dialog="true"
            :media="getMessageOutputMedia(message)"
            :data-testid="`AI-Assistant-Message-${message.id}`"
            @set-slider="handleOutputAttachmentClick"
          />
          <div v-else class="ai-assistant__message-content">
            <div class="ai-assistant__message-body">
              <div
                v-if="message.replyTo"
                :class="[
                  'ai-assistant__message-reply',
                  'message-reference-block',
                  {
                    'message-reference-block--outgoing': message.role === 'user'
                  }
                ]"
              >
                <div class="message-reference-reply">
                  <div class="message-reference-reply__content">
                    <strong class="message-reference-reply__author">
                      {{ getMessageAuthor(message.replyTo.role) }}
                    </strong>
                    <span class="message-reference-reply__text">
                      {{ message.replyTo.content }}
                    </span>
                  </div>
                </div>
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
          <div
            v-if="message.showApproval && !message.approvalState"
            class="ai-assistant__approval"
          >
            <button
              type="button"
              class="ai-assistant__approval-reject"
              @click="handleApproval(message.id, 'rejected')"
            >
              Отменить
            </button>
            <button
              type="button"
              class="ai-assistant__approval-confirm"
              @click="handleApproval(message.id, 'approved')"
            >
              Подтвердить
            </button>
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
        </div>
        <div v-if="isThinking" class="ai-assistant__thinking">
          Думает <span>•••</span>
        </div>
      </div>
    </div>

    <div
      v-if="
        activeView === 'chat' && !!activeSession && isShowScrollToBottomButton
      "
      class="chat__message-bubble__scroll-indicators ai-assistant__scroll-indicators"
    >
      <button
        type="button"
        class="chat__message-bubble__arrow-down"
        data-testid="AI-Assistant-ScrollToBottom"
        aria-label="Перейти к новым сообщениям"
        @click="handleScrollToBottom"
      >
        <Icon :name="IconNameEnum.arrowDown" />
      </button>
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
      <div class="ai-assistant__editor">
        <ContentEditor
          ref="contentEditorRef"
          v-model="draft"
          :active-attach-file="true"
          :disable-send-on-enter="isThinking || isUploadingAttachments"
          @unmount-send="handleSend"
        >
          <template v-if="activeForwardDraft" #action>
            <div class="chat__input__action">
              <ForwardIcon />
              <div class="chat__input__action__blog">
                <h5>{{ activeForwardDraft.title }}</h5>
                <p>{{ activeForwardDraft.preview }}</p>
              </div>
              <Button
                :type="ButtonTypeEnum.ghost"
                :size="SizesEnum.little"
                aria-label="Убрать пересланное сообщение"
                @click="clearActiveForwardDraft"
              >
                <Icon :name="IconNameEnum.crossLarge" />
              </Button>
            </div>
          </template>
          <template v-else-if="editingMessage" #action>
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
                <h5>В ответ {{ getMessageAuthor(replyMessage.role) }}</h5>
                <p>{{ replyMessage.text }}</p>
              </div>
              <Button
                :type="ButtonTypeEnum.ghost"
                :size="SizesEnum.little"
                @click="cancelMessageReply"
              >
                <Icon :name="IconNameEnum.crossLarge" />
              </Button>
            </div>
          </template>
          <template #mobile-trailing-action>
            <div
              class="ai-assistant__permission-control ai-assistant__permission-control--mobile"
            >
              <Button
                :type="ButtonTypeEnum.ghost"
                :size="SizesEnum.small"
                class="toolbar-button mobile-buttons ai-assistant__permission-trigger ai-assistant__permission-trigger--mobile"
                :aria-label="permissionLabel"
                :title="permissionLabel"
                aria-haspopup="menu"
                :aria-expanded="isPermissionMenuOpen"
                @click.stop="togglePermissionMenu"
              >
                <PermissionHandIcon v-if="permissionMode === 'ask'" />
                <PermissionCheckCircleIcon v-else />
              </Button>
              <div
                v-if="isPermissionMenuOpen"
                class="ai-assistant__permission-menu"
                role="menu"
                aria-label="Режим подтверждения действий"
              >
                <button
                  type="button"
                  role="menuitemradio"
                  :aria-checked="permissionMode === 'automatic'"
                  @click="selectPermission('automatic')"
                >
                  <PermissionCheckCircleIcon />
                  <span>Автоматически подтверждать</span>
                </button>
                <button
                  type="button"
                  role="menuitemradio"
                  :aria-checked="permissionMode === 'ask'"
                  @click="selectPermission('ask')"
                >
                  <PermissionHandIcon />
                  <span>Запрашивать разрешения</span>
                </button>
              </div>
            </div>
            <Button
              :type="ButtonTypeEnum.ghost"
              :size="SizesEnum.small"
              class="toolbar-button mobile-buttons ai-assistant__voice-trigger ai-assistant__voice-trigger--mobile"
              aria-label="Голосовой режим"
              title="Голосовой режим"
              @click.stop="openVoiceMode"
            >
              <VoiceMessageIcon />
            </Button>
          </template>

          <template #desktop-left-action>
            <div
              class="ai-assistant__permission-control ai-assistant__permission-control--desktop"
            >
              <Button
                :type="ButtonTypeEnum.ghost"
                :size="SizesEnum.small"
                class="toolbar-button ai-assistant__permission-trigger ai-assistant__permission-trigger--desktop"
                :title="permissionLabel"
                aria-haspopup="menu"
                :aria-expanded="isPermissionMenuOpen"
                @click.stop="togglePermissionMenu"
              >
                <PermissionHandIcon v-if="permissionMode === 'ask'" />
                <PermissionCheckCircleIcon v-else />
                <span>{{ permissionLabel }}</span>
              </Button>
              <div
                v-if="isPermissionMenuOpen"
                class="ai-assistant__permission-menu"
                role="menu"
                aria-label="Режим подтверждения действий"
              >
                <button
                  type="button"
                  role="menuitemradio"
                  :aria-checked="permissionMode === 'automatic'"
                  @click="selectPermission('automatic')"
                >
                  <PermissionCheckCircleIcon />
                  <span>Автоматически подтверждать</span>
                </button>
                <button
                  type="button"
                  role="menuitemradio"
                  :aria-checked="permissionMode === 'ask'"
                  @click="selectPermission('ask')"
                >
                  <PermissionHandIcon />
                  <span>Запрашивать разрешения</span>
                </button>
              </div>
            </div>
          </template>

          <template #desktop-right-action>
            <div
              class="ai-assistant__response-control ai-assistant__response-control--desktop"
            >
              <Button
                :type="ButtonTypeEnum.ghost"
                :size="SizesEnum.small"
                class="toolbar-button ai-assistant__response-trigger ai-assistant__response-trigger--desktop"
                :title="responseModeLabel"
                :aria-label="responseModeLabel"
                aria-haspopup="menu"
                :aria-expanded="isResponseModeMenuOpen"
                :disabled="isThinking"
                @click.stop="toggleResponseModeMenu"
              >
                <Icon
                  :name="
                    responseMode === 'advanced'
                      ? IconNameEnum.lightbulbFilament
                      : IconNameEnum.lightning
                  "
                />
                <span>{{ responseModeLabel }}</span>
              </Button>
              <div
                v-if="isResponseModeMenuOpen"
                class="ai-assistant__response-menu"
                role="menu"
                aria-label="Режим ответа"
              >
                <button
                  type="button"
                  role="menuitemradio"
                  :aria-checked="responseMode === 'quick'"
                  @click="selectResponseMode('quick')"
                >
                  <Icon :name="IconNameEnum.lightning" />
                  <span>Быстрый ответ</span>
                </button>
                <button
                  type="button"
                  role="menuitemradio"
                  :aria-checked="responseMode === 'advanced'"
                  @click="selectResponseMode('advanced')"
                >
                  <Icon :name="IconNameEnum.lightbulbFilament" />
                  <span>Продвинутый ответ</span>
                </button>
              </div>
            </div>
          </template>
        </ContentEditor>
      </div>
    </div>

    <div
      v-if="isVoiceModeOpen && isVoiceModalVisible"
      class="ai-assistant__voice-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Голосовой режим"
    >
      <button
        type="button"
        class="ai-assistant__voice-minimize call-modal__control-button call-modal__control-button--action call-modal__control-button--chevron-down"
        aria-label="Свернуть разговор"
        title="Свернуть разговор"
        @click="hideVoiceMode"
      >
        <Icon :name="IconNameEnum.chevronDown" />
      </button>
      <div
        :class="[
          'ai-assistant__voice-visual',
          `ai-assistant__voice-visual--${voiceAssistantState}`
        ]"
      >
        <div class="ai-assistant__voice-orb" aria-hidden="true">
          <span class="ai-assistant__voice-orb-core"></span>
        </div>
        <AiAvatar
          class="ai-assistant__voice-avatar"
          :expression="voiceAssistantExpression"
        />
      </div>
      <div
        class="ai-assistant__voice-actions call-modal__control-button-wrapper call-modal__control-button-wrapper--call-controls"
      >
        <button
          v-if="!isVoiceMuted"
          type="button"
          class="call-modal__control-button"
          aria-label="Выключить микрофон"
          title="Выключить микрофон"
          @click="toggleVoiceMicrophone"
        >
          <MicIcon />
        </button>
        <button
          v-else
          type="button"
          class="call-modal__control-button call-modal__control-button__inactive"
          aria-label="Включить микрофон"
          title="Включить микрофон"
          @click="toggleVoiceMicrophone"
        >
          <MicDisableIcon />
        </button>
        <button
          type="button"
          class="call-modal__control-button call-modal__control-button--leave"
          aria-label="Закрыть голосовой режим"
          title="Завершить разговор"
          @click="closeVoiceMode"
        >
          <LeaveIcon />
        </button>
      </div>
    </div>
  </section>

  <ForwardModal
    :open="forwardModalOpen"
    data-testid="AI-MessageForward"
    @unmount-close="closeForwardModal"
    @unmount-select-topic="handleForwardTopic"
    @unmount-select-ai-session="handleForwardAiSession"
  />

  <ConfirmModal
    :open="pendingDeleteMessageIds.length > 0"
    :title="
      pendingDeleteMessageIds.length > 1
        ? 'Удалить сообщения'
        : 'Удалить сообщение'
    "
    description="Удалить выбранные сообщения из истории AI-чата?"
    @unmount-close="cancelDeleteMessages"
    @unmount-confirm="confirmDeleteMessages"
  />

  <ConfirmModal
    :open="isPinnedMessageUnpinModalOpen"
    title="Открепить сообщение"
    description="Вы уверены, что хотите открепить сообщение?"
    @unmount-close="closePinnedMessageUnpinModal"
    @unmount-confirm="confirmPinnedMessageUnpin"
  />
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue';
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
import AiAvatar from './AiAvatar.vue';
import VoiceMessageIcon from './VoiceMessageIcon.vue';
import ChatSummaryIcon from './ChatSummaryIcon.vue';
import TasksSuggestionIcon from './TasksSuggestionIcon.vue';
import PermissionHandIcon from './PermissionHandIcon.vue';
import PermissionCheckCircleIcon from './PermissionCheckCircleIcon.vue';
import AIMessageContextMenu from './AIMessageContextMenu.vue';
import {
  type AiAssistantMessage,
  type AiResponseMode,
  useAiAssistant
} from '../../composables/useAiAssistant';
import { navigateToAI, useUrlWatcher } from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { showErrorNotification } from '../../composables/useNotifications';
import { useContextMenu } from '../../composables/useContextMenu';
import { openMessageDraft } from '../../composables/useMessageDraftTransfer';
import {
  clearAiForwardDraft,
  openAiForwardDraft,
  restoreAiForwardDraft,
  useAiForwardDraft
} from '../../composables/useAiForwardDraft';
import { useAiMessageSearch } from '../../composables/useAiMessageSearch';
import { stageAiAttachments } from '../../services/aiAttachments';
import { MediaType } from '@pksep/zod-shared-chat';
import {
  recognizeVoice,
  startVoiceCapture,
  startVoicePlayback,
  synthesizeVoice,
  type VoiceCaptureSession,
  type VoicePlaybackSession
} from '../../services/aiSpeech';
import { stripHtml } from '../../utils/stripHtml';
import type { IMedia, ITopic } from '../interfaces/interfaces';
import type { AiAssistantSession } from '../../composables/useAiAssistant';
import ConfirmModal from '../UI/ConfirmModal.vue';
import EditIcon from '../UI/EditIcon.vue';
import ForwardIcon from '../UI/ForwardIcon.vue';
import PinIcon from '../UI/PinIcon.vue';
import ReplyIcon from '../UI/ReplyIcon.vue';
import ForwardModal from '../Messages/ForwardModal.vue';
import MessageBubbleFiles from '../Messages/MessageBubbleFiles.vue';
import PinnedMessageBanner from '../Messages/PinnedMessageBanner.vue';
import { useMessageMedia } from '../Messages/composables/useMessageMedia';
import { ensureMediaObjectUrl } from '../../services/useMediaBlobCache';
import { downloadNativeFile } from '../../services/useNativeFile';
import LeaveIcon from '../CallModal/UI/LeaveIcon.vue';
import MicDisableIcon from '../CallModal/UI/MicDisableIcon.vue';
import MicIcon from '../CallModal/UI/MicIcon.vue';

interface IContentEditorSendPayload {
  content?: string;
  files?: FileList;
  mediaFiles?: FileList;
}

const {
  sessions,
  tasks,
  activeView,
  activeSessionId,
  activeSession,
  isThinking,
  isVoiceModeOpen,
  isVoiceModalVisible,
  permissionMode,
  responseMode,
  startVoiceCall,
  hideVoiceCall,
  stopVoiceCall,
  startNewSession,
  selectSession,
  selectTaskSession,
  selectTask,
  sendMessage,
  sendSuggestedPrompt,
  startNewTask,
  updateApproval,
  toggleMessagePin,
  deleteMessages,
  editMessageAndResend,
  markSessionInactive,
  clearAll
} = useAiAssistant();

const route = useUrlWatcher();
const { activeTarget: activeSearchTarget } = useAiMessageSearch();
const { pendingAiForwardDraft } = useAiForwardDraft();
const draft = ref('');
const contentEditorRef = ref<InstanceType<typeof ContentEditor> | null>(null);
const scrollRef = ref<HTMLElement | null>(null);
const isShowScrollToBottomButton = ref(false);
const highlightedMessageId = ref<string | null>(null);
const currentPinnedMessageId = ref<string | null>(null);
const isPinnedMessageUnpinModalOpen = ref(false);
const isNearBottom = ref(true);
const isVoiceMuted = ref(false);
const isPermissionMenuOpen = ref(false);
const isResponseModeMenuOpen = ref(false);
const isUploadingAttachments = ref(false);
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
const activeForwardDraft = computed(() =>
  pendingAiForwardDraft.value?.sessionId === activeSessionId.value
    ? pendingAiForwardDraft.value
    : null
);
const {
  isOpen: messageContextOpen,
  position: messageContextPosition,
  openActivePopover: openMessageContextPopover,
  closeActivePopover: closeMessageContextPopover
} = useContextMenu();
let isMenuSyncInProgress = false;
let composerFocusFrame: number | null = null;
let messageHighlightTimeoutId: number | null = null;
let isAssistantMounted = false;
const { getFullMediaPath } = useMessageMedia();

const pinnedMessages = computed(() =>
  (activeSession.value?.messages || []).filter(message => message.pinned)
);
const currentPinnedMessage = computed(() => {
  const messages = pinnedMessages.value;
  if (messages.length === 0) return null;

  return (
    messages.find(message => message.id === currentPinnedMessageId.value) ||
    messages[messages.length - 1]
  );
});
const currentPinnedMessagePreview = computed(() =>
  stripHtml(currentPinnedMessage.value?.text || 'Вложение')
);

/** Преобразует постоянные AI-вложения в тот же формат, который использует обычное сообщение чата. */
const getMessageOutputMedia = (message: AiAssistantMessage): IMedia[] =>
  (message.outputAttachments || []).map(attachment => ({
    id: attachment.id,
    type: MediaType.File,
    path: attachment.path,
    thumbnailPath: attachment.thumbnailPath,
    originName: attachment.name,
    size: attachment.size
  })) as IMedia[];

/** Скачивает AI-файл тем же объектным путём медиа-хранилища, что и обычные вложения. */
const handleOutputAttachmentClick = async (
  medias: IMedia[],
  index = 0
): Promise<void> => {
  const media = medias[index];
  if (!media?.path) return;
  if (await downloadNativeFile(media)) return;
  const cachedObjectUrl = await ensureMediaObjectUrl(media.path);
  const link = document.createElement('a');
  link.href = cachedObjectUrl || getFullMediaPath(media, false);
  link.download = media.originName || 'file';
  document.body.appendChild(link);
  link.click();
  link.remove();
};

type VoiceAssistantState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';
type AiAvatarExpression = 'standard' | 'thinking' | 'sad' | 'happy' | 'love';

const voiceAssistantState = ref<VoiceAssistantState>('idle');
const voiceAssistantExpression = ref<AiAvatarExpression>('standard');
let activeVoiceCapture: VoiceCaptureSession | null = null;
let activeVoicePlayback: VoicePlaybackSession | null = null;
let voiceRequestController: AbortController | null = null;
let voiceCycleId = 0;
let voiceRestartTimer: number | null = null;

/** Открывает голосовой режим непосредственно из пользовательского клика. */
const openVoiceMode = (): void => {
  startVoiceCall();
};

/** Сворачивает окно, сохраняя активный голосовой разговор. */
const hideVoiceMode = (): void => {
  hideVoiceCall();
  focusComposer();
};

/** Закрывает голосовой режим и освобождает микрофон и воспроизведение. */
const closeVoiceMode = (): void => {
  stopVoiceCall();
  voiceCycleId += 1;
  clearVoiceRestartTimer();
  activeVoiceCapture?.cancel();
  activeVoiceCapture = null;
  activeVoicePlayback?.stop();
  activeVoicePlayback = null;
  voiceRequestController?.abort();
  voiceRequestController = null;
  voiceAssistantState.value = 'idle';
  voiceAssistantExpression.value = 'standard';
  focusComposer();
};

/** Приостанавливает или возобновляет только пользовательский микрофон. */
const toggleVoiceMicrophone = (): void => {
  isVoiceMuted.value = !isVoiceMuted.value;
  if (isVoiceMuted.value) {
    clearVoiceRestartTimer();
    activeVoiceCapture?.cancel();
    activeVoiceCapture = null;
    if (voiceAssistantState.value === 'listening') {
      voiceAssistantState.value = 'idle';
      voiceAssistantExpression.value = 'standard';
    }
    return;
  }

  if (
    voiceAssistantState.value === 'idle' ||
    voiceAssistantState.value === 'error'
  ) {
    voiceCycleId += 1;
    void runVoiceConversationCycle(voiceCycleId);
  }
};

/** Выполняет один полный голосовой ход и затем снова включает прослушивание. */
const runVoiceConversationCycle = async (cycleId: number): Promise<void> => {
  if (!isCurrentVoiceCycle(cycleId) || isVoiceMuted.value) return;

  try {
    setVoicePresentation('listening');
    const capture = await startVoiceCapture();
    if (!isCurrentVoiceCycle(cycleId) || isVoiceMuted.value) {
      capture.cancel();
      return;
    }

    activeVoiceCapture = capture;
    const audio = await capture.result;
    if (activeVoiceCapture === capture) activeVoiceCapture = null;
    if (!isCurrentVoiceCycle(cycleId) || isVoiceMuted.value) return;
    if (!audio) {
      restartVoiceListening(cycleId);
      return;
    }

    setVoicePresentation('thinking');
    voiceRequestController = new AbortController();
    const transcript = await recognizeVoice(
      audio,
      voiceRequestController.signal
    );
    if (!isCurrentVoiceCycle(cycleId)) return;
    if (!transcript) {
      restartVoiceListening(cycleId);
      return;
    }

    const responseText = await sendMessage(transcript);
    if (!isCurrentVoiceCycle(cycleId) || !responseText) {
      restartVoiceListening(cycleId);
      return;
    }

    const speech = await synthesizeVoice(
      responseText,
      voiceRequestController.signal
    );
    if (!isCurrentVoiceCycle(cycleId)) return;

    setVoicePresentation('speaking', responseText);
    const playback = startVoicePlayback(speech);
    activeVoicePlayback = playback;
    await playback.done;
    if (activeVoicePlayback === playback) activeVoicePlayback = null;
    restartVoiceListening(cycleId);
  } catch (error) {
    if (!isCurrentVoiceCycle(cycleId) || isAbortError(error)) return;
    if (isMicrophoneAccessError(error)) {
      isVoiceMuted.value = true;
      setVoicePresentation('idle');
      showErrorNotification(getVoiceErrorMessage(error));
      return;
    }
    setVoicePresentation('error');
    showErrorNotification(getVoiceErrorMessage(error));
    restartVoiceListening(cycleId, 1_200);
  } finally {
    voiceRequestController = null;
  }
};

/** Переключает анимацию и выражение лица без технического текста в окне. */
const setVoicePresentation = (
  state: VoiceAssistantState,
  responseText = ''
): void => {
  voiceAssistantState.value = state;
  if (state === 'thinking') {
    voiceAssistantExpression.value = 'thinking';
  } else if (state === 'error') {
    voiceAssistantExpression.value = 'sad';
  } else if (state === 'speaking') {
    voiceAssistantExpression.value = getResponseExpression(responseText);
  } else {
    voiceAssistantExpression.value = 'standard';
  }
};

/** Выбирает спокойную эмоцию по смыслу уже сформированного ответа. */
const getResponseExpression = (text: string): AiAvatarExpression => {
  if (/не удалось|ошибк|не могу|недоступ/i.test(text)) return 'sad';
  if (/спасибо|рад(?:а)? помочь|добро пожаловать|привет/i.test(text)) {
    return 'love';
  }
  if (/готово|выполнено|создан|добавлен|изменен|обновлен/i.test(text)) {
    return 'happy';
  }
  return 'happy';
};

const isCurrentVoiceCycle = (cycleId: number): boolean =>
  isVoiceModeOpen.value && cycleId === voiceCycleId;

/** Возвращает короткое понятное объяснение проблем с голосовым режимом. */
const getVoiceErrorMessage = (error: unknown): string => {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Разрешите доступ к микрофону в настройках браузера.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'Микрофон не найден.';
  }
  if (error instanceof Error && /[А-Яа-яЁё]/.test(error.message)) {
    return error.message;
  }
  return 'Не удалось обработать голос. Попробуйте ещё раз.';
};

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

const isMicrophoneAccessError = (error: unknown): boolean =>
  error instanceof DOMException &&
  ['NotAllowedError', 'NotFoundError'].includes(error.name);

const restartVoiceListening = (cycleId: number, delay = 0): void => {
  if (!isCurrentVoiceCycle(cycleId) || isVoiceMuted.value) return;
  clearVoiceRestartTimer();
  voiceRestartTimer = window.setTimeout(() => {
    voiceRestartTimer = null;
    if (!isCurrentVoiceCycle(cycleId) || isVoiceMuted.value) return;
    voiceCycleId += 1;
    void runVoiceConversationCycle(voiceCycleId);
  }, delay);
};

const clearVoiceRestartTimer = (): void => {
  if (voiceRestartTimer === null) return;
  window.clearTimeout(voiceRestartTimer);
  voiceRestartTimer = null;
};

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
    ? 'Запрашивать разрешения'
    : 'Автоматически подтверждать'
);
const responseModeLabel = computed(() =>
  responseMode.value === 'advanced' ? 'Продвинутый ответ' : 'Быстрый ответ'
);
const conversationDate = computed(() =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long'
  }).format(new Date())
);

/** Возвращает курсор в конец черновика, когда композер доступен пользователю. */
const focusComposer = (): void => {
  if (!isAssistantMounted) return;

  void nextTick(() => {
    if (composerFocusFrame !== null) {
      window.cancelAnimationFrame(composerFocusFrame);
    }

    composerFocusFrame = window.requestAnimationFrame(() => {
      composerFocusFrame = null;

      if (
        !isAssistantMounted ||
        route.value.type !== RouteTypes.AI ||
        isSelectionMode.value ||
        forwardModalOpen.value ||
        pendingDeleteMessageIds.value.length > 0 ||
        (isVoiceModeOpen.value && isVoiceModalVisible.value)
      ) {
        return;
      }

      const editor = contentEditorRef.value?.editor;
      if (editor) {
        editor.commands.focus('end');
        return;
      }

      contentEditorRef.value?.focus();
    });
  });
};

/** Возвращает фокус после выбора файла в основном или модальном композере. */
const handleComposerFileChange = (event: Event): void => {
  const input = event.target;

  if (
    route.value.type !== RouteTypes.AI ||
    !(input instanceof HTMLInputElement) ||
    input.type !== 'file' ||
    !input.files?.length
  ) {
    return;
  }

  const belongsToAiComposer = Boolean(
    input.closest('.ai-assistant') || input.closest('.attach-modal-container')
  );

  if (belongsToAiComposer) focusComposer();
};

const getEmojiButton = (
  target: EventTarget | null
): HTMLButtonElement | null =>
  target instanceof Element
    ? target.closest<HTMLButtonElement>('.v3-emojis button')
    : null;

const prepareEmojiDrag = (event: PointerEvent): void => {
  if (event.pointerType === 'touch') return;

  const button = getEmojiButton(event.target);
  if (button) button.draggable = true;
};

const handleEmojiDragStart = (event: DragEvent): void => {
  const button = getEmojiButton(event.target);
  const emoji = button?.textContent?.trim();

  if (!button || !emoji || !event.dataTransfer) return;

  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('text/plain', emoji);
  button.classList.add('ai-assistant__emoji--dragging');
};

const handleEmojiDragEnd = (event: DragEvent): void => {
  getEmojiButton(event.target)?.classList.remove(
    'ai-assistant__emoji--dragging'
  );
};

const runMenuSync = (action: () => void): void => {
  isMenuSyncInProgress = true;
  try {
    action();
  } finally {
    isMenuSyncInProgress = false;
  }
};

const closeEmojiPicker = (root: HTMLElement): void => {
  const openPicker = Array.from(
    root.querySelectorAll<HTMLElement>('.smile-button .emoji-picker')
  ).find(picker => {
    const trigger = picker.closest<HTMLElement>('.smile-button');
    return (
      picker.style.display !== 'none' && !!trigger?.getClientRects().length
    );
  });

  const trigger = openPicker?.closest<HTMLButtonElement>('.smile-button');
  if (trigger) runMenuSync(() => trigger.click());
};

const closeAttachmentPopover = (root: HTMLElement): void => {
  const trigger = root.querySelector<HTMLButtonElement>(
    '.popover-yui-kit__wrapper.active-yui-kit .attach-file-button'
  );

  if (trigger) runMenuSync(() => trigger.click());
};

const handleExclusiveMenuClick = (event: MouseEvent): void => {
  if (isMenuSyncInProgress || !(event.target instanceof Element)) return;

  const root = event.currentTarget as HTMLElement;
  const target = event.target;

  if (target.closest('.v3-emojis button')) {
    focusComposer();
    return;
  }

  if (target.closest('.attach-file-button')) {
    isPermissionMenuOpen.value = false;
    isResponseModeMenuOpen.value = false;
    closeEmojiPicker(root);
    return;
  }

  if (target.closest('.smile-button') && !target.closest('.emoji-picker')) {
    isPermissionMenuOpen.value = false;
    isResponseModeMenuOpen.value = false;
    closeAttachmentPopover(root);
    return;
  }

  if (target.closest('.ai-assistant__permission-trigger')) {
    isResponseModeMenuOpen.value = false;
    closeEmojiPicker(root);
    closeAttachmentPopover(root);
  }

  if (target.closest('.ai-assistant__response-trigger')) {
    isPermissionMenuOpen.value = false;
    closeEmojiPicker(root);
    closeAttachmentPopover(root);
  }
};

const SCROLL_TO_BOTTOM_BUTTON_THRESHOLD_PX = 24;

/** Синхронизирует кнопку перехода вниз с фактическим положением прокрутки. */
const handleScroll = (): void => {
  const container = scrollRef.value;
  if (!container) return;

  const distanceFromBottom = Math.max(
    0,
    container.scrollHeight - container.clientHeight - container.scrollTop
  );
  const hasScrollableContent = container.scrollHeight > container.clientHeight;
  const shouldShowButton =
    hasScrollableContent &&
    distanceFromBottom > SCROLL_TO_BOTTOM_BUTTON_THRESHOLD_PX;

  isShowScrollToBottomButton.value = shouldShowButton;
  isNearBottom.value = !shouldShowButton;
};

const scrollToBottom = async (smooth = false): Promise<void> => {
  await nextTick();
  const container = scrollRef.value;
  if (!container) return;

  container.scrollTo({
    top: container.scrollHeight,
    behavior: smooth ? 'smooth' : 'auto'
  });
  isShowScrollToBottomButton.value = false;
  isNearBottom.value = true;
};

const handleScrollToBottom = (): void => {
  void scrollToBottom(true);
};

const clearMessageHighlight = (): void => {
  if (messageHighlightTimeoutId !== null) {
    window.clearTimeout(messageHighlightTimeoutId);
    messageHighlightTimeoutId = null;
  }

  highlightedMessageId.value = null;
};

/** Переходит к AI-сообщению и выделяет его так же, как цель перехода в обычном чате. */
const navigateToAiMessage = async (
  messageId: string,
  behavior: 'auto' | 'smooth' = 'smooth'
): Promise<boolean> => {
  clearMessageHighlight();
  highlightedMessageId.value = messageId;
  await nextTick();

  const messageElement = Array.from(
    scrollRef.value?.querySelectorAll<HTMLElement>('[data-message-id]') || []
  ).find(element => element.dataset.messageId === messageId);

  if (!messageElement) {
    highlightedMessageId.value = null;
    return false;
  }

  messageElement.scrollIntoView({ behavior, block: 'center' });
  messageHighlightTimeoutId = window.setTimeout(() => {
    if (highlightedMessageId.value === messageId) {
      highlightedMessageId.value = null;
    }
    messageHighlightTimeoutId = null;
  }, 3400);

  return true;
};

/** Переходит к показанному закрепу и подготавливает следующий закреп для навигации. */
const handlePinnedMessageClick = (): void => {
  const message = currentPinnedMessage.value;
  const messages = pinnedMessages.value;
  if (!message || messages.length === 0) return;

  void navigateToAiMessage(message.id);
  const currentIndex = messages.findIndex(item => item.id === message.id);
  const nextIndex = (currentIndex - 1 + messages.length) % messages.length;
  currentPinnedMessageId.value = messages[nextIndex]?.id || null;
};

const openPinnedMessageUnpinModal = (): void => {
  isPinnedMessageUnpinModalOpen.value = true;
};

const closePinnedMessageUnpinModal = (): void => {
  isPinnedMessageUnpinModalOpen.value = false;
};

const confirmPinnedMessageUnpin = async (): Promise<void> => {
  const message = currentPinnedMessage.value;
  closePinnedMessageUnpinModal();
  if (!message) return;

  try {
    await toggleMessagePin(message.id);
    if (currentPinnedMessageId.value === message.id) {
      currentPinnedMessageId.value = null;
    }
  } catch (error) {
    showErrorNotification(error);
  } finally {
    focusComposer();
  }
};

const scrollOpenedChatToBottom = async (): Promise<void> => {
  isNearBottom.value = true;
  await scrollToBottom();
  requestAnimationFrame(() => {
    void scrollToBottom();
  });
};

/** Возвращает понятное имя автора AI-сообщения. */
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
  focusComposer();
};

/** Подготавливает ответ на сообщение или выделенный фрагмент. */
const startMessageReply = (message: AiAssistantMessage): void => {
  replyMessage.value = {
    ...message,
    text: contextMessage.value?.selectedText || message.text
  };
  editingMessage.value = null;
  focusComposer();
};

/** Переносит пользовательский запрос в редактор для изменения и повторного запуска. */
const startMessageEdit = (message: AiAssistantMessage): void => {
  if (message.role !== 'user') return;
  editingMessage.value = message;
  replyMessage.value = null;
  draft.value = message.text;
  focusComposer();
};

/** Отменяет редактирование AI-сообщения. */
const cancelMessageEdit = (): void => {
  editingMessage.value = null;
  draft.value = '';
  focusComposer();
};

/** Убирает ответ на сообщение и оставляет пользователя в поле ввода. */
const cancelMessageReply = (): void => {
  replyMessage.value = null;
  focusComposer();
};

/** Убирает пересланный контекст текущего AI-чата и возвращает ввод. */
const clearActiveForwardDraft = (): void => {
  const sessionId = activeForwardDraft.value?.sessionId;
  if (sessionId) clearAiForwardDraft(sessionId);
  focusComposer();
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
  focusComposer();
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

/** Переносит сообщение в выбранный AI-чат и оставляет поле для поручения. */
const handleForwardAiSession = (session: AiAssistantSession): void => {
  if (forwardMessages.value.length === 0) return;

  editingMessage.value = null;
  replyMessage.value = null;
  draft.value = '';
  openAiForwardDraft(session, forwardMessages.value);
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

/** Закрывает подтверждение удаления без потери готовности к вводу. */
const cancelDeleteMessages = (): void => {
  pendingDeleteMessageIds.value = [];
  focusComposer();
};

/** Применяет решение по действию агента и возвращает пользователя к вводу. */
const handleApproval = async (
  messageId: string,
  state: 'approved' | 'rejected'
): Promise<void> => {
  try {
    await updateApproval(messageId, state);
  } finally {
    focusComposer();
  }
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
  } finally {
    focusComposer();
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
    else if (action === 'togglePin') {
      const wasPinned = Boolean(message.pinned);
      await toggleMessagePin(message.id);
      currentPinnedMessageId.value = wasPinned ? null : message.id;
      focusComposer();
    } else if (action === 'select') toggleMessageSelection(message.id);
    else if (action === 'delete') requestDeleteMessage(message);
    else if (action === 'forwardSelection') openSelectedMessagesForward();
    else if (action === 'cancelSelection') clearMessageSelection();
    else if (action === 'deleteSelection') requestDeleteSelectedMessages();
  } catch (error) {
    showErrorNotification(error);
  }
};

const handleSend = async (
  payload?: IContentEditorSendPayload
): Promise<void> => {
  const value = stripHtml(payload?.content ?? draft.value);
  const submittedForwardDraft = activeForwardDraft.value;
  const files = [
    ...(payload?.mediaFiles ? Array.from(payload.mediaFiles) : []),
    ...(payload?.files ? Array.from(payload.files) : [])
  ];

  if (
    (!value && files.length === 0 && !submittedForwardDraft) ||
    isUploadingAttachments.value
  ) {
    return;
  }

  isUploadingAttachments.value = true;
  try {
    const attachments = files.length > 0 ? await stageAiAttachments(files) : [];
    const replyTo = replyMessage.value
      ? {
          role: replyMessage.value.role,
          content: replyMessage.value.text
        }
      : undefined;
    const editedMessage = editingMessage.value;
    const visibleValue = submittedForwardDraft
      ? [submittedForwardDraft.context, value].filter(Boolean).join('\n\n')
      : value;
    const modelValue = submittedForwardDraft
      ? [
          'Используй пересланное сообщение как контекст для поручения.',
          submittedForwardDraft.context,
          value
            ? `Поручение пользователя:\n${value}`
            : 'Поручение пользователя:\nПроанализируй сообщение и предложи дальнейшие действия.'
        ].join('\n\n')
      : undefined;
    const request = editedMessage
      ? editMessageAndResend(
          editedMessage.id,
          visibleValue,
          attachments,
          replyTo
        )
      : sendMessage(visibleValue, attachments, replyTo, modelValue);
    if (submittedForwardDraft) {
      clearAiForwardDraft(submittedForwardDraft.sessionId);
    }
    void request.catch(error => {
      showErrorNotification(error);
      if (submittedForwardDraft) {
        restoreAiForwardDraft(submittedForwardDraft);
      }
      if (editedMessage) {
        editingMessage.value = editedMessage;
        draft.value = value;
      }
    });
    draft.value = '';
    replyMessage.value = null;
    editingMessage.value = null;
    void scrollToBottom();
  } catch (error) {
    showErrorNotification(
      error instanceof Error
        ? error.message
        : 'Не удалось подготовить вложение для AI'
    );
  } finally {
    isUploadingAttachments.value = false;
    focusComposer();
  }
};

const handleSuggestion = (prompt: 'summary' | 'tasks'): void => {
  sendSuggestedPrompt(prompt);
  void scrollToBottom();
  focusComposer();
};

const handleAutomationClick = (kind: 'daily' | 'weekly'): void => {
  startNewTask();
  void sendMessage(
    kind === 'daily'
      ? 'Настрой ежедневную сводку по активным, просроченным и запланированным на сегодня задачам доски в 8:00'
      : 'Настрой еженедельный обзор задач доступных проектов доски по пятницам в 18:00'
  );
  void scrollToBottom();
  focusComposer();
};

const selectPermission = (mode: 'ask' | 'automatic'): void => {
  permissionMode.value = mode;
  isPermissionMenuOpen.value = false;
  focusComposer();
};

const togglePermissionMenu = (): void => {
  isResponseModeMenuOpen.value = false;
  isPermissionMenuOpen.value = !isPermissionMenuOpen.value;
};

const toggleResponseModeMenu = (): void => {
  isPermissionMenuOpen.value = false;
  isResponseModeMenuOpen.value = !isResponseModeMenuOpen.value;
};

const selectResponseMode = (mode: AiResponseMode): void => {
  responseMode.value = mode;
  isResponseModeMenuOpen.value = false;
  focusComposer();
};

watch(
  [
    () => route.value.type,
    () => route.value.id,
    activeView,
    () => activeForwardDraft.value?.sessionId
  ],
  ([routeType]) => {
    if (routeType === RouteTypes.AI) focusComposer();
  },
  { immediate: true, flush: 'post' }
);

watch(
  () => [route.value.type, route.value.id] as const,
  ([routeType, sessionId]) => {
    if (routeType !== RouteTypes.AI || !sessionId) return;

    const session = sessions.value.find(item => item.id === sessionId);
    if (session) {
      const task = tasks.value.find(item => item.sessionId === sessionId);
      if (task) {
        selectTask(task.id);
      } else if (session.kind === 'task') {
        selectTaskSession(sessionId);
      } else {
        selectSession(sessionId);
      }
      void scrollOpenedChatToBottom();
      return;
    }

    startNewSession();
    navigateToAI();
  },
  { immediate: true }
);

watch(
  () => [route.value.type, route.value.id] as const,
  ([routeType, sessionId], [previousRouteType, previousSessionId]) => {
    if (
      previousRouteType === RouteTypes.AI &&
      previousSessionId &&
      (routeType !== RouteTypes.AI || sessionId !== previousSessionId)
    ) {
      markSessionInactive(previousSessionId);
    }
  }
);

watch([activeSessionId, activeView], ([sessionId, view]) => {
  if (route.value.type !== RouteTypes.AI) return;
  navigateToAI(view === 'chat' ? sessionId : null);
});

watch([() => activeSession.value?.id, activeView], () => {
  closeMessageContextMenu();
  closePinnedMessageUnpinModal();
  clearMessageHighlight();
  clearMessageSelection();
  currentPinnedMessageId.value = null;
  replyMessage.value = null;
  editingMessage.value = null;
  pendingDeleteMessageIds.value = [];
  isNearBottom.value = true;
  void scrollToBottom();
});

watch([() => activeSession.value?.messages.length || 0, isThinking], () => {
  if (isNearBottom.value) void scrollToBottom();
});

watch(isThinking, thinking => {
  if (thinking) isResponseModeMenuOpen.value = false;
});

watch(isVoiceModeOpen, (isOpen, wasOpen) => {
  if (!isOpen || wasOpen) return;

  isVoiceMuted.value = false;
  voiceCycleId += 1;
  void runVoiceConversationCycle(voiceCycleId);
});

watch(
  () => activeSearchTarget.value?.requestId,
  async () => {
    const target = activeSearchTarget.value;
    if (!target || target.sessionId !== activeSessionId.value) return;
    await navigateToAiMessage(target.messageId);
  },
  { flush: 'post' }
);

onMounted(() => {
  isAssistantMounted = true;
  document.addEventListener('change', handleComposerFileChange, true);
  focusComposer();
});

onBeforeUnmount(() => {
  isAssistantMounted = false;
  document.removeEventListener('change', handleComposerFileChange, true);
  if (composerFocusFrame !== null) {
    window.cancelAnimationFrame(composerFocusFrame);
    composerFocusFrame = null;
  }
  clearMessageHighlight();
  closeVoiceMode();
  markSessionInactive(activeSessionId.value);
});

defineExpose({
  handleClear: clearAll,
  focusComposer
});
</script>
