<template>
  <Loader
    v-if="state.isLoading"
    :dataTestid="`${props.dataTestid}-ChatContainer-Loading`"
  />
  <main
    v-else
    :class="chatContainerClasses"
    :data-testid="`${props.dataTestid}-ChatContainer-Container`"
  >
    <Header
      v-if="state.isActiveHeader"
      class="chat__header"
      :data-testid="`${props.dataTestid}-ChatContainer-Header`"
      @unmount-click="handleHeaderClick"
      @unmount-information="handleInformationClick"
      @unmount-clear="handleClearClick"
    />
    <HeaderMenu
      class="chat__header-menu"
      v-else-if="!state.isActiveHeader"
      :dataTestid="`${props.dataTestid}-ChatContainer-HeaderMenu`"
    />
    <Menu
      class="chat__menu"
      :dataTestid="`${props.dataTestid}-ChatContainer-Menu`"
      @unmount-collapse="handleCollapse"
      @unmount-new-contact="handleNewContact"
      @unmount-new-group="handleNewGroup"
    />
    <Chat
      class="chat__messages"
      ref="chatRef"
      :dataTestid="`${props.dataTestid}-ChatContainer-Chat`"
    />
    <template v-if="!isMobile">
      <MenuInfo
        class="chat__info"
        :open="state.isMenuDesktopOpen"
        :active-tab-id="state.activeTabId"
        :dataTestid="`${props.dataTestid}-ChatContainer-MenuInfo`"
        @unmount-collapse="handleMenuToggle"
      />
    </template>
    <NewContactModal
      :open="state.isNewContactOpen"
      :data-testid="`${props.dataTestid}-ChatContainer-NewContactModal`"
      @unmount-close="closeModals"
    />
    <!-- <Teleport to="#chat-container-image"> -->
    <!-- </Teleport> -->
    <NewGroupModal
      :user="authUser"
      :contacts="users"
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
  </main>
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
import type { IChatContainerProps, IUser } from './interfaces/interfaces';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_MD, MAX_W_XL } from '../utils/constants';
import { getAuthUser } from '../composables/useAuth';
import MobileModal from './UI/MobileModal.vue';
import { Loader, Button, ButtonTypeEnum } from '@pksep/yui';
import { usePwaInstall } from '../composables/usePwaInstall';
import { useAndroidBackButton } from '../composables/useAndroidBackButton';
import { navigateToGroup, useUrlWatcher } from '../composables/navigation';
import { getChatSDK } from '../services/useChat';
import { getUsersList } from '../composables/useUsers';

const NewContactModal = defineAsyncComponent(
  () => import('./NewChat/NewContactModal.vue')
);
const NewGroupModal = defineAsyncComponent(
  () => import('./NewChat/NewGroupModal.vue')
);

const { canInstall, handleInstall, isInstalled } = usePwaInstall();

const route = useUrlWatcher();

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
  groupId: null,
  isNewContactOpen: false,
  isNewGroupOpen: false,
  isLoading: true,
  isActiveHeader: false
});

const chatContainerClasses = computed(() => [
  'chat-container',
  { collapse: isCollapse.value },
  {
    'menu-collapse':
      route.value.type === 'ai' || route.value.type === 'assistant'
        ? true
        : !state.isMenuDesktopOpen
  }
]);

const users = computed(() => getUsersList());

const props = withDefaults(defineProps<IChatContainerProps>(), {
  dataTestid: 'ChatContainer'
});

const chatRef = ref<InstanceType<typeof Chat> | null>(null);

const authUser = computed(() => getAuthUser());

/*
const filteredContacts = computed(() => {
  const authId = authUser.value?.id;
  if (!authId) return [];
  return users.value;
});

const filteredMembers = computed(() => {
  const authId = authUser.value?.id;
  if (!authId) return [];
  return state.users.filter(user => user.id !== authId);
});
 */

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
    state.isMenuDesktopOpen = true;
    return;
  }
  state.isMenuMobileOpen = true;
};

const handleNewContact = async (config): Promise<void> => {
  if (isMobile.value) {
    // const contact = await handleNewContactMessage(config);
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
  state.isMenuDesktopOpen = true;
  state.activeTabId = 2;
};

const handleClearClick = (): void => {
  if (route.value.type === 'ai' && chatRef.value) {
    chatRef.value.handleClear();
    window.location.reload();
  }
};

/*
const handleNewContactMessage = async (contact: IUser): Promise<any> => {
  if (contact.id) {
    // navigateToGroup(contact.id);
  } else {
    // const createdTopic = await createTopic(contact.id);
    // conversationId: createdTopic?.id || contact.conversationId || contact.id
  }
};
 */

const handleNewGroupMessage = async (group: any): Promise<void> => {
  if (!group || !(group.conversationId || group.topicId)) {
    console.error('Invalid group data');
    closeModals();
    return;
  }

  navigateToGroup(state.groupId);

  try {
    const sdk = getChatSDK();

    const conversationId = group.conversationId || group.topicId;
    await sdk.joinTopic(conversationId);
  } catch (error) {
    console.error('Failed to join topic in handleNewGroupMessage:', error);
  }
};

const isActiveHeader = (
  routeObj: { type?: string | null; id?: string | null } | null
): boolean => {
  if (!routeObj) return false;
  if (routeObj.type === 'group' && routeObj.id !== null) return true;
  if (routeObj.type === 'dialogs' && routeObj.id !== null) return true;
  return routeObj.type !== 'assistant' && routeObj.type !== 'default';
};

useAndroidBackButton({
  onBack: () => {
    if (isMobile.value) {
      state.isMenuMobileOpen = false;
      state.isNewContactOpen = false;
      state.isNewGroupOpen = false;
    }
  }
});

watch(
  () => [route.value.id, route.value.type],
  () => {
    if (isMobile.value) {
      state.isActiveHeader = false;
    } else {
      state.isActiveHeader = isActiveHeader(route.value);
    }
  }
);

onMounted(async () => {
  try {
    if (isMobile.value) {
      state.isActiveHeader = false;
    } else {
      state.isActiveHeader = isActiveHeader(route.value);
    }
  } finally {
    state.isLoading = false;
  }
});
</script>
