<template>
  <main
    :class="state.chatContainerClasses"
    :data-testid="`${props.dataTestid}-ChatContainer-Container`"
  >
    <Header
      v-if="!isShowContactList(state.chapter)"
      class="chat__header"
      :chapter="state.chapter"
      :members="state.users.filter(user => user.id !== authUser.id)"
      :contact="state.contact"
      :dataTestid="`${props.dataTestid}-ChatContainer-Header`"
      @unmount-click="handleHeaderClick"
      @unmount-contact="handleChangeContact"
      @unmount-exit="handleExit"
      @unmount-information="handleInformationClick"
      @unmount-clear="handleClearClick"
    />
    <HeaderMenu
      class="chat__header-menu"
      v-else-if="isMobile"
      :dataTestid="`${props.dataTestid}-ChatContainer-HeaderMenu`"
      @unmount-chapter="unmountHeaderMenuChapter"
    />
    <Menu
      :user="authUser"
      class="chat__menu"
      :dataTestid="`${props.dataTestid}-ChatContainer-Menu`"
      @unmount-collapse="handleCollapse"
      @unmount-new-contact="handleNewContact"
      @unmount-new-group="handleNewGroup"
      @unmount-chapter="unmountMenuChapter"
    />
    <Chat
      :user="authUser"
      :base-url="props.baseUrl"
      :chapter="state.chapter"
      :contacts="state.users.filter(user => user.id !== authUser.id)"
      :contact="state.contact"
      class="chat__messages"
      ref="chatRef"
      :dataTestid="`${props.dataTestid}-ChatContainer-Chat`"
      @unmount-chapter="unmountMenuChapter"
      @unmount-contact="handleNewContact"
    />
    <MenuInfo
      class="chat__info"
      :open="state.isMenuDesktopOpen && !isMobile"
      :contact="state.contact"
      :members="state.users.filter(user => user.id !== authUser.id)"
      :active-tab-id="state.activeTabId"
      :dataTestid="`${props.dataTestid}-ChatContainer-MenuInfo`"
      @unmount-collapse="handleMenuToggle"
      @unmount-contact="handleChangeContact"
    />
  </main>
  <NewContactModal
    :contacts="state.users.filter(user => user.id !== authUser.id)"
    :open="state.isNewContactOpen"
    :data-testid="`${props.dataTestid}-ChatContainer-NewContactModal`"
    @unmount-close="closeModals"
    @unmount-new-contact="handleNewContactMessage"
  />

  <NewGroupModal
    :user="authUser"
    :contacts="state.users.filter(user => user.id !== authUser.id)"
    :open="state.isNewGroupOpen"
    :data-testid="`${props.dataTestid}-ChatContainer-NewGroupModal`"
    @unmount-close="closeModals"
    @unmount-new-group="handleNewGroupMessage"
  />
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watchEffect } from 'vue';
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
import { MAX_W_MD, MAX_W_XL } from '../utils/constants';
import NewGroupModal from './NewChat/NewGroupModal.vue';
import { getGroupList } from '../services/useGroup';
import { getConversationList } from '../services/useConversions';

const { state: isMobile } = useResizeState(MAX_W_MD);

const state = reactive({
  isMenuDesktopOpen: false,
  isMenuMobileOpen: false,
  activeTabId: null,
  chapter: isMobile ? 'assistant' : null,
  groupId: null,
  contact: null,
  isNewContactOpen: false,
  isNewGroupOpen: false,
  chatContainerClasses: [
    'chat-container',
    { collapse: false, 'menu-collapse': true }
  ],
  users: computed(() => getUsersList()),
  groups: computed(() => getGroupList()),
  conversations: computed(() => getConversationList())
});

const props = withDefaults(defineProps<IChatContainerProps>(), {
  dataTestid: () => 'ChatContainer'
});

const authUser = computed(() => appendUserAttributes(props.user));

const chatRef = ref<InstanceType<typeof Chat> | null>(null);

const { state: isCollapse, toggle } = useResizeState({
  breakpoint: MAX_W_XL,
  storageKey: 'menu-collapse'
});

watchEffect(() => {
  state.chatContainerClasses = [
    'chat-container',
    { collapse: isCollapse.value, 'menu-collapse': !state.isMenuDesktopOpen }
  ];
});

const handleCollapse = (): void => {
  toggle();
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
  if (isMobile.value) {
    state.contact = config;
    state.chapter = config.nickname;
    return;
  }
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
  state.isMenuDesktopOpen = true;
  state.activeTabId = 2;
};

const handleClearClick = (): void => {
  if (state.chapter === 'ai' && chatRef.value) {
    chatRef.value.handleClear();
    window.location.reload();
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

const handleNewGroupMessage = async (group: any): Promise<void> => {
  if (!group || !group.conversationID) {
    console.error('Invalid group data');
    closeModals();
    return;
  }

  state.contact = {
    conversionId: group.conversationID,
    nickname: group.showName,
    groupId: group.groupID,
    avatarUrl: group.faceURL
  };

  state.groupId = group.groupID;

  state.chapter = group.showName;
};

const handleChangeContact = (contact: IUserProps): void => {
  state.contact = contact;
};

const handleExit = (): void => {
  state.chapter = 'assistant';
};

onMounted(async () => {
  await fetchAllUsers();
});
</script>
