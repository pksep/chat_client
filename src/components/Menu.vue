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

    <div
      class="menu__start"
      :data-testid="`${props.dataTestid}-Menu-StartContainer`"
    >
      <template v-if="activeSection === 'chats'">
        <ChatsToolbar
          v-if="!isShareSelectionActive"
          :model-value="toolbarState.search"
          :filter="toolbarState.filter"
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

        <TopicList
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
          :is-message-search-loading="
            !isShareSelectionActive &&
            (isMessageSearchPending || isMessageSearchLoading)
          "
          :data-testid="`${props.dataTestid}-Menu-ContactList`"
          @unmount-message="handleMessageSearchClick"
        />
      </template>

      <CallsPage
        v-else-if="activeSection === 'calls'"
        :data-testid="`${props.dataTestid}-Menu-CallsPage`"
      />

      <AIMenuPanel
        v-else-if="activeSection === 'ai'"
        :data-testid="`${props.dataTestid}-Menu-AIPanel`"
      />

      <MenuProfilePanel
        v-else
        :data-testid="`${props.dataTestid}-Menu-ProfilePanel`"
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

    <MenuBottomNav
      :is-collapse="isCollapse"
      :data-testid="`${props.dataTestid}-Menu-BottomNav`"
    />
  </aside>
</template>

<script lang="ts" setup>
import {
  computed,
  defineAsyncComponent,
  onBeforeUnmount,
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
import { RouteTypes } from '../composables/navigation/useUrlRouting';
import { useTopics } from '../composables/useTopics';
import TopicList from './ContactList/TopicList.vue';
import ChatsToolbar from './Menu/ChatsToolbar.vue';
import ShareSelectionToolbar from './Menu/ShareSelectionToolbar.vue';
import { TopicType } from '../services/useChatSDK/types';
import { useChatsToolbarState } from '../composables/useChatsToolbarState';
import { useChatMenu } from '../composables/useChatMenu';
import MenuBottomNav from './Menu/MenuBottomNav.vue';
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

const CallsPage = defineAsyncComponent(() => import('./Calls/CallsPage.vue'));
const AIMenuPanel = defineAsyncComponent(() => import('./AI/AIMenuPanel.vue'));
const MenuProfilePanel = defineAsyncComponent(
  () => import('./Menu/MenuProfilePanel.vue')
);

const props = withDefaults(defineProps<IMenuProps>(), {
  dataTestid: 'Menu'
});

const { getTopicList, loading: isTopicsLoading } = useTopics();
const route = useUrlWatcher();
const { canInstall, handleInstall, isInstalled } = usePwaInstall();
const selectedContactId = computed(() => route.value?.id);
const { state: toolbarState, setSearch, setFilter } = useChatsToolbarState();
const { activeSection, setActiveSection } = useChatMenu();
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
const allTopics = computed(() => getTopicList());
const messageSearchResults = ref<IMessageSearchResult[]>([]);
const isMessageSearchLoading = ref(false);
const isMessageSearchPending = ref(false);
let messageSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let messageSearchRequestToken = 0;
const authUserId = computed(() => getAuthUser()?.id || '');
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

const filterBadgeState = computed(() =>
  getChatsToolbarFilterBadgeState(allTopics.value, authUserId.value)
);

const filterCounts = computed(() =>
  getChatsToolbarFilterCounts(filterBadgeState.value)
);

const filterMutedOnly = computed(() =>
  getChatsToolbarFilterMutedOnly(filterBadgeState.value)
);

const topicGroups = computed(() => {
  const query = normalizeAtSearchQuery(toolbarState.search);

  const filteredByType = allTopics.value.filter(topic =>
    matchesToolbarFilter(topic)
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
    isTopicsLoading.value &&
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

    return matchesToolbarFilter(topic || null);
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
  if (!isCollapse.value) {
    setActiveSection('chats');
  }

  setSearch('');
  toggle();
};

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

  const { results } = await searchMessages(query, { limit: 50 });

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
  { 'menu--collapse': isCollapse.value },
  props.class
]);

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
  () => [route.value?.type, route.value?.id],
  ([routeType]) => {
    if (routeType === RouteTypes.CALL) {
      setActiveSection('calls');
      return;
    }

    if (routeType === RouteTypes.AI || routeType === RouteTypes.ASSISTANT) {
      setActiveSection('ai');
      return;
    }

    if (
      routeType === RouteTypes.DIALOGS ||
      routeType === RouteTypes.GROUP ||
      routeType === RouteTypes.FAVORITES
    ) {
      setActiveSection('chats');
    }
  },
  { immediate: true }
);

watch(
  [() => toolbarState.search, isShareSelectionActive],
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
  if (messageSearchDebounceTimer) {
    clearTimeout(messageSearchDebounceTimer);
    messageSearchDebounceTimer = null;
  }
});
</script>
