<template>
  <div v-if="!state.isLoading && appMode" class="chat_container_alert">
    {{ appMode }}
  </div>
  <main
    id="chat-container-image"
    :class="chatContainerClasses"
    :style="chatWallpaperStyle"
    :data-testid="`${props.dataTestid}-ChatContainer-Container`"
  >
    <section
      v-if="showUpdateBanner"
      class="chat-update-banner"
      :data-testid="`${props.dataTestid}-ChatContainer-UpdateBanner`"
    >
      <div class="chat-update-banner__content">
        <p class="chat-update-banner__title">Доступна новая версия</p>
        <p class="chat-update-banner__description">
          Обновите приложение, чтобы получить новые функции
        </p>
      </div>
      <button
        type="button"
        class="chat-update-banner__action"
        :data-testid="`${props.dataTestid}-ChatContainer-UpdateBannerInstallButton`"
        :disabled="isUpdateActionDisabled"
        @click="handleUpdateClick"
      >
        {{ updateActionLabel }}
      </button>
      <button
        type="button"
        class="chat-update-banner__close"
        :data-testid="`${props.dataTestid}-ChatContainer-UpdateBannerCloseButton`"
        aria-label="Закрыть уведомление об обновлении"
        @click="dismissUpdateBanner"
      >
        <Icon :name="IconNameEnum.crossLarge" />
      </button>
    </section>
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
      <Modal
        :open="state.isMenuDesktopOpen"
        class="chat__info__modal"
        position="right"
        width="404px"
        @close="handleMenuToggle(false)"
      >
        <MenuInfo
          class="chat__info"
          :open="state.isMenuDesktopOpen"
          :active-tab-id="state.activeTabId"
          :dataTestid="`${props.dataTestid}-ChatContainer-MenuInfo`"
          @unmount-collapse="handleMenuToggle"
        />
      </Modal>

      <Modal
        :open="isUserInfoOpen"
        class="chat__user-info-modal"
        width="404px"
        @close="closeUserInfo"
      >
        <UserInfoPanel
          :user="activeUser"
          :topic="activeTopic"
          show-header
          :data-testid="`${props.dataTestid}-ChatContainer-UserInfoPanel`"
          @close="closeUserInfo"
        />
      </Modal>
    </template>
    <MobileModal
      v-if="isMobile"
      :open="isUserInfoOpen"
      title="Информация"
      close-button-text="Назад"
      :class="{ 'chat__header-modal-info--active': true }"
      :data-testid="`${props.dataTestid}-ChatContainer-MobileUserInfoModal`"
      @unmount-close="closeUserInfo"
    >
      <UserInfoPanel
        :user="activeUser"
        :topic="activeTopic"
        :data-testid="`${props.dataTestid}-ChatContainer-MobileUserInfoPanel`"
        @close="closeUserInfo"
      />
    </MobileModal>
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
      v-if="showDownloadModal"
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

  <CallModal />
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
import UserInfoPanel from './UserInfoPanel.vue';
import {
  MobilePlatformEnum,
  type IChatContainerProps
} from './interfaces/interfaces';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_MD } from '../utils/constants';
import { getAuthUser } from '../composables/useAuth';
import MobileModal from './UI/MobileModal.vue';
import { Button, ButtonTypeEnum, Icon, IconNameEnum } from '@pksep/yui';
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
import CallModal from './CallModal/CallModal.vue';
import {
  invitedGroupCallInfo,
  isCallActive,
  isAnyCallModalVisible,
  pendingGroupCallInfo
} from '../services/useCalls';
import { useChatWallpaper } from '../composables/useChatWallpaper';
import { useUserInfoModal } from '../composables/useUserInfoModal';

const NewContactModal = defineAsyncComponent(
  () => import('./NewChat/NewContactModal.vue')
);
const NewGroupModal = defineAsyncComponent(
  () => import('./NewChat/NewGroupModal.vue')
);

const {
  mobilePlatform,
  handleInstall,
  showDownloadModal,
  showUpdateBanner,
  updateActionLabel,
  isUpdateActionDisabled,
  handleUpdateClick,
  dismissUpdateBanner
} = useMobileApp();

const route = useUrlWatcher();

const { state: isMobile } = useResizeState(MAX_W_MD);

const { toggle } = useResizeState({
  breakpoint: MAX_W_MD,
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

const appMode = ['local', 'test'].includes(import.meta.env.VITE_APP_MODE)
  ? import.meta.env.VITE_APP_MODE
  : null;
const { currentWallpaperStyle: chatWallpaperStyle, isWallpaperApplied } =
  useChatWallpaper();

const chatContainerClasses = computed(() => [
  'chat-container',
  {
    'menu-collapse':
      (route.value && route.value.type === 'ai') ||
      (route.value && route.value.type === 'assistant')
        ? true
        : !state.isMenuDesktopOpen,
    'chat-container--wallpaper': isWallpaperApplied.value,
    'chat-container--active-call':
      (isCallActive.value && !isAnyCallModalVisible.value) ||
      !!pendingGroupCallInfo.value?.[route.value?.id || ''] ||
      !!invitedGroupCallInfo.value?.isJoinAvailable
  }
]);

const users = computed(() => getUsersList());
const { isUserInfoOpen, activeUser, activeTopic, closeUserInfo } =
  useUserInfoModal();

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
  if (invitedGroupCallInfo.value?.isJoinAvailable) {
    return true;
  }

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

    if (!route.value?.id) {
      state.isMenuDesktopOpen = false;
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
