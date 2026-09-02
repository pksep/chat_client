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
    <div class="template">
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

const props = withDefaults(
  defineProps<{
    visible?: boolean;
    position?: { x: number; y: number };
    dataTestid?: string;
    forceFlipY?: boolean;
  }>(),
  { dataTestid: () => 'ContextMenu', forceFlipY: false }
);

const emits = defineEmits<{
  (e: 'unmount-close', event: Event): void;
}>();

const menuRef = ref<HTMLElement | null>(null);

const flip = ref(false);
const flipY = ref(false);
const menuLayoutVersion = ref(0);
let menuResizeObserver: ResizeObserver | null = null;

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

  if (flip.value && menuWidth) {
    x -= menuWidth;
  }

  if (flipY.value && menuHeight) {
    y -= menuHeight;
  }

  if (menuWidth) {
    const maxX = Math.max(8, window.innerWidth - menuWidth - 8);
    x = Math.min(Math.max(8, x), maxX);
  }

  if (menuHeight) {
    const maxY = Math.max(8, window.innerHeight - menuHeight - 8);
    y = Math.min(Math.max(8, y), maxY);
  }

  return {
    left: `${x}px`,
    top: `${y}px`
  };
});

const recomputeFlip = async () => {
  if (!props.visible || !props.position) {
    flip.value = false;
    flipY.value = false;
    menuLayoutVersion.value += 1;
    return;
  }

  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  await nextTick();

  const rect = menuRef.value?.getBoundingClientRect();
  if (!rect) return;

  flip.value = props.position.x + rect.width > windowWidth;
  flipY.value =
    props.forceFlipY || props.position.y + rect.height > windowHeight;
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
  () => [props.visible, props.position?.x, props.position?.y],
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
      document.addEventListener('mousedown', closePopoverOnPointerStart);
      document.addEventListener('touchstart', closePopoverOnPointerStart, {
        passive: true
      });
      return;
    }

    window.removeEventListener('resize', handleWindowResize);
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
  document.removeEventListener('mousedown', closePopoverOnPointerStart);
  document.removeEventListener('touchstart', closePopoverOnPointerStart);
});
</script>
