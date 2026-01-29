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
      ref="contentRef"
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

/* ------------------------
   CLOSE HANDLERS
------------------------ */
const handleCloseModal = () => {
  emits('unmount-close');
};

const handleStartStep = () => {
  emits('unmount-next');
};

/* ------------------------
   SWIPE LOGIC
------------------------ */
const headerRef = ref<HTMLElement | null>(null);
const contentRef = ref<HTMLElement | null>(null);

let startX = 0;
let startY = 0;
let currentX = 0;
let currentY = 0;
let isSwiping = false;

const SWIPE_CLOSE_THRESHOLD = 80; // px

const onTouchStart = (e: TouchEvent) => {
  startX = e.touches[0].clientX;
  startY = e.touches[0].clientY;
  currentX = startX;
  currentY = startY;
  isSwiping = true;

  // stop propagation to prevent nested modals from receiving this event
  e.stopPropagation();
};

const onTouchMove = (e: TouchEvent) => {
  if (!isSwiping) return;
  currentX = e.touches[0].clientX;
  currentY = e.touches[0].clientY;
  e.stopPropagation();
};

const onTouchEndHeader = (e: TouchEvent) => {
  if (!isSwiping) return;

  const diffY = currentY - startY;

  if (diffY > SWIPE_CLOSE_THRESHOLD) {
    handleCloseModal();
    console.log('Swipe down on header detected, closing modal');
  }

  isSwiping = false;
  e.stopPropagation();
};

const onTouchEndContent = (e: TouchEvent) => {
  if (!isSwiping) return;

  const diffY = currentY - startY;
  const diffX = currentX - startX;

  const absX = Math.abs(diffX);
  const absY = Math.abs(diffY);

  // swipe down (from content)
  if (diffY > SWIPE_CLOSE_THRESHOLD && absY > absX) {
    handleCloseModal();
    console.log('Swipe down on content detected, closing modal');
  }

  // swipe left/right
  if (absX > SWIPE_CLOSE_THRESHOLD && absX > absY) {
    handleCloseModal();
    console.log('Swipe horizontal detected, closing modal');
  }

  isSwiping = false;
  e.stopPropagation();
};

/* ------------------------
   WATCH ELEMENTS
------------------------ */
watch(
  headerRef,
  (el, oldEl) => {
    oldEl?.removeEventListener('touchstart', onTouchStart);
    oldEl?.removeEventListener('touchmove', onTouchMove);
    oldEl?.removeEventListener('touchend', onTouchEndHeader);

    if (el) {
      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchmove', onTouchMove, { passive: true });
      el.addEventListener('touchend', onTouchEndHeader);
    }
  },
  { immediate: true }
);

watch(
  contentRef,
  (el, oldEl) => {
    oldEl?.removeEventListener('touchstart', onTouchStart);
    oldEl?.removeEventListener('touchmove', onTouchMove);
    oldEl?.removeEventListener('touchend', onTouchEndContent);

    if (el) {
      el.addEventListener('touchstart', onTouchStart, { passive: true });
      el.addEventListener('touchmove', onTouchMove, { passive: true });
      el.addEventListener('touchend', onTouchEndContent);
    }
  },
  { immediate: true }
);
</script>
