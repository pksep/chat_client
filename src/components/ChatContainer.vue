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
    :contacts="state.users"
    :open="state.isNewContactOpen"
    :data-testid="`${props.dataTestid}-ChatContainer-NewContactModal`"
    @unmount-close="closeModals"
    @unmount-new-contact="handleNewContactMessage"
  />

  <NewGroupModal
    :user="authUser"
    :contacts="state.users"
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
  IUser
} from './interfaces/interfaces';
import { getUsersList } from '../composables/useUsers';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_MD, MAX_W_XL } from '../utils/constants';
import { getGroupList, fetchGroupMemberCount } from '../services/useGroup';
import { getConversationList } from '../services/useConversions';
import { getAuthUser } from '../composables/useAuth';
import MobileModal from './UI/MobileModal.vue';
import { Button, ButtonTypeEnum } from '@pksep/yui';
import { usePwaInstall } from '../composables/usePwaInstall';
import { markAsRead } from '../services/useChat';
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
import { createTopic, getTopicList } from '../composables/useTopics';
import { getChatSDK } from '../services/useChat';

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
  conversations: getTopicList()
});

const props = withDefaults(defineProps<IChatContainerProps>(), {
  dataTestid: 'ChatContainer'
});

const authUser = computed(() => getAuthUser());

const filteredContacts = computed(() => {
  const authId = authUser.value?.id;
  if (!authId) return [];
  return state.users;
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

const initialRouteProcessed = ref(false);

const processRoute = (route, conversations, groups) => {
  if (route.type === 'dialogs' && route.id) {
    const conversation = conversations.find(item => item.id === route.id);
    if (conversation) {
      const conversationId = conversation.conversationId || conversation.id;

      state.contact = {
        ...conversation,
        conversationId
      };
      state.chapter = conversation.nickname || conversation.id;
      state.isChapter = true;
      initialRouteProcessed.value = true;
      return true;
    }
  } else if (route.type === 'dialogs' && !route.id) {
    state.chapter = 'dialogs';
    state.contact = null;
    state.isChapter = false;
    initialRouteProcessed.value = true;
    return true;
  } else if (route.type === 'group' && route.id) {
    const group = groups.find(g => g.id === route.id);
    if (group) {
      const conversationId = group.conversationId || group.groupId || group.id;

      state.contact = {
        ...group,
        conversationId
      };
      state.chapter = group.nickname || group.id;
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

watch(
  () => [currentRoute.value, state.conversations, state.groups],
  ([newRoute, conversations, groups]) => {
    processRoute(newRoute, conversations, groups);
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

    const foundContact = findContactOrGroupById(config);
    if (foundContact) {
      await openContact(foundContact);
      return;
    }

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
  if (contact.conversationId) return contact.conversationId;
  if (contact.groupId) return contact.groupId;
  return contact.id || '';
};

const openContact = async contact => {
  const conversationId =
    contact.conversationId || computeConversationId(contact);

  if (contact.id) {
    markAsRead(conversationId).catch(error => {
      console.warn('Failed to mark messages as read:', error);
    });
  }

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
  config: { contact: IUser; groupId?: string } | string | null
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
    state.chapter = contact.id || contact.conversationId;
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
  contact: IUser
): Promise<IContactProps> => {
  state.chapter = contact.id;

  if (contact.groupId) {
    const memberCount = await fetchGroupMemberCount(contact.groupId);
    state.contact = {
      ...contact,
      membersLength: memberCount,
      conversationId: contact.conversationId || contact.groupId
    };

    navigateToGroup(contact.id);
  } else {
    const createdTopic = await createTopic(contact.id);
    state.contact = {
      ...contact,
      conversationId: createdTopic?.id || contact.conversationId || contact.id
    };

    navigateToDialogs(state.contact.id);
  }

  // Join the topic when entering the chat (handleNewContactMessage)
  try {
    const sdk = getChatSDK();
    if (!sdk) {
      console.error(
        'ChatSDK instance is not available in handleNewContactMessage'
      );
      return;
    }
    console.log(
      'ChatSDK instance found in handleNewContactMessage, calling joinTopic'
    );
    const conversationId =
      contact.conversationId || contact.groupId || contact.id;
    await sdk.joinTopic(conversationId);
    console.log(
      'Successfully joined topic in handleNewContactMessage:',
      conversationId
    );
  } catch (error) {
    console.error('Failed to join topic in handleNewContactMessage:', error);
  }

  return state.contact;
};

const handleNewGroupMessage = async (group: any): Promise<void> => {
  if (!group || !(group.conversationId || group.topicId)) {
    console.error('Invalid group data');
    closeModals();
    return;
  }

  const memberCount = await fetchGroupMemberCount(group.groupId || group.id);

  state.contact = {
    conversationId: group.conversationId || group.topicId,
    nickname: group.title || group.showName,
    groupId: group.groupId || group.id,
    avatarUrl: group.avatarUrl || group.faceURL,
    membersLength: memberCount
  };

  state.groupId = group.groupId || group.id;

  state.chapter = state.contact.nickname || state.contact.conversationId;

  navigateToGroup(state.groupId);

  // Join the topic when entering the chat (handleNewGroupMessage)
  console.log(
    'handleNewGroupMessage - Attempting to join topic:',
    group.conversationId || group.topicId
  );
  try {
    const sdk = getChatSDK();
    if (!sdk) {
      console.error(
        'ChatSDK instance is not available in handleNewGroupMessage'
      );
      return;
    }
    console.log(
      'ChatSDK instance found in handleNewGroupMessage, calling joinTopic'
    );
    const conversationId = group.conversationId || group.topicId;
    await sdk.joinTopic(conversationId);
    console.log(
      'Successfully joined topic in handleNewGroupMessage:',
      conversationId
    );
  } catch (error) {
    console.error('Failed to join topic in handleNewGroupMessage:', error);
  }
};

const handleChangeContact = async (contact: IUser): Promise<void> => {
  if (contact.groupId) {
    const memberCount = await fetchGroupMemberCount(contact.groupId);
    state.contact = {
      ...contact,
      membersLength: memberCount,
      conversationId: contact.conversationId || contact.groupId
    };

    navigateToGroup(contact.id);
  } else {
    state.contact = {
      ...contact,
      conversationId: contact.conversationId || contact.id
    };

    navigateToDialogs(state.contact.id);
  }
};

const handleChangeContactFromMenuInfo = async (
  contact: IUser
): Promise<void> => {
  const conversationId =
    contact.conversationId || contact.groupId || contact.id;

  if (contact.groupId) {
    const memberCount = await fetchGroupMemberCount(contact.groupId);
    state.contact = {
      ...contact,
      membersLength: memberCount,
      conversationId
    };

    navigateToGroup(contact.id);
  } else {
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
