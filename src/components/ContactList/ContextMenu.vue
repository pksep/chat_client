<template>
  <div
    v-if="props.visible"
    v-on-click-outside="closePopover"
    :style="position"
    :class="{ 'context-menu': true, 'context-menu--flip': flip }"
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
import { vOnClickOutside } from '@pksep/yui';
import { computed, ref, watch } from 'vue';

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

const flip = ref(false);

const position = computed(() => ({
  left: `${props.position.x}px`,
  top: `${props.position.y}px`
}));

watch(
  () => [props.visible, props.position?.x],
  async () => {
    if (!props.visible) {
      flip.value = false;
      return;
    }

    flip.value = props.position.x + 200 > window.innerWidth;
  },
  { immediate: true }
);

const closePopover = (event: Event) => emits('unmount-close', event);
</script>
