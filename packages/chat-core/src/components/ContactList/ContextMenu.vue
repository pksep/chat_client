<template>
  <div
    v-if="props.visible"
    v-on-click-outside="closePopover"
    :style="{
      left: `${props.position.x}px`,
      top: `${props.position.y}px`
    }"
    class="context-menu"
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
import { vOnClickOutside } from 'sep-yui';

const props = defineProps<{
  visible: boolean;
  position: { x: number; y: number };
}>();

const emits = defineEmits<{
  (e: 'unmount-close', event: Event): void;
}>();

const closePopover = (event: Event): void => {
  emits('unmount-close', event);
};
</script>
