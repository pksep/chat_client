<template>
  <div ref="layer" class="chat-container__wallpaper" aria-hidden="true">
    <div
      class="chat-container__wallpaper-image"
      :style="[wallpaperStyle, { minHeight: `${wallpaperHeight}px` }]"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, type CSSProperties } from 'vue';

defineProps<{ wallpaperStyle: CSSProperties }>();
const layer = ref<HTMLElement | null>(null);
const wallpaperHeight = ref(0);
let width = 0;
let observer: ResizeObserver | undefined;

onMounted(() => {
  if (!layer.value) return;
  const measure = () => {
    if (!layer.value) return;
    const bounds = layer.value.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    // adjustResize уменьшает WebView под клавиатуру. Фон сохраняет полный размер,
    // а список сообщений продолжает использовать доступную высоту.
    wallpaperHeight.value =
      bounds.width === width
        ? Math.max(wallpaperHeight.value, bounds.height)
        : bounds.height;
    width = bounds.width;
  };
  measure();
  observer = new ResizeObserver(measure);
  observer.observe(layer.value);
});

onBeforeUnmount(() => observer?.disconnect());
</script>
