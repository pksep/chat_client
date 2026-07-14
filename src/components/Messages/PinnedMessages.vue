<template>
  <div
    class="pinned-messages"
    v-if="currentPinnedMessage"
    @click="handleChangeCurrentIndex"
  >
    <div class="chat__input__action">
      <div class="chat__input__action__blog">
        <h5>Закрепленное сособщение</h5>
        <p :key="pinnedPreviewKey" v-emoji>{{ pinnedPreviewText }}</p>
      </div>
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        :data-testid="`Pinned-Messages-CloseButton`"
        @click="handleOpenUnpinModal"
      >
        <Icon
          :name="IconNameEnum.crossLarge"
          color="var(--text-neutral-color)"
        />
      </Button>
    </div>
  </div>

  <ConfirmModal
    :open="unpinModalOpen"
    title="Открепить сообщение"
    description="Вы уверены, что хотите открепить сообщение?"
    @unmount-close="handleCloseUnpinModal"
    @unmount-confirm="handleConfirmUnpinMessage"
  />
</template>
<script setup lang="ts">
import { stripHtml } from '../../utils/stripHtml';
import { useUrlWatcher } from '../../composables/navigation';
import {
  editMessageFromLocal,
  getFullMessagesByTopicId,
  getMessagesByTopicId,
  getPinnedMessagesByTopicId,
  unpinLocalMessageForMe
} from '../../services/useMessages';
import { computed, ref } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import { togglePinMessageChat } from '../../services/useChat';
import ConfirmModal from '../UI/ConfirmModal.vue';
import type {
  IMessage,
  IMessageViewportSnapshot
} from '../interfaces/interfaces';

interface Props {
  viewportSnapshot?: IMessageViewportSnapshot | null;
}

const route = useUrlWatcher();
const props = defineProps<Props>();

const getMessageTimestamp = (message?: Pick<IMessage, 'createdAt'>): number => {
  const timestamp = new Date(message?.createdAt || 0).getTime();

  return Number.isFinite(timestamp) ? timestamp : 0;
};

const pinnedMessages = computed(() =>
  [...getPinnedMessagesByTopicId(route.value.id)].sort(
    (left, right) => getMessageTimestamp(left) - getMessageTimestamp(right)
  )
);

const firstVisibleMessage = computed(() => {
  const firstVisibleMessageId = props.viewportSnapshot?.visibleMessageIds[0];

  if (!firstVisibleMessageId) {
    return null;
  }

  const topicMessages = [
    ...getMessagesByTopicId(route.value.id),
    ...getFullMessagesByTopicId(route.value.id)
  ];

  return (
    topicMessages.find(message => message.id === firstVisibleMessageId) || null
  );
});

const currentPinnedMessage = computed(() => {
  if (pinnedMessages.value.length === 0) {
    return null;
  }

  const firstVisibleTimestamp = getMessageTimestamp(firstVisibleMessage.value);

  if (!firstVisibleTimestamp) {
    return pinnedMessages.value[pinnedMessages.value.length - 1];
  }

  const previousPinnedMessages = pinnedMessages.value.filter(
    message => getMessageTimestamp(message) < firstVisibleTimestamp
  );

  return (
    previousPinnedMessages[previousPinnedMessages.length - 1] ||
    pinnedMessages.value[0]
  );
});

const pinnedPreviewText = computed(() =>
  stripHtml(currentPinnedMessage.value?.text || 'Вложение')
);
const pinnedPreviewKey = computed(
  () =>
    `${route.value.id || 'no-topic'}:${currentPinnedMessage.value?.id || 'no-message'}:${pinnedPreviewText.value}`
);

const unpinModalOpen = ref(false);

const emits = defineEmits(['unmount-set-selected-message']);

const handleChangeCurrentIndex = () => {
  if (!currentPinnedMessage.value) {
    return;
  }

  emits('unmount-set-selected-message', currentPinnedMessage.value);
};

const handleOpenUnpinModal = (event: MouseEvent) => {
  event.stopPropagation();

  unpinModalOpen.value = true;
};

const handleCloseUnpinModal = () => {
  unpinModalOpen.value = false;
};

const handleConfirmUnpinMessage = async () => {
  if (!currentPinnedMessage.value) {
    handleCloseUnpinModal();
    return;
  }

  if (!currentPinnedMessage.value.isPinnedOnlyMe) {
    editMessageFromLocal(route.value.id, {
      ...currentPinnedMessage.value,
      isPin: false
    });

    await togglePinMessageChat({
      topicId: route.value.id,
      messageId: currentPinnedMessage.value.id,
      scope: 'ALL'
    });
  } else {
    unpinLocalMessageForMe(route.value.id, currentPinnedMessage.value.id);
    await togglePinMessageChat({
      topicId: route.value.id,
      messageId: currentPinnedMessage.value.id,
      scope: 'SELF'
    });
  }

  handleCloseUnpinModal();
};
</script>
