<template>
  <header
    :class="['chat__header-wrapper', $attrs.class]"
    :data-testid="`${props.dataTestid}-Header-Container`"
  >
    <div
      v-if="showHeaderCallBanner"
      class="chat__header-active-call"
      @click.stop="handleHeaderCallClick"
    >
      <LeaveIcon />
      <span>{{ resolvedHeaderCallLabel }}</span>

      <span v-if="showHeaderCallTime" class="chat__header-active-call__time">
        {{ headerCallTimeLabel }}
      </span>
    </div>

    <div
      v-if="!!isMobile || route.type === 'ai' || !!currentTopic"
      class="chat__header-main"
      @click="handleClickHeader"
    >
      <Button
        v-if="isMobile"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        :data-testid="`${props.dataTestid}-Header-BackButton`"
        @click.stop="handleExit"
      >
        <Icon
          class="medium-icon"
          :name="IconNameEnum.arrowLeft"
          :data-testid="`${props.dataTestid}-Header-BackIcon`"
        />
      </Button>

      <div
        v-if="route.type === 'ai'"
        class="chat__header-profile chat__header-ai-assistant"
        :data-testid="`${props.dataTestid}-Header-AIAssistant`"
      >
        <span
          class="chat__header-ai-icon"
          :data-testid="`${props.dataTestid}-Header-AIAssistantIcon`"
        >
          <AiSparkleIcon />
        </span>
        <h3 :data-testid="`${props.dataTestid}-Header-AIAssistantTitle`">
          {{ aiAssistantTitle }}
        </h3>
      </div>

      <template v-else-if="currentTopic">
        <FavoriteTopicProfile
          v-if="isFavoriteDialogTopic"
          class="chat__header-profile"
          :data-testid="`${props.dataTestid}-Header-FavoriteTopicProfile`"
        />
        <div
          v-else-if="isCallTopicRoute"
          class="user-profile chat__header-profile chat__header-call-topic"
          :data-testid="`${props.dataTestid}-Header-CallTopicProfile`"
          @click.stop
        >
          <BotAvatar
            class="user-profile__avatar"
            :size="40"
            :is-online="false"
            :data-testid="`${props.dataTestid}-Header-CallTopicAvatar`"
          />
          <h3
            class="user-profile__title"
            :data-testid="`${props.dataTestid}-Header-CallTopicTitle`"
          >
            Звонилка
          </h3>
          <TypingIndicator
            v-if="callTopicTypingLabel"
            class="user-profile__ex user-profile__ex--typing"
            :label="callTopicTypingLabel"
            :data-testid="`${props.dataTestid}-Header-CallTopicTyping`"
          />
          <span
            v-else
            class="user-profile__ex"
            :data-testid="`${props.dataTestid}-Header-CallTopicEx`"
          >
            @zvonilka
          </span>
        </div>
        <GroupProfile
          v-else-if="currentTopic.type === TopicType.Group"
          class="chat__header-profile"
          avatar-alt="group-profile-alt"
          :topic="currentRouteGroup || currentTopic"
          :typing-label="headerTypingLabel || undefined"
          :data-testid="`${props.dataTestid}-Header-GroupProfile`"
          @click.stop="handleClickHeader"
        />
        <UserProfile
          v-else-if="currentTopic.type === TopicType.DM"
          :class="[
            'chat__header-profile',
            {
              'user-profile--interactive': canOpenUserInfo(currentTopic.user)
            }
          ]"
          avatar-alt="user-profile-alt"
          :user="currentTopic.user"
          :typing-label="headerTypingLabel || undefined"
          hide-deleted-account-status
          :data-testid="`${props.dataTestid}-Header-UserProfile`"
          @click.stop="handleUserProfileClick"
        />
      </template>

      <div
        class="chat__header-buttons"
        :data-testid="`${props.dataTestid}-Header-ButtonsContainer`"
        @click.stop
      >
        <div
          v-if="
            (isTopicSearchAvailable || route.type === RouteTypes.AI) &&
            !isMobile
          "
          class="chat__header-search-trigger"
        >
          <SearchIcon
            class="chat__header__icon"
            :data-testid="`${props.dataTestid}-Header-SearchIcon`"
            @click.stop="route.type !== RouteTypes.AI && showSearch()"
          />
        </div>
        <CallIcon
          v-if="
            (route.type === RouteTypes.DIALOGS ||
              route.type === RouteTypes.GROUP) &&
            !isBotDialogTopic &&
            !isFavoriteDialogTopic &&
            !isCallTopicRoute &&
            !isCallActive &&
            !hasPendingCallForCurrentTopic
          "
          class="chat__header__icon"
          :data-testid="`${props.dataTestid}-Header-CallIcon`"
          @click.stop="handleCall"
        />
        <Icon
          v-if="getHeaderContextMenuOptions.length"
          class="chat__header__icon chat__header__icon--more"
          :name="IconNameEnum.moreHorizontal"
          :data-testid="`${props.dataTestid}-Header-PopoverIcon`"
          @click.stop="
            event => openActivePopover('headerMenu', event as MouseEvent)
          "
        />
        <ContextMenu
          v-if="getHeaderContextMenuOptions.length"
          class="chat__header-context-menu"
          :visible="!!isOpen['headerMenu']"
          :position="position"
          :data-testid="`${props.dataTestid}-Header-ContextMenu`"
          @unmount-close="closeActivePopover('headerMenu')"
          @click="closeActivePopover('headerMenu')"
        >
          <Button
            v-for="option in getHeaderContextMenuOptions"
            :key="option.value"
            :type="ButtonTypeEnum.ghost"
            :size="SizesEnum.small"
            :style="option.style"
            :class="[
              'chat__header-context-menu-button',
              {
                'red-context-button':
                  option.style?.includes('var(--error-color)')
              }
            ]"
            :data-testid="`${props.dataTestid}-Header-ContextMenu-${option.value}`"
            @click="handleContextMenuAction(option.function)"
          >
            <HeaderContextSearchIcon
              v-if="option.customIcon === 'search'"
              class="chat__header-context-menu-icon"
            />
            <Icon v-else-if="option.iconName" :name="option.iconName" />
            {{ option.value }}
          </Button>
        </ContextMenu>
      </div>
    </div>

    <div
      v-if="state.isSearchInputEnable && !isMobile && isTopicSearchAvailable"
      class="chat__header-desktop-search-row"
      :data-testid="`${props.dataTestid}-Header-SearchPanel`"
      @click.stop
      @keydown.capture="handleTopicSearchKeydown"
    >
      <Search
        ref="desktopTopicSearchRef"
        class="chat__header-search"
        :model-value="topicSearchQuery"
        :data-testid="`${props.dataTestid}-Header-SearchInput`"
        @update:model-value="handleTopicSearchInput"
      />
      <LoadingIcon
        v-if="isTopicSearchLoading"
        class="chat__header-search-loader"
        :is-loaded="false"
        :data-testid="`${props.dataTestid}-Header-SearchLoader`"
      />
      <span
        v-else-if="hasTopicSearchQuery"
        class="chat__header-search-count"
        :data-testid="`${props.dataTestid}-Header-SearchCount`"
      >
        {{ topicSearchResultLabel }}
      </span>
      <span v-else class="chat__header-search-count"></span>

      <Button
        v-if="hasTopicSearchResults"
        class="chat__header-search-nav"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        :disabled="!canNavigateTopicSearchPrev"
        :data-testid="`${props.dataTestid}-Header-SearchPrev`"
        @click.stop="navigateTopicSearch(1)"
      >
        <Icon
          :name="IconNameEnum.arrowLeft"
          :style="{ transform: 'rotate(90deg)' }"
        />
      </Button>
      <Button
        v-if="hasTopicSearchResults"
        class="chat__header-search-nav"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        :disabled="!canNavigateTopicSearchNext"
        :data-testid="`${props.dataTestid}-Header-SearchNext`"
        @click.stop="navigateTopicSearch(-1)"
      >
        <Icon
          :name="IconNameEnum.arrowLeft"
          :style="{ transform: 'rotate(-90deg)' }"
        />
      </Button>

      <Button
        class="chat__header-search-nav chat__header-search-close"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        :data-testid="`${props.dataTestid}-Header-SearchClose`"
        @click.stop="hideSearch"
      >
        <Icon
          :name="IconNameEnum.crossLarge"
          color="var(--text-neutral-color)"
        />
      </Button>
    </div>

    <div
      v-if="state.isSearchInputEnable && isMobile && isTopicSearchAvailable"
      class="chat__header-mobile-search-row"
      :data-testid="`${props.dataTestid}-Header-MobileSearchRow`"
      @click.stop
      @keydown.capture="handleTopicSearchKeydown"
    >
      <Search
        ref="mobileTopicSearchRef"
        class="chat__header-search"
        :model-value="topicSearchQuery"
        :data-testid="`${props.dataTestid}-Header-MobileSearchInput`"
        @update:model-value="handleTopicSearchInput"
      />
      <Button
        class="chat__header-search-nav"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        :data-testid="`${props.dataTestid}-Header-MobileSearchClose`"
        @click.stop="hideSearch"
      >
        <Icon
          :name="IconNameEnum.crossLarge"
          color="var(--text-neutral-color)"
        />
      </Button>
    </div>
  </header>

  <div
    v-if="state.isSearchInputEnable && isMobile && isTopicSearchAvailable"
    class="chat__header-mobile-search-controls"
    :data-testid="`${props.dataTestid}-Header-MobileSearchControls`"
    @click.stop
  >
    <div class="chat__header-mobile-search-controls-content">
      <LoadingIcon
        v-if="isTopicSearchLoading"
        class="chat__header-search-loader"
        :is-loaded="false"
        :data-testid="`${props.dataTestid}-Header-MobileSearchLoader`"
      />
      <span
        v-else-if="hasTopicSearchQuery"
        class="chat__header-search-count"
        :data-testid="`${props.dataTestid}-Header-MobileSearchCount`"
      >
        {{ topicSearchResultLabel }}
      </span>
      <span v-else class="chat__header-search-count"></span>

      <div class="chat__header-mobile-search-controls__nav">
        <Button
          v-if="hasTopicSearchResults"
          class="chat__header-search-nav"
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.little"
          :disabled="!canNavigateTopicSearchPrev"
          :data-testid="`${props.dataTestid}-Header-MobileSearchPrev`"
          @click.stop="navigateTopicSearch(1)"
          style="transform: rotate(90deg)"
        >
          <Icon :name="IconNameEnum.arrowLeft" />
        </Button>
        <Button
          v-if="hasTopicSearchResults"
          class="chat__header-search-nav"
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.little"
          :disabled="!canNavigateTopicSearchNext"
          :data-testid="`${props.dataTestid}-Header-MobileSearchNext`"
          @click.stop="navigateTopicSearch(-1)"
          style="transform: rotate(-90deg)"
        >
          <Icon :name="IconNameEnum.arrowLeft" />
        </Button>
      </div>

      <Button
        class="chat__header-search-nav"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.little"
        :data-testid="`${props.dataTestid}-Header-MobileSearchBottomClose`"
        @click.stop="hideSearch"
      >
        <Icon
          :name="IconNameEnum.crossLarge"
          color="var(--text-neutral-color)"
        />
      </Button>
    </div>
  </div>

  <MobileModal
    :open="state.openMobileInfoModal"
    title="Информация о группе"
    close-button-text="Назад"
    :class="{ 'chat__header-modal-info--active': true }"
    :data-testid="`${props.dataTestid}-Header-MobileModal`"
    @unmount-close="handleCloseMobileInfoModal"
  >
    <template #header>
      <button
        class="mobile__modal-header--button"
        @click="handleCloseMobileInfoModal"
      >
        Назад
      </button>
      <div class="chat__mobile-group-info-title">
        <h3>Информация о группе</h3>
        <span>{{ mobileInfoMembersLabel }}</span>
      </div>
      <span class="chat__mobile-group-info-header-spacer" aria-hidden="true" />
    </template>
    <MobileChatInfo
      v-if="mobileInfo"
      :model-value="mobileInfo"
      :members="mobileInfoMembers"
      :show-add-button="mobileInfoShowAddButton"
      is-menu-info
      :data-testid="props.dataTestid"
      @update:model-value="handleUpdateInformation"
      @unmount-open-chat="handleCloseMobileInfoModal"
    />
  </MobileModal>

  <MobileModal
    :open="state.openMobileUserProfileModal"
    title="Информация"
    close-button-text="Назад"
    :class="{ 'chat__header-modal-info--active': true }"
    :data-testid="`${props.dataTestid}-Header-MobileUserProfileModal`"
    @unmount-close="handleCloseMobileUserProfileModal"
  >
    <UserInfoPanel
      :user="currentTopic?.user"
      :topic="currentTopic"
      :data-testid="`${props.dataTestid}-Header-UserInfoPanel`"
      @close="handleCloseMobileUserProfileModal"
    />
  </MobileModal>

  <ConfirmModal
    :open="state.openActionModal"
    :title="actionModalTitle"
    :description="actionModalDescription"
    @unmount-close="handleCloseActionModal"
    @unmount-confirm="handleConfirmActionModal"
  />

  <ConfirmModal
    :open="state.openClearHistoryModal"
    title="Очистить историю"
    description="Вы уверены, что хотите удалить все сообщения в чате?"
    @unmount-close="handleCloseClearHistoryModal"
    @unmount-confirm="handleConfirmClearHistory"
  />
</template>

<script lang="ts" setup>
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  type ComponentPublicInstance,
  watch
} from 'vue';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import UserProfile from '../UserProfile/UserProfile.vue';
import GroupProfile from '../GroupProfile/GroupProfile.vue';
import FavoriteTopicProfile from '../FavoriteTopicProfile.vue';
import BotAvatar from '../UI/BotAvatar.vue';
import MobileModal from '../UI/MobileModal.vue';
import {
  Button,
  Icon,
  IconNameEnum,
  ButtonTypeEnum,
  SizesEnum,
  Search
} from '@pksep/yui';

import type {
  IHeaderProps,
  IHeaderEmits,
  IUser
} from '../interfaces/interfaces';
import AiSparkleIcon from '../AI/AiSparkleIcon.vue';
import { useAiAssistant } from '../../composables/useAiAssistant';
import MobileChatInfo from './MobileChatInfo.vue';
import {
  useMenuInfo,
  type IMenuInfoInformation
} from '../../composables/useMenuInfo';
import {
  navigateToAssistant,
  navigateToDefault,
  navigateToDialogsList,
  navigateToGroupsList,
  useUrlWatcher
} from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import {
  clearSelectedMessages,
  isMessageSelectionModeForTopic
} from '../../composables/useSelectedMessages';
import {
  deleteTopic,
  getTopicTypingUsers,
  toggleMuteTopic,
  useTopics
} from '../../composables/useTopics';
import {
  currentGroup,
  deleteGroup,
  getGroupById,
  quitGroup
} from '../../composables/useGroup';
import ConfirmModal from '../UI/ConfirmModal.vue';
import { TopicType } from '../../services/useChatSDK/types';
import CallIcon from '../CallModal/UI/CallIcon.vue';
import SearchIcon from '../UI/SearchIcon.vue';
import HeaderContextSearchIcon from '../UI/HeaderContextSearchIcon.vue';
import LoadingIcon from '../UI/LoadingIcon.vue';
import TypingIndicator from '../UI/TypingIndicator.vue';
import ContextMenu from '../ContactList/ContextMenu.vue';
import {
  activeCallParticipantCount,
  activeCallTopicId,
  activeCallUser,
  activeCallFormattedTime,
  isAnyCallDialing,
  isAnyCallModalVisible,
  isCallActive,
  isModalVisible as isCallModalVisible,
  invitedGroupCallInfo,
  pendingGroupCallInfo
} from '../../services/useCallState';
import LeaveIcon from '../CallModal/UI/LeaveIcon.vue';
import { getTypingIndicatorLabel } from '../../utils/typingIndicator';
import UserInfoPanel from '../UserInfoPanel.vue';
import { useUserInfoModal } from '../../composables/useUserInfoModal';
import { useContextMenu } from '../../composables/useContextMenu';
import {
  navigateToSearchResult,
  searchMessages,
  setMobileTopicSearchActive,
  type IMessageSearchResult
} from '../../composables/useMessageSearch';
import { isBotTopic } from '../../utils/bot';
import { isFavoriteTopic } from '../../utils/favorite-topic';
import { isCallTopic } from '../../utils/call-topic';
import {
  isCallSummaryMaterialTypingInTopic,
  loadLatestCallSummary
} from '../../services/useCallSummaries';

const { activeTitle: aiAssistantTitle } = useAiAssistant();

const { getSelectedTopic } = useTopics();
const { openUserInfo, canOpenUserInfo } = useUserInfoModal();
const { isOpen, position, openActivePopover, closeActivePopover } =
  useContextMenu();

const showCallModal = (): void => {
  isCallModalVisible.value = true;
};

const joinInviteGroupCall = async () => {
  const { joinInviteGroupCall } = await import('../../services/useCalls');

  return joinInviteGroupCall();
};

const joinGroupCall = async (topicId?: string) => {
  const { joinGroupCall } = await import('../../services/useCalls');

  return joinGroupCall(topicId);
};

const props = withDefaults(defineProps<IHeaderProps>(), {
  dataTestid: 'Header'
});

defineOptions({
  inheritAttrs: false
});

const emits = defineEmits<IHeaderEmits>();
const currentRoute = useUrlWatcher();
const route = computed(() => props.displayRoute || currentRoute.value);

const state = reactive({
  loader: false,
  openMobileInfoModal: false,
  openMobileUserProfileModal: false,
  isSearchInputEnable: false,
  openActionModal: false,
  openClearHistoryModal: false,
  calledUser: null,
  roomId: null
});

const currentTopic = computed(() =>
  route.value.id ? getSelectedTopic(route.value.id) : undefined
);
const isFavoriteDialogTopic = computed(
  () =>
    route.value.type === RouteTypes.FAVORITES ||
    isFavoriteTopic(currentTopic.value)
);
const isBotDialogTopic = computed(
  () =>
    route.value.type === RouteTypes.DIALOGS && isBotTopic(currentTopic.value)
);
const isCallTopicRoute = computed(() => isCallTopic(currentTopic.value));
const currentRouteGroup = computed(() => {
  if (currentTopic.value?.type !== TopicType.Group) {
    return null;
  }

  if (currentGroup.value?.id !== currentTopic.value.id) {
    return null;
  }

  return currentGroup.value;
});
const mobileInfo = computed<IMenuInfoInformation | null>(() => {
  const topic = currentRouteGroup.value || currentTopic.value;

  if (!topic || topic.type !== TopicType.Group) {
    return null;
  }

  return {
    id: topic.id,
    name: topic.group?.title || topic.name,
    groupId: topic.group?.id || topic.id,
    topicId: topic.id,
    avatarUrl: topic.group?.avatarUrl || topic.avatarUrl || undefined,
    date: topic.group?.createdAt ? new Date(topic.group.createdAt) : undefined
  };
});
const mobileInfoMembers = computed<IUser[]>(() => {
  const topic = currentRouteGroup.value || currentTopic.value;
  return (topic?.members || []).filter(Boolean) as IUser[];
});
const mobileInfoShowAddButton = computed(
  () => !!(currentRouteGroup.value?.isAdmin ?? currentTopic.value?.isAdmin)
);
const getParticipantForm = (count: number): string => {
  const lastTwoDigits = Math.abs(count) % 100;
  const lastDigit = Math.abs(count) % 10;

  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) {
    return 'участников';
  }

  if (lastDigit === 1) {
    return 'участник';
  }

  if (lastDigit >= 2 && lastDigit <= 4) {
    return 'участника';
  }

  return 'участников';
};
const mobileInfoMembersLabel = computed(() => {
  const count = mobileInfoMembers.value.length;
  return `${count} ${getParticipantForm(count)}`;
});
const actionModalTitle = computed(() =>
  route.value.type === RouteTypes.DIALOGS
    ? 'Удаление чата'
    : currentRouteGroup.value?.isAdmin
      ? 'Удаление канала'
      : 'Выход из канала'
);

const actionModalDescription = computed(() =>
  route.value.type === RouteTypes.DIALOGS
    ? 'Вы уверены, что хотите удалить чат?'
    : currentRouteGroup.value?.isAdmin
      ? 'Вы уверены, что хотите удалить канал?'
      : 'Вы уверены, что хотите покинуть канал?'
);
const currentTypingUsers = computed(() =>
  route.value?.id ? getTopicTypingUsers(route.value.id) : []
);
const headerTypingLabel = computed(() =>
  getTypingIndicatorLabel(currentTopic.value?.type, currentTypingUsers.value)
);
const callTopicTypingLabel = computed(() =>
  isCallSummaryMaterialTypingInTopic(currentTopic.value?.id) ? 'печатает' : ''
);
const activeCallTopic = computed(() =>
  activeCallTopicId.value ? getSelectedTopic(activeCallTopicId.value) : null
);
const { handleUpdateInformation } = useMenuInfo();
const { state: isMobile } = useResizeState(MAX_W_MD);
const currentPendingCall = computed(
  () => pendingGroupCallInfo.value?.[route.value.id || ''] || null
);
const currentInvitedCall = computed(() => invitedGroupCallInfo.value || null);
const currentTopicActiveCall = computed(
  () => currentTopic.value?.activeCall || null
);
const activeCallTopicEntry = computed(
  () =>
    activeCallTopic.value?.activeCall ||
    (activeCallTopicId.value
      ? pendingGroupCallInfo.value?.[activeCallTopicId.value] || null
      : null)
);
const currentHeaderCallEntry = computed(
  () =>
    currentPendingCall.value ||
    currentTopicActiveCall.value ||
    activeCallTopicEntry.value ||
    null
);
const hasPendingCallForCurrentTopic = computed(
  () => !!currentPendingCall.value || !!currentTopicActiveCall.value?.roomId
);
const hasInvitedCall = computed(
  () => !!currentInvitedCall.value?.isJoinAvailable
);
const showHeaderCallBanner = computed(
  () =>
    (isCallActive.value && !isAnyCallModalVisible.value) ||
    !!currentHeaderCallEntry.value ||
    hasInvitedCall.value
);
const currentTime = ref(Date.now());
let headerCallTimerInterval: ReturnType<typeof setInterval> | null = null;
let topicSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let topicSearchRequestToken = 0;
type SearchComponentRef = ComponentPublicInstance | Element | null;

const topicSearchQuery = ref('');
const topicSearchResults = ref<IMessageSearchResult[]>([]);
const topicSearchTotal = ref(0);
const topicSearchActiveIndex = ref(0);
const desktopTopicSearchRef = ref<SearchComponentRef>(null);
const mobileTopicSearchRef = ref<SearchComponentRef>(null);

const isTopicSearchLoading = ref(false);
const hasTopicSearchQuery = computed(
  () => normalizeTopicSearchQuery(topicSearchQuery.value).length > 0
);
const isTopicSearchAvailable = computed(
  () =>
    route.value.type === RouteTypes.DIALOGS ||
    route.value.type === RouteTypes.GROUP ||
    route.value.type === RouteTypes.CALL ||
    route.value.type === RouteTypes.FAVORITES
);
const hasTopicSearchResults = computed(
  () => topicSearchResults.value.length > 0
);
const canNavigateTopicSearchPrev = computed(
  () =>
    hasTopicSearchResults.value &&
    topicSearchActiveIndex.value < topicSearchResults.value.length - 1
);
const canNavigateTopicSearchNext = computed(
  () => hasTopicSearchResults.value && topicSearchActiveIndex.value > 0
);
const topicSearchResultLabel = computed(() => {
  if (isTopicSearchLoading.value) {
    return 'Поиск...';
  }

  if (!hasTopicSearchResults.value) {
    return '0 из 0';
  }

  return `${topicSearchActiveIndex.value + 1} из ${topicSearchTotal.value || topicSearchResults.value.length}`;
});

watch(
  [
    () => state.isSearchInputEnable,
    () => isMobile.value,
    () => isTopicSearchAvailable.value
  ],
  ([isSearchInputEnable, isMobileView, isSearchAvailable]) => {
    setMobileTopicSearchActive(
      isSearchInputEnable && isMobileView && isSearchAvailable
    );
  },
  { immediate: true }
);

const formatElapsedCallTime = (durationMs: number): string => {
  const elapsedSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const headerCallTimeLabel = computed(() => {
  if (isCallActive.value && !isAnyCallDialing.value) {
    return activeCallFormattedTime.value;
  }

  const entry = currentHeaderCallEntry.value;
  if (!entry) {
    return '';
  }

  const elapsedDurationMs = entry.elapsedDurationMs ?? 0;
  const startTime = entry.startTime;

  if (typeof startTime === 'number' && Number.isFinite(startTime)) {
    return formatElapsedCallTime(
      elapsedDurationMs + Math.max(0, currentTime.value - startTime)
    );
  }

  if (elapsedDurationMs > 0) {
    return formatElapsedCallTime(elapsedDurationMs);
  }

  return '';
});

const showHeaderCallTime = computed(() => !!headerCallTimeLabel.value);

const isActiveDirectCallLabel = computed(
  () =>
    isCallActive.value &&
    activeCallTopic.value?.type === TopicType.DM &&
    activeCallParticipantCount.value > 0 &&
    activeCallParticipantCount.value <= 2
);

const headerCallLabel = computed(() => {
  if (hasInvitedCall.value && !isCallActive.value) {
    return 'Присоединяйтесь к звонку';
  }

  if (hasPendingCallForCurrentTopic.value && !isCallActive.value) {
    return 'Присоединяйтесь к звонку';
  }

  return 'Групповой звонок';
});

const resolvedHeaderCallLabel = computed(() => {
  if (isActiveDirectCallLabel.value) {
    return (
      activeCallUser.value?.initials ||
      activeCallTopic.value?.user?.initials ||
      'Групповой звонок'
    );
  }

  if (isCallActive.value) {
    if (activeCallTopic.value?.type === TopicType.Group) {
      return activeCallTopic.value?.name || headerCallLabel.value;
    }

    if (activeCallTopic.value?.type === TopicType.DM) {
      return activeCallTopic.value?.user?.initials || headerCallLabel.value;
    }
  }

  return headerCallLabel.value;
});

const focusTopicSearchInput = (): void => {
  const searchRef = isMobile.value
    ? mobileTopicSearchRef.value
    : desktopTopicSearchRef.value;
  const searchElement =
    searchRef instanceof Element ? searchRef : searchRef?.$el;
  const input = searchElement?.querySelector?.('input');

  input?.focus?.();
};

const showSearch = (): void => {
  state.isSearchInputEnable = true;
  setMobileTopicSearchActive(isMobile.value && isTopicSearchAvailable.value);
  void nextTick().then(focusTopicSearchInput);
};

function normalizeTopicSearchQuery(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const resetTopicSearch = (): void => {
  topicSearchQuery.value = '';
  topicSearchResults.value = [];
  topicSearchTotal.value = 0;
  topicSearchActiveIndex.value = 0;
  isTopicSearchLoading.value = false;

  if (topicSearchDebounceTimer) {
    clearTimeout(topicSearchDebounceTimer);
    topicSearchDebounceTimer = null;
  }
};

const hideSearch = (): void => {
  state.isSearchInputEnable = false;
  setMobileTopicSearchActive(false);
  resetTopicSearch();
};

const navigateTopicSearchResult = (index: number): void => {
  const result = topicSearchResults.value[index];

  if (!result) {
    return;
  }

  topicSearchActiveIndex.value = index;
  navigateToSearchResult(result);
};

const runTopicSearch = async (): Promise<void> => {
  const query = normalizeTopicSearchQuery(topicSearchQuery.value);
  const topicId = route.value.id;
  const requestToken = ++topicSearchRequestToken;

  if (!query || !topicId) {
    topicSearchResults.value = [];
    topicSearchTotal.value = 0;
    topicSearchActiveIndex.value = 0;
    isTopicSearchLoading.value = false;
    return;
  }

  isTopicSearchLoading.value = true;

  const { results, total } = await searchMessages(query, {
    topicId,
    limit: 200
  });

  if (requestToken !== topicSearchRequestToken) {
    return;
  }

  topicSearchResults.value = results;
  topicSearchTotal.value = total;
  topicSearchActiveIndex.value = 0;
  isTopicSearchLoading.value = false;

  if (results.length) {
    navigateTopicSearchResult(0);
  }
};

const handleTopicSearchInput = (value: string): void => {
  topicSearchQuery.value = value;

  if (topicSearchDebounceTimer) {
    clearTimeout(topicSearchDebounceTimer);
  }

  if (!normalizeTopicSearchQuery(value)) {
    topicSearchResults.value = [];
    topicSearchTotal.value = 0;
    topicSearchActiveIndex.value = 0;
    isTopicSearchLoading.value = false;
    return;
  }

  topicSearchDebounceTimer = setTimeout(() => {
    void runTopicSearch();
  }, 300);
};

const navigateTopicSearch = (direction: -1 | 1): void => {
  const resultsCount = topicSearchResults.value.length;

  if (!resultsCount) {
    return;
  }

  const nextIndex = topicSearchActiveIndex.value + direction;

  if (nextIndex < 0 || nextIndex >= resultsCount) {
    return;
  }

  navigateTopicSearchResult(nextIndex);
};

const handleTopicSearchKeydown = (event: KeyboardEvent): void => {
  if (event.key !== 'Enter') {
    return;
  }

  if (!hasTopicSearchResults.value || isTopicSearchLoading.value) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  navigateTopicSearch(event.shiftKey ? -1 : 1);
};

const handleCall = async () => {
  nextTick();

  if (currentTopic.value?.type === TopicType.Group) {
    const { startLiveKitGroupCall } = await import('../../services/useLiveKit');

    await startLiveKitGroupCall(route.value.id);
    return;
  }

  if (currentTopic.value?.type === TopicType.DM) {
    state.calledUser = currentTopic.value.user;
  }

  if (!state.calledUser) return;
  const { startLiveKitCall } = await import('../../services/useLiveKit');

  await startLiveKitCall(state.calledUser, route.value.id);
};

const handleHeaderCallClick = async () => {
  if (hasInvitedCall.value && !isCallActive.value) {
    const didJoin = await joinInviteGroupCall();

    if (!didJoin) {
      await handleCall();
    }

    return;
  }

  if (currentHeaderCallEntry.value && !isCallActive.value) {
    const didJoin = await joinGroupCall(route.value.id);

    if (!didJoin) {
      await handleCall();
    }

    return;
  }

  showCallModal();
};

const handleCloseMobileInfoModal = (): void => {
  state.openMobileInfoModal = false;
};

const handleCloseMobileUserProfileModal = (): void => {
  state.openMobileUserProfileModal = false;
};

const handleUserProfileClick = (): void => {
  if (currentTopic.value?.type !== TopicType.DM || !currentTopic.value?.user) {
    return;
  }

  openUserInfo(currentTopic.value.user, currentTopic.value);
};

const handleClickHeader = async (): Promise<void> => {
  if (
    route.value.type === RouteTypes.AI ||
    isFavoriteDialogTopic.value ||
    isCallTopicRoute.value
  ) {
    return;
  }

  if (route.value.type === RouteTypes.DIALOGS) {
    handleUserProfileClick();
    return;
  }

  if (isMobile.value) {
    state.openMobileInfoModal = true;
    emits('unmount-click');
    return;
  }

  state.isSearchInputEnable = false;
  emits('unmount-click');
};

const getHeaderContextMenuOptions = computed(() => {
  const options: Array<{
    value: string;
    function: () => void;
    style?: string;
    iconName?: IconNameEnum;
    customIcon?: 'search';
  }> = [];

  if (isFavoriteDialogTopic.value) {
    if (isMobile.value && isTopicSearchAvailable.value) {
      options.push({
        value: 'Поиск в чате',
        function: showSearch,
        customIcon: 'search'
      });
    }

    options.push({
      value: 'Очистить историю',
      function: handleOpenClearHistoryModal,
      style: 'color: var(--error-color)',
      iconName: IconNameEnum.deleteSmall
    });

    return options;
  }

  if (route.value && route.value.type !== RouteTypes.AI) {
    if (isMobile.value && isTopicSearchAvailable.value) {
      options.push({
        value: 'Поиск в чате',
        function: showSearch,
        customIcon: 'search'
      });
    }

    if (isCallTopicRoute.value) {
      return options;
    }

    if (route.value.type === RouteTypes.GROUP) {
      options.push({
        value: 'Информация',
        function: () => {
          void handleClickHeader();
        },
        iconName: IconNameEnum.info
      });
    }

    if (route.value.type === RouteTypes.DIALOGS && isBotDialogTopic.value) {
      options.push({
        value: 'Информация о боте',
        function: handleUserProfileClick,
        iconName: IconNameEnum.info
      });
    }

    if (!isFavoriteDialogTopic.value) {
      options.push({
        value: currentTopic.value?.info?.isMute
          ? 'Вкл. уведомления'
          : 'Выкл. уведомления',
        function: () => {
          toggleMuteTopic(currentTopic.value);
        },
        iconName: currentTopic.value?.info?.isMute
          ? IconNameEnum.distrub
          : IconNameEnum.noDistrub
      });
    }

    if (route.value.type === RouteTypes.GROUP) {
      options.push({
        value: currentRouteGroup.value?.isAdmin
          ? 'Удалить канал'
          : 'Выйти из канала',
        function: handleOpenActionModal,
        style: 'color: var(--error-color)',
        iconName: currentRouteGroup.value?.isAdmin
          ? IconNameEnum.deleteSmall
          : IconNameEnum.logout
      });
    } else if (!isFavoriteDialogTopic.value) {
      options.push({
        value: 'Удалить чат',
        function: handleOpenActionModal,
        style: 'color: var(--error-color)',
        iconName: IconNameEnum.deleteSmall
      });
    }
  } else {
    options.push({
      value: 'Очистить историю',
      function: () => {
        emits('unmount-clear');
      },
      iconName: IconNameEnum.deleteSmall
    });
  }

  return options;
});

const handleOpenActionModal = () => {
  state.openActionModal = true;
};

const handleOpenClearHistoryModal = (): void => {
  state.openClearHistoryModal = true;
};

const handleContextMenuAction = (callback: () => void) => {
  closeActivePopover('headerMenu');
  callback();
};

const handleCloseActionModal = () => {
  state.openActionModal = false;
};

const handleCloseClearHistoryModal = (): void => {
  state.openClearHistoryModal = false;
};

const handleConfirmClearHistory = (): void => {
  state.openClearHistoryModal = false;
  emits('unmount-clear');
};

const handleConfirmActionModal = async (): Promise<void> => {
  if (route.value.type === RouteTypes.DIALOGS) {
    deleteTopic(route.value.id);
    navigateToDialogsList();
  } else if (route.value.type === RouteTypes.GROUP && currentRouteGroup.value) {
    if (currentRouteGroup.value.isAdmin) {
      deleteGroup(currentRouteGroup.value.group.id);
    } else {
      quitGroup(currentRouteGroup.value.group.id);
    }
    navigateToGroupsList();
  }

  handleCloseActionModal();
};

const handleExit = (): void => {
  if (isMessageSelectionModeForTopic(route.value.id)) {
    clearSelectedMessages();
    return;
  }

  if (route.value && route.value.type === RouteTypes.DIALOGS) {
    navigateToDialogsList();
  } else if (route.value && route.value.type === RouteTypes.GROUP) {
    navigateToGroupsList();
  } else if (route.value && route.value.type === RouteTypes.CALL) {
    navigateToDefault();
  } else if (route.value && route.value.type === RouteTypes.AI) {
    navigateToAssistant();
  } else {
    navigateToDefault();
  }
};

watch(
  () => route.value.id,
  () => {
    state.openMobileUserProfileModal = false;
    hideSearch();

    if (route.value.type === RouteTypes.GROUP) {
      getGroupById(route.value.id);
    }

    if (
      route.value.id &&
      (route.value.type === RouteTypes.DIALOGS ||
        route.value.type === RouteTypes.GROUP ||
        route.value.type === RouteTypes.CALL)
    ) {
      void loadLatestCallSummary(route.value.id);
    }
  },
  {
    immediate: true
  }
);

watch(
  () => currentTopic.value,
  topic => {
    if (route.value.type === RouteTypes.GROUP && topic?.id) {
      getGroupById(topic.id);
    }
  },
  {
    immediate: true
  }
);

onMounted(() => {
  headerCallTimerInterval = setInterval(() => {
    currentTime.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  setMobileTopicSearchActive(false);

  if (topicSearchDebounceTimer) {
    clearTimeout(topicSearchDebounceTimer);
    topicSearchDebounceTimer = null;
  }

  if (headerCallTimerInterval) {
    clearInterval(headerCallTimerInterval);
    headerCallTimerInterval = null;
  }

  currentGroup.value = null;
});
</script>
