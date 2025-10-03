<template>
  <main
    :class="[
      'chat-container',
      { collapse: state.isCollapse, 'menu-collapse': state.isCollapseMenu }
    ]"
  >
    <Header class="chat__header" />
    <Menu
      class="chat__menu"
      @unmount-collapse="handleCollapse"
      @unmount-new-contact="handleNewContact"
    />
    <Chat class="chat__messages" />
    <MenuInfo
      class="chat__info"
      v-if="!state.isCollapse"
      @unmount-collapse="handleMenuCollapse"
    />
  </main>
  <NewContactModal :open="state.open" />
  <AddUser :open="false" />
</template>
<script setup lang="ts">
import { reactive } from 'vue';
import Header from './Header.vue';
import Menu from './Menu.vue';
import Chat from './MessageList.vue';
import MenuInfo from './MenuInfo.vue';
import NewContactModal from './NewChat/NewContact.vue';
import AddUser from './NewChat/AddUser.vue';

const state = reactive({
  isCollapse: false,
  isCollapseMenu: false,
  open: false
});

const handleCollapse = (isCollapse: boolean): void => {
  state.isCollapse = isCollapse;
};

const handleMenuCollapse = (isCollapse: boolean): void => {
  state.isCollapseMenu = isCollapse;
};

const handleNewContact = (isModalOpen: boolean): void => {
  state.open = isModalOpen;
};
</script>
<style scoped>
.chat-container {
  display: grid;
  height: 100vh;
  background-color: var(--blue15);
  grid-template-areas: 'menu header info' 'menu chat info';
  grid-template-columns: var(--size-left-menu, 30%) auto;
  grid-template-rows: 56px auto;
}

.chat-container.collapse {
  --size-left-menu: 70px;
}

.chat-container.menu-collapse {
  grid-template-areas:
    'menu header'
    'menu chat';
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

.chat__info {
  grid-area: info;
}

@media screen and (width <= 896px) {
  .chat-container.collapse {
    --size-left-menu: 75px;
    grid-template-areas:
      'menu header'
      'menu chat';
  }
}
</style>
