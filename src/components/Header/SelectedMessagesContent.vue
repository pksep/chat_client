<template>
  <div
    ref="selectedMessagesRef"
    class="selected-messages"
    :data-testid="`${props.dataTestid}-SelectedMessages`"
  >
    <div
      class="selected-messages-content"
      :data-testid="`${props.dataTestid}-SelectedMessages-Container`"
    >
      <Button
        class="selected-messages-content__action selected-messages-content__action--danger"
        aria-label="Удалить"
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
        aria-label="Переслать"
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
    @unmount-select-ai-session="handleForwardSelectedMessagesToAi"
  />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
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
import { type AiAssistantSession } from '../../composables/useAiAssistant';
import { openAiForwardDraft } from '../../composables/useAiForwardDraft';

interface Props {
  dataTestid?: string;
}

const props = withDefaults(defineProps<Props>(), {
  dataTestid: 'Header'
});
const emit = defineEmits(['heightChange', 'forward']);

const route = useUrlWatcher();
const selectedMessagesRef = useTemplateRef('selectedMessagesRef');
const { getSelectedMessagesForTopic, selectedMessageCount } =
  useSelectedMessages();

const deleteConfirmOpen = ref(false);
const forwardModalOpen = ref(false);
let selectedMessagesResizeObserver: ResizeObserver | null = null;
let lastReportedSelectedMessagesHeight = 0;

const reportSelectedMessagesHeight = (): void => {
  const element = selectedMessagesRef.value;

  if (!element) {
    return;
  }

  const nextHeight = Math.ceil(element.getBoundingClientRect().height);

  if (!nextHeight || nextHeight === lastReportedSelectedMessagesHeight) {
    return;
  }

  lastReportedSelectedMessagesHeight = nextHeight;
  emit('heightChange', nextHeight);
};

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
    emit('forward');
  } finally {
    clearSelectedMessages();
  }
};

const handleForwardSelectedMessagesToAi = (
  session: AiAssistantSession
): void => {
  forwardModalOpen.value = false;

  try {
    openAiForwardDraft(session, selectedMessages.value);
    emit('forward');
  } finally {
    clearSelectedMessages();
  }
};

onMounted(() => {
  if ('ResizeObserver' in window && selectedMessagesRef.value) {
    selectedMessagesResizeObserver = new ResizeObserver(
      reportSelectedMessagesHeight
    );
    selectedMessagesResizeObserver.observe(selectedMessagesRef.value);
  }

  requestAnimationFrame(reportSelectedMessagesHeight);
});

onBeforeUnmount(() => {
  selectedMessagesResizeObserver?.disconnect();
  selectedMessagesResizeObserver = null;
  lastReportedSelectedMessagesHeight = 0;
  emit('heightChange', 0);
});
</script>
