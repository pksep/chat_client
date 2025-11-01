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
import { computed, ref, onMounted, onUnmounted } from 'vue';

interface HeaderMenuEmits {
  (e: 'unmount-chapter', chapter: string): void;
}

const emit = defineEmits<HeaderMenuEmits>();

const activeChapter = ref('ai-assistant');

const buttonClass = (key: string) => ({
  'header-menu__button': true,
  'header-menu__button--active': activeChapter.value === key
});

const windowWidth = ref(window.innerWidth);

const isMobile = computed(() => windowWidth.value <= 896);

const updateWidth = () => {
  windowWidth.value = window.innerWidth;
};

onMounted(() => {
  window.addEventListener('resize', updateWidth);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateWidth);
});

const menuItems = computed(() => [
  { key: 'ai-assistant', label: 'AI Ассистент' }
  /*
  { key: 'channels', label: 'Каналы' },
  { key: 'dialogs', label: 'Диалоги' }
   */
]);

const handleUnmountChapter = (chapter: string) => {
  activeChapter.value = chapter;
  emit('unmount-chapter', chapter);
};
</script>
