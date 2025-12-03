<template>
  <!-- eslint-disable-next-line vue/html-self-closing-->
  <chat-container :base-url.prop="mastraUrl" :user.prop="user">
  </chat-container>
</template>
<script lang="ts" setup>
import './index';

const mastraUrl = import.meta.env.VITE_MASTRA_BASE_URL;
const user = {
  avatarUrl:
    'http://localhost:9000/sep-local/61f0f2d6-82b1-422a-b426-47a2e921e4c9.jpg',
  id: '46',
  ex: JSON.stringify({ tabel: '045', initial: 'User Full Name' }),
  avatarAlt: 'User with a circle face',
  nickname: 'User N.A.'
};
</script>
