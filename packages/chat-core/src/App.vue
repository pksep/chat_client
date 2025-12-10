<template>
  <!-- eslint-disable-next-line vue/html-self-closing-->
  <chat-container :config.prop="config" :token.prop="token"> </chat-container>
</template>
<script lang="ts" setup>
import { IChatContainerConfig } from './components/interfaces/interfaces';
import './index';

const config: IChatContainerConfig = {
  CHAT_BASE_MODE: 'app',
  CHAT_AUTH_API: 'http://localhost:3000',
  CHAT_MASTRA_URL: 'http://localhost:4111',
  CHAT_OPENIM_API_DOMAIN: 'http://localhost:10002',
  CHAT_OPENIM_WS_DOMAIN: 'ws://localhost:10023'
};

const token =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwicm9sZXMiOjEsImxvZ2luIjoi0J_QtdGA0L7QsiDQlC7QkC4iLCJ0YWJlbCI6IjAwMSIsInJlbW90ZV93b3JrIjp0cnVlLCJpYXQiOjE3NjUyOTAxMDQsImV4cCI6MTc2NTM3NjUwNH0.b-RrgAneJgqtqd4f2ewBp5SG5au3kSmwuj6W09YSFH4';
</script>
