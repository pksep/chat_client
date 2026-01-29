<template>
  <template v-if="state.isLoading">
    <Modal
      :open="state.isLoading"
      position="center"
      width="150px"
      height="160px"
    >
      <Loader :dataTestid="`${props.dataTestid}-ChatContainer-Loading`" />
    </Modal>
  </template>
  <main
    id="chat-container-image"
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

    <NewGroupModal
      :user="authUser"
      :contacts="users"
      :open="state.isNewGroupOpen"
      :data-testid="`${props.dataTestid}-ChatContainer-NewGroupModal`"
      @unmount-close="closeModals"
      @unmount-new-group="handleNewGroupMessage"
    />

    <MobileModal
      v-if="mobilePlatform"
      class="mobile-modal"
      headerClass="hidden"
      :show-divider="false"
      :open="state.isAppModalOpen"
      @unmount-close="closeModals"
    >
      <Button
        v-if="mobilePlatform === MobilePlatformEnum.ANDROID"
        class="mobile-modal-download-button"
        @click="handleInstall"
        ><AndroidIcon />Загрузить на Android</Button
      >
      <Button
        v-if="mobilePlatform === MobilePlatformEnum.APPLE"
        disabled
        class="mobile-modal-download-button"
        @click="handleInstall"
        ><AppleIcon /> Загрузить на iOS</Button
      >
      <Button :type="ButtonTypeEnum.secondary" @click="closeModals"
        >Остаться в браузере</Button
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
import {
  MobilePlatformEnum,
  type IChatContainerProps
} from './interfaces/interfaces';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_MD, MAX_W_XL } from '../utils/constants';
import { getAuthUser } from '../composables/useAuth';
import MobileModal from './UI/MobileModal.vue';
import { Loader, Button, ButtonTypeEnum } from '@pksep/yui';
import {
  navigateToDefault,
  navigateToGroup,
  useUrlWatcher
} from '../composables/navigation';
import { getChatSDK } from '../services/useChat';
import { getUsersList } from '../composables/useUsers';
import { RouteTypes } from '../composables/navigation/useUrlRouting';
import { Modal } from '@pksep/yui';
import AndroidIcon from './UI/AndroidIcon.vue';
import AppleIcon from './UI/AppleIcon.vue';
import { useMobileApp } from '../composables/useMobileApp';

const NewContactModal = defineAsyncComponent(
  () => import('./NewChat/NewContactModal.vue')
);
const NewGroupModal = defineAsyncComponent(
  () => import('./NewChat/NewGroupModal.vue')
);

const { mobilePlatform, handleInstall } = useMobileApp();

const route = useUrlWatcher();

const { state: isMobile } = useResizeState(MAX_W_MD);

const { toggle } = useResizeState({
  breakpoint: MAX_W_XL,
  storageKey: 'menu-collapse'
});

const state = reactive({
  isAppModalOpen: true,
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
  {
    'menu-collapse':
      (route.value && route.value.type === 'ai') ||
      (route.value && route.value.type === 'assistant')
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
  state.isAppModalOpen = false;
};

const handleInformationClick = (): void => {
  state.isMenuDesktopOpen = true;
  state.activeTabId = 2;
};

const handleClearClick = (): void => {
  if (route.value && route.value.type === 'ai' && chatRef.value) {
    chatRef.value.handleClear();
    window.location.reload();
  }
};

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
  if (routeObj.type === 'ai') return true;
  if (routeObj.id !== null) {
    if (routeObj.type === 'group') return true;
    if (routeObj.type === 'dialogs') return true;
    if (!isMobile.value) {
      return false;
    }
    return true;
  } else if (!isMobile.value) {
    navigateToDefault();
    return false;
  }
  return false;
};

watch(
  () => [route.value?.id, route.value?.type],
  () => {
    state.isActiveHeader = route.value ? isActiveHeader(route.value) : false;
    if (route.value.type === RouteTypes.DIALOGS) {
      state.isMenuDesktopOpen = false;
      state.isNewContactOpen = false;
      state.isNewGroupOpen = false;
    }
  }
);

onMounted(async () => {
  try {
    state.isActiveHeader = route.value ? isActiveHeader(route.value) : false;
  } finally {
    state.isLoading = false;
  }
});
</script>
