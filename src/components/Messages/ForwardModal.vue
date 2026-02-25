<template>
  <Modal
    v-if="!isMobile"
    :open="props.open"
    class="new-contact"
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
    <TopicSelector @unmount-select="handleSelectTopic" />
  </Modal>

  <MobileModal
    v-else
    class="modal__new-contact"
    :open="props.open"
    @unmount-close="closeModal"
    title="Переслать сообщение"
    close-button-text="Назад"
    :data-testid="`${props.dataTestid}-ForwardModal-Container`"
  >
    <template #default>
      <TopicSelector @unmount-select="handleSelectTopic" />
    </template>
  </MobileModal>
</template>

<script setup lang="ts">
import {
  Icon,
  IconNameEnum,
  Modal,
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

const props = withDefaults(defineProps<IForwardModalProps>(), {
  open: false,
  isAddOne: true,
  excludedContactIds: () => new Set<string | number>(),
  dataTestid: 'NewContactModal'
});

const emits = defineEmits<{
  (e: 'unmount-close'): void;
  (e: 'unmount-select-topic', topic: ITopic);
}>();

const { state: isMobile } = useResizeState(MAX_W_MD);

const closeModal = (): void => {
  emits('unmount-close');
};

const handleSelectTopic = async (topic: ITopic): Promise<void> => {
  emits('unmount-select-topic', topic);
  closeModal();
};
</script>
