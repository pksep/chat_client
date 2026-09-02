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
    <div
      class="chats-toolbar__filters forward-recipient-selector__filters"
      :data-testid="`${props.dataTestid}-TopicSelector-Filters`"
    >
      <button
        v-for="filterOption in filterOptions"
        :key="filterOption.value"
        type="button"
        :class="[
          'chats-toolbar__filter-button',
          {
            'chats-toolbar__filter-button--active':
              state.filter === filterOption.value
          }
        ]"
        :data-testid="`${props.dataTestid}-TopicSelector-Filter-${filterOption.value}`"
        @click="state.filter = filterOption.value"
      >
        {{ filterOption.label }}
      </button>
    </div>
    <ul
      v-if="filteredRecipients.length"
      class="contact-selector__list"
      :data-testid="`${props.dataTestid}-TopicSelector-List`"
    >
      <li
        v-for="(recipient, index) in filteredRecipients"
        :key="recipient.key"
        class="contact-selector__item"
        :class="{
          'contact-selector__item--pending':
            pendingRecipientKey === recipient.key
        }"
        @click="handleSelectRecipient(recipient)"
        :data-testid="`${props.dataTestid}-TopicSelector-Item${index + 1}`"
      >
        <div
          v-if="recipient.kind === 'ai'"
          class="forward-recipient-selector__ai-profile"
        >
          <span class="forward-recipient-selector__ai-copy">
            <strong>{{ recipient.session.title }}</strong>
            <small>{{ recipient.session.description }}</small>
          </span>
        </div>
        <UserProfile
          v-else-if="recipient.kind === 'user'"
          :user="recipient.user"
          :dataTestid="`${props.dataTestid}-TopicSelector-UserProfile${index + 1}`"
        />
        <FavoriteTopicProfile
          v-else-if="isTopicFavorite(recipient.topic)"
          :dataTestid="`${props.dataTestid}-TopicSelector-FavoriteProfile${index + 1}`"
        />
        <UserProfile
          v-else-if="recipient.topic.type === TopicType.DM"
          :user="recipient.topic.user"
          :dataTestid="`${props.dataTestid}-TopicSelector-UserProfile${index + 1}`"
        />
        <GroupProfile
          v-else
          :topic="recipient.topic"
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
import { computed, reactive, ref } from 'vue';
import { Search } from '@pksep/yui';
import { ITopic, ITopicSelectorProps, IUser } from './interfaces/interfaces';
import { getTopicList, useTopics } from '../composables/useTopics';
import { getUsersList } from '../composables/useUsers';
import UserProfile from './UserProfile/UserProfile.vue';
import { TopicType } from '../services/useChatSDK/types';
import GroupProfile from './GroupProfile/GroupProfile.vue';
import FavoriteTopicProfile from './FavoriteTopicProfile.vue';
import {
  matchesUserSearch,
  matchesTopicSearch,
  normalizeAtSearchQuery,
  normalizeSearchText
} from '../utils/searchMatch';
import { getAuthUser } from '../composables/useAuth';
import { isFavoriteTopic } from '../utils/favorite-topic';
import { isCallTopic } from '../utils/call-topic';
import { isBotTopic, isBotUser, isCallBotUser } from '../utils/bot';
import {
  type AiAssistantSession,
  useAiAssistant
} from '../composables/useAiAssistant';

type ForwardRecipientFilter = 'users' | 'chats' | 'bots' | 'ai';
type ForwardRecipient =
  | { key: string; kind: 'user'; user: IUser }
  | { key: string; kind: 'topic'; topic: ITopic }
  | { key: string; kind: 'ai'; session: AiAssistantSession };

const props = withDefaults(defineProps<ITopicSelectorProps>(), {
  dataTestid: () => 'TopicSelector'
});
const emits = defineEmits<{
  (event: 'unmount-select', topic: ITopic): void;
  (event: 'unmount-select-ai-session', session: AiAssistantSession): void;
}>();

const topics = computed(() => getTopicList());
const users = computed(() => getUsersList());
const { sessions } = useAiAssistant();
const { createTopic } = useTopics();
const pendingRecipientKey = ref<string | null>(null);
const isTopicFavorite = (topic: ITopic): boolean =>
  isFavoriteTopic(topic, getAuthUser()?.id);

const state = reactive<{
  q: string;
  filter: ForwardRecipientFilter;
}>({
  q: '',
  filter: 'users'
});

const filterOptions: Array<{
  value: ForwardRecipientFilter;
  label: string;
}> = [
  { value: 'users', label: 'Чаты' },
  { value: 'chats', label: 'Группы' },
  { value: 'bots', label: 'Боты' },
  { value: 'ai', label: 'СЭПи' }
];

const filteredRecipients = computed<ForwardRecipient[]>(() => {
  const query = normalizeAtSearchQuery(state.q);

  if (state.filter === 'users') {
    return users.value
      .filter(user => user.id !== getAuthUser()?.id && !isBotUser(user))
      .filter(user => matchesUserSearch(user, query))
      .map(user => ({ key: `user:${user.id}`, kind: 'user', user }));
  }

  if (state.filter === 'chats') {
    return topics.value
      .filter(topic => topic.type === TopicType.Group && !isCallTopic(topic))
      .filter(topic => matchesTopicSearch(topic, query))
      .map(topic => ({ key: `topic:${topic.id}`, kind: 'topic', topic }));
  }

  if (state.filter === 'bots') {
    return topics.value
      .filter(
        topic =>
          isBotTopic(topic) &&
          !isCallTopic(topic) &&
          !isCallBotUser(topic.user)
      )
      .filter(topic => matchesTopicSearch(topic, query))
      .map(topic => ({ key: `topic:${topic.id}`, kind: 'topic', topic }));
  }

  const normalizedQuery = normalizeSearchText(query);
  return sessions.value
    .filter(session =>
      normalizeSearchText(`${session.title} ${session.description}`).includes(
        normalizedQuery
      )
    )
    .map(session => ({ key: `ai:${session.id}`, kind: 'ai', session }));
});

const getUserTopic = async (user: IUser): Promise<ITopic | null> => {
  const existingTopic = topics.value.find(
    topic => topic.type === TopicType.DM && topic.user?.id === user.id
  );
  if (existingTopic) return existingTopic;

  return createTopic(user.id);
};

const handleSelectRecipient = async (
  recipient: ForwardRecipient
): Promise<void> => {
  if (pendingRecipientKey.value) return;

  if (recipient.kind === 'ai') {
    emits('unmount-select-ai-session', recipient.session);
    return;
  }

  if (recipient.kind === 'topic') {
    emits('unmount-select', recipient.topic);
    return;
  }

  pendingRecipientKey.value = recipient.key;
  try {
    const topic = await getUserTopic(recipient.user);
    if (topic) emits('unmount-select', topic);
  } finally {
    pendingRecipientKey.value = null;
  }
};
</script>
