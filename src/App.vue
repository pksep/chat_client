<template>
  <!-- eslint-disable-next-line vue/html-self-closing-->
  <chat-container :config.prop="config"> </chat-container>
</template>
<script lang="ts" setup>
import { IChatContainerConfig } from './components/interfaces/interfaces';
import './index';
import { setConfig } from './services/useConfig';

const config: IChatContainerConfig = {
  CHAT_AUTH_API: import.meta.env.VITE_AUTH_API,
  CHAT_MASTRA_URL: import.meta.env.VITE_MASTRA_URL,
  CHAT_API_DOMAIN: import.meta.env.VITE_CHAT_API_DOMAIN,
  CHAT_WS_DOMAIN: import.meta.env.VITE_CHAT_WS_DOMAIN,
  CHAT_ERP_URL: import.meta.env.VITE_ERP_URL,
  CHAT_S3_BUCKET_NAME: import.meta.env.VITE_CHAT_S3_BUCKET_NAME,
  CHAT_S3_REGION: import.meta.env.VITE_CHAT_S3_REGION,
  CHAT_S3_ACCESS_KEY_ID: import.meta.env.VITE_CHAT_S3_ACCESS_KEY_ID,
  CHAT_S3_SECRET_ACCESS_KEY: import.meta.env.VITE_CHAT_S3_SECRET_ACCESS_KEY,
  CHAT_S3_ENDPOINT: import.meta.env.VITE_CHAT_S3_ENDPOINT
};

setConfig(config);
</script>
