<template>
  <header
    :class="['chat__header', $attrs.class]"
    @click="handleClickHeader"
    :data-testid="`${props.dataTestid}-Header-Container`"
  >
    <Button
      v-if="isMobile"
      :type="ButtonTypeEnum.ghost"
      :size="SizesEnum.small"
      @click.stop="handleExit"
      :data-testid="`${props.dataTestid}-Header-BackButton`"
    >
      <Icon
        class="medium-icon"
        :name="IconNameEnum.arrowLeft"
        :data-testid="`${props.dataTestid}-Header-BackIcon`"
      />
    </Button>
    <div
      class="chat__header-profile chat__header-ai-assistant"
      v-if="route.type === 'ai'"
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
        @click.stop
        :data-testid="`${props.dataTestid}-Header-SearchInput`"
      />
      <SearchIcon
        v-if="!state.isSearchInputEnable && !isMobile"
        @click.stop="showSearch"
        class="chat__header__icon"
        :data-testid="`${props.dataTestid}-Header-SearchIcon`"
      />
      <CallIcon
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
  </header>
  <MobileModal
    :open="state.openMobileInfoModal"
    title="Канал"
    close-button-text="Назад"
    @unmount-close="handleCloseMobileInfoModal"
    :class="{
      'chat__header-modal-info--active': true
    }"
    :data-testid="`${props.dataTestid}-Header-MobileModal`"
  >
    <MobileChatInfo
      :model-value="currentGroup"
      :members="route.type === RouteTypes.GROUP && currentGroup?.members"
      @update:model-value="handleUpdateInformation"
      :data-testid="props.dataTestid"
    />
  </MobileModal>
  <ConfirmModal
    :open="state.openActionModal"
    :title="actionModalTitle"
    :description="actionModalDescription"
    @unmount-close="handleCloseActionModal"
    @unmount-confirm="handleConfirmActionModal"
  />
  <CallModal
    :open="state.isCallModalOpen"
    @unmount-close="handleEndCall"
    :data-testid="`${props.dataTestid}-CallModal`"
    :user="state.calledUser"
  />
</template>

<script lang="ts" setup>
import { computed, onUnmounted, reactive, watch } from 'vue';
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
import CallModal from '../CallModal/CallModal.vue';

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
  isCallModalOpen: false,
  calledUser: null
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
    ? 'Вы уверены, что хотите удалить чат'
    : currentGroup.value?.isAdmin
      ? 'Вы уверены, что хотите удалить канал?'
      : 'Вы уверены, что хотите покинуть канал?'
);

const currentTopic = computed(() => getSelectedTopic());

const { handleUpdateInformation } = useMenuInfo();

const { state: isMobile } = useResizeState(MAX_W_MD);

const showSearch = (): void => {
  state.isSearchInputEnable = true;
};

const handleCall = (): void => {
  state.isCallModalOpen = true;
  state.calledUser = currentTopic.value.user;
};

const handleEndCall = (): void => {
  state.isCallModalOpen = false;
  state.calledUser = null;
};

const handleCloseMobileInfoModal = (): void => {
  state.openMobileInfoModal = false;
};

const handleClickHeader = async (): Promise<void> => {
  if (
    route.value.type === RouteTypes.DIALOGS ||
    route.value.type === RouteTypes.AI
  )
    return;
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
      value: `${currentTopic.value?.info.isMute ? 'Вкл. уведомление' : 'Выкл. уведомление'}`,
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
