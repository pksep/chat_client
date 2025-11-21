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
    <div
      class="modal-info-mobile__start"
      :data-testid="`${props.dataTestid}-Header-ModalStartContainer`"
    >
      <Avatar
        is-icon
        class="modal-info-mobile__avatar"
        :data-testid="`${props.dataTestid}-Header-ModalAvatar`"
      />
      <NewChatInformationForm
        :name="state.group.name"
        :data-testid="`${props.dataTestid}-Header-InformationForm`"
      >
        <template #button> {{}} </template>
      </NewChatInformationForm>
    </div>
    <div
      class="modal-info-mobile__end"
      :data-testid="`${props.dataTestid}-Header-ModalEndContainer`"
    >
      <MenuInfoButtons
        :data-testid="`${props.dataTestid}-Header-MenuInfoButtons`"
      />
      <p
        class="modal-info-mobile__end--paragraph"
        :data-testid="`${props.dataTestid}-Header-ParticipantsLabel`"
      >
        Участники:
      </p>
      <ContactListInModal
        :contacts="state.group.members"
        class="modal-info-mobile__contact-list"
        :data-testid="`${props.dataTestid}-Header-ContactListInModal`"
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

const props = withDefaults(defineProps<IHeaderProps>(), {
  dataTestid: () => 'Header'
});

const state = reactive({
  openMobileInfoModal: false,
  isSearchInputEnable: false,
  group: {
    name: '',
    members: []
  },
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
