<template>
  <Teleport to="body">
    <div
      class="sticker-preview"
      role="dialog"
      aria-modal="true"
      :aria-label="`Просмотр стикера: ${sticker.label}`"
      @click.stop="emit('close')"
      @contextmenu.prevent
      @wheel.prevent
      @touchmove.prevent
    >
      <StickerPickerImage
        :key="`${sticker.id}:${sticker.version}`"
        :sticker="sticker"
        :animate="true"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { CatalogSticker } from '../../utils/stickers';
import StickerPickerImage from './StickerPickerImage.vue';
defineProps<{ sticker: CatalogSticker }>();
const emit = defineEmits<{ close: [] }>();
</script>

<style scoped>
.sticker-preview {
  position: fixed;
  inset: 0;
  z-index: 20000;
  display: grid;
  place-items: center;
  padding: 24px;
  background: rgb(0 0 0 / 55%);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  --sticker-display-size: min(360px, calc(100vw - 48px), calc(100dvh - 96px));
}
</style>
