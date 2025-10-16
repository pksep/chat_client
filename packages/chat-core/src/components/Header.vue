<template>
  <header class="chat__header" @click="handleClickHeader">
    <div
      class="chat__header-profile chat__header-ai-assistant"
      v-if="props.chapter === 'ai'"
    >
      <AiIconWrapper />
      <h3>Ai Ассистент</h3>
    </div>
    <UserProfile
      class="chat__header-profile"
      avatar-url="/"
      avatar-alt="user-profile-alt"
      name="John Doe"
      nickname="@johndoe"
      v-else
    />
    <div class="chat__header-buttons">
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
      <Popover @click.stop :options="getPopoverOptions" />
    </div>
  </header>
</template>

<script lang="ts" setup>
import { computed, reactive } from 'vue';
import UserProfile from './UserProfile/UserProfile.vue';
import {
  Button,
  Icon,
  IconNameEnum,
  ButtonTypeEnum,
  SizesEnum,
  Search,
  Popover
} from 'sep-yui';

import type { IHeaderProps, IHeaderEmits } from './interfaces/interfaces';
import AiIconWrapper from './AiIconWrapper.vue';

const props = withDefaults(defineProps<IHeaderProps>(), {});

const state = reactive({
  isSearchInputEnable: false,
  statusNotification: {
    label: 'Выкл. уведомление',
    enabled: false
  }
});

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
  }
  return popoverArray;
});
</script>

<style scoped>
.chat__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--white);
  padding: 7.5px 8px;
  border-bottom-width: 0.5px;
  border-bottom-style: solid;
  border-bottom-color: var(--border-grey);
}

.chat__header-buttons {
  display: flex;
  gap: 10px;
  margin-right: 8px;
}

.user-profile.chat__header-profile {
  --size-avatar: 40px;
  --font-size-nickname: 12px;
  margin-left: 8px;
  row-gap: 2px;
}

:deep(button.button-yui-kit) {
  padding-block: 10.5px;
}

:deep(.tooltip-yui-kit) {
  align-content: center;
}

.chat__header-search {
  min-width: 400px;
}

.chat__header-ai-assistant {
  display: flex;
  align-items: center;
  gap: 10px;
  & h3 {
    font-size: 16px;
  }
}
</style>
