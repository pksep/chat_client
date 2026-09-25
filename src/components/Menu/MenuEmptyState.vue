<template>
  <div class="ai-menu-panel__empty">
    <svg
      v-if="!props.hideIcon"
      class="ai-menu-panel__empty-face"
      viewBox="0 0 74 74"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="32" cy="32" r="24" />
      <circle cx="25" cy="28" r="2" />
      <circle cx="39" cy="28" r="2" />
      <path d="M24 39h16M50 50l12 12" />
    </svg>
    <p>{{ props.text }}</p>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    text?: string;
    hideIcon?: boolean;
  }>(),
  {
    text: 'Ничего не найдено',
    hideIcon: false
  }
);
</script>
