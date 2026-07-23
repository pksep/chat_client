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
    <Header
      v-if="state.isActiveHeader"
      class="chat__header"
      :display-route="headerDisplayRoute"
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
      @unmount-new-bot="handleNewBot"
      @unmount-new-group="handleNewGroup"
    />
    <Chat
      class="chat__messages"
      ref="chatRef"
      :show-update-banner="showUpdateBanner"
      :update-action-label="updateActionLabel"
      :update-progress="updateProgress"
      :is-update-action-disabled="isUpdateActionDisabled"
      :on-update-click="handleUpdateClick"
      :on-dismiss-update-banner="dismissUpdateBanner"
      :dataTestid="`${props.dataTestid}-ChatContainer-Chat`"
      @rendered-topic-change="emit('rendered-topic-change', $event)"
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
        <BotInfoPanel
          v-if="isBotUserInfo"
          :user="activeUser"
          :topic="activeTopic"
          show-header
          :data-testid="`${props.dataTestid}-ChatContainer-BotInfoPanel`"
          @close="closeUserInfo"
        />
        <UserInfoPanel
          v-else
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
      :title="userInfoModalTitle"
      close-button-text="Назад"
      :class="{ 'chat__header-modal-info--active': true }"
      :data-testid="`${props.dataTestid}-ChatContainer-MobileUserInfoModal`"
      @unmount-close="closeUserInfo"
    >
      <BotInfoPanel
        v-if="isBotUserInfo"
        :user="activeUser"
        :topic="activeTopic"
        is-mobile
        :data-testid="`${props.dataTestid}-ChatContainer-MobileBotInfoPanel`"
        @close="closeUserInfo"
      />
      <UserInfoPanel
        v-else
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

    <NewBotModal
      :open="state.isNewBotOpen"
      :data-testid="`${props.dataTestid}-ChatContainer-NewBotModal`"
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

  <CallModal v-if="shouldRenderCallModal" />
  <VpnConfirmModal
    :open="isVpnConfirmModalOpen"
    :data-testid="`${props.dataTestid}-VpnConfirmModal`"
    @close="handleCloseVpnConfirmModal"
    @open-settings="handleOpenVpnSettings"
  />
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
import BotInfoPanel from './BotInfoPanel.vue';
import {
  MobilePlatformEnum,
  type IChatContainerProps,
  type IHeaderDisplayRoute,
  type IMessageRenderedTopicState
} from './interfaces/interfaces';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_MD } from '../utils/constants';
import { getAuthUser } from '../composables/useAuth';
import MobileModal from './UI/MobileModal.vue';
import { Button, ButtonTypeEnum } from '@pksep/yui';
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
import {
  invitedGroupCallInfo,
  isAnyCallDialing,
  isAnyCallIncoming,
  isCallActive,
  isAnyCallModalVisible
} from '../services/useCallState';
import { useChatWallpaper } from '../composables/useChatWallpaper';
import { useUserInfoModal } from '../composables/useUserInfoModal';
import VpnConfirmModal from './UI/VpnConfirmModal.vue';
import { useVpnStatus } from '../services/useVpnStatus';
import { isBotTopic, isBotUser } from '../utils/bot';
import { clearMessagesForTopic } from '../services/useMessages';
import { getSelectedTopic } from '../composables/useTopics';
import { isFavoriteTopic } from '../utils/favorite-topic';

const NewContactModal = defineAsyncComponent(
  () => import('./NewChat/NewContactModal.vue')
);
const NewBotModal = defineAsyncComponent(
  () => import('./NewChat/NewBotModal.vue')
);
const NewGroupModal = defineAsyncComponent(
  () => import('./NewChat/NewGroupModal.vue')
);
const CallModal = defineAsyncComponent(
  () => import('./CallModal/CallModal.vue')
);

const {
  mobilePlatform,
  handleInstall,
  showDownloadModal,
  showUpdateBanner,
  updateActionLabel,
  updateProgress,
  isUpdateActionDisabled,
  handleUpdateClick,
  dismissUpdateBanner
} = useMobileApp();

const route = useUrlWatcher();

const { state: isMobile } = useResizeState(MAX_W_MD);
const {
  isVpnActive,
  ensureVpnStatusPolling,
  openVpnSettings,
  refreshVpnStatus
} = useVpnStatus();

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
  isNewBotOpen: false,
  isNewGroupOpen: false,
  isLoading: true,
  isActiveHeader: false
});

const resolveAppMode = (): string | null => {
  const envMode = import.meta.env.VITE_APP_MODE;

  if (['local', 'test', 'beta'].includes(envMode)) {
    return envMode;
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();

    if (host === 'beta-chat.pksep.ru' || host.startsWith('beta-chat.')) {
      return 'beta';
    }
  }

  return null;
};

const appMode = resolveAppMode();
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
    'chat-container--wallpaper': isWallpaperApplied.value
  }
]);
const shouldRenderCallModal = computed(
  () =>
    isCallActive.value ||
    isAnyCallModalVisible.value ||
    isAnyCallDialing.value ||
    isAnyCallIncoming.value
);

const users = computed(() => getUsersList());
const { isUserInfoOpen, activeUser, activeTopic, closeUserInfo } =
  useUserInfoModal();
const isBotUserInfo = computed(
  () => isBotTopic(activeTopic.value) || isBotUser(activeUser.value)
);
const userInfoModalTitle = computed(() =>
  isBotUserInfo.value ? 'Информация о боте' : 'Информация'
);

const props = withDefaults(defineProps<IChatContainerProps>(), {
  dataTestid: 'ChatContainer'
});
const emit = defineEmits<{
  (e: 'rendered-topic-change', payload: IMessageRenderedTopicState): void;
}>();

const chatRef = ref<InstanceType<typeof Chat> | null>(null);
const isVpnConfirmModalOpen = ref(false);
const hasDismissedActiveVpnWarning = ref(false);

const authUser = computed(() => getAuthUser());

const headerDisplayRoute = computed<IHeaderDisplayRoute>(() => {
  const currentRoute = route.value;

  return {
    type: currentRoute.type,
    id: currentRoute.id
  };
});

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
  if (route.value.type === RouteTypes.FAVORITES) {
    return;
  }

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

const handleNewBot = async (config): Promise<void> => {
  if (isMobile.value) {
    return;
  }

  state.isNewBotOpen = config.isChapterOpen;
};

const handleNewGroup = (config): void => {
  state.isNewGroupOpen = config.isChapterOpen;
};

const closeModals = (): void => {
  state.isNewContactOpen = false;
  state.isNewBotOpen = false;
  state.isNewGroupOpen = false;
  state.isAppModalOpen = false;
};

const handleInformationClick = (): void => {
  state.isMenuDesktopOpen = true;
  state.activeTabId = 2;
};

const handleClearClick = async (): Promise<void> => {
  if (route.value && route.value.type === 'ai' && chatRef.value) {
    chatRef.value.handleClear();
    const { markLiveKitPageReloadIntent } = await import(
      '../services/useLiveKit'
    );
    markLiveKitPageReloadIntent();
    window.location.reload();
    return;
  }

  if (!route.value.id) {
    return;
  }

  const selectedTopic = getSelectedTopic(route.value.id);
  const isFavorite =
    route.value.type === RouteTypes.FAVORITES ||
    isFavoriteTopic(selectedTopic, getAuthUser()?.id);

  if (!isFavorite) {
    return;
  }

  const sdk = getChatSDK();

  if (!sdk) {
    return;
  }

  try {
    await sdk.clearTopicHistory(route.value.id);
    clearMessagesForTopic(route.value.id, { syncLastMessage: true });
  } catch (error) {
    console.error('Не удалось очистить историю Избранного:', error);
  }
};

const handleCloseVpnConfirmModal = (): void => {
  hasDismissedActiveVpnWarning.value = true;
  isVpnConfirmModalOpen.value = false;
};

const handleOpenVpnSettings = async (): Promise<void> => {
  hasDismissedActiveVpnWarning.value = true;
  isVpnConfirmModalOpen.value = false;

  try {
    await openVpnSettings();
  } catch (error) {
    console.warn('Failed to open VPN settings:', error);
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
    if (routeObj.type === 'favorites') return true;
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
    if (
      route.value.type === RouteTypes.DIALOGS ||
      route.value.type === RouteTypes.FAVORITES
    ) {
      state.isMenuDesktopOpen = false;
      state.isNewContactOpen = false;
      state.isNewBotOpen = false;
      state.isNewGroupOpen = false;
    }

    if (!route.value?.id) {
      state.isMenuDesktopOpen = false;
    }
  }
);

watch(
  isVpnActive,
  active => {
    if (!active) {
      hasDismissedActiveVpnWarning.value = false;
      isVpnConfirmModalOpen.value = false;
      return;
    }

    if (!hasDismissedActiveVpnWarning.value) {
      isVpnConfirmModalOpen.value = true;
    }
  },
  { immediate: true }
);

onMounted(async () => {
  ensureVpnStatusPolling();

  try {
    state.isActiveHeader = route.value ? isActiveHeader(route.value) : false;
    await refreshVpnStatus();
  } finally {
    state.isLoading = false;
  }
});
</script>
