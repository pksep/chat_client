<template>
  <svg
    class="chat-folder-svg-icon"
    viewBox="0 0 40 40"
    fill="none"
    aria-hidden="true"
  >
    <use :href="`${chatFolderIconsUrl}#${props.name}`" />
  </svg>
</template>

<script setup lang="ts">
import chatFolderIconsUrl from '../../assets/chat-folder-icons.svg?url';
import type { ChatFolderIcon } from '../../services/useChatSDK/chat-folder';

const props = defineProps<{
  name: ChatFolderIcon;
}>();
</script>
