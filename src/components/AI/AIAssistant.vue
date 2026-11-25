<template>
  <section
    ref="assistantRoot"
    :class="[
      'ai-assistant',
      {
        'ai-assistant--has-pinned-message':
          activeView !== 'tasks' && !!currentPinnedMessage
      }
    ]"
    data-testid="AI-Assistant"
    @click.capture="handleExclusiveMenuClick"
    @pointerdown.capture="prepareEmojiDrag"
    @dragstart.capture="handleEmojiDragStart"
    @dragend.capture="handleEmojiDragEnd"
  >
    <PinnedMessageBanner
      v-if="activeView !== 'tasks' && currentPinnedMessage"
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
      <div v-if="showEmptyConversation" class="ai-assistant__empty">
        <span class="ai-assistant__hero-icon">
          <AiAvatar />
        </span>
        <h1>Чем вам помочь сегодня?</h1>
        <div v-if="activeView === 'chat'" class="ai-assistant__suggestions">
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
        <div
          v-else
          class="ai-assistant__suggestions ai-assistant__suggestions--agent"
        >
          <button
            v-for="shortcut in agentShortcuts"
            :key="shortcut.label"
            type="button"
            class="ai-assistant__suggestion"
            @click="applyAgentShortcut(shortcut.prompt)"
          >
            <component :is="shortcut.icon" />
            {{ shortcut.label }}
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

      <div
        v-else
        class="ai-assistant__conversation"
        :class="{
          'ai-assistant__conversation--agent': activeView === 'agents'
        }"
      >
        <template v-for="(message, index) in visibleMessages" :key="message.id">
          <time
            v-if="isNewConversationDay(message, visibleMessages[index - 1])"
            class="ai-assistant__date"
          >
            {{ formatConversationDate(message.timestamp) }}
          </time>
          <div
            :class="[
              'message ai-assistant__message',
              `ai-assistant__message--${message.role}`,
              {
                message__other: message.role === 'user',
                'ai-assistant__message--selection-active': isSelectionMode,
                'ai-assistant__message--selected': isMessageSelected(
                  message.id
                ),
                highlighted: highlightedMessageId === message.id
              }
            ]"
            :data-message-id="message.id"
            :data-is-me-sender="message.role === 'user'"
            @click="
              !message.pending && handleMessageSelectionClick(message, $event)
            "
            @contextmenu="
              !message.pending && handleMessageContextMenu(message, $event)
            "
            @copy="copyMessageSelection"
          >
            <div
              :class="[
                'ai-assistant__message-selection',
                {
                  'ai-assistant__message-selection--hidden':
                    !isSelectionMode || message.pending
                }
              ]"
            >
              <Checkbox
                v-if="isSelectionMode && !message.pending"
                :model-value="isMessageSelected(message.id)"
                :circular="CheckboxCircularEnum.circled"
                @update:model-value="toggleMessageSelection(message.id)"
                @click.stop
              />
            </div>
            <div
              v-if="message.role === 'assistant'"
              class="ai-assistant__message-content ai-assistant__answer"
              :class="{
                'ai-assistant__message-files': message.outputAttachments?.length
              }"
            >
              <AgentWorkTimeline
                v-if="
                  message.durationMs != null ||
                  message.workLog?.length ||
                  message.reasoningSummaries?.length
                "
                :entries="message.workLog"
                :summaries="message.reasoningSummaries"
                :duration="
                  message.durationMs != null
                    ? formatAgentDuration(message.durationMs)
                    : ''
                "
                :thread-id="activeSessionId"
              />
              <AiAnswerMarkdown
                :content="message.text"
                :files="message.projectFiles"
                :data-testid="`AI-Assistant-Message-${message.id}-MessageText`"
              />
              <AIActionPipeline
                v-if="visibleActionTasks.has(message.id)"
                :task="visibleActionTasks.get(message.id)!"
              />
              <div
                v-for="file in message.projectFiles"
                :key="file.path"
                class="ai-assistant__project-file"
              >
                <button
                  type="button"
                  title="Показать в папке"
                  @click.stop="revealAgentFile(file.path)"
                >
                  {{ file.path }}
                </button>
                <small v-if="file.imageError" role="alert">{{
                  file.imageError
                }}</small>
              </div>
              <MessageBubble
                v-if="
                  message.projectFiles?.length &&
                  message.outputAttachments?.length
                "
                message=""
                :time="message.time"
                is-dialog
                :media="getMessageOutputMedia(message)"
                :data-testid="`AI-Agent-Photos-${message.id}`"
              />
              <MessageBubbleFiles
                v-else-if="message.outputAttachments?.length"
                :message="''"
                :time="message.time"
                :is-pin="message.pinned"
                :is-me-sender="false"
                :is-dialog="true"
                :continues-with-next="true"
                :media="getMessageOutputMedia(message)"
                :data-testid="`AI-Assistant-Message-${message.id}`"
                @set-slider="handleOutputAttachmentClick"
              />
            </div>
            <MessageBubbleText
              v-else
              class="message__bubble ai-assistant__message-content"
              :message="getMessageHtml(message.text)"
              :time="message.time"
              :is-pin="message.pinned"
              :is-me-sender="message.role === 'user'"
              :is-read="!message.pending"
              :is-dialog="true"
              :parsed-call-message="null"
              :data-testid="`AI-Assistant-Message-${message.id}`"
            >
              <template v-if="message.replyTo" #reference>
                <div
                  :class="[
                    'ai-assistant__message-reply',
                    'message-reference-block',
                    {
                      'message-reference-block--outgoing':
                        message.role === 'user'
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
              </template>
            </MessageBubbleText>
            <div
              v-if="
                visibleActionTasks.get(message.id)?.status ===
                  'waiting_approval' ||
                (message.showApproval && !message.approvalState)
              "
              class="ai-assistant__approval"
            >
              <button
                type="button"
                class="ai-assistant__approval-reject"
                @click="handleApproval(message.id, 'rejected')"
              >
                Отклонить
              </button>
              <button
                type="button"
                class="ai-assistant__approval-confirm"
                :disabled="visibleActionTasks.has(message.id) && taskBusy"
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
        </template>
        <div
          v-if="conversationError"
          class="ai-assistant__thinking"
          role="alert"
        >
          {{ conversationError }}
        </div>
        <div
          v-if="isThinking"
          class="ai-assistant__thinking ai-assistant__progress"
          role="status"
          :aria-live="activeAgentChat ? 'off' : 'polite'"
        >
          <AgentWorkTimeline
            v-if="activeAgentChat?.startedAt != null"
            :key="activeAgentChat.id + ':' + activeAgentChat.startedAt"
            :entries="liveWorkEntries"
            :duration="formatAgentDuration(agentElapsedMs)"
            :thread-id="activeSessionId"
            live
          />
          <span
            v-if="
              agentPermission ||
              liveWorkEntries.at(-1)?.text !== preparationStatus
            "
            class="ai-assistant__current-stage"
          >
            {{
              agentPermission ? 'Требуется подтверждение' : preparationStatus
            }}
            <span
              v-if="!agentPermission"
              class="ai-assistant__thinking-dots"
              aria-hidden="true"
              >•••</span
            >
          </span>
          <small
            v-if="agentProgressDetail"
            class="ai-assistant__progress-detail"
            aria-hidden="true"
          >
            {{ agentProgressDetail }}
          </small>
        </div>
      </div>
    </div>

    <div
      v-if="
        activeView !== 'tasks' && !!activeSession && isShowScrollToBottomButton
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
          'ai-assistant__composer--can-stop': canStopAgent,
          'ai-assistant__composer--thinking': isThinking
        }
      ]"
    >
      <p
        v-if="activeAgentChat?.pendingDirectory"
        class="ai-assistant__thinking"
        role="status"
      >
        Подключаю папку проекта…
      </p>
      <section
        v-if="agentPermission"
        class="ai-assistant__agent-approval"
        aria-label="Запрос разрешения"
      >
        <strong>{{
          agentPermission.toolCall.title || 'Действие агента'
        }}</strong>
        <small v-if="agentPermissionPath">{{ agentPermissionPath }}</small>
        <details v-if="agentPermissionDiff?.newText != null">
          <summary>Показать изменения</summary>
          <pre>{{ agentPermissionDiff.newText }}</pre>
        </details>
        <div class="ai-assistant__approval">
          <button
            type="button"
            class="ai-assistant__approval-reject"
            @click="answerAgentPermission(false)"
          >
            Отклонить
          </button>
          <button
            type="button"
            class="ai-assistant__approval-confirm"
            @click="answerAgentPermission(true)"
          >
            Разрешить один раз
          </button>
        </div>
      </section>
      <AiComposerSettings
        ref="composerSettingsRef"
        class="ai-assistant__editor"
        :project="agentProjectSetting"
        :models="composerModels"
        :model="composerModel"
        :efforts="composerEfforts"
        :effort="composerEffort"
        :apply-model="applyComposerModel"
        :apply-effort="applyComposerEffort"
        :directory-pending="isChoosingAgentDirectory"
        :pending="activeView === 'agents' && activeAgentChat?.busy === 'config'"
        :models-loading="
          !composerModels.length &&
          (activeView === 'agents' ? agentModelsLoading : catalogLoading)
        "
        :models-error="
          !composerModels.length
            ? activeView === 'agents'
              ? agentModelsError
              : catalogError
            : ''
        "
        @choose-directory="openAgentDirectory"
        @open="openComposerSettings"
        @retry-models="openComposerSettings"
        @error="reportComposerSettingsError"
      />
      <div
        ref="iosPwaEditorHost"
        class="ai-assistant__editor"
        @change.capture="validateAttachmentSelection"
        @drop.capture="validateAttachmentSelection"
        @paste.capture="validateAttachmentSelection"
      >
        <ContentEditor
          ref="contentEditorRef"
          v-model="draft"
          :attachment-draft-key="composerKey"
          :active-attach-file="true"
          :active-send="activeView === 'agents' && !!activeForwardDraft"
          :disable-send-on-enter="
            isThinking ||
            isUploadingAttachments ||
            (activeView === 'agents' &&
              (isChoosingAgentDirectory || !!activeAgentChat?.busy))
          "
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
          <template
            v-for="placement in composerControlPlacements"
            #[placement.slot]
          >
            <div
              v-if="placement.permission"
              :key="`${placement.slot}-permission`"
              :class="[
                'ai-assistant__permission-control',
                `ai-assistant__permission-control--${placement.variant}`
              ]"
            >
              <Button
                :type="ButtonTypeEnum.ghost"
                :size="SizesEnum.small"
                :class="[
                  'toolbar-button ai-assistant__permission-trigger',
                  `ai-assistant__permission-trigger--${placement.variant}`,
                  { 'mobile-buttons': placement.variant === 'mobile' }
                ]"
                :aria-label="permissionLabel"
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
                  <span>Запрашивать разрешение</span>
                </button>
              </div>
            </div>
            <AiDictationButton
              v-if="placement.variant === 'mobile'"
              :key="`${placement.slot}-dictation`"
              mobile
              :disabled="dictationDisabled"
              :label="dictationButtonLabel"
              :phase="dictationPhase"
              :failure="dictationFailure"
              @toggle="toggleDictation"
            />
            <Button
              v-if="placement.variant === 'mobile' && canStopAgent"
              :type="ButtonTypeEnum.primary"
              :size="SizesEnum.small"
              class="toolbar-button mobile-buttons ai-assistant__stop-button"
              :key="`${placement.slot}-stop`"
              title="Остановить ответ"
              aria-label="Остановить ответ"
              @click.stop="stopAgentResponse"
            >
              <span class="ai-assistant__stop-square" aria-hidden="true"></span>
            </Button>
          </template>
          <template #desktop-right-action>
            <AiDictationButton
              :disabled="dictationDisabled"
              :label="dictationButtonLabel"
              :phase="dictationPhase"
              :failure="dictationFailure"
              @toggle="toggleDictation"
            />
            <Button
              v-if="canStopAgent"
              :type="ButtonTypeEnum.primary"
              :size="SizesEnum.small"
              class="toolbar-button ai-assistant__stop-button"
              title="Остановить ответ"
              aria-label="Остановить ответ"
              @click.stop="stopAgentResponse"
            >
              <span class="ai-assistant__stop-square" aria-hidden="true"></span>
            </Button>
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
      <p
        v-if="voiceQueueNotice"
        class="ai-assistant__voice-notice"
        role="status"
        aria-live="polite"
      >
        {{ voiceQueueNotice }}
      </p>
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
  BackButtonPriority,
  useBackButtonHandler
} from '../../composables/useBackButton';
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
import AiComposerSettings from './AiComposerSettings.vue';
import AiDictationButton from './AiDictationButton.vue';
import { useSessionStorage } from '@vueuse/core';
import AiAnswerMarkdown from './AiAnswerMarkdown.vue';
import AgentWorkTimeline from './AgentWorkTimeline.vue';
import type { AgentWorkEntry } from '../../types/agent-work';
import { getAiErrorMessage } from '../../services/aiErrorMessages';
import { fetchAiResponseCatalog } from '../../services/aiResponseModels';
import {
  agentChoices,
  answerDesktopAgentPermission,
  cancelDesktopAgentPrompt
} from '../../composables/useDesktopAgentChats';
import VoiceMessageIcon from './VoiceMessageIcon.vue';
import ChatSummaryIcon from './ChatSummaryIcon.vue';
import TasksSuggestionIcon from './TasksSuggestionIcon.vue';
import PermissionHandIcon from './PermissionHandIcon.vue';
import PermissionCheckCircleIcon from './PermissionCheckCircleIcon.vue';
import AIMessageContextMenu from './AIMessageContextMenu.vue';
import AIActionPipeline from './AIActionPipeline.vue';
import {
  type AiAssistantMessage,
  useAiAssistant
} from '../../composables/useAiAssistant';
import {
  navigateBackFromChat,
  navigateToAI,
  useUrlWatcher
} from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import { showErrorNotification } from '../../composables/useNotifications';
import { useContextMenu } from '../../composables/useContextMenu';
import { openMessageDraft } from '../../composables/useMessageDraftTransfer';
import {
  clearAiForwardDraft,
  openAiForwardDraft,
  useAiForwardDraft
} from '../../composables/useAiForwardDraft';
import { useAiMessageSearch } from '../../composables/useAiMessageSearch';
import { useIosPwaFilePicker } from '../../composables/useIosPwaFilePicker';
import { stageAiAttachments } from '../../services/aiAttachments';
import { validateAiAttachments } from '../../services/aiAttachmentLimits';
import { MediaType } from '@pksep/zod-shared-chat';
import { VoiceConversation } from '../../services/voiceConversation';
import {
  Dictation,
  type DictationFailure,
  type DictationPhase
} from '../../services/dictation';
import {
  getChatSDK,
  getCurrentUserId,
  getHasWebsocketConnection
} from '../../services/useChat';
import { getConfig } from '../../services/useConfig';
import { VoiceActionFeedback } from '../../services/aiActionTaskPresentation';
import { stripHtml } from '../../utils/stripHtml';
import { copyMessageSelection } from '../../utils/copyMessageSelection';
import type { IMedia, ITopic } from '../interfaces/interfaces';
import type { AiAssistantSession } from '../../composables/useAiAssistant';
import ConfirmModal from '../UI/ConfirmModal.vue';
import EditIcon from '../UI/EditIcon.vue';
import ForwardIcon from '../UI/ForwardIcon.vue';
import ReplyIcon from '../UI/ReplyIcon.vue';
import ForwardModal from '../Messages/ForwardModal.vue';
import MessageBubbleFiles from '../Messages/MessageBubbleFiles.vue';
import MessageBubble from '../Messages/MessageBubble.vue';
import { revealAgentFile } from '../../services/desktop-agent-output';
import MessageBubbleText from '../Messages/MessageBubbleText.vue';
import PinnedMessageBanner from '../Messages/PinnedMessageBanner.vue';
import { useMessageMedia } from '../Messages/composables/useMessageMedia';
import { downloadNativeFile } from '../../services/useNativeFile';
import { triggerBrowserDownload } from '../../utils/media-download';
import LeaveIcon from '../CallModal/UI/LeaveIcon.vue';
import MicDisableIcon from '../CallModal/UI/MicDisableIcon.vue';
import MicIcon from '../CallModal/UI/MicIcon.vue';

interface IContentEditorSendPayload {
  content?: string;
  files?: FileList;
  mediaFiles?: FileList;
}

// Одинаковые кнопки и меню в штатных слотах редактора на обеих ширинах.
const composerControlPlacements = [
  {
    slot: 'mobile-trailing-action',
    variant: 'mobile',
    permission: true
  },
  {
    slot: 'desktop-left-action',
    variant: 'desktop',
    permission: true
  }
] as const;

// Ответы ИИ хранятся как текст, а общий компонент сообщений принимает HTML.
const getMessageHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r?\n/g, '<br>');

const {
  sessions,
  activeView,
  activeAgentChat,
  preferredAgentModel,
  preferredAgentEffort,
  availableAgentModels,
  availableAgentEffort,
  agentModelsLoading,
  agentModelsError,
  refreshAgentModels,
  isChoosingAgentDirectory,
  chooseAgentDirectory,
  setAssistantModel,
  responseCatalog,
  activeResponseModel,
  modelSelection,
  setChatEffort,
  setAgentModel,
  setAssistantEffort,
  sendAgentMessage,
  activeSessionId,
  activeSession,
  pendingMessageNavigation,
  isThinking,
  visibleMessages,
  preparationStatus,
  conversationError,
  taskBusy,
  resolveActionTask,
  isVoiceModeOpen,
  isVoiceModalVisible,
  permissionMode,
  responseMode,
  startVoiceCall,
  hideVoiceCall,
  stopVoiceCall,
  startNewSession,
  selectSession,
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

const agentShortcuts = [
  {
    label: 'Найти файл',
    prompt: 'Найди в проекте файл ',
    icon: ChatSummaryIcon
  },
  {
    label: 'Изучить проект',
    prompt: 'Объясни структуру проекта и с чего начать знакомство с кодом.',
    icon: TasksSuggestionIcon
  },
  {
    label: 'Разобрать ошибку',
    prompt: 'Найди причину ошибки в проекте: ',
    icon: ChatSummaryIcon
  }
];

const showEmptyConversation = computed<boolean>(
  () =>
    activeView.value !== 'tasks' &&
    (!activeSession.value ||
      (activeView.value === 'agents' &&
        visibleMessages.value.length === 0 &&
        !isThinking.value &&
        !conversationError.value))
);

const applyAgentShortcut = (prompt: string): void => {
  appendToDraft(prompt);
  focusComposer();
};

const catalogLoading = ref(false);
const catalogError = ref('');
let catalogRequest: AbortController | undefined;

async function refreshResponseModelNames(): Promise<void> {
  if (activeView.value === 'agents' || catalogRequest) return;

  const request = new AbortController();
  catalogRequest = request;
  catalogLoading.value = true;
  catalogError.value = '';
  try {
    const catalog = await fetchAiResponseCatalog(request.signal);
    if (!request.signal.aborted) responseCatalog.value = catalog;
  } catch {
    if (!request.signal.aborted)
      catalogError.value = 'Не удалось загрузить список моделей.';
  } finally {
    if (catalogRequest === request) {
      catalogLoading.value = false;
      catalogRequest = undefined;
    }
  }
}

watch(
  [getCurrentUserId, () => getConfig().CHAT_MASTRA_URL],
  () => {
    catalogRequest?.abort();
    catalogRequest = undefined;
    responseCatalog.value = undefined;
    void refreshResponseModelNames();
  },
  { immediate: true }
);
watch(
  [activeView, getHasWebsocketConnection],
  () => void refreshResponseModelNames()
);

const composerModels = computed(() =>
  activeView.value === 'agents'
    ? availableAgentModels.value
    : (responseCatalog.value?.models ?? []).map(({ id, name }) => ({
        value: id,
        name: name.replace(/^(GPT-\d+(?:\.\d+)?)-(?=[A-Za-z])/, '$1 ')
      }))
);
const composerModel = computed<string>(() =>
  activeView.value === 'agents'
    ? preferredAgentModel.value
    : activeResponseModel.value?.id ?? ''
);
const effortTranslations = new Map([
  ['none', 'Без рассуждения'],
  ['minimal', 'Минимальный'],
  ['low', 'Лёгкий'],
  ['default', 'Обычный'],
  ['medium', 'Средний'],
  ['high', 'Высокий'],
  ['xhigh', 'Очень высокий'],
  ['extra high', 'Очень высокий'],
  ['max', 'Максимальный'],
  ['maximum', 'Максимальный'],
  ['off', 'Обычный'],
  ['ultra', 'Ультра']
]);
const composerEfforts = computed(() => {
  const choices =
    activeView.value === 'agents'
      ? agentChoices(availableAgentEffort.value)
      : (activeResponseModel.value?.efforts ?? []).map(value => ({
          value,
          name: value
        }));
  return choices
    .map(({ value, name }) => ({
      value,
      name: effortTranslations.get(name.toLowerCase()) ?? name
    }))
    .sort(
      (a, b) => Number(b.value === 'default') - Number(a.value === 'default')
    );
});
const composerEffort = computed<string>(() => {
  if (activeView.value !== 'agents')
    return modelSelection.value?.effort ?? 'default';
  const selected = preferredAgentEffort.value;
  return composerEfforts.value.some(choice => choice.value === selected)
    ? selected
    : availableAgentEffort.value?.currentValue ?? 'default';
});
const agentProjectSetting = computed(() =>
  activeView.value === 'agents'
    ? {
        directory:
          activeAgentChat.value?.pendingDirectory ||
          activeSession.value?.project?.directory ||
          ''
      }
    : undefined
);
const agentPermission = computed(() => activeAgentChat.value?.permissions[0]);
const canStopAgent = computed<boolean>(
  () => activeView.value === 'agents' && !!activeAgentChat.value?.running
);
const agentElapsedMs = ref(0);
const liveWorkEntries = computed<AgentWorkEntry[]>(() =>
  Array.from(activeAgentChat.value?.workLog?.values() ?? [])
);

const agentProgressDetail = computed((): string => {
  const chat = activeAgentChat.value;
  if (
    !chat?.running ||
    chat.startedAt == null ||
    chat.lastProgressAt == null ||
    agentPermission.value
  ) {
    return '';
  }

  const quietMs = chat.startedAt + agentElapsedMs.value - chat.lastProgressAt;
  if (chat.toolTitle === 'Обдумываю запрос' && !liveWorkEntries.value.length) {
    return 'Модель пока не прислала первое пояснение';
  }
  if (quietMs >= 15_000) {
    return 'Жду продолжения ответа';
  }
  if (chat.receivedChars)
    return `Получено знаков: ${chat.receivedChars.toLocaleString('ru-RU')}`;

  return '';
});

function formatAgentDuration(durationMs: number): string {
  const seconds = Math.max(1, Math.floor(durationMs / 1_000));

  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes} мин ${seconds % 60} с` : `${seconds} с`;
}

watch(
  () => activeAgentChat.value?.startedAt,
  (startedAt, _previous, onCleanup): void => {
    if (startedAt == null) return;

    const updateElapsed = (): void => {
      agentElapsedMs.value = Math.max(0, Date.now() - startedAt);
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1_000);
    onCleanup((): void => window.clearInterval(timer));
  },
  { immediate: true, flush: 'sync' }
);

const agentPermissionDiff = computed(() =>
  agentPermission.value?.toolCall.content?.find(item => item.type === 'diff')
);
const agentPermissionPath = computed(
  () =>
    agentPermissionDiff.value?.path ??
    agentPermission.value?.toolCall.locations?.[0]?.path
);

async function applyComposerModel(value: string): Promise<void> {
  if (activeView.value === 'agents') {
    await setAgentModel(value);
    return;
  }

  setAssistantModel(value);
}

async function applyComposerEffort(value: string): Promise<void> {
  if (activeView.value === 'agents') await setAssistantEffort(value);
  else setChatEffort(value);
}

function reportComposerSettingsError(error: unknown): void {
  showErrorNotification(
    typeof error === 'string' ? error : getAiErrorMessage(error)
  );
}

function openComposerSettings(): void {
  isPermissionMenuOpen.value = false;
  if (activeView.value === 'agents') void refreshAgentModels();
  else void refreshResponseModelNames();
}

function openAgentDirectory(): void {
  void chooseAgentDirectory().catch(reportComposerSettingsError);
}

function answerAgentPermission(allow: boolean): void {
  const chat = activeAgentChat.value;
  const permission = agentPermission.value;
  if (chat && permission)
    void answerDesktopAgentPermission(chat, permission.requestId, allow);
}

function stopAgentResponse(): void {
  const chat = activeAgentChat.value;
  if (chat)
    void cancelDesktopAgentPrompt(chat).catch(reportComposerSettingsError);
}

// Каждый план показан в своём сообщении один раз, в последней сохранённой версии.
// Незавершённые поручения остаются управляемыми, старые итоги — в истории чата.
const visibleActionTasks = computed(() => {
  const plans = new Map<
    string,
    { messageId: string; task: NonNullable<AiAssistantMessage['actionTask']> }
  >();
  for (const message of activeSession.value?.messages || []) {
    const task = message.actionTask;
    if (
      task &&
      (!plans.has(task.id) || plans.get(task.id)!.task.version <= task.version)
    ) {
      plans.set(task.id, { messageId: message.id, task });
    }
  }
  const ordered = [...plans.values()];
  return new Map(ordered.map(({ messageId, task }) => [messageId, task]));
});

const route = useUrlWatcher();
const { activeTarget: activeSearchTarget } = useAiMessageSearch();
const { pendingAiForwardDraft } = useAiForwardDraft();
const draft = ref('');
const assistantRoot = ref<HTMLElement | null>(null);
const contentEditorRef = ref<InstanceType<typeof ContentEditor> | null>(null);
const iosPwaEditorHost = ref<HTMLElement | null>(null);
useIosPwaFilePicker(
  iosPwaEditorHost,
  (files, onlyMedia) => {
    void contentEditorRef.value?.queueAttachFiles(files, onlyMedia);
  },
  validateAiAttachments
);
const scrollRef = ref<HTMLElement | null>(null);
const isShowScrollToBottomButton = ref(false);
const highlightedMessageId = ref<string | null>(null);
const currentPinnedMessageId = ref<string | null>(null);
const isPinnedMessageUnpinModalOpen = ref(false);
const isNearBottom = ref(true);
const isVoiceMuted = ref(false);
const isPermissionMenuOpen = ref(false);
const composerSettingsRef = ref<InstanceType<typeof AiComposerSettings> | null>(
  null
);
const isUploadingAttachments = ref(false);
const contextMessage = ref<{
  message: AiAssistantMessage;
  selectedText: string;
} | null>(null);
const selectedMessageIds = ref<Set<string>>(new Set());
const replyMessage = ref<Pick<AiAssistantMessage, 'role' | 'text'> | null>(
  null
);
const editingMessage = ref<AiAssistantMessage | null>(null);
type ComposerDraft = {
  html: string;
  reply: typeof replyMessage.value;
  editing: typeof editingMessage.value;
  files: File[];
  mediaFiles: File[];
};
const composerKey = computed(() =>
  activeView.value === 'tasks'
    ? 'new-task'
    : activeSessionId.value ??
      (activeView.value === 'agents' ? 'new-agent' : 'new-chat')
);
const dictationPhase = ref<DictationPhase>();
let dictation: Dictation | undefined;

const dictationFailures = useSessionStorage<Record<string, DictationFailure>>(
  'sep-chat:dictation-recovery',
  {},
  { flush: 'sync', writeDefaults: false }
);
const dictationKey = computed(() =>
  JSON.stringify([
    getConfig().CHAT_API_DOMAIN,
    getCurrentUserId(),
    activeView.value,
    composerKey.value
  ])
);
const dictationFailure = computed(
  () => dictationFailures.value[dictationKey.value]
);

const dictationBusy = computed<boolean>(
  () =>
    dictationPhase.value === 'starting' ||
    dictationPhase.value === 'finishing' ||
    dictationPhase.value === 'polishing'
);
const dictationPressed = computed<boolean>(
  () => dictationPhase.value === 'recording'
);
const dictationUnavailable = computed<boolean>(
  () => !getHasWebsocketConnection()
);
const dictationDisabled = computed<boolean>(
  () =>
    dictationUnavailable.value || dictationBusy.value || isVoiceModeOpen.value
);
const dictationButtonLabel = computed<string>(() => {
  if (isVoiceModeOpen.value) return 'Завершите голосовой разговор для диктовки';
  if (dictationPhase.value === 'starting') return 'Подключаю диктовку';
  if (dictationPhase.value === 'recording') return 'Завершить диктовку';
  if (dictationBusy.value) return 'Обрабатываю диктовку';
  if (dictationUnavailable.value)
    return 'Диктовка недоступна без связи с Чатом';

  return 'Начать диктовку';
});

const appendToDraft = (text: string): void => {
  const html = `<p>${getMessageHtml(text)}</p>`;
  draft.value = stripHtml(draft.value).trim() ? draft.value + html : html;
};

const clearDictation = (): void => {
  dictation?.cancel();
  dictation = undefined;
  dictationPhase.value = undefined;
};

const toggleDictation = (): void => {
  if (dictationDisabled.value) return;
  if (dictation) {
    void dictation.finish();
    return;
  }

  const socket = getChatSDK()?.getDictationSocket();
  if (!socket) {
    dictationFailures.value[dictationKey.value] = {
      message: 'Диктовка недоступна без связи с Чатом.',
      text: dictationFailure.value?.text ?? ''
    };
    return;
  }

  const key = dictationKey.value;
  dictationPhase.value = 'starting';
  const recording = new Dictation(socket, responseMode.value, {
    phase: phase => {
      dictationPhase.value = phase;
    },
    complete: (text, error): void => {
      if (dictation !== recording) return;

      clearDictation();
      if (dictationKey.value !== key) return;

      if (error) {
        dictationFailures.value[key] = {
          message: error,
          text: text || dictationFailure.value?.text || ''
        };
      } else {
        delete dictationFailures.value[key];
      }
      if (text) {
        appendToDraft(text);
        focusComposer();
      }
    }
  });
  dictation = recording;
  void recording.start();
};

watch(dictationUnavailable, unavailable => {
  if (
    unavailable &&
    (dictationPhase.value === 'starting' || dictationPressed.value)
  )
    dictation?.interrupt();
});
watch(dictationKey, clearDictation, { flush: 'sync' });
watch(
  isVoiceModeOpen,
  open => {
    if (open) clearDictation();
  },
  { flush: 'sync' }
);

const composerDrafts = new Map<string, ComposerDraft>();
const composerSubmissions = new Map<string, { key: string }>();
let selectingSubmissionSession: { key: string } | undefined;

/** Возвращает непринятые файлы штатному редактору только в их исходном чате. */
const restoreComposerFiles = async (key: string) => {
  await nextTick();
  if (
    !isAssistantMounted ||
    composerKey.value !== key ||
    !contentEditorRef.value
  )
    return;
  const saved = composerDrafts.get(key);
  if (!saved || (!saved.files.length && !saved.mediaFiles.length)) return;
  for (const kind of ['files', 'mediaFiles'] as const) {
    if (
      !isAssistantMounted ||
      composerKey.value !== key ||
      !contentEditorRef.value
    )
      return;
    const files = [...saved[kind]];
    if (!files.length) continue;
    try {
      await contentEditorRef.value.queueAttachFiles(
        files,
        kind === 'mediaFiles'
      );
      saved[kind].splice(0, files.length);
    } catch (error) {
      showErrorNotification(error);
      return;
    }
  }
};
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
    type:
      message.projectFiles?.length &&
      attachment.contentType.startsWith('image/')
        ? MediaType.Image
        : MediaType.File,
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
  triggerBrowserDownload(
    getFullMediaPath(media, false),
    media.originName || 'file'
  );
};

type VoiceAssistantState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'error';
type AiAvatarExpression = 'standard' | 'thinking' | 'sad' | 'happy' | 'love';

const voiceAssistantState = ref<VoiceAssistantState>('idle');
const voiceQueueNotice = ref('');
const voiceAssistantExpression = ref<AiAvatarExpression>('standard');
let voiceConversation: VoiceConversation | undefined;
const voiceActionFeedback = new VoiceActionFeedback();

/** Открывает голосовой режим непосредственно из пользовательского клика. */
const openVoiceMode = (): void => {
  startVoiceCall();
};

/** Сворачивает окно, сохраняя активный голосовой разговор. */
const hideVoiceMode = (): void => {
  hideVoiceCall();
  focusComposer();
};

useBackButtonHandler(
  () => isVoiceModeOpen.value && isVoiceModalVisible.value,
  hideVoiceMode,
  BackButtonPriority.overlay
);

/** Закрывает голосовой режим и освобождает микрофон и воспроизведение. */
const closeVoiceMode = (): void => {
  voiceConversation?.stop();
  voiceConversation = undefined;
  stopVoiceCall();
  setVoicePresentation('idle');
  focusComposer();
};

const toggleVoiceMicrophone = (): void => {
  isVoiceMuted.value = !isVoiceMuted.value;
  voiceConversation?.mute(isVoiceMuted.value);
};

const startVoiceConversation = async (): Promise<void> => {
  voiceConversation?.stop();
  const conversation = new VoiceConversation({
    send: async (text, options): Promise<string | null> => {
      return sendMessage(text, [], undefined, undefined, undefined, options);
    },
    isBusy: (): boolean => isThinking.value,
    notice: (text): void => {
      voiceQueueNotice.value = text;
    },
    state: setVoicePresentation,
    error: (error): void => showErrorNotification(getVoiceErrorMessage(error)),
    ended: (): void => {
      if (voiceConversation === conversation) closeVoiceMode();
    }
  });
  voiceConversation = conversation;

  try {
    await conversation.start();
  } catch (error) {
    if (voiceConversation !== conversation) return;
    closeVoiceMode();
    showErrorNotification(getVoiceErrorMessage(error));
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
    ? 'Запрашивать разрешение'
    : 'Автоматически подтверждать'
);
const formatConversationDate = (timestamp?: number): string =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long'
  }).format(new Date(timestamp ?? Date.now()));

const isNewConversationDay = (
  message: AiAssistantMessage,
  previous?: AiAssistantMessage
): boolean =>
  !previous ||
  new Date(message.timestamp ?? Date.now()).toDateString() !==
    new Date(previous.timestamp ?? Date.now()).toDateString();

/** Возвращает фокус, не меняя выделение пользователя в уже активном редакторе. */
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
        if (!editor.isDestroyed && !editor.view.hasFocus()) {
          // Кадр уже наступил: второй отложенный focus может сбросить новое выделение.
          editor.commands.setTextSelection(editor.state.doc.content.size);
          editor.view.focus();
        }
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

const closeEmojiPicker = (root: HTMLElement): boolean => {
  const openPicker = Array.from(
    root.querySelectorAll<HTMLElement>('.smile-button .emoji-picker--open')
  ).find(picker => picker.getClientRects().length > 0);

  const trigger = openPicker?.closest<HTMLButtonElement>('.smile-button');
  if (!trigger) return false;
  runMenuSync(() => trigger.click());
  return true;
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
    composerSettingsRef.value?.close();
    closeEmojiPicker(root);
    return;
  }

  if (target.closest('.smile-button') && !target.closest('.emoji-picker')) {
    isPermissionMenuOpen.value = false;
    composerSettingsRef.value?.close();
    closeAttachmentPopover(root);
    return;
  }

  if (target.closest('.ai-assistant__permission-trigger')) {
    composerSettingsRef.value?.close();
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

  const container = scrollRef.value;
  const messageElement = Array.from(
    container?.querySelectorAll<HTMLElement>('[data-message-id]') || []
  ).find(element => element.dataset.messageId === messageId);

  if (!messageElement || !container) {
    highlightedMessageId.value = null;
    return false;
  }

  const messageBounds = messageElement.getBoundingClientRect();
  container.scrollTo({
    top:
      container.scrollTop +
      messageBounds.top -
      container.getBoundingClientRect().top -
      (container.clientHeight - messageBounds.height) / 2,
    behavior
  });
  messageHighlightTimeoutId = window.setTimeout(() => {
    if (highlightedMessageId.value === messageId) {
      highlightedMessageId.value = null;
    }
    messageHighlightTimeoutId = null;
  }, 3400);

  return true;
};

watch(
  [pendingMessageNavigation, () => activeSession.value?.messages],
  async (): Promise<void> => {
    const target = pendingMessageNavigation.value;
    if (!target || target.sessionId !== activeSessionId.value) return;
    const message = activeSession.value?.messages.find(
      item => item.nativeId === target.messageId
    );
    if (message && (await navigateToAiMessage(message.id)))
      pendingMessageNavigation.value = null;
  },
  { immediate: true }
);

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

useBackButtonHandler(
  () => route.value.type === RouteTypes.AI,
  () => {
    if (assistantRoot.value && closeEmojiPicker(assistantRoot.value)) return;
    if (isSelectionMode.value) clearMessageSelection();
    else navigateBackFromChat(route.value);
  },
  BackButtonPriority.navigation
);

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
  replyMessage.value = message.replyTo
    ? { role: message.replyTo.role, text: message.replyTo.content }
    : null;
  draft.value = message.text;
  focusComposer();
};

/** Отменяет редактирование AI-сообщения. */
const cancelMessageEdit = (): void => {
  editingMessage.value = null;
  replyMessage.value = null;
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
const handleForwardTopic = async (topic: ITopic): Promise<void> => {
  if (forwardMessages.value.length === 0) return;
  if (!activeSessionId.value) return;
  const threadId = activeSessionId.value;
  const messages = [...forwardMessages.value];
  if (activeSession.value?.kind === 'agent') {
    openMessageDraft(topic, formatForwardDraft(messages));
    closeForwardModal();
    clearMessageSelection();
    return;
  }
  try {
    const { fetchAiConversationInfo } = await import(
      '../../services/aiConversationInfo'
    );
    const info = await fetchAiConversationInfo(threadId);
    if (!forwardModalOpen.value || activeSessionId.value !== threadId) return;
    openMessageDraft(topic, formatForwardDraft(messages), {
      threadId: info.threadId,
      ownerId: info.ownerId,
      organizationId: info.organizationId,
      title: info.title || activeSession.value?.title || 'СЭПи'
    });
  } catch {
    showErrorNotification(
      'Не удалось проверить исходный ИИ-диалог. Повторите пересылку позже.'
    );
    return;
  }
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
    const task = visibleActionTasks.value.get(messageId);
    if (task?.status === 'waiting_approval') {
      if (voiceConversation) voiceActionFeedback.track(task.id);
      await resolveActionTask(
        task.id,
        state === 'approved' ? 'approve' : 'cancel'
      );
    } else {
      if (voiceConversation)
        await voiceConversation.respond(options =>
          updateApproval(messageId, state, options)
        );
      else await updateApproval(messageId, state);
    }
  } finally {
    focusComposer();
  }
};

/** Удаляет подтверждённые сообщения; отказ сервера не подменяется локальным успехом. */
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

/** Останавливает недопустимый выбор ещё до добавления файлов в редактор. */
const validateAttachmentSelection = (event: Event): void => {
  const files =
    event instanceof DragEvent
      ? event.dataTransfer?.files
      : event instanceof ClipboardEvent
        ? event.clipboardData?.files
        : event.target instanceof HTMLInputElement &&
            event.target.type === 'file'
          ? event.target.files
          : undefined;
  if (!files?.length) return;
  try {
    validateAiAttachments(Array.from(files));
  } catch (error) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.target instanceof HTMLInputElement) event.target.value = '';
    showErrorNotification(
      error instanceof Error
        ? error.message
        : 'Не удалось проверить вложения. Выберите файлы заново.'
    );
  }
};

const handleSend = async (
  payload?: IContentEditorSendPayload
): Promise<void> => {
  const value = stripHtml(payload?.content ?? draft.value);
  const submittedForwardDraft = activeForwardDraft.value;
  const submittedHtml = draft.value;
  const submittedReply = replyMessage.value;
  const editedMessage = editingMessage.value;
  const regularFiles = payload?.files ? Array.from(payload.files) : [];
  const mediaFiles = payload?.mediaFiles ? Array.from(payload.mediaFiles) : [];
  const files = [...mediaFiles, ...regularFiles];
  if (!value && files.length === 0 && !submittedForwardDraft) return;
  const attempt = { key: composerKey.value };
  const keepFiles = () => {
    const saved = composerDrafts.get(attempt.key) ?? {
      html: submittedHtml,
      reply: submittedReply,
      editing: editedMessage,
      files: [],
      mediaFiles: []
    };
    saved.files.push(...regularFiles);
    saved.mediaFiles.push(...mediaFiles);
    composerDrafts.set(attempt.key, saved);
    return restoreComposerFiles(attempt.key);
  };
  if (isUploadingAttachments.value) {
    await keepFiles();
    return;
  }
  let accepted = false;
  const releaseBusy = () => {
    if (composerSubmissions.get(attempt.key) === attempt)
      composerSubmissions.delete(attempt.key);
    isUploadingAttachments.value = composerSubmissions.has(composerKey.value);
  };
  const onAccepted = () => {
    accepted = true;
    releaseBusy();
    // Пользователь мог дописать новый текст во время подготовки. Не затираем его.
    if (isAssistantMounted && composerKey.value === attempt.key) {
      if (
        draft.value === submittedHtml &&
        replyMessage.value === submittedReply &&
        editingMessage.value === editedMessage &&
        activeForwardDraft.value === submittedForwardDraft
      ) {
        draft.value = '';
        if (replyMessage.value === submittedReply) replyMessage.value = null;
        if (editingMessage.value === editedMessage) editingMessage.value = null;
      }
      void scrollToBottom();
    } else {
      const saved = composerDrafts.get(attempt.key);
      if (
        saved?.html === submittedHtml &&
        saved.reply === submittedReply &&
        saved.editing === editedMessage
      ) {
        saved.html = '';
        saved.reply = null;
        saved.editing = null;
      }
    }
    if (
      submittedForwardDraft &&
      pendingAiForwardDraft.value === submittedForwardDraft
    )
      clearAiForwardDraft(submittedForwardDraft.sessionId);
  };
  composerSubmissions.set(attempt.key, attempt);
  isUploadingAttachments.value = true;
  try {
    if (activeView.value === 'agents') {
      if (
        isChoosingAgentDirectory.value ||
        activeAgentChat.value?.busy ||
        isThinking.value
      )
        return;

      if (!activeAgentChat.value?.connected && !activeSession.value?.project) {
        const connected = await chooseAgentDirectory((activate): void => {
          selectingSubmissionSession = attempt;
          try {
            activate();
          } finally {
            selectingSubmissionSession = undefined;
          }
        });
        if (
          !connected?.connected ||
          !isAssistantMounted ||
          activeView.value !== 'agents' ||
          activeSessionId.value !== connected.id
        )
          return;
      }

      const text = submittedForwardDraft
        ? [submittedForwardDraft.context, value].filter(Boolean).join('\n\n')
        : value;
      await sendAgentMessage(
        text,
        files,
        submittedReply
          ? { role: submittedReply.role, content: submittedReply.text }
          : undefined,
        onAccepted,
        editedMessage?.id
      );
      return;
    }
    const attachments = files.length > 0 ? await stageAiAttachments(files) : [];
    if (!isAssistantMounted || composerKey.value !== attempt.key) return;
    const replyTo = submittedReply
      ? {
          role: submittedReply.role,
          content: submittedReply.text
        }
      : undefined;
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
    let request: Promise<unknown>;
    selectingSubmissionSession = attempt;
    try {
      request = editedMessage
        ? editMessageAndResend(
            editedMessage.id,
            visibleValue,
            attachments,
            replyTo,
            onAccepted
          )
        : sendMessage(
            visibleValue,
            attachments,
            replyTo,
            modelValue,
            onAccepted
          );
    } finally {
      selectingSubmissionSession = undefined;
    }
    await request;
  } catch (error) {
    showErrorNotification(
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Не удалось отправить сообщение.'
    );
  } finally {
    releaseBusy();
    if (!accepted) await keepFiles();
    if (composerKey.value === attempt.key) focusComposer();
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
  composerSettingsRef.value?.close();
  isPermissionMenuOpen.value = !isPermissionMenuOpen.value;
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
      selectSession(sessionId);
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
  navigateToAI(view !== 'tasks' ? sessionId : null);
});

watch(
  composerKey,
  (key, previousKey) => {
    if (selectingSubmissionSession?.key === previousKey) {
      composerSubmissions.delete(previousKey);
      selectingSubmissionSession.key = key;
      composerSubmissions.set(key, selectingSubmissionSession);
    } else {
      const previous = composerDrafts.get(previousKey);
      composerDrafts.set(previousKey, {
        html: draft.value,
        reply: replyMessage.value,
        editing: editingMessage.value,
        files: previous?.files ?? [],
        mediaFiles: previous?.mediaFiles ?? []
      });
      const saved = composerDrafts.get(key);
      draft.value = saved?.html ?? '';
      replyMessage.value = saved?.reply ?? null;
      editingMessage.value = saved?.editing ?? null;
      void restoreComposerFiles(key);
    }
    isUploadingAttachments.value = composerSubmissions.has(key);
    closeMessageContextMenu();
    closePinnedMessageUnpinModal();
    clearMessageHighlight();
    clearMessageSelection();
    currentPinnedMessageId.value = null;
    pendingDeleteMessageIds.value = [];
    isNearBottom.value = true;
    void scrollToBottom();
  },
  { flush: 'sync' }
);

watch(
  [
    () => visibleMessages.value.length,
    () => visibleMessages.value.at(-1)?.text,
    preparationStatus,
    liveWorkEntries,
    () => Boolean(agentProgressDetail.value),
    isThinking,
    visibleActionTasks,
    conversationError
  ],
  () => {
    if (isNearBottom.value) void scrollToBottom();
  }
);

// Первый голосовой запрос создаёт диалог из пустого экрана; остальные переходы завершают звонок.
watch(
  activeSessionId,
  (id, previous) => {
    if (previous && id !== previous && isVoiceModeOpen.value) closeVoiceMode();
  },
  { flush: 'sync' }
);

watch(isVoiceModeOpen, (isOpen, wasOpen) => {
  if (!isOpen) {
    voiceActionFeedback.clear();
    voiceConversation?.stop();
    voiceConversation = undefined;
    return;
  }
  if (wasOpen) return;

  isVoiceMuted.value = false;
  void startVoiceConversation();
});

watch(visibleActionTasks, tasks => {
  const conversation = voiceConversation;
  if (!conversation) return;
  const replies = voiceActionFeedback.update(tasks.values());
  if (replies.length)
    void conversation.respond(async (): Promise<string> => replies.join(' '));
});

watch(
  () => activeSearchTarget.value?.requestId,
  async () => {
    const target = activeSearchTarget.value;
    if (!target || target.sessionId !== activeSessionId.value) return;
    await navigateToAiMessage(target.messageId, 'auto');
  },
  { flush: 'post' }
);

onMounted(() => {
  isAssistantMounted = true;
  window.addEventListener('focus', refreshResponseModelNames);
  document.addEventListener('change', handleComposerFileChange, true);
  focusComposer();
});

onBeforeUnmount(() => {
  clearDictation();
  isAssistantMounted = false;
  window.removeEventListener('focus', refreshResponseModelNames);
  catalogRequest?.abort();
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
