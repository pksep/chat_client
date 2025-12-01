<template>
  <!-- eslint-disable-next-line vue/html-self-closing-->
  <chat-container :base-url.prop="mastraUrl" :token.prop="token">
  </chat-container>
</template>
<script lang="ts" setup>
import './index';

const mastraUrl = import.meta.env.VITE_MASTRA_BASE_URL;

const token =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJVc2VySUQiOiI0NiIsIlBsYXRmb3JtSUQiOjUsImV4cCI6MTc3MjAxMTE1NCwiaWF0IjoxNzY0MjM1MTQ5fQ.xFQZqcEoZv7jUWh04z8_cPLq9rcAr-NMXWcd0fZTvWI';
</script>
