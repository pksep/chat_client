<template>
  <main
    :class="[
      'chat-container',
      { collapse: state.isCollapse, 'menu-collapse': !state.isMenuOpen }
    ]"
  >
    <Header class="chat__header" @unmount-click="handleHeaderClick" />
    <Menu
      class="chat__menu"
      @unmount-collapse="handleCollapse"
      @unmount-new-contact="handleNewContact"
    />
    <Chat class="chat__messages" />
    <MenuInfo
      class="chat__info"
      :open="state.isMenuOpen"
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
  isMenuOpen: false,
  open: false
});

const handleCollapse = (isCollapse: boolean): void => {
  state.isCollapse = isCollapse;
};

const handleMenuCollapse = (isOpen: boolean): void => {
  state.isMenuOpen = isOpen;
};

const handleHeaderClick = (): void => {
  state.isMenuOpen = true;
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
  grid-template-columns: var(--size-left-menu, 345px) auto var(
      --size-right-menu,
      404px
    );
  grid-template-rows: 56px auto;
}

.chat-container.collapse {
  --size-left-menu: 70px;
}

.chat-container.menu-collapse {
  --size-right-menu: 0;
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
