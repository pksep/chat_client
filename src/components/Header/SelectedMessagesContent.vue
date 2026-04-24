<template>
  <div
    class="selected-messages"
    :data-testid="`${props.dataTestid}-SelectedMessages`"
  >
    <div
      class="selected-messages-content"
      :data-testid="`${props.dataTestid}-SelectedMessages-Container`"
    >
      <Button
        class="selected-messages-content__action selected-messages-content__action--danger"
        :style="{ visibility: isDeletableMessages ? 'visible' : 'hidden' }"
        :type="ButtonTypeEnum.outline"
        :size="SizesEnum.small"
        :data-testid="`${props.dataTestid}-SelectedMessages-DeleteButton`"
        @click="openDeleteConfirm"
      >
        <Icon :name="IconNameEnum.deleteSmall" :width="16" :height="16" />
        <span class="selected-messages-content__action__title">Удалить</span>
      </Button>

      <div
        class="selected-messages-content__title"
        :data-testid="`${props.dataTestid}-SelectedMessages-Title`"
      >
        Выбрано {{ selectedMessageCount }} сообщения
      </div>

      <Button
        class="selected-messages-content__action"
        :type="ButtonTypeEnum.outline"
        :size="SizesEnum.small"
        :data-testid="`${props.dataTestid}-SelectedMessages-ForwardButton`"
        @click="forwardModalOpen = true"
      >
        <ForwardIcon :width="16" :height="16" />
        <span class="selected-messages-content__action__title">Переслать</span>
      </Button>
    </div>
  </div>

  <ConfirmModal
    :open="deleteConfirmOpen"
    title="Удалить сообщения"
    description="Вы уверены, что хотите удалить выбранные сообщения?"
    @unmount-close="closeDeleteConfirm"
    @unmount-confirm="handleDeleteSelectedMessages"
  />

  <ForwardModal
    :open="forwardModalOpen"
    :data-testid="`${props.dataTestid}-SelectedMessagesForward`"
    @unmount-close="forwardModalOpen = false"
    @unmount-select-topic="handleForwardSelectedMessages"
  />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import ConfirmModal from '../UI/ConfirmModal.vue';
import ForwardModal from '../Messages/ForwardModal.vue';
import ForwardIcon from '../UI/ForwardIcon.vue';
import { useUrlWatcher } from '../../composables/navigation';
import { getAuthUser } from '../../composables/useAuth';
import { deleteMessageChat } from '../../services/useChat';
import { deleteMessageFromLocal } from '../../services/useMessages';
import {
  clearSelectedMessages,
  useSelectedMessages
} from '../../composables/useSelectedMessages';
import type { ITopic } from '../interfaces/interfaces';
import { openForwardDraft } from '../../composables/useForwardMessages';

interface Props {
  dataTestid?: string;
}

const props = withDefaults(defineProps<Props>(), {
  dataTestid: 'Header'
});

const route = useUrlWatcher();
const { getSelectedMessagesForTopic, selectedMessageCount } =
  useSelectedMessages();

const deleteConfirmOpen = ref(false);
const forwardModalOpen = ref(false);

const selectedMessages = computed(() =>
  getSelectedMessagesForTopic(route.value.id).sort(
    (left, right) =>
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  )
);

const isDeletableMessages = computed(() => {
  const currentUserId = getAuthUser()?.id;

  return (
    selectedMessages.value.length > 0 &&
    selectedMessages.value.every(
      message => !!currentUserId && message.senderUserId === currentUserId
    )
  );
});

const openDeleteConfirm = () => {
  deleteConfirmOpen.value = true;
};

const closeDeleteConfirm = () => {
  deleteConfirmOpen.value = false;
};

const handleDeleteSelectedMessages = async (): Promise<void> => {
  const topicId = route.value.id;

  if (!topicId) {
    closeDeleteConfirm();
    clearSelectedMessages();
    return;
  }

  try {
    const messagesToDelete = getSelectedMessagesForTopic(topicId);

    for (const message of messagesToDelete) {
      deleteMessageFromLocal(topicId, message.id);
    }

    for (const message of messagesToDelete) {
      void deleteMessageChat({
        messageId: message.id,
        topicId
      });
    }
  } finally {
    closeDeleteConfirm();
    clearSelectedMessages();
  }
};

const handleForwardSelectedMessages = async (topic: ITopic): Promise<void> => {
  forwardModalOpen.value = false;

  try {
    openForwardDraft(topic, selectedMessages.value);
  } finally {
    clearSelectedMessages();
  }
};
</script>
