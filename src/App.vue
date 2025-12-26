<template>
  <!-- eslint-disable-next-line vue/html-self-closing-->
  <chat-container :config.prop="config"> </chat-container>
</template>
<script lang="ts" setup>
import { IChatContainerConfig } from './components/interfaces/interfaces';
import { useViewportHeight } from './composables/useViewportHeight';
import './index';
import { setConfig } from './services/useConfig';

const config: IChatContainerConfig = {
  CHAT_AUTH_API: import.meta.env.VITE_AUTH_API,
  CHAT_MASTRA_URL: import.meta.env.VITE_MASTRA_URL,
  CHAT_OPENIM_API_DOMAIN: import.meta.env.VITE_OPENIM_API_DOMAIN,
  CHAT_OPENIM_WS_DOMAIN: import.meta.env.VITE_OPENIM_WS_DOMAIN,
  CHAT_ERP_URL: import.meta.env.VITE_ERP_URL
};

useViewportHeight();

setConfig(config);
</script>
