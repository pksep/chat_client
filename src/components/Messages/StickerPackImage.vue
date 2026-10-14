<template>
  <span ref="host" class="sticker-pack-image" aria-hidden="true">
    <img
      v-if="failed || !animated"
      :src="
        buildStickerAssetUrl(
          !animated && !failed && thumbnail ? thumbnail.path : previewPath
        )
      "
      alt=""
      width="30"
      height="30"
      draggable="false"
      decoding="async"
      @error="emit('error')"
    />
    <StickerTgsPreview
      v-if="thumbnail?.format === 'tgs' && !failed"
      :src="buildStickerAssetUrl(thumbnail.path)"
      :label="label"
      :playing="visible && playing"
      class="sticker-pack-image__animation"
      :class="{ 'sticker-pack-image__animation--loaded': loaded }"
      @load="loaded = true"
      @error="handleError"
    />
    <video
      v-else-if="thumbnail?.format === 'webm' && !failed"
      ref="video"
      :src="buildStickerAssetUrl(thumbnail.path)"
      class="sticker-pack-image__animation"
      :class="{ 'sticker-pack-image__animation--loaded': loaded }"
      autoplay
      loop
      muted
      playsinline
      disablepictureinpicture
      @loadeddata="loaded = true"
      @error="handleError"
    />
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { StickerPack } from '../../services/sticker-catalog';
import { buildStickerAssetUrl } from '../../utils/sticker-assets';
import StickerTgsPreview from './StickerTgsPreview.vue';

const props = withDefaults(
  defineProps<{
    thumbnail?: StickerPack['thumbnail'];
    previewPath: string;
    label: string;
    playing?: boolean;
  }>(),
  { playing: true }
);
const emit = defineEmits<{ error: [] }>();
const host = ref<HTMLElement | null>(null);
const video = ref<HTMLVideoElement | null>(null);
const failed = ref(false);
const loaded = ref(false);
const animated = computed(
  () => props.thumbnail?.format === 'tgs' || props.thumbnail?.format === 'webm'
);
const visible = ref(true);
let observer: IntersectionObserver | undefined;
const handleError = () => {
  failed.value = true;
  emit('error');
};
watch(
  () => props.thumbnail?.path,
  () => {
    failed.value = false;
    loaded.value = false;
  }
);
watch(
  host,
  element => {
    observer?.disconnect();
    if (!element || !('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(
      ([entry]) => {
        visible.value = entry.isIntersecting;
      },
      { root: element.closest('.chat-sticker-picker__packs') }
    );
    observer.observe(element);
  },
  { flush: 'post' }
);
watch(
  [video, () => visible.value && props.playing],
  ([element, playing]) => {
    if (!element) return;
    if (playing) void element.play().catch(() => undefined);
    else element.pause();
  },
  { flush: 'post' }
);
onBeforeUnmount(() => observer?.disconnect());
</script>

<style scoped>
.sticker-pack-image {
  position: relative;
  display: block;
  width: 30px;
  height: 30px;
}
.sticker-pack-image__animation {
  position: absolute;
  inset: 0;
  opacity: 0;
}
.sticker-pack-image__animation--loaded {
  opacity: 1;
}
.sticker-pack-image img,
.sticker-pack-image video {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
