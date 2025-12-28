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
      v-if="
        state.isChapter &&
        (!isMobile ||
          (state.chapter !== 'assistant' &&
            state.chapter !== 'channels' &&
            state.chapter !== 'dialogs'))
      "
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
      v-if="
        isMobile &&
        (state.chapter === 'assistant' ||
          state.chapter === 'channels' ||
          state.chapter === 'dialogs')
      "
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
      :key="`chat-${state.chapter}-${state.contact?.id || 'null'}`"
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
import { useAndroidBackButton } from '../composables/useAndroidBackButton';
import { useNavigationService } from '../services/useNavigationService';

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

const {
  state: navigationState,
  navigateToTarget,
  navigateBackToPrevious
} = useNavigationService();

const state = reactive({
  isPwaModalOpen: true,
  isMenuDesktopOpen: false,
  isMenuMobileOpen: false,
  activeTabId: null,
  chapter: null, // Will be set after checking session storage
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
      // On mobile, set chapter to assistant if it's null
      if (state.chapter === null) {
        state.chapter = 'assistant';
        state.isChapter = false;
      }
    } else {
      // On desktop, set chapter to null if it was assistant on mobile
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
    if (
      config === 'channels' ||
      config === 'dialogs' ||
      config === 'assistant' ||
      config === 'ai'
    ) {
      await navigateToTarget({
        type: 'view',
        view: config as 'ai' | 'assistant' | 'channels' | 'dialogs'
      });
    } else {
      // For contact navigation, we need to find the contact by ID
      const foundContact = findContactOrGroupById(config);
      if (foundContact) {
        await navigateToTarget(
          { type: 'contact', contact: foundContact },
          { markAsRead: true, updateMemberCount: true }
        );
      } else {
        await navigateToTarget({ type: 'reset' });
      }
    }
  } else if (config && config.nickname) {
    await navigateToTarget(
      { type: 'contact', contact: config },
      { markAsRead: true, updateMemberCount: true }
    );
  } else {
    await navigateToTarget({ type: 'reset' });
  }

  // Update local state to match navigation state
  state.chapter = navigationState.currentChapter;
  state.contact = navigationState.currentContact;
  state.isChapter = navigationState.isChapter;
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
  if (typeof config === 'string') {
    if (config === 'ai') {
      await navigateToTarget({ type: 'view', view: 'ai' });
    } else {
      const foundContact = findContactOrGroupById(config);
      if (foundContact) {
        // Update conversationId in the contact
        const updatedContact = {
          ...foundContact,
          conversationId: foundContact.id
        };

        await navigateToTarget(
          { type: 'contact', contact: updatedContact },
          { markAsRead: true, updateMemberCount: true }
        );
      } else {
        await navigateToTarget({ type: 'reset' });
      }
    }
  } else if (config && config.contact) {
    await navigateToTarget(
      { type: 'contact', contact: config.contact },
      { markAsRead: true, updateMemberCount: true }
    );
  } else {
    await navigateToTarget({ type: 'reset' });
  }

  // Update local state to match navigation state
  state.chapter = navigationState.currentChapter;
  state.contact = navigationState.currentContact;
  state.isChapter = navigationState.isChapter;
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
    // Instead of reloading the page, just clear the chat state
    // The chat component should handle clearing its internal state
  }
};

const handleNewContactMessage = async (
  contact: IUserProps
): Promise<IContactProps> => {
  const [smallerUserID, largerUserID] = [authUser.value.id, contact.id].sort();

  // If this is a group, fetch and update the member count
  let updatedContact;
  if (contact.groupId) {
    const memberCount = await fetchGroupMemberCount(contact.groupId);
    updatedContact = {
      ...contact,
      membersLength: memberCount,
      conversationId: `si_${smallerUserID}_${largerUserID}`
    };
  } else {
    updatedContact = {
      ...contact,
      conversationId: `si_${smallerUserID}_${largerUserID}`
    };
  }

  await navigateToTarget(
    { type: 'contact', contact: updatedContact },
    { markAsRead: true, updateMemberCount: true }
  );

  // Update local state to match navigation state
  state.chapter = navigationState.currentChapter;
  state.contact = navigationState.currentContact;

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

  await navigateToTarget(
    { type: 'contact', contact: updatedContact },
    { markAsRead: true, updateMemberCount: true }
  );

  // Update local state to match navigation state
  state.chapter = navigationState.currentChapter;
  state.contact = navigationState.currentContact;
};

const handleChangeContact = async (contact: IUserProps): Promise<void> => {
  let updatedContact;
  // If this is a group, fetch and update the member count
  if (contact.groupId) {
    const memberCount = await fetchGroupMemberCount(contact.groupId);
    updatedContact = {
      ...contact,
      membersLength: memberCount
    };
  } else {
    updatedContact = contact;
  }

  // Navigate to the new contact
  await navigateToTarget(
    { type: 'contact', contact: updatedContact },
    { markAsRead: true, updateMemberCount: true }
  );

  // Update local state to match navigation state
  state.chapter = navigationState.currentChapter;
  state.contact = navigationState.currentContact;
};

const handleChangeContactFromMenuInfo = async (
  contact: IUserProps
): Promise<void> => {
  let updatedContact;
  // If this is a group, fetch and update the member count
  if (contact.groupId) {
    const memberCount = await fetchGroupMemberCount(contact.groupId);
    updatedContact = {
      ...contact,
      membersLength: memberCount
    };
  } else {
    updatedContact = { ...contact };
  }

  // Navigate to the new contact
  await navigateToTarget(
    { type: 'contact', contact: updatedContact },
    { markAsRead: true, updateMemberCount: true }
  );

  // Update local state to match navigation state
  state.chapter = navigationState.currentChapter;
  state.contact = navigationState.currentContact;
};

const handleBack = (): void => {
  // Navigate back to the previous state in history
  const hasPreviousState = navigateBackToPrevious();
  if (hasPreviousState) {
    // Update local state to match navigation state
    state.chapter = navigationState.currentChapter;
    state.contact = navigationState.currentContact;
    state.isChapter = navigationState.isChapter;
  } else {
    // If no history, go to default assistant view
    navigateToTarget(
      { type: 'view', view: 'assistant' },
      { markAsRead: false, updateMemberCount: false }
    ).catch(error => {
      console.error('Failed to navigate to assistant view:', error);
    });
    state.isChapter = false;
    // Update local state to match navigation state
    state.chapter = navigationState.currentChapter;
    state.contact = navigationState.currentContact;
  }
};

const handleExit = (): void => {
  // Navigate back to the previous state in history
  const hasPreviousState = navigateBackToPrevious();
  if (hasPreviousState) {
    // Update local state to match navigation state
    state.chapter = navigationState.currentChapter;
    state.contact = navigationState.currentContact;
    state.isChapter = navigationState.isChapter;
  } else {
    // If no history, go to default assistant view
    navigateToTarget(
      { type: 'view', view: 'assistant' },
      { markAsRead: false, updateMemberCount: false }
    ).catch(error => {
      console.error('Failed to navigate to assistant view:', error);
    });
    state.isChapter = false;
    // Update local state to match navigation state
    state.chapter = navigationState.currentChapter;
    state.contact = navigationState.currentContact;
  }
};

useAndroidBackButton({
  onBack: () => {
    if (isMobile.value) {
      // Use the back navigation functionality instead of hardcoding to assistant
      handleBack();
      state.isMenuMobileOpen = false;
      state.isNewContactOpen = false;
      state.isNewGroupOpen = false;
    }
  }
});

watch(
  () => navigationState.currentChapter,
  newChapter => {
    if (newChapter !== state.chapter) {
      state.chapter = newChapter;
    }
  }
);

watch(
  () => navigationState.currentContact,
  newContact => {
    if (newContact !== state.contact) {
      state.contact = newContact;
    }
  }
);

watch(
  () => navigationState.isChapter,
  newIsChapter => {
    if (newIsChapter !== state.isChapter) {
      state.isChapter = newIsChapter;
    }
  }
);

onMounted(async () => {
  try {
    if (state.chapter === null || state.chapter === undefined) {
      if (isMobile.value) {
        state.chapter = 'assistant';
      } else {
        state.chapter = null;
      }
    }

    if (isMobile.value) {
      state.isChapter = false;
    } else {
      if (state.contact?.groupId) {
        const memberCount = await fetchGroupMemberCount(state.contact.groupId);
        state.contact = {
          ...state.contact,
          membersLength: memberCount
        };
      }
      state.isChapter = navigationState.isChapter;
    }
  } finally {
    state.isLoading = false;
  }
});
</script>
