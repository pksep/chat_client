<template>
  <span
    ref="host"
    class="sticker-tgs-animation"
    role="img"
    :aria-label="label"
  />
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import type { AnimationItem } from 'lottie-web';
import { loadTgsAnimation, loadTgsPlayer } from '../../utils/tgs-animation';

const props = withDefaults(
  defineProps<{ src: string; label: string; playing?: boolean }>(),
  { playing: true }
);
const emit = defineEmits<{ load: []; error: [] }>();
const host = ref<HTMLElement | null>(null);
let animation: AnimationItem | undefined;
let revision = 0;
watch(
  () => [host.value, props.src] as const,
  async ([element, src]) => {
    const current = ++revision;
    animation?.destroy();
    animation = undefined;
    if (!element || !src) return;
    try {
      const [player, animationData] = await Promise.all([
        loadTgsPlayer(),
        loadTgsAnimation(src)
      ]);
      if (current !== revision) return;
      animation = player.default.loadAnimation({
        container: element,
        renderer: 'svg',
        loop: true,
        autoplay: props.playing,
        animationData,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
          progressiveLoad: false
        }
      });
      animation.setSubframe(false);
      let ready = false;
      const handleReady = () => {
        if (ready || current !== revision) return;
        ready = true;
        emit('load');
      };
      animation.addEventListener('drawnFrame', handleReady);
      animation.addEventListener('DOMLoaded', () => {
        if (!props.playing && current === revision) {
          animation?.goToAndStop(0, true);
          handleReady();
        }
      });
      animation.addEventListener('data_failed', () => emit('error'));
      animation.addEventListener('error', () => emit('error'));
    } catch {
      if (current === revision) emit('error');
    }
  },
  { flush: 'post' }
);
watch(
  () => props.playing,
  playing => {
    if (playing) animation?.play();
    else animation?.pause();
  }
);
onBeforeUnmount(() => {
  revision += 1;
  animation?.destroy();
});
</script>

<style scoped>
.sticker-tgs-animation {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.sticker-tgs-animation :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
