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
  navigateToDialogs,
  navigateToDialogsList,
  navigateToGroup,
  navigateToGroupsList,
  navigateToAssistant,
  navigateToAI,
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

// Track if the initial route has been processed
const initialRouteProcessed = ref(false);

// Process route based on current data
const processRoute = (route, conversations, groups) => {
  if (route.type === 'dialogs' && route.id) {
    // Find the dialogs chat by ID and set it as the current contact
    const conversation = conversations.find(item => item.id === route.id);
    if (conversation) {
      // Construct the conversationId for dialogs chats
      const authUserId = authUser.value?.id;
      let conversationId;
      if (authUserId && conversation.id) {
        const [smallerUserID, largerUserID] = [
          authUserId,
          conversation.id
        ].sort();
        conversationId = `si_${smallerUserID}_${largerUserID}`;
      } else {
        conversationId = conversation.id; // fallback
      }

      state.contact = {
        ...conversation,
        conversationId
      };
      state.chapter =
        conversation.showName || conversation.nickname || conversation.id;
      state.isChapter = true;
      initialRouteProcessed.value = true;
      return true;
    }
  } else if (route.type === 'dialogs' && !route.id) {
    // Handle dialogs list view (no specific ID)
    state.chapter = 'dialogs';
    state.contact = null;
    state.isChapter = false;
    initialRouteProcessed.value = true;
    return true;
  } else if (route.type === 'group' && route.id) {
    // Find the group by ID and set it as the current contact
    const group = groups.find(g => g.id === route.id);
    if (group) {
      // Construct the conversationId for group chats
      const conversationId = `sg_${group.groupId}`;

      state.contact = {
        ...group,
        conversationId
      };
      state.chapter = group.showName || group.nickname || group.id;
      state.isChapter = true;
      initialRouteProcessed.value = true;
      return true;
    }
  } else if (route.type === 'group' && !route.id) {
    state.chapter = 'channels';
    state.contact = null;
    state.isChapter = false;
    initialRouteProcessed.value = true;
    return true;
  } else if (route.type === 'assistant' && !route.id) {
    state.chapter = 'assistant';
    state.contact = null;
    state.isChapter = false;
    initialRouteProcessed.value = true;
    return true;
  } else if (route.type === 'ai' && !route.id) {
    state.chapter = 'ai';
    state.contact = null;
    state.isChapter = true;
    initialRouteProcessed.value = true;
    return true;
  }
  return false;
};

// Watch for route changes and update the UI accordingly
watch(
  () => [currentRoute.value, state.conversations, state.groups],
  ([newRoute, conversations, groups]) => {
    // Process the route with current data
    const routeMatched = processRoute(newRoute, conversations, groups);

    // If route wasn't matched but we have a route that requires matching,
    // and we haven't processed the initial route yet, keep trying
    if (
      !routeMatched &&
      !initialRouteProcessed.value &&
      newRoute.type !== 'default'
    ) {
      // This means we're still waiting for the conversation/group data to arrive
      // The watch will trigger again when conversations/groups are updated
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

const unmountHeaderMenuChapter = async (
  config: { nickname: string; contact?: any } | string | null
): Promise<void> => {
  if (!config) {
    state.chapter = null;
    state.contact = null;
    state.isChapter = false;
    return;
  }

  if (typeof config === 'string') {
    switch (config) {
      case 'ai':
        state.chapter = 'ai';
        state.contact = null;
        state.isChapter = true;
        navigateToAI();
        return;
      case 'assistant':
        state.chapter = 'assistant';
        state.contact = null;
        state.isChapter = true;
        navigateToAssistant();
        return;
      case 'channels':
        state.chapter = 'channels';
        state.contact = null;
        state.isChapter = false;
        navigateToGroupsList();
        return;
      case 'dialogs':
        state.chapter = 'dialogs';
        state.contact = null;
        state.isChapter = false;
        navigateToDialogsList();
        return;
    }

    // Treat as ID for non-special strings
    const foundContact = findContactOrGroupById(config);
    if (foundContact) {
      await openContact(foundContact);
      return;
    }

    // Not found
    state.chapter = null;
    state.contact = null;
    state.isChapter = false;
    return;
  } else if (config.contact) {
    await openContact(config.contact);
    return;
  } else if (config.nickname) {
    state.chapter = config.nickname;
    state.contact = null;
    state.isChapter = false;
  }
};

const findContactOrGroupById = (id: string) => {
  const conversation = state.conversations.find(item => item.id === id);
  if (conversation) {
    return conversation;
  }
  return state.groups.find(group => group.id === id);
};

const computeConversationId = contact => {
  const authId = authUser.value?.id;
  if (contact.groupId) {
    return `sg_${contact.groupId}`;
  }
  if (!authId || !contact.id) {
    return contact.id || '';
  }
  const [smaller, larger] = [authId, contact.id].sort();
  return `si_${smaller}_${larger}`;
};

const openContact = async contact => {
  if (contact.id) {
    markAsRead(contact.id).catch(error => {
      console.warn('Failed to mark messages as read:', error);
    });
  }

  const conversationId = computeConversationId(contact);

  let updatedContact = {
    ...contact,
    conversationId
  };

  if (contact.groupId) {
    const memberCount = await fetchGroupMemberCount(contact.groupId);
    updatedContact = {
      ...updatedContact,
      membersLength: memberCount
    };
  }

  state.contact = updatedContact;
  state.chapter = updatedContact.nickname || contact.id;
  state.isChapter = true;

  if (contact.groupId) {
    navigateToGroup(contact.id);
  } else {
    navigateToDialogs(contact.id);
  }
};

const unmountMenuChapter = async (
  config: { contact: IUserProps; groupId?: string } | string | null
): Promise<void> => {
  if (!config) {
    state.chapter = null;
    state.contact = null;
    state.isChapter = false;
    return;
  }

  if (typeof config === 'string') {
    switch (config) {
      case 'ai':
        state.chapter = 'ai';
        state.contact = null;
        state.isChapter = true;
        navigateToAI();
        return;
      case 'channels':
        state.chapter = 'channels';
        state.contact = null;
        state.isChapter = false;
        navigateToGroupsList();
        return;
      case 'dialogs':
        state.chapter = 'dialogs';
        state.contact = null;
        state.isChapter = false;
        navigateToDialogsList();
        return;
    }

    const foundContact = findContactOrGroupById(config);
    if (foundContact) {
      await openContact(foundContact);
      return;
    }

    state.chapter = null;
    state.contact = null;
    state.isChapter = false;
    return;
  }

  if (config && config.contact) {
    await openContact(config.contact);
    return;
  }

  state.chapter = null;
  state.contact = null;
  state.isChapter = false;
};

const handleNewContact = async (config): Promise<void> => {
  if (isMobile.value) {
    const contact = await handleNewContactMessage(config);
    state.contact = contact;
    state.chapter = contact.nickname || contact.conversationId;
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

  if (contact.groupId) {
    const memberCount = await fetchGroupMemberCount(contact.groupId);
    state.contact = {
      ...contact,
      membersLength: memberCount,
      conversationId: `sg_${contact.groupId}`
    };

    navigateToGroup(contact.id);
  } else {
    const [smallerUserID, largerUserID] = [
      authUser.value.id,
      contact.id
    ].sort();
    state.contact = {
      ...contact,
      conversationId: `si_${smallerUserID}_${largerUserID}`
    };

    navigateToDialogs(contact.id);
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

  state.chapter = state.contact.nickname || state.contact.conversationId;

  navigateToGroup(group.groupID);
};

const handleChangeContact = async (contact: IUserProps): Promise<void> => {
  let conversationId;
  if (contact.groupId) {
    conversationId = `sg_${contact.groupId}`;
    const memberCount = await fetchGroupMemberCount(contact.groupId);
    state.contact = {
      ...contact,
      membersLength: memberCount,
      conversationId
    };

    navigateToGroup(contact.id);
  } else {
    const authUserId = authUser.value?.id;
    if (authUserId && contact.id) {
      const [smallerUserID, largerUserID] = [authUserId, contact.id].sort();
      conversationId = `si_${smallerUserID}_${largerUserID}`;
    } else {
      conversationId = contact.id;
    }

    state.contact = {
      ...contact,
      conversationId
    };

    navigateToDialogs(contact.id);
  }
};

const handleChangeContactFromMenuInfo = async (
  contact: IUserProps
): Promise<void> => {
  let conversationId;
  if (contact.groupId) {
    conversationId = `sg_${contact.groupId}`;
    const memberCount = await fetchGroupMemberCount(contact.groupId);
    state.contact = {
      ...contact,
      membersLength: memberCount,
      conversationId
    };

    navigateToGroup(contact.id);
  } else {
    const authUserId = authUser.value?.id;
    if (authUserId && contact.id) {
      const [smallerUserID, largerUserID] = [authUserId, contact.id].sort();
      conversationId = `si_${smallerUserID}_${largerUserID}`;
    } else {
      conversationId = contact.id;
    }

    state.contact = {
      ...contact,
      conversationId
    };

    navigateToDialogs(contact.id);
  }
};

const handleExit = (): void => {
  if (state.contact?.groupId) {
    state.chapter = 'channels';
  } else if (state.contact && !state.contact.groupId) {
    state.chapter = 'dialogs';
  } else {
    state.chapter = 'assistant';
  }
  state.contact = null;
  state.isChapter = false;
  if (state.chapter === 'dialogs') {
    navigateToDialogsList();
  } else if (state.chapter === 'channels') {
    navigateToGroupsList();
  } else if (state.chapter === 'assistant') {
    navigateToAssistant();
  } else if (state.chapter === 'ai') {
    navigateToAI();
  } else {
    navigateToDefault();
  }
};

useAndroidBackButton({
  onBack: () => {
    if (isMobile.value) {
      if (state.contact?.groupId) {
        state.chapter = 'channels';
      } else if (state.contact && !state.contact.groupId) {
        state.chapter = 'dialogs';
      } else {
        state.chapter = 'assistant';
      }
      state.contact = null;
      state.isChapter = false;

      state.isMenuMobileOpen = false;
      state.isNewContactOpen = false;
      state.isNewGroupOpen = false;

      if (state.chapter === 'dialogs') {
        navigateToDialogsList();
      } else if (state.chapter === 'channels') {
        navigateToGroupsList();
      } else if (state.chapter === 'assistant') {
        navigateToAssistant();
      } else if (state.chapter === 'ai') {
        navigateToAI();
      } else {
        navigateToDefault();
      }
    }
  }
});

onMounted(async () => {
  initRoute();
  setupUrlWatcher();

  try {
    if (isMobile.value) {
      state.isChapter = false;
      state.chapter = 'assistant';
    } else {
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
    state.isLoading = false;
  }
});
</script>
