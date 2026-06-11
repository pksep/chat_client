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
          :is-collapse="isCollapse"
          :data-testid="`${props.dataTestid}-Menu`"
          @update:model-value="setSearch"
          @update:filter="setFilter"
          @create-chat="handleNewContactModal"
          @create-group="handleNewGroupModal"
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
import { computed, onBeforeUnmount, ref, watch } from 'vue';
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
import MenuProfilePanel from './Menu/MenuProfilePanel.vue';
import { getAuthUser } from '../composables/useAuth';
import { getTopicUnreadBadgeCount } from '../utils/topicUnreadBadge';
import CallsPage from './Calls/CallsPage.vue';
import { useShareSelection } from '../composables/useShareSelection';
import { getShareSelectionSummaryLabel } from '../utils/shareSelectionSummary';
import {
  navigateToSearchResult,
  searchMessages,
  type IMessageSearchResult
} from '../composables/useMessageSearch';

const props = withDefaults(defineProps<IMenuProps>(), {
  dataTestid: 'Menu'
});

const { getTopicList } = useTopics();
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

const filterCounts = computed(() => ({
  all: allTopics.value.reduce(
    (sum, topic) => sum + getTopicUnreadBadgeCount(topic, authUserId.value),
    0
  ),
  chats: allTopics.value
    .filter(topic => topic.type === TopicType.DM)
    .reduce(
      (sum, topic) => sum + getTopicUnreadBadgeCount(topic, authUserId.value),
      0
    ),
  groups: allTopics.value
    .filter(topic => topic.type === TopicType.Group)
    .reduce(
      (sum, topic) => sum + getTopicUnreadBadgeCount(topic, authUserId.value),
      0
    )
}));

const normalizeToolbarSearchText = (value?: string): string =>
  (value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const topicGroups = computed(() => {
  const query = normalizeToolbarSearchText(toolbarState.search);

  const filteredByType = allTopics.value.filter(topic => {
    if (toolbarState.filter === 'chats') {
      return topic.type === TopicType.DM;
    }

    if (toolbarState.filter === 'groups') {
      return topic.type === TopicType.Group;
    }

    return true;
  });

  if (!query) {
    return filteredByType;
  }

  return filteredByType.filter(topic => {
    const nameMatch = normalizeToolbarSearchText(topic.name).includes(query);
    const erpInitials = (
      typeof topic.user?.ex === 'string'
        ? JSON.parse(topic.user.ex)
        : topic.user?.ex
    )?.erpInitials;
    const erpInitialsMatch =
      normalizeToolbarSearchText(erpInitials).includes(query);

    return nameMatch || erpInitialsMatch;
  });
});

const filteredMessageSearchResults = computed(() => {
  if (!normalizeToolbarSearchText(toolbarState.search)) {
    return [];
  }

  return messageSearchResults.value.filter(result => {
    const topic =
      result.topic || allTopics.value.find(t => t.id === result.topicId);

    if (toolbarState.filter === 'chats') {
      return topic?.type === TopicType.DM;
    }

    if (toolbarState.filter === 'groups') {
      return topic?.type === TopicType.Group;
    }

    return true;
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

  toggle();
};

const unmountTopicClick = (topic: ITopic): void => {
  if (isShareSelectionActive.value) {
    toggleShareTopic(topic.id);
    return;
  }

  setActiveSection('chats');

  if (topic.type === 'GROUP') {
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

watch(
  [() => toolbarState.search, isShareSelectionActive],
  () => {
    const query = normalizeToolbarSearchText(toolbarState.search);
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
