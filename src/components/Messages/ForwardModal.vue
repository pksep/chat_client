<template>
  <Modal
    v-if="!isMobile"
    :open="props.open"
    class="new-contact message-forward-modal"
    position="center"
    @close="closeModal"
    :data-testid="`${props.dataTestid}-NewContactModal-Container`"
  >
    <header class="new-contact__header">
      Переслать сообщение
      <Button
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        @click="closeModal"
        class="new-contact__button-close"
      >
        <Icon :name="IconNameEnum.crossSmall" />
      </Button>
    </header>
    <TopicSelector
      @unmount-select="handleSelectTopic"
      @unmount-select-ai-session="handleSelectAiSession"
    />
  </Modal>

  <MobileModal
    v-else
    class="modal__new-contact message-forward-modal"
    :open="props.open"
    @unmount-close="closeModal"
    title="Переслать сообщение"
    close-button-text="Назад"
    :data-testid="`${props.dataTestid}-ForwardModal-Container`"
  >
    <template #default>
      <TopicSelector
        @unmount-select="handleSelectTopic"
        @unmount-select-ai-session="handleSelectAiSession"
      />
    </template>
  </MobileModal>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { useTopics } from '../../composables/useTopics';
import Modal from '../UI/Modal.vue';
import {
  Icon,
  IconNameEnum,
  SizesEnum,
  ButtonTypeEnum,
  Button
} from '@pksep/yui';
import { ITopic } from '../interfaces/interfaces';
import { IForwardModalProps } from './interface/interface';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import MobileModal from '../UI/MobileModal.vue';
import TopicSelector from '../TopicSelector.vue';
import type { AiAssistantSession } from '../../composables/useAiAssistant';

const props = withDefaults(defineProps<IForwardModalProps>(), {
  open: false,
  isAddOne: true,
  excludedContactIds: () => new Set<string | number>(),
  dataTestid: 'NewContactModal'
});
const { loadRemainingTopics } = useTopics();
watch(
  () => props.open,
  open => {
    if (open) void loadRemainingTopics();
  },
  { immediate: true }
);

const emits = defineEmits<{
  (e: 'unmount-close'): void;
  (e: 'unmount-select-topic', topic: ITopic);
  (e: 'unmount-select-ai-session', session: AiAssistantSession);
}>();

const { state: isMobile } = useResizeState(MAX_W_MD);

const closeModal = (): void => {
  emits('unmount-close');
};

const handleSelectTopic = async (topic: ITopic): Promise<void> => {
  emits('unmount-select-topic', topic);
  closeModal();
};

const handleSelectAiSession = (session: AiAssistantSession): void => {
  emits('unmount-select-ai-session', session);
  closeModal();
};
</script>
