<template>
  <button class="menu__user-assistant" @click="handleAiChapter">
    <AiIconWrapper />
    <h3 class="menu__user-assistant-title">AI Ассистент</h3>
  </button>
  <Line class="menu__user-line" />
</template>

<script lang="ts" setup>
import { navigateToAI } from '@/composables/navigation';
import AiIconWrapper from '../UI/AiIconWrapper.vue';
import Line from '../UI/Line.vue';

const handleAiChapter = () => {
  navigateToAI();
};
</script>
