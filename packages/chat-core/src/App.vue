<template>
  <!-- eslint-disable-next-line vue/html-self-closing-->
  <chat-container :base-url="mastraUrl" :user.prop="user"> </chat-container>
</template>
<script lang="ts" setup>
import './index';

const mastraUrl = import.meta.env.VITE_MASTRA_BASE_URL;
// const user = {
//   // avatarUrl: '/avatar-user.png',
//   id: 'EdgarID',
//   avatarAlt: 'User with a circle face',
//   name: 'Edgar',
//   nickname: 'Edgar'
// };

// const user = {
//   // avatarUrl: '/avatar-user.png',
//   id: 't1',
//   avatarAlt: 'User with a circle face',
//   name: 'Jane',
//   nickname: 'Jane'
// };

// const user = {
//   // avatarUrl: '/avatar-user.png',
//   id: 'NarekID',
//   avatarAlt: 'User with a circle face',
//   name: 'Narek',
//   nickname: 'Narek'
// };

const user = {
  // avatarUrl: '/avatar-user.png',
  id: 'GarikID',
  avatarAlt: 'User with a circle face',
  name: 'Garik',
  nickname: 'Garik'
};

// const user = {
//   // avatarUrl: '/avatar-user.png',
//   id: 'KarenID',
//   avatarAlt: 'User with a circle face',
//   name: 'Karen',
//   nickname: 'Karen'
// };
</script>
