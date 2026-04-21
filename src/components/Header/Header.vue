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

      <span
        v-if="isCallActive && !isAnyCallDialing"
        class="chat__header-active-call__time"
      >
        {{ activeCallFormattedTime }}
      </span>
    </div>

    <div class="chat__header-main" @click="handleClickHeader">
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
        <AiIconWrapper
          :data-testid="`${props.dataTestid}-Header-AIAssistantIcon`"
        />
        <h3 :data-testid="`${props.dataTestid}-Header-AIAssistantTitle`">
          Ai Ассистент
        </h3>
      </div>

      <template v-else-if="currentTopic">
        <GroupProfile
          v-if="currentTopic.type === TopicType.Group"
          class="chat__header-profile"
          avatar-alt="group-profile-alt"
          :topic="currentGroup || currentTopic"
          :data-testid="`${props.dataTestid}-Header-GroupProfile`"
        />
        <UserProfile
          v-else-if="currentTopic.type === TopicType.DM"
          class="chat__header-profile"
          avatar-alt="user-profile-alt"
          :user="currentTopic.user"
          :data-testid="`${props.dataTestid}-Header-UserProfile`"
        />
      </template>

      <div
        class="chat__header-buttons"
        :data-testid="`${props.dataTestid}-Header-ButtonsContainer`"
        @click.stop
      >
        <Search
          v-if="state.isSearchInputEnable"
          class="chat__header-search"
          :data-testid="`${props.dataTestid}-Header-SearchInput`"
          @click.stop
        />
        <SearchIcon
          v-if="false && !state.isSearchInputEnable && !isMobile"
          class="chat__header__icon"
          :data-testid="`${props.dataTestid}-Header-SearchIcon`"
          @click.stop="showSearch"
        />
        <CallIcon
          v-if="
            (route.type === RouteTypes.DIALOGS ||
              route.type === RouteTypes.GROUP) &&
            !isCallActive &&
            !hasPendingCallForCurrentTopic
          "
          class="chat__header__icon"
          :data-testid="`${props.dataTestid}-Header-CallIcon`"
          @click.stop="handleCall"
        />
        <Popover
          class="chat__header-popover"
          :options="getPopoverOptions"
          isWCUse
          :data-testid="`${props.dataTestid}-Header-Popover`"
          :icon-name="IconNameEnum.moreHorizontal"
        />
      </div>
    </div>
  </header>

  <MobileModal
    :open="state.openMobileInfoModal"
    title="Канал"
    close-button-text="Назад"
    :class="{ 'chat__header-modal-info--active': true }"
    :data-testid="`${props.dataTestid}-Header-MobileModal`"
    @unmount-close="handleCloseMobileInfoModal"
  >
    <MobileChatInfo
      :model-value="currentGroup"
      :members="route.type === RouteTypes.GROUP && currentGroup?.members"
      :data-testid="props.dataTestid"
      @update:model-value="handleUpdateInformation"
    />
  </MobileModal>

  <ConfirmModal
    :open="state.openActionModal"
    :title="actionModalTitle"
    :description="actionModalDescription"
    @unmount-close="handleCloseActionModal"
    @unmount-confirm="handleConfirmActionModal"
  />
</template>

<script lang="ts" setup>
import { computed, nextTick, onUnmounted, reactive, watch } from 'vue';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import UserProfile from '../UserProfile/UserProfile.vue';
import GroupProfile from '../GroupProfile/GroupProfile.vue';
import MobileModal from '../UI/MobileModal.vue';
import {
  Button,
  Icon,
  IconNameEnum,
  ButtonTypeEnum,
  SizesEnum,
  Search,
  Popover
} from '@pksep/yui';

import type { IHeaderProps, IHeaderEmits } from '../interfaces/interfaces';
import AiIconWrapper from '../UI/AiIconWrapper.vue';
import MobileChatInfo from './MobileChatInfo.vue';
import { useMenuInfo } from '../../composables/useMenuInfo';
import {
  navigateToAssistant,
  navigateToDefault,
  navigateToDialogsList,
  navigateToGroupsList,
  useUrlWatcher
} from '../../composables/navigation';
import { RouteTypes } from '../../composables/navigation/useUrlRouting';
import {
  deleteTopic,
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
import {
  activeCallParticipantCount,
  activeCallTopicId,
  activeCallUser,
  activeCallFormattedTime,
  isAnyCallDialing,
  isAnyCallModalVisible,
  isCallActive,
  invitedGroupCallInfo,
  joinInviteGroupCall,
  joinGroupCall,
  pendingGroupCallInfo,
  showCallModal
} from '../../services/useCalls';
import {
  startLiveKitCall,
  startLiveKitGroupCall
} from '../../services/useLiveKit';
import LeaveIcon from '../CallModal/UI/LeaveIcon.vue';

const { getSelectedTopic } = useTopics();

const props = withDefaults(defineProps<IHeaderProps>(), {
  dataTestid: 'Header'
});

defineOptions({
  inheritAttrs: false
});

const route = useUrlWatcher();
const emits = defineEmits<IHeaderEmits>();

const state = reactive({
  loader: false,
  openMobileInfoModal: false,
  isSearchInputEnable: false,
  openActionModal: false,
  calledUser: null,
  roomId: null
});

const actionModalTitle = computed(() =>
  route.value.type === RouteTypes.DIALOGS
    ? 'Удаление чата'
    : currentGroup.value?.isAdmin
      ? 'Удаление канала'
      : 'Выход из канала'
);

const actionModalDescription = computed(() =>
  route.value.type === RouteTypes.DIALOGS
    ? 'Вы уверены, что хотите удалить чат?'
    : currentGroup.value?.isAdmin
      ? 'Вы уверены, что хотите удалить канал?'
      : 'Вы уверены, что хотите покинуть канал?'
);

const currentTopic = computed(() => getSelectedTopic());
const activeCallTopic = computed(() =>
  activeCallTopicId.value ? getSelectedTopic(activeCallTopicId.value) : null
);
const { handleUpdateInformation } = useMenuInfo();
const { state: isMobile } = useResizeState(MAX_W_MD);
const currentPendingCall = computed(
  () => pendingGroupCallInfo.value?.[route.value.id || ''] || null
);
const currentInvitedCall = computed(() => invitedGroupCallInfo.value || null);
const hasPendingCallForCurrentTopic = computed(
  () => !!currentPendingCall.value
);
const hasInvitedCall = computed(
  () => !!currentInvitedCall.value?.isJoinAvailable
);

const showHeaderCallBanner = computed(
  () =>
    (isCallActive.value && !isAnyCallModalVisible.value) ||
    hasPendingCallForCurrentTopic.value ||
    hasInvitedCall.value
);

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
      activeCallTopic.value?.user?.nickname ||
      'Call'
    );
  }

  if (isCallActive.value) {
    if (activeCallTopic.value?.type === TopicType.Group) {
      return activeCallTopic.value?.name || headerCallLabel.value;
    }

    if (activeCallTopic.value?.type === TopicType.DM) {
      return (
        activeCallTopic.value?.user?.nickname ||
        activeCallTopic.value?.user?.initials ||
        headerCallLabel.value
      );
    }
  }

  return headerCallLabel.value;
});

const showSearch = (): void => {
  state.isSearchInputEnable = true;
};

const handleCall = async () => {
  nextTick();

  if (currentTopic.value?.type === TopicType.Group) {
    await startLiveKitGroupCall(route.value.id);
    return;
  }

  if (currentTopic.value?.type === TopicType.DM) {
    state.calledUser = currentTopic.value.user;
  }

  if (!state.calledUser) return;
  await startLiveKitCall(state.calledUser, route.value.id);
};

const handleHeaderCallClick = async () => {
  if (hasInvitedCall.value && !isCallActive.value) {
    await joinInviteGroupCall();
    return;
  }

  if (hasPendingCallForCurrentTopic.value && !isCallActive.value) {
    await joinGroupCall(route.value.id);
    return;
  }

  showCallModal();
};

const handleCloseMobileInfoModal = (): void => {
  state.openMobileInfoModal = false;
};

const handleClickHeader = async (): Promise<void> => {
  if (
    route.value.type === RouteTypes.DIALOGS ||
    route.value.type === RouteTypes.AI
  ) {
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

const getPopoverOptions = computed(() => {
  const popoverArray = [];

  if (route.value && route.value.type !== RouteTypes.AI) {
    if (route.value.type === RouteTypes.GROUP) {
      popoverArray.push({
        value: 'Информация',
        function: () => {
          emits('unmount-information');
        }
      });
    }

    popoverArray.push({
      value: `${
        currentTopic.value?.info.isMute
          ? 'Вкл. уведомления'
          : 'Выкл. уведомления'
      }`,
      function: () => {
        toggleMuteTopic(currentTopic.value);
      }
    });

    if (route.value.type !== RouteTypes.GROUP) {
      popoverArray.push({
        value: 'Удалить чат',
        function: handleOpenActionModal,
        style: 'color: var(--error-color)'
      });
    } else {
      popoverArray.push({
        value: currentGroup.value?.isAdmin
          ? 'Удалить канал'
          : 'Выйти из канала',
        function: handleOpenActionModal,
        style: 'color: var(--error-color)'
      });
    }
  } else {
    popoverArray.push({
      value: 'Очистить историю',
      function: () => {
        emits('unmount-clear');
      }
    });
  }

  return popoverArray;
});

const handleOpenActionModal = () => {
  state.openActionModal = true;
};

const handleCloseActionModal = () => {
  state.openActionModal = false;
};

const handleConfirmActionModal = () => {
  if (route.value.type === RouteTypes.DIALOGS) {
    deleteTopic(route.value.id);
    navigateToDialogsList();
  } else if (route.value.type === RouteTypes.GROUP) {
    if (currentGroup.value.isAdmin) {
      deleteGroup(currentGroup.value.group.id);
    } else {
      quitGroup(currentGroup.value.group.id);
    }
    navigateToGroupsList();
  }

  handleCloseActionModal();
};

const handleExit = (): void => {
  if (route.value && route.value.type === RouteTypes.DIALOGS) {
    navigateToDialogsList();
  } else if (route.value && route.value.type === RouteTypes.GROUP) {
    navigateToGroupsList();
  } else if (route.value && route.value.type === RouteTypes.AI) {
    navigateToAssistant();
  } else {
    navigateToDefault();
  }
};

watch(
  () => route.value.id,
  () => {
    if (route.value.type === RouteTypes.GROUP) {
      getGroupById(route.value.id);
    }
  },
  {
    immediate: true
  }
);

onUnmounted(() => {
  currentGroup.value = null;
});
</script>
