<template>
  <Modal
    :open="props.open"
    position="bottom"
    :class="['mobile__modal', props.class]"
    @close="handleCloseModal"
    :data-testid="`${dataTestid}-MobileModal-Container`"
  >
    <header
      :class="[headerClass, 'mobile__modal-header']"
      :data-testid="`${dataTestid}-MobileModal-Header`"
    >
      <slot name="header">
        <button
          class="mobile__modal-header--button"
          @click="handleCloseModal"
          :data-testid="`${dataTestid}-MobileModal-CloseButton`"
        >
          {{ props.closeButtonText }}
        </button>
        <h3
          class="mobile__modal-header--title"
          :data-testid="`${dataTestid}-MobileModal-Title`"
        >
          {{ props.title }}
        </h3>
        <button
          class="mobile__modal-header--button"
          @click="handleStartStep"
          :disabled="props.isDisabledStartButton"
          v-if="props.startButtonText"
          :data-testid="`${dataTestid}-MobileModal-StartButton`"
        >
          {{ props.startButtonText }}
        </button>
      </slot>
    </header>
    <Line
      v-if="showDivider"
      class="mobile__modal-divider"
      :data-testid="`${dataTestid}-MobileModal-Divider`"
    />
    <div :data-testid="`${dataTestid}-MobileModal-Content`" class="mobile__modal-content">
      <slot></slot>
    </div>
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
  showDivider: true,
  isDisabledStartButton: false,
  dataTestid: () => 'MobileModal'
});

const handleCloseModal = () => {
  emits('unmount-close');
};

const handleStartStep = () => {
  emits('unmount-next');
};
</script>
