<template>
  <!-- eslint-disable-next-line vue/html-self-closing-->
  <chat-container :base-url="mastraUrl" :user.prop="user"> </chat-container>
</template>
<script lang="ts" setup>
import './index';

const mastraUrl = import.meta.env.VITE_MASTRA_BASE_URL;
const user = {
  // avatarUrl: '/avatar-user.png',
  id: '46',
  nickname: '045',
  avatarAlt: 'User with a circle face',
  name: 'Князев Эдгар Арсенович'
};

// const user = {
//   // avatarUrl: '/avatar-user.png',
//   id: '51',
//   avatarAlt: 'User with a circle face',
//   ex: '050',
//   nickname: 'Румянцев Тимофей Дмитриевич'
// };
</script>
