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
      v-if="isMobile"
      :dataTestid="`${props.dataTestid}-ChatContainer-HeaderMenu`"
      :active-chapter="state.chapter || 'assistant'"
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
  onUnmounted,
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
import { getConversationList, onSDKReady } from '../services/useConversions';
import { getAuthUser } from '../composables/useAuth';
import MobileModal from './UI/MobileModal.vue';
import { Button, ButtonTypeEnum } from '@pksep/yui';
import { usePwaInstall } from '../composables/usePwaInstall';
import { useAndroidBackButton } from '../composables/useAndroidBackButton';
import { customRouter } from '../router/CustomRouter';
import { useUrlRouter } from '../composables/useUrlRouter';

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

// Chapter navigation state implemented directly in this component
const chapterState = reactive({
  currentChapter: null as string | null,
  currentContact: null as any | null,
  isChapterActive: false,
  history: [] as Array<{
    chapter: string | null;
    contact: any | null;
    isChapterActive: boolean;
  }>
});

const navigateBack = (): boolean => {
  if (chapterState.history.length > 0) {
    const previousState = chapterState.history.pop();
    if (previousState) {
      chapterState.currentChapter = previousState.chapter;
      chapterState.currentContact = previousState.contact;
      chapterState.isChapterActive = previousState.isChapterActive;
      return true;
    }
  }
  return false;
};

const state = reactive({
  isPwaModalOpen: true,
  isMenuDesktopOpen: false,
  isMenuMobileOpen: false,
  activeTabId: null,
  chapter: null,
  groupId: null,
  contact: null,
  pendingContactId: null,
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

    if (state.contact?.id) {
      const updatedContact = findContactOrGroupById(state.contact.id);
      if (updatedContact) {
        state.contact = updatedContact;
      }
    }

    if (state.pendingContactId) {
      const foundContact = findContactOrGroupById(state.pendingContactId);
      if (foundContact) {
        state.contact = foundContact;
        state.pendingContactId = null;

        if (foundContact.groupId) {
          customRouter.navigate(`/group/${foundContact.groupId}`);
        } else {
          customRouter.navigate(`/contact/${foundContact.id}`);
        }

        // Update state based on the current route
        const currentRoute = customRouter.getCurrentRoute();
        const pathParts = currentRoute.path.split('/').filter(part => part);
        const currentChapter = pathParts.length > 0 ? pathParts[0] : null;

        state.chapter = currentChapter;
        if (
          currentChapter &&
          ['channels', 'dialogs'].includes(currentChapter)
        ) {
          state.isChapter = false;
        } else {
          state.isChapter =
            currentChapter !== null &&
            currentChapter !== 'assistant' &&
            currentChapter !== 'ai';
        }
      }
    }
  }
);

const unwatchRoute = customRouter.watchRoute(to => {
  const pathParts = to.path.split('/').filter(part => part);
  const newChapter = pathParts.length > 0 ? pathParts[0] : null;
  const contactId = pathParts.length > 1 ? pathParts[1] : null;

  if (newChapter) {
    state.chapter = newChapter;
    if (['channels', 'dialogs'].includes(newChapter)) {
      state.isChapter = false;
    } else {
      state.isChapter = newChapter !== 'assistant' && newChapter !== 'ai';
    }

    // If we have a contactId, try to find and set the contact
    if (contactId) {
      const foundContact = findContactOrGroupById(contactId);
      if (foundContact) {
        state.contact = foundContact;
      } else {
        // If contact is not found immediately, store the ID and wait for conversations to load
        state.pendingContactId = contactId;
      }
    } else {
      state.contact = null;
    }
  } else {
    state.chapter = null;
    state.isChapter = false;
    state.contact = null;
    state.pendingContactId = null;
  }
});

const chatRef = ref<InstanceType<typeof Chat> | null>(null);

watch(
  () => isMobile.value,
  newIsMobile => {
    if (newIsMobile) {
      state.isMenuDesktopOpen = false;
      if (state.chapter === null) {
        state.chapter = 'assistant';
        state.isChapter = false;
      }
    } else {
      if (state.chapter === 'assistant') {
        state.chapter = null;
        state.isChapter = false;
      }
    }
  }
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
  config: { nickname: string } | string | null
): Promise<void> => {
  if (typeof config === 'string') {
    await handleNavigation(config);
  } else if (config && config.nickname) {
    customRouter.navigate(`/contact/${config.nickname}`);

    const currentRoute = customRouter.getCurrentRoute();
    const pathParts = currentRoute.path.split('/').filter(part => part);
    const currentChapter = pathParts.length > 0 ? pathParts[0] : null;

    state.chapter = currentChapter;
    if (currentChapter && ['channels', 'dialogs'].includes(currentChapter)) {
      state.isChapter = false;
    } else {
      state.isChapter =
        currentChapter !== null &&
        currentChapter !== 'assistant' &&
        currentChapter !== 'ai';
    }
  } else {
    customRouter.navigate('/');

    const currentRoute = customRouter.getCurrentRoute();
    const pathParts = currentRoute.path.split('/').filter(part => part);
    const currentChapter = pathParts.length > 0 ? pathParts[0] : null;

    state.chapter = currentChapter;
    if (currentChapter && ['channels', 'dialogs'].includes(currentChapter)) {
      state.isChapter = false;
    } else {
      state.isChapter =
        currentChapter !== null &&
        currentChapter !== 'assistant' &&
        currentChapter !== 'ai';
    }
  }
};

const findContactOrGroupById = (id: string) => {
  let conversation = state.conversations.find(
    item => item.id === id || item.conversationId === id
  );
  if (conversation) {
    return conversation;
  }

  if (id.startsWith('sg_')) {
    const groupId = id.substring(3);

    conversation = state.conversations.find(
      item => item.id === groupId || item.conversationId === groupId
    );
    if (conversation) {
      return conversation;
    }

    conversation = state.conversations.find(
      item =>
        item.id === `g_${groupId}` || item.conversationId === `g_${groupId}`
    );
    if (conversation) {
      return conversation;
    }

    const group = state.groups.find(
      g =>
        g.id === groupId ||
        g.id === `g_${groupId}` ||
        g.conversationId === groupId ||
        g.conversationId === `g_${groupId}`
    );
    if (group) {
      return group;
    }
  } else if (id.startsWith('si_')) {
    const usersPart = id.substring(3);

    conversation = state.conversations.find(
      item =>
        item.id.includes(usersPart) || item.conversationId?.includes(usersPart)
    );
    if (conversation) {
      return conversation;
    }
  } else {
    let searchId;
    if (id.startsWith('g_')) {
      searchId = id.substring(2);
    } else {
      searchId = id;
    }

    conversation = state.conversations.find(
      item =>
        item.id === `sg_${searchId}` || item.conversationId === `sg_${searchId}`
    );
    if (conversation) {
      return conversation;
    }

    const group = state.groups.find(
      g => g.id === `sg_${searchId}` || g.conversationId === `sg_${searchId}`
    );
    if (group) {
      return group;
    }
  }

  return undefined;
};

const handleNavigation = async (
  config: { contact: IUserProps; groupId?: string } | string | null
): Promise<void> => {
  if (typeof config === 'string') {
    if (['ai', 'assistant', 'channels', 'dialogs'].includes(config)) {
      customRouter.navigate(`/${config}`);
    } else {
      const foundContact = findContactOrGroupById(config);
      if (foundContact) {
        if (foundContact.groupId) {
          customRouter.navigate(`/group/${foundContact.groupId}`);
        } else {
          customRouter.navigate(`/contact/${foundContact.id}`);
        }
      } else {
        customRouter.navigate('/');
      }
    }
  } else if (config && (config as any).contact) {
    const contact = (config as any).contact;
    if (contact.groupId) {
      customRouter.navigate(`/group/${contact.groupId}`);
    } else {
      customRouter.navigate(`/contact/${contact.id}`);
    }
  } else if (config && (config as IUserProps).id) {
    const contact = config as IUserProps;
    if (contact.groupId) {
      customRouter.navigate(`/group/${contact.groupId}`);
    } else {
      customRouter.navigate(`/contact/${contact.id}`);
    }
  } else {
    customRouter.navigate('/');
  }

  const currentRoute = customRouter.getCurrentRoute();
  const pathParts = currentRoute.path.split('/').filter(part => part);
  const currentChapter = pathParts.length > 0 ? pathParts[0] : null;

  state.chapter = currentChapter;
  if (currentChapter && ['channels', 'dialogs'].includes(currentChapter)) {
    state.isChapter = false;
  } else {
    state.isChapter =
      currentChapter !== null &&
      currentChapter !== 'assistant' &&
      currentChapter !== 'ai';
  }
};

const unmountMenuChapter = async (
  config: { contact: IUserProps; groupId?: string } | string | null
): Promise<void> => {
  await handleNavigation(config);
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
  const [smallerUserID, largerUserID] = [authUser.value.id, contact.id].sort();

  let updatedContact;
  if (contact.groupId) {
    const memberCount = await fetchGroupMemberCount(contact.groupId);
    updatedContact = {
      ...contact,
      membersLength: memberCount,
      conversationId: contact.id || `g_${contact.groupId}`
    };
  } else {
    updatedContact = {
      ...contact,
      conversationId: contact.id || `si_${smallerUserID}_${largerUserID}`
    };
  }

  if (updatedContact.groupId) {
    customRouter.navigate(`/group/${updatedContact.groupId}`);
  } else if (updatedContact.id) {
    customRouter.navigate(`/contact/${updatedContact.id}`);
  } else {
    customRouter.navigate('/');
  }

  const currentRoute = customRouter.getCurrentRoute();
  const pathParts = currentRoute.path.split('/').filter(part => part);
  const currentChapter = pathParts.length > 0 ? pathParts[0] : null;

  state.chapter = currentChapter;
  if (currentChapter && ['channels', 'dialogs'].includes(currentChapter)) {
    state.isChapter = false;
  } else {
    state.isChapter =
      currentChapter !== null &&
      currentChapter !== 'assistant' &&
      currentChapter !== 'ai';
  }

  return updatedContact;
};

const handleNewGroupMessage = async (group: any): Promise<void> => {
  if (!group || !group.conversationID) {
    console.error('Invalid group data');
    closeModals();
    return;
  }

  const memberCount = await fetchGroupMemberCount(group.groupID);

  const updatedContact = {
    conversationId: group.conversationID,
    nickname: group.showName,
    groupId: group.groupID,
    avatarUrl: group.faceURL,
    membersLength: memberCount
  };

  state.groupId = group.groupID;

  if (updatedContact.groupId) {
    customRouter.navigate(`/group/${updatedContact.groupId}`);
  } else if (updatedContact.conversationId) {
    customRouter.navigate(`/contact/${updatedContact.conversationId}`);
  } else {
    customRouter.navigate('/');
  }

  // Update state based on the current route
  const currentRoute = customRouter.getCurrentRoute();
  const pathParts = currentRoute.path.split('/').filter(part => part);
  const currentChapter = pathParts.length > 0 ? pathParts[0] : null;

  state.chapter = currentChapter;
  if (currentChapter && ['channels', 'dialogs'].includes(currentChapter)) {
    state.isChapter = false;
  } else {
    state.isChapter =
      currentChapter !== null &&
      currentChapter !== 'assistant' &&
      currentChapter !== 'ai';
  }
};

const handleChangeContact = async (contact: IUserProps): Promise<void> => {
  let updatedContact;
  if (contact.groupId) {
    const memberCount = await fetchGroupMemberCount(contact.groupId);
    updatedContact = {
      ...contact,
      membersLength: memberCount
    };
  } else {
    updatedContact = contact;
  }

  if (updatedContact.groupId) {
    customRouter.navigate(`/group/${updatedContact.groupId}`);
  } else if (updatedContact.id) {
    customRouter.navigate(`/contact/${updatedContact.id}`);
  } else {
    customRouter.navigate('/');
  }

  const currentRoute = customRouter.getCurrentRoute();
  const pathParts = currentRoute.path.split('/').filter(part => part);
  const currentChapter = pathParts.length > 0 ? pathParts[0] : null;

  state.chapter = currentChapter;
  if (currentChapter && ['channels', 'dialogs'].includes(currentChapter)) {
    state.isChapter = false;
  } else {
    state.isChapter =
      currentChapter !== null &&
      currentChapter !== 'assistant' &&
      currentChapter !== 'ai';
  }
};

const handleChangeContactFromMenuInfo = async (
  contact: IUserProps
): Promise<void> => {
  let updatedContact;
  if (contact.groupId) {
    const memberCount = await fetchGroupMemberCount(contact.groupId);
    updatedContact = {
      ...contact,
      membersLength: memberCount
    };
  } else {
    updatedContact = { ...contact };
  }

  if (updatedContact.groupId) {
    customRouter.navigate(`/group/${updatedContact.groupId}`);
  } else if (updatedContact.id) {
    customRouter.navigate(`/contact/${updatedContact.id}`);
  } else {
    customRouter.navigate('/');
  }

  const currentRoute = customRouter.getCurrentRoute();
  const pathParts = currentRoute.path.split('/').filter(part => part);
  const currentChapter = pathParts.length > 0 ? pathParts[0] : null;

  state.chapter = currentChapter;
  if (currentChapter && ['channels', 'dialogs'].includes(currentChapter)) {
    state.isChapter = false;
  } else {
    state.isChapter =
      currentChapter !== null &&
      currentChapter !== 'assistant' &&
      currentChapter !== 'ai';
  }
};

const handleBack = (): void => {
  const hasPreviousState = navigateBack();
  if (hasPreviousState) {
    state.chapter = chapterState.currentChapter;
    state.contact = chapterState.currentContact;
    if (
      chapterState.currentChapter &&
      (chapterState.currentChapter === 'channels' ||
        chapterState.currentChapter === 'dialogs')
    ) {
      state.isChapter = false;
    } else {
      state.isChapter = chapterState.isChapterActive;
    }
  } else {
    customRouter.navigate('/assistant');

    const currentRoute = customRouter.getCurrentRoute();
    const pathParts = currentRoute.path.split('/').filter(part => part);
    const currentChapter = pathParts.length > 0 ? pathParts[0] : null;

    state.isChapter = false;
    state.chapter = currentChapter;
    state.contact = null;
  }
};

const handleExit = (): void => {
  const hasPreviousState = navigateBack();
  if (hasPreviousState) {
    state.chapter = chapterState.currentChapter;
    state.contact = chapterState.currentContact;
    if (
      chapterState.currentChapter &&
      (chapterState.currentChapter === 'channels' ||
        chapterState.currentChapter === 'dialogs')
    ) {
      state.isChapter = false;
    } else {
      state.isChapter = chapterState.isChapterActive;
    }
  } else {
    customRouter.navigate('/assistant');

    const currentRoute = customRouter.getCurrentRoute();
    const pathParts = currentRoute.path.split('/').filter(part => part);
    const currentChapter = pathParts.length > 0 ? pathParts[0] : null;

    state.isChapter = false;
    state.chapter = currentChapter;
    state.contact = null;
  }
};

useAndroidBackButton({
  onBack: () => {
    if (isMobile.value) {
      handleBack();
      state.isMenuMobileOpen = false;
      state.isNewContactOpen = false;
      state.isNewGroupOpen = false;
    }
  }
});

watch(
  () => chapterState.currentChapter,
  newChapter => {
    state.chapter = newChapter;
    if (newChapter && (newChapter === 'channels' || newChapter === 'dialogs')) {
      state.isChapter = false;
    } else {
      state.isChapter = chapterState.isChapterActive;
    }
  }
);

watch(
  () => chapterState.currentContact,
  newContact => {
    state.contact = newContact;
  }
);

watch(
  () => chapterState.isChapterActive,
  newIsChapter => {
    if (
      chapterState.currentChapter &&
      (chapterState.currentChapter === 'channels' ||
        chapterState.currentChapter === 'dialogs')
    ) {
      state.isChapter = false;
    } else {
      state.isChapter = newIsChapter;
    }
  }
);

onMounted(async () => {
  const { parseRouteFromUrl } = useUrlRouter();
  const route = parseRouteFromUrl();

  // Set initial chapter based on route
  if (route.chapter) {
    state.chapter = route.chapter;
    state.isChapter =
      route.chapter !== 'assistant' &&
      route.chapter !== 'channels' &&
      route.chapter !== 'dialogs';
  } else {
    if (isMobile.value) {
      state.chapter = 'assistant';
      state.isChapter = false;
    } else {
      state.chapter = null;
      state.isChapter = false;
    }
  }

  onSDKReady(async () => {
    state.isLoading = false;
  });
});

// Cleanup function to be called when component is unmounted
onUnmounted(() => {
  if (unwatchRoute) {
    unwatchRoute();
  }
});
</script>
