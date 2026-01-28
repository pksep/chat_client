<template>
  <Modal
    :open="props.open"
    position="bottom"
    :class="['mobile__modal', props.class]"
    @close="handleCloseModal"
    :data-testid="`${dataTestid}-MobileModal-Container`"
  >
    <header
      ref="headerRef"
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
          v-show="props.startButtonText"
          class="mobile__modal-header--button"
          @click="handleStartStep"
          :disabled="props.isDisabledStartButton"
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

    <div
      class="mobile__modal-content"
      :data-testid="`${dataTestid}-MobileModal-Content`"
    >
      <slot />
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
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

const headerRef = ref<HTMLElement | null>(null);
let startY = 0;
let currentY = 0;
let isSwiping = false;

const SWIPE_CLOSE_THRESHOLD = 80; // px

const onTouchStart = (e: TouchEvent) => {
  startY = e.touches[0].clientY;
  currentY = startY;
  isSwiping = true;
};

const onTouchMove = (e: TouchEvent) => {
  if (!isSwiping) return;
  currentY = e.touches[0].clientY;
};

const onTouchEnd = () => {
  if (!isSwiping) return;

  const diff = currentY - startY;
  if (diff > SWIPE_CLOSE_THRESHOLD) {
    handleCloseModal();
  }

  isSwiping = false;
};

watch(
  headerRef,
  (el, oldEl) => {
    oldEl?.removeEventListener('touchstart', onTouchStart);
    oldEl?.removeEventListener('touchmove', onTouchMove);
    oldEl?.removeEventListener('touchend', onTouchEnd);

    if (el) {
      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchmove', onTouchMove, { passive: true });
      el.addEventListener('touchend', onTouchEnd);
    }
  },
  { immediate: true }
);
</script>
