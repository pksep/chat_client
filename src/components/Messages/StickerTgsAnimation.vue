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

const props = defineProps<{ src: string; label: string }>();
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
        autoplay: true,
        animationData,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
          progressiveLoad: false
        }
      });
      let ready = false;
      animation.addEventListener('drawnFrame', () => {
        if (ready || current !== revision) return;
        ready = true;
        emit('load');
      });
      animation.addEventListener('data_failed', () => emit('error'));
      animation.addEventListener('error', () => emit('error'));
    } catch {
      if (current === revision) emit('error');
    }
  },
  { flush: 'post' }
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
