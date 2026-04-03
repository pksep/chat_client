<template>
  <svg
    v-if="!props.isLoaded && !hasPercent"
    class="message-content__media-loading__icon"
    width="30"
    height="30"
    viewBox="0 0 30 30"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="30" height="30" rx="15" fill="#1C2635" fill-opacity="0.4" />
    <path
      d="M24.25 15C24.6642 15 25.0029 15.3363 24.9719 15.7493C24.8431 17.4632 24.2743 19.1196 23.3147 20.5557C22.2159 22.2002 20.6541 23.4819 18.8268 24.2388C16.9996 24.9957 14.9889 25.1937 13.0491 24.8079C11.1093 24.422 9.32746 23.4696 7.92893 22.0711C6.53041 20.6725 5.578 18.8907 5.19215 16.9509C4.80629 15.0111 5.00433 13.0004 5.7612 11.1732C6.51808 9.3459 7.79981 7.78412 9.4443 6.6853C10.8804 5.72574 12.5368 5.15688 14.2507 5.02811C14.6637 4.99707 15 5.33579 15 5.75C15 6.16421 14.6636 6.49656 14.2509 6.53306C12.8341 6.6584 11.467 7.13783 10.2777 7.93251C8.87984 8.8665 7.79037 10.194 7.14702 11.7472C6.50368 13.3004 6.33535 15.0094 6.66333 16.6583C6.9913 18.3071 7.80085 19.8217 8.98959 21.0104C10.1783 22.1992 11.6929 23.0087 13.3417 23.3367C14.9906 23.6646 16.6996 23.4963 18.2528 22.853C19.806 22.2096 21.1335 21.1202 22.0675 19.7223C22.8622 18.533 23.3416 17.1659 23.4669 15.7491C23.5034 15.3364 23.8358 15 24.25 15Z"
      fill="white"
    />
  </svg>

  <svg
    v-else-if="!props.isLoaded && hasPercent"
    width="30"
    height="30"
    viewBox="0 0 30 30"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="30" height="30" rx="15" fill="#1C2635" fill-opacity="0.4" />
    <circle
      cx="15"
      cy="15"
      r="9"
      stroke="rgba(255,255,255,0.25)"
      stroke-width="2"
    />
    <circle
      cx="15"
      cy="15"
      r="9"
      stroke="white"
      stroke-width="2"
      stroke-linecap="round"
      :stroke-dasharray="circumference"
      :stroke-dashoffset="dashOffset"
      transform="rotate(-90 15 15)"
    />
  </svg>

  <svg
    v-else
    width="30"
    height="30"
    viewBox="0 0 30 30"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="30" height="30" rx="15" fill="#1C2635" fill-opacity="0.4" />
    <path
      d="M22.5714 9L14 21L8 15.8571"
      stroke="white"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    isLoaded: boolean;
    percent?: number | null;
  }>(),
  {
    isLoaded: false,
    percent: null
  }
);

const radius = 9;
const circumference = 2 * Math.PI * radius;

const normalizedPercent = computed(() => {
  if (typeof props.percent !== 'number' || Number.isNaN(props.percent)) {
    return null;
  }

  return Math.max(0, Math.min(95, props.percent));
});

const hasPercent = computed(() => normalizedPercent.value !== null);

const dashOffset = computed(() => {
  const percent = normalizedPercent.value ?? 0;
  return circumference * (1 - percent / 100);
});
</script>
