<script setup lang="ts">
defineProps<{
  active?: boolean;
}>();
</script>

<template>
  <svg
    v-if="active"
    width="50"
    height="50"
    viewBox="0 0 50 50"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M18.125 19.5L31.875 30.5L25 36V14L31.875 19.5L18.125 30.5"
      stroke="currentColor"
      stroke-width="2.0625"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
  <svg
    v-else
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M7 8L17 16L12 20V4L17 8L7 16"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>
