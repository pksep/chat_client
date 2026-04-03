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
  }>(),
  { dataTestid: () => 'ContextMenu' }
);

const emits = defineEmits<{
  (e: 'unmount-close', event: Event): void;
}>();

const menuRef = ref<HTMLElement | null>(null);

const flip = ref(false);
const flipY = ref(false);

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

  let x = props.position.x;
  let y = props.position.y;

  if (flip.value && menuRef.value) {
    x -= menuRef.value.offsetWidth;
  }

  if (flipY.value && menuRef.value) {
    y -= menuRef.value.offsetHeight;
  }

  return {
    left: `${x}px`,
    top: `${y}px`
  };
});

watch(
  () => [props.visible, props.position?.x, props.position?.y],
  async () => {
    if (!props.visible || !props.position) {
      flip.value = false;
      flipY.value = false;
      return;
    }

    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    await nextTick();

    const rect = menuRef.value?.getBoundingClientRect();
    if (!rect) return;

    flip.value = props.position.x + rect.width > windowWidth;
    flipY.value = props.position.y + rect.height > windowHeight;
  },
  { immediate: true }
);

const closePopover = (event: Event) => emits('unmount-close', event);

const closePopoverOnPointerStart = (event: Event) => {
  if (!props.visible || !isOutsideEvent(event)) {
    return;
  }

  closePopover(event);
};

watch(
  () => props.visible,
  visible => {
    if (typeof document === 'undefined') {
      return;
    }

    if (visible) {
      document.addEventListener('mousedown', closePopoverOnPointerStart);
      document.addEventListener('touchstart', closePopoverOnPointerStart, {
        passive: true
      });
      return;
    }

    document.removeEventListener('mousedown', closePopoverOnPointerStart);
    document.removeEventListener('touchstart', closePopoverOnPointerStart);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  if (typeof document === 'undefined') {
    return;
  }

  document.removeEventListener('mousedown', closePopoverOnPointerStart);
  document.removeEventListener('touchstart', closePopoverOnPointerStart);
});
</script>
