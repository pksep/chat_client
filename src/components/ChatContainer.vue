<template>
  <main
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
      :base-url="props.baseUrl"
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
        @unmount-contact="handleChangeContact"
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
import type {
  IChatContainerProps,
  IContactProps,
  IUserProps
} from './interfaces/interfaces';
import { appendUserAttributes, getUsersList } from '../composables/useUsers';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_MD, MAX_W_XL } from '../utils/constants';
import { getGroupList } from '../services/useGroup';
import { getConversationList } from '../services/useConversions';
import { getAuthUser } from '../composables/useAuth';
import MobileModal from './UI/MobileModal.vue';
import { Button, ButtonTypeEnum } from '@pksep/yui';
import { usePwaInstall } from '../composables/usePwaInstall';
import { markAsRead } from '../services/useOpenIM';
import { useAndroidBackButton } from '../composables/useAndroidBackButton';

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

// Close MenuInfo when switching to mobile view
watch(
  () => isMobile.value,
  newIsMobile => {
    if (newIsMobile) {
      state.isMenuDesktopOpen = false;
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

const unmountMenuChapter = (
  config: { contact: IUserProps; groupId?: string } | string | null
): void => {
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

        state.contact = { ...foundContact, conversationId: foundContact.id };
        state.chapter = config;
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

    state.chapter = config.contact.nickname;
    state.contact = config.contact;
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

  state.contact = {
    ...contact,
    conversationId: `si_${smallerUserID}_${largerUserID}`
  };
  return state.contact;
};

const handleNewGroupMessage = async (group: any): Promise<void> => {
  if (!group || !group.conversationID) {
    console.error('Invalid group data');
    closeModals();
    return;
  }

  state.contact = {
    conversationId: group.conversationID,
    nickname: group.showName,
    groupId: group.groupID,
    avatarUrl: group.faceURL
  };

  state.groupId = group.groupID;

  state.chapter = state.contact.conversationId;
};

const handleChangeContact = (contact: IUserProps): void => {
  state.contact = contact;
};

const handleExit = (): void => {
  state.chapter = 'assistant';
  state.isChapter = false;
};

// Handle Android back button
useAndroidBackButton({
  onBack: () => {
    // If on mobile and in a specific chapter, go back to main screen
    if (isMobile.value) {
      // Reset to main screen state
      state.chapter = 'assistant';
      state.contact = null;
      state.isChapter = false;
      state.isMenuMobileOpen = false;
      state.isNewContactOpen = false;
      state.isNewGroupOpen = false;
    }
  }
});

onMounted(() => {
  if (isMobile.value) {
    state.isChapter = false;
    state.chapter = 'assistant';
    return;
  }
  state.isChapter = state.chapter === 'ai' || state.contact !== null;
});
</script>
