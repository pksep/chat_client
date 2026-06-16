<template>
  <div :class="['bot-avatar', $attrs.class]">
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

    <span v-if="props.isOnline" class="bot-avatar__status" />
  </div>
</template>

<script setup lang="ts">
import CachedAvatar from './CachedAvatar.vue';
import BotIcon from './BotIcon.vue';

const props = withDefaults(
  defineProps<{
    path?: string | null;
    alt?: string;
    initials?: string;
    isOnline?: boolean;
    isIcon?: boolean;
  }>(),
  {
    path: '',
    alt: '',
    initials: '',
    isOnline: true,
    isIcon: false
  }
);

defineOptions({
  inheritAttrs: false
});
</script>
