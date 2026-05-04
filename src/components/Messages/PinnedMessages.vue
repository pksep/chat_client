<template>
  <div
    class="pinned-messages"
    v-if="pinnedMessages.length > 0 && index >= 0"
    @click="handleChangeCurrentIndex"
  >
    <div class="chat__input__action">
      <div class="chat__input__action__blog">
        <h5>Закрепленное сособщение</h5>
        <p>{{ stripHtml(pinnedMessages[index].text || 'Вложение') }}</p>
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
import { getPinnedMessagesByTopicId } from '../../services/useMessages';
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
  emits('unmount-set-selected-message', pinnedMessages.value[index.value]);

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
  await togglePinMessageChat({
    topicId: route.value.id,
    messageId: pinnedMessages.value[index.value].id
  });

  handleCloseUnpinModal();
};
</script>
