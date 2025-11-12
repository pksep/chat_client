<template>
  <main :class="chatContainerClasses">
    <Header
      v-if="state.chapter"
      class="chat__header"
      :chapter="state.chapter"
      :contact="state.contact"
      @unmount-click="handleHeaderClick"
      @unmount-exit="handleExit"
      @unmount-information="handleHeaderClick"
      @unmount-clear="handleClearClick"
    />
    <HeaderMenu
      class="chat__header-menu"
      v-else
      @unmount-chapter="unmountHeaderMenuChapter"
    />
    <Menu
      :user="props.user"
      class="chat__menu"
      @unmount-collapse="handleCollapse"
      @unmount-new-contact="handleNewContact"
      @unmount-chapter="unmountMenuChapter"
    />
    <Chat
      :base-url="props.baseUrl"
      :chapter="state.chapter"
      class="chat__messages"
      ref="chatRef"
      @unmount-chapter="unmountHeaderMenuChapter"
    />
    <MenuInfo
      class="chat__info"
      :open="state.isMenuOpen"
      :contact="state.contact"
      @unmount-collapse="handleMenuCollapse"
      @unmount-new-contact="handleNewContact"
    />
  </main>
  <NewContactModal
    :open="state.isNewContactOpen"
    :contacts="[state.contact]"
    @unmount-close="closeContactModal"
  />
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import Header from './Header/Header.vue';
import HeaderMenu from './Header/HeaderMenu.vue';
import Menu from './Menu.vue';
import Chat from './Chat.vue';
import MenuInfo from './MenuInfo.vue';
import NewContactModal from './NewChat/NewContact.vue';
import type { IChatContainerProps } from './interfaces/interfaces';

const state = reactive({
  isCollapse: false,
  isMenuOpen: false,
  chapter: null,
  contact: null,
  isNewContactOpen: false
});

const props = defineProps<IChatContainerProps>();

const chatRef = ref<InstanceType<typeof Chat> | null>(null);

const chatContainerClasses = computed(() => [
  'chat-container',
  { collapse: state.isCollapse, 'menu-collapse': !state.isMenuOpen }
]);

const handleCollapse = (isCollapse: boolean): void => {
  state.isCollapse = isCollapse;
};

const handleMenuCollapse = (isOpen: boolean): void => {
  state.isMenuOpen = isOpen;
};

const handleHeaderClick = (): void => {
  state.isMenuOpen = true;
};

const unmountHeaderMenuChapter = (name: string): void => {
  state.chapter = name;
};

const unmountMenuChapter = (config): void => {
  if (!config?.name) {
    state.chapter = null;
    return;
  }
  state.chapter = config.name;
  state.contact = config.contact;
};

const handleNewContact = (config): void => {
  state.isNewContactOpen = config.isChapterOpen;
};

const closeContactModal = (): void => {
  state.isNewContactOpen = false;
};

const handleClearClick = (): void => {
  if (state.chapter === 'ai' && chatRef.value) {
    chatRef.value.handleClear();
  }
};

const handleExit = (): void => {
  state.chapter = null;
};
</script>
