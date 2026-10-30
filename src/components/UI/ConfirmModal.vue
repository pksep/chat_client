<template>
  <MobileModal
    v-if="isMobile"
    class="mobile-modal confirm__modal__mobile"
    headerClass="hidden"
    :show-divider="false"
    :open="props.open"
    @unmount-close="handleCloseModal"
  >
    <h2 class="confirm__modal__title">{{ props.title }}</h2>
    <p class="confirm__modal__description">
      {{ props.description }}
    </p>
    <Button :type="ButtonTypeEnum.primary" @click.stop="handleCloseModal">
      Нет
    </Button>
    <Button :type="ButtonTypeEnum.secondary" @click.stop="handleConfirmModal">
      Да
    </Button>
  </MobileModal>

  <Modal
    v-else
    :open="props.open"
    position="center"
    width="492px"
    height="178px"
    class="confirm__modal"
    @close="handleCloseModal"
    @click.stop
  >
    <h2 class="confirm__modal__title">{{ props.title }}</h2>
    <p class="confirm__modal__description">
      {{ props.description }}
    </p>
    <div class="confirm__modal__buttons">
      <Button
        :type="ButtonTypeEnum.secondary"
        :size="SizesEnum.small"
        @click.stop="handleCloseModal"
      >
        Нет
      </Button>
      <Button
        :type="ButtonTypeEnum.primary"
        :size="SizesEnum.small"
        @click.stop="handleConfirmModal"
      >
        Да
      </Button>
    </div>
  </Modal>
</template>
<script setup lang="ts">
import Modal from './Modal.vue';
import { Button, ButtonTypeEnum, SizesEnum } from '@pksep/yui';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import { IConfirmModalProps } from './interfaces/confirm-modal';
import MobileModal from './MobileModal.vue';

const { state: isMobile } = useResizeState(MAX_W_MD);
const props = defineProps<IConfirmModalProps>();

const emits = defineEmits<{
  (e: 'unmount-close'): void;
  (e: 'unmount-confirm'): void;
}>();

const handleCloseModal = () => {
  emits('unmount-close');
};

const handleConfirmModal = () => {
  emits('unmount-confirm');
};
</script>
