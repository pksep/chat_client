<template>
  <main class="chat-container">
    <Menu />
  </main>
</template>
<script setup lang="ts">
import Menu from './components/Menu.vue';
</script>
<style scoped>
.chat-container {
  display: grid;
  height: 100vh;
  background-color: var(--blue15);
}
</style>
