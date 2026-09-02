<template>
  <section
    class="contact-selector"
    :data-testid="`${props.dataTestid}-TopicSelector-Container`"
  >
    <Search
      class="contact-selector__search"
      v-model="state.q"
      :data-testid="`${props.dataTestid}-TopicSelector-Search`"
    />
    <ul
      v-if="filteredTopics.length"
      class="contact-selector__list"
      :data-testid="`${props.dataTestid}-TopicSelector-List`"
    >
      <li
        v-for="(topic, index) in filteredTopics"
        :key="topic.id"
        class="contact-selector__item"
        @click="handleSelectTopic(topic)"
        :data-testid="`${props.dataTestid}-TopicSelector-Item${index + 1}`"
      >
        <FavoriteTopicProfile
          v-if="isTopicFavorite(topic)"
          :dataTestid="`${props.dataTestid}-TopicSelector-FavoriteProfile${index + 1}`"
        />
        <UserProfile
          v-else-if="topic.type === TopicType.DM"
          :user="topic.user"
          :dataTestid="`${props.dataTestid}-TopicSelector-UserProfile${index + 1}`"
        />
        <GroupProfile
          v-else
          :topic="topic"
          :dataTestid="`${props.dataTestid}-TopicSelector-UserProfile${index + 1}`"
        />
      </li>
    </ul>
    <div
      v-else
      class="contact-selector__empty"
      :data-testid="`${props.dataTestid}-TopicSelector-Empty`"
    >
      <p class="contact-selector__empty-title">Результаты не найдены</p>
      <img
        class="contact-selector__empty-image"
        src="/images/not-found-contact.svg"
        alt="Результаты не найдены"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue';
import { Search } from '@pksep/yui';
import {
  ITopic,
  ITopicPropsEmits,
  ITopicSelectorProps
} from './interfaces/interfaces';
import { getTopicList } from '../composables/useTopics';
import UserProfile from './UserProfile/UserProfile.vue';
import { TopicType } from '../services/useChatSDK/types';
import GroupProfile from './GroupProfile/GroupProfile.vue';
import FavoriteTopicProfile from './FavoriteTopicProfile.vue';
import {
  matchesTopicSearch,
  normalizeAtSearchQuery
} from '../utils/searchMatch';
import { getAuthUser } from '../composables/useAuth';
import { isFavoriteTopic } from '../utils/favorite-topic';
import { isCallTopic } from '../utils/call-topic';
import { isCallBotUser } from '../utils/bot';

const props = withDefaults(defineProps<ITopicSelectorProps>(), {
  dataTestid: () => 'TopicSelector'
});
const emits = defineEmits<ITopicPropsEmits>();

const topics = computed(() => getTopicList());
const isTopicFavorite = (topic: ITopic): boolean =>
  isFavoriteTopic(topic, getAuthUser()?.id);

const filteredTopics = computed(() =>
  topics.value.filter(topic => {
    const query = normalizeAtSearchQuery(state.q);

    return (
      !isCallTopic(topic) &&
      !isCallBotUser(topic.user) &&
      matchesTopicSearch(topic, query)
    );
  })
);

const state = reactive({
  q: ''
});

const handleSelectTopic = (topic: ITopic) => {
  emits('unmount-select', topic);
};
</script>
