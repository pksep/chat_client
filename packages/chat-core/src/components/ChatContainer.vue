<template>
  <main :class="['chat-container', { collapse: state.isCollapse }]">
    <Header class="chat__header" />
    <Menu class="chat__menu" @unmount-collapse="handleCollapse" />
    <Chat class="chat__messages" />
  </main>
</template>
<script setup lang="ts">
import { reactive } from 'vue';
import Header from './Header.vue';
import Menu from './Menu.vue';
import Chat from './MessageList.vue';

const state = reactive({
  isCollapse: false
});

const handleCollapse = (isCollapse: boolean): void => {
  state.isCollapse = isCollapse;
};
</script>
<style scoped>
.chat-container {
  display: grid;
  height: 100vh;
  background-color: var(--blue15);
  grid-template-areas: 'menu header' 'menu chat';
  grid-template-columns: var(--size-left-menu, 30%) auto;
  grid-template-rows: 56px auto;
}

.chat-container.collapse {
  --size-left-menu: 70px;
}

.chat__header {
  grid-area: header;
  align-self: start;
}

.chat__menu {
  grid-area: menu;
}

.chat__messages {
  grid-area: chat;
  align-self: start;
}

@media screen and (width <= 896px) {
  .chat-container.collapse {
    --size-left-menu: 75px;
  }
}
</style>
