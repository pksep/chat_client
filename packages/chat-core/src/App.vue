<template>
  <!-- eslint-disable-next-line vue/html-self-closing-->
  <chat-container :config.prop="config" :token.prop="token"> </chat-container>
</template>
<script lang="ts" setup>
import { IChatContainerConfig } from './components/interfaces/interfaces';
import './index';

const config: IChatContainerConfig = {
  CHAT_BASE_MODE: process.env.CHAT_BASE_MODE,
  CHAT_AUTH_API: process.env.CHAT_AUTH_API,
  CHAT_MASTRA_URL: process.env.CHAT_MASTRA_URL,
  CHAT_OPENIM_API_DOMAIN: process.env.CHAT_OPENIM_API_DOMAIN,
  CHAT_OPENIM_WS_DOMAIN: process.env.CHAT_OPENIM_WS_DOMAIN
};

const token = process.env.CHAT_ERP_TOKEN;
</script>
