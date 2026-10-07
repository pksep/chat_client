<template>
  <YuiModalCroppedAvatar
    v-bind="$attrs"
    :open="props.open"
    :image="props.image"
    @unmount-close="emits('unmount-close')"
  />
</template>

<script setup lang="ts">
import { ModalCroppedAvatar as YuiModalCroppedAvatar } from '@pksep/yui';
import {
  BackButtonPriority,
  useBackButtonHandler
} from '../../composables/useBackButton';

defineOptions({ inheritAttrs: false });
const props = withDefaults(defineProps<{ open?: boolean; image: File }>(), {
  open: false
});
const emits = defineEmits<{ (e: 'unmount-close'): void }>();

useBackButtonHandler(
  () => props.open,
  () => emits('unmount-close'),
  BackButtonPriority.overlay
);
</script>
