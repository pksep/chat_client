<template>
  <header class="header-menu" v-if="isMobile">
    <nav class="header-menu__nav">
      <ul class="header-menu__list">
        <li v-for="item in menuItems" :key="item.key" class="header-menu__item">
          <button
            :class="buttonClass(item.key)"
            @click="handleUnmountChapter(item.key)"
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

const { state: isMobile } = useResizeState(MAX_W_MD);

const emit = defineEmits<IMenuEmits>();

const activeChapter = ref('assistant');

const buttonClass = (key: string) => ({
  'header-menu__button': true,
  'header-menu__button--active': activeChapter.value === key
});

const menuItems = computed(() => [
  { key: 'assistant', label: 'AI Ассистент' },
  { key: 'channels', label: 'Каналы' },
  { key: 'dialogs', label: 'Диалоги' }
]);

const handleUnmountChapter = (chapter: string) => {
  activeChapter.value = chapter;
  if (!chapter) {
    activeChapter.value = 'assistant';
  }
  emit('unmount-chapter', activeChapter.value);
};
</script>
