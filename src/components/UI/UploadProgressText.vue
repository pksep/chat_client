<template>{{ roundedProgress }}%</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useSmoothedProgress } from '../../composables/useSmoothedProgress';

const props = defineProps<{
  percent: number;
}>();

const displayedProgress = useSmoothedProgress(() => props.percent);
const roundedProgress = computed(() =>
  Math.round(displayedProgress.value ?? 0)
);
</script>
