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
      @close="closeFolderManager"
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
          :system-active="!!mobileSystemFolder"
          is-active
          :auth-user-id="getAuthUser()?.id"
          @select="selectMobileFolder"
          @manage="openFolderManager"
        >
          <template #system-folders>
            <button
              v-for="folder in mobileSystemFolders"
              :key="folder.id"
              type="button"
              class="chat-folder-rail__item"
              :class="{
                'chat-folder-rail__item--active':
                  mobileSystemFolder === folder.id
              }"
              :aria-pressed="mobileSystemFolder === folder.id"
              :data-testid="`Clients-SystemFolder-${folder.id}`"
              @click="selectMobileSystemFolder(folder.id)"
            >
              <span class="chat-folder-rail__avatar">
                <ClientPlatformIcon
                  v-if="folder.platform && !folder.icon"
                  :platform="folder.platform"
                />
                <Icon v-else-if="folder.icon" :name="folder.icon" />
              </span>
              <span class="chat-folder-rail__label">{{ folder.label }}</span>
            </button>
          </template>
        </ChatFolderRail>
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
import { computed, ref, watch } from 'vue';
import { Icon, IconNameEnum } from '@pksep/yui';
import {
  clientName,
  clientPlatform,
  useManagerInquiries,
  type ManagerInquiry
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
const props = defineProps<{ isCollapse?: boolean; isMobile?: boolean }>();
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
  openFolderManager,
  closeFolderManager,
  loadFolders
} = useChatFolders('clients');

// Состав системной поддержки обновляется после появления нового клиентского чата.
watch(
  () =>
    inquiries.value
      .map(item => item.topic_id)
      .sort()
      .join(','),
  (): void => {
    if (allowed.value) void loadFolders(true);
  }
);
const queue = ref('all');
const source = ref('');
const search = ref('');
const filters = [
  { value: 'all', label: 'Все' },
  { value: 'new', label: 'Новые заявки' },
  { value: 'mine', label: 'Мои заявки' }
];
const platforms = ['Сайт', 'Авито', 'ВКонтакте', 'Telegram', 'MAX'].map(
  platform => ({
    value: platform,
    label: platform
  })
);
const mobileSystemFolders = [
  { id: 'site', label: 'Сайт', platform: 'Сайт', icon: IconNameEnum.settings },
  { id: 'avito', label: 'Авито', platform: 'Авито', icon: null },
  { id: 'vk', label: 'ВК', platform: 'ВКонтакте', icon: null },
  { id: 'telegram', label: 'Telegram', platform: 'Telegram', icon: null },
  { id: 'max', label: 'MAX', platform: 'MAX', icon: null },
  { id: 'new', label: 'Новые заявки', platform: '', icon: IconNameEnum.info },
  {
    id: 'support',
    label: 'Поддержка',
    platform: '',
    icon: IconNameEnum.headset
  }
];
const mobileSystemFolder = computed(() =>
  source.value
    ? mobileSystemFolders.find(folder => folder.platform === source.value)
        ?.id || ''
    : queue.value === 'all'
      ? ''
      : queue.value
);
const selectMobileFolder = (folderId: string | null) => {
  queue.value = 'all';
  source.value = '';
  selectFolder(folderId);
};
const selectMobileSystemFolder = (folderId: string) => {
  const wasSelected = mobileSystemFolder.value === folderId;
  selectMobileFolder(null);
  if (wasSelected) return;
  const folder = mobileSystemFolders.find(item => item.id === folderId)!;
  if (folder.platform) source.value = folder.platform;
  else queue.value = folder.id;
};
const isSupportInquiry = (item: ManagerInquiry) =>
  (item.channels || [item.source?.channel || 'widget']).some(
    channel => channel.toLowerCase() === 'support'
  ) || item.source?.name?.trim().toLocaleLowerCase('ru') === 'поддержка';
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
        (!props.isMobile ||
          queue.value !== 'support' ||
          isSupportInquiry(item)) &&
        (!source.value ||
          ((!props.isMobile || !isSupportInquiry(item)) &&
            (item.channels || [item.source?.channel || 'widget']).some(
              channel =>
                clientPlatform({ ...item, source: { channel } }) ===
                source.value
            ))) &&
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
.clients-panel :deep(.chats-toolbar__filter-button svg),
.clients-panel :deep(.chats-toolbar__filter-button .client-platform-icon) {
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
