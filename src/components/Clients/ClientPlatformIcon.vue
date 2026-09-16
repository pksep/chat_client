<template>
  <Icon v-if="platform === 'ВКонтакте'" :name="IconNameEnum.socialVk" />
  <svg
    v-else-if="platform === 'Авито'"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle cx="6" cy="16.5" r="4.5" fill="#00AAFF" />
    <circle cx="17.5" cy="7" r="5.5" fill="#97CF26" />
    <circle cx="6.5" cy="5.5" r="3.5" fill="#A169F7" />
    <circle cx="17" cy="18" r="3" fill="#FF6163" />
  </svg>
  <svg
    v-else
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="9" />
    <ellipse cx="12" cy="12" rx="4" ry="9" />
    <path d="M3 12h18M5 6.5h14M5 17.5h14" />
  </svg>
</template>
<script setup lang="ts">
import { Icon, IconNameEnum } from '@pksep/yui';
defineProps<{ platform: string }>();
</script>
