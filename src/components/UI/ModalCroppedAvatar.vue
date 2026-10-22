<template>
  <YuiModalCroppedAvatar
    v-bind="$attrs"
    :open="props.open"
    :image="props.image"
    animate-type="fade"
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
// Cropper измеряет canvas при загрузке фото: scale-анимация уменьшает
// сохранённое изображение и оставляет пустое поле справа и снизу.
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
