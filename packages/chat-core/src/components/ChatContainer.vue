<template>
  <main :class="chatContainerClasses">
    <Header
      v-if="!isShowContactList(state.chapter)"
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
      v-else-if="isMobile"
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
      :contact-id="state.contact?.id"
      :conversion-id="state.contact?.conversionId"
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
    @unmount-close="closeContactModal"
    @unmount-new-contact="handleNewContactMessage"
    :contacts="users"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import Header from './Header/Header.vue';
import HeaderMenu from './Header/HeaderMenu.vue';
import Menu from './Menu.vue';
import Chat from './Chat.vue';
import MenuInfo from './MenuInfo.vue';
import NewContactModal from './NewChat/NewContact.vue';
import type { IChatContainerProps, IUserProps } from './interfaces/interfaces';
import { useUsers } from '../composables/useUsers';
import { isShowContactList } from '../composables/useShowContactList';
import { sendMessageIM } from '../services/useOpenIM';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_MD } from '../utils/constants';

const { state: isMobile } = useResizeState(MAX_W_MD);

const state = reactive({
  isCollapse: false,
  isMenuOpen: false,
  chapter: isMobile ? 'assistant' : null,
  contact: null,
  isNewContactOpen: false
});

const props = defineProps<IChatContainerProps>();

const { fetchAllUsers, users } = useUsers();

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

const unmountHeaderMenuChapter = (
  config: { name: string; contact: IUserProps } | string | null
): void => {
  if (typeof config === 'string') {
    state.chapter = config;
    if (config === 'ai') {
      state.contact = null;
    }
  } else if (config && config.name) {
    state.chapter = config.name;
    state.contact = config.contact;
  } else {
    state.chapter = null;
    state.contact = null;
  }
};

const unmountMenuChapter = (
  config: { name: string; contact: IUserProps } | string | null
): void => {
  if (typeof config === 'string') {
    // Handle string format from other components
    state.chapter = config;
    if (config === 'ai') {
      state.contact = null;
    }
  } else if (config && config.name) {
    // Handle object format from Menu component
    state.chapter = config.name;
    state.contact = config.contact;
  } else {
    // Handle null case
    state.chapter = null;
    state.contact = null;
  }
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

const handleNewContactMessage = async (contact): Promise<void> => {
  state.chapter = contact.name;
  state.contact = contact;

  console.log(contact);

  await sendMessageIM({
    message: '',
    to: contact.userID || '',
    groupId: ''
  });
};

const handleExit = (): void => {
  state.chapter = 'assistant';
};

onMounted(async () => {
  await fetchAllUsers();
});
</script>
