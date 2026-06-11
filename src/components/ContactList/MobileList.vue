<template>
  <div
    :class="[
      'mobile-list-container',
      { 'mobile-list-container--dragover': isDragOverFiles }
    ]"
    role="main"
    :data-testid="`${props.dataTestid}-MobileList-Container`"
    @dragenter="handleDragEnter"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDropFiles"
  >
    <div class="mobile-list-container__content">
      <template v-if="activeSection === 'chats'">
        <ChatsToolbar
          :model-value="toolbarState.search"
          :filter="toolbarState.filter"
          :filter-counts="filterCounts"
          class="mobile-list-container__toolbar"
          :data-testid="`${props.dataTestid}-MobileList`"
          @update:model-value="setSearch"
          @update:filter="setFilter"
          @create-chat="handleShowAccount(TopicType.DM)"
          @create-group="handleShowAccount(TopicType.Group)"
        />

        <section
          class="chat-list"
          role="region"
          aria-label="Contact list"
          :data-testid="`${props.dataTestid}-ChatList-Section`"
        >
          <TopicList
            :topics="contactList"
            :data-testid="`${props.dataTestid}-ContactList`"
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
            @unmount-topic="handleTopicSelect"
            @unmount-message="handleMessageSearchClick"
          />
        </section>
      </template>

      <CallsPage
        v-else-if="activeSection === 'calls'"
        :data-testid="`${props.dataTestid}-MobileList-CallsPage`"
      />

      <MenuProfilePanel
        v-else
        :data-testid="`${props.dataTestid}-MobileList-ProfilePanel`"
      />
    </div>
    <MenuBottomNav
      :is-collapse="false"
      :data-testid="`${props.dataTestid}-MobileList-BottomNav`"
    />
  </div>

  <template v-if="!isAssistantRoute">
    <NewChatMobileModal
      :open="state.showAddAccount"
      :contacts="[]"
      :is-add-one="!isGroupRoute"
      :selected-contact-ids="state.checkUsers"
      @unmount-close="handleCloseModal"
      @unmount-contact="handleNewContact"
    />
  </template>
</template>

<script setup lang="ts">
import { reactive, computed, ref, watch, onBeforeUnmount } from 'vue';
import type {
  IMobileListProps,
  IMobileListEmits
} from './interfaces/mobile-list';
import type { IUser } from '../interfaces/interfaces';
import NewChatMobileModal from '../NewChat/NewChatMobileModal.vue';
import TopicList from './TopicList.vue';
import ChatsToolbar from '../Menu/ChatsToolbar.vue';
import { useTopics } from '../../composables/useTopics';
import { useUrlWatcher } from '../../composables/navigation';
import {
  navigateToDialogsList,
  navigateToGroupsList,
  RouteTypes
} from '../../composables/navigation/useUrlRouting';
import { TopicType } from '../../services/useChatSDK/types';
import { useChatsToolbarState } from '../../composables/useChatsToolbarState';
import { useChatMenu } from '../../composables/useChatMenu';
import MenuBottomNav from '../Menu/MenuBottomNav.vue';
import MenuProfilePanel from '../Menu/MenuProfilePanel.vue';
import { getAuthUser } from '../../composables/useAuth';
import { getTopicUnreadBadgeCount } from '../../utils/topicUnreadBadge';
import CallsPage from '../Calls/CallsPage.vue';
import { useShareSelection } from '../../composables/useShareSelection';
import type { ITopic } from '../interfaces/interfaces';
import { enqueuePendingShareFiles } from '../../services/useShareIntent';
import {
  navigateToSearchResult,
  searchMessages,
  type IMessageSearchResult
} from '../../composables/useMessageSearch';

const route = useUrlWatcher();

const isAssistantRoute = computed(
  () => route.value?.type === RouteTypes.ASSISTANT
);
const isGroupRoute = computed(() => route.value?.type === RouteTypes.GROUP);

const props = withDefaults(defineProps<IMobileListProps>(), {
  dataTestid: () => 'MobileList'
});

const { getTopicList } = useTopics();
const { state: toolbarState, setSearch, setFilter } = useChatsToolbarState();
const { activeSection, setActiveSection } = useChatMenu();
const { isShareSelectionActive, selectedTopicIds, toggleShareTopic } =
  useShareSelection();
const allTopics = computed(() => getTopicList());
const messageSearchResults = ref<IMessageSearchResult[]>([]);
const isMessageSearchLoading = ref(false);
const isMessageSearchPending = ref(false);
let messageSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let messageSearchRequestToken = 0;
const authUserId = computed(() => getAuthUser()?.id || '');
const dragEnterDepth = ref(0);
const isDragOverFiles = ref(false);

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

const state = reactive({
  showAddAccount: false,
  checkUsers: new Set<string | number>()
});

const normalizeToolbarSearchText = (value?: string): string =>
  (value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const contactList = computed(() => {
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
    return [...filteredByType];
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

const emits = defineEmits<IMobileListEmits>();

const handleTopicSelect = (topic: ITopic): void => {
  if (isShareSelectionActive.value) {
    toggleShareTopic(topic.id);
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

const handleShowAccount = (topicType: TopicType) => {
  if (isAssistantRoute.value) {
    return;
  }

  setActiveSection('chats');
  state.showAddAccount = true;

  if (topicType === TopicType.DM) {
    navigateToDialogsList();
  } else if (topicType === TopicType.Group) {
    navigateToGroupsList();
  }
};

const handleCloseModal = () => {
  state.showAddAccount = false;
  state.checkUsers.clear();
};

const handleNewContact = (contact: IUser): void => {
  emits('unmount-contact', contact);
  handleCloseModal();
};

const hasDraggedFiles = (event: DragEvent): boolean => {
  if (event.dataTransfer?.files?.length) {
    return true;
  }

  return Array.from(event.dataTransfer?.items || []).some(
    item => item.kind === 'file'
  );
};

const resetDragState = (): void => {
  dragEnterDepth.value = 0;
  isDragOverFiles.value = false;
};

const handleDragEnter = (event: DragEvent): void => {
  if (activeSection.value !== 'chats' || !hasDraggedFiles(event)) {
    return;
  }

  event.preventDefault();
  dragEnterDepth.value += 1;
  isDragOverFiles.value = true;
};

const handleDragOver = (event: DragEvent): void => {
  if (activeSection.value !== 'chats' || !hasDraggedFiles(event)) {
    return;
  }

  event.preventDefault();

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
};

const handleDragLeave = (event: DragEvent): void => {
  if (activeSection.value !== 'chats' || !isDragOverFiles.value) {
    return;
  }

  event.preventDefault();
  dragEnterDepth.value = Math.max(0, dragEnterDepth.value - 1);

  if (dragEnterDepth.value === 0) {
    isDragOverFiles.value = false;
  }
};

const handleDropFiles = async (event: DragEvent): Promise<void> => {
  if (activeSection.value !== 'chats' || !hasDraggedFiles(event)) {
    resetDragState();
    return;
  }

  event.preventDefault();

  const files = Array.from(event.dataTransfer?.files || []);
  resetDragState();

  if (!files.length) {
    return;
  }

  await enqueuePendingShareFiles(files);
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
