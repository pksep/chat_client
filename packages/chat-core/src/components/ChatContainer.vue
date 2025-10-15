<template>
  <main
    :class="[
      'chat-container',
      { collapse: state.isCollapse, 'menu-collapse': !state.isMenuOpen }
    ]"
  >
    <Header
      class="chat__header"
      :chapter="state.chapter"
      @unmount-click="handleHeaderClick"
      @unmount-information="handleHeaderClick"
    />
    <Menu
      class="chat__menu"
      @unmount-collapse="handleCollapse"
      @unmount-new-contact="handleNewContact"
      @unmount-chapter="unmountMenuChapter"
    />
    <Chat class="chat__messages" :chapter="state.chapter" />
    <MenuInfo
      class="chat__info"
      :open="state.isMenuOpen"
      @unmount-collapse="handleMenuCollapse"
      @unmount-new-contact="handleNewContact"
    />
  </main>
  <Teleport to="body">
    <NewContactModal
      :open="modalState.newContactOpen"
      @unmount-close="closeContactModal"
    />
  </Teleport>
</template>
<script setup lang="ts">
import { reactive } from 'vue';
import Header from './Header.vue';
import Menu from './Menu.vue';
import Chat from './MessageList.vue';
import MenuInfo from './MenuInfo.vue';
import NewContactModal from './NewChat/NewContact.vue';

const state = reactive({
  isCollapse: false,
  isMenuOpen: false,
  chapter: null
});

const modalState = reactive({
  newContactOpen: false,
  addUserOpen: false
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

const unmountMenuChapter = (config: { name: string } | null): void => {
  if (!config?.name) {
    state.chapter = null;
    return;
  }
  state.chapter = config.name;
};

const handleNewContact = (isModalOpen: boolean): void => {
  modalState.newContactOpen = isModalOpen;
};

const closeContactModal = (): void => {
  modalState.newContactOpen = false;
};
</script>
<style scoped>
.chat-container {
  --size-right-menu: 404px;
  --size-left-menu: 325px;
  display: grid;
  height: 100vh;
  background-color: var(--blue15);
  grid-template-areas: 'menu header info' 'menu chat info';
  grid-template-columns: var(--size-left-menu) auto var(--size-right-menu);
  grid-template-rows: 56px auto;
}

.chat-container.collapse {
  --size-left-menu: 75px;
}

.chat-container.menu-collapse {
  --size-right-menu: 0px;
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
  .chat__info {
    display: none;
  }
  .chat-container {
    --size-right-menu: 0px;
    --size-left-menu: 75px;
    grid-template-areas:
      'menu header'
      'menu chat';
  }
}
</style>
