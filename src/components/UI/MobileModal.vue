<template>
  <Modal
    v-if="hasOpened"
    :open="props.open"
    position="bottom"
    :class="['mobile__modal', props.class]"
    @close="handleCloseModal"
    :data-testid="`${dataTestid}-MobileModal-Container`"
  >
    <MenuSectionHeading
      :shared="props.menuHeading"
      :centered="props.menuHeading"
      :class="[headerClass, 'mobile__modal-header']"
      :data-testid="`${dataTestid}-MobileModal-Header`"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend="onTouchEndHeader"
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
    </MenuSectionHeading>

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
    <slot name="footer" />
  </Modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import Modal from './Modal.vue';
import Line from './Line.vue';
import MenuSectionHeading from './MenuSectionHeading.vue';
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
  menuHeading: false,
  isDisabledStartButton: false,
  dataTestid: () => 'MobileModal'
});

// Сохраняем экземпляр после первого открытия, включая анимацию закрытия.
const hasOpened = ref(props.open);

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
  }

  isSwiping = false;
  e.stopPropagation();
};

const onTouchEndContent = (e: TouchEvent) => {
  if (!isSwiping) return;

  const diffX = currentX - startX;
  const diffY = currentY - startY;

  const absX = Math.abs(diffX);
  const absY = Math.abs(diffY);

  if (absX > SWIPE_CLOSE_THRESHOLD && absX > absY) {
    handleCloseModal();
  }

  isSwiping = false;
  e.stopPropagation();
};

watch(
  () => props.open,
  isOpen => {
    if (isOpen) {
      hasOpened.value = true;
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

<style lang="css"></style>
