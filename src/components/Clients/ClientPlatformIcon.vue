<template>
  <Icon v-if="platform === 'ВКонтакте'" :name="IconNameEnum.socialVk" />
  <svg
    v-else-if="platform === 'WhatsApp'"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <path
      fill="#25D366"
      d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.4A10 10 0 1 0 12 2Z"
    />
    <path
      d="M8 7c-1 1-1 3 1.5 5.5S14 16 15 15l1.2-1.2-2.5-1.5-1 1c-1.2-.6-2.4-1.8-3-3l1-1L9.2 6.8Z"
      fill="none"
      stroke="white"
      stroke-width="1.3"
      stroke-linejoin="round"
    />
  </svg>
  <Icon
    v-else-if="platform === 'Telegram'"
    :name="IconNameEnum.socialTelegram"
  />
  <img
    v-else-if="platform === 'MAX'"
    :src="maxIconUrl"
    class="client-platform-icon"
    width="24"
    height="24"
    alt=""
    aria-hidden="true"
  />
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
// Официальный значок MAX: https://go.max.ru/brandbook.
import maxIconUrl from '../../assets/max-icon.svg';

defineProps<{ platform: string }>();
</script>

<style scoped>
.client-platform-icon {
  display: block;
  flex-shrink: 0;
  object-fit: contain;
  max-width: 15px;
}
</style>
