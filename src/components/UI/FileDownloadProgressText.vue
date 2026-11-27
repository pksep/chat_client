<template>
  <span
    class="file-download-progress-text"
    role="progressbar"
    aria-label="Скачивание файла"
    :aria-valuemin="0"
    :aria-valuemax="100"
    :aria-valuenow="roundedProgress ?? undefined"
    >{{ roundedProgress === null ? 'Скачиваем…' : `${roundedProgress}%` }}</span
  >
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSmoothedProgress } from '../../composables/useSmoothedProgress';

const props = defineProps<{ percent: number | null }>();
const progress = useSmoothedProgress(() => props.percent);
const roundedProgress = computed(() =>
  progress.value === null ? null : Math.round(progress.value)
);
</script>

<style scoped>
.file-download-progress-text {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
