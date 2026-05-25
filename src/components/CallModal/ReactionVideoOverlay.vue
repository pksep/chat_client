<template>
  <video
    v-if="src"
    ref="videoElement"
    :key="videoKey || src"
    :src="src"
    preload="auto"
    autoplay
    playsinline
    muted
    :class="[
      className,
      'call-modal__reaction-video',
      {
        'call-modal__reaction-video--visible': isVisible
      }
    ]"
    @loadeddata="handleReady"
    @canplay="handleReady"
    @playing="handleReady"
  ></video>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
  src: string;
  videoKey?: string;
  className: string;
}>();

const videoElement = ref<HTMLVideoElement | null>(null);
const isVisible = ref(false);

const resetAndPlay = async () => {
  isVisible.value = false;
  await nextTick();

  if (!videoElement.value) {
    return;
  }

  try {
    videoElement.value.currentTime = 0;
  } catch (error) {
    console.warn('[LiveKit] Failed to reset reaction video time:', error);
  }

  void videoElement.value.play().catch(error => {
    console.warn('[LiveKit] Failed to play reaction video:', error);
  });
};

const handleReady = () => {
  isVisible.value = true;
};

watch(
  () => [props.src, props.videoKey],
  () => {
    void resetAndPlay();
  },
  { immediate: true }
);
</script>
