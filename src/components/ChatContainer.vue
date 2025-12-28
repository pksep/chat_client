<template>
  <Loading
    v-if="state.isLoading"
    message="Загрузка приложения..."
    :dataTestid="`${props.dataTestid}-ChatContainer-Loading`"
  />
  <main
    v-else
    :class="state.chatContainerClasses"
    :data-testid="`${props.dataTestid}-ChatContainer-Container`"
  >
    <Header
      v-if="state.isChapter"
      class="chat__header"
      :chapter="state.chapter"
      :members="filteredMembers"
      :contact="state.contact"
      :data-testid="`${props.dataTestid}-ChatContainer-Header`"
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
      :active-chapter="state.chapter"
      @unmount-chapter="unmountHeaderMenuChapter"
    />
    <Menu
      :user="authUser"
      :chapter="state.chapter"
      class="chat__menu"
      :dataTestid="`${props.dataTestid}-ChatContainer-Menu`"
      @unmount-collapse="handleCollapse"
      @unmount-new-contact="handleNewContact"
      @unmount-new-group="handleNewGroup"
      @unmount-chapter="unmountMenuChapter"
    />
    <Chat
      :user="authUser"
      :base-url="props.config.CHAT_MASTRA_URL"
      :chapter="state.chapter"
      :contacts="filteredContacts"
      :contact="state.contact"
      class="chat__messages"
      ref="chatRef"
      :dataTestid="`${props.dataTestid}-ChatContainer-Chat`"
      @unmount-chapter="unmountMenuChapter"
      @unmount-contact="handleNewContact"
    />
    <template v-if="!isMobile">
      <MenuInfo
        class="chat__info"
        :open="state.isMenuDesktopOpen"
        :contact="state.contact"
        :members="filteredMembers"
        :active-tab-id="state.activeTabId"
        :dataTestid="`${props.dataTestid}-ChatContainer-MenuInfo`"
        @unmount-collapse="handleMenuToggle"
        @unmount-contact="handleChangeContactFromMenuInfo"
      />
    </template>
    <NewContactModal
      :contacts="filteredContacts"
      :open="state.isNewContactOpen"
      :data-testid="`${props.dataTestid}-ChatContainer-NewContactModal`"
      @unmount-close="closeModals"
      @unmount-new-contact="handleNewContactMessage"
    />

    <NewGroupModal
      :user="authUser"
      :contacts="filteredContacts"
      :open="state.isNewGroupOpen"
      :data-testid="`${props.dataTestid}-ChatContainer-NewGroupModal`"
      @unmount-close="closeModals"
      @unmount-new-group="handleNewGroupMessage"
    />
  </main>
  <NewContactModal
    :contacts="state.users.filter(user => user.id !== authUser?.id)"
    :open="state.isNewContactOpen"
    :data-testid="`${props.dataTestid}-ChatContainer-NewContactModal`"
    @unmount-close="closeModals"
    @unmount-new-contact="handleNewContactMessage"
  />

  <NewGroupModal
    :user="authUser"
    :contacts="state.users.filter(user => user.id !== authUser?.id)"
    :open="state.isNewGroupOpen"
    :data-testid="`${props.dataTestid}-ChatContainer-NewGroupModal`"
    @unmount-close="closeModals"
    @unmount-new-group="handleNewGroupMessage"
  />

  <MobileModal
    v-if="isMobile"
    class="mobile-modal"
    headerClass="hidden"
    :show-divider="false"
    :open="state.isPwaModalOpen && canInstall && !isInstalled"
    @unmount-close="closeModals"
  >
    <Button @click="handleInstall">Загрузить на устройство</Button>
    <Button :type="ButtonTypeEnum.secondary" @click="closeModals"
      >Закрыть</Button
    >
  </MobileModal>
</template>

<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  onMounted,
  reactive,
  ref,
  watch
} from 'vue';
import Header from './Header/Header.vue';
import HeaderMenu from './Header/HeaderMenu.vue';
import Menu from './Menu.vue';
import Chat from './Chat.vue';
import MenuInfo from './MenuInfo.vue';
import Loading from './Loading.vue';
import type {
  IChatContainerProps,
  IContactProps,
  IUserProps
} from './interfaces/interfaces';
import { appendUserAttributes, getUsersList } from '../composables/useUsers';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_MD, MAX_W_XL } from '../utils/constants';
import { getGroupList, fetchGroupMemberCount } from '../services/useGroup';
import { getConversationList } from '../services/useConversions';
import { getAuthUser } from '../composables/useAuth';
import MobileModal from './UI/MobileModal.vue';
import { Button, ButtonTypeEnum } from '@pksep/yui';
import { usePwaInstall } from '../composables/usePwaInstall';
import { markAsRead } from '../services/useOpenIM';
import { useAndroidBackButton } from '../composables/useAndroidBackButton';
import {
  currentRoute,
  initRoute,
  navigateToDirect,
  navigateToGroup,
  navigateToDefault,
  setupUrlWatcher
} from '../composables/useUrlRouting';

const NewContactModal = defineAsyncComponent(
  () => import('./NewChat/NewContactModal.vue')
);
const NewGroupModal = defineAsyncComponent(
  () => import('./NewChat/NewGroupModal.vue')
);

const { canInstall, handleInstall, isInstalled } = usePwaInstall();

const { state: isMobile } = useResizeState(MAX_W_MD);

const { state: isCollapse, toggle } = useResizeState({
  breakpoint: MAX_W_XL,
  storageKey: 'menu-collapse'
});

const state = reactive({
  isPwaModalOpen: true,
  isMenuDesktopOpen: false,
  isMenuMobileOpen: false,
  activeTabId: null,
  chapter: isMobile.value ? 'assistant' : null,
  groupId: null,
  contact: null,
  isNewContactOpen: false,
  isNewGroupOpen: false,
  isLoading: true,
  chatContainerClasses: computed(() => [
    'chat-container',
    { collapse: isCollapse.value },
    {
      'menu-collapse':
        state.chapter === 'ai' || state.chapter === 'assistant'
          ? true
          : !state.isMenuDesktopOpen
    }
  ]),
  isChapter: false,
  users: getUsersList(),
  groups: getGroupList(),
  conversations: getConversationList()
});

const props = withDefaults(defineProps<IChatContainerProps>(), {
  dataTestid: 'ChatContainer'
});

const authUser = computed(() => appendUserAttributes(getAuthUser()));

const filteredContacts = computed(() => {
  const authId = authUser.value?.id;
  if (!authId) return [];
  return state.users.filter(user => user.id !== authId);
});

const filteredMembers = computed(() => {
  const authId = authUser.value?.id;
  if (!authId) return [];
  return state.users.filter(user => user.id !== authId);
});

watch(
  () => getUsersList(),
  newUsers => {
    state.users = newUsers;
  }
);

watch(
  () => getGroupList(),
  newGroups => {
    state.groups = newGroups;
  }
);

watch(
  () => getConversationList(),
  newConversations => {
    state.conversations = newConversations;
  }
);

const chatRef = ref<InstanceType<typeof Chat> | null>(null);

watch(
  () => isMobile.value,
  newIsMobile => {
    if (newIsMobile) {
      state.isMenuDesktopOpen = false;
    }
  }
);

// Watch for route changes and update the UI accordingly
watch(
  () => currentRoute.value,
  (newRoute) => {
    if (newRoute.type === 'direct' && newRoute.id) {
      // Find the direct chat by ID and set it as the current contact
      const conversation = state.conversations.find(item => item.id === newRoute.id);
      if (conversation) {
        state.contact = conversation;
        state.chapter = conversation.id; // Use conversation ID as chapter
        state.isChapter = true;
      }
    } else if (newRoute.type === 'group' && newRoute.id) {
      // Find the group by ID and set it as the current contact
      const group = state.groups.find(g => g.id === newRoute.id);
      if (group) {
        state.contact = group;
        state.chapter = group.id; // Use group ID as chapter
        state.isChapter = true;
      }
    }
  },
  { immediate: true }
);

const handleCollapse = (): void => {
  toggle();
};

const handleMenuToggle = (isOpen: boolean): void => {
  state.isMenuDesktopOpen = isOpen;
};

const handleHeaderClick = (): void => {
  if (!isMobile.value) {
    state.activeTabId = 1;
    if (state.contact) {
      state.isMenuDesktopOpen = true;
    }
    return;
  }
  state.isMenuMobileOpen = true;
};

const unmountHeaderMenuChapter = (
  config: { nickname: string } | string | null
): void => {
  if (typeof config === 'string') {
    state.chapter = config;
    if (
      config === 'channels' ||
      config === 'dialogs' ||
      config === 'assistant' ||
      config === 'ai'
    ) {
      state.contact = null;
      state.isChapter = false;
      return;
    }
    state.isChapter = true;
  } else if (config && config.nickname) {
    state.chapter = config.nickname;
    state.contact = config;
    state.isChapter = false;
  } else {
    state.chapter = null;
    state.contact = null;
  }
};

const findContactOrGroupById = (id: string) => {
  const conversation = state.conversations.find(item => item.id === id);
  if (conversation) {
    return conversation;
  }
  return state.groups.find(group => group.id === id);
};

const unmountMenuChapter = async (
  config: { contact: IUserProps; groupId?: string } | string | null
): Promise<void> => {
  state.isChapter = true;
  if (typeof config === 'string') {
    state.chapter = config;
    if (config === 'ai') {
      state.contact = null;
    } else {
      const foundContact = findContactOrGroupById(config);
      if (foundContact) {
        if (foundContact.id) {
          markAsRead(foundContact.id).catch(error => {
            console.warn('Failed to mark messages as read:', error);
          });
        }

        let updatedContact = {
          ...foundContact,
          conversationId: foundContact.id
        };

        // If this is a group, fetch and update the member count
        if (foundContact.groupId) {
          const memberCount = await fetchGroupMemberCount(foundContact.groupId);
          updatedContact = {
            ...updatedContact,
            membersLength: memberCount
          };
        }

        state.contact = updatedContact;
        state.chapter = config;

        // Update URL based on whether it's a direct chat or group
        if (foundContact.groupId) {
          navigateToGroup(foundContact.id);
        } else {
          navigateToDirect(foundContact.id);
        }
      } else {
        state.contact = null;
        state.chapter = null;
      }
    }
  } else if (config && config.contact) {
    if (config.contact.id) {
      markAsRead(config.contact.id).catch(error => {
        console.warn('Failed to mark messages as read:', error);
      });
    }

    // If this is a group, fetch and update the member count
    let updatedContact = config.contact;
    if (config.contact.groupId) {
      const memberCount = await fetchGroupMemberCount(config.contact.groupId);
      updatedContact = {
        ...config.contact,
        membersLength: memberCount
      };
    }

    state.chapter = updatedContact.nickname;
    state.contact = updatedContact;

    // Update URL based on whether it's a direct chat or group
    if (config.contact.groupId) {
      navigateToGroup(config.contact.id);
    } else {
      navigateToDirect(config.contact.id);
    }
  } else {
    state.chapter = null;
    state.contact = null;
  }
};

const handleNewContact = async (config): Promise<void> => {
  if (isMobile.value) {
    const contact = await handleNewContactMessage(config);
    state.contact = contact;
    state.chapter = contact.conversationId;
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
  state.isPwaModalOpen = false;
};

const handleInformationClick = (): void => {
  if (state.contact) {
    state.isMenuDesktopOpen = true;
    state.activeTabId = 2;
  }
};

const handleClearClick = (): void => {
  if (state.chapter === 'ai' && chatRef.value) {
    chatRef.value.handleClear();
    window.location.reload();
  }
};

const handleNewContactMessage = async (
  contact: IUserProps
): Promise<IContactProps> => {
  state.chapter = contact.nickname;
  const [smallerUserID, largerUserID] = [authUser.value.id, contact.id].sort();

  // If this is a group, fetch and update the member count
  if (contact.groupId) {
    const memberCount = await fetchGroupMemberCount(contact.groupId);
    state.contact = {
      ...contact,
      membersLength: memberCount,
      conversationId: `si_${smallerUserID}_${largerUserID}`
    };

    // Update URL for group
    navigateToGroup(contact.id);
  } else {
    state.contact = {
      ...contact,
      conversationId: `si_${smallerUserID}_${largerUserID}`
    };

    // Update URL for direct chat
    navigateToDirect(contact.id);
  }
  return state.contact;
};

const handleNewGroupMessage = async (group: any): Promise<void> => {
  if (!group || !group.conversationID) {
    console.error('Invalid group data');
    closeModals();
    return;
  }

  const memberCount = await fetchGroupMemberCount(group.groupID);

  state.contact = {
    conversationId: group.conversationID,
    nickname: group.showName,
    groupId: group.groupID,
    avatarUrl: group.faceURL,
    membersLength: memberCount
  };

  state.groupId = group.groupID;

  state.chapter = state.contact.conversationId;

  // Update URL for the new group
  navigateToGroup(group.groupID);
};

const handleChangeContact = async (contact: IUserProps): Promise<void> => {
  // If this is a group, fetch and update the member count
  if (contact.groupId) {
    const memberCount = await fetchGroupMemberCount(contact.groupId);
    state.contact = {
      ...contact,
      membersLength: memberCount
    };

    // Update URL for group
    navigateToGroup(contact.id);
  } else {
    state.contact = contact;

    // Update URL for direct chat
    navigateToDirect(contact.id);
  }
};

const handleChangeContactFromMenuInfo = async (
  contact: IUserProps
): Promise<void> => {
  // If this is a group, fetch and update the member count
  if (contact.groupId) {
    const memberCount = await fetchGroupMemberCount(contact.groupId);
    state.contact = {
      ...contact,
      membersLength: memberCount
    };

    // Update URL for group
    navigateToGroup(contact.id);
  } else {
    // Update the contact in the state to trigger reactivity
    state.contact = { ...contact };

    // Update URL for direct chat
    navigateToDirect(contact.id);
  }
};

const handleExit = (): void => {
  // Determine the appropriate category to navigate back to based on the current contact
  if (state.contact?.groupId) {
    // If it's a group chat, go back to 'channels'
    state.chapter = 'channels';
  } else if (state.contact && !state.contact.groupId) {
    // If it's a direct chat, go back to 'dialogs'
    state.chapter = 'dialogs';
  } else {
    // If it's AI assistant or no specific contact, go back to 'assistant'
    state.chapter = 'assistant';
  }
  state.contact = null;
  state.isChapter = false;
  navigateToDefault(); // Navigate to default view
};

useAndroidBackButton({
  onBack: () => {
    if (isMobile.value) {
      // When back button is pressed on mobile, navigate to the appropriate category
      // Determine the appropriate category to navigate back to based on the current contact
      if (state.contact?.groupId) {
        // If it's a group chat, go back to 'channels'
        state.chapter = 'channels';
      } else if (state.contact && !state.contact.groupId) {
        // If it's a direct chat, go back to 'dialogs'
        state.chapter = 'dialogs';
      } else {
        // If it's AI assistant or no specific contact, go back to 'assistant'
        state.chapter = 'assistant';
      }
      state.contact = null;
      state.isChapter = false;

      // Close any open modals
      state.isMenuMobileOpen = false;
      state.isNewContactOpen = false;
      state.isNewGroupOpen = false;

      navigateToDefault(); // Navigate to default view
    }
  }
});

onMounted(async () => {
  // Initialize URL routing
  initRoute();
  setupUrlWatcher();

  try {
    if (isMobile.value) {
      state.isChapter = false;
      state.chapter = 'assistant';
    } else {
      // If there's a group contact, make sure to update the member count
      if (state.contact?.groupId) {
        const memberCount = await fetchGroupMemberCount(state.contact.groupId);
        state.contact = {
          ...state.contact,
          membersLength: memberCount
        };
      }
      state.isChapter = state.chapter === 'ai' || state.contact !== null;
    }
  } finally {
    // Set loading to false after initial setup is complete
    state.isLoading = false;
  }
});
</script>
