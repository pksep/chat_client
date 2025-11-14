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
</template>

<script lang="ts" setup>
import { computed, reactive } from 'vue';
import { useResizeState } from '../../composables/useResizeState';
import UserProfile from '../UserProfile/UserProfile.vue';
import {
  Button,
  Icon,
  IconNameEnum,
  ButtonTypeEnum,
  SizesEnum,
  Search,
  Popover
} from 'sep-yui';

import type { IHeaderProps, IHeaderEmits } from '../interfaces/interfaces';
import AiIconWrapper from '../AiIconWrapper.vue';
import { MAX_W_MD } from '../../utils/constants';

const props = withDefaults(defineProps<IHeaderProps>(), {});

const state = reactive({
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

const handleClickHeader = (): void => {
  if (props.chapter === 'ai') return;
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

console.log(props.chapter);
</script>
