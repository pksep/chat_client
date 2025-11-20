<template>
  <main :class="chatContainerClasses">
    <Header
      v-if="!isShowContactList(state.chapter)"
      class="chat__header"
      :chapter="state.chapter"
      :contact="state.contact"
      @unmount-click="handleHeaderClick"
      @unmount-exit="handleExit"
      @unmount-information="handleInformationClick"
      @unmount-clear="handleClearClick"
    />
    <HeaderMenu
      class="chat__header-menu"
      v-else-if="isMobile"
      @unmount-chapter="unmountHeaderMenuChapter"
    />
    <Menu
      :user="authUser"
      class="chat__menu"
      @unmount-collapse="handleCollapse"
      @unmount-new-contact="handleNewContact"
      @unmount-new-group="handleNewGroup"
      @unmount-chapter="unmountMenuChapter"
    />
    <Chat
      :user="authUser"
      :base-url="props.baseUrl"
      :contacts="state.users.filter(user => user.id !== authUser.id)"
      :chapter="state.chapter"
      :contact-id="state.contact?.id"
      :conversion-id="state.contact?.conversionId"
      class="chat__messages"
      ref="chatRef"
      @unmount-chapter="unmountMenuChapter"
      @unmount-contact="unmountMenuChapter"
    />
    <MenuInfo
      class="chat__info"
      :open="state.isMenuDesktopOpen && !isMobile"
      :contact="state.contact"
      :active-tab-id="state.activeTabId"
      @unmount-collapse="handleMenuToggle"
      @unmount-new-contact="handleNewContact"
      @unmount-new-group="handleNewGroup"
    />
  </main>
  <NewContactModal
    :contacts="state.users.filter(user => user.id !== authUser.id)"
    :open="state.isNewContactOpen"
    @unmount-close="closeModals"
    @unmount-new-contact="handleNewContactMessage"
  />

  <NewGroupModal
    :user="authUser"
    :contacts="state.users.filter(user => user.id !== authUser.id)"
    :open="state.isNewGroupOpen"
    @unmount-close="closeModals"
    @unmount-new-group="handleNewGroupMessage"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import Header from './Header/Header.vue';
import HeaderMenu from './Header/HeaderMenu.vue';
import Menu from './Menu.vue';
import Chat from './Chat.vue';
import MenuInfo from './MenuInfo.vue';
import NewContactModal from './NewChat/NewContactModal.vue';
import type { IChatContainerProps, IUserProps } from './interfaces/interfaces';
import {
  appendUserAttributes,
  fetchAllUsers,
  getUsersList
} from '../composables/useUsers';
import { isShowContactList } from '../composables/useShowContactList';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_MD } from '../utils/constants';
import NewGroupModal from './NewChat/NewGroupModal.vue';
import { getGroupList } from '../services/useGroup';
import { getConversationList } from '../services/useConversions';

const { state: isMobile } = useResizeState(MAX_W_MD);

const state = reactive({
  isCollapse: false,
  isMenuDesktopOpen: false,
  isMenuMobileOpen: false,
  activeTabId: null,
  chapter: isMobile ? 'assistant' : null,
  groupId: null,
  contact: null,
  isNewContactOpen: false,
  isNewGroupOpen: false,
  users: computed(() => getUsersList()),
  groups: computed(() => getGroupList()),
  conversations: computed(() => getConversationList())
});

const props = defineProps<IChatContainerProps>();

const authUser = computed(() => appendUserAttributes(props.user));

const chatRef = ref<InstanceType<typeof Chat> | null>(null);

const chatContainerClasses = computed(() => [
  'chat-container',
  { collapse: state.isCollapse, 'menu-collapse': !state.isMenuDesktopOpen }
]);

const handleCollapse = (isCollapse: boolean): void => {
  state.isCollapse = isCollapse;
};

const handleMenuToggle = (isOpen: boolean): void => {
  state.isMenuDesktopOpen = isOpen;
};

const handleHeaderClick = (): void => {
  if (!isMobile.value) {
    state.activeTabId = 1;
    state.isMenuDesktopOpen = true;
    return;
  }
  state.isMenuMobileOpen = true;
};

const unmountHeaderMenuChapter = (
  config: { nickname: string } | string | null
): void => {
  if (typeof config === 'string') {
    state.chapter = config;
    if (config === 'ai') {
      state.contact = null;
    }
  } else if (config && config.nickname) {
    state.chapter = config.nickname;
    state.contact = config;
  } else {
    state.chapter = null;
    state.contact = null;
  }
};

const findContactOrGroupById = (id: string) => {
  const conversation = state.conversations.find(conv => conv.id === id);
  if (!conversation) {
    return state.groups.find(group => group.id === id);
  }
  return conversation;
};

const unmountMenuChapter = (
  config: { contact: IUserProps; groupId?: string } | string | null
): void => {
  if (typeof config === 'string') {
    state.chapter = config;
    // Find the contact or group by id if needed
    if (config === 'ai') {
      state.contact = null;
    } else {
      const foundContact = findContactOrGroupById(config);
      state.contact = { ...foundContact, conversionId: foundContact.id };
      state.chapter = config;
    }
  } else if (config && config.contact) {
    state.chapter = config.contact.nickname;
    state.contact = config.contact;
  } else {
    state.chapter = null;
    state.contact = null;
  }
};

const handleNewContact = (config): void => {
  state.isNewContactOpen = config.isChapterOpen;
};

const handleNewGroup = (config): void => {
  state.isNewGroupOpen = config.isChapterOpen;
};

const closeModals = (): void => {
  state.isNewContactOpen = false;
  state.isNewGroupOpen = false;
};

const handleInformationClick = (): void => {
  state.activeTabId = 2;
};

const handleClearClick = (): void => {
  if (state.chapter === 'ai' && chatRef.value) {
    chatRef.value.handleClear();
  }
};

const handleNewContactMessage = async (contact: IUserProps): Promise<void> => {
  state.chapter = contact.nickname;
  const [smallerUserID, largerUserID] = [authUser.value.id, contact.id].sort();

  state.contact = {
    ...contact,
    conversionId: `si_${smallerUserID}_${largerUserID}`
  };
};

const handleNewGroupMessage = async () => {
  const group = getGroupList()[0];

  state.contact = {
    conversionId: group.id,
    nickname: group.nickname
  };

  state.groupId = group.id;

  state.chapter = state.contact.nickname;
};

const handleExit = (): void => {
  state.chapter = 'assistant';
};

onMounted(async () => {
  await fetchAllUsers();
});
</script>
