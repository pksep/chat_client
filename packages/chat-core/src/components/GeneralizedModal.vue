<template>
  <Modal
    :open="props.open"
    :position="props.position"
    @close="handleClose"
    :class="props.modalClass"
  >
    <header v-if="showHeader" :class="headerClass">
      <slot name="header"></slot>
    </header>
    <Line v-if="showDivider" />
    <div :class="contentClass">
      <slot></slot>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { Modal } from '@pksep/yui';
import Line from './Line.vue';

interface IProps {
  open: boolean;
  position?: 'center' | 'bottom' | 'right';
  showHeader?: boolean;
  showCloseButton?: boolean;
  closeButtonText?: string;
  title?: string;
  showDivider?: boolean;
  modalClass?: string;
  headerClass?: string;
  closeButtonClass?: string;
  titleClass?: string;
  contentClass?: string;
}

const props = withDefaults(defineProps<IProps>(), {
  open: false,
  position: 'center',
  showHeader: true,
  showCloseButton: true,
  closeButtonText: 'Cancel',
  showDivider: true,
  modalClass: '',
  headerClass: 'generalized-modal__header',
  closeButtonClass: 'generalized-modal__header--button',
  titleClass: 'generalized-modal__header--title',
  contentClass: 'generalized-modal__content'
});

interface IEmits {
  close: [];
}

const emits = defineEmits<IEmits>();

const handleClose = () => {
  emits('close');
};
</script>

<style scoped></style>
