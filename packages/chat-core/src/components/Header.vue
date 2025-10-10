<template>
  <header class="chat__header" @click="handleClickHeader">
    <div
      class="chat__header-profile chat__header-ai-assistant"
      v-if="props.chapter === 'ai'"
    >
      <AiIconWrapper />
      <h3>Ai Ассистент</h3>
    </div>
    <UserProfile class="chat__header-profile" v-else />
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
import AiIcon from './AiIcon.vue';
import AiIconWrapper from './AiIconWrapper.vue';

const props = withDefaults(defineProps<IHeaderProps>(), {});

const state = reactive({
  isSearchInputEnable: false
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

const getPopoverOptions = computed(() => [
  {
    value: 'Выкл. уведомление',
    function: () => {}
  },
  {
    value: 'Информация',
    function: () => {}
  }
]);
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
