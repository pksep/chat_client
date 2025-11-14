<template>
  <button class="menu__user-assistant" @click="handleAiChapter">
    <AiIconWrapper />
    <h3 class="menu__user-assistant-title">AI Ассистент</h3>
  </button>
  <Line class="menu__user-line" />
</template>

<script lang="ts" setup>
import AiIconWrapper from '../AiIconWrapper.vue';
import Line from '../Line.vue';
import type { IMenuEmits } from '../interfaces/interfaces';

const emit = defineEmits<IMenuEmits>();

const handleAiChapter = () => {
  emit('unmount-chapter', 'ai');
};
</script>
