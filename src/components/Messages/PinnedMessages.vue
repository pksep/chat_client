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
  getPinnedMessagesByTopicId,
  unpinLocalMessageForMe
} from '../../services/useMessages';
import { computed, ref, watch } from 'vue';
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import { togglePinMessageChat } from '../../services/useChat';
import ConfirmModal from '../UI/ConfirmModal.vue';

const route = useUrlWatcher();

const pinnedMessages = computed(() =>
  getPinnedMessagesByTopicId(route.value.id)
);
const currentPinnedMessage = computed(
  () => pinnedMessages.value[index.value] || null
);
const pinnedPreviewText = computed(() =>
  stripHtml(currentPinnedMessage.value?.text || 'Вложение')
);
const pinnedPreviewKey = computed(
  () =>
    `${route.value.id || 'no-topic'}:${currentPinnedMessage.value?.id || 'no-message'}:${pinnedPreviewText.value}`
);

const index = ref(-1);
const unpinModalOpen = ref(false);

const emits = defineEmits(['unmount-set-selected-message']);

watch(
  () => pinnedMessages.value,
  () => {
    index.value = pinnedMessages.value.length - 1;
  },
  { immediate: true, deep: true }
);

const handleChangeCurrentIndex = () => {
  if (!currentPinnedMessage.value) {
    return;
  }

  emits('unmount-set-selected-message', currentPinnedMessage.value);

  if (index.value > 0) {
    index.value -= 1;
  } else {
    index.value = pinnedMessages.value.length - 1;
  }
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
