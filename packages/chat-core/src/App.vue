<template>
  <!-- eslint-disable-next-line vue/html-self-closing-->
  <chat-container :base-url.prop="mastraUrl" :user.prop="user">
  </chat-container>
</template>
<script lang="ts" setup>
import './index';

const mastraUrl = import.meta.env.VITE_MASTRA_BASE_URL;
const user = {
  avatarUrl: 'http://localhost:9000/sep-local/61f0f2d6-82b1-422a-b426-47a2e921e4c9.jpg',
  id: '46',
  ex: JSON.stringify({ tabel: '045', initial: 'Князян Эдгар Арсенович' }),
  avatarAlt: 'User with a circle face',
  nickname: 'Князян Э. А.'
};

// const user = {
//   // avatarUrl: '/avatar-user.png',
//   id: '51',
//   avatarAlt: 'User with a circle face',
//   ex: JSON.stringify({ tabel: '050', initial: 'Румянцев Тимофей Дмитриевич' }),
//   nickname: 'Румянцев Т. Д.'
// };
</script>
