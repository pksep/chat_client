<template>
  <StickerTgsAnimation
    v-if="fallback"
    :src="src"
    :label="label"
    :playing="playing"
    @load="emit('load')"
    @error="emit('error')"
  />
  <canvas
    v-else
    ref="canvas"
    class="sticker-tgs-preview"
    role="img"
    :aria-label="label"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import StickerTgsAnimation from './StickerTgsAnimation.vue';
import type { createStickerPreviewPlayer } from '../../utils/sticker-preview-player';

const props = defineProps<{ src: string; label: string; playing: boolean }>();
const emit = defineEmits<{ load: []; error: [] }>();
const canvas = ref<HTMLCanvasElement | null>(null);
const fallback = ref(false);
let player: Awaited<ReturnType<typeof createStickerPreviewPlayer>> | undefined;
let revision = 0;
let abort: AbortController | undefined;
watch(
  () => [canvas.value, props.src] as const,
  async ([element, src]) => {
    const current = ++revision;
    abort?.abort();
    abort = new AbortController();
    const signal = abort.signal;
    player?.destroy();
    player = undefined;
    if (!element || !src) return;
    try {
      const { createStickerPreviewPlayer: create } = await import(
        '../../utils/sticker-preview-player'
      );
      if (current !== revision) return;
      const next = await create(
        element,
        src,
        props.playing,
        () => {
          if (current === revision) emit('load');
        },
        () => {
          if (current === revision) fallback.value = true;
        },
        signal
      );
      if (current !== revision) next.destroy();
      else {
        player = next;
        player.setPlaying(props.playing);
      }
    } catch {
      if (current === revision) fallback.value = true;
    }
  },
  { flush: 'post' }
);
watch(
  () => props.playing,
  value => player?.setPlaying(value)
);
onBeforeUnmount(() => {
  revision += 1;
  abort?.abort();
  player?.destroy();
});
</script>

<style scoped>
.sticker-tgs-preview {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
