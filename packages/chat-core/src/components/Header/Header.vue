<template>
  <header
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
      :data-testid="`${props.dataTestid}-Header-UserProfile`"
      v-else
    />
    <div
      class="chat__header-buttons"
      v-if="!isMobile"
      :data-testid="`${props.dataTestid}-Header-ButtonsContainer`"
    >
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
      <Popover
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
    :data-testid="`${props.dataTestid}-Header-MobileModal`"
  >
    <MobileChatInfo
      v-model="menuInfoState.information"
      :members="menuInfoState.contacts"
      :data-testid="props.dataTestid"
    />
  </MobileModal>
</template>

<script lang="ts" setup>
import { computed, reactive } from 'vue';
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

const props = withDefaults(defineProps<IHeaderProps>(), {
  dataTestid: () => 'Header'
});

const emits = defineEmits<IHeaderEmits>();

const state = reactive({
  openMobileInfoModal: false,
  isSearchInputEnable: false,
  statusNotification: {
    label: 'Выкл. уведомление',
    enabled: false
  }
});

const { state: menuInfoState, initializeMenuInfo } = useMenuInfo(
  {
    ...props,
    open: state.openMobileInfoModal,
    isEnabled: props.chapter !== 'ai'
  },
  emits
);

const modelInfo = computed(() => menuInfoState.information);

const { muteGroupInfo } = useInformationMenu(modelInfo);

const { state: isMobile } = useResizeState(MAX_W_MD);

const showSearch = (): void => {
  state.isSearchInputEnable = true;
};

const handleCloseMobileInfoModal = (): void => {
  state.openMobileInfoModal = false;
};

const handleClickHeader = (): void => {
  if (props.chapter === 'ai') return;
  if (isMobile.value) {
    state.openMobileInfoModal = true;
    initializeMenuInfo({
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

const getPopoverOptions = computed(() => {
  const popoverArray = [];
  if (props.chapter !== 'ai') {
    popoverArray.push(
      {
        value: state.statusNotification.label,
        function: () => {
          if (state.statusNotification.enabled) {
            state.statusNotification = {
              label: 'Выкл. уведомление',
              enabled: false
            };
            muteGroupInfo(state.statusNotification.enabled);
            emits('unmount-notification', state.statusNotification.label);
            return;
          }
          state.statusNotification.label = 'Вкл. уведомления';
          state.statusNotification.enabled = true;
          muteGroupInfo(state.statusNotification.enabled);
          emits('unmount-notification', state.statusNotification.label);
        }
      },
      {
        value: 'Информация',
        function: () => {
          emits('unmount-information');
        }
      }
    );
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

const handleExit = (): void => {
  emits('unmount-exit');
};
</script>
