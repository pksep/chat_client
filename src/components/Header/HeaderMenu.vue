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
            v-if="props.activeChapter === item.key"
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
import type { IMenuEmits } from '../interfaces/interfaces';
import { useNavigationService } from '../../services/useNavigationService';

interface IHeaderMenuProps {
  dataTestid?: string;
  activeChapter?: string;
}

const props = withDefaults(defineProps<IHeaderMenuProps>(), {
  dataTestid: () => 'HeaderMenu',
  activeChapter: () => 'assistant'
});

const { state: isMobile } = useResizeState(MAX_W_MD);

const { navigateToTarget } = useNavigationService();

const emit = defineEmits<IMenuEmits>();

const listClass = (key: string) => ({
  'header-menu__item': true,
  'header-menu__item--active': props.activeChapter === key
});

const menuItems = computed(() => [
  { key: 'assistant', label: 'ИИ' },
  { key: 'channels', label: 'Каналы' },
  { key: 'dialogs', label: 'Диалоги' }
]);

const handleUnmountChapter = async (chapter: string) => {
  if (
    chapter === 'ai' ||
    chapter === 'assistant' ||
    chapter === 'channels' ||
    chapter === 'dialogs'
  ) {
    await navigateToTarget(
      {
        type: 'view',
        view: chapter as 'ai' | 'assistant' | 'channels' | 'dialogs'
      },
      { markAsRead: false, updateMemberCount: false }
    );
  } else {
    await navigateToTarget({ type: 'reset' });
  }
  emit('unmount-chapter', chapter);
};
</script>
