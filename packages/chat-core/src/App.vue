<template>
  <!-- eslint-disable-next-line vue/html-self-closing-->
  <chat-container :base-url="mastraUrl" :user.prop="user"> </chat-container>
</template>
<script lang="ts" setup>
import './index';

const mastraUrl = import.meta.env.VITE_MASTRA_BASE_URL;
const user = {
  // avatarUrl: '/avatar-user.png',
  avatarAlt: 'User with a circle face',
  name: 'Jonn Doe',
  nickname: 'JonnDoe'
};
</script>
