<template>
  <span class="ai-avatar" :data-expression="expression" aria-hidden="true">
    <span class="ai-avatar__motion">
      <Transition name="ai-avatar-expression">
        <img
          :key="expression"
          class="ai-avatar__image"
          :src="avatarUrl"
          alt=""
          draggable="false"
        />
      </Transition>
    </span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import happyAvatarUrl from '../../assets/ai-avatar/happy.webp';
import loveAvatarUrl from '../../assets/ai-avatar/love.webp';
import sadAvatarUrl from '../../assets/ai-avatar/said.webp';
import standartAvatarUrl from '../../assets/ai-avatar/standart.webp';
import thinkingAvatarUrl from '../../assets/ai-avatar/thinks.webp';

type AiAvatarExpression = 'standard' | 'thinking' | 'sad' | 'happy' | 'love';

const props = withDefaults(
  defineProps<{
    expression?: AiAvatarExpression;
  }>(),
  {
    expression: 'standard'
  }
);

const avatarUrls: Record<AiAvatarExpression, string> = {
  standard: standartAvatarUrl,
  thinking: thinkingAvatarUrl,
  sad: sadAvatarUrl,
  happy: happyAvatarUrl,
  love: loveAvatarUrl
};

/** Возвращает изображение для текущего эмоционального состояния ассистента. */
const avatarUrl = computed(() => avatarUrls[props.expression]);
</script>
