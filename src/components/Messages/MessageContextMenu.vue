<template>
  <ContextMenu
    :class="[
      'message-context-menu',
      { 'message-context-menu--emoji-picker': showEmojies }
    ]"
    :visible="!!props.isOpen[props.messageId]"
    :position="contextMenuPosition"
    :fixed-position="showEmojies"
    @unmount-close="handleClosePopover"
    :data-testid="`${props.dataTestid}-MessageBubble-ContextMenu`"
  >
    <template v-if="isSelectionContextMenu">
      <Button
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click.stop="handleOpenForwardModal"
        :data-testid="`${props.dataTestid}-MessageBubble-SelectionForwardButton`"
      >
        <ForwardIcon /> Переслать
      </Button>

      <Button
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click.stop="handleCancelSelection"
        :data-testid="`${props.dataTestid}-MessageBubble-SelectionCancelButton`"
      >
        <SelectIcon /> Отменить выбор
      </Button>

      <Button
        v-if="isAllDeletableSelectedMessages"
        class="red-context-button"
        :type="ButtonTypeEnum.popover"
        :size="SizesEnum.small"
        @click.stop="handleOpenDeleteModal"
        :data-testid="`${props.dataTestid}-MessageBubble-SelectionDeleteButton`"
      >
        <Icon :name="IconNameEnum.deleteSmall" /> Удалить
      </Button>
    </template>

    <EmojiPickerPanel
      ref="reactionRow"
      :class="[
        'message-context-menu__emoji-picker',
        {
          'message-context-menu__emoji-picker--ready': emojiPickerReady,
          [`message-context-menu__emoji-picker--origin-${emojiPickerOrigin}`]: true
        }
      ]"
      v-on-click-outside="toggleShowEmojies"
      v-else-if="showEmojies"
      @select="handleSelectEmoji"
    />

    <template v-else-if="isMobile && showReadDetails">
      <div
        class="message-context-menu__mobile-details"
        :style="{ paddingTop: `${mobileReadDetailsOffsetTop}px` }"
      >
        <div
          class="message-context-menu__mobile-back"
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          @click.stop="handleBackToMenu"
          :data-testid="`${props.dataTestid}-MessageBubble-DetailsBackButton`"
        >
          <span class="message-context-menu__mobile-back-content">
            <Button
              class="message-context-menu__mobile-back-button"
              :type="ButtonTypeEnum.popover"
              :size="SizesEnum.small"
              @click.stop="handleBackToMenu"
              :data-testid="`${props.dataTestid}-MessageBubble-DetailsBackButton`"
            >
              <Icon :name="IconNameEnum.arrowLeft" :width="20" :height="20" />
            </Button>
          </span>
          <span>Просмотрено</span>

          <Icon
            :name="IconNameEnum.read"
            :data-testid="`${dataTestid}-ReadIcon`"
            color="var(--text-link)"
            :width="20"
            :height="20"
          />
        </div>

        <div
          v-if="readDetails.length"
          class="message-context-menu__details-list"
        >
          <div
            v-for="reader in readDetails"
            :key="reader.userId"
            :class="[
              'message-context-menu__details-item',
              {
                'message-context-menu__details-item--interactive':
                  canOpenUserInfo(reader.user)
              }
            ]"
            @click.stop="handleOpenReadDetailUser(reader.user)"
          >
            <CachedAvatar
              class="message-context-menu__details-avatar"
              :path="reader.avatarPath"
              :initials="reader.avatarInitials"
              :alt="reader.name"
            />

            <div class="message-context-menu__details-meta">
              <div class="message-context-menu__details-name">
                {{ reader.name }}
              </div>
              <div class="message-context-menu__details-time">
                <span class="message-context-menu__details-date">
                  {{ reader.readAtDateLabel }}
                </span>
                <span class="message-context-menu__details-time-value">
                  {{ reader.readAtTimeLabel }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="message-context-menu__details-empty">
          Никто еще не просмотрел сообщение
        </div>
      </div>
    </template>

    <template v-else>
      <template v-if="canRetryMessage">
        <Button
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          @click.stop="handleRetryUpload"
          :data-testid="`${props.dataTestid}-MessageBubble-RetryButton`"
        >
          <RetryIcon /> Отправить повторно
        </Button>

        <Button
          class="red-context-button"
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          @click.stop="handleOpenDeleteModal"
          :data-testid="`${props.dataTestid}-MessageBubble-DeleteButton`"
        >
          <Icon :name="IconNameEnum.deleteSmall" /> Удалить
        </Button>
      </template>

      <template v-else>
        <div
          class="select-reactions"
          ref="reactionRow"
          :class="{
            'select-reactions--flip': flipReactions,
            'select-reactions--flip-y': flipReactionsY,
            'select-reactions--ready': reactionsPositionReady
          }"
        >
          <div
            v-for="value in quickReactonList"
            :key="value"
            @click.stop="handleReactMessage(value)"
            class="select-reactions-item"
            v-emoji
          >
            {{ value }}
          </div>
          <div>
            <Button
              class="select-reactions-list-button"
              :type="ButtonTypeEnum.primary"
              :size="SizesEnum.little"
              @click="toggleShowEmojies"
            >
              <Icon
                :name="IconNameEnum.plus"
                :data-testid="`${props.dataTestid}-Reaction-PlusIcon`"
              />
            </Button>
          </div>
        </div>

        <Button
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          @click.stop="handleReplyMessage"
          :data-testid="`${props.dataTestid}-MessageBubble-ReplyButton`"
        >
          <ReplyIcon /> {{ replyButtonLabel }}
        </Button>

        <Button
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          @click.stop="handleOpenForwardModal"
          :data-testid="`${props.dataTestid}-MessageBubble-ForwardButton`"
        >
          <ForwardIcon /> Переслать
        </Button>

        <Button
          v-if="
            props.isMeSender &&
            !!props.message &&
            !getMessageSticker(props.messageEx, props.media)
          "
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          @click.stop="handleEditMessage"
          :data-testid="`${props.dataTestid}-MessageBubble-EditButton`"
        >
          <EditIcon /> Редактировать
        </Button>

        <Button
          v-if="canCopyContent"
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          @click.stop="handleCopyContent"
          :data-testid="`${props.dataTestid}-MessageBubble-CopyContentButton`"
        >
          <CopyIcon /> {{ copyContentLabel }}
        </Button>

        <Button
          v-else-if="!copyContent && !!props.message && !messageSticker"
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          @click.stop="handleCopyMessage"
          :data-testid="`${props.dataTestid}-MessageBubble-CopyButton`"
        >
          <CopyIcon /> Копировать текст
        </Button>

        <Button
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          @click.stop="handlePinMessage"
          :data-testid="`${props.dataTestid}-MessageBubble-PinButton`"
        >
          <template v-if="!props.isPin"> <PinIcon /> Закрепить </template>
          <template v-else> <UnpinIcon /> Открепить </template>
        </Button>

        <Button
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          @click.stop="handleSelectMessage"
          :data-testid="`${props.dataTestid}-MessageBubble-SelectButton`"
        >
          <SelectIcon />
          Выбрать
        </Button>

        <Button
          v-if="hasDownloadableMedia"
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          @click.stop="handleDownloadMessageMedia"
          :data-testid="`${props.dataTestid}-MessageBubble-DownloadButton`"
        >
          <Icon :name="IconNameEnum.download" />
          Скачать
        </Button>

        <Button
          v-if="canShowMessageDetails"
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          ref="detailsTriggerRef"
          class="message-context-menu__details-trigger"
          :class="{
            'message-context-menu__details-trigger--active': showReadDetails
          }"
          @click.stop="toggleReadDetails"
          @mouseenter="handleHoverReadDetails"
          @mouseleave="handleLeaveReadDetails"
          @focus="handleHoverReadDetails"
          :data-testid="`${props.dataTestid}-MessageBubble-DetailsButton`"
        >
          <span class="message-context-menu__details-trigger-content">
            <span class="message-context-menu__details-trigger-label">
              <Icon :name="IconNameEnum.info" />
              <span>Данные</span>
            </span>
            <Icon :name="IconNameEnum.chevronRight" />
          </span>
        </Button>

        <div
          v-if="showReadDetails && !isMobile"
          ref="detailsPanelRef"
          class="message-context-menu__details-panel"
          :class="{
            'message-context-menu__details-panel--flip': flipReadDetails
          }"
          :style="{ top: `${readDetailsOffsetTop}px` }"
          @mouseenter="handleHoverReadDetails"
          @mouseleave="handleLeaveReadDetails"
        >
          <div class="message-context-menu__details-title">
            Просмотрено
            <Icon
              :name="IconNameEnum.read"
              :data-testid="`${dataTestid}-ReadIcon`"
              color="var(--text-link)"
              :width="20"
              :height="20"
            />
          </div>

          <div
            v-if="readDetails.length"
            class="message-context-menu__details-list"
          >
            <div
              v-for="reader in readDetails"
              :key="reader.userId"
              :class="[
                'message-context-menu__details-item',
                {
                  'message-context-menu__details-item--interactive':
                    canOpenUserInfo(reader.user)
                }
              ]"
              @click.stop="handleOpenReadDetailUser(reader.user)"
            >
              <CachedAvatar
                class="message-context-menu__details-avatar"
                :path="reader.avatarPath"
                :initials="reader.avatarInitials"
                :alt="reader.name"
              />

              <div class="message-context-menu__details-meta">
                <div class="message-context-menu__details-name">
                  {{ reader.name }}
                </div>
                <div class="message-context-menu__details-time">
                  <span class="message-context-menu__details-date">
                    {{ reader.readAtDateLabel }}
                  </span>
                  <span class="message-context-menu__details-time-value">
                    {{ reader.readAtTimeLabel }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <Button
          v-if="props.isMeSender"
          class="red-context-button"
          :type="ButtonTypeEnum.popover"
          :size="SizesEnum.small"
          @click.stop="handleOpenDeleteModal"
          :data-testid="`${props.dataTestid}-MessageBubble-DeleteButton`"
        >
          <Icon :name="IconNameEnum.deleteSmall" /> Удалить
        </Button>
      </template>
    </template>
  </ContextMenu>

  <PinConfirmModal
    :open="pinModalOpen"
    title="Закрепить сообщение"
    description="Вы уверены, что хотите закрепить это сообщение?"
    scope-label="Закрепить у всех в чате"
    :pin-for-everyone="pinForEveryone"
    @update:pin-for-everyone="pinForEveryone = $event"
    @unmount-close="handleClosePinModal"
    @unmount-confirm="handleConfirmPinMessage"
  />

  <ConfirmModal
    :open="deleteModalOpen"
    :title="deleteModalTitle"
    :description="deleteModalDescription"
    @unmount-close="handleCloseDeleteModal"
    @unmount-confirm="handleDeleteMessage"
  />

  <ConfirmModal
    :open="unpinModalOpen"
    title="Открепить сообщение"
    description="Вы уверены, что хотите открепить сообщение?"
    @unmount-close="handleCloseUnpinModal"
    @unmount-confirm="handleConfirmUnpinMessage"
  />

  <ForwardModal
    :open="forwardModalOpen"
    @unmount-close="handleCloseForwardModal"
    @unmount-select-topic="handleForwardMessage"
    @unmount-select-ai-session="handleForwardMessageToAi"
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
  ref,
  shallowRef,
  watch
} from 'vue';
import {
  Button,
  ButtonTypeEnum,
  EmojiPickerPanel,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';

import ContextMenu from '../ContactList/ContextMenu.vue';
import ConfirmModal from '../UI/ConfirmModal.vue';
import PinConfirmModal from '../UI/PinConfirmModal.vue';
import CachedAvatar from '../UI/CachedAvatar.vue';
import ReplyIcon from '../UI/ReplyIcon.vue';
import EditIcon from '../UI/EditIcon.vue';
import { getMessageSticker } from '../../utils/stickers';
import {
  createChatClipboardContent,
  writeChatClipboardContent,
  canCopyChatMedia,
  usesNativeChatMediaClipboard,
  type PreparedChatClipboardMedia
} from '../../utils/chat-clipboard';
import { prepareChatClipboardMedia } from '../../services/chat-clipboard-media';
import { useMessageMedia } from './composables/useMessageMedia';
import { showErrorNotification } from '../../composables/useNotifications';
import { MediaType } from '@pksep/zod-shared-chat';
import PinIcon from '../UI/PinIcon.vue';
import UnpinIcon from '../UI/UnpinIcon.vue';
import CopyIcon from '../UI/CopyIcon.vue';
import ForwardIcon from '../UI/ForwardIcon.vue';
import ForwardModal from './ForwardModal.vue';
import SelectIcon from '../UI/SelectIcon.vue';
import RetryIcon from '../UI/RetryIcon.vue';

import { stripHtml } from '../../utils/stripHtml';
import {
  normalizeReplyQuoteText,
  normalizeReplyQuoteWhitespace
} from '../../utils/messageReplyQuote';
import { MAX_W_MD } from '../../utils/constants';
import { getAuthUser } from '../../composables/useAuth';
import { closeActivePopover } from '../../composables/useContextMenu';
import { getSelectedTopic } from '../../composables/useTopics';
import { useResizeState } from '../../composables/useResizeState';
import { getUserById } from '../../composables/useUsers';
import {
  clearSelectedMessages,
  enterMessageSelection,
  useSelectedMessages
} from '../../composables/useSelectedMessages';
import { openForwardDraft } from '../../composables/useForwardMessages';
import { openAiForwardDraft } from '../../composables/useAiForwardDraft';
import type { AiAssistantSession } from '../../composables/useAiAssistant';
import { useUserInfoModal } from '../../composables/useUserInfoModal';
import {
  deleteMessageChat,
  setReactionMessage,
  togglePinMessageChat
} from '../../services/useChat';
import {
  editMessageFromLocal,
  deleteMessageFromLocal,
  getMessagesByTopicId,
  isMessagePinnedOnlyForMe,
  pinMessageOnlyForMe,
  unpinLocalMessageForMe
} from '../../services/useMessages';

import type { ITopic } from '../interfaces/interfaces';
import type { IMessageContextMenu } from './interface/interface';
import { MessageStatus, TopicType } from '../../services/useChatSDK/types';

const props = withDefaults(defineProps<IMessageContextMenu>(), {
  dataTestid: 'MessageContextMenu'
});
const { openUserInfo, canOpenUserInfo } = useUserInfoModal();

const emits = defineEmits([
  'unmount-edit-message-id',
  'unmount-reply-message-id',
  'unmount-forward-message',
  'unmount-retry-message-id',
  'unmount-download-message-media'
]);

const quickReactonList = computed(() => ['❤️', '🔥', '👍', '😂', '👌', '😭']);
const { state: isMobile } = useResizeState(MAX_W_MD);
const messages = computed(() =>
  props.topicId ? getMessagesByTopicId(props.topicId) : []
);
const currentTopic = computed(() =>
  props.topicId ? getSelectedTopic(props.topicId) : undefined
);
const { getSelectedMessagesForTopic } = useSelectedMessages();

const selectedMessages = computed(() =>
  getSelectedMessagesForTopic(props.topicId).sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  )
);

const isAllDeletableSelectedMessages = computed(() => {
  const currentUserId = getAuthUser()?.id;

  return (
    selectedMessages.value.length > 0 &&
    selectedMessages.value.every(
      message => !!currentUserId && message.senderUserId === currentUserId
    )
  );
});

const isSelectionContextMenu = computed(
  () => !!props.isSelectionMode && !!props.isSelected
);
const hasDownloadableMedia = computed(() => !!props.media?.length);
const messageSticker = computed(() =>
  getMessageSticker(props.messageEx, props.media)
);
const contextMedia = computed(
  () =>
    props.media?.find(media => media.id === props.contextMediaId) ||
    (!stripHtml(props.message || '').trim() ? props.media?.[0] : undefined)
);
const copyContent = computed(() =>
  createChatClipboardContent(
    props.messageEx,
    props.media || [],
    contextMedia.value
  )
);
const copyContentLabel = computed(() => {
  const content = copyContent.value;
  if (content?.kind !== 'media') return 'Копировать стикер';
  if (content.media.type === MediaType.Image) return 'Копировать фото';
  if (content.media.type === MediaType.Video) return 'Копировать видео';
  return 'Копировать файл';
});
const { getFullMediaPath } = useMessageMedia();
const copyPreparation = shallowRef<Promise<PreparedChatClipboardMedia> | null>(
  null
);
const copyUnavailable = ref(false);
const canCopyContent = computed(
  () =>
    copyContent.value?.kind === 'sticker' ||
    (!!copyPreparation.value && !copyUnavailable.value)
);
watch(
  [copyContent, () => props.isOpen[props.messageId]],
  ([content, opened], _, onCleanup) => {
    copyPreparation.value = null;
    copyUnavailable.value = false;
    if (!opened || !content || content.kind === 'sticker') return;
    const media = messageSticker.value ? props.media?.[0] : contextMedia.value;
    if (!media || !canCopyChatMedia(media)) return;
    if (usesNativeChatMediaClipboard()) {
      // Android copies a reference through the native clipboard. Downloading
      // the complete media here is both unnecessary and caused false failures
      // in WebView before the user could press "Copy".
      copyPreparation.value = Promise.resolve({ original: new Blob() });
      return;
    }
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    const preparation = prepareChatClipboardMedia(content, controller.signal);
    copyPreparation.value = preparation;
    void preparation.catch(() => {
      if (!controller.signal.aborted) copyUnavailable.value = true;
    });
  },
  { immediate: true }
);
const isGroupTopic = computed(
  () => currentTopic.value?.type === TopicType.Group
);

const currentMessage = computed(() =>
  messages.value.find(message => message.id === props.messageId)
);

type SelectedReplyQuote = {
  text: string;
  copyText?: string;
  occurrenceIndex?: number;
};

const emptySelectedReplyQuote: SelectedReplyQuote = {
  text: ''
};

const isNodeInside = (root: HTMLElement, node: Node): boolean =>
  root === node || root.contains(node);

const countQuoteOccurrences = (value: string, quoteText: string): number => {
  if (!quoteText) {
    return 0;
  }

  let count = 0;
  let fromIndex = 0;
  let occurrenceIndex = value.indexOf(quoteText, fromIndex);

  while (occurrenceIndex >= 0) {
    count += 1;
    fromIndex = occurrenceIndex + quoteText.length;
    occurrenceIndex = value.indexOf(quoteText, fromIndex);
  }

  return count;
};

const getSelectedQuoteOccurrenceIndex = (
  root: HTMLElement,
  range: Range,
  quoteText: string
): number | undefined => {
  if (
    !isNodeInside(root, range.startContainer) ||
    !isNodeInside(root, range.endContainer)
  ) {
    return undefined;
  }

  const beforeSelectionRange = document.createRange();
  beforeSelectionRange.selectNodeContents(root);

  try {
    beforeSelectionRange.setEnd(range.startContainer, range.startOffset);
  } catch {
    return undefined;
  }

  return countQuoteOccurrences(
    normalizeReplyQuoteWhitespace(beforeSelectionRange.toString()),
    quoteText
  );
};

const selectedReplyQuote = computed<SelectedReplyQuote>(() => {
  props.isOpen[props.messageId];

  const selection = window.getSelection();
  const selectedText = normalizeReplyQuoteText(selection?.toString());

  if (!selectedText || !selection || selection.rangeCount === 0) {
    return emptySelectedReplyQuote;
  }

  const range = selection.getRangeAt(0);
  const container =
    range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? (range.commonAncestorContainer as Element)
      : range.commonAncestorContainer.parentElement;
  const messageElement = container?.closest('.message[data-message-id]');

  if (messageElement?.getAttribute('data-message-id') !== props.messageId) {
    return emptySelectedReplyQuote;
  }

  const contentElement =
    messageElement.querySelector<HTMLElement>('.message-content__html') ||
    messageElement.querySelector<HTMLElement>('.message-call__title') ||
    (messageElement as HTMLElement);

  return {
    text: selectedText,
    copyText: selection.toString(),
    occurrenceIndex: getSelectedQuoteOccurrenceIndex(
      contentElement,
      range,
      selectedText
    )
  };
});
const replyButtonLabel = computed(() =>
  selectedReplyQuote.value.text ? 'Ответить на фрагмент' : 'Ответить'
);
const isPinnedOnlyForMe = computed(
  () =>
    Boolean(currentMessage.value?.isPinnedOnlyMe) ||
    isMessagePinnedOnlyForMe(props.topicId, props.messageId)
);

const currentMessageClientId = computed(() => {
  if (!currentMessage.value?.ex) {
    return null;
  }

  try {
    const parsed = JSON.parse(currentMessage.value.ex) as {
      clientId?: string;
    };

    return typeof parsed.clientId === 'string' ? parsed.clientId : null;
  } catch {
    return null;
  }
});

const isLocalPendingMessage = computed(
  () =>
    !!currentMessage.value &&
    !!currentMessageClientId.value &&
    currentMessage.value.id === currentMessageClientId.value
);

const canRetryMessage = computed(
  () =>
    !!props.isMeSender &&
    (currentMessage.value?.status === MessageStatus.NotDelivered ||
      currentMessage.value?.status === MessageStatus.Wait ||
      isLocalPendingMessage.value ||
      !!currentMessage.value?.media?.some(media => media.uploadError))
);

const canShowMessageDetails = computed(
  () =>
    !!props.isMeSender &&
    isGroupTopic.value &&
    !isSelectionContextMenu.value &&
    !canRetryMessage.value &&
    (currentMessage.value?.messageRead || []).some(
      item =>
        !!item.userId && item.userId !== currentMessage.value?.senderUserId
    ) &&
    !!currentMessage.value
);

const formatReadDateTime = (
  value?: string | Date | null
): { dateLabel: string; timeLabel: string } => {
  if (!value) {
    return {
      dateLabel: 'Время неизвестно',
      timeLabel: ''
    };
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      dateLabel: 'Время неизвестно',
      timeLabel: ''
    };
  }

  return {
    dateLabel: new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(date),
    timeLabel: new Intl.DateTimeFormat('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date)
  };
};

const readDetails = computed(() =>
  (currentMessage.value?.messageRead || [])
    .filter(
      item =>
        !!item.userId && item.userId !== currentMessage.value?.senderUserId
    )
    .map(item => {
      const user =
        getUserById(item.userId) ||
        currentTopic.value?.members?.find(
          member => member.id === item.userId
        ) ||
        (currentTopic.value?.user?.id === item.userId
          ? currentTopic.value.user
          : undefined);
      const name = user?.initials || user?.nickname || 'Пользователь';
      const readAt = item.updatedAt || item.createdAt || null;
      const formattedReadAt = formatReadDateTime(readAt);

      return {
        userId: item.userId,
        user,
        name,
        readAtDateLabel: formattedReadAt.dateLabel,
        readAtTimeLabel: formattedReadAt.timeLabel,
        readAtMs: readAt ? new Date(readAt).getTime() : 0,
        avatarPath: user?.avatarUrl || '',
        avatarInitials: user?.initials || user?.nickname || name
      };
    })
    .sort((left, right) => left.readAtMs - right.readAtMs)
);

const deleteModalTitle = computed(() =>
  isSelectionContextMenu.value ? 'Удалить сообщения' : 'Удалить сообщение'
);

const deleteModalDescription = computed(() =>
  isSelectionContextMenu.value
    ? 'Вы уверены, что хотите удалить выбранные сообщения?'
    : 'Вы уверены, что хотите удалить сообщение для всех участников чата?'
);

const deleteModalOpen = ref(false);
const pinModalOpen = ref(false);
const pinForEveryone = ref(false);
const unpinModalOpen = ref(false);
const forwardModalOpen = ref(false);
const hasOpenActionModal = computed(
  () =>
    pinModalOpen.value ||
    deleteModalOpen.value ||
    unpinModalOpen.value ||
    forwardModalOpen.value
);
const reactionRow = ref<HTMLElement | null>(null);
const detailsTriggerRef = ref<HTMLElement | null>(null);
const detailsPanelRef = ref<HTMLElement | null>(null);
const flipReactions = ref(false);
const flipReactionsY = ref(false);
const flipReadDetails = ref(false);
const mobileReadDetailsOffsetTop = ref(0);
const readDetailsOffsetTop = ref(0);
const reactionsPositionReady = ref(false);
const showEmojies = ref(false);
const emojiPickerReady = ref(false);
const emojiPickerPosition = ref<{ x: number; y: number } | null>(null);
const emojiPickerOrigin = ref<
  'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
>('bottom-right');
const showReadDetails = ref(false);
let readDetailsHoverTimeout: ReturnType<typeof setTimeout> | null = null;
let reactionLayoutObserver: ResizeObserver | null = null;
let emojiPickerRevealFrame: number | null = null;

const EMOJI_PICKER_WIDTH = 359;
const EMOJI_PICKER_HEIGHT = 382;
const EMOJI_PICKER_VIEWPORT_GAP = 8;
const EMOJI_PICKER_TRIGGER_GAP = 5;

const contextMenuPosition = computed(() =>
  showEmojies.value && emojiPickerPosition.value
    ? emojiPickerPosition.value
    : props.position
);

const setEmojiPickerPosition = (trigger: HTMLElement): void => {
  const triggerRect = trigger.getBoundingClientRect();
  const pickerWidth = Math.min(
    EMOJI_PICKER_WIDTH,
    window.innerWidth - EMOJI_PICKER_VIEWPORT_GAP * 2
  );
  const pickerHeight = Math.min(
    EMOJI_PICKER_HEIGHT,
    window.innerHeight - EMOJI_PICKER_VIEWPORT_GAP * 2
  );
  const canOpenLeft =
    triggerRect.right - pickerWidth >= EMOJI_PICKER_VIEWPORT_GAP;
  const canOpenAbove =
    triggerRect.top - EMOJI_PICKER_TRIGGER_GAP - pickerHeight >=
    EMOJI_PICKER_VIEWPORT_GAP;
  const opensLeft =
    canOpenLeft ||
    triggerRect.left + pickerWidth >
      window.innerWidth - EMOJI_PICKER_VIEWPORT_GAP;
  const opensAbove =
    canOpenAbove ||
    triggerRect.bottom + EMOJI_PICKER_TRIGGER_GAP + pickerHeight >
      window.innerHeight - EMOJI_PICKER_VIEWPORT_GAP;
  const preferredX = opensLeft
    ? triggerRect.right - pickerWidth
    : triggerRect.left;
  const preferredY = opensAbove
    ? triggerRect.top - EMOJI_PICKER_TRIGGER_GAP - pickerHeight
    : triggerRect.bottom + EMOJI_PICKER_TRIGGER_GAP;

  emojiPickerPosition.value = {
    x: Math.min(
      Math.max(EMOJI_PICKER_VIEWPORT_GAP, preferredX),
      window.innerWidth - EMOJI_PICKER_VIEWPORT_GAP - pickerWidth
    ),
    y: Math.min(
      Math.max(EMOJI_PICKER_VIEWPORT_GAP, preferredY),
      window.innerHeight - EMOJI_PICKER_VIEWPORT_GAP - pickerHeight
    )
  };
  emojiPickerOrigin.value = opensAbove
    ? opensLeft
      ? 'bottom-right'
      : 'bottom-left'
    : opensLeft
      ? 'top-right'
      : 'top-left';
};

const resolveElement = (
  value: HTMLElement | { $el?: Element | null } | null
): HTMLElement | null => {
  if (value instanceof HTMLElement) {
    return value;
  }

  return value?.$el instanceof HTMLElement ? value.$el : null;
};

const clearReadDetailsHoverTimeout = () => {
  if (readDetailsHoverTimeout) {
    clearTimeout(readDetailsHoverTimeout);
    readDetailsHoverTimeout = null;
  }
};

const waitForPaint = async () => {
  await nextTick();
  await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
  await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
};

const disconnectReactionLayoutObserver = () => {
  reactionLayoutObserver?.disconnect();
  reactionLayoutObserver = null;
};

const cancelEmojiPickerReveal = () => {
  if (emojiPickerRevealFrame !== null) {
    cancelAnimationFrame(emojiPickerRevealFrame);
    emojiPickerRevealFrame = null;
  }
};

const revealEmojiPicker = async () => {
  cancelEmojiPickerReveal();
  emojiPickerReady.value = false;
  await nextTick();

  emojiPickerRevealFrame = requestAnimationFrame(() => {
    emojiPickerRevealFrame = requestAnimationFrame(() => {
      emojiPickerRevealFrame = null;

      if (showEmojies.value) {
        emojiPickerReady.value = true;
      }
    });
  });
};

const ensureReactionLayoutObserver = () => {
  if (typeof ResizeObserver === 'undefined') {
    return;
  }

  const reactionElement = resolveElement(reactionRow.value);
  const menuElement = reactionElement?.closest(
    '.message-context-menu'
  ) as HTMLElement | null;

  if (!reactionElement || !menuElement) {
    return;
  }

  disconnectReactionLayoutObserver();
  reactionLayoutObserver = new ResizeObserver(() => {
    void checkFlip();
  });
  reactionLayoutObserver.observe(menuElement);
  reactionLayoutObserver.observe(reactionElement);
};

const checkFlip = async () => {
  const windowWidth = window.innerWidth;
  reactionsPositionReady.value = false;
  await waitForPaint();

  const el = resolveElement(reactionRow.value);
  if (!el) return;

  const menu = el.closest('.message-context-menu') as HTMLElement | null;
  if (!menu) return;

  const menuRect = menu.getBoundingClientRect();
  const rowWidth = el.offsetWidth;
  const rowHeight = el.offsetHeight;
  const defaultRight = menuRect.left + rowWidth;
  const defaultTop = menuRect.top - rowHeight - 5;

  flipReactions.value = defaultRight > windowWidth - 8;
  flipReactionsY.value = defaultTop < 8;
  reactionsPositionReady.value = true;
};

const initializeReactionLayout = async () => {
  await checkFlip();
  ensureReactionLayoutObserver();
};

const syncReadDetailsPosition = async () => {
  await nextTick();

  const trigger = resolveElement(detailsTriggerRef.value);
  const menu = trigger?.closest('.message-context-menu') as HTMLElement | null;

  if (!trigger || !menu) {
    return;
  }

  const triggerRect = trigger.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();

  if (isMobile.value) {
    mobileReadDetailsOffsetTop.value = Math.max(
      0,
      triggerRect.top - menuRect.top + 6
    );
    return;
  }

  const panel = resolveElement(detailsPanelRef.value);

  if (!panel) {
    return;
  }

  const panelRect = panel.getBoundingClientRect();
  const maxTop = Math.max(8, window.innerHeight - panelRect.height - 8);
  const clampedTop = Math.max(8, Math.min(triggerRect.top, maxTop));

  readDetailsOffsetTop.value = clampedTop - menuRect.top;
  flipReadDetails.value =
    triggerRect.right + panelRect.width + 12 > window.innerWidth;
};

watch(
  () => props.isOpen[props.messageId],
  opened => {
    if (opened) {
      void initializeReactionLayout();

      if (showReadDetails.value) {
        void syncReadDetailsPosition();
      }

      return;
    }

    showReadDetails.value = false;
    mobileReadDetailsOffsetTop.value = 0;
    reactionsPositionReady.value = false;
    disconnectReactionLayoutObserver();
    flipReactions.value = false;
    flipReactionsY.value = false;
  },
  { immediate: true }
);

watch(showReadDetails, opened => {
  if (opened) {
    void syncReadDetailsPosition();
  }
});

watch(showEmojies, opened => {
  if (opened) {
    void revealEmojiPicker();
    return;
  }

  cancelEmojiPickerReveal();
  emojiPickerReady.value = false;
});

const handleOpenDeleteModal = () => {
  deleteModalOpen.value = true;
};

const handleCloseDeleteModal = () => {
  deleteModalOpen.value = false;
  closePopoverState();
};

const handleOpenUnpinModal = () => {
  unpinModalOpen.value = true;
};

const handleCloseUnpinModal = () => {
  unpinModalOpen.value = false;
  closePopoverState();
};

const handleOpenPinModal = () => {
  pinForEveryone.value = true;
  pinModalOpen.value = true;
};

const handleClosePinModal = () => {
  pinModalOpen.value = false;
  pinForEveryone.value = true;
  closePopoverState();
};

const handleOpenForwardModal = () => {
  forwardModalOpen.value = true;
};

const handleCloseForwardModal = () => {
  forwardModalOpen.value = false;
  closePopoverState();
};

const handleDeleteMessage = async (): Promise<void> => {
  if (isSelectionContextMenu.value) {
    if (!isAllDeletableSelectedMessages.value) {
      handleCloseDeleteModal();
      handleClosePopover();
      return;
    }

    const messagesToDelete = [...selectedMessages.value];

    for (const message of messagesToDelete) {
      deleteMessageFromLocal(message.topicId, message.id);
    }

    for (const message of messagesToDelete) {
      void deleteMessageChat({
        messageId: message.id,
        topicId: message.topicId
      });
    }

    clearSelectedMessages();
    handleCloseDeleteModal();
    handleClosePopover();
    return;
  }

  if (isLocalPendingMessage.value && currentMessage.value) {
    deleteMessageFromLocal(
      currentMessage.value.topicId,
      currentMessage.value.id
    );
    handleCloseDeleteModal();
    handleClosePopover();
    return;
  }

  const deletion = {
    messageId: props.messageId,
    topicId: props.topicId
  };
  handleCloseDeleteModal();
  handleClosePopover();
  await deleteMessageChat(deletion);
};

const handleEditMessage = () => {
  emits('unmount-edit-message-id', props.messageId);
  handleClosePopover();
};

const handleReplyMessage = () => {
  emits('unmount-reply-message-id', {
    messageId: props.messageId,
    quoteText: selectedReplyQuote.value.text || undefined,
    quoteOccurrenceIndex: selectedReplyQuote.value.occurrenceIndex
  });
  handleClosePopover();
};

const handleRetryUpload = () => {
  emits('unmount-retry-message-id', props.messageId);
  handleClosePopover();
};

const handleForwardMessage = (topic: ITopic) => {
  if (isSelectionContextMenu.value) {
    openForwardDraft(topic, selectedMessages.value);
    clearSelectedMessages();
    closePopoverState();
    return;
  }

  const message = messages.value.find(
    current => current.id === props.messageId
  );

  emits('unmount-forward-message', {
    message,
    topic
  });
  closePopoverState();
};

const handleForwardMessageToAi = (session: AiAssistantSession): void => {
  const messagesToForward = isSelectionContextMenu.value
    ? selectedMessages.value
    : currentMessage.value
      ? [currentMessage.value]
      : [];

  if (messagesToForward.length > 0) {
    openAiForwardDraft(session, messagesToForward);
  }

  if (isSelectionContextMenu.value) clearSelectedMessages();
  closePopoverState();
};

const handleSelectMessage = () => {
  if (!props.topicId) {
    return;
  }

  const message = messages.value.find(item => item.id === props.messageId);

  if (!message) {
    return;
  }

  enterMessageSelection(props.topicId, message);
  handleClosePopover();
};

const handleDownloadMessageMedia = () => {
  emits('unmount-download-message-media');
  handleClosePopover();
};

const handleCancelSelection = () => {
  clearSelectedMessages();
  handleClosePopover();
};

const handleReactMessage = (emoji: string) => {
  setReactionMessage({
    messageId: props.messageId,
    emoji,
    topicId: props.topicId
  });
  handleClosePopover();
};

const handlePinMessage = async () => {
  if (props.isPin) {
    handleOpenUnpinModal();
    return;
  }

  handleOpenPinModal();
};

const handleConfirmPinMessage = async () => {
  if (pinForEveryone.value) {
    await togglePinMessageChat({
      messageId: props.messageId,
      topicId: props.topicId,
      scope: 'ALL'
    });
  } else {
    pinMessageOnlyForMe(props.topicId, props.messageId);
    await togglePinMessageChat({
      messageId: props.messageId,
      topicId: props.topicId,
      scope: 'SELF'
    });
  }

  handleClosePinModal();
  handleClosePopover();
};

const handleConfirmUnpinMessage = async () => {
  if (currentMessage.value?.isPin && !isPinnedOnlyForMe.value) {
    editMessageFromLocal(props.topicId, {
      ...currentMessage.value,
      isPin: false
    });

    await togglePinMessageChat({
      messageId: props.messageId,
      topicId: props.topicId,
      scope: 'ALL'
    });
  } else {
    unpinLocalMessageForMe(props.topicId, props.messageId);
    await togglePinMessageChat({
      messageId: props.messageId,
      topicId: props.topicId,
      scope: 'SELF'
    });
  }

  handleCloseUnpinModal();
  handleClosePopover();
};

const toggleShowEmojies = (event?: Event) => {
  if (showEmojies.value) {
    showEmojies.value = false;
    emojiPickerPosition.value = null;
    return;
  }

  const trigger = event?.currentTarget;

  if (trigger instanceof HTMLElement) {
    setEmojiPickerPosition(trigger);
  }

  showEmojies.value = true;
};

const handleHoverReadDetails = () => {
  if (isMobile.value || !canShowMessageDetails.value) {
    return;
  }

  clearReadDetailsHoverTimeout();
  showReadDetails.value = true;
};

const handleLeaveReadDetails = () => {
  if (isMobile.value) {
    return;
  }

  clearReadDetailsHoverTimeout();
  readDetailsHoverTimeout = setTimeout(() => {
    showReadDetails.value = false;
  }, 120);
};

const toggleReadDetails = () => {
  if (!canShowMessageDetails.value) {
    return;
  }

  if (isMobile.value) {
    showReadDetails.value = true;
    return;
  }

  showReadDetails.value = !showReadDetails.value;
};

const handleBackToMenu = () => {
  showReadDetails.value = false;
  mobileReadDetailsOffsetTop.value = 0;
};

useBackButtonHandler(
  () =>
    !!props.isOpen[props.messageId] &&
    (showEmojies.value || showReadDetails.value),
  () => {
    if (showEmojies.value) toggleShowEmojies();
    else handleBackToMenu();
  },
  BackButtonPriority.overlay
);

const handleOpenReadDetailUser = (user?: any) => {
  if (!user) {
    return;
  }

  openUserInfo(user);
};

const handleSelectEmoji = (emoji: { i: string }) => {
  handleReactMessage(emoji.i);
};

const handleCopyMessage = async () => {
  const selectedText = selectedReplyQuote.value.copyText;

  if (selectedText) {
    await navigator.clipboard.writeText(selectedText);
    handleClosePopover();
    return;
  }

  const textToCopy = stripHtml(props.message);

  if (textToCopy) {
    await navigator.clipboard.writeText(textToCopy);
  }

  handleClosePopover();
};

const handleCopyContent = async () => {
  const content = copyContent.value;
  if (!content || !canCopyContent.value) return;
  const sticker = messageSticker.value;
  const media = sticker ? props.media?.[0] : contextMedia.value;
  const source = sticker?.src || (media ? getFullMediaPath(media, false) : '');
  const preview =
    sticker?.previewSrc ||
    (media?.type === MediaType.Image
      ? getFullMediaPath(media, false)
      : undefined);
  try {
    await writeChatClipboardContent(
      content,
      source,
      preview,
      copyPreparation.value || undefined
    );
    handleClosePopover();
  } catch {
    copyUnavailable.value = true;
    showErrorNotification('Не удалось скопировать вложение');
  }
};

const closePopoverState = () => {
  clearReadDetailsHoverTimeout();
  disconnectReactionLayoutObserver();
  closeActivePopover(props.messageId);
  showEmojies.value = false;
  emojiPickerPosition.value = null;
  showReadDetails.value = false;
  mobileReadDetailsOffsetTop.value = 0;
  reactionsPositionReady.value = false;
  flipReactions.value = false;
  flipReactionsY.value = false;
};

const handleClosePopover = () => {
  if (hasOpenActionModal.value) {
    return;
  }

  closePopoverState();
};

onBeforeUnmount(() => {
  clearReadDetailsHoverTimeout();
  disconnectReactionLayoutObserver();
  cancelEmojiPickerReveal();
});
</script>

<style scoped>
.message-context-menu__details-item--interactive {
  cursor: pointer;
}
</style>
