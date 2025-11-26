<template>
  <!-- eslint-disable-next-line vue/html-self-closing-->
  <chat-container :base-url.prop="mastraUrl" :token.prop="token">
  </chat-container>
</template>
<script lang="ts" setup>
import './index';

const mastraUrl = import.meta.env.VITE_MASTRA_BASE_URL;

const token =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VySUQiOiI0NiIsIlBsYXRmb3JtSUQiOjUsImV4cCI6MTc3MTkzMTQyMSwiaWF0IjoxNzY0MTU1NDE2fQ.A4NXEp48LgdiTUQzhpnQ1SEtqkidvi-YP9TtODbXIzU';
// const user = {
//   // avatarUrl: '/avatar-user.png',
//   id: '51',
//   avatarAlt: 'User with a circle face',
//   ex: JSON.stringify({ tabel: '050', initial: 'Румянцев Тимофей Дмитриевич' }),
//   nickname: 'Румянцев Т. Д.'
// };
</script>
