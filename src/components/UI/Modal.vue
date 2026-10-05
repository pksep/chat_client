<template>
  <YuiModal v-bind="$attrs" :open="props.open" @close="emits('close')">
    <slot />
  </YuiModal>
</template>

<script setup lang="ts">
import { Modal as YuiModal } from '@pksep/yui';
import {
  BackButtonPriority,
  useBackButtonHandler
} from '../../composables/useBackButton';

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ open?: boolean }>(), { open: false });
const emits = defineEmits<{ (e: 'close'): void }>();

useBackButtonHandler(
  () => props.open,
  () => emits('close'),
  BackButtonPriority.overlay
);
</script>
