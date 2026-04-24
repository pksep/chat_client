<template>
  <ContextMenu
    class="message-context-menu"
    :visible="!!props.isOpen[props.messageId]"
    :position="props.position"
    @unmount-close="handleClosePopover"
    :data-testid="`${props.dataTestid}-MessageBubble-ContextMenu`"
  >
    <template v-if="isSelectionContextMenu">
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        @click.stop="handleOpenForwardModal"
        :data-testid="`${props.dataTestid}-MessageBubble-SelectionForwardButton`"
      >
        <ForwardIcon /> Переслать
      </Button>

      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        @click.stop="handleCancelSelection"
        :data-testid="`${props.dataTestid}-MessageBubble-SelectionCancelButton`"
      >
        <SelectIcon /> Отменить выбор
      </Button>

      <Button
        v-if="isAllDeletableSelectedMessages"
        class="red-context-button"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        @click.stop="handleOpenDeleteModal"
        :data-testid="`${props.dataTestid}-MessageBubble-SelectionDeleteButton`"
      >
        <Icon :name="IconNameEnum.deleteSmall" /> Удалить
      </Button>
    </template>

    <EmojiPicker
      ref="reactionRow"
      v-on-click-outside="toggleShowEmojies"
      v-else-if="showEmojies"
      @select="handleSelectEmoji"
    />

    <template v-else>
      <template v-if="canRetryMessage">
        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click.stop="handleRetryUpload"
          :data-testid="`${props.dataTestid}-MessageBubble-RetryButton`"
        >
          <RetryIcon /> Отправить повторно
        </Button>

        <Button
          class="red-context-button"
          :type="ButtonTypeEnum.ghost"
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
          :class="{ 'select-reactions--flip': flipReactions }"
        >
          <div
            v-for="value in quickReactonList"
            :key="value"
            @click.stop="handleReactMessage(value)"
            class="select-reactions-item"
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
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click.stop="handleReplyMessage"
          :data-testid="`${props.dataTestid}-MessageBubble-ReplyButton`"
        >
          <ReplyIcon /> Ответить
        </Button>

        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click.stop="handleOpenForwardModal"
          :data-testid="`${props.dataTestid}-MessageBubble-PinButton`"
        >
          <ForwardIcon /> Переслать
        </Button>

        <Button
          v-if="!!props.message"
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click.stop="handleCopyMessage"
          :data-testid="`${props.dataTestid}-MessageBubble-CopyButton`"
        >
          <CopyIcon /> Копировать текст
        </Button>

        <Button
          v-if="props.isMeSender && !!props.message"
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click.stop="handleEditMessage"
          :data-testid="`${props.dataTestid}-MessageBubble-EditButton`"
        >
          <EditIcon /> Редактировать
        </Button>

        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click.stop="handlePinMessage"
          :data-testid="`${props.dataTestid}-MessageBubble-PinButton`"
        >
          <template v-if="!props.isPin"> <PinIcon /> Закрепить </template>
          <template v-else> <UnpinIcon /> Открепить </template>
        </Button>

        <Button
          v-if="props.isMeSender"
          class="red-context-button"
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click.stop="handleOpenDeleteModal"
          :data-testid="`${props.dataTestid}-MessageBubble-DeleteButton`"
        >
          <Icon :name="IconNameEnum.deleteSmall" /> Удалить
        </Button>

        <Button
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click.stop="handleSelectMessage"
          :data-testid="`${props.dataTestid}-MessageBubble-SelectButton`"
        >
          <SelectIcon />
          Выбрать
        </Button>
      </template>
    </template>
  </ContextMenu>

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
  />
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import EmojiPicker from 'vue3-emoji-picker';
import 'vue3-emoji-picker/css';

import ContextMenu from '../ContactList/ContextMenu.vue';
import ConfirmModal from '../UI/ConfirmModal.vue';
import ReplyIcon from '../UI/ReplyIcon.vue';
import EditIcon from '../UI/EditIcon.vue';
import PinIcon from '../UI/PinIcon.vue';
import UnpinIcon from '../UI/UnpinIcon.vue';
import CopyIcon from '../UI/CopyIcon.vue';
import ForwardIcon from '../UI/ForwardIcon.vue';
import ForwardModal from './ForwardModal.vue';
import SelectIcon from '../UI/SelectIcon.vue';
import RetryIcon from '../UI/RetryIcon.vue';

import { stripHtml } from '../../utils/stripHtml';
import { getAuthUser } from '../../composables/useAuth';
import { closeActivePopover } from '../../composables/useContextMenu';
import {
  clearSelectedMessages,
  enterMessageSelection,
  useSelectedMessages
} from '../../composables/useSelectedMessages';
import { openForwardDraft } from '../../composables/useForwardMessages';
import {
  deleteMessageChat,
  setReactionMessage,
  togglePinMessageChat
} from '../../services/useChat';
import {
  deleteMessageFromLocal,
  getMessagesByTopicId
} from '../../services/useMessages';

import type { ITopic } from '../interfaces/interfaces';
import type { IMessageContextMenu } from './interface/interface';
import { MessageStatus } from '../../services/useChatSDK/types';

const props = withDefaults(defineProps<IMessageContextMenu>(), {
  dataTestid: 'MessageContextMenu'
});

const emits = defineEmits([
  'unmount-edit-message-id',
  'unmount-reply-message-id',
  'unmount-forward-message',
  'unmount-retry-message-id'
]);

const quickReactonList = computed(() => ['♥️', '🔥', '👍', '😂', '👌', '😭']);
const messages = computed(() => getMessagesByTopicId(props.topicId));
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
const currentMessage = computed(() =>
  messages.value.find(message => message.id === props.messageId)
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

const deleteModalTitle = computed(() =>
  isSelectionContextMenu.value ? 'Удалить сообщения' : 'Удалить сообщение'
);

const deleteModalDescription = computed(() =>
  isSelectionContextMenu.value
    ? 'Вы уверены, что хотите удалить выбранные сообщения?'
    : 'Вы уверены, что хотите удалить сообщение для всех участников чата?'
);

const deleteModalOpen = ref(false);
const unpinModalOpen = ref(false);
const forwardModalOpen = ref(false);
const reactionRow = ref<HTMLElement | null>(null);
const flipReactions = ref(false);
const showEmojies = ref(false);

const checkFlip = async () => {
  const windowWidth = window.innerWidth;
  await nextTick();

  const el = reactionRow.value;
  if (!el) return;

  const rect = el.getBoundingClientRect();
  flipReactions.value = rect.right > windowWidth;
};

watch(
  () => props.isOpen[props.messageId],
  opened => {
    if (opened) checkFlip();
  }
);

const handleOpenDeleteModal = () => {
  deleteModalOpen.value = true;
};

const handleCloseDeleteModal = () => {
  deleteModalOpen.value = false;
};

const handleOpenUnpinModal = () => {
  unpinModalOpen.value = true;
};

const handleCloseUnpinModal = () => {
  unpinModalOpen.value = false;
};

const handleOpenForwardModal = () => {
  forwardModalOpen.value = true;
};

const handleCloseForwardModal = () => {
  forwardModalOpen.value = false;
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

  if (canRetryMessage.value && currentMessage.value) {
    deleteMessageFromLocal(
      currentMessage.value.topicId,
      currentMessage.value.id
    );
    handleCloseDeleteModal();
    handleClosePopover();
    return;
  }

  await deleteMessageChat({
    messageId: props.messageId,
    topicId: props.topicId
  });

  handleCloseDeleteModal();
  handleClosePopover();
};

const handleEditMessage = () => {
  emits('unmount-edit-message-id', props.messageId);
  handleClosePopover();
};

const handleReplyMessage = () => {
  emits('unmount-reply-message-id', props.messageId);
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
    handleClosePopover();
    return;
  }

  const message = messages.value.find(
    message => message.id === props.messageId
  );

  emits('unmount-forward-message', {
    message,
    topic
  });
  handleClosePopover();
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

  await togglePinMessageChat({
    messageId: props.messageId,
    topicId: props.topicId
  });

  handleClosePopover();
};

const handleConfirmUnpinMessage = async () => {
  await togglePinMessageChat({
    messageId: props.messageId,
    topicId: props.topicId
  });

  handleCloseUnpinModal();
  handleClosePopover();
};

const toggleShowEmojies = () => {
  showEmojies.value = !showEmojies.value;
};

const handleSelectEmoji = (emoji: { i: string }) => {
  handleReactMessage(emoji.i);
};

const handleCopyMessage = async () => {
  const selection = window.getSelection();
  const selectedText = selection?.toString().trim();

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

const handleClosePopover = () => {
  closeActivePopover(props.messageId);
  showEmojies.value = false;
};
</script>
