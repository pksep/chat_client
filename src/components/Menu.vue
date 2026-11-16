<template>
  <aside
    :class="menuClasses"
    :data-testid="`${props.dataTestid}-Menu-Container`"
  >
    <Icon
      :name="isCollapse ? IconNameEnum.chevronRight : IconNameEnum.chevronLeft"
      class="chats-toolbar__collapse"
      @click="handleCollapse"
      :data-testid="`${props.dataTestid}-Menu-ChatsToolbar-CollapseIcon`"
    />

    <ChatFolderRail
      v-if="!isCollapse && !isShareSelectionActive"
      :scope="activeSection === 'clients' ? 'clients' : 'chats'"
      :loading="isChatFoldersLoading"
      :folders="activeSection === 'clients' ? clientFolders : chatFolders"
      :topics="
        activeSection === 'clients' ? clientFolderTopics : chatBadgeTopics
      "
      :selected-folder-id="
        activeSection === 'clients' ? activeClientFolderId : activeFolderId
      "
      :is-managing="
        activeSection === 'clients'
          ? isManagingClientFolders
          : isManagingFolders
      "
      :is-active="activeSection === 'chats' || activeSection === 'clients'"
      :system-active="
        activeSection === 'clients'
          ? !!clientListFilter && clientListFilter !== 'all'
          : toolbarState.filter !== 'all'
      "
      :auth-user-id="authUserId"
      @select="handleSelectFolder"
      @manage="handleOpenFolderManager"
    />

    <div
      class="menu__start"
      :data-testid="`${props.dataTestid}-Menu-StartContainer`"
    >
      <template v-if="activeSection === 'chats'">
        <ChatFoldersPanel
          v-if="isManagingFolders && !isShareSelectionActive"
          :topics="allTopics"
          :folders="chatFolders"
          :loading="isChatFoldersLoading"
          :selected-folder-id="activeFolderId"
          @close="closeFolderManager"
          @select-folder="handleSelectFolder"
          @select-topic="unmountTopicClick"
        />

        <template v-else>
          <ChatsToolbar
            v-if="!isShareSelectionActive"
            :model-value="toolbarState.search"
            :filter="toolbarState.selectedFilter"
            :filter-counts="filterCounts"
            :filter-muted-only="filterMutedOnly"
            :is-collapse="isCollapse"
            :data-testid="`${props.dataTestid}-Menu`"
            @update:model-value="setSearch"
            @update:filter="setFilter"
            @create-chat="handleNewContactModal"
            @create-group="handleNewGroupModal"
            @create-bot="handleNewBotModal"
          />

          <ShareSelectionToolbar
            v-else
            :message="shareMessage"
            :search="toolbarState.search"
            :filter="toolbarState.filter"
            :filter-counts="filterCounts"
            :selected-count="selectedTopicsCount"
            :summary-label="pendingShareSummaryLabel"
            :is-sending="isSendingSharedFiles"
            :is-collapse="isCollapse"
            :data-testid="`${props.dataTestid}-Menu`"
            @update:message="updateShareMessage"
            @update:search="setSearch"
            @update:filter="setFilter"
            @cancel="closeShareSelection"
            @send="handleSendSharedFiles"
          />

          <IosPushNotificationPrompt
            v-if="isIosWeb() && !isShareSelectionActive && !isCollapse"
          />

          <TopicList
            paginated
            class="menu__contact-list"
            :topics="topicGroups"
            @unmount-topic="unmountTopicClick"
            :selected-topic-id="selectedContactId"
            :show-checkbox="isShareSelectionActive"
            :selected-topic-ids="selectedTopicIds"
            :search-query="toolbarState.search"
            :toolbar-filter="toolbarState.filter"
            :is-loading="shouldShowTopicListSkeleton"
            :message-results="
              isShareSelectionActive ? [] : filteredMessageSearchResults
            "
            :is-collapse="isCollapse"
            :is-message-search-loading="
              !isShareSelectionActive &&
              (isMessageSearchPending || isMessageSearchLoading)
            "
            :data-testid="`${props.dataTestid}-Menu-ContactList`"
            @unmount-message="handleMessageSearchClick"
          />
        </template>
      </template>

      <CallsPage
        v-else-if="activeSection === 'calls'"
        :is-collapse="isCollapse"
        :data-testid="`${props.dataTestid}-Menu-CallsPage`"
      />

      <ClientsPanel
        v-else-if="activeSection === 'clients' && managerAllowed"
        :is-collapse="isCollapse"
      />

      <AIMenuPanel
        v-else-if="activeSection === 'ai' && chatAccess.ai"
        :is-collapse="isCollapse"
        :data-testid="`${props.dataTestid}-Menu-AIPanel`"
      />

      <MenuProfilePanel
        v-else-if="activeSection === 'profile'"
        :is-collapse="isCollapse"
        :data-testid="`${props.dataTestid}-Menu-ProfilePanel`"
        @create-chat="handleNewContactModal"
        @create-group="handleNewGroupModal"
        @create-bot="handleNewBotModal"
      />
    </div>

    <Button
      v-if="canInstall && !isInstalled"
      class="menu__button-install-prompt"
      :type="ButtonTypeEnum.ghost"
      :size="SizesEnum.small"
      @click="handleInstall"
      :data-testid="`${props.dataTestid}-Menu-InstallButton`"
    >
      <Icon
        :name="IconNameEnum.uploadCloud"
        :data-testid="`${props.dataTestid}-Menu-InstallIcon`"
      />
      <template v-if="!isCollapse"> Загрузить на устройство </template>
    </Button>

    <MenuUpdateButton
      :is-collapse="isCollapse"
      :data-testid="`${props.dataTestid}-Menu`"
    />

    <MenuBottomNav
      :is-collapse="isCollapse"
      :data-testid="`${props.dataTestid}-Menu-BottomNav`"
    />
  </aside>
</template>

<script lang="ts" setup>
import {
  isClientTopic,
  useManagerInquiries
} from '../composables/useManagerInquiries';
import ClientsPanel from './Clients/ClientsPanel.vue';
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
  onMounted,
  ref,
  watch
} from 'vue';
import { useResizeState } from '../composables/useResizeState';
import { MAX_W_MD } from '../utils/constants';
import {
  Icon,
  Button,
  ButtonTypeEnum,
  IconNameEnum,
  SizesEnum
} from '@pksep/yui';
import type { ITopic, IMenuEmits, IMenuProps } from './interfaces/interfaces';
import { usePwaInstall } from '../composables/usePwaInstall';
import {
  navigateToGroup,
  navigateToDialogs,
  navigateToFavorites,
  useUrlWatcher
} from '../composables/navigation';
import { useTopics } from '../composables/useTopics';
import TopicList from './ContactList/TopicList.vue';
import ChatsToolbar from './Menu/ChatsToolbar.vue';
import ShareSelectionToolbar from './Menu/ShareSelectionToolbar.vue';
import { TopicType } from '../services/useChatSDK/types';
import { useChatsToolbarState } from '../composables/useChatsToolbarState';
import { useChatMenu } from '../composables/useChatMenu';
import MenuBottomNav from './Menu/MenuBottomNav.vue';
import MenuUpdateButton from './Menu/MenuUpdateButton.vue';
import { getAuthUser } from '../composables/useAuth';
import { useShareSelection } from '../composables/useShareSelection';
import { getShareSelectionSummaryLabel } from '../utils/shareSelectionSummary';
import {
  navigateToSearchResult,
  searchMessages,
  type IMessageSearchResult
} from '../composables/useMessageSearch';
import { isBotTopic } from '../utils/bot';
import { isFavoriteTopic } from '../utils/favorite-topic';
import { isCallTopic } from '../utils/call-topic';
import {
  getChatsToolbarFilterBadgeState,
  getChatsToolbarFilterCounts,
  getChatsToolbarFilterMutedOnly
} from '../utils/chats-toolbar-filter-badge';
import {
  matchesTopicSearch,
  normalizeAtSearchQuery
} from '../utils/searchMatch';
import {
  recordChatTopicNavigationRequest,
  type ChatTopicOpenTelemetryMeta
} from '../services/useChatNavigationTelemetry';
import { useChatFolders } from '../composables/useChatFolders';
import { useChatListSelection } from '../composables/useChatListSelection';
import ChatFolderRail from './Menu/ChatFolderRail.vue';
import { useChatAccess } from '../composables/useChatAccess';
import ChatFoldersPanel from './Menu/ChatFoldersPanel.vue';
import { isIosWeb } from '../utils/ios-pwa-viewport';
import IosPushNotificationPrompt from './Menu/IosPushNotificationPrompt.vue';

const CallsPage = defineAsyncComponent(() => import('./Calls/CallsPage.vue'));
const AIMenuPanel = defineAsyncComponent(() => import('./AI/AIMenuPanel.vue'));
const { access: chatAccess } = useChatAccess();
const MenuProfilePanel = defineAsyncComponent(
  () => import('./Menu/MenuProfilePanel.vue')
);

const props = withDefaults(defineProps<IMenuProps>(), {
  dataTestid: 'Menu'
});

const {
  getTopicList,
  getUnreadTopicList,
  loadRemainingTopics,
  hasMoreTopics,
  initialTopicListPending,
  loading: isTopicsLoading
} = useTopics();
const route = useUrlWatcher();
const { canInstall, handleInstall, isInstalled } = usePwaInstall();
const selectedContactId = computed(() => route.value?.id);
const { state: toolbarState, setSearch, setFilter } = useChatsToolbarState();
const { activeSection, setActiveSection } = useChatMenu();
const { allowed: managerAllowed } = useManagerInquiries();
const {
  pendingShareBatches,
  isShareSelectionActive,
  isSendingSharedFiles,
  shareMessage,
  selectedTopicIds,
  selectedTopicsCount,
  closeShareSelection,
  toggleShareTopic,
  updateShareMessage,
  sendSharedFiles
} = useShareSelection();
const allTopics = computed(() =>
  initialTopicListPending.value
    ? []
    : getTopicList().filter(topic => !isClientTopic(topic))
);
const messageSearchResults = ref<IMessageSearchResult[]>([]);
const isMessageSearchLoading = ref(false);
const isMessageSearchPending = ref(false);
let messageSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let messageSearchRequestToken = 0;
const authUserId = computed(() => getAuthUser()?.id || '');
const {
  folders: chatFolders,
  activeFolderId,
  activeFolder,
  isManagingFolders,
  isLoading: isChatFoldersLoading,
  loadFolders,
  selectFolder,
  openFolderManager,
  closeFolderManager
} = useChatFolders();
const {
  folders: clientFolders,
  activeFolderId: activeClientFolderId,
  isManagingFolders: isManagingClientFolders,
  selectFolder: selectClientFolder,
  openFolderManager: openClientFolderManager
} = useChatFolders('clients');
const { selectedFilter: clientListFilter } = useChatListSelection('clients');
const clientFolderTopics = computed(() =>
  getUnreadTopicList().filter(isClientTopic)
);
const chatBadgeTopics = computed(() =>
  getUnreadTopicList().filter(topic => !isClientTopic(topic))
);
watch([activeFolderId, isManagingFolders, hasMoreTopics], () => {
  if (activeFolderId.value || isManagingFolders.value)
    void loadRemainingTopics();
});
const pendingShareSummaryLabel = computed(() =>
  getShareSelectionSummaryLabel(
    pendingShareBatches.value.flatMap(batch => batch.files)
  )
);

const matchesToolbarFilter = (topic?: ITopic | null): boolean => {
  if (!topic) {
    return false;
  }

  if (isCallTopic(topic)) {
    return false;
  }

  if (toolbarState.filter === 'chats') {
    return (
      topic.type === TopicType.DM &&
      !isBotTopic(topic) &&
      !isFavoriteTopic(topic, authUserId.value)
    );
  }

  if (toolbarState.filter === 'groups') {
    return (
      topic.type === TopicType.Group &&
      !isFavoriteTopic(topic, authUserId.value)
    );
  }

  if (toolbarState.filter === 'bots') {
    return isBotTopic(topic);
  }

  return true;
};

const matchesActiveFolder = (topic?: ITopic | null): boolean =>
  !!topic &&
  (!activeFolder.value || activeFolder.value.topicIds.includes(topic.id));

const filterBadgeState = computed(() =>
  getChatsToolbarFilterBadgeState(
    getUnreadTopicList().filter(topic => !isClientTopic(topic)),
    authUserId.value
  )
);

const filterCounts = computed(() =>
  getChatsToolbarFilterCounts(filterBadgeState.value)
);

const filterMutedOnly = computed(() =>
  getChatsToolbarFilterMutedOnly(filterBadgeState.value)
);

const topicGroups = computed(() => {
  const query = normalizeAtSearchQuery(toolbarState.search);

  const filteredByType = allTopics.value.filter(
    topic => matchesToolbarFilter(topic) && matchesActiveFolder(topic)
  );

  if (!query) {
    return filteredByType;
  }

  return filteredByType.filter(topic => matchesTopicSearch(topic, query));
});

const shouldShowTopicListSkeleton = computed(
  () =>
    activeSection.value === 'chats' &&
    !isShareSelectionActive.value &&
    (isTopicsLoading.value || initialTopicListPending.value) &&
    allTopics.value.length === 0 &&
    !normalizeAtSearchQuery(toolbarState.search)
);

const filteredMessageSearchResults = computed(() => {
  if (!normalizeAtSearchQuery(toolbarState.search)) {
    return [];
  }

  return messageSearchResults.value.filter(result => {
    const topic =
      result.topic || allTopics.value.find(t => t.id === result.topicId);

    return (
      matchesToolbarFilter(topic || null) && matchesActiveFolder(topic || null)
    );
  });
});

const emits = defineEmits<IMenuEmits>();

const { state: isCollapse, toggle } = useResizeState({
  breakpoint: MAX_W_MD,
  storageKey: 'menu-collapse',
  onStateChange: val => {
    emits('unmount-collapse', val);
  }
});

const handleCollapse = (): void => {
  setSearch('');
  if (!isCollapse.value) closeFolderManager();
  toggle();
};

watch([isCollapse, activeSection], ([collapsed, section]) => {
  if (collapsed || (section !== 'chats' && section !== 'clients'))
    closeFolderManager();
});

const unmountTopicClick = (
  topic: ITopic,
  telemetry?: ChatTopicOpenTelemetryMeta | null
): void => {
  if (isShareSelectionActive.value) {
    toggleShareTopic(topic.id);
    return;
  }

  setActiveSection('chats');

  recordChatTopicNavigationRequest({
    telemetry,
    topicId: topic.id,
    topicType: isFavoriteTopic(topic, authUserId.value)
      ? 'FAVORITE'
      : topic.type,
    source: 'menu.unmount_topic'
  });

  if (isFavoriteTopic(topic, authUserId.value)) {
    navigateToFavorites(topic.id);
  } else if (topic.type === 'GROUP') {
    navigateToGroup(topic.id);
  } else if (topic.type === 'DM') {
    navigateToDialogs(topic.id);
  }
};

const runMessageSearch = async (
  query: string,
  requestToken: number
): Promise<void> => {
  if (!query || isShareSelectionActive.value) {
    messageSearchResults.value = [];
    isMessageSearchLoading.value = false;
    isMessageSearchPending.value = false;
    return;
  }

  isMessageSearchLoading.value = true;

  const { results } = await searchMessages(query, {
    limit: 50,
    onLocalResults: ({ results: localResults }) => {
      if (requestToken === messageSearchRequestToken)
        messageSearchResults.value = localResults;
    }
  });

  if (requestToken !== messageSearchRequestToken) {
    return;
  }

  messageSearchResults.value = results;
  isMessageSearchLoading.value = false;
  isMessageSearchPending.value = false;
};

const handleMessageSearchClick = (result: IMessageSearchResult): void => {
  setActiveSection('chats');
  navigateToSearchResult(result);
};

const handleSendSharedFiles = async (): Promise<void> => {
  const selectedTopics = allTopics.value.filter(topic =>
    selectedTopicIds.value.has(topic.id)
  );

  await sendSharedFiles(selectedTopics);
};

const menuClasses = computed(() => [
  'menu',
  {
    'menu--collapse': isCollapse.value,
    'menu--folders': !isCollapse.value && !isShareSelectionActive.value
  },
  props.class
]);

const handleSelectFolder = (folderId: string | null): void => {
  if (activeSection.value === 'clients') {
    selectClientFolder(folderId);
    return;
  }
  setActiveSection('chats');
  selectFolder(folderId);
};

const handleOpenFolderManager = (): void => {
  if (activeSection.value === 'clients') {
    openClientFolderManager();
    return;
  }
  setActiveSection('chats');
  openFolderManager();
};

const handleNewGroupModal = () => {
  emits('unmount-new-group', { isChapterOpen: true });
};

const handleNewContactModal = () => {
  emits('unmount-new-contact', { isChapterOpen: true });
};

const handleNewBotModal = () => {
  emits('unmount-new-bot', { isChapterOpen: true });
};

watch(
  [isTopicsLoading, authUserId],
  ([loading, userId]) => {
    if (!loading && userId) void loadFolders();
  },
  { immediate: true }
);

watch(
  () => chatFolders.value.map(folder => folder.id).join('|'),
  () => {
    if (
      activeFolderId.value &&
      !chatFolders.value.some(folder => folder.id === activeFolderId.value)
    ) {
      selectFolder(null);
    }
  }
);

onMounted(() => {
  void loadFolders();
});

watch(
  [() => toolbarState.search, isShareSelectionActive, authUserId],
  () => {
    const query = normalizeAtSearchQuery(toolbarState.search);
    const requestToken = ++messageSearchRequestToken;

    if (messageSearchDebounceTimer) {
      clearTimeout(messageSearchDebounceTimer);
      messageSearchDebounceTimer = null;
    }

    messageSearchResults.value = [];

    if (!query || isShareSelectionActive.value) {
      isMessageSearchPending.value = false;
      isMessageSearchLoading.value = false;
      return;
    }

    isMessageSearchPending.value = true;
    messageSearchDebounceTimer = setTimeout(() => {
      void runMessageSearch(query, requestToken);
    }, 300);
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  messageSearchRequestToken++;
  if (messageSearchDebounceTimer) {
    clearTimeout(messageSearchDebounceTimer);
    messageSearchDebounceTimer = null;
  }
});
</script>
