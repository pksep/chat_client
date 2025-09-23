<template>
  <main class="chat-container">
    <Header class="chat__header" />
    <Menu class="chat__menu" />
    <Chat class="chat__chat" />
  </main>
</template>
<script setup lang="ts">
import Header from './components/Header.vue';
import Menu from './components/Menu.vue';
import Chat from './components/Chat.vue';
</script>
<style scoped>
.chat-container {
  display: grid;
  height: 100vh;
  background-color: var(--blue15);
  grid-template-areas: 'menu header' 'menu chat';
  grid-template-columns: 30% auto;
  grid-template-rows: 56px auto;
}

.chat__header {
  grid-area: header;
  align-self: start;
}

.chat__menu {
  grid-area: menu;
}

.chat__chat {
  grid-area: chat;
  align-self: start;
}
</style>
