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
          v-emoji
          class="forward-recipient-selector__ai-profile"
        >
          <span class="forward-recipient-selector__ai-copy">
            <strong>{{ recipient.session.title }}</strong>
            <small>{{ recipient.session.description }}</small>
          </span>
        </div>
        <UserProfile
          v-else-if="recipient.kind === 'user'"
          v-emoji
          :user="recipient.user"
          :dataTestid="`${props.dataTestid}-TopicSelector-UserProfile${index + 1}`"
        />
        <FavoriteTopicProfile
          v-else-if="isTopicFavorite(recipient.topic)"
          v-emoji
          class="forward-recipient-selector__topic-profile"
          :description="getTopicLastMessagePreview(recipient.topic)"
          :dataTestid="`${props.dataTestid}-TopicSelector-FavoriteProfile${index + 1}`"
        />
        <UserProfile
          v-else-if="recipient.topic.type === TopicType.DM"
          v-emoji
          class="forward-recipient-selector__topic-profile"
          :user="recipient.topic.user"
          :description="getTopicLastMessagePreview(recipient.topic)"
          :dataTestid="`${props.dataTestid}-TopicSelector-UserProfile${index + 1}`"
        />
        <GroupProfile
          v-else
          v-emoji
          class="forward-recipient-selector__topic-profile"
          :topic="recipient.topic"
          :description="getTopicLastMessagePreview(recipient.topic)"
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
import { MediaType } from '@pksep/zod-shared-chat';
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
import { stripHtml } from '../utils/stripHtml';
import { getFullMessagesByTopicId } from '../services/useMessages';
import { resolveTopicLastMessage } from '../utils/topic-last-message';
import { getTopicsByChatsToolbarFilter } from '../utils/chats-toolbar-filter';
import type { ChatsToolbarFilter } from '../composables/useChatsToolbarState';
import {
  type AiAssistantSession,
  useAiAssistant
} from '../composables/useAiAssistant';

type ForwardRecipientFilter = Exclude<ChatsToolbarFilter, 'all'> | 'ai';
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
const authedUser = computed(() => getAuthUser());
const isTopicFavorite = (topic: ITopic): boolean =>
  isFavoriteTopic(topic, authedUser.value?.id);

const state = reactive<{
  q: string;
  filter: ForwardRecipientFilter;
}>({
  q: '',
  filter: 'chats'
});

const filterOptions: Array<{
  value: ForwardRecipientFilter;
  label: string;
}> = [
  { value: 'chats', label: 'Чаты' },
  { value: 'groups', label: 'Группы' },
  { value: 'bots', label: 'Боты' },
  { value: 'ai', label: 'СЭПи' }
];

const getClientLastMessage = (topic: ITopic) => {
  const messages = getFullMessagesByTopicId(topic.id);

  return isTopicFavorite(topic)
    ? [...messages].reverse().find(message => !message.isSystem)
    : messages.at(-1);
};

const topicsWithLatestMessages = computed(() =>
  topics.value.map(topic => {
    const lastMessage = resolveTopicLastMessage(
      topic.lastMessage,
      getClientLastMessage(topic)
    );

    return lastMessage === topic.lastMessage
      ? topic
      : { ...topic, lastMessage };
  })
);

const getTopicLastMessagePreview = (topic: ITopic): string | undefined => {
  const text = stripHtml(topic.lastMessage?.text);

  if (text) {
    return text;
  }

  const media = topic.lastMessage?.media || [];

  if (!media.length) {
    return undefined;
  }

  const haveImage = media.some(item => item.type === MediaType.Image);
  const haveVideo = media.some(item => item.type === MediaType.Video);

  if (haveImage && haveVideo) {
    return 'Фото, видео';
  }

  if (haveImage) {
    return 'Фото';
  }

  return haveVideo ? 'Видео' : 'Медиа';
};

const getTopicRecipients = (
  filter: Exclude<ForwardRecipientFilter, 'ai'>,
  query: string
): ForwardRecipient[] => {
  const filteredTopics = getTopicsByChatsToolbarFilter(
    topicsWithLatestMessages.value,
    filter,
    authedUser.value?.id
  );
  const topicsInFilter =
    filter === 'chats'
      ? [
          ...topicsWithLatestMessages.value.filter(isTopicFavorite),
          ...filteredTopics
        ]
      : filteredTopics;

  return topicsInFilter
    .filter(topic => !isCallBotUser(topic.user))
    .filter(topic => matchesTopicSearch(topic, query))
    .map(topic => ({ key: `topic:${topic.id}`, kind: 'topic', topic }));
};

const getUserRecipientsWithoutTopic = (query: string): ForwardRecipient[] => {
  const existingUserIds = new Set(
    topicsWithLatestMessages.value
      .filter(
        topic =>
          topic.type === TopicType.DM &&
          !isBotTopic(topic) &&
          !isCallTopic(topic)
      )
      .flatMap(topic => (topic.user?.id ? [topic.user.id] : []))
  );

  return users.value
    .filter(user => user.id !== authedUser.value?.id && !isBotUser(user))
    .filter(user => !existingUserIds.has(user.id))
    .filter(user => matchesUserSearch(user, query))
    .map(user => ({ key: `user:${user.id}`, kind: 'user', user }));
};

const getAiRecipients = (query: string): ForwardRecipient[] => {
  const normalizedQuery = normalizeSearchText(query);

  return sessions.value
    .filter(session =>
      normalizeSearchText(`${session.title} ${session.description}`).includes(
        normalizedQuery
      )
    )
    .map(session => ({ key: `ai:${session.id}`, kind: 'ai', session }));
};

const filteredRecipients = computed<ForwardRecipient[]>(() => {
  const query = normalizeAtSearchQuery(state.q);

  if (state.filter === 'ai') {
    return getAiRecipients(query);
  }

  const topicRecipients = getTopicRecipients(state.filter, query);

  if (state.filter === 'chats') {
    return [...topicRecipients, ...getUserRecipientsWithoutTopic(query)];
  }

  return topicRecipients;
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
