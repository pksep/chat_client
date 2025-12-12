<template>
  <!-- eslint-disable-next-line vue/html-self-closing-->
  <chat-container :config.prop="config" :token.prop="token"> </chat-container>
</template>
<script lang="ts" setup>
import { IChatContainerConfig } from './components/interfaces/interfaces';
import './index';

const config: IChatContainerConfig = {
  CHAT_BASE_MODE: import.meta.env.VITE_CHAT_BASE_MODE,
  CHAT_AUTH_API: import.meta.env.VITE_CHAT_AUTH_API,
  CHAT_MASTRA_URL: import.meta.env.VITE_CHAT_MASTRA_URL,
  CHAT_OPENIM_API_DOMAIN: import.meta.env.VITE_CHAT_OPENIM_API_DOMAIN,
  CHAT_OPENIM_WS_DOMAIN: import.meta.env.VITE_CHAT_OPENIM_WS_DOMAIN
};

const token = import.meta.env.VITE_CHAT_ERP_TOKEN;
</script>
