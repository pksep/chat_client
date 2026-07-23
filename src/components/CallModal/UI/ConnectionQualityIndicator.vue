<template>
  <div
    class="call-modal__connection-quality"
    :class="`call-modal__connection-quality--${normalizedQuality}`"
    :title="label"
    :aria-label="label"
  >
    <span
      v-for="bar in 3"
      :key="bar"
      class="call-modal__connection-quality-bar"
      :class="{
        'call-modal__connection-quality-bar--active': bar <= activeBars
      }"
    ></span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    quality?: string;
  }>(),
  {
    quality: 'unknown'
  }
);

const normalizedQuality = computed(() => {
  if (props.quality === 'excellent') {
    return 'excellent';
  }

  if (props.quality === 'good') {
    return 'good';
  }

  if (props.quality === 'poor' || props.quality === 'lost') {
    return 'poor';
  }

  return 'unknown';
});

const activeBars = computed(() => {
  if (normalizedQuality.value === 'excellent') {
    return 3;
  }

  if (normalizedQuality.value === 'good') {
    return 2;
  }

  if (
    normalizedQuality.value === 'poor' ||
    normalizedQuality.value === 'unknown'
  ) {
    return 1;
  }

  return 0;
});

const label = computed(() => {
  if (normalizedQuality.value === 'excellent') {
    return 'Хорошее соединение';
  }

  if (normalizedQuality.value === 'good') {
    return 'Средняя';
  }

  if (normalizedQuality.value === 'poor') {
    return 'Слабая сеть';
  }

  return 'Качество сети неизвестно';
});
</script>
