<template>
  <div
    v-if="props.visible"
    ref="menuRef"
    v-on-click-outside="closePopover"
    :style="position"
    :class="{
      'context-menu': true,
      'context-menu--flip': flip,
      'context-menu--flip-y': flipY
    }"
    :data-testid="`${props.dataTestid}-ContextMenu-Container`"
  >
    <div class="template" :style="contentStyle">
      <slot />
    </div>
    <p class="tip">
      Зажмите <kbd>Alt</kbd> для того чтобы показать системное меню
    </p>
  </div>
</template>

<script setup lang="ts">
import { vOnClickOutside } from '@vueuse/components';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { getVisibleViewport } from '../../utils/visible-viewport';
import { androidKeyboardEvent } from '../../utils/android-keyboard-viewport';
import {
  BackButtonPriority,
  useBackButtonHandler
} from '../../composables/useBackButton';

const props = withDefaults(
  defineProps<{
    visible?: boolean;
    position?: { x: number; y: number };
    dataTestid?: string;
    fixedPosition?: boolean;
    forceFlipY?: boolean;
    topOverflow?: number;
  }>(),
  {
    dataTestid: () => 'ContextMenu',
    fixedPosition: false,
    forceFlipY: false,
    topOverflow: 0
  }
);

const emits = defineEmits<{
  (e: 'unmount-close', event: Event): void;
}>();

const menuRef = ref<HTMLElement | null>(null);

const flip = ref(false);
const flipY = ref(false);
const menuLayoutVersion = ref(0);
let menuResizeObserver: ResizeObserver | null = null;
const viewport = computed(() => {
  void menuLayoutVersion.value;
  return getVisibleViewport();
});
const contentStyle = computed(() => ({
  maxHeight: `${Math.max(0, viewport.value.height - props.topOverflow - 36)}px`,
  overflowY:
    (menuRef.value?.scrollHeight || 0) >
    viewport.value.height - props.topOverflow - 16
      ? ('auto' as const)
      : undefined
}));

const isOutsideEvent = (event: Event) => {
  const menu = menuRef.value;
  const target = event.target;

  if (!menu || !(target instanceof Node)) {
    return false;
  }

  return !menu.contains(target);
};

const position = computed(() => {
  if (!props.position) return {};

  void menuLayoutVersion.value;

  let x = props.position.x;
  let y = props.position.y;
  const menuWidth = menuRef.value?.offsetWidth || 0;
  const menuHeight = menuRef.value?.offsetHeight || 0;

  if (!props.fixedPosition && flip.value && menuWidth) {
    x -= menuWidth;
  }

  if (!props.fixedPosition && flipY.value && menuHeight) {
    y -= menuHeight;
  }

  if (menuWidth) {
    const minX = viewport.value.left + 8;
    const maxX = Math.max(minX, viewport.value.right - menuWidth - 8);
    x = Math.min(Math.max(minX, x), maxX);
  }

  if (menuHeight) {
    const minY = viewport.value.top + props.topOverflow + 8;
    const maxY = Math.max(minY, viewport.value.bottom - menuHeight - 8);
    y = Math.min(Math.max(minY, y), maxY);
  }

  return {
    left: `${x}px`,
    top: `${y}px`,
    maxHeight: `${Math.max(0, viewport.value.height - props.topOverflow - 16)}px`
  };
});

const recomputeFlip = async () => {
  if (!props.visible || !props.position) {
    flip.value = false;
    flipY.value = false;
    menuLayoutVersion.value += 1;
    return;
  }

  if (props.fixedPosition) {
    flip.value = false;
    flipY.value = false;
    menuLayoutVersion.value += 1;
    return;
  }

  await nextTick();

  const rect = menuRef.value?.getBoundingClientRect();
  if (!rect) return;

  const bounds = getVisibleViewport();
  flip.value = props.position.x + rect.width > bounds.right;
  flipY.value =
    props.forceFlipY || props.position.y + rect.height > bounds.bottom;
  menuLayoutVersion.value += 1;
};

const disconnectMenuResizeObserver = () => {
  menuResizeObserver?.disconnect();
  menuResizeObserver = null;
};

const ensureMenuResizeObserver = () => {
  if (typeof ResizeObserver === 'undefined') {
    return;
  }

  const menu = menuRef.value;

  if (!menu) {
    return;
  }

  disconnectMenuResizeObserver();
  menuResizeObserver = new ResizeObserver(() => {
    void recomputeFlip();
  });
  menuResizeObserver.observe(menu);
};

watch(
  () => [
    props.visible,
    props.position?.x,
    props.position?.y,
    props.fixedPosition
  ],
  async () => {
    if (!props.visible || !props.position) {
      disconnectMenuResizeObserver();
      flip.value = false;
      flipY.value = false;
      return;
    }

    await recomputeFlip();
    ensureMenuResizeObserver();
  },
  { immediate: true }
);

watch(menuRef, menu => {
  if (!props.visible || !menu) {
    return;
  }

  ensureMenuResizeObserver();
  void recomputeFlip();
});

const closePopover = (event: Event) => emits('unmount-close', event);

useBackButtonHandler(
  () => props.visible,
  () => closePopover(new Event('backButton')),
  BackButtonPriority.overlay
);

const closePopoverOnPointerStart = (event: Event) => {
  if (!props.visible || !isOutsideEvent(event)) {
    return;
  }

  closePopover(event);
};

const handleWindowResize = () => {
  void recomputeFlip();
};

watch(
  () => props.visible,
  visible => {
    if (typeof document === 'undefined') {
      return;
    }

    if (visible) {
      window.addEventListener('resize', handleWindowResize);
      window.addEventListener(androidKeyboardEvent, handleWindowResize);
      window.visualViewport?.addEventListener('resize', handleWindowResize);
      window.visualViewport?.addEventListener('scroll', handleWindowResize);
      document.addEventListener('mousedown', closePopoverOnPointerStart);
      document.addEventListener('touchstart', closePopoverOnPointerStart, {
        passive: true
      });
      return;
    }

    window.removeEventListener('resize', handleWindowResize);
    window.removeEventListener(androidKeyboardEvent, handleWindowResize);
    window.visualViewport?.removeEventListener('resize', handleWindowResize);
    window.visualViewport?.removeEventListener('scroll', handleWindowResize);
    document.removeEventListener('mousedown', closePopoverOnPointerStart);
    document.removeEventListener('touchstart', closePopoverOnPointerStart);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  disconnectMenuResizeObserver();

  if (typeof document === 'undefined') {
    return;
  }

  window.removeEventListener('resize', handleWindowResize);
  window.removeEventListener(androidKeyboardEvent, handleWindowResize);
  window.visualViewport?.removeEventListener('resize', handleWindowResize);
  window.visualViewport?.removeEventListener('scroll', handleWindowResize);
  document.removeEventListener('mousedown', closePopoverOnPointerStart);
  document.removeEventListener('touchstart', closePopoverOnPointerStart);
});
</script>
