<template>
  <!-- eslint-disable-next-line vue/html-self-closing-->
  <chat-container :config.prop="config" :token.prop="token"> </chat-container>
</template>
<script lang="ts" setup>
import { IChatContainerConfig } from './components/interfaces/interfaces';
import './index';

const config: IChatContainerConfig = {
  VITE_BASE_MODE: 'app',
  CHAT_AUTH_API: 'http://localhost:3000',
  CHAT_MASTRA_URL: 'http://localhost:4111',
  VITE_OPENIM_API_DOMAIN: 'http://localhost:10002',
  VITE_OPENIM_WS_DOMAIN: 'ws://localhost:10023'
};

const token =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NDYsInJvbGVzIjoxOCwibG9naW4iOiLQmtC90Y_Qt9GP0L0g0K0uINCQLiIsInRhYmVsIjoiMDQ1IiwicmVtb3RlX3dvcmsiOnRydWUsImlhdCI6MTc2NDYwMDQyNSwiZXhwIjoxNzY0Njg2ODI1fQ.HRUFPFKlrxth2iH-mpjZ94gEZ1Xr_65_pe2u-jiwn8E';
</script>
