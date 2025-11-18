<template>
  <header class="chat__header" @click="handleClickHeader">
    <Button
      v-if="isMobile"
      :type="ButtonTypeEnum.ghost"
      :size="SizesEnum.small"
      @click.stop="handleExit"
    >
      <Icon class="medium-icon" :name="IconNameEnum.arrowLeft" />
    </Button>
    <div
      class="chat__header-profile chat__header-ai-assistant"
      v-if="props.chapter === 'ai'"
    >
      <AiIconWrapper />
      <h3>Ai Ассистент</h3>
    </div>
    <UserProfile
      class="chat__header-profile"
      avatar-alt="user-profile-alt"
      v-bind="props.contact"
      v-else
    />
    <div class="chat__header-buttons" v-if="!isMobile">
      <Search
        v-if="state.isSearchInputEnable"
        class="chat__header-search"
        @click.stop
      />
      <Button
        v-if="!state.isSearchInputEnable"
        :type="ButtonTypeEnum.ghost"
        :size="SizesEnum.small"
        @click.stop="showSearch"
      >
        <Icon class="small-icon" :name="IconNameEnum.search" />
      </Button>
      <Popover @click.stop :options="getPopoverOptions" isWCUse />
    </div>
  </header>
  <MobileModal
    :open="state.openMobileInfoModal"
    title="Канал"
    close-button-text="Назад"
    @close="handleCloseMobileInfoModal"
  >
    <div class="modal-info-mobile__start">
      <Avatar is-icon class="modal-info-mobile__avatar" />
      <NewChatInformationForm>
        <template #button> {{}} </template>
      </NewChatInformationForm>
    </div>
    <div class="modal-info-mobile__end">
      <MenuInfoButtons />
      <p class="modal-info-mobile__end--paragraph">Участники:</p>
      <ContactListInModal
        :contacts="[props.contact]"
        class="modal-info-mobile__contact-list"
      />
    </div>
  </MobileModal>
</template>

<script lang="ts" setup>
import { computed, reactive } from 'vue';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import UserProfile from '../UserProfile/UserProfile.vue';
import MobileModal from '../UI/MobileModal.vue';
import {
  Avatar,
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
import NewChatInformationForm from '../NewChat/NewChatInformationForm.vue';
import MenuInfoButtons from '../MenuInfoButtons.vue';
import ContactListInModal from '../ContactList/ContactListInModal.vue';

const props = withDefaults(defineProps<IHeaderProps>(), {});

const state = reactive({
  openMobileInfoModal: false,
  isSearchInputEnable: false,
  statusNotification: {
    label: 'Выкл. уведомление',
    enabled: false
  }
});

const { state: isMobile } = useResizeState(MAX_W_MD);

const emits = defineEmits<IHeaderEmits>();

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
            emits('unmount-notification', state.statusNotification.label);
            return;
          }
          state.statusNotification.label = 'Вкл. уведомления';
          state.statusNotification.enabled = true;
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
