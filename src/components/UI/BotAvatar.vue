<template>
  <div
    v-bind="$attrs"
    :class="[
      'bot-avatar',
      {
        'bot-avatar--edit': props.isEdit,
        'bot-avatar--fixed-size': !!resolvedSize
      }
    ]"
    :style="avatarStyle"
  >
    <CachedAvatar
      v-if="props.path"
      :path="props.path"
      :alt="props.alt"
      :initials="props.initials"
      class="bot-avatar__image"
      :is-icon="props.isIcon"
    />
    <div v-else class="bot-avatar__fallback" aria-hidden="true">
      <BotIcon class="bot-avatar__icon" />
    </div>

    <span v-if="props.isEdit" class="bot-avatar__edit-badge" aria-hidden="true">
      <BotEditIcon class="bot-avatar__edit-icon" />
    </span>
    <span v-if="props.isOnline" class="bot-avatar__status" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import CachedAvatar from './CachedAvatar.vue';
import BotEditIcon from './BotEditIcon.vue';
import BotIcon from './BotIcon.vue';

const props = withDefaults(
  defineProps<{
    path?: string | null;
    alt?: string;
    initials?: string;
    isOnline?: boolean;
    isIcon?: boolean;
    isEdit?: boolean;
    size?: string | number;
  }>(),
  {
    path: '',
    alt: '',
    initials: '',
    isOnline: true,
    isIcon: false,
    isEdit: false,
    size: ''
  }
);

const resolvedSize = computed(() => {
  if (typeof props.size === 'number') {
    return `${props.size}px`;
  }

  return props.size?.trim() || '';
});

const avatarStyle = computed(() =>
  !props.isEdit && resolvedSize.value
    ? { '--bot-avatar-fixed-size': resolvedSize.value }
    : undefined
);

defineOptions({
  inheritAttrs: false
});
</script>
