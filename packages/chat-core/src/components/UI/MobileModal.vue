<template>
  <Modal
    :open="props.open"
    position="bottom"
    :class="['mobile__modal', props.class]"
    @close="handleCloseModal"
  >
    <header :class="[headerClass, 'mobile__modal-header']">
      <slot name="header">
        <button class="mobile__modal-header--button" @click="handleCloseModal">
          {{ props.closeButtonText }}
        </button>
        <h3 class="mobile__modal-header--title">{{ props.title }}</h3>
      </slot>
    </header>
    <Line v-if="showDivider" class="mobile__modal-divider" />
    <slot></slot>
  </Modal>
</template>

<script setup lang="ts">
import { Modal } from '@pksep/yui';
import Line from './Line.vue';
import type {
  IMobileModalProps,
  IMobileModalEmits
} from './interfaces/mobile-modal';

const emits = defineEmits<IMobileModalEmits>();

const props = withDefaults(defineProps<IMobileModalProps>(), {
  open: false,
  showCloseButton: true,
  closeButtonText: 'Отмена',
  showDivider: true
});

const handleCloseModal = () => {
  emits('unmount-close');
};
</script>

<style scoped></style>
