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
    <span
      v-if="props.description !== undefined"
      class="user-profile__ex"
      :data-testid="`${props.dataTestid}-FavoriteTopicProfile-Ex`"
    >
      {{ props.description }}
    </span>
  </div>
</template>

<script setup lang="ts">
import { FAVORITE_TOPIC_NAME } from '../utils/favorite-topic';
import FavoriteTopicIcon from './UI/FavoriteTopicIcon.vue';

const props = withDefaults(
  defineProps<{
    dataTestid?: string;
    description?: string;
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
  grid-template-areas:
    'avatar title'
    'avatar description';
}

.favorite-topic-profile:not(:has(.user-profile__ex)) {
  grid-template-areas: 'avatar title';
}

.favorite-topic-profile .user-profile__title {
  margin-bottom: 0;
}
</style>
