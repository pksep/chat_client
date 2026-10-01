<template>
  <div
    :class="[
      'ai-menu-panel__empty',
      { 'ai-menu-panel__empty--without-icon': props.hideIcon }
    ]"
  >
    <svg
      v-if="!props.hideIcon"
      class="ai-menu-panel__empty-face"
      width="84"
      height="84"
      viewBox="0 0 84 84"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M40.3971 70.8724C57.2303 70.8724 70.8763 57.2264 70.8763 40.3932C70.8763 23.5601 57.2303 9.91406 40.3971 9.91406C23.564 9.91406 9.91797 23.5601 9.91797 40.3932C9.91797 57.2264 23.564 70.8724 40.3971 70.8724Z"
        stroke="currentColor"
        stroke-width="4.8125"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <path
        d="M74.0846 74.0807L67.668 67.6641"
        stroke="currentColor"
        stroke-width="4.8125"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <circle cx="25.5" cy="35.3359" r="3.5" fill="currentColor" />
      <circle cx="55.168" cy="35.3359" r="3.5" fill="currentColor" />
      <line
        x1="27.086"
        y1="46.9141"
        x2="53.586"
        y2="46.9148"
        stroke="currentColor"
        stroke-width="3.5"
        stroke-linecap="round"
      />
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
