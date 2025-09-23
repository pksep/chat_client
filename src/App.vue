<template>
  <main class="chat-container">
    <Header class="chat__header" />
    <Menu class="chat__menu" />
  </main>
</template>
<script setup lang="ts">
import Header from './components/Header.vue';
import Menu from './components/Menu.vue';
</script>
<style scoped>
.chat-container {
  display: grid;
  height: 100vh;
  background-color: var(--blue15);
  grid-template-areas: 'menu header' 'menu .';
  grid-template-columns: 30% auto;
}

.chat__header {
  grid-area: header;
  align-self: start;
}

.chat__menu {
  grid-area: menu;
}
</style>
