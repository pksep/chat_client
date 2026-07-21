<template>
  <div
    :class="['user-profile', 'favorite-topic-profile', $attrs.class]"
    :data-testid="`${props.dataTestid}-FavoriteTopicProfile-Container`"
  >
    <FavoriteTopicIcon
      class="user-profile__avatar"
      :data-testid="`${props.dataTestid}-FavoriteTopicProfile-Icon`"
    />
    <h3
      class="user-profile__title"
      :data-testid="`${props.dataTestid}-FavoriteTopicProfile-Title`"
    >
      <span class="user-profile__title-text">{{ FAVORITE_TOPIC_NAME }}</span>
    </h3>
  </div>
</template>

<script setup lang="ts">
import { FAVORITE_TOPIC_NAME } from '../utils/favorite-topic';
import FavoriteTopicIcon from './UI/FavoriteTopicIcon.vue';

const props = withDefaults(
  defineProps<{
    dataTestid?: string;
  }>(),
  {
    dataTestid: 'FavoriteTopic'
  }
);

defineOptions({
  inheritAttrs: false
});
</script>

<style scoped>
.favorite-topic-profile {
  grid-template-areas: 'avatar title';
}

.favorite-topic-profile .user-profile__title {
  margin-bottom: 0;
}
</style>
