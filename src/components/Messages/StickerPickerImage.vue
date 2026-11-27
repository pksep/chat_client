<template>
  <span class="sticker-picker-image">
    <img
      v-if="!renderAnimation || !loaded || failed"
      :src="buildStickerAssetUrl(sticker.previewPath)"
      :alt="sticker.label"
      width="60"
      height="60"
      decoding="async"
      draggable="false"
    />
    <img
      v-if="renderAnimation && sticker.format === 'webp'"
      :src="buildStickerAssetUrl(sticker.path)"
      class="sticker-picker-image__animation"
      :class="{ 'sticker-picker-image__animation--loaded': loaded }"
      :alt="sticker.label"
      :aria-hidden="!loaded"
      width="60"
      height="60"
      decoding="async"
      draggable="false"
      @load="handleLoad"
      @error="handleError"
    />
    <StickerTgsPreview
      v-else-if="renderAnimation && preload && sticker.format === 'tgs'"
      :src="buildStickerAssetUrl(sticker.path)"
      :label="sticker.label"
      :playing="animate"
      class="sticker-picker-image__animation"
      :class="{ 'sticker-picker-image__animation--loaded': loaded }"
      :aria-hidden="!loaded"
      @load="handleLoad"
      @error="handleError"
    />
    <StickerTgsAnimation
      v-else-if="renderAnimation && sticker.format === 'tgs'"
      :src="buildStickerAssetUrl(sticker.path)"
      :label="sticker.label"
      class="sticker-picker-image__animation"
      :class="{ 'sticker-picker-image__animation--loaded': loaded }"
      :aria-hidden="!loaded"
      @load="handleLoad"
      @error="handleError"
    />
    <video
      v-else-if="renderAnimation && sticker.format === 'webm'"
      ref="video"
      :src="buildStickerAssetUrl(sticker.path)"
      class="sticker-picker-image__animation"
      :class="{ 'sticker-picker-image__animation--loaded': loaded }"
      :aria-label="sticker.label"
      width="60"
      height="60"
      autoplay
      loop
      muted
      playsinline
      disablepictureinpicture
      @loadeddata="handleLoad"
      @error="handleError"
    />
  </span>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { CatalogSticker } from '../../utils/stickers';
import { buildStickerAssetUrl } from '../../utils/sticker-assets';
import StickerTgsAnimation from './StickerTgsAnimation.vue';
import StickerTgsPreview from './StickerTgsPreview.vue';
const props = defineProps<{
  sticker: CatalogSticker;
  animate: boolean;
  preload?: boolean;
}>();
const renderAnimation = computed(() => props.animate || props.preload);
const video = ref<HTMLVideoElement | null>(null);
const loaded = ref(false);
const failed = ref(false);
const handleLoad = () => {
  loaded.value = true;
  failed.value = false;
};
const handleError = () => {
  loaded.value = false;
  failed.value = true;
};
watch(
  () => [renderAnimation.value, props.sticker.path],
  () => {
    loaded.value = false;
    failed.value = false;
  }
);
watch(
  [video, () => props.animate],
  ([element, playing]) => {
    if (!element) return;
    if (playing) void element.play().catch(() => undefined);
    else element.pause();
  },
  { flush: 'post' }
);
</script>
<style scoped>
.sticker-picker-image {
  position: relative;
  display: block;
  width: var(--sticker-display-size, 60px);
  height: var(--sticker-display-size, 60px);
}
.sticker-picker-image img,
.sticker-picker-image video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.sticker-picker-image__animation {
  position: absolute;
  inset: 0;
  opacity: 0;
}
.sticker-picker-image__animation--loaded {
  opacity: 1;
}
</style>
