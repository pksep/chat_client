<template>
  <section class="clients-panel" data-testid="ClientsPanel">
    <ChatFoldersPanel
      v-if="isManagingFolders && !isCollapse"
      scope="clients"
      :mobile="isMobile"
      :topics="folderTopics"
      :folders="clientFolders"
      :loading="isFoldersLoading"
      :selected-folder-id="activeFolderId"
      @select-folder="selectFolder"
      @select-topic="openTopic"
    />
    <ChatsToolbar
      v-else-if="!isCollapse"
      v-model="search"
      title="Клиенты"
      :show-create="false"
      :class="{ 'mobile-list-container__toolbar': isMobile }"
      data-testid="Clients"
    >
      <template v-if="isMobile" #folders>
        <ChatFolderRail
          mobile
          scope="clients"
          :loading="isFoldersLoading"
          :folders="clientFolders"
          :topics="folderTopics"
          :selected-folder-id="activeFolderId"
          :is-managing="false"
          is-active
          :auth-user-id="getAuthUser()?.id"
          @select="selectFolder"
          @manage="openFolderManager"
        />
      </template>
      <template #filters>
        <div class="clients-panel__filter-rows">
          <ChatsToolbarFilters
            v-model="queue"
            :options="filters"
            aria-label="Заявки"
            data-testid="Clients"
          />
          <ChatsToolbarFilters
            :model-value="source"
            :options="platforms"
            aria-label="Платформа"
            data-testid="Clients-Platforms"
            @update:model-value="source = source === $event ? '' : $event"
          >
            <template #icon="{ option }">
              <ClientPlatformIcon :platform="option.value" />
            </template>
          </ChatsToolbarFilters>
        </div>
      </template>
    </ChatsToolbar>
    <template v-if="!isCollapse">
      <p v-if="!allowed && !loading" class="clients-panel__empty">
        Раздел недоступен для вашей роли
      </p>
    </template>
    <TopicList
      v-if="!isManagingFolders && allowed && (loading || topics.length)"
      folder-scope="clients"
      :class="isMobile ? '' : 'menu__contact-list'"
      :topics="topics"
      :is-loading="loading"
      :is-collapse="isCollapse"
      :selected-topic-id="route.id || undefined"
      data-testid="Clients-Topics"
      @unmount-topic="openTopic"
    />
    <MenuEmptyState
      v-if="
        !isManagingFolders &&
        allowed &&
        !loading &&
        !topics.length &&
        !isCollapse
      "
      :text="search.trim() ? 'Ничего не найдено' : 'Здесь будут чаты'"
      :hide-icon="!search.trim()"
      data-testid="Clients-Empty"
    />
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  clientName,
  clientPlatform,
  useManagerInquiries
} from '../../composables/useManagerInquiries';
import { getTopicList } from '../../composables/useTopics';
import { getAuthUser } from '../../composables/useAuth';
import { navigateToGroup, useUrlWatcher } from '../../composables/navigation';
import { useChatMenu } from '../../composables/useChatMenu';
import TopicList from '../ContactList/TopicList.vue';
import ClientPlatformIcon from './ClientPlatformIcon.vue';
import ChatsToolbarFilters from '../Menu/ChatsToolbarFilters.vue';
import ChatsToolbar from '../Menu/ChatsToolbar.vue';
import MenuEmptyState from '../Menu/MenuEmptyState.vue';
import type { ITopic } from '../interfaces/interfaces';
import { useChatFolders } from '../../composables/useChatFolders';
import ChatFolderRail from '../Menu/ChatFolderRail.vue';
import ChatFoldersPanel from '../Menu/ChatFoldersPanel.vue';
defineProps<{ isCollapse?: boolean; isMobile?: boolean }>();
const { inquiries, allowed, loading } = useManagerInquiries();
const route = useUrlWatcher();
const { setActiveSection } = useChatMenu();
const {
  folders: clientFolders,
  activeFolderId,
  activeFolder,
  isManagingFolders,
  isLoading: isFoldersLoading,
  selectFolder,
  openFolderManager
} = useChatFolders('clients');
const queue = ref('all');
const source = ref('');
const search = ref('');
const filters = [
  { value: 'all', label: 'Все' },
  { value: 'new', label: 'Новые заявки' },
  { value: 'mine', label: 'Мои заявки' }
];
const platforms = ['Сайт', 'Авито', 'ВКонтакте'].map(platform => ({
  value: platform,
  label: platform
}));
const folderTopics = computed(() => {
  const byId = new Map(getTopicList().map(topic => [topic.id, topic]));
  return inquiries.value.flatMap(item => {
    const topic = byId.get(item.topic_id);
    return topic
      ? [{ ...topic, name: clientName(item), avatarUrl: item.avatar_url || '' }]
      : [];
  });
});
const topics = computed(() => {
  const byId = new Map(getTopicList().map(topic => [topic.id, topic]));
  const query = search.value.trim().toLocaleLowerCase('ru');
  return inquiries.value
    .filter(
      item =>
        (!activeFolder.value ||
          activeFolder.value.topicIds.includes(item.topic_id)) &&
        (queue.value !== 'new' || !item.manager_ids.length) &&
        (queue.value !== 'mine' ||
          item.manager_ids.includes(getAuthUser()?.id || '')) &&
        (!source.value ||
          (item.channels || [item.source?.channel || 'widget']).some(
            channel =>
              clientPlatform({ ...item, source: { channel } }) === source.value
          )) &&
        (!query ||
          `${clientName(item)} ${item.contacts?.email || ''}`
            .toLocaleLowerCase('ru')
            .includes(query))
    )
    .flatMap(item => {
      const topic = byId.get(item.topic_id);
      return topic
        ? [
            {
              ...topic,
              name: clientName(item),
              avatarUrl: item.avatar_url || ''
            }
          ]
        : [];
    });
});
const openTopic = (topic: ITopic) => {
  setActiveSection('clients');
  navigateToGroup(topic.id);
};
</script>
<style scoped>
.clients-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
  width: 100%;
}
.clients-panel > .chat-folders-panel {
  flex: 1;
}
.clients-panel :deep(.chats-toolbar__filter-button svg) {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.clients-panel__filter-rows {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding-bottom: 10px;
}
.clients-panel__filter-rows > :deep(.chats-toolbar__filters) {
  display: contents;
}
.clients-panel__empty {
  color: var(--text-secondary);
  font-size: 14px;
  padding: 10px;
}
</style>
