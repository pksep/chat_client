<template>
  <div
    class="selected-messages-content"
    :data-testid="`${props.dataTestid}-SelectedMessages-Container`"
  >
    <Button
      class="selected-messages-content__action selected-messages-content__action--danger"
      :type="ButtonTypeEnum.ghost"
      :size="SizesEnum.small"
      :disabled="deletableMessages.length === 0"
      :data-testid="`${props.dataTestid}-SelectedMessages-DeleteButton`"
      @click="openDeleteConfirm"
    >
      <Icon :name="IconNameEnum.deleteSmall" />
      Удалить
    </Button>

    <div
      class="selected-messages-content__title"
      :data-testid="`${props.dataTestid}-SelectedMessages-Title`"
    >
      Выбрано {{ selectedMessageCount }} сообщения
    </div>

    <Button
      class="selected-messages-content__action"
      :type="ButtonTypeEnum.ghost"
      :size="SizesEnum.small"
      :data-testid="`${props.dataTestid}-SelectedMessages-ForwardButton`"
      @click="forwardModalOpen = true"
    >
      <ForwardIcon />
      Переслать
    </Button>
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
import { deleteMessageChat, sendMessageChat } from '../../services/useChat';
import {
  clearSelectedMessages,
  useSelectedMessages
} from '../../composables/useSelectedMessages';
import type { ITopic } from '../interfaces/interfaces';

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

const deletableMessages = computed(() => {
  const currentUserId = getAuthUser()?.id;

  return selectedMessages.value.filter(
    message => !!currentUserId && message.senderUserId === currentUserId
  );
});

const openDeleteConfirm = () => {
  if (deletableMessages.value.length === 0) {
    return;
  }

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
    for (const message of deletableMessages.value) {
      await deleteMessageChat({
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
    for (const message of selectedMessages.value) {
      await sendMessageChat({
        topicId: topic.id,
        text: '',
        forwardMessageId: message.id
      });
    }
  } finally {
    clearSelectedMessages();
  }
};
</script>
