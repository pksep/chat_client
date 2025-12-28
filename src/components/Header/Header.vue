<template>
  <header
    :key="`header-${props.chapter}-${props.contact?.id || 'null'}`"
    class="chat__header"
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
      v-if="props.chapter === 'ai'"
      :data-testid="`${props.dataTestid}-Header-AIAssistant`"
    >
      <AiIconWrapper
        :data-testid="`${props.dataTestid}-Header-AIAssistantIcon`"
      />
      <h3 :data-testid="`${props.dataTestid}-Header-AIAssistantTitle`">
        Ai Ассистент
      </h3>
    </div>
    <UserProfile
      class="chat__header-profile"
      avatar-alt="user-profile-alt"
      v-bind="props.contact"
      :members-length="
        props.contact?.membersLength || menuInfoState.contacts.length
      "
      :data-testid="`${props.dataTestid}-Header-UserProfile`"
      v-else
    />
    <div
      class="chat__header-buttons"
      :data-testid="`${props.dataTestid}-Header-ButtonsContainer`"
    >
      <template v-if="!isMobile">
        <Search
          v-if="state.isSearchInputEnable"
          class="chat__header-search"
          @click.stop
          :data-testid="`${props.dataTestid}-Header-SearchInput`"
        />
        <Button
          v-if="!state.isSearchInputEnable"
          :type="ButtonTypeEnum.ghost"
          :size="SizesEnum.small"
          @click.stop="showSearch"
          :data-testid="`${props.dataTestid}-Header-SearchButton`"
        >
          <Icon
            class="small-icon"
            :name="IconNameEnum.search"
            :data-testid="`${props.dataTestid}-Header-SearchIcon`"
          />
        </Button>
      </template>
      <Popover
        v-if="!popoverRule"
        class="chat__header-popover"
        @click.stop
        :options="getPopoverOptions"
        isWCUse
        :data-testid="`${props.dataTestid}-Header-Popover`"
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
      is-menu-info
      :model-value="menuInfoState.information"
      :members="menuInfoState.contacts"
      @update:model-value="handleUpdateInformation"
      :data-testid="props.dataTestid"
    />
  </MobileModal>
</template>

<script lang="ts" setup>
import { computed, onMounted, reactive, watch } from 'vue';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import UserProfile from '../UserProfile/UserProfile.vue';
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
import { useInformationMenu } from '../../composables/useInformationMenu';
import { fetchGroupMembers } from '../../services/useGroup';

const props = withDefaults(defineProps<IHeaderProps>(), {
  dataTestid: () => 'Header'
});

const emits = defineEmits<IHeaderEmits>();

const state = reactive({
  menuInfo: null,
  openMobileInfoModal: false,
  isSearchInputEnable: false,
  statusNotification: {
    label: 'Выкл. уведомления',
    enabled: false
  }
});

const {
  state: menuInfoState,
  initializeMenuInfo,
  handleUpdateInformation
} = useMenuInfo(
  {
    ...props,
    open: state.openMobileInfoModal,
    isEnabled: props.chapter !== 'ai'
  },
  emits
);

const modelInfo = computed(() => menuInfoState.information);

const { muteGroupInfo, getMuteStatus } = useInformationMenu(modelInfo);

const { state: isMobile } = useResizeState(MAX_W_MD);

const showSearch = (): void => {
  state.isSearchInputEnable = true;
};

const handleCloseMobileInfoModal = (): void => {
  state.openMobileInfoModal = false;
};

const handleClickHeader = async (): Promise<void> => {
  if (props.chapter === 'ai') return;
  if (!props.contact?.groupId) return;
  if (isMobile.value) {
    state.openMobileInfoModal = true;
    await initializeMenuInfo({
      ...props,
      isEnabled: true,
      open: state.openMobileInfoModal
    });
    emits('unmount-click');
    return;
  }
  state.isSearchInputEnable = false;
  emits('unmount-click');
};

// Watch for changes in contact ID to update member count when switching between groups
watch(
  () => props.contact?.id,
  async (newId, oldId) => {
    if (newId && newId !== oldId && props.contact?.groupId) {
      menuInfoState.contacts = await fetchGroupMembers(props.contact.groupId);
    }
  }
);

// Also watch for changes in group members count
watch(
  () => props.contact?.groupId,
  async (newGroupId, oldGroupId) => {
    if (newGroupId && newGroupId !== oldGroupId) {
      menuInfoState.contacts = await fetchGroupMembers(newGroupId);
    }
  }
);

// Watch for changes in members length to update header
watch(
  () => props.contact?.membersLength,
  async (newLength, oldLength) => {
    if (
      newLength !== undefined &&
      newLength !== oldLength &&
      props.contact?.groupId
    ) {
      // Update the contacts to reflect the new member count
      menuInfoState.contacts = await fetchGroupMembers(props.contact.groupId);
    }
  }
);

const popoverRule = computed(
  () => isMobile.value && (props.contact?.groupId || props.chapter === 'ai')
);

const getPopoverOptions = computed(() => {
  const popoverArray = [];
  if (props.chapter !== 'ai') {
    const notificationLabels = {
      value: state.statusNotification.label,
      function: handleNotificationToggle
    };
    if (!props.contact?.groupId) {
      popoverArray.push(notificationLabels);
    } else {
      popoverArray.push(notificationLabels);
      popoverArray.push({
        value: 'Информация',
        function: () => {
          emits('unmount-information');
        }
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

watch(
  () => props.chapter,
  async newChapter => {
    if (props.contact?.groupId) {
      menuInfoState.contacts = await fetchGroupMembers(props.contact.groupId);
    } else {
      menuInfoState.contacts = [];
    }

    if (newChapter !== 'ai') {
      await updateNotificationStatus();
    }
  }
);

const updateNotificationStatus = async (): Promise<void> => {
  try {
    const isMuted = await getMuteStatus(props.contact);
    if (isMuted) {
      state.statusNotification = {
        label: 'Вкл. уведомления',
        enabled: false
      };
    } else {
      state.statusNotification = {
        label: 'Выкл. уведомления',
        enabled: true
      };
    }
  } catch (error) {
    console.error('Failed to update notification status:', error);
    state.statusNotification = {
      label: 'Выкл. уведомления',
      enabled: true
    };
  }
};

const handleExit = (): void => {
  emits('unmount-exit');
};

const handleNotificationToggle = async (): Promise<void> => {
  const shouldMute = !state.statusNotification.enabled;
  await muteGroupInfo(shouldMute, props.contact);

  await updateNotificationStatus();
  emits('unmount-notification', state.statusNotification.label);
};

onMounted(async () => {
  if (props.contact?.groupId) {
    menuInfoState.contacts = await fetchGroupMembers(props.contact.groupId);
  }
});
</script>
