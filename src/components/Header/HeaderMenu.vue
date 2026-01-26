<template>
  <header
    class="header-menu"
    v-if="isMobile"
    :data-testid="`${props.dataTestid}-HeaderMenu-Container`"
  >
    <nav
      class="header-menu__nav"
      :data-testid="`${props.dataTestid}-HeaderMenu-Navigation`"
    >
      <ul
        class="header-menu__list"
        :data-testid="`${props.dataTestid}-HeaderMenu-List`"
      >
        <li
          v-for="(item, index) in menuItems"
          :key="item.key"
          :class="listClass(item.key)"
          :data-testid="`${props.dataTestid}-HeaderMenu-Item${index + 1}`"
        >
          <button
            class="header-menu__button"
            @click="handleUnmountChapter(item.key)"
            :data-testid="`${props.dataTestid}-HeaderMenu-Button${index + 1}`"
          >
            {{ item.label }}
          </button>
          <div
            v-if="topic.type === item.key"
            class="header-menu-item__selected"
          ></div>
        </li>
      </ul>
    </nav>
  </header>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import type { IHeaderMenuProps } from './interfaces/header-menu';
import {
  navigateToAssistant,
  navigateToDialogsList,
  navigateToGroupsList,
  useUrlWatcher
} from '../../composables/navigation';

const props = withDefaults(defineProps<IHeaderMenuProps>(), {
  dataTestid: () => 'HeaderMenu'
});

const { state: isMobile } = useResizeState(MAX_W_MD);

const topic = useUrlWatcher();

const listClass = (key: string) => ({
  'header-menu__item': true,
  'header-menu__item--active': topic.value.type === key
});

const menuItems = computed<
  {
    key: 'assistant' | 'group' | 'dialogs';
    label: string;
  }[]
>(() => [
  { key: 'dialogs', label: 'Диалоги' },
  { key: 'group', label: 'Каналы' },
  { key: 'assistant', label: 'ИИ' }
]);

const handleUnmountChapter = (route: 'assistant' | 'group' | 'dialogs') => {
  if (route === 'assistant') {
    navigateToAssistant();
  } else if (route === 'group') {
    navigateToGroupsList();
  } else if (route === 'dialogs') {
    navigateToDialogsList();
  }
};
</script>
