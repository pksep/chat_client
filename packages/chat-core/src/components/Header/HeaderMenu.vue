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
        </li>
      </ul>
    </nav>
  </header>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useResizeState } from '../../composables/useResizeState';
import { MAX_W_MD } from '../../utils/constants';
import type { IMenuEmits } from '../interfaces/interfaces';

interface IHeaderMenuProps {
  dataTestid?: string;
}

const props = withDefaults(defineProps<IHeaderMenuProps>(), {
  dataTestid: () => 'HeaderMenu'
});

const { state: isMobile } = useResizeState(MAX_W_MD);

const emit = defineEmits<IMenuEmits>();

const activeChapter = ref('assistant');

const listClass = (key: string) => ({
  'header-menu__item': true,
  'header-menu__item--active': activeChapter.value === key
});

const menuItems = computed(() => [
  { key: 'assistant', label: 'AI Ассистент' },
  { key: 'channels', label: 'Каналы' },
  { key: 'dialogs', label: 'Диалоги' }
]);

const handleUnmountChapter = chapter => {
  activeChapter.value = chapter;
  if (!chapter) {
    activeChapter.value = 'assistant';
  }
  emit('unmount-chapter', activeChapter.value);
};
</script>
