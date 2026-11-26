<template>
  <section
    class="clients-panel"
    :class="{
      'clients-panel--widget-settings': showSettings && allowed && !isCollapse
    }"
    data-testid="ClientsPanel"
  >
    <ClientWidgetSettings
      v-if="showSettings && allowed && !isCollapse"
      :initial-sites="settingsSites"
      @close="showSettings = false"
    />
    <ChatFoldersPanel
      v-else-if="isManagingFolders && !isCollapse"
      scope="clients"
      :mobile="isMobile"
      :topics="folderTopics"
      :folders="clientFolders"
      :loading="isFoldersLoading"
      :selected-folder-id="activeFolderId"
      @close="closeFolderManager"
      @select-folder="selectFolder"
      @select-topic="openTopic"
    >
      <template v-if="isMobile" #folders>
        <ClientsFolderRail
          :loading="isFoldersLoading"
          :folders="clientFolders"
          :topics="folderTopics"
          :selected-folder-id="activeFolderId"
          is-managing
          :selected-system-folder="mobileSystemFolder"
          :system-folders="mobileSystemFolders"
          :auth-user-id="getAuthUser()?.id"
          @select="selectFolder"
          @select-system="selectMobileSystemFolder"
          @manage="closeFolderManager"
        />
      </template>
    </ChatFoldersPanel>
    <ChatsToolbar
      v-else-if="!isCollapse"
      v-model="search"
      title="Клиенты"
      :show-create="false"
      :show-filters="!isMobile"
      :class="{ 'mobile-list-container__toolbar': isMobile }"
      data-testid="Clients"
      @manage-folders="openFolderManager"
    >
      <template #title-action>
        <Tooltip
          v-if="allowed"
          class="clients-panel__settings-tooltip"
          :hint="settingsHint"
          :is-can-show="!canOpenSettings"
          position="bottom-center"
          type="black"
          data-testid="Clients-WidgetSettingsTooltip"
        >
          <Button
            class="clients-panel__settings"
            :type="ButtonTypeEnum.ghost"
            :size="SizesEnum.little"
            :disabled="!canOpenSettings"
            :aria-description="canOpenSettings ? undefined : settingsHint"
            aria-label="Настройки виджета"
            @click="openSettings"
          >
            <Icon :name="IconNameEnum.settings" :width="24" :height="24" />
          </Button>
        </Tooltip>
      </template>
      <template v-if="isMobile" #folders>
        <ClientsFolderRail
          tabs
          :loading="isFoldersLoading"
          :folders="clientFolders"
          :topics="folderTopics"
          :selected-folder-id="activeFolderId"
          :is-managing="false"
          :selected-system-folder="mobileSystemFolder"
          :system-folders="mobileSystemFolders"
          :auth-user-id="getAuthUser()?.id"
          @select="selectFolder"
          @select-system="selectMobileSystemFolder"
          @manage="openFolderManager"
        />
      </template>
      <template #filters>
        <div class="clients-panel__filter-rows">
          <ChatsToolbarFilters
            :model-value="selectedFilter"
            :options="filters"
            aria-label="Заявки"
            data-testid="Clients"
            @update:model-value="selectFilter"
          />
          <ChatsToolbarFilters
            :model-value="source"
            :options="platforms"
            aria-label="Платформа"
            data-testid="Clients-Platforms"
            @update:model-value="
              selectFilter(source === $event ? 'all' : $event)
            "
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
      v-if="
        !showSettings &&
        !isManagingFolders &&
        allowed &&
        (loading || topics.length)
      "
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
        !showSettings &&
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
import {
  Button,
  ButtonTypeEnum,
  Icon,
  IconNameEnum,
  SizesEnum,
  Tooltip
} from '@pksep/yui';
import {
  clientName,
  clientPlatform,
  loadWidgetSites,
  useManagerInquiries,
  type ManagerInquiry,
  type WidgetSite
} from '../../composables/useManagerInquiries';
import { getTopicList, useTopics } from '../../composables/useTopics';
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
import { useChatListSelection } from '../../composables/useChatListSelection';
import ClientsFolderRail from './ClientsFolderRail.vue';
import ChatFoldersPanel from '../Menu/ChatFoldersPanel.vue';
import ClientWidgetSettings from './ClientWidgetSettings.vue';

const props = defineProps<{ isCollapse?: boolean; isMobile?: boolean }>();
const {
  inquiries,
  allowed,
  loading: inquiriesLoading,
  widgetSettingsAvailability
} = useManagerInquiries();
const showSettings = ref(false);
const settingsSites = ref<WidgetSite[]>([]);
const checkingSettings = ref(false);
const canOpenSettings = computed(
  () =>
    widgetSettingsAvailability.value === 'available' && !checkingSettings.value
);
const settingsHint = computed(() =>
  widgetSettingsAvailability.value === 'unavailable'
    ? 'Сервер виджета недоступен'
    : 'Проверяем связь с сервером виджета'
);
watch([allowed, () => props.isCollapse], ([canOpen, collapsed]): void => {
  if (!canOpen || collapsed) showSettings.value = false;
});
const { loadingClientTopics } = useTopics();
const loading = computed(
  () => inquiriesLoading.value || loadingClientTopics.value
);
const route = useUrlWatcher();
const { activeSection, setActiveSection } = useChatMenu();

const openSettings = async (): Promise<void> => {
  if (!canOpenSettings.value) return;
  const actor = getAuthUser()?.id;
  checkingSettings.value = true;

  try {
    const sites = await loadWidgetSites();
    if (
      getAuthUser()?.id !== actor ||
      !allowed.value ||
      props.isCollapse ||
      activeSection.value !== 'clients' ||
      widgetSettingsAvailability.value !== 'available'
    )
      return;
    settingsSites.value = sites;
    showSettings.value = true;
  } catch {
    // Проверка связи уже перевела кнопку в недоступное состояние.
  } finally {
    checkingSettings.value = false;
  }
};
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

// Мобильные вкладки остаются в DOM: выход из раздела должен закрывать редактор.
watch([activeSection, isManagingFolders], ([section, folders]): void => {
  if (section !== 'clients' || folders) showSettings.value = false;
});
watch(
  () => [route.value.type, route.value.id],
  (): void => {
    showSettings.value = false;
  }
);

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
const { selectedFilter, selectFilter } = useChatListSelection('clients');
const queue = computed(() =>
  ['new', 'mine', 'support'].includes(selectedFilter.value || '')
    ? selectedFilter.value || 'all'
    : 'all'
);
const source = computed(
  () =>
    platforms.find(platform => platform.value === selectedFilter.value)
      ?.value || ''
);
const search = ref('');
const filters = [
  { value: 'all', label: 'Все' },
  { value: 'new', label: 'Новые заявки' },
  { value: 'mine', label: 'Мои заявки' }
];
const platforms = [
  'Сайт',
  'Авито',
  'ВКонтакте',
  'Telegram',
  'MAX',
  'WhatsApp'
].map(platform => ({
  value: platform,
  label: platform
}));
const mobileSystemFolders = [
  { id: 'site', label: 'Сайт', platform: 'Сайт', icon: IconNameEnum.settings },
  { id: 'avito', label: 'Авито', platform: 'Авито', icon: null },
  { id: 'vk', label: 'ВК', platform: 'ВКонтакте', icon: null },
  { id: 'telegram', label: 'Telegram', platform: 'Telegram', icon: null },
  { id: 'max', label: 'MAX', platform: 'MAX', icon: null },
  { id: 'whatsapp', label: 'WhatsApp', platform: 'WhatsApp', icon: null },
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
const selectMobileSystemFolder = (folderId: string) => {
  const wasSelected =
    !isManagingFolders.value && mobileSystemFolder.value === folderId;
  const folder = mobileSystemFolders.find(item => item.id === folderId)!;
  closeFolderManager();
  selectFilter(wasSelected ? 'all' : folder.platform || folder.id);
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
.mobile-list-container__section--clients .clients-panel--widget-settings {
  box-sizing: border-box;
  height: 100%;
  padding-bottom: calc(74px + env(safe-area-inset-bottom, 0px));
}
.clients-panel :deep(.clients-panel__settings-tooltip) {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  margin-inline-end: auto;
}
.clients-panel :deep(.clients-panel__settings.button-yui-kit) {
  flex: none;
  width: 24px;
  min-width: 24px;
  height: 24px;
  min-height: 24px;
  padding: 0;
}
.clients-panel :deep(.clients-panel__settings:disabled) {
  color: var(--text-disabled);
}
.clients-panel :deep(.chats-toolbar__filter-button svg),
.clients-panel :deep(.chats-toolbar__filter-button .client-platform-icon) {
  width: 16px;
  height: 16px;
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
